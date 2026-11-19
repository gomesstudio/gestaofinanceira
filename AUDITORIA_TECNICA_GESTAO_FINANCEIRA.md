# Auditoria Técnica Completa — Gestão Financeira Pro

**Data da Auditoria:** 13/11/2026  
**Escopo Inspecionado:** Código-fonte completo em `src/`, `index.html`, `vite.config.ts`, `tsconfig.json`, `package.json`, `package-lock.json`, `wrangler.jsonc`, `.env.example`, `metadata.json`, `.gitignore` e análise de vulnerabilidades (`npm audit`).  
**Regra de Integridade:** Nenhum problema é marcado como resolvido sem implementação efetiva e teste verificado. Valores secretos reais não são reproduzidos neste documento.

---

## Resumo Executivo da Auditoria (Estado Atual)

| Gravidade | Quantidade | Principais Áreas Afetadas |
| :--- | :---: | :--- |
| **CRÍTICO** | 5 | Autenticação local com bypass, vazamento de sessão/dados entre usuários, sobrescrita silenciosa nuvem/local, falha de isolamento em `localStorage` |
| **ALTO** | 6 | `postMessage` sem validação de origem, diagnóstico destrutivo, ausência de controle otimista de concorrência, importação de backup sem validação rigorosa, ausência de recuperação de senha completa, uso de `window.confirm` |
| **MÉDIO** | 6 | Dependências residuais do AI Studio, vulnerabilidade em `xlsx`, arredondamento de ponto flutuante monetário, scripts/auditoria RLS no Supabase, `.env.example` com dados reais de projeto, testes com mocks isolados |
| **BAIXO** | 3 | Dados pessoais hardcoded na UI, ausência de documentos/fluxos LGPD, logs e larguras mínimas fixas em subcomponente |

---

## Matriz Detalhada de Problemas Identificados

### 1. Autenticação Local Hardcoded Bypassando o Supabase Auth
- **Problema identificado:** O acesso principal ao aplicativo é controlado por credenciais locais fixas (`DEFAULT_USERNAME = 'lucasgomes'`, `DEFAULT_PASSWORD = '6145'`) armazenadas em texto simples no `localStorage`, e `App.tsx` (`AuthenticatedApp`) libera o aplicativo verificando `isAuthenticated` (PIN local) em vez de exigir uma sessão válida do Supabase Auth (`isSupabaseAuthenticated`). Na tela de bloqueio (`AuthLockScreen`), o usuário e a senha local chegam a ser exibidos ou pré-preenchidos na interface.
- **Arquivos envolvidos:** `src/context/AuthContext.tsx` (linhas 42–48, 108–139, 588–654), `src/App.tsx` (linhas 109–118), `src/components/auth/AuthLockScreen.tsx` (linhas 59, 323, 344, 424), `src/components/settings/SettingsView.tsx` (linhas 1185, 1197).
- **Gravidade:** **CRÍTICO**
- **Risco:** Qualquer pessoa que abrir a URL pública do aplicativo pode entrar diretamente usando as credenciais padrão embutidas no bundle JavaScript, sem passar pelo Supabase Auth, tornando inviável o uso multiusuário comercial e expondo funcionalidades privadas sem sessão real.
- **Correção recomendada:** Remover `lucasgomes`/`6145` como autoridade de acesso; tornar `Supabase Auth` a única autoridade primária de entrada (cadastro, login, recuperação/redefinição de senha, validação de sessão ativa com estado de carregamento); não armazenar senhas em texto simples no `localStorage`. Caso haja bloqueio secundário por PIN no futuro, deve atuar apenas *sobre* uma sessão Supabase já autenticada e nunca substituí-la.
- **Correção realizada:** **Implementado na Fase 3.** Removidos `DEFAULT_USERNAME`/`DEFAULT_PASSWORD` e toda lógica de PIN local (`login`, `updateCredentials`, chaves `finance_auth_*`). `AuthContext.tsx` e `App.tsx` exigem sessão Supabase Auth ativa (`isSupabaseAuthenticated` + `isSessionLoading` + `isPasswordRecoveryMode`), e `FinanceProvider` só é montado após sessão validada.
- **Teste necessário:** Bloqueio de acesso sem sessão Supabase; cadastro individual; login válido/inválido; logout completo; expiração de sessão; recuperação e redefinição de senha.
- **Resultado do teste:** Testes unitários de helpers de autenticação, expiração de sessão, bloqueio antes de confirmação de e-mail e remoção de chaves legadas aprovados no `vitest` (`22/22`). Teste ponta a ponta real no projeto Supabase com 2 contas permanece pendente para a Fase 7 / configuração externa.

---

### 2. Sobrescrita Silenciosa de Dados Reais na Nuvem por Navegador Novo / Modo Anônimo
- **Problema identificado:** Em um navegador novo ou aba anônima (sem `localStorage`), `getInitialState()` carrega `DEFAULT_TRANSACTIONS` (`isSampleLoaded: true`) atribuindo `lastModified: Date.now()`. Quando o usuário conecta no Supabase, `initCloudSync()` compara `localTimestamp` (`Date.now()`) com `remoteTimestamp` (salvo anteriormente) via `resolveMultiDeviceConflict()`. Como o timestamp gerado no momento do carregamento da aba anônima é maior que o timestamp remoto salvo antes, a estratégia retorna `use_local`, **sobrescrevendo os dados reais na nuvem** com dados demonstrativos (ou impedindo a restauração automática da nuvem).
- **Arquivos envolvidos:** `src/utils/storage.ts` (linhas 447–476), `src/context/FinanceContext.tsx` (linhas 405–453), `src/services/supabaseSyncService.ts` (linhas 373–405).
- **Gravidade:** **CRÍTICO**
- **Risco:** Perda grave ou substituição indevida de dados financeiros reais ao acessar a conta em um segundo dispositivo, outro navegador ou janela anônima.
- **Correção recomendada:** Nunca atribuir `Date.now()` como timestamp autoritativo a estado inicial demonstrativo ou vazio (`isSampleLoaded: true` ou estado virgem sem modificações do usuário deve possuir `lastModified: 0`, `version: 0` ou flag `hasLocalChanges: false`). Priorizar os dados remotos válidos no primeiro acesso em novo dispositivo quando não houver edições locais reais; caso ambos possuam alterações reais divergentes, preservar ambos com backup local e abrir resolução explícita de conflito ao usuário.
- **Correção realizada:** Pendente (planejada para **FASE 5**).
- **Teste necessário:** Simulação de dispositivo limpo/anônimo autenticando em conta já populada na nuvem; confirmação de que dados remotos são baixados e nunca sobrescritos por `DEFAULT_TRANSACTIONS`.
- **Resultado do teste:** Pendente.

---

### 3. `lastModified` e `version` Nunca São Atualizados nas Mutações Financeiras + Re-upload Redundante
- **Problema identificado:** Todas as ações de escrita no `FinanceContext.tsx` (`addTransaction`, `updateTransaction`, `deleteTransaction`, `addDebt`, `amortizeDebt`, `payCreditCardInvoice`, `transferBetweenAccounts`, `addAccount`, `updateAccount`, `deleteAccount`, `addCategory`, `updateCategory`, `deleteCategory`, `addCreditCard`, `updateCreditCard`, `deleteCreditCard`, `addGoal`, `updateGoal`, `deleteGoal`, `contributeToGoal`, `setSafetyReserveDesired`) retornam o novo estado **sem atualizar `lastModified` nem incrementar `version`**. Além disso, `saveStateToStorage` usa `state.lastModified || Date.now()`, congelando o timestamp inicial eternamente. Somado a isso, ao baixar dados remotos em `initCloudSync()`, o `setState(conflict.resolvedState)` altera `state` e dispara o `useEffect` de auto-sync (linha 463) 2 segundos depois, reenviando os mesmos dados de volta para o Supabase.
- **Arquivos envolvidos:** `src/context/FinanceContext.tsx` (linhas 206–208, 416, 463–498, 1160–1606), `src/utils/storage.ts` (linhas 478–488).
- **Gravidade:** **CRÍTICO**
- **Risco:** Detecção de conflitos multi-dispositivo completamente imprecisa (alterações reais parecem mais antigas do que dados de amostra de outro aparelho), além de gravações concorrentes desnecessárias após download.
- **Correção recomendada:** Centralizar atualização de metadados em todas as mutações reais (`lastModified: Date.now()`, `hasPendingSync: true`, incremento controlado de versão/revisão) e usar uma ref/flag (`skipNextAutoSyncRef`) ao hidratar estado vindo da nuvem para não disparar upload redundante.
- **Correção realizada:** Pendente (planejada para **FASE 5**).
- **Teste necessário:** Verificar incremento de `lastModified`/revisão em cada ação CRUD e ausência de upsert imediato após download remoto.
- **Resultado do teste:** Pendente.

---

### 4. Falta de Isolamento por Usuário no `localStorage` e Risco de Vazamento Entre Contas
- **Problema identificado:** A chave de persistência local `STORAGE_KEY = 'finance_pro_app_state_v1'` é global e única para o navegador, não sendo isolada por `user_id` (`auth.users.id`). Além disso, `logout()` e `logoutFromSupabase()` não limpam os dados financeiros em memória nem a chave ativa do usuário anterior. Se o Usuário A sair e o Usuário B entrar no mesmo navegador, o `FinanceContext` mantém o estado do Usuário A em memória e no `localStorage`; pior ainda, se o Usuário B for um cliente novo sem registro no Supabase, `migrateAndVerifyFinanceData(state, userB)` pode enviar os dados do Usuário A para a conta do Usuário B.
- **Arquivos envolvidos:** `src/utils/storage.ts` (linhas 445–488), `src/context/FinanceContext.tsx` (linhas 155, 206–208, 440–453), `src/context/AuthContext.tsx` (linhas 570–585, 624–632).
- **Gravidade:** **CRÍTICO**
- **Risco:** Vazamento grave de privacidade e contaminação cruzada de dados financeiros entre usuários distintos no mesmo dispositivo.
- **Correção recomendada:** Armazenar cache local escopado estritamente por UUID (`finance_pro_app_state_<userId>`), nunca inicializar dados de outro usuário ou enviar cache genérico para um usuário novo sem confirmação/origem comprovada, e limpar estado em memória e cache da sessão ativa no logout (preservando apenas backups de recuperação escopados ou explicitamente identificados pelo UUID do titular, se aplicável, ou limpando dados privados ao encerrar sessão conforme regra da Fase 5/8).
- **Correção realizada:** Pendente (planejada para **FASE 3 e FASE 5**).
- **Teste necessário:** Troca sequencial de Usuário A -> Logout -> Login Usuário B no mesmo navegador sem qualquer vazamento visual ou envio de dados de A para B.
- **Resultado do teste:** Pendente.

---

### 5. Exposição de E-mail Pessoal, Usuário e PIN Padrão na Interface Comercial
- **Problema identificado:** O código exibe referências pessoais do proprietário original em telas de login, cabeçalho e modais (`lucasgomes`, `6145`, `gomes.studio.ai@gmail.com`, `"Ambiente Protegido para Lucas Gomes"`, `"Usuário: Lucas Gomes"`).
- **Arquivos envolvidos:** `src/components/auth/AuthLockScreen.tsx` (linhas 59, 68, 323, 344, 424, 760, 933), `src/components/settings/SettingsView.tsx` (linhas 135, 1185, 1197, 1360, 1540), `src/components/layout/Header.tsx` (linhas 391, 395).
- **Gravidade:** **CRÍTICO** (junto ao bypass de auth) / **ALTO** (exposição de dados pessoais e falta de experiência comercial multiusuário).
- **Risco:** Exposição do e-mail pessoal e credenciais do criador para qualquer cliente comercial e inconsistência na experiência multiusuário.
- **Correção recomendada:** Remover todas as strings pessoais hardcoded, exibir dados reais do usuário autenticado na sessão Supabase (`user.email`, metadados de perfil) e utilizar placeholders genéricos (`seu@email.com`).
- **Correção realizada:** **Implementado na Fase 3.** Todas as referências a `lucasgomes`, `6145`, `gomes.studio.ai@gmail.com` e `Lucas Gomes` foram removidas de `AuthContext.tsx`, `AuthLockScreen.tsx`, `Header.tsx`, `MobileDrawer.tsx`, `SettingsView.tsx`, `supabase.ts` e testes. A UI exibe dinamicamente `supabaseUserDisplayName` e `supabaseUserEmail`.
- **Teste necessário:** Inspeção por `grep` garantindo ausência de `lucasgomes`, `6145`, `gomes.studio.ai` no código-fonte de produção.
- **Resultado do teste:** Verificado por `grep` em `src/` com zero ocorrências de `lucasgomes`, `6145`, `gomes.studio.ai` ou `Lucas Gomes` + teste unitário de `deriveUserDisplayName` aprovado.

---

### 6. `postMessage` OAuth Sem Validação de Origem (`*`) e Listener Sem Limpeza
- **Problema identificado:** Em `AuthContext.tsx`, o ouvinte `window.addEventListener('message', (e: MessageEvent) => handleAuthMessage(e.data))` aceita mensagens contendo `access_token` e `refresh_token` de qualquer origem (`e.origin` não é verificado) e nunca é removido no `cleanup` do `useEffect`. Na janela popup, `window.opener.postMessage(payload, '*')` envia os tokens JWT de sessão para origem curinga `'*'`.
- **Arquivos envolvidos:** `src/context/AuthContext.tsx` (linhas 274–300, 328–335, 361–375).
- **Gravidade:** **ALTO**
- **Risco:** Se o aplicativo for aberto em contexto com abas/iframes maliciosos, há risco de sequestro ou injeção forçada de sessão via `postMessage` e vazamento de listener em memória.
- **Correção recomendada:** Validar estritamente `e.origin === window.location.origin` ao receber `postMessage`, enviar `postMessage(payload, window.location.origin)` no retorno OAuth para a mesma origem (ou restringir canais cruzados apenas a origens permitidas explícitas) e registrar/remover corretamente a referência da função ouvinte no cleanup.
- **Correção realizada:** **Implementado na Fase 3.** `AuthContext.tsx` agora valida `e.origin === window.location.origin` via `isTrustedMessageOrigin()`, valida formato string dos tokens, restringe `window.opener.postMessage(payload, window.location.origin)` e executa `window.removeEventListener('message', onWindowMessage)` no cleanup do `useEffect`.
- **Teste necessário:** Teste unitário rejeitando `MessageEvent` de origem externa (`https://evil.example`) e aceitando apenas origem confiável.
- **Resultado do teste:** Teste unitário `isTrustedMessageOrigin` aprovado no `vitest`.

---

### 7. Diagnóstico na Nuvem Executa Gravação Real Podendo Sobrescrever Dados da Nuvem
- **Problema identificado:** `runFullSupabaseDiagnostic(localState, ...)` executa no Passo 4 `saveFinanceDataToSupabase(localState, effectiveUserId)` usando diretamente o `localState` atual do navegador. Se o usuário rodar o diagnóstico em um aparelho antes de baixar a nuvem ou com dados de teste carregados, o diagnóstico sobrescreve o registro real no Supabase.
- **Arquivos envolvidos:** `src/services/supabaseSyncService.ts` (linhas 518–545), `src/context/FinanceContext.tsx` (linhas 340–365).
- **Gravidade:** **ALTO**
- **Risco:** Perda acidental de dados reais na nuvem durante execução de diagnóstico de suporte.
- **Correção recomendada:** Tornar o diagnóstico não destrutivo: consultar estado remoto e verificar leitura/integridade e permissão RLS sem sobrescrever dados reais com estado de amostra/desatualizado, ou somente testar gravação preservando/validando versão remota antes e criando backup prévio.
- **Correção realizada:** Pendente (planejada para **FASE 5**).
- **Teste necessário:** Teste de diagnóstico verificando que estado remoto mais novo ou não vazio não é sobrescrito por estado local demonstrativo.
- **Resultado do teste:** Pendente.

---

### 8. Ausência de Controle Otimista de Concorrência (`version`) e Backup Local de Recuperação
- **Problema identificado:** `saveFinanceDataToSupabase` envia `version: state.version || 1` em um `upsert` simples sem verificar se a versão remota mudou desde a última leitura, e `fetchFinanceDataFromSupabase` nem sequer retorna a coluna `version` no `.select(...)` (linha 222 seleciona apenas `user_id, data, client_timestamp, updated_at`). Além disso, não existe rotina automática que crie uma cópia de recuperação local antes de aplicar dados remotos divergentes, restaurar backup JSON ou resetar dados.
- **Arquivos envolvidos:** `src/services/supabaseSyncService.ts` (linhas 220–248, 260–318), `src/context/FinanceContext.tsx` (linhas 285–337, 405–453, 1608–1634), `src/utils/storage.ts`.
- **Gravidade:** **ALTO**
- **Risco:** Dois dispositivos editando simultaneamente podem gerar condição de corrida silenciosa (*last-write-wins* cego), e uma restauração/sincronização incorreta pode descartar alterações sem possibilidade de reversão local.
- **Correção recomendada:** Selecionar e rastrear `version` (`baseCloudVersion`), aplicar validação de concorrência otimista antes de sobrescrever registros remotos, criar snapshot de recuperação identificado por usuário e data/hora (`createLocalRecoveryBackup`) antes de qualquer substituição relevante e exibir modal de resolução de conflito com resumo comparativo quando houver divergência não trivial.
- **Correção realizada:** Pendente (planejada para **FASE 5**).
- **Teste necessário:** Teste de conflito entre dois dispositivos (edição offline + edição remota), falha de gravação preservando dados, e restauração de snapshot de recuperação.
- **Resultado do teste:** Pendente.

---

### 9. Importação de Backup JSON Sem Validação Estrutural e de Integridade
- **Problema identificado:** `importBackupJson` verifica apenas `parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.categories)`, aceitando objetos malformados, valores `NaN`/negativos/infinitos, IDs ausentes, contas inválidas ou esquemas incompatíveis e sobrescrevendo o estado diretamente sem backup prévio.
- **Arquivos envolvidos:** `src/context/FinanceContext.tsx` (linhas 1622–1634), `src/components/settings/SettingsView.tsx` (linhas 411–427).
- **Gravidade:** **ALTO**
- **Risco:** Corrupção do estado financeiro, quebra de renderização do dashboard ou perda de dados válidos ao importar arquivo incompatível ou adulterado.
- **Correção recomendada:** Implementar validador completo de esquema de backup (`validateBackupPayload`): verificar versão do backup, presença e tipos de todas as coleções (`transactions`, `categories`, `accounts`, `creditCards`, `debts`, `goals`), limites numéricos finitos, datas válidas, IDs únicos, confirmação explícita prévia com resumo dos dados a restaurar e geração obrigatória de backup de recuperação anterior à restauração.
- **Correção realizada:** Pendente (planejada para **FASE 5**).
- **Teste necessário:** Testes rejeitando JSON inválido, campos ausentes, valores `NaN`/negativos indevidos e confirmando geração de backup pré-restauração em importação válida.
- **Resultado do teste:** Pendente.

---

### 10. Fluxo Incompleto de Recuperação/Redefinição de Senha (`PASSWORD_RECOVERY`)
- **Problema identificado:** `sendPasswordResetEmail` envia e-mail de recuperação apontando para `window.location.origin`, porém `AuthContext` não trata o evento `PASSWORD_RECOVERY` em `onAuthStateChange` e não há tela ou modal dedicado para o usuário definir sua nova senha (`supabase.auth.updateUser({ password })`) após clicar no link do e-mail.
- **Arquivos envolvidos:** `src/context/AuthContext.tsx` (linhas 244–271, 495–513), `src/components/auth/AuthLockScreen.tsx`.
- **Gravidade:** **ALTO**
- **Risco:** Usuário que solicita redefinição de senha volta para o app sem formulário para concluir a troca de senha, bloqueando o autoatendimento comercial.
- **Correção recomendada:** Detectar `PASSWORD_RECOVERY` em `AuthContext`, expor estado `isPasswordRecoveryMode` e função `updateUserPassword(newPassword)`, e renderizar interface clara de redefinição de senha na tela de autenticação.
- **Correção realizada:** **Implementado na Fase 3.** `AuthContext.tsx` trata o evento `PASSWORD_RECOVERY` (e retorno `?type=recovery`), expõe `isPasswordRecoveryMode`, `updatePassword` e `cancelPasswordRecovery`, e `AuthLockScreen.tsx` exibe tela dedicada para definição e confirmação da nova senha.
- **Teste necessário:** Simulação do evento `PASSWORD_RECOVERY` exibindo tela de nova senha e concluindo `updateUser` com sucesso/erro tratado (plus validação real com e-mail no Supabase).
- **Resultado do teste:** Validação de senha e build TypeScript aprovados; teste real de clique em link de e-mail depende de URL de redirecionamento configurada no painel Supabase.

---

### 11. Uso de `window.confirm` Nativo em Conflito de Nuvem e Ações Destrutivas
- **Problema identificado:** `forceDownloadFromCloud` (`FinanceContext.tsx:323`) e ações de exclusão/reset (`SettingsView.tsx`, `CardsView.tsx`, `DebtsView.tsx`, `IncomesView.tsx`, `ExpensesView.tsx`, `TransactionsView.tsx`, `GoalsView.tsx`) utilizam `window.confirm()`, que pode ser bloqueado silenciosamente em ambientes iframe/webview ou prejudicar a UX mobile e o fluxo de conflito.
- **Arquivos envolvidos:** `src/context/FinanceContext.tsx` (linha 323), `src/components/settings/SettingsView.tsx` (linhas 838, 842, 900), outros componentes listados no grep.
- **Gravidade:** **ALTO** (no fluxo de sincronização/conflito) / **MÉDIO** (nas ações de interface).
- **Risco:** Bloqueio da confirmação em iframes (fazendo ações retornarem `false` automaticamente) e ausência de contexto comparativo (contagem de lançamentos, data, saldo) ao decidir sobrescrever dados.
- **Correção recomendada:** Substituir `window.confirm` no fluxo de sincronização e configurações/exclusões por modais in-app acessíveis e responsivos, com comparação clara entre versão local e nuvem no caso de conflitos.
- **Correção realizada:** Pendente (planejada para **FASE 5** para conflito/backup/reset e **FASE 6** para fluxos LGPD).
- **Teste necessário:** Teste de fluxo de conflito garantindo estado `pendingConflict` sem chamadas a `window.confirm`.
- **Resultado do teste:** Pendente.

---

### 12. Auditoria SQL / RLS e Permissões do Banco (`user_finance_data`)
- **Problema identificado:** O script `SUPABASE_SQL_SETUP` presente em `supabaseSyncService.ts` cria políticas `SELECT`, `INSERT`, `UPDATE`, `DELETE` para `authenticated` usando `auth.uid() = user_id`, porém:
  1. Não revoga explicitamente privilégios da role `anon` e `public` (`REVOKE ALL ON public.user_finance_data FROM anon, public;`).
  2. Não aplica `ALTER TABLE public.user_finance_data FORCE ROW LEVEL SECURITY;` (proteção extra caso consultas rodem sob roles com privilégios elevados que não superuser).
  3. Não inclui validação/trigger server-side para atualizar `updated_at = NOW()` no servidor nem documentação de auditoria de RPCs/Views/Triggers existentes no banco real (que só podem ser inspecionadas no painel Supabase do proprietário).
  4. Política `DELETE` permite exclusão livre pelo usuário autenticado (o que deve estar alinhado à regra comercial e LGPD de exclusão de dados).
- **Arquivos envolvidos:** `src/services/supabaseSyncService.ts` (linhas 15–70).
- **Gravidade:** **MÉDIO** (código SQL de referência; o estado real no Supabase em produção precisa ser confirmado diretamente no SQL Editor antes da auditoria final).
- **Risco:** Permissões `GRANT` excessivas a `anon` ou políticas legadas residuais no projeto Supabase em produção não são visíveis pelo código frontend.
- **Correção recomendada:** Atualizar o script SQL de referência e auditoria (sem alterar automaticamente produção), fornecer queries de inspeção (`pg_policies`, `information_schema.table_privileges`, `pg_proc`, `pg_views`, `pg_trigger`) para o proprietário executar no SQL Editor do Supabase e documentar tudo em `SEGURANCA_E_RLS.md`.
- **Correção realizada:** **Preparado na Fase 4 (sem alteração em produção).** Criado `SEGURANCA_E_RLS.md` com 9 consultas SQL 100% somente leitura para auditoria real no Supabase (RLS, `FORCE RLS`, `pg_policies`, `role_table_grants`, views, funções `SECURITY DEFINER`, triggers e `BYPASSRLS`), plano de correção em etapas (`REVOKE ALL ... FROM anon, PUBLIC`, políticas `SELECT/INSERT/UPDATE/DELETE` usando `(SELECT auth.uid()) = user_id`) e roteiro de validação com 2 contas de teste. Nenhuma instrução DDL/DCL foi executada em produção.
- **Teste necessário:** Execução das consultas de auditoria no SQL Editor pelo proprietário + testes diretos com Usuário A, Usuário B e cliente anônimo contra o Supabase.
- **Resultado do teste:** **Pendente de execução manual no projeto Supabase real** (ambiente local não possui acesso direto ao catálogo interno PostgreSQL sem credenciais administrativas).

---

### 13. Variáveis de Ambiente, Credenciais Reais em `.env.example` e Hardcode de Fallback
- **Problema identificado:**
  1. `.env.example` contém a URL real do projeto (`lwkecyfhpkyuakbbxksl.supabase.co`), a chave `sb_publishable_...` real e variáveis residuais (`GEMINI_API_KEY`, `APP_URL`).
  2. `src/utils/supabase.ts` e `vite.config.ts` contêm valores padrão embutidos para o projeto atual, e `SettingsView.tsx:601` / `supabaseSyncService.ts:438` exibem o host/URL fixo em string em vez de ler `SUPABASE_PROJECT_URL`.
  3. Verificação positiva: **Nenhuma chave secreta (`service_role`, `sb_secret`, senha de banco)** foi encontrada no código-fonte.
- **Arquivos envolvidos:** `.env.example`, `src/utils/supabase.ts`, `vite.config.ts`, `src/services/supabaseSyncService.ts` (linha 438), `src/components/settings/SettingsView.tsx` (linha 601).
- **Gravidade:** **MÉDIO**
- **Risco:** Acoplamento do código comercial a um único projeto específico e presença de exemplos reais no repositório versionado (`.env.example` deve conter apenas placeholders fictícios).
- **Correção recomendada:** Limpar `.env.example` deixando apenas variáveis `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY` com exemplos fictícios; usar `SUPABASE_PROJECT_URL` dinamicamente na UI/diagnóstico; tratar estado `not_configured` caso variáveis não estejam definidas em um novo ambiente de deploy (ou documentar claramente variáveis de ambiente no Cloudflare/Vite).
- **Correção realizada:** Pendente (planejada para **FASE 4 / FASE 6**).
- **Teste necessário:** Verificação com `grep` para zero segredos e comportamento seguro quando variáveis de ambiente estiverem ausentes/inválidas.
- **Resultado do teste:** Pendente.

---

### 14. Dependências e Acoplamentos Residuais do Google AI Studio
- **Problema identificado:** Embora o app funcione de forma 100% independente no Cloudflare Workers como SPA React, existem artefatos residuais do template Google AI Studio:
  - `package.json`: declara `@google/genai`, `express`, `dotenv`, `tsx` e `@types/express`, que **não são importados em nenhum arquivo de `src/`**.
  - `metadata.json`: declara `"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]` sem uso real de API Gemini.
  - `.env.example`: referencia `GEMINI_API_KEY` e `APP_URL`.
  - `.npmrc` (`legacy-peer-deps=true`): necessário hoje devido a conflito de peer optional entre `vite@8.3.x` e `esbuild@0.25.0` no `package.json`.
- **Arquivos envolvidos:** `package.json`, `metadata.json`, `.env.example`.
- **Gravidade:** **MÉDIO**
- **Risco:** Pacotes desnecessários aumentam área de ataque e tempo de instalação no CI/CD, e dão falsa impressão de dependência do runtime do AI Studio.
- **Correção recomendada:** Documentar a independência real em relação ao AI Studio; manter `package.json` funcional no Cloudflare e avaliar limpeza controlada das dependências não utilizadas (`@google/genai`, `express`, `dotenv`, `tsx`, `@types/express`) apenas com regeneração validada de `package-lock.json` e `npm ci` (ou mantê-las documentadas se desejado preservar scripts/compatibilidade).
- **Correção realizada:** Pendente (planejada para **FASE 6 / FASE 8** — mantendo `wrangler.jsonc` e build Cloudflare intactos).
- **Teste necessário:** `npm ci`, `npm run lint`, `npm test`, `npm run build` após eventual limpeza.
- **Resultado do teste:** Pendente.

---

### 15. Vulnerabilidade Reportada pelo `npm audit` na Biblioteca `xlsx@0.18.5`
- **Problema identificado:** `npm audit --json` identificou **1 pacote com vulnerabilidade ALTA** (`xlsx@0.18.5`):
  - `GHSA-4r6h-8v6p-xvw6` (Prototype Pollution, CVSS 7.8, `<0.19.3`).
  - `GHSA-5pgg-2g8v-p4x9` (ReDoS, CVSS 7.5, `<0.20.2`).
  - `fixAvailable: false` no registro oficial npm (o pacote SheetJS deixou de publicar correções no registry público npm).
- **Arquivos envolvidos:** `package.json` (`xlsx: ^0.18.5`), `src/utils/exportUtils.ts`.
- **Gravidade:** **MÉDIO** (risco atenuado em runtime atual porque `exportUtils.ts` apenas **escreve** arquivos via `XLSX.writeFile` e não faz parsing `XLSX.read` de planilhas externas enviadas por usuários, mas requer substituição futura).
- **Risco:** Se no futuro for adicionada importação de `.xlsx` com a versão atual de `xlsx`, o aplicativo ficará exposto a Prototype Pollution e ReDoS.
- **Correção recomendada:** Nunca adicionar importação/parsing `.xlsx` usando `xlsx@0.18.5`; planejar substituição para `exceljs` ou exportação CSV/ODS segura em iteração dedicada (sem quebrar as 9 abas atuais do relatório).
- **Correção realizada:** Pendente (registrada e mitigada por escopo somente escrita; plano de substituição documentado).
- **Teste necessário:** `npm audit` + validação de exportação Excel.
- **Resultado do teste:** Auditoria executada em 13/11/2026 (`1 high` em `xlsx`).

---

### 16. Precisão Monetária com Ponto Flutuante JavaScript Bruto
- **Problema identificado:** Operações de saldo em `FinanceContext.tsx` (ex.: `acc.balance += txData.amount`, cálculos de parcelas, amortização de dívidas e metas) operam diretamente sobre floats IEEE 754 sem normalização para 2 casas decimais (`Math.round(val * 100) / 100`).
- **Arquivos envolvidos:** `src/context/FinanceContext.tsx` (linhas 1197–1273, 1310–1435, 1581).
- **Gravidade:** **MÉDIO**
- **Risco:** Acúmulo de resíduos como `R$ 1000,0000000000001` em contas e relatórios ao longo de dezenas de lançamentos.
- **Correção recomendada:** Introduzir utilitário `roundCurrency(value)` (arredondamento em centavos inteiros) em todas as mutações de saldo, amortização e transferência, além de validar valores negativos/NaN.
- **Correção realizada:** Pendente (planejada para **FASE 5**).
- **Teste necessário:** Testes de integridade monetária com múltiplas somas/subtrações decimais (`0.1 + 0.2`, parcelas, transferências).
- **Resultado do teste:** Pendente.

---

### 17. Arquitetura de Persistência Monolítica (`JSONB` Único) vs Escalabilidade Comercial
- **Problema identificado:** Atualmente toda a vida financeira de um usuário (`transactions`, `accounts`, `creditCards`, `debts`, `goals`, `categories`) é salva em um único objeto `JSONB` na tabela `user_finance_data`.
- **Arquivos envolvidos:** `src/services/supabaseSyncService.ts`, `src/utils/storage.ts`.
- **Gravidade:** **MÉDIO** (aceitável para MVP inicial, limitante para escala média/longa).
- **Risco:** A cada edição de 1 lançamento, o objeto inteiro é trafegado e sobrescrito; impossibilita paginação/filtros no banco, granularidade de auditoria ou planos/limites validados por query SQL sem Edge Functions.
- **Correção recomendada:** Manter compatibilidade total com `user_finance_data` no MVP comercial (conforme Seção 5 do plano), endurecer concorrência otimista por `version`, e documentar proposta detalhada de migração futura para modelo relacional (`profiles`, `accounts`, `categories`, `credit_cards`, `transactions`, `debts`, `goals`, `subscriptions`) em `ARQUITETURA_DO_SISTEMA.md`.
- **Correção realizada:** **Documentado na Fase 4.** Mantida compatibilidade integral com `public.user_finance_data` para o MVP comercial e formalizada proposta de evolução futura para esquema relacional normalizado em `ARQUITETURA_DO_SISTEMA.md`, sem executar migração sem autorização.
- **Teste necessário:** Verificação de compatibilidade com registros existentes de `user_finance_data` e validação de limite de payload (Fase 5 e Fase 7).
- **Resultado do teste:** Pendente.

---

### 18. Estrutura Atual de Testes Baseada em Funções Simulação Inline
- **Problema identificado:** `src/__tests__/auth_and_sync.test.ts` possui 22 testes aprovados, porém vários blocos reimplementam funções locais (`const login = ...`, `const syncNowWithCloud = ...`) dentro do próprio arquivo de teste em vez de testar diretamente os módulos reais (`AuthProvider`, `FinanceProvider`, `storage.ts`, importação de backup, isolamento multiusuário).
- **Arquivos envolvidos:** `src/__tests__/auth_and_sync.test.ts`.
- **Gravidade:** **MÉDIO**
- **Risco:** Falsa sensação de cobertura — alterações reais em `AuthContext.tsx` ou `FinanceContext.tsx` podem quebrar fluxos sem que os testes detectem.
- **Correção recomendada:** Criar testes integrados sobre os módulos reais e adicionar suíte cobrindo autenticação, proteção contra sobrescrita em navegador novo, conflitos, recuperação de backup, validação de importação e integridade monetária/relacional, além de roteiro de teste real com 2 contas no Supabase.
- **Correção realizada:** Pendente (planejada para **FASE 7**).
- **Teste necessário:** Execução completa de `npm test` + validação manual/automatizada contra projeto Supabase de teste.
- **Resultado do teste:** Estado pré-refatoração: `22/22` testes legados passando.

---

### 19. Ausência de Suporte Técnico e Documentação de Conformidade LGPD
- **Problema identificado:** O sistema coleta e sincroniza dados financeiros pessoais sensíveis (contas, dívidas, cartões, transações, e-mail de autenticação), porém não possui área de Privacidade/LGPD com identificação clara dos dados tratados, exportação padronizada para titular, fluxo de solicitação/execução de exclusão de conta e dados, nem políticas técnicas documentadas.
- **Arquivos envolvidos:** `src/components/settings/SettingsView.tsx`, `src/context/AuthContext.tsx`, `src/services/supabaseSyncService.ts`, documentação raiz.
- **Gravidade:** **LOW / ALTO para lançamento comercial** (classificado como **ALTO** para prontidão comercial, **BAIXO** em risco de bug imediato).
- **Risco:** Impedimento comercial e ausência de governança sobre tratamento, retenção e exclusão de dados pessoais.
- **Correção recomendada:** Implementar painel de Privacidade & Dados Pessoais em Configurações (visualização de dados mantidos, exportação do titular, registro local/remoto de consentimento quando aplicável, exclusão de dados financeiros na nuvem e fluxo orientado de encerramento de conta) e elaborar as minutas técnicas (`POLITICA_DE_PRIVACIDADE.md`, `TERMOS_DE_USO.md`, `POLITICA_DE_EXCLUSAO_DE_DADOS.md`, `REGISTRO_DE_TRATAMENTO_DE_DADOS.md`).
- **Correção realizada:** Pendente (planejada para **FASE 6**).
- **Teste necessário:** Fluxo de exportação do titular e exclusão controlada dos registros financeiros do usuário autenticado.
- **Resultado do teste:** Pendente.

---

### 20. Logs de Diagnóstico em Console e Largura Mínima Fixa em Subcomponente
- **Problema identificado:** Existem chamadas `console.warn` / `console.error` dispersas em `AuthContext.tsx`, `FinanceContext.tsx`, `storage.ts` e `SettingsView.tsx`, além de `min-w-[680px]` em `TwelveMonthProjectionSection.tsx:470` (dentro de container de tabela rolável).
- **Arquivos envolvidos:** `src/context/AuthContext.tsx`, `src/context/FinanceContext.tsx`, `src/utils/storage.ts`, `src/components/dashboard/TwelveMonthProjectionSection.tsx`.
- **Gravidade:** **BAIXO**
- **Risco:** Ruído no console do navegador em produção; potencial vazamento de mensagens técnicas internas caso erros futuros incluam detalhes desnecessários.
- **Correção recomendada:** Padronizar logger seguro (sem imprimir tokens, payloads financeiros ou credenciais) e revisar rolagem horizontal contida da tabela de projeção de 12 meses no mobile.
- **Correção realizada:** Pendente (planejada para **FASE 5 / FASE 6**).
- **Teste necessário:** Build sem erros e revisão visual mobile (`320px` a `430px`).
- **Resultado do teste:** Pendente.

---

## Inventário de Dependências Externas e Independência do Google AI Studio

| Item | Situação Atual | Impacto na Independência (GitHub + Cloudflare + Supabase) |
| :--- | :--- | :--- |
| Hospedagem e Build | `wrangler.jsonc` (`gestaofinanceira`) + `vite build` + `package-lock.json` | 100% independente do AI Studio para build e publicação no Cloudflare Workers |
| `@google/genai` (`package.json`) | Instalado, **0 importações** em `src/` | Nenhum impacto em runtime; resíduo de template |
| `express`, `tsx`, `dotenv`, `@types/express` | Instalados, **0 importações** em `src/` | Nenhum backend Express ativo; app é SPA React puro |
| `metadata.json` (`MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API`) | Metadado residual do AI Studio | Não afeta o funcionamento em produção no Cloudflare |
| `.env.example` (`GEMINI_API_KEY`, `APP_URL`) | Variáveis residuais do template + credenciais Supabase reais | Precisa ser sanitizado na Fase 6 para conter apenas variáveis reais usadas pelo produto com valores fictícios |
