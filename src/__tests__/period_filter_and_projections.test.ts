/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, it, expect } from 'vitest';
import {
  buildPeriodString,
  buildProjectedTransactionsForMonth,
  computeFilteredTransactions,
  getExplicitRecurringFixedExpenseTemplates,
  getRecurringIncomesForActivePeriod,
  getTransactionEffectiveDate,
  getTransactionEffectivePeriod,
  groupTransactionsByMonth,
  isVirtualTransaction,
  resolveActivePeriod,
} from '../utils/periodFilter';
import { addMonthsToPeriod, resolveClampedDateForPeriod } from '../utils/recurringIncome';
import { RecurringIncomeRule, Transaction } from '../types/finance';

const TODAY_ISO = '2026-11-25';

function makeTx(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: overrides.id ?? 'tx-1',
    description: overrides.description ?? 'Lançamento Teste',
    amount: overrides.amount ?? 100,
    type: overrides.type ?? 'expense_variable',
    category: overrides.category ?? 'Outros',
    date: overrides.date ?? '2026-11-10',
    paymentMethod: overrides.paymentMethod ?? 'pix',
    status: overrides.status ?? 'paid',
    ...overrides,
  };
}

function makeRecurringRule(overrides: Partial<RecurringIncomeRule> = {}): RecurringIncomeRule {
  return {
    id: overrides.id ?? 'rec-rule-1',
    description: overrides.description ?? 'Salário Sintético',
    amount: overrides.amount ?? 5000,
    category: overrides.category ?? 'Salário',
    accountId: overrides.accountId ?? 'acc-1',
    paymentMethod: overrides.paymentMethod ?? 'bank_transfer',
    frequency: 'monthly',
    dayOfMonth: overrides.dayOfMonth ?? 5,
    startDate: overrides.startDate ?? '2026-11-05',
    startPeriod: overrides.startPeriod ?? '2026-11',
    isIndefinite: overrides.isIndefinite ?? true,
    endDate: overrides.endDate,
    endPeriod: overrides.endPeriod,
    deactivatedFromPeriod: overrides.deactivatedFromPeriod,
    isActive: overrides.isActive ?? true,
    createdAt: '2026-11-01T00:00:00.000Z',
    updatedAt: '2026-11-01T00:00:00.000Z',
    overrides: overrides.overrides,
    schedules: overrides.schedules,
  };
}

describe('Motor Central de Períodos e Projeções (periodFilter.ts)', () => {
  it('1. Resolve corretamente virada de ano (Dez -> Jan) e calendário sem drift de fuso horário', () => {
    expect(addMonthsToPeriod('2026-11', 2)).toBe('2027-01');
    expect(addMonthsToPeriod('2026-12', 1)).toBe('2027-01');
    expect(addMonthsToPeriod('2027-01', -1)).toBe('2026-12');

    // Clamping de dia 31 para fevereiro comum, fevereiro bissexto e abril
    expect(resolveClampedDateForPeriod('2027-02', 31)).toBe('2027-02-28');
    expect(resolveClampedDateForPeriod('2028-02', 31)).toBe('2028-02-29');
    expect(resolveClampedDateForPeriod('2027-04', 31)).toBe('2027-04-30');
    expect(resolveClampedDateForPeriod('2027-05', 31)).toBe('2027-05-31');

    const decToday = '2026-12-15';
    const nextFromDec = resolveActivePeriod({ period: 'next_month' }, decToday);
    expect(nextFromDec.selectedPeriod).toBe('2027-01');
    expect(nextFromDec.selectedYear).toBe(2027);
    expect(nextFromDec.selectedMonth).toBe(0);
    expect(nextFromDec.isFutureView).toBe(true);

    const next3FromNov = resolveActivePeriod({ period: 'next_3_months' }, TODAY_ISO);
    expect(next3FromNov.months.map((m) => m.period)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(next3FromNov.isMultiMonth).toBe(true);
    expect(next3FromNov.includesFuture).toBe(true);
  });

  it('2. Preserva integridade do mês atual: não injeta projeções virtuais não recebidas em filteredTransactions', () => {
    const transactions: Transaction[] = [
      makeTx({ id: 'tx-nov-paid', description: 'Freela', type: 'income', amount: 1200, date: '2026-11-10', status: 'paid' }),
      makeTx({ id: 'tx-nov-exp', description: 'Mercado', type: 'expense_variable', amount: 300, date: '2026-11-12', status: 'paid' }),
    ];
    const rules = [makeRecurringRule({ startDate: '2026-11-28', startPeriod: '2026-11', dayOfMonth: 28 })];

    const activeCurrent = resolveActivePeriod({ period: 'current_month' }, TODAY_ISO);
    const filtered = computeFilteredTransactions({
      transactions,
      recurringIncomes: rules,
      activePeriod: activeCurrent,
      todayISO: TODAY_ISO,
    });

    expect(filtered.map((t) => t.id)).toEqual(['tx-nov-paid', 'tx-nov-exp']);
    expect(filtered.some((t) => isVirtualTransaction(t))).toBe(false);
  });

  it('3. Em mês passado (Anterior / specific_month passado), exibe apenas transações reais daquele mês sem projeções', () => {
    const transactions: Transaction[] = [
      makeTx({ id: 'tx-oct-1', description: 'Conta Outubro', type: 'expense_fixed', amount: 450, date: '2026-10-10', isRecurring: true }),
      makeTx({ id: 'tx-nov-1', description: 'Aluguel', type: 'expense_fixed', amount: 1800, date: '2026-11-05', isRecurring: true }),
    ];
    const rules = [makeRecurringRule({ startDate: '2026-09-05', startPeriod: '2026-09' })];

    const activePrev = resolveActivePeriod({ period: 'previous_month' }, TODAY_ISO);
    expect(activePrev.selectedPeriod).toBe('2026-10');
    expect(activePrev.isPastView).toBe(true);

    const filtered = computeFilteredTransactions({
      transactions,
      recurringIncomes: rules,
      activePeriod: activePrev,
      todayISO: TODAY_ISO,
    });

    expect(filtered.map((t) => t.id)).toEqual(['tx-oct-1']);
  });

  it('4. Em Próximo Mês e Próximos 3M/6M, gera projeções virtuais consistentes sem duplicar lançamentos reais nem alterar o array original', () => {
    const originalTxs: Transaction[] = [
      makeTx({
        id: 'tx-sal-nov',
        description: 'Salário Sintético',
        type: 'income',
        amount: 5000,
        date: '2026-11-05',
        status: 'paid',
        isRecurring: true,
        recurringIncomeId: 'rec-rule-1',
        recurringPeriod: '2026-11',
      }),
      // Despesa fixa explicitamente recorrente
      makeTx({
        id: 'tx-rent-nov',
        description: 'Aluguel Residencial',
        type: 'expense_fixed',
        amount: 1800,
        date: '2026-11-10',
        dueDate: '2026-11-10',
        status: 'paid',
        isRecurring: true,
      }),
      // Despesa fixa comum NÃO recorrente (isRecurring omitido / false) -> NÃO deve ser convertida em recorrência
      makeTx({
        id: 'tx-oneoff-fixed',
        description: 'Taxa Anual Condomínio',
        type: 'expense_fixed',
        amount: 600,
        date: '2026-11-15',
        dueDate: '2026-11-15',
        status: 'paid',
        isRecurring: false,
      }),
      // Despesa fixa parcelada (3/3 em Nov) -> NÃO deve se repetir em Dez/Jan
      makeTx({
        id: 'tx-parcel-3',
        description: 'Seguro Auto (3/3)',
        type: 'expense_fixed',
        amount: 400,
        date: '2026-11-20',
        dueDate: '2026-11-20',
        status: 'paid',
        isRecurring: true,
        installmentInfo: { current: 3, total: 3, groupId: 'grp-seguro' },
      }),
      // Lançamento real já antecipado para Dezembro do Aluguel -> deve deduplicar a projeção virtual de Dezembro
      makeTx({
        id: 'tx-rent-dec-real',
        description: 'Aluguel Residencial',
        type: 'expense_fixed',
        amount: 1850,
        date: '2026-12-10',
        dueDate: '2026-12-10',
        status: 'pending',
        isRecurring: true,
      }),
    ];

    const snapshotBefore = JSON.stringify(originalTxs);
    const rules = [makeRecurringRule({ id: 'rec-rule-1', description: 'Salário Sintético', amount: 5000, dayOfMonth: 5, startDate: '2026-11-05', startPeriod: '2026-11' })];

    // Próximo mês (Dez/2026)
    const nextMonth = resolveActivePeriod({ period: 'next_month' }, TODAY_ISO);
    const nextMonthTxs = computeFilteredTransactions({
      transactions: originalTxs,
      recurringIncomes: rules,
      activePeriod: nextMonth,
      todayISO: TODAY_ISO,
    });

    // Deve conter o Aluguel real (1850) sem duplicação virtual, + Salário virtual de Dezembro (5000)
    // NÃO deve conter Taxa Anual Condomínio nem Seguro Auto (3/3)
    expect(nextMonthTxs.filter((t) => t.description === 'Aluguel Residencial')).toHaveLength(1);
    expect(nextMonthTxs.find((t) => t.description === 'Aluguel Residencial')?.amount).toBe(1850);
    expect(nextMonthTxs.some((t) => t.description === 'Salário Sintético' && isVirtualTransaction(t) && t.date === '2026-12-05')).toBe(true);
    expect(nextMonthTxs.some((t) => t.description === 'Taxa Anual Condomínio')).toBe(false);
    expect(nextMonthTxs.some((t) => t.description.includes('Seguro Auto'))).toBe(false);

    // Próximos 3 Meses (Nov/26, Dez/26, Jan/27)
    const next3M = resolveActivePeriod({ period: 'next_3_months' }, TODAY_ISO);
    const next3MTxs = computeFilteredTransactions({
      transactions: originalTxs,
      recurringIncomes: rules,
      activePeriod: next3M,
      todayISO: TODAY_ISO,
    });

    const grouped = groupTransactionsByMonth(next3MTxs, { ascending: true, todayISO: TODAY_ISO });
    expect(grouped.map((g) => g.period)).toEqual(['2026-11', '2026-12', '2027-01']);

    // Nov: Salário 5000, Despesas: Aluguel 1800 + Taxa 600 + Seguro 400 = 2800
    expect(grouped[0].totalIncome).toBe(5000);
    expect(grouped[0].totalExpense).toBe(2800);

    // Dez: Salário virtual 5000, Aluguel real 1850
    expect(grouped[1].totalIncome).toBe(5000);
    expect(grouped[1].totalExpense).toBe(1850);

    // Jan/2027: Salário virtual 5000, Aluguel virtual baseado no último template (1850)
    expect(grouped[2].totalIncome).toBe(5000);
    expect(grouped[2].totalExpense).toBe(1850);

    // Garantia estrita de somente-leitura: array de origem intacto
    expect(JSON.stringify(originalTxs)).toBe(snapshotBefore);
  });

  it('5. Respeita skip, override de mês único e encerramento de receita recorrente em Próximos 6M', () => {
    const rules = [
      makeRecurringRule({
        id: 'rec-rule-2',
        description: 'Aluguel Recebido',
        amount: 2000,
        dayOfMonth: 31,
        startDate: '2026-11-30',
        startPeriod: '2026-11',
        overrides: {
          '2026-12': { skipped: true },
          '2027-01': { amount: 2300, notes: 'Reajuste janeiro' },
        },
        deactivatedFromPeriod: '2027-03',
      }),
    ];

    const next6M = resolveActivePeriod({ period: 'next_6_months' }, TODAY_ISO);
    const filtered = computeFilteredTransactions({
      transactions: [],
      recurringIncomes: rules,
      activePeriod: next6M,
      todayISO: TODAY_ISO,
    });

    const periods = filtered.map((t) => t.recurringPeriod).sort();
    // 2026-11 (real/virtual), 2026-12 (skipped), 2027-01 (override 2300), 2027-02 (clamped 2027-02-28), 2027-03+ (encerrada)
    expect(periods).toEqual(['2026-11', '2027-01', '2027-02']);

    const janTx = filtered.find((t) => t.recurringPeriod === '2027-01');
    expect(janTx?.amount).toBe(2300);
    expect(janTx?.date).toBe('2027-01-31');

    const febTx = filtered.find((t) => t.recurringPeriod === '2027-02');
    expect(febTx?.amount).toBe(2000);
    expect(febTx?.date).toBe('2027-02-28');

    const activeOccs = getRecurringIncomesForActivePeriod({
      recurringIncomes: rules,
      transactions: [],
      activePeriod: next6M,
      todayISO: TODAY_ISO,
      includeSkipped: true,
    });
    expect(activeOccs.find((o) => o.period === '2026-12')?.status).toBe('skipped');
  });

  it('6. Considera cardInvoiceMonth, dueDate e anti-duplicidade de isInvoicePayment', () => {
    const cardTx = makeTx({
      id: 'tx-card-1',
      description: 'Compra Cartão (1/2)',
      type: 'expense_variable',
      amount: 350,
      date: '2026-11-27',
      cardInvoiceMonth: '2026-12',
      paymentMethod: 'credit_card',
      creditCardId: 'card-1',
    });
    const invoicePayTx = makeTx({
      id: 'tx-inv-pay',
      description: 'Pagamento Fatura',
      type: 'expense_variable',
      amount: 350,
      date: '2026-12-10',
      isInvoicePayment: true,
    });

    expect(getTransactionEffectivePeriod(cardTx)).toBe('2026-12');
    expect(getTransactionEffectiveDate(makeTx({ type: 'expense_fixed', date: '2026-11-01', dueDate: '2026-12-05' }))).toBe('2026-12-05');

    const grouped = groupTransactionsByMonth([cardTx, invoicePayTx], { ascending: true, todayISO: TODAY_ISO });
    expect(grouped).toHaveLength(1);
    expect(grouped[0].period).toBe('2026-12');
    // isInvoicePayment não deve somar ao totalExpense
    expect(grouped[0].totalExpense).toBe(350);
  });

  it('7. Suporta intervalo personalizado (custom) inclusive com subperíodo futuro e sem correspondência por substring incorreta', () => {
    const txs: Transaction[] = [
      makeTx({ id: 'tx-net', description: 'Internet', type: 'expense_fixed', amount: 120, date: '2026-11-10', dueDate: '2026-11-10', isRecurring: true }),
      makeTx({ id: 'tx-net-fibra', description: 'Internet Fibra Escritório', type: 'expense_fixed', amount: 200, date: '2026-12-10', dueDate: '2026-12-10', isRecurring: true }),
    ];

    const templatesDec = getExplicitRecurringFixedExpenseTemplates(txs, '2026-12');
    expect(templatesDec).toHaveLength(2);

    // Em Janeiro/2027 ambos os templates são distintos (match exato normalizado, não substring!)
    const projJan = buildProjectedTransactionsForMonth({
      targetYear: 2027,
      targetMonth: 0,
      transactions: txs,
      recurringIncomes: [],
      todayISO: TODAY_ISO,
    });
    expect(projJan.map((p) => p.description).sort()).toEqual(['Internet', 'Internet Fibra Escritório']);

    // Custom spanning Nov 2026 -> Jan 2027
    const customPeriod = resolveActivePeriod(
      { period: 'custom', startDate: '2026-11-20', endDate: '2027-01-15' },
      TODAY_ISO
    );
    expect(customPeriod.includesFuture).toBe(true);
    const customTxs = computeFilteredTransactions({
      transactions: txs,
      recurringIncomes: [],
      activePeriod: customPeriod,
      todayISO: TODAY_ISO,
    });
    // Dez/2026: Internet Fibra real (10/12) + Internet virtual (10/12); Jan/2027: ambos virtuais em 10/01
    expect(customTxs.some((t) => t.description === 'Internet' && t.date === '2026-12-10' && isVirtualTransaction(t))).toBe(true);
    expect(customTxs.some((t) => t.description === 'Internet' && t.date === '2027-01-10' && isVirtualTransaction(t))).toBe(true);
    expect(buildPeriodString(2027, 0)).toBe('2027-01');
  });
});
