/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from 'react';
import {
  PieChart as PieIcon,
  BarChart3,
  TrendingUp,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Layers,
  CreditCard,
  Target,
  Sparkles,
  ChevronRight,
  Calendar,
  Wallet
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, formatPercent, getTodayISO, MONTH_NAMES_SHORT_PT } from '../../utils/formatters';
import { Transaction } from '../../types/finance';
import { ResponsiveModal } from '../common/ResponsiveModal';
import {
  buildPeriodString,
  buildProjectedTransactionsForMonth,
  getTransactionEffectiveDate,
  getTransactionEffectivePeriod,
  isVirtualTransaction,
  parsePeriodString,
  resolveActivePeriod
} from '../../utils/periodFilter';
import { addMonthsToPeriod } from '../../utils/recurringIncome';

export const AnalyticsView: React.FC = () => {
  const {
    transactions,
    filteredTransactions,
    filter,
    activePeriod: ctxActivePeriod,
    periodLabel: ctxPeriodLabel,
    recurringIncomes = [],
    recurringExpenses = [],
    categories,
    debts,
    creditCards,
    totalBankBalance,
    freeMoneyAvailable,
    totalIncomePeriod,
    totalExpensePeriod,
    totalFixedExpenses,
    totalVariableExpenses,
    totalActiveDebts,
    incomeCommittedPercent,
    smartAlerts
  } = useFinance();

  const todayISO = getTodayISO();
  const activePeriod = ctxActivePeriod ?? resolveActivePeriod(filter ?? { period: 'current_month' }, todayISO);
  const periodLabel = ctxPeriodLabel ?? activePeriod.label;
  const scopedTransactions = filteredTransactions ?? transactions;

  // State for Category Drilldown Modal
  const [selectedDrilldownCategory, setSelectedDrilldownCategory] = useState<string | null>(null);

  // Group transactions by category for current period
  const categoryStats = useMemo(() => {
    const map: { [cat: string]: { total: number; count: number; color: string; type: string } } = {};
    scopedTransactions
      .filter(t => (t.type === 'expense_fixed' || t.type === 'expense_variable') && !t.isInvoicePayment)
      .forEach(t => {
        if (!map[t.category]) {
          const catObj = categories.find(c => c.name === t.category);
          map[t.category] = {
            total: 0,
            count: 0,
            color: catObj?.color || '#94a3b8',
            type: t.type
          };
        }
        map[t.category].total += t.amount;
        map[t.category].count += 1;
      });

    return Object.entries(map)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.total - a.total);
  }, [scopedTransactions, categories]);

  // Small purchases sum (gastos invisíveis <= R$ 25)
  const smallPurchasesTotal = useMemo(() => {
    return scopedTransactions
      .filter(t => (t.type === 'expense_fixed' || t.type === 'expense_variable') && !t.isInvoicePayment && t.amount <= 25)
      .reduce((sum, t) => sum + t.amount, 0);
  }, [scopedTransactions]);

  // Monthly trends (6-month window anchored to selected period, including future projections when applicable)
  const monthlyTrends = useMemo(() => {
    const currentPeriodStr = todayISO.slice(0, 7);
    const anchorPeriod =
      activePeriod.months.length > 0
        ? activePeriod.months[activePeriod.months.length - 1].period
        : buildPeriodString(activePeriod.selectedYear, activePeriod.selectedMonth);

    const monthsData: { [key: string]: { income: number; expense: number; fixed: number; variable: number; saved: number; label: string; isFuture: boolean } } = {};
    const orderedKeys: string[] = [];

    for (let i = 5; i >= 0; i--) {
      const key = addMonthsToPeriod(anchorPeriod, -i);
      const parsed = parsePeriodString(key) ?? { year: activePeriod.selectedYear, month: activePeriod.selectedMonth };
      const label = `${MONTH_NAMES_SHORT_PT[parsed.month]}/${String(parsed.year).slice(2)}`;
      monthsData[key] = { income: 0, expense: 0, fixed: 0, variable: 0, saved: 0, label, isFuture: key > currentPeriodStr };
      orderedKeys.push(key);
    }

    const accumulateTx = (key: string, t: Transaction) => {
      if (!monthsData[key]) return;
      if (t.type === 'income') {
        monthsData[key].income += t.amount;
      } else if (t.type === 'expense_fixed' && !t.isInvoicePayment) {
        monthsData[key].expense += t.amount;
        monthsData[key].fixed += t.amount;
      } else if (t.type === 'expense_variable' && !t.isInvoicePayment) {
        monthsData[key].expense += t.amount;
        monthsData[key].variable += t.amount;
      }
    };

    transactions.forEach(t => {
      const key = getTransactionEffectivePeriod(t);
      accumulateTx(key, t);
    });

    for (const key of orderedKeys) {
      if (key > currentPeriodStr) {
        const parsed = parsePeriodString(key);
        if (parsed) {
          const projected = buildProjectedTransactionsForMonth({
            targetYear: parsed.year,
            targetMonth: parsed.month,
            transactions,
            recurringIncomes,
            recurringExpenses,
            todayISO
          });
          projected.forEach(pt => accumulateTx(key, pt));
        }
      }
    }

    orderedKeys.forEach(k => {
      monthsData[k].saved = Math.max(0, monthsData[k].income - monthsData[k].expense);
    });

    return orderedKeys.map(k => monthsData[k]);
  }, [transactions, recurringIncomes, recurringExpenses, activePeriod, todayISO]);

  // Income distribution by group (Principal vs Benefícios vs Extras)
  const incomeDistribution = useMemo(() => {
    let main = 0;
    let benefits = 0;
    let extras = 0;

    scopedTransactions
      .filter(t => t.type === 'income')
      .forEach(t => {
        const cat = categories.find(c => c.name === t.category && c.type === 'income');
        const grp = cat?.incomeGroup || 'other';
        if (grp === 'main_income') main += t.amount;
        else if (grp === 'benefits') benefits += t.amount;
        else extras += t.amount;
      });

    const total = main + benefits + extras || 1;
    return {
      main,
      benefits,
      extras,
      mainPct: (main / total) * 100,
      benefitsPct: (benefits / total) * 100,
      extrasPct: (extras / total) * 100
    };
  }, [scopedTransactions, categories]);

  // Card expenses distribution
  const cardSpending = useMemo(() => {
    return creditCards.map(card => {
      const total = scopedTransactions
        .filter(t => t.creditCardId === card.id && t.paymentMethod === 'credit_card' && !t.isInvoicePayment)
        .reduce((sum, t) => sum + t.amount, 0);
      return {
        card,
        total,
        usedPct: card.limitTotal > 0 ? (total / card.limitTotal) * 100 : 0
      };
    });
  }, [creditCards, scopedTransactions]);

  // Transactions belonging to selected drilldown category
  const drilldownTransactions = useMemo(() => {
    if (!selectedDrilldownCategory) return [];
    return scopedTransactions.filter(
      t => t.category === selectedDrilldownCategory && (t.type === 'expense_fixed' || t.type === 'expense_variable') && !t.isInvoicePayment
    );
  }, [selectedDrilldownCategory, scopedTransactions]);

  const maxMonthlyVal = Math.max(1, ...monthlyTrends.map(m => Math.max(m.income, m.expense)));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-emerald-500" />
            Central de Gráficos & Inteligência Financeira
          </h2>
          <p className="text-xs text-slate-500">
            Análise visual profunda de gastos, tendências, dívidas e padrões de consumo
          </p>
        </div>
        <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 shadow-xs">
          <Calendar className="w-3.5 h-3.5 text-emerald-500" />
          <span>{periodLabel}</span>
          {(activePeriod.isFutureView || activePeriod.includesFuture) && (
            <span className="px-1.5 py-0.5 rounded bg-blue-500/15 text-blue-600 dark:text-blue-400 text-[10px] font-bold">
              Projeção
            </span>
          )}
        </div>
      </div>

      {/* Smart Automated Insights Summary */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400 mb-3">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>Diagnóstico Automático das suas Finanças</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
            <span className="text-slate-400">Onde você mais gasta:</span>
            <div className="font-bold text-slate-900 dark:text-white text-sm">
              {categoryStats[0] ? `${categoryStats[0].name} (${formatCurrency(categoryStats[0].total)})` : 'Nenhum lançamento'}
            </div>
            <p className="text-[11px] text-slate-500">
              {categoryStats[0] && totalExpensePeriod > 0
                ? `Representa ${((categoryStats[0].total / totalExpensePeriod) * 100).toFixed(0)}% de todas as suas despesas.`
                : 'Adicione despesas para identificar.'}
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
            <span className="text-slate-400">Pequenas compras (Gastos invisíveis):</span>
            <div className="font-bold text-amber-600 dark:text-amber-400 text-sm font-mono tabular-nums">
              {formatCurrency(smallPurchasesTotal)}
            </div>
            <p className="text-[11px] text-slate-500">
              Compras de até R$ 25,00 acumuladas que drenam a sobra no fim do mês.
            </p>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl space-y-1">
            <span className="text-slate-400">Comprometimento com dívidas:</span>
            <div className="font-bold text-rose-600 dark:text-rose-400 text-sm font-mono tabular-nums">
              {formatCurrency(totalActiveDebts)}
            </div>
            <p className="text-[11px] text-slate-500">
              {debts.filter(d => d.status !== 'settled').length} compromisso(s) ativo(s) exigindo amortização.
            </p>
          </div>
        </div>
      </div>

      {/* Grid of 10 Mandatory Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GRÁFICO 1: Entradas versus Saídas por Mês */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <div className="min-w-0">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                1. Entradas vs Saídas Mensais
              </h3>
              <p className="text-[11px] text-slate-400">Comparativo do fluxo de caixa nos últimos meses</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] shrink-0">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" /> Entradas
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" /> Saídas
              </span>
            </div>
          </div>

          {/* SVG / Bar Chart */}
          <div className="overflow-x-auto overscroll-x-contain">
            <div className="min-w-[340px] sm:min-w-0 h-56 flex items-end justify-between gap-2 sm:gap-3 pt-6 pb-2 px-2">
              {monthlyTrends.map((m, idx) => {
                const incomeHeight = maxMonthlyVal > 0 ? (m.income / maxMonthlyVal) * 160 : 0;
                const expenseHeight = maxMonthlyVal > 0 ? (m.expense / maxMonthlyVal) * 160 : 0;

                return (
                  <div key={idx} className="flex-1 flex flex-col items-center gap-1.5 h-full justify-end">
                    <div className="flex items-end gap-1 w-full justify-center">
                      <div
                        className="w-3 sm:w-4 bg-emerald-500 rounded-t-sm transition-all hover:opacity-85"
                        style={{ height: `${Math.max(4, incomeHeight)}px` }}
                        title={`Entradas ${m.label}: ${formatCurrency(m.income)}`}
                      />
                      <div
                        className="w-3 sm:w-4 bg-rose-500 rounded-t-sm transition-all hover:opacity-85"
                        style={{ height: `${Math.max(4, expenseHeight)}px` }}
                        title={`Saídas ${m.label}: ${formatCurrency(m.expense)}`}
                      />
                    </div>
                    <span className="text-[10px] font-mono text-slate-400 mt-1">{m.label}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* GRÁFICO 2: Despesas por Categoria (Com DRILLDOWN ao clicar!) */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                2. Despesas por Categoria (Interativo)
              </h3>
              <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium">
                Clique em qualquer categoria para ver os lançamentos
              </p>
            </div>
            <PieIcon className="w-4 h-4 text-slate-400" />
          </div>

          <div className="space-y-2">
            {categoryStats.slice(0, 6).map(cat => {
              const pct = totalExpensePeriod > 0 ? (cat.total / totalExpensePeriod) * 100 : 0;
              return (
                <button
                  key={cat.name}
                  type="button"
                  onClick={() => setSelectedDrilldownCategory(cat.name)}
                  className="w-full group text-left p-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
                >
                  <div className="flex flex-wrap items-center justify-between gap-1.5 text-xs mb-1">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                      <span className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-emerald-600 truncate">
                        {cat.name}
                      </span>
                      <span className="text-[10px] text-slate-400 shrink-0">({cat.count} itens)</span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                        {formatCurrency(cat.total)}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400">
                        {pct.toFixed(0)}%
                      </span>
                      <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-emerald-500" />
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{ width: `${pct}%`, backgroundColor: cat.color }}
                    />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* GRÁFICO 3: Despesas Fixas vs Variáveis */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              3. Despesas Fixas vs Variáveis
            </h3>
            <p className="text-[11px] text-slate-400">Comprometimento de sobrevivência versus estilo de vida</p>
          </div>

          <div className="flex items-center justify-center py-4">
            <div className="w-full max-w-sm space-y-4">
              <div className="flex flex-wrap justify-between gap-2 text-xs font-semibold">
                <span className="text-blue-600 dark:text-blue-400">
                  Fixas: {formatCurrency(totalFixedExpenses)} ({totalExpensePeriod > 0 ? ((totalFixedExpenses / totalExpensePeriod) * 100).toFixed(0) : 0}%)
                </span>
                <span className="text-amber-600 dark:text-amber-400">
                  Variáveis: {formatCurrency(totalVariableExpenses)} ({totalExpensePeriod > 0 ? ((totalVariableExpenses / totalExpensePeriod) * 100).toFixed(0) : 0}%)
                </span>
              </div>
              <div className="h-6 w-full bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden flex shadow-inner">
                <div
                  className="bg-blue-500 h-full transition-all"
                  style={{ width: `${totalExpensePeriod > 0 ? (totalFixedExpenses / totalExpensePeriod) * 100 : 50}%` }}
                />
                <div
                  className="bg-amber-500 h-full transition-all"
                  style={{ width: `${totalExpensePeriod > 0 ? (totalVariableExpenses / totalExpensePeriod) * 100 : 50}%` }}
                />
              </div>
              <p className="text-xs text-slate-500 text-center">
                {totalFixedExpenses > totalVariableExpenses
                  ? 'A maior parte dos seus gastos é fixa. Reduzir custos exige renegociar contratos ou aluguel.'
                  : 'Seus gastos variáveis são predominantes. Há grande margem de economia imediata cortando excessos.'}
              </p>
            </div>
          </div>
        </div>

        {/* GRÁFICO 4: Evolução do Saldo Mensal */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              4. Evolução do Saldo & Sobra Líquida
            </h3>
            <p className="text-[11px] text-slate-400">Capacidade de poupança mês a mês</p>
          </div>

          <div className="overflow-x-auto overscroll-x-contain">
            <div className="min-w-[380px] sm:min-w-0 h-44 flex items-end justify-between gap-3 px-2">
              {monthlyTrends.map((m, idx) => (
                <div key={idx} className="flex-1 flex flex-col items-center justify-end h-full">
                  <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-bold mb-1 whitespace-nowrap">
                    +{formatCurrency(m.saved).replace('R$', '').trim()}
                  </span>
                  <div
                    className="w-full bg-emerald-500/80 dark:bg-emerald-600 rounded-t-lg transition-all"
                    style={{
                      height: `${maxMonthlyVal > 0 ? Math.max(8, (m.saved / maxMonthlyVal) * 110) : 8}px`
                    }}
                  />
                  <span className="text-[10px] font-mono text-slate-400 mt-2">{m.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* GRÁFICO 5: Evolução e Redução das Dívidas */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              5. Evolução da Redução das Dívidas
            </h3>
            <p className="text-[11px] text-slate-400">Saldo devedor total vs Total amortizado</p>
          </div>

          <div className="space-y-3 pt-2">
            {debts.map(d => {
              const paidPct = d.originalAmount > 0 ? ((d.totalPaid || 0) / d.originalAmount) * 100 : 0;
              return (
                <div key={d.id} className="space-y-1">
                  <div className="flex flex-wrap justify-between gap-1 text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-300 truncate min-w-0">{d.name}</span>
                    <span className="font-mono text-rose-600 dark:text-rose-400 tabular-nums font-semibold shrink-0">
                      {formatCurrency(d.currentBalance)} restante
                    </span>
                  </div>
                  <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{ width: `${paidPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* GRÁFICO 6: Percentual da Renda Comprometida */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-3">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              6. Indicador de Capacidade & Comprometimento
            </h3>
            <p className="text-[11px] text-slate-400">Limite prudencial de segurança (Ideal: &lt; 70%)</p>
          </div>

          <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">Nível Atual:</span>
              <span className={`text-xl font-bold font-mono ${incomeCommittedPercent > 70 ? 'text-rose-600' : 'text-emerald-600'}`}>
                {formatPercent(incomeCommittedPercent)}
              </span>
            </div>

            <div className="w-full h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  incomeCommittedPercent > 80 ? 'bg-rose-500' : incomeCommittedPercent > 65 ? 'bg-amber-500' : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, incomeCommittedPercent)}%` }}
              />
            </div>

            <div className="flex justify-between text-[10px] text-slate-400 font-mono">
              <span>0% Seguro</span>
              <span>70% Alerta</span>
              <span>100% Crítico</span>
            </div>
          </div>
        </div>

        {/* GRÁFICO 7: Comparativo Mês Atual vs Mês Anterior */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              7. Comparativo com o Mês Anterior
            </h3>
            <p className="text-[11px] text-slate-400">Variação de gastos nas categorias principais</p>
          </div>

          <div className="space-y-3">
            {categoryStats.slice(0, 4).map(cat => (
              <div key={cat.name} className="flex items-center justify-between text-xs py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                <span className="text-slate-700 dark:text-slate-300 font-medium truncate">{cat.name}</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
                  {formatCurrency(cat.total)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* GRÁFICO 8: Distribuição da Renda */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              8. Composição das Entradas
            </h3>
            <p className="text-[11px] text-slate-400">Renda Principal, Benefícios e Entradas Extras</p>
          </div>

          <div className="space-y-3">
            <div>
              <div className="flex flex-wrap justify-between gap-1 text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300">Renda Principal (Salário)</span>
                <span className="font-mono font-bold tabular-nums">{formatCurrency(incomeDistribution.main)} ({incomeDistribution.mainPct.toFixed(0)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${incomeDistribution.mainPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap justify-between gap-1 text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300">Benefícios & Adicionais</span>
                <span className="font-mono font-bold tabular-nums">{formatCurrency(incomeDistribution.benefits)} ({incomeDistribution.benefitsPct.toFixed(0)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-purple-500 rounded-full" style={{ width: `${incomeDistribution.benefitsPct}%` }} />
              </div>
            </div>

            <div>
              <div className="flex flex-wrap justify-between gap-1 text-xs mb-1">
                <span className="text-slate-600 dark:text-slate-300">Entradas Extras (Freelances / Outros)</span>
                <span className="font-mono font-bold tabular-nums">{formatCurrency(incomeDistribution.extras)} ({incomeDistribution.extrasPct.toFixed(0)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-amber-500 rounded-full" style={{ width: `${incomeDistribution.extrasPct}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* GRÁFICO 9: Gastos com Cartões de Crédito */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              9. Utilização dos Cartões de Crédito
            </h3>
            <p className="text-[11px] text-slate-400">Fatura acumulada versus limite total</p>
          </div>

          <div className="space-y-4">
            {cardSpending.map(({ card, total, usedPct }) => (
              <div key={card.id} className="space-y-1.5">
                <div className="flex flex-wrap justify-between gap-1 text-xs">
                  <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">{card.name}</span>
                  <span className="font-mono tabular-nums text-slate-900 dark:text-white font-bold shrink-0">
                    {formatCurrency(total)} / {formatCurrency(card.limitTotal)}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      usedPct >= 80 ? 'bg-rose-500' : usedPct >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                    }`}
                    style={{ width: `${Math.min(100, usedPct)}%` }}
                  />
                </div>
                <div className="text-[10px] text-slate-400 text-right">
                  {usedPct.toFixed(0)}% do limite utilizado
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* GRÁFICO 10: Ranking das Categorias com Maiores Gastos */}
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="mb-4">
            <h3 className="font-bold text-slate-900 dark:text-white text-sm">
              10. Ranking de Maiores Despesas
            </h3>
            <p className="text-[11px] text-slate-400">Categorias que mais consomem seu orçamento</p>
          </div>

          <div className="space-y-2">
            {categoryStats.slice(0, 5).map((cat, idx) => (
              <div key={cat.name} className="flex items-center justify-between gap-2 text-xs p-2 rounded-xl bg-slate-50 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-[10px] flex items-center justify-center shrink-0">
                    {idx + 1}
                  </span>
                  <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                </div>
                <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                  {formatCurrency(cat.total)}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Drilldown Modal (When user clicks any category in Chart 2) */}
      <ResponsiveModal
        isOpen={!!selectedDrilldownCategory}
        onClose={() => setSelectedDrilldownCategory(null)}
        title={`Lançamentos em "${selectedDrilldownCategory || ''}"`}
        subtitle={`${drilldownTransactions.length} movimentação(ões) encontrada(s)`}
        size="lg"
        bodyClassName="divide-y divide-slate-100 dark:divide-slate-800 text-xs space-y-0"
        footer={
          <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
            <span className="text-slate-500 font-medium">Total Acumulado na Categoria:</span>
            <span className="font-mono font-bold text-slate-900 dark:text-white text-sm">
              {formatCurrency(drilldownTransactions.reduce((sum, t) => sum + t.amount, 0))}
            </span>
          </div>
        }
      >
        {drilldownTransactions.length === 0 ? (
          <div className="text-center py-8 text-slate-400">Nenhum lançamento nesta categoria.</div>
        ) : (
          drilldownTransactions.map(t => (
            <div key={t.id} className="py-2.5 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-semibold text-slate-900 dark:text-white truncate">{t.description}</span>
                  {isVirtualTransaction(t) && (
                    <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-semibold shrink-0">
                      Previsto
                    </span>
                  )}
                </div>
                <div className="text-[11px] text-slate-400">
                  {formatDateBR(getTransactionEffectiveDate(t))} · {t.paymentMethod}
                </div>
              </div>
              <div className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums shrink-0">
                {formatCurrency(t.amount)}
              </div>
            </div>
          ))
        )}
      </ResponsiveModal>
    </div>
  );
};
