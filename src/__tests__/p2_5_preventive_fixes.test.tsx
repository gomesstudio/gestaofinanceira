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
  getRecoverySnapshotForUser,
  getUserRecoveryKey,
  getUserStateFromStorage,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  exportRecoverySnapshotById,
  listRecoveryHistory,
  MAX_RECOVERY_SNAPSHOTS_PER_USER,
  saveSnapshotToRecoveryHistory
} from '../utils/recoveryHistoryDb';
import {
  ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY,
  saveRecoverySnapshotWithExperimentalHistory
} from '../utils/recoverySnapshotAdapter';
import {
  evaluateBackupRestorationSafety,
  validateBackupJsonStructure
} from '../utils/backupSecurity';
import { buildRecoverySnapshotDownload } from '../utils/recoverySnapshot';
import { loadHybridRecoveryHistory } from '../utils/recoveryHistoryService';

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
        supabaseUserEmail: 'p25-a@ficticio.com' as string | null,
        supabaseUserDisplayName: 'Usuário P2.5 Fictício',
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
  useFinance
} from '../context/FinanceContext';
import { SettingsView } from '../components/settings/SettingsView';

function createFixtureState(
  ownerUserId: string,
  version: number,
  amount: number,
  description = `Lançamento P2.5 v${version}`,
  overrides: Partial<AppState> = {}
): AppState {
  return {
    ownerUserId,
    version,
    lastModified: 1700000000000 + version * 10000,
    transactions:
      amount === 0 && overrides.transactions === undefined
        ? [
            {
              id: `tx-${version}`,
              description,
              amount: 100,
              type: 'income',
              category: 'Salário',
              date: '2026-11-14',
              accountId: 'acc-1',
              paymentMethod: 'pix',
              status: 'paid'
            }
          ]
        : [
            {
              id: `tx-${version}`,
              description,
              amount: Math.max(1, amount),
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
        name: `Conta P2.5 v${version}`,
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

function makeMockStorage(options?: { failSetItemKeys?: RegExp }) {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      if (options?.failSetItemKeys && options.failSetItemKeys.test(key)) {
        throw new DOMException('Storage quota exceeded', 'QuotaExceededError');
      }
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

describe('P2.5 — Correções Preventivas Antes da Ativação do Histórico', () => {
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
      supabaseUserEmail: 'p25-a@ficticio.com',
      supabaseUserDisplayName: 'Usuário P2.5 Fictício',
      isSupabaseAuthenticated: true
    };

    getSessionMock.mockResolvedValue({
      data: {
        session: { user: { id: USER_A, email: 'p25-a@ficticio.com' } }
      },
      error: null
    });

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
    vi.restoreAllMocks();
  });

  it('0. Mantém feature flag IndexedDB DESATIVADA em produção na P2.5', () => {
    expect(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY).toBe(false);
  });

  it('1, 2 e 3. Aceita backup completo tradicional, arquivo de ponto IndexedDB e arquivo de ponto legado com validação completa', async () => {
    const fullState = createFixtureState(USER_A, 12, 4200, 'Backup Completo Fictício');
    const fullValidation = validateBackupJsonStructure(JSON.stringify(fullState), USER_A);
    expect(fullValidation.valid).toBe(true);
    expect(fullValidation.sourceFormat).toBe('full_backup');
    expect(fullValidation.state).toEqual(fullState);

    // Exportado do IndexedDB
    const idbSaved = await saveSnapshotToRecoveryHistory(
      USER_A,
      fullState,
      'pre_json_import',
      { indexedDBFactory: idbFactory }
    );
    expect(idbSaved.success).toBe(true);
    const idbExport = await exportRecoverySnapshotById(USER_A, idbSaved.record!.id, {
      indexedDBFactory: idbFactory
    });
    expect(idbExport.success).toBe(true);

    const idbValidation = validateBackupJsonStructure(idbExport.jsonContent!, USER_A);
    expect(idbValidation.valid).toBe(true);
    expect(idbValidation.sourceFormat).toBe('recovery_snapshot');
    expect(idbValidation.snapshotReason).toBe('pre_json_import');
    expect(idbValidation.snapshotSavedAt).toBeTruthy();
    expect(idbValidation.state).toEqual(fullState);

    // Exportado do legado localStorage
    expect(saveRecoverySnapshotForUser(USER_A, fullState, 'pre_reset_clean')).toBe(true);
    const legacyExport = buildRecoverySnapshotDownload(USER_A);
    expect(legacyExport.success).toBe(true);

    const legacyValidation = validateBackupJsonStructure(legacyExport.jsonContent!, USER_A);
    expect(legacyValidation.valid).toBe(true);
    expect(legacyValidation.sourceFormat).toBe('recovery_snapshot');
    expect(legacyValidation.snapshotReason).toBe('pre_reset_clean');
    expect(legacyValidation.state).toEqual(fullState);
  });

  it('4, 5 e 6. Rejeita envelopes adulterados/desconhecidos, dono divergente e bloqueia ponto mais antigo por versão/timestamp sem alterar estado ou Supabase', async () => {
    const stateA = createFixtureState(USER_A, 8, 3000, 'Ponto Histórico v8');
    const stateB = createFixtureState(USER_B, 8, 9999, 'Conta Externa');
    const currentCloudState = createFixtureState(USER_A, 12, 7500, 'Estado Atual Mais Recente');

    saveStateToStorageForUser(USER_A, currentCloudState);
    const activeBefore = getUserStateFromStorage(USER_A);

    // 4a. Envelope com campos desconhecidos
    const unknownFieldsEnvelope = JSON.stringify({
      snapshotId: 'snap-1',
      savedAt: '2026-11-14T10:00:00.000Z',
      reason: 'pre_reset_clean',
      ownerUserId: USER_A,
      tamperedExtra: true,
      state: stateA
    });
    expect(validateBackupJsonStructure(unknownFieldsEnvelope, USER_A).code).toBe('invalid_structure');

    // 4b. Envelope sem savedAt / reason válidos
    const missingMetaEnvelope = JSON.stringify({
      savedAt: 'not-a-date',
      reason: 'pre_reset_clean',
      ownerUserId: USER_A,
      state: stateA
    });
    expect(validateBackupJsonStructure(missingMetaEnvelope, USER_A).code).toBe('invalid_structure');

    // 4c. Estrutura mista (campos raiz + state)
    const mixedEnvelope = JSON.stringify({
      ...stateA,
      state: stateA
    });
    expect(validateBackupJsonStructure(mixedEnvelope, USER_A).code).toBe('invalid_structure');

    // 4d. Divergência entre ownerUserId do envelope e do state interno
    const mismatchedInnerOwner = JSON.stringify({
      snapshotId: 'snap-2',
      savedAt: '2026-11-14T10:00:00.000Z',
      reason: 'pre_local_push',
      ownerUserId: USER_A,
      state: stateB
    });
    expect(validateBackupJsonStructure(mismatchedInnerOwner, USER_A).code).toBe('owner_mismatch');

    // 4e. state interno sem ownerUserId
    const missingInnerOwnerState = { ...stateA } as Partial<AppState>;
    delete missingInnerOwnerState.ownerUserId;
    const missingInnerOwnerEnvelope = JSON.stringify({
      savedAt: '2026-11-14T10:00:00.000Z',
      reason: 'pre_local_push',
      ownerUserId: USER_A,
      state: missingInnerOwnerState
    });
    expect(validateBackupJsonStructure(missingInnerOwnerEnvelope, USER_A).code).toBe('missing_owner');

    // 5. Arquivo válido pertencente a outro usuário (USER_B)
    const otherUserEnvelope = JSON.stringify({
      snapshotId: 'snap-other',
      savedAt: '2026-11-14T10:00:00.000Z',
      reason: 'pre_force_download',
      ownerUserId: USER_B,
      state: stateB
    });
    expect(validateBackupJsonStructure(otherUserEnvelope, USER_A).code).toBe('owner_mismatch');

    // 6. Ponto de recuperação mais antigo continua bloqueado por versão/timestamp na prévia real
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: currentCloudState,
        version: currentCloudState.version,
        client_timestamp: currentCloudState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });

    const olderSnapshotJson = JSON.stringify({
      snapshotId: 'snap-old-v8',
      savedAt: '2026-11-14T10:00:00.000Z',
      reason: 'pre_reset_clean',
      ownerUserId: USER_A,
      state: stateA
    });

    const oldValidated = validateBackupJsonStructure(olderSnapshotJson, USER_A);
    expect(oldValidated.valid).toBe(true);
    const safetyDecision = evaluateBackupRestorationSafety({
      backupState: oldValidated.state!,
      currentLocalState: currentCloudState,
      remoteResult: {
        success: true,
        data: currentCloudState,
        version: currentCloudState.version,
        clientTimestamp: currentCloudState.lastModified
      },
      expectedUserId: USER_A
    });
    expect(safetyDecision.allowed).toBe(false);
    expect(safetyDecision.reasonCode).toBe('outdated_version');

    // Inspeciona via FinanceContext + SettingsView sem restaurar e sem gravar no Supabase
    let latestCtx!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider>
          <ContextProbe onContext={ctx => (latestCtx = ctx)} />
          <SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    let outcome: any;
    await act(async () => {
      outcome = await latestCtx.inspectBackupJsonForRestore(olderSnapshotJson);
    });
    expect(outcome.valid).toBe(true);
    expect(outcome.canRestore).toBe(false);
    expect(outcome.prepared.sourceFormat).toBe('recovery_snapshot');
    expect(outcome.message).toContain('anterior à versão atual na nuvem');

    // Nenhuma gravação no Supabase nem alteração no estado local ativo
    expect(upsertMock).not.toHaveBeenCalled();
    expect(getUserStateFromStorage(USER_A)).toEqual(activeBefore);
    expect(latestCtx.transactions[0].description).toBe('Estado Atual Mais Recente');
  });

  it('7. Falha dupla (localStorage + IndexedDB), conta vazia e snapshot salvo exibem feedback honesto e exato no resetAllData', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    // Caso 7A: Estado COM dados reais, mas localStorage falha ao gravar recovery e IndexedDB está indisponível
    Object.defineProperty(window, 'localStorage', {
      value: makeMockStorage({ failSetItemKeys: /^finance_pro_recovery_/ }),
      writable: true,
      configurable: true
    });

    const realState = createFixtureState(USER_A, 5, 5000, 'Dado Real Importante');
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: realState,
        version: 5,
        client_timestamp: realState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });

    let ctxA!: FinanceContextType;
    await act(async () => {
      root.render(
        <FinanceProvider
          experimentalHistoryOptions={{
            enableExperimentalHistory: true,
            indexedDBFactory: null
          }}
        >
          <ContextProbe onContext={ctx => (ctxA = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    // 7A-1: Reset com falha dupla e nuvem OK
    let resetDoubleFailSynced: any;
    await act(async () => {
      resetDoubleFailSynced = await ctxA.resetAllData();
    });
    expect(resetDoubleFailSynced.success).toBe(true);
    expect(resetDoubleFailSynced.synced).toBe(true);
    expect(resetDoubleFailSynced.snapshotStatus).toBe('failed');
    expect(resetDoubleFailSynced.message).not.toContain('snapshot local prévio foi preservado');
    expect(resetDoubleFailSynced.message).toContain('não foi possível gravar o snapshot preventivo local');

    // 7A-2: Recarrega estado com dados, falha dupla + falha no Supabase
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    Object.defineProperty(window, 'localStorage', {
      value: makeMockStorage({ failSetItemKeys: /^finance_pro_recovery_/ }),
      writable: true,
      configurable: true
    });
    await act(async () => {
      root.render(
        <FinanceProvider
          experimentalHistoryOptions={{
            enableExperimentalHistory: true,
            indexedDBFactory: null
          }}
        >
          <ContextProbe onContext={ctx => (ctxA = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);
    upsertMock.mockResolvedValueOnce({ data: null, error: { message: 'Falha simulada' } });

    let resetDoubleFailOffline: any;
    await act(async () => {
      resetDoubleFailOffline = await ctxA.resetAllData();
    });
    expect(resetDoubleFailOffline.success).toBe(true);
    expect(resetDoubleFailOffline.synced).toBe(false);
    expect(resetDoubleFailOffline.snapshotStatus).toBe('failed');
    expect(resetDoubleFailOffline.message).not.toContain('snapshot de recuperação salvo');
    expect(resetDoubleFailOffline.message).toContain('não foi possível gravar o snapshot preventivo local');

    // Caso 7B: Conta vazia (0 lançamentos, 0 dívidas, 0 objetivos) -> "não necessário"
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    Object.defineProperty(window, 'localStorage', {
      value: makeMockStorage(),
      writable: true,
      configurable: true
    });
    const emptyState = createFixtureState(USER_A, 3, 0, '', { transactions: [], debts: [], goals: [] });
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: emptyState,
        version: 3,
        client_timestamp: emptyState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });
    upsertMock.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      root.render(
        <FinanceProvider experimentalHistoryOptions={{ indexedDBFactory: idbFactory }}>
          <ContextProbe onContext={ctx => (ctxA = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    let resetEmptyRes: any;
    await act(async () => {
      resetEmptyRes = await ctxA.resetAllData();
    });
    expect(resetEmptyRes.success).toBe(true);
    expect(resetEmptyRes.snapshotStatus).toBe('not_needed');
    expect(resetEmptyRes.message).toContain('Nenhum snapshot preventivo foi necessário');
    expect(resetEmptyRes.message).not.toContain('snapshot local prévio foi preservado');

    // Caso 7C: Snapshot efetivamente salvo -> feedback positivo preciso
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    Object.defineProperty(window, 'localStorage', {
      value: makeMockStorage(),
      writable: true,
      configurable: true
    });
    maybeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: realState,
        version: 5,
        client_timestamp: realState.lastModified,
        updated_at: '2026-11-14T19:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(
        <FinanceProvider experimentalHistoryOptions={{ indexedDBFactory: idbFactory }}>
          <ContextProbe onContext={ctx => (ctxA = ctx)} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    let resetSavedRes: any;
    await act(async () => {
      resetSavedRes = await ctxA.resetAllData();
    });
    expect(resetSavedRes.success).toBe(true);
    expect(resetSavedRes.snapshotStatus).toBe('saved');
    expect(resetSavedRes.message).toContain('Um snapshot local prévio foi preservado');

    warnSpy.mockRestore();
  });

  it('8. Deduplicação entre IndexedDB e localStorage legado preserva data e motivo do registro mais recente', async () => {
    const sharedState = createFixtureState(USER_A, 10, 4400, 'Estado Compartilhado');

    // Grava primeiro no IndexedDB (T1 mais antigo) com motivo 'pre_force_download'
    const idbRes = await saveSnapshotToRecoveryHistory(
      USER_A,
      sharedState,
      'pre_force_download',
      { indexedDBFactory: idbFactory }
    );
    expect(idbRes.success).toBe(true);

    // Depois grava no localStorage legado (T2 mais recente) com o MESMO conteúdo e novo motivo 'pre_reset_clean'
    const newerTimestampIso = new Date(Date.now() + 60000).toISOString();
    window.localStorage.setItem(
      getUserRecoveryKey(USER_A),
      JSON.stringify({
        savedAt: newerTimestampIso,
        reason: 'pre_reset_clean',
        ownerUserId: USER_A,
        state: sharedState
      })
    );
    const rawLegacyBefore = window.localStorage.getItem(getUserRecoveryKey(USER_A));

    const loaded = await loadHybridRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(loaded.items).toHaveLength(1);
    expect(loaded.totalDistinctCount).toBe(1);
    expect(loaded.extraOmittedCount).toBe(0);
    // Metadados mais recentes do legado foram preservados sem apagar nenhum registro
    expect(loaded.items[0].source).toBe('legacy_localstorage');
    expect(loaded.items[0].savedAt).toBe(newerTimestampIso);
    expect(loaded.items[0].reason.code).toBe('pre_reset_clean');
    expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBe(rawLegacyBefore);
    const idbStillThere = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(idbStillThere.items).toHaveLength(1);
  });

  it('9 e 10. Respeita limite visual de 5 com aviso quando há legado adicional distinto e exibe aviso de riscos do navegador sem promessa falsa', async () => {
    // 5 snapshots no IndexedDB (v2..v6, timestamps recentes)
    for (let v = 2; v <= 6; v++) {
      await saveSnapshotToRecoveryHistory(
        USER_A,
        createFixtureState(USER_A, v, 1000 * v, `IDB Item v${v}`),
        'pre_json_import',
        { indexedDBFactory: idbFactory }
      );
      await new Promise(resolve => setTimeout(resolve, 2));
    }

    // + 1 snapshot legado distinto mais antigo (v1)
    const olderLegacyState = createFixtureState(USER_A, 1, 500, 'Legado Distinto v1');
    const olderIso = '2025-01-01T10:00:00.000Z';
    const rawLegacyPayload = JSON.stringify({
      savedAt: olderIso,
      reason: 'pre_legacy_import',
      ownerUserId: USER_A,
      state: olderLegacyState
    });
    window.localStorage.setItem(getUserRecoveryKey(USER_A), rawLegacyPayload);

    await act(async () => {
      root.render(
        <FinanceProvider experimentalHistoryOptions={{ indexedDBFactory: idbFactory }}>
          <SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />
        </FinanceProvider>
      );
    });
    await flushUi(80);

    const rows = Array.from(container.querySelectorAll('[data-testid="recovery-history-item"]'));
    expect(rows).toHaveLength(MAX_RECOVERY_SNAPSHOTS_PER_USER);

    const omittedNotice = container.querySelector('[data-testid="recovery-history-omitted-notice"]');
    expect(omittedNotice).not.toBeNull();
    expect(omittedNotice!.textContent).toContain('1 ponto(s) de recuperação mais antigo(s) preservado(s)');
    expect(omittedNotice!.textContent).toContain('limite visual de 5 registros');

    // Snapshot legado continua preservado intacto no localStorage
    expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBe(rawLegacyPayload);

    // Texto de armazenamento sem promessa falsa + aviso explícito do navegador
    const text = container.textContent || '';
    expect(text).not.toContain('nunca se perdem ao fechar a página');
    const browserNotice = container.querySelector('[data-testid="recovery-browser-risk-notice"]');
    expect(browserNotice).not.toBeNull();
    expect(browserNotice!.textContent).toContain(
      'Os pontos de recuperação são armazenados neste navegador e podem ser perdidos ao limpar os dados do site, trocar de dispositivo ou utilizar navegação privada. Faça backups JSON regularmente e guarde-os em local seguro.'
    );
  });

  it('11. Garante isolamento estrito entre usuários e rejeita estado sem ownerUserId no adaptador', async () => {
    const stateWithoutOwner = createFixtureState(USER_A, 4, 2000);
    delete (stateWithoutOwner as Partial<AppState>).ownerUserId;

    const missingOwnerResOff = await saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      stateWithoutOwner,
      'pre_reset_clean',
      { indexedDBFactory: idbFactory }
    );
    expect(missingOwnerResOff.legacySaved).toBe(false);
    expect(missingOwnerResOff.historyCode).toBe('skipped_ineligible');
    expect(getRecoverySnapshotForUser(USER_A)).toBeNull();

    const missingOwnerResOn = await saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      stateWithoutOwner,
      'pre_reset_clean',
      { enableExperimentalHistory: true, indexedDBFactory: idbFactory }
    );
    expect(missingOwnerResOn.legacySaved).toBe(false);
    expect(missingOwnerResOn.historySaved).toBe(false);
    expect(missingOwnerResOn.historyCode).toBe('skipped_ineligible');

    const crossUserRes = await saveRecoverySnapshotWithExperimentalHistory(
      USER_A,
      createFixtureState(USER_B, 5, 3000),
      'pre_reset_clean',
      { enableExperimentalHistory: true, indexedDBFactory: idbFactory }
    );
    expect(crossUserRes.legacySaved).toBe(false);
    expect(crossUserRes.historySaved).toBe(false);
    expect(crossUserRes.historyCode).toBe('skipped_ineligible');

    const historyA = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    expect(historyA.items).toHaveLength(0);
  });

  it('12 e 13. Simula concorrência de 2 abas compartilhando o mesmo IndexedDB respeitando retenção de 5, sem perda de dados e sem chamadas ao Supabase', async () => {
    // Aba 1 e Aba 2 escrevem simultaneamente no mesmo IDBFactory para USER_A e USER_B
    const tab1Writes = [1, 2, 3, 4].map(v =>
      saveSnapshotToRecoveryHistory(
        USER_A,
        createFixtureState(USER_A, v, 1000 * v, `Aba 1 v${v}`),
        'pre_json_import',
        { indexedDBFactory: idbFactory }
      )
    );
    const tab2Writes = [5, 6, 7].map(v =>
      saveSnapshotToRecoveryHistory(
        USER_A,
        createFixtureState(USER_A, v, 1000 * v, `Aba 2 v${v}`),
        'pre_force_download',
        { indexedDBFactory: idbFactory }
      )
    );
    const tabUserB = [1, 2].map(v =>
      saveSnapshotToRecoveryHistory(
        USER_B,
        createFixtureState(USER_B, v, 9000 * v, `User B v${v}`),
        'pre_reset_clean',
        { indexedDBFactory: idbFactory }
      )
    );

    const all = await Promise.all([...tab1Writes, ...tab2Writes, ...tabUserB]);
    expect(all.every(r => r.success)).toBe(true);

    const finalA = await listRecoveryHistory(USER_A, { indexedDBFactory: idbFactory });
    const finalB = await listRecoveryHistory(USER_B, { indexedDBFactory: idbFactory });

    expect(finalA.items).toHaveLength(MAX_RECOVERY_SNAPSHOTS_PER_USER);
    // Garante que nenhuma versão de B vazou para A e os 5 snapshots retidos pertencem a USER_A
    expect(finalA.items.every(i => i.ownerUserId === USER_A)).toBe(true);
    expect(finalA.items.some(i => i.version === 7)).toBe(true);
    expect(finalB.items).toHaveLength(2);
    expect(finalB.items.every(i => i.ownerUserId === USER_B)).toBe(true);
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
