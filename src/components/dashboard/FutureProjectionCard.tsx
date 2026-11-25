/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Sparkles,
  Calendar,
  AlertCircle,
  TrendingDown,
  TrendingUp,
  CreditCard,
  Layers,
  ChevronRight,
  ShieldCheck,
  ChevronDown,
  Clock,
  ArrowRight
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR } from '../../utils/formatters';
import { MonthProjection } from '../../types/finance';

interface FutureProjectionCardProps {
  onOpen12MonthProjection?: () => void;
}

export const FutureProjectionCard: React.FC<FutureProjectionCardProps> = ({ onOpen12MonthProjection }) => {
  const {
    nextMonthsProjections,
    currentSelectedMonthProjection,
    periodProjectionSummary,
    activePeriod,
    isFutureView,
    selectSpecificMonth,
    goToCurrentMonth
  } = useFinance();

  const [expandedMonth, setExpandedMonth] = useState<number | null>(null);

  // The very next month projection (Month 1 ahead)
  const nextMonth = nextMonthsProjections[0];
  const isMultiMonthProjection = Boolean(activePeriod?.isMultiMonth && activePeriod?.includesFuture);
  const activeBannerProjection = isMultiMonthProjection
    ? (periodProjectionSummary ?? currentSelectedMonthProjection)
    : currentSelectedMonthProjection;

  return (
    <div className="space-y-4">
      {/* Active Future Month or Multi-Month Projection Alert Banner */}
      {(isFutureView || isMultiMonthProjection) && (
        <div className="p-4 bg-emerald-500/10 dark:bg-emerald-950/30 border border-emerald-500/30 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-emerald-600 text-white rounded-xl shadow-xs">
              <Sparkles className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white text-sm">
                Visualizando Projeção Futura: {activeBannerProjection.label}
              </div>
              <div className="text-slate-600 dark:text-slate-300 mt-0.5">
                Você estará devendo <strong className="text-rose-600 dark:text-rose-400 font-mono tabular-nums">{formatCurrency(activeBannerProjection.totalOwedTotal)}</strong> em compromissos programados {isMultiMonthProjection ? 'neste intervalo.' : 'para este mês.'}
              </div>
            </div>
          </div>

          <button
            onClick={goToCurrentMonth}
            className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold rounded-xl transition-all shadow-xs shrink-0"
          >
            Voltar ao Mês Atual
          </button>
        </div>
      )}

      {/* Hero Projeção Próximo Mês: "O quanto estarei devendo no próximo mês" */}
      {nextMonth && (
        <div className="p-5 sm:p-6 bg-gradient-to-br from-slate-900 via-slate-850 to-slate-800 text-white rounded-3xl shadow-lg border border-slate-700/60 relative overflow-hidden">
          <div className="relative z-10">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-3">
              <div className="flex items-center gap-2">
                <span className="p-1 rounded-md bg-emerald-500/20 text-emerald-400">
                  <Sparkles className="w-3.5 h-3.5" />
                </span>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  Projeção do Próximo Mês ({nextMonth.label})
                </span>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-400 hidden sm:inline">
                  Alinhado automaticamente ao calendário
                </span>
                {onOpen12MonthProjection && (
                  <button
                    onClick={onOpen12MonthProjection}
                    className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium flex items-center gap-1.5 transition-all"
                  >
                    <span>Ver Gráfico 12 Meses</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 my-4">
              {/* Box 1: Quanto estará devendo */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xs">
                <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 text-rose-400" />
                  Quanto Estará Devendo (A Pagar)
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-rose-400 tabular-nums mt-1">
                  {formatCurrency(nextMonth.totalOwedTotal)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  {nextMonth.commitments.length} compromisso(s) a quitar no mês
                </div>
              </div>

              {/* Box 2: Renda Prevista */}
              <div className="p-4 bg-white/5 rounded-2xl border border-white/10 backdrop-blur-xs">
                <span className="text-xs text-slate-300 font-medium flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                  Renda Prevista (Entradas)
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 tabular-nums mt-1">
                  {formatCurrency(nextMonth.totalIncomeProjected)}
                </div>
                <div className="text-[11px] text-slate-400 mt-1">
                  Salário e benefícios recorrentes
                </div>
              </div>

              {/* Box 3: Saldo Livre Projetado */}
              <div className="p-4 bg-emerald-500/10 rounded-2xl border border-emerald-500/30 backdrop-blur-xs">
                <span className="text-xs text-emerald-300 font-medium flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Saldo Livre Projetado (Sobra)
                </span>
                <div className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-300 tabular-nums mt-1">
                  {formatCurrency(nextMonth.projectedFreeBalance)}
                </div>
                <div className="text-[11px] text-emerald-400/80 mt-1">
                  Após pagar todas as contas e dívidas
                </div>
              </div>
            </div>

            {/* Breakdown Pills */}
            <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-white/10 text-xs">
              <span className="text-slate-400">Composição do que estará devendo:</span>
              <span className="px-2.5 py-1 bg-white/10 rounded-lg font-mono">
                Fixas Recorrentes: {formatCurrency(nextMonth.fixedExpensesProjected)}
              </span>
              <span className="px-2.5 py-1 bg-white/10 rounded-lg font-mono">
                Parcelas no Cartão: {formatCurrency(nextMonth.cardInstallmentsProjected)}
              </span>
              <span className="px-2.5 py-1 bg-white/10 rounded-lg font-mono">
                Parcelas de Dívidas: {formatCurrency(nextMonth.debtsProjected)}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Projeção Semestral: Próximos 6 Meses Lado a Lado */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Projeção dos Próximos Meses: Quanto Você Estará Devendo</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Planejamento mês a mês para você nunca ser surpreendido por contas futuras
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
          {nextMonthsProjections.map((proj, idx) => {
            const isExpanded = expandedMonth === idx;

            return (
              <div
                key={proj.label}
                className="p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 hover:border-emerald-500/60 transition-all flex flex-col justify-between min-w-0"
              >
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-1.5 mb-2">
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      {proj.label}
                    </span>
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 shrink-0">
                      {idx === 0 ? 'Próximo Mês' : `Em ${idx + 1} meses`}
                    </span>
                  </div>

                  {/* Valor Total a Pagar / Devendo */}
                  <div className="p-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/60 dark:border-slate-800 mb-3">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                      Total a Pagar / Devendo:
                    </div>
                    <div className="text-lg font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
                      {formatCurrency(proj.totalOwedTotal)}
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 mt-1 pt-1 border-t border-slate-100 dark:border-slate-800">
                      <span>Receita Prevista:</span>
                      <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatCurrency(proj.totalIncomeProjected)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[11px] text-slate-500 pt-0.5">
                      <span>Sobra Estimada:</span>
                      <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                        {formatCurrency(proj.projectedFreeBalance)}
                      </span>
                    </div>
                  </div>

                  {/* Summary of Items */}
                  <div className="text-[11px] text-slate-500 space-y-1 mb-2">
                    <div className="flex justify-between">
                      <span>Contas Fixas:</span>
                      <span className="font-mono">{formatCurrency(proj.fixedExpensesProjected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Parcelas de Cartão:</span>
                      <span className="font-mono">{formatCurrency(proj.cardInstallmentsProjected)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Parcelas de Dívidas:</span>
                      <span className="font-mono">{formatCurrency(proj.debtsProjected)}</span>
                    </div>
                  </div>

                  {/* Expand/Collapse Breakdown */}
                  {isExpanded && (
                    <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-1.5 text-[10px] animate-in fade-in max-h-40 overflow-y-auto">
                      <span className="font-bold text-slate-700 dark:text-slate-300 block">
                        Contas Programadas:
                      </span>
                      {proj.commitments.map(c => (
                        <div key={c.id} className="flex items-center justify-between gap-2 text-slate-600 dark:text-slate-400 py-0.5 border-b border-slate-100 dark:border-slate-800/60 last:border-0">
                          <span className="truncate min-w-0 flex-1">{c.description}</span>
                          <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums shrink-0">
                            {formatCurrency(c.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="pt-3 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-xs mt-2">
                  <button
                    type="button"
                    onClick={() => setExpandedMonth(isExpanded ? null : idx)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium flex items-center gap-1"
                  >
                    <span>{isExpanded ? 'Ocultar contas' : 'Ver contas'}</span>
                    <ChevronDown className={`w-3 h-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={() => selectSpecificMonth(proj.year, proj.month)}
                    className="text-emerald-600 dark:text-emerald-400 font-semibold hover:underline flex items-center gap-1"
                  >
                    <span>Abrir Mês</span>
                    <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
