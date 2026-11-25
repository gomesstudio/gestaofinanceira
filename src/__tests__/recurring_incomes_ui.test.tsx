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

const USER_A = '11111111-1111-4111-8111-111111111111';

const {
  activeRemoteState,
  upsertMock,
  limitMock,
  maybeSingleMock,
  getSessionMock
} = vi.hoisted(() => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const remoteState: AppState = {
    ownerUserId: userId,
    version: 3,
    lastModified: 1795600000000,
    transactions: [
      {
        id: 'tx-initial-paid',
        description: 'Freela Recebido',
        amount: 1000,
        type: 'income',
        category: 'Freelance',
        date: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: [],
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Principal',
        type: 'checking',
        balance: 2500,
        color: '#059669'
      }
    ],
    creditCards: [],
    debts: [],
    goals: [],
    recurringIncomes: [],
    safetyReserveDesired: 1000,
    isSampleLoaded: false
  };

  return {
    activeRemoteState: remoteState,
    upsertMock: vi.fn().mockResolvedValue({ data: null, error: null }),
    limitMock: vi.fn().mockResolvedValue({ data: [{ user_id: userId }], error: null }),
    maybeSingleMock: vi.fn().mockResolvedValue({
      data: {
        user_id: userId,
        data: remoteState,
        version: 3,
        client_timestamp: 1795600000000,
        updated_at: '2026-11-25T10:00:00.000Z'
      },
      error: null
    }),
    getSessionMock: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: userId, email: 'teste-sintetico@exemplo.com' }
        }
      },
      error: null
    })
  };
});

activeRemoteState.categories = DEFAULT_CATEGORIES;

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
    supabaseUserEmail: 'teste-sintetico@exemplo.com',
    supabaseUserDisplayName: 'Usuário Sintético',
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

import { FinanceProvider, FinanceContextType, useFinance } from '../context/FinanceContext';
import { QuickEntryModal } from '../components/quick-entry/QuickEntryModal';
import { IncomesView } from '../components/transactions/IncomesView';
import { FinancialCalendarView } from '../components/calendar/FinancialCalendarView';
import { FutureProjectionCard } from '../components/dashboard/FutureProjectionCard';

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

describe('Receitas Fixas Recorrentes — Integração UI, Contexto, Projeções e Acessibilidade', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 25, 12, 0, 0)); // 2026-11-25 local
    installIsolatedStorageMock();
    activeRemoteState.recurringIncomes = [];
    activeRemoteState.transactions = [
      {
        id: 'tx-initial-paid',
        description: 'Freela Recebido',
        amount: 1000,
        type: 'income',
        category: 'Freelance',
        date: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ];
    activeRemoteState.accounts = [
      {
        id: 'acc-1',
        name: 'Conta Principal',
        type: 'checking',
        balance: 2500,
        color: '#059669'
      }
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

  it('Cenário 12 & 15: QuickEntryModal cria receita fixa, projeções futuras incluem a renda sem inflar saldo/dinheiro livre atuais, e IncomesView + Calendário refletem tudo', async () => {
    let ctxRef: FinanceContextType | null = null;

    const Harness: React.FC = () => {
      ctxRef = useFinance();
      return (
        <div>
          <QuickEntryModal />
          <FutureProjectionCard />
          <IncomesView />
          <FinancialCalendarView />
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

    expect(ctxRef).not.toBeNull();
    expect(ctxRef!.isFinanceHydrated).toBe(true);
    expect(ctxRef!.totalBankBalance).toBe(2500);
    expect(ctxRef!.totalIncomePeriod).toBe(1000);
    expect(ctxRef!.freeMoneyAvailable).toBe(1500);

    // 1. Abrir QuickEntryModal na aba Entrada e ativar "Receita fixa mensal"
    await act(async () => {
      ctxRef!.openQuickEntry('income');
    });

    const amountInput = container.querySelector('input[name="amount"]') as HTMLInputElement;
    const descInput = container.querySelector('input[name="description"]') as HTMLInputElement;
    const recurringToggle = container.querySelector(
      'input[name="is_recurring_income"]'
    ) as HTMLInputElement;

    expect(amountInput).toBeTruthy();
    expect(descInput).toBeTruthy();
    expect(recurringToggle).toBeTruthy();
    expect(recurringToggle.checked).toBe(false);

    await act(async () => {
      setInputValue(amountInput, '6000,00');
      setInputValue(descInput, 'Salário Mensal Pro');
      clickCheckbox(recurringToggle, true);
    });

    // Verifica campos de recorrência e IDs/names únicos
    const startInput = container.querySelector(
      'input[name="recurring_start_date"]'
    ) as HTMLInputElement;
    const dayInput = container.querySelector(
      'input[name="recurring_day_of_month"]'
    ) as HTMLInputElement;
    expect(startInput).toBeTruthy();
    expect(dayInput).toBeTruthy();

    await act(async () => {
      setInputValue(startInput, '2026-11-20');
      setInputValue(dayInput, '20');
    });

    // Todos os campos do formulário devem possuir id ou name válidos e IDs únicos
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

    // Projeção anual de 12 x 6.000 = R$ 72.000,00 visível no modal
    expect(container.textContent).toContain('Projeção anual (12 meses)');
    expect(container.textContent).toContain('72.000,00');

    // Submete o cadastro da receita fixa mensal
    const modalForm = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      modalForm.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushMicrotasks();

    // Regra salva no estado e persistida no storage do usuário
    expect(ctxRef!.recurringIncomes).toHaveLength(1);
    expect(ctxRef!.recurringIncomes[0].description).toBe('Salário Mensal Pro');
    const savedLocal = getUserStateFromStorage(USER_A);
    expect(savedLocal?.recurringIncomes).toHaveLength(1);

    // INTEGRIDADE FINANCEIRA CRÍTICA:
    // Ocorrência de 20/11 (atrasada, pois hoje é 25/11) e futuros meses NÃO inflam saldo atual nem dinheiro livre!
    expect(ctxRef!.totalBankBalance).toBe(2500);
    expect(ctxRef!.totalIncomePeriod).toBe(1000);
    expect(ctxRef!.freeMoneyAvailable).toBe(1500);

    // Projeções futuras (6 meses e 12 meses) passam a incluir R$ 6.000/mês automaticamente
    expect(ctxRef!.nextMonthsProjections[0].totalIncomeProjected).toBe(6000);
    expect(ctxRef!.next12MonthsProjections[11].totalIncomeProjected).toBe(6000);
    expect(container.textContent).toContain('6.000,00');

    // IncomesView exibe a regra em "Receitas Fixas Recorrentes" e a ocorrência atrasada como "Prevista em atraso"
    expect(container.textContent).toContain('Receitas Fixas Recorrentes');
    expect(container.textContent).toContain('Ocorrências Recorrentes de Novembro/2026');
    expect(container.textContent).toContain('Prevista em atraso');

    // Calendário mostra a ocorrência no dia 20/11 sem duplicar
    expect(container.textContent).toContain('Salário Mensal Pro');

    // 2. Confirmar recebimento da ocorrência de Novembro com valor ajustado R$ 6.150,00
    const confirmBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar recebimento')
    );
    expect(confirmBtn).toBeTruthy();

    await act(async () => {
      confirmBtn!.click();
    });

    const confirmAmountInput = container.querySelector(
      'input[name="confirm_amount"]'
    ) as HTMLInputElement;
    const confirmDateInput = container.querySelector(
      'input[name="confirm_date"]'
    ) as HTMLInputElement;
    expect(confirmAmountInput).toBeTruthy();
    expect(confirmDateInput).toBeTruthy();

    await act(async () => {
      setInputValue(confirmAmountInput, '6150,00');
      setInputValue(confirmDateInput, '2026-11-25');
    });

    const confirmSubmitBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar Recebimento na Conta')
    ) as HTMLButtonElement;
    expect(confirmSubmitBtn).toBeTruthy();

    await act(async () => {
      const form = confirmSubmitBtn.closest('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushMicrotasks();

    // Saldo atual sobe exatamente +6150 (2500 -> 8650) e receitas recebidas do mês sobem para 7150 (1000 + 6150)
    expect(ctxRef!.totalBankBalance).toBe(8650);
    expect(ctxRef!.totalIncomePeriod).toBe(7150);
    expect(ctxRef!.freeMoneyAvailable).toBe(7650);
    expect(ctxRef!.transactions.filter((t) => t.recurringPeriod === '2026-11')).toHaveLength(1);
    expect(container.textContent).toContain('Recebida');

    // 3. Navegar para mês futuro (Dezembro/2026) e testar "Pular mês" + "Restaurar previsão"
    await act(async () => {
      ctxRef!.selectSpecificMonth(2026, 11);
    });
    expect(ctxRef!.selectedMonthRecurringIncomes).toHaveLength(1);
    expect(ctxRef!.selectedMonthRecurringIncomes[0].status).toBe('predicted');

    const skipBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Pular mês')
    );
    expect(skipBtn).toBeTruthy();

    await act(async () => {
      skipBtn!.click();
    });
    expect(ctxRef!.selectedMonthRecurringIncomes[0].status).toBe('skipped');
    expect(ctxRef!.nextMonthsProjections[0].totalIncomeProjected).toBe(0);

    const restoreBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Restaurar previsão')
    );
    expect(restoreBtn).toBeTruthy();

    await act(async () => {
      restoreBtn!.click();
    });
    expect(ctxRef!.selectedMonthRecurringIncomes[0].status).toBe('predicted');
    expect(ctxRef!.nextMonthsProjections[0].totalIncomeProjected).toBe(6000);

    // 4. Testar edição futura com confirmação explícita no modal e encerramento preservando histórico
    const editRuleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Editar recorrência')
    );
    expect(editRuleBtn).toBeTruthy();
    await act(async () => {
      editRuleBtn!.click();
    });

    const editAmountInput = container.querySelector(
      'input[name="rec_edit_amount"]'
    ) as HTMLInputElement;
    const confirmFutureCheckbox = container.querySelector(
      'input[name="rec_confirm_future"]'
    ) as HTMLInputElement;
    expect(editAmountInput).toBeTruthy();
    expect(confirmFutureCheckbox).toBeTruthy();

    await act(async () => {
      setInputValue(editAmountInput, '6500,00');
      clickCheckbox(confirmFutureCheckbox, true);
    });

    const saveFutureBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Salvar Alterações para Este e Próximos Meses')
    ) as HTMLButtonElement;
    expect(saveFutureBtn.disabled).toBe(false);

    await act(async () => {
      const form = saveFutureBtn.closest('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushMicrotasks();

    // Dezembro em diante agora projeta R$ 6.500,00 enquanto Novembro já recebido permanece 6.150,00
    expect(ctxRef!.nextMonthsProjections[0].totalIncomeProjected).toBe(6500);
    expect(ctxRef!.totalBankBalance).toBe(8650);

    // 5. Encerrar recorrência a partir de Dezembro/2026 mantendo histórico de Novembro
    const endRuleBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Encerrar recorrência')
    );
    expect(endRuleBtn).toBeTruthy();
    await act(async () => {
      endRuleBtn!.click();
    });

    const confirmEndBtn = Array.from(container.querySelectorAll('button')).find((b) =>
      b.textContent?.includes('Confirmar Encerramento')
    ) as HTMLButtonElement;
    expect(confirmEndBtn).toBeTruthy();

    await act(async () => {
      const form = confirmEndBtn.closest('form') as HTMLFormElement;
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushMicrotasks();

    expect(ctxRef!.recurringIncomes[0].isActive).toBe(false);
    expect(ctxRef!.nextMonthsProjections[0].totalIncomeProjected).toBe(0);
    expect(ctxRef!.totalBankBalance).toBe(8650);
    expect(ctxRef!.transactions.filter((t) => t.status === 'paid')).toHaveLength(2);
  });
});
