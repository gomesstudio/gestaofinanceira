/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  Plus,
  Zap,
  LayoutGrid
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';

interface MobileNavProps {
  currentTab: string;
  setCurrentTab: (tab: string) => void;
  openMobileMenu: () => void;
}

export const MobileNav: React.FC<MobileNavProps> = ({ currentTab, setCurrentTab, openMobileMenu }) => {
  const { openQuickEntry } = useFinance();

  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-t border-slate-200/80 dark:border-slate-800 px-3 py-1.5 flex items-center justify-around shadow-lg">
      {/* 1. Início */}
      <button
        onClick={() => setCurrentTab('dashboard')}
        className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors ${
          currentTab === 'dashboard'
            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <LayoutDashboard className="w-5 h-5" />
        <span className="text-[10px]">Início</span>
      </button>

      {/* 2. Extrato */}
      <button
        onClick={() => setCurrentTab('transactions')}
        className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors ${
          currentTab === 'transactions'
            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <Receipt className="w-5 h-5" />
        <span className="text-[10px]">Extrato</span>
      </button>

      {/* 3. Floating Center + Quick Entry Button */}
      <div className="-mt-6 flex flex-col items-center">
        <button
          onClick={() => openQuickEntry('all')}
          aria-label="Adicionar lançamento rápido"
          className="flex items-center justify-center w-12 h-12 rounded-full bg-slate-900 dark:bg-emerald-600 text-white shadow-xl hover:scale-105 active:scale-95 transition-all"
        >
          <Plus className="w-6 h-6" />
        </button>
        <span className="text-[9px] text-slate-500 font-medium mt-0.5">Lançar</span>
      </div>

      {/* 4. Poder de Compra */}
      <button
        onClick={() => setCurrentTab('power-of-purchase')}
        className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors ${
          currentTab === 'power-of-purchase'
            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <Zap className="w-5 h-5" />
        <span className="text-[10px]">Poder</span>
      </button>

      {/* 5. Todos os Módulos */}
      <button
        onClick={openMobileMenu}
        aria-label="Abrir menu de todos os módulos"
        className={`flex flex-col items-center gap-0.5 min-w-[56px] py-1 transition-colors ${
          ['incomes', 'expenses', 'debts', 'cards', 'analytics', 'goals', 'calendar', 'reports', 'settings'].includes(currentTab)
            ? 'text-emerald-600 dark:text-emerald-400 font-bold'
            : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <LayoutGrid className="w-5 h-5" />
        <span className="text-[10px]">Módulos</span>
      </button>
    </div>
  );
};
