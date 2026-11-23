/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  FileText,
  History,
  LogOut,
  RefreshCw,
  ShieldCheck
} from 'lucide-react';
import { useLegalNavigation } from '../../context/LegalNavigationContext';
import {
  LEGAL_CONTROLLER_INFO,
  LEGAL_DOCUMENTS_REGISTRY,
  LegalDocumentId
} from '../../legal/legalConfig';
import {
  fetchUserLegalConsentStatus,
  recordUserLegalConsent,
  setOptionalWhatsappConsent,
  UserLegalConsentState,
  WhatsappConsentDecision
} from '../../services/legalConsentService';

export interface LegalConsentGateProps {
  userId: string;
  userEmail?: string | null;
  displayName?: string;
  initialConsentState?: UserLegalConsentState | null;
  onConsentCompleted: (updatedState: UserLegalConsentState) => void;
  onLogout?: () => Promise<void> | void;
  onOpenDocument?: (docId: LegalDocumentId) => void;
}

export const LegalConsentGate: React.FC<LegalConsentGateProps> = ({
  userId,
  userEmail,
  displayName,
  initialConsentState = null,
  onConsentCompleted,
  onLogout,
  onOpenDocument
}) => {
  const { openLegalDocument } = useLegalNavigation();

  const [consentState, setConsentState] = useState<UserLegalConsentState | null>(
    initialConsentState
  );
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(!initialConsentState);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [isUpdatingWhatsapp, setIsUpdatingWhatsapp] = useState<boolean>(false);
  const [isMandatoryChecked, setIsMandatoryChecked] = useState<boolean>(false);
  const [whatsappDecision, setWhatsappDecision] =
    useState<WhatsappConsentDecision>('unchanged');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [whatsappFeedback, setWhatsappFeedback] = useState<string | null>(null);

  const handleOpenDoc = (docId: LegalDocumentId) => {
    if (onOpenDocument) {
      onOpenDocument(docId);
      return;
    }
    openLegalDocument(docId);
  };

  const loadConsentStatus = useCallback(async () => {
    setIsLoadingStatus(true);
    setSubmitError(null);
    setWhatsappFeedback(null);
    try {
      const next = await fetchUserLegalConsentStatus(userId);
      setConsentState(next);
      setWhatsappDecision('unchanged');
      if (next.hasValidConsent) {
        onConsentCompleted(next);
      }
    } finally {
      setIsLoadingStatus(false);
    }
  }, [userId, onConsentCompleted]);

  useEffect(() => {
    if (initialConsentState) {
      setConsentState(initialConsentState);
      setWhatsappDecision('unchanged');
      setIsLoadingStatus(false);
      return;
    }
    loadConsentStatus();
  }, [initialConsentState, loadConsentStatus]);

  const isSchemaMissingOrLoadError =
    consentState?.mode === 'schema_missing' || consentState?.mode === 'error';

  const isLegacyTransition = consentState?.mode === 'legacy_user_transition';
  const isReacceptance = consentState?.mode === 'reacceptance_required';
  const hasActiveWhatsappConsent = Boolean(consentState?.optionalWhatsappConsentActive);

  const termsMeta = LEGAL_DOCUMENTS_REGISTRY.terms_of_use;
  const privacyMeta = LEGAL_DOCUMENTS_REGISTRY.privacy_policy;

  const canContinue =
    isMandatoryChecked &&
    !isLoadingStatus &&
    !isSubmitting &&
    !isUpdatingWhatsapp &&
    !isSchemaMissingOrLoadError;

  const handleExplicitWhatsappAction = async (action: 'grant' | 'revoke') => {
    if (isLoadingStatus || isSubmitting || isUpdatingWhatsapp || isSchemaMissingOrLoadError) {
      return;
    }
    setIsUpdatingWhatsapp(true);
    setSubmitError(null);
    setWhatsappFeedback(null);
    try {
      const res = await setOptionalWhatsappConsent({
        expectedUserId: userId,
        action,
        eventSource: 'explicit_whatsapp_toggle'
      });

      if (!res.success || !res.state) {
        setSubmitError(
          res.message ||
            'Não foi possível atualizar o consentimento opcional de WhatsApp no servidor.'
        );
        return;
      }

      setConsentState(res.state);
      setWhatsappDecision('unchanged');
      setWhatsappFeedback(res.message);
    } finally {
      setIsUpdatingWhatsapp(false);
    }
  };

  const handleContinue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canContinue) return;

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await recordUserLegalConsent({
        expectedUserId: userId,
        acceptContractualTerms: isMandatoryChecked,
        acknowledgePrivacyPolicy: isMandatoryChecked,
        optionalWhatsappDecision: whatsappDecision,
        acceptanceSource: isReacceptance ? 'reacceptance_prompt' : 'legal_consent_gate'
      });

      if (!res.success || !res.state || !res.state.hasValidConsent) {
        setSubmitError(
          res.message ||
            'Não foi possível registrar sua confirmação no servidor. Tente novamente.'
        );
        return;
      }

      setConsentState(res.state);
      onConsentCompleted(res.state);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      data-testid="legal-consent-gate"
      className="min-h-screen min-h-[100dvh] w-full flex flex-col p-3 sm:p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans relative overflow-x-clip overflow-y-auto"
    >
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[300px] h-[300px] sm:w-[540px] sm:h-[540px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className="w-full max-w-2xl m-auto relative z-10">
        <div className="p-4 sm:p-8 bg-slate-900/95 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 relative overflow-hidden space-y-5">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500" />

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-800/80 pb-5">
            <div className="flex items-start gap-3.5 min-w-0">
              <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shrink-0">
                <ShieldCheck className="w-7 h-7" />
              </div>
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-semibold text-emerald-400 tracking-wide">
                  Gestão Financeira Pro · Registro de Versão e Privacidade
                </div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                  Seus dados, sua privacidade.
                </h1>
                {(displayName || userEmail) && (
                  <p className="text-xs text-slate-400 break-words">
                    Conta autenticada:{' '}
                    <strong className="text-slate-200">{displayName || userEmail}</strong>
                    {displayName && userEmail ? ` (${userEmail})` : ''}
                  </p>
                )}
              </div>
            </div>

            {onLogout && (
              <button
                type="button"
                onClick={() => onLogout()}
                data-testid="consent-gate-logout"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition-colors cursor-pointer self-start shrink-0"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sair</span>
              </button>
            )}
          </div>

          {/* Explicação objetiva sobre privacidade e retenção */}
          <div className="space-y-2 text-xs sm:text-sm text-slate-300 leading-relaxed">
            <p>
              O <strong>Gestão Financeira Pro</strong> é uma ferramenta de organização financeira pessoal (não é banco nem instituição financeira). Seus lançamentos são vinculados exclusivamente ao seu identificador de conta, protegidos por autenticação oficial e controle de acesso por usuário.
            </p>
            <p className="text-xs text-slate-400 leading-relaxed">
              Registramos apenas a confirmação de versão, hash do documento, data e hora geradas pelo servidor — sem coletar endereço IP, geolocalização ou fingerprint do dispositivo. Os registros jurídicos e eventuais obrigações comerciais seguem regras de conservação legal enquanto necessários.
            </p>
          </div>

          {/* Estado de carregamento inicial */}
          {isLoadingStatus && (
            <div
              data-testid="consent-gate-loading"
              role="status"
              className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 flex items-center gap-3 text-xs text-slate-300"
            >
              <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <span>Verificando versões vigentes e seu histórico de aceite no servidor...</span>
            </div>
          )}

          {/* Tratamento específico de usuários antigos */}
          {!isLoadingStatus && isLegacyTransition && (
            <div
              data-testid="consent-gate-legacy-notice"
              className="p-4 rounded-2xl bg-blue-500/10 border border-blue-500/30 text-blue-100 text-xs space-y-1.5 leading-relaxed"
            >
              <div className="font-bold text-blue-300 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>Sua conta e seus dados financeiros anteriores estão preservados</span>
              </div>
              <p>
                Identificamos que sua conta já existia antes da implantação do registro formal de versões. Nenhum lançamento financeiro foi alterado. Pedimos apenas sua confirmação expressa das versões atuais abaixo para manter seu histórico em dia.
              </p>
            </div>
          )}

          {/* Aviso de reaceite por atualização de versão */}
          {!isLoadingStatus && isReacceptance && consentState && (
            <div
              data-testid="consent-gate-reacceptance-notice"
              className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-100 text-xs space-y-1.5 leading-relaxed"
            >
              <div className="font-bold text-amber-300 flex items-center gap-2">
                <History className="w-4 h-4 shrink-0" />
                <span>Atualização de documentos — nova confirmação necessária</span>
              </div>
              <p>
                Publicamos uma nova versão dos documentos jurídicos desde o seu último registro:
              </p>
              <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-amber-200/90">
                {consentState.needsTermsReacceptance && (
                  <li>
                    Termos de Uso: anterior{' '}
                    <strong className="font-mono">
                      v{consentState.acceptedTermsVersion || '—'}
                    </strong>{' '}
                    → atual <strong className="font-mono">v{termsMeta.version}</strong>
                  </li>
                )}
                {consentState.needsPrivacyReacknowledgment && (
                  <li>
                    Política de Privacidade: anterior{' '}
                    <strong className="font-mono">
                      v{consentState.acknowledgedPrivacyVersion || '—'}
                    </strong>{' '}
                    → atual <strong className="font-mono">v{privacyMeta.version}</strong>
                  </li>
                )}
              </ul>
            </div>
          )}

          {/* Erro de banco/rede na consulta inicial (NUNCA interpreta falha como aceite) */}
          {!isLoadingStatus && isSchemaMissingOrLoadError && consentState && (
            <div
              data-testid="consent-gate-load-error"
              role="alert"
              className="p-4 rounded-2xl bg-rose-500/15 border border-rose-500/30 text-rose-100 text-xs space-y-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="space-y-1 leading-relaxed">
                  <div className="font-bold text-rose-200">
                    Não foi possível confirmar o registro de aceite no servidor
                  </div>
                  <p>{consentState.message}</p>
                  <p className="text-[11px] text-rose-200/80">
                    Por segurança, falhas de comunicação ou ausência da estrutura no banco não liberam acesso nem gravam aceites fictícios.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={loadConsentStatus}
                data-testid="consent-gate-retry-load"
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-semibold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Tentar Novamente</span>
              </button>
            </div>
          )}

          {/* Cards de consulta aos documentos e versões */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>{termsMeta.shortTitle}</span>
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-300">
                  v{termsMeta.version}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <strong className="text-slate-300">Aceite contratual:</strong> regras de uso da ferramenta, responsabilidades e planos.
              </p>
              <button
                type="button"
                onClick={() => handleOpenDoc('terms_of_use')}
                data-testid="consent-gate-open-terms"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-400 hover:text-emerald-300 underline underline-offset-2 cursor-pointer"
              >
                <span>Ler Termos de Uso</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-950/70 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-white flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-blue-400 shrink-0" />
                  <span>{privacyMeta.shortTitle}</span>
                </span>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/10 border border-blue-500/30 text-blue-300">
                  v{privacyMeta.version}
                </span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                <strong className="text-slate-300">Ciência transparente (LGPD):</strong> como seus dados são tratados, armazenados e seus direitos.
              </p>
              <button
                type="button"
                onClick={() => handleOpenDoc('privacy_policy')}
                data-testid="consent-gate-open-privacy"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-blue-400 hover:text-blue-300 underline underline-offset-2 cursor-pointer"
              >
                <span>Ler Política de Privacidade</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            </div>
          </div>

          {/* Formulário de confirmação com distinção jurídica clara */}
          <form onSubmit={handleContinue} className="space-y-3.5">
            {/* Checkbox 1: Obrigatório — Aceite Contratual + Ciência da Política */}
            <label className="flex items-start gap-3 p-4 rounded-2xl bg-slate-950/80 border border-slate-700/80 hover:border-emerald-500/50 transition-colors cursor-pointer">
              <input
                type="checkbox"
                data-testid="consent-mandatory-checkbox"
                checked={isMandatoryChecked}
                disabled={isLoadingStatus || isSubmitting || isSchemaMissingOrLoadError}
                onChange={e => {
                  setIsMandatoryChecked(e.target.checked);
                  if (submitError) setSubmitError(null);
                }}
                className="mt-0.5 w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 shrink-0"
              />
              <span className="text-xs text-slate-200 leading-relaxed space-y-1 block">
                <span className="block font-semibold text-white">
                  Confirmação obrigatória para uso da conta *
                </span>
                <span className="block text-slate-300">
                  Li e <strong>aceito contratualmente</strong> os{' '}
                  <strong>Termos de Uso (v{termsMeta.version})</strong> e declaro{' '}
                  <strong>ciência</strong> da{' '}
                  <strong>Política de Privacidade (v{privacyMeta.version})</strong>, compreendendo as bases legais aplicáveis à operação da ferramenta (execução de contrato, segurança e obrigações legais) sem que isso implique autorização genérica para comunicações opcionais.
                </span>
              </span>
            </label>

            {/* Controle 2: Opcional e separado — Consentimento comercial via WhatsApp (concessão ou revogação explícita) */}
            {hasActiveWhatsappConsent ? (
              <div
                data-testid="consent-optional-whatsapp-active-box"
                className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5 text-xs text-slate-200"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <div className="font-semibold text-emerald-300">
                      Consentimento opcional (WhatsApp comercial): Ativo
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Sua autorização facultativa para receber avisos comerciais via WhatsApp ({LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}) está vigente e é preservada caso você não clique para revogar.
                    </p>
                  </div>
                  <button
                    type="button"
                    data-testid="consent-revoke-whatsapp-button"
                    disabled={isLoadingStatus || isSubmitting || isUpdatingWhatsapp || isSchemaMissingOrLoadError}
                    onClick={() => handleExplicitWhatsappAction('revoke')}
                    className="min-h-[38px] px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-rose-900/60 text-rose-200 border border-rose-500/30 text-[11px] font-semibold transition-colors cursor-pointer shrink-0 disabled:opacity-50"
                  >
                    {isUpdatingWhatsapp ? 'Revogando...' : 'Revogar consentimento WhatsApp'}
                  </button>
                </div>
              </div>
            ) : (
              <label className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-950/50 border border-slate-800 hover:border-slate-700 transition-colors cursor-pointer">
                <input
                  type="checkbox"
                  data-testid="consent-optional-whatsapp-checkbox"
                  checked={whatsappDecision === 'grant'}
                  disabled={isLoadingStatus || isSubmitting || isUpdatingWhatsapp || isSchemaMissingOrLoadError}
                  onChange={e => setWhatsappDecision(e.target.checked ? 'grant' : 'unchanged')}
                  className="mt-0.5 w-4 h-4 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 shrink-0"
                />
                <span className="text-xs text-slate-300 leading-relaxed block space-y-1">
                  <span className="block">
                    <span className="font-semibold text-slate-200">
                      Consentimento opcional (WhatsApp comercial):{' '}
                    </span>
                    Autorizo, de forma facultativa e revogável a qualquer momento, o recebimento de avisos comerciais pelo WhatsApp oficial ({LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}). Esta opção não é obrigatória e permanecer desmarcada não impede que você abra voluntariamente o WhatsApp quando desejar atendimento.
                  </span>
                  {consentState?.optionalWhatsappConsentStatus === 'revoked' && (
                    <span
                      data-testid="consent-whatsapp-revoked-badge"
                      className="inline-block text-[11px] text-amber-300 font-medium"
                    >
                      Status atual: consentimento comercial revogado no histórico.
                    </span>
                  )}
                </span>
              </label>
            )}

            {whatsappFeedback && (
              <div
                data-testid="consent-whatsapp-feedback"
                className="p-3 rounded-xl bg-slate-800/80 border border-slate-700 text-slate-200 text-xs"
              >
                {whatsappFeedback}
              </div>
            )}

            {/* Erro no envio */}
            {submitError && (
              <div
                data-testid="consent-gate-submit-error"
                role="alert"
                className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5"
              >
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-relaxed">{submitError}</span>
              </div>
            )}

            <button
              type="submit"
              data-testid="consent-gate-continue-button"
              disabled={!canContinue}
              className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-950/40 transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Registrando confirmação segura...</span>
                </>
              ) : (
                <>
                  <span>Continuar</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
