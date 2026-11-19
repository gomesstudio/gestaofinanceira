/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ShieldCheck,
  LayoutDashboard,
  Users,
  DollarSign,
  Wallet,
  LogOut
} from 'lucide-react';
import {
  AdminSubscriptionListItem,
  CommercialPaymentRecord,
  fetchAdminSubscriptionsList,
  fetchCommercialPayments,
  fetchMasterDashboardMetrics,
  MasterDashboardMetrics
} from '../../services/subscriptionService';
import { MasterDashboardView } from './MasterDashboardView';
import { MasterClientsRequestsView } from './MasterClientsRequestsView';
import { MasterBillingView } from './MasterBillingView';

export type MasterPortalTab = 'dashboard' | 'clients' | 'billing';

interface MasterCommercialPortalProps {
  isAdmin: boolean;
  adminEmail: string | null;
  hasPersonalFinanceAccess: boolean;
  onSwitchToFinances: () => void;
  onLogout: () => Promise<void> | void;
  onSubscriptionUpdated?: () => Promise<void> | void;
  initialTab?: MasterPortalTab;
}

export const MasterCommercialPortal: React.FC<MasterCommercialPortalProps> = ({
  isAdmin,
  adminEmail,
  hasPersonalFinanceAccess,
  onSwitchToFinances,
  onLogout,
  onSubscriptionUpdated,
  initialTab = 'dashboard'
}) => {
  const [activeTab, setActiveTab] = useState<MasterPortalTab>(initialTab);

  const [metrics, setMetrics] = useState<MasterDashboardMetrics | null>(null);
  const [isLoadingMetrics, setIsLoadingMetrics] = useState(false);
  const [metricsError, setMetricsError] = useState<string | null>(null);

  const [clients, setClients] = useState<AdminSubscriptionListItem[]>([]);
  const [isLoadingClients, setIsLoadingClients] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);

  const [payments, setPayments] = useState<CommercialPaymentRecord[]>([]);
  const [isLoadingPayments, setIsLoadingPayments] = useState(false);
  const [paymentsError, setPaymentsError] = useState<string | null>(null);

  const loadMetrics = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingMetrics(true);
    setMetricsError(null);
    try {
      const res = await fetchMasterDashboardMetrics();
      if (!res.success || !res.metrics) {
        setMetricsError(res.message || 'Erro ao carregar indicadores.');
      } else {
        setMetrics(res.metrics);
      }
    } finally {
      setIsLoadingMetrics(false);
    }
  }, [isAdmin]);

  const loadClients = useCallback(
    async (search?: string) => {
      if (!isAdmin) return;
      setIsLoadingClients(true);
      setClientsError(null);
      try {
        const res = await fetchAdminSubscriptionsList(search);
        if (!res.success) {
          setClientsError(res.message || 'Erro ao carregar clientes.');
          setClients([]);
        } else {
          setClients(res.items);
        }
      } finally {
        setIsLoadingClients(false);
      }
    },
    [isAdmin]
  );

  const loadPayments = useCallback(async () => {
    if (!isAdmin) return;
    setIsLoadingPayments(true);
    setPaymentsError(null);
    try {
      const res = await fetchCommercialPayments();
      if (!res.success) {
        setPaymentsError(res.message || 'Erro ao carregar pagamentos.');
        setPayments([]);
      } else {
        setPayments(res.items);
      }
    } finally {
      setIsLoadingPayments(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    loadMetrics();
    loadClients();
    loadPayments();
  }, [isAdmin, loadMetrics, loadClients, loadPayments]);

  // Proteção absoluta em UI: não renderiza se não for administrador confirmado no servidor
  if (!isAdmin) {
    return null;
  }

  const handleDataChanged = async () => {
    await Promise.all([loadMetrics(), loadPayments()]);
    if (onSubscriptionUpdated) {
      await onSubscriptionUpdated();
    }
  };

  return (
    <div
      data-testid="master-commercial-portal"
      className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans"
    >
      {/* Top Bar Exclusiva do Ambiente Comercial */}
      <header className="sticky top-0 z-30 bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Painel Master Exclusivo
              </div>
              <h1 className="text-base sm:text-lg font-extrabold text-slate-900 dark:text-white leading-tight">
                Gestão Comercial · Gestão Financeira Pro
              </h1>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {adminEmail && (
              <span className="text-xs text-slate-500 dark:text-slate-400 mr-1 hidden sm:inline">
                {adminEmail}
              </span>
            )}

            <button
              type="button"
              onClick={onSwitchToFinances}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <Wallet className="w-3.5 h-3.5 shrink-0" />
              <span>
                {hasPersonalFinanceAccess ? 'Minhas Finanças' : 'Voltar'}
              </span>
            </button>

            <button
              type="button"
              onClick={onLogout}
              className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
            >
              <LogOut className="w-3.5 h-3.5 shrink-0" />
              <span>Sair</span>
            </button>
          </div>
        </div>

        {/* Navegação entre os 3 módulos do Painel Master */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center gap-1 overflow-x-auto border-t border-slate-100 dark:border-slate-800/80 py-2">
          <button
            type="button"
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'dashboard'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <LayoutDashboard className="w-4 h-4 shrink-0" />
            <span>Dashboard Comercial</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('clients')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'clients'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Users className="w-4 h-4 shrink-0" />
            <span>Clientes e Solicitações</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('billing')}
            className={`px-3.5 py-2 rounded-xl text-xs font-bold inline-flex items-center gap-2 cursor-pointer whitespace-nowrap transition-colors ${
              activeTab === 'billing'
                ? 'bg-slate-900 dark:bg-emerald-600 text-white'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <DollarSign className="w-4 h-4 shrink-0" />
            <span>Faturamento</span>
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        {activeTab === 'dashboard' && (
          <MasterDashboardView
            metrics={metrics}
            isLoading={isLoadingMetrics}
            errorMessage={metricsError}
            onRefresh={loadMetrics}
            onNavigateTab={tab => setActiveTab(tab)}
          />
        )}

        {activeTab === 'clients' && (
          <MasterClientsRequestsView
            items={clients}
            isLoading={isLoadingClients}
            errorMessage={clientsError}
            onRefresh={loadClients}
            onActionCompleted={handleDataChanged}
          />
        )}

        {activeTab === 'billing' && (
          <MasterBillingView
            clients={clients}
            payments={payments}
            isLoading={isLoadingPayments}
            errorMessage={paymentsError}
            onRefresh={loadPayments}
            onPaymentChanged={loadMetrics}
          />
        )}
      </main>
    </div>
  );
};
