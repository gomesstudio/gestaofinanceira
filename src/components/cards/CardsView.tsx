/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  CreditCard as CardIcon,
  Plus,
  Calendar,
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Layers,
  ArrowRight,
  Trash2,
  Edit2,
  ShieldCheck
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { formatCurrency, formatDateBR, getTodayISO } from '../../utils/formatters';
import { CreditCard, Transaction } from '../../types/finance';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export const CardsView: React.FC = () => {
  const {
    creditCards,
    accounts,
    transactions,
    addCreditCard,
    updateCreditCard,
    deleteCreditCard,
    payCreditCardInvoice,
    getCardInvoiceAmount
  } = useFinance();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [payModalCard, setPayModalCard] = useState<CreditCard | null>(null);
  const [editingCard, setEditingCard] = useState<CreditCard | null>(null);
  const [pendingDeleteCard, setPendingDeleteCard] = useState<CreditCard | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteFeedback, setDeleteFeedback] = useState<ActionFeedback | null>(null);

  const handleConfirmDeleteCard = async () => {
    if (!pendingDeleteCard || isDeleting) return;
    setIsDeleting(true);
    try {
      const result = await deleteCreditCard(pendingDeleteCard.id);
      setDeleteFeedback({
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      });
    } catch (err: any) {
      setDeleteFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível excluir o cartão.'
      });
    } finally {
      setIsDeleting(false);
      setPendingDeleteCard(null);
    }
  };

  // Form states for Add Card
  const [name, setName] = useState('');
  const [limitTotalStr, setLimitTotalStr] = useState('');
  const [closingDay, setClosingDay] = useState(20);
  const [dueDay, setDueDay] = useState(27);
  const [color, setColor] = useState('#820ad1');
  const [linkedAccountId, setLinkedAccountId] = useState(accounts[0]?.id || '');

  // Form states for Edit Card
  const [editCardName, setEditCardName] = useState('');
  const [editLimitTotalStr, setEditLimitTotalStr] = useState('');
  const [editClosingDay, setEditClosingDay] = useState(20);
  const [editDueDay, setEditDueDay] = useState(27);
  const [editColor, setEditColor] = useState('#820ad1');

  const handleOpenEditCard = (card: CreditCard) => {
    setEditingCard(card);
    setEditCardName(card.name);
    setEditLimitTotalStr(card.limitTotal.toFixed(2).replace('.', ','));
    setEditClosingDay(card.closingDay);
    setEditDueDay(card.dueDay);
    setEditColor(card.color);
  };

  const handleSaveEditCard = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCard) return;
    const limit = parseFloat(editLimitTotalStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(limit) || limit <= 0) return;

    updateCreditCard(editingCard.id, {
      name: editCardName.trim(),
      limitTotal: limit,
      closingDay: editClosingDay,
      dueDay: editDueDay,
      color: editColor
    });

    setEditingCard(null);
  };

  // Form states for Pay Invoice
  const [payAmountStr, setPayAmountStr] = useState('');
  const [payAccountId, setPayAccountId] = useState(accounts[0]?.id || '');
  const [invoiceMonth, setInvoiceMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const now = new Date();
  const currentMonthStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const handleCreateCard = (e: React.FormEvent) => {
    e.preventDefault();
    const limit = parseFloat(limitTotalStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(limit) || limit <= 0) return;

    addCreditCard({
      name: name.trim(),
      limitTotal: limit,
      closingDay,
      dueDay,
      color,
      linkedAccountId: linkedAccountId || undefined
    });

    setIsAddModalOpen(false);
    setName('');
    setLimitTotalStr('');
  };

  const handlePayInvoiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalCard) return;
    const amount = parseFloat(payAmountStr.replace(/\./g, '').replace(',', '.'));
    if (isNaN(amount) || amount <= 0) return;

    payCreditCardInvoice(payModalCard.id, payAccountId, amount, invoiceMonth);

    setPayModalCard(null);
    setPayAmountStr('');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white">
            Cartões de Crédito & Faturas
          </h2>
          <p className="text-xs text-slate-500">
            Acompanhe limites, faturas abertas e pagamentos sem duplicidade no orçamento
          </p>
        </div>
        <button
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 rounded-xl transition-all shadow-xs"
        >
          <Plus className="w-4 h-4" />
          <span>Cadastrar Novo Cartão</span>
        </button>
      </div>

      <ActionFeedbackBanner
        feedback={deleteFeedback}
        onClose={() => setDeleteFeedback(null)}
      />

      {/* Anti-duplicity rule callout */}
      <div className="p-3.5 bg-purple-50/70 dark:bg-purple-950/20 border border-purple-200/80 dark:border-purple-900/60 rounded-xl text-xs text-purple-900 dark:text-purple-300 flex items-start gap-2.5">
        <ShieldCheck className="w-4 h-4 shrink-0 text-purple-600 dark:text-purple-400 mt-0.5" />
        <div className="leading-relaxed">
          <span className="font-semibold">Regra Anti-Duplicidade:</span> Cada compra feita no cartão é contabilizada na categoria correspondente (ex: Supermercado) e integra a fatura. O pagamento da fatura debita da sua conta bancária sem somar um novo gasto repetido nos seus relatórios de consumo.
        </div>
      </div>

      {/* Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {creditCards.map(card => {
          const usedLimit = getCardInvoiceAmount(card.id, currentMonthStr);
          const availableLimit = Math.max(0, card.limitTotal - usedLimit);
          const usedPercent = card.limitTotal > 0 ? (usedLimit / card.limitTotal) * 100 : 0;

          // Card transactions in current period
          const cardTxs = transactions
            .filter(t => t.creditCardId === card.id && t.paymentMethod === 'credit_card' && !t.isInvoicePayment)
            .slice(0, 5);

          return (
            <div
              key={card.id}
              className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col justify-between"
            >
              <div>
                {/* Visual Card representation */}
                <div
                  className="p-5 rounded-2xl text-white shadow-md relative overflow-hidden mb-4"
                  style={{
                    background: `linear-gradient(135deg, ${card.color} 0%, #1e1b4b 100%)`
                  }}
                >
                  <div className="flex items-center justify-between mb-6">
                    <CardIcon className="w-6 h-6 opacity-80" />
                    <span className="font-mono text-xs tracking-widest opacity-80 uppercase">
                      Crédito
                    </span>
                  </div>

                  <div className="text-lg font-bold tracking-wide truncate mb-3">
                    {card.name}
                  </div>

                  <div className="flex items-center justify-between text-xs opacity-90">
                    <div>
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Fecha dia</div>
                      <div className="font-mono font-semibold">{card.closingDay}</div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Vence dia</div>
                      <div className="font-mono font-semibold">{card.dueDay}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[10px] uppercase tracking-wider opacity-70">Limite Total</div>
                      <div className="font-mono font-semibold">{formatCurrency(card.limitTotal)}</div>
                    </div>
                  </div>
                </div>

                {/* Limit Gauge & Stats */}
                <div className="space-y-3 mb-4">
                  <div className="flex flex-wrap justify-between items-center gap-2 text-xs">
                    <div>
                      <span className="text-slate-400">Fatura Atual: </span>
                      <span className="font-mono font-bold text-rose-600 dark:text-rose-400 tabular-nums">
                        {formatCurrency(usedLimit)}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400">Disponível: </span>
                      <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 tabular-nums">
                        {formatCurrency(availableLimit)}
                      </span>
                    </div>
                  </div>

                  {/* Limit Bar */}
                  <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        usedPercent >= 80 ? 'bg-rose-500' : usedPercent >= 50 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${Math.min(100, usedPercent)}%` }}
                    />
                  </div>

                  <div className="text-[11px] text-slate-400 flex justify-between">
                    <span>{usedPercent.toFixed(0)}% do limite utilizado</span>
                    {usedPercent >= 80 && (
                      <span className="text-rose-500 font-semibold">Atenção ao limite</span>
                    )}
                  </div>
                </div>

                {/* Recent Purchases on this card */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
                  <div className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-2">
                    Lançamentos Recentes no Cartão
                  </div>
                  {cardTxs.length === 0 ? (
                    <div className="text-xs text-slate-400 py-2">
                      Nenhuma compra registrada neste cartão ainda.
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      {cardTxs.map(t => (
                        <div key={t.id} className="flex items-center justify-between gap-2 text-xs py-1 border-b border-slate-50 dark:border-slate-800/60 last:border-0">
                          <span className="text-slate-700 dark:text-slate-300 truncate min-w-0 flex-1">
                            {t.description}
                          </span>
                          <span className="font-mono font-medium text-slate-900 dark:text-white tabular-nums shrink-0">
                            {formatCurrency(t.amount)}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Bottom Actions */}
              <div className="flex flex-wrap items-center justify-between gap-2 pt-4 mt-3 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => handleOpenEditCard(card)}
                    className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Editar</span>
                  </button>

                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setPendingDeleteCard(card);
                    }}
                    className="text-xs text-slate-400 hover:text-rose-600 flex items-center gap-1 transition-colors cursor-pointer"
                    title="Excluir cartão"
                    aria-label={`Excluir cartão ${card.name}`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Excluir</span>
                  </button>
                </div>

                <button
                  onClick={() => {
                    setPayModalCard(card);
                    setPayAmountStr(usedLimit.toFixed(2).replace('.', ','));
                  }}
                  className="px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-500 rounded-xl transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>Pagar Fatura</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Modal: Cadastrar Novo Cartão */}
      <ResponsiveModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        title="Cadastrar Cartão de Crédito"
        size="md"
        onSubmit={handleCreateCard}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Salvar Cartão
          </button>
        }
      >
        <div>
          <label className="block font-medium text-slate-500 mb-1">Nome do Cartão *</label>
          <input
            type="text"
            required
            placeholder="Ex: Nubank Ultravioleta, Itaú Click, Inter..."
            value={name}
            onChange={e => setName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Limite Total (R$) *</label>
          <input
            type="text"
            required
            placeholder="0,00"
            value={limitTotalStr}
            onChange={e => setLimitTotalStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-slate-500 mb-1">Dia de Fechamento (1-31)</label>
            <input
              type="number"
              min={1}
              max={31}
              value={closingDay}
              onChange={e => setClosingDay(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-500 mb-1">Dia de Vencimento (1-31)</label>
            <input
              type="number"
              min={1}
              max={31}
              value={dueDay}
              onChange={e => setDueDay(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Cor do Cartão</label>
          <div className="flex flex-wrap items-center gap-2">
            {['#820ad1', '#ec7000', '#0284c7', '#10b981', '#1e293b', '#e11d48'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setColor(c)}
                className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${color === c ? 'scale-115 ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </ResponsiveModal>

      {/* Modal: Pagar Fatura */}
      <ResponsiveModal
        isOpen={!!payModalCard}
        onClose={() => setPayModalCard(null)}
        title="Pagamento de Fatura"
        subtitle={payModalCard?.name}
        size="md"
        onSubmit={handlePayInvoiceSubmit}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all shadow-xs cursor-pointer"
          >
            Confirmar Pagamento da Fatura
          </button>
        }
      >
        <div className="p-3 bg-purple-50 dark:bg-purple-950/30 rounded-xl text-purple-900 dark:text-purple-300">
          O pagamento de fatura quitará a obrigação do cartão debitando da sua conta bancária sem duplicar lançamentos de consumo.
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">
            Valor da Fatura a Pagar (R$) *
          </label>
          <input
            type="text"
            required
            autoFocus
            placeholder="0,00"
            value={payAmountStr}
            onChange={e => setPayAmountStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-full px-3 py-2 text-lg font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white tabular-nums"
          />
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">
            Debitar da Conta Bancária *
          </label>
          <select
            value={payAccountId}
            onChange={e => setPayAccountId(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            {accounts.map(acc => (
              <option key={acc.id} value={acc.id}>
                {acc.name} ({formatCurrency(acc.balance)})
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">
            Mês de Referência da Fatura
          </label>
          <input
            type="month"
            value={invoiceMonth}
            onChange={e => setInvoiceMonth(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Modal: Editar Cartão */}
      <ResponsiveModal
        isOpen={!!editingCard}
        onClose={() => setEditingCard(null)}
        title="Editar Cartão de Crédito"
        size="md"
        onSubmit={handleSaveEditCard}
        bodyClassName="text-xs"
        footer={
          <button
            type="submit"
            className="w-full min-h-[42px] py-2.5 bg-slate-900 hover:bg-slate-800 dark:bg-emerald-600 dark:hover:bg-emerald-500 text-white text-xs font-semibold rounded-xl transition-all cursor-pointer"
          >
            Salvar Alterações
          </button>
        }
      >
        <div>
          <label className="block font-medium text-slate-500 mb-1">Nome do Cartão *</label>
          <input
            type="text"
            required
            value={editCardName}
            onChange={e => setEditCardName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Limite Total (R$) *</label>
          <input
            type="text"
            required
            value={editLimitTotalStr}
            onChange={e => setEditLimitTotalStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-medium text-slate-500 mb-1">Dia de Fechamento (1-31)</label>
            <input
              type="number"
              min={1}
              max={31}
              value={editClosingDay}
              onChange={e => setEditClosingDay(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
          <div>
            <label className="block font-medium text-slate-500 mb-1">Dia de Vencimento (1-31)</label>
            <input
              type="number"
              min={1}
              max={31}
              value={editDueDay}
              onChange={e => setEditDueDay(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Cor do Cartão</label>
          <div className="flex flex-wrap items-center gap-2">
            {['#820ad1', '#ec7000', '#0284c7', '#10b981', '#1e293b', '#e11d48'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setEditColor(c)}
                className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${editColor === c ? 'scale-115 ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </ResponsiveModal>

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteCard}
        title="Excluir Cartão de Crédito"
        description="Deseja excluir este cartão de crédito? Os demais cartões e lançamentos permanecerão preservados."
        itemLabel={pendingDeleteCard?.name}
        itemValue={pendingDeleteCard ? `Limite: ${formatCurrency(pendingDeleteCard.limitTotal)}` : undefined}
        isDeleting={isDeleting}
        onConfirm={handleConfirmDeleteCard}
        onCancel={() => setPendingDeleteCard(null)}
      />
    </div>
  );
};
