/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  evaluateBackupRestorationSafety,
  validateBackupJsonStructure
} from '../src/utils/backupSecurity';
import {
  getRecoverySnapshotById,
  listRecoveryHistory,
  MAX_RECOVERY_SNAPSHOTS_PER_USER,
  RECOVERY_HISTORY_DB_NAME
} from '../src/utils/recoveryHistoryDb';
import {
  exportHybridRecoverySnapshot,
  loadHybridRecoveryHistory
} from '../src/utils/recoveryHistoryService';
import {
  ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY,
  ExperimentalHistoryFailureInfo,
  saveRecoverySnapshotWithExperimentalHistory
} from '../src/utils/recoverySnapshotAdapter';
import { getRecoverySnapshotForUser, getUserRecoveryKey } from '../src/utils/storage';
import {
  assertIsolatedHomologOrigin,
  createHomologFictitiousState,
  HOMOLOG_USER_A,
  HOMOLOG_USER_B
} from './homologFixtures';

export interface HomologCheckResult {
  id: number;
  title: string;
  passed: boolean;
  detail: string;
}

export interface HomologSuiteReport {
  executedAtIso: string;
  globalFlagStillDisabled: boolean;
  allPassed: boolean;
  checks: HomologCheckResult[];
}

export async function clearIsolatedHomologData(indexedDBFactory?: IDBFactory | null): Promise<void> {
  assertIsolatedHomologOrigin();

  try {
    localStorage.removeItem(getUserRecoveryKey(HOMOLOG_USER_A));
    localStorage.removeItem(getUserRecoveryKey(HOMOLOG_USER_B));
  } catch {
    // ignore storage cleanup error
  }

  const factory =
    indexedDBFactory !== undefined
      ? indexedDBFactory
      : typeof indexedDB !== 'undefined'
        ? indexedDB
        : null;

  if (!factory) return;

  await new Promise<void>(resolve => {
    try {
      const req = factory.deleteDatabase(RECOVERY_HISTORY_DB_NAME);
      req.onsuccess = () => resolve();
      req.onerror = () => resolve();
      req.onblocked = () => resolve();
    } catch {
      resolve();
    }
  });
}

function createAbortQuotaFactory(baseFactory: IDBFactory): IDBFactory {
  return {
    open: (name: string, version?: number) => baseFactory.open(name, version),
    deleteDatabase: (name: string) => baseFactory.deleteDatabase(name),
    cmp: (a: unknown, b: unknown) => baseFactory.cmp(a, b),
    databases: () => baseFactory.databases()
  };
}

/**
 * Executa os 10 cenários controlados da P2.6A utilizando exclusivamente UUIDs fictícios
 * e o IndexedDB/localStorage da origem isolada (ou IDBFactory injetado em testes).
 * Nunca executa restauração real nem acessa contas ou sessões Supabase.
 */
export async function runHomologationChecklist(options?: {
  indexedDBFactory?: IDBFactory;
}): Promise<HomologSuiteReport> {
  assertIsolatedHomologOrigin();

  const factory =
    options?.indexedDBFactory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);

  if (!factory) {
    throw new Error('IndexedDB indisponível no navegador atual para homologação.');
  }

  await clearIsolatedHomologData(factory);
  const checks: HomologCheckResult[] = [];

  // 1. Criação de pontos preventivos (com flag global ainda false)
  const flagIsFalse = ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY === false;
  const s1 = createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: 1 });
  const r1 = await saveRecoverySnapshotWithExperimentalHistory(
    HOMOLOG_USER_A,
    s1,
    'pre_local_push',
    { enableExperimentalHistory: true, indexedDBFactory: factory }
  );
  const legacyAfterR1 = getRecoverySnapshotForUser(HOMOLOG_USER_A);
  checks.push({
    id: 1,
    title: 'Criação de pontos preventivos',
    passed: flagIsFalse && r1.legacySaved && r1.historySaved && Boolean(legacyAfterR1),
    detail: `Flag global=${String(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY)}; legado=${r1.legacySaved}; IndexedDB=${r1.historySaved}`
  });

  // 2. Retenção máxima de cinco snapshots
  for (let v = 2; v <= 7; v++) {
    await new Promise(resolve => setTimeout(resolve, 2));
    await saveRecoverySnapshotWithExperimentalHistory(
      HOMOLOG_USER_A,
      createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: v }),
      v % 2 === 0 ? 'pre_json_import' : 'pre_reset_clean',
      { enableExperimentalHistory: true, indexedDBFactory: factory }
    );
  }
  const listAfter7 = await listRecoveryHistory(HOMOLOG_USER_A, { indexedDBFactory: factory });
  checks.push({
    id: 2,
    title: 'Retenção máxima de cinco snapshots',
    passed:
      listAfter7.success &&
      listAfter7.items.length === MAX_RECOVERY_SNAPSHOTS_PER_USER &&
      listAfter7.items.map(i => i.version).join(',') === '7,6,5,4,3',
    detail: `Retidos=${listAfter7.items.length}; versões=[${listAfter7.items.map(i => i.version).join(', ')}]`
  });

  // 3. Deduplicação de estados consecutivos
  const duplicateV7 = createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: 7 });
  const rDup = await saveRecoverySnapshotWithExperimentalHistory(
    HOMOLOG_USER_A,
    duplicateV7,
    'pre_force_download',
    { enableExperimentalHistory: true, indexedDBFactory: factory }
  );
  const listAfterDup = await listRecoveryHistory(HOMOLOG_USER_A, { indexedDBFactory: factory });
  checks.push({
    id: 3,
    title: 'Deduplicação de estados consecutivos',
    passed:
      rDup.historySaved &&
      rDup.deduplicated === true &&
      listAfterDup.items.length === MAX_RECOVERY_SNAPSHOTS_PER_USER,
    detail: `deduplicated=${String(rDup.deduplicated)}; total mantido=${listAfterDup.items.length}`
  });

  // 4. Ordenação por data (mais recente ao mais antigo)
  const hybridA = await loadHybridRecoveryHistory(HOMOLOG_USER_A, { indexedDBFactory: factory });
  const isStrictlyOrdered = hybridA.items.every((item, idx) =>
    idx === 0 ? true : hybridA.items[idx - 1].createdAtMs >= item.createdAtMs
  );
  checks.push({
    id: 4,
    title: 'Ordenação por data',
    passed: hybridA.items.length === 5 && isStrictlyOrdered && hybridA.items[0].version === 7,
    detail: `Ordem versões=[${hybridA.items.map(i => `v${i.version}`).join(' -> ')}]`
  });

  // 5. Visualização de detalhes (somente leitura)
  const firstItem = hybridA.items[0];
  let detailRecordMatches = false;
  if (firstItem.source === 'legacy_localstorage') {
    const legacyFull = getRecoverySnapshotForUser(HOMOLOG_USER_A);
    detailRecordMatches = Boolean(
      legacyFull && legacyFull.state.version === firstItem.version
    );
  } else {
    const fullRecord = await getRecoverySnapshotById(HOMOLOG_USER_A, firstItem.id, {
      indexedDBFactory: factory
    });
    detailRecordMatches = Boolean(
      fullRecord.success && fullRecord.record?.state.version === firstItem.version
    );
  }
  checks.push({
    id: 5,
    title: 'Visualização de detalhes',
    passed:
      Boolean(firstItem.formattedSavedAt) &&
      Boolean(firstItem.reason.label) &&
      Boolean(firstItem.reason.description) &&
      detailRecordMatches,
    detail: `Origem=${firstItem.source}; Item=${firstItem.reason.label} (${firstItem.formattedSavedAt}); v${firstItem.version}; lançamentos=${firstItem.counts.transactions}`
  });

  // 6. Download individual JSON (preparação do arquivo preservando conteúdo original)
  const exported = await exportHybridRecoverySnapshot(HOMOLOG_USER_A, firstItem, {
    indexedDBFactory: factory
  });
  const parsedExport = exported.jsonContent ? JSON.parse(exported.jsonContent) : null;
  checks.push({
    id: 6,
    title: 'Download individual JSON',
    passed:
      exported.success &&
      Boolean(exported.filename?.startsWith('ponto_recuperacao_')) &&
      Boolean(parsedExport?.ownerUserId === HOMOLOG_USER_A) &&
      parsedExport?.state?.version === firstItem.version,
    detail: `Arquivo=${exported.filename || 'erro'}; ownerUserId preservado=${parsedExport?.ownerUserId === HOMOLOG_USER_A}`
  });

  // 7. Compatibilidade do JSON com a validação de restauração (somente prévia/dry-run, sem restaurar)
  const validationOk = validateBackupJsonStructure(exported.jsonContent || '', HOMOLOG_USER_A);
  const olderState = createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: 3 });
  const newerCloudState = createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: 10 });
  const safetyCompatible = evaluateBackupRestorationSafety({
    backupState: validationOk.state!,
    currentLocalState: olderState,
    remoteResult: {
      success: true,
      data: olderState,
      version: olderState.version,
      clientTimestamp: olderState.lastModified
    },
    expectedUserId: HOMOLOG_USER_A
  });
  const safetyBlockedOlder = evaluateBackupRestorationSafety({
    backupState: validationOk.state!,
    currentLocalState: newerCloudState,
    remoteResult: {
      success: true,
      data: newerCloudState,
      version: newerCloudState.version,
      clientTimestamp: newerCloudState.lastModified
    },
    expectedUserId: HOMOLOG_USER_A
  });
  const crossUserValidation = validateBackupJsonStructure(
    exported.jsonContent || '',
    HOMOLOG_USER_B
  );
  checks.push({
    id: 7,
    title: 'Compatibilidade JSON na prévia de restauração',
    passed:
      validationOk.valid &&
      validationOk.sourceFormat === 'recovery_snapshot' &&
      safetyCompatible.allowed === true &&
      safetyBlockedOlder.allowed === false &&
      crossUserValidation.code === 'owner_mismatch',
    detail: `Formato=${validationOk.sourceFormat}; compatível=${safetyCompatible.allowed}; antigo bloqueado=${!safetyBlockedOlder.allowed}; outro usuário bloqueado=${crossUserValidation.code}`
  });

  // 8. Falhas simuladas do IndexedDB (indisponível e QuotaExceededError sem perder legado)
  const capturedFailures: ExperimentalHistoryFailureInfo[] = [];
  const stateFail = createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: 8 });
  const failUnavailable = await saveRecoverySnapshotWithExperimentalHistory(
    HOMOLOG_USER_A,
    stateFail,
    'pre_json_import',
    {
      enableExperimentalHistory: true,
      indexedDBFactory: null,
      onExperimentalFailure: f => capturedFailures.push(f)
    }
  );
  const failQuota = await saveRecoverySnapshotWithExperimentalHistory(
    HOMOLOG_USER_A,
    stateFail,
    'pre_reset_clean',
    {
      enableExperimentalHistory: true,
      indexedDBFactory: createAbortQuotaFactory(factory),
      beforeCommitHook: ({ transaction }) => {
        const quotaErr = new DOMException('Quota exceeded', 'QuotaExceededError');
        Object.defineProperty(transaction, 'error', { value: quotaErr, configurable: true });
        transaction.abort();
      },
      onExperimentalFailure: f => capturedFailures.push(f)
    }
  );
  checks.push({
    id: 8,
    title: 'Falhas simuladas do IndexedDB',
    passed:
      failUnavailable.legacySaved &&
      !failUnavailable.historySaved &&
      failUnavailable.historyCode === 'idb_unavailable' &&
      failQuota.legacySaved &&
      !failQuota.historySaved &&
      failQuota.historyCode === 'quota_exceeded' &&
      capturedFailures.length === 2,
    detail: `Indisponível=${failUnavailable.historyCode} (legado=${failUnavailable.legacySaved}); Quota=${failQuota.historyCode} (legado=${failQuota.legacySaved})`
  });

  // 9. Proteção contra troca de usuário
  const abortedBySwitch = await saveRecoverySnapshotWithExperimentalHistory(
    HOMOLOG_USER_A,
    createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: 9 }),
    'pre_reset_clean',
    {
      enableExperimentalHistory: true,
      indexedDBFactory: factory,
      isSessionStillValid: () => false
    }
  );
  await saveRecoverySnapshotWithExperimentalHistory(
    HOMOLOG_USER_B,
    createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_B, version: 15 }),
    'pre_local_push',
    { enableExperimentalHistory: true, indexedDBFactory: factory }
  );
  const hybridB = await loadHybridRecoveryHistory(HOMOLOG_USER_B, { indexedDBFactory: factory });
  const hybridAAfterSwitch = await loadHybridRecoveryHistory(HOMOLOG_USER_A, {
    indexedDBFactory: factory
  });
  checks.push({
    id: 9,
    title: 'Proteção contra troca de usuário',
    passed:
      abortedBySwitch.abortedBySessionChange &&
      !abortedBySwitch.legacySaved &&
      !abortedBySwitch.historySaved &&
      hybridB.items.every(i => i.ownerUserId === HOMOLOG_USER_B) &&
      hybridAAfterSwitch.items.every(i => i.ownerUserId === HOMOLOG_USER_A) &&
      !hybridAAfterSwitch.items.some(i => i.version === 15),
    detail: `Troca abortada=${abortedBySwitch.abortedBySessionChange}; isolamento A(${hybridAAfterSwitch.items.length}) / B(${hybridB.items.length}) íntegro`
  });

  // 10. Concorrência entre abas (gravações simultâneas no mesmo IndexedDB respeitando retenção <= 5)
  const concurrentBatch = await Promise.all(
    [20, 21, 22, 23, 24, 25].map(v =>
      saveRecoverySnapshotWithExperimentalHistory(
        HOMOLOG_USER_A,
        createHomologFictitiousState({ ownerUserId: HOMOLOG_USER_A, version: v }),
        'pre_json_import',
        { enableExperimentalHistory: true, indexedDBFactory: factory }
      )
    )
  );
  const listAfterConcurrency = await listRecoveryHistory(HOMOLOG_USER_A, {
    indexedDBFactory: factory
  });
  checks.push({
    id: 10,
    title: 'Concorrência entre abas',
    passed:
      concurrentBatch.every(r => r.historySaved) &&
      listAfterConcurrency.items.length === MAX_RECOVERY_SNAPSHOTS_PER_USER &&
      listAfterConcurrency.items.every(i => i.ownerUserId === HOMOLOG_USER_A) &&
      listAfterConcurrency.items.some(i => i.version === 25),
    detail: `6 gravações simultâneas concluídas; retidos=${listAfterConcurrency.items.length}; versões=[${listAfterConcurrency.items.map(i => i.version).join(', ')}]`
  });

  return {
    executedAtIso: new Date().toISOString(),
    globalFlagStillDisabled: ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY === false,
    allPassed: checks.every(c => c.passed),
    checks
  };
}
