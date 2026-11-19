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
  getUserRecoveryKey,
  getUserStateFromStorage,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import {
  computeStateContentSignature,
  RECOVERY_HISTORY_DB_NAME,
  RECOVERY_HISTORY_DB_VERSION,
  RECOVERY_HISTORY_STORE_NAME,
  RecoveryHistoryRecord,
  saveSnapshotToRecoveryHistory
} from '../utils/recoveryHistoryDb';
import { ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY } from '../utils/recoverySnapshotAdapter';
import * as recoveryHistoryService from '../utils/recoveryHistoryService';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const USER_A = '11111111-1111-4111-8111-111111111111';
const USER_B = '22222222-2222-4222-8222-222222222222';

const upsertMock = vi.fn();
const fromMock = vi.fn(() => ({
  upsert: upsertMock
}));
const getSessionMock = vi.fn();

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => getSessionMock(...args)
    },
    from: (...args: any[]) => (fromMock as any)(...args)
  },
  SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
}));

const mockAuthValues: {
  logout: ReturnType<typeof vi.fn>;
  updatePassword: ReturnType<typeof vi.fn>;
  supabaseUserId: string | null;
  supabaseUserEmail: string | null;
  supabaseUserDisplayName: string | null;
  isSupabaseAuthenticated: boolean;
  signInWithSupabase: ReturnType<typeof vi.fn>;
  loginWithGitHub: ReturnType<typeof vi.fn>;
  signInWithOtp: ReturnType<typeof vi.fn>;
  verifyOtp: ReturnType<typeof vi.fn>;
  sendPasswordResetEmail: ReturnType<typeof vi.fn>;
  disconnectCloud: ReturnType<typeof vi.fn>;
  checkSessionStatus: ReturnType<typeof vi.fn>;
} = {
  logout: vi.fn(),
  updatePassword: vi.fn(),
  supabaseUserId: USER_A,
  supabaseUserEmail: 'usuario.a@ficticio.com',
  supabaseUserDisplayName: 'Usuário A Fictício',
  isSupabaseAuthenticated: true,
  signInWithSupabase: vi.fn(),
  loginWithGitHub: vi.fn(),
  signInWithOtp: vi.fn(),
  verifyOtp: vi.fn(),
  sendPasswordResetEmail: vi.fn(),
  disconnectCloud: vi.fn(),
  checkSessionStatus: vi.fn()
};

vi.mock('../context/AuthContext', () => ({
  useAuth: () => mockAuthValues
}));

const financeSpies = {
  setSafetyReserveDesired: vi.fn(),
  addCategory: vi.fn(),
  updateCategory: vi.fn(),
  deleteCategory: vi.fn(),
  addAccount: vi.fn(),
  updateAccount: vi.fn(),
  deleteAccount: vi.fn(),
  loadSampleData: vi.fn(),
  resetAllData: vi.fn(),
  exportBackupJson: vi.fn(() => '{}'),
  inspectBackupJsonForRestore: vi.fn(),
  applyConfirmedBackupRestore: vi.fn(),
  syncNowWithCloud: vi.fn(),
  forceUploadLocalToCloud: vi.fn(),
  forceDownloadFromCloud: vi.fn(),
  runCloudDiagnostic: vi.fn(),
  exportLegacyBackupFile: vi.fn(() => null),
  importLegacyBackupToCurrentAccount: vi.fn(),
  dismissLegacyBackupPrompt: vi.fn()
};

function createFixtureState(
  ownerUserId: string,
  version: number,
  options?: {
    txCount?: number;
    reserve?: number;
    secretLabel?: string;
  }
): AppState {
  const txCount = options?.txCount ?? version;
  const reserve = options?.reserve ?? 1000 * version;
  const secretLabel = options?.secretLabel ?? `Lançamento Secreto v${version}`;

  const transactions = Array.from({ length: txCount }, (_, idx) => ({
    id: `tx-v${version}-${idx + 1}`,
    description: `${secretLabel} #${idx + 1}`,
    amount: 500 + idx * 50,
    type: 'income' as const,
    category: 'Salário',
    date: '2026-11-14',
    accountId: 'acc-1',
    paymentMethod: 'pix' as const,
    status: 'paid' as const
  }));

  return {
    ownerUserId,
    version,
    lastModified: 1700000000000 + version * 1000,
    transactions,
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: `Conta Secreta v${version}`,
        type: 'checking',
        balance: reserve,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: `Cartão v${version}`,
        color: '#6366f1',
        limitTotal: 4000,
        closingDay: 15,
        dueDay: 22
      }
    ],
    debts:
      version % 2 === 0
        ? [
            {
              id: `debt-${version}`,
              name: `Dívida Privada v${version}`,
              creditor: 'Banco Fictício',
              originalAmount: 2000,
              currentBalance: 1000,
              contractDate: '2026-01-10',
              dueDate: '2026-12-10',
              priority: 'medium',
              status: 'in_payment',
              totalPaid: 1000
            }
          ]
        : [],
    goals: [
      {
        id: `goal-${version}`,
        name: `Objetivo Privado v${version}`,
        targetAmount: 10000,
        currentAmount: 2500,
        deadlineDate: '2027-12-31',
        monthlyPlannedContribution: 400,
        category: 'Segurança',
        color: '#10b981'
      }
    ],
    safetyReserveDesired: reserve,
    isSampleLoaded: false
  };
}

let activeFixtureState = createFixtureState(USER_A, 99, {
  txCount: 1,
  reserve: 9900,
  secretLabel: 'Estado Ativo Atual'
});

vi.mock('../context/FinanceContext', () => ({
  useFinance: () => ({
    transactions: activeFixtureState.transactions,
    debts: activeFixtureState.debts,
    goals: activeFixtureState.goals,
    categories: activeFixtureState.categories,
    accounts: activeFixtureState.accounts,
    safetyReserveDesired: activeFixtureState.safetyReserveDesired,
    isSampleLoaded: activeFixtureState.isSampleLoaded,
    cloudSyncStatus: 'connected',
    cloudSyncMessage: 'Conectado em ambiente isolado',
    lastCloudSyncDate: new Date('2026-11-14T18:00:00.000Z'),
    legacyBackupPrompt: null,
    ...financeSpies
  })
}));

import { SettingsView } from '../components/settings/SettingsView';

function installIsolatedStorageMock() {
  let store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      }
    },
    writable: true
  });
}

async function flushAsync(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
      await new Promise(resolve => setTimeout(resolve, 0));
    });
  }
}

async function insertRawRecordIntoIdb(
  idbFactory: IDBFactory,
  rawRecord: Record<string, unknown>
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const openReq = idbFactory.open(RECOVERY_HISTORY_DB_NAME, RECOVERY_HISTORY_DB_VERSION);
    openReq.onupgradeneeded = () => {
      const db = openReq.result;
      const store = db.objectStoreNames.contains(RECOVERY_HISTORY_STORE_NAME)
        ? openReq.transaction!.objectStore(RECOVERY_HISTORY_STORE_NAME)
        : db.createObjectStore(RECOVERY_HISTORY_STORE_NAME, { keyPath: 'id' });
      if (!store.indexNames.contains('by_owner')) {
        store.createIndex('by_owner', 'ownerUserId', { unique: false });
      }
      if (!store.indexNames.contains('by_owner_created')) {
        store.createIndex('by_owner_created', ['ownerUserId', 'createdAtMs'], { unique: false });
      }
    };
    openReq.onerror = () => reject(openReq.error);
    openReq.onsuccess = () => {
      const db = openReq.result;
      const tx = db.transaction(RECOVERY_HISTORY_STORE_NAME, 'readwrite');
      tx.objectStore(RECOVERY_HISTORY_STORE_NAME).put(rawRecord);
      tx.oncomplete = () => {
        db.close();
        resolve();
      };
      tx.onerror = () => {
        db.close();
        reject(tx.error);
      };
    };
  });
}

describe('P2.3 — Interface Histórico de Recuperação (IndexedDB + Legado Somente Leitura)', () => {
  let container: HTMLDivElement;
  let root: Root;
  let idbFactory: IDBFactory;

  beforeEach(() => {
    vi.clearAllMocks();
    installIsolatedStorageMock();
    idbFactory = new IDBFactory();

    activeFixtureState = createFixtureState(USER_A, 99, {
      txCount: 1,
      reserve: 9900,
      secretLabel: 'Estado Ativo Atual'
    });
    mockAuthValues.supabaseUserId = USER_A;
    mockAuthValues.supabaseUserEmail = 'usuario.a@ficticio.com';
    mockAuthValues.isSupabaseAuthenticated = true;

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

  it('0. Mantém feature flag experimental DESATIVADA em produção na P2.3', () => {
    expect(ENABLE_EXPERIMENTAL_INDEXEDDB_RECOVERY_HISTORY).toBe(false);
  });

  it('1, 2, 10 e 11. Exibe até 5 snapshots ordenados do mais recente ao mais antigo sem expor valores/nomes sensíveis nem botões de restauração/exclusão', async () => {
    saveStateToStorageForUser(USER_A, activeFixtureState);
    const activeStateBefore = getUserStateFromStorage(USER_A);

    const reasons = [
      'pre_local_push',
      'pre_force_download',
      'pre_legacy_import',
      'pre_load_sample',
      'pre_reset_clean',
      'pre_json_import'
    ];

    const savedIdsInOrder: string[] = [];
    for (let i = 1; i <= 6; i++) {
      const res = await saveSnapshotToRecoveryHistory(
        USER_A,
        createFixtureState(USER_A, i, { txCount: i, reserve: 1000 * i }),
        reasons[i - 1],
        { indexedDBFactory: idbFactory }
      );
      expect(res.success).toBe(true);
      savedIdsInOrder.push(res.record!.id);
    }

    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    await flushAsync();

    const pageText = container.textContent || '';
    expect(pageText).toContain('Histórico de Recuperação');
    expect(pageText).toContain('5 de 5 pontos disponíveis');

    const rows = Array.from(container.querySelectorAll('[data-testid="recovery-history-item"]'));
    expect(rows).toHaveLength(5);

    // Ordem do mais recente (v6) ao mais antigo mantido (v2); v1 foi podado pelo limite de 5
    expect(rows.map(r => r.getAttribute('data-snapshot-id'))).toEqual([
      savedIdsInOrder[5],
      savedIdsInOrder[4],
      savedIdsInOrder[3],
      savedIdsInOrder[2],
      savedIdsInOrder[1]
    ]);
    expect(rows[0].textContent).toContain('v6');
    expect(rows[0].textContent).toContain('Antes de restaurar backup JSON');
    expect(rows[0].textContent).toContain('6 lançamentos');
    expect(rows[4].textContent).toContain('v2');
    expect(rows[4].textContent).toContain('Antes de baixar dados da nuvem');

    const cardRoot = rows[0].closest('.rounded-2xl')!;
    const cardText = cardRoot.textContent || '';

    // Privacidade: não expõe descrições de lançamentos, nomes de contas, dívidas ou saldos monetários dos snapshots
    expect(cardText).not.toContain('Lançamento Secreto');
    expect(cardText).not.toContain('Conta Secreta');
    expect(cardText).not.toContain('Dívida Privada');
    expect(cardText).not.toContain('Objetivo Privado');

    // Proibido botão de restaurar ou excluir no card de histórico
    const cardButtonLabels = Array.from(cardRoot.querySelectorAll('button')).map(
      b => b.textContent || ''
    );
    expect(cardButtonLabels.some(t => /restaurar/i.test(t))).toBe(false);
    expect(cardButtonLabels.some(t => /excluir|apagar|remover/i.test(t))).toBe(false);

    // Abre detalhes do 2º snapshot (v5) e verifica integridade e ausência de botão restaurar/excluir
    const secondDetailsBtn = Array.from(rows[1].querySelectorAll('button')).find(b =>
      b.textContent?.includes('Visualizar Detalhes')
    )!;
    await act(async () => {
      secondDetailsBtn.click();
    });

    const dialog = container.querySelector('[role="dialog"][aria-labelledby="recovery-details-modal-title"]');
    expect(dialog).not.toBeNull();
    expect(dialog!.textContent).toContain('v5');
    expect(dialog!.textContent).toContain('Antes de zerar os dados da conta');
    expect(dialog!.textContent).toContain('Lançamentos5');
    const modalButtons = Array.from(dialog!.querySelectorAll('button')).map(b => b.textContent || '');
    expect(modalButtons.some(t => /restaurar|excluir|apagar|remover/i.test(t))).toBe(false);

    // Estado ativo e Supabase intocados, nenhum snapshot automático criado ao abrir Configurações
    expect(getUserStateFromStorage(USER_A)).toEqual(activeStateBefore);
    expect(fromMock).not.toHaveBeenCalled();
    expect(upsertMock).not.toHaveBeenCalled();
    expect(getSessionMock).not.toHaveBeenCalled();
  });

  it('3. Lê snapshot legado do localStorage com identificação discreta sem apagá-lo ou modificá-lo', async () => {
    const legacyState = createFixtureState(USER_A, 3, { txCount: 3, reserve: 3300 });
    expect(saveRecoverySnapshotForUser(USER_A, legacyState, 'pre_legacy_import')).toBe(true);
    const rawLegacyBefore = window.localStorage.getItem(getUserRecoveryKey(USER_A))!;

    const idbRes = await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 7, { txCount: 7, reserve: 7700 }),
      'pre_local_push',
      { indexedDBFactory: idbFactory }
    );
    expect(idbRes.success).toBe(true);

    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    await flushAsync();

    const rows = Array.from(container.querySelectorAll('[data-testid="recovery-history-item"]'));
    expect(rows).toHaveLength(2);

    const legacyRow = rows.find(r => r.getAttribute('data-snapshot-source') === 'legacy_localstorage');
    expect(legacyRow).toBeDefined();
    expect(legacyRow!.textContent).toContain('Cópia local anterior');
    expect(legacyRow!.textContent).toContain('Antes de importar dados legados');
    expect(legacyRow!.textContent).toContain('3 lançamentos');

    // Snapshot legado continua intacto no localStorage
    expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBe(rawLegacyBefore);
  });

  it('4. Deduplica snapshot idêntico presente simultaneamente no IndexedDB e no localStorage legado', async () => {
    const sharedState = createFixtureState(USER_A, 4, { txCount: 4, reserve: 4400 });
    saveRecoverySnapshotForUser(USER_A, sharedState, 'pre_json_import');
    const rawLegacyBefore = window.localStorage.getItem(getUserRecoveryKey(USER_A))!;

    await saveSnapshotToRecoveryHistory(USER_A, sharedState, 'pre_json_import', {
      indexedDBFactory: idbFactory
    });

    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    await flushAsync();

    const rows = Array.from(container.querySelectorAll('[data-testid="recovery-history-item"]'));
    expect(rows).toHaveLength(1);
    expect(rows[0].getAttribute('data-snapshot-source')).toBe('indexeddb');
    expect(container.textContent).toContain('1 de 5 pontos disponíveis');
    expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBe(rawLegacyBefore);
  });

  it('5. Garante isolamento estrito entre contas: usuário A nunca visualiza snapshots do usuário B nem registros adulterados', async () => {
    await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 2, { txCount: 2 }),
      'pre_local_push',
      { indexedDBFactory: idbFactory }
    );
    await saveSnapshotToRecoveryHistory(
      USER_B,
      createFixtureState(USER_B, 8, { txCount: 8 }),
      'pre_reset_clean',
      { indexedDBFactory: idbFactory }
    );
    saveRecoverySnapshotForUser(
      USER_B,
      createFixtureState(USER_B, 9, { txCount: 9 }),
      'pre_load_sample'
    );

    // Registro adulterado tentando associar ownerUserId externo como se fosse de USER_A
    const tamperedState = createFixtureState(USER_B, 11, { txCount: 11 });
    const tamperedRecord: RecoveryHistoryRecord = {
      id: 'tampered-cross-owner',
      ownerUserId: USER_A,
      savedAt: new Date().toISOString(),
      createdAtMs: Date.now() + 50000,
      reason: 'pre_json_import',
      version: 11,
      contentSignature: computeStateContentSignature(tamperedState),
      counts: {
        transactions: 11,
        accounts: 1,
        creditCards: 1,
        debts: 0,
        goals: 1,
        categories: DEFAULT_CATEGORIES.length
      },
      state: tamperedState
    };
    await insertRawRecordIntoIdb(idbFactory, tamperedRecord as unknown as Record<string, unknown>);

    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    await flushAsync();

    const rows = Array.from(container.querySelectorAll('[data-testid="recovery-history-item"]'));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('2 lançamentos');
    expect(container.textContent).not.toContain('8 lançamentos');
    expect(container.textContent).not.toContain('9 lançamentos');
    expect(container.textContent).not.toContain('11 lançamentos');
  });

  it('6. Descarta resposta assíncrona obsoleta e fecha modal em troca de conta ou logout durante carregamento', async () => {
    let resolvePendingLoad!: (val: recoveryHistoryService.HybridRecoveryHistoryLoadResult) => void;
    const pendingPromise = new Promise<recoveryHistoryService.HybridRecoveryHistoryLoadResult>(
      resolve => {
        resolvePendingLoad = resolve;
      }
    );

    const loadSpy = vi
      .spyOn(recoveryHistoryService, 'loadHybridRecoveryHistory')
      .mockImplementationOnce(() => pendingPromise)
      .mockResolvedValueOnce({
        items: [],
        totalDistinctCount: 0,
        extraOmittedCount: 0,
        indexedDbStatus: 'available',
        legacyStatus: 'empty',
        skippedCorruptedCount: 0,
        hasAnyWarning: false
      });

    // Inicia carregando USER_A com resposta atrasada
    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    expect(container.textContent).toContain('Carregando histórico de recuperação...');

    // Antes de USER_A terminar, usuário muda para USER_B
    mockAuthValues.supabaseUserId = USER_B;
    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    await flushAsync();

    // Agora a resposta atrasada de USER_A chega tarde demais
    await act(async () => {
      resolvePendingLoad({
        items: [
          {
            id: 'stale-user-a-snap',
            source: 'indexeddb',
            ownerUserId: USER_A,
            savedAt: '2026-11-14T12:00:00.000Z',
            createdAtMs: 1700000000000,
            formattedSavedAt: '14/11/2026, 09:00:00',
            reason: {
              code: 'pre_local_push',
              label: 'Antes de enviar alterações para a nuvem',
              description: 'Descrição'
            },
            version: 5,
            contentSignature: 'sig-stale',
            counts: {
              transactions: 77,
              accounts: 1,
              creditCards: 1,
              debts: 0,
              goals: 1,
              categories: DEFAULT_CATEGORIES.length
            }
          }
        ],
        totalDistinctCount: 1,
        extraOmittedCount: 0,
        indexedDbStatus: 'available',
        legacyStatus: 'empty',
        skippedCorruptedCount: 0,
        hasAnyWarning: false
      });
    });
    await flushAsync();

    expect(loadSpy).toHaveBeenCalledTimes(2);
    // USER_B NÃO recebe os itens obsoletos de USER_A
    expect(container.textContent).not.toContain('77 lançamentos');
    expect(container.textContent).toContain('Nenhum ponto de recuperação disponível neste navegador.');

    // Logout limpa qualquer sessão
    mockAuthValues.supabaseUserId = null;
    mockAuthValues.isSupabaseAuthenticated = false;
    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    await flushAsync();
    expect(container.textContent).toContain('Nenhum ponto de recuperação disponível neste navegador.');
  });

  it('7. Baixa JSON individual de snapshot do IndexedDB e do legado preservando conteúdo original e trata falha de download com erro claro', async () => {
    const snapStateA = createFixtureState(USER_A, 5, { txCount: 5, reserve: 5500 });
    const savedA = await saveSnapshotToRecoveryHistory(USER_A, snapStateA, 'pre_force_download', {
      indexedDBFactory: idbFactory
    });
    expect(savedA.success).toBe(true);

    const legacyState = createFixtureState(USER_A, 2, { txCount: 2, reserve: 2200 });
    saveRecoverySnapshotForUser(USER_A, legacyState, 'pre_reset_clean');
    const rawLegacy = JSON.parse(window.localStorage.getItem(getUserRecoveryKey(USER_A))!);

    const capturedBlobs: Blob[] = [];
    const downloadedNames: string[] = [];
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlobs.push(blob);
      return `blob:mock-${capturedBlobs.length}`;
    });
    URL.revokeObjectURL = vi.fn();

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedNames.push(this.download);
    });

    try {
      await act(async () => {
        root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
      });
      await flushAsync();

      const rows = Array.from(container.querySelectorAll('[data-testid="recovery-history-item"]'));
      expect(rows).toHaveLength(2);

      // Baixa o snapshot do IndexedDB
      const idbRow = rows.find(r => r.getAttribute('data-snapshot-source') === 'indexeddb')!;
      const idbDownloadBtn = Array.from(idbRow.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Baixar Cópia')
      )!;

      await act(async () => {
        idbDownloadBtn.click();
      });
      await flushAsync();

      expect(downloadedNames[0]).toMatch(/^ponto_recuperacao_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
      expect(downloadedNames[0]).not.toContain(USER_A);

      const idbExportText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(capturedBlobs[0]);
      });
      const parsedIdbExport = JSON.parse(idbExportText);
      expect(parsedIdbExport.snapshotId).toBe(savedA.record!.id);
      expect(parsedIdbExport.ownerUserId).toBe(USER_A);
      expect(parsedIdbExport.reason).toBe('pre_force_download');
      expect(parsedIdbExport.state).toEqual(snapStateA);

      // Baixa o snapshot legado
      const legacyRow = rows.find(
        r => r.getAttribute('data-snapshot-source') === 'legacy_localstorage'
      )!;
      const legacyDownloadBtn = Array.from(legacyRow.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Baixar Cópia')
      )!;

      await act(async () => {
        legacyDownloadBtn.click();
      });
      await flushAsync();

      expect(downloadedNames[1]).toMatch(/^ponto_recuperacao_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
      const legacyExportText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(capturedBlobs[1]);
      });
      expect(JSON.parse(legacyExportText)).toEqual(rawLegacy);

      // Simula falha controlada durante download e verifica mensagem clara de erro
      vi.spyOn(recoveryHistoryService, 'exportHybridRecoverySnapshot').mockResolvedValueOnce({
        success: false,
        error: 'Falha simulada ao ler snapshot para download.'
      });

      await act(async () => {
        idbDownloadBtn.click();
      });
      await flushAsync();

      expect(container.textContent).toContain('Falha simulada ao ler snapshot para download.');
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('8. Exibe aviso amigável quando IndexedDB está indisponível e preserva cópia local compatível ou estado vazio', async () => {
    saveRecoverySnapshotForUser(
      USER_A,
      createFixtureState(USER_A, 3, { txCount: 3 }),
      'pre_local_push'
    );

    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: null }} />);
    });
    await flushAsync();

    expect(container.textContent).toContain(
      'O histórico expandido (IndexedDB) não está disponível neste navegador'
    );
    expect(container.textContent).toContain('Cópia local anterior');
    expect(container.textContent).toContain('3 lançamentos');

    // Sem cópia legada e sem IndexedDB ao reabrir Configurações: exibe aviso + mensagem vazia esperada
    window.localStorage.removeItem(getUserRecoveryKey(USER_A));
    await act(async () => {
      root.unmount();
    });
    root = createRoot(container);
    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: null }} />);
    });
    await flushAsync();

    expect(container.textContent).toContain('Nenhum ponto de recuperação disponível neste navegador.');
  });

  it('9. Trata snapshots corrompidos no IndexedDB e no localStorage legado sem quebrar a tela', async () => {
    await saveSnapshotToRecoveryHistory(
      USER_A,
      createFixtureState(USER_A, 6, { txCount: 6 }),
      'pre_json_import',
      { indexedDBFactory: idbFactory }
    );

    // Injeta registro corrompido no IndexedDB pertencente ao índice de USER_A
    await insertRawRecordIntoIdb(idbFactory, {
      id: 'corrupted-idb-entry',
      ownerUserId: USER_A,
      savedAt: 'invalid-date',
      createdAtMs: Date.now(),
      reason: 'pre_reset_clean',
      version: 1,
      contentSignature: 'bad',
      counts: {},
      state: null
    });

    // Injeta JSON corrompido no localStorage legado
    window.localStorage.setItem(getUserRecoveryKey(USER_A), '{corrompido_sem_fim');

    await act(async () => {
      root.render(<SettingsView recoveryHistoryOptions={{ indexedDBFactory: idbFactory }} />);
    });
    await flushAsync();

    // O registro válido ainda é exibido e os corrompidos são sinalizados e ignorados com segurança
    const rows = Array.from(container.querySelectorAll('[data-testid="recovery-history-item"]'));
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('6 lançamentos');
    expect(container.textContent).toContain('ignorados por segurança');
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
