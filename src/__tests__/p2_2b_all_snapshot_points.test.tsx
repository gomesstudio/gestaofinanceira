// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  AppState,
  DEFAULT_CATEGORIES,
  LEGACY_STORAGE_KEY,
  getRecoverySnapshotForUser,
  getUserStateFromStorage,
  saveStateToStorageForUser
} from '../utils/storage';
import { listRecoveryHistory } from '../utils/recoveryHistoryDb';
import {
  ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY,
  ExperimentalRecoveryAdapterOptions
} from '../utils/recoverySnapshotAdapter';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const {
  USER_A,
  USER_B,
  authStateRef,
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
  hydrateUserFinanceSession,
  useFinance
} from '../context/FinanceContext';
import { SettingsView } from '../components/settings/SettingsView';

function createFixtureState(
  ownerUserId: string,
  version: number,
  amount: number,
  description = `Movimento v${version}`,
  overrides: Partial<AppState> = {}
): AppState {
  return {
    ownerUserId,
    version,
    lastModified: 1700000000000 + version * 1000,
    transactions: [
      {
        id: `tx-${version}`,
        description,
        amount,
        type: 'income',
        category: 'Salário',
        date: '2026-11-14',
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
    safetyReserveDesired: 2000,
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
    }
  };
}

const ContextProbe: React.FC<{ onContext: (ctx: FinanceContextType) => void }> = ({ onContext }) => {
  const ctx = useFinance();
  onContext(ctx);
  return null;
};

async function flushUi(ms = 40) {
  await act(async () => {
    await new Promise(resolve => setTimeout(resolve, ms));
  });
}

describe('P2.2B: Conclusão da Integração dos 7 Pontos de Snapshot (Feature Flag Desativada por Padrão)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let idbFactory: IDBFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    Object.defineProperty(window, 'localStorage', {
      value: makeMockStorage(),
      writable: true,
      configurable: true
    });
    idbFactory = new IDBFactory();

    authStateRef.current = {
      supabaseUserId: USER_A,
      supabaseUserEmail: 'conta-a@ficticio.com',
      supabaseUserDisplayName: 'Conta A Fictícia',
      isSupabaseAuthenticated: true
    };

    getSessionMock.mockImplementation(async () => ({
      data: {
        session: authStateRef.current.supabaseUserId
          ? { user: { id: authStateRef.current.supabaseUserId, email: authStateRef.current.supabaseUserEmail } }
          : null
      },
      error: null
    }));

    upsertMock.mockResolvedValue({ data: null, error: null });
    limitMock.mockResolvedValue({ data: [{ user_id: USER_A }], error: null });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('1. Feature flag padrão permanece DESATIVADA e nenhum acesso ao IndexedDB ocorre em produção', async () => {
    expect(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY).toBe(false);

    const initialState = createFixtureState(USER_A, 10, 4500, 'Estado Inicial Produção');
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: initialState,
        version: 10,
        client_timestamp: initialState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });

    const openSpy = vi.fn((...args: Parameters<IDBFactory['open']>) => idbFactory.open(...args));
    const spiedFactory = {
      open: openSpy,
      deleteDatabase: idbFactory.deleteDatabase.bind(idbFactory),
      cmp: idbFactory.cmp.bind(idbFactory),
      databases: idbFactory.databases.bind(idbFactory)
    } as unknown as IDBFactory;

    // Mesmo com indexedDBFactory injetado, sem enableExperimentalHistory: true nada toca no IndexedDB
    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider experimentalHistoryOptions={{ indexedDBFactory: spiedFactory }}>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);
    expect(latestCtx.isFinanceHydrated).toBe(true);

    // Executa operações críticas com flag desligada
    await act(async () => {
      await latestCtx.forceDownloadFromCloud();
    });
    await act(async () => {
      await latestCtx.resetAllData();
    });

    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_reset_clean');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('2. Cobre todos os 7 pontos de snapshot aguardando confirmação do IndexedDB (pre_local_push, timestamp_tie_content_conflict, pre_force_download, pre_legacy_import, pre_load_sample, pre_reset_clean, pre_json_import)', async () => {
    const expOpts: ExperimentalRecoveryAdapterOptions = {
      enableExperimentalHistory: true,
      indexedDBFactory: idbFactory
    };

    // Pontos 1 e 2 via hydrateUserFinanceSession
    const remotePush = createFixtureState(USER_A, 2, 2000, 'Remoto Antes Push');
    const localPush = createFixtureState(USER_A, 3, 3000, 'Local Mais Recente');
    const pushOutcome = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: localPush,
      fetchRemote: async () => ({
        success: true,
        data: remotePush,
        version: 2,
        clientTimestamp: remotePush.lastModified
      }),
      uploadLocal: vi.fn().mockResolvedValue({ success: true }),
      experimentalHistoryOptions: expOpts
    });
    expect(pushOutcome.hydrated).toBe(true);
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_local_push');

    const tieLocal = createFixtureState(USER_A, 4, 4100, 'Empate Local', { lastModified: 1700005555000 });
    const tieRemote = createFixtureState(USER_A, 4, 4900, 'Empate Remoto', { lastModified: 1700005555000 });
    const tieOutcome = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: tieLocal,
      fetchRemote: async () => ({
        success: true,
        data: tieRemote,
        version: 4,
        clientTimestamp: 1700005555000
      }),
      experimentalHistoryOptions: expOpts
    });
    expect(tieOutcome.hydrated).toBe(true);
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('timestamp_tie_content_conflict');

    // Pontos 3, 4, 5, 6, 7 via FinanceProvider real
    // Começamos com estado sem dados reais (apenas conta/cartão ou amostra) para validar pre_load_sample e evoluir
    const baseSampleState = createFixtureState(USER_A, 5, 5000, 'Base Amostra', {
      isSampleLoaded: true
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: baseSampleState,
        version: 5,
        client_timestamp: baseSampleState.lastModified,
        updated_at: '2026-11-14T19:01:00.000Z'
      },
      error: null
    });
    saveStateToStorageForUser(USER_A, baseSampleState);

    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider experimentalHistoryOptions={expOpts}>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);
    expect(latestCtx.isFinanceHydrated).toBe(true);

    // Ponto 3: pre_force_download
    const cloudDownloadState = createFixtureState(USER_A, 6, 6100, 'Baixado da Nuvem', {
      isSampleLoaded: true
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: cloudDownloadState,
        version: 6,
        client_timestamp: cloudDownloadState.lastModified,
        updated_at: '2026-11-14T19:02:00.000Z'
      },
      error: null
    });
    await act(async () => {
      await latestCtx.forceDownloadFromCloud();
    });
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_force_download');
    expect(latestCtx.transactions[0].description).toBe('Baixado da Nuvem');

    // Ponto 5: pre_load_sample (sem dados reais bloqueadores, deve gravar snapshot e carregar amostra sem tocar Supabase)
    const upsertsBeforeSample = upsertMock.mock.calls.length;
    let sampleRes: any;
    await act(async () => {
      sampleRes = await latestCtx.loadSampleData();
    });
    expect(sampleRes.success).toBe(true);
    expect(sampleRes.synced).toBe(false);
    expect(upsertMock.mock.calls.length).toBe(upsertsBeforeSample);
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_load_sample');

    // Ponto 4: pre_legacy_import (exige propriedade verificada e confirmação explícita)
    const unownedLegacyState = createFixtureState(USER_A, 7, 7200, 'Legado Sem Dono');
    delete (unownedLegacyState as Partial<AppState>).ownerUserId;
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(unownedLegacyState));

    let blockedUnownedLegacy: any;
    await act(async () => {
      blockedUnownedLegacy = await latestCtx.importLegacyBackupToCurrentAccount(true);
    });
    expect(blockedUnownedLegacy.success).toBe(false);
    expect(blockedUnownedLegacy.message).toContain('comprovar');

    const legacyState = createFixtureState(USER_A, 7, 7200, 'Legado Antigo Importado');
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyState));

    let blockedLegacy: any;
    await act(async () => {
      blockedLegacy = await latestCtx.importLegacyBackupToCurrentAccount(false);
    });
    expect(blockedLegacy.success).toBe(false);

    const upsertsBeforeLegacy = upsertMock.mock.calls.length;
    let okLegacy: any;
    await act(async () => {
      okLegacy = await latestCtx.importLegacyBackupToCurrentAccount(true);
    });
    expect(okLegacy.success).toBe(true);
    expect(upsertMock.mock.calls.length).toBe(upsertsBeforeLegacy); // Não grava no Supabase na importação local
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_legacy_import');
    expect(latestCtx.transactions[0].description).toBe('Legado Antigo Importado');

    // Como agora há dados reais (isSampleLoaded: false), loadSampleData DEVE bloquear
    let blockedSample: any;
    await act(async () => {
      blockedSample = await latestCtx.loadSampleData();
    });
    expect(blockedSample.success).toBe(false);
    expect(blockedSample.blockedByRealData).toBe(true);

    // Ponto 7: pre_json_import (confirma ordem: snapshot confirmado antes do upsert no Supabase)
    const currentImportedState = getUserStateFromStorage(USER_A) ?? legacyState;
    const backupToRestore = createFixtureState(USER_A, 99, 9100, 'Backup Restaurado JSON', {
      lastModified: Date.now() + 60000
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: currentImportedState,
        version: currentImportedState.version,
        client_timestamp: currentImportedState.lastModified,
        updated_at: '2026-11-14T19:03:00.000Z'
      },
      error: null
    });

    let inspectOutcome: any;
    await act(async () => {
      inspectOutcome = await latestCtx.inspectBackupJsonForRestore(JSON.stringify(backupToRestore));
    });
    expect(inspectOutcome.canRestore).toBe(true);

    let historyCountAtUpsertTime = -1;
    upsertMock.mockImplementationOnce(async () => {
      const h = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
      historyCountAtUpsertTime = h.items.filter(i => i.reason === 'pre_json_import').length;
      return { data: null, error: null };
    });

    let restoreOutcome: any;
    await act(async () => {
      restoreOutcome = await latestCtx.applyConfirmedBackupRestore(inspectOutcome.prepared);
    });
    expect(restoreOutcome.success).toBe(true);
    expect(historyCountAtUpsertTime).toBe(1);
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_json_import');

    // Ponto 6: pre_reset_clean (confirma snapshot gravado antes de limpar e enviar ao Supabase)
    let resetHistoryAtUpsert = -1;
    upsertMock.mockImplementationOnce(async () => {
      const h = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
      resetHistoryAtUpsert = h.items.filter(i => i.reason === 'pre_reset_clean').length;
      return { data: null, error: null };
    });

    let resetOutcome: any;
    await act(async () => {
      resetOutcome = await latestCtx.resetAllData();
    });
    expect(resetOutcome.success).toBe(true);
    expect(resetHistoryAtUpsert).toBe(1);
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_reset_clean');

    // Histórico IndexedDB manteve limite máximo de 5 snapshots (com motivos recentes preservados)
    const finalHistory = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(finalHistory.items).toHaveLength(5);
    expect(finalHistory.items[0].reason).toBe('pre_reset_clean');
    expect(finalHistory.items[1].reason).toBe('pre_json_import');
  });

  it('3. Preserva confirmações de reset, importação legada e dados demonstrativos na SettingsView com chamadas assíncronas', async () => {
    const activeState = createFixtureState(USER_A, 5, 5000, 'Ativo Settings', {
      isSampleLoaded: true
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: activeState,
        version: 5,
        client_timestamp: activeState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });

    const legacyState = createFixtureState(USER_A, 3, 2100, 'Legado Settings', {
      isSampleLoaded: true
    });
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyState));

    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
          <SettingsView />
        </FinanceProvider>
      );
    });
    await flushUi(100);

    // Importação legada requer checkbox marcada
    const importBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Importar para Esta Conta')
    ) as HTMLButtonElement;
    expect(importBtn).toBeDefined();
    expect(importBtn.disabled).toBe(true);

    const legacyCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(input =>
      input.parentElement?.textContent?.includes('Confirmo que esses dados legados')
    ) as HTMLInputElement;
    expect(legacyCheckbox).toBeDefined();

    await act(async () => {
      legacyCheckbox.click();
    });
    expect(importBtn.disabled).toBe(false);

    await act(async () => {
      importBtn.click();
    });
    await flushUi(50);

    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_legacy_import');

    // Carregar Dados Demonstrativos abre modal de confirmação com checkbox antes de executar
    const demoBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Carregar Dados Demonstrativos')
    ) as HTMLButtonElement;
    expect(demoBtn).toBeDefined();

    await act(async () => {
      demoBtn.click();
    });
    expect(container.textContent).toContain('Confirmo que desejo executar "Carregar Dados Demonstrativos"');

    const demoConfirmCheckbox = Array.from(container.querySelectorAll('input[type="checkbox"]')).find(input =>
      input.parentElement?.textContent?.includes('Carregar Dados Demonstrativos')
    ) as HTMLInputElement;
    expect(demoConfirmCheckbox).toBeDefined();
    await act(async () => {
      demoConfirmCheckbox.click();
    });

    const confirmDemoBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Confirmar: Carregar Demonstração')
    ) as HTMLButtonElement;
    expect(confirmDemoBtn).toBeDefined();
    expect(confirmDemoBtn.disabled).toBe(false);

    await act(async () => {
      confirmDemoBtn.click();
    });
    await flushUi(50);

    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_load_sample');

    // No MVP pessoal, "Zerar Dados" não está mais acessível pela interface SettingsView
    const resetBtn = Array.from(container.querySelectorAll('button')).find(b =>
      /zerar dados|começar do zero/i.test(b.textContent || '')
    );
    expect(resetBtn).toBeUndefined();

    // O método resetAllData permanece preservado no contexto e gera snapshot pre_reset_clean quando chamado internamente
    await act(async () => {
      await latestCtx.resetAllData();
    });
    await flushUi(50);

    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_reset_clean');
  });

  it('4, 5 e 6. Falha no IndexedDB preserva legado sem corromper estado; logout/troca durante operação aborta; concorrência é bloqueada', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const initialState = createFixtureState(USER_A, 10, 8800, 'Estado Protegido Real');
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: initialState,
        version: 10,
        client_timestamp: initialState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });

    // Caso 4: IndexedDB falha (null / indisponível) durante applyConfirmedBackupRestore
    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider
          experimentalHistoryOptions={{
            enableExperimentalHistory: true,
            indexedDBFactory: null
          }}
        >
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    const backupV11 = createFixtureState(USER_A, 11, 9200, 'Backup V11');
    let inspected: any;
    await act(async () => {
      inspected = await latestCtx.inspectBackupJsonForRestore(JSON.stringify(backupV11));
    });
    expect(inspected.canRestore).toBe(true);

    // Simula falha também se o Supabase falhar: restauração NÃO altera estado ativo
    upsertMock.mockResolvedValueOnce({ data: null, error: { message: 'Falha simulada rede', code: '500' } });
    let failedRestore: any;
    await act(async () => {
      failedRestore = await latestCtx.applyConfirmedBackupRestore(inspected.prepared);
    });
    expect(failedRestore.success).toBe(false);
    expect(latestCtx.transactions[0].description).toBe('Estado Protegido Real');
    // Mesmo com falha no IndexedDB, backup legado foi salvo com segurança
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_json_import');

    // Caso 5: Troca de usuário / logout durante transação assíncrona aborta operação sem gravar no Supabase
    await act(async () => {
      root.unmount();
    });
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    let triggerLogoutOnCommit = false;
    const expWithLogoutHook: ExperimentalRecoveryAdapterOptions = {
      enableExperimentalHistory: true,
      indexedDBFactory: idbFactory,
      beforeCommitHook: () => {
        if (triggerLogoutOnCommit) {
          triggerLogoutOnCommit = false;
          authStateRef.current = {
            supabaseUserId: USER_B,
            supabaseUserEmail: 'conta-b@ficticio.com',
            supabaseUserDisplayName: 'Conta B Fictícia',
            isSupabaseAuthenticated: true
          };
          // Dispara re-render síncrono simulando troca real de usuário no AuthContext durante a transação
          flushSync(() => {
            root.render(
              <FinanceProvider experimentalHistoryOptions={expWithLogoutHook}>
                <ContextProbe onContext={ctx => (latestCtx = ctx)} />
              </FinanceProvider>
            );
          });
        }
      }
    };

    const legacyPayload = createFixtureState(USER_A, 2, 1900, 'Legado Interceptado');
    window.localStorage.setItem(LEGACY_STORAGE_KEY, JSON.stringify(legacyPayload));

    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: initialState,
        version: 10,
        client_timestamp: initialState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(
        <FinanceProvider experimentalHistoryOptions={expWithLogoutHook}>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    const upsertsBeforeLogoutRace = upsertMock.mock.calls.length;
    triggerLogoutOnCommit = true;

    let legacyAfterAccountSwitch: any;
    await act(async () => {
      legacyAfterAccountSwitch = await latestCtx.importLegacyBackupToCurrentAccount(true);
    });
    await flushUi(50);

    expect(legacyAfterAccountSwitch.success).toBe(false);
    expect(upsertMock.mock.calls.length).toBe(upsertsBeforeLogoutRace);
    // Conta B nunca recebe os dados legados de Conta A
    const userBCache = getUserStateFromStorage(USER_B);
    expect(userBCache?.transactions.some(t => t.description === 'Legado Interceptado')).toBeFalsy();

    // Caso 6: Concorrência entre operações críticas no mesmo usuário (operationLockRef bloqueia segunda chamada)
    authStateRef.current = {
      supabaseUserId: USER_A,
      supabaseUserEmail: 'conta-a@ficticio.com',
      supabaseUserDisplayName: 'Conta A Fictícia',
      isSupabaseAuthenticated: true
    };
    triggerLogoutOnCommit = false;
    await act(async () => {
      root.render(
        <FinanceProvider experimentalHistoryOptions={expWithLogoutHook}>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    let resolveSlowUpsert!: () => void;
    const slowUpsertStarted = new Promise<void>(resolveStarted => {
      upsertMock.mockImplementationOnce(
        () =>
          new Promise(resolve => {
            resolveSlowUpsert = () => resolve({ data: null, error: null });
            resolveStarted();
          })
      );
    });

    let concurrentImportRes: any;
    let resetPromise!: Promise<any>;
    await act(async () => {
      resetPromise = latestCtx.resetAllData();
      // Imediatamente dispara importação concorrente enquanto resetAllData aguarda
      concurrentImportRes = await latestCtx.importLegacyBackupToCurrentAccount(true);
    });

    expect(concurrentImportRes.success).toBe(false);
    expect(concurrentImportRes.message).toContain('Outra operação crítica em andamento');

    await slowUpsertStarted;
    await act(async () => {
      resolveSlowUpsert();
      await resetPromise;
    });

    warnSpy.mockRestore();
  });
});
