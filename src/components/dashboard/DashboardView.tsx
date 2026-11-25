/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  Zap,
  TrendingUp,
  CreditCard,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  ArrowRight,
  Shield,
  Layers,
  Sparkles,
  Plus,
  PiggyBank,
  Receipt
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, formatPercent, MONTH_NAMES_PT } from '../../utils/formatters';

import { FutureProjectionCard } from './FutureProjectionCard';
import { TwelveMonthProjectionSection } from './TwelveMonthProjectionSection';

interface DashboardViewProps {
  setCurrentTab: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({ setCurrentTab }) => {
  const [dashboardTab, setDashboardTab] = useState<'overview' | 'projections12m'>('overview');

  const {
    totalBankBalance,
    totalIncomePeriod,
    totalExpensePeriod,
    totalFixedExpenses,
    totalVariableExpenses,
    totalActiveDebts,
    freeMoneyAvailable,
    incomeCommittedPercent,
    totalSavedPeriod,
    remainingSafeToSpend,
    accounts,
    creditCards,
    filteredTransactions,
    smartAlerts,
    openQuickEntry,
    debts,
    selectedMonth,
    selectedYear,
    isFutureView
  } = useFinance();

  const recentTransactions = filteredTransactions.slice(0, 5);
  const monthName = MONTH_NAMES_PT[selectedMonth] || 'Mês Atual';

  return (
    <div className="space-y-6">
      {/* =========================================================================
          HERO PRINCIPAL DO DASHBOARD (Aparece em primeiro lugar com máxima clareza)
         ========================================================================= */}
      <section aria-label="Hero do Dashboard" className="space-y-4">
        {/* Barra Executiva de Abertura & Ações Rápidas */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 sm:p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 dark:from-slate-900 dark:via-slate-850 dark:to-slate-900 text-white rounded-3xl border border-slate-800 shadow-lg relative overflow-hidden">
          {/* Luz ambiente de fundo sutil */}
          <div className="absolute -top-12 -right-12 w-48 h-48 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-10 left-1/3 w-40 h-40 bg-blue-500/10 rounded-full blur-2xl pointer-events-none" />

          <div className="relative z-10 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                <Calendar className="w-3 h-3 text-emerald-400" />
                <span>{monthName} {selectedYear}</span>
                {isFutureView && <span className="opacity-80">(Visão Futura)</span>}
              </span>
              <span className="text-slate-400 text-xs hidden md:inline">
                · Atualizado em tempo real
              </span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight leading-tight">
              Visão Geral do Dashboard
            </h1>
            <p className="text-xs text-slate-300 mt-0.5">
              Acompanhamento financeiro, patrimônio consolidado e poder de compra.
            </p>
          </div>

          {/* Botões de Ação Imediata na Hero */}
          <div className="relative z-10 flex items-center gap-2 flex-wrap sm:flex-nowrap shrink-0">
            <button
              type="button"
              onClick={() => openQuickEntry('expense')}
              className="py-2 px-3.5 bg-rose-600/90 hover:bg-rose-600 active:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Despesa</span>
            </button>

            <button
              type="button"
              onClick={() => openQuickEntry('income')}
              className="py-2 px-3.5 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Receita</span>
            </button>

            <button
              type="button"
              onClick={() => setCurrentTab('power-of-purchase')}
              className="py-2 px-3.5 bg-slate-800 hover:bg-slate-700 active:bg-slate-750 text-emerald-300 border border-slate-700 hover:border-emerald-500/40 text-xs font-semibold rounded-xl transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Simular Poder de Compra</span>
              <span className="sm:hidden">Simulador</span>
            </button>
          </div>
        </div>

        {/* Triad Destaque da Hero: Saldo Total + Dinheiro Livre + Resultado Líquido */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
          {/* Destaque 1: Saldo Consolidado */}
          <div
            onClick={() => setCurrentTab('accounts')}
            className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <Wallet className="w-4 h-4 text-slate-500" />
                <span>Patrimônio Líquido em Contas</span>
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                <span className="hidden sm:inline">Gerenciar contas</span>
                <ArrowRight className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5" />
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
              {formatCurrency(totalBankBalance)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Distribuído em <strong>{accounts.length}</strong> contas e carteiras
            </div>
          </div>

          {/* Destaque 2: Dinheiro Livre (Poder de Compra Real) */}
          <div
            onClick={() => setCurrentTab('power-of-purchase')}
            className="p-4 sm:p-5 bg-emerald-50/70 dark:bg-emerald-950/25 rounded-2xl border border-emerald-300/80 dark:border-emerald-800/80 shadow-xs hover:border-emerald-400 dark:hover:border-emerald-700 transition-all cursor-pointer group relative overflow-hidden"
          >
            <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-bold mb-1">
              <span className="flex items-center gap-1.5">
                <Zap className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                <span>Dinheiro Livre Imediato</span>
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-600 text-white shadow-xs">
                PODER REAL
              </span>
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-700 dark:text-emerald-300 tabular-nums tracking-tight">
              {formatCurrency(freeMoneyAvailable)}
            </div>
            <div className="text-[11px] text-emerald-800/80 dark:text-emerald-400/80 mt-1 truncate font-medium">
              Livre de contas fixas, faturas e parcelas
            </div>
          </div>

          {/* Destaque 3: Balanço do Mês Atual (Economias) */}
          <div
            onClick={() => setCurrentTab('analytics')}
            className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-blue-500" />
                <span>Resultado Líquido do Mês</span>
              </span>
              <span className={`text-[11px] font-bold font-mono ${totalSavedPeriod >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                {totalIncomePeriod > 0 ? formatPercent(((totalIncomePeriod - totalExpensePeriod) / totalIncomePeriod) * 100) : '0%'} margem
              </span>
            </div>
            <div className={`text-2xl sm:text-3xl font-extrabold font-mono tabular-nums tracking-tight ${
              totalSavedPeriod >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
            }`}>
              {totalSavedPeriod >= 0 ? '+' : ''}{formatCurrency(totalSavedPeriod)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate flex items-center gap-1.5">
              <span className="text-emerald-600 font-semibold font-mono">+{formatCurrency(totalIncomePeriod)}</span>
              <span>·</span>
              <span className="text-rose-600 font-semibold font-mono">-{formatCurrency(totalExpensePeriod)}</span>
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          OS 10 CARDS DE INDICADORES (KPIs) - Reorganizados logo no topo da tela
         ========================================================================= */}
      <section aria-label="Indicadores Financeiros Principais">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3 px-1">
          <div className="flex flex-wrap items-center gap-2 min-w-0">
            <h2 className="font-bold text-slate-900 dark:text-white uppercase tracking-wider text-[11px]">
              Indicadores Financeiros Essenciais (10 KPIs)
            </h2>
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 font-medium">
              Clique em qualquer card para detalhar
            </span>
          </div>

          <button
            type="button"
            onClick={() => setCurrentTab('analytics')}
            className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline font-semibold flex items-center gap-1 self-start sm:self-auto shrink-0 cursor-pointer"
          >
            <span>Ver Gráficos & Relatórios</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>

        {/* Grid de 10 KPIs Responsivo: 1 col em 320px, 2 col em >=380px, 3 no tablet e 5 no desktop */}
        <div className="grid grid-cols-1 min-[380px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-3.5">
          {/* Card 1: Saldo Atual Total */}
          <div
            onClick={() => setCurrentTab('accounts')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">1. Saldo Total</span>
              <Wallet className="w-3.5 h-3.5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
              {formatCurrency(totalBankBalance)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              {accounts.length} contas cadastradas
            </div>
          </div>

          {/* Card 2: Total de Entradas */}
          <div
            onClick={() => setCurrentTab('incomes')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">2. Entradas</span>
              <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
              {formatCurrency(totalIncomePeriod)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Receitas do período
            </div>
          </div>

          {/* Card 3: Total de Despesas */}
          <div
            onClick={() => setCurrentTab('expenses')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-rose-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">3. Despesas</span>
              <ArrowDownRight className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums tracking-tight">
              {formatCurrency(totalExpensePeriod)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Fixas + Variáveis
            </div>
          </div>

          {/* Card 4: Despesas Fixas */}
          <div
            onClick={() => setCurrentTab('expenses')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">4. Despesas Fixas</span>
              <Layers className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-slate-800 dark:text-slate-200 tabular-nums tracking-tight">
              {formatCurrency(totalFixedExpenses)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              {totalIncomePeriod > 0 ? formatPercent((totalFixedExpenses / totalIncomePeriod) * 100) : '0%'} da renda
            </div>
          </div>

          {/* Card 5: Despesas Variáveis */}
          <div
            onClick={() => setCurrentTab('expenses')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-amber-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">5. Variáveis</span>
              <TrendingUp className="w-3.5 h-3.5 text-amber-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-slate-800 dark:text-slate-200 tabular-nums tracking-tight">
              {formatCurrency(totalVariableExpenses)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Consumo discricionário
            </div>
          </div>

          {/* Card 6: Dívidas Totais */}
          <div
            onClick={() => setCurrentTab('debts')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-rose-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">6. Dívidas Totais</span>
              <AlertCircle className="w-3.5 h-3.5 text-rose-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums tracking-tight">
              {formatCurrency(totalActiveDebts)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              {debts.filter(d => d.status !== 'settled').length} pendência(s) ativa(s)
            </div>
          </div>

          {/* Card 7: Dinheiro Livre Disponível (PODER DE COMPRA) */}
          <div
            onClick={() => setCurrentTab('power-of-purchase')}
            className="p-3.5 sm:p-4 bg-emerald-50/70 dark:bg-emerald-950/25 rounded-2xl border border-emerald-300/80 dark:border-emerald-800/80 shadow-xs hover:border-emerald-500 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-emerald-800 dark:text-emerald-300 font-bold mb-1">
              <span>7. Dinheiro Livre</span>
              <Zap className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-emerald-700 dark:text-emerald-300 tabular-nums tracking-tight">
              {formatCurrency(freeMoneyAvailable)}
            </div>
            <div className="text-[11px] text-emerald-700/80 dark:text-emerald-400/80 mt-1 truncate font-medium">
              Sem comprometer contas
            </div>
          </div>

          {/* Card 8: % Renda Comprometida */}
          <div
            onClick={() => setCurrentTab('analytics')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">8. Comprometida</span>
              <span className={`text-xs font-bold font-mono ${incomeCommittedPercent > 70 ? 'text-rose-600' : 'text-slate-700 dark:text-slate-300'}`}>
                {formatPercent(incomeCommittedPercent)}
              </span>
            </div>
            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
              <div
                className={`h-full transition-all ${
                  incomeCommittedPercent > 80
                    ? 'bg-rose-500'
                    : incomeCommittedPercent > 60
                    ? 'bg-amber-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, incomeCommittedPercent)}%` }}
              />
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-2 truncate">
              {incomeCommittedPercent <= 70 ? 'Dentro do limite seguro' : 'Atenção aos limites'}
            </div>
          </div>

          {/* Card 9: Economias do Período */}
          <div
            onClick={() => setCurrentTab('analytics')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-emerald-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">9. Economias</span>
              <PiggyBank className="w-3.5 h-3.5 text-emerald-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums tracking-tight">
              {formatCurrency(totalSavedPeriod)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Sobra líquida do período
            </div>
          </div>

          {/* Card 10: Teto Seguro / Quanto Ainda Posso Gastar */}
          <div
            onClick={() => setCurrentTab('power-of-purchase')}
            className="p-3.5 sm:p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs hover:border-blue-500/40 hover:shadow-sm transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium mb-1">
              <span className="font-semibold text-slate-700 dark:text-slate-300">10. Posso Gastar</span>
              <CheckCircle2 className="w-3.5 h-3.5 text-blue-500 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-base sm:text-lg lg:text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums tracking-tight">
              {formatCurrency(remainingSafeToSpend)}
            </div>
            <div className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 truncate">
              Teto seguro até o fim do mês
            </div>
          </div>
        </div>
      </section>

      {/* =========================================================================
          ALERTAS INTELIGENTES DO SISTEMA (Posicionados logo abaixo dos KPIs)
         ========================================================================= */}
      {smartAlerts.length > 0 && (
        <section aria-label="Alertas do Sistema" className="space-y-2">
          {smartAlerts.slice(0, 2).map(alert => (
            <div
              key={alert.id}
              className={`flex items-center justify-between p-3.5 rounded-2xl border text-xs sm:text-sm shadow-xs ${
                alert.type === 'danger'
                  ? 'bg-rose-50/90 dark:bg-rose-950/35 border-rose-200 dark:border-rose-900 text-rose-900 dark:text-rose-200'
                  : alert.type === 'warning'
                  ? 'bg-amber-50/90 dark:bg-amber-950/35 border-amber-200 dark:border-amber-900 text-amber-900 dark:text-amber-200'
                  : 'bg-blue-50/90 dark:bg-blue-950/35 border-blue-200 dark:border-blue-900 text-blue-900 dark:text-blue-200'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <AlertTriangle className="w-4 h-4 shrink-0 text-amber-600 dark:text-amber-400" />
                <div className="truncate">
                  <span className="font-bold">{alert.title}: </span>
                  <span className="opacity-90">{alert.message}</span>
                </div>
              </div>
              {alert.metric && (
                <span className="font-mono font-bold px-2.5 py-0.5 rounded-lg bg-white/80 dark:bg-black/30 shrink-0 ml-2 shadow-xs">
                  {alert.metric}
                </span>
              )}
            </div>
          ))}
        </section>
      )}

      {/* =========================================================================
          SUB-TAB NAVIGATION: Visão Geral Operacional vs Projeção 12 Meses
         ========================================================================= */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="flex flex-col min-[480px]:flex-row flex-wrap items-stretch min-[480px]:items-center gap-1.5">
          <button
            onClick={() => setDashboardTab('overview')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex items-center justify-center min-[480px]:justify-start gap-2 cursor-pointer ${
              dashboardTab === 'overview'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Layers className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Visão Operacional & Fluxo</span>
          </button>

          <button
            onClick={() => setDashboardTab('projections12m')}
            className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all flex flex-wrap items-center justify-center min-[480px]:justify-start gap-2 cursor-pointer ${
              dashboardTab === 'projections12m'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Projeção Futura (12 Meses)</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              Gráficos & Saldos
            </span>
          </button>
        </div>

        {dashboardTab === 'overview' ? (
          <button
            onClick={() => setDashboardTab('projections12m')}
            className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1 px-3 py-1 self-start sm:self-auto shrink-0 cursor-pointer"
          >
            <span>Ver projeção estendida de 12 meses</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        ) : (
          <button
            onClick={() => setDashboardTab('overview')}
            className="text-xs text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 font-semibold flex items-center gap-1 px-3 py-1 self-start sm:self-auto shrink-0 cursor-pointer"
          >
            <span>← Voltar para Visão Operacional</span>
          </button>
        )}
      </div>

      {/* =========================================================================
          CONTEÚDO DINÂMICO CONFORME A SUB-TAB SELECIONADA
         ========================================================================= */}
      {dashboardTab === 'projections12m' ? (
        <TwelveMonthProjectionSection />
      ) : (
        <>
          {/* Card de Projeção dos Próximos Meses: "O quanto estarei devendo no próximo mês" */}
          <FutureProjectionCard onOpen12MonthProjection={() => setDashboardTab('projections12m')} />

          {/* Grid Principal: Fluxo Visual + Lançamentos Recentes + Contas & Simulador */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Coluna Esquerda (2 colunas em telas grandes): Balanço Visual & Extrato */}
            <div className="lg:col-span-2 space-y-6">
              {/* Balanço Consolidado do Período */}
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="min-w-0">
                    <h3 className="font-bold text-slate-900 dark:text-white text-base">
                      Balanço Consolidado do Período
                    </h3>
                    <p className="text-xs text-slate-500">
                      Fluxo de caixa entre receitas recebidas e despesas em aberto
                    </p>
                  </div>
                  <button
                    onClick={() => setCurrentTab('analytics')}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <span>Ver todos os gráficos</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {/* Barras de Comparação Visual */}
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300">Receitas / Entradas (100%)</span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(totalIncomePeriod)}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full w-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-medium mb-1.5">
                      <span className="text-slate-600 dark:text-slate-300">
                        Despesas Totais ({totalIncomePeriod > 0 ? ((totalExpensePeriod / totalIncomePeriod) * 100).toFixed(0) : 0}%)
                      </span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {formatCurrency(totalExpensePeriod)}
                      </span>
                    </div>
                    <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                      <div
                        className="h-full bg-blue-500"
                        style={{ width: `${totalIncomePeriod > 0 ? (totalFixedExpenses / totalIncomePeriod) * 100 : 0}%` }}
                        title={`Fixas: ${formatCurrency(totalFixedExpenses)}`}
                      />
                      <div
                        className="h-full bg-amber-500"
                        style={{ width: `${totalIncomePeriod > 0 ? (totalVariableExpenses / totalIncomePeriod) * 100 : 0}%` }}
                        title={`Variáveis: ${formatCurrency(totalVariableExpenses)}`}
                      />
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-[11px] text-slate-500">
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 inline-block" />
                        Fixas: <strong>{formatCurrency(totalFixedExpenses)}</strong>
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="w-2.5 h-2.5 rounded-xs bg-amber-500 inline-block" />
                        Variáveis: <strong>{formatCurrency(totalVariableExpenses)}</strong>
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tabela de Últimos Lançamentos */}
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <Receipt className="w-4 h-4 text-slate-500 shrink-0" />
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 dark:text-white text-base">
                        Últimos Lançamentos
                      </h3>
                      <p className="text-xs text-slate-500">
                        Movimentações financeiras mais recentes
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCurrentTab('transactions')}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <span>Extrato completo</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>

                {recentTransactions.length === 0 ? (
                  <div className="text-center py-8 text-xs text-slate-400">
                    Nenhum lançamento encontrado para o período selecionado.
                  </div>
                ) : (
                  <div className="divide-y divide-slate-100 dark:divide-slate-800">
                    {recentTransactions.map(tx => {
                      const isIncome = tx.type === 'income';
                      return (
                        <div key={tx.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div
                              className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${
                                isIncome
                                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                                  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                              }`}
                            >
                              {isIncome ? <ArrowUpRight className="w-4 h-4" /> : <ArrowDownRight className="w-4 h-4" />}
                            </div>
                            <div className="min-w-0">
                              <div className="font-semibold text-slate-900 dark:text-slate-100 truncate">
                                {tx.description}
                              </div>
                              <div className="text-[11px] text-slate-400 truncate">
                                {tx.category} · {formatDateBR(tx.date)}
                              </div>
                            </div>
                          </div>

                          <div className="text-right shrink-0">
                            <div
                              className={`font-mono font-bold tabular-nums ${
                                isIncome ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
                              }`}
                            >
                              {isIncome ? '+' : '-'} {formatCurrency(tx.amount)}
                            </div>
                            <span
                              className={`text-[10px] font-semibold ${
                                tx.status === 'paid' ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {tx.status === 'paid' ? 'Pago' : 'Pendente'}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Coluna Direita (1 coluna em telas grandes): Contas, Cartões & Atalho do Simulador */}
            <div className="space-y-6">
              {/* Bloco do Simulador de Poder de Compra */}
              <div className="p-5 bg-gradient-to-br from-slate-900 to-slate-800 text-white rounded-3xl shadow-md border border-slate-800 relative overflow-hidden">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-semibold mb-2">
                  <Zap className="w-4 h-4" />
                  <span>Simulador de Compra</span>
                </div>
                <h4 className="text-base font-bold mb-1">
                  Quer comprar algo hoje?
                </h4>
                <p className="text-xs text-slate-300 mb-4 leading-relaxed">
                  Consulte seu poder de compra em tempo real antes de parcelar no cartão ou fazer um PIX.
                </p>
                <button
                  onClick={() => setCurrentTab('power-of-purchase')}
                  className="w-full py-2.5 px-4 bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600 text-slate-950 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Abrir Simulador de Poder de Compra</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>

              {/* Contas Bancárias & Cartões de Crédito */}
              <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                    Minhas Contas & Carteiras
                  </h4>
                  <button
                    type="button"
                    onClick={() => setCurrentTab('accounts')}
                    className="text-xs text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer font-semibold shrink-0"
                  >
                    Gerenciar
                  </button>
                </div>
                <div className="space-y-2">
                  {accounts.map(acc => (
                    <div key={acc.id} className="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-2.5 h-2.5 rounded-full shrink-0 shadow-xs" style={{ backgroundColor: acc.color }} />
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{acc.name}</span>
                      </div>
                      <span className="font-mono font-semibold text-slate-900 dark:text-white tabular-nums shrink-0">
                        {formatCurrency(acc.balance)}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <h4 className="font-bold text-slate-900 dark:text-white text-sm">
                      Cartões de Crédito
                    </h4>
                    <button
                      onClick={() => setCurrentTab('cards')}
                      className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold cursor-pointer shrink-0"
                    >
                      Faturas
                    </button>
                  </div>
                  <div className="space-y-2">
                    {creditCards.map(card => (
                      <div key={card.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs">
                        <div className="flex flex-wrap items-center justify-between gap-1 font-medium text-slate-800 dark:text-slate-200">
                          <span className="truncate">{card.name}</span>
                          <span className="font-mono text-slate-500 tabular-nums shrink-0">Limite: {formatCurrency(card.limitTotal)}</span>
                        </div>
                        <div className="text-[11px] text-slate-400 mt-1">
                          Fecha dia {card.closingDay} · Vence dia {card.dueDay}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
