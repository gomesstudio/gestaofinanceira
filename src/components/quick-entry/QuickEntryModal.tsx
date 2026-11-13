/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { X, Plus, Sparkles, ArrowDownRight, ArrowUpRight, Check, CreditCard, Wallet } from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { PaymentMethod, TransactionType } from '../../types/finance';
import { getTodayISO } from '../../utils/formatters';

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
    categories,
    accounts,
    creditCards,
  } = useFinance();

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

  useEffect(() => {
    if (quickEntryType === 'income') {
      setActiveTab('income');
    } else {
      setActiveTab('expense');
    }
    setDate(getTodayISO());
    setDueDate(getTodayISO());
    setSavedSuccess(false);
  }, [quickEntryType, isQuickEntryOpen]);

  // Handle ESC key to close modal
  useEffect(() => {
    if (!isQuickEntryOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeQuickEntry();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isQuickEntryOpen, closeQuickEntry]);

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

  if (!isQuickEntryOpen) return null;

  const relevantCategories = categories.filter(c => c.type === (activeTab === 'income' ? 'income' : 'expense'));

  const handleApplyPreset = (preset: typeof PRESET_QUICK_EXPENSES[0]) => {
    setDescription(preset.label);
    setAmountStr(preset.amount.toFixed(2).replace('.', ','));
    setCategoryId(preset.category);
    setExpenseType('variable');
    setStatus('paid');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanAmount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(cleanAmount) || cleanAmount <= 0) return;
    if (!description.trim()) return;

    let txType: TransactionType;
    if (activeTab === 'income') {
      txType = 'income';
    } else {
      txType = expenseType === 'fixed' ? 'expense_fixed' : 'expense_variable';
    }

    addTransaction(
      {
        description: description.trim(),
        amount: cleanAmount,
        type: txType,
        category: categoryId || 'Geral',
        date,
        dueDate: txType !== 'income' ? dueDate : undefined,
        accountId: paymentMethod === 'credit_card' ? undefined : accountId,
        creditCardId: paymentMethod === 'credit_card' ? creditCardId : undefined,
        paymentMethod,
        status,
        isRecurring: expenseType === 'fixed',
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
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150"
      onClick={closeQuickEntry}
    >
      <div 
        className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden transition-all"
        role="dialog"
        aria-modal="true"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100 text-base">
              Lançamento Rápido
            </span>
            <span className="text-xs text-slate-500">· Atualização Instantânea</span>
          </div>
          <button
            onClick={closeQuickEntry}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Selector: Despesa vs Entrada */}
        <div className="px-5 pt-4">
          <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-slate-800/80 rounded-xl">
            <button
              type="button"
              onClick={() => setActiveTab('expense')}
              className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'expense'
                  ? 'bg-rose-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <ArrowDownRight className="w-4 h-4" />
              <span>Despesa (Saída)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('income')}
              className={`flex items-center justify-center gap-2 py-2 text-sm font-medium rounded-lg transition-all ${
                activeTab === 'income'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
              }`}
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>Receita (Entrada)</span>
            </button>
          </div>
        </div>

        {/* 1-Click Fast Presets (Only on Expense) */}
        {activeTab === 'expense' && (
          <div className="px-5 pt-3">
            <div className="flex items-center gap-1.5 mb-2 text-xs text-slate-500 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>Atalhos rápidos de pequenos gastos:</span>
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESET_QUICK_EXPENSES.map((p, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleApplyPreset(p)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-left bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-lg text-slate-700 dark:text-slate-300 transition-colors truncate"
                >
                  <span>{p.icon}</span>
                  <span className="truncate">{p.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Main Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {/* Valor Principal (Hero Input) */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Valor (R$) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono font-bold text-slate-400 text-lg">
                R$
              </span>
              <input
                type="text"
                required
                autoFocus
                placeholder="0,00"
                value={amountStr}
                onChange={e => {
                  // Allow numbers and comma
                  const val = e.target.value.replace(/[^0-9,]/g, '');
                  setAmountStr(val);
                }}
                className="w-full pl-12 pr-4 py-2.5 text-2xl font-mono font-bold tracking-tight bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent tabular-nums"
              />
            </div>
          </div>

          {/* Descrição */}
          <div>
            <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
              Descrição do Lançamento *
            </label>
            <input
              type="text"
              required
              placeholder={activeTab === 'expense' ? 'Ex: Bala na padaria, Café, Supermercado...' : 'Ex: Salário, PIX de freelance, Restituição...'}
              value={description}
              onChange={e => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
          </div>

          {/* Categoria & Tipo */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                Categoria
              </label>
              <select
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
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Tipo de Despesa
                </label>
                <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-0.5">
                  <button
                    type="button"
                    onClick={() => setExpenseType('variable')}
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
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
                    className={`flex-1 py-1.5 text-xs font-medium rounded-md transition-colors ${
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
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Conta de Destino
                </label>
                <select
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

          {/* Forma de Pagamento e Conta/Cartão (para Despesa) */}
          {activeTab === 'expense' && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1">
                  Forma de Pagamento
                </label>
                <select
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

              <div>
                {paymentMethod === 'credit_card' ? (
                  <>
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                      <CreditCard className="w-3 h-3 text-purple-500" />
                      Cartão Utilizado
                    </label>
                    <select
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
                    <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                      <Wallet className="w-3 h-3 text-blue-500" />
                      Conta de Saída
                    </label>
                    <select
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

          {/* Toggle Advanced details (Data, Vencimento, Parcelas) */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 font-medium flex items-center gap-1 transition-colors"
            >
              <span>{showAdvanced ? '− Menos opções' : '+ Mais opções (data, parcelas, status)'}</span>
            </button>
          </div>

          {showAdvanced && (
            <div className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-xl space-y-3 border border-slate-200/60 dark:border-slate-800 text-xs animate-in fade-in">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Data do Lançamento</label>
                  <input
                    type="date"
                    value={date}
                    onChange={e => setDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                  />
                </div>
                {activeTab === 'expense' && (
                  <div>
                    <label className="block text-slate-500 mb-1">Data de Vencimento</label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white"
                    />
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 mb-1">Situação / Status</label>
                  <select
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
                    <label className="block text-slate-500 mb-1">Parcelamento</label>
                    <select
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

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={savedSuccess}
              className={`w-full py-3 px-4 font-medium text-sm rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm ${
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
                  <span>Lançamento Registrado com Sucesso!</span>
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4" />
                  <span>Salvar {activeTab === 'expense' ? 'Despesa' : 'Entrada'}</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
