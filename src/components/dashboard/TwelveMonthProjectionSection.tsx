/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useId, useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  BarChart3,
  LineChart,
  Layers,
  Sliders,
  DollarSign,
  Wallet,
  Shield,
  CreditCard,
  ChevronDown,
  ChevronUp,
  Info
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, formatPercent } from '../../utils/formatters';
import { MonthProjection } from '../../types/finance';

type ChartMode = 'balance_obligations' | 'cumulative_balance' | 'obligations_breakdown';

export const TwelveMonthProjectionSection: React.FC = () => {
  const {
    next12MonthsProjections,
    totalBankBalance,
    debts,
    selectSpecificMonth,
    goToCurrentMonth
  } = useFinance();

  // Selected chart visual mode
  const [chartMode, setChartMode] = useState<ChartMode>('balance_obligations');
  // Selected month index for deep-dive (0 to 11)
  const [selectedMonthIdx, setSelectedMonthIdx] = useState<number>(0);
  // Hovered month index for tooltips
  const [hoveredMonthIdx, setHoveredMonthIdx] = useState<number | null>(null);
  // Show full table toggle
  const [showFullTable, setShowFullTable] = useState<boolean>(true);

  // Scenario Simulator states
  const fieldIdPrefix = useId();
  const extraIncomeSliderId = `${fieldIdPrefix}-extra-monthly-income`;
  const expenseReductionSliderId = `${fieldIdPrefix}-monthly-expense-reduction`;
  const [extraMonthlyIncome, setExtraMonthlyIncome] = useState<number>(0);
  const [monthlyExpenseReduction, setMonthlyExpenseReduction] = useState<number>(0);

  // Computed projections with scenario adjustments applied
  const simulatedProjections: MonthProjection[] = useMemo(() => {
    let runningBalance = totalBankBalance;
    return next12MonthsProjections.map((p, idx) => {
      const adjustedIncome = p.totalIncomeProjected + extraMonthlyIncome;
      const adjustedFixed = Math.max(0, p.fixedExpensesProjected - monthlyExpenseReduction);
      const adjustedOwed = adjustedFixed + p.debtsProjected + p.cardInstallmentsProjected;
      const monthlyNet = adjustedIncome - adjustedOwed;
      runningBalance += monthlyNet;

      return {
        ...p,
        totalIncomeProjected: adjustedIncome,
        fixedExpensesProjected: adjustedFixed,
        totalOwedTotal: adjustedOwed,
        projectedFreeBalance: Math.max(0, monthlyNet),
        projectedCumulativeBalance: runningBalance
      };
    });
  }, [next12MonthsProjections, totalBankBalance, extraMonthlyIncome, monthlyExpenseReduction]);

  // Executive KPI 1: Total Obligations over 12 months
  const total12MObligations = useMemo(() => {
    return simulatedProjections.reduce((sum, p) => sum + p.totalOwedTotal, 0);
  }, [simulatedProjections]);

  const total12MFixed = useMemo(() => {
    return simulatedProjections.reduce((sum, p) => sum + p.fixedExpensesProjected, 0);
  }, [simulatedProjections]);

  const total12MDebts = useMemo(() => {
    return simulatedProjections.reduce((sum, p) => sum + p.debtsProjected, 0);
  }, [simulatedProjections]);

  const total12MCards = useMemo(() => {
    return simulatedProjections.reduce((sum, p) => sum + p.cardInstallmentsProjected, 0);
  }, [simulatedProjections]);

  // Executive KPI 2: Peak obligation month
  const peakMonth = useMemo(() => {
    if (!simulatedProjections.length) return null;
    return simulatedProjections.reduce((max, p) => (p.totalOwedTotal > max.totalOwedTotal ? p : max), simulatedProjections[0]);
  }, [simulatedProjections]);

  // Executive KPI 3: Final projected cumulative balance (Month 12)
  const finalProjectedBalance = useMemo(() => {
    if (!simulatedProjections.length) return totalBankBalance;
    return simulatedProjections[simulatedProjections.length - 1].projectedCumulativeBalance;
  }, [simulatedProjections, totalBankBalance]);

  const balanceDelta12M = finalProjectedBalance - totalBankBalance;

  // Executive KPI 4: Debts simulated payoff over 12 months
  const debtsAnalysis = useMemo(() => {
    const activeDebts = debts.filter(d => d.status !== 'settled');
    const totalRemainingNow = activeDebts.reduce((sum, d) => sum + d.currentBalance, 0);

    // Track when each debt finishes
    const simulatedBalances = activeDebts.map(d => ({ ...d, currentRemaining: d.currentBalance, payoffMonth: null as string | null }));
    
    simulatedProjections.forEach(proj => {
      simulatedBalances.forEach(d => {
        if (d.currentRemaining > 0 && (d.minimumPayment || 0) > 0) {
          const pay = Math.min(d.currentRemaining, d.minimumPayment || 0);
          d.currentRemaining -= pay;
          if (d.currentRemaining <= 0 && !d.payoffMonth) {
            d.payoffMonth = proj.label;
          }
        }
      });
    });

    const clearedDebts = simulatedBalances.filter(d => d.currentRemaining <= 0);
    const totalAmortized = totalRemainingNow - simulatedBalances.reduce((sum, d) => sum + Math.max(0, d.currentRemaining), 0);

    return {
      activeCount: activeDebts.length,
      clearedCount: clearedDebts.length,
      clearedDebts,
      totalAmortized,
      totalRemainingNow
    };
  }, [debts, simulatedProjections]);

  // Active inspected month
  const inspectedMonth = simulatedProjections[selectedMonthIdx] || simulatedProjections[0];

  // SVG Chart Dimensions & Math calculations
  const chartHeight = 280;
  const chartWidth = 920;
  const padding = { top: 25, right: 30, bottom: 40, left: 65 };
  const plotWidth = chartWidth - padding.left - padding.right;
  const plotHeight = chartHeight - padding.top - padding.bottom;

  // Find scale maximums
  const { maxVal, minVal } = useMemo(() => {
    let max = 0;
    let min = 0;
    simulatedProjections.forEach(p => {
      max = Math.max(max, p.totalIncomeProjected, p.totalOwedTotal, p.projectedCumulativeBalance);
      min = Math.min(min, p.projectedCumulativeBalance, 0);
    });
    // Add headroom
    const buffer = (max - min) * 0.15 || 500;
    return {
      maxVal: Math.max(1000, Math.ceil((max + buffer) / 1000) * 1000),
      minVal: Math.min(0, Math.floor((min - buffer) / 1000) * 1000)
    };
  }, [simulatedProjections]);

  const valueRange = maxVal - minVal || 1;

  const getY = (val: number) => {
    const normalized = (val - minVal) / valueRange;
    return padding.top + plotHeight - normalized * plotHeight;
  };

  const getX = (idx: number) => {
    const step = plotWidth / (simulatedProjections.length - 1 || 1);
    return padding.left + idx * step;
  };

  const zeroY = getY(0);

  // SVG Points for Cumulative Balance Line
  const cumulativePoints = useMemo(() => {
    return simulatedProjections.map((p, i) => `${getX(i)},${getY(p.projectedCumulativeBalance)}`).join(' ');
  }, [simulatedProjections, maxVal, minVal]);

  const cumulativeAreaPoints = useMemo(() => {
    if (!simulatedProjections.length) return '';
    const firstX = getX(0);
    const lastX = getX(simulatedProjections.length - 1);
    return `${firstX},${zeroY} ${cumulativePoints} ${lastX},${zeroY}`;
  }, [cumulativePoints, zeroY]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Header */}
      <div className="p-6 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-800 text-white rounded-3xl shadow-xl border border-slate-700/60 relative overflow-hidden">
        {/* Subtle decorative glow */}
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none -ml-20 -mb-20" />

        <div className="relative z-10">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="p-1.5 rounded-lg bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                  Inteligência Preditiva • Próximos 12 Meses
                </span>
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white">
                Projeção Anual de Saldo & Obrigações
              </h2>
              <p className="text-sm text-slate-300 max-w-2xl">
                Cálculo automatizado integrando suas despesas fixas recorrentes, parcelas ativas de cartões e amortização contínua de dívidas cadastrados no sistema.
              </p>
            </div>

            {/* Quick Period Badge */}
            {simulatedProjections.length > 0 && (
              <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-2xl p-3 backdrop-blur-xs shrink-0 self-start lg:self-auto">
                <div className="p-2.5 rounded-xl bg-white/10 text-white">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                </div>
                <div>
                  <div className="text-[11px] text-slate-400 font-medium">Janela de Projeção</div>
                  <div className="text-sm font-bold text-white font-mono">
                    {simulatedProjections[0]?.shortLabel} → {simulatedProjections[simulatedProjections.length - 1]?.shortLabel}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 4 Executive Intelligence Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total Obrigações em 12 Meses */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span>Obrigações em 12 Meses</span>
              <AlertCircle className="w-4 h-4 text-rose-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
              {formatCurrency(total12MObligations)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Média de {formatCurrency(total12MObligations / 12)} / mês
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 space-y-1.5 text-[11px]">
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Fixas:</span>
              <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(total12MFixed)}</strong>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Dívidas:</span>
              <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(total12MDebts)}</strong>
            </div>
            <div className="flex justify-between text-slate-600 dark:text-slate-400">
              <span>Cartões:</span>
              <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(total12MCards)}</strong>
            </div>
          </div>
        </div>

        {/* Card 2: Mês Mais Crítico (Pico de Pagamentos) */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span>Mês de Maior Compromisso</span>
              <AlertTriangle className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-lg font-bold text-slate-900 dark:text-white truncate">
              {peakMonth ? peakMonth.label : 'N/D'}
            </div>
            <div className="text-2xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums mt-0.5">
              {peakMonth ? formatCurrency(peakMonth.totalOwedTotal) : 'R$ 0,00'}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            {peakMonth ? (
              <div className="space-y-1">
                <div>
                  Representa <strong className="text-slate-800 dark:text-slate-200 font-mono">
                    {formatPercent((peakMonth.totalOwedTotal / (peakMonth.totalIncomeProjected || 1)) * 100)}
                  </strong> da renda prevista no mês
                </div>
                <div className="text-amber-600 dark:text-amber-400 font-medium">
                  {peakMonth.commitments.length} compromissos agendados
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {/* Card 3: Saldo Acumulado Projetado (Mês 12) */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span>Saldo Projetado em 12 Meses</span>
              <Wallet className="w-4 h-4 text-emerald-500" />
            </div>
            <div className={`text-2xl font-bold font-mono tabular-nums ${
              finalProjectedBalance >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {formatCurrency(finalProjectedBalance)}
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
              {balanceDelta12M >= 0 ? (
                <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                  <TrendingUp className="w-3.5 h-3.5 mr-0.5" /> +{formatCurrency(balanceDelta12M)}
                </span>
              ) : (
                <span className="text-rose-600 dark:text-rose-400 font-semibold flex items-center">
                  <TrendingDown className="w-3.5 h-3.5 mr-0.5" /> {formatCurrency(balanceDelta12M)}
                </span>
              )}
              <span>vs saldo atual</span>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            <div className="flex justify-between">
              <span>Saldo Inicial Hoje:</span>
              <strong className="font-mono text-slate-900 dark:text-white">{formatCurrency(totalBankBalance)}</strong>
            </div>
          </div>
        </div>

        {/* Card 4: Quitação de Dívidas no Período */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span>Quitação de Dívidas</span>
              <CheckCircle2 className="w-4 h-4 text-blue-500" />
            </div>
            <div className="text-2xl font-bold font-mono text-blue-600 dark:text-blue-400 tabular-nums">
              {debtsAnalysis.clearedCount} de {debtsAnalysis.activeCount} quitada(s)
            </div>
            <div className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {formatCurrency(debtsAnalysis.totalAmortized)} amortizados em 12 meses
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400">
            {debtsAnalysis.clearedDebts.length > 0 ? (
              <div className="truncate text-emerald-600 dark:text-emerald-400 font-medium">
                Quitada: {debtsAnalysis.clearedDebts[0].name} ({debtsAnalysis.clearedDebts[0].payoffMonth})
              </div>
            ) : (
              <div>Amortização gradual contínua ativa</div>
            )}
          </div>
        </div>
      </div>

      {/* Main Chart Section */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        {/* Chart Header & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h3 className="text-base sm:text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              Gráfico de Projeção Interativo
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Passe o mouse ou clique sobre qualquer mês para inspecionar os detalhes e compromissos
            </p>
          </div>

          {/* Mode Switcher */}
          <div className="flex flex-wrap sm:inline-flex p-1 bg-slate-100 dark:bg-slate-800 rounded-xl text-xs font-medium self-start sm:self-auto max-w-full gap-1">
            <button
              onClick={() => setChartMode('balance_obligations')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartMode === 'balance_obligations'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Receitas vs Obrigações</span>
            </button>
            <button
              onClick={() => setChartMode('cumulative_balance')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartMode === 'cumulative_balance'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <LineChart className="w-3.5 h-3.5 text-blue-600 shrink-0" />
              <span>Saldo Acumulado</span>
            </button>
            <button
              onClick={() => setChartMode('obligations_breakdown')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                chartMode === 'obligations_breakdown'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Layers className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              <span>Composição</span>
            </button>
          </div>
        </div>

        {/* Chart Legend */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-slate-600 dark:text-slate-400 pt-1">
          <div className="flex flex-wrap items-center gap-4">
            {chartMode === 'balance_obligations' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block" />
                  <span>Receitas Previstas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" />
                  <span>Obrigações a Pagar (Devendo)</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block" />
                  <span>Saldo Acumulado (Linha)</span>
                </div>
              </>
            )}
            {chartMode === 'cumulative_balance' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-blue-500 inline-block" />
                  <span>Saldo Acumulado Estimado</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-0.5 bg-slate-400 inline-block border-t border-dashed border-slate-400" />
                  <span>Linha Zero / Limite</span>
                </div>
              </>
            )}
            {chartMode === 'obligations_breakdown' && (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-slate-500 inline-block" />
                  <span>Despesas Fixas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-rose-500 inline-block" />
                  <span>Amortização Dívidas</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-3 h-3 rounded-xs bg-amber-500 inline-block" />
                  <span>Parcelas Cartão</span>
                </div>
              </>
            )}
          </div>

          <div className="text-[11px] text-slate-500 dark:text-slate-400 italic">
            Valores monetários em R$ (BRL)
          </div>
        </div>

        {/* SVG Responsive Container */}
        <div className="sm:hidden text-[11px] text-slate-400 flex items-center justify-end">
          <span>Deslize o gráfico horizontalmente →</span>
        </div>
        <div className="relative w-full overflow-x-auto overscroll-x-contain">
          <div className="min-w-[680px]">
            <svg
              viewBox={`0 0 ${chartWidth} ${chartHeight}`}
              className="w-full h-auto overflow-visible select-none"
            >
              <defs>
                {/* Area Gradient for Cumulative Balance */}
                <linearGradient id="balanceAreaGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.35" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#059669" stopOpacity="0.75" />
                </linearGradient>
                <linearGradient id="debtGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#e11d48" stopOpacity="0.75" />
                </linearGradient>
              </defs>

              {/* Grid Lines & Y-Axis Labels */}
              {[0, 0.25, 0.5, 0.75, 1].map((pct, i) => {
                const val = minVal + pct * valueRange;
                const y = getY(val);
                return (
                  <g key={i}>
                    <line
                      x1={padding.left}
                      y1={y}
                      x2={chartWidth - padding.right}
                      y2={y}
                      stroke="currentColor"
                      strokeDasharray={val === 0 ? '0' : '3 3'}
                      className={val === 0 ? 'text-slate-400 dark:text-slate-600 stroke-1' : 'text-slate-200 dark:text-slate-800 stroke-1'}
                    />
                    <text
                      x={padding.left - 8}
                      y={y + 3.5}
                      textAnchor="end"
                      className="fill-slate-400 dark:fill-slate-500 text-[10px] font-mono"
                    >
                      {formatCurrency(val)}
                    </text>
                  </g>
                );
              })}

              {/* Bars: Balance vs Obligations OR Breakdown */}
              {chartMode === 'balance_obligations' && (
                <g>
                  {simulatedProjections.map((p, idx) => {
                    const xCenter = getX(idx);
                    const barWidth = 14;
                    const isSelected = selectedMonthIdx === idx;
                    const isHovered = hoveredMonthIdx === idx;

                    // Income Bar (Left)
                    const incomeHeight = Math.max(2, (p.totalIncomeProjected / valueRange) * plotHeight);
                    const incomeY = getY(p.totalIncomeProjected);

                    // Obligation Bar (Right)
                    const owedHeight = Math.max(2, (p.totalOwedTotal / valueRange) * plotHeight);
                    const owedY = getY(p.totalOwedTotal);

                    return (
                      <g
                        key={`bar-${idx}`}
                        className="cursor-pointer transition-opacity"
                        opacity={hoveredMonthIdx !== null && !isHovered ? 0.6 : 1}
                        onClick={() => setSelectedMonthIdx(idx)}
                        onMouseEnter={() => setHoveredMonthIdx(idx)}
                        onMouseLeave={() => setHoveredMonthIdx(null)}
                      >
                        {/* Selected highlight column */}
                        {isSelected && (
                          <rect
                            x={xCenter - 22}
                            y={padding.top}
                            width={44}
                            height={plotHeight}
                            className="fill-emerald-500/10 dark:fill-emerald-400/10 rx-md"
                            rx="6"
                          />
                        )}

                        {/* Income Bar */}
                        <rect
                          x={xCenter - barWidth - 1}
                          y={incomeY}
                          width={barWidth}
                          height={incomeHeight}
                          fill="url(#incomeGrad)"
                          rx="3"
                          className="transition-all hover:brightness-110"
                        />

                        {/* Obligations Bar */}
                        <rect
                          x={xCenter + 1}
                          y={owedY}
                          width={barWidth}
                          height={owedHeight}
                          fill="url(#debtGrad)"
                          rx="3"
                          className="transition-all hover:brightness-110"
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Breakdown Stacked Bars */}
              {chartMode === 'obligations_breakdown' && (
                <g>
                  {simulatedProjections.map((p, idx) => {
                    const xCenter = getX(idx);
                    const barWidth = 24;
                    const isSelected = selectedMonthIdx === idx;
                    const isHovered = hoveredMonthIdx === idx;

                    // Fixed expenses
                    const fixedH = Math.max(0, (p.fixedExpensesProjected / valueRange) * plotHeight);
                    // Debts
                    const debtH = Math.max(0, (p.debtsProjected / valueRange) * plotHeight);
                    // Cards
                    const cardH = Math.max(0, (p.cardInstallmentsProjected / valueRange) * plotHeight);

                    const base = zeroY;
                    const fixedY = base - fixedH;
                    const debtY = fixedY - debtH;
                    const cardY = debtY - cardH;

                    return (
                      <g
                        key={`breakdown-${idx}`}
                        className="cursor-pointer transition-opacity"
                        opacity={hoveredMonthIdx !== null && !isHovered ? 0.6 : 1}
                        onClick={() => setSelectedMonthIdx(idx)}
                        onMouseEnter={() => setHoveredMonthIdx(idx)}
                        onMouseLeave={() => setHoveredMonthIdx(null)}
                      >
                        {isSelected && (
                          <rect
                            x={xCenter - 18}
                            y={padding.top}
                            width={36}
                            height={plotHeight}
                            className="fill-blue-500/10 dark:fill-blue-400/10"
                            rx="6"
                          />
                        )}

                        {/* Fixed */}
                        {fixedH > 0 && (
                          <rect
                            x={xCenter - barWidth / 2}
                            y={fixedY}
                            width={barWidth}
                            height={fixedH}
                            className="fill-slate-500 dark:fill-slate-400"
                            rx="2"
                          />
                        )}

                        {/* Debt */}
                        {debtH > 0 && (
                          <rect
                            x={xCenter - barWidth / 2}
                            y={debtY}
                            width={barWidth}
                            height={debtH}
                            className="fill-rose-500"
                            rx="2"
                          />
                        )}

                        {/* Card */}
                        {cardH > 0 && (
                          <rect
                            x={xCenter - barWidth / 2}
                            y={cardY}
                            width={barWidth}
                            height={cardH}
                            className="fill-amber-500"
                            rx="2"
                          />
                        )}
                      </g>
                    );
                  })}
                </g>
              )}

              {/* Cumulative Balance Area & Line */}
              {(chartMode === 'cumulative_balance' || chartMode === 'balance_obligations') && (
                <g>
                  {/* Area fill */}
                  {chartMode === 'cumulative_balance' && (
                    <polygon
                      points={cumulativeAreaPoints}
                      fill="url(#balanceAreaGrad)"
                    />
                  )}

                  {/* Line */}
                  <polyline
                    fill="none"
                    stroke="#2563eb"
                    strokeWidth={chartMode === 'cumulative_balance' ? 3 : 2}
                    points={cumulativePoints}
                    className="drop-shadow-xs"
                  />

                  {/* Dots for each month */}
                  {simulatedProjections.map((p, idx) => {
                    const cx = getX(idx);
                    const cy = getY(p.projectedCumulativeBalance);
                    const isSelected = selectedMonthIdx === idx;
                    const isHovered = hoveredMonthIdx === idx;

                    return (
                      <g
                        key={`dot-${idx}`}
                        className="cursor-pointer"
                        onClick={() => setSelectedMonthIdx(idx)}
                        onMouseEnter={() => setHoveredMonthIdx(idx)}
                        onMouseLeave={() => setHoveredMonthIdx(null)}
                      >
                        <circle
                          cx={cx}
                          cy={cy}
                          r={isSelected || isHovered ? 6 : 3.5}
                          className={`${
                            isSelected
                              ? 'fill-blue-600 stroke-white dark:stroke-slate-900 stroke-2'
                              : 'fill-white dark:fill-slate-900 stroke-blue-600 stroke-2'
                          } transition-all`}
                        />
                      </g>
                    );
                  })}
                </g>
              )}

              {/* X-Axis Month Labels */}
              {simulatedProjections.map((p, idx) => {
                const x = getX(idx);
                const isSelected = selectedMonthIdx === idx;
                return (
                  <g
                    key={`label-${idx}`}
                    className="cursor-pointer"
                    onClick={() => setSelectedMonthIdx(idx)}
                  >
                    <text
                      x={x}
                      y={chartHeight - 12}
                      textAnchor="middle"
                      className={`text-[11px] font-mono transition-colors ${
                        isSelected
                          ? 'fill-emerald-600 dark:fill-emerald-400 font-bold'
                          : 'fill-slate-500 dark:fill-slate-400'
                      }`}
                    >
                      {p.shortLabel}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Selected Month Quick Chips */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 pt-2 no-scrollbar">
          {simulatedProjections.map((p, idx) => {
            const isSelected = selectedMonthIdx === idx;
            const isPositive = p.totalIncomeProjected >= p.totalOwedTotal;
            return (
              <button
                key={idx}
                onClick={() => setSelectedMonthIdx(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-mono shrink-0 transition-all border flex items-center gap-1.5 ${
                  isSelected
                    ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900 border-slate-900 dark:border-white shadow-xs font-bold'
                    : 'bg-slate-50 hover:bg-slate-100 dark:bg-slate-800/60 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/70 dark:border-slate-700'
                }`}
              >
                <span>{p.shortLabel}</span>
                <span className={`w-1.5 h-1.5 rounded-full ${isPositive ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              </button>
            );
          })}
        </div>
      </div>

      {/* Selected Month Deep-Dive Panel */}
      {inspectedMonth && (
        <div className="p-5 sm:p-6 bg-slate-50 dark:bg-slate-850 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200/80 dark:border-slate-800">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                  Mês Inspecionado ({selectedMonthIdx + 1} de 12)
                </span>
                {inspectedMonth.totalIncomeProjected >= inspectedMonth.totalOwedTotal ? (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                    Superávit Previsto
                  </span>
                ) : (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300">
                    Atenção: Déficit no Mês
                  </span>
                )}
              </div>
              <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                {inspectedMonth.label}
              </h3>
            </div>

            <button
              onClick={() => selectSpecificMonth(inspectedMonth.year, inspectedMonth.month)}
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-semibold shadow-xs flex items-center gap-1.5 self-start sm:self-auto transition-all"
            >
              <span>Abrir Navegação deste Mês</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 4 Mini Cards for the Inspected Month */}
          <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">Receita Prevista</span>
              <div className="text-lg font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums mt-0.5">
                {formatCurrency(inspectedMonth.totalIncomeProjected)}
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">Total a Pagar (Devendo)</span>
              <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums mt-0.5">
                {formatCurrency(inspectedMonth.totalOwedTotal)}
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">Resultado Líquido do Mês</span>
              <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                inspectedMonth.totalIncomeProjected - inspectedMonth.totalOwedTotal >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {formatCurrency(inspectedMonth.totalIncomeProjected - inspectedMonth.totalOwedTotal)}
              </div>
            </div>

            <div className="p-3.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800">
              <span className="text-xs text-slate-500 dark:text-slate-400">Saldo Acumulado Estimado</span>
              <div className={`text-lg font-bold font-mono tabular-nums mt-0.5 ${
                inspectedMonth.projectedCumulativeBalance >= 0
                  ? 'text-blue-600 dark:text-blue-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}>
                {formatCurrency(inspectedMonth.projectedCumulativeBalance)}
              </div>
            </div>
          </div>

          {/* Detailed Commitments List for this Month */}
          <div className="space-y-2 pt-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400 font-medium">
              <span>Compromissos e Obrigações a Quitar ({inspectedMonth.commitments.length})</span>
              <span>Vencimento Programado</span>
            </div>

            {inspectedMonth.commitments.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                Nenhum compromisso programado para este mês!
              </div>
            ) : (
              <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                {inspectedMonth.commitments.map((c, i) => (
                  <div
                    key={c.id || i}
                    className="p-3 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-800 flex items-center justify-between gap-2 text-xs hover:border-slate-300 dark:hover:border-slate-700 transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`p-1.5 rounded-lg shrink-0 ${
                        c.type === 'debt_commitment'
                          ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                          : c.type === 'card_installment'
                          ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/60 dark:text-amber-400'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}>
                        {c.type === 'debt_commitment' ? (
                          <Shield className="w-3.5 h-3.5" />
                        ) : c.type === 'card_installment' ? (
                          <CreditCard className="w-3.5 h-3.5" />
                        ) : (
                          <Calendar className="w-3.5 h-3.5" />
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-slate-900 dark:text-white truncate">
                          {c.description}
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-1.5">
                          <span>{c.category}</span>
                          {c.originName && <span>• {c.originName}</span>}
                          {c.installmentLabel && (
                            <span className="px-1.5 py-0.2 rounded bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 font-mono text-[10px]">
                              Parc. {c.installmentLabel}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-right shrink-0 ml-3">
                      <div className="font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                        {formatCurrency(c.amount)}
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono">
                        Venc: {formatDateBR(c.dueDate)}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Scenario / Stress-Test Simulator ("E se?") */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-purple-500/10 text-purple-600 dark:text-purple-400 rounded-xl shrink-0">
              <Sliders className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Simulador de Cenários em Tempo Real
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Ajuste os parâmetros abaixo para ver imediatamente o impacto na curva dos próximos 12 meses
              </p>
            </div>
          </div>

          {(extraMonthlyIncome > 0 || monthlyExpenseReduction > 0) && (
            <button
              onClick={() => {
                setExtraMonthlyIncome(0);
                setMonthlyExpenseReduction(0);
              }}
              className="text-xs font-semibold text-purple-600 dark:text-purple-400 hover:underline shrink-0 cursor-pointer"
            >
              Resetar Simulação
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* Income slider */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor={extraIncomeSliderId} className="font-semibold text-slate-700 dark:text-slate-300">
                Aumento Mensal de Renda (+R$)
              </label>
              <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(extraMonthlyIncome)}
              </span>
            </div>
            <input
              id={extraIncomeSliderId}
              name="extra_monthly_income"
              type="range"
              min="0"
              max="5000"
              step="100"
              value={extraMonthlyIncome}
              onChange={e => setExtraMonthlyIncome(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>R$ 0</span>
              <span>R$ 2.500</span>
              <span>R$ 5.000</span>
            </div>
          </div>

          {/* Expense reduction slider */}
          <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-2">
            <div className="flex justify-between items-center text-xs">
              <label htmlFor={expenseReductionSliderId} className="font-semibold text-slate-700 dark:text-slate-300">
                Corte de Despesas Fixas (-R$)
              </label>
              <span className="font-mono font-bold text-rose-600 dark:text-rose-400">
                {formatCurrency(monthlyExpenseReduction)}
              </span>
            </div>
            <input
              id={expenseReductionSliderId}
              name="monthly_expense_reduction"
              type="range"
              min="0"
              max="3000"
              step="50"
              value={monthlyExpenseReduction}
              onChange={e => setMonthlyExpenseReduction(Number(e.target.value))}
              className="w-full accent-rose-600 cursor-pointer"
            />
            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>R$ 0</span>
              <span>R$ 1.500</span>
              <span>R$ 3.000</span>
            </div>
          </div>
        </div>
      </div>

      {/* Month-by-Month Analytical Table */}
      <div className="p-5 sm:p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">
              Tabela Analítica Completa (12 Meses)
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Visão consolidada mês a mês com receitas, obrigações detalhadas e evolução do saldo
            </p>
          </div>

          <button
            onClick={() => setShowFullTable(!showFullTable)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center gap-1.5 self-start sm:self-auto shrink-0 transition-all cursor-pointer"
          >
            {showFullTable ? (
              <>
                <span>Recolher Tabela</span>
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                <span>Expandir Tabela</span>
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        </div>

        {showFullTable && (
          <div className="overflow-x-auto overscroll-x-contain">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">
                  <th className="py-2.5 px-3">Mês</th>
                  <th className="py-2.5 px-3 text-right">Receitas</th>
                  <th className="py-2.5 px-3 text-right">Despesas Fixas</th>
                  <th className="py-2.5 px-3 text-right">Dívidas</th>
                  <th className="py-2.5 px-3 text-right">Cartão</th>
                  <th className="py-2.5 px-3 text-right font-bold text-slate-900 dark:text-white">Total a Pagar</th>
                  <th className="py-2.5 px-3 text-right font-bold">Resultado</th>
                  <th className="py-2.5 px-3 text-right font-bold text-blue-600 dark:text-blue-400">Saldo Acumulado</th>
                  <th className="py-2.5 px-3 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-mono whitespace-nowrap">
                {simulatedProjections.map((p, idx) => {
                  const net = p.totalIncomeProjected - p.totalOwedTotal;
                  const isSelected = selectedMonthIdx === idx;
                  const isPeak = peakMonth?.month === p.month && peakMonth?.year === p.year;

                  return (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                        isSelected ? 'bg-emerald-500/5 dark:bg-emerald-400/5 font-semibold' : ''
                      }`}
                    >
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5 font-sans">
                          <span className="font-semibold text-slate-900 dark:text-white">{p.label}</span>
                          {isPeak && (
                            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300">
                              Pico
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="py-3 px-3 text-right text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(p.totalIncomeProjected)}
                      </td>

                      <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                        {formatCurrency(p.fixedExpensesProjected)}
                      </td>

                      <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                        {formatCurrency(p.debtsProjected)}
                      </td>

                      <td className="py-3 px-3 text-right text-slate-600 dark:text-slate-400">
                        {formatCurrency(p.cardInstallmentsProjected)}
                      </td>

                      <td className="py-3 px-3 text-right font-bold text-rose-600 dark:text-rose-400">
                        {formatCurrency(p.totalOwedTotal)}
                      </td>

                      <td className={`py-3 px-3 text-right font-bold ${
                        net >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {formatCurrency(net)}
                      </td>

                      <td className={`py-3 px-3 text-right font-bold ${
                        p.projectedCumulativeBalance >= 0 ? 'text-blue-600 dark:text-blue-400' : 'text-rose-600 dark:text-rose-400'
                      }`}>
                        {formatCurrency(p.projectedCumulativeBalance)}
                      </td>

                      <td className="py-3 px-3 text-center">
                        <button
                          onClick={() => setSelectedMonthIdx(idx)}
                          className="px-2 py-1 text-[11px] font-sans font-medium rounded-lg text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40 transition-colors cursor-pointer"
                        >
                          Ver Detalhes
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
