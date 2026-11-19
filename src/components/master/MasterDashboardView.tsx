/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from 'react';
import {
  TrendingUp,
  DollarSign,
  Users,
  ShieldCheck,
  Clock,
  AlertTriangle,
  Sparkles,
  RefreshCw,
  CalendarClock,
  Layers,
  Ban
} from 'lucide-react';
import {
  formatCentsToBRL,
  MasterDashboardMetrics
} from '../../services/subscriptionService';

interface MasterDashboardViewProps {
  metrics: MasterDashboardMetrics | null;
  isLoading: boolean;
  errorMessage: string | null;
  onRefresh: () => void;
  onNavigateTab?: (tab: 'clients' | 'billing') => void;
}

const MONTH_ABBR_PT: Record<string, string> = {
  '01': 'Jan',
  '02': 'Fev',
  '03': 'Mar',
  '04': 'Abr',
  '05': 'Mai',
  '06': 'Jun',
  '07': 'Jul',
  '08': 'Ago',
  '09': 'Set',
  '10': 'Out',
  '11': 'Nov',
  '12': 'Dez'
};

function formatMonthKeyLabel(monthKey: string): string {
  const parts = monthKey.split('-');
  if (parts.length !== 2) return monthKey;
  const label = MONTH_ABBR_PT[parts[1]] || parts[1];
  return `${label}/${parts[0].slice(2)}`;
}

export const MasterDashboardView: React.FC<MasterDashboardViewProps> = ({
  metrics,
  isLoading,
  errorMessage,
  onRefresh,
  onNavigateTab
}) => {
  const revenueSeries = metrics?.monthlyRevenueSeries || [];
  const customersSeries = metrics?.newCustomersSeries || [];

  const maxRevenueCents = useMemo(() => {
    if (revenueSeries.length === 0) return 0;
    return Math.max(...revenueSeries.map(item => item.revenueCents), 0);
  }, [revenueSeries]);

  const maxCustomersCount = useMemo(() => {
    if (customersSeries.length === 0) return 0;
    return Math.max(...customersSeries.map(item => item.customersCount), 0);
  }, [customersSeries]);

  const planTotal = useMemo(() => {
    if (!metrics) return 0;
    return (
      metrics.planDistribution.monthly +
      metrics.planDistribution.annual +
      metrics.planDistribution.lifetime
    );
  }, [metrics]);

  if (isLoading && !metrics) {
    return (
      <div
        data-testid="master-dashboard-loading"
        className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col items-center justify-center gap-3 text-center"
      >
        <RefreshCw className="w-6 h-6 text-emerald-500 animate-spin" />
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Carregando indicadores comerciais do servidor...
        </p>
        <p className="text-xs text-slate-500">
          Consultando exclusivamente métricas comerciais e de assinaturas
        </p>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div
        role="alert"
        className="p-6 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 space-y-3"
      >
        <div className="flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-rose-900 dark:text-rose-200">
              Não foi possível carregar o Dashboard Comercial
            </h3>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-1 leading-relaxed">
              {errorMessage}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onRefresh}
          className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Tentar Novamente</span>
        </button>
      </div>
    );
  }

  if (!metrics) {
    return (
      <div className="p-8 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-center space-y-2">
        <p className="text-sm font-semibold text-slate-900 dark:text-white">
          Nenhum indicador comercial disponível ainda.
        </p>
        <p className="text-xs text-slate-500">
          Cadastre clientes ou registre pagamentos confirmados para visualizar os números do negócio.
        </p>
      </div>
    );
  }

  const totalConfirmedSales =
    metrics.salesByPlan.monthly + metrics.salesByPlan.annual + metrics.salesByPlan.lifetime;

  const monthlyPct =
    planTotal > 0 ? Math.round((metrics.planDistribution.monthly / planTotal) * 100) : 0;
  const annualPct =
    planTotal > 0 ? Math.round((metrics.planDistribution.annual / planTotal) * 100) : 0;
  const lifetimePct =
    planTotal > 0
      ? Math.max(0, 100 - monthlyPct - annualPct)
      : 0;

  return (
    <div data-testid="master-dashboard-view" className="space-y-6">
      {/* Cabeçalho e ação de atualização */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
            Visão Executiva Comercial
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Receitas contabilizam somente pagamentos confirmados. Concessões gratuitas permanecem com faturamento zero.
          </p>
        </div>

        <button
          type="button"
          onClick={onRefresh}
          disabled={isLoading}
          className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center gap-1.5 self-start sm:self-auto cursor-pointer whitespace-nowrap"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          <span>Atualizar Indicadores</span>
        </button>
      </div>

      {/* Linha 1: KPIs Principais de Faturamento & Base */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Faturamento Bruto do Mês
            </span>
            <DollarSign className="w-4 h-4 text-emerald-500 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {formatCentsToBRL(metrics.monthlyRevenueCents)}
          </div>
          <p className="text-[11px] text-slate-500">
            Somente pagamentos confirmados no mês vigente
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Faturamento Acumulado no Ano
            </span>
            <TrendingUp className="w-4 h-4 text-blue-500 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {formatCentsToBRL(metrics.ytdRevenueCents)}
          </div>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {totalConfirmedSales} venda(s) pagas confirmadas
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Total de Clientes Cadastrados
            </span>
            <Users className="w-4 h-4 text-slate-500 shrink-0" />
          </div>
          <div className="text-2xl font-extrabold text-slate-900 dark:text-white tabular-nums tracking-tight">
            {metrics.totalCustomers}
          </div>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {metrics.activeSubscriptions} assinatura(s) ativas no momento
          </p>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Solicitações Pendentes
            </span>
            <Clock className="w-4 h-4 text-amber-500 shrink-0" />
          </div>
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400 tabular-nums tracking-tight">
              {metrics.pendingRequests}
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('clients')}
                className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
              >
                Analisar fila
              </button>
            )}
          </div>
          <p className="text-[11px] text-slate-500">
            Cadastros aguardando aprovação manual
          </p>
        </div>
      </div>

      {/* Linha 2: KPIs Operacionais de Assinaturas & Vendas por Plano */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Assinaturas Ativas</span>
            <ShieldCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-slate-900 dark:text-white tabular-nums">
            {metrics.activeSubscriptions}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Próx. do Vencimento (7d)</span>
            <CalendarClock className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-amber-600 dark:text-amber-400 tabular-nums">
            {metrics.expiringSoon}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Assinaturas Vencidas</span>
            <Ban className="w-4 h-4 text-rose-500" />
          </div>
          <div className="text-xl font-bold text-rose-600 dark:text-rose-400 tabular-nums">
            {metrics.expiredSubscriptions}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Vitalícios Especiais Ativos</span>
            <Sparkles className="w-4 h-4 text-violet-500" />
          </div>
          <div className="text-xl font-bold text-violet-600 dark:text-violet-400 tabular-nums">
            {metrics.activeLifetime}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 space-y-1.5">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span>Vendas Pagas por Plano</span>
            <Layers className="w-4 h-4 text-blue-500" />
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="text-slate-600 dark:text-slate-300">Mensal:</span>
            <strong className="text-slate-900 dark:text-white">{metrics.salesByPlan.monthly}</strong>
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="text-slate-600 dark:text-slate-300">Anual:</span>
            <strong className="text-slate-900 dark:text-white">{metrics.salesByPlan.annual}</strong>
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums">
            <span className="text-slate-600 dark:text-slate-300">Vitalício pago:</span>
            <strong className="text-slate-900 dark:text-white">{metrics.salesByPlan.lifetime}</strong>
          </div>
        </div>
      </div>

      {/* Gráficos Reais (SVG responsivos sem mock) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Gráfico 1: Evolução Mensal do Faturamento */}
        <div className="lg:col-span-2 p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Evolução Mensal do Faturamento
              </h3>
              <p className="text-xs text-slate-500">
                Receita confirmada por competência (pagamentos pendentes ou cancelados não são somados)
              </p>
            </div>
            {onNavigateTab && (
              <button
                type="button"
                onClick={() => onNavigateTab('billing')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer whitespace-nowrap"
              >
                Ver Lançamentos
              </button>
            )}
          </div>

          {revenueSeries.length === 0 || maxRevenueCents === 0 ? (
            <div className="h-48 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-4 text-center">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Nenhuma receita confirmada registrada ainda
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                O gráfico exibirá a evolução mensal automaticamente conforme pagamentos confirmados forem registrados em Faturamento.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-full overflow-x-auto">
                <svg
                  viewBox={`0 0 ${Math.max(revenueSeries.length * 76, 360)} 180`}
                  className="w-full h-48 min-w-[320px]"
                  role="img"
                  aria-label="Gráfico de evolução mensal do faturamento comercial"
                >
                  {revenueSeries.map((point, idx) => {
                    const barWidth = 38;
                    const gap = 36;
                    const x = 24 + idx * (barWidth + gap);
                    const maxBarHeight = 115;
                    const height =
                      maxRevenueCents > 0
                        ? Math.max(4, Math.round((point.revenueCents / maxRevenueCents) * maxBarHeight))
                        : 4;
                    const y = 140 - height;

                    return (
                      <g key={point.monthKey}>
                        <rect
                          x={x}
                          y={y}
                          width={barWidth}
                          height={height}
                          rx={6}
                          className="fill-emerald-500 dark:fill-emerald-500"
                        />
                        <text
                          x={x + barWidth / 2}
                          y={y - 6}
                          textAnchor="middle"
                          className="fill-slate-700 dark:fill-slate-300 text-[9px] font-semibold"
                        >
                          {formatCentsToBRL(point.revenueCents)}
                        </text>
                        <text
                          x={x + barWidth / 2}
                          y={162}
                          textAnchor="middle"
                          className="fill-slate-500 dark:fill-slate-400 text-[10px] font-medium"
                        >
                          {formatMonthKeyLabel(point.monthKey)}
                        </text>
                      </g>
                    );
                  })}
                </svg>
              </div>
            </div>
          )}
        </div>

        {/* Gráfico 2: Distribuição de Assinaturas Ativas por Plano */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white">
              Distribuição por Plano
            </h3>
            <p className="text-xs text-slate-500">
              Assinaturas ativas segmentadas por modalidade
            </p>
          </div>

          {planTotal === 0 ? (
            <div className="h-48 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 flex flex-col items-center justify-center p-4 text-center">
              <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Sem assinaturas ativas no momento
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                Aprove clientes na aba Clientes e Solicitações para visualizar a distribuição.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Barra segmentada limpa */}
              <div className="w-full h-4 rounded-full overflow-hidden bg-slate-100 dark:bg-slate-800 flex">
                {metrics.planDistribution.monthly > 0 && (
                  <div
                    style={{ width: `${monthlyPct}%` }}
                    className="bg-blue-500 h-full"
                    title={`Mensal: ${metrics.planDistribution.monthly}`}
                  />
                )}
                {metrics.planDistribution.annual > 0 && (
                  <div
                    style={{ width: `${annualPct}%` }}
                    className="bg-emerald-500 h-full"
                    title={`Anual: ${metrics.planDistribution.annual}`}
                  />
                )}
                {metrics.planDistribution.lifetime > 0 && (
                  <div
                    style={{ width: `${lifetimePct}%` }}
                    className="bg-violet-500 h-full"
                    title={`Vitalício Especial: ${metrics.planDistribution.lifetime}`}
                  />
                )}
              </div>

              <div className="space-y-2.5 text-xs tabular-nums">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-blue-500 shrink-0" />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Plano Mensal
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {metrics.planDistribution.monthly} ({monthlyPct}%)
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500 shrink-0" />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Plano Anual
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {metrics.planDistribution.annual} ({annualPct}%)
                  </span>
                </div>

                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-xs bg-violet-500 shrink-0" />
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      Vitalício Especial (Master)
                    </span>
                  </div>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {metrics.planDistribution.lifetime} ({lifetimePct}%)
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Gráfico 3: Novos Clientes por Mês */}
      <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white">
            Novos Clientes por Mês
          </h3>
          <p className="text-xs text-slate-500">
            Cadastros registrados nos últimos meses (independentemente de aprovação)
          </p>
        </div>

        {customersSeries.length === 0 || maxCustomersCount === 0 ? (
          <div className="h-36 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 flex items-center justify-center p-4 text-center">
            <p className="text-xs text-slate-500">
              Nenhum histórico mensal de cadastros disponível ainda.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {customersSeries.map(item => {
              const barPct =
                maxCustomersCount > 0
                  ? Math.max(8, Math.round((item.customersCount / maxCustomersCount) * 100))
                  : 8;
              return (
                <div
                  key={item.monthKey}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-2"
                >
                  <div className="flex items-center justify-between text-xs tabular-nums">
                    <span className="text-slate-500 font-medium">
                      {formatMonthKeyLabel(item.monthKey)}
                    </span>
                    <strong className="text-slate-900 dark:text-white">
                      {item.customersCount}
                    </strong>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
                    <div
                      className="h-full bg-blue-500 rounded-full"
                      style={{ width: `${barPct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
