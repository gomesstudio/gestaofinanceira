/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';
import {
  AlertCircle,
  Plus,
  TrendingDown,
  DollarSign,
  Calendar,
  AlertTriangle,
  CheckCircle,
  Clock,
  HelpCircle,
  ArrowRight,
  ShieldAlert,
  Percent,
  Trash2,
  Edit2,
  History
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO } from '../../utils/formatters';
import { Debt, DebtPriority, DebtStatus } from '../../types/finance';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export const DebtsView: React.FC = () => {
  const {
    debts,
    addDebt,
    updateDebt,
    deleteDebt,
    amortizeDebt,
    accounts
  } = useFinance();

  const fieldIdPrefix = useId();
  const debtNameId = `${fieldIdPrefix}-debt-name`;
  const debtCreditorId = `${fieldIdPrefix}-debt-creditor`;
  const debtPriorityId = `${fieldIdPrefix}-debt-priority`;
  const debtOriginalAmountId = `${fieldIdPrefix}-debt-original-amount`;
  const debtCurrentBalanceId = `${fieldIdPrefix}-debt-current-balance`;
  const debtInterestRateId = `${fieldIdPrefix}-debt-interest-rate`;
  const debtMinPaymentId = `${fieldIdPrefix}-debt-min-payment`;
  const debtDueDateId = `${fieldIdPrefix}-debt-due-date`;
  const debtStatusId = `${fieldIdPrefix}-debt-status`;
  const debtNotesId = `${fieldIdPrefix}-debt-notes`;
  const amortizeAmountId = `${fieldIdPrefix}-amortize-amount`;
  const amortizeAccountSelectId = `${fieldIdPrefix}-amortize-account`;
  const amortizeNotesId = `${fieldIdPrefix}-amortize-notes`;
  const editDebtNameId = `${fieldIdPrefix}-edit-debt-name`;
  const editCreditorId = `${fieldIdPrefix}-edit-debt-creditor`;
  const editPriorityId = `${fieldIdPrefix}-edit-debt-priority`;
  const editCurrentBalanceId = `${fieldIdPrefix}-edit-debt-current-balance`;
  const editMinPaymentId = `${fieldIdPrefix}-edit-debt-min-payment`;
  const editInterestRateId = `${fieldIdPrefix}-edit-debt-interest-rate`;
  const editDueDateId = `${fieldIdPrefix}-edit-debt-due-date`;
  const editStatusId = `${fieldIdPrefix}-edit-debt-status`;
  const editNotesId = `${fieldIdPrefix}-edit-debt-notes`;

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [amortizeModalDebt, setAmortizeModalDebt] = useState<Debt | null>(null);
  const [editingDebt, setEditingDebt] = useState<Debt | null>(null);
  const [historyModalDebt, setHistoryModalDebt] = useState<Debt | null>(null);
  const [pendingDeleteDebt, setPendingDeleteDebt] = useState<Debt | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<ActionFeedback | null>(null);

  const handleConfirmDeleteDebt = async () => {
    if (!pendingDeleteDebt || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteDebt(pendingDeleteDebt.id);
      setDeleteFeedback({
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      });
    } catch (err: any) {
      setDeleteFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível excluir a dívida.'
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteDebt(null);
    }
  };

  // Form states for Add Debt
  const [name, setName] = useState('');
  const [creditor, setCreditor] = useState('');
  const [originalAmountStr, setOriginalAmountStr] = useState('');
  const [currentBalanceStr, setCurrentBalanceStr] = useState('');
  const [contractDate, setContractDate] = useState(getTodayISO());
  const [dueDate, setDueDate] = useState(getTodayISO());
  const [interestRateStr, setInterestRateStr] = useState('');
  const [minPaymentStr, setMinPaymentStr] = useState('');
  const [priority, setPriority] = useState<DebtPriority>('medium');
  const [status, setStatus] = useState<DebtStatus>('in_payment');
  const [notes, setNotes] = useState('');

  // Form states for Edit Debt
  const [editDebtName, setEditDebtName] = useState('');
  const [editCreditor, setEditCreditor] = useState('');
  const [editCurrentBalanceStr, setEditCurrentBalanceStr] = useState('');
  const [editDueDate, setEditDueDate] = useState(getTodayISO());
  const [editInterestRateStr, setEditInterestRateStr] = useState('');
  const [editMinPaymentStr, setEditMinPaymentStr] = useState('');
  const [editPriority, setEditPriority] = useState<DebtPriority>('medium');
  const [editStatus, setEditStatus] = useState<DebtStatus>('in_payment');
  const [editNotes, setEditNotes] = useState('');

  const handleOpenEditDebt = (debt: Debt) => {
    setEditingDebt(debt);
    setEditDebtName(debt.name);
    setEditCreditor(debt.creditor);
    setEditCurrentBalanceStr(debt.currentBalance.toFixed(2).replace('.', ','));
    setEditDueDate(debt.dueDate);
    setEditInterestRateStr(debt.interestRateMonthly ? debt.interestRateMonthly.toString() : '');
    setEditMinPaymentStr(debt.minimumPayment ? debt.minimumPayment.toFixed(2).replace('.', ',') : '');
    setEditPriority(debt.priority);
    setEditStatus(debt.status);
    setEditNotes(debt.notes || '');
  };

  const handleSaveEditDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebt) return;
    const curr = parseFloat(editCurrentBalanceStr.replace(/\./g, '').replace(',', '.'));
    const interest = editInterestRateStr ? parseFloat(editInterestRateStr.replace(',', '.')) : undefined;
    const minPay = editMinPaymentStr ? parseFloat(editMinPaymentStr.replace(/\./g, '').replace(',', '.')) : undefined;

    updateDebt(editingDebt.id, {
      name: editDebtName.trim(),
      creditor: editCreditor.trim() || 'Não especificado',
      currentBalance: isNaN(curr) ? editingDebt.currentBalance : curr,
      dueDate: editDueDate,
      interestRateMonthly: interest,
      minimumPayment: minPay,
      priority: editPriority,
      status: editStatus,
      notes: editNotes.trim() || undefined
    });

    setEditingDebt(null);
  };

  // Amortize modal states
  const [amortizeAmountStr, setAmortizeAmountStr] = useState('');
  const [amortizeAccountId, setAmortizeAccountId] = useState(accounts[0]?.id || '');
  const [amortizeNotes, setAmortizeNotes] = useState('');

  // Statistics
  const activeDebts = debts.filter(d => d.status !== 'settled');
  const settledDebts = debts.filter(d => d.status === 'settled');

  const totalAccumulatedDebt = activeDebts.reduce((sum, d) => sum + d.currentBalance, 0);
  const totalOriginalDebt = debts.reduce((sum, d) => sum + d.originalAmount, 0);
  const totalPaidOverall = debts.reduce((sum, d) => sum + (d.totalPaid || 0), 0);
  const debtsWithInterest = activeDebts.filter(d => (d.interestRateMonthly || 0) > 0);
  const highPriorityDebts = activeDebts.filter(d => d.priority === 'urgent' || d.priority === 'high');

  const getStatusLabel = (s: DebtStatus) => {
    switch (s) {
      case 'no_forecast': return 'Sem previsão';
      case 'waiting_conditions': return 'Aguardando condições';
      case 'in_negotiation': return 'Em negociação';
      case 'in_payment': return 'Em pagamento';
      case 'partially_settled': return 'Parcialmente quitada';
      case 'settled': return 'Quitada';
    }
  };

  const getStatusBadge = (s: DebtStatus) => {
    switch (s) {
      case 'settled':
        return 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 border-emerald-200';
      case 'in_payment':
      case 'partially_settled':
        return 'bg-blue-50 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400 border-blue-200';
      case 'in_negotiation':
        return 'bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-400 border-purple-200';
      case 'waiting_conditions':
      case 'no_forecast':
      default:
        return 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 border-rose-200';
    }
  };

  const getPriorityBadge = (p: DebtPriority) => {
    switch (p) {
      case 'urgent': return 'text-rose-600 font-bold';
      case 'high': return 'text-amber-600 font-semibold';
      case 'medium': return 'text-blue-600';
      case 'low': return 'text-slate-500';
    }
  };

  const handleCreateDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const orig = parseFloat(originalAmountStr.replace(/\./g, '').replace(',', '.'));
    const curr = currentBalanceStr ? parseFloat(currentBalanceStr.replace(/\./g, '').replace(',', '.')) : orig;
    const interest = interestRateStr ? parseFloat(interestRateStr.replace(',', '.')) : undefined;
    const minPay = minPaymentStr ? parseFloat(minPaymentStr.replace(/\./g, '').replace(',', '.')) : undefined;

    if (isNaN(orig) || orig <= 0) return;

    addDebt({
      name: name.trim(),
      creditor: creditor.trim() || 'Não especificado',
      originalAmount: orig,
      currentBalance: isNaN(curr) ? orig : curr,
      contractDate,
      dueDate,
      interestRateMonthly: interest,
      minimumPayment: minPay,
      priority,
      status,
      notes: notes.trim() || undefined
    });

    setIsAddModalOpen(false);
    setName('');
    setCreditor('');
    setOriginalAmountStr('');
    setCurrentBalanceStr('');
    setInterestRateStr('');
    setMinPaymentStr('');
    setNotes('');
  };

  const handleAmortizeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!amortizeModalDebt) return;
    const amount = parseFloat(amortizeAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    amortizeDebt(amortizeModalDebt.id, amortizeAccountId, amount, getTodayISO(), amortizeNotes);

    // If fully settled, trigger confetti celebration
    if (amount >= amortizeModalDebt.currentBalance) {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 }
        });
      } catch (err) {
        // ignore
      }
    }

    setAmortizeModalDebt(null);
    setAmortizeAmountStr('');
    setAmortizeNotes('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Central de Dívidas & Pendências
          </h2>
          <p className="text-xs text-slate-500">
            Controle independente para compromissos financeiros e renegociações sem duplicar saldos
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Nova Dívida</span>
        </button>
      </div>

      <ActionFeedbackBanner
        feedback={deleteFeedback}
        onClose={() => setDeleteFeedback(null)}
      />

      {/* Fundamental Rule Note */}
      <div className="p-3.5 bg-blue-50/70 dark:bg-blue-950/20 border border-blue-200/80 dark:border-blue-900/60 rounded-xl text-xs text-blue-900 dark:text-blue-300 flex items-start gap-2.5">
        <ShieldAlert className="w-4 h-4 shrink-0 text-blue-600 dark:text-blue-400 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold">Regra de Integridade:</span> As dívidas cadastradas aqui são compromissos gerenciados separadamente e <strong>não são deduzidas novamente do saldo bancário atual</strong>. Quando você registrar uma amortização, o valor será debitado da sua conta escolhida e reduzirá o saldo devedor da dívida, sem duplicar com despesas gerais de consumo.
        </div>
      </div>

      {/* KPI Indicators */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Saldo Devedor Total</span>
            <AlertCircle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {formatCurrency(totalAccumulatedDebt)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {activeDebts.length} dívida(s) em aberto
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Total Já Amortizado</span>
            <TrendingDown className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(totalPaidOverall)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {totalOriginalDebt > 0 ? `${((totalPaidOverall / totalOriginalDebt) * 100).toFixed(1)}% do valor original pago` : '0%'}
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Dívidas com Juros</span>
            <Percent className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
            {debtsWithInterest.length} pendência(s)
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Recomenda-se quitar primeiro as com taxa maior
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Prioridade Alta / Urgente</span>
            <AlertTriangle className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {highPriorityDebts.length} dívida(s)
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Exigem atenção imediata
          </div>
        </div>
      </div>

      {/* Debts List */}
      <div className="space-y-4">
        {debts.length === 0 ? (
          <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
              Nenhuma dívida cadastrada!
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              Se você possui empréstimos, faturas atrasadas ou pendências, clique no botão acima para organizar seu plano de quitação.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debts.map(debt => {
              const paidPercent = debt.originalAmount > 0
                ? Math.min(100, Math.max(0, ((debt.originalAmount - debt.currentBalance) / debt.originalAmount) * 100))
                : 0;

              return (
                <div
                  key={debt.id}
                  className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between"
                >
                  <div>
                    {/* Header line */}
                    <div className="flex flex-wrap items-start justify-between gap-2 mb-2">
                      <div className="min-w-0 flex-1">
                        <span className="text-[11px] text-slate-400 font-medium block truncate">Credor: {debt.creditor}</span>
                        <h4 className="text-base font-bold text-slate-900 dark:text-white break-words">
                          {debt.name}
                        </h4>
                      </div>
                      <span className={`px-2.5 py-0.5 text-[11px] font-semibold rounded-lg border shrink-0 ${getStatusBadge(debt.status)}`}>
                        {getStatusLabel(debt.status)}
                      </span>
                    </div>

                    {/* Balances */}
                    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2 my-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                      <div>
                        <div className="text-[11px] text-slate-400">Saldo Devedor Atual</div>
                        <div className="text-base font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                          {formatCurrency(debt.currentBalance)}
                        </div>
                      </div>
                      <div>
                        <div className="text-[11px] text-slate-400">Valor Original Contratado</div>
                        <div className="text-sm font-mono text-slate-600 dark:text-slate-400 tabular-nums">
                          {formatCurrency(debt.originalAmount)}
                        </div>
                      </div>
                    </div>

                    {/* Progress Bar of Reduction */}
                    <div className="space-y-1 mb-3">
                      <div className="flex justify-between text-[11px]">
                        <span className="text-slate-500">Progresso de Quitação</span>
                        <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                          {paidPercent.toFixed(1)}% quitado
                        </span>
                      </div>
                      <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full transition-all"
                          style={{ width: `${paidPercent}%` }}
                        />
                      </div>
                    </div>

                    {/* Metadata details */}
                    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-y-1 gap-x-2 text-xs text-slate-500 mb-3">
                      <div>
                        <span>Taxa de Juros: </span>
                        <span className="font-semibold text-slate-700 dark:text-slate-300">
                          {debt.interestRateMonthly ? `${debt.interestRateMonthly}% a.m.` : 'Isento'}
                        </span>
                      </div>
                      <div>
                        <span>Prioridade: </span>
                        <span className={`capitalize ${getPriorityBadge(debt.priority)}`}>
                          {debt.priority === 'urgent' ? 'Urgente' : debt.priority === 'high' ? 'Alta' : debt.priority === 'medium' ? 'Média' : 'Baixa'}
                        </span>
                      </div>
                      <div>
                        <span>Vencimento: </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {formatDateBR(debt.dueDate)}
                        </span>
                      </div>
                      <div>
                        <span>Parcela Mínima: </span>
                        <span className="font-mono text-slate-700 dark:text-slate-300">
                          {debt.minimumPayment ? formatCurrency(debt.minimumPayment) : 'A combinar'}
                        </span>
                      </div>
                    </div>

                    {debt.notes && (
                      <p className="text-[11px] text-slate-400 italic bg-slate-50 dark:bg-slate-800/30 p-2 rounded-lg mb-3">
                        "{debt.notes}"
                      </p>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="flex flex-wrap items-center gap-2.5">
                      {debt.paymentsHistory && debt.paymentsHistory.length > 0 && (
                        <button
                          onClick={() => setHistoryModalDebt(debt)}
                          className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                          title="Ver histórico de pagamentos"
                        >
                          <History className="w-3.5 h-3.5" />
                          <span>Histórico ({debt.paymentsHistory.length})</span>
                        </button>
                      )}

                      <button
                        onClick={() => handleOpenEditDebt(debt)}
                        className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition-colors"
                        title="Editar dívida"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        <span>Editar</span>
                      </button>

                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          setPendingDeleteDebt(debt);
                        }}
                        className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
                        title="Excluir dívida"
                        aria-label={`Excluir dívida ${debt.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Excluir</span>
                      </button>
                    </div>

                    {debt.status !== 'settled' ? (
                      <button
                        onClick={() => {
                          setAmortizeModalDebt(debt);
                          setAmortizeAmountStr(debt.minimumPayment ? debt.minimumPayment.toFixed(2).replace('.', ',') : '');
                        }}
                        className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                      >
                        <DollarSign className="w-3.5 h-3.5" />
                        <span>Pagar / Amortizar</span>
                      </button>
                    ) : (
                      <span className="text-xs font-semibold text-emerald-600 flex items-center gap-1">
                        <CheckCircle className="w-3.5 h-3.5" />
                        <span>Totalmente Liquidada!</span>
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal: Cadastrar Dívida */}
      <ResponsiveModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Cadastrar Dívida ou Pendência"
        size="lg"
        onSubmit={handleCreateDebt}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Salvar Dívida
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor={debtNameId} className="block font-medium text-slate-500 mb-1">Nome da Dívida / Contrato *</label>
            <input
              id={debtNameId}
              name="debt_name"
              type="text"
              required
              autoComplete="off"
              placeholder="Ex: Empréstimo Caixa, Cartão de Loja em Atraso..."
              value={name}
              onChange={e => setName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={debtCreditorId} className="block font-medium text-slate-500 mb-1">Credor / Banco</label>
            <input
              id={debtCreditorId}
              name="debt_creditor"
              type="text"
              autoComplete="off"
              placeholder="Ex: Caixa, Santander, Amigo..."
              value={creditor}
              onChange={e => setCreditor(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={debtPriorityId} className="block font-medium text-slate-500 mb-1">Prioridade</label>
            <select
              id={debtPriorityId}
              name="debt_priority"
              value={priority}
              onChange={e => setPriority(e.target.value as DebtPriority)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={debtOriginalAmountId} className="block font-medium text-slate-500 mb-1">Valor Original (R$) *</label>
            <input
              id={debtOriginalAmountId}
              name="debt_original_amount"
              type="text"
              required
              autoComplete="off"
              placeholder="0,00"
              value={originalAmountStr}
              onChange={e => setOriginalAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={debtCurrentBalanceId} className="block font-medium text-slate-500 mb-1">Saldo Devedor Atual (R$)</label>
            <input
              id={debtCurrentBalanceId}
              name="debt_current_balance"
              type="text"
              autoComplete="off"
              placeholder="Igual ao original se vazio"
              value={currentBalanceStr}
              onChange={e => setCurrentBalanceStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={debtInterestRateId} className="block font-medium text-slate-500 mb-1">Juros (% ao mês)</label>
            <input
              id={debtInterestRateId}
              name="debt_interest_rate"
              type="text"
              autoComplete="off"
              placeholder="Ex: 2,5"
              value={interestRateStr}
              onChange={e => setInterestRateStr(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={debtMinPaymentId} className="block font-medium text-slate-500 mb-1">Parcela Mínima (R$)</label>
            <input
              id={debtMinPaymentId}
              name="debt_minimum_payment"
              type="text"
              autoComplete="off"
              placeholder="Ex: 250,00"
              value={minPaymentStr}
              onChange={e => setMinPaymentStr(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={debtDueDateId} className="block font-medium text-slate-500 mb-1">Data de Vencimento</label>
            <input
              id={debtDueDateId}
              name="debt_due_date"
              type="date"
              value={dueDate}
              onChange={e => setDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={debtStatusId} className="block font-medium text-slate-500 mb-1">Situação / Status</label>
            <select
              id={debtStatusId}
              name="debt_status"
              value={status}
              onChange={e => setStatus(e.target.value as DebtStatus)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="in_payment">Em pagamento</option>
              <option value="in_negotiation">Em negociação</option>
              <option value="waiting_conditions">Aguardando condições</option>
              <option value="no_forecast">Sem previsão</option>
              <option value="settled">Já quitada</option>
            </select>
          </div>
        </div>

        <div>
          <label htmlFor={debtNotesId} className="block font-medium text-slate-500 mb-1">Observações ou Termos de Acordo</label>
          <textarea
            id={debtNotesId}
            name="debt_notes"
            rows={2}
            placeholder="Detalhes adicionais, contato do credor, número de protocolo..."
            value={notes}
            onChange={e => setNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal: Amortizar / Pagar Parcela */}
      <ResponsiveModal
        isOpen={!!amortizeModalDebt}
        onClose={() => setAmortizeModalDebt(null)}
        title="Registrar Pagamento de Dívida"
        subtitle={amortizeModalDebt?.name}
        size="md"
        onSubmit={handleAmortizeSubmit}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Confirmar Pagamento e Abater Saldo
          </button>
        }
      >
        <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl flex flex-wrap justify-between items-center gap-2">
          <span className="text-slate-500">Saldo Devedor Atual:</span>
          <span className="font-mono font-bold text-rose-600 dark:text-rose-400 text-sm">
            {amortizeModalDebt ? formatCurrency(amortizeModalDebt.currentBalance) : ''}
          </span>
        </div>

        <div>
          <label htmlFor={amortizeAmountId} className="block font-medium text-slate-500 mb-1">
            Valor Pago nesta Amortização (R$) *
          </label>
          <input
            id={amortizeAmountId}
            name="amortize_amount"
            type="text"
            required
            autoFocus
            autoComplete="off"
            placeholder="0,00"
            value={amortizeAmountStr}
            onChange={e => setAmortizeAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-full px-3 py-2 text-lg font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white tabular-nums"
          />
        </div>

        <div>
          <label htmlFor={amortizeAccountSelectId} className="block font-medium text-slate-500 mb-1">
            Conta Bancária Debitada *
          </label>
          <select
            id={amortizeAccountSelectId}
            name="amortize_account_id"
            value={amortizeAccountId}
            onChange={e => setAmortizeAccountId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatCurrency(acc.balance)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label htmlFor={amortizeNotesId} className="block font-medium text-slate-500 mb-1">
            Observações (Ex: Parcela 05/24)
          </label>
          <input
            id={amortizeNotesId}
            name="amortize_notes"
            type="text"
            autoComplete="off"
            placeholder="Opcional..."
            value={amortizeNotes}
            onChange={e => setAmortizeNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal: Editar Dívida */}
      <ResponsiveModal
        isOpen={!!editingDebt}
        onClose={() => setEditingDebt(null)}
        title="Editar Dívida / Pendência"
        size="lg"
        onSubmit={handleSaveEditDebt}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Salvar Alterações
          </button>
        }
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <label htmlFor={editDebtNameId} className="block font-medium text-slate-500 mb-1">Nome da Dívida *</label>
            <input
              id={editDebtNameId}
              name="edit_debt_name"
              type="text"
              required
              autoComplete="off"
              value={editDebtName}
              onChange={e => setEditDebtName(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={editCreditorId} className="block font-medium text-slate-500 mb-1">Credor / Instituição</label>
            <input
              id={editCreditorId}
              name="edit_debt_creditor"
              type="text"
              autoComplete="off"
              value={editCreditor}
              onChange={e => setEditCreditor(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={editPriorityId} className="block font-medium text-slate-500 mb-1">Prioridade</label>
            <select
              id={editPriorityId}
              name="edit_debt_priority"
              value={editPriority}
              onChange={e => setEditPriority(e.target.value as DebtPriority)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="low">Baixa</option>
              <option value="medium">Média</option>
              <option value="high">Alta</option>
              <option value="urgent">Urgente</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={editCurrentBalanceId} className="block font-medium text-slate-500 mb-1">Saldo Devedor Atual (R$) *</label>
            <input
              id={editCurrentBalanceId}
              name="edit_debt_current_balance"
              type="text"
              required
              autoComplete="off"
              value={editCurrentBalanceStr}
              onChange={e => setEditCurrentBalanceStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={editMinPaymentId} className="block font-medium text-slate-500 mb-1">Parcela Mínima Mensal (R$)</label>
            <input
              id={editMinPaymentId}
              name="edit_debt_min_payment"
              type="text"
              autoComplete="off"
              value={editMinPaymentStr}
              onChange={e => setEditMinPaymentStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor={editInterestRateId} className="block font-medium text-slate-500 mb-1">Taxa de Juros (% a.m.)</label>
            <input
              id={editInterestRateId}
              name="edit_debt_interest_rate"
              type="text"
              autoComplete="off"
              placeholder="Ex: 3,5"
              value={editInterestRateStr}
              onChange={e => setEditInterestRateStr(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label htmlFor={editDueDateId} className="block font-medium text-slate-500 mb-1">Vencimento</label>
            <input
              id={editDueDateId}
              name="edit_debt_due_date"
              type="date"
              value={editDueDate}
              onChange={e => setEditDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label htmlFor={editStatusId} className="block font-medium text-slate-500 mb-1">Situação / Status</label>
          <select
            id={editStatusId}
            name="edit_debt_status"
            value={editStatus}
            onChange={e => setEditStatus(e.target.value as DebtStatus)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="in_payment">Em pagamento</option>
            <option value="in_negotiation">Em negociação</option>
            <option value="waiting_conditions">Aguardando condições</option>
            <option value="no_forecast">Sem previsão</option>
            <option value="partially_settled">Parcialmente quitada</option>
            <option value="settled">Totalmente quitada</option>
          </select>
        </div>

        <div>
          <label htmlFor={editNotesId} className="block font-medium text-slate-500 mb-1">Observações ou Condições de Acordo</label>
          <textarea
            id={editNotesId}
            name="edit_debt_notes"
            rows={2}
            value={editNotes}
            onChange={e => setEditNotes(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal: Histórico de Pagamentos de Dívida */}
      <ResponsiveModal
        isOpen={!!historyModalDebt}
        onClose={() => setHistoryModalDebt(null)}
        title="Histórico de Amortizações"
        subtitle={historyModalDebt?.name}
        size="md"
        bodyClassName="divide-y divide-slate-100 dark:divide-slate-800 text-xs space-y-0"
        footer={
          historyModalDebt ? (
            <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
              <span className="text-slate-500 font-medium">Total Pago até o Momento:</span>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                {formatCurrency(historyModalDebt.totalPaid || 0)}
              </span>
            </div>
          ) : undefined
        }
      >
        {historyModalDebt && (!historyModalDebt.paymentsHistory || historyModalDebt.paymentsHistory.length === 0) ? (
          <div className="text-center py-8 text-slate-400">
            Nenhuma amortização registrada ainda.
          </div>
        ) : (
          historyModalDebt?.paymentsHistory?.map(p => (
            <div key={p.id} className="py-2.5 flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                  {p.notes || 'Amortização realizada'}
                </div>
                <div className="text-[11px] text-slate-400">
                  Data: {formatDateBR(p.date)}
                </div>
              </div>
              <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums shrink-0">
                {formatCurrency(p.amount)}
              </div>
            </div>
          ))
        )}
      </ResponsiveModal>

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteDebt}
        title="Excluir Dívida"
        description="Deseja excluir este registro de dívida? Os demais compromissos e saldos bancários permanecerão preservados."
        itemLabel={pendingDeleteDebt?.name}
        itemValue={pendingDeleteDebt ? formatCurrency(pendingDeleteDebt.currentBalance) : undefined}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDeleteDebt}
        onCancel={() => setPendingDeleteDebt(null)}
      />
    </div>
  );
};
