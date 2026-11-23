/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Plus,
  Sun,
  Moon,
  ArrowDownRight,
  ArrowUpRight,
  Calendar,
  Filter,
  Menu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Lock,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  LayoutDashboard
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { TimeFilterPeriod } from '../../types/finance';
import { MONTH_NAMES_PT, MONTH_NAMES_SHORT_PT } from '../../utils/formatters';
import {
  resolveTechnicalAccessPermissions,
  sanitizeCloudSyncMessageForUser
} from '../../utils/technicalAccess';

interface HeaderProps {
  currentTab: string;
  onOpenMobileMenu?: () => void;
  isMasterAdmin?: boolean;
  onOpenMasterPortal?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onOpenMobileMenu,
  isMasterAdmin = false,
  onOpenMasterPortal
}) => {
  const {
    filter,
    setFilter,
    theme,
    toggleTheme,
    openQuickEntry,
    selectedYear,
    selectedMonth,
    isFutureView,
    goToNextMonth,
    goToPrevMonth,
    goToCurrentMonth,
    cloudSyncStatus,
    cloudSyncMessage,
    forceUploadLocalToCloud,
    requestSafeLogout
  } = useFinance();

  const { logout, supabaseUserDisplayName, supabaseUserEmail } = useAuth();

  const [isMobilePeriodOpen, setIsMobilePeriodOpen] = useState(false);
  const [isSyncTriggering, setIsSyncTriggering] = useState(false);
  const [headerSyncFeedback, setHeaderSyncFeedback] = useState<{
    type: 'conflict' | 'error' | 'success';
    text: string;
  } | null>(null);

  const handleHeaderCloudSync = async () => {
    if (isSyncTriggering || cloudSyncStatus === 'syncing') return;
    setIsSyncTriggering(true);
    setHeaderSyncFeedback(null);
    try {
      const outcome = await forceUploadLocalToCloud();
      if (outcome.conflict) {
        setHeaderSyncFeedback({ type: 'conflict', text: outcome.message });
      } else if (!outcome.success) {
        setHeaderSyncFeedback({ type: 'error', text: outcome.message });
      } else {
        setHeaderSyncFeedback({ type: 'success', text: outcome.message });
      }
    } catch (err: any) {
      setHeaderSyncFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível verificar ou sincronizar os dados na nuvem.'
      });
    } finally {
      setIsSyncTriggering(false);
    }
  };

  const handlePeriodChange = (period: TimeFilterPeriod) => {
    setFilter(prev => ({ ...prev, period }));
    setIsMobilePeriodOpen(false);
  };

  const getTabLabel = (id: string) => {
    switch (id) {
      case 'dashboard': return 'Dashboard Principal';
      case 'transactions': return 'Extrato & Movimentações';
      case 'incomes': return 'Entradas Financeiras';
      case 'expenses': return 'Despesas Fixas & Variáveis';
      case 'debts': return 'Central de Dívidas & Pendências';
      case 'cards': return 'Cartões de Crédito & Faturas';
      case 'power-of-purchase': return 'Meu Poder de Compra';
      case 'analytics': return 'Gráficos & Análises';
      case 'goals': return 'Planejamento & Objetivos';
      case 'calendar': return 'Calendário Financeiro';
      case 'reports': return 'Relatórios & Exportações';
      case 'settings': return 'Configurações';
      default: return 'Controle Financeiro';
    }
  };

  const getPeriodLabel = () => {
    if (filter.period === 'specific_month' || filter.period === 'current_month' || filter.period === 'next_month' || filter.period === 'previous_month') {
      const mName = MONTH_NAMES_SHORT_PT[selectedMonth] || '';
      return `${mName}/${String(selectedYear).slice(2)}${isFutureView ? ' (Futuro)' : ''}`;
    }
    switch (filter.period) {
      case 'next_3_months': return 'Próximos 3M';
      case 'next_6_months': return 'Próximos 6M';
      case 'last_3_months': return 'Últimos 3M';
      case 'last_6_months': return 'Últimos 6M';
      case 'all': return 'Histórico';
      default: return 'Período';
    }
  };

  return (
    <div className="sticky top-0 z-30">
      <header className="flex items-center justify-between gap-1.5 sm:gap-2.5 px-2.5 sm:px-5 lg:px-6 xl:px-8 py-2 sm:py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 min-w-0">
      {/* Zone 1: Mobile Hamburger + Contextual Title & Breadcrumb */}
      <div className="flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1">
        {/* Mobile Hamburger Menu Button */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden p-2 -ml-1 min-w-[40px] min-h-[40px] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0"
          aria-label="Abrir menu de módulos"
          title="Ver todos os módulos"
        >
          <Menu className="w-5 h-5 text-slate-800 dark:text-slate-100" />
        </button>

        {/* Mobile Title with interactive trigger */}
        <button
          type="button"
          onClick={onOpenMobileMenu}
          className="lg:hidden flex items-center gap-1 min-w-0 flex-1 text-left group"
          title="Toque para escolher o módulo"
        >
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium leading-tight">
              <span>Módulos</span>
              <ChevronDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 group-hover:translate-y-0.5 transition-transform shrink-0" />
            </div>
            <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate leading-tight">
              {getTabLabel(currentTab)}
            </h1>
          </div>
        </button>

        {/* Desktop Breadcrumb */}
        <div className="hidden lg:block min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 font-medium min-w-0">
            <span className="shrink-0">Finanças</span>
            <span aria-hidden="true" className="shrink-0">/</span>
            <span className="text-slate-700 dark:text-slate-300 truncate">{getTabLabel(currentTab)}</span>
            {isFutureView && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40 shrink-0">
                <Sparkles className="w-3 h-3" />
                <span>Projeção Futura</span>
              </span>
            )}
          </div>
          <h1 className="text-base xl:text-lg font-bold tracking-tight text-slate-900 dark:text-white truncate">
            {getTabLabel(currentTab)}
          </h1>
        </div>
      </div>

      {/* Zone 2: Full Segmented Period Bar on Wide Desktops (2xl >= 1536px) */}
      <div className="hidden 2xl:flex items-center gap-2 shrink-0">
        {/* Month Stepper: ◀ Mês Ano ▶ */}
        <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-0.5 text-xs font-medium border border-slate-200/60 dark:border-slate-700/60">
          <button
            onClick={goToPrevMonth}
            title="Mês Anterior"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            onClick={goToCurrentMonth}
            title="Voltar para o Mês Atual"
            className={`px-2.5 py-1 text-xs font-bold font-mono min-w-[110px] text-center rounded-md transition-all cursor-pointer ${
              isFutureView
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            <span>{MONTH_NAMES_PT[selectedMonth]} {selectedYear}</span>
            {isFutureView && <span className="block text-[9px] font-sans font-normal opacity-90">✨ Projeção</span>}
          </button>

          <button
            onClick={goToNextMonth}
            title="Próximo Mês (Avançar no futuro)"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Quick Period Buttons */}
        <div className="flex items-center p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs font-medium">
          <button
            onClick={() => handlePeriodChange('current_month')}
            className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              filter.period === 'current_month'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Mês Atual
          </button>

          <button
            onClick={() => handlePeriodChange('next_month')}
            className={`px-2.5 py-1.5 rounded-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
              filter.period === 'next_month'
                ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <Sparkles className="w-3 h-3" />
            <span>Próximo Mês</span>
          </button>

          <button
            onClick={() => handlePeriodChange('next_3_months')}
            className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              filter.period === 'next_3_months'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Próximos 3M
          </button>

          <button
            onClick={() => handlePeriodChange('next_6_months')}
            className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              filter.period === 'next_6_months'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Próximos 6M
          </button>

          <button
            onClick={() => handlePeriodChange('previous_month')}
            className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              filter.period === 'previous_month'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Anterior
          </button>

          <button
            onClick={() => handlePeriodChange('all')}
            className={`px-2.5 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
              filter.period === 'all'
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Histórico
          </button>
        </div>
      </div>

      {/* Compact Period Stepper + Dropdown (Mobile, Tablet & Notebooks < 2xl) */}
      <div className="flex items-center gap-0.5 sm:gap-1.5 2xl:hidden shrink-0">
        {/* Tablet/Notebook inline month label stepper */}
        <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-0.5 text-xs font-medium border border-slate-200/60 dark:border-slate-700/60">
          <button
            type="button"
            onClick={goToPrevMonth}
            title="Mês Anterior"
            aria-label="Mês Anterior"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <ChevronLeft className="w-3.5 h-3.5" />
          </button>
          <button
            type="button"
            onClick={goToCurrentMonth}
            title="Voltar para o Mês Atual"
            className={`px-2 py-1 text-xs font-bold font-mono whitespace-nowrap rounded-md transition-all cursor-pointer ${
              isFutureView
                ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                : 'text-slate-900 dark:text-white'
            }`}
          >
            {MONTH_NAMES_SHORT_PT[selectedMonth]}/{String(selectedYear).slice(2)}
          </button>
          <button
            type="button"
            onClick={goToNextMonth}
            title="Próximo Mês (Avançar no futuro)"
            aria-label="Próximo Mês"
            className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
          >
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Mobile month prev arrow */}
        <button
          type="button"
          onClick={goToPrevMonth}
          className="md:hidden p-1.5 min-w-[32px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          title="Mês anterior"
          aria-label="Mês anterior"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        <div className="relative">
          <button
            type="button"
            onClick={() => setIsMobilePeriodOpen(!isMobilePeriodOpen)}
            aria-expanded={isMobilePeriodOpen}
            aria-label="Selecionar período"
            className={`flex items-center gap-1 px-2 sm:px-2.5 py-1.5 min-h-[36px] text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap ${
              isFutureView
                ? 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
            }`}
          >
            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            <span className="font-mono text-[11px]">{getPeriodLabel()}</span>
            <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
          </button>

          {isMobilePeriodOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMobilePeriodOpen(false)}
                aria-hidden="true"
              />
              <div className="absolute right-0 mt-1.5 w-52 max-w-[calc(100vw-1rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1 z-50 text-xs">
                <button
                  type="button"
                  onClick={() => handlePeriodChange('current_month')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  Mês Atual (Hoje)
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('next_month')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-between cursor-pointer"
                >
                  <span>Próximo Mês</span>
                  <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded-xs">Projeção</span>
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('next_3_months')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  Próximos 3 Meses
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('next_6_months')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer"
                >
                  Próximos 6 Meses
                </button>
                <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                <button
                  type="button"
                  onClick={() => handlePeriodChange('previous_month')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                >
                  Mês Anterior
                </button>
                <button
                  type="button"
                  onClick={() => handlePeriodChange('all')}
                  className="w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 cursor-pointer"
                >
                  Todo o Histórico
                </button>
              </div>
            </>
          )}
        </div>

        {/* Mobile month next arrow */}
        <button
          type="button"
          onClick={goToNextMonth}
          className="md:hidden p-1.5 min-w-[32px] min-h-[36px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
          title="Próximo mês"
          aria-label="Próximo mês"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>

      {/* Zone 3: Actions & Quick Launch CTA */}
      <div className="flex items-center gap-1 sm:gap-2 shrink-0">
        {isMasterAdmin && onOpenMasterPortal && (
          <button
            type="button"
            onClick={onOpenMasterPortal}
            title="Alternar para o ambiente exclusivo Gestão Comercial (Painel Master)"
            className="inline-flex items-center justify-center gap-1.5 px-2 sm:px-2.5 py-1.5 min-h-[36px] rounded-xl text-xs font-bold bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white transition-colors cursor-pointer whitespace-nowrap"
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden xl:inline">Gestão Comercial</span>
          </button>
        )}

        {/* Theme Toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label="Alternar tema"
          className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
        </button>

        {/* Supabase Cloud Status Indicator */}
        <button
          type="button"
          onClick={handleHeaderCloudSync}
          disabled={isSyncTriggering || cloudSyncStatus === 'syncing'}
          title={
            sanitizeCloudSyncMessageForUser(
              cloudSyncMessage,
              resolveTechnicalAccessPermissions({}).canViewDevDiagnostics
            ) || 'Verificar nuvem e sincronizar dados'
          }
          className={`hidden sm:inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 min-h-[36px] rounded-xl text-xs font-medium border transition-all cursor-pointer disabled:opacity-70 ${
            cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/70'
              : cloudSyncStatus === 'syncing'
              ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/70 dark:border-blue-800/70'
              : cloudSyncStatus === 'table_missing' || cloudSyncStatus === 'session_expired'
              ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70'
              : cloudSyncStatus === 'not_configured' || cloudSyncStatus === 'unauthenticated'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
              : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/70 dark:border-rose-800/70'
          }`}
        >
          {cloudSyncStatus === 'syncing' ? (
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
          ) : cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced' ? (
            <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : cloudSyncStatus === 'table_missing' || cloudSyncStatus === 'session_expired' ? (
            <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
          ) : (
            <CloudOff className="w-3.5 h-3.5 text-slate-500" />
          )}
          <span className="hidden xl:inline text-[11px] font-semibold whitespace-nowrap">
            {cloudSyncStatus === 'syncing'
              ? 'Sincronizando...'
              : cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced'
              ? 'Nuvem Conectada'
              : cloudSyncStatus === 'table_missing'
              ? 'Nuvem Indisponível'
              : cloudSyncStatus === 'session_expired'
              ? 'Sessão Expirada'
              : cloudSyncStatus === 'not_configured'
              ? 'Nuvem Desconectada'
              : 'Modo Local'}
          </span>
        </button>

        {/* Authenticated User Badge & Logout Button */}
        <button
          type="button"
          onClick={() => (requestSafeLogout ? requestSafeLogout() : logout())}
          title={`Encerrar sessão (${supabaseUserEmail || supabaseUserDisplayName})`}
          className="hidden sm:inline-flex items-center gap-1.5 px-2 sm:px-2.5 py-1.5 min-h-[36px] rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition-all cursor-pointer max-w-[140px] xl:max-w-[160px]"
        >
          <LogOut className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
          <span className="hidden xl:inline font-semibold truncate">{supabaseUserDisplayName}</span>
          <span className="text-[10px] text-slate-400 hidden 2xl:inline shrink-0">• Sair</span>
        </button>

        {/* Quick Income shortcut (wide desktop) */}
        <button
          type="button"
          onClick={() => openQuickEntry('income')}
          className="hidden 2xl:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-800/60 rounded-xl transition-all cursor-pointer whitespace-nowrap"
        >
          <ArrowUpRight className="w-3.5 h-3.5" />
          <span>+ Entrada</span>
        </button>

        {/* Quick Expense shortcut (wide desktop) */}
        <button
          type="button"
          onClick={() => openQuickEntry('expense')}
          className="hidden 2xl:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200/60 dark:border-rose-800/60 rounded-xl transition-all cursor-pointer whitespace-nowrap"
        >
          <ArrowDownRight className="w-3.5 h-3.5" />
          <span>+ Despesa</span>
        </button>

        {/* PRIMARY CTA: + NOVO LANÇAMENTO */}
        <button
          type="button"
          onClick={() => openQuickEntry('all')}
          className="inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 sm:py-2 min-h-[36px] text-xs sm:text-sm font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer whitespace-nowrap shrink-0"
        >
          <Plus className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">+ NOVO LANÇAMENTO</span>
          <span className="sm:hidden font-bold">Novo</span>
        </button>
      </div>
      </header>
      {headerSyncFeedback && (
        <div
          role={headerSyncFeedback.type === 'success' ? 'status' : 'alert'}
          className={`px-3 sm:px-6 lg:px-8 py-2 border-b text-xs flex items-center justify-between gap-3 ${
            headerSyncFeedback.type === 'conflict'
              ? 'bg-amber-50 dark:bg-amber-950/90 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
              : headerSyncFeedback.type === 'error'
              ? 'bg-rose-50 dark:bg-rose-950/90 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
              : 'bg-emerald-50 dark:bg-emerald-950/90 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            {headerSyncFeedback.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 shrink-0" />
            )}
            <span className="font-medium leading-snug">{headerSyncFeedback.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setHeaderSyncFeedback(null)}
            aria-label="Fechar aviso de sincronização"
            className="p-1 rounded-lg opacity-70 hover:opacity-100 cursor-pointer shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
