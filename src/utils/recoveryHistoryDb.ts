/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppState, isValidStorageUserId } from './storage';

export const RECOVERY_HISTORY_DB_NAME = 'gestao_financeira_recovery_db';
export const RECOVERY_HISTORY_DB_VERSION = 1;
export const RECOVERY_HISTORY_STORE_NAME = 'recovery_snapshots';
export const RECOVERY_HISTORY_OWNER_INDEX = 'by_owner';
export const RECOVERY_HISTORY_OWNER_CREATED_INDEX = 'by_owner_created';
export const MAX_RECOVERY_SNAPSHOTS_PER_USER = 5;

export interface RecoveryHistoryCounts {
  transactions: number;
  accounts: number;
  creditCards: number;
  debts: number;
  goals: number;
  categories: number;
}

export interface RecoveryHistoryRecord {
  id: string;
  ownerUserId: string;
  savedAt: string;
  createdAtMs: number;
  reason: string;
  version: number;
  contentSignature: string;
  counts: RecoveryHistoryCounts;
  state: AppState;
}

export interface RecoveryHistorySummary {
  id: string;
  ownerUserId: string;
  savedAt: string;
  createdAtMs: number;
  reason: string;
  version: number;
  contentSignature: string;
  counts: RecoveryHistoryCounts;
}

export type RecoveryDbErrorCode =
  | 'ok'
  | 'invalid_user'
  | 'owner_mismatch'
  | 'invalid_state'
  | 'not_found'
  | 'corrupted_record'
  | 'idb_unavailable'
  | 'open_error'
  | 'blocked'
  | 'quota_exceeded'
  | 'transaction_aborted';

export interface SaveRecoveryHistoryResult {
  success: boolean;
  code: RecoveryDbErrorCode;
  deduplicated?: boolean;
  prunedCount?: number;
  record?: RecoveryHistorySummary;
  message: string;
}

export interface ListRecoveryHistoryResult {
  success: boolean;
  code: RecoveryDbErrorCode;
  items: RecoveryHistorySummary[];
  skippedCorruptedCount: number;
  message: string;
}

export interface ReadRecoverySnapshotResult {
  success: boolean;
  code: RecoveryDbErrorCode;
  record?: RecoveryHistoryRecord;
  message: string;
}

export interface ExportRecoverySnapshotResult {
  success: boolean;
  code: RecoveryDbErrorCode;
  filename?: string;
  jsonContent?: string;
  message: string;
}

export interface RecoveryDbRuntimeOptions {
  indexedDBFactory?: IDBFactory | null;
  maxSnapshotsPerUser?: number;
  /** Gancho opcional exclusivo para testes simularem falha após gravação antes do commit */
  beforeCommitHook?: (context: {
    transaction: IDBTransaction;
    store: IDBObjectStore;
    insertedRecord: RecoveryHistoryRecord;
  }) => void;
}

function resolveIndexedDBFactory(options?: RecoveryDbRuntimeOptions): IDBFactory | null {
  if (options && 'indexedDBFactory' in options) {
    return options.indexedDBFactory ?? null;
  }
  try {
    if (typeof globalThis !== 'undefined' && globalThis.indexedDB) {
      return globalThis.indexedDB;
    }
  } catch {
    return null;
  }
  return null;
}

function generateSnapshotId(): string {
  try {
    if (typeof globalThis !== 'undefined' && globalThis.crypto?.randomUUID) {
      return globalThis.crypto.randomUUID();
    }
  } catch {
    // fallback abaixo
  }
  const randomPart = Math.random().toString(36).slice(2, 10);
  return `snap_${Date.now()}_${randomPart}`;
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

export function computeStateContentSignature(state: AppState): string {
  const canonicalPayload = {
    safetyReserveDesired: state.safetyReserveDesired,
    isSampleLoaded: Boolean(state.isSampleLoaded),
    transactions: state.transactions || [],
    accounts: state.accounts || [],
    categories: state.categories || [],
    creditCards: state.creditCards || [],
    debts: state.debts || [],
    goals: state.goals || [],
    ...(state.recurringIncomes?.length ? { recurringIncomes: state.recurringIncomes } : {})
  };
  const serialized = stableStringify(canonicalPayload);

  // Hash FNV-1a 64-bit combinado com tamanho para assinatura compacta e determinística
  let hashHigh = 0x811c9dc5;
  let hashLow = 0x9dc5811c;
  for (let i = 0; i < serialized.length; i++) {
    const ch = serialized.charCodeAt(i);
    hashHigh ^= ch;
    hashHigh = Math.imul(hashHigh, 0x01000193);
    hashLow ^= ch + (i & 0xff);
    hashLow = Math.imul(hashLow, 0x01000193);
  }
  return `${(hashHigh >>> 0).toString(16).padStart(8, '0')}${(hashLow >>> 0).toString(16).padStart(8, '0')}_${serialized.length}`;
}

function extractCounts(state: AppState): RecoveryHistoryCounts {
  return {
    transactions: state.transactions.length,
    accounts: state.accounts.length,
    creditCards: state.creditCards.length,
    debts: state.debts.length,
    goals: state.goals.length,
    categories: state.categories.length
  };
}

function cloneAppStateSafely(state: AppState, ownerUserId: string): AppState {
  const serialized = JSON.stringify({
    ...state,
    ownerUserId
  });
  return JSON.parse(serialized) as AppState;
}

function isStructurallyValidAppState(state: unknown, expectedUserId: string): state is AppState {
  if (!state || typeof state !== 'object' || Array.isArray(state)) return false;
  const s = state as Record<string, unknown>;

  if (!isValidStorageUserId(s.ownerUserId as string) || s.ownerUserId !== expectedUserId) {
    return false;
  }

  return (
    Array.isArray(s.transactions) &&
    Array.isArray(s.accounts) &&
    Array.isArray(s.creditCards) &&
    Array.isArray(s.debts) &&
    Array.isArray(s.goals) &&
    Array.isArray(s.categories) &&
    (s.recurringIncomes === undefined || Array.isArray(s.recurringIncomes)) &&
    typeof s.safetyReserveDesired === 'number' &&
    Number.isFinite(s.safetyReserveDesired)
  );
}

function isValidHistoryRecord(
  record: unknown,
  expectedUserId: string
): record is RecoveryHistoryRecord {
  if (!record || typeof record !== 'object' || Array.isArray(record)) return false;
  const r = record as Record<string, unknown>;

  if (typeof r.id !== 'string' || !r.id.trim()) return false;
  if (!isValidStorageUserId(r.ownerUserId as string) || r.ownerUserId !== expectedUserId) return false;
  if (typeof r.savedAt !== 'string' || Number.isNaN(Date.parse(r.savedAt))) return false;
  if (typeof r.createdAtMs !== 'number' || !Number.isFinite(r.createdAtMs)) return false;
  if (typeof r.reason !== 'string') return false;
  if (typeof r.version !== 'number' || !Number.isFinite(r.version)) return false;
  if (typeof r.contentSignature !== 'string' || !r.contentSignature) return false;
  if (!isStructurallyValidAppState(r.state, expectedUserId)) return false;

  return true;
}

function toSummary(record: RecoveryHistoryRecord): RecoveryHistorySummary {
  return {
    id: record.id,
    ownerUserId: record.ownerUserId,
    savedAt: record.savedAt,
    createdAtMs: record.createdAtMs,
    reason: record.reason,
    version: record.version,
    contentSignature: record.contentSignature,
    counts: { ...record.counts }
  };
}

function isQuotaExceededError(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  const domErr = err as { name?: string; code?: number; message?: string };
  return (
    domErr.name === 'QuotaExceededError' ||
    domErr.name === 'NS_ERROR_DOM_QUOTA_REACHED' ||
    domErr.code === 22 ||
    domErr.code === 1014 ||
    (typeof domErr.message === 'string' && /quota/i.test(domErr.message))
  );
}

function buildSafeExportFilename(savedAtIso: string): string {
  const parsed = new Date(savedAtIso);
  const d = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const pad = (n: number) => String(n).padStart(2, '0');
  const datePart = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const timePart = `${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
  return `ponto_recuperacao_${datePart}_${timePart}.json`;
}

function openRecoveryHistoryDatabase(
  idbFactory: IDBFactory
): Promise<{ ok: true; db: IDBDatabase } | { ok: false; code: RecoveryDbErrorCode; message: string }> {
  return new Promise(resolve => {
    let settled = false;
    const finish = (
      res: { ok: true; db: IDBDatabase } | { ok: false; code: RecoveryDbErrorCode; message: string }
    ) => {
      if (!settled) {
        settled = true;
        resolve(res);
      }
    };

    try {
      const request = idbFactory.open(RECOVERY_HISTORY_DB_NAME, RECOVERY_HISTORY_DB_VERSION);

      request.onupgradeneeded = () => {
        const db = request.result;
        let store: IDBObjectStore;
        if (!db.objectStoreNames.contains(RECOVERY_HISTORY_STORE_NAME)) {
          store = db.createObjectStore(RECOVERY_HISTORY_STORE_NAME, { keyPath: 'id' });
        } else {
          store = request.transaction!.objectStore(RECOVERY_HISTORY_STORE_NAME);
        }

        if (!store.indexNames.contains(RECOVERY_HISTORY_OWNER_INDEX)) {
          store.createIndex(RECOVERY_HISTORY_OWNER_INDEX, 'ownerUserId', { unique: false });
        }

        if (!store.indexNames.contains(RECOVERY_HISTORY_OWNER_CREATED_INDEX)) {
          store.createIndex(RECOVERY_HISTORY_OWNER_CREATED_INDEX, ['ownerUserId', 'createdAtMs'], {
            unique: false
          });
        }
      };

      request.onblocked = () => {
        finish({
          ok: false,
          code: 'blocked',
          message: 'Abertura do repositório local bloqueada por outra aba ativa.'
        });
      };

      request.onerror = () => {
        const err = request.error;
        finish({
          ok: false,
          code: isQuotaExceededError(err) ? 'quota_exceeded' : 'open_error',
          message: err?.message || 'Erro ao abrir o banco IndexedDB de recuperação.'
        });
      };

      request.onsuccess = () => {
        const db = request.result;
        db.onversionchange = () => {
          db.close();
        };
        finish({ ok: true, db });
      };
    } catch (err: any) {
      finish({
        ok: false,
        code: isQuotaExceededError(err) ? 'quota_exceeded' : 'open_error',
        message: err?.message || 'Exceção ao inicializar IndexedDB de recuperação.'
      });
    }
  });
}

/**
 * Grava um novo ponto de recuperação no IndexedDB para o usuário autenticado,
 * realizando deduplicação consecutiva e retenção atômica (máx. 5 snapshots por usuário)
 * dentro de uma única transação readwrite.
 */
export async function saveSnapshotToRecoveryHistory(
  userId: string,
  state: AppState,
  reason: string,
  options?: RecoveryDbRuntimeOptions
): Promise<SaveRecoveryHistoryResult> {
  if (!isValidStorageUserId(userId)) {
    return {
      success: false,
      code: 'invalid_user',
      message: 'UUID de usuário inválido para gravação de snapshot.'
    };
  }

  if (!state || typeof state !== 'object' || Array.isArray(state)) {
    return {
      success: false,
      code: 'invalid_state',
      message: 'Estado financeiro inválido para criação de snapshot.'
    };
  }

  if (!isValidStorageUserId(state.ownerUserId as string) || state.ownerUserId !== userId) {
    return {
      success: false,
      code: 'owner_mismatch',
      message: 'Gravação bloqueada: ownerUserId do estado não corresponde ao usuário autenticado.'
    };
  }

  if (!isStructurallyValidAppState(state, userId)) {
    return {
      success: false,
      code: 'invalid_state',
      message: 'Estrutura do estado financeiro incompatível para snapshot.'
    };
  }

  const idbFactory = resolveIndexedDBFactory(options);
  if (!idbFactory || typeof idbFactory.open !== 'function') {
    return {
      success: false,
      code: 'idb_unavailable',
      message: 'IndexedDB indisponível neste ambiente.'
    };
  }

  const openRes = await openRecoveryHistoryDatabase(idbFactory);
  if (!openRes.ok) {
    return {
      success: false,
      code: openRes.code,
      message: openRes.message
    };
  }

  const db = openRes.db;
  const maxAllowed = Math.max(1, options?.maxSnapshotsPerUser ?? MAX_RECOVERY_SNAPSHOTS_PER_USER);

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: SaveRecoveryHistoryResult) => {
      if (!settled) {
        settled = true;
        try {
          db.close();
        } catch {
          // ignore close errors
        }
        resolve(result);
      }
    };

    try {
      const tx = db.transaction(RECOVERY_HISTORY_STORE_NAME, 'readwrite');
      const store = tx.objectStore(RECOVERY_HISTORY_STORE_NAME);
      const ownerIndex = store.index(RECOVERY_HISTORY_OWNER_INDEX);

      let outcomeRecord: RecoveryHistorySummary | undefined;
      let isDeduplicated = false;
      let prunedCount = 0;

      tx.oncomplete = () => {
        finish({
          success: true,
          code: 'ok',
          deduplicated: isDeduplicated,
          prunedCount,
          record: outcomeRecord,
          message: isDeduplicated
            ? 'Snapshot consecutivo idêntico ignorado (deduplicado com segurança).'
            : 'Ponto de recuperação gravado no histórico local com sucesso.'
        });
      };

      tx.onabort = () => {
        const err = tx.error;
        finish({
          success: false,
          code: isQuotaExceededError(err) ? 'quota_exceeded' : 'transaction_aborted',
          message: isQuotaExceededError(err)
            ? 'Armazenamento local cheio ao gravar snapshot. Nenhum registro anterior foi perdido.'
            : err?.message || 'Transação de histórico de recuperação abortada; registros anteriores preservados.'
        });
      };

      tx.onerror = () => {
        const err = tx.error;
        finish({
          success: false,
          code: isQuotaExceededError(err) ? 'quota_exceeded' : 'transaction_aborted',
          message: isQuotaExceededError(err)
            ? 'Armazenamento local cheio ao gravar snapshot. Nenhum registro anterior foi perdido.'
            : err?.message || 'Erro durante transação no histórico de recuperação.'
        });
      };

      const ownerKeyQuery = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(userId) : userId;
      const existingReq = ownerIndex.getAll(ownerKeyQuery);
      existingReq.onerror = () => {
        try {
          tx.abort();
        } catch {
          // ignore abort errors
        }
      };

      existingReq.onsuccess = () => {
        const rawRecords = Array.isArray(existingReq.result) ? existingReq.result : [];
        const validOwned = rawRecords
          .filter((item): item is RecoveryHistoryRecord => isValidHistoryRecord(item, userId))
          .sort((a, b) => b.createdAtMs - a.createdAtMs);

        const contentSignature = computeStateContentSignature(state);
        const latest = validOwned[0];

        if (latest && latest.contentSignature === contentSignature) {
          isDeduplicated = true;
          outcomeRecord = toSummary(latest);
          return;
        }

        const nowMs = Date.now();
        const highestExistingMs = validOwned.reduce(
          (max, item) => (item.createdAtMs > max ? item.createdAtMs : max),
          0
        );
        const createdAtMs = nowMs > highestExistingMs ? nowMs : highestExistingMs + 1;
        const savedAt = new Date(nowMs).toISOString();

        const clonedState = cloneAppStateSafely(state, userId);
        const newRecord: RecoveryHistoryRecord = {
          id: generateSnapshotId(),
          ownerUserId: userId,
          savedAt,
          createdAtMs,
          reason: typeof reason === 'string' && reason.trim() ? reason.trim() : 'automatic_snapshot',
          version: typeof clonedState.version === 'number' && Number.isFinite(clonedState.version) ? clonedState.version : 1,
          contentSignature,
          counts: extractCounts(clonedState),
          state: clonedState
        };

        const addReq = store.add(newRecord);
        addReq.onerror = () => {
          try {
            tx.abort();
          } catch {
            // ignore abort errors
          }
        };

        addReq.onsuccess = () => {
          outcomeRecord = toSummary(newRecord);

          // Só marca excedentes para exclusão dentro da mesma transação após confirmar o add do novo snapshot
          const allAfterAdd = [newRecord, ...validOwned].sort((a, b) => b.createdAtMs - a.createdAtMs);
          const toDelete = allAfterAdd.slice(maxAllowed);

          for (const obsolete of toDelete) {
            const delReq = store.delete(obsolete.id);
            delReq.onerror = () => {
              try {
                tx.abort();
              } catch {
                // ignore abort errors
              }
            };
          }
          prunedCount = toDelete.length;

          if (options?.beforeCommitHook) {
            options.beforeCommitHook({
              transaction: tx,
              store,
              insertedRecord: newRecord
            });
          }
        };
      };
    } catch (err: any) {
      finish({
        success: false,
        code: isQuotaExceededError(err) ? 'quota_exceeded' : 'transaction_aborted',
        message: err?.message || 'Falha inesperada ao gravar no histórico IndexedDB.'
      });
    }
  });
}

/**
 * Lista os metadados e contagens dos snapshots do usuário autenticado,
 * ordenados do mais recente para o mais antigo, em modo SOMENTE LEITURA.
 */
export async function listRecoveryHistory(
  userId: string,
  options?: RecoveryDbRuntimeOptions
): Promise<ListRecoveryHistoryResult> {
  if (!isValidStorageUserId(userId)) {
    return {
      success: false,
      code: 'invalid_user',
      items: [],
      skippedCorruptedCount: 0,
      message: 'UUID de usuário inválido.'
    };
  }

  const idbFactory = resolveIndexedDBFactory(options);
  if (!idbFactory || typeof idbFactory.open !== 'function') {
    return {
      success: false,
      code: 'idb_unavailable',
      items: [],
      skippedCorruptedCount: 0,
      message: 'IndexedDB indisponível neste ambiente.'
    };
  }

  const openRes = await openRecoveryHistoryDatabase(idbFactory);
  if (!openRes.ok) {
    return {
      success: false,
      code: openRes.code,
      items: [],
      skippedCorruptedCount: 0,
      message: openRes.message
    };
  }

  const db = openRes.db;

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: ListRecoveryHistoryResult) => {
      if (!settled) {
        settled = true;
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve(result);
      }
    };

    try {
      const tx = db.transaction(RECOVERY_HISTORY_STORE_NAME, 'readonly');
      const store = tx.objectStore(RECOVERY_HISTORY_STORE_NAME);
      const ownerIndex = store.index(RECOVERY_HISTORY_OWNER_INDEX);

      const ownerKeyQuery = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(userId) : userId;
      const req = ownerIndex.getAll(ownerKeyQuery);
      req.onerror = () => {
        finish({
          success: false,
          code: 'transaction_aborted',
          items: [],
          skippedCorruptedCount: 0,
          message: req.error?.message || 'Erro ao listar snapshots locais.'
        });
      };

      req.onsuccess = () => {
        const raw = Array.isArray(req.result) ? req.result : [];
        let skippedCorruptedCount = 0;
        const validItems: RecoveryHistoryRecord[] = [];

        for (const item of raw) {
          if (isValidHistoryRecord(item, userId)) {
            validItems.push(item);
          } else {
            skippedCorruptedCount += 1;
          }
        }

        validItems.sort((a, b) => b.createdAtMs - a.createdAtMs);
        finish({
          success: true,
          code: 'ok',
          items: validItems.map(toSummary),
          skippedCorruptedCount,
          message: 'Histórico consultado com sucesso.'
        });
      };
    } catch (err: any) {
      finish({
        success: false,
        code: 'transaction_aborted',
        items: [],
        skippedCorruptedCount: 0,
        message: err?.message || 'Falha ao consultar histórico no IndexedDB.'
      });
    }
  });
}

/**
 * Lê um snapshot completo por ID validando estritamente propriedade tanto no registro quanto no AppState.
 */
export async function getRecoverySnapshotById(
  userId: string,
  snapshotId: string,
  options?: RecoveryDbRuntimeOptions
): Promise<ReadRecoverySnapshotResult> {
  if (!isValidStorageUserId(userId)) {
    return {
      success: false,
      code: 'invalid_user',
      message: 'UUID de usuário inválido.'
    };
  }

  if (typeof snapshotId !== 'string' || !snapshotId.trim()) {
    return {
      success: false,
      code: 'not_found',
      message: 'Identificador de snapshot inválido.'
    };
  }

  const idbFactory = resolveIndexedDBFactory(options);
  if (!idbFactory || typeof idbFactory.open !== 'function') {
    return {
      success: false,
      code: 'idb_unavailable',
      message: 'IndexedDB indisponível neste ambiente.'
    };
  }

  const openRes = await openRecoveryHistoryDatabase(idbFactory);
  if (!openRes.ok) {
    return {
      success: false,
      code: openRes.code,
      message: openRes.message
    };
  }

  const db = openRes.db;

  return new Promise(resolve => {
    let settled = false;
    const finish = (result: ReadRecoverySnapshotResult) => {
      if (!settled) {
        settled = true;
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve(result);
      }
    };

    try {
      const tx = db.transaction(RECOVERY_HISTORY_STORE_NAME, 'readonly');
      const store = tx.objectStore(RECOVERY_HISTORY_STORE_NAME);
      const req = store.get(snapshotId);

      req.onerror = () => {
        finish({
          success: false,
          code: 'transaction_aborted',
          message: req.error?.message || 'Erro ao ler snapshot no IndexedDB.'
        });
      };

      req.onsuccess = () => {
        const record = req.result;
        if (!record) {
          finish({
            success: false,
            code: 'not_found',
            message: 'Snapshot não encontrado no repositório local.'
          });
          return;
        }

        const recordOwner = (record as { ownerUserId?: unknown }).ownerUserId;
        const innerStateOwner = (record as { state?: { ownerUserId?: unknown } }).state?.ownerUserId;

        if (recordOwner !== userId || innerStateOwner !== userId) {
          finish({
            success: false,
            code: 'owner_mismatch',
            message: 'Acesso bloqueado: o snapshot pertence a outro usuário ou possui proprietário divergente.'
          });
          return;
        }

        if (!isValidHistoryRecord(record, userId)) {
          finish({
            success: false,
            code: 'corrupted_record',
            message: 'Snapshot encontrado está corrompido ou com estrutura incompatível.'
          });
          return;
        }

        finish({
          success: true,
          code: 'ok',
          record,
          message: 'Snapshot carregado com sucesso.'
        });
      };
    } catch (err: any) {
      finish({
        success: false,
        code: 'transaction_aborted',
        message: err?.message || 'Falha inesperada ao ler snapshot.'
      });
    }
  });
}

/**
 * Gera a exportação JSON de um snapshot do histórico preservando integralmente o AppState original,
 * sem alterar registros locais nem executar sincronização.
 */
export async function exportRecoverySnapshotById(
  userId: string,
  snapshotId: string,
  options?: RecoveryDbRuntimeOptions
): Promise<ExportRecoverySnapshotResult> {
  const readRes = await getRecoverySnapshotById(userId, snapshotId, options);
  if (!readRes.success || !readRes.record) {
    return {
      success: false,
      code: readRes.code,
      message: readRes.message
    };
  }

  const exportEnvelope = {
    snapshotId: readRes.record.id,
    savedAt: readRes.record.savedAt,
    reason: readRes.record.reason,
    ownerUserId: readRes.record.ownerUserId,
    state: readRes.record.state
  };

  return {
    success: true,
    code: 'ok',
    filename: buildSafeExportFilename(readRes.record.savedAt),
    jsonContent: JSON.stringify(exportEnvelope, null, 2),
    message: 'Cópia JSON do ponto de recuperação preparada com segurança.'
  };
}

export interface ClearRecoveryHistoryResult {
  success: boolean;
  code: RecoveryDbErrorCode;
  deletedCount: number;
  message: string;
}

/**
 * Remove exclusivamente os registros do histórico de recuperação pertencentes ao userId autenticado.
 * Nunca limpa a object store inteira nem apaga registros de outros usuários.
 */
export async function clearRecoveryHistoryForUser(
  userId: string,
  options?: RecoveryDbRuntimeOptions
): Promise<ClearRecoveryHistoryResult> {
  if (!isValidStorageUserId(userId)) {
    return {
      success: false,
      code: 'invalid_user',
      deletedCount: 0,
      message: 'UUID de usuário inválido para limpeza de histórico de recuperação.'
    };
  }

  const idbFactory = resolveIndexedDBFactory(options);
  if (!idbFactory || typeof idbFactory.open !== 'function') {
    return {
      success: false,
      code: 'idb_unavailable',
      deletedCount: 0,
      message: 'IndexedDB indisponível neste ambiente.'
    };
  }

  const openRes = await openRecoveryHistoryDatabase(idbFactory);
  if (!openRes.ok) {
    return {
      success: false,
      code: openRes.code,
      deletedCount: 0,
      message: openRes.message
    };
  }

  const db = openRes.db;

  return new Promise(resolve => {
    let settled = false;
    let deletedCount = 0;

    const finish = (result: ClearRecoveryHistoryResult) => {
      if (!settled) {
        settled = true;
        try {
          db.close();
        } catch {
          // ignore
        }
        resolve(result);
      }
    };

    try {
      const tx = db.transaction(RECOVERY_HISTORY_STORE_NAME, 'readwrite');
      const store = tx.objectStore(RECOVERY_HISTORY_STORE_NAME);
      const index = store.index(RECOVERY_HISTORY_OWNER_INDEX);
      const ownerKeyQuery = typeof IDBKeyRange !== 'undefined' ? IDBKeyRange.only(userId) : userId;
      const existingReq = index.getAll(ownerKeyQuery);

      existingReq.onerror = () => {
        finish({
          success: false,
          code: 'transaction_aborted',
          deletedCount,
          message: existingReq.error?.message || 'Erro ao limpar histórico de recuperação do usuário.'
        });
      };

      existingReq.onsuccess = () => {
        const records = Array.isArray(existingReq.result) ? existingReq.result : [];
        for (const record of records) {
          const rec = record as { id?: unknown; ownerUserId?: unknown } | undefined;
          if (rec && rec.ownerUserId === userId && typeof rec.id === 'string') {
            deletedCount += 1;
            store.delete(rec.id);
          }
        }
      };

      tx.oncomplete = () => {
        finish({
          success: true,
          code: 'ok',
          deletedCount,
          message: `${deletedCount} ponto(s) de recuperação removidos para o usuário.`
        });
      };

      tx.onerror = () => {
        finish({
          success: false,
          code: 'transaction_aborted',
          deletedCount,
          message: tx.error?.message || 'Transação de limpeza abortada.'
        });
      };

      tx.onabort = () => {
        finish({
          success: false,
          code: 'transaction_aborted',
          deletedCount,
          message: tx.error?.message || 'Transação de limpeza abortada.'
        });
      };
    } catch (err: any) {
      finish({
        success: false,
        code: 'transaction_aborted',
        deletedCount,
        message: err?.message || 'Falha inesperada ao limpar histórico no IndexedDB.'
      });
    }
  });
}
