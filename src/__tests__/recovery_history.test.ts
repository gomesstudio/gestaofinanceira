/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { IDBFactory } from 'fake-indexeddb';
import {
  AppState,
  DEFAULT_CATEGORIES,
  getUserRecoveryKey,
  getUserStateFromStorage,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  computeStateContentSignature,
  exportRecoverySnapshotById,
  getRecoverySnapshotById,
  listRecoveryHistory,
  MAX_RECOVERY_SNAPSHOTS_PER_USER,
  RECOVERY_HISTORY_DB_NAME,
  RECOVERY_HISTORY_OWNER_CREATED_INDEX,
  RECOVERY_HISTORY_OWNER_INDEX,
  RECOVERY_HISTORY_STORE_NAME,
  saveSnapshotToRecoveryHistory
} from '../utils/recoveryHistoryDb';
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
    },
    snapshotKeys: () => Object.keys(store)
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
  txLabel = `Lançamento v${version}`
): AppState {
  return {
    ownerUserId,
    version,
    lastModified: 1700000000000 + version * 1000,
    transactions: [
      {
        id: `tx-${version}`,
        description: txLabel,
        amount: 1000 + version * 100,
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
        balance: reserveAmount,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Fictício',
        color: '#6366f1',
        limitTotal: 4000,
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

describe('P2.1: Repositório IndexedDB Isolado de Histórico de Recuperação', () => {
  let idbFactory: IDBFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    storageMock.clear();
    idbFactory = new IDBFactory();
  });

  it('1. Grava e lê snapshots fictícios preservando metadados, contagens e estrutura do banco/índices', async () => {
    const state1 = createFixtureState(USER_A, 3, 2500);
    const saveRes = await saveSnapshotToRecoveryHistory(USER_A, state1, 'pre_json_import', {
      indexedDBFactory: idbFactory
    });

    expect(saveRes.success).toBe(true);
    expect(saveRes.code).toBe('ok');
    expect(saveRes.deduplicated).toBe(false);
    expect(saveRes.prunedCount).toBe(0);
    expect(saveRes.record).toBeDefined();
    expect(saveRes.record?.ownerUserId).toBe(USER_A);
    expect(saveRes.record?.version).toBe(3);
    expect(saveRes.record?.reason).toBe('pre_json_import');
    expect(saveRes.record?.contentSignature).toBe(computeStateContentSignature(state1));
    expect(saveRes.record?.counts).toEqual({
      transactions: 1,
      accounts: 1,
      creditCards: 1,
      debts: 0,
      goals: 0,
      categories: DEFAULT_CATEGORIES.length
    });

    const listRes = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(listRes.success).toBe(true);
    expect(listRes.items).toHaveLength(1);
    expect(listRes.items[0].id).toBe(saveRes.record!.id);

    const readRes = await getRecoverySnapshotById(USER_A, saveRes.record!.id, {
      indexedDBFactory: idbFactory
    });
    expect(readRes.success).toBe(true);
    expect(readRes.record?.state).toEqual(state1);

    // Confirma existência dos índices exigidos no Object Store
    const dbMeta = await new Promise<{ storeExists: boolean; indexes: string[] }>((resolve, reject) => {
      const req = idbFactory.open(RECOVERY_HISTORY_DB_NAME);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const storeExists = db.objectStoreNames.contains(RECOVERY_HISTORY_STORE_NAME);
        const tx = db.transaction(RECOVERY_HISTORY_STORE_NAME, 'readonly');
        const store = tx.objectStore(RECOVERY_HISTORY_STORE_NAME);
        const indexes = Array.from(store.indexNames);
        db.close();
        resolve({ storeExists, indexes });
      };
    });
    expect(dbMeta.storeExists).toBe(true);
    expect(dbMeta.indexes).toContain(RECOVERY_HISTORY_OWNER_INDEX);
    expect(dbMeta.indexes).toContain(RECOVERY_HISTORY_OWNER_CREATED_INDEX);
  });

  it('2. Cria 7 snapshots distintos e retém exatamente os 5 mais recentes ordenados por criação', async () => {
    const savedIds: string[] = [];

    for (let i = 1; i <= 7; i++) {
      const res = await saveSnapshotToRecoveryHistory(
        USER_A,
        createFixtureState(USER_A, i, 1000 + i * 250, `Movimento #${i}`),
        `reason_${i}`,
        { indexedDBFactory: idbFactory }
      );
      expect(res.success).toBe(true);
      savedIds.push(res.record!.id);
    }

    const listRes = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(listRes.success).toBe(true);
    expect(listRes.items).toHaveLength(MAX_RECOVERY_SNAPSHOTS_PER_USER);

    // Ordem decrescente do mais recente (v7) até o v3; v1 e v2 foram removidos com segurança
    expect(listRes.items.map(item => item.version)).toEqual([7, 6, 5, 4, 3]);
    expect(listRes.items.map(item => item.id)).toEqual(savedIds.slice(2).reverse());

    // Snapshots removidos não existem mais
    const removed1 = await getRecoverySnapshotById(USER_A, savedIds[0], { indexedDBFactory: idbFactory });
    const removed2 = await getRecoverySnapshotById(USER_A, savedIds[1], { indexedDBFactory: idbFactory });
    expect(removed1.success).toBe(false);
    expect(removed1.code).toBe('not_found');
    expect(removed2.success).toBe(false);
    expect(removed2.code).toBe('not_found');
  });

  it('3. Deduplica snapshots consecutivos com conteúdo financeiro idêntico sem consumir novo slot', async () => {
    const stateA = createFixtureState(USER_A, 1, 2000, 'Único');
    const stateB = createFixtureState(USER_A, 2, 3000, 'Alterado');

    const res1 = await saveSnapshotToRecoveryHistory(USER_A, stateA, 'pre_local_push', {
      indexedDBFactory: idbFactory
    });
    const res2 = await saveSnapshotToRecoveryHistory(USER_A, stateB, 'pre_force_download', {
      indexedDBFactory: idbFactory
    });
    // Mesmo conteúdo financeiro de stateB (apenas metadado version/lastModified diferente)
    const res3Dup = await saveSnapshotToRecoveryHistory(
      USER_A,
      { ...stateB, version: 99, lastModified: 1799999999999 },
      'pre_json_import',
      { indexedDBFactory: idbFactory }
    );

    expect(res1.deduplicated).toBe(false);
    expect(res2.deduplicated).toBe(false);
    expect(res3Dup.success).toBe(true);
    expect(res3Dup.deduplicated).toBe(true);
    expect(res3Dup.record?.id).toBe(res2.record?.id);

    const listRes = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(listRes.items).toHaveLength(2);
  });

  it('4. Garante isolamento total entre dois UUIDs distintos no mesmo banco', async () => {
    const saveA1 = await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 1, 1500, 'Dado Conta A'),
      'pre_reset_clean',
      { indexedDBFactory: idbFactory }
    );
    const saveB1 = await saveSnapshotToRecoveryHistory(
      USER_B,
      createFixtureState(USER_B, 1, 9500, 'Dado Conta B'),
      'pre_force_download',
      { indexedDBFactory: idbFactory }
    );

    expect(saveA1.success).toBe(true);
    expect(saveB1.success).toBe(true);

    const listA = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    const listB = await listRecoveryHistory(USER_B, { indexedDBFactory: idbFactory });

    expect(listA.items).toHaveLength(1);
    expect(listA.items[0].ownerUserId).toBe(USER_A);
    expect(listB.items).toHaveLength(1);
    expect(listB.items[0].ownerUserId).toBe(USER_B);

    // Tentativa de leitura cruzada por ID é bloqueada
    const crossRead = await getRecoverySnapshotById(USER_A, saveB1.record!.id, {
      indexedDBFactory: idbFactory
    });
    expect(crossRead.success).toBe(false);
    expect(crossRead.code).toBe('owner_mismatch');
    expect(crossRead.record).toBeUndefined();
  });

  it('5. Rejeita proprietário divergente no AppState, UUID inválido e registro interno adulterado', async () => {
    // Caso A: UUID inválido
    const badUuid = await saveSnapshotToRecoveryHistory(
      'usuario-invalido',
      createFixtureState(USER_A, 1, 1000),
      'pre_reset_clean',
      { indexedDBFactory: idbFactory }
    );
    expect(badUuid.success).toBe(false);
    expect(badUuid.code).toBe('invalid_user');

    // Caso B: state.ownerUserId pertence a USER_B tentando gravar para USER_A
    const crossState = createFixtureState(USER_B, 2, 2000);
    const mismatchSave = await saveSnapshotToRecoveryHistory(USER_A, crossState, 'pre_reset_clean', {
      indexedDBFactory: idbFactory
    });
    expect(mismatchSave.success).toBe(false);
    expect(mismatchSave.code).toBe('owner_mismatch');

    // Caso C: state sem ownerUserId
    const missingOwnerState = createFixtureState(USER_A, 2, 2000);
    delete (missingOwnerState as Partial<AppState>).ownerUserId;
    const missingOwnerSave = await saveSnapshotToRecoveryHistory(
      USER_A,
      missingOwnerState,
      'pre_reset_clean',
      { indexedDBFactory: idbFactory }
    );
    expect(missingOwnerSave.success).toBe(false);
    expect(missingOwnerSave.code).toBe('owner_mismatch');

    // Caso D: registro no IndexedDB com ownerUserId = USER_A no envelope, mas state.ownerUserId = USER_B
    const validSave = await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 1, 1000),
      'pre_reset_clean',
      { indexedDBFactory: idbFactory }
    );
    await new Promise<void>((resolve, reject) => {
      const req = idbFactory.open(RECOVERY_HISTORY_DB_NAME);
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(RECOVERY_HISTORY_STORE_NAME, 'readwrite');
        const store = tx.objectStore(RECOVERY_HISTORY_STORE_NAME);
        store.put({
          id: 'tampered-record-id',
          ownerUserId: USER_A,
          savedAt: new Date().toISOString(),
          createdAtMs: Date.now() + 5000,
          reason: 'tampered',
          version: 9,
          contentSignature: 'fake_sig',
          counts: { transactions: 1, accounts: 1, creditCards: 1, debts: 0, goals: 0, categories: 1 },
          state: createFixtureState(USER_B, 9, 9999)
        });
        tx.oncomplete = () => {
          db.close();
          resolve();
        };
        tx.onerror = () => reject(tx.error);
      };
    });

    const readTampered = await getRecoverySnapshotById(USER_A, 'tampered-record-id', {
      indexedDBFactory: idbFactory
    });
    expect(readTampered.success).toBe(false);
    expect(readTampered.code).toBe('owner_mismatch');

    // Listagem ignora o registro adulterado e preserva o válido
    const listAfterTamper = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(listAfterTamper.success).toBe(true);
    expect(listAfterTamper.skippedCorruptedCount).toBe(1);
    expect(listAfterTamper.items).toHaveLength(1);
    expect(listAfterTamper.items[0].id).toBe(validSave.record!.id);
  });

  it('6. Preserva todos os 5 registros anteriores após falha simulada de transação (rollback integral)', async () => {
    const initialIds: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const res = await saveSnapshotToRecoveryHistory(
        USER_A,
        createFixtureState(USER_A, i, 1000 + i * 100, `Base #${i}`),
        `base_${i}`,
        { indexedDBFactory: idbFactory }
      );
      expect(res.success).toBe(true);
      initialIds.push(res.record!.id);
    }

    // Tenta gravar o 6º snapshot simulando abort imediatamente antes do commit (após add e delete na mesma tx)
    const abortedSave = await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 6, 9999, 'Snapshot Que Falha'),
      'pre_reset_clean',
      {
        indexedDBFactory: idbFactory,
        beforeCommitHook: ({ transaction }) => {
          transaction.abort();
        }
      }
    );

    expect(abortedSave.success).toBe(false);
    expect(abortedSave.code).toBe('transaction_aborted');

    // Todos os 5 snapshots originais devem permanecer intactos (inclusive o mais antigo v1)
    const listAfterAbort = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(listAfterAbort.success).toBe(true);
    expect(listAfterAbort.items.map(i => i.version)).toEqual([5, 4, 3, 2, 1]);
    expect(listAfterAbort.items.map(i => i.id)).toEqual([...initialIds].reverse());
  });

  it('7. Trata armazenamento cheio (QuotaExceededError) preservando integralmente os registros existentes', async () => {
    const existingRes = await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 1, 4000, 'Existente Seguro'),
      'pre_json_import',
      { indexedDBFactory: idbFactory }
    );
    expect(existingRes.success).toBe(true);

    // Simula falha de cota no armazenamento durante o commit
    const quotaFactory: IDBFactory = {
      open: (name: string, version?: number) => idbFactory.open(name, version),
      deleteDatabase: (name: string) => idbFactory.deleteDatabase(name),
      cmp: (a: any, b: any) => idbFactory.cmp(a, b),
      databases: () => idbFactory.databases()
    };

    const quotaSave = await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 2, 7000, 'Excede Cota'),
      'pre_force_download',
      {
        indexedDBFactory: quotaFactory,
        beforeCommitHook: ({ transaction }) => {
          const quotaErr = new DOMException('Quota exceeded', 'QuotaExceededError');
          Object.defineProperty(transaction, 'error', { value: quotaErr, configurable: true });
          transaction.abort();
        }
      }
    );

    expect(quotaSave.success).toBe(false);
    expect(quotaSave.code).toBe('quota_exceeded');

    const listAfterQuota = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(listAfterQuota.success).toBe(true);
    expect(listAfterQuota.items).toHaveLength(1);
    expect(listAfterQuota.items[0].id).toBe(existingRes.record!.id);
  });

  it('8. Trata IndexedDB indisponível e falha na abertura sem lançar exceções', async () => {
    const state = createFixtureState(USER_A, 1, 2000);

    const saveNoIdb = await saveSnapshotToRecoveryHistory(USER_A, state, 'pre_reset_clean', {
      indexedDBFactory: null
    });
    expect(saveNoIdb.success).toBe(false);
    expect(saveNoIdb.code).toBe('idb_unavailable');

    const listNoIdb = await listRecoveryHistory(USER_A, { indexedDBFactory: null });
    expect(listNoIdb.success).toBe(false);
    expect(listNoIdb.code).toBe('idb_unavailable');
    expect(listNoIdb.items).toEqual([]);

    const readNoIdb = await getRecoverySnapshotById(USER_A, 'qualquer-id', {
      indexedDBFactory: null
    });
    expect(readNoIdb.success).toBe(false);
    expect(readNoIdb.code).toBe('idb_unavailable');

    // Simula erro de abertura do IndexedDB
    const failingOpenFactory = {
      open: () => {
        const fakeReq: any = {};
        queueMicrotask(() => {
          fakeReq.error = new Error('IndexedDB bloqueado pelo navegador');
          fakeReq.onerror?.();
        });
        return fakeReq;
      }
    } as unknown as IDBFactory;

    const openErrRes = await saveSnapshotToRecoveryHistory(USER_A, state, 'pre_reset_clean', {
      indexedDBFactory: failingOpenFactory
    });
    expect(openErrRes.success).toBe(false);
    expect(openErrRes.code).toBe('open_error');
  });

  it('9 e 10. Preserva integralmente o conteúdo JSON exportado sem alterar localStorage, estado ativo ou Supabase', async () => {
    const activeState = createFixtureState(USER_A, 15, 8500, 'Estado Ativo Real');
    saveStateToStorageForUser(USER_A, activeState);

    const legacySnapshotState = createFixtureState(USER_A, 4, 2100, 'Snapshot Legado P1');
    saveRecoverySnapshotForUser(USER_A, legacySnapshotState, 'pre_legacy_import');

    const activeRawBefore = storageMock.getItem(`finance_pro_app_state_${USER_A}`);
    const legacyRecoveryRawBefore = storageMock.getItem(getUserRecoveryKey(USER_A));

    const historyState = createFixtureState(USER_A, 12, 4300, 'Snapshot Histórico P2.1');
    const saved = await saveSnapshotToRecoveryHistory(USER_A, historyState, 'pre_json_import', {
      indexedDBFactory: idbFactory
    });
    expect(saved.success).toBe(true);

    const exported = await exportRecoverySnapshotById(USER_A, saved.record!.id, {
      indexedDBFactory: idbFactory
    });
    expect(exported.success).toBe(true);
    expect(exported.filename).toMatch(/^ponto_recuperacao_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
    expect(exported.filename).not.toContain(USER_A);

    const parsedExport = JSON.parse(exported.jsonContent!);
    expect(parsedExport.snapshotId).toBe(saved.record!.id);
    expect(parsedExport.ownerUserId).toBe(USER_A);
    expect(parsedExport.reason).toBe('pre_json_import');
    expect(parsedExport.state).toEqual(historyState);

    // localStorage ativo, snapshot legado e Supabase permanecem 100% intocados
    expect(storageMock.getItem(`finance_pro_app_state_${USER_A}`)).toBe(activeRawBefore);
    expect(storageMock.getItem(getUserRecoveryKey(USER_A))).toBe(legacyRecoveryRawBefore);
    expect(getUserStateFromStorage(USER_A)).toEqual(activeState);
    expect(fromMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(supabase.auth.getSession).not.toHaveBeenCalled();
  });
});
