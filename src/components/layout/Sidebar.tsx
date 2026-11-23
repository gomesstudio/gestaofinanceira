/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  ArrowUpRight,
  ArrowDownRight,
  AlertCircle,
  CreditCard,
  Zap,
  PieChart,
  Target,
  Calendar,
  FileSpreadsheet,
  Settings,
  ShieldCheck,
  ChevronRight
} from 'lucide-react';
import { formatCurrency } from '../../utils/formatters';
import { useFinance } from '../../context/FinanceContext';

interface SidebarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ currentTab, setCurrentTab }) => {
  const { totalBankBalance, freeMoneyAvailable } = useFinance();

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'transactions', label: 'Extrato Geral', icon: Receipt },
    { id: 'incomes', label: 'Entradas', icon: ArrowUpRight },
    { id: 'expenses', label: 'Despesas', icon: ArrowDownRight },
    { id: 'debts', label: 'Dívidas & Pendências', icon: AlertCircle },
    { id: 'cards', label: 'Cartões & Faturas', icon: CreditCard },
    { id: 'power-of-purchase', label: 'Poder de Compra', icon: Zap },
    { id: 'analytics', label: 'Gráficos & Análises', icon: PieChart },
    { id: 'goals', label: 'Planejamento & Metas', icon: Target },
    { id: 'calendar', label: 'Calendário Financeiro', icon: Calendar },
    { id: 'reports', label: 'Relatórios & Exportar', icon: FileSpreadsheet },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <aside className="hidden lg:flex lg:sticky lg:top-0 flex-col w-60 xl:w-64 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200/80 dark:border-slate-800 h-screen h-[100dvh] overflow-hidden">
      {/* Brand Wordmark (Zero-slop: clean, elegant typography) */}
      <div className="shrink-0 flex items-center gap-3 px-5 xl:px-6 py-4 xl:py-5 border-b border-slate-100 dark:border-slate-800">
        <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white shadow-xs shrink-0">
          <ShieldCheck className="w-5 h-5 text-emerald-400 dark:text-white" />
        </div>
        <div className="min-w-0">
          <div className="font-bold text-slate-900 dark:text-white text-base tracking-tight leading-none truncate">
            Gestão Pro
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
            Finanças Pessoais
          </div>
        </div>
      </div>

      {/* Mini Quick Summary Card in Sidebar */}
      <div className="shrink-0 mx-3.5 xl:mx-4 mt-3.5 p-3 xl:p-3.5 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/70 dark:border-slate-800">
        <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
          Saldo em Contas
        </div>
        <div className="text-base font-bold text-slate-900 dark:text-white font-mono tabular-nums mt-0.5 truncate">
          {formatCurrency(totalBankBalance)}
        </div>
        <div className="flex items-center justify-between gap-2 pt-2 mt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs">
          <span className="text-slate-500 shrink-0">Livre p/ Gastar:</span>
          <span className="font-mono font-semibold text-emerald-600 dark:text-emerald-400 tabular-nums truncate">
            {formatCurrency(freeMoneyAvailable)}
          </span>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 min-h-0 px-3 py-3 space-y-1 overflow-y-auto overscroll-contain">
        <div className="px-3 pb-1 text-[10px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
          Módulos
        </div>
        {navItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => setCurrentTab(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded-xl transition-all cursor-pointer ${
                isActive
                  ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-semibold'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800/60'
              }`}
            >
              <div className="flex items-center gap-2.5 truncate">
                <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                <span className="truncate">{item.label}</span>
              </div>
              {isActive && <ChevronRight className="w-3.5 h-3.5 opacity-70 shrink-0" />}
            </button>
          );
        })}
      </nav>

      {/* Quiet Footer */}
      <div className="shrink-0 px-4 py-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 dark:text-slate-500 flex items-center justify-between">
        <span>Controle Pessoal</span>
        <span>v1.0</span>
      </div>
    </aside>
  );
};
