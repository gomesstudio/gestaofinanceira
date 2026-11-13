/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Plus,
  Briefcase,
  Gift,
  Coins,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Trash2,
  Copy,
  Edit2,
  ArrowUpRight,
  X
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR } from '../../utils/formatters';
import { IncomeGroup, Transaction } from '../../types/finance';

export const IncomesView: React.FC = () => {
  const {
    transactions,
    accounts,
    categories,
    deleteTransaction,
    duplicateTransaction,
    openQuickEntry,
    updateTransaction
  } = useFinance();

  const [search, setSearch] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<IncomeGroup | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending'>('all');

  // Edit Income Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editAccountId, setEditAccountId] = useState('');
  const [editStatus, setEditStatus] = useState<'paid' | 'pending'>('paid');
  const [editNotes, setEditNotes] = useState('');

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditDesc(tx.description);
    setEditAmountStr(tx.amount.toFixed(2).replace('.', ','));
    setEditCat(tx.category);
    setEditDate(tx.date);
    setEditAccountId(tx.accountId || accounts[0]?.id || '');
    setEditStatus(tx.status === 'paid' ? 'paid' : 'pending');
    setEditNotes(tx.notes || '');
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
      accountId: editAccountId,
      status: editStatus,
      notes: editNotes.trim() || undefined
    });

    setEditingTx(null);
  };

  // Filter only income transactions
  const incomeTransactions = transactions.filter(t => t.type === 'income');

  // Group helpers
  const getCategoryGroup = (categoryName: string): IncomeGroup => {
    const cat = categories.find(c => c.name === categoryName && c.type === 'income');
    return cat?.incomeGroup || 'other';
  };

  const filteredIncomes = incomeTransactions.filter(t => {
    if (search && !t.description.toLowerCase().includes(search.toLowerCase()) && !t.category.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (statusFilter !== 'all' && t.status !== statusFilter) {
      return false;
    }
    if (selectedGroup !== 'all') {
      const grp = getCategoryGroup(t.category);
      if (grp !== selectedGroup) return false;
    }
    return true;
  });

  // Calculate totals by group
  const totalMain = incomeTransactions
    .filter(t => getCategoryGroup(t.category) === 'main_income')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalBenefits = incomeTransactions
    .filter(t => getCategoryGroup(t.category) === 'benefits')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalExtras = incomeTransactions
    .filter(t => getCategoryGroup(t.category) === 'extra_income' || getCategoryGroup(t.category) === 'other')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalAllIncomes = incomeTransactions.reduce((sum, t) => sum + t.amount, 0);

  const handleToggleStatus = (tx: Transaction) => {
    const newStatus = tx.status === 'paid' ? 'pending' : 'paid';
    updateTransaction(tx.id, { status: newStatus });
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Groups */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Entradas Financeiras
          </h2>
          <p className="text-xs text-slate-500">
            Controle de salários, benefícios, bonificações e rendas extras
          </p>
        </div>
        <button
          onClick={() => openQuickEntry('income')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Nova Entrada</span>
        </button>
      </div>

      {/* Group Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        {/* Total Geral */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Total Recebido</span>
            <ArrowUpRight className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCurrency(totalAllIncomes)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {incomeTransactions.length} lançamentos no histórico
          </div>
        </div>

        {/* Renda Principal */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Renda Principal</span>
            <Briefcase className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalMain)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Salário, adiantamentos e horas
          </div>
        </div>

        {/* Benefícios e Adicionais */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Benefícios & Bônus</span>
            <Gift className="w-4 h-4 text-purple-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalBenefits)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            13º, VR, PLR, bonificações
          </div>
        </div>

        {/* Entradas Extras */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Entradas Extras</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalExtras)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Freelances, vendas e serviços
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por descrição ou categoria..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex items-center gap-2">
          {/* Group Filter */}
          <select
            value={selectedGroup}
            onChange={e => setSelectedGroup(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todos os Grupos</option>
            <option value="main_income">Renda Principal</option>
            <option value="benefits">Benefícios & Adicionais</option>
            <option value="extra_income">Entradas Extras</option>
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-2.5 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todas as Situações</option>
            <option value="paid">Recebido</option>
            <option value="pending">Previsto / Pendente</option>
          </select>
        </div>
      </div>

      {/* Incomes Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        {filteredIncomes.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            Nenhuma entrada encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Data</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria / Grupo</th>
                  <th className="py-3 px-4">Conta de Destino</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredIncomes.map(tx => {
                  const grp = getCategoryGroup(tx.category);
                  const acc = accounts.find(a => a.id === tx.accountId);
                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono text-slate-500 whitespace-nowrap">
                        {formatDateBR(tx.date)}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        <div className="truncate max-w-xs">{tx.description}</div>
                        {tx.notes && <div className="text-[11px] text-slate-400 truncate">{tx.notes}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{tx.category}</div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {grp === 'main_income' ? 'Renda Principal' : grp === 'benefits' ? 'Benefícios' : 'Entrada Extra'}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-slate-500 truncate max-w-[140px]">
                        {acc ? acc.name : '-'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums whitespace-nowrap">
                        +{formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(tx)}
                          title="Clique para alternar status"
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                            tx.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}
                        >
                          {tx.status === 'paid' ? <CheckCircle2 className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
                          <span>{tx.status === 'paid' ? 'Recebido' : 'Pendente'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1 text-slate-400">
                          <button
                            onClick={() => handleOpenEdit(tx)}
                            title="Editar entrada"
                            className="p-1 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => duplicateTransaction(tx.id)}
                            title="Duplicar entrada"
                            className="p-1 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => {
                              if (confirm('Deseja excluir este lançamento de entrada? O saldo bancário será ajustado.')) {
                                deleteTransaction(tx.id);
                              }
                            }}
                            title="Excluir entrada"
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

      {/* Modal Editar Entrada */}
      {editingTx && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in"
          onClick={() => setEditingTx(null)}
        >
          <div 
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl overflow-hidden"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800">
              <h3 className="font-bold text-slate-900 dark:text-white text-base">
                Editar Entrada Financeira
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
                    {categories.filter(c => c.type === 'income').map(c => (
                      <option key={c.id} value={c.name}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-500 mb-1">Conta de Destino</label>
                  <select
                    value={editAccountId}
                    onChange={e => setEditAccountId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    {accounts.map(acc => (
                      <option key={acc.id} value={acc.id}>{acc.name}</option>
                    ))}
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
                  <label className="block font-medium text-slate-500 mb-1">Situação / Status</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as 'paid' | 'pending')}
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                  >
                    <option value="paid">Recebido na Conta</option>
                    <option value="pending">Previsto / Pendente</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-500 mb-1">Observações</label>
                <input
                  type="text"
                  placeholder="Opcional..."
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
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
