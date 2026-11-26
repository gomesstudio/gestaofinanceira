/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';
import {
  Receipt,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Copy,
  Edit2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  Wallet,
  Plus,
  Repeat,
  Calendar
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO } from '../../utils/formatters';
import {
  groupTransactionsByMonth,
  isVirtualTransaction,
  resolveActivePeriod
} from '../../utils/periodFilter';
import {
  PaymentMethod,
  RecurringExpenseOccurrence,
  RecurringIncomeOccurrence,
  Transaction,
  TransactionStatus
} from '../../types/finance';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export interface TransactionsViewProps {
  accountFilter?: string;
  onAccountFilterChange?: (accountId: string) => void;
}

export const TransactionsView: React.FC<TransactionsViewProps> = ({
  accountFilter: controlledAccountFilter,
  onAccountFilterChange
}) => {
  const {
    transactions,
    filteredTransactions,
    filter,
    activePeriod: ctxActivePeriod,
    periodLabel: ctxPeriodLabel,
    accounts,
    creditCards,
    categories,
    selectedMonthRecurringIncomes = [],
    selectedMonthRecurringExpenses = [],
    confirmRecurringIncomeReceipt,
    confirmRecurringExpensePayment,
    deleteTransaction,
    duplicateTransaction,
    updateTransaction,
    openQuickEntry
  } = useFinance();

  const activePeriod = ctxActivePeriod ?? resolveActivePeriod(filter ?? { period: 'current_month' });
  const periodLabel = ctxPeriodLabel ?? activePeriod.label;

  const fieldIdPrefix = useId();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [internalAccountFilter, setInternalAccountFilter] = useState<string>('all');
  const [minAmountStr, setMinAmountStr] = useState('');
  const [maxAmountStr, setMaxAmountStr] = useState('');

  const activeAccountFilter =
    controlledAccountFilter !== undefined ? controlledAccountFilter : internalAccountFilter;

  const handleAccountFilterChange = (nextAccountId: string) => {
    setInternalAccountFilter(nextAccountId);
    onAccountFilterChange?.(nextAccountId);
  };

  // Edit Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState<TransactionStatus>('paid');

  // Delete confirmation & feedback state
  const [pendingDeleteTx, setPendingDeleteTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<ActionFeedback | null>(null);

  // Confirm virtual recurring occurrence Modal State (Income or Expense)
  const [confirmingOccurrence, setConfirmingOccurrence] = useState<
    | { kind: 'income'; occ: RecurringIncomeOccurrence }
    | { kind: 'expense'; occ: RecurringExpenseOccurrence }
    | null
  >(null);
  const [confirmAmountStr, setConfirmAmountStr] = useState('');
  const [confirmDate, setConfirmDate] = useState('');
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState<PaymentMethod>('pix');
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirmCreditCardId, setConfirmCreditCardId] = useState('');

  const handleConfirmDelete = async () => {
    if (!pendingDeleteTx || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteTransaction(pendingDeleteTx.id);
      setDeleteFeedback({
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      });
    } catch (err: any) {
      setDeleteFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível excluir o lançamento.'
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteTx(null);
    }
  };

  const todayStr = getTodayISO();

  const minAmount = minAmountStr ? parseFloat(minAmountStr.replace(/\./g, '').replace(',', '.')) : 0;
  const maxAmount = maxAmountStr ? parseFloat(maxAmountStr.replace(/\./g, '').replace(',', '.')) : Infinity;

  const baseTransactions = filteredTransactions ?? transactions;
  const filtered = baseTransactions.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchCat = t.category.toLowerCase().includes(q);
      const matchNotes = t.notes?.toLowerCase().includes(q);
      if (!matchDesc && !matchCat && !matchNotes) return false;
    }

    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;
    if (
      activeAccountFilter !== 'all' &&
      t.accountId !== activeAccountFilter &&
      t.targetAccountId !== activeAccountFilter
    ) {
      return false;
    }

    if (statusFilter === 'paid' && t.status !== 'paid') return false;
    if (statusFilter === 'pending' && (t.status === 'paid' || (t.dueDate && t.dueDate < todayStr))) return false;
    if (statusFilter === 'overdue' && (t.status === 'paid' || !t.dueDate || t.dueDate >= todayStr)) return false;

    if (t.amount < minAmount) return false;
    if (t.amount > maxAmount) return false;

    return true;
  });

  const handleOpenEdit = (tx: Transaction) => {
    if (isVirtualTransaction(tx)) return;
    setEditingTx(tx);
    setEditDesc(tx.description);
    setEditAmountStr(tx.amount.toFixed(2).replace('.', ','));
    setEditCat(tx.category);
    setEditDate(tx.date);
    setEditDueDate(tx.dueDate || tx.date);
    setEditStatus(tx.status);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    const amount = parseFloat(editAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    updateTransaction(editingTx.id, {
      description: editDesc.trim(),
      amount,
      category: editCat,
      date: editDate,
      dueDate: editDueDate || undefined,
      status: editStatus
    });

    setEditingTx(null);
  };

  const handleOpenConfirmVirtual = (
    kind: 'income' | 'expense',
    occ: RecurringIncomeOccurrence | RecurringExpenseOccurrence
  ) => {
    setConfirmAmountStr(occ.amount.toFixed(2).replace('.', ','));
    setConfirmDate(todayStr <= occ.date ? occ.date : todayStr);
    setConfirmPaymentMethod(occ.paymentMethod || 'pix');
    setConfirmAccountId(occ.accountId || accounts[0]?.id || '');
    setConfirmCreditCardId(
      kind === 'expense'
        ? (occ as RecurringExpenseOccurrence).creditCardId || creditCards[0]?.id || ''
        : ''
    );
    if (kind === 'income') {
      setConfirmingOccurrence({ kind: 'income', occ: occ as RecurringIncomeOccurrence });
    } else {
      setConfirmingOccurrence({ kind: 'expense', occ: occ as RecurringExpenseOccurrence });
    }
  };

  const handleConfirmVirtualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingOccurrence) return;
    const amount = parseFloat(confirmAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    if (confirmingOccurrence.kind === 'income') {
      confirmRecurringIncomeReceipt({
        ruleId: confirmingOccurrence.occ.ruleId,
        period: confirmingOccurrence.occ.period,
        actualAmount: amount,
        actualDate: confirmDate || todayStr,
        accountId: confirmAccountId || undefined,
        paymentMethod: confirmPaymentMethod
      });
      setDeleteFeedback({
        type: 'success',
        text: `Recebimento de "${confirmingOccurrence.occ.description}" confirmado com sucesso.`
      });
    } else {
      confirmRecurringExpensePayment({
        ruleId: confirmingOccurrence.occ.ruleId,
        period: confirmingOccurrence.occ.period,
        actualAmount: amount,
        actualDate: confirmDate || todayStr,
        paymentMethod: confirmPaymentMethod,
        accountId: confirmPaymentMethod === 'credit_card' ? undefined : confirmAccountId || undefined,
        creditCardId: confirmPaymentMethod === 'credit_card' ? confirmCreditCardId || undefined : undefined
      });
      setDeleteFeedback({
        type: 'success',
        text: `Pagamento de "${confirmingOccurrence.occ.description}" confirmado com sucesso.`
      });
    }
    setConfirmingOccurrence(null);
  };

  const currentMonthPendingRecurring = activePeriod.isCurrentMonth
    ? [
        ...selectedMonthRecurringIncomes
          .filter(occ => occ.isVirtual && !occ.isLegacy && (occ.status === 'predicted' || occ.status === 'overdue'))
          .map(occ => ({ kind: 'income' as const, occ })),
        ...selectedMonthRecurringExpenses
          .filter(occ => occ.isVirtual && !occ.isLegacy && (occ.status === 'predicted' || occ.status === 'overdue'))
          .map(occ => ({ kind: 'expense' as const, occ }))
      ].sort((a, b) => a.occ.date.localeCompare(b.occ.date))
    : [];

  const allCategories = categories;
  const shouldGroupByMonth = activePeriod.isMultiMonth || activePeriod.filterPeriod === 'all';
  const groupedTransactions = groupTransactionsByMonth(filtered, {
    ascending: activePeriod.isFutureView || activePeriod.includesFuture,
    todayISO: todayStr
  });
  const totalFilteredIn = filtered
    .filter(t => t.type === 'income')
    .reduce((s, t) => s + t.amount, 0);
  const totalFilteredOut = filtered
    .filter(t => (t.type === 'expense_fixed' || t.type === 'expense_variable') && !t.isInvoicePayment)
    .reduce((s, t) => s + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-500" />
              Extrato Geral & Pesquisa
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
              <Calendar className="w-3 h-3 text-emerald-500" />
              <span>{periodLabel}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {filtered.length} lançamento(s) no período • Entradas:{' '}
            <strong className="text-emerald-600 dark:text-emerald-400 font-mono">+{formatCurrency(totalFilteredIn)}</strong>{' '}
            • Saídas:{' '}
            <strong className="text-rose-600 dark:text-rose-400 font-mono">-{formatCurrency(totalFilteredOut)}</strong>
          </p>
        </div>
        <button
          onClick={() => openQuickEntry('all')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Lançamento</span>
        </button>
      </div>

      <ActionFeedbackBanner
        feedback={deleteFeedback}
        onClose={() => setDeleteFeedback(null)}
      />

      {/* Advanced Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        {/* Main Search Row */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              id={`${fieldIdPrefix}-search`}
              name="transactions_search"
              type="text"
              autoComplete="off"
              aria-label="Pesquisar lançamentos"
              placeholder="Pesquisar por descrição, categoria ou anotações..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <select
              id={`${fieldIdPrefix}-type-filter`}
              name="transactions_type_filter"
              aria-label="Filtrar por tipo de lançamento"
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="w-full sm:w-auto flex-1 sm:flex-none px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">Todos os Tipos</option>
              <option value="income">Entradas (Receitas)</option>
              <option value="expense_fixed">Despesas Fixas</option>
              <option value="expense_variable">Despesas Variáveis</option>
              <option value="transfer">Transferências</option>
              <option value="card_payment">Pagamentos de Fatura</option>
              <option value="debt_payment">Pagamentos de Dívida</option>
            </select>

            <select
              id={`${fieldIdPrefix}-category-filter`}
              name="transactions_category_filter"
              aria-label="Filtrar por categoria"
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="w-full sm:w-auto flex-1 sm:flex-none px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">Todas as Categorias</option>
              {allCategories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>

            <select
              id={`${fieldIdPrefix}-account-filter`}
              name="transactions_account_filter"
              aria-label="Filtrar por conta"
              value={activeAccountFilter}
              onChange={e => handleAccountFilterChange(e.target.value)}
              className="w-full sm:w-auto flex-1 sm:flex-none px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">Todas as Contas</option>
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
            </select>

            <select
              id={`${fieldIdPrefix}-status-filter`}
              name="transactions_status_filter"
              aria-label="Filtrar por status"
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="w-full sm:w-auto flex-1 sm:flex-none px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">Todos os Status</option>
              <option value="paid">Pagos / Recebidos</option>
              <option value="pending">Pendentes</option>
              <option value="overdue">Atrasados</option>
            </select>
          </div>
        </div>

        {/* Secondary Row: Amount Range */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 pt-1">
          <span>Faixa de valor:</span>
          <input
            id={`${fieldIdPrefix}-min-amount`}
            name="min_amount"
            type="text"
            autoComplete="off"
            aria-label="Valor mínimo em reais"
            placeholder="Min (R$)"
            value={minAmountStr}
            onChange={e => setMinAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-24 px-2 py-1.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-[11px]"
          />
          <span>até</span>
          <input
            id={`${fieldIdPrefix}-max-amount`}
            name="max_amount"
            type="text"
            autoComplete="off"
            aria-label="Valor máximo em reais"
            placeholder="Max (R$)"
            value={maxAmountStr}
            onChange={e => setMaxAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-24 px-2 py-1.5 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-[11px]"
          />
          {(minAmountStr || maxAmountStr || search || typeFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all' || activeAccountFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
                setCategoryFilter('all');
                setStatusFilter('all');
                handleAccountFilterChange('all');
                setMinAmountStr('');
                setMaxAmountStr('');
              }}
              className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold underline ml-2 cursor-pointer"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Current-Month Pending Recurring Previews (Realized vs Predicted separation) */}
      {currentMonthPendingRecurring.length > 0 && (
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-200/80 dark:border-blue-900/50 shadow-xs space-y-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-900 dark:text-white">
              <Repeat className="w-4 h-4 text-blue-500" />
              <span>Previsões Recorrentes do Mês (Ainda não efetivadas)</span>
            </div>
            <span className="text-[11px] text-slate-500">
              Não alteram o saldo bancário até confirmação
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {currentMonthPendingRecurring.map(({ kind, occ }) => (
              <div
                key={`${kind}-${occ.id}`}
                className="flex items-center justify-between gap-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-xs"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-slate-900 dark:text-white truncate">
                      {occ.description}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                        occ.status === 'overdue'
                          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                          : 'bg-blue-500/15 text-blue-600 dark:text-blue-400'
                      }`}
                    >
                      {occ.status === 'overdue' ? 'Em atraso' : 'Previsto'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {kind === 'income' ? 'Receita fixa' : 'Despesa fixa'} · {formatDateBR(occ.date)} · {occ.category}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span
                    className={`font-mono font-bold tabular-nums ${
                      kind === 'income'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {kind === 'income' ? '+' : '-'} {formatCurrency(occ.amount)}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleOpenConfirmVirtual(kind, occ)}
                    className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors cursor-pointer"
                  >
                    Confirmar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            Nenhum lançamento corresponde aos critérios da busca.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria / Tipo</th>
                  <th className="py-3 px-4">Conta / Cartão</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {(shouldGroupByMonth
                  ? groupedTransactions
                  : [
                      {
                        period: activePeriod.selectedPeriod,
                        label: periodLabel,
                        shortLabel: activePeriod.shortLabel,
                        isFuture: activePeriod.isFutureView,
                        isCurrent: activePeriod.isCurrentMonth,
                        transactions: filtered,
                        totalIncome: totalFilteredIn,
                        totalExpense: totalFilteredOut,
                        net: totalFilteredIn - totalFilteredOut
                      }
                    ]
                ).map(group => (
                  <React.Fragment key={group.period}>
                    {shouldGroupByMonth && (
                      <tr className="bg-slate-50/90 dark:bg-slate-800/40">
                        <td colSpan={7} className="py-2 px-4">
                          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] font-semibold">
                            <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-emerald-500" />
                              <span>{group.label}</span>
                              {group.isFuture && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
                                  Projeção
                                </span>
                              )}
                            </span>
                            <div className="flex items-center gap-3 font-mono tabular-nums">
                              <span className="text-emerald-600 dark:text-emerald-400">
                                +{formatCurrency(group.totalIncome)}
                              </span>
                              <span className="text-rose-600 dark:text-rose-400">
                                -{formatCurrency(group.totalExpense)}
                              </span>
                              <span className="text-slate-500">({group.transactions.length})</span>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                    {group.transactions.map(tx => {
                      const isInc = tx.type === 'income';
                      const isVirtual = isVirtualTransaction(tx);
                      const isOver = !isVirtual && (
                        isInc
                          ? tx.status !== 'paid' && tx.date < todayStr
                          : tx.status !== 'paid' && Boolean(tx.dueDate && tx.dueDate < todayStr)
                      );
                      const isCard = tx.paymentMethod === 'credit_card';
                      const account = accounts.find(a => a.id === tx.accountId);
                      const card = creditCards.find(c => c.id === tx.creditCardId);
                      const isRecurringBadge = Boolean(
                        tx.recurringIncomeId || tx.recurringExpenseId || tx.isRecurring
                      );

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                            {formatDateBR(tx.date)}
                            {tx.dueDate && tx.dueDate !== tx.date && (
                              <div className="text-[10px] text-slate-400">Venc: {formatDateBR(tx.dueDate)}</div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2 truncate max-w-xs">
                              <span className="truncate">{tx.description}</span>
                              {isRecurringBadge && (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                                  <Repeat className="w-2.5 h-2.5" />
                                  Fixa mensal
                                </span>
                              )}
                              {tx.installmentInfo && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                                  {tx.installmentInfo.current}/{tx.installmentInfo.total}
                                </span>
                              )}
                              {isVirtual && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-md bg-blue-500/10 text-blue-700 dark:text-blue-400 shrink-0">
                                  Projeção
                                </span>
                              )}
                            </div>
                            {tx.notes && <div className="text-[11px] text-slate-400 truncate">{tx.notes}</div>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-semibold text-slate-800 dark:text-slate-200">{tx.category}</div>
                            <div className="text-[10px] text-slate-400 capitalize">
                              {tx.type === 'income' ? 'Entrada' : tx.type === 'expense_fixed' ? 'Fixa' : tx.type === 'expense_variable' ? 'Variável' : tx.type}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                            {isCard ? (
                              <div className="flex items-center gap-1.5">
                                <CreditCard className="w-3.5 h-3.5 text-purple-500" />
                                <span>{card ? card.name : 'Cartão'}</span>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1.5">
                                <Wallet className="w-3.5 h-3.5 text-blue-500" />
                                <span>{account ? account.name : 'Conta'}</span>
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                            <span className={isInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}>
                              {isInc ? '+' : '-'} {formatCurrency(tx.amount)}
                            </span>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                                tx.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : isVirtual
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400'
                                  : isOver
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                              }`}
                            >
                              {tx.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : isOver ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                              <span>
                                {isInc
                                  ? tx.status === 'paid'
                                    ? 'Recebido'
                                    : tx.projectedStatus === 'overdue' || isOver
                                    ? 'Previsto em atraso'
                                    : 'Previsto'
                                  : tx.status === 'paid'
                                  ? 'Efetivado'
                                  : isVirtual
                                  ? 'Previsto'
                                  : isOver
                                  ? 'Atrasado'
                                  : 'Pendente'}
                              </span>
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isVirtual ? (
                              tx.recurringIncomeId || tx.recurringExpenseId ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    const occPeriod = tx.recurringPeriod || tx.date.slice(0, 7);
                                    if (tx.recurringIncomeId) {
                                      const match = selectedMonthRecurringIncomes.find(
                                        o => o.ruleId === tx.recurringIncomeId && o.period === occPeriod
                                      );
                                      if (match) {
                                        handleOpenConfirmVirtual('income', match);
                                        return;
                                      }
                                      handleOpenConfirmVirtual('income', {
                                        id: tx.id,
                                        ruleId: tx.recurringIncomeId,
                                        period: occPeriod,
                                        description: tx.description,
                                        amount: tx.amount,
                                        category: tx.category,
                                        accountId: tx.accountId,
                                        paymentMethod: tx.paymentMethod,
                                        scheduledDate: tx.date,
                                        date: tx.date,
                                        configuredDayOfMonth: Number(tx.date.slice(8, 10)) || 10,
                                        status: tx.projectedStatus || 'predicted',
                                        isIndefinite: true,
                                        notes: tx.notes,
                                        isVirtual: true
                                      });
                                    } else if (tx.recurringExpenseId) {
                                      const match = selectedMonthRecurringExpenses.find(
                                        o => o.ruleId === tx.recurringExpenseId && o.period === occPeriod
                                      );
                                      if (match) {
                                        handleOpenConfirmVirtual('expense', match);
                                        return;
                                      }
                                      handleOpenConfirmVirtual('expense', {
                                        id: tx.id,
                                        ruleId: tx.recurringExpenseId,
                                        period: occPeriod,
                                        description: tx.description,
                                        amount: tx.amount,
                                        category: tx.category,
                                        accountId: tx.accountId,
                                        creditCardId: tx.creditCardId,
                                        paymentMethod: tx.paymentMethod,
                                        scheduledDate: tx.date,
                                        date: tx.date,
                                        configuredDayOfMonth: Number(tx.date.slice(8, 10)) || 10,
                                        status: tx.projectedStatus || 'predicted',
                                        isIndefinite: true,
                                        notes: tx.notes,
                                        isVirtual: true
                                      });
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg bg-emerald-600/10 hover:bg-emerald-600 text-emerald-700 hover:text-white dark:text-emerald-400 text-[10px] font-semibold transition-colors cursor-pointer"
                                >
                                  Confirmar
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium">Projeção</span>
                              )
                            ) : (
                              <div className="flex items-center justify-center gap-1 text-slate-400">
                                <button
                                  onClick={() => handleOpenEdit(tx)}
                                  title="Editar lançamento"
                                  className="p-1.5 rounded-lg hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  onClick={() => duplicateTransaction(tx.id)}
                                  title="Duplicar lançamento"
                                  className="p-1.5 rounded-lg hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setPendingDeleteTx(tx);
                                  }}
                                  title="Excluir lançamento"
                                  aria-label={`Excluir lançamento ${tx.description}`}
                                  className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Transaction Modal */}
      <ResponsiveModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        title="Editar Lançamento"
        size="md"
        onSubmit={handleSaveEdit}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Salvar Alterações
          </button>
        }
      >
        <div>
          <label htmlFor={`${fieldIdPrefix}-edit-desc`} className="block font-medium text-slate-500 mb-1">Descrição</label>
          <input
            id={`${fieldIdPrefix}-edit-desc`}
            name="description"
            type="text"
            autoComplete="off"
            required
            value={editDesc}
            onChange={e => setEditDesc(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label htmlFor={`${fieldIdPrefix}-edit-amount`} className="block font-medium text-slate-500 mb-1">Valor (R$)</label>
          <input
            id={`${fieldIdPrefix}-edit-amount`}
            name="amount"
            type="text"
            autoComplete="off"
            required
            value={editAmountStr}
            onChange={e => setEditAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldIdPrefix}-edit-cat`} className="block font-medium text-slate-500 mb-1">Categoria</label>
            <select
              id={`${fieldIdPrefix}-edit-cat`}
              name="category"
              value={editCat}
              onChange={e => setEditCat(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              {allCategories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor={`${fieldIdPrefix}-edit-status`} className="block font-medium text-slate-500 mb-1">Situação / Status</label>
            <select
              id={`${fieldIdPrefix}-edit-status`}
              name="status"
              value={editStatus}
              onChange={e => setEditStatus(e.target.value as TransactionStatus)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="paid">Efetivado (Pago/Recebido)</option>
              <option value="pending">Pendente (A vencer)</option>
              <option value="overdue">Atrasado</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldIdPrefix}-edit-date`} className="block font-medium text-slate-500 mb-1">Data</label>
            <input
              id={`${fieldIdPrefix}-edit-date`}
              name="date"
              type="date"
              value={editDate}
              onChange={e => setEditDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={`${fieldIdPrefix}-edit-due-date`} className="block font-medium text-slate-500 mb-1">Vencimento</label>
            <input
              id={`${fieldIdPrefix}-edit-due-date`}
              name="due_date"
              type="date"
              value={editDueDate}
              onChange={e => setEditDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>
      </ResponsiveModal>

      {/* Confirm Virtual Recurring Occurrence Modal */}
      <ResponsiveModal
        isOpen={!!confirmingOccurrence}
        onClose={() => setConfirmingOccurrence(null)}
        title={
          confirmingOccurrence?.kind === 'income'
            ? 'Confirmar Recebimento Recorrente'
            : 'Confirmar Pagamento Recorrente'
        }
        subtitle={confirmingOccurrence?.occ.description}
        size="md"
        onSubmit={handleConfirmVirtualSubmit}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Confirmar Efetivação
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldIdPrefix}-confirm-amount`} className="block font-medium text-slate-500 mb-1">
              Valor Efetivo (R$)
            </label>
            <input
              id={`${fieldIdPrefix}-confirm-amount`}
              name="confirm_recurring_amount"
              type="text"
              autoComplete="off"
              required
              value={confirmAmountStr}
              onChange={e => setConfirmAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={`${fieldIdPrefix}-confirm-date`} className="block font-medium text-slate-500 mb-1">
              Data Efetiva
            </label>
            <input
              id={`${fieldIdPrefix}-confirm-date`}
              name="confirm_recurring_date"
              type="date"
              required
              value={confirmDate}
              onChange={e => setConfirmDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldIdPrefix}-confirm-method`} className="block font-medium text-slate-500 mb-1">
              Forma de Pagamento
            </label>
            <select
              id={`${fieldIdPrefix}-confirm-method`}
              name="confirm_recurring_payment_method"
              value={confirmPaymentMethod}
              onChange={e => setConfirmPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="pix">PIX</option>
              <option value="bank_transfer">Transferência / Débito Automático</option>
              <option value="debit_card">Cartão de Débito</option>
              <option value="bank_slip">Boleto</option>
              <option value="cash">Dinheiro</option>
              {confirmingOccurrence?.kind === 'expense' && (
                <option value="credit_card">Cartão de Crédito</option>
              )}
            </select>
          </div>

          {confirmPaymentMethod === 'credit_card' && confirmingOccurrence?.kind === 'expense' ? (
            <div>
              <label htmlFor={`${fieldIdPrefix}-confirm-card`} className="block font-medium text-slate-500 mb-1">
                Cartão de Crédito
              </label>
              <select
                id={`${fieldIdPrefix}-confirm-card`}
                name="confirm_recurring_card"
                value={confirmCreditCardId}
                onChange={e => setConfirmCreditCardId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                {creditCards.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor={`${fieldIdPrefix}-confirm-account`} className="block font-medium text-slate-500 mb-1">
                Conta Bancária / Carteira
              </label>
              <select
                id={`${fieldIdPrefix}-confirm-account`}
                name="confirm_recurring_account"
                value={confirmAccountId}
                onChange={e => setConfirmAccountId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                {accounts.map(acc => (
                  <option key={acc.id} value={acc.id}>{acc.name}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      </ResponsiveModal>

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteTx}
        title="Excluir Lançamento"
        description="Deseja excluir este lançamento financeiro? O saldo bancário será recalculado automaticamente e nenhum outro lançamento será alterado."
        itemLabel={pendingDeleteTx?.description}
        itemValue={pendingDeleteTx ? formatCurrency(pendingDeleteTx.amount) : undefined}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteTx(null)}
      />
    </div>
  );
};
