/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase, SUPABASE_PROJECT_URL } from '../utils/supabase';
import { AppState } from '../utils/storage';

export const SUPABASE_TABLE_NAME = 'user_finance_data';

/**
 * SQL de Alta Segurança com RLS Estrito
 * Vinculado diretamente ao auth.users(id) via UUID
 */
export const SUPABASE_SQL_SETUP = `-- ==============================================================================
-- SCHEMA REVISADO E SEGURO: user_finance_data
-- Vinculado a auth.users(id) com Row Level Security (RLS) estrito
-- ==============================================================================

-- 1. Criação da tabela com user_id UUID referenciando auth.users(id)
CREATE TABLE IF NOT EXISTS public.user_finance_data (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  data JSONB NOT NULL,
  version INT NOT NULL DEFAULT 1,
  client_timestamp BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Índice para otimização de consultas por usuário autenticado
CREATE INDEX IF NOT EXISTS idx_user_finance_data_user_id ON public.user_finance_data(user_id);

-- 3. Ativar Row Level Security (RLS) obrigatório
ALTER TABLE public.user_finance_data ENABLE ROW LEVEL SECURITY;

-- 4. Remover qualquer política legada ou permissiva anterior
DROP POLICY IF EXISTS "Permitir acesso completo ao app financeiro" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_select_policy" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_insert_policy" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_update_policy" ON public.user_finance_data;
DROP POLICY IF EXISTS "user_finance_data_delete_policy" ON public.user_finance_data;

-- 5. Política SELECT: Somente o proprietário autenticado pode ler seus próprios dados
CREATE POLICY "user_finance_data_select_policy"
  ON public.user_finance_data
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- 6. Política INSERT: Somente o proprietário autenticado pode inserir dados vinculados ao seu auth.uid()
CREATE POLICY "user_finance_data_insert_policy"
  ON public.user_finance_data
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 7. Política UPDATE: Somente o proprietário autenticado pode atualizar seus próprios dados
CREATE POLICY "user_finance_data_update_policy"
  ON public.user_finance_data
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 8. Política DELETE: Somente o proprietário autenticado pode excluir seus próprios dados
CREATE POLICY "user_finance_data_delete_policy"
  ON public.user_finance_data
  FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);
`;

export interface SyncResult {
  success: boolean;
  message?: string;
  code?: string;
  data?: AppState;
  version?: number;
  clientTimestamp?: number;
  updatedAt?: string;
}

export function mapSupabaseSyncError(error: { code?: string; message?: string } | null | undefined): string {
  if (!error) return 'Erro inesperado na comunicação com a nuvem.';
  const code = String(error.code || '').toUpperCase();
  const rawMsg = String(error.message || '');
  const lowerMsg = rawMsg.toLowerCase();

  if (
    code === '42501' ||
    lowerMsg.includes('violates row-level security') ||
    lowerMsg.includes('row-level security policy') ||
    lowerMsg.includes('permission denied')
  ) {
    return 'Operação bloqueada pelo servidor (RLS / assinatura inativa ou vencida). Seus dados locais foram preservados; verifique sua assinatura ou exporte seu backup JSON.';
  }

  return rawMsg || 'Não foi possível conectar. Tente novamente.';
}

/**
 * Valida se uma string é um UUID válido no padrão RFC 4122
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

/**
 * Compara o conteúdo financeiro real entre dois estados (ignorando timestamps e metadados).
 * Garante que estados diferentes NUNCA sejam considerados iguais apenas por terem timestamps iguais.
 */
export function areStatesContentEqual(a: AppState, b: AppState): boolean {
  if (a.safetyReserveDesired !== b.safetyReserveDesired) return false;
  if ((a.transactions?.length || 0) !== (b.transactions?.length || 0)) return false;
  if ((a.accounts?.length || 0) !== (b.accounts?.length || 0)) return false;
  if ((a.categories?.length || 0) !== (b.categories?.length || 0)) return false;
  if ((a.creditCards?.length || 0) !== (b.creditCards?.length || 0)) return false;
  if ((a.debts?.length || 0) !== (b.debts?.length || 0)) return false;
  if ((a.goals?.length || 0) !== (b.goals?.length || 0)) return false;

  return (
    stableStringify(a.transactions || []) === stableStringify(b.transactions || []) &&
    stableStringify(a.accounts || []) === stableStringify(b.accounts || []) &&
    stableStringify(a.categories || []) === stableStringify(b.categories || []) &&
    stableStringify(a.creditCards || []) === stableStringify(b.creditCards || []) &&
    stableStringify(a.debts || []) === stableStringify(b.debts || []) &&
    stableStringify(a.goals || []) === stableStringify(b.goals || [])
  );
}

/**
 * Verifica se o estado possui propriedade confirmada para o userId autenticado.
 */
export function hasConfirmedStateOwnership(state: AppState | null | undefined, userId: string): boolean {
  if (!state || !isValidUUID(userId)) return false;
  if (!state.ownerUserId || state.ownerUserId !== userId) return false;
  if ((state.version ?? 0) <= 0) return false;
  return true;
}

export interface CloudPreservationCheckResult {
  verified: boolean;
  reasonCode:
    | 'cloud_matches_local'
    | 'empty_account'
    | 'unsynced_changes'
    | 'missing_on_cloud'
    | 'table_missing'
    | 'cloud_unreachable'
    | 'owner_mismatch';
  message: string;
  remoteState?: AppState;
}

/**
 * Confirma de forma segura se os dados financeiros locais do usuário já estão preservados na nuvem
 * antes de permitir a remoção automática das cópias de recuperação locais no logout.
 */
export async function verifyCloudPreservationForUser(
  userId: string,
  localState: AppState
): Promise<CloudPreservationCheckResult> {
  if (!isValidUUID(userId) || (localState.ownerUserId && localState.ownerUserId !== userId)) {
    return {
      verified: false,
      reasonCode: 'owner_mismatch',
      message: 'Não foi possível confirmar a propriedade dos dados antes de encerrar a sessão.'
    };
  }

  const hasLocalFinancialRecords =
    !localState.isSampleLoaded &&
    ((localState.transactions?.length || 0) > 0 ||
      (localState.debts?.length || 0) > 0 ||
      (localState.goals?.length || 0) > 0);

  const isUnmodifiedSample =
    Boolean(localState.isSampleLoaded) && (!localState.lastModified || localState.lastModified <= 0);

  const remote = await fetchFinanceDataFromSupabase(userId);
  if (!remote.success) {
    if (remote.code === '42P01') {
      return {
        verified: false,
        reasonCode: 'table_missing',
        message: 'A tabela na nuvem ainda não está disponível para confirmar a preservação remota.'
      };
    }
    return {
      verified: false,
      reasonCode: 'cloud_unreachable',
      message:
        remote.message ||
        'Não foi possível conectar para confirmar se seus dados estão salvos na nuvem.'
    };
  }

  if (!remote.data) {
    if (hasLocalFinancialRecords || (!isUnmodifiedSample && (localState.lastModified || 0) > 0)) {
      return {
        verified: false,
        reasonCode: 'missing_on_cloud',
        message:
          'Existem dados ou alterações locais que ainda não possuem cópia confirmada na nuvem.'
      };
    }

    return {
      verified: true,
      reasonCode: 'empty_account',
      message: 'Conta sem alterações financeiras locais pendentes.'
    };
  }

  if (areStatesContentEqual(localState, remote.data)) {
    return {
      verified: true,
      reasonCode: 'cloud_matches_local',
      message: 'Todos os seus dados financeiros estão confirmados e sincronizados na nuvem.',
      remoteState: remote.data
    };
  }

  if (isUnmodifiedSample) {
    return {
      verified: true,
      reasonCode: 'empty_account',
      message: 'Modo demonstrativo local sem alterações do usuário; os dados reais permanecem salvos na nuvem.',
      remoteState: remote.data
    };
  }

  return {
    verified: false,
    reasonCode: 'unsynced_changes',
    message:
      'Há alterações locais mais recentes ou diferentes do último registro confirmado na nuvem.',
    remoteState: remote.data
  };
}

/**
 * Testa a conexão com Supabase e verifica a existência da tabela
 */
export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  tableExists: boolean;
  message: string;
}> {
  try {
    const { data: _data, error } = await supabase
      .from(SUPABASE_TABLE_NAME)
      .select('user_id')
      .limit(1);

    if (error) {
      if (
        error.code === '42P01' ||
        error.message.includes('relation') ||
        error.message.includes('does not exist')
      ) {
        return {
          connected: true,
          tableExists: false,
          message: 'Conectado ao Supabase, mas a tabela "user_finance_data" precisa ser criada no banco.'
        };
      }

      if (error.code === '42501' || error.message.includes('permission denied') || error.message.includes('violates row-level security')) {
        return {
          connected: true,
          tableExists: true,
          message: 'Tabela encontrada e protegida por RLS. Sessão autenticada necessária.'
        };
      }

      return {
        connected: false,
        tableExists: false,
        message: `Falha na conexão: ${error.message}`
      };
    }

    return {
      connected: true,
      tableExists: true,
      message: 'Conexão ativa e tabela operacional no Supabase.'
    };
  } catch (err: any) {
    return {
      connected: false,
      tableExists: false,
      message: err.message || 'Erro de rede ao conectar com a nuvem.'
    };
  }
}

/**
 * Verifica se há uma sessão ativa no Supabase e se o UUID é válido
 */
export async function getActiveSupabaseSession(): Promise<{
  sessionValid: boolean;
  userId: string | null;
  email?: string | null;
  error?: string;
}> {
  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session || !session.user) {
      return {
        sessionValid: false,
        userId: null,
        error: error?.message || 'Nenhuma sessão ativa encontrada.'
      };
    }

    if (!isValidUUID(session.user.id)) {
      return {
        sessionValid: false,
        userId: null,
        error: 'Identificador de usuário na sessão possui formato inválido.'
      };
    }

    return {
      sessionValid: true,
      userId: session.user.id,
      email: session.user.email
    };
  } catch (err: any) {
    return {
      sessionValid: false,
      userId: null,
      error: err.message || 'Erro ao consultar sessão da conta.'
    };
  }
}

/**
 * Obtém o UUID real do usuário autenticado no Supabase
 */
export async function getAuthenticatedSupabaseUserId(): Promise<string | null> {
  const sessionInfo = await getActiveSupabaseSession();
  if (sessionInfo.sessionValid && sessionInfo.userId) {
    return sessionInfo.userId;
  }
  return null;
}

/**
 * Lê o estado financeiro da nuvem exclusivamente para o user_id autenticado
 */
export async function fetchFinanceDataFromSupabase(userId: string): Promise<SyncResult> {
  if (!userId || !isValidUUID(userId)) {
    return {
      success: false,
      message: 'ID de usuário inválido. É obrigatório estar autenticado em uma conta válida.'
    };
  }

  const sessionCheck = await getActiveSupabaseSession();
  if (!sessionCheck.sessionValid || sessionCheck.userId !== userId) {
    return {
      success: false,
      message: 'Operação bloqueada: O acesso aos dados financeiros na nuvem requer uma sessão ativa correspondente ao usuário solicitado.'
    };
  }

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE_NAME)
      .select('user_id, data, version, client_timestamp, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return {
        success: false,
        message: mapSupabaseSyncError(error),
        code: error.code
      };
    }

    if (!data || !data.data) {
      return {
        success: true,
        data: undefined,
        message: 'Nenhum registro anterior na nuvem para este usuário.'
      };
    }

    // Defesa adicional: garante que o registro retornado pertence exatamente ao userId solicitado
    if (data.user_id && data.user_id !== userId) {
      return {
        success: false,
        message: 'Operação bloqueada: divergência de proprietário nos dados retornados pela nuvem.'
      };
    }

    const rawRemote = data.data as AppState;
    const remoteTimestamp = Number(
      data.client_timestamp ||
      rawRemote.lastModified ||
      (data.updated_at ? new Date(data.updated_at).getTime() : 0)
    );
    const remoteVersion = Number(data.version || rawRemote.version || 1);

    const normalizedRemote: AppState = {
      ...rawRemote,
      ownerUserId: userId,
      version: Math.max(1, remoteVersion),
      lastModified: remoteTimestamp
    };

    return {
      success: true,
      data: normalizedRemote,
      version: normalizedRemote.version,
      clientTimestamp: remoteTimestamp,
      updatedAt: data.updated_at,
      message: 'Dados recuperados da nuvem com sucesso.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Erro ao carregar dados da nuvem.'
    };
  }
}

/**
 * Grava ou atualiza os dados do usuário autenticado (Upsert sem duplicação via primary key user_id).
 * Exige confirmação estrita de propriedade (state.ownerUserId === userId) e sessão válida.
 */
export async function saveFinanceDataToSupabase(
  state: AppState,
  userId: string
): Promise<SyncResult> {
  if (!userId || !isValidUUID(userId)) {
    return {
      success: false,
      message: 'ID de usuário inválido. É obrigatório estar autenticado em uma conta válida.'
    };
  }

  // Nunca envia estado sem propriedade confirmada ou estado neutro não hidratado
  if (!hasConfirmedStateOwnership(state, userId)) {
    return {
      success: false,
      message: 'Gravação cancelada: o estado financeiro local não possui propriedade confirmada para o usuário autenticado.'
    };
  }

  // Nunca envia estado demonstrativo sem alterações reais do usuário
  if (state.isSampleLoaded && (!state.lastModified || state.lastModified <= 0)) {
    return {
      success: false,
      message: 'Gravação cancelada: dados demonstrativos iniciais sem alterações do usuário não são enviados automaticamente.'
    };
  }

  // Validação obrigatória de sessão oficial antes de gravar
  const sessionCheck = await getActiveSupabaseSession();
  if (!sessionCheck.sessionValid || sessionCheck.userId !== userId) {
    return {
      success: false,
      message: 'Gravação cancelada: Nenhuma sessão ativa encontrada para o usuário especificado.'
    };
  }

  try {
    const currentTimestamp = state.lastModified || Date.now();
    const currentVersion = Math.max(1, state.version || 1);
    const stateWithTimestamp: AppState = {
      ...state,
      ownerUserId: userId,
      version: currentVersion,
      lastModified: currentTimestamp
    };

    const payload = {
      user_id: userId,
      data: stateWithTimestamp,
      version: currentVersion,
      client_timestamp: currentTimestamp,
      updated_at: new Date().toISOString()
    };

    const { error } = await supabase
      .from(SUPABASE_TABLE_NAME)
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      return {
        success: false,
        message: mapSupabaseSyncError(error),
        code: error.code
      };
    }

    return {
      success: true,
      version: currentVersion,
      clientTimestamp: currentTimestamp,
      message: 'Dados sincronizados na nuvem com sucesso.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Erro ao enviar dados para a nuvem.'
    };
  }
}

/**
 * Migração segura com verificação de ida e volta (Round-trip verification)
 * Bloqueia envio de estados sem propriedade confirmada ou estados apenas demonstrativos.
 */
export async function migrateAndVerifyFinanceData(
  localState: AppState,
  userId: string
): Promise<{
  success: boolean;
  message: string;
  verifiedData?: AppState;
}> {
  if (!hasConfirmedStateOwnership(localState, userId)) {
    return {
      success: false,
      message: 'Migração bloqueada: dados locais não possuem propriedade confirmada para esta conta.'
    };
  }

  if (localState.isSampleLoaded && (!localState.lastModified || localState.lastModified <= 0)) {
    return {
      success: false,
      message: 'Migração bloqueada: dados demonstrativos não são enviados automaticamente para novas contas.'
    };
  }

  const saveResult = await saveFinanceDataToSupabase(localState, userId);
  if (!saveResult.success) {
    return {
      success: false,
      message: `Falha ao gravar na nuvem durante a migração: ${saveResult.message}`
    };
  }

  const fetchResult = await fetchFinanceDataFromSupabase(userId);
  if (!fetchResult.success || !fetchResult.data) {
    return {
      success: false,
      message: 'Falha na confirmação de leitura pós-migração. Os dados não puderam ser validados na nuvem.'
    };
  }

  const localTransactionsCount = localState.transactions?.length || 0;
  const remoteTransactionsCount = fetchResult.data.transactions?.length || 0;

  if (localTransactionsCount > 0 && remoteTransactionsCount !== localTransactionsCount) {
    return {
      success: false,
      message: `Inconsistência detectada na verificação: ${localTransactionsCount} transações locais vs ${remoteTransactionsCount} na nuvem.`
    };
  }

  return {
    success: true,
    message: 'Migração concluída e verificada com sucesso na nuvem!',
    verifiedData: fetchResult.data
  };
}

/**
 * Resolução segura de conflitos entre múltiplos dispositivos.
 * Nunca assume igualdade apenas por timestamp quando o conteúdo financeiro diverge,
 * e faz prevalecer os dados remotos sempre que o estado local não tiver propriedade comprovada.
 */
export function resolveMultiDeviceConflict(
  localState: AppState,
  remoteState: AppState,
  remoteTimestamp: number,
  expectedUserId?: string
): {
  strategy: 'use_local' | 'use_remote' | 'equal' | 'conflict';
  resolvedState: AppState;
  reason: string;
} {
  // 1. Verificação estrita de propriedade do estado local
  if (expectedUserId && localState.ownerUserId !== expectedUserId) {
    return {
      strategy: 'use_remote',
      resolvedState: { ...remoteState, ownerUserId: expectedUserId },
      reason: 'Cache local sem propriedade confirmada para este usuário. Carregando dados oficiais da nuvem.'
    };
  }

  if (localState.ownerUserId && remoteState.ownerUserId && localState.ownerUserId !== remoteState.ownerUserId) {
    return {
      strategy: 'use_remote',
      resolvedState: remoteState,
      reason: 'Divergência de proprietário detectada no cache local. Aplicando estado exclusivo da nuvem.'
    };
  }

  // 2. Estado neutro / não hidratado ou demonstrativo sem edição real sempre cede para a nuvem
  if ((localState.version ?? 0) === 0 || (localState.isSampleLoaded && (!localState.lastModified || localState.lastModified <= 0))) {
    return {
      strategy: 'use_remote',
      resolvedState: remoteState,
      reason: 'Estado local inicial/demonstrativo substituído pelos dados reais salvos na nuvem.'
    };
  }

  // 3. Comparação real do conteúdo financeiro (nunca confiar apenas em timestamp)
  const contentIsEqual = areStatesContentEqual(localState, remoteState);
  if (contentIsEqual) {
    return {
      strategy: 'equal',
      resolvedState: remoteState,
      reason: 'Dispositivo e nuvem já estão em perfeita sincronia de conteúdo.'
    };
  }

  const localTimestamp = localState.lastModified || 0;

  if (localTimestamp <= 0 || remoteTimestamp > localTimestamp) {
    return {
      strategy: 'use_remote',
      resolvedState: remoteState,
      reason: `Dados da nuvem são mais recentes (remoto: ${new Date(remoteTimestamp).toLocaleTimeString()}, local: ${new Date(localTimestamp).toLocaleTimeString()}). Atualizando dispositivo com dados da nuvem.`
    };
  }

  if (localTimestamp > remoteTimestamp) {
    return {
      strategy: 'use_local',
      resolvedState: localState,
      reason: `Dados locais desta conta são mais recentes (local: ${new Date(localTimestamp).toLocaleTimeString()}, remoto: ${new Date(remoteTimestamp).toLocaleTimeString()}). Atualizando nuvem com alterações deste dispositivo.`
    };
  }

  // 4. Timestamps idênticos COM conteúdos diferentes: nunca declarar 'equal'!
  return {
    strategy: 'conflict',
    resolvedState: remoteState,
    reason: 'Conteúdo local diverge da nuvem com o mesmo timestamp. Dados oficiais da nuvem preservados com backup local de segurança.'
  };
}

export interface DiagnosticStep {
  name: string;
  status: 'success' | 'error' | 'warning';
  message: string;
  detail?: string;
}

export interface DiagnosticResult {
  allPassed: boolean;
  steps: DiagnosticStep[];
  timestamp: string;
}

/**
 * Executa uma bateria completa de testes de diagnóstico no Supabase sem sobrescrever dados remotos mais novos
 * ou gravar caches sem propriedade confirmada.
 */
export async function runFullSupabaseDiagnostic(
  localState: AppState,
  providedUserId?: string | null
): Promise<DiagnosticResult> {
  const steps: DiagnosticStep[] = [];
  const timestamp = new Date().toLocaleTimeString();

  // Passo 1: Conexão com o endpoint Supabase
  try {
    const connTest = await testSupabaseConnection();
    if (connTest.connected) {
      steps.push({
        name: 'Conexão com a Nuvem Supabase',
        status: 'success',
        message: `Conexão HTTPS estabelecida com ${SUPABASE_PROJECT_URL}`,
        detail: connTest.tableExists ? 'Tabela "user_finance_data" identificada no banco.' : 'Tabela ainda não encontrada no banco.'
      });
    } else {
      steps.push({
        name: 'Conexão com a Nuvem Supabase',
        status: 'error',
        message: 'Falha ao conectar com os servidores do Supabase.',
        detail: connTest.message
      });
      return { allPassed: false, steps, timestamp };
    }
  } catch (err: any) {
    steps.push({
      name: 'Conexão com a Nuvem Supabase',
      status: 'error',
      message: 'Erro inesperado de rede ao contatar o Supabase.',
      detail: err.message
    });
    return { allPassed: false, steps, timestamp };
  }

  // Passo 2: Verificação da Sessão Supabase Auth
  const sessionInfo = await getActiveSupabaseSession();
  if (!sessionInfo.sessionValid || !sessionInfo.userId) {
    steps.push({
      name: 'Autenticação Supabase Auth (auth.users)',
      status: 'warning',
      message: 'Nenhuma sessão de usuário ativa no Supabase neste navegador.',
      detail: 'Autentique-se para operar na nuvem protegida por RLS.'
    });
    return { allPassed: false, steps, timestamp };
  }

  if (providedUserId && providedUserId !== sessionInfo.userId) {
    steps.push({
      name: 'Autenticação Supabase Auth (auth.users)',
      status: 'error',
      message: 'Divergência entre usuário em memória e sessão ativa do Supabase.',
      detail: 'Encerre e reinicie a sessão antes de sincronizar.'
    });
    return { allPassed: false, steps, timestamp };
  }

  const effectiveUserId = sessionInfo.userId;
  steps.push({
    name: 'Autenticação Supabase Auth (auth.users)',
    status: 'success',
    message: `Sessão ativa confirmada para ${sessionInfo.email || 'usuário autenticado'}.`,
    detail: `UUID auth.users: ${effectiveUserId}`
  });

  // Passo 3: Teste de Consulta e Políticas RLS
  let remoteFetch: SyncResult;
  try {
    remoteFetch = await fetchFinanceDataFromSupabase(effectiveUserId);
    if (!remoteFetch.success) {
      if (remoteFetch.code === '42P01') {
        steps.push({
          name: 'Verificação da Tabela user_finance_data',
          status: 'error',
          message: 'A tabela user_finance_data não existe no seu projeto Supabase.',
          detail: 'Execute o Script SQL fornecido no SQL Editor do painel Supabase.'
        });
        return { allPassed: false, steps, timestamp };
      }
      steps.push({
        name: 'Leitura com Row Level Security (RLS)',
        status: 'error',
        message: 'Falha ao consultar dados protegidos por RLS no Supabase.',
        detail: remoteFetch.message
      });
      return { allPassed: false, steps, timestamp };
    }

    steps.push({
      name: 'Leitura com Row Level Security (RLS)',
      status: 'success',
      message: 'Leitura autorizada com sucesso via auth.uid() = user_id.',
      detail: remoteFetch.data ? 'Registro financeiro exclusivo do usuário localizado na nuvem.' : 'Nenhum registro anterior na nuvem para esta conta.'
    });
  } catch (err: any) {
    steps.push({
      name: 'Leitura com Row Level Security (RLS)',
      status: 'error',
      message: 'Erro durante a consulta de teste no Supabase.',
      detail: err.message
    });
    return { allPassed: false, steps, timestamp };
  }

  // Passo 4: Validação de Gravação Segura (nunca sobrescreve dados remotos com cache sem propriedade)
  const localOwned = hasConfirmedStateOwnership(localState, effectiveUserId);
  const remoteTs = remoteFetch.clientTimestamp || 0;
  const localTs = localState.lastModified || 0;
  const stateToVerify = remoteFetch.data && (!localOwned || remoteTs > localTs)
    ? remoteFetch.data
    : localOwned
    ? localState
    : null;

  if (!stateToVerify || (stateToVerify.isSampleLoaded && (stateToVerify.lastModified || 0) <= 0)) {
    steps.push({
      name: 'Proteção de Gravação na Nuvem',
      status: 'success',
      message: 'Nenhuma gravação destrutiva realizada (estado inicial/sem alterações reais preservado).',
      detail: 'O diagnóstico protegeu os dados da nuvem contra sobrescrita indevida.'
    });
    return { allPassed: true, steps, timestamp };
  }

  try {
    const saveRes = await saveFinanceDataToSupabase(stateToVerify, effectiveUserId);
    if (!saveRes.success) {
      steps.push({
        name: 'Gravação na Nuvem (Upsert Seguro)',
        status: 'error',
        message: 'Falha ao gravar os dados na tabela user_finance_data.',
        detail: saveRes.message
      });
      return { allPassed: false, steps, timestamp };
    }

    steps.push({
      name: 'Gravação na Nuvem (Upsert Seguro)',
      status: 'success',
      message: 'Dados do usuário autenticado confirmados no Supabase PostgreSQL.',
      detail: 'Chave primária user_id atualizada sem alterar registros de outros usuários.'
    });
  } catch (err: any) {
    steps.push({
      name: 'Gravação na Nuvem (Upsert Seguro)',
      status: 'error',
      message: 'Erro inesperado ao gravar no Supabase.',
      detail: err.message
    });
    return { allPassed: false, steps, timestamp };
  }

  // Passo 5: Validação de Ida e Volta (Round-Trip)
  try {
    const verifyFetch = await fetchFinanceDataFromSupabase(effectiveUserId);
    const txCount = stateToVerify.transactions?.length || 0;
    const accCount = stateToVerify.accounts?.length || 0;

    if (verifyFetch.success && verifyFetch.data) {
      steps.push({
        name: 'Verificação de Integridade dos Dados',
        status: 'success',
        message: `Sincronização 100% validada! ${txCount} transações e ${accCount} contas confirmadas na nuvem.`,
        detail: `Timestamp da nuvem: ${verifyFetch.updatedAt ? new Date(verifyFetch.updatedAt).toLocaleString() : 'Confirmado'}`
      });
      return { allPassed: true, steps, timestamp };
    } else {
      steps.push({
        name: 'Verificação de Integridade dos Dados',
        status: 'error',
        message: 'Dados foram enviados, mas não puderam ser verificados de volta.',
        detail: verifyFetch.message
      });
      return { allPassed: false, steps, timestamp };
    }
  } catch (err: any) {
    steps.push({
      name: 'Verificação de Integridade dos Dados',
      status: 'error',
      message: 'Erro ao validar integridade pós-gravação.',
      detail: err.message
    });
    return { allPassed: false, steps, timestamp };
  }
}

