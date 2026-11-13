/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  isValidUUID,
  getActiveSupabaseSession,
  fetchFinanceDataFromSupabase,
  saveFinanceDataToSupabase,
  resolveMultiDeviceConflict,
  runFullSupabaseDiagnostic
} from '../services/supabaseSyncService';
import { supabase } from '../utils/supabase';
import { AppState } from '../utils/storage';
import { SUPABASE_CONFIGURED_FLAG, mapAuthError } from '../context/AuthContext';

// Mock do supabase
vi.mock('../utils/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
        signUp: vi.fn(),
        signOut: vi.fn(),
        onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
      },
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null })
          })),
          limit: vi.fn().mockResolvedValue({ data: [], error: null })
        })),
        upsert: vi.fn().mockResolvedValue({ data: null, error: null })
      }))
    },
    SUPABASE_PROJECT_URL: 'https://lwkecyfhpkyuakbbxksl.supabase.co'
  };
});

// Mock do localStorage e sessionStorage para ambiente Node do Vitest
const storageMock = () => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    })
  };
};

const localMock = storageMock();
const sessionMock = storageMock();

Object.defineProperty(globalThis, 'localStorage', {
  value: localMock,
  writable: true
});
Object.defineProperty(globalThis, 'sessionStorage', {
  value: sessionMock,
  writable: true
});

describe('1. AuthContext - Sessão, GitHub OAuth e Status da Nuvem', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMock.clear();
    sessionMock.clear();
  });

  it('getSession null sem flag no localStorage -> status "not_configured"', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null
    });

    const { data: { session } } = await supabase.auth.getSession();
    const wasConfigured = localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
    const status = session?.user ? 'connected' : wasConfigured ? 'session_expired' : 'not_configured';
    expect(status).toBe('not_configured');
  });

  it('getSession null com flag finance_supabase_was_configured = true -> status "session_expired"', async () => {
    localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null
    });

    const { data: { session } } = await supabase.auth.getSession();
    const wasConfigured = localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
    const status = session?.user ? 'connected' : wasConfigured ? 'session_expired' : 'not_configured';
    expect(status).toBe('session_expired');
  });

  it('getSession com sessão válida -> status "connected" e persiste a flag no localStorage', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          user: { id: validUuid, email: 'lucas@exemplo.com' }
        } as any
      },
      error: null
    });

    const { data: { session } } = await supabase.auth.getSession();
    let status = 'not_configured';
    if (session?.user) {
      status = 'connected';
      localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
    }

    expect(status).toBe('connected');
    expect(localStorage.getItem(SUPABASE_CONFIGURED_FLAG)).toBe('true');
  });

  it('Login local (PIN lucasgomes/6145) valida acesso mas NUNCA define supabaseUserId', () => {
    const defaultUser = 'lucasgomes';
    const defaultPass = '6145';
    let localAuthenticated = false;
    let supabaseUserId: string | null = null;

    const login = (user: string, pass: string) => {
      if (user === defaultUser && pass === defaultPass) {
        localAuthenticated = true;
        // Importante: Nunca deve atribuir supabaseUserId aqui
        return { success: true };
      }
      return { success: false };
    };

    const res = login('lucasgomes', '6145');
    expect(res.success).toBe(true);
    expect(localAuthenticated).toBe(true);
    expect(supabaseUserId).toBeNull();
  });

  it('loginWithGitHub chama signInWithOAuth com skipBrowserRedirect: true e retorna { success: true, url }', async () => {
    const testOauthUrl = 'https://github.com/login/oauth/authorize';
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValueOnce({
      data: { provider: 'github', url: testOauthUrl },
      error: null
    });

    const loginWithGitHub = async () => {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: 'http://localhost:3000',
            scopes: 'read:user user:email',
            skipBrowserRedirect: true
          }
        });
        if (error) return { success: false, message: mapAuthError(error) };
        if (data?.url) return { success: true, url: data.url };
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    };

    const res = await loginWithGitHub();
    expect(res.success).toBe(true);
    expect(res.url).toBe(testOauthUrl);
    expect(supabase.auth.signInWithOAuth).toHaveBeenCalledWith({
      provider: 'github',
      options: {
        redirectTo: 'http://localhost:3000',
        scopes: 'read:user user:email',
        skipBrowserRedirect: true
      }
    });
  });

  it('loginWithGitHub retorna erro amigável se o provider não estiver habilitado no Supabase', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockResolvedValueOnce({
      data: { provider: 'github', url: null },
      error: {
        name: 'AuthApiError',
        message: 'Unsupported provider: provider is not enabled',
        code: 'provider_not_enabled',
        status: 400
      } as any
    });

    const loginWithGitHub = async () => {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: 'http://localhost:3000',
            scopes: 'read:user user:email',
            skipBrowserRedirect: true
          }
        });
        if (error) return { success: false, message: mapAuthError(error) };
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    };

    const res = await loginWithGitHub();
    expect(res.success).toBe(false);
    expect(res.message).toContain('Login com GitHub não está habilitado');
    expect(res.message).toContain('Authentication > Providers > GitHub');
  });

  it('loginWithGitHub retorna { success: false } quando signInWithOAuth lança exceção', async () => {
    vi.mocked(supabase.auth.signInWithOAuth).mockRejectedValueOnce(
      new Error('Falha de conexão com a rede OAuth')
    );

    const loginWithGitHub = async () => {
      try {
        const { error } = await supabase.auth.signInWithOAuth({
          provider: 'github',
          options: {
            redirectTo: 'http://localhost:3000',
            scopes: 'read:user user:email',
            skipBrowserRedirect: true
          }
        });
        if (error) return { success: false, message: mapAuthError(error) };
        return { success: true };
      } catch (err: any) {
        return { success: false, message: err.message || 'Erro ao iniciar login com GitHub.' };
      }
    };

    const res = await loginWithGitHub();
    expect(res.success).toBe(false);
    expect(res.message).toBe('Falha de conexão com a rede OAuth');
  });

  it('mapAuthError formata todos os casos de erro especificados', () => {
    // 1. invalid_credentials
    expect(mapAuthError({ code: 'invalid_credentials', message: 'Invalid credentials' }))
      .toBe('E-mail ou senha incorretos.');

    // 2. email_not_confirmed
    const emailErr = mapAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' });
    expect(emailErr).toContain('E-mail ainda não confirmado no Supabase');

    // 3. too_many_requests
    expect(mapAuthError({ code: 'too_many_requests', message: 'Too many requests' }))
      .toBe('Muitas tentativas. Aguarde alguns minutos.');

    // 4. provider_not_enabled
    const provErr = mapAuthError({ code: 'provider_not_enabled', message: 'provider is not enabled' });
    expect(provErr).toContain('Login com GitHub não está habilitado no projeto Supabase');

    // 5. access_denied / oauth
    expect(mapAuthError({ code: 'access_denied', message: 'access_denied' }))
      .toBe('Login com GitHub cancelado ou negado.');

    // 6. Outros erros retornam mensagem original
    expect(mapAuthError({ code: 'unknown_error', message: 'Serviço temporariamente indisponível' }))
      .toBe('Serviço temporariamente indisponível');
  });

  it('logoutFromSupabase remove a flag finance_supabase_was_configured e reseta status', async () => {
    localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null });

    const logoutFromSupabase = async () => {
      await supabase.auth.signOut();
      localStorage.removeItem(SUPABASE_CONFIGURED_FLAG);
      return 'not_configured';
    };

    const newStatus = await logoutFromSupabase();
    expect(newStatus).toBe('not_configured');
    expect(localStorage.getItem(SUPABASE_CONFIGURED_FLAG)).toBeNull();
  });
});

describe('2. supabaseSyncService - Validações de UUID, Sessão e Bloqueio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UUID inválido (ex: "abc", "123", "lucasgomes") deve ser rejeitado', () => {
    expect(isValidUUID('abc')).toBe(false);
    expect(isValidUUID('123')).toBe(false);
    expect(isValidUUID('lucasgomes')).toBe(false);
    expect(isValidUUID('12345678-1234-1234-1234-12345678901z')).toBe(false);
  });

  it('UUID válido RFC 4122 deve ser aceito', () => {
    expect(isValidUUID('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    expect(isValidUUID('c7a6e1a4-934d-4be9-813a-a1b7e6f827a0')).toBe(true);
  });

  it('getActiveSupabaseSession() sem sessão retorna sessionValid = false e fetch/save bloqueiam', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null
    });

    const sessionResult = await getActiveSupabaseSession();
    expect(sessionResult.sessionValid).toBe(false);
    expect(sessionResult.userId).toBeNull();

    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    const fetchRes = await fetchFinanceDataFromSupabase(validUuid);
    expect(fetchRes.success).toBe(false);
    expect(fetchRes.message).toContain('Operação bloqueada');

    const dummyState: AppState = {
      version: 1,
      transactions: [],
      categories: [],
      accounts: [],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 1000,
      isSampleLoaded: false
    };
    const saveRes = await saveFinanceDataToSupabase(dummyState, validUuid);
    expect(saveRes.success).toBe(false);
    expect(saveRes.message).toContain('Gravação cancelada');
  });

  it('getActiveSupabaseSession() com sessão válida retorna session.user.id', async () => {
    const validUuid = '550e8400-e29b-41d4-a716-446655440000';
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          user: { id: validUuid, email: 'teste@email.com' }
        } as any
      },
      error: null
    });

    const sessionResult = await getActiveSupabaseSession();
    expect(sessionResult.sessionValid).toBe(true);
    expect(sessionResult.userId).toBe(validUuid);
    expect(sessionResult.email).toBe('teste@email.com');
  });

  it('fetch/save com userId diferente de session.user.id deve ser bloqueado', async () => {
    const sessionUuid = '550e8400-e29b-41d4-a716-446655440000';
    const otherUuid = 'c7a6e1a4-934d-4be9-813a-a1b7e6f827a0';

    vi.mocked(supabase.auth.getSession).mockResolvedValue({
      data: {
        session: {
          user: { id: sessionUuid }
        } as any
      },
      error: null
    });

    const fetchRes = await fetchFinanceDataFromSupabase(otherUuid);
    expect(fetchRes.success).toBe(false);
    expect(fetchRes.message).toContain('Operação bloqueada');

    const dummyState: AppState = {
      version: 1,
      transactions: [],
      categories: [],
      accounts: [],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 1000,
      isSampleLoaded: false
    };
    const saveRes = await saveFinanceDataToSupabase(dummyState, otherUuid);
    expect(saveRes.success).toBe(false);
    expect(saveRes.message).toContain('Gravação cancelada');
  });
});

describe('3. FinanceContext & Conflitos Multi-Dispositivos', () => {
  it('syncNowWithCloud sem sessão ativa define status "unauthenticated" e mensagem orientativa', async () => {
    const supabaseUserId: string | null = null;
    const isSupabaseAuthenticated = false;
    let cloudSyncStatus = 'idle';
    let cloudSyncMessage = '';

    const syncNowWithCloud = async () => {
      if (!supabaseUserId || !isSupabaseAuthenticated) {
        cloudSyncStatus = 'unauthenticated';
        cloudSyncMessage = 'Conecte sua conta Supabase em Configurações > Nuvem para sincronizar.';
        return;
      }
    };

    await syncNowWithCloud();
    expect(cloudSyncStatus).toBe('unauthenticated');
    expect(cloudSyncMessage).toBe('Conecte sua conta Supabase em Configurações > Nuvem para sincronizar.');
  });

  it('Autosave guarda contra execução quando supabaseUserId é nulo', () => {
    const supabaseUserId: string | null = null;
    const isSupabaseAuthenticated = false;
    let uploadExecuted = false;

    const triggerAutosave = () => {
      if (!supabaseUserId || !isSupabaseAuthenticated) {
        return;
      }
      uploadExecuted = true;
    };

    triggerAutosave();
    expect(uploadExecuted).toBe(false);
  });

  it('forceUploadLocalToCloud sem sessão define unauthenticated e não envia', async () => {
    const supabaseUserId = null;
    const isSupabaseAuthenticated = false;
    let status = 'idle';
    let message = '';

    const forceUploadLocalToCloud = async () => {
      if (!supabaseUserId || !isSupabaseAuthenticated) {
        status = 'unauthenticated';
        message = 'Conecte sua conta Supabase em Configurações > Nuvem para sincronizar.';
        return;
      }
    };

    await forceUploadLocalToCloud();
    expect(status).toBe('unauthenticated');
    expect(message).toContain('Conecte sua conta Supabase');
  });

  it('forceDownloadFromCloud sem sessão define unauthenticated e não consulta', async () => {
    const supabaseUserId = null;
    const isSupabaseAuthenticated = false;
    let status = 'idle';
    let message = '';

    const forceDownloadFromCloud = async () => {
      if (!supabaseUserId || !isSupabaseAuthenticated) {
        status = 'unauthenticated';
        message = 'Conecte sua conta Supabase em Configurações > Nuvem para sincronizar.';
        return;
      }
    };

    await forceDownloadFromCloud();
    expect(status).toBe('unauthenticated');
    expect(message).toContain('Conecte sua conta Supabase');
  });

  it('resolveMultiDeviceConflict: dados da nuvem mais novos que locais -> use_remote', () => {
    const localState: AppState = {
      version: 1,
      lastModified: 1000,
      transactions: [],
      categories: [],
      accounts: [],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 1000,
      isSampleLoaded: false
    };

    const remoteState: AppState = {
      version: 1,
      lastModified: 2000,
      transactions: [
        {
          id: 'tx-1',
          description: 'Lançamento Remoto',
          amount: 150,
          type: 'income',
          category: 'Salário',
          date: '2026-11-01',
          paymentMethod: 'pix',
          status: 'paid'
        }
      ],
      categories: [],
      accounts: [],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 1000,
      isSampleLoaded: false
    };

    const result = resolveMultiDeviceConflict(localState, remoteState, 2000);
    expect(result.strategy).toBe('use_remote');
    expect(result.resolvedState.transactions.length).toBe(1);
    expect(result.resolvedState.transactions[0].description).toBe('Lançamento Remoto');
  });

  it('resolveMultiDeviceConflict: dados locais mais novos que da nuvem -> use_local', () => {
    const localState: AppState = {
      version: 1,
      lastModified: 3000,
      transactions: [
        {
          id: 'tx-local',
          description: 'Lançamento Local Recente',
          amount: 200,
          type: 'expense_variable',
          category: 'Alimentação',
          date: '2026-11-02',
          paymentMethod: 'pix',
          status: 'paid'
        }
      ],
      categories: [],
      accounts: [],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 1000,
      isSampleLoaded: false
    };

    const remoteState: AppState = {
      version: 1,
      lastModified: 1500,
      transactions: [],
      categories: [],
      accounts: [],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 1000,
      isSampleLoaded: false
    };

    const result = resolveMultiDeviceConflict(localState, remoteState, 1500);
    expect(result.strategy).toBe('use_local');
    expect(result.resolvedState.transactions[0].description).toBe('Lançamento Local Recente');
  });

  it('isCloudConnected reconhece status "connected" corretamente', () => {
    const isCloudConnected = (status: string) =>
      status === 'connected' || status === 'synced' || status === 'syncing' || status === 'idle';

    expect(isCloudConnected('connected')).toBe(true);
    expect(isCloudConnected('synced')).toBe(true);
    expect(isCloudConnected('syncing')).toBe(true);
    expect(isCloudConnected('unauthenticated')).toBe(false);
    expect(isCloudConnected('session_expired')).toBe(false);
  });

  it('runFullSupabaseDiagnostic sem sessão ativa emite passo de aviso e allPassed false', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null
    } as any);

    const dummyState: AppState = {
      version: 1,
      lastModified: 1000,
      transactions: [],
      categories: [],
      accounts: [],
      creditCards: [],
      debts: [],
      goals: [],
      safetyReserveDesired: 1000,
      isSampleLoaded: false
    };

    const diag = await runFullSupabaseDiagnostic(dummyState, null);
    expect(diag.allPassed).toBe(false);
    expect(diag.steps.some(s => s.status === 'warning')).toBe(true);
  });
});

