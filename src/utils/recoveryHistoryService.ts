/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  computeStateContentSignature,
  exportRecoverySnapshotById,
  listRecoveryHistory,
  MAX_RECOVERY_SNAPSHOTS_PER_USER,
  RecoveryDbRuntimeOptions,
  RecoveryHistorySummary
} from './recoveryHistoryDb';
import {
  buildRecoverySnapshotDownload,
  formatRecoveryReason,
  inspectLocalRecoverySnapshot,
  RecoveryReasonMetadata,
  RecoverySnapshotCounts,
  RecoverySnapshotDownloadPayload
} from './recoverySnapshot';
import { getRecoverySnapshotForUser, isValidStorageUserId } from './storage';

export type RecoveryHistorySource = 'indexeddb' | 'legacy_localstorage';

export interface HybridRecoverySnapshotItem {
  id: string;
  source: RecoveryHistorySource;
  ownerUserId: string;
  savedAt: string;
  createdAtMs: number;
  formattedSavedAt: string;
  reason: RecoveryReasonMetadata;
  version: number;
  contentSignature: string;
  counts: RecoverySnapshotCounts;
}

export interface HybridRecoveryHistoryLoadResult {
  items: HybridRecoverySnapshotItem[];
  totalDistinctCount: number;
  extraOmittedCount: number;
  indexedDbStatus: 'available' | 'unavailable' | 'error';
  indexedDbMessage?: string;
  legacyStatus: 'available' | 'empty' | 'corrupted';
  legacyMessage?: string;
  skippedCorruptedCount: number;
  hasAnyWarning: boolean;
}

export const LEGACY_RECOVERY_ITEM_ID = 'legacy-localstorage-snapshot';
export const EMPTY_RECOVERY_HISTORY_MESSAGE =
  'Nenhum ponto de recuperação disponível neste navegador.';

function formatSavedAtPtBr(savedAtIso: string): string {
  const parsed = new Date(savedAtIso);
  if (Number.isNaN(parsed.getTime())) {
    return savedAtIso;
  }
  return parsed.toLocaleString('pt-BR');
}

function mapIndexedDbSummaryToHybridItem(
  summary: RecoveryHistorySummary
): HybridRecoverySnapshotItem {
  return {
    id: summary.id,
    source: 'indexeddb',
    ownerUserId: summary.ownerUserId,
    savedAt: summary.savedAt,
    createdAtMs: summary.createdAtMs,
    formattedSavedAt: formatSavedAtPtBr(summary.savedAt),
    reason: formatRecoveryReason(summary.reason),
    version: summary.version,
    contentSignature: summary.contentSignature,
    counts: {
      transactions: summary.counts.transactions,
      accounts: summary.counts.accounts,
      creditCards: summary.counts.creditCards,
      debts: summary.counts.debts,
      goals: summary.counts.goals,
      categories: summary.counts.categories
    }
  };
}

/**
 * Carrega em modo SOMENTE LEITURA o histórico combinado de snapshots do usuário autenticado:
 * - IndexedDB (`gestao_financeira_recovery_db`, até 5 snapshots)
 * - Snapshot legado em `localStorage` (`finance_pro_recovery_<uuid>`), sem apagá-lo nem migrá-lo
 *
 * Aplica isolamento estrito por UUID, deduplicação por assinatura de conteúdo e ordenação
 * do mais recente para o mais antigo.
 */
export async function loadHybridRecoveryHistory(
  userId?: string | null,
  options?: RecoveryDbRuntimeOptions
): Promise<HybridRecoveryHistoryLoadResult> {
  if (!isValidStorageUserId(userId)) {
    return {
      items: [],
      totalDistinctCount: 0,
      extraOmittedCount: 0,
      indexedDbStatus: 'available',
      legacyStatus: 'empty',
      skippedCorruptedCount: 0,
      hasAnyWarning: false
    };
  }

  const maxItems = Math.max(
    1,
    options?.maxSnapshotsPerUser ?? MAX_RECOVERY_SNAPSHOTS_PER_USER
  );

  // 1. Consulta não destrutiva do snapshot legado em localStorage
  const legacyInspection = inspectLocalRecoverySnapshot(userId);
  let legacyStatus: 'available' | 'empty' | 'corrupted' = legacyInspection.status;
  let legacyMessage: string | undefined =
    legacyInspection.status === 'corrupted' ? legacyInspection.message : undefined;
  let legacyItem: HybridRecoverySnapshotItem | null = null;

  if (legacyInspection.status === 'available' && legacyInspection.summary) {
    const legacySnapshot = getRecoverySnapshotForUser(userId) as
      | { savedAt: string; reason: string; ownerUserId?: string; state: any }
      | null;

    if (
      legacySnapshot &&
      legacySnapshot.ownerUserId === userId &&
      legacySnapshot.state &&
      legacySnapshot.state.ownerUserId === userId
    ) {
      const parsedMs = Date.parse(legacyInspection.summary.savedAt);
      legacyItem = {
        id: LEGACY_RECOVERY_ITEM_ID,
        source: 'legacy_localstorage',
        ownerUserId: userId,
        savedAt: legacyInspection.summary.savedAt,
        createdAtMs: Number.isNaN(parsedMs) ? 0 : parsedMs,
        formattedSavedAt: legacyInspection.summary.formattedSavedAt,
        reason: legacyInspection.summary.reason,
        version: legacyInspection.summary.version,
        contentSignature: computeStateContentSignature(legacySnapshot.state),
        counts: { ...legacyInspection.summary.counts }
      };
    } else {
      legacyStatus = 'corrupted';
      legacyMessage =
        'O registro local anterior de recuperação pertence a outro usuário ou está inconsistente e foi ignorado por segurança.';
    }
  }

  // 2. Consulta somente leitura ao histórico no IndexedDB
  let indexedDbStatus: 'available' | 'unavailable' | 'error' = 'available';
  let indexedDbMessage: string | undefined;
  let skippedCorruptedCount = 0;
  let idbItems: HybridRecoverySnapshotItem[] = [];

  try {
    const dbList = await listRecoveryHistory(userId, options);
    skippedCorruptedCount = dbList.skippedCorruptedCount || 0;

    if (!dbList.success) {
      if (dbList.code === 'idb_unavailable') {
        indexedDbStatus = 'unavailable';
        indexedDbMessage =
          'O histórico expandido (IndexedDB) não está disponível neste navegador. Exibindo apenas cópia local compatível, quando existir.';
      } else {
        indexedDbStatus = 'error';
        indexedDbMessage =
          dbList.message ||
          'Não foi possível consultar o histórico local no IndexedDB neste momento.';
      }
    } else {
      idbItems = dbList.items
        .filter(item => item.ownerUserId === userId)
        .map(mapIndexedDbSummaryToHybridItem);
    }
  } catch {
    indexedDbStatus = 'error';
    indexedDbMessage =
      'Falha inesperada ao consultar o histórico local no IndexedDB.';
  }

  // 3. Deduplicação segura entre IndexedDB e snapshot legado preservando data/motivo mais recentes
  const bySignature = new Map<string, HybridRecoverySnapshotItem>();
  const isMoreRecentThan = (
    candidate: HybridRecoverySnapshotItem,
    current: HybridRecoverySnapshotItem
  ): boolean => {
    if (candidate.createdAtMs !== current.createdAtMs) {
      return candidate.createdAtMs > current.createdAtMs;
    }
    const isoCmp = candidate.savedAt.localeCompare(current.savedAt);
    if (isoCmp !== 0) {
      return isoCmp > 0;
    }
    return candidate.source === 'indexeddb' && current.source !== 'indexeddb';
  };

  for (const item of idbItems) {
    const existing = bySignature.get(item.contentSignature);
    if (!existing || isMoreRecentThan(item, existing)) {
      bySignature.set(item.contentSignature, item);
    }
  }

  if (legacyItem) {
    const existing = bySignature.get(legacyItem.contentSignature);
    if (!existing || isMoreRecentThan(legacyItem, existing)) {
      bySignature.set(legacyItem.contentSignature, legacyItem);
    }
  }

  const mergedItems = Array.from(bySignature.values());

  // 4. Ordenação do mais recente ao mais antigo + limite visual de até 5 itens
  mergedItems.sort((a, b) => {
    if (b.createdAtMs !== a.createdAtMs) {
      return b.createdAtMs - a.createdAtMs;
    }
    if (a.source !== b.source) {
      return a.source === 'indexeddb' ? -1 : 1;
    }
    return b.savedAt.localeCompare(a.savedAt);
  });

  const totalDistinctCount = mergedItems.length;
  const finalItems = mergedItems.slice(0, maxItems);
  const extraOmittedCount = Math.max(0, totalDistinctCount - finalItems.length);
  const hasAnyWarning =
    indexedDbStatus !== 'available' ||
    legacyStatus === 'corrupted' ||
    skippedCorruptedCount > 0 ||
    extraOmittedCount > 0;

  return {
    items: finalItems,
    totalDistinctCount,
    extraOmittedCount,
    indexedDbStatus,
    indexedDbMessage,
    legacyStatus,
    legacyMessage,
    skippedCorruptedCount,
    hasAnyWarning
  };
}

/**
 * Prepara o arquivo JSON individual de um ponto de recuperação do histórico (IndexedDB ou legado)
 * preservando integralmente o conteúdo armazenado e validando o UUID proprietário.
 */
export async function exportHybridRecoverySnapshot(
  userId: string | null | undefined,
  item: HybridRecoverySnapshotItem,
  options?: RecoveryDbRuntimeOptions
): Promise<RecoverySnapshotDownloadPayload> {
  if (!isValidStorageUserId(userId)) {
    return {
      success: false,
      error: 'Sessão de usuário inválida para exportar ponto de recuperação.'
    };
  }

  if (!item || item.ownerUserId !== userId) {
    return {
      success: false,
      error: 'Acesso bloqueado: o ponto de recuperação selecionado não pertence ao usuário autenticado.'
    };
  }

  if (item.source === 'legacy_localstorage') {
    return buildRecoverySnapshotDownload(userId);
  }

  try {
    const exported = await exportRecoverySnapshotById(userId, item.id, options);
    if (!exported.success || !exported.jsonContent || !exported.filename) {
      return {
        success: false,
        error:
          exported.message ||
          'Não foi possível preparar a cópia JSON deste ponto de recuperação.'
      };
    }

    return {
      success: true,
      filename: exported.filename,
      jsonContent: exported.jsonContent
    };
  } catch {
    return {
      success: false,
      error: 'Falha inesperada ao exportar a cópia JSON do ponto de recuperação.'
    };
  }
}
