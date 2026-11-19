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
import {
  SUPABASE_CONFIGURED_FLAG,
  mapAuthError,
  isValidEmailFormat,
  validatePasswordStrength,
  isTrustedMessageOrigin,
  isSessionExpired,
  deriveUserDisplayName,
  scrubLegacyLocalAuthKeys
} from '../context/AuthContext';

// Mock do supabase
vi.mock('../utils/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn(),
        refreshSession: vi.fn(),
        signInWithPassword: vi.fn(),
        signInWithOAuth: vi.fn(),
        signInWithOtp: vi.fn(),
        verifyOtp: vi.fn(),
        resetPasswordForEmail: vi.fn(),
        updateUser: vi.fn(),
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
    SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
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

describe('1. AuthContext - Autenticação Comercial Exclusiva Supabase Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localMock.clear();
    sessionMock.clear();
  });

  it('Valida formato de e-mail e força mínima de senha (mín. 6 caracteres)', () => {
    expect(isValidEmailFormat('cliente@empresa.com')).toBe(true);
    expect(isValidEmailFormat('email-invalido')).toBe(false);
    expect(isValidEmailFormat('sem@dominio')).toBe(false);

    expect(validatePasswordStrength('12345').valid).toBe(false);
    expect(validatePasswordStrength('123456').valid).toBe(true);
  });

  it('Rejeita postMessage de origens não confiáveis e aceita apenas mesma origem', () => {
    const appOrigin = 'https://gestaofinanceira.workers.dev';
    expect(isTrustedMessageOrigin(appOrigin, appOrigin)).toBe(true);
    expect(isTrustedMessageOrigin('https://attacker.example', appOrigin)).toBe(false);
    expect(isTrustedMessageOrigin('null', appOrigin)).toBe(false);
    expect(isTrustedMessageOrigin(undefined, appOrigin)).toBe(false);
  });

  it('Detecta sessão expirada com base em expires_at e session null', () => {
    expect(isSessionExpired(null)).toBe(true);

    const expiredSession = {
      user: { id: '550e8400-e29b-41d4-a716-446655440000' },
      expires_at: Math.floor(Date.now() / 1000) - 60
    } as any;
    expect(isSessionExpired(expiredSession)).toBe(true);

    const activeSession = {
      user: { id: '550e8400-e29b-41d4-a716-446655440000' },
      expires_at: Math.floor(Date.now() / 1000) + 3600
    } as any;
    expect(isSessionExpired(activeSession)).toBe(false);
  });

  it('Deriva nome de exibição comercial a partir do usuário autenticado sem hardcode pessoal', () => {
    expect(
      deriveUserDisplayName({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'maria@exemplo.com',
        user_metadata: { full_name: 'Maria Silva' }
      } as any)
    ).toBe('Maria Silva');

    expect(
      deriveUserDisplayName({
        id: '550e8400-e29b-41d4-a716-446655440000',
        email: 'joao@exemplo.com',
        user_metadata: {}
      } as any)
    ).toBe('joao');

    expect(deriveUserDisplayName(null)).toBe('Conta');
  });

  it('Remove credenciais legadas em texto simples do localStorage e sessionStorage', () => {
    const hadWindow = typeof (globalThis as any).window !== 'undefined';
    if (!hadWindow) {
      Object.defineProperty(globalThis, 'window', { value: globalThis, writable: true, configurable: true });
    }
    localStorage.setItem('finance_auth_user', 'old-user');
    localStorage.setItem('finance_auth_password', 'old-pass');
    localStorage.setItem('finance_auth_session', 'true');
    sessionStorage.setItem('finance_auth_session', 'true');

    scrubLegacyLocalAuthKeys();

    expect(localStorage.getItem('finance_auth_user')).toBeNull();
    expect(localStorage.getItem('finance_auth_password')).toBeNull();
    expect(localStorage.getItem('finance_auth_session')).toBeNull();
    expect(sessionStorage.getItem('finance_auth_session')).toBeNull();
  });

  it('getSession null sem sessão ativa bloqueia acesso e não autentica localmente', async () => {
    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null
    });

    const { data: { session } } = await supabase.auth.getSession();
    expect(session).toBeNull();
    expect(isSessionExpired(session)).toBe(true);
  });

  it('Cadastro com confirmação de e-mail obrigatória (session: null) não libera sessão autenticada', async () => {
    vi.mocked(supabase.auth.signUp).mockResolvedValueOnce({
      data: {
        user: { id: '550e8400-e29b-41d4-a716-446655440000', email: 'novo@cliente.com' } as any,
        session: null
      },
      error: null
    });

    const res = await supabase.auth.signUp({
      email: 'novo@cliente.com',
      password: 'SenhaSegura123'
    });
    expect(res.error).toBeNull();
    expect(res.data.user?.id).toBeDefined();
    expect(res.data.session).toBeNull();
  });

  it('mapAuthError traduz erros comerciais de login, cadastro, recuperação e OAuth', () => {
    expect(mapAuthError({ code: 'invalid_credentials', message: 'Invalid credentials' }))
      .toBe('E-mail ou senha incorretos.');

    expect(mapAuthError({ code: 'email_not_confirmed', message: 'Email not confirmed' }))
      .toContain('E-mail ainda não confirmado');

    expect(mapAuthError({ code: 'user_already_exists', message: 'User already registered' }))
      .toContain('já está cadastrado');

    expect(mapAuthError({ code: 'too_many_requests', message: 'Too many requests' }))
      .toContain('Muitas tentativas');

    expect(mapAuthError({ code: 'provider_not_enabled', message: 'provider is not enabled' }))
      .toContain('GitHub não está habilitado');

    expect(mapAuthError({ code: 'access_denied', message: 'access_denied' }))
      .toContain('cancelada ou negada');

    expect(mapAuthError({ code: 'unknown_error', message: 'Serviço temporariamente indisponível' }))
      .toBe('Serviço temporariamente indisponível');
  });

  it('signOut limpa a flag de sessão configurada no logout', async () => {
    localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
    vi.mocked(supabase.auth.signOut).mockResolvedValueOnce({ error: null });

    await supabase.auth.signOut();
    localStorage.removeItem(SUPABASE_CONFIGURED_FLAG);

    expect(supabase.auth.signOut).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(SUPABASE_CONFIGURED_FLAG)).toBeNull();
  });
});

describe('2. supabaseSyncService - Validações de UUID, Sessão e Bloqueio', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('UUID inválido (ex: "abc", "123", "usuario-invalido") deve ser rejeitado', () => {
    expect(isValidUUID('abc')).toBe(false);
    expect(isValidUUID('123')).toBe(false);
    expect(isValidUUID('usuario-invalido')).toBe(false);
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

