/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type TransactionType = 'income' | 'expense_fixed' | 'expense_variable' | 'transfer' | 'card_payment' | 'debt_payment';

export type PaymentMethod = 'pix' | 'money' | 'credit_card' | 'debit_card' | 'bank_slip' | 'bank_transfer';

export type TransactionStatus = 'paid' | 'pending' | 'overdue';

export type IncomeGroup = 'main_income' | 'benefits' | 'extra_income' | 'other';

export type DebtStatus = 
  | 'no_forecast'               // Sem previsão de pagamento
  | 'waiting_conditions'        // Aguardando condições financeiras
  | 'in_negotiation'           // Em negociação
  | 'in_payment'               // Em pagamento
  | 'partially_settled'        // Parcialmente quitada
  | 'settled';                 // Quitada

export type DebtPriority = 'low' | 'medium' | 'high' | 'urgent';

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense';
  expenseType?: 'fixed' | 'variable';
  incomeGroup?: IncomeGroup;
  color: string;
  icon: string;
  isCustom?: boolean;
}

export interface BankAccount {
  id: string;
  name: string;
  type: 'checking' | 'savings' | 'cash' | 'investment';
  balance: number;
  color: string;
  institution?: string;
}

export interface CreditCard {
  id: string;
  name: string;
  color: string;
  limitTotal: number;
  closingDay: number; // dia de fechamento (1-31)
  dueDay: number;     // dia de vencimento (1-31)
  linkedAccountId?: string; // conta de onde a fatura é debitada habitualmente
}

export interface Debt {
  id: string;
  name: string;
  creditor: string;
  originalAmount: number;
  currentBalance: number;
  contractDate: string; // YYYY-MM-DD
  dueDate: string;      // YYYY-MM-DD
  interestRateMonthly?: number; // % ao mês
  minimumPayment?: number;
  priority: DebtPriority;
  status: DebtStatus;
  notes?: string;
  totalPaid: number;
  paymentsHistory?: Array<{
    id: string;
    date: string;
    amount: number;
    accountId: string;
    notes?: string;
  }>;
}

export interface FinancialGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  deadlineDate: string; // YYYY-MM-DD
  monthlyPlannedContribution: number;
  category: string;
  color: string;
  icon?: string;
  completed?: boolean;
}

export type RecurringFrequency = 'monthly';

export type RecurringIncomeOccurrenceStatus = 'received' | 'predicted' | 'overdue' | 'skipped';

export interface RecurringIncomeScheduleEntry {
  effectiveFromPeriod: string; // YYYY-MM
  amount: number;
  dayOfMonth?: number;
  description?: string;
  category?: string;
  accountId?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface RecurringIncomeMonthOverride {
  amount?: number;
  dayOfMonth?: number;
  customDate?: string; // YYYY-MM-DD
  description?: string;
  category?: string;
  accountId?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  skipped?: boolean;
}

export interface RecurringIncomeRule {
  id: string;
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  paymentMethod: PaymentMethod;
  frequency: RecurringFrequency;
  dayOfMonth: number; // 1-31 (ajustado dinamicamente em meses curtos sem perder a configuração original)
  startDate: string; // YYYY-MM-DD
  startPeriod: string; // YYYY-MM
  isIndefinite: boolean;
  endDate?: string; // YYYY-MM-DD
  endPeriod?: string; // YYYY-MM
  isActive: boolean;
  deactivatedFromPeriod?: string; // YYYY-MM
  notes?: string;
  schedules?: RecurringIncomeScheduleEntry[];
  overrides?: Record<string, RecurringIncomeMonthOverride>;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringIncomeOccurrence {
  id: string;
  ruleId: string;
  period: string; // YYYY-MM
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  paymentMethod: PaymentMethod;
  scheduledDate: string; // YYYY-MM-DD
  date: string; // YYYY-MM-DD (data prevista ou data real se já recebida)
  configuredDayOfMonth: number;
  status: RecurringIncomeOccurrenceStatus;
  isIndefinite: boolean;
  endDate?: string;
  transactionId?: string;
  notes?: string;
  isVirtual: boolean;
  isLegacy?: boolean;
}

export type RecurringExpenseOccurrenceStatus = 'paid' | 'predicted' | 'overdue' | 'skipped';

export interface RecurringExpenseScheduleEntry {
  effectiveFromPeriod: string; // YYYY-MM
  amount: number;
  dayOfMonth?: number;
  description?: string;
  category?: string;
  accountId?: string;
  creditCardId?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
}

export interface RecurringExpenseMonthOverride {
  amount?: number;
  dayOfMonth?: number;
  customDate?: string; // YYYY-MM-DD
  description?: string;
  category?: string;
  accountId?: string;
  creditCardId?: string;
  paymentMethod?: PaymentMethod;
  notes?: string;
  skipped?: boolean;
}

export interface RecurringExpenseRule {
  id: string;
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  creditCardId?: string;
  paymentMethod: PaymentMethod;
  frequency: RecurringFrequency;
  dayOfMonth: number; // 1-31 (ajustado dinamicamente em meses curtos sem perder a configuração original)
  startDate: string; // YYYY-MM-DD
  startPeriod: string; // YYYY-MM
  isIndefinite: boolean;
  endDate?: string; // YYYY-MM-DD
  endPeriod?: string; // YYYY-MM
  isActive: boolean;
  deactivatedFromPeriod?: string; // YYYY-MM
  notes?: string;
  schedules?: RecurringExpenseScheduleEntry[];
  overrides?: Record<string, RecurringExpenseMonthOverride>;
  createdAt: string;
  updatedAt: string;
}

export interface RecurringExpenseOccurrence {
  id: string;
  ruleId: string;
  period: string; // YYYY-MM
  description: string;
  amount: number;
  category: string;
  accountId?: string;
  creditCardId?: string;
  paymentMethod: PaymentMethod;
  scheduledDate: string; // YYYY-MM-DD
  date: string; // YYYY-MM-DD (data prevista ou data real se já paga)
  configuredDayOfMonth: number;
  status: RecurringExpenseOccurrenceStatus;
  isIndefinite: boolean;
  endDate?: string;
  transactionId?: string;
  notes?: string;
  isVirtual: boolean;
  isLegacy?: boolean;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number; // Sempre positivo, o tipo define a operação
  type: TransactionType;
  category: string; // Nome ou ID da categoria
  date: string; // YYYY-MM-DD (data da realização / compra)
  dueDate?: string; // YYYY-MM-DD (vencimento, quando aplicável)
  accountId?: string; // Conta bancária debitada/creditada
  targetAccountId?: string; // Para transferências entre contas
  creditCardId?: string; // Se pago no cartão de crédito
  paymentMethod: PaymentMethod;
  status: TransactionStatus;
  isRecurring?: boolean;
  recurringIncomeId?: string;
  recurringExpenseId?: string;
  recurringPeriod?: string; // YYYY-MM
  notes?: string;
  
  // Parcelamento
  installmentInfo?: {
    current: number;
    total: number;
    groupId?: string; // Id que agrupa todas as parcelas
  };

  // Vínculos especiais (para não duplicar consumo)
  debtId?: string; // Se for pagamento de dívida
  cardInvoiceMonth?: string; // Ex: '2026-11' se for lançamento de cartão
  isInvoicePayment?: boolean; // Se for o pagamento da fatura (não duplica como despesa de consumo)

  // Propriedades transitórias em tempo de execução para itens virtuais projetados (nunca persistidas)
  isVirtualProjection?: boolean;
  projectedStatus?: RecurringIncomeOccurrenceStatus | RecurringExpenseOccurrenceStatus;
}

export type TimeFilterPeriod = 
  | 'current_month' 
  | 'next_month' 
  | 'next_3_months' 
  | 'next_6_months' 
  | 'specific_month'
  | 'previous_month' 
  | 'last_3_months' 
  | 'last_6_months' 
  | 'last_12_months' 
  | 'custom' 
  | 'all';

export interface DateFilter {
  period: TimeFilterPeriod;
  startDate?: string;
  endDate?: string;
  year?: number;
  month?: number; // 0-11
}

export interface FutureCommitmentItem {
  id: string;
  description: string;
  amount: number;
  type: 'fixed_recurring' | 'card_installment' | 'debt_commitment' | 'scheduled_expense';
  category: string;
  dueDate: string;
  originName?: string;
  installmentLabel?: string;
}

export interface MonthProjection {
  year: number;
  month: number; // 0-11
  label: string; // Ex: 'Dezembro/2026'
  shortLabel: string; // Ex: 'Dez/26'
  totalIncomeProjected: number;
  totalOwedTotal: number; // O quanto estarei devendo no mês
  fixedExpensesProjected: number;
  cardInstallmentsProjected: number;
  debtsProjected: number;
  projectedFreeBalance: number;
  projectedCumulativeBalance: number;
  isFuture: boolean;
  isCurrent: boolean;
  commitments: FutureCommitmentItem[];
}

export interface PurchaseSimulationResult {
  purchaseAmount: number;
  freeMoneyBefore: number;
  freeMoneyAfter: number;
  percentCommitted: number;
  canAfford: boolean;
  riskLevel: 'safe' | 'caution' | 'danger';
  feedbackMessage: string;
}
