-- ==============================================================================
-- GESTÃO FINANCEIRA PRO — ETAPAS C1 / C3 (SCRIPT 04 DE 04)
-- Validação Real das Políticas RLS em Ambiente Isolado (Transação com ROLLBACK)
--
-- IMPORTANTE:
-- - Execute APENAS em um projeto Supabase de homologação/staging ou com contas
--   de teste dedicadas (NUNCA em dados reais de produção).
-- - Todo o bloco abaixo roda dentro de BEGIN ... ROLLBACK, sem persistir
--   alterações de teste após o término.
-- - Requer que os Scripts 01 e 02 tenham sido aplicados no ambiente isolado.
-- ==============================================================================

BEGIN;

DO $$
DECLARE
  v_user_a UUID := '11111111-1111-4111-8111-111111111111';
  v_user_b UUID := '22222222-2222-4222-8222-222222222222';
  v_row_count INT;
  v_bool BOOLEAN;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_a)
     OR NOT EXISTS (SELECT 1 FROM auth.users WHERE id = v_user_b) THEN
    RAISE NOTICE 'Substitua v_user_a e v_user_b por UUIDs de duas contas ficticias do ambiente isolado.';
    RETURN;
  END IF;

  -- Setup inicial privilegiado para o cenário de teste:
  -- A = mensal ativo (30 dias), B = anual vencido (expires_at no passado)
  INSERT INTO public.user_subscriptions (user_id, plan_type, status, starts_at, expires_at)
  VALUES
    (v_user_a, 'monthly', 'active', NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days'),
    (v_user_b, 'annual', 'active', NOW() - INTERVAL '13 months', NOW() - INTERVAL '1 day')
  ON CONFLICT (user_id) DO UPDATE SET
    plan_type = EXCLUDED.plan_type,
    status = EXCLUDED.status,
    expires_at = EXCLUDED.expires_at;

  INSERT INTO public.user_finance_data (user_id, data, version, client_timestamp)
  VALUES
    (v_user_a, '{"transactions":[{"id":"qa-a"}]}'::JSONB, 1, 1700000001000),
    (v_user_b, '{"transactions":[{"id":"qa-b"}]}'::JSONB, 1, 1700000002000)
  ON CONFLICT (user_id) DO UPDATE SET
    data = EXCLUDED.data,
    version = EXCLUDED.version;

  -- 1. Simular Cliente A autenticado (Mensal ativo)
  PERFORM set_config('request.jwt.claim.sub', v_user_a::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 1a. Cliente A pode ler apenas sua própria linha financeira
  SELECT COUNT(*) INTO v_row_count FROM public.user_finance_data;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'FALHA RLS: Cliente A visualizou % linhas (esperado 1).', v_row_count;
  END IF;

  -- 1b. Cliente A pode atualizar seus dados com mensal ativo
  UPDATE public.user_finance_data SET version = 2 WHERE user_id = v_user_a;

  -- 1c. Cliente A NÃO pode alterar a própria assinatura para lifetime/anual (42501)
  BEGIN
    UPDATE public.user_subscriptions
      SET plan_type = 'lifetime', expires_at = NULL
      WHERE user_id = v_user_a;
    RAISE EXCEPTION 'FALHA CRITICA RLS: Cliente A conseguiu alterar a propria assinatura!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: Cliente A bloqueado ao tentar alterar user_subscriptions (42501).';
  END;

  -- 1d. Cliente A NÃO pode solicitar 'lifetime' em submit_access_request (22023)
  BEGIN
    PERFORM public.submit_access_request('Cliente A Teste', '33999990001', 'lifetime', true);
    RAISE EXCEPTION 'FALHA CRITICA: Cliente A conseguiu solicitar lifetime via submit_access_request!';
  EXCEPTION WHEN invalid_parameter_value THEN
    RAISE NOTICE 'OK: Cliente A bloqueado ao tentar solicitar plano lifetime.';
  END;

  -- 1e. Cliente A pode solicitar 'annual' pendente (sem aprovar a si mesmo)
  PERFORM public.submit_access_request('Cliente A Teste', '33999990001', 'annual', true);

  -- 1f. Cliente A NÃO pode atualizar ou autoaprovar access_requests diretamente (42501)
  BEGIN
    UPDATE public.access_requests SET request_status = 'approved' WHERE user_id = v_user_a;
    RAISE EXCEPTION 'FALHA CRITICA RLS: Cliente A conseguiu autoaprovar access_requests!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: Cliente A bloqueado em autoaprovacao de access_requests (42501).';
  END;

  -- 1g. Cliente A NÃO pode consultar assinatura de Cliente B via has_active_subscription
  SELECT public.has_active_subscription(v_user_b) INTO v_bool;
  IF v_bool IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHA: Cliente A obteve resultado inesperado ao consultar assinatura de B.';
  END IF;

  -- 1h. Cliente A comum NÃO pode executar RPCs administrativas ou ler faturamento (42501)
  BEGIN
    PERFORM public.admin_manage_subscription(v_user_a, 'activate_lifetime', 'tentativa indevida');
    RAISE EXCEPTION 'FALHA CRITICA: Cliente A comum conseguiu executar admin_manage_subscription!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: Cliente comum bloqueado em admin_manage_subscription (42501).';
  END;

  BEGIN
    PERFORM public.admin_get_master_dashboard_metrics();
    RAISE EXCEPTION 'FALHA CRITICA: Cliente comum acessou dashboard Master!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: Cliente comum bloqueado no dashboard Master (42501).';
  END;

  BEGIN
    PERFORM * FROM public.commercial_payments;
    RAISE EXCEPTION 'FALHA CRITICA: Cliente comum acessou commercial_payments!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: Cliente comum bloqueado em commercial_payments (42501).';
  END;

  -- 2. Simular Cliente B autenticado (anual VENCIDO mesmo com status='active')
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claim.sub', v_user_b::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  -- 2a. SELECT continua funcionando para backup JSON
  SELECT COUNT(*) INTO v_row_count FROM public.user_finance_data WHERE user_id = v_user_b;
  IF v_row_count <> 1 THEN
    RAISE EXCEPTION 'FALHA: Cliente B vencido perdeu acesso de leitura para backup JSON.';
  END IF;

  -- 2a-bis. Cliente B NÃO pode sondar assinatura ATIVA de Cliente A via has_active_subscription(v_user_a)
  SELECT public.has_active_subscription(v_user_a) INTO v_bool;
  IF v_bool IS NOT FALSE THEN
    RAISE EXCEPTION 'FALHA CRITICA: Cliente B conseguiu sondar status ativo de Cliente A via has_active_subscription!';
  END IF;

  -- 2b. UPDATE/INSERT/DELETE bloqueados por vencimento
  BEGIN
    UPDATE public.user_finance_data SET version = 99 WHERE user_id = v_user_b;
    RAISE EXCEPTION 'FALHA CRITICA RLS: Cliente B vencido conseguiu gravar em user_finance_data!';
  EXCEPTION WHEN insufficient_privilege THEN
    RAISE NOTICE 'OK: Cliente B vencido bloqueado em escrita mantendo leitura de backup (42501).';
  END;

  -- 3. Validar concessão administrativa Vitalício Especial para Cliente B
  EXECUTE 'RESET ROLE';
  UPDATE public.user_subscriptions
    SET plan_type = 'lifetime', status = 'active', expires_at = NULL
    WHERE user_id = v_user_b;

  PERFORM set_config('request.jwt.claim.sub', v_user_b::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  UPDATE public.user_finance_data SET version = 3 WHERE user_id = v_user_b;
  RAISE NOTICE 'OK: Cliente B com Vitalicio Especial administrativo autorizado para gravacao.';

  -- 4. Validar conta Master em app_admins sem exigir linha paga em user_subscriptions
  EXECUTE 'RESET ROLE';
  DELETE FROM public.user_subscriptions WHERE user_id = v_user_a;
  INSERT INTO public.app_admins (user_id, label, is_active)
  VALUES (v_user_a, 'Master Homologacao Isolada', true)
  ON CONFLICT (user_id) DO UPDATE SET is_active = true;

  PERFORM set_config('request.jwt.claim.sub', v_user_a::TEXT, true);
  PERFORM set_config('request.jwt.claim.role', 'authenticated', true);
  EXECUTE 'SET LOCAL ROLE authenticated';

  IF NOT public.is_subscription_admin() THEN
    RAISE EXCEPTION 'FALHA CRITICA: app_admins ativo nao foi reconhecido como Master.';
  END IF;

  IF NOT public.has_active_subscription(v_user_a) THEN
    RAISE EXCEPTION 'FALHA CRITICA: Master sem assinatura paga perdeu acesso financeiro permanente.';
  END IF;

  UPDATE public.user_finance_data SET version = 4 WHERE user_id = v_user_a;
  RAISE NOTICE 'OK: Conta Master em app_admins possui acesso permanente sem assinatura paga.';

  EXECUTE 'RESET ROLE';
END $$;

ROLLBACK;
