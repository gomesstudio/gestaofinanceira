/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Receipt,
  Search,
  Filter,
  ArrowUpRight,
  ArrowDownRight,
  Trash2,
  Copy,
  Edit2,
  CheckCircle2,
  Clock,
  AlertTriangle,
  CreditCard,
  Wallet,
  X,
  Plus
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO } from '../../utils/formatters';
import { Transaction, TransactionStatus, TransactionType } from '../../types/finance';

export const TransactionsView: React.FC = () => {
  const {
    transactions,
    accounts,
    creditCards,
    categories,
    deleteTransaction,
    duplicateTransaction,
    updateTransaction,
    openQuickEntry
  } = useFinance();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [minAmountStr, setMinAmountStr] = useState('');
  const [maxAmountStr, setMaxAmountStr] = useState('');

  // Edit Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState<TransactionStatus>('paid');

  const todayStr = getTodayISO();

  const minAmount = minAmountStr ? parseFloat(minAmountStr.replace(/\./g, '').replace(',', '.')) : 0;
  const maxAmount = maxAmountStr ? parseFloat(maxAmountStr.replace(/\./g, '').replace(',', '.')) : Infinity;

  const filtered = transactions.filter(t => {
    if (search) {
      const q = search.toLowerCase();
      const matchDesc = t.description.toLowerCase().includes(q);
      const matchCat = t.category.toLowerCase().includes(q);
      const matchNotes = t.notes?.toLowerCase().includes(q);
      if (!matchDesc && !matchCat && !matchNotes) return false;
    }

    if (typeFilter !== 'all' && t.type !== typeFilter) return false;
    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

    if (statusFilter === 'paid' && t.status !== 'paid') return false;
    if (statusFilter === 'pending' && (t.status === 'paid' || (t.dueDate && t.dueDate < todayStr))) return false;
    if (statusFilter === 'overdue' && (t.status === 'paid' || !t.dueDate || t.dueDate >= todayStr)) return false;

    if (t.amount < minAmount) return false;
    if (t.amount > maxAmount) return false;

    return true;
  });

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditDesc(tx.description);
    setEditAmountStr(tx.amount.toFixed(2).replace('.', ','));
    setEditCat(tx.category);
    setEditDate(tx.date);
    setEditDueDate(tx.dueDate || tx.date);
    setEditStatus(tx.status);
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx) return;
    const amount = parseFloat(editAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    updateTransaction(editingTx.id, {
      description: editDesc.trim(),
      amount,
      category: editCat,
      date: editDate,
      dueDate: editDueDate || undefined,
      status: editStatus
    });

    setEditingTx(null);
  };

  const allCategories = categories;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Receipt className="w-5 h-5 text-emerald-500" />
            Extrato Geral & Pesquisa
          </h2>
          <p className="text-xs text-slate-500">
            Histórico consolidado com busca avançada, edição e filtros detalhados
          </p>
        </div>
        <button
          onClick={() => openQuickEntry('all')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Novo Lançamento</span>
        </button>
      </div>

      {/* Advanced Filter Bar */}
      <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        {/* Main Search Row */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Pesquisar por descrição, categoria ou anotações..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">Todos os Tipos</option>
              <option value="income">Entradas (Receitas)</option>
              <option value="expense_fixed">Despesas Fixas</option>
              <option value="expense_variable">Despesas Variáveis</option>
              <option value="transfer">Transferências</option>
              <option value="card_payment">Pagamentos de Fatura</option>
              <option value="debt_payment">Pagamentos de Dívida</option>
            </select>

            <select
              value={categoryFilter}
              onChange={e => setCategoryFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">Todas as Categorias</option>
              {allCategories.map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
            >
              <option value="all">Todos os Status</option>
              <option value="paid">Pagos / Recebidos</option>
              <option value="pending">Pendentes</option>
              <option value="overdue">Atrasados</option>
            </select>
          </div>
        </div>

        {/* Secondary Row: Amount Range */}
        <div className="flex items-center gap-2 text-xs text-slate-500 pt-1">
          <span>Faixa de valor:</span>
          <input
            type="text"
            placeholder="Min (R$)"
            value={minAmountStr}
            onChange={e => setMinAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-24 px-2 py-1 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-[11px]"
          />
          <span>até</span>
          <input
            type="text"
            placeholder="Max (R$)"
            value={maxAmountStr}
            onChange={e => setMaxAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-24 px-2 py-1 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white font-mono text-[11px]"
          />
          {(minAmountStr || maxAmountStr || search || typeFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all') && (
            <button
              onClick={() => {
                setSearch('');
                setTypeFilter('all');
                setCategoryFilter('all');
                setStatusFilter('all');
                setMinAmountStr('');
                setMaxAmountStr('');
              }}
              className="text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold underline ml-2"
            >
              Limpar Filtros
            </button>
          )}
        </div>
      </div>

      {/* Transactions Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            Nenhum lançamento corresponde aos critérios da busca.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria / Tipo</th>
                  <th className="py-3 px-4">Conta / Cartão</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filtered.map(tx => {
                  const isInc = tx.type === 'income';
                  const isOver = !isInc && tx.status !== 'paid' && tx.dueDate && tx.dueDate < todayStr;
                  const isCard = tx.paymentMethod === 'credit_card';
                  const account = accounts.find(a => a.id === tx.accountId);
                  const card = creditCards.find(c => c.id === tx.creditCardId);

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatDateBR(tx.date)}
                        {tx.dueDate && tx.dueDate !== tx.date && (
                          <div className="text-[10px] text-slate-400">Venc: {formatDateBR(tx.dueDate)}</div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2 truncate max-w-xs">
                          <span className="truncate">{tx.description}</span>
                          {tx.installmentInfo && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-500 shrink-0">
                              {tx.installmentInfo.current}/{tx.installmentInfo.total}
                            </span>
                          )}
                        </div>
                        {tx.notes && <div className="text-[11px] text-slate-400 truncate">{tx.notes}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-800 dark:text-slate-200">{tx.category}</div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {tx.type === 'income' ? 'Entrada' : tx.type === 'expense_fixed' ? 'Fixa' : tx.type === 'expense_variable' ? 'Variável' : tx.type}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap text-slate-500">
                        {isCard ? (
                          <div className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-purple-500" />
                            <span>{card ? card.name : 'Cartão'}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <Wallet className="w-3.5 h-3.5 text-blue-500" />
                            <span>{account ? account.name : 'Conta'}</span>
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold tabular-nums whitespace-nowrap">
                        <span className={isInc ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-900 dark:text-white'}>
                          {isInc ? '+' : '-'} {formatCurrency(tx.amount)}
                        </span>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium ${
                            tx.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : isOver
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}
                        >
                          {tx.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : isOver ? <AlertTriangle className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span>{tx.status === 'paid' ? 'Efetivado' : isOver ? 'Atrasado' : 'Pendente'}</span>
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1 text-slate-400">
                          <button
                            onClick={() => handleOpenEdit(tx)}
                            title="Editar lançamento"
                            className="p-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => duplicateTransaction(tx.id)}
                            title="Duplicar lançamento"
                            className="p-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm(`Deseja excluir "${tx.description}"? O saldo bancário será recalculado.`)) {
                                deleteTransaction(tx.id);
                              }
                            }}
                            title="Excluir lançamento"
                            className="p-1 hover:text-rose-600 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Edit Transaction Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Editar Lançamento
              </h3>
              <button
                onClick={() => setEditingTx(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-medium text-slate-500 mb-1">Descrição</label>
                <input
                  type="text"
                  required
                  value={editDesc}
                  onChange={e => setEditDesc(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-500 mb-1">Valor (R$)</label>
                <input
                  type="text"
                  required
                  value={editAmountStr}
                  onChange={e => setEditAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
                  className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Categoria</label>
                  <select
                    value={editCat}
                    onChange={e => setEditCat(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {allCategories.map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Situação / Status</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as TransactionStatus)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="paid">Efetivado (Pago/Recebido)</option>
                    <option value="pending">Pendente (A vencer)</option>
                    <option value="overdue">Atrasado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Data</label>
                  <input
                    type="date"
                    value={editDate}
                    onChange={e => setEditDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-500 mb-1">Vencimento</label>
                  <input
                    type="date"
                    value={editDueDate}
                    onChange={e => setEditDueDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl transition-all shadow-xs"
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
