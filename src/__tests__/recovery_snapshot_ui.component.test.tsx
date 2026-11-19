// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppState,
  DEFAULT_CATEGORIES,
  getUserRecoveryKey,
  getUserStateFromStorage,
  saveRecoverySnapshotForUser,
  saveStateToStorageForUser
} from '../utils/storage';

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

const mockAuthValues = {
  logout: vi.fn(),
  updatePassword: vi.fn(),
  supabaseUserId: USER_A,
  supabaseUserEmail: 'usuario.ficticio@exemplo.com',
  supabaseUserDisplayName: 'Usuário Fictício',
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

function createActiveFixtureState(ownerUserId: string): AppState {
  return {
    ownerUserId,
    version: 10,
    lastModified: 1700000900000,
    transactions: [
      {
        id: 'tx-active-1',
        description: 'Receita Ativa Atual',
        amount: 6200,
        type: 'income',
        category: 'Salário',
        date: '2026-11-14',
        accountId: 'acc-active-1',
        paymentMethod: 'bank_transfer',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-active-1',
        name: 'Conta Corrente Ativa',
        type: 'checking',
        balance: 6200,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'card-active-1',
        name: 'Cartão Ativo',
        color: '#6366f1',
        limitTotal: 5000,
        closingDay: 15,
        dueDay: 22
      }
    ],
    debts: [],
    goals: [],
    safetyReserveDesired: 3000,
    isSampleLoaded: false
  };
}

function createSnapshotFixtureState(ownerUserId: string): AppState {
  return {
    ownerUserId,
    version: 8,
    lastModified: 1700000800000,
    transactions: [
      {
        id: 'tx-snap-1',
        description: 'Salário Snapshot',
        amount: 5000,
        type: 'income',
        category: 'Salário',
        date: '2026-11-05',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        status: 'paid'
      },
      {
        id: 'tx-snap-2',
        description: 'Aluguel Snapshot',
        amount: 1500,
        type: 'expense_fixed',
        category: 'Aluguel / Habitação',
        date: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      },
      {
        id: 'tx-snap-3',
        description: 'Mercado Snapshot',
        amount: 350,
        type: 'expense_variable',
        category: 'Supermercado',
        date: '2026-11-11',
        creditCardId: 'card-1',
        paymentMethod: 'credit_card',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Snapshot 1',
        type: 'checking',
        balance: 3500,
        color: '#3b82f6'
      },
      {
        id: 'acc-2',
        name: 'Reserva Snapshot 2',
        type: 'savings',
        balance: 4000,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Snapshot',
        color: '#6366f1',
        limitTotal: 4000,
        closingDay: 20,
        dueDay: 27
      }
    ],
    debts: [
      {
        id: 'debt-1',
        name: 'Empréstimo Snapshot',
        creditor: 'Banco Fictício',
        originalAmount: 2000,
        currentBalance: 1000,
        contractDate: '2026-01-10',
        dueDate: '2026-12-10',
        priority: 'medium',
        status: 'in_payment',
        totalPaid: 1000
      }
    ],
    goals: [
      {
        id: 'goal-1',
        name: 'Objetivo Snapshot',
        targetAmount: 10000,
        currentAmount: 4000,
        deadlineDate: '2027-12-31',
        monthlyPlannedContribution: 500,
        category: 'Segurança',
        color: '#10b981'
      }
    ],
    safetyReserveDesired: 2000,
    isSampleLoaded: false
  };
}

let activeFixtureState = createActiveFixtureState(USER_A);

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

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const buttons = Array.from(container.querySelectorAll('button'));
  const found = buttons.find(btn => btn.textContent?.includes(text));
  if (!found) {
    throw new Error(`Botão "${text}" não encontrado no DOM.`);
  }
  return found;
}

async function flushMicrotasks(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('Teste de Componente UI (Isolado): SettingsView — Ponto de Recuperação Local', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    installIsolatedStorageMock();
    activeFixtureState = createActiveFixtureState(USER_A);
    mockAuthValues.supabaseUserId = USER_A;
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

  it('1 e 2. Exibe data, motivo e contagens do snapshot válido e abre/fecha modal "Visualizar Detalhes" sem botão de restaurar', async () => {
    const snapState = createSnapshotFixtureState(USER_A);
    expect(saveRecoverySnapshotForUser(USER_A, snapState, 'pre_json_import')).toBe(true);
    const stored = JSON.parse(window.localStorage.getItem(getUserRecoveryKey(USER_A))!);
    const expectedFormattedDate = new Date(stored.savedAt).toLocaleString('pt-BR');

    await act(async () => {
      root.render(<SettingsView />);
    });
    await flushMicrotasks();

    const pageText = container.textContent || '';
    expect(pageText).toContain('Histórico de Recuperação');
    expect(pageText).toContain(expectedFormattedDate);
    expect(pageText).toContain('Antes de restaurar backup JSON');
    expect(pageText).toContain('3 lançamentos');
    expect(pageText).toContain('2 contas');
    expect(pageText).toContain('1 cartões');
    expect(pageText).toContain('1 dívidas');
    expect(pageText).toContain('1 objetivos');

    // Privacidade: descrições internas sensíveis do snapshot não devem vazar na UI
    expect(pageText).not.toContain('Salário Snapshot');
    expect(pageText).not.toContain('Empréstimo Snapshot');

    // Clica em "Visualizar Detalhes"
    const detailsBtn = findButtonByText(container, 'Visualizar Detalhes');
    await act(async () => {
      detailsBtn.click();
    });

    const dialog = container.querySelector('[role="dialog"][aria-labelledby="recovery-details-modal-title"]');
    expect(dialog).not.toBeNull();
    const dialogText = dialog!.textContent || '';
    expect(dialogText).toContain('Detalhes do Ponto de Recuperação');
    expect(dialogText).toContain(expectedFormattedDate);
    expect(dialogText).toContain('v8');
    expect(dialogText).toContain('Antes de restaurar backup JSON');
    expect(dialogText).toContain('Lançamentos3');
    expect(dialogText).toContain('Contas2');
    expect(dialogText).toContain('Cartões1');
    expect(dialogText).toContain('Dívidas1');
    expect(dialogText).toContain('Objetivos1');
    expect(dialogText).toContain(`Categorias${DEFAULT_CATEGORIES.length}`);

    // Garante que NÃO existe botão de restauração dentro do modal de recuperação (P1 somente leitura)
    const modalButtons = Array.from(dialog!.querySelectorAll('button')).map(b => b.textContent || '');
    expect(modalButtons.some(label => /restaurar/i.test(label))).toBe(false);

    // Fecha o modal
    const closeBtn = findButtonByText(dialog as HTMLElement, 'Fechar');
    await act(async () => {
      closeBtn.click();
    });
    expect(container.querySelector('[role="dialog"][aria-labelledby="recovery-details-modal-title"]')).toBeNull();
  });

  it('3, 4 e 5. Botão "Baixar Cópia" exporta JSON válido preservando snapshot original sem alterar estado nem gravar no Supabase', async () => {
    const snapState = createSnapshotFixtureState(USER_A);
    saveRecoverySnapshotForUser(USER_A, snapState, 'pre_force_download');
    saveStateToStorageForUser(USER_A, activeFixtureState);

    const rawSnapshotBefore = window.localStorage.getItem(getUserRecoveryKey(USER_A))!;
    const activeStateBefore = getUserStateFromStorage(USER_A);

    let capturedBlob: Blob | null = null;
    let downloadedFilename = '';
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-recovery-url';
    });
    URL.revokeObjectURL = vi.fn();

    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
    });

    try {
      await act(async () => {
        root.render(<SettingsView />);
      });
      await flushMicrotasks();

      const downloadBtn = findButtonByText(container, 'Baixar Cópia');
      await act(async () => {
        downloadBtn.click();
      });
      await flushMicrotasks();

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(anchorClickSpy).toHaveBeenCalledTimes(1);
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-recovery-url');

      // Nome do arquivo deve identificar recuperação + data/hora e NÃO conter UUID completo ou e-mail
      expect(downloadedFilename).toMatch(/^ponto_recuperacao_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
      expect(downloadedFilename).not.toContain(USER_A);
      expect(downloadedFilename).not.toContain('usuario.ficticio');

      // Lê Blob real gerado pelo botão e valida conteúdo JSON original
      expect(capturedBlob).not.toBeNull();
      const exportedText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(capturedBlob!);
      });
      const parsedExport = JSON.parse(exportedText);
      expect(parsedExport).toEqual(JSON.parse(rawSnapshotBefore));

      // Feedback visual exibido
      expect(container.textContent).toContain('Cópia do ponto de recuperação baixada em JSON sem alterar seus dados atuais.');

      // Snapshot original e estado financeiro ativo preservados sem alterações
      expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBe(rawSnapshotBefore);
      expect(getUserStateFromStorage(USER_A)).toEqual(activeStateBefore);

      // Nenhuma mutação de contexto nem chamadas de gravação ao Supabase
      expect(financeSpies.applyConfirmedBackupRestore).not.toHaveBeenCalled();
      expect(financeSpies.resetAllData).not.toHaveBeenCalled();
      expect(financeSpies.loadSampleData).not.toHaveBeenCalled();
      expect(financeSpies.forceUploadLocalToCloud).not.toHaveBeenCalled();
      expect(financeSpies.forceDownloadFromCloud).not.toHaveBeenCalled();
      expect(fromMock).not.toHaveBeenCalled();
      expect(upsertMock).not.toHaveBeenCalled();
      expect(getSessionMock).not.toHaveBeenCalled();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });

  it('6. Trata corretamente ausência de snapshot, snapshot de outro usuário e JSON corrompido na interface sem travar', async () => {
    // Caso A: Snapshot salvo apenas na chave de outro usuário (USER_B)
    saveRecoverySnapshotForUser(USER_B, createSnapshotFixtureState(USER_B), 'pre_reset_clean');

    await act(async () => {
      root.render(<SettingsView />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Nenhum ponto de recuperação disponível neste navegador');
    expect(container.textContent).not.toContain('Visualizar Detalhes');
    expect(container.textContent).not.toContain('Baixar Cópia');

    // Caso B: Snapshot de USER_B gravado indevidamente dentro da chave de USER_A
    const rawB = window.localStorage.getItem(getUserRecoveryKey(USER_B))!;
    window.localStorage.setItem(getUserRecoveryKey(USER_A), rawB);

    await act(async () => {
      root.render(<SettingsView />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Nenhum ponto de recuperação disponível neste navegador');
    expect(container.textContent).not.toContain('Visualizar Detalhes');
    expect(container.textContent).not.toContain('Baixar Cópia');

    // Caso C: Snapshot corrompido na chave de USER_A não trava o componente
    window.localStorage.setItem(getUserRecoveryKey(USER_A), '{json_corrompido_sem_fim');

    await act(async () => {
      root.render(<SettingsView />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Histórico de Recuperação');
    expect(container.textContent).toContain('Nenhum ponto de recuperação disponível neste navegador');
    expect(container.textContent).not.toContain('Visualizar Detalhes');
    expect(container.textContent).not.toContain('Baixar Cópia');
    expect(upsertMock).not.toHaveBeenCalled();
  });
});
