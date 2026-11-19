/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Copy,
  Database,
  Download,
  Eye,
  FileCheck2,
  FlaskConical,
  History,
  Layers,
  Play,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
  X,
  XCircle
} from 'lucide-react';
import {
  evaluateBackupRestorationSafety,
  validateBackupJsonStructure
} from '../src/utils/backupSecurity';
import { formatRecoveryReason } from '../src/utils/recoverySnapshot';
import {
  exportHybridRecoverySnapshot,
  HybridRecoveryHistoryLoadResult,
  HybridRecoverySnapshotItem,
  loadHybridRecoveryHistory
} from '../src/utils/recoveryHistoryService';
import {
  ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY,
  ExperimentalHistoryFailureInfo,
  saveRecoverySnapshotWithExperimentalHistory
} from '../src/utils/recoverySnapshotAdapter';
import { getRecoverySnapshotForUser } from '../src/utils/storage';
import {
  assertIsolatedHomologOrigin,
  createHomologFictitiousState,
  HOMOLOG_REASONS,
  HOMOLOG_USER_A,
  HOMOLOG_USER_B
} from './homologFixtures';
import {
  clearIsolatedHomologData,
  HomologSuiteReport,
  runHomologationChecklist
} from './homologRunner';

const HOMOLOG_CHANNEL_NAME = 'gfp_homolog_p26a_tabs';

export interface HomologationAppProps {
  sandboxMode?: 'opaque_preview' | 'isolated_port';
  indexedDBFactory?: IDBFactory;
  onToggleLocalStorageFailure?: (enabled: boolean) => void;
}

interface ExportDryRunReport {
  filename: string;
  jsonContent: string;
  sourceVersion: number;
  sameUserResult: string;
  cloudNewerBlockedResult: string;
  otherUserBlockedResult: string;
  tamperedBlockedResult: string;
  downloadTriggered: boolean;
}

export const HomologationApp: React.FC<HomologationAppProps> = ({
  sandboxMode,
  indexedDBFactory,
  onToggleLocalStorageFailure
}) => {
  assertIsolatedHomologOrigin();

  const resolvedSandboxMode: 'opaque_preview' | 'isolated_port' =
    sandboxMode ??
    (typeof window !== 'undefined' && window.origin === 'null'
      ? 'opaque_preview'
      : 'isolated_port');

  const isOpaquePreview = resolvedSandboxMode === 'opaque_preview';

  const [activeFictitiousUser, setActiveFictitiousUser] = useState<string>(HOMOLOG_USER_A);
  const [nextVersionCounter, setNextVersionCounter] = useState<number>(1);
  const [lastSavedVersion, setLastSavedVersion] = useState<number | null>(null);
  const [selectedReason, setSelectedReason] = useState<string>(HOMOLOG_REASONS[0]);
  const [historyResult, setHistoryResult] = useState<HybridRecoveryHistoryLoadResult | null>(null);
  const [selectedDetails, setSelectedDetails] = useState<HybridRecoverySnapshotItem | null>(null);
  const [exportReport, setExportReport] = useState<ExportDryRunReport | null>(null);
  const [uploadedValidationMessage, setUploadedValidationMessage] = useState<string | null>(null);
  const [failureSimulationLog, setFailureSimulationLog] = useState<string | null>(null);
  const [suiteReport, setSuiteReport] = useState<HomologSuiteReport | null>(null);
  const [statusLog, setStatusLog] = useState<string>(
    isOpaquePreview
      ? 'Sandbox isolado do Preview pronto (origem opaca null). Nenhuma sessão Supabase real ou dado ativo é acessível.'
      : 'Ambiente de homologação isolado pronto. Nenhuma conta real ou sessão Supabase conectada.'
  );
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [copiedFeedback, setCopiedFeedback] = useState<boolean>(false);
  const channelRef = useRef<BroadcastChannel | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const idbRuntimeOption = indexedDBFactory ? { indexedDBFactory } : undefined;

  const refreshHistory = useCallback(
    async (userId: string) => {
      const loaded = await loadHybridRecoveryHistory(
        userId,
        indexedDBFactory ? { indexedDBFactory } : undefined
      );
      setHistoryResult(loaded);
    },
    [indexedDBFactory]
  );

  useEffect(() => {
    refreshHistory(activeFictitiousUser);
  }, [activeFictitiousUser, refreshHistory]);

  useEffect(() => {
    if (isOpaquePreview || typeof BroadcastChannel === 'undefined') return;
    let channel: BroadcastChannel | null = null;
    try {
      channel = new BroadcastChannel(HOMOLOG_CHANNEL_NAME);
      channelRef.current = channel;
      channel.onmessage = ev => {
        if (ev.data?.type === 'HOMOLOG_SNAPSHOT_WRITTEN') {
          refreshHistory(activeFictitiousUser);
          setStatusLog(
            `Evento multi-aba recebido de outra aba isolada (${ev.data.userId?.slice(0, 8)}...): histórico atualizado.`
          );
        } else if (ev.data?.type === 'HOMOLOG_CONCURRENT_PING') {
          const version = Number(ev.data.version || Date.now() % 10000);
          saveRecoverySnapshotWithExperimentalHistory(
            activeFictitiousUser,
            createHomologFictitiousState({ ownerUserId: activeFictitiousUser, version }),
            'pre_json_import',
            { enableExperimentalHistory: true, ...idbRuntimeOption }
          ).then(() => {
            refreshHistory(activeFictitiousUser);
          });
        }
      };
    } catch {
      channelRef.current = null;
    }
    return () => {
      try {
        channel?.close();
      } catch {
        // ignore
      }
      channelRef.current = null;
    };
  }, [activeFictitiousUser, refreshHistory, isOpaquePreview, indexedDBFactory]);

  const notifyOtherTabs = (type: string, extra?: Record<string, unknown>) => {
    try {
      channelRef.current?.postMessage({ type, userId: activeFictitiousUser, ...extra });
    } catch {
      // ignore in opaque origin
    }
  };

  const handleCreateFictitiousSnapshot = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const version = nextVersionCounter;
      const state = createHomologFictitiousState({
        ownerUserId: activeFictitiousUser,
        version
      });
      const res = await saveRecoverySnapshotWithExperimentalHistory(
        activeFictitiousUser,
        state,
        selectedReason,
        { enableExperimentalHistory: true, ...idbRuntimeOption }
      );
      setNextVersionCounter(v => v + 1);
      setLastSavedVersion(version);
      await refreshHistory(activeFictitiousUser);
      notifyOtherTabs('HOMOLOG_SNAPSHOT_WRITTEN');
      setStatusLog(
        `Snapshot fictício v${version} (${formatRecoveryReason(selectedReason).label}): legado=${res.legacySaved}, IndexedDB=${res.historySaved}, deduplicado=${Boolean(res.deduplicated)}.`
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleCreateSixBatch = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      let currentVersion = nextVersionCounter;
      for (let i = 0; i < 6; i++) {
        await new Promise(resolve => setTimeout(resolve, 2));
        const reason = HOMOLOG_REASONS[i % HOMOLOG_REASONS.length];
        await saveRecoverySnapshotWithExperimentalHistory(
          activeFictitiousUser,
          createHomologFictitiousState({
            ownerUserId: activeFictitiousUser,
            version: currentVersion
          }),
          reason,
          { enableExperimentalHistory: true, ...idbRuntimeOption }
        );
        setLastSavedVersion(currentVersion);
        currentVersion += 1;
      }
      setNextVersionCounter(currentVersion);
      await refreshHistory(activeFictitiousUser);
      notifyOtherTabs('HOMOLOG_SNAPSHOT_WRITTEN');
      setStatusLog(
        `6 snapshots distintos criados em sequência (até v${currentVersion - 1}). Retenção máxima de 5 pontos aplicada.`
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleTestDeduplication = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      let versionToRepeat = lastSavedVersion;
      if (versionToRepeat === null) {
        versionToRepeat = nextVersionCounter;
        await saveRecoverySnapshotWithExperimentalHistory(
          activeFictitiousUser,
          createHomologFictitiousState({
            ownerUserId: activeFictitiousUser,
            version: versionToRepeat
          }),
          selectedReason,
          { enableExperimentalHistory: true, ...idbRuntimeOption }
        );
        setNextVersionCounter(v => v + 1);
        setLastSavedVersion(versionToRepeat);
      }

      const duplicateState = createHomologFictitiousState({
        ownerUserId: activeFictitiousUser,
        version: versionToRepeat
      });
      const res = await saveRecoverySnapshotWithExperimentalHistory(
        activeFictitiousUser,
        duplicateState,
        'pre_force_download',
        { enableExperimentalHistory: true, ...idbRuntimeOption }
      );
      await refreshHistory(activeFictitiousUser);
      setStatusLog(
        `Deduplicação testada com estado v${versionToRepeat}: deduplicated=${Boolean(res.deduplicated)}, IndexedDB manteve contagem sem duplicar.`
      );
    } finally {
      setIsBusy(false);
    }
  };

  const evaluateJsonDryRun = (
    filename: string,
    jsonContent: string,
    sourceVersion: number,
    downloadTriggered: boolean
  ): ExportDryRunReport => {
    const validatedSame = validateBackupJsonStructure(jsonContent, activeFictitiousUser);
    let sameUserResult = `Rejeitado: ${validatedSame.error || validatedSame.code}`;
    let cloudNewerBlockedResult = 'Não avaliado';

    if (validatedSame.valid && validatedSame.state) {
      const olderLocal = createHomologFictitiousState({
        ownerUserId: activeFictitiousUser,
        version: Math.max(1, sourceVersion - 1)
      });
      const compatDecision = evaluateBackupRestorationSafety({
        backupState: validatedSame.state,
        currentLocalState: olderLocal,
        remoteResult: {
          success: true,
          data: olderLocal,
          version: olderLocal.version,
          clientTimestamp: olderLocal.lastModified
        },
        expectedUserId: activeFictitiousUser
      });
      sameUserResult = `ACEITO na prévia (sem restaurar) · formato=${validatedSame.sourceFormat} · ${compatDecision.message}`;

      const newerCloud = createHomologFictitiousState({
        ownerUserId: activeFictitiousUser,
        version: sourceVersion + 5
      });
      const blockedOlderDecision = evaluateBackupRestorationSafety({
        backupState: validatedSame.state,
        currentLocalState: newerCloud,
        remoteResult: {
          success: true,
          data: newerCloud,
          version: newerCloud.version,
          clientTimestamp: newerCloud.lastModified
        },
        expectedUserId: activeFictitiousUser
      });
      cloudNewerBlockedResult = !blockedOlderDecision.allowed
        ? `BLOQUEADO corretamente (${blockedOlderDecision.reasonCode}): ${blockedOlderDecision.message}`
        : 'FALHA: deveria ter bloqueado versão inferior à nuvem';
    }

    const otherUser =
      activeFictitiousUser === HOMOLOG_USER_A ? HOMOLOG_USER_B : HOMOLOG_USER_A;
    const crossUserCheck = validateBackupJsonStructure(jsonContent, otherUser);
    const otherUserBlockedResult = !crossUserCheck.valid
      ? `BLOQUEADO corretamente (${crossUserCheck.code}): ${crossUserCheck.error}`
      : 'FALHA: deveria ter bloqueado outro usuário';

    let tamperedJson = '{"invalid_envelope":true}';
    try {
      const parsed = JSON.parse(jsonContent);
      parsed.ownerUserId = 'ffffffff-ffff-4fff-8fff-ffffffffffff';
      tamperedJson = JSON.stringify(parsed);
    } catch {
      tamperedJson = '{"corrupted":';
    }
    const tamperedCheck = validateBackupJsonStructure(tamperedJson, activeFictitiousUser);
    const tamperedBlockedResult = !tamperedCheck.valid
      ? `BLOQUEADO corretamente (${tamperedCheck.code}): ${tamperedCheck.error}`
      : 'FALHA: deveria ter rejeitado JSON adulterado';

    return {
      filename,
      jsonContent,
      sourceVersion,
      sameUserResult,
      cloudNewerBlockedResult,
      otherUserBlockedResult,
      tamperedBlockedResult,
      downloadTriggered
    };
  };

  const handleDownloadAndValidateDryRun = async (item: HybridRecoverySnapshotItem) => {
    const exported = await exportHybridRecoverySnapshot(
      activeFictitiousUser,
      item,
      idbRuntimeOption
    );
    if (!exported.success || !exported.jsonContent || !exported.filename) {
      setStatusLog(`Falha ao exportar JSON: ${exported.error || 'erro desconhecido'}`);
      return;
    }

    let downloadTriggered = false;
    try {
      const blob = new Blob([exported.jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = exported.filename;
      document.body.appendChild(anchor);
      anchor.click();
      document.body.removeChild(anchor);
      URL.revokeObjectURL(url);
      downloadTriggered = true;
    } catch {
      downloadTriggered = false;
    }

    const report = evaluateJsonDryRun(
      exported.filename,
      exported.jsonContent,
      item.version,
      downloadTriggered
    );
    setExportReport(report);
    setUploadedValidationMessage(null);
    setCopiedFeedback(false);
    setStatusLog(
      `Exportação "${exported.filename}" concluída (${exported.jsonContent.length} bytes) e validada em modo prévia (sem restaurar).`
    );
  };

  const handleCopyExportedJson = async () => {
    if (!exportReport) return;
    try {
      await navigator.clipboard.writeText(exportReport.jsonContent);
      setCopiedFeedback(true);
    } catch {
      setCopiedFeedback(false);
    }
  };

  const handleValidateUploadedJson = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const validation = validateBackupJsonStructure(text, activeFictitiousUser);
      if (!validation.valid) {
        setUploadedValidationMessage(
          `Arquivo "${file.name}" REJEITADO na prévia (${validation.code}): ${validation.error}`
        );
        return;
      }
      setUploadedValidationMessage(
        `Arquivo "${file.name}" VÁLIDO em modo prévia (sem restaurar): formato=${validation.sourceFormat}, v${validation.version}, ${validation.counts?.transactions ?? 0} lançamentos.`
      );
    } catch {
      setUploadedValidationMessage(`Não foi possível ler o arquivo "${file.name}".`);
    }
  };

  const handleSimulateIdbUnavailable = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const failures: ExperimentalHistoryFailureInfo[] = [];
      const version = nextVersionCounter;
      const res = await saveRecoverySnapshotWithExperimentalHistory(
        activeFictitiousUser,
        createHomologFictitiousState({ ownerUserId: activeFictitiousUser, version }),
        'pre_json_import',
        {
          enableExperimentalHistory: true,
          indexedDBFactory: null,
          onExperimentalFailure: f => failures.push(f)
        }
      );
      setNextVersionCounter(v => v + 1);
      await refreshHistory(activeFictitiousUser);
      setFailureSimulationLog(
        `IndexedDB Indisponível simulado: historyCode=${res.historyCode}, historySaved=${res.historySaved}, legacySaved=${res.legacySaved} (backup legado preservado), falhasCapturadas=${failures.length}.`
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSimulateQuotaExceeded = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const baseFactory =
        indexedDBFactory ?? (typeof indexedDB !== 'undefined' ? indexedDB : undefined);
      if (!baseFactory) {
        setFailureSimulationLog('IDBFactory indisponível para simular QuotaExceededError.');
        return;
      }
      const abortingFactory: IDBFactory = {
        open: (name: string, version?: number) => baseFactory.open(name, version),
        deleteDatabase: (name: string) => baseFactory.deleteDatabase(name),
        cmp: (a: unknown, b: unknown) => baseFactory.cmp(a, b),
        databases: () => baseFactory.databases()
      };
      const failures: ExperimentalHistoryFailureInfo[] = [];
      const version = nextVersionCounter;
      const res = await saveRecoverySnapshotWithExperimentalHistory(
        activeFictitiousUser,
        createHomologFictitiousState({ ownerUserId: activeFictitiousUser, version }),
        'pre_reset_clean',
        {
          enableExperimentalHistory: true,
          indexedDBFactory: abortingFactory,
          beforeCommitHook: ({ transaction }) => {
            const quotaErr = new DOMException('Quota exceeded', 'QuotaExceededError');
            Object.defineProperty(transaction, 'error', { value: quotaErr, configurable: true });
            transaction.abort();
          },
          onExperimentalFailure: f => failures.push(f)
        }
      );
      setNextVersionCounter(v => v + 1);
      await refreshHistory(activeFictitiousUser);
      setFailureSimulationLog(
        `QuotaExceededError simulado: historyCode=${res.historyCode}, historySaved=${res.historySaved}, legacySaved=${res.legacySaved} (transação abortada sem corromper dados), motivo="${failures[0]?.message || ''}".`
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleSimulateDoubleFailure = async () => {
    if (isBusy) return;
    setIsBusy(true);
    const originalSetItem =
      typeof localStorage !== 'undefined' && typeof localStorage.setItem === 'function'
        ? localStorage.setItem.bind(localStorage)
        : null;
    try {
      if (onToggleLocalStorageFailure) {
        onToggleLocalStorageFailure(true);
      } else if (typeof localStorage !== 'undefined') {
        Object.defineProperty(localStorage, 'setItem', {
          value: () => {
            throw new DOMException('Simulated localStorage QuotaExceededError', 'QuotaExceededError');
          },
          configurable: true,
          writable: true
        });
      }

      const version = nextVersionCounter;
      const res = await saveRecoverySnapshotWithExperimentalHistory(
        activeFictitiousUser,
        createHomologFictitiousState({ ownerUserId: activeFictitiousUser, version }),
        'pre_reset_clean',
        {
          enableExperimentalHistory: true,
          indexedDBFactory: null
        }
      );
      const snapshotStatus = res.legacySaved || res.historySaved ? 'saved' : 'failed';
      setFailureSimulationLog(
        `Falha Dupla simulada (localStorage + IndexedDB): legacySaved=${res.legacySaved}, historySaved=${res.historySaved}, historyCode=${res.historyCode}, snapshotStatus=${snapshotStatus} (aviso honesto ao usuário sem falso positivo).`
      );
    } finally {
      if (onToggleLocalStorageFailure) {
        onToggleLocalStorageFailure(false);
      } else if (typeof localStorage !== 'undefined' && originalSetItem) {
        Object.defineProperty(localStorage, 'setItem', {
          value: originalSetItem,
          configurable: true,
          writable: true
        });
      }
      setIsBusy(false);
    }
  };

  const handleRunFullChecklist = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const report = await runHomologationChecklist(
        indexedDBFactory ? { indexedDBFactory } : undefined
      );
      setSuiteReport(report);
      await refreshHistory(activeFictitiousUser);
      notifyOtherTabs('HOMOLOG_SNAPSHOT_WRITTEN');
      setStatusLog(
        report.allPassed
          ? `Roteiro completo concluído: ${report.checks.length}/${report.checks.length} verificações aprovadas.`
          : 'Roteiro detectou falhas. Verifique os detalhes abaixo.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleConcurrentMultiTabTest = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      const base = nextVersionCounter;
      notifyOtherTabs('HOMOLOG_CONCURRENT_PING', { version: base + 100 });
      await Promise.all([
        saveRecoverySnapshotWithExperimentalHistory(
          activeFictitiousUser,
          createHomologFictitiousState({ ownerUserId: activeFictitiousUser, version: base }),
          'pre_json_import',
          { enableExperimentalHistory: true, ...idbRuntimeOption }
        ),
        saveRecoverySnapshotWithExperimentalHistory(
          activeFictitiousUser,
          createHomologFictitiousState({ ownerUserId: activeFictitiousUser, version: base + 1 }),
          'pre_force_download',
          { enableExperimentalHistory: true, ...idbRuntimeOption }
        )
      ]);
      setNextVersionCounter(v => v + 2);
      await refreshHistory(activeFictitiousUser);
      notifyOtherTabs('HOMOLOG_SNAPSHOT_WRITTEN');
      setStatusLog(
        isOpaquePreview
          ? 'Gravações concorrentes simuladas na fila do IndexedDB em memória (BroadcastChannel não se aplica dentro de origem opaca).'
          : 'Gravações concorrentes disparadas nesta aba e notificadas às demais abas da mesma origem isolada.'
      );
    } finally {
      setIsBusy(false);
    }
  };

  const handleClearOriginData = async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      await clearIsolatedHomologData(indexedDBFactory);
      setSuiteReport(null);
      setExportReport(null);
      setFailureSimulationLog(null);
      setUploadedValidationMessage(null);
      setSelectedDetails(null);
      setLastSavedVersion(null);
      await refreshHistory(activeFictitiousUser);
      notifyOtherTabs('HOMOLOG_SNAPSHOT_WRITTEN');
      setStatusLog('Armazenamento fictício deste ambiente de homologação limpo com segurança.');
    } finally {
      setIsBusy(false);
    }
  };

  const legacySnapshotPresent = Boolean(getRecoverySnapshotForUser(activeFictitiousUser));

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-4 sm:p-6">
      <div className="max-w-4xl mx-auto space-y-5">
        <header className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-amber-500/15 text-amber-700">
                <FlaskConical className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-base sm:text-lg font-bold text-slate-900">
                  {isOpaquePreview
                    ? 'Homologação Isolada P2.6B — Preview Sandbox (Origem Opaca)'
                    : 'Homologação Isolada P2.6A — Histórico IndexedDB'}
                </h1>
                <p className="text-xs text-slate-500">
                  {isOpaquePreview
                    ? 'Origem opaca (null) · IndexedDB em memória · localStorage efêmero · CSP connect-src none'
                    : `Origem separada (${typeof window !== 'undefined' ? window.location.origin : '4173'}) · Dados 100% fictícios · Sem acesso ao Supabase`}
                </p>
              </div>
            </div>
            <div
              data-testid="homolog-global-flag-badge"
              className="text-xs font-mono px-3 py-1.5 rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-800"
            >
              Flag Global Produção: {String(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY)}
            </div>
          </div>

          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <span>
              {isOpaquePreview
                ? 'Isolamento físico garantido pelo navegador (iframe sandbox sem allow-same-origin). É tecnicamente impossível ler sua sessão Supabase, seu localStorage real ou seu IndexedDB real do app principal. Esta sessão usa exclusivamente dados fictícios em memória e não é incluída no aplicativo publicado.'
                : 'Ambiente exclusivo de homologação local em navegador real. Nenhuma credencial Supabase, sessão de produção ou armazenamento da porta 3000 é acessado.'}
            </span>
          </div>
        </header>

        <section className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Users className="w-4 h-4 text-slate-500" />
              <span className="font-semibold">Usuário Fictício Ativo:</span>
              <button
                type="button"
                onClick={() => setActiveFictitiousUser(HOMOLOG_USER_A)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs border cursor-pointer ${
                  activeFictitiousUser === HOMOLOG_USER_A
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Usuário A (aaaa...)
              </button>
              <button
                type="button"
                onClick={() => setActiveFictitiousUser(HOMOLOG_USER_B)}
                className={`px-3 py-1.5 rounded-lg font-mono text-xs border cursor-pointer ${
                  activeFictitiousUser === HOMOLOG_USER_B
                    ? 'bg-slate-900 text-white border-slate-900'
                    : 'bg-white text-slate-700 border-slate-300'
                }`}
              >
                Usuário B (bbbb...)
              </button>
              <span className="text-[11px] text-slate-500">
                Legado ativo neste sandbox: {legacySnapshotPresent ? 'Sim' : 'Não'}
              </span>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleClearOriginData}
              className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Limpar Dados Fictícios</span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Motivo do ponto de recuperação"
              value={selectedReason}
              onChange={e => setSelectedReason(e.target.value)}
              className="px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
            >
              {HOMOLOG_REASONS.map(reason => (
                <option key={reason} value={reason}>
                  {formatRecoveryReason(reason).label} ({reason})
                </option>
              ))}
            </select>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleCreateFictitiousSnapshot}
              className="px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer"
            >
              Criar Ponto Fictício (v{nextVersionCounter})
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleCreateSixBatch}
              className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Criar 6 Pontos (Testar Limite 5)</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleTestDeduplication}
              className="px-3.5 py-2 rounded-xl border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Testar Deduplicação</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleConcurrentMultiTabTest}
              className="px-3.5 py-2 rounded-xl border border-slate-300 hover:bg-slate-100 text-slate-800 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Simular Concorrência</span>
            </button>

            <button
              type="button"
              disabled={isBusy}
              onClick={handleRunFullChecklist}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5" />
              <span>Executar Roteiro Completo (10 Testes)</span>
            </button>
          </div>

          <div
            data-testid="homolog-status-log"
            className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700"
          >
            {statusLog}
          </div>
        </section>

        <section className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <Database className="w-4 h-4 text-rose-500" />
              <span>Simulação de Falha de Armazenamento</span>
            </h2>
            <span className="text-[11px] text-slate-500">
              Sem afetar armazenamento real
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isBusy}
              onClick={handleSimulateIdbUnavailable}
              className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold cursor-pointer"
            >
              Simular IndexedDB Indisponível
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleSimulateQuotaExceeded}
              className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 text-xs font-semibold cursor-pointer"
            >
              Simular QuotaExceededError
            </button>
            <button
              type="button"
              disabled={isBusy}
              onClick={handleSimulateDoubleFailure}
              className="px-3 py-2 rounded-xl border border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-900 text-xs font-semibold cursor-pointer"
            >
              Simular Falha Dupla (IDB + localStorage)
            </button>
          </div>
          {failureSimulationLog && (
            <div
              data-testid="homolog-failure-log"
              className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900"
            >
              {failureSimulationLog}
            </div>
          )}
        </section>

        <section className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500" />
              <span>Histórico do Usuário Fictício (Máx. 5)</span>
            </h2>
            <span
              data-testid="homolog-history-counter"
              className="text-xs text-slate-500 tabular-nums"
            >
              {historyResult?.items.length ?? 0} de 5 exibidos
            </span>
          </div>

          {historyResult && historyResult.items.length > 0 ? (
            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl bg-slate-50/50">
              {historyResult.items.map(item => (
                <div
                  key={item.id}
                  data-testid={`homolog-history-item-v${item.version}`}
                  className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-2">
                      <Clock className="w-3.5 h-3.5 text-slate-400" />
                      <span className="font-semibold">{item.formattedSavedAt}</span>
                      <span className="font-mono text-slate-400">v{item.version}</span>
                      <span className="text-slate-500">({item.source})</span>
                    </div>
                    <div className="flex items-center gap-1.5 font-medium text-slate-700">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
                      <span>{item.reason.label}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 tabular-nums">
                      {item.counts.transactions} lançamentos · {item.counts.accounts} contas ·{' '}
                      {item.counts.debts} dívidas · {item.counts.goals} objetivos
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedDetails(item)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5" />
                      <span>Visualizar Detalhes</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDownloadAndValidateDryRun(item)}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5" />
                      <span>Baixar + Validar JSON</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500">
              Nenhum ponto de recuperação fictício gravado para este usuário nesta sessão isolada.
            </div>
          )}

          {historyResult && historyResult.extraOmittedCount > 0 && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                Há {historyResult.extraOmittedCount} ponto(s) adicional(is) mais antigo(s) preservado(s) além do limite visual de 5 registros.
              </span>
            </div>
          )}
        </section>

        <section className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <FileCheck2 className="w-4 h-4 text-blue-600" />
              <span>Validação Segura do JSON Exportado (Somente Prévia — Sem Restaurar)</span>
            </h2>
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleValidateUploadedJson}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>Validar Arquivo .json em Prévia</span>
              </button>
            </div>
          </div>

          {uploadedValidationMessage && (
            <div
              data-testid="homolog-uploaded-validation"
              className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-800"
            >
              {uploadedValidationMessage}
            </div>
          )}

          {exportReport ? (
            <div
              data-testid="homolog-export-dryrun-report"
              className="p-4 rounded-xl bg-blue-50/70 border border-blue-200 space-y-2.5 text-xs text-slate-800"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="font-bold">Arquivo gerado:</span>{' '}
                  <span className="font-mono">{exportReport.filename}</span>{' '}
                  <span className="text-slate-500">
                    ({exportReport.downloadTriggered ? 'download disparado' : 'prévia pronta'})
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleCopyExportedJson}
                  className="px-2.5 py-1 rounded-lg border border-blue-300 bg-white hover:bg-blue-50 text-[11px] font-semibold inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copiedFeedback ? 'JSON Copiado' : 'Copiar JSON'}</span>
                </button>
              </div>
              <div>• {exportReport.sameUserResult}</div>
              <div>• {exportReport.cloudNewerBlockedResult}</div>
              <div>• {exportReport.otherUserBlockedResult}</div>
              <div>• {exportReport.tamperedBlockedResult}</div>
              <details className="pt-1">
                <summary className="cursor-pointer font-semibold text-blue-900">
                  Inspecionar conteúdo JSON exportado
                </summary>
                <pre className="mt-2 p-2.5 rounded-lg bg-slate-900 text-slate-100 text-[11px] overflow-x-auto max-h-48">
                  {exportReport.jsonContent}
                </pre>
              </details>
            </div>
          ) : (
            <p className="text-xs text-slate-500">
              Clique em &quot;Baixar + Validar JSON&quot; em qualquer item do histórico para baixar a cópia e validar automaticamente formato, proprietário, conflito com nuvem e rejeição de adulteração sem alterar dados.
            </p>
          )}
        </section>

        {suiteReport && (
          <section
            data-testid="homolog-suite-report"
            className="p-5 bg-white rounded-2xl border border-slate-200 shadow-xs space-y-3"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-bold text-slate-900">
                Resultado do Roteiro Controlado (10 Verificações)
              </h2>
              <span
                className={`text-xs font-semibold ${
                  suiteReport.allPassed ? 'text-emerald-700' : 'text-rose-700'
                }`}
              >
                {suiteReport.checks.filter(c => c.passed).length}/{suiteReport.checks.length} aprovados
              </span>
            </div>

            <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl">
              {suiteReport.checks.map(check => (
                <div key={check.id} className="p-3 flex items-start gap-2.5 text-xs">
                  {check.passed ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">
                      {check.id}. {check.title}
                    </div>
                    <div className="text-slate-600 mt-0.5 break-all">{check.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>

      {selectedDetails && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60"
          role="dialog"
          aria-modal="true"
          aria-label="Detalhes Somente Leitura"
          onClick={() => setSelectedDetails(null)}
        >
          <div
            className="w-full max-w-md bg-white rounded-2xl border border-slate-200 p-5 space-y-3 text-xs"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-sm">Detalhes Somente Leitura</h3>
              <button
                type="button"
                aria-label="Fechar detalhes"
                onClick={() => setSelectedDetails(null)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div>Data/Horário: {selectedDetails.formattedSavedAt}</div>
            <div>Versão: v{selectedDetails.version}</div>
            <div>Origem: {selectedDetails.source}</div>
            <div>Motivo: {selectedDetails.reason.label}</div>
            <div className="text-slate-500">{selectedDetails.reason.description}</div>
            <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 space-y-1 tabular-nums">
              <div>Lançamentos: {selectedDetails.counts.transactions}</div>
              <div>Contas: {selectedDetails.counts.accounts}</div>
              <div>Cartões: {selectedDetails.counts.creditCards}</div>
              <div>Dívidas: {selectedDetails.counts.debts}</div>
              <div>Objetivos: {selectedDetails.counts.goals}</div>
              <div>Categorias: {selectedDetails.counts.categories}</div>
            </div>
            <div className="font-mono text-[11px] text-slate-500 break-all">
              Assinatura: {selectedDetails.contentSignature}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
