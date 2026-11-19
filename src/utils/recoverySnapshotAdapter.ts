/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  clearRecoveryHistoryForUser,
  saveSnapshotToRecoveryHistory,
  RecoveryDbErrorCode,
  RecoveryDbRuntimeOptions
} from './recoveryHistoryDb';
import {
  AppState,
  clearUserRecoverySnapshot,
  isValidStorageUserId,
  saveRecoverySnapshotForUser
} from './storage';

/**
 * Feature flag explícita da etapa P2.2A.
 * DEVE permanecer `false` por padrão em produção até conclusão e autorização das etapas seguintes.
 * Não há controle de ativação exposto para usuários finais nesta etapa.
 */
export const ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY = false;

export interface ExperimentalHistoryFailureInfo {
  reason: string;
  code: RecoveryDbErrorCode | 'session_invalid' | 'unexpected_error';
  message: string;
}

export interface ExperimentalRecoveryAdapterOptions {
  /** Override exclusivo para testes automatizados; nunca ativar em produção na P2.2A */
  enableExperimentalHistory?: boolean;
  indexedDBFactory?: IDBFactory | null;
  maxSnapshotsPerUser?: number;
  beforeCommitHook?: RecoveryDbRuntimeOptions['beforeCommitHook'];
  isSessionStillValid?: () => boolean;
  onExperimentalFailure?: (failure: ExperimentalHistoryFailureInfo) => void;
}

export interface ExperimentalRecoverySnapshotResult {
  legacySaved: boolean;
  historyAttempted: boolean;
  historySaved: boolean;
  historyCode:
    | RecoveryDbErrorCode
    | 'disabled'
    | 'skipped_ineligible'
    | 'session_invalid'
    | 'unexpected_error';
  abortedBySessionChange: boolean;
  deduplicated?: boolean;
  snapshotId?: string;
  failureInfo?: ExperimentalHistoryFailureInfo;
}

// Fila em memória por userId para serializar gravações experimentais concorrentes do mesmo usuário
const perUserExperimentalWriteQueues = new Map<string, Promise<void>>();

function runSerializedForUser<T>(userId: string, task: () => Promise<T>): Promise<T> {
  const previousTail = perUserExperimentalWriteQueues.get(userId) ?? Promise.resolve();
  const taskPromise = previousTail.catch(() => undefined).then(task);
  const newTail = taskPromise.then(
    () => undefined,
    () => undefined
  );

  perUserExperimentalWriteQueues.set(userId, newTail);

  newTail.finally(() => {
    if (perUserExperimentalWriteQueues.get(userId) === newTail) {
      perUserExperimentalWriteQueues.delete(userId);
    }
  });

  return taskPromise;
}

function hasEligibleSnapshotContent(state: AppState): boolean {
  return (
    Array.isArray(state.transactions) &&
    Array.isArray(state.debts) &&
    Array.isArray(state.goals) &&
    (state.transactions.length > 0 || state.debts.length > 0 || state.goals.length > 0)
  );
}

function cloneImmutableSnapshotState(state: AppState, userId: string): AppState {
  return JSON.parse(
    JSON.stringify({
      ...state,
      ownerUserId: userId
    })
  ) as AppState;
}

/**
 * Adaptador experimental P2.2A:
 * 1. Valida sessão ativa antes de qualquer gravação.
 * 2. Preserva integralmente a gravação síncrona legada via `saveRecoverySnapshotForUser`.
 * 3. Somente se a feature flag estiver explicitamente ativa, serializa por usuário a gravação
 *    adicional no IndexedDB (`recoveryHistoryDb`), sem substituir o snapshot legado, sem alterar
 *    o estado financeiro ativo e com isolamento total contra falhas e trocas de sessão.
 */
export async function saveRecoverySnapshotWithExperimentalHistory(
  userId: string,
  state: AppState,
  reason: string,
  options?: ExperimentalRecoveryAdapterOptions
): Promise<ExperimentalRecoverySnapshotResult> {
  if (options?.isSessionStillValid && !options.isSessionStillValid()) {
    return {
      legacySaved: false,
      historyAttempted: false,
      historySaved: false,
      historyCode: 'session_invalid',
      abortedBySessionChange: true
    };
  }

  // Isolamento estrito: rejeita estados sem ownerUserId ou com proprietário divergente
  if (!isValidStorageUserId(userId) || !state || state.ownerUserId !== userId) {
    return {
      legacySaved: false,
      historyAttempted: false,
      historySaved: false,
      historyCode: 'skipped_ineligible',
      abortedBySessionChange: false
    };
  }

  // Preserva integralmente o comportamento legado síncrono em localStorage
  const legacySaved = saveRecoverySnapshotForUser(userId, state, reason);

  const experimentalEnabled =
    options?.enableExperimentalHistory ?? ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY;

  if (!experimentalEnabled) {
    return {
      legacySaved,
      historyAttempted: false,
      historySaved: false,
      historyCode: 'disabled',
      abortedBySessionChange: false
    };
  }

  if (state.ownerUserId !== userId || !hasEligibleSnapshotContent(state)) {
    return {
      legacySaved,
      historyAttempted: false,
      historySaved: false,
      historyCode: 'skipped_ineligible',
      abortedBySessionChange: false
    };
  }

  // Captura cópia imutável antes de aguardar fila assíncrona para evitar mutação do estado ativo
  const immutableSnapshotState = cloneImmutableSnapshotState(state, userId);

  return runSerializedForUser(userId, async (): Promise<ExperimentalRecoverySnapshotResult> => {
    if (options?.isSessionStillValid && !options.isSessionStillValid()) {
      const failureInfo: ExperimentalHistoryFailureInfo = {
        reason,
        code: 'session_invalid',
        message: 'Gravação experimental cancelada por logout ou troca de usuário antes da transação.'
      };
      return {
        legacySaved,
        historyAttempted: false,
        historySaved: false,
        historyCode: 'session_invalid',
        abortedBySessionChange: true,
        failureInfo
      };
    }

    try {
      const dbResult = await saveSnapshotToRecoveryHistory(userId, immutableSnapshotState, reason, {
        indexedDBFactory: options?.indexedDBFactory,
        maxSnapshotsPerUser: options?.maxSnapshotsPerUser,
        beforeCommitHook: options?.beforeCommitHook
      });

      const sessionInvalidAfterTx =
        Boolean(options?.isSessionStillValid && !options.isSessionStillValid());

      if (!dbResult.success) {
        const failureInfo: ExperimentalHistoryFailureInfo = {
          reason,
          code: dbResult.code,
          message: dbResult.message
        };
        console.warn(
          `[P2.2A] Falha controlada na gravação experimental IndexedDB (${reason}): ${dbResult.code}`
        );
        options?.onExperimentalFailure?.(failureInfo);
        return {
          legacySaved,
          historyAttempted: true,
          historySaved: false,
          historyCode: dbResult.code,
          abortedBySessionChange: sessionInvalidAfterTx,
          failureInfo
        };
      }

      return {
        legacySaved,
        historyAttempted: true,
        historySaved: true,
        historyCode: 'ok',
        abortedBySessionChange: sessionInvalidAfterTx,
        deduplicated: dbResult.deduplicated,
        snapshotId: dbResult.record?.id
      };
    } catch {
      const failureInfo: ExperimentalHistoryFailureInfo = {
        reason,
        code: 'unexpected_error',
        message: 'Falha controlada inesperada ao gravar histórico experimental no IndexedDB.'
      };
      console.warn(
        `[P2.2A] Falha controlada inesperada na gravação experimental IndexedDB (${reason}).`
      );
      options?.onExperimentalFailure?.(failureInfo);
      return {
        legacySaved,
        historyAttempted: true,
        historySaved: false,
        historyCode: 'unexpected_error',
        abortedBySessionChange: Boolean(
          options?.isSessionStillValid && !options.isSessionStillValid()
        ),
        failureInfo
      };
    }
  });
}

export interface ClearUserRecoveryStorageResult {
  localSnapshotRemoved: boolean;
  historyCleared: boolean;
  historyDeletedCount: number;
  historyCode: RecoveryDbErrorCode;
}

/**
 * Remove as cópias locais de recuperação (localStorage e IndexedDB) estritamente do userId informado.
 * Serializa na fila por usuário para evitar corrida com gravações experimentais em andamento.
 */
export async function clearUserRecoveryStorage(
  userId: string,
  options?: RecoveryDbRuntimeOptions
): Promise<ClearUserRecoveryStorageResult> {
  if (!isValidStorageUserId(userId)) {
    return {
      localSnapshotRemoved: false,
      historyCleared: false,
      historyDeletedCount: 0,
      historyCode: 'invalid_user'
    };
  }

  return runSerializedForUser(userId, async () => {
    const localSnapshotRemoved = clearUserRecoverySnapshot(userId);
    const historyRes = await clearRecoveryHistoryForUser(userId, options);
    return {
      localSnapshotRemoved,
      historyCleared: historyRes.success || historyRes.code === 'idb_unavailable',
      historyDeletedCount: historyRes.deletedCount,
      historyCode: historyRes.code
    };
  });
}
