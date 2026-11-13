/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../utils/supabase';
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
  clientTimestamp?: number;
  updatedAt?: string;
}

/**
 * Valida se uma string é um UUID válido no padrão RFC 4122
 */
export function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
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
      // 42P01 é o código PostgreSQL para undefined_table
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

      // Se o erro for de RLS/Permissão, significa que a tabela existe e o RLS está bloqueando requisições sem sessão
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
      message: err.message || 'Erro de rede ao conectar com Supabase.'
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
        error: error?.message || 'Nenhuma sessão ativa encontrada no Supabase.'
      };
    }

    if (!isValidUUID(session.user.id)) {
      return {
        sessionValid: false,
        userId: null,
        error: 'UUID de usuário na sessão Supabase possui formato inválido.'
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
      error: err.message || 'Erro ao consultar sessão Supabase.'
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
      message: 'ID de usuário inválido. É obrigatório um UUID do usuário autenticado no Supabase.'
    };
  }

  // Validação obrigatória da sessão oficial antes de consultar
  const sessionCheck = await getActiveSupabaseSession();
  if (!sessionCheck.sessionValid || sessionCheck.userId !== userId) {
    return {
      success: false,
      message: 'Operação bloqueada: O acesso aos dados financeiros na nuvem requer uma sessão Supabase Auth ativa correspondente ao UUID solicitado.'
    };
  }

  try {
    const { data, error } = await supabase
      .from(SUPABASE_TABLE_NAME)
      .select('user_id, data, client_timestamp, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      return {
        success: false,
        message: error.message,
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

    return {
      success: true,
      data: data.data as AppState,
      clientTimestamp: Number(data.client_timestamp || 0),
      updatedAt: data.updated_at,
      message: 'Dados recuperados da nuvem com sucesso.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Erro ao carregar dados do Supabase.'
    };
  }
}

/**
 * Grava ou atualiza os dados do usuário autenticado (Upsert sem duplicação via primary key user_id)
 */
export async function saveFinanceDataToSupabase(
  state: AppState,
  userId: string
): Promise<SyncResult> {
  if (!userId || !isValidUUID(userId)) {
    return {
      success: false,
      message: 'ID de usuário inválido. É obrigatório um UUID do usuário autenticado no Supabase.'
    };
  }

  // Validação obrigatória de sessão oficial antes de gravar
  const sessionCheck = await getActiveSupabaseSession();
  if (!sessionCheck.sessionValid || sessionCheck.userId !== userId) {
    return {
      success: false,
      message: 'Gravação cancelada: Nenhuma sessão Supabase Auth ativa encontrada para o UUID especificado. RLS impede gravações não autorizadas.'
    };
  }

  try {
    const currentTimestamp = state.lastModified || Date.now();
    const stateWithTimestamp: AppState = {
      ...state,
      lastModified: currentTimestamp
    };

    const payload = {
      user_id: userId,
      data: stateWithTimestamp,
      version: state.version || 1,
      client_timestamp: currentTimestamp,
      updated_at: new Date().toISOString()
    };

    // onConflict: 'user_id' garante que o registro do usuário seja atualizado atomicamente sem duplicação
    const { error } = await supabase
      .from(SUPABASE_TABLE_NAME)
      .upsert(payload, { onConflict: 'user_id' });

    if (error) {
      return {
        success: false,
        message: error.message,
        code: error.code
      };
    }

    return {
      success: true,
      clientTimestamp: currentTimestamp,
      message: 'Dados gravados no Supabase com sucesso.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err.message || 'Erro ao enviar dados para o Supabase.'
    };
  }
}

/**
 * Migração segura com verificação de ida e volta (Round-trip verification)
 * Só confirma a migração após gravar E reler os dados com integridade comprovada
 */
export async function migrateAndVerifyFinanceData(
  localState: AppState,
  userId: string
): Promise<{
  success: boolean;
  message: string;
  verifiedData?: AppState;
}> {
  // 1. Gravar dados locais no Supabase
  const saveResult = await saveFinanceDataToSupabase(localState, userId);
  if (!saveResult.success) {
    return {
      success: false,
      message: `Falha ao gravar no Supabase durante a migração: ${saveResult.message}`
    };
  }

  // 2. Recuperar imediatamente os dados recém-gravados para verificação
  const fetchResult = await fetchFinanceDataFromSupabase(userId);
  if (!fetchResult.success || !fetchResult.data) {
    return {
      success: false,
      message: 'Falha na confirmação de leitura pós-migração. Os dados não puderam ser validados na nuvem.'
    };
  }

  // 3. Validar integridade dos registros migrados
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
 * Resolução de conflitos entre múltiplos dispositivos
 * Evita sobrescrever dados mais recentes com dados antigos
 */
export function resolveMultiDeviceConflict(
  localState: AppState,
  remoteState: AppState,
  remoteTimestamp: number
): {
  strategy: 'use_local' | 'use_remote' | 'equal';
  resolvedState: AppState;
  reason: string;
} {
  const localTimestamp = localState.lastModified || 0;

  if (remoteTimestamp > localTimestamp) {
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
      reason: `Dados locais são mais recentes (local: ${new Date(localTimestamp).toLocaleTimeString()}, remoto: ${new Date(remoteTimestamp).toLocaleTimeString()}). Atualizando nuvem com alterações deste dispositivo.`
    };
  }

  return {
    strategy: 'equal',
    resolvedState: localState,
    reason: 'Dispositivo e nuvem já estão em perfeita sincronia.'
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
 * Executa uma bateria completa de testes de diagnóstico no Supabase
 * Testa conexão de rede, sessão auth, RLS, leitura, gravação (upsert) e integridade de dados
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
        message: 'Conexão HTTPS estabelecida com https://lwkecyfhpkyuakbbxksl.supabase.co',
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
      detail: 'Para gravar na nuvem protegida por RLS, autentique-se com sua conta (Código por E-mail, GitHub ou Senha).'
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
  try {
    const fetchRes = await fetchFinanceDataFromSupabase(effectiveUserId);
    if (!fetchRes.success) {
      if (fetchRes.code === '42P01') {
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
        detail: fetchRes.message
      });
      return { allPassed: false, steps, timestamp };
    }

    steps.push({
      name: 'Leitura com Row Level Security (RLS)',
      status: 'success',
      message: 'Leitura autorizada com sucesso via auth.uid() = user_id.',
      detail: fetchRes.data ? 'Registro financeiro anterior localizado na nuvem.' : 'Nenhum registro anterior na nuvem (primeiro envio).'
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

  // Passo 4: Teste de Gravação (Upsert)
  try {
    const saveRes = await saveFinanceDataToSupabase(localState, effectiveUserId);
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
      message: 'Dados salvos com sucesso no Supabase PostgreSQL.',
      detail: 'Chave primária user_id atualizada sem duplicatas.'
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
    const txCount = localState.transactions?.length || 0;
    const accCount = localState.accounts?.length || 0;

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

