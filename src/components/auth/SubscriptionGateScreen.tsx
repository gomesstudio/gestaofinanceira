/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldAlert,
  Download,
  RefreshCw,
  LogOut,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  CalendarRange,
  ShieldCheck,
  Settings,
  MessageCircle,
  ExternalLink,
  Check,
  LayoutDashboard
} from 'lucide-react';
import {
  buildPostSignupWhatsAppUrl,
  COMMERCIAL_WHATSAPP_NUMBER,
  exportReadOnlyBackupForBlockedUser,
  getPendingRegistrationIntent,
  getWhatsAppRenewalUrl,
  getWhatsAppSupportUrl,
  PUBLIC_COMMERCIAL_PLANS,
  SubscriptionAccessState,
  WHATSAPP_ANNUAL_PLAN_URL,
  WHATSAPP_MONTHLY_PLAN_URL
} from '../../services/subscriptionService';
import { useLegalNavigation } from '../../context/LegalNavigationContext';

interface SubscriptionGateScreenProps {
  userId: string;
  userEmail: string | null;
  displayName: string;
  accessState: SubscriptionAccessState;
  onRetryCheck: () => Promise<void> | void;
  onLogout: () => Promise<void> | void;
  onOpenMasterPortal?: () => void;
  adminPanel?: React.ReactNode;
}

export const SubscriptionGateScreen: React.FC<SubscriptionGateScreenProps> = ({
  userId,
  userEmail,
  displayName,
  accessState,
  onRetryCheck,
  onLogout,
  onOpenMasterPortal,
  adminPanel
}) => {
  const { openLegalDocument } = useLegalNavigation();
  const [isChecking, setIsChecking] = useState(false);
  const [isExporting, setIsExporting] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [whatsappConsent, setWhatsappConsent] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const pendingIntent = getPendingRegistrationIntent(userEmail);
  const profile = accessState.commercialProfile;

  const isPendingApproval =
    accessState.accessStatus === 'pending' ||
    (accessState.accessStatus === 'no_subscription' &&
      (profile?.requestStatus === 'pending' || Boolean(pendingIntent)));

  const resolvedFullName = profile?.fullName || pendingIntent?.fullName || displayName;
  const resolvedWhatsapp = profile?.whatsapp || pendingIntent?.whatsapp || '';
  const resolvedEmail = userEmail || pendingIntent?.email || '';
  const resolvedRequestedPlan =
    profile?.requestedPlan || pendingIntent?.requestedPlan || 'monthly';

  const hasSignupContactForWhatsApp =
    isPendingApproval && Boolean(resolvedFullName && resolvedEmail && resolvedWhatsapp);

  const postSignupWhatsAppUrl = hasSignupContactForWhatsApp
    ? buildPostSignupWhatsAppUrl({
        fullName: resolvedFullName,
        whatsapp: resolvedWhatsapp,
        email: resolvedEmail,
        requestedPlan: resolvedRequestedPlan
      })
    : '';

  const handleRetry = async () => {
    if (isChecking) return;
    setIsChecking(true);
    setFeedback(null);
    try {
      await onRetryCheck();
    } finally {
      setIsChecking(false);
    }
  };

  const handleExportBackup = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setFeedback(null);
    try {
      const result = await exportReadOnlyBackupForBlockedUser(userId);
      if (!result.success || !result.jsonContent || !result.filename) {
        setFeedback({
          type: 'error',
          text: result.message
        });
        return;
      }

      const blob = new Blob([result.jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      a.click();
      URL.revokeObjectURL(url);

      const summary = result.counts
        ? ` (${result.counts.transactions} lançamentos, ${result.counts.accounts} contas, ${result.counts.debts} dívidas, ${result.counts.goals} objetivos)`
        : '';

      setFeedback({
        type: 'success',
        text: `${result.message}${summary}`
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.message || 'Não foi possível exportar seu backup JSON no momento.'
      });
    } finally {
      setIsExporting(false);
    }
  };

  const getStatusMeta = () => {
    if (isPendingApproval) {
      return {
        label: 'Aguardando Liberação',
        textClass: 'text-blue-300',
        icon: <Clock className="w-4 h-4 text-blue-400 shrink-0" />
      };
    }

    switch (accessState.accessStatus) {
      case 'expired':
        return {
          label: 'Assinatura Vencida',
          textClass: 'text-amber-300',
          icon: <Clock className="w-4 h-4 text-amber-400 shrink-0" />
        };
      case 'suspended':
        return {
          label: 'Assinatura Suspensa',
          textClass: 'text-rose-300',
          icon: <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0" />
        };
      case 'canceled':
        return {
          label: 'Assinatura Cancelada',
          textClass: 'text-rose-300',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        };
      case 'error':
        return {
          label: 'Erro de Verificação',
          textClass: 'text-rose-300',
          icon: <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
        };
      default:
        return {
          label: 'Sem Plano Ativo',
          textClass: 'text-amber-300',
          icon: <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        };
    }
  };

  const statusMeta = getStatusMeta();
  const isExpired = accessState.accessStatus === 'expired';
  const renewalUrl = getWhatsAppRenewalUrl(accessState.subscription?.planType);
  const supportUrl = getWhatsAppSupportUrl(
    isPendingApproval ? 'pending' : accessState.accessStatus
  );

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col p-3 sm:p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans overflow-x-clip overflow-y-auto">
      <div className="w-full max-w-4xl m-auto space-y-5">
        <div className="p-4 sm:p-8 bg-slate-900/95 border border-slate-800 rounded-3xl shadow-2xl space-y-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-blue-500 to-emerald-400" />

          {/* Cabeçalho */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${statusMeta.textClass}`}>
                {statusMeta.icon}
                <span>{statusMeta.label}</span>
                <span aria-hidden="true" className="text-slate-600">·</span>
                <span className="text-slate-400 font-normal break-words">
                  Conta: <strong className="text-slate-200 font-semibold break-all">{userEmail || displayName}</strong>
                </span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight text-balance">
                Gestão Financeira Pro
              </h1>
              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed max-w-2xl">
                {accessState.message}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start shrink-0">
              {accessState.isAdmin && onOpenMasterPortal && (
                <button
                  type="button"
                  onClick={onOpenMasterPortal}
                  className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
                >
                  <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
                  <span>Gestão Comercial (Master)</span>
                </button>
              )}

              <button
                type="button"
                onClick={onLogout}
                className="inline-flex items-center justify-center gap-1.5 min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer"
              >
                <LogOut className="w-3.5 h-3.5 shrink-0" />
                <span>Sair da Conta</span>
              </button>
            </div>
          </div>

          {/* Bloco de Confirmação de Cadastro e Conclusão pelo WhatsApp */}
          {isPendingApproval && (
            <div
              data-testid="pending-approval-banner"
              className="p-5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-4"
            >
              <div className="flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs sm:text-sm text-slate-200 leading-relaxed">
                  <p className="font-bold text-white">Cadastro realizado com sucesso!</p>
                  <p>Sua solicitação foi registrada e está aguardando liberação.</p>
                  <p>Para concluir sua contratação, entre em contato com nossa equipe pelo WhatsApp.</p>
                </div>
              </div>

              {hasSignupContactForWhatsApp && (
                <div className="space-y-3 pt-2 border-t border-emerald-500/20">
                  <label className="flex items-start gap-2.5 text-xs text-slate-200 cursor-pointer leading-relaxed">
                    <input
                      type="checkbox"
                      checked={whatsappConsent}
                      onChange={e => {
                        setWhatsappConsent(e.target.checked);
                        if (e.target.checked) setFeedback(null);
                      }}
                      className="mt-0.5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500"
                    />
                    <span>
                      Autorizo compartilhar meus dados cadastrais (Nome: <strong>{resolvedFullName}</strong>, WhatsApp: <strong>{resolvedWhatsapp}</strong>, E-mail: <strong>{resolvedEmail}</strong> e plano solicitado: <strong>{resolvedRequestedPlan === 'annual' ? 'ANUAL' : 'MENSAL'}</strong>) no WhatsApp oficial para atendimento.
                    </span>
                  </label>

                  <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                    {whatsappConsent ? (
                      <a
                        href={postSignupWhatsAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[44px] px-4 sm:px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 text-center leading-tight"
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>CONCLUIR CONTRATAÇÃO PELO WHATSAPP</span>
                        <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                      </a>
                    ) : (
                      <button
                        type="button"
                        onClick={() =>
                          setFeedback({
                            type: 'error',
                            text: 'Marque a autorização acima antes de abrir a conversa no WhatsApp.'
                          })
                        }
                        className="min-h-[44px] px-4 sm:px-5 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-bold border border-slate-700 transition-colors inline-flex items-center justify-center gap-2 text-center leading-tight cursor-pointer"
                      >
                        <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>CONCLUIR CONTRATAÇÃO PELO WHATSAPP</span>
                      </button>
                    )}

                    <span className="text-[11px] text-slate-300 leading-relaxed">
                      Ao abrir o WhatsApp, toque em <strong>Enviar</strong>. Sua solicitação continua salva mesmo se enviar depois.
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Informações de validade e proteção dos dados */}
          <div className="pt-4 border-t border-slate-800/90 space-y-2">
            {accessState.effectiveExpiresAt && (
              <p className="text-xs text-slate-400 flex items-center gap-2 tabular-nums">
                <Calendar className="w-4 h-4 text-slate-500 shrink-0" />
                <span>
                  Validade registrada:{' '}
                  <strong className="text-slate-200">
                    {new Date(accessState.effectiveExpiresAt).toLocaleString('pt-BR')}
                  </strong>
                </span>
              </p>
            )}
            <p className="text-xs text-emerald-300/95 flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span className="leading-relaxed">
                Seus dados financeiros existentes permanecem preservados com segurança. Mesmo com a assinatura bloqueada ou vencida, você pode baixar uma cópia completa em JSON a qualquer momento.
              </span>
            </p>
          </div>

          {/* Planos Mensal e Anual (somente modalidades públicas, sem preços) */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-1">
              <h2 className="text-sm sm:text-base font-bold text-white">
                Planos disponíveis para sua rotina financeira
              </h2>
              <span className="text-xs text-slate-400">
                Atendimento comercial oficial via WhatsApp
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {PUBLIC_COMMERCIAL_PLANS.map(plan => {
                const isAnnual = plan.id === 'annual';
                const href = isAnnual ? WHATSAPP_ANNUAL_PLAN_URL : WHATSAPP_MONTHLY_PLAN_URL;

                return (
                  <div
                    key={plan.id}
                    className={`p-5 rounded-2xl border flex flex-col justify-between gap-5 ${
                      isAnnual
                        ? 'bg-emerald-950/20 border-emerald-500/40'
                        : 'bg-slate-950/70 border-slate-800'
                    }`}
                  >
                    <div className="space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <h3 className="text-base font-bold text-white">{plan.name}</h3>
                          <p
                            className={`text-xs font-medium mt-0.5 ${
                              isAnnual ? 'text-emerald-400' : 'text-blue-400'
                            }`}
                          >
                            {plan.durationLabel}
                          </p>
                        </div>
                        {isAnnual ? (
                          <CalendarRange className="w-5 h-5 text-emerald-400 shrink-0" />
                        ) : (
                          <Clock className="w-5 h-5 text-blue-400 shrink-0" />
                        )}
                      </div>

                      <p className="text-xs text-slate-300 leading-relaxed">{plan.description}</p>

                      <ul className="space-y-2 text-xs text-slate-200 pt-1">
                        {plan.benefits.map(benefit => (
                          <li key={benefit} className="flex items-start gap-2">
                            <Check
                              className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${
                                isAnnual ? 'text-emerald-400' : 'text-blue-400'
                              }`}
                            />
                            <span>{benefit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`w-full py-2.5 px-4 rounded-xl text-white text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 whitespace-nowrap shrink-0 ${
                        isAnnual
                          ? 'bg-emerald-600 hover:bg-emerald-500'
                          : 'bg-slate-800 hover:bg-slate-700 border border-slate-700'
                      }`}
                    >
                      <MessageCircle
                        className={`w-4 h-4 shrink-0 ${isAnnual ? 'text-white' : 'text-blue-400'}`}
                      />
                      <span>Consultar plano</span>
                      <ExternalLink
                        className={`w-3.5 h-3.5 shrink-0 ${isAnnual ? 'text-white' : 'text-slate-400'}`}
                      />
                    </a>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Renovação (assinaturas vencidas) e Suporte via WhatsApp */}
          <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-white">
                {isExpired
                  ? 'Renovação rápida ou atendimento sobre sua assinatura'
                  : 'Dúvidas sobre planos ou ativação da sua conta?'}
              </p>
              <p className="text-xs text-slate-400 tabular-nums">
                WhatsApp comercial e suporte: {COMMERCIAL_WHATSAPP_NUMBER}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2.5 shrink-0">
              {isExpired && (
                <a
                  href={renewalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors inline-flex items-center justify-center gap-2 text-center shrink-0"
                >
                  <MessageCircle className="w-3.5 h-3.5 shrink-0" />
                  <span>Renovar pelo WhatsApp</span>
                  <ExternalLink className="w-3 h-3 shrink-0" />
                </a>
              )}

              <a
                href={supportUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold border border-slate-700 transition-colors inline-flex items-center justify-center gap-2 text-center shrink-0"
              >
                <MessageCircle className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>Falar com o suporte</span>
                <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
              </a>
            </div>
          </div>

          {feedback && (
            <div
              role={feedback.type === 'success' ? 'status' : 'alert'}
              className={`p-3.5 rounded-xl border text-xs flex items-start gap-2.5 ${
                feedback.type === 'success'
                  ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                  : 'bg-rose-500/15 border-rose-500/30 text-rose-200'
              }`}
            >
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              )}
              <span className="leading-relaxed">{feedback.text}</span>
            </div>
          )}

          {/* Ações de backup e atualização de status */}
          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              onClick={handleExportBackup}
              disabled={isExporting}
              className="flex-1 min-h-[44px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-2 text-center leading-tight cursor-pointer"
            >
              <Download className="w-4 h-4 shrink-0" />
              <span>
                {isExporting ? 'Preparando Backup...' : 'Exportar Backup JSON (.json)'}
              </span>
            </button>

            <button
              type="button"
              onClick={handleRetry}
              disabled={isChecking}
              className="flex-1 min-h-[44px] py-3 px-4 bg-slate-800 hover:bg-slate-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-2 text-center leading-tight cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 shrink-0 ${isChecking ? 'animate-spin' : ''}`} />
              <span>
                {isChecking ? 'Verificando...' : 'Verificar Assinatura Novamente'}
              </span>
            </button>
          </div>

          {accessState.isAdmin && adminPanel && (
            <div className="pt-3 border-t border-slate-800 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAdminPanel(prev => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-emerald-300 text-xs font-semibold border border-slate-700 cursor-pointer whitespace-nowrap"
              >
                <Settings className="w-3.5 h-3.5 shrink-0" />
                <span>
                  {showAdminPanel
                    ? 'Ocultar Painel Administrativo'
                    : 'Gerenciar Assinaturas (Admin)'}
                </span>
              </button>
            </div>
          )}
        </div>

        {accessState.isAdmin && showAdminPanel && adminPanel && (
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-800 p-4 sm:p-6 shadow-2xl">
            {adminPanel}
          </div>
        )}

        <div className="pt-2 pb-1 text-center text-[11px] text-slate-400 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={() => openLegalDocument('terms_of_use')}
            data-testid="gate-terms-link"
            className="text-slate-300 hover:text-emerald-400 underline underline-offset-2 transition-colors cursor-pointer"
          >
            Termos de Uso
          </button>
          <span aria-hidden="true" className="text-slate-600">
            ·
          </span>
          <button
            type="button"
            onClick={() => openLegalDocument('privacy_policy')}
            data-testid="gate-privacy-link"
            className="text-slate-300 hover:text-emerald-400 underline underline-offset-2 transition-colors cursor-pointer"
          >
            Política de Privacidade
          </button>
        </div>
      </div>
    </div>
  );
};
