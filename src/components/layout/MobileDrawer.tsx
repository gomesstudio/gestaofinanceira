/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import {
  X,
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
  ChevronRight,
  Lock
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: string;
  setCurrentTab: (tab: string) => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  currentTab,
  setCurrentTab,
}) => {
  const { totalBankBalance, freeMoneyAvailable } = useFinance();
  const { logout } = useAuth();

  if (!isOpen) return null;

  const items = [
    { id: 'dashboard', label: 'Dashboard Principal', desc: 'Resumo e indicadores gerais', icon: LayoutDashboard },
    { id: 'transactions', label: 'Extrato Geral', desc: 'Todas as movimentações e busca', icon: Receipt },
    { id: 'incomes', label: 'Entradas Financeiras', desc: 'Salário, benefícios e extras', icon: ArrowUpRight },
    { id: 'expenses', label: 'Despesas Fixas & Variáveis', desc: 'Gastos essenciais e consumo', icon: ArrowDownRight },
    { id: 'debts', label: 'Central de Dívidas', desc: 'Pendências e amortizações', icon: AlertCircle },
    { id: 'cards', label: 'Cartões & Faturas', desc: 'Controle de limites e fechamentos', icon: CreditCard },
    { id: 'power-of-purchase', label: 'Poder de Compra', desc: 'Dinheiro livre e simulador', icon: Zap },
    { id: 'analytics', label: 'Gráficos & Inteligência', desc: '10 análises e alertas automáticos', icon: PieChart },
    { id: 'goals', label: 'Planejamento & Metas', desc: 'Objetivos e juros compostos', icon: Target },
    { id: 'calendar', label: 'Calendário Financeiro', desc: 'Vencimentos e datas de pagamento', icon: Calendar },
    { id: 'reports', label: 'Relatórios & Exportar', desc: 'Planilhas Excel e arquivos PDF', icon: FileSpreadsheet },
    { id: 'settings', label: 'Configurações', desc: 'Categorias, contas e backups', icon: Settings },
  ];

  const handleSelect = (id: string) => {
    setCurrentTab(id);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex lg:hidden">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Drawer Body */}
      <div className="relative w-4/5 max-w-sm h-full bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-800 flex flex-col shadow-2xl z-10 animate-in slide-in-from-left duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-8 h-8 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white shadow-xs">
              <ShieldCheck className="w-5 h-5 text-emerald-400 dark:text-white" />
            </div>
            <div>
              <div className="font-bold text-slate-900 dark:text-white text-base leading-tight">
                Gestão Pro
              </div>
              <div className="text-[10px] text-slate-500">Escolha o Módulo</div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
            aria-label="Fechar menu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mini Balances Card */}
        <div className="m-3 p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200/70 dark:border-slate-800 flex justify-between items-center text-xs">
          <div>
            <div className="text-[10px] text-slate-400 font-medium">Saldo Total:</div>
            <div className="font-mono font-bold text-slate-900 dark:text-white tabular-nums">
              {formatCurrency(totalBankBalance)}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] text-slate-400 font-medium">Livre p/ Gastar:</div>
            <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
              {formatCurrency(freeMoneyAvailable)}
            </div>
          </div>
        </div>

        {/* Modules List */}
        <div className="px-4 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
          Todos os Módulos
        </div>

        <nav className="flex-1 px-3 py-1 space-y-1 overflow-y-auto">
          {items.map(item => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleSelect(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 text-left rounded-xl transition-all ${
                  isActive
                    ? 'bg-slate-900 text-white dark:bg-emerald-600 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/70'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-slate-400 dark:text-slate-500'}`} />
                  <div className="truncate">
                    <div className="text-xs font-semibold truncate leading-tight">{item.label}</div>
                    <div className={`text-[10px] truncate ${isActive ? 'text-slate-200 dark:text-emerald-100' : 'text-slate-400'}`}>
                      {item.desc}
                    </div>
                  </div>
                </div>
                <ChevronRight className={`w-3.5 h-3.5 shrink-0 ${isActive ? 'opacity-90' : 'opacity-40'}`} />
              </button>
            );
          })}
        </nav>

        {/* User & Lock Footer */}
        <div className="p-3 border-t border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-850">
          <button
            onClick={() => {
              onClose();
              logout();
            }}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-900/40 rounded-xl border border-rose-200/50 dark:border-rose-900/50 transition-all cursor-pointer"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>Bloquear Aplicativo (Sair)</span>
          </button>
        </div>
      </div>
    </div>
  );
};
