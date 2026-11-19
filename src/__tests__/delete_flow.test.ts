/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AppState, DEFAULT_CATEGORIES } from '../utils/storage';
import {
  applyAuthenticatedMutation,
  removeAccountFromState,
  removeCreditCardFromState,
  removeDebtFromState,
  removeGoalFromState,
  removeTransactionFromState
} from '../context/FinanceContext';
import { saveFinanceDataToSupabase } from '../services/supabaseSyncService';
import { supabase } from '../utils/supabase';

const upsertMock = vi.fn().mockResolvedValue({ data: null, error: null });

vi.mock('../utils/supabase', () => {
  return {
    supabase: {
      auth: {
        getSession: vi.fn()
      },
      from: vi.fn(() => ({
        upsert: upsertMock
      }))
    },
    SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
  };
});

const USER_ID = '11111111-1111-4111-8111-111111111111';
const OTHER_USER_ID = '22222222-2222-4222-8222-222222222222';

function createFixtureState(): AppState {
  return {
    ownerUserId: USER_ID,
    version: 3,
    lastModified: 1700000000000,
    transactions: [
      {
        id: 'tx-inc-paid',
        description: 'Salário Recebido',
        amount: 3500,
        type: 'income',
        category: 'Salário',
        date: '2026-11-05',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        status: 'paid'
      },
      {
        id: 'tx-inc-pending',
        description: 'Freelance Previsto',
        amount: 800,
        type: 'income',
        category: 'Trabalhos por fora',
        date: '2026-11-18',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'pending'
      },
      {
        id: 'tx-exp-paid',
        description: 'Aluguel',
        amount: 1200,
        type: 'expense_fixed',
        category: 'Aluguel / Habitação',
        date: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      },
      {
        id: 'tx-exp-card',
        description: 'Supermercado Cartão',
        amount: 450,
        type: 'expense_variable',
        category: 'Supermercado',
        date: '2026-11-11',
        accountId: 'acc-1',
        creditCardId: 'card-1',
        paymentMethod: 'credit_card',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      { id: 'acc-1', name: 'Conta Principal', type: 'checking', balance: 5000, color: '#3b82f6' },
      { id: 'acc-2', name: 'Reserva', type: 'savings', balance: 2000, color: '#10b981' }
    ],
    creditCards: [
      { id: 'card-1', name: 'Cartão A', color: '#820ad1', limitTotal: 4000, closingDay: 20, dueDay: 27 },
      { id: 'card-2', name: 'Cartão B', color: '#ec7000', limitTotal: 2500, closingDay: 5, dueDay: 12 }
    ],
    debts: [
      {
        id: 'debt-1',
        name: 'Empréstimo A',
        creditor: 'Banco X',
        originalAmount: 5000,
        currentBalance: 3000,
        contractDate: '2026-01-01',
        dueDate: '2026-12-01',
        interestRateMonthly: 1.5,
        minimumPayment: 300,
        priority: 'high',
        status: 'in_payment',
        totalPaid: 2000,
        paymentsHistory: []
      },
      {
        id: 'debt-2',
        name: 'Parcela B',
        creditor: 'Banco Y',
        originalAmount: 1000,
        currentBalance: 500,
        contractDate: '2026-02-01',
        dueDate: '2026-12-15',
        interestRateMonthly: 0,
        minimumPayment: 100,
        priority: 'low',
        status: 'in_payment',
        totalPaid: 500,
        paymentsHistory: []
      }
    ],
    goals: [
      {
        id: 'goal-1',
        name: 'Reserva',
        targetAmount: 10000,
        currentAmount: 2000,
        deadlineDate: '2027-12-31',
        monthlyPlannedContribution: 500,
        category: 'Segurança',
        color: '#10b981',
        icon: 'Shield'
      },
      {
        id: 'goal-2',
        name: 'Viagem',
        targetAmount: 4000,
        currentAmount: 1000,
        deadlineDate: '2027-06-01',
        monthlyPlannedContribution: 300,
        category: 'Lazer',
        color: '#f59e0b',
        icon: 'Plane'
      }
    ],
    safetyReserveDesired: 1000,
    isSampleLoaded: false
  };
}

describe('Fluxo de Exclusão Isolada e Sincronização Supabase', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('Exclui apenas a entrada paga selecionada, reverte o saldo da conta vinculada e preserva demais lançamentos', () => {
    const initial = createFixtureState();
    const { nextState, removed } = removeTransactionFromState(initial, 'tx-inc-paid');

    expect(removed?.id).toBe('tx-inc-paid');
    expect(nextState.transactions).toHaveLength(3);
    expect(nextState.transactions.map(t => t.id)).toEqual(['tx-inc-pending', 'tx-exp-paid', 'tx-exp-card']);
    // 5000 - 3500 = 1500
    expect(nextState.accounts.find(a => a.id === 'acc-1')?.balance).toBe(1500);
    expect(nextState.accounts.find(a => a.id === 'acc-2')?.balance).toBe(2000);
  });

  it('Exclui entrada pendente sem alterar saldo bancário', () => {
    const initial = createFixtureState();
    const { nextState, removed } = removeTransactionFromState(initial, 'tx-inc-pending');

    expect(removed?.id).toBe('tx-inc-pending');
    expect(nextState.transactions).toHaveLength(3);
    expect(nextState.accounts.find(a => a.id === 'acc-1')?.balance).toBe(5000);
  });

  it('Exclui despesa paga em conta corrente (estornando saldo) e despesa no cartão (sem alterar saldo bancário)', () => {
    const initial = createFixtureState();
    const afterPaidExp = removeTransactionFromState(initial, 'tx-exp-paid');
    expect(afterPaidExp.removed?.id).toBe('tx-exp-paid');
    expect(afterPaidExp.nextState.accounts.find(a => a.id === 'acc-1')?.balance).toBe(6200);

    const afterCardExp = removeTransactionFromState(afterPaidExp.nextState, 'tx-exp-card');
    expect(afterCardExp.removed?.id).toBe('tx-exp-card');
    expect(afterCardExp.nextState.accounts.find(a => a.id === 'acc-1')?.balance).toBe(6200);
    expect(afterCardExp.nextState.transactions.map(t => t.id)).toEqual(['tx-inc-paid', 'tx-inc-pending']);
  });

  it('Retorna estado intacto e removed = null quando o ID informado não existe', () => {
    const initial = createFixtureState();
    const res = removeTransactionFromState(initial, 'id-inexistente');
    expect(res.removed).toBeNull();
    expect(res.nextState).toBe(initial);
  });

  it('Exclui dívida, cartão, conta e objetivo individualmente sem afetar os demais registros', () => {
    const initial = createFixtureState();

    const d = removeDebtFromState(initial, 'debt-1');
    expect(d.removed?.id).toBe('debt-1');
    expect(d.nextState.debts.map(x => x.id)).toEqual(['debt-2']);

    const c = removeCreditCardFromState(initial, 'card-1');
    expect(c.removed?.id).toBe('card-1');
    expect(c.nextState.creditCards.map(x => x.id)).toEqual(['card-2']);

    const a = removeAccountFromState(initial, 'acc-2');
    expect(a.removed?.id).toBe('acc-2');
    expect(a.nextState.accounts.map(x => x.id)).toEqual(['acc-1']);

    const g = removeGoalFromState(initial, 'goal-1');
    expect(g.removed?.id).toBe('goal-1');
    expect(g.nextState.goals.map(x => x.id)).toEqual(['goal-2']);
  });

  it('Sincroniza a exclusão com o Supabase apenas para o usuário autenticado proprietário', async () => {
    const initial = createFixtureState();
    const mutated = applyAuthenticatedMutation(initial, USER_ID, true, prev => removeTransactionFromState(prev, 'tx-inc-paid').nextState);

    expect(mutated.ownerUserId).toBe(USER_ID);
    expect(mutated.version).toBe(initial.version + 1);
    expect((mutated.lastModified || 0) >= (initial.lastModified || 0)).toBe(true);
    expect(mutated.transactions.some(t => t.id === 'tx-inc-paid')).toBe(false);

    vi.mocked(supabase.auth.getSession).mockResolvedValueOnce({
      data: { session: { user: { id: USER_ID } } as any },
      error: null
    });

    const syncRes = await saveFinanceDataToSupabase(mutated, USER_ID);
    expect(syncRes.success).toBe(true);
    expect(upsertMock).toHaveBeenCalledTimes(1);

    // Tentativa cruzada para outro userId deve ser bloqueada antes de atingir o Supabase
    const crossRes = await saveFinanceDataToSupabase(mutated, OTHER_USER_ID);
    expect(crossRes.success).toBe(false);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });
});
