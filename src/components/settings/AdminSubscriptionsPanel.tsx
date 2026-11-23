/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useId, useState } from 'react';
import {
  ShieldCheck,
  Search,
  RefreshCw,
  CalendarRange,
  Clock,
  PauseCircle,
  XCircle,
  CheckCircle2,
  AlertTriangle,
  Users,
  Sparkles,
  Ban,
  LayoutDashboard
} from 'lucide-react';
import {
  AdminSubscriptionAction,
  AdminSubscriptionListItem,
  executeAdminSubscriptionAction,
  fetchAdminSubscriptionsList
} from '../../services/subscriptionService';

interface AdminSubscriptionsPanelProps {
  isAdmin: boolean;
  onSubscriptionUpdated?: () => Promise<void> | void;
  onOpenMasterPortal?: () => void;
}

export const AdminSubscriptionsPanel: React.FC<AdminSubscriptionsPanelProps> = ({
  isAdmin,
  onSubscriptionUpdated,
  onOpenMasterPortal
}) => {
  const fieldIdPrefix = useId();
  const [search, setSearch] = useState('');
  const [items, setItems] = useState<AdminSubscriptionListItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const loadSubscriptions = useCallback(
    async (query?: string) => {
      if (!isAdmin) return;
      setIsLoading(true);
      try {
        const res = await fetchAdminSubscriptionsList(query);
        if (!res.success) {
          setFeedback({
            type: 'error',
            text: res.message || 'Não foi possível carregar as assinaturas.'
          });
          setItems([]);
        } else {
          setItems(res.items);
        }
      } finally {
        setIsLoading(false);
      }
    },
    [isAdmin]
  );

  useEffect(() => {
    if (isAdmin) {
      loadSubscriptions();
    }
  }, [isAdmin, loadSubscriptions]);

  // Proteção em UI: nunca renderiza para contas que não sejam administradoras confirmadas no servidor
  if (!isAdmin) {
    return null;
  }

  const handleAction = async (
    item: AdminSubscriptionListItem,
    action: AdminSubscriptionAction
  ) => {
    if (busyUserId) return;
    setBusyUserId(item.userId);
    setFeedback(null);
    try {
      const res = await executeAdminSubscriptionAction({
        targetUserId: item.userId,
        action
      });

      setFeedback({
        type: res.success ? 'success' : 'error',
        text: `${item.email}: ${res.message}`
      });

      if (res.success) {
        await loadSubscriptions(search);
        if (onSubscriptionUpdated) {
          await onSubscriptionUpdated();
        }
      }
    } finally {
      setBusyUserId(null);
    }
  };

  const formatStatusLabel = (item: AdminSubscriptionListItem) => {
    if (!item.status) {
      if (item.requestStatus === 'pending') return 'Solicitação pendente';
      if (item.requestStatus === 'rejected') return 'Solicitação recusada';
      return 'Sem assinatura';
    }
    if (item.status === 'active' && !item.isEffectivelyActive) {
      return 'Vencida';
    }
    switch (item.status) {
      case 'active':
        return 'Ativa';
      case 'expired':
        return 'Vencida';
      case 'suspended':
        return 'Suspensa';
      case 'canceled':
        return 'Cancelada';
      case 'pending':
      default:
        return 'Pendente';
    }
  };

  const formatPlanLabel = (planType: AdminSubscriptionListItem['planType']) => {
    if (planType === 'lifetime') return 'Vitalício Especial';
    if (planType === 'annual') return 'Anual';
    if (planType === 'monthly') return 'Mensal';
    return 'Sem plano';
  };

  return (
    <div
      data-testid="admin-subscriptions-panel"
      className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-emerald-200/80 dark:border-emerald-900/60 shadow-xs space-y-4"
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
            <span>Administração de Assinaturas (Somente Contas & Planos)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Ative, renove, conceda Vitalício Especial (exclusivo Master), suspenda ou cancele assinaturas. Nenhuma transação ou dado financeiro de clientes é consultado aqui.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {onOpenMasterPortal && (
            <button
              type="button"
              onClick={onOpenMasterPortal}
              className="min-h-[36px] px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center justify-center gap-1.5 text-center leading-snug cursor-pointer"
            >
              <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
              <span>Abrir Painel Master Completo</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => loadSubscriptions(search)}
            disabled={isLoading}
            className="min-h-[36px] px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-1.5 text-center leading-snug cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Atualizar Lista</span>
          </button>
        </div>
      </div>

      {/* Filtro */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1 min-w-0">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            id={`${fieldIdPrefix}-search`}
            name="admin_subscriptions_search"
            type="text"
            autoComplete="off"
            aria-label="Filtrar assinaturas por nome, e-mail, WhatsApp ou UUID"
            value={search}
            onChange={e => setSearch(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                loadSubscriptions(search);
              }
            }}
            placeholder="Filtrar por nome, e-mail, WhatsApp ou UUID..."
            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
          />
        </div>

        <button
          type="button"
          onClick={() => loadSubscriptions(search)}
          className="w-full sm:w-auto min-h-[38px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold cursor-pointer"
        >
          Buscar
        </button>
      </div>

      {feedback && (
        <div
          role={feedback.type === 'success' ? 'status' : 'alert'}
          className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
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

      {/* Lista de contas */}
      {isLoading ? (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 flex items-center gap-2">
          <RefreshCw className="w-3.5 h-3.5 animate-spin" />
          <span>Consultando assinaturas...</span>
        </div>
      ) : items.length === 0 ? (
        <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 text-xs text-slate-500 flex items-center gap-2">
          <Users className="w-4 h-4" />
          <span>Nenhuma conta encontrada para o filtro informado.</span>
        </div>
      ) : (
        <div className="divide-y divide-slate-200/70 dark:divide-slate-800 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/20">
          {items.map(item => (
            <div
              key={item.userId}
              className="p-3.5 flex flex-col xl:flex-row xl:items-center justify-between gap-3"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-slate-900 dark:text-white break-words">
                    {item.fullName ? `${item.fullName} (${item.email})` : item.email}
                  </span>
                  {item.whatsapp && (
                    <>
                      <span aria-hidden="true" className="text-slate-400">·</span>
                      <span className="text-slate-600 dark:text-slate-300 tabular-nums">
                        {item.whatsapp}
                      </span>
                    </>
                  )}
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Plano: {formatPlanLabel(item.planType)}
                  </span>
                  <span aria-hidden="true" className="text-slate-400">·</span>
                  <span
                    className={`font-bold ${
                      item.isEffectivelyActive
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : item.status === 'suspended' || item.status === 'canceled'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    Status: {formatStatusLabel(item)}
                  </span>
                </div>

                {item.requestedPlan && (
                  <div className="text-[11px] text-slate-500">
                    Solicitado: <strong>{item.requestedPlan === 'annual' ? 'Anual' : 'Mensal'}</strong>
                    {item.requestStatus ? ` (${item.requestStatus})` : ''}
                  </div>
                )}

                <div className="text-[11px] font-mono text-slate-500 truncate">
                  UUID: {item.userId}
                </div>

                <div className="text-[11px] text-slate-500 tabular-nums">
                  {item.planType === 'lifetime'
                    ? 'Vencimento: Sem vencimento periódico (Vitalício Especial)'
                    : item.expiresAt
                    ? `Vencimento: ${new Date(item.expiresAt).toLocaleString('pt-BR')}`
                    : 'Vencimento: Sem data registrada'}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={busyUserId === item.userId}
                  onClick={() =>
                    handleAction(
                      item,
                      item.planType === 'monthly' && item.isEffectivelyActive
                        ? 'renew_monthly'
                        : 'activate_monthly'
                    )
                  }
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 text-center leading-snug cursor-pointer"
                >
                  <Clock className="w-3 h-3 shrink-0" />
                  <span>
                    {item.planType === 'monthly' && item.isEffectivelyActive
                      ? 'Renovar Mensal (+30d)'
                      : 'Ativar Mensal (30d)'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busyUserId === item.userId}
                  onClick={() =>
                    handleAction(
                      item,
                      item.planType === 'annual' && item.isEffectivelyActive
                        ? 'renew_annual'
                        : 'activate_annual'
                    )
                  }
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 text-center leading-snug cursor-pointer"
                >
                  <CalendarRange className="w-3 h-3 shrink-0" />
                  <span>
                    {item.planType === 'annual' && item.isEffectivelyActive
                      ? 'Renovar Anual (+12m)'
                      : 'Ativar Anual (12m)'}
                  </span>
                </button>

                <button
                  type="button"
                  disabled={busyUserId === item.userId}
                  onClick={() => handleAction(item, 'activate_lifetime')}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 text-center leading-snug cursor-pointer"
                >
                  <Sparkles className="w-3 h-3 shrink-0" />
                  <span>Vitalício Especial</span>
                </button>

                <button
                  type="button"
                  disabled={busyUserId === item.userId}
                  onClick={() => handleAction(item, 'suspend')}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 text-center leading-snug cursor-pointer"
                >
                  <PauseCircle className="w-3 h-3 shrink-0" />
                  <span>Suspender</span>
                </button>

                <button
                  type="button"
                  disabled={busyUserId === item.userId}
                  onClick={() => handleAction(item, 'cancel')}
                  className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 text-center leading-snug cursor-pointer"
                >
                  <XCircle className="w-3 h-3 shrink-0" />
                  <span>Cancelar</span>
                </button>

                {item.requestStatus === 'pending' && (
                  <button
                    type="button"
                    disabled={busyUserId === item.userId}
                    onClick={() => handleAction(item, 'reject_request')}
                    className="min-h-[36px] px-2.5 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-[11px] font-semibold inline-flex items-center justify-center gap-1 text-center leading-snug cursor-pointer"
                  >
                    <Ban className="w-3 h-3 shrink-0" />
                    <span>Recusar</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
