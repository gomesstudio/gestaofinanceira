/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';
import {
  Plus,
  Layers,
  ShoppingBag,
  Search,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  Copy,
  Edit2,
  CreditCard,
  Wallet,
  ArrowDownRight,
  Calendar,
  Repeat,
  SkipForward,
  RotateCcw,
  StopCircle
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO, MONTH_NAMES_PT } from '../../utils/formatters';
import {
  calculateRecurringExpenseAnnualTotal,
  getEffectiveExpenseRuleValuesForPeriod
} from '../../utils/recurringExpense';
import {
  addMonthsToPeriod,
  clampDayOfMonth,
  formatPeriod,
  parseISODateParts
} from '../../utils/recurringIncome';
import {
  groupTransactionsByMonth,
  isVirtualTransaction,
  resolveActivePeriod
} from '../../utils/periodFilter';
import {
  PaymentMethod,
  RecurringExpenseOccurrence,
  RecurringExpenseRule,
  Transaction
} from '../../types/finance';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export const ExpensesView: React.FC = () => {
  const {
    transactions,
    filteredTransactions,
    filter,
    activePeriod: ctxActivePeriod,
    periodLabel: ctxPeriodLabel,
    accounts,
    creditCards,
    categories,
    recurringExpenses = [],
    selectedMonthRecurringExpenses = [],
    periodRecurringExpenses,
    selectedYear = new Date().getFullYear(),
    selectedMonth = new Date().getMonth(),
    deleteTransaction,
    duplicateTransaction,
    openQuickEntry,
    updateTransaction,
    confirmRecurringExpensePayment,
    updateRecurringExpense,
    skipRecurringExpenseOccurrence,
    unskipRecurringExpenseOccurrence,
    endRecurringExpense,
    deleteRecurringExpenseRule,
    convertTransactionToRecurringExpense
  } = useFinance();

  const activePeriod = ctxActivePeriod ?? resolveActivePeriod(filter ?? { period: 'current_month' });
  const periodLabel = ctxPeriodLabel ?? activePeriod.label;

  const fieldIdPrefix = useId();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'fixed' | 'variable'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Edit single transaction Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editType, setEditType] = useState<'expense_fixed' | 'expense_variable'>('expense_variable');
  const [editDate, setEditDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState<'paid' | 'pending'>('paid');
  const [editNotes, setEditNotes] = useState('');

  // Confirm recurring occurrence payment Modal State
  const [confirmingOcc, setConfirmingOcc] = useState<RecurringExpenseOccurrence | null>(null);
  const [confirmAmountStr, setConfirmAmountStr] = useState('');
  const [confirmDate, setConfirmDate] = useState('');
  const [confirmPaymentMethod, setConfirmPaymentMethod] = useState<PaymentMethod>('pix');
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirmCreditCardId, setConfirmCreditCardId] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');

  // Edit recurring expense rule/occurrence Modal State
  const [editingRecurring, setEditingRecurring] = useState<{
    rule: RecurringExpenseRule;
    period: string;
    scope: 'single' | 'future';
  } | null>(null);
  const [recEditDesc, setRecEditDesc] = useState('');
  const [recEditAmountStr, setRecEditAmountStr] = useState('');
  const [recEditDay, setRecEditDay] = useState(10);
  const [recEditCustomDate, setRecEditCustomDate] = useState('');
  const [recEditCat, setRecEditCat] = useState('');
  const [recEditPaymentMethod, setRecEditPaymentMethod] = useState<PaymentMethod>('pix');
  const [recEditAccountId, setRecEditAccountId] = useState('');
  const [recEditCreditCardId, setRecEditCreditCardId] = useState('');
  const [recEditIsIndefinite, setRecEditIsIndefinite] = useState(true);
  const [recEditEndDate, setRecEditEndDate] = useState('');
  const [recEditNotes, setRecEditNotes] = useState('');
  const [confirmFutureChecked, setConfirmFutureChecked] = useState(false);

  // End recurrence confirmation Modal State
  const [endingRule, setEndingRule] = useState<RecurringExpenseRule | null>(null);
  const [endFromPeriodChoice, setEndFromPeriodChoice] = useState<'current' | 'next'>('current');

  // Delete recurring rule confirmation Modal State
  const [deletingRule, setDeletingRule] = useState<RecurringExpenseRule | null>(null);

  // Voluntary conversion Modal State
  const [convertingTx, setConvertingTx] = useState<Transaction | null>(null);
  const [convertDay, setConvertDay] = useState(10);
  const [convertIsIndefinite, setConvertIsIndefinite] = useState(true);
  const [convertEndDate, setConvertEndDate] = useState('');
  const [convertNotes, setConvertNotes] = useState('');

  // Delete single transaction confirmation & feedback state
  const [pendingDeleteTx, setPendingDeleteTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  const todayStr = getTodayISO();
  const selectedPeriod = formatPeriod(selectedYear, selectedMonth);
  const selectedMonthLabel = `${MONTH_NAMES_PT[selectedMonth] || ''}/${selectedYear}`;

  const handleConfirmDelete = async () => {
    if (!pendingDeleteTx || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteTransaction(pendingDeleteTx.id);
      setActionFeedback({
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      });
    } catch (err: any) {
      setActionFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível excluir a despesa.'
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteTx(null);
    }
  };

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditDesc(tx.description);
    setEditAmountStr(tx.amount.toFixed(2).replace('.', ','));
    setEditCat(tx.category);
    setEditType(tx.type === 'expense_fixed' ? 'expense_fixed' : 'expense_variable');
    setEditDate(tx.date);
    setEditDueDate(tx.dueDate || tx.date);
    setEditStatus(tx.status === 'paid' ? 'paid' : 'pending');
    setEditNotes(tx.notes || '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    const amount = parseFloat(editAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    updateTransaction(editingTx.id, {
      description: editDesc.trim(),
      amount,
      type: editType,
      category: editCat,
      date: editDate,
      dueDate: editDueDate,
      status: editStatus,
      notes: editNotes.trim() || undefined
    });

    setEditingTx(null);
  };

  const handleOpenConfirmOccurrence = (occ: RecurringExpenseOccurrence) => {
    setConfirmingOcc(occ);
    setConfirmAmountStr(occ.amount.toFixed(2).replace('.', ','));
    setConfirmDate(occ.status === 'overdue' ? todayStr : occ.date);
    setConfirmPaymentMethod(occ.paymentMethod || 'pix');
    setConfirmAccountId(occ.accountId || accounts[0]?.id || '');
    setConfirmCreditCardId(occ.creditCardId || creditCards[0]?.id || '');
    setConfirmNotes(occ.notes || '');
  };

  const handleSaveConfirmPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingOcc) return;
    const amount = parseFloat(confirmAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !confirmDate) return;

    const isCard = confirmPaymentMethod === 'credit_card';
    confirmRecurringExpensePayment?.({
      ruleId: confirmingOcc.ruleId,
      period: confirmingOcc.period,
      actualAmount: amount,
      actualDate: confirmDate,
      paymentMethod: confirmPaymentMethod,
      accountId: isCard ? undefined : confirmAccountId || undefined,
      creditCardId: isCard ? confirmCreditCardId || undefined : undefined,
      notes: confirmNotes.trim() || undefined
    });

    setActionFeedback({
      type: 'success',
      text: `Pagamento de "${confirmingOcc.description}" confirmado com sucesso.`
    });
    setConfirmingOcc(null);
  };

  const handleOpenEditRecurring = (
    rule: RecurringExpenseRule,
    period: string,
    initialScope: 'single' | 'future'
  ) => {
    const eff = getEffectiveExpenseRuleValuesForPeriod(rule, period);
    const linkedTx = transactions.find(
      t =>
        (t.type === 'expense_fixed' || t.type === 'expense_variable') &&
        !t.isInvoicePayment &&
        t.recurringExpenseId === rule.id &&
        t.recurringPeriod === period
    );
    setEditingRecurring({ rule, period, scope: initialScope });
    setRecEditDesc(linkedTx?.description || eff.description);
    setRecEditAmountStr((linkedTx?.amount ?? eff.amount).toFixed(2).replace('.', ','));
    setRecEditDay(eff.dayOfMonth);
    setRecEditCustomDate(linkedTx?.dueDate || linkedTx?.date || eff.customDate || '');
    setRecEditCat(linkedTx?.category || eff.category);
    setRecEditPaymentMethod(linkedTx?.paymentMethod || eff.paymentMethod);
    setRecEditAccountId(linkedTx?.accountId || eff.accountId || accounts[0]?.id || '');
    setRecEditCreditCardId(linkedTx?.creditCardId || eff.creditCardId || creditCards[0]?.id || '');
    setRecEditIsIndefinite(rule.isIndefinite);
    setRecEditEndDate(rule.endDate || '');
    setRecEditNotes(linkedTx?.notes ?? eff.notes ?? '');
    setConfirmFutureChecked(false);
  };

  const handleSaveEditRecurring = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRecurring) return;
    const amount = parseFloat(recEditAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !recEditDesc.trim()) return;
    if (editingRecurring.scope === 'future' && !confirmFutureChecked) return;

    const isCard = recEditPaymentMethod === 'credit_card';
    updateRecurringExpense?.({
      ruleId: editingRecurring.rule.id,
      targetPeriod: editingRecurring.period,
      scope: editingRecurring.scope,
      updates: {
        description: recEditDesc.trim(),
        amount,
        dayOfMonth: clampDayOfMonth(recEditDay),
        customDate:
          editingRecurring.scope === 'single' && recEditCustomDate
            ? recEditCustomDate
            : undefined,
        category: recEditCat,
        paymentMethod: recEditPaymentMethod,
        accountId: isCard ? undefined : recEditAccountId || undefined,
        creditCardId: isCard ? recEditCreditCardId || undefined : undefined,
        notes: recEditNotes.trim() || undefined,
        ...(editingRecurring.scope === 'future'
          ? {
              isIndefinite: recEditIsIndefinite,
              endDate: recEditIsIndefinite ? undefined : recEditEndDate || undefined
            }
          : {})
      }
    });

    setActionFeedback({
      type: 'success',
      text:
        editingRecurring.scope === 'single'
          ? `Ocorrência de ${editingRecurring.period} atualizada sem alterar os outros meses.`
          : `Despesa fixa atualizada para ${editingRecurring.period} e meses futuros.`
    });
    setEditingRecurring(null);
  };

  const handleConfirmEndRecurrence = (e: React.FormEvent) => {
    e.preventDefault();
    if (!endingRule) return;
    const cutoff =
      endFromPeriodChoice === 'current'
        ? selectedPeriod
        : addMonthsToPeriod(selectedPeriod, 1);
    endRecurringExpense?.(endingRule.id, cutoff);
    setActionFeedback({
      type: 'success',
      text: `Recorrência "${endingRule.description}" encerrada a partir de ${cutoff}. Histórico pago preservado.`
    });
    setEndingRule(null);
  };

  const handleConfirmDeleteRule = () => {
    if (!deletingRule) return;
    deleteRecurringExpenseRule?.(deletingRule.id);
    setActionFeedback({
      type: 'success',
      text: `Regra "${deletingRule.description}" removida. Lançamentos já pagos foram preservados no histórico.`
    });
    setDeletingRule(null);
  };

  const handleOpenConvertTx = (tx: Transaction) => {
    const parsed = parseISODateParts(tx.dueDate || tx.date);
    setConvertingTx(tx);
    setConvertDay(parsed ? parsed.day : 10);
    setConvertIsIndefinite(true);
    setConvertEndDate('');
    setConvertNotes(tx.notes || '');
  };

  const handleSaveConvertTx = (e: React.FormEvent) => {
    e.preventDefault();
    if (!convertingTx) return;
    convertTransactionToRecurringExpense?.({
      transactionId: convertingTx.id,
      dayOfMonth: clampDayOfMonth(convertDay),
      isIndefinite: convertIsIndefinite,
      endDate: convertIsIndefinite ? undefined : convertEndDate || undefined,
      notes: convertNotes.trim() || undefined
    });
    setActionFeedback({
      type: 'success',
      text: `"${convertingTx.description}" agora é uma despesa fixa mensal recorrente.`
    });
    setConvertingTx(null);
  };

  // Filter only expenses inside active global period
  const baseTransactions = filteredTransactions ?? transactions;
  const allExpenses = baseTransactions.filter(
    t => (t.type === 'expense_fixed' || t.type === 'expense_variable') && !t.isInvoicePayment
  );

  const filteredExpenses = allExpenses.filter(t => {
    if (
      search &&
      !t.description.toLowerCase().includes(search.toLowerCase()) &&
      !t.category.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (typeFilter === 'fixed' && t.type !== 'expense_fixed') return false;
    if (typeFilter === 'variable' && t.type !== 'expense_variable') return false;

    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

    if (statusFilter === 'paid' && t.status !== 'paid') return false;
    if (statusFilter === 'pending' && (t.status === 'paid' || (t.dueDate && t.dueDate < todayStr))) return false;
    if (statusFilter === 'overdue' && (t.status === 'paid' || !t.dueDate || t.dueDate >= todayStr)) return false;

    return true;
  });

  const displayedRecurringOccurrences = activePeriod.isMultiMonth
    ? (periodRecurringExpenses ?? selectedMonthRecurringExpenses)
    : selectedMonthRecurringExpenses;

  // Strict separation between realized (paid) vs predicted/pending expenses
  const paidExpenseTransactions = allExpenses.filter(t => t.status === 'paid' && !isVirtualTransaction(t));
  const pendingSavedExpenses = allExpenses.filter(t => t.status !== 'paid' && !isVirtualTransaction(t));
  const virtualFilteredExpenses = allExpenses.filter(t => isVirtualTransaction(t));

  const virtualForecastSum = virtualFilteredExpenses.length > 0
    ? virtualFilteredExpenses.reduce((sum, t) => sum + t.amount, 0)
    : displayedRecurringOccurrences
        .filter(o => o.isVirtual && (o.status === 'predicted' || o.status === 'overdue'))
        .reduce((sum, o) => sum + o.amount, 0);

  const isForwardProjectionView = activePeriod.isFutureView || activePeriod.includesFuture;
  const kpiSourceTransactions = isForwardProjectionView ? allExpenses : paidExpenseTransactions;

  const totalFixed = kpiSourceTransactions
    .filter(t => t.type === 'expense_fixed')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalVariable = kpiSourceTransactions
    .filter(t => t.type === 'expense_variable')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPaidExpenses = paidExpenseTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalPending =
    pendingSavedExpenses.reduce((sum, t) => sum + t.amount, 0) + virtualForecastSum;
  const totalAll = isForwardProjectionView ? totalFixed + totalVariable : totalPaidExpenses;

  const handleToggleStatus = (tx: Transaction) => {
    if (isVirtualTransaction(tx)) {
      if (tx.recurringExpenseId && tx.recurringPeriod) {
        const matchedOcc = displayedRecurringOccurrences.find(
          o => o.ruleId === tx.recurringExpenseId && o.period === tx.recurringPeriod
        );
        if (matchedOcc) {
          handleOpenConfirmOccurrence(matchedOcc);
        }
      }
      return;
    }
    const newStatus = tx.status === 'paid' ? 'pending' : 'paid';
    updateTransaction(tx.id, { status: newStatus });
  };

  const getExpenseCategories = categories.filter(c => c.type === 'expense');
  const shouldGroupByMonth = activePeriod.isMultiMonth || activePeriod.filterPeriod === 'all';
  const groupedExpenses = groupTransactionsByMonth(filteredExpenses, {
    ascending: isForwardProjectionView,
    todayISO: todayStr
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Despesas Fixas & Variáveis
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/20">
              <Calendar className="w-3 h-3" />
              <span>{periodLabel}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Controle de gastos pontuais, parcelas e despesas fixas recorrentes programadas
          </p>
        </div>
        <button
          type="button"
          onClick={() => openQuickEntry('expense')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Nova Despesa</span>
        </button>
      </div>

      <ActionFeedbackBanner
        feedback={actionFeedback}
        onClose={() => setActionFeedback(null)}
      />

      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>{isForwardProjectionView ? 'Total Previsto no Período' : 'Total Pago (Realizado)'}</span>
            <ArrowDownRight className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {formatCurrency(totalAll)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {paidExpenseTransactions.length} efetivada(s)
            {totalPending > 0 ? ` • +${formatCurrency(totalPending)} a pagar/previsto` : ''}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Despesas Fixas</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalFixed)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Aluguel, contas essenciais, planos
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Despesas Variáveis</span>
            <ShoppingBag className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalVariable)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Mercado, lazer, alimentação, farmácia
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>A Pagar / Previstas</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
            {formatCurrency(totalPending)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Compromissos não liquidados do período
          </div>
        </div>
      </div>

      {/* Seção: Despesas Fixas Recorrentes (Regras configuradas) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Repeat className="w-4 h-4 text-rose-500" />
              <span>Despesas Fixas Recorrentes</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Contas mensais configuradas para projeção automática nos próximos meses
            </p>
          </div>
          <button
            type="button"
            onClick={() => openQuickEntry('expense')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-rose-500/10 text-rose-700 dark:text-rose-300 hover:bg-rose-500/20 border border-rose-500/20 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Despesa Fixa Recorrente</span>
          </button>
        </div>

        {recurringExpenses.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
            Nenhuma despesa fixa recorrente cadastrada ainda. Use <strong>Cadastrar Nova Despesa</strong> e ative a opção <strong>Despesa fixa mensal recorrente</strong> ou converta uma despesa fixa existente abaixo.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recurringExpenses.map(rule => {
              const eff = getEffectiveExpenseRuleValuesForPeriod(rule, selectedPeriod);
              const annualExpected = calculateRecurringExpenseAnnualTotal(rule, selectedPeriod);
              const sourceName =
                eff.paymentMethod === 'credit_card'
                  ? creditCards.find(c => c.id === eff.creditCardId)?.name || 'Cartão de Crédito'
                  : accounts.find(a => a.id === eff.accountId)?.name;

              return (
                <div
                  key={rule.id}
                  className="p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-xs text-slate-900 dark:text-white truncate">
                          {eff.description}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                            rule.isActive
                              ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400'
                              : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                          }`}
                        >
                          {rule.isActive ? 'Ativa' : 'Encerrada'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        {eff.category} • Mensal (todo dia {eff.dayOfMonth})
                        {sourceName ? ` • ${sourceName}` : ''} •{' '}
                        {rule.isIndefinite
                          ? 'Indeterminada'
                          : rule.endDate
                          ? `Até ${formatDateBR(rule.endDate)}`
                          : 'Prazo definido'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-sm text-rose-600 dark:text-rose-400 tabular-nums">
                        -{formatCurrency(eff.amount)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono tabular-nums">
                        Anual: {formatCurrency(annualExpected)}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-700/60">
                    <button
                      type="button"
                      onClick={() => handleOpenEditRecurring(rule, selectedPeriod, 'future')}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3 h-3" />
                      <span>Editar recorrência</span>
                    </button>
                    {rule.isActive && (
                      <button
                        type="button"
                        onClick={() => {
                          setEndingRule(rule);
                          setEndFromPeriodChoice('current');
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors cursor-pointer"
                      >
                        <StopCircle className="w-3 h-3" />
                        <span>Encerrar</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setDeletingRule(rule)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Excluir regra</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Ocorrências Recorrentes do Período Selecionado */}
      {displayedRecurringOccurrences.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Calendar className="w-4 h-4 text-rose-500" />
                <span>
                  Ocorrências Recorrentes de{' '}
                  {activePeriod.mode === 'single_month' ? selectedMonthLabel : periodLabel}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Previsões não debitam o saldo bancário até você confirmar o pagamento real
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {displayedRecurringOccurrences.map(occ => {
              const parentRule = recurringExpenses.find(r => r.id === occ.ruleId);
              const isCard = occ.paymentMethod === 'credit_card';
              const sourceLabel = isCard
                ? creditCards.find(c => c.id === occ.creditCardId)?.name || 'Cartão de Crédito'
                : accounts.find(a => a.id === occ.accountId)?.name;
              const dayFromOcc = parseInt(occ.date.slice(8, 10), 10);
              const wasClamped = !isNaN(dayFromOcc) && dayFromOcc !== occ.configuredDayOfMonth && occ.isVirtual;

              return (
                <div
                  key={occ.id}
                  className="p-3 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 flex flex-col lg:flex-row lg:items-center justify-between gap-3"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-mono text-xs text-slate-500">{formatDateBR(occ.date)}</span>
                      <span className="font-semibold text-xs text-slate-900 dark:text-white">
                        {occ.description}
                      </span>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[10px] font-semibold">
                        <Repeat className="w-2.5 h-2.5" />
                        Fixa mensal
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          occ.status === 'paid'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : occ.status === 'overdue'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                            : occ.status === 'skipped'
                            ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                        }`}
                      >
                        {occ.status === 'paid' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : occ.status === 'overdue' ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span>
                          {occ.status === 'paid'
                            ? 'Paga'
                            : occ.status === 'overdue'
                            ? 'Prevista em atraso'
                            : occ.status === 'skipped'
                            ? 'Pulada este mês'
                            : 'Prevista'}
                        </span>
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-500 flex flex-wrap items-center gap-2">
                      <span>{occ.category}</span>
                      {sourceLabel && <span>• {sourceLabel}</span>}
                      {wasClamped && (
                        <span className="text-amber-600 dark:text-amber-400">
                          • Dia {occ.configuredDayOfMonth} ajustado ao fim do mês
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 shrink-0">
                    <span className="font-mono font-bold text-sm text-rose-600 dark:text-rose-400 tabular-nums">
                      -{formatCurrency(occ.amount)}
                    </span>

                    {!occ.isLegacy && parentRule && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        {(occ.status === 'predicted' || occ.status === 'overdue') && (
                          <>
                            <button
                              type="button"
                              onClick={() => handleOpenConfirmOccurrence(occ)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" />
                              <span>Confirmar pagamento</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenEditRecurring(parentRule, occ.period, 'single')}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                skipRecurringExpenseOccurrence?.(occ.ruleId, occ.period);
                                setActionFeedback({
                                  type: 'success',
                                  text: `Ocorrência de "${occ.description}" em ${occ.period} pulada sem remover a regra mensal.`
                                });
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
                            >
                              <SkipForward className="w-3 h-3" />
                              <span>Pular mês</span>
                            </button>
                          </>
                        )}

                        {occ.status === 'skipped' && (
                          <button
                            type="button"
                            onClick={() => unskipRecurringExpenseOccurrence?.(occ.ruleId, occ.period)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restaurar previsão</span>
                          </button>
                        )}

                        {occ.status === 'paid' && (
                          <button
                            type="button"
                            onClick={() => handleOpenEditRecurring(parentRule, occ.period, 'single')}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            <Edit2 className="w-3 h-3" />
                            <span>Editar</span>
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id={`${fieldIdPrefix}-search`}
            name="expenses_search"
            type="text"
            autoComplete="off"
            aria-label="Buscar despesa"
            placeholder="Buscar despesa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Type Filter */}
          <select
            id={`${fieldIdPrefix}-type-filter`}
            name="expenses_type_filter"
            aria-label="Filtrar por tipo de despesa"
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="w-full sm:w-auto flex-1 sm:flex-none px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todas as Despesas</option>
            <option value="fixed">Apenas Fixas</option>
            <option value="variable">Apenas Variáveis</option>
          </select>

          {/* Category Filter */}
          <select
            id={`${fieldIdPrefix}-category-filter`}
            name="expenses_category_filter"
            aria-label="Filtrar por categoria"
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto flex-1 sm:flex-none px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todas as Categorias</option>
            {getExpenseCategories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            id={`${fieldIdPrefix}-status-filter`}
            name="expenses_status_filter"
            aria-label="Filtrar por status"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="w-full sm:w-auto flex-1 sm:flex-none px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todos os Status</option>
            <option value="paid">Pagas</option>
            <option value="pending">Pendentes</option>
            <option value="overdue">Atrasadas</option>
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        {filteredExpenses.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            Nenhuma despesa encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Data / Vencimento</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria / Tipo</th>
                  <th className="py-3 px-4">Forma / Conta</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {(shouldGroupByMonth
                  ? groupedExpenses
                  : [
                      {
                        period: activePeriod.selectedPeriod,
                        label: periodLabel,
                        shortLabel: activePeriod.shortLabel,
                        isFuture: activePeriod.isFutureView,
                        isCurrent: activePeriod.isCurrentMonth,
                        transactions: filteredExpenses,
                        totalIncome: 0,
                        totalExpense: filteredExpenses.reduce((s, t) => s + t.amount, 0),
                        net: 0
                      }
                    ]
                ).map(group => (
                  <React.Fragment key={group.period}>
                    {shouldGroupByMonth && (
                      <tr className="bg-slate-50/90 dark:bg-slate-800/40">
                        <td colSpan={7} className="py-2 px-4">
                          <div className="flex items-center justify-between text-[11px] font-semibold">
                            <span className="text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
                              <Calendar className="w-3 h-3 text-rose-500" />
                              <span>{group.label}</span>
                              {group.isFuture && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
                                  Projeção
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                              -{formatCurrency(group.totalExpense)} ({group.transactions.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {group.transactions.map(tx => {
                      const isVirtual = isVirtualTransaction(tx);
                      const isOverdue =
                        tx.projectedStatus === 'overdue' ||
                        (!isVirtual && tx.status !== 'paid' && Boolean(tx.dueDate && tx.dueDate < todayStr));
                      const isCard = tx.paymentMethod === 'credit_card';
                      const source = isCard
                        ? creditCards.find(c => c.id === tx.creditCardId)?.name
                        : accounts.find(a => a.id === tx.accountId)?.name;
                      const isFixedBadge = Boolean(
                        tx.recurringExpenseId || (tx.type === 'expense_fixed' && tx.isRecurring)
                      );
                      const canConvertToRecurring =
                        !isVirtual &&
                        tx.type === 'expense_fixed' &&
                        !tx.recurringExpenseId &&
                        !tx.installmentInfo &&
                        !tx.isInvoicePayment;

                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono whitespace-nowrap">
                            <div className="text-slate-900 dark:text-white">{formatDateBR(tx.date)}</div>
                            {tx.dueDate && (
                              <div className={`text-[10px] ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                                Venc: {formatDateBR(tx.dueDate)} {isOverdue && '(Atrasado)'}
                              </div>
                            )}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2 max-w-xs">
                              <span className="truncate">{tx.description}</span>
                              {isFixedBadge && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-700 dark:text-rose-400 text-[10px] font-semibold shrink-0">
                                  <Repeat className="w-2.5 h-2.5" />
                                  Fixa mensal
                                </span>
                              )}
                              {tx.installmentInfo && (
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
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
                            <div className="font-medium text-slate-800 dark:text-slate-200">{tx.category}</div>
                            <div className="text-[10px] text-slate-400">
                              {tx.type === 'expense_fixed' ? 'Despesa Fixa' : 'Despesa Variável'}
                            </div>
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                              {isCard ? (
                                <CreditCard className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                              ) : (
                                <Wallet className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                              )}
                              <span className="truncate max-w-[130px]">{source || tx.paymentMethod}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 capitalize">
                              {tx.paymentMethod.replace('_', ' ')}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                            -{formatCurrency(tx.amount)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(tx)}
                              disabled={isVirtual && !(tx.recurringExpenseId && tx.recurringPeriod)}
                              title={
                                isVirtual
                                  ? tx.recurringExpenseId
                                    ? 'Confirmar pagamento desta previsão'
                                    : 'Previsão automática baseada em despesa recorrente'
                                  : 'Clique para alternar status'
                              }
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                                tx.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 cursor-pointer'
                                  : isVirtual
                                  ? 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 cursor-pointer'
                                  : isOverdue
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 cursor-pointer'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400 cursor-pointer'
                              }`}
                            >
                              {tx.status === 'paid' ? (
                                <CheckCircle2 className="w-3 h-3" />
                              ) : isOverdue ? (
                                <AlertTriangle className="w-3 h-3" />
                              ) : (
                                <Clock className="w-3 h-3" />
                              )}
                              <span>
                                {tx.status === 'paid'
                                  ? 'Pago'
                                  : isOverdue
                                  ? 'Atrasado'
                                  : isVirtual
                                  ? 'Previsto'
                                  : 'Pendente'}
                              </span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isVirtual ? (
                              tx.recurringExpenseId && tx.recurringPeriod ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(tx)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Confirmar</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium">Projeção</span>
                              )
                            ) : (
                              <div className="flex items-center justify-center gap-1 text-slate-400">
                                {canConvertToRecurring && (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenConvertTx(tx)}
                                    title="Tornar recorrente mensal"
                                    aria-label={`Tornar ${tx.description} recorrente mensal`}
                                    className="inline-flex items-center gap-1 px-1.5 py-1 rounded-lg text-[10px] font-semibold text-rose-600 dark:text-rose-400 bg-rose-500/10 hover:bg-rose-500/20 transition-colors cursor-pointer"
                                  >
                                    <Repeat className="w-3 h-3" />
                                    <span className="hidden xl:inline">Tornar recorrente</span>
                                  </button>
                                )}
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(tx)}
                                  title="Editar despesa"
                                  className="p-1.5 rounded-lg hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => duplicateTransaction(tx.id)}
                                  title="Duplicar despesa"
                                  className="p-1.5 rounded-lg hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Copy className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={e => {
                                    e.stopPropagation();
                                    setPendingDeleteTx(tx);
                                  }}
                                  title="Excluir despesa"
                                  aria-label={`Excluir despesa ${tx.description}`}
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

      {/* Modal Confirmar Pagamento de Ocorrência Recorrente */}
      <ResponsiveModal
        isOpen={!!confirmingOcc}
        onClose={() => setConfirmingOcc(null)}
        title="Confirmar Pagamento"
        subtitle={confirmingOcc ? `${confirmingOcc.description} • ${confirmingOcc.period}` : undefined}
        size="md"
        onSubmit={handleSaveConfirmPayment}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Confirmar Pagamento
          </button>
        }
      >
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ajuste o valor pago, a data real do pagamento e a conta ou cartão utilizado. Isso registrará a despesa deste mês sem duplicar previsões.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldIdPrefix}-confirm-amount`} className="block font-medium text-slate-500 mb-1">
              Valor Pago (R$) *
            </label>
            <input
              id={`${fieldIdPrefix}-confirm-amount`}
              name="confirm_expense_amount"
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
              Data Real do Pagamento *
            </label>
            <input
              id={`${fieldIdPrefix}-confirm-date`}
              name="confirm_expense_date"
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
              name="confirm_expense_method"
              value={confirmPaymentMethod}
              onChange={e => setConfirmPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="pix">PIX</option>
              <option value="debit_card">Cartão de Débito</option>
              <option value="credit_card">Cartão de Crédito</option>
              <option value="money">Dinheiro em Espécie</option>
              <option value="bank_slip">Boleto Bancário</option>
              <option value="bank_transfer">Transferência Bancária</option>
            </select>
          </div>

          {confirmPaymentMethod === 'credit_card' ? (
            <div>
              <label htmlFor={`${fieldIdPrefix}-confirm-card`} className="block font-medium text-slate-500 mb-1">
                Cartão Utilizado
              </label>
              <select
                id={`${fieldIdPrefix}-confirm-card`}
                name="confirm_expense_card_id"
                value={confirmCreditCardId}
                onChange={e => setConfirmCreditCardId(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              >
                {creditCards.map(card => (
                  <option key={card.id} value={card.id}>{card.name}</option>
                ))}
              </select>
            </div>
          ) : (
            <div>
              <label htmlFor={`${fieldIdPrefix}-confirm-account`} className="block font-medium text-slate-500 mb-1">
                Conta Bancária Debitada
              </label>
              <select
                id={`${fieldIdPrefix}-confirm-account`}
                name="confirm_expense_account_id"
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

        <div>
          <label htmlFor={`${fieldIdPrefix}-confirm-notes`} className="block font-medium text-slate-500 mb-1">
            Observações
          </label>
          <input
            id={`${fieldIdPrefix}-confirm-notes`}
            name="confirm_expense_notes"
            type="text"
            autoComplete="off"
            placeholder="Opcional..."
            value={confirmNotes}
            onChange={e => setConfirmNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal Editar Despesa Fixa Recorrente (Somente esta vs Esta e futuras) */}
      <ResponsiveModal
        isOpen={!!editingRecurring}
        onClose={() => setEditingRecurring(null)}
        title="Editar Despesa Fixa Recorrente"
        subtitle={editingRecurring ? `Referência: ${editingRecurring.period}` : undefined}
        size="lg"
        onSubmit={handleSaveEditRecurring}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            disabled={editingRecurring?.scope === 'future' && !confirmFutureChecked}
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            {editingRecurring?.scope === 'future'
              ? 'Salvar Alterações para Este e Próximos Meses'
              : 'Salvar Alterações Apenas Neste Mês'}
          </button>
        }
      >
        {editingRecurring && (
          <>
            <div className="space-y-1.5">
              <span className="block font-medium text-slate-600 dark:text-slate-300">
                Alterar apenas este mês ou também os próximos?
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setEditingRecurring(prev => (prev ? { ...prev, scope: 'single' } : null));
                    setConfirmFutureChecked(false);
                  }}
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    editingRecurring.scope === 'single'
                      ? 'border-rose-500 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-semibold">Somente esta ocorrência</div>
                  <div className="text-[11px] opacity-80">Altera apenas {editingRecurring.period}</div>
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setEditingRecurring(prev => (prev ? { ...prev, scope: 'future' } : null))
                  }
                  className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                    editingRecurring.scope === 'future'
                      ? 'border-rose-500 bg-rose-500/10 text-rose-800 dark:text-rose-200'
                      : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'
                  }`}
                >
                  <div className="font-semibold">Esta e as próximas ocorrências</div>
                  <div className="text-[11px] opacity-80">
                    Aplica de {editingRecurring.period} em diante
                  </div>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label htmlFor={`${fieldIdPrefix}-rec-edit-desc`} className="block font-medium text-slate-500 mb-1">
                  Descrição *
                </label>
                <input
                  id={`${fieldIdPrefix}-rec-edit-desc`}
                  name="rec_exp_edit_description"
                  type="text"
                  autoComplete="off"
                  required
                  value={recEditDesc}
                  onChange={e => setRecEditDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label htmlFor={`${fieldIdPrefix}-rec-edit-amount`} className="block font-medium text-slate-500 mb-1">
                  Valor (R$) *
                </label>
                <input
                  id={`${fieldIdPrefix}-rec-edit-amount`}
                  name="rec_exp_edit_amount"
                  type="text"
                  autoComplete="off"
                  required
                  value={recEditAmountStr}
                  onChange={e => setRecEditAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
                  className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {editingRecurring.scope === 'single' ? (
                <div>
                  <label htmlFor={`${fieldIdPrefix}-rec-edit-custom-date`} className="block font-medium text-slate-500 mb-1">
                    Vencimento Específico
                  </label>
                  <input
                    id={`${fieldIdPrefix}-rec-edit-custom-date`}
                    name="rec_exp_edit_custom_date"
                    type="date"
                    value={recEditCustomDate}
                    onChange={e => setRecEditCustomDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor={`${fieldIdPrefix}-rec-edit-day`} className="block font-medium text-slate-500 mb-1">
                    Dia do Vencimento (1–31)
                  </label>
                  <input
                    id={`${fieldIdPrefix}-rec-edit-day`}
                    name="rec_exp_edit_day"
                    type="number"
                    min={1}
                    max={31}
                    value={recEditDay}
                    onChange={e => setRecEditDay(clampDayOfMonth(parseInt(e.target.value, 10) || 1))}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              )}

              <div>
                <label htmlFor={`${fieldIdPrefix}-rec-edit-cat`} className="block font-medium text-slate-500 mb-1">
                  Categoria
                </label>
                <select
                  id={`${fieldIdPrefix}-rec-edit-cat`}
                  name="rec_exp_edit_category"
                  value={recEditCat}
                  onChange={e => setRecEditCat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {getExpenseCategories.map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${fieldIdPrefix}-rec-edit-method`} className="block font-medium text-slate-500 mb-1">
                  Forma de Pagamento
                </label>
                <select
                  id={`${fieldIdPrefix}-rec-edit-method`}
                  name="rec_exp_edit_method"
                  value={recEditPaymentMethod}
                  onChange={e => setRecEditPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  <option value="pix">PIX</option>
                  <option value="debit_card">Cartão de Débito</option>
                  <option value="credit_card">Cartão de Crédito</option>
                  <option value="money">Dinheiro em Espécie</option>
                  <option value="bank_slip">Boleto Bancário</option>
                  <option value="bank_transfer">Transferência Bancária</option>
                </select>
              </div>
            </div>

            {recEditPaymentMethod === 'credit_card' ? (
              <div>
                <label htmlFor={`${fieldIdPrefix}-rec-edit-card`} className="block font-medium text-slate-500 mb-1">
                  Cartão Utilizado
                </label>
                <select
                  id={`${fieldIdPrefix}-rec-edit-card`}
                  name="rec_exp_edit_card"
                  value={recEditCreditCardId}
                  onChange={e => setRecEditCreditCardId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {creditCards.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor={`${fieldIdPrefix}-rec-edit-account`} className="block font-medium text-slate-500 mb-1">
                  Conta de Saída
                </label>
                <select
                  id={`${fieldIdPrefix}-rec-edit-account`}
                  name="rec_exp_edit_account"
                  value={recEditAccountId}
                  onChange={e => setRecEditAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>
            )}

            {editingRecurring.scope === 'future' && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id={`${fieldIdPrefix}-rec-edit-indefinite`}
                    name="rec_exp_edit_indefinite"
                    type="checkbox"
                    checked={recEditIsIndefinite}
                    onChange={e => {
                      setRecEditIsIndefinite(e.target.checked);
                      if (e.target.checked) setRecEditEndDate('');
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <label htmlFor={`${fieldIdPrefix}-rec-edit-indefinite`} className="font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                    Sem data de término (indeterminada)
                  </label>
                </div>

                {!recEditIsIndefinite && (
                  <div>
                    <label htmlFor={`${fieldIdPrefix}-rec-edit-end-date`} className="block text-[11px] font-medium text-slate-500 mb-1">
                      Data de término
                    </label>
                    <input
                      id={`${fieldIdPrefix}-rec-edit-end-date`}
                      name="rec_exp_edit_end_date"
                      type="date"
                      value={recEditEndDate}
                      onChange={e => setRecEditEndDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                    />
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200 dark:border-slate-700 flex items-start gap-2">
                  <input
                    id={`${fieldIdPrefix}-rec-confirm-future`}
                    name="rec_exp_confirm_future"
                    type="checkbox"
                    checked={confirmFutureChecked}
                    onChange={e => setConfirmFutureChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                  />
                  <label htmlFor={`${fieldIdPrefix}-rec-confirm-future`} className="text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                    Confirmo que desejo aplicar esta alteração a partir de <strong>{editingRecurring.period}</strong> e para os próximos meses, preservando meses anteriores já pagos.
                  </label>
                </div>
              </div>
            )}

            <div>
              <label htmlFor={`${fieldIdPrefix}-rec-edit-notes`} className="block font-medium text-slate-500 mb-1">
                Observações
              </label>
              <input
                id={`${fieldIdPrefix}-rec-edit-notes`}
                name="rec_exp_edit_notes"
                type="text"
                autoComplete="off"
                value={recEditNotes}
                onChange={e => setRecEditNotes(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
              />
            </div>
          </>
        )}
      </ResponsiveModal>

      {/* Modal Converter Despesa Fixa Existente em Recorrente Mensal */}
      <ResponsiveModal
        isOpen={!!convertingTx}
        onClose={() => setConvertingTx(null)}
        title="Tornar Despesa Recorrente Mensal"
        subtitle={convertingTx?.description}
        size="md"
        onSubmit={handleSaveConvertTx}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Ativar Recorrência Mensal
          </button>
        }
      >
        <p className="text-xs text-slate-500 dark:text-slate-400">
          O lançamento atual será mantido sem duplicação nem alteração no saldo bancário, passando a gerar previsões automáticas nos próximos meses.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldIdPrefix}-convert-day`} className="block font-medium text-slate-500 mb-1">
              Dia do Vencimento (1–31)
            </label>
            <input
              id={`${fieldIdPrefix}-convert-day`}
              name="convert_day_of_month"
              type="number"
              min={1}
              max={31}
              required
              value={convertDay}
              onChange={e => setConvertDay(clampDayOfMonth(parseInt(e.target.value, 10) || 1))}
              className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          <div className="flex items-center gap-2 pt-5">
            <input
              id={`${fieldIdPrefix}-convert-indefinite`}
              name="convert_is_indefinite"
              type="checkbox"
              checked={convertIsIndefinite}
              onChange={e => {
                setConvertIsIndefinite(e.target.checked);
                if (e.target.checked) setConvertEndDate('');
              }}
              className="h-4 w-4 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
            />
            <label htmlFor={`${fieldIdPrefix}-convert-indefinite`} className="font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
              Sem data de término
            </label>
          </div>
        </div>

        {!convertIsIndefinite && (
          <div>
            <label htmlFor={`${fieldIdPrefix}-convert-end-date`} className="block font-medium text-slate-500 mb-1">
              Data de Término
            </label>
            <input
              id={`${fieldIdPrefix}-convert-end-date`}
              name="convert_end_date"
              type="date"
              required={!convertIsIndefinite}
              value={convertEndDate}
              onChange={e => setConvertEndDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        )}

        <div>
          <label htmlFor={`${fieldIdPrefix}-convert-notes`} className="block font-medium text-slate-500 mb-1">
            Observações (opcional)
          </label>
          <input
            id={`${fieldIdPrefix}-convert-notes`}
            name="convert_notes"
            type="text"
            autoComplete="off"
            value={convertNotes}
            onChange={e => setConvertNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal Encerrar Recorrência */}
      <ResponsiveModal
        isOpen={!!endingRule}
        onClose={() => setEndingRule(null)}
        title="Encerrar Despesa Fixa Recorrente"
        subtitle={endingRule?.description}
        size="md"
        onSubmit={handleConfirmEndRecurrence}
        bodyClassName="text-xs"
        footer={
          <div className="flex items-center justify-end gap-2 w-full">
            <button
              type="button"
              onClick={() => setEndingRule(null)}
              className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold cursor-pointer"
            >
              Confirmar Encerramento
            </button>
          </div>
        }
      >
        <p className="text-xs text-slate-600 dark:text-slate-300">
          Deseja encerrar esta despesa recorrente mensal? Todos os pagamentos passados já confirmados permanecerão intactos no histórico e nos saldos das contas.
        </p>
        <div>
          <label htmlFor={`${fieldIdPrefix}-end-cutoff`} className="block font-medium text-slate-500 mb-1">
            A partir de qual mês interromper novas previsões?
          </label>
          <select
            id={`${fieldIdPrefix}-end-cutoff`}
            name="end_exp_cutoff"
            value={endFromPeriodChoice}
            onChange={e => setEndFromPeriodChoice(e.target.value as 'current' | 'next')}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="current">A partir do mês selecionado ({selectedPeriod})</option>
            <option value="next">A partir do próximo mês ({addMonthsToPeriod(selectedPeriod, 1)})</option>
          </select>
        </div>
      </ResponsiveModal>

      {/* Modal Excluir Regra de Recorrência */}
      <ConfirmDeleteModal
        isOpen={!!deletingRule}
        title="Excluir Regra Recorrente"
        description="A regra de recorrência será removida e não gerará mais previsões futuras. Todos os lançamentos já pagos permanecerão preservados no histórico."
        itemLabel={deletingRule?.description}
        itemValue={deletingRule ? `-${formatCurrency(deletingRule.amount)}` : undefined}
        isDeleting={false}
        onConfirm={handleConfirmDeleteRule}
        onCancel={() => setDeletingRule(null)}
      />

      {/* Modal Editar Despesa Avulsa */}
      <ResponsiveModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        title="Editar Despesa"
        size="md"
        onSubmit={handleSaveEdit}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
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
              {getExpenseCategories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}-edit-type`} className="block font-medium text-slate-500 mb-1">Tipo de Despesa</label>
            <select
              id={`${fieldIdPrefix}-edit-type`}
              name="expense_type"
              value={editType}
              onChange={e => setEditType(e.target.value as 'expense_fixed' | 'expense_variable')}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="expense_variable">Variável</option>
              <option value="expense_fixed">Fixa</option>
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
            <label htmlFor={`${fieldIdPrefix}-edit-due-date`} className="block font-medium text-slate-500 mb-1">Data de Vencimento</label>
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

        <div>
          <label htmlFor={`${fieldIdPrefix}-edit-status`} className="block font-medium text-slate-500 mb-1">Situação / Status</label>
          <select
            id={`${fieldIdPrefix}-edit-status`}
            name="status"
            value={editStatus}
            onChange={e => setEditStatus(e.target.value as 'paid' | 'pending')}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="paid">Já Pago (Efetivado)</option>
            <option value="pending">Pendente (A pagar)</option>
          </select>
        </div>

        <div>
          <label htmlFor={`${fieldIdPrefix}-edit-notes`} className="block font-medium text-slate-500 mb-1">Observações</label>
          <input
            id={`${fieldIdPrefix}-edit-notes`}
            name="notes"
            type="text"
            autoComplete="off"
            placeholder="Opcional..."
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteTx}
        title="Excluir Despesa"
        description="Deseja excluir esta despesa? Os indicadores e o saldo da conta vinculada serão atualizados automaticamente."
        itemLabel={pendingDeleteTx?.description}
        itemValue={pendingDeleteTx ? `-${formatCurrency(pendingDeleteTx.amount)}` : undefined}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteTx(null)}
      />
    </div>
  );
};
