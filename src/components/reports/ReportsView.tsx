/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Download,
  Calendar,
  CheckCircle,
  Shield,
  Layers,
  Sparkles
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { exportToExcel, exportToPDF } from '../../utils/exportUtils';
import { getMonthNamePT } from '../../utils/formatters';

export const ReportsView: React.FC = () => {
  const {
    transactions,
    accounts,
    creditCards,
    debts,
    goals,
    totalBankBalance,
    totalIncomePeriod,
    totalExpensePeriod,
    totalFixedExpenses,
    totalVariableExpenses,
    totalActiveDebts,
    freeMoneyAvailable,
    incomeCommittedPercent,
    totalSavedPeriod,
    filteredTransactions,
    filter
  } = useFinance();

  const [exportScope, setExportScope] = useState<'current_filter' | 'all_history'>('current_filter');
  const [downloadSuccess, setDownloadSuccess] = useState<string | null>(null);

  const getScopeLabel = () => {
    if (exportScope === 'all_history') return 'Todo o Histórico';
    switch (filter.period) {
      case 'current_month': return 'Mês Atual';
      case 'previous_month': return 'Mês Anterior';
      case 'last_3_months': return 'Últimos 3 Meses';
      case 'last_6_months': return 'Últimos 6 Meses';
      case 'last_12_months': return 'Últimos 12 Meses';
      default: return 'Período Filtrado';
    }
  };

  const handleExportExcel = () => {
    const txsToExport = exportScope === 'all_history' ? transactions : filteredTransactions;
    exportToExcel({
      periodLabel: getScopeLabel(),
      transactions: txsToExport,
      accounts,
      creditCards,
      debts,
      goals,
      kpis: {
        totalBankBalance,
        totalIncome: totalIncomePeriod,
        totalExpense: totalExpensePeriod,
        fixedExpense: totalFixedExpenses,
        variableExpense: totalVariableExpenses,
        activeDebts: totalActiveDebts,
        freeMoney: freeMoneyAvailable,
        committedPercent: incomeCommittedPercent,
        savedAmount: totalSavedPeriod
      }
    });

    setDownloadSuccess('Planilha Excel (.xlsx) gerada com sucesso com as 9 abas completas!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  const handleExportPDF = () => {
    const txsToExport = exportScope === 'all_history' ? transactions : filteredTransactions;
    exportToPDF({
      periodLabel: getScopeLabel(),
      transactions: txsToExport,
      accounts,
      creditCards,
      debts,
      goals,
      kpis: {
        totalBankBalance,
        totalIncome: totalIncomePeriod,
        totalExpense: totalExpensePeriod,
        fixedExpense: totalFixedExpenses,
        variableExpense: totalVariableExpenses,
        activeDebts: totalActiveDebts,
        freeMoney: freeMoneyAvailable,
        committedPercent: incomeCommittedPercent,
        savedAmount: totalSavedPeriod
      }
    });

    setDownloadSuccess('Relatório PDF profissional gerado com sucesso!');
    setTimeout(() => setDownloadSuccess(null), 4000);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <FileSpreadsheet className="w-5 h-5 text-emerald-500" />
          Relatórios & Exportações
        </h2>
        <p className="text-xs text-slate-500">
          Exporte seus dados em planilhas Excel (.xlsx) estruturadas em 9 abas ou em relatórios executivos PDF
        </p>
      </div>

      {downloadSuccess && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 rounded-2xl flex items-center gap-3 text-xs text-emerald-900 dark:text-emerald-200 animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-600 shrink-0" />
          <span className="font-semibold">{downloadSuccess}</span>
        </div>
      )}

      {/* Scope Selector */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
          Selecione a abrangência dos dados a exportar:
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => setExportScope('current_filter')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              exportScope === 'current_filter'
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-900 dark:text-white font-semibold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
            }`}
          >
            <div className="text-xs">Período Selecionado no Dashboard</div>
            <div className="text-[11px] text-slate-400 font-normal mt-0.5">
              Filtro ativo: <span className="font-semibold text-emerald-600 dark:text-emerald-400">{getScopeLabel()}</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => setExportScope('all_history')}
            className={`p-3.5 rounded-xl border text-left transition-all ${
              exportScope === 'all_history'
                ? 'border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 text-slate-900 dark:text-white font-semibold shadow-xs'
                : 'border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/40 text-slate-600 dark:text-slate-400'
            }`}
          >
            <div className="text-xs">Histórico Completo (Todos os Anos)</div>
            <div className="text-[11px] text-slate-400 font-normal mt-0.5">
              Exportar todas as {transactions.length} movimentações já registradas
            </div>
          </button>
        </div>
      </div>

      {/* Export Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Excel Export Card */}
        <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400 flex items-center justify-center">
              <FileSpreadsheet className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Exportar para Excel (.xlsx)
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Gera uma pasta de trabalho organizada contendo 9 abas completas com todos os seus dados:
              </p>
            </div>

            <div className="grid grid-cols-1 min-[420px]:grid-cols-2 gap-1.5 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
              <span>1. Dashboard e Resumo</span>
              <span>2. Entradas</span>
              <span>3. Despesas</span>
              <span>4. Despesas Fixas</span>
              <span>5. Despesas Variáveis</span>
              <span>6. Dívidas & Pendências</span>
              <span>7. Cartões e Faturas</span>
              <span>8. Objetivos Financeiros</span>
              <span>9. Histórico Geral</span>
            </div>
          </div>

          <button
            onClick={handleExportExcel}
            className="w-full min-h-[44px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer text-center"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Baixar Planilha Excel Completa (.xlsx)</span>
          </button>
        </div>

        {/* PDF Export Card */}
        <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between space-y-5">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400 flex items-center justify-center">
              <FileText className="w-5 h-5" />
            </div>

            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Exportar Relatório Executivo em PDF
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                Documento formatado pronto para impressão ou arquivamento mensal:
              </p>
            </div>

            <div className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 font-medium">
              <div>· Resumo consolidado de receitas, despesas e poder de compra</div>
              <div>· Tabela detalhada dos maiores gastos por categoria</div>
              <div>· Balanço patrimonial das contas e compromissos de dívidas</div>
              <div>· Indicadores chave de comprometimento da renda</div>
            </div>
          </div>

          <button
            onClick={handleExportPDF}
            className="w-full min-h-[44px] py-3 px-4 bg-slate-900 hover:bg-slate-800 dark:bg-slate-800 dark:hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all active:scale-98 cursor-pointer text-center"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>Gerar e Baixar Relatório em PDF</span>
          </button>
        </div>
      </div>
    </div>
  );
};
