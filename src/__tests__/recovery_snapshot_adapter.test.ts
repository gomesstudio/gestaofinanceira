/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  AppState,
  DEFAULT_CATEGORIES,
  getRecoverySnapshotForUser,
  getUserRecoveryKey,
  getUserStateFromStorage,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  getRecoverySnapshotById,
  listRecoveryHistory,
  MAX_RECOVERY_SNAPSHOTS_PER_USER
} from '../utils/recoveryHistoryDb';
import {
  ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY,
  ExperimentalHistoryFailureInfo,
  saveRecoverySnapshotWithExperimentalHistory
} from '../utils/recoverySnapshotAdapter';
import { hydrateUserFinanceSession } from '../context/FinanceContext';
import { supabase } from '../utils/supabase';

const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({
  upsert: upsertMock
}));

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn()
    },
    from: (...args: any[]) => (fromMock as any)(...args)
  },
  SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
}));

const createLocalStorageMock = () => {
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
};

const storageMock = createLocalStorageMock();
Object.defineProperty(globalThis, 'localStorage', {
  value: storageMock,
  writable: true
});

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

function createFixtureState(
  ownerUserId: string,
  version: number,
  reserveAmount: number,
  txLabel = `Lançamento Confidencial #${version}`
): AppState {
  return {
    ownerUserId,
    version,
    lastModified: 1700000000000 + version * 1000,
    transactions: [
      {
        id: `tx-${version}`,
        description: txLabel,
        amount: 4321.98 + version,
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
        name: 'Conta Corrente Secreta',
        type: 'checking',
        balance: reserveAmount,
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
    safetyReserveDesired: reserveAmount,
    isSampleLoaded: false
  };
}

describe('P2.2A: Integração Experimental Segura do Histórico IndexedDB', () => {
  let idbFactory: IDBFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.clear();
    idbFactory = new IDBFactory();
  });

  it('1. Feature flag padrão está DESATIVADA e não realiza nenhum acesso ao IndexedDB nos fluxos atuais', async () => {
    expect(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY).toBe(false);

    const openSpy = vi.fn((...args: Parameters<IDBFactory['open']>) => idbFactory.open(...args));
    const spiedFactory = {
      open: openSpy,
      deleteDatabase: idbFactory.deleteDatabase.bind(idbFactory),
      cmp: idbFactory.cmp.bind(idbFactory),
      databases: idbFactory.databases.bind(idbFactory)
    } as unknown as IDBFactory;

    const remoteState = createFixtureState(USER_A, 3, 2500, 'Saldo Nuvem');
    const localNewerState = createFixtureState(USER_A, 4, 3800, 'Edição Local');
    const uploadLocalMock = vi.fn().mockResolvedValue({ success: true });

    // Fluxo real de hydrateUserFinanceSession sem override de flag
    const hydrationOutcome = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: localNewerState,
      fetchRemote: async () => ({
        success: true,
        data: remoteState,
        version: 3,
        clientTimestamp: remoteState.lastModified
      }),
      uploadLocal: uploadLocalMock,
      experimentalHistoryOptions: {
        indexedDBFactory: spiedFactory
      }
    });

    expect(hydrationOutcome.aborted).toBe(false);
    expect(hydrationOutcome.hydrated).toBe(true);
    expect(uploadLocalMock).toHaveBeenCalledTimes(1);

    // Backup legado em localStorage preservado
    const legacySnap = getRecoverySnapshotForUser(USER_A);
    expect(legacySnap).not.toBeNull();
    expect(legacySnap?.reason).toBe('pre_local_push');
    expect(legacySnap?.state.version).toBe(3);

    // Zero acessos ao IndexedDB com a flag desativada
    expect(openSpy).not.toHaveBeenCalled();

    const directRes = await saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      remoteState,
      'pre_reset_clean',
      { indexedDBFactory: spiedFactory }
    );
    expect(directRes.legacySaved).toBe(true);
    expect(directRes.historyAttempted).toBe(false);
    expect(directRes.historySaved).toBe(false);
    expect(directRes.historyCode).toBe('disabled');
    expect(openSpy).not.toHaveBeenCalled();
  });

  it('2. Flag ativada apenas em teste grava adicionalmente no IndexedDB sem perder o snapshot legado', async () => {
    const remoteState = createFixtureState(USER_A, 5, 3100, 'Estado Nuvem Antes Push');
    const localNewerState = createFixtureState(USER_A, 6, 4900, 'Estado Local Novo');
    const uploadLocalMock = vi.fn().mockResolvedValue({ success: true });

    const hydrationRes = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => true,
      localUserCache: localNewerState,
      fetchRemote: async () => ({
        success: true,
        data: remoteState,
        version: 5,
        clientTimestamp: remoteState.lastModified
      }),
      uploadLocal: uploadLocalMock,
      experimentalHistoryOptions: {
        enableExperimentalHistory: true,
        indexedDBFactory: idbFactory
      }
    });

    expect(hydrationRes.aborted).toBe(false);
    expect(hydrationRes.hydrated).toBe(true);
    expect(uploadLocalMock).toHaveBeenCalledTimes(1);

    // Legado preservado integralmente
    const legacySnap = getRecoverySnapshotForUser(USER_A);
    expect(legacySnap).not.toBeNull();
    expect(legacySnap?.reason).toBe('pre_local_push');
    expect(legacySnap?.state).toEqual(remoteState);

    // Histórico experimental também gravado e confirmado no IndexedDB
    const historyList = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(historyList.success).toBe(true);
    expect(historyList.items).toHaveLength(1);
    expect(historyList.items[0].reason).toBe('pre_local_push');

    const storedRecord = await getRecoverySnapshotById(USER_A, historyList.items[0].id, {
      indexedDBFactory: idbFactory
    });
    expect(storedRecord.success).toBe(true);
    expect(storedRecord.record?.state).toEqual(remoteState);
  });

  it('3. Falha no IndexedDB preserva o comportamento legado e registra falha controlada sem expor dados financeiros', async () => {
    const sensitiveState = createFixtureState(
      USER_A,
      7,
      9876.54,
      'Salário Ultra Secreto 98765'
    );
    const failures: ExperimentalHistoryFailureInfo[] = [];
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Caso A: IndexedDB indisponível
    const unavailableRes = await saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      sensitiveState,
      'pre_json_import',
      {
        enableExperimentalHistory: true,
        indexedDBFactory: null,
        onExperimentalFailure: f => failures.push(f)
      }
    );

    expect(unavailableRes.legacySaved).toBe(true);
    expect(unavailableRes.historyAttempted).toBe(true);
    expect(unavailableRes.historySaved).toBe(false);
    expect(unavailableRes.historyCode).toBe('idb_unavailable');

    // Backup legado intacto em localStorage
    const legacyAfterUnavailable = getRecoverySnapshotForUser(USER_A);
    expect(legacyAfterUnavailable).not.toBeNull();
    expect(legacyAfterUnavailable?.reason).toBe('pre_json_import');
    expect(legacyAfterUnavailable?.state.transactions[0].description).toBe(
      'Salário Ultra Secreto 98765'
    );

    // Caso B: QuotaExceededError durante commit no IndexedDB
    const quotaFactory: IDBFactory = {
      open: (name: string, version?: number) => idbFactory.open(name, version),
      deleteDatabase: (name: string) => idbFactory.deleteDatabase(name),
      cmp: (a: any, b: any) => idbFactory.cmp(a, b),
      databases: () => idbFactory.databases()
    };

    const quotaRes = await saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      createFixtureState(USER_A, 8, 1234.56, 'Movimento Sensível Quota'),
      'pre_force_download',
      {
        enableExperimentalHistory: true,
        indexedDBFactory: quotaFactory,
        beforeCommitHook: ({ transaction }) => {
          const quotaErr = new DOMException('Quota exceeded', 'QuotaExceededError');
          Object.defineProperty(transaction, 'error', { value: quotaErr, configurable: true });
          transaction.abort();
        },
        onExperimentalFailure: f => failures.push(f)
      }
    );

    expect(quotaRes.legacySaved).toBe(true);
    expect(quotaRes.historySaved).toBe(false);
    expect(quotaRes.historyCode).toBe('quota_exceeded');
    expect(getRecoverySnapshotForUser(USER_A)?.reason).toBe('pre_force_download');

    // Nenhum log ou falha controlada expõe dados financeiros ou UUID
    expect(failures).toHaveLength(2);
    const serializedLogs = JSON.stringify({
      failures,
      warnings: warnSpy.mock.calls
    });
    expect(serializedLogs).not.toContain('Salário Ultra Secreto');
    expect(serializedLogs).not.toContain('Movimento Sensível Quota');
    expect(serializedLogs).not.toContain('9876.54');
    expect(serializedLogs).not.toContain('Conta Corrente Secreta');
    expect(serializedLogs).not.toContain(USER_A);

    warnSpy.mockRestore();
  });

  it('4. Bloqueia e aborta operação crítica após troca de usuário ou logout durante gravação assíncrona', async () => {
    // Caso 4A: Sessão já inválida antes do início não grava nada
    const preInvalidRes = await saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      createFixtureState(USER_A, 2, 2000),
      'pre_reset_clean',
      {
        enableExperimentalHistory: true,
        indexedDBFactory: idbFactory,
        isSessionStillValid: () => false
      }
    );

    expect(preInvalidRes.abortedBySessionChange).toBe(true);
    expect(preInvalidRes.legacySaved).toBe(false);
    expect(preInvalidRes.historySaved).toBe(false);
    expect(getRecoverySnapshotForUser(USER_A)).toBeNull();

    // Caso 4B: Logout/troca de conta ocorre durante a transação assíncrona no hydrateUserFinanceSession
    let sessionStillActive = true;
    const remoteState = createFixtureState(USER_A, 4, 2500, 'Remoto');
    const localNewerState = createFixtureState(USER_A, 5, 3500, 'Local Novo');
    const uploadLocalMock = vi.fn().mockResolvedValue({ success: true });

    const hydrationAborted = await hydrateUserFinanceSession({
      userId: USER_A,
      isSessionMatch: () => sessionStillActive,
      localUserCache: localNewerState,
      fetchRemote: async () => ({
        success: true,
        data: remoteState,
        version: 4,
        clientTimestamp: remoteState.lastModified
      }),
      uploadLocal: uploadLocalMock,
      experimentalHistoryOptions: {
        enableExperimentalHistory: true,
        indexedDBFactory: idbFactory,
        beforeCommitHook: () => {
          // Simula logout ou troca para USER_B no meio da gravação assíncrona
          sessionStillActive = false;
        }
      }
    });

    expect(hydrationAborted.aborted).toBe(true);
    expect(hydrationAborted.hydrated).toBe(false);
    expect(hydrationAborted.status).toBe('unauthenticated');
    // Não deve prosseguir com upload ao Supabase após perda da sessão
    expect(uploadLocalMock).not.toHaveBeenCalled();

    // Caso 4C: Gravação enfileirada para USER_A é cancelada antes de abrir IndexedDB se sessão mudou na fila
    let queueSessionValid = true;
    const firstSlowWrite = saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      createFixtureState(USER_A, 10, 1000, 'Escrita 1'),
      'pre_json_import',
      {
        enableExperimentalHistory: true,
        indexedDBFactory: idbFactory,
        isSessionStillValid: () => true,
        beforeCommitHook: () => {
          // Quando a primeira escrita está prestes a concluir, o usuário troca de conta
          queueSessionValid = false;
        }
      }
    );

    const secondQueuedWrite = saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      createFixtureState(USER_A, 11, 9000, 'Escrita 2 Após Logout'),
      'pre_reset_clean',
      {
        enableExperimentalHistory: true,
        indexedDBFactory: idbFactory,
        isSessionStillValid: () => queueSessionValid
      }
    );

    const [res1, res2] = await Promise.all([firstSlowWrite, secondQueuedWrite]);
    expect(res1.historySaved).toBe(true);
    expect(res2.abortedBySessionChange).toBe(true);
    expect(res2.historyAttempted).toBe(false);
    expect(res2.historySaved).toBe(false);

    // Apenas a escrita anterior ao logout foi gravada no IndexedDB
    const historyA = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(historyA.items.some(i => i.version === 11)).toBe(false);
  });

  it('5. Serializa concorrência de gravações para o mesmo usuário respeitando retenção de 5 e isolamento entre contas', async () => {
    const concurrentWritesA = Array.from({ length: 7 }, (_, idx) => {
      const version = idx + 1;
      return saveRecoverySnapshotWithExperimentalHistory(
        USER_A,
        createFixtureState(USER_A, version, 1000 + version * 100, `Concorrente A #${version}`),
        `concurrent_a_${version}`,
        {
          enableExperimentalHistory: true,
          indexedDBFactory: idbFactory
        }
      );
    });

    const concurrentWritesB = Array.from({ length: 3 }, (_, idx) => {
      const version = idx + 1;
      return saveRecoverySnapshotWithExperimentalHistory(
        USER_B,
        createFixtureState(USER_B, version, 5000 + version * 100, `Concorrente B #${version}`),
        `concurrent_b_${version}`,
        {
          enableExperimentalHistory: true,
          indexedDBFactory: idbFactory
        }
      );
    });

    const allResults = await Promise.all([...concurrentWritesA, ...concurrentWritesB]);
    expect(allResults.every(r => r.legacySaved && r.historySaved)).toBe(true);

    const listA = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    const listB = await listRecoveryHistory(USER_B, { indexedDBFactory: idbFactory });

    expect(listA.items).toHaveLength(MAX_RECOVERY_SNAPSHOTS_PER_USER);
    expect(listA.items.map(i => i.version)).toEqual([7, 6, 5, 4, 3]);

    expect(listB.items).toHaveLength(3);
    expect(listB.items.map(i => i.version)).toEqual([3, 2, 1]);

    // Backups legados individuais das duas contas continuam íntegros
    expect(getRecoverySnapshotForUser(USER_A)?.state.version).toBe(7);
    expect(getRecoverySnapshotForUser(USER_B)?.state.version).toBe(3);
  });

  it('6 e 7. Não executa chamadas ao Supabase nem modifica o estado financeiro ativo em memória ou localStorage', async () => {
    const activeState = createFixtureState(USER_A, 15, 7500, 'Estado Ativo Real');
    saveStateToStorageForUser(USER_A, activeState);
    const activeKey = `finance_pro_app_state_${USER_A}`;
    const rawActiveBefore = storageMock.getItem(activeKey);

    const snapshotInput = createFixtureState(USER_A, 14, 6200, 'Snapshot Antes da Mutação');
    const originalInputCopy = JSON.parse(JSON.stringify(snapshotInput));

    const writePromise = saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      snapshotInput,
      'pre_json_import',
      {
        enableExperimentalHistory: true,
        indexedDBFactory: idbFactory
      }
    );

    // Simula mutação posterior do objeto em memória enquanto a gravação assíncrona ocorre
    snapshotInput.transactions[0].description = 'MUTAÇÃO POSTERIOR INDEVIDA';
    snapshotInput.safetyReserveDesired = 999999;

    const writeRes = await writePromise;
    expect(writeRes.legacySaved).toBe(true);
    expect(writeRes.historySaved).toBe(true);

    // Estado ativo em localStorage não foi alterado
    expect(storageMock.getItem(activeKey)).toBe(rawActiveBefore);
    expect(getUserStateFromStorage(USER_A)).toEqual(activeState);

    // Registro salvo no IndexedDB preservou a cópia imutável original sem a mutação posterior
    const readSaved = await getRecoverySnapshotById(USER_A, writeRes.snapshotId!, {
      indexedDBFactory: idbFactory
    });
    expect(readSaved.success).toBe(true);
    expect(readSaved.record?.state).toEqual(originalInputCopy);

    // Snapshot legado continua na chave própria
    expect(storageMock.getItem(getUserRecoveryKey(USER_A))).not.toBeNull();

    // Zero chamadas de escrita ou leitura ao Supabase
    expect(fromMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });
});
