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
  Wallet
} from 'lucide-react';

interface MobileModuleBarProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const MobileModuleBar: React.FC<MobileModuleBarProps> = ({ currentTab, setCurrentTab }) => {
  const modules = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'accounts', label: 'Minhas Contas', icon: Wallet },
    { id: 'transactions', label: 'Extrato', icon: Receipt },
    { id: 'incomes', label: 'Entradas', icon: ArrowUpRight },
    { id: 'expenses', label: 'Despesas', icon: ArrowDownRight },
    { id: 'debts', label: 'Dívidas', icon: AlertCircle },
    { id: 'cards', label: 'Cartões', icon: CreditCard },
    { id: 'power-of-purchase', label: 'Poder de Compra', icon: Zap },
    { id: 'analytics', label: 'Gráficos', icon: PieChart },
    { id: 'goals', label: 'Metas', icon: Target },
    { id: 'calendar', label: 'Calendário', icon: Calendar },
    { id: 'reports', label: 'Relatórios', icon: FileSpreadsheet },
    { id: 'settings', label: 'Configurações', icon: Settings },
  ];

  return (
    <div className="lg:hidden w-full bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 px-3 py-2 overflow-x-auto overscroll-x-contain scrollbar-none flex items-center gap-1.5 shadow-2xs">
      {modules.map(mod => {
        const Icon = mod.icon;
        const isActive = currentTab === mod.id;

        return (
          <button
            type="button"
            key={mod.id}
            onClick={() => setCurrentTab(mod.id)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 min-h-[38px] text-xs font-medium rounded-lg whitespace-nowrap shrink-0 transition-all cursor-pointer ${
              isActive
                ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-semibold'
                : 'bg-slate-50 dark:bg-slate-800/60 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Icon className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-400'}`} />
            <span>{mod.label}</span>
          </button>
        );
      })}
    </div>
  );
};
