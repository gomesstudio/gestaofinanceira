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
  saveRecoverySnapshotForUser
} from '../utils/storage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const {
  USER_A,
  activeRemoteState,
  upsertMock,
  limitMock,
  maybeSingleMock,
  getSessionMock
} = vi.hoisted(() => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const remoteState: AppState = {
    ownerUserId: userId,
    version: 12,
    lastModified: 1700001200000,
    transactions: [
      {
        id: 'tx-remote-active',
        description: 'Receita Ativa Integrada',
        amount: 7500,
        type: 'income',
        category: 'Salário',
        date: '2026-11-14',
        accountId: 'acc-active',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: [],
    accounts: [
      {
        id: 'acc-active',
        name: 'Conta Integrada',
        type: 'checking',
        balance: 7500,
        color: '#10b981'
      }
    ],
    creditCards: [
      {
        id: 'card-active',
        name: 'Cartão Integrado',
        color: '#6366f1',
        limitTotal: 5000,
        closingDay: 10,
        dueDay: 17
      }
    ],
    debts: [],
    goals: [],
    safetyReserveDesired: 5000,
    isSampleLoaded: false
  };

  return {
    USER_A: userId,
    activeRemoteState: remoteState,
    upsertMock: vi.fn().mockResolvedValue({ data: null, error: null }),
    limitMock: vi.fn().mockResolvedValue({ data: [{ user_id: userId }], error: null }),
    maybeSingleMock: vi.fn().mockResolvedValue({
      data: {
        user_id: userId,
        data: remoteState,
        version: 12,
        client_timestamp: 1700001200000,
        updated_at: '2026-11-14T18:50:00.000Z'
      },
      error: null
    }),
    getSessionMock: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: userId, email: 'integracao@ficticio.com' }
        }
      },
      error: null
    })
  };
});

activeRemoteState.categories = DEFAULT_CATEGORIES;

function createOlderRecoverySnapshotState(ownerUserId: string): AppState {
  return {
    ownerUserId,
    version: 4,
    lastModified: 1700000400000,
    transactions: [
      {
        id: 'tx-old-1',
        description: 'Antigo 1',
        amount: 1000,
        type: 'income',
        category: 'Salário',
        date: '2026-10-05',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        status: 'paid'
      },
      {
        id: 'tx-old-2',
        description: 'Antigo 2',
        amount: 300,
        type: 'expense_fixed',
        category: 'Energia elétrica',
        date: '2026-10-12',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Snapshot',
        type: 'checking',
        balance: 700,
        color: '#3b82f6'
      }
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Snapshot',
        color: '#6366f1',
        limitTotal: 2500,
        closingDay: 20,
        dueDay: 27
      }
    ],
    debts: [
      {
        id: 'debt-old-1',
        name: 'Dívida Snapshot',
        creditor: 'Credor Fictício',
        originalAmount: 1500,
        currentBalance: 800,
        contractDate: '2026-01-01',
        dueDate: '2026-12-01',
        priority: 'high',
        status: 'in_payment',
        totalPaid: 700
      }
    ],
    goals: [
      {
        id: 'goal-old-1',
        name: 'Objetivo Snapshot',
        targetAmount: 8000,
        currentAmount: 1200,
        deadlineDate: '2027-06-30',
        monthlyPlannedContribution: 350,
        category: 'Segurança',
        color: '#10b981'
      }
    ],
    safetyReserveDesired: 1200,
    isSampleLoaded: false
  };
}

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => getSessionMock(...args)
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: limitMock,
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock
        }))
      })),
      upsert: upsertMock
    }))
  },
  SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    updatePassword: vi.fn(),
    supabaseUserId: USER_A,
    supabaseUserEmail: 'integracao@ficticio.com',
    supabaseUserDisplayName: 'Integração Fictícia',
    isSupabaseAuthenticated: true,
    cloudAuthStatus: 'connected',
    signInWithSupabase: vi.fn(),
    loginWithGitHub: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    disconnectCloud: vi.fn(),
    checkSessionStatus: vi.fn()
  })
}));

import { FinanceProvider } from '../context/FinanceContext';
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

async function flushMicrotasks(rounds = 6) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe('Teste de Integração UI (Isolado): FinanceProvider + SettingsView — Ponto de Recuperação Local', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    installIsolatedStorageMock();
    window.matchMedia = window.matchMedia || (((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn()
    })) as any);

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

  it('Hidrata FinanceProvider real com dados simulados, exibe/detalha/baixa snapshot sem alterar estado ativo nem gravar no Supabase', async () => {
    const snapState = createOlderRecoverySnapshotState(USER_A);
    expect(saveRecoverySnapshotForUser(USER_A, snapState, 'pre_reset_clean')).toBe(true);
    const rawSnapshotBefore = window.localStorage.getItem(getUserRecoveryKey(USER_A))!;

    let capturedBlob: Blob | null = null;
    let downloadedFilename = '';
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;

    URL.createObjectURL = vi.fn((blob: Blob) => {
      capturedBlob = blob;
      return 'blob:mock-integration-url';
    });
    URL.revokeObjectURL = vi.fn();

    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      downloadedFilename = this.download;
    });

    try {
      await act(async () => {
        root.render(
          <FinanceProvider>
            <SettingsView />
          </FinanceProvider>
        );
      });

      await flushMicrotasks(8);

      // Card exibe corretamente dados do snapshot prévio mesmo com estado ativo mais recente hidratado
      expect(container.textContent).toContain('Histórico de Recuperação');
      expect(container.textContent).toContain('Antes de zerar os dados da conta');
      expect(container.textContent).toContain('2 lançamentos');
      expect(container.textContent).toContain('1 dívidas');
      expect(container.textContent).toContain('1 objetivos');

      // Abre modal de detalhes
      const detailsBtn = Array.from(container.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Visualizar Detalhes')
      )!;
      expect(detailsBtn).toBeDefined();

      await act(async () => {
        detailsBtn.click();
      });

      const dialog = container.querySelector('[role="dialog"][aria-labelledby="recovery-details-modal-title"]');
      expect(dialog).not.toBeNull();
      expect(dialog!.textContent).toContain('v4');
      expect(dialog!.textContent).toContain('Antes de zerar os dados da conta');

      // Baixa cópia diretamente pelo botão do modal
      const downloadInsideModalBtn = Array.from(dialog!.querySelectorAll('button')).find(b =>
        b.textContent?.includes('Baixar Cópia')
      )!;
      expect(downloadInsideModalBtn).toBeDefined();

      await act(async () => {
        downloadInsideModalBtn.click();
      });
      await flushMicrotasks();

      expect(downloadedFilename).toMatch(/^ponto_recuperacao_\d{4}-\d{2}-\d{2}_\d{2}-\d{2}-\d{2}\.json$/);
      expect(capturedBlob).not.toBeNull();

      const exportedText = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(capturedBlob!);
      });
      expect(JSON.parse(exportedText)).toEqual(JSON.parse(rawSnapshotBefore));

      // Estado financeiro ativo hidratado no FinanceProvider permanece intocado (v12, reserva 5000, 1 lançamento)
      const persistedActive = getUserStateFromStorage(USER_A);
      expect(persistedActive?.version).toBe(12);
      expect(persistedActive?.safetyReserveDesired).toBe(5000);
      expect(persistedActive?.transactions).toHaveLength(1);
      expect(persistedActive?.transactions[0].id).toBe('tx-remote-active');

      // Snapshot original preservado intacto e ZERO gravações no Supabase
      expect(window.localStorage.getItem(getUserRecoveryKey(USER_A))).toBe(rawSnapshotBefore);
      expect(upsertMock).not.toHaveBeenCalled();
    } finally {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
    }
  });
});
