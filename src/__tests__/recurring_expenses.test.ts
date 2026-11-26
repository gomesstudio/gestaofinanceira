/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  addRecurringExpenseRuleToState,
  calculateRecurringExpenseAnnualTotal,
  confirmRecurringExpensePaymentInState,
  convertTransactionToRecurringExpenseInState,
  deleteRecurringExpenseRuleInState,
  endRecurringExpenseInState,
  getRecurringExpensesForMonth,
  skipRecurringExpenseOccurrenceInState,
  unskipRecurringExpenseOccurrenceInState,
  updateRecurringExpenseInState,
} from '../utils/recurringExpense';
import {
  buildProjectedTransactionsForMonth,
  computeFilteredTransactions,
  isVirtualTransaction,
  resolveActivePeriod,
} from '../utils/periodFilter';
import { addMonthsToPeriod } from '../utils/recurringIncome';
import { AppState, DEFAULT_CATEGORIES, createCleanUserState } from '../utils/storage';
import { RecurringExpenseRule, RecurringIncomeRule, Transaction } from '../types/finance';
import { validateBackupJsonStructure } from '../utils/backupSecurity';
import { detectStaleClientSchemaRisk } from '../services/supabaseSyncService';

const TODAY_ISO = '2026-11-25';

function makeBaseState(overrides: Partial<AppState> = {}): AppState {
  const base = createCleanUserState('11111111-1111-4111-8111-111111111111');
  return {
    ...base,
    categories: DEFAULT_CATEGORIES,
    accounts: [
      { id: 'acc-1', name: 'Conta Principal', type: 'checking', balance: 5000, color: '#059669' },
      { id: 'acc-2', name: 'Conta Reserva', type: 'savings', balance: 2000, color: '#3b82f6' },
    ],
    creditCards: [
      { id: 'card-1', name: 'Cartão Black', limitTotal: 10000, closingDay: 20, dueDay: 28, color: '#6366f1' },
    ],
    ...overrides,
  };
}

function makeIncomeRule(overrides: Partial<RecurringIncomeRule> = {}): RecurringIncomeRule {
  return {
    id: overrides.id ?? 'rec-inc-1',
    description: overrides.description ?? 'Salário',
    amount: overrides.amount ?? 2500,
    category: overrides.category ?? 'Salário',
    accountId: overrides.accountId ?? 'acc-1',
    paymentMethod: overrides.paymentMethod ?? 'bank_transfer',
    frequency: 'monthly',
    dayOfMonth: overrides.dayOfMonth ?? 5,
    startDate: overrides.startDate ?? '2026-11-05',
    startPeriod: overrides.startPeriod ?? '2026-11',
    isIndefinite: overrides.isIndefinite ?? true,
    isActive: overrides.isActive ?? true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

function makeExpenseRule(overrides: Partial<RecurringExpenseRule> = {}): RecurringExpenseRule {
  return {
    id: overrides.id ?? 'rec-exp-1',
    description: overrides.description ?? 'Aluguel',
    amount: overrides.amount ?? 800,
    category: overrides.category ?? 'Moradia',
    accountId: overrides.accountId ?? 'acc-1',
    paymentMethod: overrides.paymentMethod ?? 'bank_transfer',
    frequency: 'monthly',
    dayOfMonth: overrides.dayOfMonth ?? 10,
    startDate: overrides.startDate ?? '2026-11-10',
    startPeriod: overrides.startPeriod ?? '2026-11',
    isIndefinite: overrides.isIndefinite ?? true,
    isActive: overrides.isActive ?? true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('Motor de Despesas Fixas Recorrentes & Projeções Orçamentárias', () => {
  it('1. Cenário Orçamentário Completo (Seção 8): Salário 2500, Fixas 1120, Empréstimo 480x3, Mercado 350 não repete', () => {
    const recurringIncomes: RecurringIncomeRule[] = [
      makeIncomeRule({ id: 'inc-sal', description: 'Salário', amount: 2500, startDate: '2026-11-05', startPeriod: '2026-11' }),
    ];
    const recurringExpenses: RecurringExpenseRule[] = [
      makeExpenseRule({ id: 'exp-rent', description: 'Aluguel', amount: 800, dayOfMonth: 10 }),
      makeExpenseRule({ id: 'exp-net', description: 'Internet', amount: 120, dayOfMonth: 15 }),
      makeExpenseRule({ id: 'exp-pow', description: 'Energia', amount: 200, dayOfMonth: 20 }),
    ];
    const transactions: Transaction[] = [
      {
        id: 'tx-mercado',
        description: 'Mercado',
        amount: 350,
        type: 'expense_variable',
        category: 'Alimentação',
        date: '2026-11-12',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid',
        isRecurring: false,
      },
      {
        id: 'tx-fixa-avulsa',
        description: 'Taxa Única de Condomínio Extra',
        amount: 180,
        type: 'expense_fixed',
        category: 'Moradia',
        date: '2026-11-18',
        dueDate: '2026-11-18',
        accountId: 'acc-1',
        paymentMethod: 'bank_slip',
        status: 'paid',
        isRecurring: false,
      },
    ];

    // Mês futuro 1..3 (Dez/26, Jan/27, Fev/27): Empréstimo 1440 com parcela 480/mês
    let debtBalance = 1440;
    const minPayment = 480;
    const monthlyResults: { period: string; income: number; fixed: number; debt: number; owed: number; net: number }[] = [];

    for (let i = 1; i <= 6; i++) {
      const targetPeriod = addMonthsToPeriod('2026-11', i);
      const [yStr, mStr] = targetPeriod.split('-');
      const projected = buildProjectedTransactionsForMonth({
        targetYear: Number(yStr),
        targetMonth: Number(mStr) - 1,
        transactions,
        recurringIncomes,
        recurringExpenses,
        todayISO: TODAY_ISO,
      });

      const income = projected.filter((t) => t.type === 'income').reduce((s, t) => s + t.amount, 0);
      const fixed = projected.filter((t) => t.type === 'expense_fixed').reduce((s, t) => s + t.amount, 0);
      const debt = debtBalance > 0 ? Math.min(debtBalance, minPayment) : 0;
      debtBalance = Math.max(0, debtBalance - debt);
      const owed = fixed + debt;

      // Mercado e Taxa Única (isRecurring: false) nunca se repetem nos meses futuros
      expect(projected.some((p) => p.description === 'Mercado')).toBe(false);
      expect(projected.some((p) => p.description === 'Taxa Única de Condomínio Extra')).toBe(false);

      monthlyResults.push({
        period: targetPeriod,
        income,
        fixed,
        debt,
        owed,
        net: income - owed,
      });
    }

    // Meses 1..3 (Dez/26, Jan/27, Fev/27): Renda 2500, Fixas 1120 + Dívida 480 = 1600 -> Sobra 900
    for (const m of monthlyResults.slice(0, 3)) {
      expect(m.income).toBe(2500);
      expect(m.fixed).toBe(1120);
      expect(m.debt).toBe(480);
      expect(m.owed).toBe(1600);
      expect(m.net).toBe(900);
    }

    // Meses 4..6 (Mar/27+): Empréstimo quitado! Fixas 1120 + Dívida 0 -> Sobra 1380
    for (const m of monthlyResults.slice(3)) {
      expect(m.income).toBe(2500);
      expect(m.fixed).toBe(1120);
      expect(m.debt).toBe(0);
      expect(m.owed).toBe(1120);
      expect(m.net).toBe(1380);
    }
  });

  it('2. Respeita clamping de dia 31 em meses curtos (fev normal/bissexto e abril) e cálculo anual', () => {
    const rule = makeExpenseRule({
      id: 'exp-day31',
      description: 'Seguro Auto',
      amount: 300,
      dayOfMonth: 31,
      startDate: '2027-01-31',
      startPeriod: '2027-01',
    });

    const feb2027 = getRecurringExpensesForMonth([rule], 2027, 1, [], TODAY_ISO);
    expect(feb2027).toHaveLength(1);
    expect(feb2027[0].date).toBe('2027-02-28');

    const feb2028 = getRecurringExpensesForMonth([rule], 2028, 1, [], TODAY_ISO);
    expect(feb2028[0].date).toBe('2028-02-29');

    const apr2027 = getRecurringExpensesForMonth([rule], 2027, 3, [], TODAY_ISO);
    expect(apr2027[0].date).toBe('2027-04-30');

    const may2027 = getRecurringExpensesForMonth([rule], 2027, 4, [], TODAY_ISO);
    expect(may2027[0].date).toBe('2027-05-31');

    expect(calculateRecurringExpenseAnnualTotal(rule, '2027-01')).toBe(3600);
  });

  it('3. Regra com início futuro nunca marca como paga automaticamente nem altera saldo; confirmação ajusta valor e debita apenas fora do cartão', () => {
    const base = makeBaseState();

    // Regra iniciando no futuro com firstOccurrenceStatus='paid' deve ser bloqueada para não pagar futuro
    const futureRes = addRecurringExpenseRuleToState(
      base,
      {
        description: 'Plano de Saúde Futuro',
        amount: 600,
        category: 'Saúde',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 10,
        startDate: '2026-12-10',
        isIndefinite: true,
        firstOccurrenceStatus: 'paid',
      },
      TODAY_ISO
    );
    expect(futureRes.initialTransaction).toBeUndefined();
    expect(futureRes.state.transactions).toHaveLength(0);
    expect(futureRes.state.accounts[0].balance).toBe(5000);

    // Regra via cartão de crédito: confirmar pagamento NÃO debita conta bancária e grava cardInvoiceMonth
    const cardRuleRes = addRecurringExpenseRuleToState(
      futureRes.state,
      {
        description: 'Streaming Plus',
        amount: 55,
        category: 'Lazer',
        creditCardId: 'card-1',
        paymentMethod: 'credit_card',
        dayOfMonth: 28,
        startDate: '2026-11-28',
        isIndefinite: true,
        firstOccurrenceStatus: 'pending',
      },
      TODAY_ISO
    );
    const confirmedCard = confirmRecurringExpensePaymentInState(cardRuleRes.state, {
      ruleId: cardRuleRes.rule.id,
      period: '2026-11',
      actualAmount: 59.9,
      actualDate: '2026-11-28',
      paymentMethod: 'credit_card',
      creditCardId: 'card-1',
    });
    expect(confirmedCard.transaction?.status).toBe('paid');
    expect(confirmedCard.transaction?.cardInvoiceMonth).toBe('2026-11');
    expect(confirmedCard.transaction?.accountId).toBeUndefined();
    expect(confirmedCard.state.accounts[0].balance).toBe(5000);

    // Confirmar pagamento bancário de uma ocorrência futura em Dec/2026 com valor ajustado debita conta
    const confirmedBank = confirmRecurringExpensePaymentInState(confirmedCard.state, {
      ruleId: futureRes.rule.id,
      period: '2026-12',
      actualAmount: 650,
      actualDate: '2026-12-11',
      paymentMethod: 'pix',
      accountId: 'acc-1',
    });
    expect(confirmedBank.transaction?.amount).toBe(650);
    expect(confirmedBank.state.accounts[0].balance).toBe(4350);

    // Confirmar novamente o mesmo período atualiza em vez de duplicar
    const reconfirmed = confirmRecurringExpensePaymentInState(confirmedBank.state, {
      ruleId: futureRes.rule.id,
      period: '2026-12',
      actualAmount: 620,
      actualDate: '2026-12-11',
      paymentMethod: 'pix',
      accountId: 'acc-1',
    });
    expect(
      reconfirmed.state.transactions.filter(
        (t) => t.recurringExpenseId === futureRes.rule.id && t.recurringPeriod === '2026-12'
      )
    ).toHaveLength(1);
    expect(reconfirmed.state.accounts[0].balance).toBe(4380);
  });

  it('4. Edição pontual (single) vs futuras (future), pular/restaurar mês, encerrar recorrência e excluir regra preservando histórico pago', () => {
    let state = makeBaseState();
    const added = addRecurringExpenseRuleToState(
      state,
      {
        description: 'Internet Fibra',
        amount: 120,
        category: 'Moradia',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        dayOfMonth: 10,
        startDate: '2026-11-10',
        isIndefinite: true,
        firstOccurrenceStatus: 'paid',
      },
      TODAY_ISO
    );
    state = added.state;
    const ruleId = added.rule.id;
    expect(state.accounts[0].balance).toBe(4880);

    // Edição pontual em 2026-12 (apenas dezembro)
    state = updateRecurringExpenseInState(state, {
      ruleId,
      targetPeriod: '2026-12',
      scope: 'single',
      updates: { amount: 150 },
    });
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2026, 11, state.transactions, TODAY_ISO)[0].amount).toBe(150);
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2027, 0, state.transactions, TODAY_ISO)[0].amount).toBe(120);

    // Edição futura a partir de 2027-01 preserva 2026-11 pago e 2026-12 override
    state = updateRecurringExpenseInState(state, {
      ruleId,
      targetPeriod: '2027-01',
      scope: 'future',
      updates: {
        amount: 140,
        description: 'Internet Fibra Pro',
      },
    });
    expect(state.transactions[0].amount).toBe(120);
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2026, 11, state.transactions, TODAY_ISO)[0].amount).toBe(150);
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2027, 0, state.transactions, TODAY_ISO)[0].amount).toBe(140);
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2027, 1, state.transactions, TODAY_ISO)[0].description).toBe('Internet Fibra Pro');

    // Pular e restaurar 2027-02
    state = skipRecurringExpenseOccurrenceInState(state, ruleId, '2027-02');
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2027, 1, state.transactions, TODAY_ISO)).toHaveLength(0);
    state = unskipRecurringExpenseOccurrenceInState(state, ruleId, '2027-02');
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2027, 1, state.transactions, TODAY_ISO)).toHaveLength(1);

    // Encerrar a partir de 2027-03 preserva até 2027-02 e histórico pago de 2026-11
    state = endRecurringExpenseInState(state, ruleId, '2027-03');
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2027, 1, state.transactions, TODAY_ISO)).toHaveLength(1);
    expect(getRecurringExpensesForMonth(state.recurringExpenses, 2027, 2, state.transactions, TODAY_ISO)).toHaveLength(0);

    // Excluir regra desvincula metadata mas mantém histórico pago de Nov/2026 intacto
    state = deleteRecurringExpenseRuleInState(state, ruleId);
    expect(state.recurringExpenses).toHaveLength(0);
    expect(state.transactions).toHaveLength(1);
    expect(state.transactions[0].recurringExpenseId).toBeUndefined();
    expect(state.transactions[0].isRecurring).toBe(false);
    expect(state.accounts[0].balance).toBe(4880);
  });

  it('5. Conversão voluntária de expense_fixed vincula lançamento original sem duplicar mês atual nem alterar saldo, e rejeita parcelas/faturas', () => {
    const fixedTx: Transaction = {
      id: 'tx-condo',
      description: 'Condomínio',
      amount: 450,
      type: 'expense_fixed',
      category: 'Moradia',
      date: '2026-11-10',
      dueDate: '2026-11-10',
      accountId: 'acc-1',
      paymentMethod: 'bank_slip',
      status: 'paid',
      isRecurring: false,
    };
    const installmentTx: Transaction = {
      id: 'tx-inst',
      description: 'Notebook (1/10)',
      amount: 300,
      type: 'expense_fixed',
      category: 'Outros',
      date: '2026-11-15',
      accountId: 'acc-1',
      paymentMethod: 'credit_card',
      creditCardId: 'card-1',
      status: 'paid',
      installmentInfo: { current: 1, total: 10, groupId: 'grp-1' },
    };

    const state = makeBaseState({ transactions: [fixedTx, installmentTx] });

    // Rejeita parcela
    const rejected = convertTransactionToRecurringExpenseInState(state, {
      transactionId: installmentTx.id,
      dayOfMonth: 15,
      isIndefinite: true,
    });
    expect(rejected.rule).toBeUndefined();
    expect(rejected.state.recurringExpenses).toHaveLength(0);

    // Aceita despesa fixa comum sem duplicar nem alterar saldo
    const converted = convertTransactionToRecurringExpenseInState(state, {
      transactionId: fixedTx.id,
      dayOfMonth: 10,
      isIndefinite: true,
    });
    expect(converted.rule).toBeDefined();
    expect(converted.state.accounts[0].balance).toBe(5000);
    expect(converted.state.transactions).toHaveLength(2);

    const novOccs = getRecurringExpensesForMonth(
      converted.state.recurringExpenses,
      2026,
      10,
      converted.state.transactions,
      TODAY_ISO
    );
    expect(novOccs).toHaveLength(1);
    expect(novOccs[0].isVirtual).toBe(false);
    expect(novOccs[0].status).toBe('paid');

    const decOccs = getRecurringExpensesForMonth(
      converted.state.recurringExpenses,
      2026,
      11,
      converted.state.transactions,
      TODAY_ISO
    );
    expect(decOccs).toHaveLength(1);
    expect(decOccs[0].isVirtual).toBe(true);
    expect(decOccs[0].amount).toBe(450);
  });

  it('6. Compatibilidade legada (isRecurring: true sem regra), não-duplicação em filteredTransactions e proteção de backup/schema antigo', () => {
    const legacyFixed: Transaction = {
      id: 'tx-legacy-rent',
      description: 'Aluguel Legado',
      amount: 1400,
      type: 'expense_fixed',
      category: 'Moradia',
      date: '2026-11-08',
      dueDate: '2026-11-08',
      accountId: 'acc-1',
      paymentMethod: 'bank_transfer',
      status: 'paid',
      isRecurring: true,
    };

    // No mês atual: computeFilteredTransactions mantém comportamento sem projeções virtuais
    const activeCurrent = resolveActivePeriod({ period: 'current_month' }, TODAY_ISO);
    const currentList = computeFilteredTransactions({
      transactions: [legacyFixed],
      recurringIncomes: [],
      recurringExpenses: [],
      activePeriod: activeCurrent,
      todayISO: TODAY_ISO,
    });
    expect(currentList).toHaveLength(1);
    expect(isVirtualTransaction(currentList[0])).toBe(false);

    // No próximo mês: projeta legado apenas uma vez
    const activeNext = resolveActivePeriod({ period: 'next_month' }, TODAY_ISO);
    const nextList = computeFilteredTransactions({
      transactions: [legacyFixed],
      recurringIncomes: [],
      recurringExpenses: [],
      activePeriod: activeNext,
      todayISO: TODAY_ISO,
    });
    expect(nextList).toHaveLength(1);
    expect(isVirtualTransaction(nextList[0])).toBe(true);
    expect(nextList[0].id).toContain('rec-exp-legacy:');

    // Validação de backup aceita estado sem recurringExpenses (retrocompatibilidade) e rejeita recurringExpenses malformado
    const legacyStatePayload = makeBaseState({
      transactions: [legacyFixed],
    });
    delete (legacyStatePayload as Partial<AppState>).recurringExpenses;
    const validLegacyBackup = JSON.stringify(legacyStatePayload);
    expect(
      validateBackupJsonStructure(validLegacyBackup, '11111111-1111-4111-8111-111111111111').valid
    ).toBe(true);

    const invalidRuleBackup = JSON.stringify({
      ...makeBaseState(),
      recurringExpenses: [{ id: 'bad', amount: -50 }],
    });
    expect(
      validateBackupJsonStructure(invalidRuleBackup, '11111111-1111-4111-8111-111111111111').valid
    ).toBe(false);

    // Proteção contra cliente desatualizado sobrescrevendo nuvem com recurringExpenses
    const localOldClient = makeBaseState({ schemaVersion: 1, recurringExpenses: [] });
    const remoteNewClient = makeBaseState({
      schemaVersion: 2,
      recurringExpenses: [makeExpenseRule()],
    });
    expect(detectStaleClientSchemaRisk(localOldClient, remoteNewClient)).toBe(true);
  });
});
