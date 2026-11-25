/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  BankAccount,
  CreditCard,
  Debt,
  RecurringIncomeRule,
  Transaction
} from '../types/finance';

export type AccountType = BankAccount['type'];

export interface AccountTypeMeta {
  type: AccountType;
  label: string;
  shortLabel: string;
  description: string;
}

export const ACCOUNT_TYPE_LIST: AccountTypeMeta[] = [
  {
    type: 'checking',
    label: 'Conta Corrente',
    shortLabel: 'Corrente',
    description: 'Movimentação diária, PIX, débito e recebimentos'
  },
  {
    type: 'savings',
    label: 'Poupança / Reserva',
    shortLabel: 'Poupança',
    description: 'Reserva de emergência e economias'
  },
  {
    type: 'cash',
    label: 'Dinheiro em Espécie',
    shortLabel: 'Dinheiro',
    description: 'Carteira física e valores em espécie'
  },
  {
    type: 'investment',
    label: 'Investimento',
    shortLabel: 'Investimento',
    description: 'Aplicações financeiras e liquidez'
  }
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  checking: 'Conta Corrente',
  savings: 'Poupança / Reserva',
  cash: 'Dinheiro em Espécie',
  investment: 'Investimento'
};

export const ACCOUNT_COLOR_PRESETS = [
  { value: '#059669', label: 'Esmeralda' },
  { value: '#2563eb', label: 'Azul' },
  { value: '#7c3aed', label: 'Roxo' },
  { value: '#0891b2', label: 'Ciano' },
  { value: '#d97706', label: 'Âmbar' },
  { value: '#e11d48', label: 'Rosa' },
  { value: '#334155', label: 'Ardósia' }
];

export interface AccountDependencies {
  transactionsCount: number;
  creditCardsCount: number;
  recurringIncomesCount: number;
  debtPaymentsCount: number;
  totalCount: number;
  reasons: string[];
}

export function getAccountDependencies(
  accountId: string,
  data: {
    transactions: Transaction[];
    creditCards: CreditCard[];
    recurringIncomes: RecurringIncomeRule[];
    debts: Debt[];
  }
): AccountDependencies {
  const transactionsCount = data.transactions.filter(
    tx => tx.accountId === accountId || tx.targetAccountId === accountId
  ).length;

  const creditCardsCount = data.creditCards.filter(
    card => card.linkedAccountId === accountId
  ).length;

  const recurringIncomesCount = data.recurringIncomes.filter(
    rule => rule.accountId === accountId
  ).length;

  const debtPaymentsCount = data.debts.reduce((acc, debt) => {
    const count = (debt.paymentsHistory || []).filter(p => p.accountId === accountId).length;
    return acc + count;
  }, 0);

  const reasons: string[] = [];
  if (transactionsCount > 0) {
    reasons.push(
      `${transactionsCount} ${transactionsCount === 1 ? 'lançamento no extrato' : 'lançamentos no extrato'}`
    );
  }
  if (creditCardsCount > 0) {
    reasons.push(
      `${creditCardsCount} ${creditCardsCount === 1 ? 'cartão vinculado' : 'cartões vinculados'}`
    );
  }
  if (recurringIncomesCount > 0) {
    reasons.push(
      `${recurringIncomesCount} ${recurringIncomesCount === 1 ? 'receita fixa recorrente' : 'receitas fixas recorrentes'}`
    );
  }
  if (debtPaymentsCount > 0) {
    reasons.push(
      `${debtPaymentsCount} ${debtPaymentsCount === 1 ? 'amortização de dívida' : 'amortizações de dívidas'}`
    );
  }

  return {
    transactionsCount,
    creditCardsCount,
    recurringIncomesCount,
    debtPaymentsCount,
    totalCount:
      transactionsCount + creditCardsCount + recurringIncomesCount + debtPaymentsCount,
    reasons
  };
}

export interface AccountTypeDistributionItem {
  type: AccountType;
  label: string;
  count: number;
  totalBalance: number;
  sharePercent: number;
}

export function getAccountBalanceDistribution(
  accounts: BankAccount[]
): AccountTypeDistributionItem[] {
  const positiveTotal = accounts.reduce(
    (sum, acc) => sum + Math.max(0, acc.balance || 0),
    0
  );

  return ACCOUNT_TYPE_LIST.map(meta => {
    const matching = accounts.filter(acc => acc.type === meta.type);
    const totalBalance = matching.reduce((sum, acc) => sum + (acc.balance || 0), 0);
    const sharePercent =
      positiveTotal > 0 ? Math.max(0, (Math.max(0, totalBalance) / positiveTotal) * 100) : 0;

    return {
      type: meta.type,
      label: meta.label,
      count: matching.length,
      totalBalance,
      sharePercent
    };
  });
}

export function parseCurrencyInput(rawValue: string): number {
  const trimmed = rawValue.trim().replace(/\s+/g, '');
  if (!trimmed) return 0;

  const isNegative = trimmed.startsWith('-');
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;

  const normalized = unsigned.includes(',')
    ? unsigned.replace(/\./g, '').replace(',', '.')
    : unsigned;

  const parsed = parseFloat(normalized);
  if (Number.isNaN(parsed) || !Number.isFinite(parsed)) {
    return 0;
  }

  return isNegative ? -parsed : parsed;
}

export function formatCurrencyInputInitial(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
