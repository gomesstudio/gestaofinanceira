-- ==============================================================================
-- GESTÃO FINANCEIRA PRO — FASE 2.4.1 (SCRIPT 06 REVISADO — PREPARADO, NÃO EXECUTADO)
-- Versionamento de Documentos Jurídicos, Histórico Imutável de Aceite e
-- Eventos Imutáveis de Consentimento Comercial Opcional (WhatsApp / LGPD)
--
-- CORREÇÕES DE SEGURANÇA E INTEGRIDADE APLICADAS NA FASE 2.4.1:
--   1. Consentimento opcional do WhatsApp via eventos imutáveis (granted/revoked),
--      permitindo concessão, revogação sem novo aceite contratual, histórico
--      completo e impossibilidade de caixa desmarcada revogar tacitamente.
--   2. FK composta (document_id, version, content_sha256) garantindo vínculo
--      exato entre cada registro e a versão/hash publicados; trigger impedindo
--      alteração/exclusão de versões publicadas; carga inicial com verificação
--      estrita de hash (aborta em caso de divergência, sem ON CONFLICT DO NOTHING).
--   3. Exclusão de conta compatível com ON DELETE CASCADE quando legitimamente
--      removida de auth.users e sem obrigação de retenção comercial, bloqueando
--      exclusão por usuários comuns e exclusões administrativas indevidas.
--   4. Auditoria completa de SECURITY DEFINER, proprietário, search_path,
--      auth.uid() exclusivo, advisory lock por usuário para concorrência e
--      REVOKE/GRANT estritos.
--
-- SEGURANÇA E INDEPENDÊNCIA:
--   - Script 100% independente dos scripts comerciais 01–05 (não altera seus objetos).
--   - NÃO modifica public.user_finance_data nem altera suas políticas RLS.
--   - NÃO executa alterações automáticas no banco ao ser salvo no repositório.
-- ==============================================================================

BEGIN;

-- 1. Função auxiliar isolada de updated_at (sem depender dos scripts comerciais)
CREATE OR REPLACE FUNCTION public.fn_set_legal_updated_at()
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

REVOKE ALL ON FUNCTION public.fn_set_legal_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_set_legal_updated_at() FROM anon;
REVOKE ALL ON FUNCTION public.fn_set_legal_updated_at() FROM authenticated;

-- 2. Tabela de versionamento dos documentos jurídicos publicados
--    Mantemos NO FORCE ROW LEVEL SECURITY para compatibilidade com RPCs SECURITY DEFINER
--    criadas pelo proprietário padrão dos objetos no Supabase.
CREATE TABLE IF NOT EXISTS public.legal_document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id TEXT NOT NULL CHECK (document_id IN ('terms_of_use', 'privacy_policy')),
  version TEXT NOT NULL CHECK (char_length(BTRIM(version)) > 0),
  content_sha256 TEXT NOT NULL CHECK (content_sha256 ~ '^[a-f0-9]{64}$'),
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active BOOLEAN NOT NULL DEFAULT true,
  requires_reacceptance BOOLEAN NOT NULL DEFAULT true,
  summary_of_changes TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT uq_legal_document_versions_doc_ver UNIQUE (document_id, version),
  CONSTRAINT uq_legal_document_versions_doc_ver_hash UNIQUE (document_id, version, content_sha256)
);

-- Garante no máximo uma versão ativa por tipo de documento
CREATE UNIQUE INDEX IF NOT EXISTS idx_legal_document_versions_one_active
  ON public.legal_document_versions(document_id)
  WHERE is_active = true;

DROP TRIGGER IF EXISTS trg_legal_document_versions_updated_at ON public.legal_document_versions;
CREATE TRIGGER trg_legal_document_versions_updated_at
  BEFORE UPDATE ON public.legal_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_set_legal_updated_at();

-- Proteção contra alteração indevida de versão, conteúdo/hash ou exclusão de versão publicada.
-- Permite exclusivamente desativar uma versão vigente (is_active: true -> false) ao publicar versão sucessora.
CREATE OR REPLACE FUNCTION public.fn_protect_published_legal_document_versions()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Versões publicadas de documentos jurídicos não podem ser excluídas.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.id IS DISTINCT FROM OLD.id
       OR NEW.document_id IS DISTINCT FROM OLD.document_id
       OR NEW.version IS DISTINCT FROM OLD.version
       OR NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256
       OR NEW.published_at IS DISTINCT FROM OLD.published_at
       OR NEW.requires_reacceptance IS DISTINCT FROM OLD.requires_reacceptance
       OR NEW.summary_of_changes IS DISTINCT FROM OLD.summary_of_changes
       OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
      RAISE EXCEPTION 'Versão publicada de documento jurídico é imutável; não é permitido alterar versão, hash ou metadados históricos.'
        USING ERRCODE = '42501';
    END IF;

    IF OLD.is_active = false AND NEW.is_active = true THEN
      RAISE EXCEPTION 'Não é permitido reativar versão histórica já encerrada; publique uma nova versão.'
        USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_protect_published_legal_document_versions() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_protect_published_legal_document_versions() FROM anon;
REVOKE ALL ON FUNCTION public.fn_protect_published_legal_document_versions() FROM authenticated;

DROP TRIGGER IF EXISTS trg_protect_published_legal_document_versions ON public.legal_document_versions;
CREATE TRIGGER trg_protect_published_legal_document_versions
  BEFORE UPDATE OR DELETE ON public.legal_document_versions
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_protect_published_legal_document_versions();

ALTER TABLE public.legal_document_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_document_versions NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "legal_document_versions_select_authenticated" ON public.legal_document_versions;

REVOKE ALL ON TABLE public.legal_document_versions FROM PUBLIC;
REVOKE ALL ON TABLE public.legal_document_versions FROM anon;
REVOKE ALL ON TABLE public.legal_document_versions FROM authenticated;

-- Usuários autenticados podem apenas consultar versões publicadas; escrita é restrita ao administrador SQL
GRANT SELECT ON TABLE public.legal_document_versions TO authenticated;

CREATE POLICY "legal_document_versions_select_authenticated"
  ON public.legal_document_versions
  FOR SELECT
  TO authenticated
  USING (true);

-- 3. Tabela de histórico imutável (append-only) de aceites contratuais e ciências por usuário
--    Minimização LGPD: NÃO armazena IP, localização geográfica, user_agent ou fingerprint.
CREATE TABLE IF NOT EXISTS public.user_legal_acceptances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id TEXT NOT NULL CHECK (document_id IN ('terms_of_use', 'privacy_policy')),
  document_version TEXT NOT NULL,
  document_hash TEXT NOT NULL CHECK (document_hash ~ '^[a-f0-9]{64}$'),
  acceptance_kind TEXT NOT NULL CHECK (
    acceptance_kind IN (
      'contractual_terms_acceptance',
      'privacy_policy_acknowledgment',
      'optional_commercial_whatsapp_consent'
    )
  ),
  is_legacy_transition BOOLEAN NOT NULL DEFAULT false,
  acceptance_source TEXT NOT NULL DEFAULT 'legal_consent_gate' CHECK (
    acceptance_source IN ('legal_consent_gate', 'reacceptance_prompt', 'settings_privacy_panel')
  ),
  accepted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_user_legal_acceptances_doc_matches_kind CHECK (
    (acceptance_kind = 'contractual_terms_acceptance' AND document_id = 'terms_of_use')
    OR (
      acceptance_kind IN ('privacy_policy_acknowledgment', 'optional_commercial_whatsapp_consent')
      AND document_id = 'privacy_policy'
    )
  ),
  CONSTRAINT fk_user_legal_acceptances_doc_ver_hash
    FOREIGN KEY (document_id, document_version, document_hash)
    REFERENCES public.legal_document_versions(document_id, version, content_sha256)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT,
  CONSTRAINT uq_user_legal_acceptances_per_version_kind
    UNIQUE (user_id, document_id, document_version, acceptance_kind)
);

CREATE INDEX IF NOT EXISTS idx_user_legal_acceptances_user_accepted_at
  ON public.user_legal_acceptances(user_id, accepted_at DESC);

ALTER TABLE public.user_legal_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_legal_acceptances NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_legal_acceptances_select_own" ON public.user_legal_acceptances;

REVOKE ALL ON TABLE public.user_legal_acceptances FROM PUBLIC;
REVOKE ALL ON TABLE public.user_legal_acceptances FROM anon;
REVOKE ALL ON TABLE public.user_legal_acceptances FROM authenticated;

-- Usuário autenticado pode apenas ler o próprio histórico; gravação ocorre exclusivamente via RPC validada
GRANT SELECT ON TABLE public.user_legal_acceptances TO authenticated;

CREATE POLICY "user_legal_acceptances_select_own"
  ON public.user_legal_acceptances
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 4. Tabela de eventos imutáveis (append-only) de consentimento opcional para comunicações
--    comerciais via WhatsApp (concessão e revogação).
--    IMPORTANTE: Não se confunde com o ato voluntário do usuário de clicar em links externos wa.me.
CREATE TABLE IF NOT EXISTS public.user_whatsapp_consent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_seq BIGINT GENERATED ALWAYS AS IDENTITY NOT NULL UNIQUE,
  user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  consent_scope TEXT NOT NULL DEFAULT 'commercial_whatsapp_communications' CHECK (
    consent_scope = 'commercial_whatsapp_communications'
  ),
  event_type TEXT NOT NULL CHECK (event_type IN ('granted', 'revoked')),
  document_id TEXT NOT NULL DEFAULT 'privacy_policy' CHECK (document_id = 'privacy_policy'),
  privacy_policy_version TEXT NOT NULL,
  privacy_policy_hash TEXT NOT NULL CHECK (privacy_policy_hash ~ '^[a-f0-9]{64}$'),
  event_source TEXT NOT NULL DEFAULT 'legal_consent_gate' CHECK (
    event_source IN (
      'legal_consent_gate',
      'reacceptance_prompt',
      'settings_privacy_panel',
      'explicit_whatsapp_toggle'
    )
  ),
  explicit_user_action BOOLEAN NOT NULL DEFAULT true CHECK (explicit_user_action = true),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT fk_user_whatsapp_consent_privacy_ver_hash
    FOREIGN KEY (document_id, privacy_policy_version, privacy_policy_hash)
    REFERENCES public.legal_document_versions(document_id, version, content_sha256)
    ON UPDATE RESTRICT
    ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_user_whatsapp_consent_events_user_latest
  ON public.user_whatsapp_consent_events(user_id, occurred_at DESC, event_seq DESC);

ALTER TABLE public.user_whatsapp_consent_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_whatsapp_consent_events NO FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "user_whatsapp_consent_events_select_own" ON public.user_whatsapp_consent_events;

REVOKE ALL ON TABLE public.user_whatsapp_consent_events FROM PUBLIC;
REVOKE ALL ON TABLE public.user_whatsapp_consent_events FROM anon;
REVOKE ALL ON TABLE public.user_whatsapp_consent_events FROM authenticated;

GRANT SELECT ON TABLE public.user_whatsapp_consent_events TO authenticated;

CREATE POLICY "user_whatsapp_consent_events_select_own"
  ON public.user_whatsapp_consent_events
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 5. Proteção de imutabilidade, retenção legal e exclusão em cascata compatível
--    Regras:
--      a) UPDATE é sempre bloqueado (histórico estritamente append-only).
--      b) DELETE por sessão JWT de usuário (authenticated/anon) é sempre bloqueado.
--      c) DELETE administrativo direto com conta ainda existente em auth.users é bloqueado.
--      d) DELETE de registros pertencentes a titular com histórico em commercial_payments
--         é bloqueado por obrigação de conservação legal/fiscal (LGPD Art. 16).
--      e) Exclusão legítima de conta sem retenção impeditiva em auth.users dispara
--         ON DELETE CASCADE após remoção da linha pai, sem ser bloqueada pelo trigger.
CREATE OR REPLACE FUNCTION public.fn_prevent_legal_acceptance_mutation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_caller_uid UUID := (SELECT auth.uid());
  v_jwt_role TEXT := NULLIF(BTRIM(COALESCE(current_setting('request.jwt.claim.role', true), '')), '');
  v_has_commercial_payments BOOLEAN := false;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    RAISE EXCEPTION 'Histórico jurídico e de consentimento é imutável e não pode ser alterado.'
      USING ERRCODE = '42501';
  END IF;

  IF TG_OP = 'DELETE' THEN
    -- Jamais permite exclusão oriunda de contexto autenticado ou anônimo de cliente
    IF v_caller_uid IS NOT NULL OR v_jwt_role IN ('authenticated', 'anon') THEN
      RAISE EXCEPTION 'Usuários não podem excluir registros de aceite jurídico ou consentimento.'
        USING ERRCODE = '42501';
    END IF;

    -- Impede exclusões administrativas indevidas enquanto a conta existir em auth.users
    IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id) THEN
      RAISE EXCEPTION 'Registros jurídicos de conta ativa não podem ser excluídos diretamente (retenção e trilha probatória).'
        USING ERRCODE = '42501';
    END IF;

    -- Preserva obrigação de conservação caso exista histórico comercial vinculado (se Script 01 estiver implantado)
    IF to_regclass('public.commercial_payments') IS NOT NULL THEN
      EXECUTE 'SELECT EXISTS (SELECT 1 FROM public.commercial_payments cp WHERE cp.customer_user_id = $1)'
        INTO v_has_commercial_payments
        USING OLD.user_id;

      IF v_has_commercial_payments THEN
        RAISE EXCEPTION 'Registros sujeitos a obrigação de conservação comercial/legal não podem ser eliminados irrestritamente.'
          USING ERRCODE = '42501';
      END IF;
    END IF;

    -- Somente quando auth.users já foi legitimamente excluída e não há obrigação comercial impeditiva,
    -- permite que o ON DELETE CASCADE conclua a limpeza vinculada à exclusão da conta.
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_prevent_legal_acceptance_mutation() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fn_prevent_legal_acceptance_mutation() FROM anon;
REVOKE ALL ON FUNCTION public.fn_prevent_legal_acceptance_mutation() FROM authenticated;

DROP TRIGGER IF EXISTS trg_prevent_legal_acceptance_mutation ON public.user_legal_acceptances;
CREATE TRIGGER trg_prevent_legal_acceptance_mutation
  BEFORE UPDATE OR DELETE ON public.user_legal_acceptances
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_legal_acceptance_mutation();

DROP TRIGGER IF EXISTS trg_prevent_whatsapp_consent_event_mutation ON public.user_whatsapp_consent_events;
CREATE TRIGGER trg_prevent_whatsapp_consent_event_mutation
  BEFORE UPDATE OR DELETE ON public.user_whatsapp_consent_events
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_prevent_legal_acceptance_mutation();

-- 6. Carga inicial das versões v1.0.0 com verificação estrita de integridade
--    Não utiliza ON CONFLICT DO NOTHING: qualquer divergência de hash aborta a transação.
DO $$
DECLARE
  v_seed RECORD;
  v_existing public.legal_document_versions%ROWTYPE;
BEGIN
  FOR v_seed IN
    SELECT *
    FROM (
      VALUES
        (
          'terms_of_use'::TEXT,
          '1.0.0'::TEXT,
          '5c124f918b2cf520d8f9ff67c15cbe66e430b31cdd5da1e1398c7ab9e05e3fca'::TEXT,
          '2026-11-18T00:00:00Z'::TIMESTAMPTZ,
          true,
          true,
          'Versão inicial dos Termos de Uso do Gestão Financeira Pro.'::TEXT
        ),
        (
          'privacy_policy'::TEXT,
          '1.0.0'::TEXT,
          '48f21c2b06929d1d47c98c8222d9db0c27adb23d456122670bb635e6d986d199'::TEXT,
          '2026-11-18T00:00:00Z'::TIMESTAMPTZ,
          true,
          true,
          'Versão inicial da Política de Privacidade e Transparência LGPD.'::TEXT
        )
    ) AS s(
      document_id,
      version,
      content_sha256,
      published_at,
      is_active,
      requires_reacceptance,
      summary_of_changes
    )
  LOOP
    SELECT *
    INTO v_existing
    FROM public.legal_document_versions d
    WHERE d.document_id = v_seed.document_id
      AND d.version = v_seed.version;

    IF FOUND THEN
      IF v_existing.content_sha256 IS DISTINCT FROM v_seed.content_sha256 THEN
        RAISE EXCEPTION 'Divergência de integridade detectada na carga inicial: documento "%" versão "%" já possui hash "%", diferente do hash esperado "%".',
          v_seed.document_id, v_seed.version, v_existing.content_sha256, v_seed.content_sha256
          USING ERRCODE = '22023';
      END IF;
    ELSE
      IF EXISTS (
        SELECT 1
        FROM public.legal_document_versions d
        WHERE d.document_id = v_seed.document_id
          AND d.is_active = true
      ) THEN
        RAISE EXCEPTION 'Conflito na carga inicial: já existe outra versão ativa para "%"; desative-a explicitamente ou preserve a sequência de versões.',
          v_seed.document_id
          USING ERRCODE = '23505';
      END IF;

      INSERT INTO public.legal_document_versions (
        document_id,
        version,
        content_sha256,
        published_at,
        is_active,
        requires_reacceptance,
        summary_of_changes
      )
      VALUES (
        v_seed.document_id,
        v_seed.version,
        v_seed.content_sha256,
        v_seed.published_at,
        v_seed.is_active,
        v_seed.requires_reacceptance,
        v_seed.summary_of_changes
      );
    END IF;
  END LOOP;
END $$;

-- 7. RPC: Consultar status atual de aceite, versões vigentes e estado real do WhatsApp
--    Identifica o usuário estritamente via auth.uid(); não aceita parâmetro de usuário.
CREATE OR REPLACE FUNCTION public.get_my_legal_consent_status()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_user_created_at TIMESTAMPTZ;
  v_is_existing_user BOOLEAN := false;
  v_terms_active public.legal_document_versions%ROWTYPE;
  v_privacy_active public.legal_document_versions%ROWTYPE;
  v_latest_terms public.user_legal_acceptances%ROWTYPE;
  v_latest_privacy public.user_legal_acceptances%ROWTYPE;
  v_latest_legacy_whatsapp public.user_legal_acceptances%ROWTYPE;
  v_latest_wa_event public.user_whatsapp_consent_events%ROWTYPE;
  v_terms_valid BOOLEAN := false;
  v_privacy_valid BOOLEAN := false;
  v_has_any_prior_acceptance BOOLEAN := false;
  v_whatsapp_active BOOLEAN := false;
  v_whatsapp_status TEXT := 'not_set';
  v_whatsapp_updated_at TIMESTAMPTZ := NULL;
  v_commercial_profile_whatsapp BOOLEAN := NULL;
  v_history JSONB := '[]'::JSONB;
  v_wa_history JSONB := '[]'::JSONB;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para consultar status jurídico.'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.created_at
  INTO v_user_created_at
  FROM auth.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta autenticada não localizada para consulta jurídica.'
      USING ERRCODE = '42501';
  END IF;

  IF v_user_created_at < '2026-11-19T00:00:00Z'::TIMESTAMPTZ THEN
    v_is_existing_user := true;
  END IF;

  SELECT *
  INTO v_terms_active
  FROM public.legal_document_versions d
  WHERE d.document_id = 'terms_of_use'
    AND d.is_active = true
  ORDER BY d.published_at DESC
  LIMIT 1;

  SELECT *
  INTO v_privacy_active
  FROM public.legal_document_versions d
  WHERE d.document_id = 'privacy_policy'
    AND d.is_active = true
  ORDER BY d.published_at DESC
  LIMIT 1;

  SELECT EXISTS (
    SELECT 1
    FROM public.user_legal_acceptances a
    WHERE a.user_id = v_uid
      AND a.acceptance_kind IN ('contractual_terms_acceptance', 'privacy_policy_acknowledgment')
  ) INTO v_has_any_prior_acceptance;

  SELECT *
  INTO v_latest_terms
  FROM public.user_legal_acceptances a
  WHERE a.user_id = v_uid
    AND a.document_id = 'terms_of_use'
    AND a.acceptance_kind = 'contractual_terms_acceptance'
  ORDER BY a.accepted_at DESC
  LIMIT 1;

  SELECT *
  INTO v_latest_privacy
  FROM public.user_legal_acceptances a
  WHERE a.user_id = v_uid
    AND a.document_id = 'privacy_policy'
    AND a.acceptance_kind = 'privacy_policy_acknowledgment'
  ORDER BY a.accepted_at DESC
  LIMIT 1;

  IF v_terms_active.id IS NOT NULL AND v_latest_terms.id IS NOT NULL THEN
    v_terms_valid := (
      v_latest_terms.document_version = v_terms_active.version
      AND v_latest_terms.document_hash = v_terms_active.content_sha256
    );
  END IF;

  IF v_privacy_active.id IS NOT NULL AND v_latest_privacy.id IS NOT NULL THEN
    v_privacy_valid := (
      v_latest_privacy.document_version = v_privacy_active.version
      AND v_latest_privacy.document_hash = v_privacy_active.content_sha256
    );
  END IF;

  -- Estado real do consentimento opcional de comunicações comerciais via WhatsApp:
  -- A trilha de eventos (granted/revoked) prevalece sempre; após qualquer revogação,
  -- autorizações antigas nunca permanecem válidas.
  SELECT *
  INTO v_latest_wa_event
  FROM public.user_whatsapp_consent_events e
  WHERE e.user_id = v_uid
    AND e.consent_scope = 'commercial_whatsapp_communications'
  ORDER BY e.occurred_at DESC, e.event_seq DESC
  LIMIT 1;

  IF v_latest_wa_event.id IS NOT NULL THEN
    v_whatsapp_active := (v_latest_wa_event.event_type = 'granted');
    v_whatsapp_status := v_latest_wa_event.event_type;
    v_whatsapp_updated_at := v_latest_wa_event.occurred_at;
  ELSE
    SELECT *
    INTO v_latest_legacy_whatsapp
    FROM public.user_legal_acceptances a
    WHERE a.user_id = v_uid
      AND a.acceptance_kind = 'optional_commercial_whatsapp_consent'
    ORDER BY a.accepted_at DESC
    LIMIT 1;

    IF v_latest_legacy_whatsapp.id IS NOT NULL THEN
      v_whatsapp_active := true;
      v_whatsapp_status := 'granted';
      v_whatsapp_updated_at := v_latest_legacy_whatsapp.accepted_at;
    END IF;
  END IF;

  IF to_regclass('public.customer_profiles') IS NOT NULL THEN
    EXECUTE 'SELECT cp.lgpd_whatsapp_consent FROM public.customer_profiles cp WHERE cp.user_id = $1 LIMIT 1'
      INTO v_commercial_profile_whatsapp
      USING v_uid;
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', a.id,
        'document_id', a.document_id,
        'document_version', a.document_version,
        'document_hash', a.document_hash,
        'acceptance_kind', a.acceptance_kind,
        'is_legacy_transition', a.is_legacy_transition,
        'acceptance_source', a.acceptance_source,
        'accepted_at', a.accepted_at
      )
      ORDER BY a.accepted_at DESC
    ),
    '[]'::JSONB
  )
  INTO v_history
  FROM public.user_legal_acceptances a
  WHERE a.user_id = v_uid;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', e.id,
        'event_seq', e.event_seq,
        'consent_scope', e.consent_scope,
        'event_type', e.event_type,
        'privacy_policy_version', e.privacy_policy_version,
        'privacy_policy_hash', e.privacy_policy_hash,
        'event_source', e.event_source,
        'explicit_user_action', e.explicit_user_action,
        'occurred_at', e.occurred_at
      )
      ORDER BY e.occurred_at DESC, e.event_seq DESC
    ),
    '[]'::JSONB
  )
  INTO v_wa_history
  FROM public.user_whatsapp_consent_events e
  WHERE e.user_id = v_uid;

  RETURN jsonb_build_object(
    'user_id', v_uid,
    'is_existing_user', v_is_existing_user,
    'has_any_prior_acceptance', v_has_any_prior_acceptance,
    'has_valid_consent', (v_terms_valid AND v_privacy_valid),
    'terms_accepted', v_terms_valid,
    'privacy_acknowledged', v_privacy_valid,
    'needs_terms_reacceptance', (v_has_any_prior_acceptance AND NOT v_terms_valid),
    'needs_privacy_reacknowledgment', (v_has_any_prior_acceptance AND NOT v_privacy_valid),
    'active_terms_version', v_terms_active.version,
    'active_terms_hash', v_terms_active.content_sha256,
    'active_privacy_version', v_privacy_active.version,
    'active_privacy_hash', v_privacy_active.content_sha256,
    'accepted_terms_version', v_latest_terms.document_version,
    'accepted_terms_at', v_latest_terms.accepted_at,
    'acknowledged_privacy_version', v_latest_privacy.document_version,
    'acknowledged_privacy_at', v_latest_privacy.accepted_at,
    'optional_whatsapp_consent_active', v_whatsapp_active,
    'optional_whatsapp_consent_status', v_whatsapp_status,
    'optional_whatsapp_consent_updated_at', v_whatsapp_updated_at,
    'optional_whatsapp_consent_at', CASE WHEN v_whatsapp_active THEN v_whatsapp_updated_at ELSE NULL END,
    'commercial_profile_whatsapp_consent', v_commercial_profile_whatsapp,
    'legal_retention_notice', 'Registros jurídicos permanecem conservados enquanto a conta estiver ativa ou pelo prazo exigido por obrigações legais e histórico de faturamento comercial.',
    'history', v_history,
    'whatsapp_consent_history', v_wa_history
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_legal_consent_status() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_legal_consent_status() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_legal_consent_status() TO authenticated;

-- 8. RPC: Registrar aceite contratual dos Termos de Uso, ciência da Política de Privacidade
--    e decisão explícita opcional de WhatsApp ('unchanged' | 'grant' | 'revoke').
--    Uma caixa desmarcada envia 'unchanged' e NUNCA gera revogação tácita automática.
DROP FUNCTION IF EXISTS public.record_legal_consent(TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, TEXT);

CREATE OR REPLACE FUNCTION public.record_legal_consent(
  p_terms_version TEXT,
  p_terms_hash TEXT,
  p_privacy_version TEXT,
  p_privacy_hash TEXT,
  p_accept_contractual_terms BOOLEAN,
  p_acknowledge_privacy_policy BOOLEAN,
  p_optional_whatsapp_decision TEXT DEFAULT 'unchanged',
  p_acceptance_source TEXT DEFAULT 'legal_consent_gate'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_user_created_at TIMESTAMPTZ;
  v_is_legacy_transition BOOLEAN := false;
  v_terms_active public.legal_document_versions%ROWTYPE;
  v_privacy_active public.legal_document_versions%ROWTYPE;
  v_server_now TIMESTAMPTZ := NOW();
  v_clean_source TEXT := COALESCE(NULLIF(BTRIM(p_acceptance_source), ''), 'legal_consent_gate');
  v_wa_decision TEXT := COALESCE(NULLIF(BTRIM(p_optional_whatsapp_decision), ''), 'unchanged');
  v_current_wa_event_type TEXT := NULL;
  v_target_wa_event_type TEXT := NULL;
  v_has_legacy_wa_grant BOOLEAN := false;
  v_has_prior_commercial_flag BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para registrar aceite jurídico.'
      USING ERRCODE = '42501';
  END IF;

  SELECT u.created_at
  INTO v_user_created_at
  FROM auth.users u
  WHERE u.id = v_uid;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conta autenticada inválida.'
      USING ERRCODE = '42501';
  END IF;

  IF COALESCE(p_accept_contractual_terms, false) IS NOT TRUE
     OR COALESCE(p_acknowledge_privacy_policy, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'É obrigatório confirmar o aceite dos Termos de Uso e a ciência da Política de Privacidade.'
      USING ERRCODE = '22023';
  END IF;

  IF v_clean_source NOT IN ('legal_consent_gate', 'reacceptance_prompt', 'settings_privacy_panel') THEN
    RAISE EXCEPTION 'Origem de aceite inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF v_wa_decision NOT IN ('unchanged', 'grant', 'revoke') THEN
    RAISE EXCEPTION 'Decisão de consentimento opcional inválida. Utilize unchanged, grant ou revoke.'
      USING ERRCODE = '22023';
  END IF;

  -- Serializa chamadas concorrentes do mesmo usuário para preservar consistência e idempotência
  PERFORM pg_advisory_xact_lock(hashtext('legal_consent:' || v_uid::TEXT));

  SELECT *
  INTO v_terms_active
  FROM public.legal_document_versions d
  WHERE d.document_id = 'terms_of_use'
    AND d.is_active = true
  ORDER BY d.published_at DESC
  LIMIT 1;

  SELECT *
  INTO v_privacy_active
  FROM public.legal_document_versions d
  WHERE d.document_id = 'privacy_policy'
    AND d.is_active = true
  ORDER BY d.published_at DESC
  LIMIT 1;

  IF v_terms_active.id IS NULL OR v_privacy_active.id IS NULL THEN
    RAISE EXCEPTION 'Versões jurídicas ativas não estão configuradas no banco de dados.'
      USING ERRCODE = 'P0002';
  END IF;

  IF BTRIM(COALESCE(p_terms_version, '')) <> v_terms_active.version
     OR BTRIM(COALESCE(p_terms_hash, '')) <> v_terms_active.content_sha256 THEN
    RAISE EXCEPTION 'Versão ou hash dos Termos de Uso divergente da versão vigente no servidor.'
      USING ERRCODE = '22023';
  END IF;

  IF BTRIM(COALESCE(p_privacy_version, '')) <> v_privacy_active.version
     OR BTRIM(COALESCE(p_privacy_hash, '')) <> v_privacy_active.content_sha256 THEN
    RAISE EXCEPTION 'Versão ou hash da Política de Privacidade divergente da versão vigente no servidor.'
      USING ERRCODE = '22023';
  END IF;

  IF v_user_created_at < '2026-11-19T00:00:00Z'::TIMESTAMPTZ THEN
    v_is_legacy_transition := NOT EXISTS (
      SELECT 1
      FROM public.user_legal_acceptances a
      WHERE a.user_id = v_uid
        AND a.acceptance_kind IN ('contractual_terms_acceptance', 'privacy_policy_acknowledgment')
    );
  END IF;

  -- Registro 1: Aceite contratual dos Termos de Uso (idempotente para a mesma versão)
  INSERT INTO public.user_legal_acceptances (
    user_id,
    document_id,
    document_version,
    document_hash,
    acceptance_kind,
    is_legacy_transition,
    acceptance_source,
    accepted_at
  )
  VALUES (
    v_uid,
    'terms_of_use',
    v_terms_active.version,
    v_terms_active.content_sha256,
    'contractual_terms_acceptance',
    v_is_legacy_transition,
    v_clean_source,
    v_server_now
  )
  ON CONFLICT (user_id, document_id, document_version, acceptance_kind) DO NOTHING;

  -- Registro 2: Ciência transparente da Política de Privacidade (idempotente para a mesma versão)
  INSERT INTO public.user_legal_acceptances (
    user_id,
    document_id,
    document_version,
    document_hash,
    acceptance_kind,
    is_legacy_transition,
    acceptance_source,
    accepted_at
  )
  VALUES (
    v_uid,
    'privacy_policy',
    v_privacy_active.version,
    v_privacy_active.content_sha256,
    'privacy_policy_acknowledgment',
    v_is_legacy_transition,
    v_clean_source,
    v_server_now
  )
  ON CONFLICT (user_id, document_id, document_version, acceptance_kind) DO NOTHING;

  -- Registro 3 (Opcional e explícito): Somente atua quando houve ação explícita grant/revoke
  IF v_wa_decision IN ('grant', 'revoke') THEN
    v_target_wa_event_type := CASE WHEN v_wa_decision = 'grant' THEN 'granted' ELSE 'revoked' END;

    SELECT e.event_type
    INTO v_current_wa_event_type
    FROM public.user_whatsapp_consent_events e
    WHERE e.user_id = v_uid
      AND e.consent_scope = 'commercial_whatsapp_communications'
    ORDER BY e.occurred_at DESC, e.event_seq DESC
    LIMIT 1;

    IF v_current_wa_event_type IS NULL THEN
      SELECT EXISTS (
        SELECT 1
        FROM public.user_legal_acceptances a
        WHERE a.user_id = v_uid
          AND a.acceptance_kind = 'optional_commercial_whatsapp_consent'
      ) INTO v_has_legacy_wa_grant;

      IF to_regclass('public.customer_profiles') IS NOT NULL THEN
        EXECUTE 'SELECT COALESCE(cp.lgpd_whatsapp_consent, false) FROM public.customer_profiles cp WHERE cp.user_id = $1 LIMIT 1'
          INTO v_has_prior_commercial_flag
          USING v_uid;
      END IF;
    END IF;

    IF (v_target_wa_event_type = 'granted' AND COALESCE(v_current_wa_event_type, '') <> 'granted')
       OR (
         v_target_wa_event_type = 'revoked'
         AND (
           v_current_wa_event_type = 'granted'
           OR (
             v_current_wa_event_type IS NULL
             AND (v_has_legacy_wa_grant OR v_has_prior_commercial_flag)
           )
         )
       ) THEN
      INSERT INTO public.user_whatsapp_consent_events (
        user_id,
        consent_scope,
        event_type,
        document_id,
        privacy_policy_version,
        privacy_policy_hash,
        event_source,
        explicit_user_action,
        occurred_at
      )
      VALUES (
        v_uid,
        'commercial_whatsapp_communications',
        v_target_wa_event_type,
        'privacy_policy',
        v_privacy_active.version,
        v_privacy_active.content_sha256,
        v_clean_source,
        true,
        v_server_now
      );
    END IF;

    -- Sincroniza sinalizador comercial sem violar independência caso Script 01 ainda não exista
    IF to_regclass('public.customer_profiles') IS NOT NULL THEN
      EXECUTE 'UPDATE public.customer_profiles SET lgpd_whatsapp_consent = $1, updated_at = NOW() WHERE user_id = $2'
        USING (v_target_wa_event_type = 'granted'), v_uid;
    END IF;
  END IF;

  RETURN public.get_my_legal_consent_status();
END;
$$;

REVOKE ALL ON FUNCTION public.record_legal_consent(TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_legal_consent(TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_legal_consent(TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT) TO authenticated;

-- 9. RPC dedicada: Conceder ou revogar explicitamente o consentimento opcional de comunicações
--    comerciais via WhatsApp SEM exigir novo aceite contratual dos Termos de Uso.
CREATE OR REPLACE FUNCTION public.set_my_optional_whatsapp_consent(
  p_consent_action TEXT,
  p_event_source TEXT DEFAULT 'settings_privacy_panel'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
  v_action TEXT := BTRIM(COALESCE(p_consent_action, ''));
  v_source TEXT := COALESCE(NULLIF(BTRIM(p_event_source), ''), 'settings_privacy_panel');
  v_target_event TEXT;
  v_current_event TEXT;
  v_privacy_active public.legal_document_versions%ROWTYPE;
  v_has_prior_commercial_flag BOOLEAN := false;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Autenticação obrigatória para alterar consentimento opcional.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
    RAISE EXCEPTION 'Conta autenticada inválida.'
      USING ERRCODE = '42501';
  END IF;

  IF v_action NOT IN ('grant', 'revoke') THEN
    RAISE EXCEPTION 'Ação de consentimento inválida. Utilize grant ou revoke.'
      USING ERRCODE = '22023';
  END IF;

  IF v_source NOT IN (
    'legal_consent_gate',
    'reacceptance_prompt',
    'settings_privacy_panel',
    'explicit_whatsapp_toggle'
  ) THEN
    RAISE EXCEPTION 'Origem de evento de consentimento inválida.'
      USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('legal_consent:' || v_uid::TEXT));

  SELECT *
  INTO v_privacy_active
  FROM public.legal_document_versions d
  WHERE d.document_id = 'privacy_policy'
    AND d.is_active = true
  ORDER BY d.published_at DESC
  LIMIT 1;

  IF v_privacy_active.id IS NULL THEN
    RAISE EXCEPTION 'Versão ativa da Política de Privacidade não encontrada.'
      USING ERRCODE = 'P0002';
  END IF;

  v_target_event := CASE WHEN v_action = 'grant' THEN 'granted' ELSE 'revoked' END;

  SELECT e.event_type
  INTO v_current_event
  FROM public.user_whatsapp_consent_events e
  WHERE e.user_id = v_uid
    AND e.consent_scope = 'commercial_whatsapp_communications'
  ORDER BY e.occurred_at DESC, e.event_seq DESC
  LIMIT 1;

  IF v_current_event IS NULL AND to_regclass('public.customer_profiles') IS NOT NULL THEN
    EXECUTE 'SELECT COALESCE(cp.lgpd_whatsapp_consent, false) FROM public.customer_profiles cp WHERE cp.user_id = $1 LIMIT 1'
      INTO v_has_prior_commercial_flag
      USING v_uid;
  END IF;

  -- Idempotente: registra novo evento quando houver mudança real ou revogação sobre sinalizador prévio
  IF (v_target_event = 'granted' AND COALESCE(v_current_event, '') <> 'granted')
     OR (
       v_target_event = 'revoked'
       AND (
         COALESCE(v_current_event, '') = 'granted'
         OR (
           v_current_event IS NULL
           AND (
             v_has_prior_commercial_flag
             OR EXISTS (
               SELECT 1
               FROM public.user_legal_acceptances a
               WHERE a.user_id = v_uid
                 AND a.acceptance_kind = 'optional_commercial_whatsapp_consent'
             )
           )
         )
       )
     ) THEN
    INSERT INTO public.user_whatsapp_consent_events (
      user_id,
      consent_scope,
      event_type,
      document_id,
      privacy_policy_version,
      privacy_policy_hash,
      event_source,
      explicit_user_action,
      occurred_at
    )
    VALUES (
      v_uid,
      'commercial_whatsapp_communications',
      v_target_event,
      'privacy_policy',
      v_privacy_active.version,
      v_privacy_active.content_sha256,
      v_source,
      true,
      NOW()
    );
  END IF;

  IF to_regclass('public.customer_profiles') IS NOT NULL THEN
    EXECUTE 'UPDATE public.customer_profiles SET lgpd_whatsapp_consent = $1, updated_at = NOW() WHERE user_id = $2'
      USING (v_target_event = 'granted'), v_uid;
  END IF;

  RETURN public.get_my_legal_consent_status();
END;
$$;

REVOKE ALL ON FUNCTION public.set_my_optional_whatsapp_consent(TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_my_optional_whatsapp_consent(TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_my_optional_whatsapp_consent(TEXT, TEXT) TO authenticated;

-- 10. RPC: Consultar somente o histórico de aceites contratuais/ciência do próprio usuário autenticado
CREATE OR REPLACE FUNCTION public.get_my_legal_acceptance_history()
RETURNS TABLE (
  id UUID,
  document_id TEXT,
  document_version TEXT,
  document_hash TEXT,
  acceptance_kind TEXT,
  is_legacy_transition BOOLEAN,
  acceptance_source TEXT,
  accepted_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
    RAISE EXCEPTION 'Autenticação obrigatória para consultar histórico jurídico.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.document_id,
    a.document_version,
    a.document_hash,
    a.acceptance_kind,
    a.is_legacy_transition,
    a.acceptance_source,
    a.accepted_at
  FROM public.user_legal_acceptances a
  WHERE a.user_id = v_uid
  ORDER BY a.accepted_at DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_legal_acceptance_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_legal_acceptance_history() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_legal_acceptance_history() TO authenticated;

-- 11. RPC: Consultar somente o histórico cronológico de concessão/revogação de WhatsApp do próprio usuário
CREATE OR REPLACE FUNCTION public.get_my_whatsapp_consent_history()
RETURNS TABLE (
  id UUID,
  event_seq BIGINT,
  consent_scope TEXT,
  event_type TEXT,
  privacy_policy_version TEXT,
  privacy_policy_hash TEXT,
  event_source TEXT,
  explicit_user_action BOOLEAN,
  occurred_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
DECLARE
  v_uid UUID := (SELECT auth.uid());
BEGIN
  IF v_uid IS NULL OR NOT EXISTS (SELECT 1 FROM auth.users u WHERE u.id = v_uid) THEN
    RAISE EXCEPTION 'Autenticação obrigatória para consultar histórico de consentimento.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    e.id,
    e.event_seq,
    e.consent_scope,
    e.event_type,
    e.privacy_policy_version,
    e.privacy_policy_hash,
    e.event_source,
    e.explicit_user_action,
    e.occurred_at
  FROM public.user_whatsapp_consent_events e
  WHERE e.user_id = v_uid
  ORDER BY e.occurred_at DESC, e.event_seq DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_my_whatsapp_consent_history() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_my_whatsapp_consent_history() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_my_whatsapp_consent_history() TO authenticated;

COMMIT;
