/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  DollarSign,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Edit3,
  X,
  ShieldCheck
} from 'lucide-react';
import {
  AdminSubscriptionListItem,
  CommercialPaymentMethod,
  CommercialPaymentRecord,
  CommercialPaymentStatus,
  computeRevenueSummary,
  formatCentsToBRL,
  recordCommercialPayment,
  SubscriptionPlanType,
  updateCommercialPayment
} from '../../services/subscriptionService';

interface MasterBillingViewProps {
  clients: AdminSubscriptionListItem[];
  payments: CommercialPaymentRecord[];
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => Promise<void> | void;
  onPaymentChanged?: () => Promise<void> | void;
}

const PAYMENT_METHOD_LABELS: Record<CommercialPaymentMethod, string> = {
  pix: 'PIX',
  credit_card: 'Cartão de Crédito',
  debit_card: 'Cartão de Débito',
  bank_transfer: 'Transferência Bancária',
  cash: 'Dinheiro',
  other: 'Outro'
};

const PAYMENT_STATUS_LABELS: Record<CommercialPaymentStatus, string> = {
  confirmed: 'Confirmado',
  pending: 'Pendente',
  canceled: 'Cancelado'
};

function parseAmountInputToCents(raw: string): number {
  const normalized = raw.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return -1;
  return Math.round(parsed * 100);
}

export const MasterBillingView: React.FC<MasterBillingViewProps> = ({
  clients,
  payments,
  isLoading,
  errorMessage,
  onRefresh,
  onPaymentChanged
}) => {
  const [statusFilter, setStatusFilter] = useState<CommercialPaymentStatus | 'all'>('all');
  const [search, setSearch] = useState('');

  // Formulário de lançamento manual de pagamento
  const [customerUserId, setCustomerUserId] = useState('');
  const [subscriptionPlan, setSubscriptionPlan] = useState<SubscriptionPlanType>('monthly');
  const [amountText, setAmountText] = useState('');
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [paymentMethod, setPaymentMethod] = useState<CommercialPaymentMethod>('pix');
  const [paymentStatus, setPaymentStatus] = useState<CommercialPaymentStatus>('confirmed');
  const [referenceCode, setReferenceCode] = useState('');
  const [notes, setNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Modal de edição/estorno
  const [editingPayment, setEditingPayment] = useState<CommercialPaymentRecord | null>(null);
  const [editStatus, setEditStatus] = useState<CommercialPaymentStatus>('confirmed');
  const [editAmountText, setEditAmountText] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [isUpdating, setIsUpdating] = useState(false);

  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const revenueSummary = useMemo(() => computeRevenueSummary(payments), [payments]);

  const filteredPayments = useMemo(() => {
    const q = search.trim().toLowerCase();
    return payments.filter(p => {
      if (statusFilter !== 'all' && p.paymentStatus !== statusFilter) return false;
      if (q) {
        return (
          p.customerName.toLowerCase().includes(q) ||
          p.customerEmail.toLowerCase().includes(q) ||
          (p.referenceCode || '').toLowerCase().includes(q) ||
          (p.notes || '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [payments, statusFilter, search]);

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSaving) return;
    setFeedback(null);

    const amountCents = parseAmountInputToCents(amountText);
    if (!customerUserId) {
      setFeedback({ type: 'error', text: 'Selecione o cliente para registrar o pagamento.' });
      return;
    }
    if (amountCents < 0) {
      setFeedback({ type: 'error', text: 'Informe um valor numérico válido em reais (ex.: 49,90 ou 0,00).' });
      return;
    }

    setIsSaving(true);
    try {
      const res = await recordCommercialPayment({
        customerUserId,
        subscriptionPlan,
        amountCents,
        paymentDate,
        paymentMethod,
        paymentStatus,
        referenceCode: referenceCode.trim() || undefined,
        notes: notes.trim() || undefined
      });

      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });

      if (res.success) {
        setAmountText('');
        setReferenceCode('');
        setNotes('');
        await onRefresh();
        if (onPaymentChanged) await onPaymentChanged();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const openEditModal = (record: CommercialPaymentRecord) => {
    setEditingPayment(record);
    setEditStatus(record.paymentStatus);
    setEditAmountText((record.amountCents / 100).toFixed(2).replace('.', ','));
    setEditNotes(record.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPayment || isUpdating) return;
    const amountCents = parseAmountInputToCents(editAmountText);
    if (amountCents < 0) {
      setFeedback({ type: 'error', text: 'Valor inválido para atualização.' });
      return;
    }

    setIsUpdating(true);
    setFeedback(null);
    try {
      const res = await updateCommercialPayment({
        paymentId: editingPayment.id,
        paymentStatus: editStatus,
        amountCents,
        notes: editNotes
      });

      setFeedback({
        type: res.success ? 'success' : 'error',
        text: res.message
      });

      if (res.success) {
        setEditingPayment(null);
        await onRefresh();
        if (onPaymentChanged) await onPaymentChanged();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div data-testid="master-billing-view" className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Faturamento Comercial (Gestão SaaS)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Registro manual de recebimentos por venda de assinatura. Totalmente separado das suas finanças pessoais.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar Faturamento</span>
        </button>
      </div>

      {/* Resumo de Receita */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Faturamento Confirmado (Mês)</span>
          <div className="text-xl font-extrabold text-emerald-600 dark:text-emerald-400 tabular-nums">
            {formatCentsToBRL(revenueSummary.monthlyRevenueCents)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <span className="text-xs text-slate-500">Faturamento Confirmado (Ano)</span>
          <div className="text-xl font-extrabold text-slate-900 dark:text-white tabular-nums">
            {formatCentsToBRL(revenueSummary.ytdRevenueCents)}
          </div>
        </div>
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-600 dark:text-slate-300">
          <ShieldCheck className="w-5 h-5 text-emerald-500 shrink-0" />
          <span>
            Concessões gratuitas (Vitalício Especial) não geram faturamento automático; valores não ficam visíveis aos clientes.
          </span>
        </div>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'success' ? 'status' : 'alert'}
          className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          {feedback.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
          )}
          <span>{feedback.text}</span>
        </div>
      )}

      {/* Formulário de Novo Pagamento */}
      <form
        onSubmit={handleRecordPayment}
        data-testid="master-record-payment-form"
        className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4"
      >
        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <DollarSign className="w-4 h-4 text-emerald-500" />
          <span>Registrar Pagamento Manual</span>
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Cliente
            </label>
            <select
              value={customerUserId}
              onChange={e => setCustomerUserId(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="">Selecione um cliente...</option>
              {clients.map(c => (
                <option key={c.userId} value={c.userId}>
                  {(c.fullName || c.email)} ({c.email})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Plano
            </label>
            <select
              value={subscriptionPlan}
              onChange={e => setSubscriptionPlan(e.target.value as SubscriptionPlanType)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="monthly">Plano Mensal</option>
              <option value="annual">Plano Anual</option>
              <option value="lifetime">Vitalício Especial</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Valor Recebido (R$)
            </label>
            <input
              type="text"
              value={amountText}
              onChange={e => setAmountText(e.target.value)}
              placeholder="Ex.: 49,90"
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white tabular-nums"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Data do Pagamento
            </label>
            <input
              type="date"
              value={paymentDate}
              onChange={e => setPaymentDate(e.target.value)}
              required
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white tabular-nums"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Forma de Pagamento
            </label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as CommercialPaymentMethod)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Situação
            </label>
            <select
              value={paymentStatus}
              onChange={e => setPaymentStatus(e.target.value as CommercialPaymentStatus)}
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            >
              <option value="confirmed">Confirmado (entra na receita)</option>
              <option value="pending">Pendente (não soma receita)</option>
              <option value="canceled">Cancelado (não soma receita)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Código de Referência / Comprovante (opcional, evita duplicidade)
            </label>
            <input
              type="text"
              value={referenceCode}
              onChange={e => setReferenceCode(e.target.value)}
              placeholder="Ex.: PIX-E2E-20261117-01"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block mb-1">
              Observação (opcional)
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Ex.: Renovação via WhatsApp comercial"
              className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={isSaving}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>{isSaving ? 'Salvando...' : 'Registrar Pagamento'}</span>
          </button>
        </div>
      </form>

      {/* Filtros e Lista de Pagamentos */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                { id: 'all', label: 'Todos' },
                { id: 'confirmed', label: 'Confirmados' },
                { id: 'pending', label: 'Pendentes' },
                { id: 'canceled', label: 'Cancelados' }
              ] as Array<{ id: CommercialPaymentStatus | 'all'; label: string }>
            ).map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setStatusFilter(tab.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${
                  statusFilter === tab.id
                    ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Filtrar recebimentos..."
            className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white sm:w-64"
          />
        </div>

        {errorMessage && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
            {errorMessage}
          </div>
        )}

        {filteredPayments.length === 0 ? (
          <div className="p-6 text-center text-xs text-slate-500">
            Nenhum pagamento comercial registrado para os filtros atuais.
          </div>
        ) : (
          <div className="divide-y divide-slate-200/70 dark:divide-slate-800">
            {filteredPayments.map(p => (
              <div
                key={p.id}
                className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-slate-900 dark:text-white">{p.customerName}</strong>
                    <span className="text-slate-500 truncate">{p.customerEmail}</span>
                    <span className="text-slate-400">·</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {p.subscriptionPlan === 'lifetime'
                        ? 'Vitalício Especial'
                        : p.subscriptionPlan === 'annual'
                        ? 'Anual'
                        : 'Mensal'}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 tabular-nums">
                    Data: {p.paymentDate} · Método: {PAYMENT_METHOD_LABELS[p.paymentMethod]}
                    {p.referenceCode ? ` · Ref: ${p.referenceCode}` : ''}
                    {p.notes ? ` · ${p.notes}` : ''}
                  </div>
                </div>

                <div className="flex items-center gap-3 shrink-0 tabular-nums">
                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 dark:text-white">
                      {formatCentsToBRL(p.amountCents)}
                    </div>
                    <div
                      className={`text-[11px] font-semibold ${
                        p.paymentStatus === 'confirmed'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : p.paymentStatus === 'pending'
                          ? 'text-amber-600 dark:text-amber-400'
                          : 'text-rose-600 dark:text-rose-400'
                      }`}
                    >
                      {PAYMENT_STATUS_LABELS[p.paymentStatus]}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openEditModal(p)}
                    className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    title="Corrigir ou alterar situação do pagamento"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de Edição / Estorno */}
      {editingPayment && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
        >
          <form
            onSubmit={handleSaveEdit}
            className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                Editar Pagamento Comercial
              </h3>
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Situação
                </label>
                <select
                  value={editStatus}
                  onChange={e => setEditStatus(e.target.value as CommercialPaymentStatus)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                >
                  <option value="confirmed">Confirmado</option>
                  <option value="pending">Pendente</option>
                  <option value="canceled">Cancelado</option>
                </select>
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Valor (R$)
                </label>
                <input
                  type="text"
                  value={editAmountText}
                  onChange={e => setEditAmountText(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white tabular-nums"
                />
              </div>

              <div>
                <label className="font-semibold text-slate-700 dark:text-slate-300 block mb-1">
                  Observação / Motivo da alteração
                </label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={e => setEditNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingPayment(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={isUpdating}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold cursor-pointer"
              >
                {isUpdating ? 'Salvando...' : 'Salvar Alteração'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
