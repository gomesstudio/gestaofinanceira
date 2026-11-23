/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Plus,
  Layers,
  ShoppingBag,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Trash2,
  Copy,
  Edit2,
  CreditCard,
  Wallet,
  ArrowDownRight
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO } from '../../utils/formatters';
import { Transaction, TransactionType } from '../../types/finance';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export const ExpensesView: React.FC = () => {
  const {
    transactions,
    accounts,
    creditCards,
    categories,
    deleteTransaction,
    duplicateTransaction,
    openQuickEntry,
    updateTransaction
  } = useFinance();

  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'all' | 'fixed' | 'variable'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'pending' | 'overdue'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Edit Expense Modal State
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editAmountStr, setEditAmountStr] = useState('');
  const [editCat, setEditCat] = useState('');
  const [editType, setEditType] = useState<'expense_fixed' | 'expense_variable'>('expense_variable');
  const [editDate, setEditDate] = useState('');
  const [editDueDate, setEditDueDate] = useState('');
  const [editStatus, setEditStatus] = useState<'paid' | 'pending'>('paid');
  const [editNotes, setEditNotes] = useState('');

  // Delete confirmation & feedback state
  const [pendingDeleteTx, setPendingDeleteTx] = useState<Transaction | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<ActionFeedback | null>(null);

  const handleConfirmDelete = async () => {
    if (!pendingDeleteTx || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteTransaction(pendingDeleteTx.id);
      setDeleteFeedback({
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      });
    } catch (err: any) {
      setDeleteFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível excluir a despesa.'
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteTx(null);
    }
  };

  const handleOpenEdit = (tx: Transaction) => {
    setEditingTx(tx);
    setEditDesc(tx.description);
    setEditAmountStr(tx.amount.toFixed(2).replace('.', ','));
    setEditCat(tx.category);
    setEditType(tx.type === 'expense_fixed' ? 'expense_fixed' : 'expense_variable');
    setEditDate(tx.date);
    setEditDueDate(tx.dueDate || tx.date);
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
      type: editType,
      category: editCat,
      date: editDate,
      dueDate: editDueDate,
      status: editStatus,
      notes: editNotes.trim() || undefined
    });

    setEditingTx(null);
  };

  const todayStr = getTodayISO();

  // Filter only expenses
  const allExpenses = transactions.filter(t => t.type === 'expense_fixed' || t.type === 'expense_variable');

  const filteredExpenses = allExpenses.filter(t => {
    if (search && !t.description.toLowerCase().includes(search.toLowerCase()) && !t.category.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }
    if (typeFilter === 'fixed' && t.type !== 'expense_fixed') return false;
    if (typeFilter === 'variable' && t.type !== 'expense_variable') return false;

    if (categoryFilter !== 'all' && t.category !== categoryFilter) return false;

    if (statusFilter === 'paid' && t.status !== 'paid') return false;
    if (statusFilter === 'pending' && (t.status === 'paid' || (t.dueDate && t.dueDate < todayStr))) return false;
    if (statusFilter === 'overdue' && (t.status === 'paid' || !t.dueDate || t.dueDate >= todayStr)) return false;

    return true;
  });

  const totalFixed = allExpenses
    .filter(t => t.type === 'expense_fixed')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalVariable = allExpenses
    .filter(t => t.type === 'expense_variable')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalPending = allExpenses
    .filter(t => t.status !== 'paid')
    .reduce((sum, t) => sum + t.amount, 0);

  const totalAll = totalFixed + totalVariable;

  const handleToggleStatus = (tx: Transaction) => {
    const newStatus = tx.status === 'paid' ? 'pending' : 'paid';
    updateTransaction(tx.id, { status: newStatus });
  };

  const getExpenseCategories = categories.filter(c => c.type === 'expense');

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Despesas Fixas & Variáveis
          </h2>
          <p className="text-xs text-slate-500">
            Acompanhamento minucioso de gastos recorrentes e compras pontuais
          </p>
        </div>
        <button
          onClick={() => openQuickEntry('expense')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Nova Despesa</span>
        </button>
      </div>

      <ActionFeedbackBanner
        feedback={deleteFeedback}
        onClose={() => setDeleteFeedback(null)}
      />

      {/* Metrics Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Total de Despesas</span>
            <ArrowDownRight className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold font-mono text-rose-600 dark:text-rose-400 tabular-nums">
            {formatCurrency(totalAll)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {allExpenses.length} lançamentos registrados
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Despesas Fixas</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalFixed)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Aluguel, contas essenciais, planos
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>Despesas Variáveis</span>
            <ShoppingBag className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 dark:text-white tabular-nums">
            {formatCurrency(totalVariable)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Mercado, lazer, alimentação, farmácia
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
          <div className="text-xs font-medium text-slate-500 mb-1 flex items-center justify-between">
            <span>A Pagar (Pendentes)</span>
            <Clock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold font-mono text-amber-600 dark:text-amber-400 tabular-nums">
            {formatCurrency(totalPending)}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            Compromissos ainda não liquidados
          </div>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar despesa..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden focus:ring-1 focus:ring-emerald-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          {/* Type Filter */}
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value as any)}
            className="w-full sm:w-auto flex-1 sm:flex-none px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todas as Despesas</option>
            <option value="fixed">Apenas Fixas</option>
            <option value="variable">Apenas Variáveis</option>
          </select>

          {/* Category Filter */}
          <select
            value={categoryFilter}
            onChange={e => setCategoryFilter(e.target.value)}
            className="w-full sm:w-auto flex-1 sm:flex-none px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todas as Categorias</option>
            {getExpenseCategories.map(c => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="w-full sm:w-auto flex-1 sm:flex-none px-2.5 py-2 text-xs bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-hidden"
          >
            <option value="all">Todos os Status</option>
            <option value="paid">Pagas</option>
            <option value="pending">Pendentes</option>
            <option value="overdue">Atrasadas</option>
          </select>
        </div>
      </div>

      {/* Expenses Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden shadow-xs">
        {filteredExpenses.length === 0 ? (
          <div className="text-center py-12 text-xs text-slate-400">
            Nenhuma despesa encontrada com os filtros selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 font-medium border-b border-slate-100 dark:border-slate-800">
                <tr>
                  <th className="py-3 px-4">Data / Vencimento</th>
                  <th className="py-3 px-4">Descrição</th>
                  <th className="py-3 px-4">Categoria / Tipo</th>
                  <th className="py-3 px-4">Forma / Conta</th>
                  <th className="py-3 px-4 text-right">Valor</th>
                  <th className="py-3 px-4">Situação</th>
                  <th className="py-3 px-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                {filteredExpenses.map(tx => {
                  const isOverdue = tx.status !== 'paid' && tx.dueDate && tx.dueDate < todayStr;
                  const isCard = tx.paymentMethod === 'credit_card';
                  const source = isCard
                    ? creditCards.find(c => c.id === tx.creditCardId)?.name
                    : accounts.find(a => a.id === tx.accountId)?.name;

                  return (
                    <tr key={tx.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-3 px-4 font-mono whitespace-nowrap">
                        <div className="text-slate-900 dark:text-white">{formatDateBR(tx.date)}</div>
                        {tx.dueDate && (
                          <div className={`text-[10px] ${isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-400'}`}>
                            Venc: {formatDateBR(tx.dueDate)} {isOverdue && '(Atrasado)'}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2 truncate max-w-xs">
                          <span className="truncate">{tx.description}</span>
                          {tx.installmentInfo && (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                              {tx.installmentInfo.current}/{tx.installmentInfo.total}
                            </span>
                          )}
                        </div>
                        {tx.notes && <div className="text-[11px] text-slate-400 truncate">{tx.notes}</div>}
                      </td>
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-800 dark:text-slate-200">{tx.category}</div>
                        <div className="text-[10px] text-slate-400">
                          {tx.type === 'expense_fixed' ? 'Despesa Fixa' : 'Despesa Variável'}
                        </div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-700 dark:text-slate-300 font-medium">
                          {isCard ? (
                            <CreditCard className="w-3.5 h-3.5 text-purple-500 shrink-0" />
                          ) : (
                            <Wallet className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                          )}
                          <span className="truncate max-w-[130px]">{source || tx.paymentMethod}</span>
                        </div>
                        <div className="text-[10px] text-slate-400 capitalize">
                          {tx.paymentMethod.replace('_', ' ')}
                        </div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums whitespace-nowrap">
                        -{formatCurrency(tx.amount)}
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <button
                          onClick={() => handleToggleStatus(tx)}
                          title="Clique para alternar status"
                          className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium transition-colors ${
                            tx.status === 'paid'
                              ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                              : isOverdue
                              ? 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                              : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                          }`}
                        >
                          {tx.status === 'paid' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : isOverdue ? (
                            <AlertTriangle className="w-3 h-3" />
                          ) : (
                            <Clock className="w-3 h-3" />
                          )}
                          <span>{tx.status === 'paid' ? 'Pago' : isOverdue ? 'Atrasado' : 'Pendente'}</span>
                        </button>
                      </td>
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-1 text-slate-400">
                          <button
                            onClick={() => handleOpenEdit(tx)}
                            title="Editar despesa"
                            className="p-1.5 rounded-lg hover:text-slate-700 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => duplicateTransaction(tx.id)}
                            title="Duplicar despesa"
                            className="p-1.5 rounded-lg hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={e => {
                              e.stopPropagation();
                              setPendingDeleteTx(tx);
                            }}
                            title="Excluir despesa"
                            aria-label={`Excluir despesa ${tx.description}`}
                            className="p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 hover:text-rose-600 transition-colors cursor-pointer"
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

      {/* Modal Editar Despesa */}
      <ResponsiveModal
        isOpen={!!editingTx}
        onClose={() => setEditingTx(null)}
        title="Editar Despesa"
        size="md"
        onSubmit={handleSaveEdit}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Salvar Alterações
          </button>
        }
      >
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

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-slate-500 mb-1">Categoria</label>
            <select
              value={editCat}
              onChange={e => setEditCat(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              {categories.filter(c => c.type === 'expense').map(c => (
                <option key={c.id} value={c.name}>{c.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block font-medium text-slate-500 mb-1">Tipo de Despesa</label>
            <select
              value={editType}
              onChange={e => setEditType(e.target.value as 'expense_fixed' | 'expense_variable')}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="expense_variable">Variável</option>
              <option value="expense_fixed">Fixa</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
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
            <label className="block font-medium text-slate-500 mb-1">Data de Vencimento</label>
            <input
              type="date"
              value={editDueDate}
              onChange={e => setEditDueDate(e.target.value)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Situação / Status</label>
          <select
            value={editStatus}
            onChange={e => setEditStatus(e.target.value as 'paid' | 'pending')}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="paid">Já Pago (Efetivado)</option>
            <option value="pending">Pendente (A pagar)</option>
          </select>
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
      </ResponsiveModal>

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteTx}
        title="Excluir Despesa"
        description="Deseja excluir esta despesa? Os indicadores e o saldo da conta vinculada serão atualizados automaticamente."
        itemLabel={pendingDeleteTx?.description}
        itemValue={pendingDeleteTx ? `-${formatCurrency(pendingDeleteTx.amount)}` : undefined}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => setPendingDeleteTx(null)}
      />
    </div>
  );
};
