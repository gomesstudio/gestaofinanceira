-- ==============================================================================
-- GESTÃO FINANCEIRA PRO — ETAPAS C1 / C3 (SCRIPT 01 DE 04)
-- Schema Comercial Completo:
--   - public.user_subscriptions (monthly, annual e lifetime administrativo)
--   - public.app_admins (allowlist administrativa server-side)
--   - public.customer_profiles (dados cadastrais mínimos LGPD)
--   - public.access_requests (solicitações de acesso com aprovação administrativa)
--   - public.commercial_payments (faturamento comercial isolado do Master)
--   - public.commercial_audit_logs (trilha de auditoria administrativa)
--   - RPCs SECURITY DEFINER endurecidas
--
-- ATENÇÃO:
-- - NÃO aplicar este script sem revisar a sequência de migração (Script 03).
-- - Este script NÃO altera ainda as políticas RLS de public.user_finance_data
--   (isso ocorre apenas no Script 02, após migrar os usuários existentes).
-- - Nenhuma função administrativa consulta ou altera public.user_finance_data.
-- ==============================================================================

BEGIN;

-- 1. Tabela de assinaturas vinculada ao auth.users(id)
--    Mensal (30 dias) e Anual (12 meses) exigem expires_at NOT NULL.
--    Vitalício Especial (lifetime, exclusivo do Master) exige expires_at IS NULL.
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('monthly', 'annual', 'lifetime')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('active', 'expired', 'canceled', 'suspended', 'pending')),
  starts_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NULL,
  notes TEXT NULL,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_subscriptions_expiry_by_plan CHECK (
    (plan_type = 'lifetime' AND expires_at IS NULL)
    OR (plan_type IN ('monthly', 'annual') AND expires_at IS NOT NULL)
  )
);

-- Caso a tabela já exista de versão anterior do script, garante constraint atualizada
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS chk_user_subscriptions_lifetime_expiry;
ALTER TABLE public.user_subscriptions DROP CONSTRAINT IF EXISTS chk_user_subscriptions_expiry_by_plan;
ALTER TABLE public.user_subscriptions
  ALTER COLUMN expires_at DROP NOT NULL;
ALTER TABLE public.user_subscriptions
  ADD CONSTRAINT chk_user_subscriptions_expiry_by_plan CHECK (
    (plan_type = 'lifetime' AND expires_at IS NULL)
    OR (plan_type IN ('monthly', 'annual') AND expires_at IS NOT NULL)
  );

CREATE INDEX IF NOT EXISTS idx_user_subscriptions_status_expires
  ON public.user_subscriptions(status, expires_at);

-- 2. Trigger genérico de updated_at para tabelas comerciais
CREATE OR REPLACE FUNCTION public.fn_set_user_subscriptions_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_set_user_subscriptions_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_set_user_subscriptions_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.fn_set_user_subscriptions_updated_at() FROM authenticated;

DROP TRIGGER IF EXISTS trg_user_subscriptions_updated_at ON public.user_subscriptions;
CREATE TRIGGER trg_user_subscriptions_updated_at
  BEFORE UPDATE ON public.user_subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_user_subscriptions_updated_at();

-- 3. RLS estrito na tabela de assinaturas:
--    Clientes podem APENAS ler a própria linha (SELECT).
--    Qualquer INSERT, UPDATE ou DELETE via client API é bloqueado no banco.
--    Mantemos NO FORCE ROW LEVEL SECURITY para evitar bloqueio de RPCs SECURITY DEFINER
--    caso o proprietário dos objetos não possua BYPASSRLS fora do Supabase gerenciado.
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_subscriptions NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_subscriptions_select_own" ON public.user_subscriptions;

REVOKE ALL ON TABLE public.user_subscriptions FROM PUBLIC;
REVOKE ALL ON TABLE public.user_subscriptions FROM anon;
REVOKE ALL ON TABLE public.user_subscriptions FROM authenticated;

GRANT SELECT ON TABLE public.user_subscriptions TO authenticated;

CREATE POLICY "user_subscriptions_select_own"
  ON public.user_subscriptions
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 4. Tabela de administradores autorizados (allowlist server-side)
CREATE TABLE IF NOT EXISTS public.app_admins (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.app_admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_admins NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.app_admins FROM PUBLIC;
REVOKE ALL ON TABLE public.app_admins FROM anon;
REVOKE ALL ON TABLE public.app_admins FROM authenticated;

-- 5. Perfis comerciais mínimos (LGPD — sem senhas, sem tokens, sem dados financeiros)
--    Escrita direta pelo cliente é bloqueada; apenas RPCs SECURITY DEFINER atualizam esta tabela
--    para impedir que customer_profiles se torne fonte independente de consentimento.
CREATE TABLE IF NOT EXISTS public.customer_profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  email TEXT NOT NULL,
  lgpd_whatsapp_consent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DROP TRIGGER IF EXISTS trg_customer_profiles_updated_at ON public.customer_profiles;
CREATE TRIGGER trg_customer_profiles_updated_at
  BEFORE UPDATE ON public.customer_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_user_subscriptions_updated_at();

ALTER TABLE public.customer_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customer_profiles NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "customer_profiles_select_own" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_insert_own" ON public.customer_profiles;
DROP POLICY IF EXISTS "customer_profiles_update_own" ON public.customer_profiles;

REVOKE ALL ON TABLE public.customer_profiles FROM PUBLIC;
REVOKE ALL ON TABLE public.customer_profiles FROM anon;
REVOKE ALL ON TABLE public.customer_profiles FROM authenticated;

GRANT SELECT ON TABLE public.customer_profiles TO authenticated;

CREATE POLICY "customer_profiles_select_own"
  ON public.customer_profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 6. Solicitações de acesso com aprovação administrativa
--    Publicamente aceita apenas 'monthly' e 'annual'. Nunca 'lifetime'.
CREATE TABLE IF NOT EXISTS public.access_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_plan TEXT NOT NULL CHECK (requested_plan IN ('monthly', 'annual')),
  request_status TEXT NOT NULL DEFAULT 'pending' CHECK (request_status IN ('pending', 'approved', 'rejected', 'canceled')),
  whatsapp_redirect_confirmed BOOLEAN NOT NULL DEFAULT false,
  admin_notes TEXT NULL,
  reviewed_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_access_requests_one_pending_per_user
  ON public.access_requests(user_id)
  WHERE request_status = 'pending';

CREATE INDEX IF NOT EXISTS idx_access_requests_status_created
  ON public.access_requests(request_status, created_at DESC);

DROP TRIGGER IF EXISTS trg_access_requests_updated_at ON public.access_requests;
CREATE TRIGGER trg_access_requests_updated_at
  BEFORE UPDATE ON public.access_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_user_subscriptions_updated_at();

ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "access_requests_select_own" ON public.access_requests;

REVOKE ALL ON TABLE public.access_requests FROM PUBLIC;
REVOKE ALL ON TABLE public.access_requests FROM anon;
REVOKE ALL ON TABLE public.access_requests FROM authenticated;

-- Clientes podem apenas ler suas próprias solicitações; escrita passa pela RPC submit_access_request()
GRANT SELECT ON TABLE public.access_requests TO authenticated;

CREATE POLICY "access_requests_select_own"
  ON public.access_requests
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 7. Faturamento comercial (exclusivo do Master — bloqueado para clientes comuns)
CREATE TABLE IF NOT EXISTS public.commercial_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  subscription_plan TEXT NOT NULL CHECK (subscription_plan IN ('monthly', 'annual', 'lifetime')),
  amount_cents BIGINT NOT NULL CHECK (amount_cents >= 0),
  payment_date DATE NOT NULL,
  payment_method TEXT NOT NULL CHECK (payment_method IN ('pix', 'credit_card', 'debit_card', 'bank_transfer', 'cash', 'other')),
  payment_status TEXT NOT NULL DEFAULT 'confirmed' CHECK (payment_status IN ('pending', 'confirmed', 'canceled')),
  reference_code TEXT NULL,
  notes TEXT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  updated_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_payments_unique_ref
  ON public.commercial_payments(customer_user_id, reference_code)
  WHERE reference_code IS NOT NULL AND payment_status <> 'canceled';

-- Garante unicidade estrutural em concorrência mesmo quando reference_code estiver ausente (NULL),
-- preservando pagamentos legítimos distintos (outro cliente, plano, data, valor, método ou referência).
CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_payments_unique_no_ref
  ON public.commercial_payments(customer_user_id, subscription_plan, payment_date, amount_cents, payment_method)
  WHERE reference_code IS NULL AND payment_status <> 'canceled';

CREATE INDEX IF NOT EXISTS idx_commercial_payments_date_status
  ON public.commercial_payments(payment_date DESC, payment_status);

DROP TRIGGER IF EXISTS trg_commercial_payments_updated_at ON public.commercial_payments;
CREATE TRIGGER trg_commercial_payments_updated_at
  BEFORE UPDATE ON public.commercial_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_user_subscriptions_updated_at();

ALTER TABLE public.commercial_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_payments NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_payments FROM PUBLIC;
REVOKE ALL ON TABLE public.commercial_payments FROM anon;
REVOKE ALL ON TABLE public.commercial_payments FROM authenticated;

-- 8. Trilha de auditoria administrativa (exclusiva do Master)
CREATE TABLE IF NOT EXISTS public.commercial_audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  target_user_id UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('access_request', 'subscription', 'payment')),
  entity_id TEXT NOT NULL,
  action TEXT NOT NULL,
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_commercial_audit_logs_target
  ON public.commercial_audit_logs(target_user_id, created_at DESC);

ALTER TABLE public.commercial_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.commercial_audit_logs NO FORCE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.commercial_audit_logs FROM PUBLIC;
REVOKE ALL ON TABLE public.commercial_audit_logs FROM anon;
REVOKE ALL ON TABLE public.commercial_audit_logs FROM authenticated;

-- 9. Função de verificação de assinatura ativa no servidor
CREATE OR REPLACE FUNCTION public.has_active_subscription(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_uid UUID := (SELECT auth.uid());
  v_jwt_role TEXT := NULLIF(BTRIM(COALESCE(current_setting('request.jwt.claim.role', true), '')), '');
  v_is_privileged_context BOOLEAN := (
    (v_jwt_role = 'service_role' AND v_caller_uid IS NULL)
    OR (
      v_jwt_role IS NULL
      AND v_caller_uid IS NULL
      AND session_user IN ('postgres', 'supabase_admin', 'service_role')
    )
  );
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;

  IF NOT v_is_privileged_context THEN
    -- Usuários comuns (authenticated) só podem consultar o próprio auth.uid();
    -- chamadas anônimas ou consultas sobre UUID de terceiros sempre retornam FALSE.
    IF COALESCE(v_jwt_role, '') <> 'authenticated'
       OR v_caller_uid IS NULL
       OR p_user_id IS DISTINCT FROM v_caller_uid THEN
      RETURN FALSE;
    END IF;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.app_admins a
    WHERE a.user_id = p_user_id
      AND a.is_active = true
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.user_subscriptions s
    WHERE s.user_id = p_user_id
      AND s.status = 'active'
      AND (
        (s.plan_type = 'lifetime' AND s.expires_at IS NULL)
        OR (
          s.plan_type IN ('monthly', 'annual')
          AND s.expires_at IS NOT NULL
          AND s.expires_at > NOW()
        )
      )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.has_active_subscription(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_active_subscription(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.has_active_subscription(UUID) TO authenticated, service_role;

-- 10. Verificação de administrador Master
CREATE OR REPLACE FUNCTION public.is_subscription_admin()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_jwt_role TEXT := NULLIF(BTRIM(COALESCE(current_setting('request.jwt.claim.role', true), '')), '');
BEGIN
  IF v_uid IS NULL OR COALESCE(v_jwt_role, '') <> 'authenticated' THEN
    RETURN FALSE;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.app_admins a
    WHERE a.user_id = v_uid
      AND a.is_active = true
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_subscription_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_subscription_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.is_subscription_admin() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.check_is_subscription_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT public.is_subscription_admin();
$$;

REVOKE ALL ON FUNCTION public.check_is_subscription_admin() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.check_is_subscription_admin() FROM anon;
GRANT EXECUTE ON FUNCTION public.check_is_subscription_admin() TO authenticated;

-- 11. RPC segura para o próprio cliente registrar/atualizar seu perfil mínimo e solicitação pendente
--     Nunca aceita 'lifetime', nunca cria assinatura ativa e impede duplicidade de pendências.
--     IMPORTANTE: p_whatsapp_consent nesta RPC representa exclusivamente a confirmação do
--     redirecionamento voluntário ao WhatsApp para contratação/atendimento (access_requests.whatsapp_redirect_confirmed),
--     NÃO concedendo autorização de marketing/comunicações comerciais (governada pelo Script 06).
CREATE OR REPLACE FUNCTION public.submit_access_request(
  p_full_name TEXT,
  p_whatsapp TEXT,
  p_requested_plan TEXT,
  p_whatsapp_consent BOOLEAN DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_email TEXT;
  v_clean_name TEXT := NULLIF(BTRIM(COALESCE(p_full_name, '')), '');
  v_clean_whatsapp TEXT := NULLIF(BTRIM(COALESCE(p_whatsapp, '')), '');
  v_redirect_confirmed BOOLEAN := COALESCE(p_whatsapp_consent, false);
  v_authoritative_wa_event TEXT := NULL;
  v_marketing_whatsapp_consent BOOLEAN := false;
  v_existing_pending_id UUID;
  v_request_id UUID;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para registrar solicitação.'
      USING ERRCODE = '42501';
  END IF;

  IF p_requested_plan NOT IN ('monthly', 'annual') THEN
    RAISE EXCEPTION 'Plano solicitado inválido. Apenas monthly e annual estão disponíveis para solicitação.'
      USING ERRCODE = '22023';
  END IF;

  IF v_clean_name IS NULL OR char_length(v_clean_name) < 2 THEN
    RAISE EXCEPTION 'Nome completo é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF v_clean_whatsapp IS NULL OR length(regexp_replace(v_clean_whatsapp, '\D', '', 'g')) < 10 THEN
    RAISE EXCEPTION 'WhatsApp com DDD válido é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  SELECT u.email::TEXT INTO v_email FROM auth.users u WHERE u.id = v_uid;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta autenticada inválida.'
      USING ERRCODE = '42501';
  END IF;

  -- Serializa submissões concorrentes do mesmo usuário
  PERFORM pg_advisory_xact_lock(hashtext('access_request:' || v_uid::TEXT));

  -- Se o histórico de eventos do Script 06 existir, espelha apenas seu último evento explícito
  -- (sem dependência circular: Script 01 funciona normalmente caso Script 06 ainda não exista).
  IF to_regclass('public.user_whatsapp_consent_events') IS NOT NULL THEN
    EXECUTE $q$
      SELECT e.event_type
      FROM public.user_whatsapp_consent_events e
      WHERE e.user_id = $1
        AND e.consent_scope = 'commercial_whatsapp_communications'
      ORDER BY e.occurred_at DESC, e.event_seq DESC
      LIMIT 1
    $q$
    INTO v_authoritative_wa_event
    USING v_uid;

    v_marketing_whatsapp_consent := (COALESCE(v_authoritative_wa_event, '') = 'granted');
  END IF;

  INSERT INTO public.customer_profiles (
    user_id, full_name, whatsapp, email, lgpd_whatsapp_consent
  )
  VALUES (
    v_uid, v_clean_name, v_clean_whatsapp, COALESCE(v_email, ''), v_marketing_whatsapp_consent
  )
  ON CONFLICT (user_id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    whatsapp = EXCLUDED.whatsapp,
    email = COALESCE(NULLIF(EXCLUDED.email, ''), public.customer_profiles.email),
    lgpd_whatsapp_consent = v_marketing_whatsapp_consent,
    updated_at = NOW();

  -- Evita duplicidade: reutiliza solicitação pendente existente se houver
  SELECT r.id
  INTO v_existing_pending_id
  FROM public.access_requests r
  WHERE r.user_id = v_uid
    AND r.request_status = 'pending'
  LIMIT 1;

  IF v_existing_pending_id IS NOT NULL THEN
    UPDATE public.access_requests
    SET requested_plan = p_requested_plan,
        whatsapp_redirect_confirmed = v_redirect_confirmed,
        updated_at = NOW()
    WHERE id = v_existing_pending_id
    RETURNING id INTO v_request_id;
  ELSE
    INSERT INTO public.access_requests (
      user_id, requested_plan, request_status, whatsapp_redirect_confirmed
    )
    VALUES (
      v_uid, p_requested_plan, 'pending', v_redirect_confirmed
    )
    RETURNING id INTO v_request_id;
  END IF;

  RETURN jsonb_build_object(
    'request_id', v_request_id,
    'user_id', v_uid,
    'requested_plan', p_requested_plan,
    'request_status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.submit_access_request(TEXT, TEXT, TEXT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_access_request(TEXT, TEXT, TEXT, BOOLEAN) FROM anon;
GRANT EXECUTE ON FUNCTION public.submit_access_request(TEXT, TEXT, TEXT, BOOLEAN) TO authenticated;

-- 12. RPC para o próprio usuário consultar seu perfil e última solicitação
CREATE OR REPLACE FUNCTION public.get_my_commercial_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_profile public.customer_profiles%ROWTYPE;
  v_request public.access_requests%ROWTYPE;
  v_authoritative_wa_event TEXT := NULL;
  v_effective_marketing_consent BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT * INTO v_profile FROM public.customer_profiles p WHERE p.user_id = v_uid;
  SELECT * INTO v_request
  FROM public.access_requests r
  WHERE r.user_id = v_uid
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF to_regclass('public.user_whatsapp_consent_events') IS NOT NULL THEN
    EXECUTE $q$
      SELECT e.event_type
      FROM public.user_whatsapp_consent_events e
      WHERE e.user_id = $1
        AND e.consent_scope = 'commercial_whatsapp_communications'
      ORDER BY e.occurred_at DESC, e.event_seq DESC
      LIMIT 1
    $q$
    INTO v_authoritative_wa_event
    USING v_uid;
  END IF;

  IF v_authoritative_wa_event IS NOT NULL THEN
    v_effective_marketing_consent := (v_authoritative_wa_event = 'granted');
  ELSE
    v_effective_marketing_consent := COALESCE(v_profile.lgpd_whatsapp_consent, false);
  END IF;

  RETURN jsonb_build_object(
    'full_name', v_profile.full_name,
    'whatsapp', v_profile.whatsapp,
    'lgpd_whatsapp_consent', v_effective_marketing_consent,
    'whatsapp_redirect_confirmed', COALESCE(v_request.whatsapp_redirect_confirmed, false),
    'request_id', v_request.id,
    'requested_plan', v_request.requested_plan,
    'request_status', v_request.request_status,
    'request_created_at', v_request.created_at
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_commercial_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_commercial_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_commercial_status() TO authenticated;

-- 13. RPC administrativa: lista completa de clientes, solicitações e assinaturas
--     IMPORTANTE: Nunca consulta public.user_finance_data.
--     Só recria assinatura caso exista versão anterior C1/C2 com retorno incompatível.
DO $$
DECLARE
  v_proc_oid OID := to_regprocedure('public.admin_list_subscriptions(text)');
BEGIN
  IF v_proc_oid IS NOT NULL
     AND pg_get_function_result(v_proc_oid) NOT LIKE '%full_name%' THEN
    DROP FUNCTION public.admin_list_subscriptions(TEXT);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(p_search TEXT DEFAULT NULL)
RETURNS TABLE (
  user_id UUID,
  email TEXT,
  full_name TEXT,
  whatsapp TEXT,
  user_created_at TIMESTAMPTZ,
  requested_plan TEXT,
  request_status TEXT,
  request_created_at TIMESTAMPTZ,
  plan_type TEXT,
  status TEXT,
  starts_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  notes TEXT,
  updated_at TIMESTAMPTZ,
  is_effectively_active BOOLEAN
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_search TEXT := NULLIF(BTRIM(COALESCE(p_search, '')), '');
BEGIN
  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'Acesso negado: privilégio administrativo obrigatório.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    u.id AS user_id,
    u.email::TEXT AS email,
    COALESCE(cp.full_name, NULLIF(u.raw_user_meta_data->>'full_name', ''), split_part(u.email, '@', 1))::TEXT AS full_name,
    COALESCE(cp.whatsapp, NULLIF(u.raw_user_meta_data->>'whatsapp', ''))::TEXT AS whatsapp,
    u.created_at AS user_created_at,
    ar.requested_plan::TEXT AS requested_plan,
    ar.request_status::TEXT AS request_status,
    ar.created_at AS request_created_at,
    s.plan_type::TEXT AS plan_type,
    s.status::TEXT AS status,
    s.starts_at AS starts_at,
    s.expires_at AS expires_at,
    s.notes::TEXT AS notes,
    s.updated_at AS updated_at,
    (
      s.user_id IS NOT NULL
      AND s.status = 'active'
      AND (
        (s.plan_type = 'lifetime' AND s.expires_at IS NULL)
        OR (s.plan_type IN ('monthly', 'annual') AND s.expires_at IS NOT NULL AND s.expires_at > NOW())
      )
    ) AS is_effectively_active
  FROM auth.users u
  LEFT JOIN public.customer_profiles cp ON cp.user_id = u.id
  LEFT JOIN public.user_subscriptions s ON s.user_id = u.id
  LEFT JOIN LATERAL (
    SELECT r.requested_plan, r.request_status, r.created_at
    FROM public.access_requests r
    WHERE r.user_id = u.id
    ORDER BY r.created_at DESC
    LIMIT 1
  ) ar ON true
  WHERE (
    v_search IS NULL
    OR u.email ILIKE '%' || v_search || '%'
    OR u.id::TEXT ILIKE '%' || v_search || '%'
    OR COALESCE(cp.full_name, '') ILIKE '%' || v_search || '%'
    OR COALESCE(cp.whatsapp, '') ILIKE '%' || v_search || '%'
  )
  ORDER BY
    CASE WHEN ar.request_status = 'pending' THEN 0 ELSE 1 END,
    u.created_at DESC
  LIMIT 300;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_subscriptions(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_subscriptions(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_subscriptions(TEXT) TO authenticated;

-- 14. RPC administrativa: ativar, renovar, conceder Vitalício Especial, suspender, cancelar, expirar ou recusar solicitação
CREATE OR REPLACE FUNCTION public.admin_manage_subscription(
  p_target_user_id UUID,
  p_action TEXT,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.user_subscriptions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_uid UUID := (SELECT auth.uid());
  v_existing public.user_subscriptions%ROWTYPE;
  v_result public.user_subscriptions%ROWTYPE;
  v_new_expires_at TIMESTAMPTZ;
  v_clean_notes TEXT := NULLIF(BTRIM(COALESCE(p_notes, '')), '');
BEGIN
  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'Acesso negado: privilégio administrativo obrigatório.'
      USING ERRCODE = '42501';
  END IF;

  IF p_target_user_id IS NULL THEN
    RAISE EXCEPTION 'UUID do usuário alvo é obrigatório.'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_target_user_id) THEN
    RAISE EXCEPTION 'Usuário alvo não encontrado em auth.users.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_action NOT IN (
    'activate_monthly',
    'renew_monthly',
    'activate_annual',
    'renew_annual',
    'activate_lifetime',
    'suspend',
    'cancel',
    'expire',
    'reject_request'
  ) THEN
    RAISE EXCEPTION 'Ação administrativa inválida: %', p_action
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_existing
  FROM public.user_subscriptions s
  WHERE s.user_id = p_target_user_id;

  IF p_action = 'reject_request' THEN
    UPDATE public.access_requests
    SET request_status = 'rejected',
        admin_notes = COALESCE(v_clean_notes, admin_notes),
        reviewed_by = v_admin_uid,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_target_user_id
      AND request_status = 'pending';

    INSERT INTO public.commercial_audit_logs (actor_user_id, target_user_id, entity_type, entity_id, action, details)
    VALUES (
      v_admin_uid,
      p_target_user_id,
      'access_request',
      p_target_user_id::TEXT,
      'reject_request',
      jsonb_build_object('notes', v_clean_notes)
    );

    RETURN v_existing;
  END IF;

  IF p_action = 'activate_monthly' THEN
    v_new_expires_at := NOW() + INTERVAL '30 days';

    INSERT INTO public.user_subscriptions (
      user_id, plan_type, status, starts_at, expires_at, notes, updated_by
    )
    VALUES (
      p_target_user_id, 'monthly', 'active', NOW(), v_new_expires_at, v_clean_notes, v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan_type = 'monthly',
      status = 'active',
      starts_at = NOW(),
      expires_at = EXCLUDED.expires_at,
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;

  ELSIF p_action = 'renew_monthly' THEN
    IF v_existing.user_id IS NOT NULL
       AND v_existing.status = 'active'
       AND v_existing.plan_type IN ('monthly', 'annual')
       AND v_existing.expires_at IS NOT NULL
       AND v_existing.expires_at > NOW() THEN
      v_new_expires_at := v_existing.expires_at + INTERVAL '30 days';
    ELSE
      v_new_expires_at := NOW() + INTERVAL '30 days';
    END IF;

    INSERT INTO public.user_subscriptions (
      user_id, plan_type, status, starts_at, expires_at, notes, updated_by
    )
    VALUES (
      p_target_user_id, 'monthly', 'active', NOW(), v_new_expires_at, v_clean_notes, v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan_type = 'monthly',
      status = 'active',
      expires_at = v_new_expires_at,
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;

  ELSIF p_action = 'activate_annual' THEN
    v_new_expires_at := NOW() + INTERVAL '12 months';

    INSERT INTO public.user_subscriptions (
      user_id, plan_type, status, starts_at, expires_at, notes, updated_by
    )
    VALUES (
      p_target_user_id, 'annual', 'active', NOW(), v_new_expires_at, v_clean_notes, v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan_type = 'annual',
      status = 'active',
      starts_at = NOW(),
      expires_at = EXCLUDED.expires_at,
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;

  ELSIF p_action = 'renew_annual' THEN
    IF v_existing.user_id IS NOT NULL
       AND v_existing.status = 'active'
       AND v_existing.plan_type IN ('monthly', 'annual')
       AND v_existing.expires_at IS NOT NULL
       AND v_existing.expires_at > NOW() THEN
      v_new_expires_at := v_existing.expires_at + INTERVAL '12 months';
    ELSE
      v_new_expires_at := NOW() + INTERVAL '12 months';
    END IF;

    INSERT INTO public.user_subscriptions (
      user_id, plan_type, status, starts_at, expires_at, notes, updated_by
    )
    VALUES (
      p_target_user_id, 'annual', 'active', NOW(), v_new_expires_at, v_clean_notes, v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan_type = 'annual',
      status = 'active',
      expires_at = v_new_expires_at,
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;

  ELSIF p_action = 'activate_lifetime' THEN
    -- Modalidade VITALÍCIO ESPECIAL: exclusiva do administrador Master, sem vencimento periódico
    INSERT INTO public.user_subscriptions (
      user_id, plan_type, status, starts_at, expires_at, notes, updated_by
    )
    VALUES (
      p_target_user_id, 'lifetime', 'active', NOW(), NULL, v_clean_notes, v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan_type = 'lifetime',
      status = 'active',
      starts_at = NOW(),
      expires_at = NULL,
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;

  ELSIF p_action = 'suspend' THEN
    INSERT INTO public.user_subscriptions (
      user_id,
      plan_type,
      status,
      starts_at,
      expires_at,
      notes,
      updated_by
    )
    VALUES (
      p_target_user_id,
      COALESCE(v_existing.plan_type, 'monthly'),
      'suspended',
      NOW(),
      CASE
        WHEN COALESCE(v_existing.plan_type, 'monthly') = 'lifetime' THEN NULL
        ELSE COALESCE(v_existing.expires_at, NOW())
      END,
      v_clean_notes,
      v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'suspended',
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;

  ELSIF p_action = 'cancel' THEN
    INSERT INTO public.user_subscriptions (
      user_id,
      plan_type,
      status,
      starts_at,
      expires_at,
      notes,
      updated_by
    )
    VALUES (
      p_target_user_id,
      COALESCE(v_existing.plan_type, 'monthly'),
      'canceled',
      NOW(),
      CASE
        WHEN COALESCE(v_existing.plan_type, 'monthly') = 'lifetime' THEN NULL
        ELSE COALESCE(v_existing.expires_at, NOW())
      END,
      v_clean_notes,
      v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      status = 'canceled',
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;

  ELSIF p_action = 'expire' THEN
    INSERT INTO public.user_subscriptions (
      user_id, plan_type, status, starts_at, expires_at, notes, updated_by
    )
    VALUES (
      p_target_user_id,
      CASE WHEN v_existing.plan_type = 'lifetime' THEN 'monthly' ELSE COALESCE(v_existing.plan_type, 'monthly') END,
      'expired',
      NOW(),
      NOW() - INTERVAL '1 second',
      v_clean_notes,
      v_admin_uid
    )
    ON CONFLICT (user_id) DO UPDATE SET
      plan_type = CASE WHEN public.user_subscriptions.plan_type = 'lifetime' THEN 'monthly' ELSE public.user_subscriptions.plan_type END,
      status = 'expired',
      expires_at = LEAST(COALESCE(public.user_subscriptions.expires_at, NOW() - INTERVAL '1 second'), NOW() - INTERVAL '1 second'),
      notes = COALESCE(EXCLUDED.notes, public.user_subscriptions.notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
    RETURNING * INTO v_result;
  END IF;

  -- Aprovar automaticamente solicitações pendentes quando o administrador ativa o acesso
  IF p_action IN ('activate_monthly', 'renew_monthly', 'activate_annual', 'renew_annual', 'activate_lifetime') THEN
    UPDATE public.access_requests
    SET request_status = 'approved',
        admin_notes = COALESCE(v_clean_notes, admin_notes),
        reviewed_by = v_admin_uid,
        reviewed_at = NOW(),
        updated_at = NOW()
    WHERE user_id = p_target_user_id
      AND request_status = 'pending';
  END IF;

  INSERT INTO public.commercial_audit_logs (actor_user_id, target_user_id, entity_type, entity_id, action, details)
  VALUES (
    v_admin_uid,
    p_target_user_id,
    'subscription',
    p_target_user_id::TEXT,
    p_action,
    jsonb_build_object(
      'plan_type', v_result.plan_type,
      'status', v_result.status,
      'expires_at', v_result.expires_at,
      'notes', v_clean_notes
    )
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_manage_subscription(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_manage_subscription(UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_manage_subscription(UUID, TEXT, TEXT) TO authenticated;

-- 15. RPC administrativa: histórico comercial detalhado do cliente (sem dados financeiros pessoais)
CREATE OR REPLACE FUNCTION public.admin_get_customer_commercial_history(p_target_user_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_requests JSONB;
  v_payments JSONB;
  v_logs JSONB;
BEGIN
  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'Acesso negado: privilégio administrativo obrigatório.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(r) ORDER BY r.created_at DESC), '[]'::JSONB)
  INTO v_requests
  FROM public.access_requests r
  WHERE r.user_id = p_target_user_id;

  SELECT COALESCE(jsonb_agg(row_to_json(p) ORDER BY p.payment_date DESC, p.created_at DESC), '[]'::JSONB)
  INTO v_payments
  FROM public.commercial_payments p
  WHERE p.customer_user_id = p_target_user_id;

  SELECT COALESCE(jsonb_agg(row_to_json(l) ORDER BY l.created_at DESC), '[]'::JSONB)
  INTO v_logs
  FROM (
    SELECT id, action, entity_type, details, created_at
    FROM public.commercial_audit_logs
    WHERE target_user_id = p_target_user_id
    ORDER BY created_at DESC
    LIMIT 50
  ) l;

  RETURN jsonb_build_object(
    'requests', v_requests,
    'payments', v_payments,
    'audit_logs', v_logs
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_customer_commercial_history(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_customer_commercial_history(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_customer_commercial_history(UUID) TO authenticated;

-- 16. RPCs administrativas de Faturamento Comercial (somente Master)
CREATE OR REPLACE FUNCTION public.admin_list_commercial_payments(
  p_status TEXT DEFAULT NULL,
  p_search TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  customer_user_id UUID,
  customer_name TEXT,
  customer_email TEXT,
  subscription_plan TEXT,
  amount_cents BIGINT,
  payment_date DATE,
  payment_method TEXT,
  payment_status TEXT,
  reference_code TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_search TEXT := NULLIF(BTRIM(COALESCE(p_search, '')), '');
  v_status TEXT := NULLIF(BTRIM(COALESCE(p_status, '')), '');
BEGIN
  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'Acesso negado: privilégio administrativo obrigatório.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    p.id,
    p.customer_user_id,
    COALESCE(cp.full_name, split_part(u.email, '@', 1))::TEXT AS customer_name,
    u.email::TEXT AS customer_email,
    p.subscription_plan::TEXT,
    p.amount_cents,
    p.payment_date,
    p.payment_method::TEXT,
    p.payment_status::TEXT,
    p.reference_code::TEXT,
    p.notes::TEXT,
    p.created_at,
    p.updated_at
  FROM public.commercial_payments p
  INNER JOIN auth.users u ON u.id = p.customer_user_id
  LEFT JOIN public.customer_profiles cp ON cp.user_id = p.customer_user_id
  WHERE (v_status IS NULL OR p.payment_status = v_status)
    AND (
      v_search IS NULL
      OR u.email ILIKE '%' || v_search || '%'
      OR COALESCE(cp.full_name, '') ILIKE '%' || v_search || '%'
      OR COALESCE(p.reference_code, '') ILIKE '%' || v_search || '%'
    )
  ORDER BY p.payment_date DESC, p.created_at DESC
  LIMIT 300;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_list_commercial_payments(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_list_commercial_payments(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_list_commercial_payments(TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_record_commercial_payment(
  p_customer_user_id UUID,
  p_subscription_plan TEXT,
  p_amount_cents BIGINT,
  p_payment_date DATE,
  p_payment_method TEXT,
  p_payment_status TEXT DEFAULT 'confirmed',
  p_reference_code TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.commercial_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_uid UUID := (SELECT auth.uid());
  v_clean_ref TEXT := NULLIF(BTRIM(COALESCE(p_reference_code, '')), '');
  v_clean_notes TEXT := NULLIF(BTRIM(COALESCE(p_notes, '')), '');
  v_inserted public.commercial_payments%ROWTYPE;
BEGIN
  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'Acesso negado: privilégio administrativo obrigatório.'
      USING ERRCODE = '42501';
  END IF;

  IF p_customer_user_id IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p_customer_user_id) THEN
    RAISE EXCEPTION 'Cliente informado não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_subscription_plan NOT IN ('monthly', 'annual', 'lifetime') THEN
    RAISE EXCEPTION 'Plano de faturamento inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount_cents IS NULL OR p_amount_cents < 0 THEN
    RAISE EXCEPTION 'Valor recebido inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_method NOT IN ('pix', 'credit_card', 'debit_card', 'bank_transfer', 'cash', 'other') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_status NOT IN ('pending', 'confirmed', 'canceled') THEN
    RAISE EXCEPTION 'Situação de pagamento inválida.'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa gravações de pagamento do mesmo cliente na transação para impedir corrida
  -- em chamadas concorrentes, especialmente quando reference_code estiver ausente (NULL).
  PERFORM pg_advisory_xact_lock(hashtext('commercial_payment:' || p_customer_user_id::TEXT));

  -- Prevenção de duplicidade explícita (com ou sem reference_code), preservando pagamentos legítimos distintos
  IF p_payment_status <> 'canceled' AND EXISTS (
    SELECT 1
    FROM public.commercial_payments cp
    WHERE cp.customer_user_id = p_customer_user_id
      AND cp.subscription_plan = p_subscription_plan
      AND cp.payment_date = p_payment_date
      AND cp.amount_cents = p_amount_cents
      AND cp.payment_method = p_payment_method
      AND cp.payment_status <> 'canceled'
      AND (
        (v_clean_ref IS NULL AND cp.reference_code IS NULL)
        OR (v_clean_ref IS NOT NULL AND cp.reference_code = v_clean_ref)
      )
  ) THEN
    RAISE EXCEPTION 'Registro duplicado detectado para este cliente, plano, data, método e valor.'
      USING ERRCODE = '23505';
  END IF;

  INSERT INTO public.commercial_payments (
    customer_user_id,
    subscription_plan,
    amount_cents,
    payment_date,
    payment_method,
    payment_status,
    reference_code,
    notes,
    created_by,
    updated_by
  )
  VALUES (
    p_customer_user_id,
    p_subscription_plan,
    p_amount_cents,
    p_payment_date,
    p_payment_method,
    p_payment_status,
    v_clean_ref,
    v_clean_notes,
    v_admin_uid,
    v_admin_uid
  )
  RETURNING * INTO v_inserted;

  INSERT INTO public.commercial_audit_logs (actor_user_id, target_user_id, entity_type, entity_id, action, details)
  VALUES (
    v_admin_uid,
    p_customer_user_id,
    'payment',
    v_inserted.id::TEXT,
    'record_payment',
    jsonb_build_object(
      'plan', v_inserted.subscription_plan,
      'amount_cents', v_inserted.amount_cents,
      'payment_date', v_inserted.payment_date,
      'payment_method', v_inserted.payment_method,
      'payment_status', v_inserted.payment_status,
      'reference_code', v_inserted.reference_code
    )
  );

  RETURN v_inserted;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_record_commercial_payment(UUID, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_record_commercial_payment(UUID, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_record_commercial_payment(UUID, TEXT, BIGINT, DATE, TEXT, TEXT, TEXT, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.admin_update_commercial_payment(
  p_payment_id UUID,
  p_payment_status TEXT,
  p_amount_cents BIGINT DEFAULT NULL,
  p_payment_date DATE DEFAULT NULL,
  p_payment_method TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS public.commercial_payments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_admin_uid UUID := (SELECT auth.uid());
  v_before public.commercial_payments%ROWTYPE;
  v_after public.commercial_payments%ROWTYPE;
BEGIN
  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'Acesso negado: privilégio administrativo obrigatório.'
      USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_before FROM public.commercial_payments WHERE id = p_payment_id;
  IF v_before.id IS NULL THEN
    RAISE EXCEPTION 'Pagamento não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF p_payment_status NOT IN ('pending', 'confirmed', 'canceled') THEN
    RAISE EXCEPTION 'Situação de pagamento inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF p_amount_cents IS NOT NULL AND p_amount_cents < 0 THEN
    RAISE EXCEPTION 'Valor inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_payment_method IS NOT NULL AND p_payment_method NOT IN ('pix', 'credit_card', 'debit_card', 'bank_transfer', 'cash', 'other') THEN
    RAISE EXCEPTION 'Forma de pagamento inválida.'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa alterações concorrentes do mesmo cliente contra inserções/reativações duplicadas
  PERFORM pg_advisory_xact_lock(hashtext('commercial_payment:' || v_before.customer_user_id::TEXT));

  UPDATE public.commercial_payments
  SET payment_status = p_payment_status,
      amount_cents = COALESCE(p_amount_cents, amount_cents),
      payment_date = COALESCE(p_payment_date, payment_date),
      payment_method = COALESCE(p_payment_method, payment_method),
      notes = COALESCE(NULLIF(BTRIM(COALESCE(p_notes, '')), ''), notes),
      updated_by = v_admin_uid,
      updated_at = NOW()
  WHERE id = p_payment_id
  RETURNING * INTO v_after;

  INSERT INTO public.commercial_audit_logs (actor_user_id, target_user_id, entity_type, entity_id, action, details)
  VALUES (
    v_admin_uid,
    v_after.customer_user_id,
    'payment',
    v_after.id::TEXT,
    'update_payment',
    jsonb_build_object(
      'previous_status', v_before.payment_status,
      'new_status', v_after.payment_status,
      'previous_amount_cents', v_before.amount_cents,
      'new_amount_cents', v_after.amount_cents,
      'notes', v_after.notes
    )
  );

  RETURN v_after;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_update_commercial_payment(UUID, TEXT, BIGINT, DATE, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_update_commercial_payment(UUID, TEXT, BIGINT, DATE, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_update_commercial_payment(UUID, TEXT, BIGINT, DATE, TEXT, TEXT) TO authenticated;

-- 17. RPC administrativa: métricas consolidadas do Dashboard Master
CREATE OR REPLACE FUNCTION public.admin_get_master_dashboard_metrics()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_month_start DATE := date_trunc('month', (NOW() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
  v_year_start DATE := date_trunc('year', (NOW() AT TIME ZONE 'America/Sao_Paulo'))::DATE;
  v_monthly_revenue_cents BIGINT;
  v_ytd_revenue_cents BIGINT;
  v_total_customers INT;
  v_active_subscriptions INT;
  v_pending_requests INT;
  v_expiring_soon INT;
  v_expired_subscriptions INT;
  v_active_lifetime INT;
  v_monthly_active INT;
  v_annual_active INT;
  v_sales_by_plan JSONB;
  v_monthly_revenue_series JSONB;
  v_new_customers_series JSONB;
BEGIN
  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'Acesso negado: privilégio administrativo obrigatório.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_monthly_revenue_cents
  FROM public.commercial_payments
  WHERE payment_status = 'confirmed'
    AND payment_date >= v_month_start
    AND payment_date < (v_month_start + INTERVAL '1 month')::DATE;

  SELECT COALESCE(SUM(amount_cents), 0) INTO v_ytd_revenue_cents
  FROM public.commercial_payments
  WHERE payment_status = 'confirmed'
    AND payment_date >= v_year_start
    AND payment_date < (v_year_start + INTERVAL '1 year')::DATE;

  SELECT COUNT(*) INTO v_total_customers FROM auth.users;

  SELECT COUNT(*) INTO v_active_subscriptions
  FROM public.user_subscriptions s
  WHERE s.status = 'active'
    AND (
      (s.plan_type = 'lifetime' AND s.expires_at IS NULL)
      OR (s.plan_type IN ('monthly', 'annual') AND s.expires_at IS NOT NULL AND s.expires_at > NOW())
    );

  SELECT COUNT(*) INTO v_monthly_active
  FROM public.user_subscriptions s
  WHERE s.status = 'active' AND s.plan_type = 'monthly' AND s.expires_at > NOW();

  SELECT COUNT(*) INTO v_annual_active
  FROM public.user_subscriptions s
  WHERE s.status = 'active' AND s.plan_type = 'annual' AND s.expires_at > NOW();

  SELECT COUNT(*) INTO v_active_lifetime
  FROM public.user_subscriptions s
  WHERE s.status = 'active' AND s.plan_type = 'lifetime' AND s.expires_at IS NULL;

  SELECT COUNT(*) INTO v_pending_requests
  FROM public.access_requests r
  WHERE r.request_status = 'pending';

  SELECT COUNT(*) INTO v_expiring_soon
  FROM public.user_subscriptions s
  WHERE s.status = 'active'
    AND s.plan_type IN ('monthly', 'annual')
    AND s.expires_at > NOW()
    AND s.expires_at <= NOW() + INTERVAL '7 days';

  SELECT COUNT(*) INTO v_expired_subscriptions
  FROM public.user_subscriptions s
  WHERE s.status = 'expired'
     OR (s.status = 'active' AND s.plan_type IN ('monthly', 'annual') AND s.expires_at <= NOW());

  SELECT jsonb_build_object(
    'monthly', COALESCE(COUNT(*) FILTER (WHERE subscription_plan = 'monthly' AND payment_status = 'confirmed' AND amount_cents > 0), 0),
    'annual', COALESCE(COUNT(*) FILTER (WHERE subscription_plan = 'annual' AND payment_status = 'confirmed' AND amount_cents > 0), 0),
    'lifetime', COALESCE(COUNT(*) FILTER (WHERE subscription_plan = 'lifetime' AND payment_status = 'confirmed' AND amount_cents > 0), 0)
  )
  INTO v_sales_by_plan
  FROM public.commercial_payments;

  SELECT COALESCE(jsonb_agg(row_to_json(m) ORDER BY m.month_key ASC), '[]'::JSONB)
  INTO v_monthly_revenue_series
  FROM (
    SELECT
      to_char(gs.m::DATE, 'YYYY-MM') AS month_key,
      COALESCE(SUM(cp.amount_cents), 0) AS revenue_cents
    FROM generate_series(
      (v_month_start - INTERVAL '5 months')::DATE,
      v_month_start,
      INTERVAL '1 month'
    ) AS gs(m)
    LEFT JOIN public.commercial_payments cp
      ON cp.payment_status = 'confirmed'
      AND cp.payment_date >= gs.m::DATE
      AND cp.payment_date < (gs.m::DATE + INTERVAL '1 month')::DATE
    GROUP BY gs.m::DATE
  ) m;

  SELECT COALESCE(jsonb_agg(row_to_json(c) ORDER BY c.month_key ASC), '[]'::JSONB)
  INTO v_new_customers_series
  FROM (
    SELECT
      to_char(gs.m::DATE, 'YYYY-MM') AS month_key,
      COALESCE(COUNT(u.id), 0) AS customers_count
    FROM generate_series(
      (v_month_start - INTERVAL '5 months')::DATE,
      v_month_start,
      INTERVAL '1 month'
    ) AS gs(m)
    LEFT JOIN auth.users u
      ON (u.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE >= gs.m::DATE
      AND (u.created_at AT TIME ZONE 'America/Sao_Paulo')::DATE < (gs.m::DATE + INTERVAL '1 month')::DATE
    GROUP BY gs.m::DATE
  ) c;

  RETURN jsonb_build_object(
    'monthly_revenue_cents', v_monthly_revenue_cents,
    'ytd_revenue_cents', v_ytd_revenue_cents,
    'total_customers', v_total_customers,
    'active_subscriptions', v_active_subscriptions,
    'pending_requests', v_pending_requests,
    'expiring_soon', v_expiring_soon,
    'expired_subscriptions', v_expired_subscriptions,
    'active_lifetime', v_active_lifetime,
    'plan_distribution', jsonb_build_object(
      'monthly', v_monthly_active,
      'annual', v_annual_active,
      'lifetime', v_active_lifetime
    ),
    'sales_by_plan', v_sales_by_plan,
    'monthly_revenue_series', v_monthly_revenue_series,
    'new_customers_series', v_new_customers_series
  );
END;
$$;

REVOKE ALL ON FUNCTION public.admin_get_master_dashboard_metrics() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_get_master_dashboard_metrics() FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_get_master_dashboard_metrics() TO authenticated;

COMMIT;
