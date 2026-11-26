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

const USER_A = '33333333-3333-4333-8333-333333333333';

const {
  activeRemoteState,
  upsertMock,
  limitMock,
  maybeSingleMock,
  getSessionMock,
} = vi.hoisted(() => {
  const userId = '33333333-3333-4333-8333-333333333333';
  const remoteState: AppState = {
    ownerUserId: userId,
    version: 4,
    schemaVersion: 2,
    lastModified: 1795600000000,
    transactions: [
      {
        id: 'tx-fixed-nonrec',
        description: 'Condomínio Avulso Nov',
        amount: 400,
        type: 'expense_fixed',
        category: 'Moradia',
        date: '2026-11-10',
        dueDate: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'bank_slip',
        status: 'paid',
        isRecurring: false,
      },
    ],
    categories: [],
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Principal',
        type: 'checking',
        balance: 4000,
        color: '#059669',
      },
    ],
    creditCards: [
      {
        id: 'card-1',
        name: 'Cartão Principal',
        limitTotal: 5000,
        closingDay: 20,
        dueDay: 28,
        color: '#6366f1',
      },
    ],
    debts: [],
    goals: [],
    recurringIncomes: [
      {
        id: 'rec-inc-sal',
        description: 'Salário Base',
        amount: 2500,
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
    recurringExpenses: [],
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
        version: 4,
        client_timestamp: 1795600000000,
        updated_at: '2026-11-25T10:00:00.000Z',
      },
      error: null,
    }),
    getSessionMock: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: userId, email: 'despesas-ui@exemplo.com' },
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
    supabaseUserEmail: 'despesas-ui@exemplo.com',
    supabaseUserDisplayName: 'Usuário Despesas UI',
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
import { QuickEntryModal } from '../components/quick-entry/QuickEntryModal';
import { ExpensesView } from '../components/transactions/ExpensesView';
import { TransactionsView } from '../components/transactions/TransactionsView';
import { FinancialCalendarView } from '../components/calendar/FinancialCalendarView';
import { DashboardView } from '../components/dashboard/DashboardView';
import { GoalsView } from '../components/goals/GoalsView';
import { PowerOfPurchaseView } from '../components/power-of-purchase/PowerOfPurchaseView';

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
      },
      key: (idx: number) => Object.keys(store)[idx] ?? null,
      get length() {
        return Object.keys(store).length;
      },
    },
    configurable: true,
  });
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setInputValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickCheckbox(el: HTMLInputElement, checked: boolean) {
  const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'checked');
  descriptor?.set?.call(el, checked);
  el.dispatchEvent(new Event('click', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Despesas Fixas Recorrentes & Filtro Global — Integração UI Completa', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0, 0)); // 2026-11-25
    installIsolatedStorageMock();
    activeRemoteState.recurringExpenses = [];
    activeRemoteState.transactions = [
      {
        id: 'tx-fixed-nonrec',
        description: 'Condomínio Avulso Nov',
        amount: 400,
        type: 'expense_fixed',
        category: 'Moradia',
        date: '2026-11-10',
        dueDate: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'bank_slip',
        status: 'paid',
        isRecurring: false,
      },
    ];
    activeRemoteState.accounts = [
      {
        id: 'acc-1',
        name: 'Conta Principal',
        type: 'checking',
        balance: 4000,
        color: '#059669',
      },
    ];
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
    vi.clearAllMocks();
  });

  it('QuickEntryModal mantém toggle recorrente desligado por padrão, cria despesa fixa recorrente sem alterar saldo pendente, reflete em todas as views e confirma pagamento sem duplicar', async () => {
    const ctxBox: { current: FinanceContextType | null } = { current: null };

    const Harness: React.FC = () => {
      ctxBox.current = useFinance();
      return (
        <div>
          <QuickEntryModal />
          <ExpensesView />
          <TransactionsView />
          <FinancialCalendarView />
          <DashboardView setCurrentTab={() => {}} />
          <GoalsView />
          <PowerOfPurchaseView />
        </div>
      );
    };

    await act(async () => {
      root.render(
        <FinanceProvider>
          <Harness />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    expect(ctxBox.current?.isFinanceHydrated).toBe(true);
    expect(ctxBox.current?.totalBankBalance).toBe(4000);
    expect(ctxBox.current?.freeMoneyAvailable).toBe(3500); // 4000 - 500 reserva

    // 1. Abrir QuickEntryModal em Despesa: toggle recorrente deve vir DESLIGADO por padrão
    await act(async () => {
      ctxBox.current!.openQuickEntry('expense');
    });

    const recurringToggle = container.querySelector(
      'input[name="is_recurring_expense"]'
    ) as HTMLInputElement;
    expect(recurringToggle).toBeTruthy();
    expect(recurringToggle.checked).toBe(false);

    // Submeter uma despesa fixa comum (sem marcar recorrente) -> isRecurring deve ser false e NÃO repetir em Dezembro
    const amountInput = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const descInput = container.querySelector('input[name="description"]') as HTMLInputElement;
    const formEl = container.querySelector('form') as HTMLFormElement;

    await act(async () => {
      setInputValue(amountInput, '150,00');
      setInputValue(descInput, 'Taxa Pontual Teste');
    });
    await act(async () => {
      formEl.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      ctxBox.current!.closeQuickEntry();
    });
    await flushMicrotasks(2);

    const createdOneOff = ctxBox.current?.transactions.find(t => t.description === 'Taxa Pontual Teste');
    expect(createdOneOff).toBeDefined();
    expect(createdOneOff?.isRecurring).toBe(false);
    expect(ctxBox.current?.totalBankBalance).toBe(3850); // 4000 - 150

    // 2. Reabrir QuickEntryModal e criar uma Despesa Fixa Mensal Recorrente (Aluguel 800, pendente no dia 28/11)
    await act(async () => {
      ctxBox.current!.openQuickEntry('expense');
    });

    const amountInput2 = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const descInput2 = container.querySelector('input[name="description"]') as HTMLInputElement;
    const toggle2 = container.querySelector('input[name="is_recurring_expense"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(amountInput2, '800,00');
      setInputValue(descInput2, 'Aluguel Mensal UI');
      clickCheckbox(toggle2, true);
    });

    const startInput = container.querySelector('input[name="recurring_exp_start_date"]') as HTMLInputElement;
    const dayInput = container.querySelector('input[name="recurring_exp_day_of_month"]') as HTMLInputElement;
    const firstStatusSelect = container.querySelector('select[name="recurring_exp_first_status"]') as HTMLSelectElement;

    expect(startInput).toBeTruthy();
    expect(dayInput).toBeTruthy();
    expect(firstStatusSelect).toBeTruthy();

    await act(async () => {
      setInputValue(startInput, '2026-11-28');
      setInputValue(dayInput, '28');
    });

    // Verifica que todos os inputs/selects/textareas no DOM têm id ou name e IDs únicos
    const formFields = Array.from(container.querySelectorAll('input, select, textarea'));
    const seenIds = new Set<string>();
    for (const field of formFields) {
      const id = field.getAttribute('id');
      const name = field.getAttribute('name');
      expect(Boolean(id || name)).toBe(true);
      if (id) {
        expect(seenIds.has(id)).toBe(false);
        seenIds.add(id);
      }
    }

    // Projeção anual 12 x 800 = 9.600,00 visível no modal
    expect(container.textContent).toContain('Comprometimento anual estimado (12 meses)');
    expect(container.textContent).toContain('9.600,00');

    const formEl2 = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      formEl2.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await act(async () => {
      ctxBox.current!.closeQuickEntry();
    });
    await flushMicrotasks(2);

    expect(ctxBox.current?.recurringExpenses).toHaveLength(1);
    // Ainda pendente: saldo bancário real intacto (3850), porém freeMoneyAvailable já desconta 800 previstos (3850 - 800 - 500 = 2550)
    expect(ctxBox.current?.totalBankBalance).toBe(3850);
    expect(ctxBox.current?.freeMoneyAvailable).toBe(2550);
    expect(ctxBox.current?.predictedExpenseCurrentMonth).toBe(800);
    expect(container.textContent).toContain('Aluguel Mensal UI');

    // 3. Conversão voluntária de 'Condomínio Avulso Nov' para recorrente mensal (via context/ExpensesView)
    await act(async () => {
      ctxBox.current!.convertTransactionToRecurringExpense({
        transactionId: 'tx-fixed-nonrec',
        dayOfMonth: 10,
        isIndefinite: true,
      });
    });
    expect(ctxBox.current?.recurringExpenses).toHaveLength(2);
    expect(ctxBox.current?.totalBankBalance).toBe(3850); // Nunca altera saldo

    // 4. Navegar para Próximo Mês (Dezembro/2026): deve projetar Aluguel (800) + Condomínio (400) = 1200, SEM 'Taxa Pontual Teste'
    const persistedBeforeNav = JSON.stringify(getUserStateFromStorage(USER_A));
    const txCountBeforeNav = ctxBox.current?.transactions.length;

    await act(async () => {
      ctxBox.current!.setFilter({ period: 'next_month' });
    });
    expect(ctxBox.current?.isFutureView).toBe(true);
    expect(ctxBox.current?.totalIncomePeriod).toBe(2500);
    expect(ctxBox.current?.totalExpensePeriod).toBe(1200);
    expect(container.textContent).toContain('Aluguel Mensal UI');
    expect(container.textContent).toContain('Condomínio Avulso Nov');
    // Taxa Pontual Teste aparece apenas se estiver no mês de Novembro; em filteredTransactions de Dezembro ela não existe
    expect(ctxBox.current?.filteredTransactions.some(t => t.description === 'Taxa Pontual Teste')).toBe(false);

    // Navegação foi estritamente somente-leitura
    expect(ctxBox.current?.transactions.length).toBe(txCountBeforeNav);
    expect(JSON.stringify(getUserStateFromStorage(USER_A))).toBe(persistedBeforeNav);

    // 5. Voltar ao mês atual e confirmar pagamento do Aluguel Mensal UI via ExpensesView button
    await act(async () => {
      ctxBox.current!.setFilter({ period: 'current_month' });
    });

    const confirmBtn = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Confirmar pagamento')
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn!.click();
    });

    const confirmAmountEl = container.querySelector(
      'input[name="confirm_expense_amount"]'
    ) as HTMLInputElement;
    expect(confirmAmountEl).toBeTruthy();
    const confirmForm = confirmAmountEl.closest('form') as HTMLFormElement;
    expect(confirmForm).toBeTruthy();
    await act(async () => {
      confirmForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushMicrotasks(2);

    // Saldo real agora debitado de 3850 - 800 = 3050, sem duplicar lançamento no mês
    expect(ctxBox.current?.totalBankBalance).toBe(3050);
    expect(ctxBox.current?.predictedExpenseCurrentMonth).toBe(0);
    expect(
      ctxBox.current?.transactions.filter(
        t => t.description === 'Aluguel Mensal UI' && t.recurringPeriod === '2026-11'
      )
    ).toHaveLength(1);
  });
});
