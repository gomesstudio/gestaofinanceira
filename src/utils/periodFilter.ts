/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  DateFilter,
  RecurringExpenseOccurrence,
  RecurringExpenseRule,
  RecurringIncomeOccurrence,
  RecurringIncomeRule,
  TimeFilterPeriod,
  Transaction,
} from '../types/finance';
import { getTodayISO, MONTH_NAMES_PT, MONTH_NAMES_SHORT_PT } from './formatters';
import {
  addMonthsToPeriod,
  getRecurringIncomesForMonth,
  parseISODateParts,
  resolveClampedDateForPeriod,
} from './recurringIncome';
import { getRecurringExpensesForMonth } from './recurringExpense';

export function comparePeriods(a: string, b: string): number {
  return a.localeCompare(b);
}

export function formatPeriodBR(period: string): string {
  const parsed = parsePeriodString(period);
  if (!parsed) return period;
  return `${MONTH_NAMES_PT[parsed.month]}/${parsed.year}`;
}

export function formatPeriodShortBR(period: string): string {
  const parsed = parsePeriodString(period);
  if (!parsed) return period;
  return `${MONTH_NAMES_SHORT_PT[parsed.month]}/${String(parsed.year).slice(2)}`;
}

export type ResolvedPeriodMode = 'single_month' | 'multi_month' | 'custom' | 'all';

export interface ResolvedPeriodMonth {
  year: number;
  month: number; // 0-indexed (0-11)
  period: string; // YYYY-MM
  label: string; // Ex: 'Novembro/2026'
  shortLabel: string; // Ex: 'Nov/26'
  isCurrent: boolean;
  isFuture: boolean;
  isPast: boolean;
}

export interface ActivePeriodMeta {
  filterPeriod: TimeFilterPeriod;
  mode: ResolvedPeriodMode;
  selectedYear: number;
  selectedMonth: number; // 0-indexed
  selectedPeriod: string; // YYYY-MM
  label: string;
  shortLabel: string;
  months: ResolvedPeriodMonth[];
  startDate?: string; // YYYY-MM-DD
  endDate?: string; // YYYY-MM-DD
  isSingleMonth: boolean;
  isMultiMonth: boolean;
  isCurrentMonth: boolean;
  isPastView: boolean;
  isFutureView: boolean;
  includesFuture: boolean;
  isSpecificMonthView: boolean;
}

export interface TransactionMonthGroup {
  period: string; // YYYY-MM
  label: string;
  shortLabel: string;
  isFuture: boolean;
  isCurrent: boolean;
  transactions: Transaction[];
  totalIncome: number;
  totalExpense: number;
  net: number;
}

export function buildPeriodString(year: number, monthZeroIndexed: number): string {
  return `${year}-${String(monthZeroIndexed + 1).padStart(2, '0')}`;
}

export function parsePeriodString(period: string): { year: number; month: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  if (!Number.isInteger(year) || month < 0 || month > 11) return null;
  return { year, month };
}

function makeResolvedMonth(period: string, currentPeriod: string): ResolvedPeriodMonth {
  const parsed = parsePeriodString(period) || { year: 2026, month: 0 };
  const cmp = comparePeriods(period, currentPeriod);
  return {
    year: parsed.year,
    month: parsed.month,
    period,
    label: formatPeriodBR(period),
    shortLabel: formatPeriodShortBR(period),
    isCurrent: cmp === 0,
    isFuture: cmp > 0,
    isPast: cmp < 0,
  };
}

function getLastDayOfPeriod(period: string): string {
  return resolveClampedDateForPeriod(period, 31);
}

function formatDateCompactBR(isoDate: string): string {
  const parts = parseISODateParts(isoDate);
  if (!parts) return isoDate;
  return `${String(parts.day).padStart(2, '0')}/${String(parts.month1).padStart(2, '0')}/${parts.year}`;
}

/**
 * Resolve o período ativo completo de forma centralizada a partir do DateFilter.
 * Todas as operações de calendário usam aritmética pura YYYY-MM (sem drift de fuso horário).
 */
export function resolveActivePeriod(
  filter: DateFilter,
  todayISO: string = getTodayISO()
): ActivePeriodMeta {
  const parsedToday = parseISODateParts(todayISO);
  const todayParts = parsedToday
    ? { year: parsedToday.year, month: parsedToday.month1 - 1, day: parsedToday.day }
    : {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        day: new Date().getDate(),
      };
  const currentPeriod = buildPeriodString(todayParts.year, todayParts.month);

  if (
    filter.period === 'current_month' ||
    filter.period === 'next_month' ||
    filter.period === 'previous_month' ||
    filter.period === 'specific_month'
  ) {
    let targetPeriod = currentPeriod;
    if (filter.period === 'next_month') {
      targetPeriod = addMonthsToPeriod(currentPeriod, 1);
    } else if (filter.period === 'previous_month') {
      targetPeriod = addMonthsToPeriod(currentPeriod, -1);
    } else if (filter.period === 'specific_month') {
      const y = filter.year ?? todayParts.year;
      const m = filter.month ?? todayParts.month;
      targetPeriod = buildPeriodString(y, m);
    }

    const monthMeta = makeResolvedMonth(targetPeriod, currentPeriod);
    const isSpecific =
      filter.period === 'specific_month' ||
      filter.period === 'next_month' ||
      filter.period === 'current_month';

    return {
      filterPeriod: filter.period,
      mode: 'single_month',
      selectedYear: monthMeta.year,
      selectedMonth: monthMeta.month,
      selectedPeriod: targetPeriod,
      label: monthMeta.label,
      shortLabel: monthMeta.label,
      months: [monthMeta],
      startDate: `${targetPeriod}-01`,
      endDate: getLastDayOfPeriod(targetPeriod),
      isSingleMonth: true,
      isMultiMonth: false,
      isCurrentMonth: monthMeta.isCurrent,
      isPastView: monthMeta.isPast,
      isFutureView: monthMeta.isFuture,
      includesFuture: monthMeta.isFuture,
      isSpecificMonthView: isSpecific,
    };
  }

  if (filter.period === 'next_3_months' || filter.period === 'next_6_months') {
    const count = filter.period === 'next_3_months' ? 3 : 6;
    const months: ResolvedPeriodMonth[] = [];
    for (let i = 0; i < count; i++) {
      months.push(makeResolvedMonth(addMonthsToPeriod(currentPeriod, i), currentPeriod));
    }
    const first = months[0];
    const last = months[months.length - 1];
    const shortTag = count === 3 ? 'Próximos 3M' : 'Próximos 6M';
    const fullPrefix = count === 3 ? 'Próximos 3 Meses' : 'Próximos 6 Meses';

    return {
      filterPeriod: filter.period,
      mode: 'multi_month',
      selectedYear: todayParts.year,
      selectedMonth: todayParts.month,
      selectedPeriod: currentPeriod,
      label: `${fullPrefix} (${first.shortLabel} – ${last.shortLabel})`,
      shortLabel: shortTag,
      months,
      startDate: `${first.period}-01`,
      endDate: getLastDayOfPeriod(last.period),
      isSingleMonth: false,
      isMultiMonth: true,
      isCurrentMonth: false,
      isPastView: false,
      isFutureView: false,
      includesFuture: true,
      isSpecificMonthView: false,
    };
  }

  if (
    filter.period === 'last_3_months' ||
    filter.period === 'last_6_months' ||
    filter.period === 'last_12_months'
  ) {
    const count =
      filter.period === 'last_3_months' ? 3 : filter.period === 'last_6_months' ? 6 : 12;
    const months: ResolvedPeriodMonth[] = [];
    for (let i = count - 1; i >= 0; i--) {
      months.push(makeResolvedMonth(addMonthsToPeriod(currentPeriod, -i), currentPeriod));
    }
    const first = months[0];
    const last = months[months.length - 1];
    const shortTag =
      count === 3 ? 'Últimos 3M' : count === 6 ? 'Últimos 6M' : 'Últimos 12M';
    const fullPrefix =
      count === 3 ? 'Últimos 3 Meses' : count === 6 ? 'Últimos 6 Meses' : 'Últimos 12 Meses';

    return {
      filterPeriod: filter.period,
      mode: 'multi_month',
      selectedYear: todayParts.year,
      selectedMonth: todayParts.month,
      selectedPeriod: currentPeriod,
      label: `${fullPrefix} (${first.shortLabel} – ${last.shortLabel})`,
      shortLabel: shortTag,
      months,
      startDate: `${first.period}-01`,
      endDate: todayISO,
      isSingleMonth: false,
      isMultiMonth: true,
      isCurrentMonth: false,
      isPastView: true,
      isFutureView: false,
      includesFuture: false,
      isSpecificMonthView: false,
    };
  }

  if (filter.period === 'custom') {
    const start = filter.startDate || '';
    const end = filter.endDate || '';
    const startPeriod = start && parseISODateParts(start) ? start.slice(0, 7) : currentPeriod;
    const endPeriod = end && parseISODateParts(end) ? end.slice(0, 7) : currentPeriod;

    const months: ResolvedPeriodMonth[] = [];
    if (start && end && comparePeriods(startPeriod, endPeriod) <= 0) {
      let cursor = startPeriod;
      let guard = 0;
      while (comparePeriods(cursor, endPeriod) <= 0 && guard < 120) {
        months.push(makeResolvedMonth(cursor, currentPeriod));
        cursor = addMonthsToPeriod(cursor, 1);
        guard++;
      }
    }

    const hasRange = Boolean(start && end);
    const includesFuture = Boolean(end && end > todayISO);

    return {
      filterPeriod: 'custom',
      mode: 'custom',
      selectedYear: todayParts.year,
      selectedMonth: todayParts.month,
      selectedPeriod: currentPeriod,
      label: hasRange
        ? `${formatDateCompactBR(start)} – ${formatDateCompactBR(end)}`
        : 'Período Personalizado',
      shortLabel: 'Personalizado',
      months,
      startDate: start || undefined,
      endDate: end || undefined,
      isSingleMonth: false,
      isMultiMonth: months.length > 1,
      isCurrentMonth: false,
      isPastView: Boolean(end && end < todayISO),
      isFutureView: Boolean(start && start > todayISO),
      includesFuture,
      isSpecificMonthView: false,
    };
  }

  // 'all' -> Histórico completo
  return {
    filterPeriod: 'all',
    mode: 'all',
    selectedYear: todayParts.year,
    selectedMonth: todayParts.month,
    selectedPeriod: currentPeriod,
    label: 'Histórico Completo',
    shortLabel: 'Histórico',
    months: [],
    isSingleMonth: false,
    isMultiMonth: false,
    isCurrentMonth: false,
    isPastView: false,
    isFutureView: false,
    includesFuture: false,
    isSpecificMonthView: false,
  };
}

/**
 * Identifica se a transação é uma projeção virtual gerada dinamicamente para visualização/projeção
 * (nunca persistida no banco e segura contra mutações acidentais).
 */
export function isVirtualTransaction(tx: Pick<Transaction, 'id' | 'isVirtualProjection'>): boolean {
  return Boolean(
    tx.isVirtualProjection ||
      tx.id.startsWith('rec-inc-occ:') ||
      tx.id.startsWith('rec-inc-legacy:') ||
      tx.id.startsWith('rec-exp-occ:') ||
      tx.id.startsWith('rec-exp-legacy:') ||
      tx.id.startsWith('proj-tx-')
  );
}

/**
 * Data efetiva da transação para ordenação, calendário e filtros temporais.
 * Para despesas com vencimento, prioriza dueDate; para receitas, prioriza date.
 */
export function getTransactionEffectiveDate(tx: Transaction): string {
  if (tx.type !== 'income' && tx.dueDate && parseISODateParts(tx.dueDate)) {
    return tx.dueDate;
  }
  return tx.date;
}

/**
 * Período (YYYY-MM) efetivo ao qual a transação pertence.
 * Respeita cardInvoiceMonth para despesas no cartão quando informado.
 */
export function getTransactionEffectivePeriod(tx: Transaction): string {
  if (tx.type !== 'income' && tx.cardInvoiceMonth && parsePeriodString(tx.cardInvoiceMonth)) {
    return tx.cardInvoiceMonth;
  }
  return getTransactionEffectiveDate(tx).slice(0, 7);
}

function normalizeDescriptionKey(description: string): string {
  return description.trim().toLowerCase();
}

/**
 * Extrai apenas os modelos explícitos de despesa fixa recorrente marcados com `isRecurring === true`,
 * excluindo compras parceladas (que já têm parcelas limitadas) e pagamentos de fatura.
 * IMPORTANTE: NÃO converte registros comuns de `expense_fixed` sem `isRecurring: true`.
 */
export function getExplicitRecurringFixedExpenseTemplates(
  transactions: Transaction[],
  targetPeriod: string
): Transaction[] {
  const templates = new Map<string, Transaction>();

  // Ordenar da mais recente para a mais antiga dentro do horizonte <= targetPeriod
  const eligible = transactions
    .filter(
      (t) =>
        t.isRecurring === true &&
        t.type === 'expense_fixed' &&
        !t.installmentInfo &&
        !t.isInvoicePayment &&
        getTransactionEffectivePeriod(t) <= targetPeriod
    )
    .sort((a, b) => getTransactionEffectiveDate(b).localeCompare(getTransactionEffectiveDate(a)));

  for (const tx of eligible) {
    const key = normalizeDescriptionKey(tx.description);
    if (!key) continue;
    if (!templates.has(key)) {
      templates.set(key, tx);
    }
  }

  return Array.from(templates.values());
}

/**
 * Gera projeções virtuais não-persistidas para um mês futuro (ou mês dentro de um intervalo projetado).
 * Garante que:
 * - Não duplica lançamentos reais já existentes naquele mês;
 * - Clampa dias 29/30/31 com segurança em meses curtos;
 * - Respeita regras de receitas fixas recorrentes (incluindo skip, override, término);
 * - Não converte despesas fixas comuns ou parceladas em recorrência infinita.
 */
export function buildProjectedTransactionsForMonth(params: {
  targetYear: number;
  targetMonth: number;
  transactions: Transaction[];
  recurringIncomes?: RecurringIncomeRule[];
  recurringExpenses?: RecurringExpenseRule[];
  todayISO: string;
}): Transaction[] {
  const {
    targetYear,
    targetMonth,
    transactions,
    recurringIncomes,
    recurringExpenses,
    todayISO,
  } = params;
  const targetPeriod = buildPeriodString(targetYear, targetMonth);

  const monthExisting = transactions.filter(
    (tx) => getTransactionEffectivePeriod(tx) === targetPeriod
  );

  const synthetic: Transaction[] = [];

  // 1. Despesas fixas recorrentes (motor estruturado RecurringExpenseRule + fallback legado estrito)
  const recurringExpenseOccurrences = getRecurringExpensesForMonth(
    recurringExpenses,
    targetYear,
    targetMonth,
    transactions,
    todayISO
  );

  for (const occ of recurringExpenseOccurrences) {
    if (!occ.isVirtual || occ.status === 'skipped') continue;

    const alreadyInMonth = monthExisting.some(
      (t) =>
        (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
        !t.isInvoicePayment &&
        ((t.recurringExpenseId &&
          t.recurringExpenseId === occ.ruleId &&
          t.recurringPeriod === occ.period) ||
          normalizeDescriptionKey(t.description) === normalizeDescriptionKey(occ.description))
    );

    if (alreadyInMonth) continue;

    const isCard = occ.paymentMethod === 'credit_card';
    synthetic.push({
      id: occ.id,
      description: occ.description,
      amount: occ.amount,
      type: 'expense_fixed',
      category: occ.category,
      date: occ.date,
      dueDate: occ.date,
      accountId: isCard ? undefined : occ.accountId,
      creditCardId: isCard ? occ.creditCardId : undefined,
      cardInvoiceMonth: isCard ? occ.period : undefined,
      paymentMethod: occ.paymentMethod,
      status: 'pending',
      isRecurring: true,
      recurringExpenseId: occ.isLegacy ? undefined : occ.ruleId,
      recurringPeriod: occ.period,
      notes: occ.notes || 'Previsão automática de despesa fixa recorrente',
      isVirtualProjection: true,
      projectedStatus: occ.status,
    });
  }

  // 2. Receitas fixas recorrentes (motor estruturado + fallback legado) sem duplicidade
  const recurringOccurrences = getRecurringIncomesForMonth(
    recurringIncomes,
    targetYear,
    targetMonth,
    transactions,
    todayISO
  );

  for (const occ of recurringOccurrences) {
    if (!occ.isVirtual || occ.status === 'skipped') continue;

    const alreadyInMonth = monthExisting.some(
      (t) =>
        t.type === 'income' &&
        ((t.recurringIncomeId &&
          t.recurringIncomeId === occ.ruleId &&
          t.recurringPeriod === occ.period) ||
          normalizeDescriptionKey(t.description) === normalizeDescriptionKey(occ.description))
    );

    if (alreadyInMonth) continue;

    synthetic.push({
      id: occ.id,
      description: occ.description,
      amount: occ.amount,
      type: 'income',
      category: occ.category,
      date: occ.date,
      accountId: occ.accountId,
      paymentMethod: occ.paymentMethod,
      status: 'pending',
      isRecurring: true,
      recurringIncomeId: occ.isLegacy ? undefined : occ.ruleId,
      recurringPeriod: occ.period,
      notes: occ.notes || 'Previsão automática de receita fixa recorrente',
      isVirtualProjection: true,
      projectedStatus: occ.status,
    });
  }

  return synthetic;
}

/**
 * Calcula a lista unificada de transações (reais + projeções quando aplicável ao período)
 * que alimenta simultaneamente KPIs, gráficos e todas as listagens do aplicativo.
 */
export function computeFilteredTransactions(params: {
  transactions: Transaction[];
  recurringIncomes?: RecurringIncomeRule[];
  recurringExpenses?: RecurringExpenseRule[];
  activePeriod: ActivePeriodMeta;
  todayISO?: string;
}): Transaction[] {
  const {
    transactions,
    recurringIncomes,
    recurringExpenses,
    activePeriod,
    todayISO = getTodayISO(),
  } = params;

  // 1. Mês único (atual, próximo, anterior ou específico)
  if (activePeriod.mode === 'single_month') {
    const existing = transactions.filter(
      (tx) => getTransactionEffectivePeriod(tx) === activePeriod.selectedPeriod
    );

    if (activePeriod.isFutureView) {
      const projected = buildProjectedTransactionsForMonth({
        targetYear: activePeriod.selectedYear,
        targetMonth: activePeriod.selectedMonth,
        transactions,
        recurringIncomes,
        recurringExpenses,
        todayISO,
      });
      return [...existing, ...projected];
    }

    return existing;
  }

  // 2. Intervalo futuro multi-meses (Próximos 3M / Próximos 6M)
  if (
    activePeriod.filterPeriod === 'next_3_months' ||
    activePeriod.filterPeriod === 'next_6_months'
  ) {
    const allowedPeriods = new Set(activePeriod.months.map((m) => m.period));
    const existing = transactions.filter((tx) =>
      allowedPeriods.has(getTransactionEffectivePeriod(tx))
    );

    const syntheticAll: Transaction[] = [];
    for (const m of activePeriod.months) {
      const projected = buildProjectedTransactionsForMonth({
        targetYear: m.year,
        targetMonth: m.month,
        transactions,
        recurringIncomes,
        recurringExpenses,
        todayISO,
      });
      syntheticAll.push(...projected);
    }

    return [...existing, ...syntheticAll];
  }

  // 3. Intervalo histórico multi-meses (Últimos 3M / 6M / 12M)
  if (
    activePeriod.filterPeriod === 'last_3_months' ||
    activePeriod.filterPeriod === 'last_6_months' ||
    activePeriod.filterPeriod === 'last_12_months'
  ) {
    const startDate = activePeriod.startDate || '';
    const endDate = activePeriod.endDate || todayISO;
    return transactions.filter((tx) => {
      const effDate = getTransactionEffectiveDate(tx);
      return effDate >= startDate && effDate <= endDate;
    });
  }

  // 4. Intervalo personalizado
  if (activePeriod.filterPeriod === 'custom') {
    const { startDate, endDate, months } = activePeriod;
    const base = transactions.filter((tx) => {
      const effDate = getTransactionEffectiveDate(tx);
      if (startDate && effDate < startDate) return false;
      if (endDate && effDate > endDate) return false;
      return true;
    });

    if (activePeriod.includesFuture && months.length > 0) {
      const synthetic: Transaction[] = [];
      for (const m of months) {
        if (!m.isFuture && !m.isCurrent) continue;
        // Só injeta projeção no mês atual se a data projetada for >= startDate e > todayISO (ou dentro do intervalo futuro)
        const monthProj = buildProjectedTransactionsForMonth({
          targetYear: m.year,
          targetMonth: m.month,
          transactions,
          recurringIncomes,
          recurringExpenses,
          todayISO,
        });
        for (const p of monthProj) {
          const effDate = getTransactionEffectiveDate(p);
          if (startDate && effDate < startDate) continue;
          if (endDate && effDate > endDate) continue;
          if (m.isCurrent && effDate <= todayISO) continue;
          synthetic.push(p);
        }
      }
      return [...base, ...synthetic];
    }

    return base;
  }

  // 5. Histórico completo ('all')
  return transactions;
}

/**
 * Obtém todas as ocorrências de receitas fixas recorrentes dentro do período ativo
 * (1 mês para visão mensal, N meses para Próximos 3M / Próximos 6M, etc.).
 */
export function getRecurringIncomesForActivePeriod(params: {
  recurringIncomes?: RecurringIncomeRule[];
  transactions: Transaction[];
  activePeriod: ActivePeriodMeta;
  todayISO?: string;
  includeSkipped?: boolean;
}): RecurringIncomeOccurrence[] {
  const {
    recurringIncomes,
    transactions,
    activePeriod,
    todayISO = getTodayISO(),
    includeSkipped = true,
  } = params;

  const parsedTodayForRecurring = parseISODateParts(todayISO);
  const monthsToInspect =
    activePeriod.months.length > 0
      ? activePeriod.months
      : [
          makeResolvedMonth(
            activePeriod.selectedPeriod,
            buildPeriodString(
              parsedTodayForRecurring ? parsedTodayForRecurring.year : activePeriod.selectedYear,
              parsedTodayForRecurring ? parsedTodayForRecurring.month1 - 1 : activePeriod.selectedMonth
            )
          ),
        ];

  const allOccurrences: RecurringIncomeOccurrence[] = [];
  for (const m of monthsToInspect) {
    const occs = getRecurringIncomesForMonth(
      recurringIncomes,
      m.year,
      m.month,
      transactions,
      todayISO,
      { includeSkipped }
    );
    allOccurrences.push(...occs);
  }
  return allOccurrences;
}

/**
 * Obtém todas as ocorrências de despesas fixas recorrentes dentro do período ativo.
 */
export function getRecurringExpensesForActivePeriod(params: {
  recurringExpenses?: RecurringExpenseRule[];
  transactions: Transaction[];
  activePeriod: ActivePeriodMeta;
  todayISO?: string;
  includeSkipped?: boolean;
}): RecurringExpenseOccurrence[] {
  const {
    recurringExpenses,
    transactions,
    activePeriod,
    todayISO = getTodayISO(),
    includeSkipped = true,
  } = params;

  const parsedTodayForRecurring = parseISODateParts(todayISO);
  const monthsToInspect =
    activePeriod.months.length > 0
      ? activePeriod.months
      : [
          makeResolvedMonth(
            activePeriod.selectedPeriod,
            buildPeriodString(
              parsedTodayForRecurring ? parsedTodayForRecurring.year : activePeriod.selectedYear,
              parsedTodayForRecurring ? parsedTodayForRecurring.month1 - 1 : activePeriod.selectedMonth
            )
          ),
        ];

  const allOccurrences: RecurringExpenseOccurrence[] = [];
  for (const m of monthsToInspect) {
    const occs = getRecurringExpensesForMonth(
      recurringExpenses,
      m.year,
      m.month,
      transactions,
      todayISO,
      { includeSkipped }
    );
    allOccurrences.push(...occs);
  }
  return allOccurrences;
}

/**
 * Agrupa uma lista de transações por mês (YYYY-MM) com subtotais consistentes,
 * preservando ordem cronológica (ascendente em projeções futuras, descendente em histórico).
 */
export function groupTransactionsByMonth(
  transactions: Transaction[],
  options?: { ascending?: boolean; todayISO?: string }
): TransactionMonthGroup[] {
  const todayISO = options?.todayISO ?? getTodayISO();
  const parsedToday = parseISODateParts(todayISO);
  const todayParts = parsedToday
    ? { year: parsedToday.year, month: parsedToday.month1 - 1, day: parsedToday.day }
    : {
        year: new Date().getFullYear(),
        month: new Date().getMonth(),
        day: new Date().getDate(),
      };
  const currentPeriod = buildPeriodString(todayParts.year, todayParts.month);
  const ascending = options?.ascending ?? false;

  const map = new Map<string, Transaction[]>();
  for (const tx of transactions) {
    const period = getTransactionEffectivePeriod(tx);
    const list = map.get(period) || [];
    list.push(tx);
    map.set(period, list);
  }

  const periods = Array.from(map.keys()).sort((a, b) =>
    ascending ? comparePeriods(a, b) : comparePeriods(b, a)
  );

  return periods.map((period) => {
    const list = (map.get(period) || []).slice().sort((a, b) => {
      const da = getTransactionEffectiveDate(a);
      const db = getTransactionEffectiveDate(b);
      return ascending ? da.localeCompare(db) : db.localeCompare(da);
    });

    const totalIncome = list
      .filter((t) => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    const totalExpense = list
      .filter(
        (t) =>
          (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
          !t.isInvoicePayment
      )
      .reduce((sum, t) => sum + t.amount, 0);

    const cmp = comparePeriods(period, currentPeriod);
    return {
      period,
      label: formatPeriodBR(period),
      shortLabel: formatPeriodShortBR(period),
      isFuture: cmp > 0,
      isCurrent: cmp === 0,
      transactions: list,
      totalIncome,
      totalExpense,
      net: totalIncome - totalExpense,
    };
  });
}
