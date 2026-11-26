/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PaymentMethod,
  RecurringExpenseMonthOverride,
  RecurringExpenseOccurrence,
  RecurringExpenseRule,
  RecurringExpenseScheduleEntry,
  Transaction,
} from '../types/finance';
import { AppState } from './storage';
import {
  addMonthsToPeriod,
  clampDayOfMonth,
  formatPeriod,
  getTodayISO,
  getTodayPeriod,
  parseISODateParts,
  parsePeriodParts,
  resolveClampedDateForPeriod,
} from './recurringIncome';

function generateId(prefix: string): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return `${prefix}-${crypto.randomUUID()}`;
    }
  } catch {
    // fallback
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function getExpenseTxEffectivePeriod(tx: Transaction): string {
  if (tx.cardInvoiceMonth && parsePeriodParts(tx.cardInvoiceMonth)) {
    return tx.cardInvoiceMonth;
  }
  const refDate = tx.dueDate && parseISODateParts(tx.dueDate) ? tx.dueDate : tx.date;
  return refDate.slice(0, 7);
}

export interface EffectiveRecurringExpenseValues {
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  creditCardId?: string;
  paymentMethod: PaymentMethod;
  dayOfMonth: number;
  customDate?: string;
  notes?: string;
  skipped: boolean;
}

export function getEffectiveExpenseRuleValuesForPeriod(
  rule: RecurringExpenseRule,
  period: string,
  options?: { ignoreOverride?: boolean }
): EffectiveRecurringExpenseValues {
  let description = rule.description;
  let amount = rule.amount;
  let category = rule.category;
  let accountId = rule.accountId;
  let creditCardId = rule.creditCardId;
  let paymentMethod = rule.paymentMethod;
  let dayOfMonth = clampDayOfMonth(rule.dayOfMonth);
  let notes = rule.notes;

  if (Array.isArray(rule.schedules) && rule.schedules.length > 0) {
    const sorted = [...rule.schedules]
      .filter((s) => s.effectiveFromPeriod <= period)
      .sort((a, b) => a.effectiveFromPeriod.localeCompare(b.effectiveFromPeriod));

    for (const sched of sorted) {
      if (typeof sched.amount === 'number' && Number.isFinite(sched.amount)) {
        amount = sched.amount;
      }
      if (typeof sched.dayOfMonth === 'number' && Number.isFinite(sched.dayOfMonth)) {
        dayOfMonth = clampDayOfMonth(sched.dayOfMonth);
      }
      if (typeof sched.description === 'string' && sched.description.trim()) {
        description = sched.description;
      }
      if (typeof sched.category === 'string' && sched.category.trim()) {
        category = sched.category;
      }
      if (sched.accountId !== undefined) {
        accountId = sched.accountId || undefined;
      }
      if (sched.creditCardId !== undefined) {
        creditCardId = sched.creditCardId || undefined;
      }
      if (sched.paymentMethod) {
        paymentMethod = sched.paymentMethod;
      }
      if (sched.notes !== undefined) {
        notes = sched.notes;
      }
    }
  }

  const override = !options?.ignoreOverride ? rule.overrides?.[period] : undefined;
  let customDate: string | undefined;
  let skipped = false;

  if (override) {
    if (override.skipped) skipped = true;
    if (typeof override.amount === 'number' && Number.isFinite(override.amount)) {
      amount = override.amount;
    }
    if (typeof override.dayOfMonth === 'number' && Number.isFinite(override.dayOfMonth)) {
      dayOfMonth = clampDayOfMonth(override.dayOfMonth);
    }
    if (typeof override.customDate === 'string' && parseISODateParts(override.customDate)) {
      customDate = override.customDate;
    }
    if (typeof override.description === 'string' && override.description.trim()) {
      description = override.description;
    }
    if (typeof override.category === 'string' && override.category.trim()) {
      category = override.category;
    }
    if (override.accountId !== undefined) {
      accountId = override.accountId || undefined;
    }
    if (override.creditCardId !== undefined) {
      creditCardId = override.creditCardId || undefined;
    }
    if (override.paymentMethod) {
      paymentMethod = override.paymentMethod;
    }
    if (override.notes !== undefined) {
      notes = override.notes;
    }
  }

  return {
    description,
    amount,
    category,
    accountId: paymentMethod === 'credit_card' ? undefined : accountId,
    creditCardId: paymentMethod === 'credit_card' ? creditCardId : undefined,
    paymentMethod,
    dayOfMonth,
    customDate,
    notes,
    skipped,
  };
}

/**
 * Resolve dinamicamente a ocorrência mensal de uma despesa fixa recorrente para YYYY-MM.
 * Nunca cria transações sozinhas nem marca automaticamente ocorrências vencidas como pagas.
 */
export function resolveRecurringExpenseOccurrence(
  rule: RecurringExpenseRule,
  period: string,
  transactions: Transaction[],
  todayISO = getTodayISO(),
  options?: { includeSkipped?: boolean }
): RecurringExpenseOccurrence | null {
  if (!parsePeriodParts(period)) return null;

  const linkedTx = transactions.find(
    (t) =>
      (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
      !t.isInvoicePayment &&
      t.recurringExpenseId === rule.id &&
      t.recurringPeriod === period
  );

  const effective = getEffectiveExpenseRuleValuesForPeriod(rule, period);
  const scheduledDate =
    effective.customDate || resolveClampedDateForPeriod(period, effective.dayOfMonth);

  if (linkedTx) {
    const refDate = linkedTx.dueDate || linkedTx.date;
    const status: RecurringExpenseOccurrence['status'] =
      linkedTx.status === 'paid'
        ? 'paid'
        : refDate < todayISO
        ? 'overdue'
        : 'predicted';

    return {
      id: `rec-exp-occ:${rule.id}:${period}`,
      ruleId: rule.id,
      period,
      description: linkedTx.description || effective.description,
      amount: linkedTx.amount,
      category: linkedTx.category || effective.category,
      accountId: linkedTx.accountId,
      creditCardId: linkedTx.creditCardId,
      paymentMethod: linkedTx.paymentMethod,
      scheduledDate,
      date: refDate,
      configuredDayOfMonth: effective.dayOfMonth,
      status,
      isIndefinite: rule.isIndefinite,
      endDate: rule.endDate,
      transactionId: linkedTx.id,
      notes: linkedTx.notes ?? effective.notes,
      isVirtual: false,
    };
  }

  if (period < rule.startPeriod) return null;
  if (!rule.isIndefinite && rule.endPeriod && period > rule.endPeriod) return null;

  if (!rule.isActive) {
    if (!rule.deactivatedFromPeriod || period >= rule.deactivatedFromPeriod) {
      return null;
    }
  } else if (rule.deactivatedFromPeriod && period >= rule.deactivatedFromPeriod) {
    return null;
  }

  if (effective.skipped) {
    if (!options?.includeSkipped) return null;
    return {
      id: `rec-exp-occ:${rule.id}:${period}`,
      ruleId: rule.id,
      period,
      description: effective.description,
      amount: effective.amount,
      category: effective.category,
      accountId: effective.accountId,
      creditCardId: effective.creditCardId,
      paymentMethod: effective.paymentMethod,
      scheduledDate,
      date: scheduledDate,
      configuredDayOfMonth: effective.dayOfMonth,
      status: 'skipped',
      isIndefinite: rule.isIndefinite,
      endDate: rule.endDate,
      notes: effective.notes,
      isVirtual: true,
    };
  }

  if (!rule.isIndefinite && rule.endDate && scheduledDate > rule.endDate) {
    return null;
  }

  const effectiveDate =
    period === rule.startPeriod && scheduledDate < rule.startDate && !effective.customDate
      ? null
      : scheduledDate;

  if (!effectiveDate) return null;

  return {
    id: `rec-exp-occ:${rule.id}:${period}`,
    ruleId: rule.id,
    period,
    description: effective.description,
    amount: effective.amount,
    category: effective.category,
    accountId: effective.accountId,
    creditCardId: effective.creditCardId,
    paymentMethod: effective.paymentMethod,
    scheduledDate: effectiveDate,
    date: effectiveDate,
    configuredDayOfMonth: effective.dayOfMonth,
    status: effectiveDate < todayISO ? 'overdue' : 'predicted',
    isIndefinite: rule.isIndefinite,
    endDate: rule.endDate,
    notes: effective.notes,
    isVirtual: true,
  };
}

/**
 * Retorna todas as ocorrências de despesas fixas recorrentes para um mês específico (year, month0),
 * incluindo compatibilidade com lançamentos legados `expense_fixed` marcados com `isRecurring: true`
 * (excluindo parcelamentos e pagamentos de fatura), sem nunca duplicar períodos já registrados.
 */
export function getRecurringExpensesForMonth(
  rules: RecurringExpenseRule[] | undefined,
  year: number,
  month0: number,
  transactions: Transaction[],
  todayISO = getTodayISO(),
  options?: { includeSkipped?: boolean }
): RecurringExpenseOccurrence[] {
  const period = formatPeriod(year, month0);
  const safeRules = Array.isArray(rules) ? rules : [];
  const occurrences: RecurringExpenseOccurrence[] = [];

  for (const rule of safeRules) {
    const occ = resolveRecurringExpenseOccurrence(rule, period, transactions, todayISO, options);
    if (occ) {
      occurrences.push(occ);
    }
  }

  // Nomes cobertos por regras estruturadas (incluindo regras puladas ou encerradas)
  // para impedir ressuscitação indevida via fallback legado.
  const coveredRuleDescriptions = new Set<string>();
  for (const occ of occurrences) {
    coveredRuleDescriptions.add(occ.description.trim().toLowerCase());
  }
  for (const rule of safeRules) {
    coveredRuleDescriptions.add(rule.description.trim().toLowerCase());
    if (Array.isArray(rule.schedules)) {
      for (const s of rule.schedules) {
        if (s.description?.trim()) {
          coveredRuleDescriptions.add(s.description.trim().toLowerCase());
        }
      }
    }
  }

  // Compatibilidade legada estrita: apenas expense_fixed explícitos com isRecurring === true,
  // sem recurringExpenseId, sem parcelamento e sem pagamento de fatura.
  const legacyExpenses = transactions.filter(
    (t) =>
      t.isRecurring === true &&
      t.type === 'expense_fixed' &&
      !t.recurringExpenseId &&
      !t.installmentInfo &&
      !t.isInvoicePayment
  );

  if (legacyExpenses.length > 0) {
    const monthTransactions = transactions.filter(
      (t) =>
        (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
        !t.isInvoicePayment &&
        getExpenseTxEffectivePeriod(t) === period
    );

    const latestByDescription = new Map<string, Transaction>();
    for (const tx of legacyExpenses) {
      const txPeriod = getExpenseTxEffectivePeriod(tx);
      if (txPeriod >= period) continue;
      const key = tx.description.trim().toLowerCase();
      if (!key) continue;
      const prev = latestByDescription.get(key);
      if (!prev || (tx.dueDate || tx.date) > (prev.dueDate || prev.date)) {
        latestByDescription.set(key, tx);
      }
    }

    for (const [descKey, templateTx] of latestByDescription.entries()) {
      if (coveredRuleDescriptions.has(descKey)) continue;
      const alreadyInMonth = monthTransactions.some(
        (t) => t.description.trim().toLowerCase() === descKey
      );
      if (alreadyInMonth) continue;

      coveredRuleDescriptions.add(descKey);
      const parsedDate = parseISODateParts(templateTx.dueDate || templateTx.date);
      const dayOfMonth = parsedDate ? parsedDate.day : 10;
      const resolvedDate = resolveClampedDateForPeriod(period, dayOfMonth);

      occurrences.push({
        id: `rec-exp-legacy:${templateTx.id}:${period}`,
        ruleId: `legacy:${templateTx.id}`,
        period,
        description: templateTx.description,
        amount: templateTx.amount,
        category: templateTx.category,
        accountId: templateTx.paymentMethod === 'credit_card' ? undefined : templateTx.accountId,
        creditCardId:
          templateTx.paymentMethod === 'credit_card' ? templateTx.creditCardId : undefined,
        paymentMethod: templateTx.paymentMethod,
        scheduledDate: resolvedDate,
        date: resolvedDate,
        configuredDayOfMonth: dayOfMonth,
        status: resolvedDate < todayISO ? 'overdue' : 'predicted',
        isIndefinite: true,
        notes: templateTx.notes,
        isVirtual: true,
        isLegacy: true,
      });
    }
  }

  return occurrences.sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Calcula o comprometimento anual previsto (12 meses) de uma regra de despesa fixa recorrente
 * a partir de `fromPeriod` (respeitando término configurado e meses pulados).
 */
export function calculateRecurringExpenseAnnualTotal(
  rule: RecurringExpenseRule,
  fromPeriod?: string
): number {
  const basePeriod = fromPeriod || rule.startPeriod;
  let total = 0;

  for (let i = 0; i < 12; i++) {
    const p = addMonthsToPeriod(basePeriod, i);
    if (p < rule.startPeriod) continue;
    if (!rule.isIndefinite && rule.endPeriod && p > rule.endPeriod) continue;
    if (!rule.isActive && (!rule.deactivatedFromPeriod || p >= rule.deactivatedFromPeriod)) {
      continue;
    }
    if (rule.deactivatedFromPeriod && p >= rule.deactivatedFromPeriod) continue;

    const eff = getEffectiveExpenseRuleValuesForPeriod(rule, p);
    if (eff.skipped) continue;

    const resolvedDate = eff.customDate || resolveClampedDateForPeriod(p, eff.dayOfMonth);
    if (!rule.isIndefinite && rule.endDate && resolvedDate > rule.endDate) continue;

    total += eff.amount;
  }

  return Number(total.toFixed(2));
}

export interface CreateRecurringExpenseInput {
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  creditCardId?: string;
  paymentMethod: PaymentMethod;
  dayOfMonth: number;
  startDate: string; // YYYY-MM-DD
  isIndefinite: boolean;
  endDate?: string; // YYYY-MM-DD
  firstOccurrenceStatus?: 'paid' | 'pending';
  notes?: string;
}

/**
 * Cria uma nova regra de despesa fixa recorrente.
 * Se o usuário marcar a primeira ocorrência (com data <= hoje) como já paga, cria também o lançamento
 * inicial confirmado e debita a conta bancária (exclusivamente quando paymentMethod !== 'credit_card').
 */
export function addRecurringExpenseRuleToState(
  state: AppState,
  input: CreateRecurringExpenseInput,
  todayISO = getTodayISO()
): { state: AppState; rule: RecurringExpenseRule; initialTransaction?: Transaction } {
  const nowIso = new Date().toISOString();
  const safeDay = clampDayOfMonth(input.dayOfMonth);
  const startPeriod = input.startDate.slice(0, 7);
  const endPeriod =
    !input.isIndefinite && input.endDate && parseISODateParts(input.endDate)
      ? input.endDate.slice(0, 7)
      : undefined;

  const isCard = input.paymentMethod === 'credit_card';
  const normalizedAccountId = isCard ? undefined : input.accountId || undefined;
  const normalizedCardId = isCard ? input.creditCardId || undefined : undefined;

  const ruleId = generateId('rec-exp');
  const initialSchedule: RecurringExpenseScheduleEntry = {
    effectiveFromPeriod: startPeriod,
    amount: Number(input.amount),
    dayOfMonth: safeDay,
    description: input.description.trim(),
    category: input.category,
    accountId: normalizedAccountId,
    creditCardId: normalizedCardId,
    paymentMethod: input.paymentMethod,
    notes: input.notes?.trim() || undefined,
  };

  const rule: RecurringExpenseRule = {
    id: ruleId,
    description: input.description.trim(),
    amount: Number(input.amount),
    category: input.category,
    accountId: normalizedAccountId,
    creditCardId: normalizedCardId,
    paymentMethod: input.paymentMethod,
    frequency: 'monthly',
    dayOfMonth: safeDay,
    startDate: input.startDate,
    startPeriod,
    isIndefinite: input.isIndefinite,
    endDate: !input.isIndefinite ? input.endDate : undefined,
    endPeriod,
    isActive: true,
    notes: input.notes?.trim() || undefined,
    schedules: [initialSchedule],
    overrides: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  let nextTransactions = state.transactions;
  let nextAccounts = state.accounts;
  let initialTransaction: Transaction | undefined;

  const canConfirmFirst =
    input.firstOccurrenceStatus === 'paid' && input.startDate <= todayISO;

  if (canConfirmFirst) {
    initialTransaction = {
      id: generateId('tx'),
      description: rule.description,
      amount: rule.amount,
      type: 'expense_fixed',
      category: rule.category,
      date: input.startDate,
      dueDate: input.startDate,
      accountId: normalizedAccountId,
      creditCardId: normalizedCardId,
      cardInvoiceMonth: isCard ? startPeriod : undefined,
      paymentMethod: rule.paymentMethod,
      status: 'paid',
      isRecurring: true,
      recurringExpenseId: rule.id,
      recurringPeriod: startPeriod,
      notes: rule.notes,
    };

    nextTransactions = [initialTransaction, ...state.transactions];

    if (!isCard && initialTransaction.accountId) {
      nextAccounts = state.accounts.map((acc) =>
        acc.id === initialTransaction!.accountId
          ? { ...acc, balance: Number((acc.balance - initialTransaction!.amount).toFixed(2)) }
          : acc
      );
    }
  }

  return {
    rule,
    initialTransaction,
    state: {
      ...state,
      transactions: nextTransactions,
      accounts: nextAccounts,
      recurringExpenses: [rule, ...(state.recurringExpenses || [])],
    },
  };
}

export interface ConfirmRecurringExpensePaymentInput {
  ruleId: string;
  period: string;
  actualAmount: number;
  actualDate: string;
  accountId?: string;
  creditCardId?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

/**
 * Confirma o pagamento real de uma ocorrência de despesa recorrente em determinado mês,
 * permitindo ajuste de valor, data e conta/cartão, sem gerar duplicidade no mesmo período.
 */
export function confirmRecurringExpensePaymentInState(
  state: AppState,
  input: ConfirmRecurringExpensePaymentInput
): { state: AppState; transaction?: Transaction } {
  const rules = state.recurringExpenses || [];
  const rule = rules.find((r) => r.id === input.ruleId);
  if (!rule) {
    return { state };
  }

  const effective = getEffectiveExpenseRuleValuesForPeriod(rule, input.period);
  const existingTx = state.transactions.find(
    (t) =>
      (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
      !t.isInvoicePayment &&
      t.recurringExpenseId === input.ruleId &&
      t.recurringPeriod === input.period
  );

  const finalPaymentMethod = input.paymentMethod || effective.paymentMethod;
  const isCard = finalPaymentMethod === 'credit_card';
  const targetAccountId = isCard
    ? undefined
    : input.accountId !== undefined
    ? input.accountId || undefined
    : effective.accountId;
  const targetCardId = isCard
    ? input.creditCardId !== undefined
      ? input.creditCardId || undefined
      : effective.creditCardId
    : undefined;
  const finalAmount = Number(input.actualAmount);
  const finalNotes = input.notes !== undefined ? input.notes : effective.notes;

  let nextAccounts = state.accounts;
  let nextTransactions = state.transactions;
  let savedTransaction: Transaction;

  if (existingTx) {
    if (
      existingTx.status === 'paid' &&
      existingTx.paymentMethod !== 'credit_card' &&
      existingTx.accountId
    ) {
      nextAccounts = nextAccounts.map((acc) =>
        acc.id === existingTx.accountId
          ? { ...acc, balance: Number((acc.balance + existingTx.amount).toFixed(2)) }
          : acc
      );
    }

    savedTransaction = {
      ...existingTx,
      description: effective.description,
      amount: finalAmount,
      type: 'expense_fixed',
      date: input.actualDate,
      dueDate: existingTx.dueDate || effective.customDate || resolveClampedDateForPeriod(input.period, effective.dayOfMonth),
      accountId: targetAccountId,
      creditCardId: targetCardId,
      cardInvoiceMonth: isCard ? input.period : undefined,
      paymentMethod: finalPaymentMethod,
      status: 'paid',
      isRecurring: true,
      recurringExpenseId: rule.id,
      recurringPeriod: input.period,
      notes: finalNotes,
    };

    nextTransactions = nextTransactions.map((t) =>
      t.id === existingTx.id ? savedTransaction : t
    );
  } else {
    const scheduledDue =
      effective.customDate || resolveClampedDateForPeriod(input.period, effective.dayOfMonth);
    savedTransaction = {
      id: generateId('tx'),
      description: effective.description,
      amount: finalAmount,
      type: 'expense_fixed',
      category: effective.category,
      date: input.actualDate,
      dueDate: scheduledDue,
      accountId: targetAccountId,
      creditCardId: targetCardId,
      cardInvoiceMonth: isCard ? input.period : undefined,
      paymentMethod: finalPaymentMethod,
      status: 'paid',
      isRecurring: true,
      recurringExpenseId: rule.id,
      recurringPeriod: input.period,
      notes: finalNotes,
    };

    nextTransactions = [savedTransaction, ...nextTransactions];
  }

  if (!isCard && savedTransaction.accountId) {
    nextAccounts = nextAccounts.map((acc) =>
      acc.id === savedTransaction.accountId
        ? { ...acc, balance: Number((acc.balance - savedTransaction.amount).toFixed(2)) }
        : acc
    );
  }

  const nextRules = rules.map((r) => {
    if (r.id !== rule.id) return r;
    const prevOverride = r.overrides?.[input.period];
    if (!prevOverride?.skipped) return r;
    const { skipped: _removed, ...restOverride } = prevOverride;
    const nextOverrides = { ...(r.overrides || {}) };
    if (Object.keys(restOverride).length === 0) {
      delete nextOverrides[input.period];
    } else {
      nextOverrides[input.period] = restOverride;
    }
    return {
      ...r,
      overrides: nextOverrides,
      updatedAt: new Date().toISOString(),
    };
  });

  return {
    transaction: savedTransaction,
    state: {
      ...state,
      transactions: nextTransactions,
      accounts: nextAccounts,
      recurringExpenses: nextRules,
    },
  };
}

export interface UpdateRecurringExpenseInput {
  ruleId: string;
  targetPeriod: string;
  scope: 'single' | 'future';
  updates: {
    description?: string;
    amount?: number;
    dayOfMonth?: number;
    customDate?: string;
    category?: string;
    accountId?: string;
    creditCardId?: string;
    paymentMethod?: PaymentMethod;
    notes?: string;
    isIndefinite?: boolean;
    endDate?: string;
  };
}

/**
 * Edita uma despesa fixa recorrente:
 * - 'single': altera apenas o mês selecionado (via lançamento vinculado ou override mensal).
 * - 'future': aplica novo valor/dia/descrição/conta a partir de `targetPeriod` em diante, preservando meses anteriores.
 */
export function updateRecurringExpenseInState(
  state: AppState,
  input: UpdateRecurringExpenseInput
): AppState {
  const rules = state.recurringExpenses || [];
  const rule = rules.find((r) => r.id === input.ruleId);
  if (!rule) return state;

  const { targetPeriod, scope, updates } = input;
  const nowIso = new Date().toISOString();

  if (scope === 'single') {
    const existingTx = state.transactions.find(
      (t) =>
        (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
        !t.isInvoicePayment &&
        t.recurringExpenseId === input.ruleId &&
        t.recurringPeriod === targetPeriod
    );

    if (existingTx) {
      let nextAccounts = state.accounts;
      if (
        existingTx.status === 'paid' &&
        existingTx.paymentMethod !== 'credit_card' &&
        existingTx.accountId
      ) {
        nextAccounts = nextAccounts.map((acc) =>
          acc.id === existingTx.accountId
            ? { ...acc, balance: Number((acc.balance + existingTx.amount).toFixed(2)) }
            : acc
        );
      }

      const nextMethod =
        updates.paymentMethod !== undefined ? updates.paymentMethod : existingTx.paymentMethod;
      const isCard = nextMethod === 'credit_card';
      const nextAmount =
        updates.amount !== undefined ? Number(updates.amount) : existingTx.amount;
      const nextAccountId = isCard
        ? undefined
        : updates.accountId !== undefined
        ? updates.accountId || undefined
        : existingTx.accountId;
      const nextCardId = isCard
        ? updates.creditCardId !== undefined
          ? updates.creditCardId || undefined
          : existingTx.creditCardId
        : undefined;
      const nextDate =
        updates.customDate && parseISODateParts(updates.customDate)
          ? updates.customDate
          : updates.dayOfMonth !== undefined
          ? resolveClampedDateForPeriod(targetPeriod, updates.dayOfMonth)
          : existingTx.date;

      const updatedTx: Transaction = {
        ...existingTx,
        description:
          updates.description !== undefined ? updates.description.trim() : existingTx.description,
        amount: nextAmount,
        date: nextDate,
        dueDate:
          updates.customDate && parseISODateParts(updates.customDate)
            ? updates.customDate
            : updates.dayOfMonth !== undefined
            ? nextDate
            : existingTx.dueDate,
        category: updates.category !== undefined ? updates.category : existingTx.category,
        accountId: nextAccountId,
        creditCardId: nextCardId,
        cardInvoiceMonth: isCard ? targetPeriod : undefined,
        paymentMethod: nextMethod,
        notes: updates.notes !== undefined ? updates.notes : existingTx.notes,
      };

      if (updatedTx.status === 'paid' && !isCard && updatedTx.accountId) {
        nextAccounts = nextAccounts.map((acc) =>
          acc.id === updatedTx.accountId
            ? { ...acc, balance: Number((acc.balance - updatedTx.amount).toFixed(2)) }
            : acc
        );
      }

      return {
        ...state,
        accounts: nextAccounts,
        transactions: state.transactions.map((t) => (t.id === existingTx.id ? updatedTx : t)),
      };
    }

    const prevOverride = rule.overrides?.[targetPeriod] || {};
    const nextOverride: RecurringExpenseMonthOverride = {
      ...prevOverride,
      skipped: false,
    };
    if (updates.description !== undefined) nextOverride.description = updates.description.trim();
    if (updates.amount !== undefined) nextOverride.amount = Number(updates.amount);
    if (updates.dayOfMonth !== undefined) nextOverride.dayOfMonth = clampDayOfMonth(updates.dayOfMonth);
    if (updates.customDate !== undefined) nextOverride.customDate = updates.customDate || undefined;
    if (updates.category !== undefined) nextOverride.category = updates.category;
    if (updates.accountId !== undefined) nextOverride.accountId = updates.accountId || undefined;
    if (updates.creditCardId !== undefined) nextOverride.creditCardId = updates.creditCardId || undefined;
    if (updates.paymentMethod !== undefined) nextOverride.paymentMethod = updates.paymentMethod;
    if (updates.notes !== undefined) nextOverride.notes = updates.notes;

    return {
      ...state,
      recurringExpenses: rules.map((r) =>
        r.id === rule.id
          ? {
              ...r,
              overrides: {
                ...(r.overrides || {}),
                [targetPeriod]: nextOverride,
              },
              updatedAt: nowIso,
            }
          : r
      ),
    };
  }

  // scope === 'future'
  const currentBaseForTarget = getEffectiveExpenseRuleValuesForPeriod(rule, targetPeriod, {
    ignoreOverride: true,
  });

  const existingSchedules = Array.isArray(rule.schedules) ? [...rule.schedules] : [];
  if (
    targetPeriod > rule.startPeriod &&
    !existingSchedules.some((s) => s.effectiveFromPeriod <= rule.startPeriod)
  ) {
    existingSchedules.unshift({
      effectiveFromPeriod: rule.startPeriod,
      amount: rule.amount,
      dayOfMonth: rule.dayOfMonth,
      description: rule.description,
      category: rule.category,
      accountId: rule.accountId,
      creditCardId: rule.creditCardId,
      paymentMethod: rule.paymentMethod,
      notes: rule.notes,
    });
  }

  const keptSchedules = existingSchedules.filter((s) => s.effectiveFromPeriod < targetPeriod);
  const nextDayOfMonth =
    updates.dayOfMonth !== undefined
      ? clampDayOfMonth(updates.dayOfMonth)
      : currentBaseForTarget.dayOfMonth;
  const nextAmount =
    updates.amount !== undefined ? Number(updates.amount) : currentBaseForTarget.amount;
  const nextDescription =
    updates.description !== undefined
      ? updates.description.trim()
      : currentBaseForTarget.description;
  const nextCategory =
    updates.category !== undefined ? updates.category : currentBaseForTarget.category;
  const nextPaymentMethod =
    updates.paymentMethod !== undefined
      ? updates.paymentMethod
      : currentBaseForTarget.paymentMethod;
  const isCard = nextPaymentMethod === 'credit_card';
  const nextAccountId = isCard
    ? undefined
    : updates.accountId !== undefined
    ? updates.accountId || undefined
    : currentBaseForTarget.accountId;
  const nextCreditCardId = isCard
    ? updates.creditCardId !== undefined
      ? updates.creditCardId || undefined
      : currentBaseForTarget.creditCardId
    : undefined;
  const nextNotes =
    updates.notes !== undefined ? updates.notes : currentBaseForTarget.notes;

  const newScheduleEntry: RecurringExpenseScheduleEntry = {
    effectiveFromPeriod: targetPeriod,
    amount: nextAmount,
    dayOfMonth: nextDayOfMonth,
    description: nextDescription,
    category: nextCategory,
    accountId: nextAccountId,
    creditCardId: nextCreditCardId,
    paymentMethod: nextPaymentMethod,
    notes: nextNotes,
  };

  const nextOverrides: Record<string, RecurringExpenseMonthOverride> = {};
  for (const [ovPeriod, ovVal] of Object.entries(rule.overrides || {})) {
    if (ovPeriod < targetPeriod) {
      nextOverrides[ovPeriod] = ovVal;
    } else if (ovVal.skipped) {
      nextOverrides[ovPeriod] = { skipped: true };
    }
  }

  const nextIsIndefinite =
    updates.isIndefinite !== undefined ? updates.isIndefinite : rule.isIndefinite;
  const nextEndDate = nextIsIndefinite
    ? undefined
    : updates.endDate !== undefined
    ? updates.endDate || undefined
    : rule.endDate;
  const nextEndPeriod =
    !nextIsIndefinite && nextEndDate && parseISODateParts(nextEndDate)
      ? nextEndDate.slice(0, 7)
      : undefined;

  const updatedRule: RecurringExpenseRule = {
    ...rule,
    ...(targetPeriod <= rule.startPeriod
      ? {
          description: nextDescription,
          amount: nextAmount,
          dayOfMonth: nextDayOfMonth,
          category: nextCategory,
          accountId: nextAccountId,
          creditCardId: nextCreditCardId,
          paymentMethod: nextPaymentMethod,
          notes: nextNotes,
        }
      : {}),
    isIndefinite: nextIsIndefinite,
    endDate: nextEndDate,
    endPeriod: nextEndPeriod,
    schedules: [...keptSchedules, newScheduleEntry].sort((a, b) =>
      a.effectiveFromPeriod.localeCompare(b.effectiveFromPeriod)
    ),
    overrides: nextOverrides,
    updatedAt: nowIso,
  };

  const nextTransactions = state.transactions.map((t) => {
    if (
      (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
      !t.isInvoicePayment &&
      t.recurringExpenseId === rule.id &&
      t.recurringPeriod &&
      t.recurringPeriod >= targetPeriod &&
      t.status !== 'paid'
    ) {
      const nextDate = resolveClampedDateForPeriod(t.recurringPeriod, nextDayOfMonth);
      return {
        ...t,
        description: nextDescription,
        amount: nextAmount,
        category: nextCategory,
        accountId: nextAccountId,
        creditCardId: nextCreditCardId,
        cardInvoiceMonth: isCard ? t.recurringPeriod : undefined,
        paymentMethod: nextPaymentMethod,
        date: nextDate,
        dueDate: nextDate,
        notes: nextNotes,
      };
    }
    return t;
  });

  return {
    ...state,
    transactions: nextTransactions,
    recurringExpenses: rules.map((r) => (r.id === rule.id ? updatedRule : r)),
  };
}

export function skipRecurringExpenseOccurrenceInState(
  state: AppState,
  ruleId: string,
  period: string
): AppState {
  const rules = state.recurringExpenses || [];
  const hasPaidTx = state.transactions.some(
    (t) =>
      (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
      !t.isInvoicePayment &&
      t.recurringExpenseId === ruleId &&
      t.recurringPeriod === period &&
      t.status === 'paid'
  );
  if (hasPaidTx) return state;

  return {
    ...state,
    recurringExpenses: rules.map((r) =>
      r.id === ruleId
        ? {
            ...r,
            overrides: {
              ...(r.overrides || {}),
              [period]: {
                ...(r.overrides?.[period] || {}),
                skipped: true,
              },
            },
            updatedAt: new Date().toISOString(),
          }
        : r
    ),
  };
}

export function unskipRecurringExpenseOccurrenceInState(
  state: AppState,
  ruleId: string,
  period: string
): AppState {
  const rules = state.recurringExpenses || [];
  return {
    ...state,
    recurringExpenses: rules.map((r) => {
      if (r.id !== ruleId) return r;
      const existing = r.overrides?.[period];
      if (!existing?.skipped) return r;
      const { skipped: _removed, ...rest } = existing;
      const nextOverrides = { ...(r.overrides || {}) };
      if (Object.keys(rest).length === 0) {
        delete nextOverrides[period];
      } else {
        nextOverrides[period] = rest;
      }
      return {
        ...r,
        overrides: nextOverrides,
        updatedAt: new Date().toISOString(),
      };
    }),
  };
}

/**
 * Encerra/cancela uma despesa recorrente a partir de um período,
 * preservando integralmente todos os lançamentos já pagos no histórico.
 */
export function endRecurringExpenseInState(
  state: AppState,
  ruleId: string,
  deactivatedFromPeriod?: string
): AppState {
  const rules = state.recurringExpenses || [];
  const cutoffPeriod = deactivatedFromPeriod || getTodayPeriod();
  return {
    ...state,
    recurringExpenses: rules.map((r) =>
      r.id === ruleId
        ? {
            ...r,
            isActive: false,
            deactivatedFromPeriod: cutoffPeriod,
            updatedAt: new Date().toISOString(),
          }
        : r
    ),
  };
}

/**
 * Remove a regra de recorrência preservando lançamentos já pagos no histórico (desvinculando-os).
 */
export function deleteRecurringExpenseRuleInState(state: AppState, ruleId: string): AppState {
  const rules = state.recurringExpenses || [];
  return {
    ...state,
    transactions: state.transactions.map((t) =>
      t.recurringExpenseId === ruleId
        ? { ...t, recurringExpenseId: undefined, recurringPeriod: undefined, isRecurring: false }
        : t
    ),
    recurringExpenses: rules.filter((r) => r.id !== ruleId),
  };
}

export interface ConvertTransactionToRecurringExpenseInput {
  transactionId: string;
  dayOfMonth?: number;
  isIndefinite?: boolean;
  endDate?: string;
  notes?: string;
}

/**
 * Conversão voluntária explícita de uma despesa existente (`expense_fixed` sem parcelamento/fatura/regra)
 * em uma `RecurringExpenseRule`, vinculando o lançamento original sem duplicar nem alterar saldos.
 */
export function convertTransactionToRecurringExpenseInState(
  state: AppState,
  input: ConvertTransactionToRecurringExpenseInput
): { state: AppState; rule?: RecurringExpenseRule } {
  const tx = state.transactions.find((t) => t.id === input.transactionId);
  if (
    !tx ||
    tx.type !== 'expense_fixed' ||
    tx.recurringExpenseId ||
    tx.installmentInfo ||
    tx.isInvoicePayment
  ) {
    return { state };
  }

  const nowIso = new Date().toISOString();
  const baseDate = tx.dueDate && parseISODateParts(tx.dueDate) ? tx.dueDate : tx.date;
  const parsedDate = parseISODateParts(baseDate);
  const startPeriod = getExpenseTxEffectivePeriod(tx);
  const safeDay = clampDayOfMonth(input.dayOfMonth ?? (parsedDate ? parsedDate.day : 10));
  const isIndefinite = input.isIndefinite ?? true;
  const endPeriod =
    !isIndefinite && input.endDate && parseISODateParts(input.endDate)
      ? input.endDate.slice(0, 7)
      : undefined;
  const isCard = tx.paymentMethod === 'credit_card';
  const normalizedAccountId = isCard ? undefined : tx.accountId || undefined;
  const normalizedCardId = isCard ? tx.creditCardId || undefined : undefined;
  const finalNotes = input.notes !== undefined ? input.notes.trim() || undefined : tx.notes;

  const ruleId = generateId('rec-exp');
  const rule: RecurringExpenseRule = {
    id: ruleId,
    description: tx.description.trim(),
    amount: Number(tx.amount),
    category: tx.category,
    accountId: normalizedAccountId,
    creditCardId: normalizedCardId,
    paymentMethod: tx.paymentMethod,
    frequency: 'monthly',
    dayOfMonth: safeDay,
    startDate: baseDate,
    startPeriod,
    isIndefinite,
    endDate: !isIndefinite ? input.endDate : undefined,
    endPeriod,
    isActive: true,
    notes: finalNotes,
    schedules: [
      {
        effectiveFromPeriod: startPeriod,
        amount: Number(tx.amount),
        dayOfMonth: safeDay,
        description: tx.description.trim(),
        category: tx.category,
        accountId: normalizedAccountId,
        creditCardId: normalizedCardId,
        paymentMethod: tx.paymentMethod,
        notes: finalNotes,
      },
    ],
    overrides: {},
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const nextTransactions = state.transactions.map((t) =>
    t.id === tx.id
      ? {
          ...t,
          isRecurring: true,
          recurringExpenseId: rule.id,
          recurringPeriod: startPeriod,
          notes: finalNotes ?? t.notes,
        }
      : t
  );

  return {
    rule,
    state: {
      ...state,
      transactions: nextTransactions,
      recurringExpenses: [rule, ...(state.recurringExpenses || [])],
    },
  };
}
