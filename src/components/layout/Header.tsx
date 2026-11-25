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
  Menu,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  LogOut,
  Cloud,
  CloudOff,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  X,
  LayoutDashboard,
  User
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { TimeFilterPeriod } from '../../types/finance';
import { MONTH_NAMES_PT, MONTH_NAMES_SHORT_PT } from '../../utils/formatters';
import { resolveActivePeriod } from '../../utils/periodFilter';
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
    activePeriod: ctxActivePeriod,
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

  const activePeriod = ctxActivePeriod ?? resolveActivePeriod(filter);
  const isProjectedPeriod = isFutureView || activePeriod.includesFuture;

  const { logout, supabaseUserDisplayName, supabaseUserEmail } = useAuth();

  const [isMobilePeriodOpen, setIsMobilePeriodOpen] = useState(false);
  const [isMobileAccountOpen, setIsMobileAccountOpen] = useState(false);
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
      case 'accounts': return 'Minhas Contas';
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
    if (activePeriod.mode === 'single_month') {
      const mName = MONTH_NAMES_SHORT_PT[selectedMonth] || '';
      return `${mName}/${String(selectedYear).slice(2)}`;
    }
    return activePeriod.shortLabel;
  };

  const cloudStatusLabel =
    cloudSyncStatus === 'syncing'
      ? 'Sincronizando...'
      : cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced'
      ? 'Nuvem Conectada'
      : cloudSyncStatus === 'table_missing'
      ? 'Nuvem Indisponível'
      : cloudSyncStatus === 'session_expired'
      ? 'Sessão Expirada'
      : cloudSyncStatus === 'not_configured'
      ? 'Nuvem Desconectada'
      : 'Modo Local';

  const cloudStatusStyles =
    cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced'
      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/70'
      : cloudSyncStatus === 'syncing'
      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/70 dark:border-blue-800/70'
      : cloudSyncStatus === 'table_missing' || cloudSyncStatus === 'session_expired'
      ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70'
      : cloudSyncStatus === 'not_configured' || cloudSyncStatus === 'unauthenticated'
      ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700'
      : 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border-rose-200/70 dark:border-rose-800/70';

  const cloudStatusIcon =
    cloudSyncStatus === 'syncing' ? (
      <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400 shrink-0" />
    ) : cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced' ? (
      <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
    ) : cloudSyncStatus === 'table_missing' || cloudSyncStatus === 'session_expired' ? (
      <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
    ) : (
      <CloudOff className="w-3.5 h-3.5 text-slate-500 shrink-0" />
    );

  const cloudTitle =
    sanitizeCloudSyncMessageForUser(
      cloudSyncMessage,
      resolveTechnicalAccessPermissions({}).canViewDevDiagnostics
    ) || 'Verificar nuvem e sincronizar dados';

  return (
    <div className="sticky top-0 z-30">
      <header className="flex flex-wrap min-[1900px]:flex-nowrap items-center justify-between gap-x-1.5 sm:gap-x-3 min-[1900px]:gap-x-2 gap-y-1.5 sm:gap-y-2 px-3 sm:px-5 py-2 sm:py-2.5 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800 min-w-0">
        {/* ITEM 1: Mobile Hamburger + Title / Desktop Breadcrumb & Title */}
        <div className="order-1 flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 min-[1900px]:flex-initial min-[1900px]:max-w-[165px]">
          {/* Mobile Hamburger Menu Button */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden p-2 -ml-1 min-w-[38px] min-h-[38px] flex items-center justify-center text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors shrink-0 cursor-pointer"
            aria-label="Abrir menu de módulos"
            title="Ver todos os módulos"
          >
            <Menu className="w-5 h-5 text-slate-800 dark:text-slate-100" />
          </button>

          {/* Mobile Title with interactive trigger */}
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="lg:hidden flex items-center gap-1 min-w-0 flex-1 text-left group cursor-pointer"
            title="Toque para escolher o módulo"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1 text-[10px] text-slate-500 font-medium leading-tight">
                <span>Módulos</span>
                <ChevronDown className="w-3 h-3 text-emerald-600 dark:text-emerald-400 group-hover:translate-y-0.5 transition-transform shrink-0" />
                {isProjectedPeriod && (
                  <span className="inline-flex items-center gap-0.5 px-1 py-px text-[9px] font-bold rounded-sm bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 shrink-0">
                    <Sparkles className="w-2.5 h-2.5" />
                    <span>Projeção</span>
                  </span>
                )}
              </div>
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate leading-tight">
                {getTabLabel(currentTab)}
              </h1>
            </div>
          </button>

          {/* Desktop Title & Contextual Breadcrumb (hidden below xl to keep 1024px airy) */}
          <div className="hidden lg:block min-w-0 flex-1">
            <div className="hidden xl:flex items-center gap-1.5 text-xs min-[1900px]:text-[11px] text-slate-500 dark:text-slate-400 font-medium min-w-0">
              <span className="truncate">
                Finanças /{' '}
                <span className="text-slate-700 dark:text-slate-300">{getTabLabel(currentTab)}</span>
              </span>
              {isProjectedPeriod && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40 shrink-0 min-[1900px]:hidden">
                  <Sparkles className="w-3 h-3" />
                  <span>{isFutureView ? 'Projeção Futura' : 'Projeção'}</span>
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <h1 className="text-base xl:text-lg min-[1900px]:text-base font-bold tracking-tight text-slate-900 dark:text-white truncate leading-snug">
                {getTabLabel(currentTab)}
              </h1>
              {isProjectedPeriod && (
                <span className="xl:hidden inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/40 shrink-0">
                  <Sparkles className="w-3 h-3" />
                  <span>Projeção</span>
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ITEM 2: Utilities & Account Controls (Row 1 right on <1900px, before Quick Actions on >=1900px) */}
        <div className="order-2 min-[1900px]:order-5 flex items-center gap-1 sm:gap-1.5 min-[1900px]:gap-1 shrink-0">
          {isMasterAdmin && onOpenMasterPortal && (
            <button
              type="button"
              onClick={onOpenMasterPortal}
              title="Alternar para o ambiente exclusivo Gestão Comercial (Painel Master)"
              className="hidden sm:inline-flex items-center justify-center gap-1.5 px-2.5 min-[1900px]:px-2 py-1.5 min-h-[36px] rounded-xl text-xs min-[1900px]:text-[11px] font-bold bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span className="hidden md:inline">Gestão Comercial</span>
            </button>
          )}

          {/* Theme Toggle */}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label="Alternar tema"
            title={theme === 'dark' ? 'Alternar para tema claro' : 'Alternar para tema escuro'}
            className="p-2 min-w-[36px] min-h-[36px] flex items-center justify-center rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            {theme === 'dark' ? (
              <Sun className="w-4 h-4 text-amber-400" />
            ) : (
              <Moon className="w-4 h-4 text-slate-600" />
            )}
          </button>

          {/* Cloud Sync Status Indicator */}
          <button
            type="button"
            onClick={handleHeaderCloudSync}
            disabled={isSyncTriggering || cloudSyncStatus === 'syncing'}
            title={cloudTitle}
            aria-label={`Status da nuvem: ${cloudStatusLabel}. Toque para sincronizar.`}
            className={`inline-flex items-center gap-1.5 px-2 xl:px-2.5 min-[1900px]:px-2 py-1.5 min-w-[36px] min-h-[36px] justify-center rounded-xl text-xs font-medium border transition-all cursor-pointer disabled:opacity-70 ${cloudStatusStyles}`}
          >
            {cloudStatusIcon}
            <span className="hidden xl:inline text-[11px] font-semibold whitespace-nowrap">
              {cloudStatusLabel}
            </span>
          </button>

          {/* Authenticated User Badge & Logout Button (sm+) */}
          <button
            type="button"
            onClick={() => (requestSafeLogout ? requestSafeLogout() : logout())}
            title={`Encerrar sessão (${supabaseUserEmail || supabaseUserDisplayName})`}
            aria-label={`Sair da conta (${supabaseUserDisplayName || supabaseUserEmail || 'usuário'})`}
            className="hidden sm:inline-flex items-center gap-1.5 px-2 xl:px-2.5 min-[1900px]:px-2 py-1.5 min-h-[36px] rounded-xl text-xs min-[1900px]:text-[11px] font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/80 dark:border-slate-800 transition-all cursor-pointer max-w-[130px] xl:max-w-[155px] min-[1900px]:max-w-[122px]"
          >
            <LogOut className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span className="hidden lg:inline font-semibold truncate">{supabaseUserDisplayName}</span>
            <span className="text-[10px] text-slate-400 hidden xl:inline shrink-0">• Sair</span>
          </button>
        </div>

        {/* ITEM 3: PRIMARY CTA: + NOVO LANÇAMENTO (Always prominent at top-right / far-right) */}
        <div className="order-3 min-[1900px]:order-7 shrink-0">
          <button
            type="button"
            onClick={() => openQuickEntry('all')}
            aria-label="Novo Lançamento"
            className="inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3.5 min-[1900px]:px-3 py-1.5 min-h-[36px] text-xs sm:text-sm min-[1900px]:text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl shadow-xs transition-all active:scale-98 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">+ NOVO LANÇAMENTO</span>
            <span className="sm:hidden font-bold">Novo</span>
          </button>
        </div>

        {/* Visual Row Separator below 1900px (hidden when single horizontal row fits) */}
        <div
          className="order-4 basis-full h-0 border-t border-slate-200/70 dark:border-slate-800/80 min-[1900px]:hidden"
          aria-hidden="true"
        />

        {/* ITEM 4: Period Stepper + Quick Period Filters */}
        <div className="order-5 min-[1900px]:order-2 flex items-center gap-1.5 sm:gap-2 min-w-0 flex-1 min-[1900px]:flex-initial">
          {/* Full Segmented Period Bar on xl+ (>= 1280px) */}
          <div className="hidden xl:flex items-center gap-1.5 shrink-0">
            {/* Month Stepper: ◀ Mês Ano ▶ */}
            <div className="flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-0.5 text-xs font-medium border border-slate-200/60 dark:border-slate-700/60">
              <button
                type="button"
                onClick={goToPrevMonth}
                title="Mês Anterior"
                aria-label="Mês Anterior"
                className="p-1.5 min-[1900px]:p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4 min-[1900px]:w-3.5 min-[1900px]:h-3.5" />
              </button>

              <button
                type="button"
                onClick={goToCurrentMonth}
                title={activePeriod.mode === 'single_month' ? 'Voltar para o Mês Atual' : `${activePeriod.label} — Clique para voltar ao Mês Atual`}
                className={`px-2 min-[1900px]:px-1.5 py-1 text-xs min-[1900px]:text-[11px] font-bold font-mono min-w-[100px] min-[1900px]:min-w-[86px] text-center rounded-md transition-all cursor-pointer whitespace-nowrap ${
                  isProjectedPeriod
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                <span>
                  {activePeriod.mode === 'single_month'
                    ? `${MONTH_NAMES_PT[selectedMonth]} ${selectedYear}`
                    : activePeriod.shortLabel}
                </span>
                {isProjectedPeriod && (
                  <span className="hidden min-[1900px]:block text-[9px] font-sans font-normal opacity-90">
                    ✨ Projeção
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={goToNextMonth}
                title="Próximo Mês (Avançar no futuro)"
                aria-label="Próximo Mês"
                className="p-1.5 min-[1900px]:p-1 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-700 transition-colors cursor-pointer"
              >
                <ChevronRight className="w-4 h-4 min-[1900px]:w-3.5 min-[1900px]:h-3.5" />
              </button>
            </div>

            {/* Quick Period Buttons */}
            <div className="flex items-center p-1 min-[1900px]:p-0.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl text-xs min-[1900px]:text-[11px] font-medium border border-slate-200/50 dark:border-slate-700/50">
              <button
                type="button"
                onClick={() => handlePeriodChange('current_month')}
                className={`px-2 min-[1900px]:px-1.5 py-1.5 min-[1900px]:py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filter.period === 'current_month'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Mês Atual
              </button>

              <button
                type="button"
                onClick={() => handlePeriodChange('next_month')}
                className={`px-2 min-[1900px]:px-1.5 py-1.5 min-[1900px]:py-1 rounded-lg transition-all flex items-center gap-1 cursor-pointer whitespace-nowrap ${
                  filter.period === 'next_month'
                    ? 'bg-emerald-600 text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                <Sparkles className="w-3 h-3 shrink-0" />
                <span>Próximo Mês</span>
              </button>

              <button
                type="button"
                onClick={() => handlePeriodChange('next_3_months')}
                className={`px-2 min-[1900px]:px-1.5 py-1.5 min-[1900px]:py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filter.period === 'next_3_months'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Próximos 3M
              </button>

              <button
                type="button"
                onClick={() => handlePeriodChange('next_6_months')}
                className={`px-2 min-[1900px]:px-1.5 py-1.5 min-[1900px]:py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filter.period === 'next_6_months'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Próximos 6M
              </button>

              <button
                type="button"
                onClick={() => handlePeriodChange('previous_month')}
                className={`px-2 min-[1900px]:px-1.5 py-1.5 min-[1900px]:py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filter.period === 'previous_month'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Anterior
              </button>

              <button
                type="button"
                onClick={() => handlePeriodChange('all')}
                className={`px-2 min-[1900px]:px-1.5 py-1.5 min-[1900px]:py-1 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                  filter.period === 'all'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs font-semibold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Histórico
              </button>
            </div>
          </div>

          {/* Compact Period Stepper + Dropdown (< xl: Mobile, Tablet & 1024px Notebooks) */}
          <div className="flex items-center gap-1 sm:gap-1.5 xl:hidden min-w-0">
            {/* Tablet/Notebook (md..lg) inline full/short month stepper */}
            <div className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800/80 rounded-xl p-0.5 text-xs font-medium border border-slate-200/60 dark:border-slate-700/60 shrink-0">
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
                title={activePeriod.mode === 'single_month' ? 'Voltar para o Mês Atual' : `${activePeriod.label} — Clique para voltar ao Mês Atual`}
                className={`px-2 py-1 text-xs font-bold font-mono whitespace-nowrap rounded-md transition-all cursor-pointer ${
                  isProjectedPeriod
                    ? 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'text-slate-900 dark:text-white'
                }`}
              >
                {activePeriod.mode === 'single_month'
                  ? `${MONTH_NAMES_PT[selectedMonth]} ${selectedYear}`
                  : activePeriod.shortLabel}
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

            {/* Mobile (< md) compact stepper wrapper */}
            <div className="flex md:hidden items-center shrink-0">
              <button
                type="button"
                onClick={goToPrevMonth}
                className="p-1 min-w-[28px] min-h-[34px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Mês anterior"
                aria-label="Mês anterior"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </div>

            {/* Period Filter Dropdown Trigger */}
            <div className="relative">
              <button
                type="button"
                onClick={() => {
                  setIsMobilePeriodOpen(!isMobilePeriodOpen);
                  setIsMobileAccountOpen(false);
                }}
                aria-expanded={isMobilePeriodOpen}
                aria-label="Selecionar período"
                className={`flex items-center gap-1 px-1.5 sm:px-2.5 py-1.5 min-h-[34px] text-xs font-semibold rounded-xl cursor-pointer whitespace-nowrap border ${
                  isProjectedPeriod
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200/70 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800/70'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200/60 dark:border-slate-700/60'
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
                  <div className="absolute left-0 mt-1.5 w-52 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-1 z-50 text-xs">
                    <button
                      type="button"
                      onClick={() => handlePeriodChange('current_month')}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer ${
                        filter.period === 'current_month'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                          : ''
                      }`}
                    >
                      Mês Atual (Hoje)
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePeriodChange('next_month')}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-emerald-600 dark:text-emerald-400 font-semibold flex items-center justify-between cursor-pointer ${
                        filter.period === 'next_month' ? 'bg-emerald-50 dark:bg-emerald-950/40' : ''
                      }`}
                    >
                      <span>Próximo Mês</span>
                      <span className="text-[10px] bg-emerald-100 dark:bg-emerald-950 px-1.5 py-0.5 rounded-xs">
                        Projeção
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePeriodChange('next_3_months')}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer ${
                        filter.period === 'next_3_months'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                          : ''
                      }`}
                    >
                      Próximos 3 Meses
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePeriodChange('next_6_months')}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 font-medium cursor-pointer ${
                        filter.period === 'next_6_months'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                          : ''
                      }`}
                    >
                      Próximos 6 Meses
                    </button>
                    <div className="my-1 border-t border-slate-100 dark:border-slate-800" />
                    <button
                      type="button"
                      onClick={() => handlePeriodChange('previous_month')}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 cursor-pointer ${
                        filter.period === 'previous_month'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                          : ''
                      }`}
                    >
                      Mês Anterior
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePeriodChange('all')}
                      className={`w-full text-left px-3 py-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-500 cursor-pointer ${
                        filter.period === 'all'
                          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-semibold'
                          : ''
                      }`}
                    >
                      Todo o Histórico
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="flex md:hidden items-center shrink-0">
              <button
                type="button"
                onClick={goToNextMonth}
                className="p-1 min-w-[28px] min-h-[34px] flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                title="Próximo mês"
                aria-label="Próximo mês"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* ITEM 5: Quick Income/Expense Shortcuts + Mobile Account/Admin Menu */}
        <div className="order-6 min-[1900px]:order-6 ml-auto min-[1900px]:ml-0 flex items-center gap-1 sm:gap-1.5 min-[1900px]:gap-1 shrink-0">
          {/* Quick Income shortcut */}
          <button
            type="button"
            onClick={() => openQuickEntry('income')}
            className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 min-[1900px]:px-2 py-1.5 min-h-[34px] sm:min-h-[36px] text-[11px] sm:text-xs min-[1900px]:text-[11px] font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 border border-emerald-200/60 dark:border-emerald-800/60 rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            <ArrowUpRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span>+ Entrada</span>
          </button>

          {/* Quick Expense shortcut */}
          <button
            type="button"
            onClick={() => openQuickEntry('expense')}
            className="inline-flex items-center gap-1 px-1.5 sm:px-2.5 min-[1900px]:px-2 py-1.5 min-h-[34px] sm:min-h-[36px] text-[11px] sm:text-xs min-[1900px]:text-[11px] font-semibold text-rose-700 dark:text-rose-300 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/40 border border-rose-200/60 dark:border-rose-800/60 rounded-xl transition-all cursor-pointer whitespace-nowrap"
          >
            <ArrowDownRight className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
            <span>+ Despesa</span>
          </button>

          {/* Smartphone (< sm) Compact Account, Master & Cloud Menu */}
          <div className="relative sm:hidden">
            <button
              type="button"
              onClick={() => {
                setIsMobileAccountOpen(!isMobileAccountOpen);
                setIsMobilePeriodOpen(false);
              }}
              aria-expanded={isMobileAccountOpen}
              aria-label="Conta, nuvem e opções"
              title="Conta, nuvem e sair"
              className="p-1.5 min-w-[34px] min-h-[34px] flex items-center justify-center rounded-xl border border-slate-200/80 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer"
            >
              <User className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            </button>

            {isMobileAccountOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMobileAccountOpen(false)}
                  aria-hidden="true"
                />
                <div className="absolute right-0 mt-1.5 w-64 max-w-[calc(100vw-1.5rem)] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl shadow-xl p-2 z-50 text-xs space-y-1.5">
                  <div className="px-2.5 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/70 border border-slate-200/60 dark:border-slate-700/60 min-w-0">
                    <div className="font-bold text-slate-900 dark:text-white truncate">
                      {supabaseUserDisplayName || 'Usuário conectado'}
                    </div>
                    {supabaseUserEmail && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {supabaseUserEmail}
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileAccountOpen(false);
                      void handleHeaderCloudSync();
                    }}
                    disabled={isSyncTriggering || cloudSyncStatus === 'syncing'}
                    className={`w-full px-2.5 py-2 rounded-lg border flex items-center justify-between gap-2 font-medium cursor-pointer disabled:opacity-70 ${cloudStatusStyles}`}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      {cloudStatusIcon}
                      <span className="truncate">{cloudStatusLabel}</span>
                    </span>
                    <span className="text-[10px] opacity-80 shrink-0">Sincronizar</span>
                  </button>

                  {isMasterAdmin && onOpenMasterPortal && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsMobileAccountOpen(false);
                        onOpenMasterPortal();
                      }}
                      className="w-full px-2.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white font-bold flex items-center gap-2 cursor-pointer"
                    >
                      <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                      <span>Gestão Comercial</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsMobileAccountOpen(false);
                      if (requestSafeLogout) {
                        requestSafeLogout();
                      } else {
                        logout();
                      }
                    }}
                    className="w-full px-2.5 py-2 rounded-lg border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-700 dark:text-rose-300 font-semibold flex items-center gap-2 cursor-pointer"
                  >
                    <LogOut className="w-3.5 h-3.5 shrink-0" />
                    <span>Sair da conta</span>
                  </button>
                </div>
              </>
            )}
          </div>
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
