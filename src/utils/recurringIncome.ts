/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  PaymentMethod,
  RecurringIncomeMonthOverride,
  RecurringIncomeOccurrence,
  RecurringIncomeRule,
  RecurringIncomeScheduleEntry,
  Transaction,
} from '../types/finance';
import { AppState } from './storage';

const ISO_DATE_REGEX = /^(\d{4})-(\d{2})-(\d{2})$/;
const PERIOD_REGEX = /^(\d{4})-(\d{2})$/;

export function parseISODateParts(dateStr: string): { year: number; month1: number; day: number } | null {
  const match = ISO_DATE_REGEX.exec(dateStr.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month1 = Number(match[2]);
  const day = Number(match[3]);
  if (month1 < 1 || month1 > 12 || day < 1 || day > 31) return null;
  return { year, month1, day };
}

export function parsePeriodParts(period: string): { year: number; month1: number } | null {
  const match = PERIOD_REGEX.exec(period.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month1 = Number(match[2]);
  if (month1 < 1 || month1 > 12) return null;
  return { year, month1 };
}

export function formatPeriod(year: number, month0: number): string {
  const month1 = month0 + 1;
  return `${year}-${String(month1).padStart(2, '0')}`;
}

export function getDaysInMonth(year: number, month1: number): number {
  return new Date(year, month1, 0).getDate();
}

export function clampDayOfMonth(day: number): number {
  if (!Number.isFinite(day)) return 1;
  return Math.max(1, Math.min(31, Math.trunc(day)));
}

/**
 * Resolve uma data YYYY-MM-DD para o período YYYY-MM ajustando dias 29/30/31
 * ao último dia do mês quando o mês for mais curto, sem alterar a regra original.
 */
export function resolveClampedDateForPeriod(period: string, configuredDay: number): string {
  const parsed = parsePeriodParts(period);
  if (!parsed) {
    return `${period}-01`;
  }
  const maxDay = getDaysInMonth(parsed.year, parsed.month1);
  const safeDay = Math.max(1, Math.min(clampDayOfMonth(configuredDay), maxDay));
  return `${parsed.year}-${String(parsed.month1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;
}

/**
 * Soma meses inteiros a um período YYYY-MM sem usar Date.setMonth (evita overflow e fuso).
 */
export function addMonthsToPeriod(period: string, deltaMonths: number): string {
  const parsed = parsePeriodParts(period);
  if (!parsed) return period;
  const totalMonths = parsed.year * 12 + (parsed.month1 - 1) + deltaMonths;
  const nextYear = Math.floor(totalMonths / 12);
  const nextMonth0 = ((totalMonths % 12) + 12) % 12;
  return formatPeriod(nextYear, nextMonth0);
}

export function getTodayISO(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function getTodayPeriod(todayISO = getTodayISO()): string {
  return todayISO.slice(0, 7);
}

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

export interface EffectiveRecurringIncomeValues {
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  paymentMethod: PaymentMethod;
  dayOfMonth: number;
  customDate?: string;
  notes?: string;
  skipped: boolean;
}

export function getEffectiveRuleValuesForPeriod(
  rule: RecurringIncomeRule,
  period: string,
  options?: { ignoreOverride?: boolean }
): EffectiveRecurringIncomeValues {
  let description = rule.description;
  let amount = rule.amount;
  let category = rule.category;
  let accountId = rule.accountId;
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
    accountId,
    paymentMethod,
    dayOfMonth,
    customDate,
    notes,
    skipped,
  };
}

/**
 * Resolve dinamicamente a ocorrência mensal de uma regra para um período YYYY-MM.
 * Nunca cria transações sozinhas nem marca automaticamente ocorrências vencidas como recebidas.
 */
export function resolveRecurringIncomeOccurrence(
  rule: RecurringIncomeRule,
  period: string,
  transactions: Transaction[],
  todayISO = getTodayISO(),
  options?: { includeSkipped?: boolean }
): RecurringIncomeOccurrence | null {
  if (!parsePeriodParts(period)) return null;

  // 1. Verificar se já existe lançamento real vinculado a esta regra e período
  const linkedTx = transactions.find(
    (t) =>
      t.type === 'income' &&
      t.recurringIncomeId === rule.id &&
      t.recurringPeriod === period
  );

  const effective = getEffectiveRuleValuesForPeriod(rule, period);
  const scheduledDate =
    effective.customDate || resolveClampedDateForPeriod(period, effective.dayOfMonth);

  if (linkedTx) {
    const status: RecurringIncomeOccurrence['status'] =
      linkedTx.status === 'paid'
        ? 'received'
        : linkedTx.date < todayISO
        ? 'overdue'
        : 'predicted';

    return {
      id: `rec-inc-occ:${rule.id}:${period}`,
      ruleId: rule.id,
      period,
      description: linkedTx.description || effective.description,
      amount: linkedTx.amount,
      category: linkedTx.category || effective.category,
      accountId: linkedTx.accountId,
      paymentMethod: linkedTx.paymentMethod,
      scheduledDate,
      date: linkedTx.date,
      configuredDayOfMonth: effective.dayOfMonth,
      status,
      isIndefinite: rule.isIndefinite,
      endDate: rule.endDate,
      transactionId: linkedTx.id,
      notes: linkedTx.notes ?? effective.notes,
      isVirtual: false,
    };
  }

  // 2. Respeitar início e fim configurados da regra
  if (period < rule.startPeriod) return null;
  if (!rule.isIndefinite && rule.endPeriod && period > rule.endPeriod) return null;

  // 3. Respeitar encerramento/cancelamento da recorrência sem apagar histórico já recebido
  if (!rule.isActive) {
    if (!rule.deactivatedFromPeriod || period >= rule.deactivatedFromPeriod) {
      return null;
    }
  } else if (rule.deactivatedFromPeriod && period >= rule.deactivatedFromPeriod) {
    return null;
  }

  // 4. Se a ocorrência foi pulada neste mês específico
  if (effective.skipped) {
    if (!options?.includeSkipped) return null;
    return {
      id: `rec-inc-occ:${rule.id}:${period}`,
      ruleId: rule.id,
      period,
      description: effective.description,
      amount: effective.amount,
      category: effective.category,
      accountId: effective.accountId,
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

  // 5. Se a regra tem data final específica e a data calculada ultrapassa o limite
  if (!rule.isIndefinite && rule.endDate && scheduledDate > rule.endDate) {
    return null;
  }

  // Também respeita se a data de início for posterior no mesmo mês apenas quando customizada;
  // caso contrário, se startDate está dentro de startPeriod (ex: startDate 2026-11-15 e dayOfMonth 15),
  // garante que não gere data anterior a startDate no primeiro mês se usuário iniciou após o dia escolhido
  const effectiveDate =
    period === rule.startPeriod && scheduledDate < rule.startDate && !effective.customDate
      ? null
      : scheduledDate;

  if (!effectiveDate) return null;

  return {
    id: `rec-inc-occ:${rule.id}:${period}`,
    ruleId: rule.id,
    period,
    description: effective.description,
    amount: effective.amount,
    category: effective.category,
    accountId: effective.accountId,
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
 * Retorna todas as ocorrências de receitas fixas recorrentes para um mês específico (year, month0),
 * incluindo compatibilidade com lançamentos legados `isRecurring: true` sem regra associada,
 * sem nunca duplicar períodos já registrados/confirmados.
 */
export function getRecurringIncomesForMonth(
  rules: RecurringIncomeRule[] | undefined,
  year: number,
  month0: number,
  transactions: Transaction[],
  todayISO = getTodayISO(),
  options?: { includeSkipped?: boolean }
): RecurringIncomeOccurrence[] {
  const period = formatPeriod(year, month0);
  const safeRules = Array.isArray(rules) ? rules : [];
  const occurrences: RecurringIncomeOccurrence[] = [];

  for (const rule of safeRules) {
    const occ = resolveRecurringIncomeOccurrence(rule, period, transactions, todayISO, options);
    if (occ) {
      occurrences.push(occ);
    }
  }

  // Compatibilidade legada: transações antigas de receita marcadas com `isRecurring: true`
  // sem `recurringIncomeId` e sem regra formal equivalente
  const legacyIncomes = transactions.filter(
    (t) => t.type === 'income' && t.isRecurring && !t.recurringIncomeId
  );

  if (legacyIncomes.length > 0) {
    const monthTransactions = transactions.filter(
      (t) => t.type === 'income' && t.date.startsWith(`${period}-`)
    );
    const seenDescriptions = new Set<string>(
      occurrences.map((o) => o.description.trim().toLowerCase())
    );

    const latestByDescription = new Map<string, Transaction>();
    for (const tx of legacyIncomes) {
      const txPeriod = tx.date.slice(0, 7);
      if (txPeriod > period) continue;
      const key = tx.description.trim().toLowerCase();
      const prev = latestByDescription.get(key);
      if (!prev || tx.date > prev.date) {
        latestByDescription.set(key, tx);
      }
    }

    for (const [descKey, templateTx] of latestByDescription.entries()) {
      if (seenDescriptions.has(descKey)) continue;
      const alreadyInMonth = monthTransactions.some(
        (t) => t.description.trim().toLowerCase() === descKey
      );
      if (alreadyInMonth) continue;

      seenDescriptions.add(descKey);
      const parsedDate = parseISODateParts(templateTx.date);
      const dayOfMonth = parsedDate ? parsedDate.day : 5;
      const resolvedDate = resolveClampedDateForPeriod(period, dayOfMonth);

      occurrences.push({
        id: `rec-inc-legacy:${templateTx.id}:${period}`,
        ruleId: `legacy:${templateTx.id}`,
        period,
        description: templateTx.description,
        amount: templateTx.amount,
        category: templateTx.category,
        accountId: templateTx.accountId,
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
 * Calcula o valor anual previsto de uma regra recorrente ao longo de 12 meses consecutivos
 * a partir de `fromPeriod` (respeitando término configurado e ocorrências puladas).
 */
export function calculateRecurringIncomeAnnualTotal(
  rule: RecurringIncomeRule,
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

    const eff = getEffectiveRuleValuesForPeriod(rule, p);
    if (eff.skipped) continue;

    const resolvedDate = eff.customDate || resolveClampedDateForPeriod(p, eff.dayOfMonth);
    if (!rule.isIndefinite && rule.endDate && resolvedDate > rule.endDate) continue;

    total += eff.amount;
  }

  return Number(total.toFixed(2));
}

export interface CreateRecurringIncomeInput {
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  paymentMethod: PaymentMethod;
  dayOfMonth: number;
  startDate: string; // YYYY-MM-DD
  isIndefinite: boolean;
  endDate?: string; // YYYY-MM-DD
  firstOccurrenceStatus?: 'paid' | 'pending';
  notes?: string;
}

/**
 * Cria uma nova regra de receita fixa recorrente (e, exclusivamente se o usuário marcar a primeira
 * ocorrência com data <= hoje como já recebida, cria também a transação inicial confirmada).
 */
export function addRecurringIncomeRuleToState(
  state: AppState,
  input: CreateRecurringIncomeInput,
  todayISO = getTodayISO()
): { state: AppState; rule: RecurringIncomeRule; initialTransaction?: Transaction } {
  const nowIso = new Date().toISOString();
  const safeDay = clampDayOfMonth(input.dayOfMonth);
  const startPeriod = input.startDate.slice(0, 7);
  const endPeriod =
    !input.isIndefinite && input.endDate && parseISODateParts(input.endDate)
      ? input.endDate.slice(0, 7)
      : undefined;

  const ruleId = generateId('rec-inc');
  const initialSchedule: RecurringIncomeScheduleEntry = {
    effectiveFromPeriod: startPeriod,
    amount: Number(input.amount),
    dayOfMonth: safeDay,
    description: input.description.trim(),
    category: input.category,
    accountId: input.accountId || undefined,
    paymentMethod: input.paymentMethod,
    notes: input.notes?.trim() || undefined,
  };

  const rule: RecurringIncomeRule = {
    id: ruleId,
    description: input.description.trim(),
    amount: Number(input.amount),
    category: input.category,
    accountId: input.accountId || undefined,
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

  // Regra de integridade financeira:
  // Ocorrência futura (> hoje) NUNCA é marcada como recebida automaticamente.
  const canConfirmFirst =
    input.firstOccurrenceStatus === 'paid' && input.startDate <= todayISO;

  if (canConfirmFirst) {
    initialTransaction = {
      id: generateId('tx'),
      description: rule.description,
      amount: rule.amount,
      type: 'income',
      category: rule.category,
      date: input.startDate,
      accountId: rule.accountId,
      paymentMethod: rule.paymentMethod,
      status: 'paid',
      isRecurring: true,
      recurringIncomeId: rule.id,
      recurringPeriod: startPeriod,
      notes: rule.notes,
    };

    nextTransactions = [initialTransaction, ...state.transactions];

    if (initialTransaction.accountId) {
      nextAccounts = state.accounts.map((acc) =>
        acc.id === initialTransaction!.accountId
          ? { ...acc, balance: Number((acc.balance + initialTransaction!.amount).toFixed(2)) }
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
      recurringIncomes: [rule, ...(state.recurringIncomes || [])],
    },
  };
}

export interface ConfirmRecurringIncomeReceiptInput {
  ruleId: string;
  period: string;
  actualAmount: number;
  actualDate: string;
  accountId?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

/**
 * Confirma o recebimento real de uma ocorrência de receita recorrente em determinado mês,
 * permitindo ajuste de valor, data e conta, sem gerar duplicidade no mesmo período.
 */
export function confirmRecurringIncomeReceiptInState(
  state: AppState,
  input: ConfirmRecurringIncomeReceiptInput
): { state: AppState; transaction?: Transaction } {
  const rules = state.recurringIncomes || [];
  const rule = rules.find((r) => r.id === input.ruleId);
  if (!rule) {
    return { state };
  }

  const effective = getEffectiveRuleValuesForPeriod(rule, input.period);
  const existingTx = state.transactions.find(
    (t) =>
      t.type === 'income' &&
      t.recurringIncomeId === input.ruleId &&
      t.recurringPeriod === input.period
  );

  const targetAccountId = input.accountId !== undefined ? input.accountId || undefined : effective.accountId;
  const finalAmount = Number(input.actualAmount);
  const finalPaymentMethod = input.paymentMethod || effective.paymentMethod;
  const finalNotes = input.notes !== undefined ? input.notes : effective.notes;

  let nextAccounts = state.accounts;
  let nextTransactions = state.transactions;
  let savedTransaction: Transaction;

  if (existingTx) {
    // Reverte saldo anterior caso já estivesse paga
    if (existingTx.status === 'paid' && existingTx.accountId) {
      nextAccounts = nextAccounts.map((acc) =>
        acc.id === existingTx.accountId
          ? { ...acc, balance: Number((acc.balance - existingTx.amount).toFixed(2)) }
          : acc
      );
    }

    savedTransaction = {
      ...existingTx,
      description: effective.description,
      amount: finalAmount,
      date: input.actualDate,
      accountId: targetAccountId,
      paymentMethod: finalPaymentMethod,
      status: 'paid',
      isRecurring: true,
      recurringIncomeId: rule.id,
      recurringPeriod: input.period,
      notes: finalNotes,
    };

    nextTransactions = nextTransactions.map((t) =>
      t.id === existingTx.id ? savedTransaction : t
    );
  } else {
    savedTransaction = {
      id: generateId('tx'),
      description: effective.description,
      amount: finalAmount,
      type: 'income',
      category: effective.category,
      date: input.actualDate,
      accountId: targetAccountId,
      paymentMethod: finalPaymentMethod,
      status: 'paid',
      isRecurring: true,
      recurringIncomeId: rule.id,
      recurringPeriod: input.period,
      notes: finalNotes,
    };

    nextTransactions = [savedTransaction, ...nextTransactions];
  }

  if (savedTransaction.accountId) {
    nextAccounts = nextAccounts.map((acc) =>
      acc.id === savedTransaction.accountId
        ? { ...acc, balance: Number((acc.balance + savedTransaction.amount).toFixed(2)) }
        : acc
    );
  }

  // Se havia sido marcada como pulada anteriormente, limpa o flag skipped
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
      recurringIncomes: nextRules,
    },
  };
}

export interface UpdateRecurringIncomeInput {
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
    paymentMethod?: PaymentMethod;
    notes?: string;
    isIndefinite?: boolean;
    endDate?: string;
  };
}

/**
 * Edita uma receita recorrente:
 * - 'single': altera apenas o mês selecionado (via transação vinculada ou override mensal).
 * - 'future': aplica novo valor/dia/descrição a partir de `targetPeriod` em diante, preservando meses anteriores.
 */
export function updateRecurringIncomeInState(
  state: AppState,
  input: UpdateRecurringIncomeInput
): AppState {
  const rules = state.recurringIncomes || [];
  const rule = rules.find((r) => r.id === input.ruleId);
  if (!rule) return state;

  const { targetPeriod, scope, updates } = input;
  const nowIso = new Date().toISOString();

  if (scope === 'single') {
    const existingTx = state.transactions.find(
      (t) =>
        t.type === 'income' &&
        t.recurringIncomeId === input.ruleId &&
        t.recurringPeriod === targetPeriod
    );

    if (existingTx) {
      let nextAccounts = state.accounts;
      if (existingTx.status === 'paid' && existingTx.accountId) {
        nextAccounts = nextAccounts.map((acc) =>
          acc.id === existingTx.accountId
            ? { ...acc, balance: Number((acc.balance - existingTx.amount).toFixed(2)) }
            : acc
        );
      }

      const nextAmount =
        updates.amount !== undefined ? Number(updates.amount) : existingTx.amount;
      const nextAccountId =
        updates.accountId !== undefined ? updates.accountId || undefined : existingTx.accountId;
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
        category: updates.category !== undefined ? updates.category : existingTx.category,
        accountId: nextAccountId,
        paymentMethod:
          updates.paymentMethod !== undefined ? updates.paymentMethod : existingTx.paymentMethod,
        notes: updates.notes !== undefined ? updates.notes : existingTx.notes,
      };

      if (updatedTx.status === 'paid' && updatedTx.accountId) {
        nextAccounts = nextAccounts.map((acc) =>
          acc.id === updatedTx.accountId
            ? { ...acc, balance: Number((acc.balance + updatedTx.amount).toFixed(2)) }
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
    const nextOverride: RecurringIncomeMonthOverride = {
      ...prevOverride,
      skipped: false,
    };
    if (updates.description !== undefined) nextOverride.description = updates.description.trim();
    if (updates.amount !== undefined) nextOverride.amount = Number(updates.amount);
    if (updates.dayOfMonth !== undefined) nextOverride.dayOfMonth = clampDayOfMonth(updates.dayOfMonth);
    if (updates.customDate !== undefined) nextOverride.customDate = updates.customDate || undefined;
    if (updates.category !== undefined) nextOverride.category = updates.category;
    if (updates.accountId !== undefined) nextOverride.accountId = updates.accountId || undefined;
    if (updates.paymentMethod !== undefined) nextOverride.paymentMethod = updates.paymentMethod;
    if (updates.notes !== undefined) nextOverride.notes = updates.notes;

    return {
      ...state,
      recurringIncomes: rules.map((r) =>
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

  // scope === 'future': preserva histórico e revisões anteriores a `targetPeriod`
  const currentBaseForTarget = getEffectiveRuleValuesForPeriod(rule, targetPeriod, {
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
  const nextAccountId =
    updates.accountId !== undefined
      ? updates.accountId || undefined
      : currentBaseForTarget.accountId;
  const nextPaymentMethod =
    updates.paymentMethod !== undefined
      ? updates.paymentMethod
      : currentBaseForTarget.paymentMethod;
  const nextNotes =
    updates.notes !== undefined ? updates.notes : currentBaseForTarget.notes;

  const newScheduleEntry: RecurringIncomeScheduleEntry = {
    effectiveFromPeriod: targetPeriod,
    amount: nextAmount,
    dayOfMonth: nextDayOfMonth,
    description: nextDescription,
    category: nextCategory,
    accountId: nextAccountId,
    paymentMethod: nextPaymentMethod,
    notes: nextNotes,
  };

  // Limpa overrides futuros que conflitam com a revisão em lote, preservando apenas flags `skipped`
  const nextOverrides: Record<string, RecurringIncomeMonthOverride> = {};
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

  const updatedRule: RecurringIncomeRule = {
    ...rule,
    ...(targetPeriod <= rule.startPeriod
      ? {
          description: nextDescription,
          amount: nextAmount,
          dayOfMonth: nextDayOfMonth,
          category: nextCategory,
          accountId: nextAccountId,
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

  // Atualiza também eventuais transações pendentes (não pagas) futuras vinculadas >= targetPeriod
  const nextTransactions = state.transactions.map((t) => {
    if (
      t.type === 'income' &&
      t.recurringIncomeId === rule.id &&
      t.recurringPeriod &&
      t.recurringPeriod >= targetPeriod &&
      t.status !== 'paid'
    ) {
      return {
        ...t,
        description: nextDescription,
        amount: nextAmount,
        category: nextCategory,
        accountId: nextAccountId,
        paymentMethod: nextPaymentMethod,
        date: resolveClampedDateForPeriod(t.recurringPeriod, nextDayOfMonth),
        notes: nextNotes,
      };
    }
    return t;
  });

  return {
    ...state,
    transactions: nextTransactions,
    recurringIncomes: rules.map((r) => (r.id === rule.id ? updatedRule : r)),
  };
}

export function skipRecurringIncomeOccurrenceInState(
  state: AppState,
  ruleId: string,
  period: string
): AppState {
  const rules = state.recurringIncomes || [];
  const hasPaidTx = state.transactions.some(
    (t) =>
      t.type === 'income' &&
      t.recurringIncomeId === ruleId &&
      t.recurringPeriod === period &&
      t.status === 'paid'
  );
  if (hasPaidTx) return state;

  return {
    ...state,
    recurringIncomes: rules.map((r) =>
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

export function unskipRecurringIncomeOccurrenceInState(
  state: AppState,
  ruleId: string,
  period: string
): AppState {
  const rules = state.recurringIncomes || [];
  return {
    ...state,
    recurringIncomes: rules.map((r) => {
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
 * Encerra/cancela uma regra recorrente a partir de um período (padrão: mês seguinte ou atual sem afetar recebidos),
 * preservando integralmente todos os lançamentos já recebidos no histórico.
 */
export function endRecurringIncomeInState(
  state: AppState,
  ruleId: string,
  deactivatedFromPeriod?: string
): AppState {
  const rules = state.recurringIncomes || [];
  const cutoffPeriod = deactivatedFromPeriod || getTodayPeriod();
  return {
    ...state,
    recurringIncomes: rules.map((r) =>
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
 * Remove a regra de recorrência preservando lançamentos já recebidos no histórico (desvinculando-os).
 */
export function deleteRecurringIncomeRuleInState(state: AppState, ruleId: string): AppState {
  const rules = state.recurringIncomes || [];
  return {
    ...state,
    transactions: state.transactions.map((t) =>
      t.recurringIncomeId === ruleId
        ? { ...t, recurringIncomeId: undefined, recurringPeriod: undefined }
        : t
    ),
    recurringIncomes: rules.filter((r) => r.id !== ruleId),
  };
}
