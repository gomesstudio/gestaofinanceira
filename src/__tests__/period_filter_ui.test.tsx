// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppState, DEFAULT_CATEGORIES, getUserStateFromStorage } from '../utils/storage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const USER_A = '22222222-2222-4222-8222-222222222222';

const {
  activeRemoteState,
  upsertMock,
  limitMock,
  maybeSingleMock,
  getSessionMock,
} = vi.hoisted(() => {
  const userId = '22222222-2222-4222-8222-222222222222';
  const remoteState: AppState = {
    ownerUserId: userId,
    version: 5,
    lastModified: 1795600000000,
    transactions: [
      {
        id: 'tx-oct-exp',
        description: 'Manutenção Outubro',
        amount: 320,
        type: 'expense_variable',
        category: 'Moradia',
        date: '2026-10-14',
        dueDate: '2026-10-14',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid',
      },
      {
        id: 'tx-nov-inc',
        description: 'Consultoria Novembro',
        amount: 1500,
        type: 'income',
        category: 'Freelance',
        date: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid',
      },
      {
        id: 'tx-nov-rent',
        description: 'Aluguel Base',
        amount: 1400,
        type: 'expense_fixed',
        category: 'Moradia',
        date: '2026-11-08',
        dueDate: '2026-11-08',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        status: 'paid',
        isRecurring: true,
      },
      {
        id: 'tx-nov-oneoff',
        description: 'Compra Única Novembro',
        amount: 250,
        type: 'expense_fixed',
        category: 'Educação',
        date: '2026-11-18',
        dueDate: '2026-11-18',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid',
        isRecurring: false,
      },
    ],
    categories: [],
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Corrente Sintética',
        type: 'checking',
        balance: 3000,
        color: '#059669',
      },
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Sintético',
        limitTotal: 5000,
        closingDay: 20,
        dueDay: 27,
        color: '#6366f1',
      },
    ],
    debts: [
      {
        id: 'debt-1',
        name: 'Financiamento Teste',
        creditor: 'Banco Sintético',
        originalAmount: 10000,
        currentBalance: 4000,
        contractDate: '2026-01-10',
        dueDate: '2026-12-10',
        minimumPayment: 400,
        priority: 'medium',
        status: 'in_payment',
        totalPaid: 6000,
        paymentsHistory: [],
      },
    ],
    goals: [],
    recurringIncomes: [
      {
        id: 'rec-sal-1',
        description: 'Salário Mensal Sintético',
        amount: 6000,
        category: 'Salário',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        frequency: 'monthly',
        dayOfMonth: 5,
        startDate: '2026-11-05',
        startPeriod: '2026-11',
        isIndefinite: true,
        isActive: true,
        createdAt: '2026-11-01T00:00:00.000Z',
        updatedAt: '2026-11-01T00:00:00.000Z',
      },
    ],
    safetyReserveDesired: 500,
    isSampleLoaded: false,
  };

  return {
    activeRemoteState: remoteState,
    upsertMock: vi.fn().mockResolvedValue({ data: null, error: null }),
    limitMock: vi.fn().mockResolvedValue({ data: [{ user_id: userId }], error: null }),
    maybeSingleMock: vi.fn().mockResolvedValue({
      data: {
        user_id: userId,
        data: remoteState,
        version: 5,
        client_timestamp: 1795600000000,
        updated_at: '2026-11-25T10:00:00.000Z',
      },
      error: null,
    }),
    getSessionMock: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: userId, email: 'sintetico-ui@exemplo.com' },
        },
      },
      error: null,
    }),
  };
});

activeRemoteState.categories = DEFAULT_CATEGORIES;

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => getSessionMock(...args),
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: limitMock,
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock,
        })),
      })),
      upsert: upsertMock,
    })),
  },
  SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co',
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    updatePassword: vi.fn(),
    supabaseUserId: USER_A,
    supabaseUserEmail: 'sintetico-ui@exemplo.com',
    supabaseUserDisplayName: 'Usuário Sintético UI',
    isSupabaseAuthenticated: true,
    cloudAuthStatus: 'connected',
    signInWithSupabase: vi.fn(),
    loginWithGitHub: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    disconnectCloud: vi.fn(),
    checkSessionStatus: vi.fn(),
  }),
}));

import { FinanceProvider, FinanceContextType, useFinance } from '../context/FinanceContext';
import { Header } from '../components/layout/Header';
import { IncomesView } from '../components/transactions/IncomesView';
import { ExpensesView } from '../components/transactions/ExpensesView';
import { TransactionsView } from '../components/transactions/TransactionsView';
import { AnalyticsView } from '../components/analytics/AnalyticsView';
import { ReportsView } from '../components/reports/ReportsView';
import { FinancialCalendarView } from '../components/calendar/FinancialCalendarView';
import { QuickEntryModal } from '../components/quick-entry/QuickEntryModal';

function installIsolatedStorageMock() {
  let store: Record<string, string> = {};
  const mock = {
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
    key: (idx: number) => Object.keys(store)[idx] ?? null,
    get length() {
      return Object.keys(store).length;
    },
  };
  Object.defineProperty(window, 'localStorage', { value: mock, configurable: true });
}

let ctxRef: FinanceContextType | null = null;
const ContextReader: React.FC = () => {
  ctxRef = useFinance();
  return null;
};

describe('Integração UI do Filtro Global de Períodos e Projeções', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0, 0)); // 2026-11-25
    installIsolatedStorageMock();
    ctxRef = null;
    upsertMock.mockClear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  async function renderAllViews(activeTab = 'transactions') {
    await act(async () => {
      root.render(
        <FinanceProvider>
          <ContextReader />
          <Header currentTab={activeTab} />
          <IncomesView />
          <ExpensesView />
          <TransactionsView />
          <AnalyticsView />
          <ReportsView />
          <FinancialCalendarView />
          <QuickEntryModal />
        </FinanceProvider>
      );
    });
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      vi.advanceTimersByTime(50);
    });
  }

  it('sincroniza listagens, KPIs, gráficos, relatórios, calendário e QuickEntryModal ao alternar períodos sem mutar saldo ou dados persistidos', async () => {
    await renderAllViews();

    expect(ctxRef?.isFinanceHydrated).toBe(true);

    // 1. Estado inicial: Mês Atual (Novembro/2026)
    expect(ctxRef?.selectedYear).toBe(2026);
    expect(ctxRef?.selectedMonth).toBe(10);
    expect(ctxRef?.totalBankBalance).toBe(3000);
    expect(ctxRef?.freeMoneyAvailable).toBe(2100); // 3000 - 400 (dívida min) - 500 (reserva)
    expect(ctxRef?.totalIncomePeriod).toBe(1500);
    expect(ctxRef?.totalExpensePeriod).toBe(1650); // Aluguel 1400 + Compra Única 250
    expect(container.textContent).toContain('Consultoria Novembro');
    expect(container.textContent).not.toContain('Manutenção Outubro');

    const persistedBeforeNav = JSON.stringify(getUserStateFromStorage(USER_A));
    const txCountBeforeNav = ctxRef?.transactions.length;

    // 2. Navegar para Mês Anterior (Outubro/2026)
    await act(async () => {
      ctxRef?.setFilter({ period: 'previous_month' });
    });
    expect(ctxRef?.selectedYear).toBe(2026);
    expect(ctxRef?.selectedMonth).toBe(9);
    expect(ctxRef?.totalExpensePeriod).toBe(320);
    expect(container.textContent).toContain('Manutenção Outubro');
    expect(container.textContent).not.toContain('Consultoria Novembro');
    expect(container.textContent).toContain('Outubro/2026');

    // 3. Navegar para Próximo Mês (Dezembro/2026) -> deve projetar Salário (6000) + Aluguel Base (1400), sem Compra Única Novembro
    await act(async () => {
      ctxRef?.setFilter({ period: 'next_month' });
    });
    expect(ctxRef?.selectedYear).toBe(2026);
    expect(ctxRef?.selectedMonth).toBe(11);
    expect(ctxRef?.isFutureView).toBe(true);
    expect(ctxRef?.totalIncomePeriod).toBe(6000);
    expect(ctxRef?.totalExpensePeriod).toBe(1400);
    expect(ctxRef?.totalBankBalance).toBe(3000); // Saldo real inalterado
    expect(container.textContent).toContain('Salário Mensal Sintético');
    expect(container.textContent).toContain('Aluguel Base');
    expect(container.textContent).not.toContain('Compra Única Novembro');
    expect(container.textContent).toContain('Dezembro/2026');

    // QuickEntryModal deve abrir com data contextual de Dezembro/2026 (2026-12-25) e status 'pending'
    await act(async () => {
      ctxRef?.openQuickEntry('expense');
    });
    const dateInput = container.querySelector('input[name="date"]') as HTMLInputElement | null;
    expect(dateInput?.value).toBe('2026-12-25');
    await act(async () => {
      ctxRef?.closeQuickEntry();
    });

    // 4. Navegar para Próximos 3 Meses (Nov/26, Dez/26, Jan/27) -> virada de ano + agrupamento mensal
    await act(async () => {
      ctxRef?.setFilter({ period: 'next_3_months' });
    });
    expect(ctxRef?.activePeriod?.isMultiMonth).toBe(true);
    expect(ctxRef?.activePeriod?.shortLabel).toBe('Próximos 3M');
    // Nov (1500 + 6000? Em Nov o salário de 05/11 já passou sem confirmação -> occ virtual 6000 é gerada em next_3_months se pendente, ou 6000*3 = 18000 + 1500 = 19500)
    expect(ctxRef?.totalIncomePeriod).toBe(19500);
    // Despesas: Nov (1400+250=1650) + Dez (1400) + Jan (1400) = 4450
    expect(ctxRef?.totalExpensePeriod).toBe(4450);
    expect(container.textContent).toContain('Janeiro/2027');
    expect(container.textContent).toContain('Dezembro/2026');
    expect(container.textContent).toContain('Novembro/2026');

    // Garantia estrita de somente-leitura durante toda a navegação de períodos
    expect(ctxRef?.transactions.length).toBe(txCountBeforeNav);
    expect(JSON.stringify(getUserStateFromStorage(USER_A))).toBe(persistedBeforeNav);
  });

  it('gera parcelas em dia 31 sem overflow de calendário (31/01 -> 28/02 -> 31/03)', async () => {
    await renderAllViews();

    await act(async () => {
      ctxRef?.addTransaction(
        {
          description: 'Notebook Teste',
          amount: 500,
          type: 'expense_variable',
          category: 'Outros',
          date: '2027-01-31',
          dueDate: '2027-01-31',
          paymentMethod: 'credit_card',
          creditCardId: 'card-1',
          status: 'pending',
        },
        3
      );
    });

    const parcels = (ctxRef?.transactions || [])
      .filter((t) => t.description.startsWith('Notebook Teste'))
      .sort((a, b) => a.date.localeCompare(b.date));

    expect(parcels.map((p) => p.date)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
    expect(parcels.map((p) => p.dueDate)).toEqual(['2027-01-31', '2027-02-28', '2027-03-31']);
  });
});
