/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  X,
  CreditCard,
  Plus
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getMonthNamePT, getTodayISO } from '../../utils/formatters';
import { getRecurringIncomesForMonth } from '../../utils/recurringIncome';
import {
  buildPeriodString,
  buildProjectedTransactionsForMonth,
  getTransactionEffectiveDate,
  isVirtualTransaction
} from '../../utils/periodFilter';
import { Transaction } from '../../types/finance';

export const FinancialCalendarView: React.FC = () => {
  const {
    transactions,
    recurringIncomes = [],
    creditCards,
    openQuickEntry,
    selectedYear,
    selectedMonth
  } = useFinance();

  const [currentDate, setCurrentDate] = useState(() => new Date(selectedYear, selectedMonth, 1));
  const [selectedDayISO, setSelectedDayISO] = useState<string | null>(getTodayISO());

  useEffect(() => {
    setCurrentDate(new Date(selectedYear, selectedMonth, 1));
  }, [selectedYear, selectedMonth]);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth(); // 0-11

  const todayStr = getTodayISO();
  const viewedPeriod = buildPeriodString(year, month);
  const currentPeriod = todayStr.slice(0, 7);
  const isViewedFuture = viewedPeriod > currentPeriod;

  // Navigation handlers
  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleGoToday = () => {
    const now = new Date();
    setCurrentDate(now);
    setSelectedDayISO(getTodayISO());
  };

  // Calendar matrix calculation
  const firstDayOfMonth = new Date(year, month, 1).getDay(); // 0 is Sunday
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const daysInPrevMonth = new Date(year, month, 0).getDate();

  // Map events to date strings (YYYY-MM-DD)
  const eventsByDay: { [dateStr: string]: Transaction[] } = {};

  transactions.forEach(tx => {
    const effectiveDate = getTransactionEffectiveDate(tx);
    if (!eventsByDay[effectiveDate]) {
      eventsByDay[effectiveDate] = [];
    }
    eventsByDay[effectiveDate].push(tx);
  });

  if (isViewedFuture) {
    // Inclui receitas fixas recorrentes e despesas fixas explicitamente recorrentes previstas no mês futuro
    const projectedItems = buildProjectedTransactionsForMonth({
      targetYear: year,
      targetMonth: month,
      transactions,
      recurringIncomes,
      todayISO: todayStr
    });
    projectedItems.forEach(pt => {
      const effectiveDate = getTransactionEffectiveDate(pt);
      if (!eventsByDay[effectiveDate]) {
        eventsByDay[effectiveDate] = [];
      }
      eventsByDay[effectiveDate].push(pt);
    });
  } else {
    // Mês atual ou passado: inclui ocorrências virtuais de receitas fixas recorrentes no calendário visual
    const monthRecurringOccurrences = getRecurringIncomesForMonth(
      recurringIncomes,
      year,
      month,
      transactions,
      todayStr
    );
    monthRecurringOccurrences.forEach(occ => {
      if (!occ.isVirtual || occ.status === 'skipped') return;
      const alreadyExists = transactions.some(
        t =>
          t.type === 'income' &&
          ((t.recurringIncomeId && t.recurringIncomeId === occ.ruleId && t.recurringPeriod === occ.period) ||
            (t.date.slice(0, 7) === occ.period &&
              t.description.trim().toLowerCase() === occ.description.trim().toLowerCase()))
      );
      if (alreadyExists) return;
      if (!eventsByDay[occ.date]) {
        eventsByDay[occ.date] = [];
      }
      eventsByDay[occ.date].push({
        id: occ.id,
        description: occ.description,
        amount: occ.amount,
        type: 'income',
        category: occ.category,
        date: occ.date,
        accountId: occ.accountId,
        paymentMethod: occ.paymentMethod,
        status: occ.status === 'overdue' ? 'overdue' : 'pending',
        isRecurring: true,
        recurringIncomeId: occ.isLegacy ? undefined : occ.ruleId,
        recurringPeriod: occ.period,
        notes: occ.notes,
        isVirtualProjection: true,
      });
    });
  }

  // Also include credit card due dates for current month
  creditCards.forEach(card => {
    const cardDueDateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(card.dueDay).padStart(2, '0')}`;
    void cardDueDateStr;
  });

  // Selected day items
  const selectedDayItems = selectedDayISO ? eventsByDay[selectedDayISO] || [] : [];
  const selectedDayTotalIncome = selectedDayItems
    .filter(t => t.type === 'income')
    .reduce((sum, t) => sum + t.amount, 0);
  const selectedDayTotalExpense = selectedDayItems
    .filter(t => t.type === 'expense_fixed' || t.type === 'expense_variable')
    .reduce((sum, t) => sum + t.amount, 0);

  return (
    <div className="space-y-6">
      {/* Header and Month Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <CalendarIcon className="w-5 h-5 text-emerald-500" />
            Calendário Financeiro Mensal
          </h2>
          <p className="text-xs text-slate-500">
            Visualize recebimentos, contas a pagar, parcelas e vencimentos de faturas por dia
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={handleGoToday}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors cursor-pointer"
          >
            Hoje
          </button>
          <div className="flex items-center bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl p-0.5 shadow-xs">
            <button
              onClick={handlePrevMonth}
              aria-label="Mês anterior"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-2 sm:px-3 text-xs font-bold font-mono text-slate-900 dark:text-white min-w-[105px] sm:min-w-[120px] text-center">
              {getMonthNamePT(month)} {year}
            </span>
            <button
              onClick={handleNextMonth}
              aria-label="Próximo mês"
              className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Visual Legend */}
      <div className="flex flex-wrap items-center gap-4 px-4 py-2.5 bg-white dark:bg-slate-900 rounded-xl border border-slate-200/80 dark:border-slate-800 text-xs">
        <span className="text-slate-400 font-medium">Legenda:</span>
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Entrada / Salário
        </span>
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Conta Paga
        </span>
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Conta Pendente
        </span>
        <span className="flex items-center gap-1.5 text-slate-600 dark:text-slate-300">
          <span className="w-2.5 h-2.5 rounded-full bg-rose-500" /> Conta Atrasada
        </span>
      </div>

      {/* Calendar Grid + Day Details Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Calendar Grid (2 cols) */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden">
          {/* Day Names Header */}
          <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 text-center py-2.5 text-xs font-semibold text-slate-400">
            <span>Dom</span>
            <span>Seg</span>
            <span>Ter</span>
            <span>Qua</span>
            <span>Qui</span>
            <span>Sex</span>
            <span>Sáb</span>
          </div>

          {/* Month Matrix Cells */}
          <div className="grid grid-cols-7 auto-rows-fr">
            {/* Previous month trailing days */}
            {Array.from({ length: firstDayOfMonth }).map((_, i) => {
              const dayNum = daysInPrevMonth - firstDayOfMonth + i + 1;
              return (
                <div
                  key={`prev-${i}`}
                  className="min-h-[54px] sm:min-h-[85px] p-1 sm:p-2 border-b border-r border-slate-100 dark:border-slate-800/60 bg-slate-50/40 dark:bg-slate-950/20 text-slate-300 dark:text-slate-600 text-xs select-none"
                >
                  <span className="font-mono text-[10px] sm:text-[11px]">{dayNum}</span>
                </div>
              );
            })}

            {/* Current month days */}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const dayNum = i + 1;
              const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
              const dayItems = eventsByDay[dateStr] || [];
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDayISO;

              // Check statuses
              const hasIncome = dayItems.some(t => t.type === 'income');
              const hasPaid = dayItems.some(t => (t.type === 'expense_fixed' || t.type === 'expense_variable') && t.status === 'paid');
              const hasPending = dayItems.some(t => (t.type === 'expense_fixed' || t.type === 'expense_variable') && t.status !== 'paid' && (!t.dueDate || t.dueDate >= todayStr));
              const hasOverdue = dayItems.some(t => (t.type === 'expense_fixed' || t.type === 'expense_variable') && t.status !== 'paid' && t.dueDate && t.dueDate < todayStr);

              return (
                <div
                  key={dayNum}
                  onClick={() => setSelectedDayISO(dateStr)}
                  className={`min-h-[54px] sm:min-h-[85px] p-1 sm:p-2 border-b border-r border-slate-100 dark:border-slate-800/60 cursor-pointer transition-all flex flex-col justify-between ${
                    isSelected
                      ? 'bg-emerald-50/80 dark:bg-emerald-950/40 ring-2 ring-emerald-500 ring-inset z-10'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                  }`}
                >
                  <div className="flex items-center justify-between gap-0.5">
                    <span
                      className={`font-mono text-[11px] sm:text-xs font-semibold ${
                        isToday
                          ? 'w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-slate-900 text-white dark:bg-emerald-600 flex items-center justify-center font-bold'
                          : 'text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {dayNum}
                    </span>

                    {/* Status dot pills */}
                    <div className="hidden sm:flex items-center gap-1">
                      {hasOverdue && <span className="w-2 h-2 rounded-full bg-rose-500" title="Contas atrasadas" />}
                      {hasPending && <span className="w-2 h-2 rounded-full bg-amber-500" title="Contas pendentes" />}
                      {hasPaid && <span className="w-2 h-2 rounded-full bg-blue-500" title="Contas pagas" />}
                      {hasIncome && <span className="w-2 h-2 rounded-full bg-emerald-500" title="Entradas" />}
                    </div>
                  </div>

                  {/* Mobile compact dots + counter */}
                  {dayItems.length > 0 && (
                    <div className="flex sm:hidden items-center justify-between gap-0.5 mt-1">
                      <div className="flex items-center gap-0.5">
                        {hasOverdue && <span className="w-1.5 h-1.5 rounded-full bg-rose-500" />}
                        {hasPending && <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />}
                        {hasPaid && <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />}
                        {hasIncome && <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />}
                      </div>
                      <span className="text-[9px] font-mono text-slate-400 leading-none">
                        {dayItems.length}
                      </span>
                    </div>
                  )}

                  {/* Summary badges inside cell (tablet/desktop) */}
                  {dayItems.length > 0 && (
                    <div className="hidden sm:block mt-1 space-y-0.5">
                      {dayItems.slice(0, 2).map(t => (
                        <div
                          key={t.id}
                          className={`text-[9px] truncate px-1 py-0.5 rounded-sm font-medium ${
                            t.type === 'income'
                              ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300'
                              : t.status === 'paid'
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                              : 'bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-300'
                          }`}
                        >
                          {t.description}
                        </div>
                      ))}
                      {dayItems.length > 2 && (
                        <div className="text-[9px] text-slate-400 font-mono text-right">
                          +{dayItems.length - 2} mais
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Selected Day Details Panel */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-5 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 mb-3">
              <div>
                <span className="text-[10px] text-slate-400 font-medium uppercase tracking-wider">
                  Detalhes da Data
                </span>
                <h3 className="text-base font-bold text-slate-900 dark:text-white font-mono">
                  {selectedDayISO ? formatDateBR(selectedDayISO) : 'Nenhum dia selecionado'}
                </h3>
              </div>
              <button
                onClick={() => openQuickEntry('expense')}
                className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                title="Novo lançamento neste dia"
              >
                <Plus className="w-4 h-4" />
              </button>
            </div>

            {/* Daily balance summary */}
            <div className="grid grid-cols-2 gap-2 mb-4 p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl text-xs">
              <div>
                <span className="text-slate-400 text-[11px]">Entradas do dia:</span>
                <div className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                  +{formatCurrency(selectedDayTotalIncome)}
                </div>
              </div>
              <div>
                <span className="text-slate-400 text-[11px]">Despesas do dia:</span>
                <div className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                  -{formatCurrency(selectedDayTotalExpense)}
                </div>
              </div>
            </div>

            {/* List of items on this date */}
            <div className="space-y-2 max-h-[360px] overflow-y-auto">
              {selectedDayItems.length === 0 ? (
                <div className="text-center py-10 text-xs text-slate-400">
                  Nenhum vencimento ou pagamento registrado para este dia.
                </div>
              ) : (
                selectedDayItems.map(t => {
                  const isInc = t.type === 'income';
                  const isOver = isInc
                    ? t.status !== 'paid' && t.date < todayStr
                    : t.status !== 'paid' && Boolean(t.dueDate && t.dueDate < todayStr);
                  const isRecurringItem = Boolean(t.recurringIncomeId || (isInc && t.isRecurring));
                  const isProjected = isVirtualTransaction(t);

                  return (
                    <div
                      key={t.id}
                      className="p-2.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 font-medium">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className="text-slate-800 dark:text-slate-200 truncate min-w-0">{t.description}</span>
                          {isRecurringItem && (
                            <span className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[9px] font-semibold shrink-0">
                              Fixa mensal
                            </span>
                          )}
                          {isProjected && !isRecurringItem && (
                            <span className="px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[9px] font-semibold shrink-0">
                              Previsto
                            </span>
                          )}
                        </div>
                        <span
                          className={`font-mono font-bold tabular-nums shrink-0 ${
                            isInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          {isInc ? '+' : '-'} {formatCurrency(t.amount)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>{t.category}</span>
                        <span
                          className={`font-medium ${
                            t.status === 'paid'
                              ? 'text-emerald-600'
                              : isOver
                              ? 'text-rose-600 font-bold'
                              : 'text-amber-600'
                          }`}
                        >
                          {isInc
                            ? t.status === 'paid'
                              ? 'Recebida'
                              : isOver
                              ? 'Prevista em atraso'
                              : 'Prevista'
                            : t.status === 'paid'
                            ? 'Pago'
                            : isOver
                            ? 'Atrasado'
                            : 'Pendente'}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-slate-100 dark:border-slate-800 text-[11px] text-slate-400 text-center">
            Clique em qualquer dia do calendário para inspecionar.
          </div>
        </div>
      </div>
    </div>
  );
};
