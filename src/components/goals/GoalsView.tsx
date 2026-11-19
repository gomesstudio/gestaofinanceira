/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Target,
  Plus,
  TrendingUp,
  DollarSign,
  Calendar,
  CheckCircle,
  Shield,
  Trash2,
  Edit2,
  X,
  Sparkles,
  Info
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO } from '../../utils/formatters';
import { FinancialGoal } from '../../types/finance';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';

export const GoalsView: React.FC = () => {
  const {
    goals,
    accounts,
    freeMoneyAvailable,
    totalSavedPeriod,
    addGoal,
    updateGoal,
    deleteGoal,
    contributeToGoal
  } = useFinance();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [contributeGoal, setContributeGoal] = useState<FinancialGoal | null>(null);
  const [editingGoal, setEditingGoal] = useState<FinancialGoal | null>(null);
  const [pendingDeleteGoal, setPendingDeleteGoal] = useState<FinancialGoal | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<ActionFeedback | null>(null);

  const handleConfirmDeleteGoal = async () => {
    if (!pendingDeleteGoal || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteGoal(pendingDeleteGoal.id);
      setDeleteFeedback({
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      });
    } catch (err: any) {
      setDeleteFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível excluir o objetivo.'
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteGoal(null);
    }
  };

  // Form states for Goal
  const [name, setName] = useState('');
  const [targetAmountStr, setTargetAmountStr] = useState('');
  const [deadlineDate, setDeadlineDate] = useState('2027-12-31');
  const [monthlyContributionStr, setMonthlyContributionStr] = useState('');
  const [category, setCategory] = useState('Reserva');
  const [color, setColor] = useState('#10b981');

  // Form states for Edit Goal
  const [editName, setEditName] = useState('');
  const [editTargetAmountStr, setEditTargetAmountStr] = useState('');
  const [editDeadlineDate, setEditDeadlineDate] = useState('');
  const [editMonthlyContributionStr, setEditMonthlyContributionStr] = useState('');
  const [editCategory, setEditCategory] = useState('Reserva');
  const [editColor, setEditColor] = useState('#10b981');

  const handleOpenEditGoal = (goal: FinancialGoal) => {
    setEditingGoal(goal);
    setEditName(goal.name);
    setEditTargetAmountStr(goal.targetAmount.toFixed(2).replace('.', ','));
    setEditDeadlineDate(goal.deadlineDate);
    setEditMonthlyContributionStr(goal.monthlyPlannedContribution ? goal.monthlyPlannedContribution.toFixed(2).replace('.', ',') : '');
    setEditCategory(goal.category);
    setEditColor(goal.color);
  };

  const handleSaveEditGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal) return;
    const target = parseFloat(editTargetAmountStr.replace(/\./g, '').replace(',', '.'));
    const monthly = editMonthlyContributionStr ? parseFloat(editMonthlyContributionStr.replace(/\./g, '').replace(',', '.')) : 0;
    if (isNaN(target) || target <= 0) return;

    updateGoal(editingGoal.id, {
      name: editName.trim(),
      targetAmount: target,
      deadlineDate: editDeadlineDate,
      monthlyPlannedContribution: monthly,
      category: editCategory,
      color: editColor
    });

    setEditingGoal(null);
  };

  // Contribute states
  const [contributionAmountStr, setContributionAmountStr] = useState('');
  const [contributeAccountId, setContributeAccountId] = useState(accounts[0]?.id || '');

  // Investment Simulator State
  const [simInitialStr, setSimInitialStr] = useState('5000');
  const [simMonthlyStr, setSimMonthlyStr] = useState('500');
  const [simYears, setSimYears] = useState(5);
  const [simAnnualRateStr, setSimAnnualRateStr] = useState('11'); // 11% a.a. (ex: CDI / Tesouro Selic)

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const target = parseFloat(targetAmountStr.replace(/\./g, '').replace(',', '.'));
    const monthly = monthlyContributionStr ? parseFloat(monthlyContributionStr.replace(/\./g, '').replace(',', '.')) : 0;
    if (isNaN(target) || target <= 0) return;

    addGoal({
      name: name.trim(),
      targetAmount: target,
      deadlineDate,
      monthlyPlannedContribution: monthly,
      category,
      color
    });

    setIsAddModalOpen(false);
    setName('');
    setTargetAmountStr('');
    setMonthlyContributionStr('');
  };

  const handleContributeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!contributeGoal) return;
    const amount = parseFloat(contributionAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    contributeToGoal(contributeGoal.id, contributeAccountId, amount);

    // If goal reaches 100%, celebrate
    if (contributeGoal.currentAmount + amount >= contributeGoal.targetAmount) {
      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 }
        });
      } catch {}
    }

    setContributeGoal(null);
    setContributionAmountStr('');
  };

  // Compound Interest Calculation
  const simInitial = parseFloat(simInitialStr.replace(/\./g, '').replace(',', '.')) || 0;
  const simMonthly = parseFloat(simMonthlyStr.replace(/\./g, '').replace(',', '.')) || 0;
  const simAnnualRate = parseFloat(simAnnualRateStr.replace(',', '.')) || 0;
  const simMonthlyRate = Math.pow(1 + simAnnualRate / 100, 1 / 12) - 1;
  const totalMonths = simYears * 12;

  let simulatedTotal = simInitial;
  let simulatedInvested = simInitial;

  for (let m = 1; m <= totalMonths; m++) {
    simulatedTotal = simulatedTotal * (1 + simMonthlyRate) + simMonthly;
    simulatedInvested += simMonthly;
  }
  const simulatedInterest = Math.max(0, simulatedTotal - simulatedInvested);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Target className="w-5 h-5 text-emerald-500" />
            Planejamento & Objetivos Financeiros
          </h2>
          <p className="text-xs text-slate-500">
            Acompanhe suas metas de curto, médio e longo prazo e simule o poder dos juros compostos
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Criar Novo Objetivo</span>
        </button>
      </div>

      <ActionFeedbackBanner
        feedback={deleteFeedback}
        onClose={() => setDeleteFeedback(null)}
      />

      {/* Capacity & Savings Callout Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Sobra Média Estimada</span>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-1">
            {formatCurrency(totalSavedPeriod)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Diferença positiva entre receitas e despesas
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Dinheiro Livre para Aportes</span>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums mt-1">
            {formatCurrency(freeMoneyAvailable)}
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Pode ser investido sem comprometer suas contas
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <span className="text-xs text-slate-500 font-medium">Metas Ativas</span>
          <div className="text-xl font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums mt-1">
            {goals.length} objetivo(s)
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {goals.filter(g => g.completed).length} meta(s) já atingida(s)
          </span>
        </div>
      </div>

      {/* Goals Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {goals.map(goal => {
          const progressPct = goal.targetAmount > 0
            ? Math.min(100, Math.max(0, (goal.currentAmount / goal.targetAmount) * 100))
            : 0;
          const isDone = progressPct >= 100;

          return (
            <div
              key={goal.id}
              className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0">
                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      {goal.category}
                    </span>
                    <h4 className="font-bold text-slate-900 dark:text-white text-base truncate">
                      {goal.name}
                    </h4>
                  </div>
                  {isDone ? (
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                      Concluído!
                    </span>
                  ) : (
                    <span className="w-3 h-3 rounded-full shrink-0 mt-1" style={{ backgroundColor: goal.color }} />
                  )}
                </div>

                {/* Values */}
                <div className="my-3 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl">
                  <div className="flex justify-between items-baseline mb-1">
                    <span className="text-xs text-slate-500">Acumulado:</span>
                    <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 text-base tabular-nums">
                      {formatCurrency(goal.currentAmount)}
                    </span>
                  </div>
                  <div className="flex justify-between items-baseline text-xs text-slate-400">
                    <span>Meta Total:</span>
                    <span className="font-mono tabular-nums">{formatCurrency(goal.targetAmount)}</span>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1 mb-3">
                  <div className="flex justify-between text-[11px]">
                    <span className="text-slate-500">Progresso</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 tabular-nums">
                      {progressPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${progressPct}%`, backgroundColor: goal.color }}
                    />
                  </div>
                </div>

                <div className="flex justify-between text-[11px] text-slate-400 mb-3">
                  <span>Aporte Mensal: {formatCurrency(goal.monthlyPlannedContribution)}</span>
                  <span>Prazo: {formatDateBR(goal.deadlineDate)}</span>
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleOpenEditGoal(goal)}
                    title="Editar objetivo"
                    className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setPendingDeleteGoal(goal);
                    }}
                    title="Excluir objetivo"
                    aria-label={`Excluir objetivo ${goal.name}`}
                    className="text-xs text-slate-400 hover:text-rose-600 transition-colors p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>

                <button
                  onClick={() => {
                    setContributeGoal(goal);
                    setContributionAmountStr(goal.monthlyPlannedContribution ? goal.monthlyPlannedContribution.toFixed(2).replace('.', ',') : '');
                  }}
                  className="px-3 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-xs flex items-center gap-1.5"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Aportar Valor</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Simulator of Compound Interest & Investment Projections */}
      <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
            <TrendingUp className="w-4 h-4" />
            <span>Simulador Educativo de Investimentos</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Projeção de Acumulação com Juros Compostos
          </h3>
          <p className="text-xs text-slate-500">
            Veja como aportes regulares consistentes multiplicam seu patrimônio ao longo do tempo.
          </p>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          <div>
            <label className="block font-medium text-slate-500 mb-1">Aporte Inicial (R$)</label>
            <input
              type="text"
              value={simInitialStr}
              onChange={e => setSimInitialStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-500 mb-1">Aporte Mensal (R$)</label>
            <input
              type="text"
              value={simMonthlyStr}
              onChange={e => setSimMonthlyStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="block font-medium text-slate-500 mb-1">Prazo em Anos</label>
            <select
              value={simYears}
              onChange={e => setSimYears(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              {[1, 2, 3, 5, 10, 15, 20, 30].map(y => (
                <option key={y} value={y}>{y} {y === 1 ? 'ano' : 'anos'} ({y * 12} meses)</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-500 mb-1">Taxa Estimada (% ao ano)</label>
            <input
              type="text"
              value={simAnnualRateStr}
              onChange={e => setSimAnnualRateStr(e.target.value.replace(/[^0-9,]/g, ''))}
              className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        {/* Output Banner */}
        <div className="p-5 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/80 dark:border-slate-700/80 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <span className="text-xs text-slate-400">Total Acumulado Projetado:</span>
            <div className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
              {formatCurrency(simulatedTotal)}
            </div>
          </div>

          <div>
            <span className="text-xs text-slate-400">Total do seu Bolso (Investido):</span>
            <div className="text-lg font-bold font-mono text-slate-800 dark:text-slate-200 tabular-nums mt-0.5">
              {formatCurrency(simulatedInvested)}
            </div>
          </div>

          <div>
            <span className="text-xs text-slate-400">Ganho em Juros (Rendimento):</span>
            <div className="text-lg font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums mt-0.5">
              +{formatCurrency(simulatedInterest)}
            </div>
          </div>
        </div>

        {/* Educational Disclaimer */}
        <div className="p-3 bg-amber-50/70 dark:bg-amber-950/20 border border-amber-200/70 dark:border-amber-900/40 rounded-xl text-xs text-amber-900 dark:text-amber-300 flex items-start gap-2">
          <Info className="w-4 h-4 shrink-0 text-amber-600 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Aviso Educativo:</strong> Esta é uma simulação matemática baseada em taxas nominais constantes. Rentabilidade passada não é garantia de rentabilidade futura. Esta ferramenta tem fins exclusivamente educativos e de planejamento pessoal, não constituindo recomendação ou consultoria de investimentos.
          </p>
        </div>
      </div>

      {/* Modal: Criar Objetivo */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Novo Objetivo Financeiro
              </h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateGoal} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-500 mb-1">Nome do Objetivo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Reserva de Emergência, Celular Novo, Viagem..."
                  value={name}
                  onChange={e => setName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Valor Alvo (R$) *</label>
                  <input
                    type="text"
                    required
                    placeholder="0,00"
                    value={targetAmountStr}
                    onChange={e => setTargetAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
                    className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Aporte Mensal Planejado</label>
                  <input
                    type="text"
                    placeholder="Ex: 300,00"
                    value={monthlyContributionStr}
                    onChange={e => setMonthlyContributionStr(e.target.value.replace(/[^0-9,]/g, ''))}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Data Limite / Prazo</label>
                  <input
                    type="date"
                    value={deadlineDate}
                    onChange={e => setDeadlineDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Categoria</label>
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="Reserva">Reserva & Segurança</option>
                    <option value="Bens">Bens Materiais / Veículo</option>
                    <option value="Viagem">Viagem & Lazer</option>
                    <option value="Educação">Educação / Carreira</option>
                    <option value="Dívidas">Quitar Dívidas</option>
                    <option value="Investimentos">Investimentos Futuros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-500 mb-1">Cor de Destaque</label>
                <div className="flex items-center gap-2">
                  {['#10b981', '#0284c7', '#8b5cf6', '#ec4899', '#f59e0b', '#64748b'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${color === c ? 'scale-115 ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all"
                >
                  Salvar Objetivo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Aportar Valor em Objetivo */}
      {contributeGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Registrar Aporte
                </h3>
                <p className="text-xs text-slate-400">{contributeGoal.name}</p>
              </div>
              <button
                onClick={() => setContributeGoal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleContributeSubmit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-500 mb-1">
                  Valor do Aporte (R$) *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  placeholder="0,00"
                  value={contributionAmountStr}
                  onChange={e => setContributionAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
                  className="w-full px-3 py-2 text-lg font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-500 mb-1">
                  Debitar da Conta Bancária *
                </label>
                <select
                  value={contributeAccountId}
                  onChange={e => setContributeAccountId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} ({formatCurrency(acc.balance)})
                    </option>
                  ))}
                </select>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-xs"
                >
                  Confirmar Aporte
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Objetivo */}
      {editingGoal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setEditingGoal(null)}
        >
          <div 
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Editar Objetivo Financeiro
              </h3>
              <button
                onClick={() => setEditingGoal(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditGoal} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-500 mb-1">Nome do Objetivo *</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Valor Alvo (R$) *</label>
                  <input
                    type="text"
                    required
                    value={editTargetAmountStr}
                    onChange={e => setEditTargetAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
                    className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Aporte Mensal Planejado</label>
                  <input
                    type="text"
                    value={editMonthlyContributionStr}
                    onChange={e => setEditMonthlyContributionStr(e.target.value.replace(/[^0-9,]/g, ''))}
                    className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Data Limite / Prazo</label>
                  <input
                    type="date"
                    value={editDeadlineDate}
                    onChange={e => setEditDeadlineDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Categoria</label>
                  <select
                    value={editCategory}
                    onChange={e => setEditCategory(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="Reserva">Reserva & Segurança</option>
                    <option value="Bens">Bens Materiais / Veículo</option>
                    <option value="Viagem">Viagem & Lazer</option>
                    <option value="Educação">Educação / Carreira</option>
                    <option value="Dívidas">Quitar Dívidas</option>
                    <option value="Investimentos">Investimentos Futuros</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-500 mb-1">Cor de Destaque</label>
                <div className="flex items-center gap-2">
                  {['#10b981', '#0284c7', '#8b5cf6', '#ec4899', '#f59e0b', '#64748b'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setEditColor(c)}
                      className={`w-7 h-7 rounded-full transition-transform ${editColor === c ? 'scale-115 ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteGoal}
        title="Excluir Objetivo Financeiro"
        description="Deseja excluir este objetivo financeiro? Os demais objetivos e lançamentos permanecerão preservados."
        itemLabel={pendingDeleteGoal?.name}
        itemValue={pendingDeleteGoal ? formatCurrency(pendingDeleteGoal.targetAmount) : undefined}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDeleteGoal}
        onCancel={() => setPendingDeleteGoal(null)}
      />
    </div>
  );
};
