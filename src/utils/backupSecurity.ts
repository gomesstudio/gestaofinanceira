/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BankAccount,
  Category,
  CreditCard,
  Debt,
  DebtPriority,
  DebtStatus,
  FinancialGoal,
  PaymentMethod,
  RecurringIncomeRule,
  Transaction,
  TransactionStatus,
  TransactionType
} from '../types/finance';
import { AppState, isValidStorageUserId } from './storage';
import { areStatesContentEqual, SyncResult } from '../services/supabaseSyncService';

const VALID_TRANSACTION_TYPES: ReadonlySet<TransactionType> = new Set([
  'income',
  'expense_fixed',
  'expense_variable',
  'transfer',
  'card_payment',
  'debt_payment'
]);

const VALID_PAYMENT_METHODS: ReadonlySet<PaymentMethod> = new Set([
  'pix',
  'money',
  'credit_card',
  'debit_card',
  'bank_slip',
  'bank_transfer'
]);

const VALID_TRANSACTION_STATUSES: ReadonlySet<TransactionStatus> = new Set([
  'paid',
  'pending',
  'overdue'
]);

const VALID_ACCOUNT_TYPES: ReadonlySet<BankAccount['type']> = new Set([
  'checking',
  'savings',
  'cash',
  'investment'
]);

const VALID_DEBT_PRIORITIES: ReadonlySet<DebtPriority> = new Set([
  'low',
  'medium',
  'high',
  'urgent'
]);

const VALID_DEBT_STATUSES: ReadonlySet<DebtStatus> = new Set([
  'no_forecast',
  'waiting_conditions',
  'in_negotiation',
  'in_payment',
  'partially_settled',
  'settled'
]);

export interface BackupPreviewCounts {
  transactions: number;
  categories: number;
  accounts: number;
  creditCards: number;
  debts: number;
  goals: number;
}

export type BackupSourceFormat = 'full_backup' | 'recovery_snapshot';

export interface BackupValidationResult {
  valid: boolean;
  code:
    | 'ok'
    | 'invalid_json'
    | 'invalid_structure'
    | 'missing_owner'
    | 'owner_mismatch'
    | 'incompatible_item';
  error?: string;
  state?: AppState;
  counts?: BackupPreviewCounts;
  version?: number;
  lastModified?: number;
  ownerUserId?: string;
  sourceFormat?: BackupSourceFormat;
  snapshotSavedAt?: string;
  snapshotReason?: string;
}

export interface BackupSafetyDecision {
  allowed: boolean;
  reasonCode:
    | 'ok'
    | 'invalid_backup'
    | 'owner_mismatch'
    | 'cloud_unavailable'
    | 'remote_owner_mismatch'
    | 'outdated_version'
    | 'older_than_cloud'
    | 'cloud_conflict'
    | 'older_than_local'
    | 'sample_over_real_data';
  message: string;
  remoteVersion?: number;
  remoteTimestamp?: number;
  backupVersion?: number;
  backupTimestamp?: number;
}

export interface PreparedBackupRestore {
  backupState: AppState;
  counts: BackupPreviewCounts;
  version: number;
  lastModified: number;
  ownerUserId: string;
  sourceFormat?: BackupSourceFormat;
  snapshotSavedAt?: string;
  snapshotReason?: string;
  remoteStateSnapshot?: AppState;
  remoteVersion?: number;
  remoteTimestamp?: number;
  safety: BackupSafetyDecision;
}

export interface ManualCloudUploadDecision {
  allowed: boolean;
  conflict: boolean;
  alreadySynced: boolean;
  reasonCode:
    | 'ok'
    | 'already_synced'
    | 'unauthenticated'
    | 'invalid_ownership'
    | 'cloud_unavailable'
    | 'remote_newer'
    | 'remote_conflict'
    | 'sample_blocked';
  message: string;
  localVersion: number;
  localTimestamp: number;
  remoteVersion?: number;
  remoteTimestamp?: number;
}

function isPlainObject(val: unknown): val is Record<string, unknown> {
  return typeof val === 'object' && val !== null && !Array.isArray(val);
}

function isNonEmptyString(val: unknown): val is string {
  return typeof val === 'string' && val.trim().length > 0;
}

function isFiniteNonNegativeNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val) && val >= 0;
}

function isFiniteNumber(val: unknown): val is number {
  return typeof val === 'number' && Number.isFinite(val);
}

function isOptionalString(val: unknown): boolean {
  return val === undefined || typeof val === 'string';
}

function isValidTransaction(item: unknown): item is Transaction {
  if (!isPlainObject(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (typeof item.description !== 'string') return false;
  if (!isFiniteNonNegativeNumber(item.amount)) return false;
  if (!VALID_TRANSACTION_TYPES.has(item.type as TransactionType)) return false;
  if (typeof item.category !== 'string') return false;
  if (!isNonEmptyString(item.date)) return false;
  if (!VALID_PAYMENT_METHODS.has(item.paymentMethod as PaymentMethod)) return false;
  if (!VALID_TRANSACTION_STATUSES.has(item.status as TransactionStatus)) return false;
  if (!isOptionalString(item.dueDate)) return false;
  if (!isOptionalString(item.accountId)) return false;
  if (!isOptionalString(item.targetAccountId)) return false;
  if (!isOptionalString(item.creditCardId)) return false;
  if (item.isRecurring !== undefined && typeof item.isRecurring !== 'boolean') return false;
  if (!isOptionalString(item.recurringIncomeId)) return false;
  if (!isOptionalString(item.recurringPeriod)) return false;
  if (!isOptionalString(item.notes)) return false;
  if (!isOptionalString(item.debtId)) return false;
  if (!isOptionalString(item.cardInvoiceMonth)) return false;
  if (item.isInvoicePayment !== undefined && typeof item.isInvoicePayment !== 'boolean') return false;
  if (item.installmentInfo !== undefined) {
    if (!isPlainObject(item.installmentInfo)) return false;
    if (
      !Number.isInteger(item.installmentInfo.current) ||
      (item.installmentInfo.current as number) < 1 ||
      !Number.isInteger(item.installmentInfo.total) ||
      (item.installmentInfo.total as number) < 1
    ) {
      return false;
    }
    if (!isOptionalString(item.installmentInfo.groupId)) return false;
  }
  return true;
}

function isValidCategory(item: unknown): item is Category {
  if (!isPlainObject(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (!isNonEmptyString(item.name)) return false;
  if (item.type !== 'income' && item.type !== 'expense') return false;
  if (typeof item.color !== 'string') return false;
  if (typeof item.icon !== 'string') return false;
  if (item.expenseType !== undefined && item.expenseType !== 'fixed' && item.expenseType !== 'variable') return false;
  if (
    item.incomeGroup !== undefined &&
    item.incomeGroup !== 'main_income' &&
    item.incomeGroup !== 'benefits' &&
    item.incomeGroup !== 'extra_income' &&
    item.incomeGroup !== 'other'
  ) {
    return false;
  }
  if (item.isCustom !== undefined && typeof item.isCustom !== 'boolean') return false;
  return true;
}

function isValidAccount(item: unknown): item is BankAccount {
  if (!isPlainObject(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (!isNonEmptyString(item.name)) return false;
  if (!VALID_ACCOUNT_TYPES.has(item.type as BankAccount['type'])) return false;
  if (!isFiniteNumber(item.balance)) return false;
  if (typeof item.color !== 'string') return false;
  if (!isOptionalString(item.institution)) return false;
  return true;
}

function isValidCreditCard(item: unknown): item is CreditCard {
  if (!isPlainObject(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (!isNonEmptyString(item.name)) return false;
  if (typeof item.color !== 'string') return false;
  if (!isFiniteNonNegativeNumber(item.limitTotal)) return false;
  if (!Number.isInteger(item.closingDay) || (item.closingDay as number) < 1 || (item.closingDay as number) > 31) {
    return false;
  }
  if (!Number.isInteger(item.dueDay) || (item.dueDay as number) < 1 || (item.dueDay as number) > 31) {
    return false;
  }
  if (!isOptionalString(item.linkedAccountId)) return false;
  return true;
}

function isValidDebt(item: unknown): item is Debt {
  if (!isPlainObject(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (!isNonEmptyString(item.name)) return false;
  if (typeof item.creditor !== 'string') return false;
  if (!isFiniteNonNegativeNumber(item.originalAmount)) return false;
  if (!isFiniteNonNegativeNumber(item.currentBalance)) return false;
  if (typeof item.contractDate !== 'string') return false;
  if (typeof item.dueDate !== 'string') return false;
  if (!VALID_DEBT_PRIORITIES.has(item.priority as DebtPriority)) return false;
  if (!VALID_DEBT_STATUSES.has(item.status as DebtStatus)) return false;
  if (!isFiniteNonNegativeNumber(item.totalPaid)) return false;
  if (item.interestRateMonthly !== undefined && !isFiniteNonNegativeNumber(item.interestRateMonthly)) return false;
  if (item.minimumPayment !== undefined && !isFiniteNonNegativeNumber(item.minimumPayment)) return false;
  if (!isOptionalString(item.notes)) return false;
  if (item.paymentsHistory !== undefined) {
    if (!Array.isArray(item.paymentsHistory)) return false;
    for (const pay of item.paymentsHistory) {
      if (!isPlainObject(pay)) return false;
      if (!isNonEmptyString(pay.id)) return false;
      if (!isNonEmptyString(pay.date)) return false;
      if (!isFiniteNonNegativeNumber(pay.amount)) return false;
      if (typeof pay.accountId !== 'string') return false;
      if (!isOptionalString(pay.notes)) return false;
    }
  }
  return true;
}

function isValidGoal(item: unknown): item is FinancialGoal {
  if (!isPlainObject(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (!isNonEmptyString(item.name)) return false;
  if (!isFiniteNonNegativeNumber(item.targetAmount)) return false;
  if (!isFiniteNonNegativeNumber(item.currentAmount)) return false;
  if (typeof item.deadlineDate !== 'string') return false;
  if (!isFiniteNonNegativeNumber(item.monthlyPlannedContribution)) return false;
  if (typeof item.category !== 'string') return false;
  if (typeof item.color !== 'string') return false;
  if (!isOptionalString(item.icon)) return false;
  if (item.completed !== undefined && typeof item.completed !== 'boolean') return false;
  return true;
}

function isValidRecurringIncomeRule(item: unknown): item is RecurringIncomeRule {
  if (!isPlainObject(item)) return false;
  if (!isNonEmptyString(item.id)) return false;
  if (!isNonEmptyString(item.description)) return false;
  if (!isFiniteNonNegativeNumber(item.amount)) return false;
  if (typeof item.category !== 'string') return false;
  if (!isOptionalString(item.accountId)) return false;
  if (!VALID_PAYMENT_METHODS.has(item.paymentMethod as PaymentMethod)) return false;
  if (item.frequency !== 'monthly') return false;
  if (!Number.isInteger(item.dayOfMonth) || (item.dayOfMonth as number) < 1 || (item.dayOfMonth as number) > 31) {
    return false;
  }
  if (!isNonEmptyString(item.startDate)) return false;
  if (!isNonEmptyString(item.startPeriod)) return false;
  if (typeof item.isIndefinite !== 'boolean') return false;
  if (!isOptionalString(item.endDate)) return false;
  if (!isOptionalString(item.endPeriod)) return false;
  if (typeof item.isActive !== 'boolean') return false;
  if (!isOptionalString(item.deactivatedFromPeriod)) return false;
  if (!isOptionalString(item.notes)) return false;
  if (item.schedules !== undefined) {
    if (!Array.isArray(item.schedules)) return false;
    for (const sched of item.schedules) {
      if (!isPlainObject(sched)) return false;
      if (!isNonEmptyString(sched.effectiveFromPeriod)) return false;
      if (!isFiniteNonNegativeNumber(sched.amount)) return false;
      if (
        sched.dayOfMonth !== undefined &&
        (!Number.isInteger(sched.dayOfMonth) || (sched.dayOfMonth as number) < 1 || (sched.dayOfMonth as number) > 31)
      ) {
        return false;
      }
    }
  }
  if (item.overrides !== undefined) {
    if (!isPlainObject(item.overrides)) return false;
    for (const ov of Object.values(item.overrides)) {
      if (!isPlainObject(ov)) return false;
      if (ov.amount !== undefined && !isFiniteNonNegativeNumber(ov.amount)) return false;
      if (ov.skipped !== undefined && typeof ov.skipped !== 'boolean') return false;
    }
  }
  return true;
}

export function hasRealFinancialData(
  state: Pick<AppState, 'isSampleLoaded' | 'transactions' | 'debts' | 'goals' | 'recurringIncomes'>
): boolean {
  if (state.isSampleLoaded) return false;
  return (
    (state.transactions?.length || 0) > 0 ||
    (state.debts?.length || 0) > 0 ||
    (state.goals?.length || 0) > 0 ||
    (state.recurringIncomes?.length || 0) > 0
  );
}

const ALLOWED_RECOVERY_ENVELOPE_KEYS = new Set([
  'snapshotId',
  'savedAt',
  'reason',
  'ownerUserId',
  'state'
]);

const ROOT_STATE_COLLECTION_KEYS = [
  'transactions',
  'categories',
  'accounts',
  'creditCards',
  'debts',
  'goals'
] as const;

/**
 * Faz parsing e validação completa do JSON de backup (ou de Ponto de Recuperação exportado)
 * SEM mutar nenhum estado nem reescrever ownerUserId.
 */
export function validateBackupJsonStructure(
  rawJson: string,
  expectedUserId: string
): BackupValidationResult {
  if (!isValidStorageUserId(expectedUserId)) {
    return {
      valid: false,
      code: 'missing_owner',
      error: 'Sessão inválida. Autentique-se antes de validar backups.'
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawJson);
  } catch {
    return {
      valid: false,
      code: 'invalid_json',
      error: 'O arquivo selecionado não contém um JSON válido.'
    };
  }

  if (!isPlainObject(parsed)) {
    return {
      valid: false,
      code: 'invalid_structure',
      error: 'Estrutura de backup inválida: o arquivo deve representar um objeto financeiro completo.'
    };
  }

  const hasEnvelopeState = 'state' in parsed;
  const hasRootCollections = ROOT_STATE_COLLECTION_KEYS.some(key => key in parsed);

  if (hasEnvelopeState && hasRootCollections) {
    return {
      valid: false,
      code: 'invalid_structure',
      error: 'Arquivo inválido: estrutura mista incompatível entre backup completo e ponto de recuperação.'
    };
  }

  let stateCandidate: Record<string, unknown>;
  let sourceFormat: BackupSourceFormat = 'full_backup';
  let snapshotSavedAt: string | undefined;
  let snapshotReason: string | undefined;

  if (hasEnvelopeState) {
    const unknownEnvelopeKeys = Object.keys(parsed).filter(
      key => !ALLOWED_RECOVERY_ENVELOPE_KEYS.has(key)
    );
    if (unknownEnvelopeKeys.length > 0) {
      return {
        valid: false,
        code: 'invalid_structure',
        error: 'Ponto de recuperação inválido: o envelope contém campos desconhecidos ou incompatíveis.'
      };
    }

    if (!isValidStorageUserId(parsed.ownerUserId as string)) {
      return {
        valid: false,
        code: 'missing_owner',
        error: 'Ponto de recuperação rejeitado: o envelope não possui ownerUserId (UUID do proprietário) válido.'
      };
    }

    if (parsed.ownerUserId !== expectedUserId) {
      return {
        valid: false,
        code: 'owner_mismatch',
        error: 'Backup bloqueado: este arquivo pertence a outro usuário e não pode ser restaurado nesta conta.'
      };
    }

    if (!isNonEmptyString(parsed.savedAt) || Number.isNaN(Date.parse(parsed.savedAt))) {
      return {
        valid: false,
        code: 'invalid_structure',
        error: 'Ponto de recuperação inválido: o campo "savedAt" deve conter uma data ISO válida.'
      };
    }

    if (!isNonEmptyString(parsed.reason)) {
      return {
        valid: false,
        code: 'invalid_structure',
        error: 'Ponto de recuperação inválido: o campo "reason" é obrigatório.'
      };
    }

    if ('snapshotId' in parsed && !isNonEmptyString(parsed.snapshotId)) {
      return {
        valid: false,
        code: 'invalid_structure',
        error: 'Ponto de recuperação inválido: o campo "snapshotId" deve ser um identificador válido.'
      };
    }

    if (!isPlainObject(parsed.state)) {
      return {
        valid: false,
        code: 'invalid_structure',
        error: 'Ponto de recuperação inválido: o campo interno "state" deve representar um estado financeiro completo.'
      };
    }

    if (!isValidStorageUserId(parsed.state.ownerUserId as string)) {
      return {
        valid: false,
        code: 'missing_owner',
        error: 'Ponto de recuperação rejeitado: o estado interno não possui ownerUserId (UUID do proprietário) válido.'
      };
    }

    if (parsed.state.ownerUserId !== expectedUserId || parsed.state.ownerUserId !== parsed.ownerUserId) {
      return {
        valid: false,
        code: 'owner_mismatch',
        error: 'Backup bloqueado: divergência entre o proprietário do envelope e os dados internos do ponto de recuperação.'
      };
    }

    stateCandidate = parsed.state;
    sourceFormat = 'recovery_snapshot';
    snapshotSavedAt = parsed.savedAt;
    snapshotReason = parsed.reason;
  } else {
    // Validação estrita de propriedade no backup completo (nunca reescrever ownerUserId)
    if (!isValidStorageUserId(parsed.ownerUserId as string)) {
      return {
        valid: false,
        code: 'missing_owner',
        error: 'Backup rejeitado: o arquivo não possui ownerUserId (UUID do proprietário) válido.'
      };
    }

    if (parsed.ownerUserId !== expectedUserId) {
      return {
        valid: false,
        code: 'owner_mismatch',
        error: 'Backup bloqueado: este arquivo pertence a outro usuário e não pode ser restaurado nesta conta.'
      };
    }

    stateCandidate = parsed;
  }

  if (!Number.isInteger(stateCandidate.version) || (stateCandidate.version as number) < 1) {
    return {
      valid: false,
      code: 'invalid_structure',
      error: 'Backup inválido: o campo "version" deve ser um número inteiro positivo.'
    };
  }

  if (!isFiniteNonNegativeNumber(stateCandidate.lastModified)) {
    return {
      valid: false,
      code: 'invalid_structure',
      error: 'Backup inválido: o campo "lastModified" (timestamp) é obrigatório e deve ser numérico.'
    };
  }

  if (
    !Array.isArray(stateCandidate.transactions) ||
    !Array.isArray(stateCandidate.categories) ||
    !Array.isArray(stateCandidate.accounts) ||
    !Array.isArray(stateCandidate.creditCards) ||
    !Array.isArray(stateCandidate.debts) ||
    !Array.isArray(stateCandidate.goals)
  ) {
    return {
      valid: false,
      code: 'invalid_structure',
      error:
        'Backup incompleto: são obrigatórias todas as coleções (transactions, categories, accounts, creditCards, debts e goals).'
    };
  }

  if (!isFiniteNonNegativeNumber(stateCandidate.safetyReserveDesired)) {
    return {
      valid: false,
      code: 'invalid_structure',
      error: 'Backup inválido: "safetyReserveDesired" deve ser um número válido não negativo.'
    };
  }

  if (typeof stateCandidate.isSampleLoaded !== 'boolean') {
    return {
      valid: false,
      code: 'invalid_structure',
      error: 'Backup inválido: o campo booleano "isSampleLoaded" é obrigatório.'
    };
  }

  const invalidTxIndex = stateCandidate.transactions.findIndex(item => !isValidTransaction(item));
  if (invalidTxIndex !== -1) {
    return {
      valid: false,
      code: 'incompatible_item',
      error: `Backup incompatível: lançamento financeiro #${invalidTxIndex + 1} possui campos ausentes ou tipos inválidos.`
    };
  }

  const invalidCatIndex = stateCandidate.categories.findIndex(item => !isValidCategory(item));
  if (invalidCatIndex !== -1) {
    return {
      valid: false,
      code: 'incompatible_item',
      error: `Backup incompatível: categoria #${invalidCatIndex + 1} possui campos ausentes ou tipos inválidos.`
    };
  }

  const invalidAccIndex = stateCandidate.accounts.findIndex(item => !isValidAccount(item));
  if (invalidAccIndex !== -1) {
    return {
      valid: false,
      code: 'incompatible_item',
      error: `Backup incompatível: conta bancária #${invalidAccIndex + 1} possui campos ausentes ou tipos inválidos.`
    };
  }

  const invalidCardIndex = stateCandidate.creditCards.findIndex(item => !isValidCreditCard(item));
  if (invalidCardIndex !== -1) {
    return {
      valid: false,
      code: 'incompatible_item',
      error: `Backup incompatível: cartão de crédito #${invalidCardIndex + 1} possui campos ausentes ou tipos inválidos.`
    };
  }

  const invalidDebtIndex = stateCandidate.debts.findIndex(item => !isValidDebt(item));
  if (invalidDebtIndex !== -1) {
    return {
      valid: false,
      code: 'incompatible_item',
      error: `Backup incompatível: dívida #${invalidDebtIndex + 1} possui campos ausentes ou tipos inválidos.`
    };
  }

  const invalidGoalIndex = stateCandidate.goals.findIndex(item => !isValidGoal(item));
  if (invalidGoalIndex !== -1) {
    return {
      valid: false,
      code: 'incompatible_item',
      error: `Backup incompatível: objetivo financeiro #${invalidGoalIndex + 1} possui campos ausentes ou tipos inválidos.`
    };
  }

  if (stateCandidate.recurringIncomes !== undefined) {
    if (!Array.isArray(stateCandidate.recurringIncomes)) {
      return {
        valid: false,
        code: 'invalid_structure',
        error: 'Backup inválido: o campo "recurringIncomes" deve ser uma lista válida.'
      };
    }
    const invalidRecurringIndex = stateCandidate.recurringIncomes.findIndex(
      item => !isValidRecurringIncomeRule(item)
    );
    if (invalidRecurringIndex !== -1) {
      return {
        valid: false,
        code: 'incompatible_item',
        error: `Backup incompatível: receita fixa recorrente #${invalidRecurringIndex + 1} possui campos ausentes ou tipos inválidos.`
      };
    }
  }

  const validatedState: AppState = {
    ownerUserId: expectedUserId,
    version: stateCandidate.version as number,
    lastModified: stateCandidate.lastModified as number,
    transactions: stateCandidate.transactions as Transaction[],
    categories: stateCandidate.categories as Category[],
    accounts: stateCandidate.accounts as BankAccount[],
    creditCards: stateCandidate.creditCards as CreditCard[],
    debts: stateCandidate.debts as Debt[],
    goals: stateCandidate.goals as FinancialGoal[],
    ...(Array.isArray(stateCandidate.recurringIncomes)
      ? { recurringIncomes: stateCandidate.recurringIncomes as RecurringIncomeRule[] }
      : {}),
    safetyReserveDesired: stateCandidate.safetyReserveDesired as number,
    isSampleLoaded: stateCandidate.isSampleLoaded as boolean
  };

  const counts: BackupPreviewCounts = {
    transactions: validatedState.transactions.length,
    categories: validatedState.categories.length,
    accounts: validatedState.accounts.length,
    creditCards: validatedState.creditCards.length,
    debts: validatedState.debts.length,
    goals: validatedState.goals.length
  };

  return {
    valid: true,
    code: 'ok',
    state: validatedState,
    counts,
    version: validatedState.version,
    lastModified: validatedState.lastModified,
    ownerUserId: expectedUserId,
    sourceFormat,
    snapshotSavedAt,
    snapshotReason
  };
}

/**
 * Avalia se a restauração do backup validado é segura diante do estado remoto na nuvem e do estado local ativo.
 * Nunca utiliza Date.now() para disfarçar backup antigo como mais recente.
 */
export function evaluateBackupRestorationSafety(params: {
  backupState: AppState;
  currentLocalState: AppState;
  remoteResult: SyncResult;
  expectedUserId: string;
}): BackupSafetyDecision {
  const { backupState, currentLocalState, remoteResult, expectedUserId } = params;
  const backupVersion = backupState.version;
  const backupTimestamp = backupState.lastModified || 0;

  if (!backupState.ownerUserId || backupState.ownerUserId !== expectedUserId) {
    return {
      allowed: false,
      reasonCode: 'owner_mismatch',
      message: 'Restauração bloqueada: o backup não pertence ao usuário autenticado.',
      backupVersion,
      backupTimestamp
    };
  }

  // Sem consulta válida à nuvem, bloqueia para impedir sobrescrita cega de estado remoto mais recente
  if (!remoteResult.success) {
    return {
      allowed: false,
      reasonCode: 'cloud_unavailable',
      message:
        'Restauração bloqueada: não foi possível consultar o estado atual na nuvem para garantir que dados mais recentes não serão sobrescritos.',
      backupVersion,
      backupTimestamp
    };
  }

  // Impede restauração de arquivo demonstrativo sobre dados financeiros reais
  if (
    backupState.isSampleLoaded &&
    (hasRealFinancialData(currentLocalState) || (remoteResult.data && hasRealFinancialData(remoteResult.data)))
  ) {
    return {
      allowed: false,
      reasonCode: 'sample_over_real_data',
      message:
        'Restauração bloqueada: o arquivo contém dados demonstrativos e esta conta já possui registros financeiros reais.'
    };
  }

  if (remoteResult.data) {
    const remoteState = remoteResult.data;
    const remoteVersion = remoteResult.version ?? remoteState.version ?? 1;
    const remoteTimestamp = remoteResult.clientTimestamp ?? remoteState.lastModified ?? 0;

    if (remoteState.ownerUserId && remoteState.ownerUserId !== expectedUserId) {
      return {
        allowed: false,
        reasonCode: 'remote_owner_mismatch',
        message: 'Restauração bloqueada: divergência de proprietário no registro remoto.',
        remoteVersion,
        remoteTimestamp,
        backupVersion,
        backupTimestamp
      };
    }

    const contentEqualRemote = areStatesContentEqual(backupState, remoteState);

    if (backupVersion < remoteVersion && !contentEqualRemote) {
      return {
        allowed: false,
        reasonCode: 'outdated_version',
        message: `Restauração bloqueada: o backup (versão v${backupVersion}) é anterior à versão atual na nuvem (v${remoteVersion}).`,
        remoteVersion,
        remoteTimestamp,
        backupVersion,
        backupTimestamp
      };
    }

    if (remoteTimestamp > 0 && backupTimestamp < remoteTimestamp && !contentEqualRemote) {
      return {
        allowed: false,
        reasonCode: 'older_than_cloud',
        message: `Restauração bloqueada: o backup (${new Date(backupTimestamp).toLocaleString('pt-BR')}) é mais antigo do que os dados salvos na nuvem (${new Date(remoteTimestamp).toLocaleString('pt-BR')}).`,
        remoteVersion,
        remoteTimestamp,
        backupVersion,
        backupTimestamp
      };
    }

    if (backupTimestamp === remoteTimestamp && !contentEqualRemote) {
      return {
        allowed: false,
        reasonCode: 'cloud_conflict',
        message:
          'Restauração bloqueada: o backup possui o mesmo timestamp da nuvem, mas o conteúdo financeiro diverge. Exporte o estado atual antes de prosseguir.',
        remoteVersion,
        remoteTimestamp,
        backupVersion,
        backupTimestamp
      };
    }
  }

  // Proteção também contra perda de alterações locais recentes ainda não enviadas
  if (
    currentLocalState.ownerUserId === expectedUserId &&
    !currentLocalState.isSampleLoaded &&
    (currentLocalState.lastModified || 0) > 0 &&
    !areStatesContentEqual(backupState, currentLocalState)
  ) {
    const localTimestamp = currentLocalState.lastModified || 0;
    if (backupVersion < currentLocalState.version || backupTimestamp < localTimestamp) {
      return {
        allowed: false,
        reasonCode: 'older_than_local',
        message: `Restauração bloqueada: o backup (v${backupVersion}) é mais antigo do que os dados atualmente carregados nesta conta (v${currentLocalState.version}).`,
        remoteVersion: remoteResult.version,
        remoteTimestamp: remoteResult.clientTimestamp,
        backupVersion,
        backupTimestamp
      };
    }
  }

  return {
    allowed: true,
    reasonCode: 'ok',
    message: remoteResult.data
      ? 'Backup validado e compatível com os dados da nuvem.'
      : 'Backup validado com sucesso para esta conta.',
    remoteVersion: remoteResult.version,
    remoteTimestamp: remoteResult.clientTimestamp,
    backupVersion,
    backupTimestamp
  };
}

/**
 * Avalia se o envio manual forçado (`forceUploadLocalToCloud`) é seguro ou se existe conflito / versão remota mais recente.
 */
export function evaluateManualCloudUploadSafety(params: {
  localState: AppState;
  remoteResult: SyncResult;
  expectedUserId: string;
}): ManualCloudUploadDecision {
  const { localState, remoteResult, expectedUserId } = params;
  const localVersion = localState.version || 0;
  const localTimestamp = localState.lastModified || 0;

  if (!isValidStorageUserId(expectedUserId)) {
    return {
      allowed: false,
      conflict: false,
      alreadySynced: false,
      reasonCode: 'unauthenticated',
      message: 'Sessão não autenticada.',
      localVersion,
      localTimestamp
    };
  }

  if (localState.ownerUserId !== expectedUserId || localVersion <= 0) {
    return {
      allowed: false,
      conflict: false,
      alreadySynced: false,
      reasonCode: 'invalid_ownership',
      message: 'Envio bloqueado: estado local sem propriedade confirmada para esta conta.',
      localVersion,
      localTimestamp
    };
  }

  if (localState.isSampleLoaded && localTimestamp <= 0) {
    return {
      allowed: false,
      conflict: false,
      alreadySynced: false,
      reasonCode: 'sample_blocked',
      message: 'Envio bloqueado: dados demonstrativos iniciais não substituem registros reais na nuvem.',
      localVersion,
      localTimestamp
    };
  }

  if (!remoteResult.success) {
    // Se a tabela não existe ainda, a chamada externa tratará table_missing, mas sem resposta remota válida bloqueamos
    return {
      allowed: false,
      conflict: false,
      alreadySynced: false,
      reasonCode: 'cloud_unavailable',
      message: remoteResult.message || 'Não foi possível verificar o estado atual na nuvem antes do envio.',
      localVersion,
      localTimestamp
    };
  }

  if (!remoteResult.data) {
    return {
      allowed: true,
      conflict: false,
      alreadySynced: false,
      reasonCode: 'ok',
      message: 'Nenhum registro anterior na nuvem. Envio autorizado.',
      localVersion,
      localTimestamp
    };
  }

  const remoteState = remoteResult.data;
  const remoteVersion = remoteResult.version ?? remoteState.version ?? 1;
  const remoteTimestamp = remoteResult.clientTimestamp ?? remoteState.lastModified ?? 0;

  if (areStatesContentEqual(localState, remoteState)) {
    return {
      allowed: false,
      conflict: false,
      alreadySynced: true,
      reasonCode: 'already_synced',
      message: 'Os dados locais e da nuvem já estão idênticos e sincronizados.',
      localVersion,
      localTimestamp,
      remoteVersion,
      remoteTimestamp
    };
  }

  if (localState.isSampleLoaded && hasRealFinancialData(remoteState)) {
    return {
      allowed: false,
      conflict: true,
      alreadySynced: false,
      reasonCode: 'sample_blocked',
      message:
        'Envio bloqueado: o dispositivo está com dados demonstrativos e a nuvem contém dados financeiros reais.',
      localVersion,
      localTimestamp,
      remoteVersion,
      remoteTimestamp
    };
  }

  if (remoteTimestamp > localTimestamp || remoteVersion > localVersion) {
    return {
      allowed: false,
      conflict: true,
      alreadySynced: false,
      reasonCode: 'remote_newer',
      message: `Conflito detectado: a nuvem possui alterações mais recentes (v${remoteVersion}, ${new Date(remoteTimestamp).toLocaleString('pt-BR')}) do que este dispositivo (v${localVersion}, ${localTimestamp > 0 ? new Date(localTimestamp).toLocaleString('pt-BR') : 'sem edição'}). Nenhuma sobrescrita automática foi realizada — baixe da nuvem ou exporte seu backup antes de agir.`,
      localVersion,
      localTimestamp,
      remoteVersion,
      remoteTimestamp
    };
  }

  if (remoteTimestamp === localTimestamp) {
    return {
      allowed: false,
      conflict: true,
      alreadySynced: false,
      reasonCode: 'remote_conflict',
      message:
        'Conflito detectado: o estado local e o estado na nuvem possuem o mesmo timestamp, mas conteúdos divergentes. Baixe da nuvem ou exporte um backup JSON para não perder alterações.',
      localVersion,
      localTimestamp,
      remoteVersion,
      remoteTimestamp
    };
  }

  return {
    allowed: true,
    conflict: false,
    alreadySynced: false,
    reasonCode: 'ok',
    message: 'Estado local mais recente confirmado. Envio seguro para a nuvem.',
    localVersion,
    localTimestamp,
    remoteVersion,
    remoteTimestamp
  };
}
