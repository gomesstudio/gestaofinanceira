// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppState,
  DEFAULT_CATEGORIES,
  getUserStateFromStorage,
  saveStateToStorageForUser
} from '../utils/storage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const {
  USER_A,
  USER_B,
  authStateRef,
  logoutMock,
  upsertMock,
  limitMock,
  maybeSingleMock,
  getSessionMock
} = vi.hoisted(() => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';

  return {
    USER_A: userA,
    USER_B: userB,
    authStateRef: {
      current: {
        supabaseUserId: userA as string | null,
        supabaseUserEmail: 'conta-a@ficticio.com' as string | null,
        supabaseUserDisplayName: 'Conta A Fictícia',
        isSupabaseAuthenticated: true
      }
    },
    logoutMock: vi.fn(),
    upsertMock: vi.fn().mockResolvedValue({ data: null, error: null }),
    limitMock: vi.fn().mockResolvedValue({ data: [{ user_id: userA }], error: null }),
    maybeSingleMock: vi.fn(),
    getSessionMock: vi.fn()
  };
});

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } }))
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock
        })),
        limit: limitMock
      })),
      upsert: upsertMock
    }))
  },
  SUPABASE_PROJECT_URL: 'https://ficticio.supabase.co'
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    supabaseUserId: authStateRef.current.supabaseUserId,
    supabaseUserEmail: authStateRef.current.supabaseUserEmail,
    supabaseUserDisplayName: authStateRef.current.supabaseUserDisplayName,
    cloudAuthStatus: authStateRef.current.isSupabaseAuthenticated ? 'connected' : 'unauthenticated',
    isSupabaseAuthenticated: authStateRef.current.isSupabaseAuthenticated,
    logout: logoutMock,
    updatePassword: vi.fn(),
    signInWithSupabase: vi.fn(),
    loginWithGitHub: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    disconnectCloud: vi.fn(),
    checkSessionStatus: vi.fn()
  })
}));

import {
  FinanceContextType,
  FinanceProvider,
  useFinance
} from '../context/FinanceContext';
import { Header } from '../components/layout/Header';
import { SettingsView } from '../components/settings/SettingsView';

function createFixtureState(
  ownerUserId: string,
  version: number,
  amount: number,
  description = `Lançamento Fictício v${version}`
): AppState {
  return {
    ownerUserId,
    version,
    lastModified: 1700000000000 + version * 1000,
    transactions: [
      {
        id: `tx-${ownerUserId.slice(0, 4)}-${version}`,
        description,
        amount,
        type: 'income',
        category: 'Salário',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Fictícia',
        type: 'checking',
        balance: amount,
        color: '#10b981'
      }
    ],
    creditCards: [],
    debts: [],
    goals: [],
    safetyReserveDesired: 1000,
    isSampleLoaded: false
  };
}

function makeMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    }
  };
}

const ContextProbe: React.FC<{ onContext: (ctx: FinanceContextType) => void }> = ({ onContext }) => {
  const ctx = useFinance();
  onContext(ctx);
  return null;
};

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('MVP Express — Correção dos 3 Bloqueadores (100% mocks e dados fictícios)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const localMock = makeMockStorage();
    const sessionMock = makeMockStorage();
    Object.defineProperty(window, 'localStorage', { value: localMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localMock, writable: true, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: sessionMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: sessionMock, writable: true, configurable: true });

    authStateRef.current = {
      supabaseUserId: USER_A,
      supabaseUserEmail: 'conta-a@ficticio.com',
      supabaseUserDisplayName: 'Conta A Fictícia',
      isSupabaseAuthenticated: true
    };

    getSessionMock.mockImplementation(async () => ({
      data: {
        session: authStateRef.current.isSupabaseAuthenticated && authStateRef.current.supabaseUserId
          ? {
              user: {
                id: authStateRef.current.supabaseUserId,
                email: authStateRef.current.supabaseUserEmail
              },
              expires_at: Math.floor(Date.now() / 1000) + 3600
            }
          : null
      },
      error: null
    }));

    limitMock.mockResolvedValue({ data: [{ user_id: USER_A }], error: null });
    upsertMock.mockResolvedValue({ data: null, error: null });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1 e 2. Uma edição gera no máximo um upload sem loop posterior, e nova edição gera novo upload', async () => {
    const initialA = createFixtureState(USER_A, 5, 3000, 'Inicial v5');
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: initialA,
        version: 5,
        client_timestamp: initialA.lastModified,
        updated_at: '2026-11-17T01:00:00.000Z'
      },
      error: null
    });

    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    expect(latestCtx.isFinanceHydrated).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(0);

    // Edição 1 -> v6
    await act(async () => {
      latestCtx.addTransaction({
        description: 'Supermercado Fictício',
        amount: 120,
        type: 'expense_variable',
        category: 'Alimentação',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    expect(upsertMock).toHaveBeenCalledTimes(0);

    // Avança debounce de 2000ms -> dispara 1 único upload
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await flushMicrotasks();

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(upsertMock.mock.calls[0][0].version).toBe(6);
    expect(latestCtx.cloudSyncStatus).toBe('connected');

    // Avança mais 12s sem novas edições -> NÃO pode entrar em loop
    await act(async () => {
      await vi.advanceTimersByTimeAsync(12000);
    });
    await flushMicrotasks();
    expect(upsertMock).toHaveBeenCalledTimes(1);

    // Edição 2 -> v7 deve gerar exatamente mais 1 upload
    await act(async () => {
      latestCtx.addTransaction({
        description: 'Farmácia Fictícia',
        amount: 55,
        type: 'expense_variable',
        category: 'Saúde',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await flushMicrotasks();

    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(upsertMock.mock.calls[1][0].version).toBe(7);

    // Avança mais 10s -> permanece em 2 uploads
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    await flushMicrotasks();
    expect(upsertMock).toHaveBeenCalledTimes(2);
  });

  it('3 e 4. Falha de upload não marca como sincronizado e repetição posterior funciona', async () => {
    const initialA = createFixtureState(USER_A, 5, 3000, 'Base v5');
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: initialA,
        version: 5,
        client_timestamp: initialA.lastModified,
        updated_at: '2026-11-17T01:00:00.000Z'
      },
      error: null
    });

    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    upsertMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Falha temporária simulada', code: '503' }
    });

    await act(async () => {
      latestCtx.addTransaction({
        description: 'Edição com falha inicial',
        amount: 90,
        type: 'expense_variable',
        category: 'Outros',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await flushMicrotasks();

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(latestCtx.cloudSyncStatus).toBe('error');

    // Não entra em loop de retentativas em erro
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10000);
    });
    await flushMicrotasks();
    expect(upsertMock).toHaveBeenCalledTimes(1);

    // Repetição manual após falha (nuvem ainda está na v5 mais antiga, local está em v6 mais novo)
    upsertMock.mockResolvedValueOnce({ data: null, error: null });
    let retryOutcome: any;
    await act(async () => {
      retryOutcome = await latestCtx.forceUploadLocalToCloud();
    });
    await flushMicrotasks();

    expect(retryOutcome.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(2);
    expect(latestCtx.cloudSyncStatus).toBe('connected');
  });

  it('5. Mudança de usuário cancela auto-sync pendente do usuário anterior sem vazar upload', async () => {
    const initialA = createFixtureState(USER_A, 5, 3000, 'Conta A v5');
    const initialB = createFixtureState(USER_B, 2, 1500, 'Conta B v2');

    maybeSingleMock.mockImplementation(async () => {
      const uid = authStateRef.current.supabaseUserId;
      const st = uid === USER_B ? initialB : initialA;
      return {
        data: {
          user_id: uid,
          data: st,
          version: st.version,
          client_timestamp: st.lastModified,
          updated_at: '2026-11-17T01:00:00.000Z'
        },
        error: null
      };
    });

    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider key={USER_A}>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    // Edita na Conta A (agenda debounce de 2s)
    await act(async () => {
      latestCtx.addTransaction({
        description: 'Pendente Conta A',
        amount: 40,
        type: 'expense_variable',
        category: 'Lazer',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    // Antes de vencer 2s, troca para Conta B
    authStateRef.current = {
      supabaseUserId: USER_B,
      supabaseUserEmail: 'conta-b@ficticio.com',
      supabaseUserDisplayName: 'Conta B Fictícia',
      isSupabaseAuthenticated: true
    };
    await act(async () => {
      root.render(
        <FinanceProvider key={USER_B}>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(5000);
    });
    await flushMicrotasks();

    // Nenhum upload de Conta A deve ter sido enviado após a troca
    const uploadedPayloads = upsertMock.mock.calls.map(c => c[0]);
    expect(uploadedPayloads.some(p => p.user_id === USER_A)).toBe(false);
    expect(latestCtx.transactions.some(t => t.description === 'Pendente Conta A')).toBe(false);
    expect(latestCtx.transactions.some(t => t.description === 'Conta B v2')).toBe(true);
  });

  it('6. Botão do cabeçalho verifica a nuvem e NÃO sobrescreve dados remotos mais recentes', async () => {
    const localOlder = createFixtureState(USER_A, 5, 3000, 'Versão Local v5');
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        data: localOlder,
        version: 5,
        client_timestamp: localOlder.lastModified,
        updated_at: '2026-11-17T01:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(
        <FinanceProvider>
          <Header currentTab="dashboard" />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    // Outro dispositivo salvou v9 mais recente no Supabase
    const remoteNewer = createFixtureState(USER_A, 9, 8500, 'Outro Dispositivo v9');
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        data: remoteNewer,
        version: 9,
        client_timestamp: remoteNewer.lastModified,
        updated_at: '2026-11-17T02:00:00.000Z'
      },
      error: null
    });

    const headerSyncBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Nuvem Conectada')
    ) as HTMLButtonElement;
    expect(headerSyncBtn).toBeDefined();

    await act(async () => {
      headerSyncBtn.click();
    });
    await flushMicrotasks();

    expect(upsertMock).not.toHaveBeenCalled();
    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain('Conflito detectado');
    expect(alertEl?.textContent).toContain('v9');
  });

  it('7. Falha ao consultar a nuvem bloqueia upload manual no botão do cabeçalho', async () => {
    const localState = createFixtureState(USER_A, 5, 3000, 'Local v5');
    maybeSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        data: localState,
        version: 5,
        client_timestamp: localState.lastModified,
        updated_at: '2026-11-17T01:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(
        <FinanceProvider>
          <Header currentTab="dashboard" />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    // Falha ao consultar o estado atual na nuvem
    maybeSingleMock.mockResolvedValueOnce({
      data: null,
      error: { message: 'Falha de leitura na nuvem', code: '500' }
    });

    const headerSyncBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Nuvem Conectada')
    ) as HTMLButtonElement;

    await act(async () => {
      headerSyncBtn.click();
    });
    await flushMicrotasks();

    expect(upsertMock).not.toHaveBeenCalled();
    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).not.toBeNull();
    expect(alertEl?.textContent).toContain('Falha de leitura na nuvem');
  });

  it('8. Ação "Zerar Dados" não está acessível na interface de Configurações', async () => {
    const localState = createFixtureState(USER_A, 4, 4200, 'Dados Protegidos');
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: localState,
        version: 4,
        client_timestamp: localState.lastModified,
        updated_at: '2026-11-17T01:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(
        <FinanceProvider>
          <SettingsView />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    const allButtons = Array.from(container.querySelectorAll('button'));
    const resetButtons = allButtons.filter(b =>
      /zerar dados|começar do zero/i.test(b.textContent || '')
    );
    expect(resetButtons.length).toBe(0);
    expect(container.textContent).not.toContain('Zerar Dados (Começar do Zero)');
    // Backup e Restauração continuam acessíveis normalmente
    expect(container.textContent).toContain('Fazer Backup Completo');
    expect(container.textContent).toContain('Restaurar de Arquivo');
  });

  it('9 e 10. CRUD, exportação JSON, logout/sessão e isolamento entre usuários continuam funcionando', async () => {
    const stateA = createFixtureState(USER_A, 3, 2500, 'Saldo Inicial A');
    const stateB = createFixtureState(USER_B, 1, 900, 'Saldo Inicial B');

    maybeSingleMock.mockImplementation(async () => {
      const uid = authStateRef.current.supabaseUserId;
      const st = uid === USER_B ? stateB : stateA;
      return {
        data: {
          user_id: uid,
          data: st,
          version: st.version,
          client_timestamp: st.lastModified,
          updated_at: '2026-11-17T01:00:00.000Z'
        },
        error: null
      };
    });

    let ctxA!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider key={USER_A}>
          <ContextProbe onContext={ctx => (ctxA = ctx)} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    // CRUD: criar e editar lançamento em Conta A
    await act(async () => {
      ctxA.addTransaction({
        description: 'Receita Fictícia A',
        amount: 500,
        type: 'income',
        category: 'Salário',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    const createdTx = ctxA.transactions.find(t => t.description === 'Receita Fictícia A');
    expect(createdTx).toBeDefined();

    await act(async () => {
      ctxA.updateTransaction(createdTx!.id, { description: 'Receita Fictícia A Editada' });
    });

    // Exportação JSON
    const exportedJson = JSON.parse(ctxA.exportBackupJson());
    expect(exportedJson.ownerUserId).toBe(USER_A);
    expect(exportedJson.transactions.some((t: any) => t.description === 'Receita Fictícia A Editada')).toBe(true);

    // Exclusão unitária
    let deleteRes: any;
    await act(async () => {
      deleteRes = await ctxA.deleteTransaction(createdTx!.id);
    });
    expect(deleteRes.success).toBe(true);
    expect(ctxA.transactions.some(t => t.id === createdTx!.id)).toBe(false);

    // Troca para Conta B -> isolamento total
    saveStateToStorageForUser(USER_B, stateB);
    authStateRef.current = {
      supabaseUserId: USER_B,
      supabaseUserEmail: 'conta-b@ficticio.com',
      supabaseUserDisplayName: 'Conta B Fictícia',
      isSupabaseAuthenticated: true
    };

    let ctxB!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider key={USER_B}>
          <ContextProbe onContext={ctx => (ctxB = ctx)} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    expect(ctxB.transactions.some(t => t.description.includes('Saldo Inicial A'))).toBe(false);
    expect(ctxB.transactions.some(t => t.description === 'Saldo Inicial B')).toBe(true);
    expect(getUserStateFromStorage(USER_A)?.ownerUserId).toBe(USER_A);
    expect(getUserStateFromStorage(USER_B)?.ownerUserId).toBe(USER_B);

    // Logout / não autenticado bloqueia acesso e limpa memória
    authStateRef.current = {
      supabaseUserId: null,
      supabaseUserEmail: null,
      supabaseUserDisplayName: 'Conta',
      isSupabaseAuthenticated: false
    };

    let ctxLoggedOut!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider key="logged-out">
          <ContextProbe onContext={ctx => (ctxLoggedOut = ctx)} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    expect(ctxLoggedOut.isFinanceHydrated).toBe(false);
    expect(ctxLoggedOut.transactions.length).toBe(0);
  });
});
