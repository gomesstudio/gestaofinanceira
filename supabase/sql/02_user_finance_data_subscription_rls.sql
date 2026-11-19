-- ==============================================================================
-- GESTÃO FINANCEIRA PRO — ETAPA C1 (SCRIPT 02 DE 04)
-- Políticas RLS de public.user_finance_data com Verificação de Assinatura Ativa
--
-- ORDEM OBRIGATÓRIA:
-- Execute APENAS APÓS:
--   1. Script 01 (schema, tabelas e funções de assinatura)
--   2. Script 03 (migração segura de usuários legítimos existentes)
--   3. Script 05 (vinculação da conta Master por UUID verificado)
--   4. Passo 4 do Script 03 (conferência zero contas legítimas sem acesso)
--
-- EFEITO:
-- - SELECT: Preservado para (SELECT auth.uid()) = user_id MESMO após vencimento
--   ou suspensão, garantindo que o cliente nunca perca o direito de exportar
--   seu backup em JSON.
-- - INSERT / UPDATE / DELETE: Exigem (SELECT auth.uid()) = user_id E
--   public.has_active_subscription((SELECT auth.uid())) = true.
-- - FORCE ROW LEVEL SECURITY: Justificado nesta tabela porque todas as
--   operações ocorrem via PostgREST sob role `authenticated` (nenhuma RPC
--   SECURITY DEFINER acessa public.user_finance_data).
-- ==============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.user_finance_data') IS NULL THEN
    RAISE EXCEPTION 'Pre-requisito ausente: tabela public.user_finance_data nao existe.'
      USING ERRCODE = 'P0002';
  END IF;

  IF to_regprocedure('public.has_active_subscription(uuid)') IS NULL THEN
    RAISE EXCEPTION 'Pre-requisito ausente: execute o Script 01 antes do Script 02 (has_active_subscription(uuid) nao encontrada).'
      USING ERRCODE = 'P0002';
  END IF;
END $$;

ALTER TABLE public.user_finance_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_finance_data FORCE ROW LEVEL SECURITY;

-- Remove dinamicamente TODAS as políticas anteriores de public.user_finance_data
-- (evita que qualquer política permissiva legada com nome desconhecido anule o
-- bloqueio comercial via OR implícito do PostgreSQL)
DO $$
DECLARE
  v_policy RECORD;
BEGIN
  FOR v_policy IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'user_finance_data'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.user_finance_data', v_policy.policyname);
  END LOOP;
END $$;

-- Restrição explícita de GRANTs
REVOKE ALL ON TABLE public.user_finance_data FROM PUBLIC;
REVOKE ALL ON TABLE public.user_finance_data FROM anon;
REVOKE ALL ON TABLE public.user_finance_data FROM authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.user_finance_data TO authenticated;

-- 1. SELECT: Somente o proprietário lê seus dados (mantido mesmo após vencimento para backup JSON)
CREATE POLICY "user_finance_data_select_own"
  ON public.user_finance_data
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- 2. INSERT: Somente o proprietário COM assinatura ativa no servidor
CREATE POLICY "user_finance_data_insert_active_sub"
  ON public.user_finance_data
  FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.has_active_subscription((SELECT auth.uid()))
  );

-- 3. UPDATE: Somente o proprietário COM assinatura ativa no servidor
CREATE POLICY "user_finance_data_update_active_sub"
  ON public.user_finance_data
  FOR UPDATE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND public.has_active_subscription((SELECT auth.uid()))
  )
  WITH CHECK (
    (SELECT auth.uid()) = user_id
    AND public.has_active_subscription((SELECT auth.uid()))
  );

-- 4. DELETE: Somente o proprietário COM assinatura ativa no servidor
CREATE POLICY "user_finance_data_delete_active_sub"
  ON public.user_finance_data
  FOR DELETE
  TO authenticated
  USING (
    (SELECT auth.uid()) = user_id
    AND public.has_active_subscription((SELECT auth.uid()))
  );

COMMIT;
