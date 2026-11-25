/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useId, useMemo } from 'react';
import { Plus, Sparkles, ArrowDownRight, ArrowUpRight, Check, CreditCard, Wallet, Repeat, Calendar } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { PaymentMethod, RecurringIncomeRule, TransactionType } from '../../types/finance';
import { formatCurrency, getTodayISO } from '../../utils/formatters';
import { calculateRecurringIncomeAnnualTotal, clampDayOfMonth, parseISODateParts } from '../../utils/recurringIncome';
import { ResponsiveModal } from '../common/ResponsiveModal';

const PRESET_QUICK_EXPENSES = [
  { label: 'Bala/Doce', amount: 2.50, category: 'Alimentação', type: 'expense_variable' as TransactionType, icon: '🍬' },
  { label: 'Cafézinho', amount: 6.00, category: 'Alimentação', type: 'expense_variable' as TransactionType, icon: '☕' },
  { label: 'Lanche / Café', amount: 18.00, category: 'Lanches e Delivery', type: 'expense_variable' as TransactionType, icon: '🥪' },
  { label: 'Uber / Táxi', amount: 24.50, category: 'Transporte / Uber', type: 'expense_variable' as TransactionType, icon: '🚗' },
  { label: 'Almoço Executivo', amount: 35.00, category: 'Alimentação', type: 'expense_variable' as TransactionType, icon: '🍽️' },
  { label: 'Supermercado Rápido', amount: 85.00, category: 'Supermercado', type: 'expense_variable' as TransactionType, icon: '🛒' },
];

export const QuickEntryModal: React.FC = () => {
  const {
    isQuickEntryOpen,
    quickEntryType,
    closeQuickEntry,
    addTransaction,
    addRecurringIncome,
    categories,
    accounts,
    creditCards,
  } = useFinance();

  const fieldIdPrefix = useId();
  const amountId = `${fieldIdPrefix}-amount`;
  const descriptionId = `${fieldIdPrefix}-description`;
  const categorySelectId = `${fieldIdPrefix}-category`;
  const expenseTypeLabelId = `${fieldIdPrefix}-expense-type-label`;
  const incomeAccountId = `${fieldIdPrefix}-income-account`;
  const paymentMethodId = `${fieldIdPrefix}-payment-method`;
  const creditCardSelectId = `${fieldIdPrefix}-credit-card`;
  const expenseAccountId = `${fieldIdPrefix}-expense-account`;
  const dateId = `${fieldIdPrefix}-date`;
  const dueDateId = `${fieldIdPrefix}-due-date`;
  const statusId = `${fieldIdPrefix}-status`;
  const installmentsId = `${fieldIdPrefix}-installments`;

  // Recurring income field IDs
  const recurringToggleId = `${fieldIdPrefix}-recurring-income-toggle`;
  const recurringFreqId = `${fieldIdPrefix}-recurring-frequency`;
  const recurringDayId = `${fieldIdPrefix}-recurring-day`;
  const recurringStartDateId = `${fieldIdPrefix}-recurring-start-date`;
  const recurringIndefiniteId = `${fieldIdPrefix}-recurring-indefinite`;
  const recurringEndDateId = `${fieldIdPrefix}-recurring-end-date`;
  const recurringPaymentMethodId = `${fieldIdPrefix}-recurring-payment-method`;
  const recurringFirstStatusId = `${fieldIdPrefix}-recurring-first-status`;
  const recurringNotesId = `${fieldIdPrefix}-recurring-notes`;

  const [activeTab, setActiveTab] = useState<'expense' | 'income'>('expense');
  const [description, setDescription] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [expenseType, setExpenseType] = useState<'fixed' | 'variable'>('variable');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('pix');
  const [accountId, setAccountId] = useState('');
  const [creditCardId, setCreditCardId] = useState('');
  const [date, setDate] = useState(getTodayISO());
  const [dueDate, setDueDate] = useState(getTodayISO());
  const [status, setStatus] = useState<'paid' | 'pending'>('paid');
  const [installments, setInstallments] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Recurring Income state (default OFF)
  const [isRecurringIncome, setIsRecurringIncome] = useState(false);
  const [recurringDayOfMonth, setRecurringDayOfMonth] = useState<number>(() => new Date().getDate());
  const [recurringStartDate, setRecurringStartDate] = useState(getTodayISO());
  const [recurringIsIndefinite, setRecurringIsIndefinite] = useState(true);
  const [recurringEndDate, setRecurringEndDate] = useState('');
  const [recurringFirstStatus, setRecurringFirstStatus] = useState<'pending' | 'paid'>('pending');
  const [recurringNotes, setRecurringNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (quickEntryType === 'income') {
      setActiveTab('income');
    } else {
      setActiveTab('expense');
    }
    const today = getTodayISO();
    setDate(today);
    setDueDate(today);
    setRecurringStartDate(today);
    const parts = parseISODateParts(today);
    setRecurringDayOfMonth(parts ? parts.day : new Date().getDate());
    setIsRecurringIncome(false);
    setRecurringIsIndefinite(true);
    setRecurringEndDate('');
    setRecurringFirstStatus('pending');
    setRecurringNotes('');
    setFormError(null);
    setSavedSuccess(false);
  }, [quickEntryType, isQuickEntryOpen]);

  // Set default account/card and category
  useEffect(() => {
    if (accounts.length > 0 && !accountId) {
      setAccountId(accounts[0].id);
    }
    if (creditCards.length > 0 && !creditCardId) {
      setCreditCardId(creditCards[0].id);
    }
  }, [accounts, creditCards, accountId, creditCardId]);

  // Update default category when tab changes
  useEffect(() => {
    const relevantCats = categories.filter(c => c.type === (activeTab === 'income' ? 'income' : 'expense'));
    if (relevantCats.length > 0) {
      setCategoryId(relevantCats[0].name);
    }
  }, [activeTab, categories]);

  const relevantCategories = categories.filter(c => c.type === (activeTab === 'income' ? 'income' : 'expense'));

  const todayISO = getTodayISO();
  const parsedAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
  const cleanAmount = !isNaN(parsedAmount) && parsedAmount > 0 ? parsedAmount : 0;

  const isFutureRecurringStart = recurringStartDate > todayISO;

  const estimatedAnnualProjection = useMemo(() => {
    if (!isRecurringIncome || cleanAmount <= 0 || !recurringStartDate) return 0;
    const previewRule: RecurringIncomeRule = {
      id: 'preview',
      description: description.trim() || 'Preview',
      amount: cleanAmount,
      category: categoryId || 'Salário',
      accountId: accountId || undefined,
      paymentMethod,
      frequency: 'monthly',
      dayOfMonth: clampDayOfMonth(recurringDayOfMonth),
      startDate: recurringStartDate,
      startPeriod: recurringStartDate.slice(0, 7),
      isIndefinite: recurringIsIndefinite,
      endDate: recurringIsIndefinite ? undefined : recurringEndDate || undefined,
      endPeriod: !recurringIsIndefinite && recurringEndDate ? recurringEndDate.slice(0, 7) : undefined,
      isActive: true,
      createdAt: '',
      updatedAt: '',
    };
    return calculateRecurringIncomeAnnualTotal(previewRule, previewRule.startPeriod);
  }, [
    isRecurringIncome,
    cleanAmount,
    description,
    categoryId,
    accountId,
    paymentMethod,
    recurringDayOfMonth,
    recurringStartDate,
    recurringIsIndefinite,
    recurringEndDate,
  ]);

  const handleApplyPreset = (preset: typeof PRESET_QUICK_EXPENSES[0]) => {
    setDescription(preset.label);
    setAmountStr(preset.amount.toFixed(2).replace('.', ','));
    setCategoryId(preset.category);
    setExpenseType('variable');
    setStatus('paid');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setFormError('Informe um valor maior que zero.');
      return;
    }
    if (!description.trim()) {
      setFormError('Informe uma descrição para o lançamento.');
      return;
    }

    if (activeTab === 'income' && isRecurringIncome) {
      if (!recurringStartDate || !parseISODateParts(recurringStartDate)) {
        setFormError('Informe uma data de início válida para a recorrência.');
        return;
      }
      if (!recurringIsIndefinite) {
        if (!recurringEndDate || !parseISODateParts(recurringEndDate)) {
          setFormError('Informe a data de término da receita recorrente ou marque como indeterminada.');
          return;
        }
        if (recurringEndDate < recurringStartDate) {
          setFormError('A data de término não pode ser anterior à data de início.');
          return;
        }
      }

      addRecurringIncome?.({
        description: description.trim(),
        amount: parsedAmount,
        category: categoryId || 'Salário',
        accountId: accountId || undefined,
        paymentMethod: paymentMethod === 'credit_card' ? 'bank_transfer' : paymentMethod,
        dayOfMonth: clampDayOfMonth(recurringDayOfMonth),
        startDate: recurringStartDate,
        isIndefinite: recurringIsIndefinite,
        endDate: recurringIsIndefinite ? undefined : recurringEndDate,
        firstOccurrenceStatus: isFutureRecurringStart ? 'pending' : recurringFirstStatus,
        notes: recurringNotes.trim() || undefined,
      });

      setSavedSuccess(true);
      setTimeout(() => {
        setDescription('');
        setAmountStr('');
        setIsRecurringIncome(false);
        setRecurringNotes('');
        setShowAdvanced(false);
        closeQuickEntry();
      }, 450);
      return;
    }

    let txType: TransactionType;
    if (activeTab === 'income') {
      txType = 'income';
    } else {
      txType = expenseType === 'fixed' ? 'expense_fixed' : 'expense_variable';
    }

    addTransaction(
      {
        description: description.trim(),
        amount: parsedAmount,
        type: txType,
        category: categoryId || 'Geral',
        date,
        dueDate: txType !== 'income' ? dueDate : undefined,
        accountId: paymentMethod === 'credit_card' ? undefined : accountId,
        creditCardId: paymentMethod === 'credit_card' ? creditCardId : undefined,
        paymentMethod,
        status,
        isRecurring: txType !== 'income' && expenseType === 'fixed',
      },
      paymentMethod === 'credit_card' && installments > 1 ? installments : 1
    );

    setSavedSuccess(true);
    setTimeout(() => {
      setDescription('');
      setAmountStr('');
      setShowAdvanced(false);
      setInstallments(1);
      closeQuickEntry();
    }, 450);
  };

  return (
    <ResponsiveModal
      isOpen={isQuickEntryOpen}
      onClose={closeQuickEntry}
      title="Lançamento Rápido"
      subtitle="Atualização Instantânea"
      size="lg"
      onSubmit={handleSubmit}
      footer={
        <button
          type="submit"
          disabled={savedSuccess}
          className={`w-full min-h-[44px] py-3 px-4 font-medium text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm cursor-pointer ${
            savedSuccess
              ? 'bg-emerald-600 text-white'
              : activeTab === 'expense'
              ? 'bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'
          }`}
        >
          {savedSuccess ? (
            <>
              <Check className="w-4 h-4 animate-in zoom-in" />
              <span>
                {activeTab === 'income' && isRecurringIncome
                  ? 'Receita Fixa Mensal Cadastrada!'
                  : 'Lançamento Registrado com Sucesso!'}
              </span>
            </>
          ) : (
            <>
              <Plus className="w-4 h-4" />
              <span>
                {activeTab === 'expense'
                  ? 'Salvar Despesa'
                  : isRecurringIncome
                  ? 'Salvar Receita Fixa Mensal'
                  : 'Salvar Entrada'}
              </span>
            </>
          )}
        </button>
      }
    >
      {/* Tab Selector: Despesa vs Entrada */}
      <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
        <button
          type="button"
          onClick={() => {
            setActiveTab('expense');
            setFormError(null);
          }}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] py-2 px-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
            activeTab === 'expense'
              ? 'bg-rose-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <ArrowDownRight className="w-4 h-4 shrink-0" />
          <span className="truncate">Despesa (Saída)</span>
        </button>
        <button
          type="button"
          onClick={() => {
            setActiveTab('income');
            setFormError(null);
          }}
          className={`flex items-center justify-center gap-1.5 sm:gap-2 min-h-[40px] py-2 px-2 text-xs sm:text-sm font-medium rounded-lg transition-all cursor-pointer ${
            activeTab === 'income'
              ? 'bg-emerald-600 text-white shadow-sm'
              : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
          }`}
        >
          <ArrowUpRight className="w-4 h-4 shrink-0" />
          <span className="truncate">Receita (Entrada)</span>
        </button>
      </div>

      {formError && (
        <div
          role="alert"
          className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900/60 text-xs text-rose-700 dark:text-rose-300 font-medium"
        >
          {formError}
        </div>
      )}

      {/* 1-Click Fast Presets (Only on Expense) */}
      {activeTab === 'expense' && (
        <div>
          <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-500 font-medium">
            <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" />
            <span>Atalhos rápidos de pequenos gastos:</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {PRESET_QUICK_EXPENSES.map((p, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => handleApplyPreset(p)}
                className="flex items-center gap-1.5 px-2.5 py-2 text-xs text-left bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors min-w-0 cursor-pointer"
              >
                <span className="shrink-0">{p.icon}</span>
                <span className="truncate">{p.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Valor Principal (Hero Input) */}
      <div>
        <label htmlFor={amountId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Valor (R$) *
        </label>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-lg">
            R$
          </span>
          <input
            id={amountId}
            name="amount"
            type="text"
            required
            autoFocus
            autoComplete="off"
            placeholder="0,00"
            value={amountStr}
            onChange={e => {
              const val = e.target.value.replace(/[^0-9,]/g, '');
              setAmountStr(val);
            }}
            className="w-full min-w-0 pl-12 pr-4 py-2.5 text-2xl font-mono font-bold tracking-tight bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums"
          />
        </div>
      </div>

      {/* Descrição */}
      <div>
        <label htmlFor={descriptionId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
          Descrição do Lançamento *
        </label>
        <input
          id={descriptionId}
          name="description"
          type="text"
          required
          autoComplete="off"
          placeholder={
            activeTab === 'expense'
              ? 'Ex: Bala na padaria, Café, Supermercado...'
              : 'Ex: Salário, Aposentadoria, Aluguel recebido, PIX de freelance...'
          }
          value={description}
          onChange={e => setDescription(e.target.value)}
          className="w-full min-w-0 px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
        />
      </div>

      {/* Categoria & Tipo */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="min-w-0">
          <label htmlFor={categorySelectId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
            Categoria
          </label>
          <select
            id={categorySelectId}
            name="category"
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          >
            {relevantCategories.map(cat => (
              <option key={cat.id} value={cat.name}>
                {cat.name}
              </option>
            ))}
          </select>
        </div>

        {activeTab === 'expense' ? (
          <div className="min-w-0">
            <span id={expenseTypeLabelId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Tipo de Despesa
            </span>
            <div role="group" aria-labelledby={expenseTypeLabelId} className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
              <button
                type="button"
                onClick={() => setExpenseType('variable')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  expenseType === 'variable'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Variável
              </button>
              <button
                type="button"
                onClick={() => setExpenseType('fixed')}
                className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer ${
                  expenseType === 'fixed'
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                Fixa
              </button>
            </div>
          </div>
        ) : (
          <div className="min-w-0">
            <label htmlFor={incomeAccountId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Conta de Destino
            </label>
            <select
              id={incomeAccountId}
              name="income_account_id"
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              {accounts.map(acc => (
                <option key={acc.id} value={acc.id}>
                  {acc.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Opção de Receita Fixa Mensal (somente em Entrada) */}
      {activeTab === 'income' && (
        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <label
                htmlFor={recurringToggleId}
                className="text-xs font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                <Repeat className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Receita fixa mensal</span>
              </label>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Repita automaticamente esta previsão de receita nos próximos meses.
              </p>
            </div>
            <input
              id={recurringToggleId}
              name="is_recurring_income"
              type="checkbox"
              checked={isRecurringIncome}
              onChange={e => {
                const checked = e.target.checked;
                setIsRecurringIncome(checked);
                if (checked) {
                  const parts = parseISODateParts(recurringStartDate || date);
                  if (parts) setRecurringDayOfMonth(parts.day);
                }
              }}
              className="mt-0.5 h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer shrink-0"
            />
          </div>

          {isRecurringIncome && (
            <div className="pt-2 border-t border-slate-200/80 dark:border-slate-700/70 space-y-3 text-xs animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label htmlFor={recurringFreqId} className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Frequência
                  </label>
                  <select
                    id={recurringFreqId}
                    name="recurring_frequency"
                    value="monthly"
                    onChange={() => {}}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="monthly">Mensal</option>
                  </select>
                </div>

                <div>
                  <label htmlFor={recurringDayId} className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Dia do recebimento (1–31)
                  </label>
                  <input
                    id={recurringDayId}
                    name="recurring_day_of_month"
                    type="number"
                    min={1}
                    max={31}
                    required
                    value={recurringDayOfMonth}
                    onChange={e => setRecurringDayOfMonth(clampDayOfMonth(parseInt(e.target.value, 10) || 1))}
                    className="w-full px-2.5 py-1.5 font-mono bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label htmlFor={recurringStartDateId} className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                    Data de início *
                  </label>
                  <input
                    id={recurringStartDateId}
                    name="recurring_start_date"
                    type="date"
                    required
                    value={recurringStartDate}
                    onChange={e => setRecurringStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {recurringDayOfMonth >= 29 && (
                <p className="text-[11px] text-amber-600 dark:text-amber-400">
                  Em meses com menos de {recurringDayOfMonth} dias (como fevereiro ou abril), a data prevista será ajustada automaticamente para o último dia do mês, mantendo o dia {recurringDayOfMonth} configurado.
                </p>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      id={recurringIndefiniteId}
                      name="recurring_is_indefinite"
                      type="checkbox"
                      checked={recurringIsIndefinite}
                      onChange={e => {
                        setRecurringIsIndefinite(e.target.checked);
                        if (e.target.checked) setRecurringEndDate('');
                      }}
                      className="h-4 w-4 rounded border-slate-300 dark:border-slate-600 text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                    />
                    <label htmlFor={recurringIndefiniteId} className="text-xs font-medium text-slate-700 dark:text-slate-300 cursor-pointer">
                      Sem data de término (indeterminada)
                    </label>
                  </div>

                  {!recurringIsIndefinite && (
                    <div>
                      <label htmlFor={recurringEndDateId} className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                        Data de término *
                      </label>
                      <input
                        id={recurringEndDateId}
                        name="recurring_end_date"
                        type="date"
                        min={recurringStartDate}
                        required={!recurringIsIndefinite}
                        value={recurringEndDate}
                        onChange={e => setRecurringEndDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                      />
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-2">
                  <div>
                    <label htmlFor={recurringPaymentMethodId} className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Forma de Recebimento
                    </label>
                    <select
                      id={recurringPaymentMethodId}
                      name="recurring_payment_method"
                      value={paymentMethod === 'credit_card' ? 'bank_transfer' : paymentMethod}
                      onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    >
                      <option value="bank_transfer">Transferência / TED / DOC</option>
                      <option value="pix">PIX</option>
                      <option value="money">Dinheiro em Espécie</option>
                      <option value="debit_card">Cartão Benefício / Débito</option>
                      <option value="bank_slip">Boleto / Ordem Bancária</option>
                    </select>
                  </div>

                  <div>
                    <label htmlFor={recurringFirstStatusId} className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                      Situação da 1ª Ocorrência
                    </label>
                    <select
                      id={recurringFirstStatusId}
                      name="recurring_first_status"
                      disabled={isFutureRecurringStart}
                      value={isFutureRecurringStart ? 'pending' : recurringFirstStatus}
                      onChange={e => setRecurringFirstStatus(e.target.value as 'pending' | 'paid')}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white disabled:opacity-60"
                    >
                      <option value="pending">Prevista (a receber)</option>
                      {!isFutureRecurringStart && (
                        <option value="paid">Já recebida na conta</option>
                      )}
                    </select>
                    {isFutureRecurringStart && (
                      <p className="text-[10px] text-slate-400 mt-1">
                        Inícios futuros são registrados sempre como previsão, sem alterar o saldo atual.
                      </p>
                    )}
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor={recurringNotesId} className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Observações (opcional)
                </label>
                <input
                  id={recurringNotesId}
                  name="recurring_notes"
                  type="text"
                  autoComplete="off"
                  placeholder="Ex: Salário líquido após descontos, contrato até..."
                  value={recurringNotes}
                  onChange={e => setRecurringNotes(e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                />
              </div>

              {/* Projeção Anual Estimada */}
              <div className="flex items-center justify-between gap-3 px-3 py-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
                <div className="flex items-center gap-2 min-w-0">
                  <Calendar className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <div className="min-w-0">
                    <span className="text-[11px] font-semibold text-emerald-800 dark:text-emerald-300 block">
                      Projeção anual (12 meses)
                    </span>
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Considerada automaticamente nas projeções futuras sem afetar o saldo atual
                    </span>
                  </div>
                </div>
                <span className="font-mono font-bold text-sm text-emerald-700 dark:text-emerald-300 tabular-nums shrink-0">
                  {formatCurrency(estimatedAnnualProjection)}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Forma de Pagamento e Conta/Cartão (para Despesa) */}
      {activeTab === 'expense' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="min-w-0">
            <label htmlFor={paymentMethodId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Forma de Pagamento
            </label>
            <select
              id={paymentMethodId}
              name="payment_method"
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as PaymentMethod)}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            >
              <option value="pix">PIX</option>
              <option value="debit_card">Cartão de Débito</option>
              <option value="credit_card">Cartão de Crédito</option>
              <option value="money">Dinheiro em Espécie</option>
              <option value="bank_slip">Boleto Bancário</option>
              <option value="bank_transfer">Transferência Bancária</option>
            </select>
          </div>

          <div className="min-w-0">
            {paymentMethod === 'credit_card' ? (
              <>
                <label htmlFor={creditCardSelectId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <CreditCard className="w-3 h-3 text-purple-500 shrink-0" />
                  <span>Cartão Utilizado</span>
                </label>
                <select
                  id={creditCardSelectId}
                  name="credit_card_id"
                  value={creditCardId}
                  onChange={e => setCreditCardId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  {creditCards.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </>
            ) : (
              <>
                <label htmlFor={expenseAccountId} className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                  <Wallet className="w-3 h-3 text-blue-500 shrink-0" />
                  <span>Conta de Saída</span>
                </label>
                <select
                  id={expenseAccountId}
                  name="expense_account_id"
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
                >
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name}
                    </option>
                  ))}
                </select>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toggle Advanced details (para lançamentos avulsos) */}
      {!(activeTab === 'income' && isRecurringIncome) && (
        <>
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium flex items-center gap-1 transition-colors cursor-pointer"
            >
              <span>{showAdvanced ? '− Menos opções' : '+ Mais opções (data, parcelas, status)'}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-3 border border-slate-200/60 dark:border-slate-800 text-xs animate-in fade-in">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={dateId} className="block text-slate-500 mb-1">Data do Lançamento</label>
                  <input
                    id={dateId}
                    name="date"
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                {activeTab === 'expense' && (
                  <div>
                    <label htmlFor={dueDateId} className="block text-slate-500 mb-1">Data de Vencimento</label>
                    <input
                      id={dueDateId}
                      name="due_date"
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label htmlFor={statusId} className="block text-slate-500 mb-1">Situação / Status</label>
                  <select
                    id={statusId}
                    name="status"
                    value={status}
                    onChange={e => setStatus(e.target.value as 'paid' | 'pending')}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  >
                    <option value="paid">{activeTab === 'expense' ? 'Já Pago (Efetivado)' : 'Recebido na Conta'}</option>
                    <option value="pending">{activeTab === 'expense' ? 'Pendente (A pagar)' : 'Previsto (A receber)'}</option>
                  </select>
                </div>

                {activeTab === 'expense' && paymentMethod === 'credit_card' && (
                  <div>
                    <label htmlFor={installmentsId} className="block text-slate-500 mb-1">Parcelamento</label>
                    <select
                      id={installmentsId}
                      name="installments"
                      value={installments}
                      onChange={e => setInstallments(parseInt(e.target.value, 10))}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    >
                      <option value={1}>À vista (1x)</option>
                      {[2, 3, 4, 5, 6, 8, 10, 12, 18, 24].map(n => (
                        <option key={n} value={n}>{n}x mensais</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </ResponsiveModal>
  );
};
