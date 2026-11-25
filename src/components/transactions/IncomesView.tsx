/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';
import {
  Plus,
  Briefcase,
  Gift,
  Coins,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Copy,
  Edit2,
  ArrowUpRight,
  Repeat,
  AlertTriangle,
  SkipForward,
  RotateCcw,
  StopCircle,
  Calendar
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO, MONTH_NAMES_PT } from '../../utils/formatters';
import {
  addMonthsToPeriod,
  calculateRecurringIncomeAnnualTotal,
  clampDayOfMonth,
  formatPeriod,
  getEffectiveRuleValuesForPeriod
} from '../../utils/recurringIncome';
import {
  groupTransactionsByMonth,
  isVirtualTransaction,
  resolveActivePeriod
} from '../../utils/periodFilter';
import {
  IncomeGroup,
  PaymentMethod,
  RecurringIncomeOccurrence,
  RecurringIncomeRule,
  Transaction
} from '../../types/finance';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export const IncomesView: React.FC = () => {
  const {
    transactions,
    filteredTransactions,
    filter,
    activePeriod: ctxActivePeriod,
    periodLabel: ctxPeriodLabel,
    accounts,
    categories,
    recurringIncomes = [],
    selectedMonthRecurringIncomes = [],
    periodRecurringIncomes,
    selectedYear = new Date().getFullYear(),
    selectedMonth = new Date().getMonth(),
    deleteTransaction,
    duplicateTransaction,
    openQuickEntry,
    updateTransaction,
    confirmRecurringIncomeReceipt,
    updateRecurringIncome,
    skipRecurringIncomeOccurrence,
    unskipRecurringIncomeOccurrence,
    endRecurringIncome
  } = useFinance();

  const activePeriod = ctxActivePeriod ?? resolveActivePeriod(filter ?? { period: 'current_month' });
  const periodLabel = ctxPeriodLabel ?? activePeriod.label;

  const fieldIdPrefix = useId();
  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<IncomeGroup | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');

  // Edit single transaction Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [editStatus, setEditStatus] = useState<'paid' | 'pending'>('paid');
  const [editNotes, setEditNotes] = useState('');

  // Confirm recurring occurrence receipt Modal State
  const [confirmingOcc, setConfirmingOcc] = useState<RecurringIncomeOccurrence | null>(null);
  const [confirmAmountStr, setConfirmAmountStr] = useState('');
  const [confirmDate, setConfirmDate] = useState('');
  const [confirmAccountId, setConfirmAccountId] = useState('');
  const [confirmNotes, setConfirmNotes] = useState('');

  // Edit recurring income rule/occurrence Modal State
  const [editingRecurring, setEditingRecurring] = useState<{
    rule: RecurringIncomeRule;
    period: string;
    scope: 'single' | 'future';
  } | null>(null);
  const [recEditDesc, setRecEditDesc] = useState('');
  const [recEditAmountStr, setRecEditAmountStr] = useState('');
  const [recEditDay, setRecEditDay] = useState(5);
  const [recEditCustomDate, setRecEditCustomDate] = useState('');
  const [recEditCat, setRecEditCat] = useState('');
  const [recEditAccountId, setRecEditAccountId] = useState('');
  const [recEditPaymentMethod, setRecEditPaymentMethod] = useState<PaymentMethod>('bank_transfer');
  const [recEditIsIndefinite, setRecEditIsIndefinite] = useState(true);
  const [recEditEndDate, setRecEditEndDate] = useState('');
  const [recEditNotes, setRecEditNotes] = useState('');
  const [confirmFutureChecked, setConfirmFutureChecked] = useState(false);

  // End recurrence confirmation Modal State
  const [endingRule, setEndingRule] = useState<RecurringIncomeRule | null>(null);
  const [endFromPeriodChoice, setEndFromPeriodChoice] = useState<'current' | 'next'>('current');

  // Delete confirmation & feedback state
  const [pendingDeleteTx, setPendingDeleteTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [actionFeedback, setActionFeedback] = useState<ActionFeedback | null>(null);

  const todayISO = getTodayISO();
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
        text: err?.message || 'Não foi possível excluir a entrada financeira.'
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
    setEditDate(tx.date);
    setEditAccountId(tx.accountId || accounts[0]?.id || '');
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
      category: editCat,
      date: editDate,
      accountId: editAccountId,
      status: editStatus,
      notes: editNotes.trim() || undefined
    });

    setEditingTx(null);
  };

  const handleOpenConfirmOccurrence = (occ: RecurringIncomeOccurrence) => {
    setConfirmingOcc(occ);
    setConfirmAmountStr(occ.amount.toFixed(2).replace('.', ','));
    setConfirmDate(occ.status === 'overdue' ? todayISO : occ.date);
    setConfirmAccountId(occ.accountId || accounts[0]?.id || '');
    setConfirmNotes(occ.notes || '');
  };

  const handleSaveConfirmReceipt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmingOcc) return;
    const amount = parseFloat(confirmAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0 || !confirmDate) return;

    confirmRecurringIncomeReceipt?.({
      ruleId: confirmingOcc.ruleId,
      period: confirmingOcc.period,
      actualAmount: amount,
      actualDate: confirmDate,
      accountId: confirmAccountId || undefined,
      paymentMethod: confirmingOcc.paymentMethod,
      notes: confirmNotes.trim() || undefined
    });

    setActionFeedback({
      type: 'success',
      text: `Recebimento de "${confirmingOcc.description}" confirmado com sucesso.`
    });
    setConfirmingOcc(null);
  };

  const handleOpenEditRecurring = (
    rule: RecurringIncomeRule,
    period: string,
    initialScope: 'single' | 'future'
  ) => {
    const eff = getEffectiveRuleValuesForPeriod(rule, period);
    const linkedTx = transactions.find(
      t => t.type === 'income' && t.recurringIncomeId === rule.id && t.recurringPeriod === period
    );
    setEditingRecurring({ rule, period, scope: initialScope });
    setRecEditDesc(linkedTx?.description || eff.description);
    setRecEditAmountStr((linkedTx?.amount ?? eff.amount).toFixed(2).replace('.', ','));
    setRecEditDay(eff.dayOfMonth);
    setRecEditCustomDate(linkedTx?.date || eff.customDate || '');
    setRecEditCat(linkedTx?.category || eff.category);
    setRecEditAccountId(linkedTx?.accountId || eff.accountId || accounts[0]?.id || '');
    setRecEditPaymentMethod(linkedTx?.paymentMethod || eff.paymentMethod);
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

    updateRecurringIncome?.({
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
        accountId: recEditAccountId || undefined,
        paymentMethod: recEditPaymentMethod,
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
          : `Receita fixa atualizada para ${editingRecurring.period} e meses futuros.`
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
    endRecurringIncome?.(endingRule.id, cutoff);
    setActionFeedback({
      type: 'success',
      text: `Recorrência "${endingRule.description}" encerrada a partir de ${cutoff}. Histórico recebido preservado.`
    });
    setEndingRule(null);
  };

  // Filter only income transactions inside active global period
  const baseTransactions = filteredTransactions ?? transactions;
  const incomeTransactions = baseTransactions.filter(t => t.type === 'income');

  // Group helpers
  const getCategoryGroup = (categoryName: string): IncomeGroup => {
    const cat = categories.find(c => c.name === categoryName && c.type === 'income');
    return cat?.incomeGroup || 'other';
  };

  const filteredIncomes = incomeTransactions.filter(t => {
    if (
      search &&
      !t.description.toLowerCase().includes(search.toLowerCase()) &&
      !t.category.toLowerCase().includes(search.toLowerCase())
    ) {
      return false;
    }
    if (statusFilter !== 'all' && t.status !== statusFilter) {
      return false;
    }
    if (selectedGroup !== 'all') {
      const grp = getCategoryGroup(t.category);
      if (grp !== selectedGroup) return false;
    }
    return true;
  });

  const displayedRecurringOccurrences = activePeriod.isMultiMonth
    ? (periodRecurringIncomes ?? selectedMonthRecurringIncomes)
    : selectedMonthRecurringIncomes;

  // Strict separation between realized (paid) vs predicted/pending incomes
  const paidIncomeTransactions = incomeTransactions.filter(t => t.status === 'paid' && !isVirtualTransaction(t));
  const pendingSavedIncomes = incomeTransactions.filter(t => t.status !== 'paid' && !isVirtualTransaction(t));
  const virtualFilteredIncomes = incomeTransactions.filter(t => isVirtualTransaction(t));

  const virtualForecastSum = virtualFilteredIncomes.length > 0
    ? virtualFilteredIncomes.reduce((sum, t) => sum + t.amount, 0)
    : displayedRecurringOccurrences
        .filter(o => o.isVirtual && (o.status === 'predicted' || o.status === 'overdue'))
        .reduce((sum, o) => sum + o.amount, 0);

  const isForwardProjectionView = activePeriod.isFutureView || activePeriod.includesFuture;
  const kpiSourceTransactions = isForwardProjectionView ? incomeTransactions : paidIncomeTransactions;

  const totalMain = kpiSourceTransactions
    .filter(t => getCategoryGroup(t.category) === 'main_income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalBenefits = kpiSourceTransactions
    .filter(t => getCategoryGroup(t.category) === 'benefits')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExtras = kpiSourceTransactions
    .filter(t => getCategoryGroup(t.category) === 'extra_income' || getCategoryGroup(t.category) === 'other')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalReceivedIncomes = paidIncomeTransactions.reduce((sum, t) => sum + t.amount, 0);
  const totalPendingIncomes =
    pendingSavedIncomes.reduce((sum, t) => sum + t.amount, 0) + virtualForecastSum;
  const totalProjectedPlusReceived = totalReceivedIncomes + totalPendingIncomes;

  const handleToggleStatus = (tx: Transaction) => {
    if (isVirtualTransaction(tx)) {
      if (tx.recurringIncomeId && tx.recurringPeriod) {
        const matchedOcc = displayedRecurringOccurrences.find(
          o => o.ruleId === tx.recurringIncomeId && o.period === tx.recurringPeriod
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

  const shouldGroupByMonth = activePeriod.isMultiMonth || activePeriod.filterPeriod === 'all';
  const groupedIncomes = groupTransactionsByMonth(filteredIncomes, {
    ascending: isForwardProjectionView,
    todayISO
  });

  return (
    <div className="space-y-6">
      {/* Top Banner with Groups */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              Entradas Financeiras
            </h2>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg text-[11px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
              <Calendar className="w-3 h-3" />
              <span>{periodLabel}</span>
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Controle de salários, receitas fixas recorrentes, benefícios e rendas extras
          </p>
        </div>
        <button
          type="button"
          onClick={() => openQuickEntry('income')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-xs cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Nova Entrada</span>
        </button>
      </div>

      <ActionFeedbackBanner
        feedback={actionFeedback}
        onClose={() => setActionFeedback(null)}
      />

      {/* Group Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Geral Recebido (strictly paid on current/past, or projected+received on forward views) */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>{isForwardProjectionView ? 'Total Previsto no Período' : 'Total Recebido'}</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(isForwardProjectionView ? totalProjectedPlusReceived : totalReceivedIncomes)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {paidIncomeTransactions.length} efetivada(s)
            {totalPendingIncomes > 0 ? ` • +${formatCurrency(totalPendingIncomes)} previsto` : ''}
          </div>
        </div>

        {/* Renda Principal */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Renda Principal</span>
            <Briefcase className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalMain)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Salário, adiantamentos e horas
          </div>
        </div>

        {/* Benefícios e Adicionais */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Benefícios & Bônus</span>
            <Gift className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalBenefits)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            13º, VR, PLR, bonificações
          </div>
        </div>

        {/* Entradas Extras */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Entradas Extras</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalExtras)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Freelances, vendas e serviços
          </div>
        </div>
      </div>

      {/* Seção: Receitas Fixas Recorrentes (Regras configuradas) */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Repeat className="w-4 h-4 text-emerald-500" />
              <span>Receitas Fixas Recorrentes</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Rendas mensais configuradas para projeção automática nos próximos meses
            </p>
          </div>
          <button
            type="button"
            onClick={() => openQuickEntry('income')}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-xl bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/20 transition-colors cursor-pointer self-start sm:self-auto"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Receita Fixa</span>
          </button>
        </div>

        {recurringIncomes.length === 0 ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-200 dark:border-slate-800 text-xs text-slate-500 text-center">
            Nenhuma receita fixa recorrente cadastrada ainda. Use <strong>Cadastrar Nova Entrada</strong> e ative a opção <strong>Receita fixa mensal</strong> para projetar salários, aposentadorias ou aluguéis automaticamente.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recurringIncomes.map(rule => {
              const eff = getEffectiveRuleValuesForPeriod(rule, selectedPeriod);
              const annualExpected = calculateRecurringIncomeAnnualTotal(rule, selectedPeriod);
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
                        {eff.category} • Mensal (todo dia {eff.dayOfMonth}) •{' '}
                        {rule.isIndefinite
                          ? 'Indeterminada'
                          : rule.endDate
                          ? `Até ${formatDateBR(rule.endDate)}`
                          : 'Prazo definido'}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(eff.amount)}
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
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-medium bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-700 dark:text-rose-300 hover:bg-rose-100 dark:hover:bg-rose-950/50 transition-colors cursor-pointer"
                      >
                        <StopCircle className="w-3 h-3" />
                        <span>Encerrar recorrência</span>
                      </button>
                    )}
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
                <Calendar className="w-4 h-4 text-emerald-500" />
                <span>
                  Ocorrências Recorrentes de{' '}
                  {activePeriod.mode === 'single_month' ? selectedMonthLabel : periodLabel}
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Previsões não alteram o saldo atual das contas até você confirmar o recebimento real
              </p>
            </div>
          </div>

          <div className="space-y-2.5">
            {displayedRecurringOccurrences.map(occ => {
              const parentRule = recurringIncomes.find(r => r.id === occ.ruleId);
              const acc = accounts.find(a => a.id === occ.accountId);
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
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold">
                        <Repeat className="w-2.5 h-2.5" />
                        Fixa mensal
                      </span>
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                          occ.status === 'received'
                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                            : occ.status === 'overdue'
                            ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                            : occ.status === 'skipped'
                            ? 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                            : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                        }`}
                      >
                        {occ.status === 'received' ? (
                          <CheckCircle2 className="w-3 h-3" />
                        ) : occ.status === 'overdue' ? (
                          <AlertTriangle className="w-3 h-3" />
                        ) : (
                          <Clock className="w-3 h-3" />
                        )}
                        <span>
                          {occ.status === 'received'
                            ? 'Recebida'
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
                      {acc && <span>• {acc.name}</span>}
                      {wasClamped && (
                        <span className="text-amber-600 dark:text-amber-400">
                          • Dia {occ.configuredDayOfMonth} ajustado ao fim do mês
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between lg:justify-end gap-2.5 shrink-0">
                    <span className="font-mono font-bold text-sm text-emerald-600 dark:text-emerald-400 tabular-nums">
                      +{formatCurrency(occ.amount)}
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
                              <span>Confirmar recebimento</span>
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
                                skipRecurringIncomeOccurrence?.(occ.ruleId, occ.period);
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
                            onClick={() => unskipRecurringIncomeOccurrence?.(occ.ruleId, occ.period)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[11px] font-medium bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Restaurar previsão</span>
                          </button>
                        )}

                        {occ.status === 'received' && (
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

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            id={`${fieldIdPrefix}-search`}
            name="incomes_search"
            type="text"
            autoComplete="off"
            aria-label="Buscar entradas financeiras"
            placeholder="Buscar por descrição ou categoria..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-col min-[380px]:flex-row flex-wrap items-stretch min-[380px]:items-center gap-2">
          {/* Group Filter */}
          <select
            id={`${fieldIdPrefix}-group-filter`}
            name="incomes_group_filter"
            aria-label="Filtrar por grupo de renda"
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value as any)}
            className="w-full min-[380px]:w-auto flex-1 px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todos os Grupos</option>
            <option value="main_income">Renda Principal</option>
            <option value="benefits">Benefícios & Adicionais</option>
            <option value="extra_income">Entradas Extras</option>
          </select>

          {/* Status Filter */}
          <select
            id={`${fieldIdPrefix}-status-filter`}
            name="incomes_status_filter"
            aria-label="Filtrar por situação"
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="w-full min-[380px]:w-auto flex-1 px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todas as Situações</option>
            <option value="paid">Recebido</option>
            <option value="pending">Previsto / Pendente</option>
          </select>
        </div>
      </div>

      {/* Incomes Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        {filteredIncomes.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            Nenhuma entrada encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria / Grupo</th>
                  <th className="py-3 px-4">Conta de Destino</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {(shouldGroupByMonth
                  ? groupedIncomes
                  : [
                      {
                        period: activePeriod.selectedPeriod,
                        label: periodLabel,
                        shortLabel: activePeriod.shortLabel,
                        isFuture: activePeriod.isFutureView,
                        isCurrent: activePeriod.isCurrentMonth,
                        transactions: filteredIncomes,
                        totalIncome: filteredIncomes.reduce((s, t) => s + t.amount, 0),
                        totalExpense: 0,
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
                              <Calendar className="w-3 h-3 text-emerald-500" />
                              <span>{group.label}</span>
                              {group.isFuture && (
                                <span className="px-1.5 py-0.2 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px]">
                                  Projeção
                                </span>
                              )}
                            </span>
                            <span className="font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
                              +{formatCurrency(group.totalIncome)} ({group.transactions.length})
                            </span>
                          </div>
                        </td>
                      </tr>
                    )}
                    {group.transactions.map(tx => {
                      const grp = getCategoryGroup(tx.category);
                      const acc = accounts.find(a => a.id === tx.accountId);
                      const isVirtual = isVirtualTransaction(tx);
                      const isOverdue =
                        tx.projectedStatus === 'overdue' ||
                        (tx.status !== 'paid' && tx.date < todayISO);
                      const isFixedBadge = Boolean(tx.recurringIncomeId || tx.isRecurring);
                      return (
                        <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                            {formatDateBR(tx.date)}
                          </td>
                          <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                            <div className="flex items-center gap-2 max-w-xs">
                              <span className="truncate">{tx.description}</span>
                              {isFixedBadge && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 text-[10px] font-semibold shrink-0">
                                  <Repeat className="w-2.5 h-2.5" />
                                  Fixa mensal
                                </span>
                              )}
                              {isVirtual && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-700 dark:text-blue-400 text-[10px] font-semibold shrink-0">
                                  Projeção
                                </span>
                              )}
                            </div>
                            {tx.notes && <div className="text-[11px] text-slate-400 truncate">{tx.notes}</div>}
                          </td>
                          <td className="py-3 px-4">
                            <div className="font-medium text-slate-800 dark:text-slate-200">{tx.category}</div>
                            <div className="text-[10px] text-slate-400 capitalize">
                              {grp === 'main_income' ? 'Renda Principal' : grp === 'benefits' ? 'Benefícios' : 'Entrada Extra'}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-500 truncate max-w-[140px]">
                            {acc ? acc.name : '-'}
                          </td>
                          <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                            +{formatCurrency(tx.amount)}
                          </td>
                          <td className="py-3 px-4 whitespace-nowrap">
                            <button
                              type="button"
                              onClick={() => handleToggleStatus(tx)}
                              title={isVirtual ? 'Confirmar recebimento desta previsão' : 'Clique para alternar status'}
                              className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors cursor-pointer ${
                                tx.status === 'paid'
                                  ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                  : isOverdue
                                  ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                  : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
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
                                  ? 'Recebido'
                                  : isOverdue
                                  ? 'Previsto em atraso'
                                  : 'Previsto'}
                              </span>
                            </button>
                          </td>
                          <td className="py-3 px-4 text-center whitespace-nowrap">
                            {isVirtual ? (
                              tx.recurringIncomeId && tx.recurringPeriod ? (
                                <button
                                  type="button"
                                  onClick={() => handleToggleStatus(tx)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors cursor-pointer"
                                >
                                  <CheckCircle2 className="w-3 h-3" />
                                  <span>Confirmar</span>
                                </button>
                              ) : (
                                <span className="text-[10px] text-slate-400 font-medium">Previsto</span>
                              )
                            ) : (
                              <div className="flex items-center justify-center gap-1 text-slate-400">
                                <button
                                  type="button"
                                  onClick={() => handleOpenEdit(tx)}
                                  title="Editar entrada"
                                  className="p-1.5 rounded-lg hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => duplicateTransaction(tx.id)}
                                  title="Duplicar entrada"
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
                                  title="Excluir entrada"
                                  aria-label={`Excluir entrada ${tx.description}`}
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

      {/* Modal Confirmar Recebimento de Ocorrência Recorrente */}
      <ResponsiveModal
        isOpen={!!confirmingOcc}
        onClose={() => setConfirmingOcc(null)}
        title="Confirmar Recebimento"
        subtitle={confirmingOcc ? `${confirmingOcc.description} • ${confirmingOcc.period}` : undefined}
        size="md"
        onSubmit={handleSaveConfirmReceipt}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Confirmar Recebimento na Conta
          </button>
        }
      >
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Ajuste o valor líquido efetivamente recebido e a data real do crédito, caso necessário. Isso atualizará o saldo da conta selecionada sem duplicar este mês.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={`${fieldIdPrefix}-confirm-amount`} className="block font-medium text-slate-500 mb-1">
              Valor Recebido (R$) *
            </label>
            <input
              id={`${fieldIdPrefix}-confirm-amount`}
              name="confirm_amount"
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
              Data Real do Recebimento *
            </label>
            <input
              id={`${fieldIdPrefix}-confirm-date`}
              name="confirm_date"
              type="date"
              required
              value={confirmDate}
              onChange={e => setConfirmDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label htmlFor={`${fieldIdPrefix}-confirm-account`} className="block font-medium text-slate-500 mb-1">
            Conta Bancária Creditada
          </label>
          <select
            id={`${fieldIdPrefix}-confirm-account`}
            name="confirm_account_id"
            value={confirmAccountId}
            onChange={e => setConfirmAccountId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={`${fieldIdPrefix}-confirm-notes`} className="block font-medium text-slate-500 mb-1">
            Observações
          </label>
          <input
            id={`${fieldIdPrefix}-confirm-notes`}
            name="confirm_notes"
            type="text"
            autoComplete="off"
            placeholder="Opcional..."
            value={confirmNotes}
            onChange={e => setConfirmNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal Editar Receita Fixa (Somente esta ocorrência vs Esta e futuras) */}
      <ResponsiveModal
        isOpen={!!editingRecurring}
        onClose={() => setEditingRecurring(null)}
        title="Editar Receita Fixa Recorrente"
        subtitle={editingRecurring ? `Referência: ${editingRecurring.period}` : undefined}
        size="lg"
        onSubmit={handleSaveEditRecurring}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            disabled={editingRecurring?.scope === 'future' && !confirmFutureChecked}
            className="w-full min-h-[42px] py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
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
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
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
                      ? 'border-emerald-500 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200'
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
                  name="rec_edit_description"
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
                  name="rec_edit_amount"
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
                    Data Específica
                  </label>
                  <input
                    id={`${fieldIdPrefix}-rec-edit-custom-date`}
                    name="rec_edit_custom_date"
                    type="date"
                    value={recEditCustomDate}
                    onChange={e => setRecEditCustomDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              ) : (
                <div>
                  <label htmlFor={`${fieldIdPrefix}-rec-edit-day`} className="block font-medium text-slate-500 mb-1">
                    Dia do Recebimento (1–31)
                  </label>
                  <input
                    id={`${fieldIdPrefix}-rec-edit-day`}
                    name="rec_edit_day"
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
                  name="rec_edit_category"
                  value={recEditCat}
                  onChange={e => setRecEditCat(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {categories.filter(c => c.type === 'income').map(c => (
                    <option key={c.id} value={c.name}>{c.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor={`${fieldIdPrefix}-rec-edit-account`} className="block font-medium text-slate-500 mb-1">
                  Conta de Destino
                </label>
                <select
                  id={`${fieldIdPrefix}-rec-edit-account`}
                  name="rec_edit_account"
                  value={recEditAccountId}
                  onChange={e => setRecEditAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>{acc.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {editingRecurring.scope === 'future' && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    id={`${fieldIdPrefix}-rec-edit-indefinite`}
                    name="rec_edit_indefinite"
                    type="checkbox"
                    checked={recEditIsIndefinite}
                    onChange={e => {
                      setRecEditIsIndefinite(e.target.checked);
                      if (e.target.checked) setRecEditEndDate('');
                    }}
                    className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
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
                      name="rec_edit_end_date"
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
                    name="rec_confirm_future"
                    type="checkbox"
                    checked={confirmFutureChecked}
                    onChange={e => setConfirmFutureChecked(e.target.checked)}
                    className="mt-0.5 h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                  />
                  <label htmlFor={`${fieldIdPrefix}-rec-confirm-future`} className="text-[11px] text-slate-600 dark:text-slate-300 cursor-pointer">
                    Confirmo que desejo aplicar esta alteração a partir de <strong>{editingRecurring.period}</strong> e para os próximos meses, preservando meses anteriores já recebidos.
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
                name="rec_edit_notes"
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

      {/* Modal Encerrar Recorrência */}
      <ResponsiveModal
        isOpen={!!endingRule}
        onClose={() => setEndingRule(null)}
        title="Encerrar Receita Fixa Recorrente"
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
          Deseja encerrar esta recorrência mensal? Todos os recebimentos passados já confirmados permanecerão intactos no histórico e nos saldos das contas.
        </p>
        <div>
          <label htmlFor={`${fieldIdPrefix}-end-cutoff`} className="block font-medium text-slate-500 mb-1">
            A partir de qual mês interromper novas previsões?
          </label>
          <select
            id={`${fieldIdPrefix}-end-cutoff`}
            name="end_cutoff"
            value={endFromPeriodChoice}
            onChange={e => setEndFromPeriodChoice(e.target.value as 'current' | 'next')}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="current">A partir do mês selecionado ({selectedPeriod})</option>
            <option value="next">A partir do próximo mês ({addMonthsToPeriod(selectedPeriod, 1)})</option>
          </select>
        </div>
      </ResponsiveModal>

      {/* Modal Editar Entrada */}
      <ResponsiveModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        title="Editar Entrada Financeira"
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
              {categories.filter(c => c.type === 'income').map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor={`${fieldIdPrefix}-edit-account`} className="block font-medium text-slate-500 mb-1">Conta de Destino</label>
            <select
              id={`${fieldIdPrefix}-edit-account`}
              name="account_id"
              value={editAccountId}
              onChange={e => setEditAccountId(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>{acc.name}</option>
              ))}
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
            <label htmlFor={`${fieldIdPrefix}-edit-status`} className="block font-medium text-slate-500 mb-1">Situação / Status</label>
            <select
              id={`${fieldIdPrefix}-edit-status`}
              name="status"
              value={editStatus}
              onChange={e => setEditStatus(e.target.value as 'paid' | 'pending')}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="paid">Recebido na Conta</option>
              <option value="pending">Previsto / Pendente</option>
            </select>
          </div>
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
        title="Excluir Entrada Financeira"
        description="Deseja excluir este lançamento de entrada? Caso já tenha sido recebido, o saldo da conta bancária vinculada será ajustado automaticamente e os demais lançamentos permanecerão intactos."
        itemLabel={pendingDeleteTx?.description}
        itemValue={pendingDeleteTx ? `+${formatCurrency(pendingDeleteTx.amount)}` : undefined}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteTx(null)}
      />
    </div>
  );
};
