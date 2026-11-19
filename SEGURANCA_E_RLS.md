# Segurança, Isolamento Multiusuário e RLS — Gestão Financeira Pro

**Última atualização:** 13/11/2026 (FASE 4 — Auditoria e Preparação, sem alterações no banco de produção)  
**Tabela auditada (modelo MVP):** `public.user_finance_data`  
**Autoridade de autenticação:** Supabase Auth (`auth.users` / `auth.uid()`)

---

## 1. Estado Atual Observado vs. Limite de Acesso

- **O que foi possível verificar diretamente no código-fonte (`src/services/supabaseSyncService.ts`, `src/utils/supabase.ts`):**
  - O frontend utiliza apenas a chave pública (`VITE_SUPABASE_PUBLISHABLE_KEY`), sem `service_role`, `sb_secret` ou credenciais administrativas.
  - As consultas e gravações em `supabaseSyncService.ts` enviam `user_id` correspondendo ao UUID retornado por `supabase.auth.getSession()`, filtrando por `.eq('user_id', userId)`.
  - Existe um script SQL de referência (`SUPABASE_SQL_SETUP`) no código-fonte que define RLS na tabela `public.user_finance_data`.
- **O que NÃO pode ser confirmado a partir deste ambiente (depende de inspeção direta no SQL Editor do Supabase):**
  - Se o script completo foi realmente aplicado no projeto Supabase em produção ou se restaram políticas legadas permissivas (ex.: `"Permitir acesso completo ao app financeiro"` com `USING (true)`).
  - Quais `GRANT`s reais existem hoje para `anon`, `authenticated` e `PUBLIC`.
  - Se existem views, triggers ou funções RPC (`SECURITY DEFINER`) no schema `public` que possam contornar RLS.
  - Se o `FORCE ROW LEVEL SECURITY` está ativo e quais roles administrativas possuem `BYPASSRLS`.

> **Declaração técnica honesta:** O banco de dados de produção **não deve ser considerado validado contra acesso cruzado** até que as consultas somente leitura da Seção 3 sejam executadas no SQL Editor do Supabase e o teste real com duas contas independentes (Seção 6) seja aprovado.

---

## 2. Vulnerabilidades e Lacunas Identificadas no Modelo/Script Atual

1. **Ausência de `REVOKE` explícito para `anon` e `PUBLIC` no script de referência (`SUPABASE_SQL_SETUP`):**
   - Mesmo com RLS ativo, manter `GRANT` de `SELECT/INSERT/UPDATE/DELETE` para `anon` amplia a superfície de erro caso uma política permissiva ou mal escrita seja criada.
   - A boa prática em tabelas financeiras privadas é revogar todos os privilégios de `anon` e `PUBLIC` e conceder apenas `SELECT, INSERT, UPDATE, DELETE` ao papel `authenticated`.
2. **Ausência de `FORCE ROW LEVEL SECURITY` no script de referência:**
   - Sem `FORCE ROW LEVEL SECURITY`, se alguma operação interna rodar usando a role proprietária da tabela (caso ela não tenha `BYPASSRLS`), o RLS pode ser ignorado.
3. **Ausência de verificação de desvios no ambiente real:**
   - Em histórico anterior do aplicativo, existiram políticas amplas/legadas antes da introdução do Supabase Auth. Sem inspecionar `pg_policies` diretamente no Supabase, há risco de coexistência de uma política permissiva (`PERMISSIVE`) antiga junto às políticas novas — em PostgreSQL, políticas `PERMISSIVE` são combinadas com **OR**, logo **uma única política permissiva antiga anula todas as políticas restritivas novas**.
4. **Risco na combinação atual com a FASE 5 (pendente):**
   - Enquanto a FASE 5 não for executada, o isolamento de banco garante que o Usuário A não leia nem grave na linha do Usuário B no PostgreSQL, mas o `localStorage` local ainda não está particionado por `user_id` (tratado na FASE 5).
5. **Manipulação direta de requisições HTTP / JavaScript:**
   - Sem RLS estrito no banco, qualquer cliente poderia alterar o parâmetro `user_id` via `fetch`/`curl` contra a API REST do PostgREST (`/rest/v1/user_finance_data`). Apenas políticas RLS no servidor com `(select auth.uid()) = user_id` bloqueiam esse vetor de ataque.

---

## 3. Consultas SQL de Auditoria (100% Somente Leitura)

Execute cada bloco abaixo no **SQL Editor** do painel Supabase. Nenhuma dessas consultas altera dados, tabelas, políticas ou permissões.

### Consulta 1 — Verificar se RLS e `FORCE RLS` estão habilitados nas tabelas do schema `public`
```sql
SELECT
  n.nspname AS schema_name,
  c.relname AS table_name,
  pg_get_userbyid(c.relowner) AS table_owner,
  c.relrowsecurity AS rls_enabled,
  c.relforcerowsecurity AS force_rls_enabled
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind IN ('r', 'p')
ORDER BY c.relname;
```
**Resultado esperado seguro:** `rls_enabled = true` para `user_finance_data` (e idealmente `force_rls_enabled = true`). Se `rls_enabled = false`, a tabela está totalmente exposta a quem tiver permissão `GRANT`.

### Consulta 2 — Listar todas as políticas RLS efetivamente ativas
```sql
SELECT
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual AS using_expression,
  with_check AS with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, cmd, policyname;
```
**Resultado esperado seguro:**
- Apenas 4 políticas para `user_finance_data`: uma para `SELECT`, uma para `INSERT`, uma para `UPDATE`, uma para `DELETE`.
- `roles` = `{authenticated}` (nunca `{public}` ou `{anon}`).
- `using_expression` e `with_check_expression` contendo estritamente `auth.uid() = user_id` (ou `(SELECT auth.uid()) = user_id`).
- **Alerta crítico:** Se aparecer qualquer política antiga com `qual = 'true'`, `roles = '{public}'` ou nome diferente das 4 políticas estritas, o isolamento multiusuário está comprometido.

### Consulta 3 — Verificar privilégios (`GRANT`) concedidos a `anon`, `authenticated` e `PUBLIC`
```sql
SELECT
  grantee,
  table_schema,
  table_name,
  privilege_type,
  is_grantable
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name = 'user_finance_data'
ORDER BY grantee, privilege_type;
```
**Resultado esperado seguro:**
- Nenhuma linha para `anon` ou `PUBLIC`.
- Para `authenticated`, apenas `SELECT`, `INSERT`, `UPDATE`, `DELETE` (sem `TRUNCATE`, `TRIGGER` ou `REFERENCES`).

### Consulta 4 — Verificar permissões de uso no schema `public` e exposição via PostgREST
```sql
SELECT
  nspname AS schema_name,
  nspacl AS acl_raw
FROM pg_namespace
WHERE nspname IN ('public', 'auth');
```

### Consulta 5 — Auditar Views no schema `public` (risco de contorno de RLS)
```sql
SELECT
  v.schemaname,
  v.viewname,
  v.viewowner,
  c.reloptions
FROM pg_views v
JOIN pg_class c ON c.relname = v.viewname
JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = v.schemaname
WHERE v.schemaname = 'public';
```
**Interpretação:** No PostgreSQL, views antigas sem `security_invoker = true` nos `reloptions` rodam com permissões do `viewowner` (podendo contornar RLS). O esperado seguro para o MVP é não haver views expondo dados financeiros ou todas usarem `security_invoker = true`.

### Consulta 6 — Auditar Funções / RPCs e `SECURITY DEFINER` no schema `public`
```sql
SELECT
  p.proname AS function_name,
  pg_get_userbyid(p.proowner) AS owner,
  p.prosecdef AS is_security_definer,
  p.proconfig AS function_config,
  pg_get_function_identity_arguments(p.oid) AS args
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
ORDER BY p.proname;
```
**Interpretação:** Verifique se existe alguma função `is_security_definer = true` que leia/altere `user_finance_data` sem checar `auth.uid()`. O esperado seguro é não haver funções RPC personalizadas acessando dados financeiros sem validação estrita.

### Consulta 7 — Auditar Triggers vinculados a `user_finance_data` e `auth.users`
```sql
SELECT
  event_object_schema,
  event_object_table,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE (event_object_schema = 'public' AND event_object_table = 'user_finance_data')
   OR (event_object_schema = 'auth' AND event_object_table = 'users')
ORDER BY event_object_table, trigger_name;
```

### Consulta 8 — Verificar papéis com `BYPASSRLS` ou `SUPERUSER`
```sql
SELECT
  rolname,
  rolsuper,
  rolbypassrls,
  rolcanlogin
FROM pg_roles
WHERE rolsuper = true OR rolbypassrls = true
ORDER BY rolname;
```
**Interpretação:** Roles administrativas internas do Supabase (`postgres`, `supabase_admin`, `service_role`) possuem `BYPASSRLS` por arquitetura. É exatamente por isso que chaves secretas (`service_role` / `sb_secret`) nunca podem existir no frontend ou em builds públicos.

### Consulta 9 — Diagnóstico agregado de integridade (sem exibir dados financeiros sensíveis)
```sql
SELECT
  COUNT(*) AS total_registros,
  COUNT(DISTINCT user_id) AS usuarios_distintos,
  MIN(version) AS min_version,
  MAX(version) AS max_version,
  MIN(updated_at) AS mais_antigo,
  MAX(updated_at) AS mais_recente
FROM public.user_finance_data;
```

---

## 4. Plano de Correção SQL Proposto (NÃO EXECUTADO)

> **Atenção:** Este SQL **NÃO foi executado**. Só deve ser aplicado após você executar as consultas da Seção 3, revisar os resultados encontrados e autorizar a execução no seu painel Supabase.

### Etapa A — Limpar políticas antigas e garantir RLS + `FORCE RLS`
*Efeito:* Garante que nenhuma regra permissiva legada permaneça ativa e obriga RLS mesmo para o dono da tabela (exceto papéis com atributo `BYPASSRLS`).
```sql
ALTER TABLE public.user_finance_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_finance_data FORCE ROW LEVEL SECURITY;

-- Substitua/adicione aqui quaisquer nomes extras de políticas antigas detectadas na Consulta 2
DROP POLICY IF EXISTS "Permitir acesso completo ao app financeiro" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_select_policy" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_insert_policy" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_update_policy" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_delete_policy" ON public.user_finance_data;
```

### Etapa B — Restringir privilégios (`GRANT`/`REVOKE`)
*Efeito:* Impede qualquer consulta ou escrita pelo papel anônimo (`anon`) ou `PUBLIC`, limitando o acesso da API apenas a usuários autenticados (`authenticated`) com operações estritamente necessárias.
```sql
REVOKE ALL ON TABLE public.user_finance_data FROM PUBLIC;
REVOKE ALL ON TABLE public.user_finance_data FROM anon;
REVOKE ALL ON TABLE public.user_finance_data FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_finance_data TO authenticated;
```

### Etapa C — Criar políticas individuais estritas vinculadas a `auth.uid()`
*Efeito:* Bloqueia leitura, criação, edição e exclusão cruzada entre usuários, mesmo que alguém tente manipular o JSON ou o parâmetro `user_id` diretamente via REST API. O uso de `(SELECT auth.uid())` melhora o cache do planejador do PostgreSQL por consulta mantendo a mesma semântica.
```sql
CREATE POLICY "user_finance_data_select_own"
  ON public.user_finance_data
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_finance_data_insert_own"
  ON public.user_finance_data
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_finance_data_update_own"
  ON public.user_finance_data
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_finance_data_delete_own"
  ON public.user_finance_data
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);
```

### Etapa D — Limitações e cuidados sobre `FORCE ROW LEVEL SECURITY` e privilégios administrativos
- **`FORCE ROW LEVEL SECURITY`:** Atua sobre o `owner` da tabela quando a consulta roda sob essa role. Entretanto, papéis com `BYPASSRLS` (como `postgres` no SQL Editor e `service_role` em backends) sempre contornam RLS por design do PostgreSQL.
- **Imutabilidade de `user_id`:** Como `user_id` é `PRIMARY KEY` e tanto `USING` quanto `WITH CHECK` exigem `(SELECT auth.uid()) = user_id`, um usuário autenticado não consegue alterar o `user_id` de sua linha para o UUID de outro usuário (seria imediatamente rejeitado pelo `WITH CHECK`).

---

## 5. Separação de Chaves e Boas Práticas de Operação

| Chave / Credencial | Onde pode estar | Onde NUNCA pode estar |
| :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Frontend, Cloudflare build env | — |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (ou `anon`) | Frontend (protegida exclusivamente por RLS) | — |
| `service_role` / `sb_secret_*` / DB Password | Apenas servidor privado ou Edge Function secrets | Frontend React, `index.html`, variáveis `VITE_*`, Git, relatórios |

---

## 6. Roteiro de Validação com Duas Contas de Teste Independentes

> **Regra:** Nunca utilize sua conta pessoal nem seus dados financeiros reais neste teste. Utilize duas contas de teste criadas exclusivamente para QA (ex.: `teste-a@...` e `teste-b@...`).

1. **Pré-requisito:** Criar Conta Teste A (UUID A) e Conta Teste B (UUID B) via fluxo normal de cadastro e obter seus tokens JWT de sessão em abas/navegadores distintos.
2. **Teste 1 — Acesso anônimo sem JWT:**
   - Executar requisição `GET` direta para `/rest/v1/user_finance_data?select=*` enviando apenas o header `apikey: <VITE_SUPABASE_PUBLISHABLE_KEY>` (sem `Authorization: Bearer <JWT_USUARIO>`).
   - **Esperado:** Erro `401/403` (`permission denied for table user_finance_data`) ou retorno bloqueado após aplicar `REVOKE ALL FROM anon`.
3. **Teste 2 — Leitura cruzada (A tentando ler B):**
   - Autenticado como Usuário A (`Authorization: Bearer <JWT_A>`), enviar `GET /rest/v1/user_finance_data?user_id=eq.<UUID_B>`.
   - **Esperado:** Array vazio `[]` (nunca os dados de B).
4. **Teste 3 — Escrita/Inserção forjada (A tentando inserir com `user_id = UUID_B`):**
   - Autenticado como Usuário A (`JWT_A`), enviar `POST /rest/v1/user_finance_data` com payload `{ "user_id": "<UUID_B>", "data": {}, "version": 1 }`.
   - **Esperado:** Erro `42501` (`new row violates row-level security policy for table "user_finance_data"`).
5. **Teste 4 — Atualização cruzada (A tentando alterar linha de B):**
   - Autenticado como Usuário A (`JWT_A`), enviar `PATCH /rest/v1/user_finance_data?user_id=eq.<UUID_B>` com alteração em `data`.
   - **Esperado:** `0` linhas afetadas / erro de permissão; dados de B permanecem intactos.
6. **Teste 5 — Exclusão cruzada (B tentando apagar linha de A):**
   - Autenticado como Usuário B (`JWT_B`), enviar `DELETE /rest/v1/user_finance_data?user_id=eq.<UUID_A>`.
   - **Esperado:** `0` linhas excluídas; dados de A permanecem intactos.
7. **Teste 6 — Operação legítima isolada:**
   - Usuário A lê, grava e atualiza seu próprio `user_id = UUID_A`; Usuário B lê, grava e atualiza apenas `user_id = UUID_B`.
