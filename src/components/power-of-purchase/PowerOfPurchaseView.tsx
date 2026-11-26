/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState } from 'react';
import {
  Zap,
  ShieldCheck,
  AlertTriangle,
  CheckCircle,
  XCircle,
  HelpCircle,
  Sliders,
  DollarSign,
  ArrowRight,
  TrendingDown,
  Lock,
  Wallet
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatPercent, getTodayISO } from '../../utils/formatters';
import { getRecurringExpensesForMonth } from '../../utils/recurringExpense';
import { FutureProjectionCard } from '../dashboard/FutureProjectionCard';

export const PowerOfPurchaseView: React.FC = () => {
  const {
    totalBankBalance,
    freeMoneyAvailable,
    safetyReserveDesired,
    setSafetyReserveDesired,
    totalPendingFixed,
    totalPendingVariable,
    pendingFixedCurrentMonth,
    pendingVariableCurrentMonth,
    simulatePurchase,
    accounts,
    transactions,
    recurringExpenses = [],
    debts,
    creditCards,
    getCardInvoiceAmount
  } = useFinance();

  const realPendingFixed = pendingFixedCurrentMonth ?? totalPendingFixed;
  const realPendingVariable = pendingVariableCurrentMonth ?? totalPendingVariable;

  // Simulation states
  const fieldIdPrefix = useId();
  const safetyReserveId = `${fieldIdPrefix}-safety-reserve`;
  const simulationAmountId = `${fieldIdPrefix}-simulation-amount`;
  const [simulationAmountStr, setSimulationAmountStr] = useState('600');
  const [reserveInputStr, setReserveInputStr] = useState(safetyReserveDesired.toString());
  const [isEditingReserve, setIsEditingReserve] = useState(false);

  // Quick preset simulation amounts
  const presets = [150, 350, 600, 1200, 2500];

  const simulationAmount = parseFloat(simulationAmountStr.replace(/\./g, '').replace(',', '.')) || 0;
  const simulationResult = simulatePurchase(simulationAmount);

  const handleSaveReserve = () => {
    const val = parseFloat(reserveInputStr.replace(/\./g, '').replace(',', '.'));
    if (!isNaN(val) && val >= 0) {
      setSafetyReserveDesired(val);
    }
    setIsEditingReserve(false);
  };

  // Card invoices total (real + recurring fixed expenses scheduled on credit cards for current month)
  const todayISO = getTodayISO();
  const currentMY = todayISO.slice(0, 7);
  const currentYearNum = Number(currentMY.slice(0, 4));
  const currentMonth0 = Number(currentMY.slice(5, 7)) - 1;
  const virtualRecurringCardTotal = getRecurringExpensesForMonth(
    recurringExpenses,
    currentYearNum,
    currentMonth0,
    transactions,
    todayISO
  )
    .filter(occ => occ.isVirtual && !occ.isLegacy && occ.status !== 'skipped' && occ.paymentMethod === 'credit_card')
    .reduce((sum, occ) => sum + occ.amount, 0);
  const totalCardsInvoices =
    creditCards.reduce((sum, c) => sum + getCardInvoiceAmount(c.id, currentMY), 0) +
    virtualRecurringCardTotal;
  const totalDebtCommitments = debts.filter(d => d.status !== 'settled').reduce((sum, d) => sum + (d.minimumPayment || 0), 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Zap className="w-5 h-5 text-emerald-500" />
          Meu Poder de Compra & Dinheiro Livre
        </h2>
        <p className="text-xs text-slate-500">
          Descubra com precisão matemática quanto você pode gastar sem comprometer contas futuras ou sua reserva.
        </p>
      </div>

      {/* Main Free Money Hero Banner */}
      <div className="p-6 bg-gradient-to-br from-emerald-600 via-emerald-700 to-teal-800 text-white rounded-3xl shadow-lg relative overflow-hidden">
        <div className="relative z-10 max-w-2xl">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-xs mb-3">
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>Dinheiro Efetivamente Livre</span>
          </div>

          <div className="text-3xl sm:text-4xl font-extrabold font-mono tracking-tight tabular-nums mb-3">
            {formatCurrency(freeMoneyAvailable)}
          </div>

          <p className="text-sm sm:text-base text-emerald-50 leading-relaxed font-medium">
            Você possui <span className="font-bold underline decoration-white/40">{formatCurrency(freeMoneyAvailable)}</span> disponíveis para gastos não planejados sem comprometer as obrigações e a reserva informadas.
          </p>

          <div className="flex flex-wrap items-center gap-4 mt-5 text-xs text-emerald-100">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-emerald-300" />
              Saldo Real: {formatCurrency(totalBankBalance)}
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-teal-300" />
              Reserva Blindada: {formatCurrency(safetyReserveDesired)}
            </span>
          </div>
        </div>

        {/* Decorative backdrop glow */}
        <div className="absolute right-0 bottom-0 translate-x-12 translate-y-12 w-64 h-64 bg-white/10 rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* Calculation Formula Transparency Breakdown */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-1">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">
            Memória de Cálculo do Poder de Compra
          </h3>
          <span className="text-xs text-slate-400">Rigor Matemático Sem Duplicações</span>
        </div>

        <div className="space-y-2 text-xs">
          {/* Row 1: Saldo Bancário Atual */}
          <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-1 min-[420px]:gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-emerald-600 shrink-0">(+)</span>
              <span className="text-slate-700 dark:text-slate-300 font-medium">Saldo bancário atual (Soma das contas)</span>
            </div>
            <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums shrink-0 self-end min-[420px]:self-auto">
              {formatCurrency(totalBankBalance)}
            </span>
          </div>

          {/* Row 2: Despesas Fixas Pendentes */}
          <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-1 min-[420px]:gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-rose-600 shrink-0">(-)</span>
              <span className="text-slate-700 dark:text-slate-300">Despesas fixas ainda não pagas no mês</span>
            </div>
            <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums shrink-0 self-end min-[420px]:self-auto">
              -{formatCurrency(realPendingFixed)}
            </span>
          </div>

          {/* Row 3: Despesas Variáveis Pendentes */}
          <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-1 min-[420px]:gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-rose-600 shrink-0">(-)</span>
              <span className="text-slate-700 dark:text-slate-300">Despesas variáveis pendentes no mês</span>
            </div>
            <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums shrink-0 self-end min-[420px]:self-auto">
              -{formatCurrency(realPendingVariable)}
            </span>
          </div>

          {/* Row 4: Faturas de Cartão a Vencer */}
          <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-1 min-[420px]:gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-rose-600 shrink-0">(-)</span>
              <span className="text-slate-700 dark:text-slate-300">Faturas de cartões a vencer no mês</span>
            </div>
            <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums shrink-0 self-end min-[420px]:self-auto">
              -{formatCurrency(totalCardsInvoices)}
            </span>
          </div>

          {/* Row 5: Compromissos de Dívidas */}
          <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-1 min-[420px]:gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2 min-w-0">
              <span className="font-bold text-rose-600 shrink-0">(-)</span>
              <span className="text-slate-700 dark:text-slate-300">Compromissos mínimos de dívidas no mês</span>
            </div>
            <span className="font-mono font-semibold text-rose-600 dark:text-rose-400 tabular-nums shrink-0 self-end min-[420px]:self-auto">
              -{formatCurrency(totalDebtCommitments)}
            </span>
          </div>

          {/* Row 6: Reserva Financeira Preservada */}
          <div className="flex flex-col min-[420px]:flex-row min-[420px]:items-center justify-between gap-1.5 min-[420px]:gap-3 py-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <span className="font-bold text-purple-600 shrink-0">(-)</span>
              <span className="text-slate-700 dark:text-slate-300">Reserva de emergência que desejo preservar</span>
              {isEditingReserve ? (
                <div className="flex items-center gap-1.5">
                  <input
                    id={safetyReserveId}
                    name="safety_reserve"
                    type="text"
                    autoComplete="off"
                    aria-label="Reserva de emergência que desejo preservar (R$)"
                    value={reserveInputStr}
                    onChange={e => setReserveInputStr(e.target.value.replace(/[^0-9,]/g, ''))}
                    className="w-24 px-2 py-1 font-mono text-xs border border-slate-300 dark:border-slate-700 rounded-md bg-white dark:bg-slate-800"
                  />
                  <button
                    onClick={handleSaveReserve}
                    className="px-2.5 py-1 bg-emerald-600 text-white rounded-md text-[10px] font-bold cursor-pointer"
                  >
                    OK
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsEditingReserve(true)}
                  className="text-[11px] text-emerald-600 dark:text-emerald-400 underline font-semibold cursor-pointer"
                >
                  Alterar valor
                </button>
              )}
            </div>
            <span className="font-mono font-semibold text-purple-600 dark:text-purple-400 tabular-nums shrink-0 self-end min-[420px]:self-auto">
              -{formatCurrency(safetyReserveDesired)}
            </span>
          </div>

          {/* Final Equal Row */}
          <div className="flex flex-wrap justify-between items-center gap-2 pt-3 text-sm font-bold">
            <div className="flex items-center gap-2">
              <span className="font-bold text-emerald-600">(=)</span>
              <span className="text-slate-900 dark:text-white">Dinheiro Efetivamente Livre</span>
            </div>
            <span className="font-mono text-emerald-600 dark:text-emerald-400 text-base tabular-nums shrink-0">
              {formatCurrency(freeMoneyAvailable)}
            </span>
          </div>
        </div>
      </div>

      {/* Interactive Purchase Simulator */}
      <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-1">
            <Sliders className="w-4 h-4" />
            <span>Simulador de Compra Imediata</span>
          </div>
          <h3 className="text-base font-bold text-slate-900 dark:text-white">
            Simule uma compra antes de realizá-la
          </h3>
          <p className="text-xs text-slate-500">
            Veja exatamente o impacto no seu orçamento e se você terá tranquilidade até o fim do mês.
          </p>
        </div>

        {/* Input & Presets */}
        <div className="space-y-3">
          <label htmlFor={simulationAmountId} className="block text-xs font-medium text-slate-500 dark:text-slate-400">
            Quero comprar algo no valor de:
          </label>
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="relative flex-1">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-base">
                R$
              </span>
              <input
                id={simulationAmountId}
                name="simulation_amount"
                type="text"
                autoComplete="off"
                value={simulationAmountStr}
                onChange={e => setSimulationAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
                className="w-full pl-12 pr-4 py-2.5 font-mono text-xl font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white tabular-nums"
              />
            </div>

            {/* Presets buttons */}
            <div className="flex flex-wrap items-center gap-1.5">
              {presets.map(p => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSimulationAmountStr(p.toString())}
                  className="px-3 py-2 text-xs font-mono font-medium rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                >
                  R$ {p}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Simulation Output Card */}
        {simulationAmount > 0 && (
          <div
            className={`p-5 rounded-2xl border transition-all ${
              simulationResult.riskLevel === 'safe'
                ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/80 text-emerald-950 dark:text-emerald-100'
                : simulationResult.riskLevel === 'caution'
                ? 'bg-amber-50/70 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800/80 text-amber-950 dark:text-amber-100'
                : 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/80 text-rose-950 dark:text-rose-100'
            }`}
          >
            <div className="flex items-center gap-2 mb-2 font-bold text-sm">
              {simulationResult.riskLevel === 'safe' ? (
                <>
                  <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  <span>Compra Segura para o seu Orçamento</span>
                </>
              ) : simulationResult.riskLevel === 'caution' ? (
                <>
                  <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  <span>Atenção: Margem Reduzida</span>
                </>
              ) : (
                <>
                  <XCircle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
                  <span>Inviável sem Comprometer Outras Contas</span>
                </>
              )}
            </div>

            <p className="text-xs sm:text-sm leading-relaxed mb-4">
              {simulationResult.feedbackMessage}
            </p>

            <div className="grid grid-cols-1 min-[380px]:grid-cols-2 sm:grid-cols-3 gap-3 pt-3 border-t border-black/10 dark:border-white/10 text-xs">
              <div>
                <span className="opacity-75">Sobrará após a compra:</span>
                <div className="font-mono font-bold text-sm mt-0.5 tabular-nums">
                  {formatCurrency(simulationResult.freeMoneyAfter)}
                </div>
              </div>
              <div>
                <span className="opacity-75">% do dinheiro livre gasto:</span>
                <div className="font-mono font-bold text-sm mt-0.5 tabular-nums">
                  {formatPercent(simulationResult.percentCommitted)}
                </div>
              </div>
              <div className="min-[380px]:col-span-2 sm:col-span-1">
                <span className="opacity-75">Cabe no orçamento?</span>
                <div className="font-bold text-sm mt-0.5">
                  {simulationResult.canAfford ? 'Sim, permitido' : 'Não recomendado'}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Projeção dos Próximos Meses: O que você estará devendo */}
      <FutureProjectionCard />

      {/* Clarification Box: Important Distinction */}
      <div className="p-4 bg-slate-100/70 dark:bg-slate-800/40 rounded-2xl border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
        <span className="font-bold text-slate-800 dark:text-slate-200">Dica Financeira: </span>
        Não confunda <strong>saldo bancário</strong> com <strong>dinheiro livre</strong>. Ter R$ 3.000 na conta não significa poder gastar R$ 3.000 se você tem um aluguel de R$ 1.400 e uma fatura de cartão de R$ 500 para vencer nos próximos dias. O Poder de Compra garante que você nunca fique no vermelho.
      </div>
    </div>
  );
};
