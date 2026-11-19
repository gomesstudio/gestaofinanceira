-- ==============================================================================
-- GESTÃO FINANCEIRA PRO — ETAPA C1/C3 (SCRIPT 03 DE 04)
-- Procedimento Seguro de Migração para Usuários Existentes (Sem Bloqueio Indevido)
--
-- IMPORTANTE:
-- - Execute o Passo 1 (inspeção somente leitura) ANTES de qualquer INSERT.
-- - Este script NÃO cria assinaturas automaticamente; revise os UUIDs/e-mails
--   listados antes de executar o bloco desejado no SQL Editor.
-- - A coluna data (JSONB) de public.user_finance_data nunca é consultada aqui.
-- - O plano 'lifetime' (Vitalício Especial) é exclusivo de concessão administrativa.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PASSO 1 — INSPEÇÃO SOMENTE LEITURA (execute primeiro e revise os resultados)
-- ------------------------------------------------------------------------------
SELECT
  u.id AS user_id,
  u.email,
  u.created_at AS conta_criada_em,
  (ufd.user_id IS NOT NULL) AS possui_dados_financeiros,
  s.plan_type AS plano_atual,
  s.status AS status_atual,
  s.expires_at AS expiracao_atual
FROM auth.users u
LEFT JOIN public.user_finance_data ufd ON ufd.user_id = u.id
LEFT JOIN public.user_subscriptions s ON s.user_id = u.id
ORDER BY u.created_at ASC;

-- ------------------------------------------------------------------------------
-- PASSO 2 — CADASTRAR O ADMINISTRADOR MASTER EM public.app_admins
-- Substitua 'SEU_EMAIL_ADMIN_AQUI' pelo e-mail exato da conta proprietária.
-- ------------------------------------------------------------------------------
/*
INSERT INTO public.app_admins (user_id, label, is_active)
SELECT
  u.id,
  'Proprietario / Master Principal',
  true
FROM auth.users u
WHERE LOWER(u.email) = LOWER('SEU_EMAIL_ADMIN_AQUI')
ON CONFLICT (user_id) DO UPDATE SET
  is_active = true;
*/

-- ------------------------------------------------------------------------------
-- PASSO 3A (RECOMENDADO) — CONCEDER VITALÍCIO ESPECIAL AO MASTER / CONTAS FUNDADORAS
-- E/OU PLANO ANUAL (12 MESES) PARA CONTAS LEGÍTIMAS EXISTENTES
-- ON CONFLICT DO NOTHING preserva qualquer assinatura já configurada manualmente.
-- ------------------------------------------------------------------------------
/*
-- Exemplo 1: Conta do Master (Vitalício Especial administrativo, sem vencimento periódico)
INSERT INTO public.user_subscriptions (
  user_id,
  plan_type,
  status,
  starts_at,
  expires_at,
  notes
)
SELECT
  u.id,
  'lifetime',
  'active',
  NOW(),
  NULL,
  'Conta proprietaria Master - Vitalicio Especial'
FROM auth.users u
WHERE LOWER(u.email) IN (
  LOWER('SEU_EMAIL_ADMIN_AQUI')
)
ON CONFLICT (user_id) DO NOTHING;

-- Exemplo 2: Demais contas legítimas existentes (Plano Anual de 12 meses)
INSERT INTO public.user_subscriptions (
  user_id,
  plan_type,
  status,
  starts_at,
  expires_at,
  notes
)
SELECT
  u.id,
  'annual',
  'active',
  NOW(),
  NOW() + INTERVAL '12 months',
  'Migracao segura pre-comercializacao (plano anual 12 meses)'
FROM auth.users u
WHERE LOWER(u.email) IN (
  LOWER('OUTRO_EMAIL_LEGADO_AQUI')
)
ON CONFLICT (user_id) DO NOTHING;
*/

-- ------------------------------------------------------------------------------
-- PASSO 3B (ALTERNATIVO) — BACKFILL PARA TODAS AS CONTAS ANTERIORES À DATA DE CORTE
-- ------------------------------------------------------------------------------
/*
INSERT INTO public.user_subscriptions (
  user_id,
  plan_type,
  status,
  starts_at,
  expires_at,
  notes
)
SELECT
  u.id,
  'annual',
  'active',
  NOW(),
  NOW() + INTERVAL '12 months',
  'Migracao de legado pre-comercializacao (plano anual 12 meses)'
FROM auth.users u
INNER JOIN public.user_finance_data ufd ON ufd.user_id = u.id
WHERE u.created_at < '2026-11-18T00:00:00Z'::TIMESTAMPTZ
ON CONFLICT (user_id) DO NOTHING;
*/

-- ------------------------------------------------------------------------------
-- PASSO 4 — CONFERÊNCIA PRÉ-ATIVACAO DO RLS (execute ANTES do Script 02)
-- Confirme que nenhuma conta legítima com dados financeiros ficará sem acesso.
-- ------------------------------------------------------------------------------
SELECT
  COUNT(*) AS contas_com_dados_sem_assinatura_ativa
FROM public.user_finance_data ufd
WHERE NOT public.has_active_subscription(ufd.user_id);
