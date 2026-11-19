/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo, useState } from 'react';
import {
  Search,
  RefreshCw,
  Clock,
  CalendarRange,
  Sparkles,
  PauseCircle,
  XCircle,
  Ban,
  Eye,
  CheckCircle2,
  AlertTriangle,
  Users,
  X,
  Phone
} from 'lucide-react';
import {
  AdminSubscriptionAction,
  AdminSubscriptionListItem,
  CustomerCommercialHistory,
  executeAdminSubscriptionAction,
  fetchCustomerCommercialHistory,
  formatCentsToBRL
} from '../../services/subscriptionService';

interface MasterClientsRequestsViewProps {
  items: AdminSubscriptionListItem[];
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: (search?: string) => Promise<void> | void;
  onActionCompleted?: () => Promise<void> | void;
}

type StatusFilter = 'all' | 'pending' | 'active' | 'expired' | 'suspended' | 'canceled' | 'lifetime';

export const MasterClientsRequestsView: React.FC<MasterClientsRequestsViewProps> = ({
  items,
  isLoading,
  errorMessage,
  onRefresh,
  onActionCompleted
}) => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Modal de Concessão Vitalício Especial (exclusivo Master)
  const [lifetimeTarget, setLifetimeTarget] = useState<AdminSubscriptionListItem | null>(null);
  const [lifetimeNote, setLifetimeNote] = useState('');

  // Modal de Análise / Histórico Comercial
  const [historyTarget, setHistoryTarget] = useState<AdminSubscriptionListItem | null>(null);
  const [historyData, setHistoryData] = useState<CustomerCommercialHistory | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter(item => {
      if (q) {
        const matchesQuery =
          item.email.toLowerCase().includes(q) ||
          (item.fullName || '').toLowerCase().includes(q) ||
          (item.whatsapp || '').toLowerCase().includes(q) ||
          item.userId.toLowerCase().includes(q);
        if (!matchesQuery) return false;
      }

      switch (statusFilter) {
        case 'pending':
          return item.requestStatus === 'pending' || item.status === 'pending' || (!item.status && item.requestStatus !== 'rejected');
        case 'active':
          return item.isEffectivelyActive;
        case 'expired':
          return (
            item.status === 'expired' ||
            (item.status === 'active' && !item.isEffectivelyActive)
          );
        case 'suspended':
          return item.status === 'suspended';
        case 'canceled':
          return item.status === 'canceled' || item.requestStatus === 'rejected';
        case 'lifetime':
          return item.planType === 'lifetime' && item.isEffectivelyActive;
        default:
          return true;
      }
    });
  }, [items, search, statusFilter]);

  const handleAction = async (
    item: AdminSubscriptionListItem,
    action: AdminSubscriptionAction,
    notes?: string
  ) => {
    if (busyUserId) return;
    setBusyUserId(item.userId);
    setFeedback(null);
    try {
      const res = await executeAdminSubscriptionAction({
        targetUserId: item.userId,
        action,
        notes
      });

      setFeedback({
        type: res.success ? 'success' : 'error',
        text: `${item.fullName || item.email}: ${res.message}`
      });

      if (res.success) {
        setLifetimeTarget(null);
        setLifetimeNote('');
        await onRefresh(search);
        if (onActionCompleted) {
          await onActionCompleted();
        }
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const openHistoryModal = async (item: AdminSubscriptionListItem) => {
    setHistoryTarget(item);
    setHistoryData(null);
    setHistoryError(null);
    setIsLoadingHistory(true);
    try {
      const res = await fetchCustomerCommercialHistory(item.userId);
      if (!res.success || !res.data) {
        setHistoryError(res.message || 'Erro ao carregar histórico comercial.');
      } else {
        setHistoryData(res.data);
      }
    } finally {
      setIsLoadingHistory(false);
    }
  };

  const formatSubscriptionBadge = (item: AdminSubscriptionListItem) => {
    if (!item.status) {
      return {
        label: 'Sem assinatura',
        cls: 'text-slate-600 dark:text-slate-400'
      };
    }
    if (item.status === 'active' && !item.isEffectivelyActive) {
      return {
        label: 'Vencida',
        cls: 'text-rose-600 dark:text-rose-400 font-semibold'
      };
    }
    switch (item.status) {
      case 'active':
        return {
          label: 'Ativa',
          cls: 'text-emerald-600 dark:text-emerald-400 font-semibold'
        };
      case 'expired':
        return {
          label: 'Vencida',
          cls: 'text-rose-600 dark:text-rose-400 font-semibold'
        };
      case 'suspended':
        return {
          label: 'Suspensa',
          cls: 'text-amber-600 dark:text-amber-400 font-semibold'
        };
      case 'canceled':
        return {
          label: 'Cancelada',
          cls: 'text-rose-600 dark:text-rose-400 font-semibold'
        };
      default:
        return {
          label: 'Pendente',
          cls: 'text-amber-600 dark:text-amber-400 font-semibold'
        };
    }
  };

  const formatPlanLabel = (planType: AdminSubscriptionListItem['planType']) => {
    if (planType === 'lifetime') return 'Vitalício Especial';
    if (planType === 'annual') return 'Anual (12m)';
    if (planType === 'monthly') return 'Mensal (30d)';
    return 'Não concedido';
  };

  const formatRequestedPlanLabel = (plan: AdminSubscriptionListItem['requestedPlan']) => {
    if (plan === 'annual') return 'Anual';
    if (plan === 'monthly') return 'Mensal';
    return '—';
  };

  const formatRequestStatusLabel = (status: AdminSubscriptionListItem['requestStatus']) => {
    switch (status) {
      case 'pending':
        return 'Pendente';
      case 'approved':
        return 'Aprovada';
      case 'rejected':
        return 'Recusada';
      case 'canceled':
        return 'Cancelada';
      default:
        return '—';
    }
  };

  return (
    <div data-testid="master-clients-requests-view" className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Clientes e Solicitações de Acesso
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Aprove solicitações de novos clientes, gerencie prazos ou conceda o Plano Vitalício Especial. Dados financeiros privados nunca são acessados aqui.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onRefresh(search)}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar Clientes</span>
        </button>
      </div>

      {/* Barra de busca e filtros */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-3">
        <div className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  onRefresh(search);
                }
              }}
              placeholder="Buscar por nome, e-mail, WhatsApp ou UUID..."
              className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
            />
          </div>

          <button
            type="button"
            onClick={() => onRefresh(search)}
            className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
          >
            Buscar
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          {(
            [
              { id: 'all', label: 'Todos' },
              { id: 'pending', label: 'Solicitações Pendentes' },
              { id: 'active', label: 'Ativos' },
              { id: 'lifetime', label: 'Vitalícios Especiais' },
              { id: 'expired', label: 'Vencidos' },
              { id: 'suspended', label: 'Suspensos' },
              { id: 'canceled', label: 'Cancelados / Recusados' }
            ] as Array<{ id: StatusFilter; label: string }>
          ).map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                statusFilter === tab.id
                  ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              {tab.label}
            </button>
          ))}
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

      {errorMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-900 dark:text-rose-200"
        >
          {errorMessage}
        </div>
      )}

      {/* Lista / Tabela */}
      {isLoading && items.length === 0 ? (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex items-center gap-2 text-xs text-slate-500">
          <RefreshCw className="w-4 h-4 animate-spin" />
          <span>Carregando base de clientes...</span>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
          <Users className="w-6 h-6 text-slate-400 mx-auto" />
          <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            Nenhum cliente encontrado para este filtro
          </p>
          <p className="text-xs text-slate-500">
            Ajuste o filtro ou aguarde novos cadastros de clientes.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {filteredItems.map(item => {
            const subBadge = formatSubscriptionBadge(item);
            const isBusy = busyUserId === item.userId;

            return (
              <div
                key={item.userId}
                data-testid={`master-client-row-${item.userId}`}
                className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3">
                  <div className="space-y-1.5 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-slate-900 dark:text-white">
                        {item.fullName || item.email}
                      </span>
                      <span className="text-xs text-slate-500 truncate">{item.email}</span>
                      {item.whatsapp && (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 dark:text-emerald-300 font-medium tabular-nums">
                          <Phone className="w-3 h-3" />
                          <span>{item.whatsapp}</span>
                        </span>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-x-4 gap-y-1 text-xs">
                      <div>
                        <span className="text-slate-500">Plano solicitado: </span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {formatRequestedPlanLabel(item.requestedPlan)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Solicitação: </span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {formatRequestStatusLabel(item.requestStatus)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Plano atual: </span>
                        <strong className="text-slate-800 dark:text-slate-200">
                          {formatPlanLabel(item.planType)}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500">Assinatura: </span>
                        <span className={subBadge.cls}>{subBadge.label}</span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-500 tabular-nums">
                      <span>
                        Cadastro:{' '}
                        {item.userCreatedAt
                          ? new Date(item.userCreatedAt).toLocaleDateString('pt-BR')
                          : '—'}
                      </span>
                      <span>
                        {item.planType === 'lifetime'
                          ? 'Vencimento: Sem vencimento periódico (Vitalício Especial)'
                          : item.expiresAt
                          ? `Vencimento: ${new Date(item.expiresAt).toLocaleString('pt-BR')}`
                          : 'Vencimento: Não definido'}
                      </span>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => openHistoryModal(item)}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 self-start shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Analisar / Histórico</span>
                  </button>
                </div>

                {/* Ações Administrativas */}
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      handleAction(
                        item,
                        item.planType === 'monthly' && item.isEffectivelyActive
                          ? 'renew_monthly'
                          : 'activate_monthly'
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>
                      {item.planType === 'monthly' && item.isEffectivelyActive
                        ? 'Renovar Mensal (+30d)'
                        : 'Ativar Mensal (30d)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() =>
                      handleAction(
                        item,
                        item.planType === 'annual' && item.isEffectivelyActive
                          ? 'renew_annual'
                          : 'activate_annual'
                      )
                    }
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <CalendarRange className="w-3.5 h-3.5" />
                    <span>
                      {item.planType === 'annual' && item.isEffectivelyActive
                        ? 'Renovar Anual (+12m)'
                        : 'Ativar Anual (12m)'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => {
                      setLifetimeTarget(item);
                      setLifetimeNote('');
                    }}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Conceder Vitalício Especial</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleAction(item, 'suspend')}
                    className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <PauseCircle className="w-3.5 h-3.5" />
                    <span>Suspender</span>
                  </button>

                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => handleAction(item, 'cancel')}
                    className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancelar</span>
                  </button>

                  {item.requestStatus === 'pending' && (
                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => handleAction(item, 'reject_request')}
                      className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                    >
                      <Ban className="w-3.5 h-3.5" />
                      <span>Recusar Solicitação</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação para Concessão Vitalício Especial */}
      {lifetimeTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lifetime-modal-title"
        >
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-violet-500 shrink-0" />
                <h3 id="lifetime-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Conceder Plano Vitalício Especial
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setLifetimeTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="text-xs text-slate-600 dark:text-slate-300 space-y-2 leading-relaxed">
              <p>
                Você está concedendo acesso permanente (sem vencimento periódico) para{' '}
                <strong className="text-slate-900 dark:text-white">
                  {lifetimeTarget.fullName || lifetimeTarget.email}
                </strong>
                .
              </p>
              <p className="p-3 rounded-xl bg-violet-50 dark:bg-violet-950/30 border border-violet-200 dark:border-violet-800/60 text-violet-900 dark:text-violet-200">
                Esta concessão é exclusiva do Master e <strong>não gera faturamento automático</strong>. Se desejar registrar algum pagamento, faça manualmente na aba Faturamento.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 block">
                Observação administrativa (opcional)
              </label>
              <input
                type="text"
                value={lifetimeNote}
                onChange={e => setLifetimeNote(e.target.value)}
                placeholder="Ex.: Cortesia de fundador / Parceiro oficial"
                className="w-full px-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setLifetimeTarget(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={busyUserId === lifetimeTarget.userId}
                onClick={() =>
                  handleAction(lifetimeTarget, 'activate_lifetime', lifetimeNote)
                }
                className="px-4 py-2 rounded-xl bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-xs font-bold cursor-pointer"
              >
                Confirmar Concessão Vitalícia
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Análise / Histórico Comercial */}
      {historyTarget && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="history-modal-title"
        >
          <div className="w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="history-modal-title" className="text-base font-bold text-slate-900 dark:text-white">
                  Histórico Comercial — {historyTarget.fullName || historyTarget.email}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  {historyTarget.email} {historyTarget.whatsapp ? `· ${historyTarget.whatsapp}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setHistoryTarget(null)}
                className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isLoadingHistory ? (
              <div className="p-6 text-center text-xs text-slate-500 flex items-center justify-center gap-2">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Consultando histórico comercial...</span>
              </div>
            ) : historyError ? (
              <div className="p-4 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-xs text-rose-700 dark:text-rose-300">
                {historyError}
              </div>
            ) : historyData ? (
              <div className="space-y-4">
                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Solicitações de Acesso ({historyData.requests.length})
                  </h4>
                  {historyData.requests.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhuma solicitação registrada.</p>
                  ) : (
                    <div className="space-y-2">
                      {historyData.requests.map(req => (
                        <div
                          key={req.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2"
                        >
                          <span>
                            Plano: <strong>{req.requested_plan === 'annual' ? 'Anual' : 'Mensal'}</strong> · Situação:{' '}
                            <strong>{req.request_status}</strong>
                          </span>
                          <span className="text-slate-500 tabular-nums">
                            {new Date(req.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Pagamentos Registrados ({historyData.payments.length})
                  </h4>
                  {historyData.payments.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum pagamento comercial lançado para este cliente.</p>
                  ) : (
                    <div className="space-y-2">
                      {historyData.payments.map(pay => (
                        <div
                          key={pay.id}
                          className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs flex flex-wrap items-center justify-between gap-2 tabular-nums"
                        >
                          <span>
                            <strong>{formatCentsToBRL(pay.amount_cents)}</strong> ({pay.subscription_plan}) ·{' '}
                            {pay.payment_method} · Status: <strong>{pay.payment_status}</strong>
                          </span>
                          <span className="text-slate-500">{pay.payment_date}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Auditoria Administrativa ({historyData.auditLogs.length})
                  </h4>
                  {historyData.auditLogs.length === 0 ? (
                    <p className="text-xs text-slate-500">Nenhum evento de auditoria registrado.</p>
                  ) : (
                    <div className="space-y-1.5">
                      {historyData.auditLogs.map(log => (
                        <div
                          key={log.id}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 text-[11px] flex items-center justify-between gap-2"
                        >
                          <span className="font-mono text-slate-700 dark:text-slate-300">
                            {log.action} ({log.entity_type})
                          </span>
                          <span className="text-slate-500 tabular-nums">
                            {new Date(log.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
};
