// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  AppState,
  DEFAULT_CATEGORIES,
  LEGACY_DISMISSED_KEY_PREFIX,
  LEGACY_STORAGE_KEY,
  exportLegacyStorageJson,
  getRecoverySnapshotForUser,
  getUserRecoveryKey,
  getUserStateFromStorage,
  getUserStorageKey,
  inspectLegacyStorageState,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  listRecoveryHistory,
  saveSnapshotToRecoveryHistory
} from '../utils/recoveryHistoryDb';
import { inspectLocalRecoverySnapshot } from '../utils/recoverySnapshot';
import { validateBackupJsonStructure } from '../utils/backupSecurity';
import {
  getPendingRegistrationIntent,
  savePendingRegistrationIntent
} from '../services/subscriptionService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const {
  USER_A,
  USER_B,
  EMAIL_A,
  EMAIL_B,
  authSessionRef,
  signOutMock,
  getSessionMock,
  fromDeleteMock,
  upsertMock,
  limitMock,
  maybeSingleMock,
  authStateListeners
} = vi.hoisted(() => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const emailA = 'usuario-a@ficticio.com';
  const emailB = 'usuario-b@ficticio.com';

  return {
    USER_A: userA,
    USER_B: userB,
    EMAIL_A: emailA,
    EMAIL_B: emailB,
    authSessionRef: {
      current: {
        authenticated: true,
        userId: userA as string | null,
        email: emailA as string | null,
        displayName: 'Usuário A Fictício'
      }
    },
    signOutMock: vi.fn(),
    getSessionMock: vi.fn(),
    fromDeleteMock: vi.fn(),
    upsertMock: vi.fn(),
    limitMock: vi.fn(),
    maybeSingleMock: vi.fn(),
    authStateListeners: new Set<(event: string, session: any) => void>()
  };
});

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      signOut: signOutMock,
      onAuthStateChange: vi.fn((cb: (event: string, session: any) => void) => {
        authStateListeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe: () => authStateListeners.delete(cb)
            }
          }
        };
      }),
      signInWithPassword: vi.fn(),
      signUp: vi.fn(),
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn()
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock
        })),
        limit: limitMock
      })),
      upsert: upsertMock,
      delete: fromDeleteMock
    }))
  },
  SUPABASE_PROJECT_URL: 'https://ficticio.supabase.co'
}));

import { AuthProvider, SUPABASE_CONFIGURED_FLAG, useAuth } from '../context/AuthContext';
import { FinanceContextType, FinanceProvider, useFinance } from '../context/FinanceContext';
import { SafeLogoutModal } from '../components/auth/SafeLogoutModal';
import { SettingsView } from '../components/settings/SettingsView';

function createFixtureState(
  ownerUserId: string,
  version: number,
  amount: number,
  description = `Lançamento v${version}`,
  overrides: Partial<AppState> = {}
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
        date: '2026-11-18',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Corrente Fictícia',
        type: 'checking',
        balance: amount,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Fictício',
        color: '#6366f1',
        limitTotal: 5000,
        closingDay: 15,
        dueDay: 22
      }
    ],
    debts: [],
    goals: [],
    safetyReserveDesired: 1500,
    isSampleLoaded: false,
    ...overrides
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
    key: (idx: number) => Object.keys(store)[idx] ?? null,
    get length() {
      return Object.keys(store).length;
    }
  };
}

const HarnessProbe: React.FC<{
  onFinance?: (ctx: FinanceContextType) => void;
  onAuth?: (auth: ReturnType<typeof useAuth>) => void;
}> = ({ onFinance, onAuth }) => {
  const auth = useAuth();
  const finance = useFinance();
  onAuth?.(auth);
  onFinance?.(finance);
  return (
    <div>
      <span data-testid="auth-status">{auth.isSupabaseAuthenticated ? 'authenticated' : 'logged_out'}</span>
      <span data-testid="active-user">{auth.supabaseUserId || 'none'}</span>
      <span data-testid="tx-count">{finance.transactions.length}</span>
    </div>
  );
};

async function flushAsync(ms = 60) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('Fase 2.1 — Proteção de Dados Locais, Bloqueio Legado e Logout Seguro (100% mocks)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let idbFactory: IDBFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    authStateListeners.clear();
    idbFactory = new IDBFactory();

    const localMock = makeMockStorage();
    const sessionMock = makeMockStorage();
    Object.defineProperty(window, 'localStorage', { value: localMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localMock, writable: true, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: sessionMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: sessionMock, writable: true, configurable: true });

    authSessionRef.current = {
      authenticated: true,
      userId: USER_A,
      email: EMAIL_A,
      displayName: 'Usuário A Fictício'
    };

    getSessionMock.mockImplementation(async () => ({
      data: {
        session:
          authSessionRef.current.authenticated && authSessionRef.current.userId
            ? {
                user: {
                  id: authSessionRef.current.userId,
                  email: authSessionRef.current.email,
                  user_metadata: { full_name: authSessionRef.current.displayName }
                },
                expires_at: Math.floor(Date.now() / 1000) + 3600
              }
            : null
      },
      error: null
    }));

    signOutMock.mockImplementation(async () => {
      authSessionRef.current = {
        authenticated: false,
        userId: null,
        email: null,
        displayName: 'Conta'
      };
      return { error: null };
    });

    limitMock.mockResolvedValue({ data: [{ user_id: USER_A }], error: null });
    upsertMock.mockResolvedValue({ data: null, error: null });
    fromDeleteMock.mockImplementation(() => {
      throw new Error('Logout jamais deve deletar registros no Supabase!');
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
  });

  it('1 e 5. Logout após sincronização concluída limpa dados locais apenas do usuário atual, preserva outros usuários/legado e jamais apaga dados no Supabase', async () => {
    const stateA = createFixtureState(USER_A, 4, 8000, 'Salário Sincronizado A');
    const stateB = createFixtureState(USER_B, 7, 12000, 'Reserva Privada B');

    // Prepara dados locais de A e de B + preferências + legado + PII pendente
    saveStateToStorageForUser(USER_A, stateA);
    saveRecoverySnapshotForUser(USER_A, stateA, 'pre_local_push');
    await saveSnapshotToRecoveryHistory(USER_A, stateA, 'pre_local_push', { indexedDBFactory: idbFactory });
    window.localStorage.setItem(`${LEGACY_DISMISSED_KEY_PREFIX}${USER_A}`, 'true');
    window.localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
    window.localStorage.setItem('finance_theme', 'dark');
    window.localStorage.setItem('finance_auth_password', 'legado_inseguro');
    window.sessionStorage.setItem('temp_session_flag', '1');

    savePendingRegistrationIntent({
      email: EMAIL_A,
      fullName: 'Usuário A',
      whatsapp: '33999990001',
      requestedPlan: 'monthly',
      whatsappConsent: true,
      requiresEmailConfirmation: false,
      syncedToSupabase: false,
      createdAt: '2026-11-18T00:00:00.000Z'
    });
    savePendingRegistrationIntent({
      email: EMAIL_B,
      fullName: 'Usuário B',
      whatsapp: '33999990002',
      requestedPlan: 'annual',
      whatsappConsent: true,
      requiresEmailConfirmation: false,
      syncedToSupabase: false,
      createdAt: '2026-11-18T00:00:00.000Z'
    });

    saveStateToStorageForUser(USER_B, stateB);
    saveRecoverySnapshotForUser(USER_B, stateB, 'pre_json_import');
    await saveSnapshotToRecoveryHistory(USER_B, stateB, 'pre_json_import', { indexedDBFactory: idbFactory });
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify({ ...stateA, ownerUserId: undefined }));

    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: stateA,
        version: 4,
        client_timestamp: stateA.lastModified,
        updated_at: '2026-11-18T10:00:00.000Z'
      },
      error: null
    });

    let latestFinance!: FinanceContextType;
    let latestAuth!: ReturnType<typeof useAuth>;

    await act(async () => {
      root.render(
        <AuthProvider>
          <FinanceProvider
            experimentalHistoryOptions={{
              enableExperimentalHistory: true,
              indexedDBFactory: idbFactory
            }}
          >
            <HarnessProbe
              onAuth={a => (latestAuth = a)}
              onFinance={f => (latestFinance = f)}
            />
            <SafeLogoutModal />
          </FinanceProvider>
        </AuthProvider>
      );
    });
    await flushAsync(80);

    expect(latestFinance.isFinanceHydrated).toBe(true);

    // Executa logout seguro com nuvem confirmada idêntica
    await act(async () => {
      await latestFinance.requestSafeLogout();
    });
    await flushAsync(50);

    // Não abriu modal (nuvem confirmada) e encerrou sessão
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(latestAuth.isSupabaseAuthenticated).toBe(false);

    // Dados locais de A, PII pendente de A, sessão e chaves legadas de auth foram removidos
    expect(window.localStorage.getItem(getUserStorageKey(USER_A))).toBeNull();
    expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBeNull();
    expect(window.localStorage.getItem(`${LEGACY_DISMISSED_KEY_PREFIX}${USER_A}`)).toBeNull();
    expect(getPendingRegistrationIntent(EMAIL_A)).toBeNull();
    expect(window.localStorage.getItem(SUPABASE_CONFIGURED_FLAG)).toBeNull();
    expect(window.localStorage.getItem('finance_auth_password')).toBeNull();
    expect(window.sessionStorage.getItem('temp_session_flag')).toBeNull();

    const historyA = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(historyA.items).toHaveLength(0);

    // Dados do usuário B, tema e chave legada global permanecem 100% intactos
    expect(getUserStateFromStorage(USER_B)?.transactions[0].description).toBe('Reserva Privada B');
    expect(getRecoverySnapshotForUser(USER_B)?.state.transactions[0].description).toBe('Reserva Privada B');
    expect(getPendingRegistrationIntent(EMAIL_B)?.fullName).toBe('Usuário B');
    expect(window.localStorage.getItem('finance_theme')).toBe('dark');
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).not.toBeNull();

    const historyB = await listRecoveryHistory(USER_B, { indexedDBFactory: idbFactory });
    expect(historyB.items).toHaveLength(1);
    expect(fromDeleteMock).not.toHaveBeenCalled();
  });

  it('2 e 6. Logout com alterações pendentes abre confirmação, exporta JSON válido e preserva recuperação se sair sem sincronizar', async () => {
    const cloudState = createFixtureState(USER_A, 2, 3000, 'Renda Base Nuvem');
    let remoteRecord = {
      user_id: USER_A,
      data: cloudState,
      version: 2,
      client_timestamp: cloudState.lastModified,
      updated_at: '2026-11-18T09:00:00.000Z'
    };

    maybeSingleMock.mockImplementation(async () => ({
      data: remoteRecord,
      error: null
    }));

    let latestFinance!: FinanceContextType;
    await act(async () => {
      root.render(
        <AuthProvider>
          <FinanceProvider
            experimentalHistoryOptions={{
              enableExperimentalHistory: true,
              indexedDBFactory: idbFactory
            }}
          >
            <HarnessProbe onFinance={f => (latestFinance = f)} />
            <SafeLogoutModal />
          </FinanceProvider>
        </AuthProvider>
      );
    });
    await flushAsync(80);

    // Usuário edita localmente (ainda não sincronizado na nuvem)
    await act(async () => {
      latestFinance.addTransaction({
        description: 'Freela Não Sincronizado',
        amount: 950,
        type: 'income',
        category: 'Trabalhos por fora',
        date: '2026-11-18',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    // Clica para sair antes do auto-sync enviar
    await act(async () => {
      await latestFinance.requestSafeLogout();
    });

    // Modal de confirmação abre e NÃO apaga sessão nem backups ainda
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Confirmação de Saída Segura');
    expect(signOutMock).not.toHaveBeenCalled();
    expect(getUserStateFromStorage(USER_A)?.transactions.some(t => t.description === 'Freela Não Sincronizado')).toBe(true);

    // Exporta JSON pelo fluxo de saída segura e valida integridade para restauração futura
    const exported = latestFinance.exportBackupForPendingLogout();
    expect(exported.success).toBe(true);
    const validation = validateBackupJsonStructure(exported.jsonContent, USER_A);
    expect(validation.valid).toBe(true);
    expect(validation.state?.transactions.some(t => t.description === 'Freela Não Sincronizado')).toBe(true);

    // Clica em "Sair Mantendo Backup Local"
    const exitKeepingBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Sair Mantendo Backup Local')
    ) as HTMLButtonElement;
    expect(exitKeepingBtn).toBeDefined();

    await act(async () => {
      exitKeepingBtn.click();
    });
    await flushAsync(50);

    // Cache ativo é removido no logout, mas cópia de recuperação local + IndexedDB de A são preservados!
    expect(signOutMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(getUserStorageKey(USER_A))).toBeNull();

    const preservedSnapshot = getRecoverySnapshotForUser(USER_A);
    expect(preservedSnapshot?.reason).toBe('pre_unsynced_logout');
    expect(preservedSnapshot?.state.transactions.some(t => t.description === 'Freela Não Sincronizado')).toBe(true);

    const preservedHistory = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(preservedHistory.items.some(item => item.reason === 'pre_unsynced_logout')).toBe(true);

    // Agora testa também o caminho "Sincronizar e Sair"
    authSessionRef.current = {
      authenticated: true,
      userId: USER_A,
      email: EMAIL_A,
      displayName: 'Usuário A Fictício'
    };
    upsertMock.mockImplementation(async (payload: any) => {
      remoteRecord = {
        user_id: USER_A,
        data: payload.data,
        version: payload.version,
        client_timestamp: payload.client_timestamp,
        updated_at: payload.updated_at
      };
      return { data: null, error: null };
    });

    await act(async () => {
      root.unmount();
    });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    await act(async () => {
      root.render(
        <AuthProvider>
          <FinanceProvider
            experimentalHistoryOptions={{
              enableExperimentalHistory: true,
              indexedDBFactory: idbFactory
            }}
          >
            <HarnessProbe onFinance={f => (latestFinance = f)} />
            <SafeLogoutModal />
          </FinanceProvider>
        </AuthProvider>
      );
    });
    await flushAsync(90);

    await act(async () => {
      latestFinance.addTransaction({
        description: 'Alteração Para Sincronizar Antes de Sair',
        amount: 2500,
        type: 'income',
        category: 'Salário',
        date: '2026-11-18',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    await act(async () => {
      await latestFinance.requestSafeLogout();
    });
    expect(container.querySelector('[role="dialog"]')).not.toBeNull();

    const syncAndExitBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Sincronizar e Sair')
    ) as HTMLButtonElement;
    expect(syncAndExitBtn).toBeDefined();

    await act(async () => {
      syncAndExitBtn.click();
    });
    await flushAsync(60);

    expect(upsertMock).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(getUserStorageKey(USER_A))).toBeNull();
    expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBeNull();
    const clearedHistory = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(clearedHistory.items).toHaveLength(0);
  });

  it('3 e 4. Troca entre contas no mesmo navegador mantém isolamento completo e novo login na mesma conta restaura corretamente', async () => {
    const stateA = createFixtureState(USER_A, 3, 4100, 'Movimento Exclusivo A');
    const stateB = createFixtureState(USER_B, 2, 9200, 'Movimento Exclusivo B');

    maybeSingleMock.mockImplementation(async () => {
      if (authSessionRef.current.userId === USER_A) {
        return {
          data: {
            user_id: USER_A,
            data: stateA,
            version: 3,
            client_timestamp: stateA.lastModified,
            updated_at: '2026-11-18T10:00:00.000Z'
          },
          error: null
        };
      }
      return {
        data: {
          user_id: USER_B,
          data: stateB,
          version: 2,
          client_timestamp: stateB.lastModified,
          updated_at: '2026-11-18T10:05:00.000Z'
        },
        error: null
      };
    });

    let latestFinance!: FinanceContextType;
    const renderAppFresh = async () => {
      await act(async () => {
        root.unmount();
      });
      container.remove();
      container = document.createElement('div');
      document.body.appendChild(container);
      root = createRoot(container);

      await act(async () => {
        root.render(
          <AuthProvider>
            <FinanceProvider
              experimentalHistoryOptions={{
                enableExperimentalHistory: true,
                indexedDBFactory: idbFactory
              }}
            >
              <HarnessProbe onFinance={f => (latestFinance = f)} />
              <SafeLogoutModal />
            </FinanceProvider>
          </AuthProvider>
        );
      });
      await flushAsync(90);
    };

    // 1) Conta A entra e sai com alterações sincronizadas
    await renderAppFresh();
    expect(latestFinance.transactions[0].description).toBe('Movimento Exclusivo A');

    await act(async () => {
      await latestFinance.requestSafeLogout();
    });
    await flushAsync(40);
    expect(window.localStorage.getItem(getUserStorageKey(USER_A))).toBeNull();

    // 2) Conta B entra no mesmo navegador: não vê nada de A
    authSessionRef.current = {
      authenticated: true,
      userId: USER_B,
      email: EMAIL_B,
      displayName: 'Usuário B Fictício'
    };
    await renderAppFresh();
    expect(latestFinance.transactions[0].description).toBe('Movimento Exclusivo B');
    expect(JSON.stringify(latestFinance.transactions)).not.toContain('Movimento Exclusivo A');
    expect(inspectLocalRecoverySnapshot(USER_A).status).toBe('empty');

    // Conta B sai
    await act(async () => {
      await latestFinance.requestSafeLogout();
    });
    await flushAsync(40);
    expect(window.localStorage.getItem(getUserStorageKey(USER_B))).toBeNull();

    // 3) Conta A entra novamente e recupera integralmente seus dados da nuvem
    authSessionRef.current = {
      authenticated: true,
      userId: USER_A,
      email: EMAIL_A,
      displayName: 'Usuário A Fictício'
    };
    await renderAppFresh();
    expect(latestFinance.transactions[0].description).toBe('Movimento Exclusivo A');
    expect(JSON.stringify(latestFinance.transactions)).not.toContain('Movimento Exclusivo B');
  });

  it('7. Bloqueia visualização, exportação e importação da chave legada global sem proprietário comprovado na UI e no contexto', async () => {
    const activeA = createFixtureState(USER_A, 1, 1000, 'Conta Ativa A');
    const unownedLegacy = createFixtureState(USER_A, 9, 99999, 'Segredo Financeiro Legado Sem Dono');
    delete (unownedLegacy as Partial<AppState>).ownerUserId;
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(unownedLegacy));

    // Inspeção direta bloqueia sem ownerUserId correspondente
    const blockedInspection = inspectLegacyStorageState(USER_A);
    expect(blockedInspection.summary.exists).toBe(true);
    expect(blockedInspection.summary.ownershipVerified).toBe(false);
    expect(blockedInspection.summary.accessBlocked).toBe(true);
    expect(blockedInspection.summary.requiresAdminRecovery).toBe(true);
    expect(blockedInspection.summary.transactionsCount).toBe(0);
    expect(blockedInspection.state).toBeNull();
    expect(exportLegacyStorageJson(USER_A)).toBeNull();

    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: activeA,
        version: 1,
        client_timestamp: activeA.lastModified,
        updated_at: '2026-11-18T10:00:00.000Z'
      },
      error: null
    });

    let latestFinance!: FinanceContextType;
    await act(async () => {
      root.render(
        <AuthProvider>
          <FinanceProvider>
            <HarnessProbe onFinance={f => (latestFinance = f)} />
            <SettingsView />
          </FinanceProvider>
        </AuthProvider>
      );
    });
    await flushAsync(90);

    // SettingsView exibe bloqueio administrativo e oculta valores/botões de exportação/importação
    const uiText = container.textContent || '';
    expect(uiText).toContain('Dados Locais Legados Bloqueados por Segurança');
    expect(uiText).toContain('recuperação administrativa segura');
    expect(uiText).not.toContain('Segredo Financeiro Legado Sem Dono');
    expect(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Baixar Backup Legado')
      )
    ).toBeUndefined();
    expect(
      Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Importar para Esta Conta')
      )
    ).toBeUndefined();

    // Contexto também recusa importação e exportação mesmo com confirmação true
    expect(latestFinance.exportLegacyBackupFile()).toBeNull();
    const blockedImport = await latestFinance.importLegacyBackupToCurrentAccount(true);
    expect(blockedImport.success).toBe(false);
    expect(blockedImport.message).toContain('comprovar');

    // Chave legada global permanece preservada intacta no navegador para eventual recuperação administrativa
    expect(window.localStorage.getItem(LEGACY_STORAGE_KEY)).toContain('Segredo Financeiro Legado Sem Dono');
  });

  it('8. Diante de falhas de rede, não apaga backup de recuperação automaticamente e conclui logout local mesmo se signOut remoto falhar', async () => {
    const localRealState = createFixtureState(USER_A, 6, 7700, 'Lançamento Local Offline');
    saveStateToStorageForUser(USER_A, localRealState);

    // Hidratação offline via cache local próprio do usuário
    limitMock.mockRejectedValueOnce(new Error('Network offline'));

    let latestFinance!: FinanceContextType;
    let latestAuth!: ReturnType<typeof useAuth>;
    await act(async () => {
      root.render(
        <AuthProvider>
          <FinanceProvider
            experimentalHistoryOptions={{
              enableExperimentalHistory: true,
              indexedDBFactory: idbFactory
            }}
          >
            <HarnessProbe
              onAuth={a => (latestAuth = a)}
              onFinance={f => (latestFinance = f)}
            />
            <SafeLogoutModal />
          </FinanceProvider>
        </AuthProvider>
      );
    });
    await flushAsync(90);

    expect(latestFinance.isFinanceHydrated).toBe(true);
    expect(latestFinance.transactions[0].description).toBe('Lançamento Local Offline');

    // Tentativa de verificar nuvem no logout falha por rede
    maybeSingleMock.mockRejectedValueOnce(new Error('Failed to fetch'));
    signOutMock.mockImplementation(async (opts?: { scope?: string }) => {
      if (!opts?.scope) {
        throw new Error('Network error on remote signOut');
      }
      authSessionRef.current = {
        authenticated: false,
        userId: null,
        email: null,
        displayName: 'Conta'
      };
      return { error: null };
    });

    await act(async () => {
      await latestFinance.requestSafeLogout();
    });

    // Modal deve alertar e impedir perda silenciosa
    const dialog = container.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Failed to fetch');

    const exitKeepingBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Sair Mantendo Backup Local')
    ) as HTMLButtonElement;
    expect(exitKeepingBtn).toBeDefined();

    await act(async () => {
      exitKeepingBtn.click();
    });
    await flushAsync(50);

    // Fallback signOut({ scope: 'local' }) foi acionado e sessão local encerrada
    expect(signOutMock).toHaveBeenCalledWith({ scope: 'local' });
    expect(latestAuth.isSupabaseAuthenticated).toBe(false);
    // Cache ativo foi removido para proteger privacidade, mas snapshot de recuperação foi preservado!
    expect(window.localStorage.getItem(getUserStorageKey(USER_A))).toBeNull();
    const preservedOffline = getRecoverySnapshotForUser(USER_A);
    expect(preservedOffline?.reason).toBe('pre_unverified_logout');
    expect(preservedOffline?.state.transactions[0].description).toBe('Lançamento Local Offline');

    const preservedIdbOffline = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(preservedIdbOffline.items.some(item => item.reason === 'pre_unverified_logout')).toBe(true);
  });
});
