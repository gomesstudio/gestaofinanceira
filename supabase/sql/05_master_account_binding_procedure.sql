-- ==============================================================================
-- GESTÃO FINANCEIRA PRO — PROCEDIMENTO ADMINISTRATIVO PROTEGIDO (SCRIPT 05 DE 05)
-- Vinculação Segura de Conta Existente ao Perfil Master (por UUID Verificado)
--
-- REGRAS DE SEGURANÇA:
-- 1. NÃO cria nova conta, NÃO altera senha e NÃO substitui o usuário existente.
-- 2. NÃO armazena e-mail pessoal ou senha administrativa neste repositório.
-- 3. NÃO concede privilégio administrativo por e-mail público nem user_metadata;
--    a autorização existe exclusivamente pelo UUID confirmado em public.app_admins.
-- 4. NÃO lê nem altera os dados financeiros JSONB de public.user_finance_data.
-- 5. Execute APENAS no SQL Editor (contexto privilegiado) após homologação
--    validada e autorização explícita.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- PASSO A — LOCALIZAÇÃO SOMENTE LEITURA DO UUID DA CONTA EXISTENTE
-- Informe o e-mail oficial apenas no momento da execução no SQL Editor.
-- Confirme que:
--   * Existe exatamente 1 registro correspondente.
--   * created_at, last_sign_in_at e possui_dados_financeiros batem com sua conta.
-- ------------------------------------------------------------------------------
SELECT
  u.id AS uuid_confirmar,
  u.email,
  u.created_at AS conta_criada_em,
  u.email_confirmed_at AS email_confirmado_em,
  u.last_sign_in_at AS ultimo_login_em,
  EXISTS (
    SELECT 1
    FROM public.user_finance_data ufd
    WHERE ufd.user_id = u.id
  ) AS possui_dados_financeiros_preservados
FROM auth.users u
WHERE LOWER(u.email) = LOWER('INFORME_O_EMAIL_OFICIAL_AQUI_NA_EXECUCAO');

-- ------------------------------------------------------------------------------
-- PASSO B — VINCULAÇÃO PROTEGIDA POR UUID CONFIRMADO (SOMENTE APÓS CONFERÊNCIA)
-- Substitua os dois marcadores abaixo no momento da execução manual:
--   1. v_confirmed_uuid: cole o UUID exato retornado no Passo A.
--   2. v_confirmed_email: informe o mesmo e-mail para validação cruzada dupla.
-- Se houver divergência entre UUID e e-mail, a transação é abortada sem alterar nada.
-- ------------------------------------------------------------------------------
/*
BEGIN;

DO $$
DECLARE
  v_confirmed_uuid UUID := '00000000-0000-0000-0000-000000000000'; -- UUID do Passo A
  v_confirmed_email TEXT := 'INFORME_O_EMAIL_OFICIAL_AQUI_NA_EXECUCAO';
  v_found_count INT;
  v_actual_email TEXT;
BEGIN
  IF v_confirmed_uuid = '00000000-0000-0000-0000-000000000000'::UUID THEN
    RAISE EXCEPTION 'Operacao abortada: substitua v_confirmed_uuid pelo UUID real localizado no Passo A.';
  END IF;

  SELECT COUNT(*), MAX(u.email::TEXT)
  INTO v_found_count, v_actual_email
  FROM auth.users u
  WHERE u.id = v_confirmed_uuid;

  IF v_found_count <> 1 THEN
    RAISE EXCEPTION 'Operacao abortada: UUID % nao encontrado de forma unica em auth.users.', v_confirmed_uuid;
  END IF;

  IF LOWER(COALESCE(v_actual_email, '')) <> LOWER(BTRIM(v_confirmed_email)) THEN
    RAISE EXCEPTION 'Operacao abortada: UUID % pertence a outro e-mail (%), diferente da confirmacao.', v_confirmed_uuid, v_actual_email;
  END IF;

  -- Vincula exclusivamente o UUID confirmado na allowlist administrativa do servidor
  INSERT INTO public.app_admins (user_id, label, is_active)
  VALUES (v_confirmed_uuid, 'Master Principal (Conta Preservada)', true)
  ON CONFLICT (user_id) DO UPDATE SET
    label = EXCLUDED.label,
    is_active = true;

  -- Registra apenas metadado administrativo na trilha comercial (sem dados pessoais sensiveis)
  INSERT INTO public.commercial_audit_logs (
    actor_user_id,
    target_user_id,
    entity_type,
    entity_id,
    action,
    details
  )
  VALUES (
    v_confirmed_uuid,
    v_confirmed_uuid,
    'subscription',
    v_confirmed_uuid::TEXT,
    'master_admin_bound',
    jsonb_build_object('binding_method', 'verified_uuid_admin_procedure')
  );

  RAISE NOTICE 'Sucesso: UUID % vinculado a public.app_admins com acesso permanente sem exigir assinatura paga.', v_confirmed_uuid;
END $$;

COMMIT;
*/

-- ------------------------------------------------------------------------------
-- PASSO C — CONFERÊNCIA FINAL SOMENTE LEITURA (SEM ALTERAR DADOS FINANCEIROS)
-- ------------------------------------------------------------------------------
/*
SELECT
  a.user_id,
  a.label,
  a.is_active AS master_ativo,
  a.created_at AS vinculado_em,
  public.has_active_subscription(a.user_id) AS acesso_financeiro_permanente_ok,
  EXISTS (
    SELECT 1 FROM public.user_finance_data ufd WHERE ufd.user_id = a.user_id
  ) AS dados_financeiros_pessoais_intactos
FROM public.app_admins a;
*/
