# Arquitetura do Sistema — Gestão Financeira Pro

**Última atualização:** 13/11/2026 (Estado pós-FASE 3 e preparação da FASE 4)

---

## 1. Visão Geral da Stack e Infraestrutura

| Camada | Tecnologia | Papel Atual |
| :--- | :--- | :--- |
| **Frontend SPA** | React 19 + TypeScript + Vite 8 + Tailwind CSS 4 | Interface financeira, cálculos locais de projeção, relatórios PDF/Excel |
| **Hospedagem e CDN/HTTPS** | Cloudflare Workers (`wrangler.jsonc`, `assets: ./dist`) | Distribuição estática SPA e HTTPS na borda |
| **Autenticação** | Supabase Auth (`@supabase/supabase-js`) | Única autoridade de login, cadastro, recuperação/redefinição de senha e emissão de JWT |
| **Banco de Dados** | Supabase PostgreSQL (`public.user_finance_data`) | Armazenamento remoto em documento `JSONB` por `user_id` protegido por RLS |
| **Cache Local (Navegador)** | `localStorage` *(isolamento por usuário planejado na Fase 5)* | Persistência offline temporária e cache de estado ativo |
| **Versionamento** | GitHub | Código-fonte versionado (sem segredos) |

---

## 2. Fluxo de Autenticação e Isolamento em Camadas (Atual)

1. **Camada de Entrada (`src/context/AuthContext.tsx` + `src/App.tsx`):**
   - Ao abrir o aplicativo, `AuthProvider` valida a sessão oficial via `supabase.auth.getSession()` e monitora mudanças via `onAuthStateChange` (`SIGNED_IN`, `TOKEN_REFRESHED`, `SIGNED_OUT`, `PASSWORD_RECOVERY`).
   - Enquanto `!isSupabaseAuthenticated || isPasswordRecoveryMode`, o aplicativo renderiza apenas `AuthLockScreen`. O `FinanceProvider` não é montado para visitantes não autenticados.
   - Ao encerrar a sessão (`logout()`), o `FinanceProvider` (indexado por `key={supabaseUserId}`) é desmontado imediatamente da memória React e a sessão Supabase é encerrada com `signOut()`.
2. **Camada de Transporte (`src/utils/supabase.ts` + `src/services/supabaseSyncService.ts`):**
   - Utiliza apenas a chave pública publishable (`VITE_SUPABASE_PUBLISHABLE_KEY`).
   - Todas as chamadas à tabela `public.user_finance_data` trafegam via HTTPS com o JWT da sessão autenticada no cabeçalho `Authorization: Bearer`.
3. **Camada de Banco de Dados (`public.user_finance_data`):**
   - Chave primária `user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE`.
   - O isolamento real entre clientes (Usuário A, B, C, D) é imposto no servidor PostgreSQL por meio de **Row Level Security (RLS)** comparando `auth.uid() = user_id`.

---

## 3. Avaliação do Modelo JSONB Atual (`public.user_finance_data`) para o MVP Comercial

### Estrutura Atual
```text
public.user_finance_data
├── user_id          UUID (PK, FK -> auth.users.id ON DELETE CASCADE)
├── data             JSONB (transactions, categories, accounts, creditCards, debts, goals, safetyReserveDesired, version, lastModified)
├── version          INT4
├── client_timestamp INT8
└── updated_at       TIMESTAMPTZ
```

### Adequação ao MVP Comercial
- **Atende ao MVP inicial?** **Sim, com ressalvas controláveis**, desde que:
  1. As políticas RLS e privilégios (`REVOKE` de `anon`/`PUBLIC`) sejam auditados e endurecidos no Supabase (FASE 4).
  2. O isolamento de `localStorage` por `user_id`, backups pré-sobrescrita e controle de concorrência otimista por `version` sejam corrigidos no cliente (FASE 5).
- **Vantagens no MVP:**
  - Simplicidade operacional: apenas 1 linha por cliente, 1 requisição de leitura/gravação, compatibilidade imediata com dados reais já salvos sem migração arriscada.
  - Baixíssimo custo no plano gratuito do Supabase (poucas queries por sessão).
- **Limitações conhecidas do modelo JSONB:**
  - Toda alteração atualiza e reenvia o documento JSON completo daquele usuário.
  - Não permite paginação, busca ou agregação diretamente em SQL sem desserializar o JSON.
  - Conflitos simultâneos entre dois dispositivos ocorrem no nível do documento inteiro (exigindo controle otimista por `version` e resolução explícita, previstos na Fase 5).
  - Não serve para regras comerciais granulares no banco (ex.: limitar quantidade de contas por plano via constraints/queries relacionais diretas sem parsing de JSON).

> **Conclusão arquitetural:** Manter `public.user_finance_data` no MVP imediato preservando 100% de compatibilidade com os registros existentes, e planejar a migração gradual para esquema relacional após a estabilização comercial.

---

## 4. Proposta de Evolução para Modelo Relacional (Futura — NÃO IMPLEMENTAR SEM AUTORIZAÇÃO)

Quando a base de clientes crescer ou quando funcionalidades como histórico multi-ano pesado, anexos, compartilhamento familiar ou cobrança por plano entrarem em produção, recomenda-se evoluir para um modelo normalizado com `user_id` e RLS em todas as tabelas:

| Tabela Proposta | Responsabilidade | Relacionamentos Principais |
| :--- | :--- | :--- |
| `public.profiles` | Nome de exibição, preferências de tema, reserva desejada, aceite LGPD | `id UUID PK -> auth.users(id)` |
| `public.accounts` | Contas bancárias, carteiras e saldos | `user_id -> auth.users(id)` |
| `public.categories` | Categorias de receita e despesa personalizadas | `user_id -> auth.users(id)` |
| `public.credit_cards` | Cartões, limites, fechamento, vencimento | `user_id`, `linked_account_id -> accounts(id)` |
| `public.debts` | Dívidas, credores, saldo devedor, juros, histórico | `user_id -> auth.users(id)` |
| `public.transactions` | Lançamentos individuais (entradas, despesas, transferências, faturas) | `user_id`, `account_id`, `target_account_id`, `credit_card_id`, `debt_id`, `category_id` |
| `public.goals` | Metas financeiras, prazo e valor acumulado | `user_id -> auth.users(id)` |
| `public.subscriptions` | Plano comercial, status, vencimento, `stripe_customer_id` (somente leitura pelo cliente, escrita via Webhook/Server) | `user_id -> auth.users(id)` |

### Estratégia Segura de Migração Futura (Quando Autorizada)
1. **Fase de Dual-Schema:** Criar as novas tabelas relacionais com RLS estrito mantendo `user_finance_data` intacta em modo leitura/backup.
2. **Script/Edge Function Idempotente:** Migrar o JSONB de cada `user_id` para linhas relacionais dentro de transação SQL (`BEGIN ... COMMIT`), validando soma de saldos e contagem de registros antes de confirmar.
3. **Virada Controlada:** Alternar o cliente após validação em conta de staging, mantendo `user_finance_data` arquivada para recuperação durante período de transição.

---

## 5. Pendências Estruturais Mapeadas para as Próximas Fases

- **FASE 4 (Aguardando confirmação do SQL Editor):** Confirmar estado real de RLS, `GRANT`/`REVOKE`, views e triggers no projeto Supabase em produção.
- **FASE 5 (Sincronização e Armazenamento Local):**
  - Escopo de `localStorage` por `supabaseUserId` (`finance_pro_app_state_<uuid>`).
  - Correção do bug em navegador limpo/anônimo (`isSampleLoaded` não pode gerar timestamp maior que a nuvem).
  - Atualização consistente de `lastModified` e `version` em mutações financeiras + trava otimista de concorrência.
  - Backup automático local antes de substituições e modal comparativo para conflitos.
- **FASE 6 (LGPD e Comercial):** Painel de privacidade, exportação e exclusão controlada de dados/conta, documentação legal/custos e desenho técnico de planos.
