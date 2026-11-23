/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Download,
  ExternalLink,
  FileText,
  History,
  Info,
  Lock,
  MessageSquare,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  UserCheck,
  XCircle
} from 'lucide-react';
import { useLegalNavigation } from '../../context/LegalNavigationContext';
import {
  LEGAL_CONTROLLER_INFO,
  LEGAL_DOCUMENTS_REGISTRY,
  LegalDocumentId
} from '../../legal/legalConfig';
import {
  AcceptanceKind,
  AcceptanceSource,
  fetchMyLegalAcceptanceHistory,
  fetchMyWhatsappConsentHistory,
  fetchUserLegalConsentStatus,
  LegalAcceptanceHistoryItem,
  setOptionalWhatsappConsent,
  UserLegalConsentState,
  WhatsappConsentEventItem,
  WhatsappConsentEventSource
} from '../../services/legalConsentService';
import { buildWhatsAppUrl } from '../../services/subscriptionService';

export interface PrivacyDataCounts {
  transactions: number;
  accounts: number;
  creditCards: number;
  debts: number;
  goals: number;
  categories: number;
}

export interface PrivacyCenterSectionProps {
  userId: string | null;
  userEmail: string | null;
  userDisplayName: string | null;
  isAuthenticated: boolean;
  dataCounts: PrivacyDataCounts;
  hasSafetyReserveConfigured: boolean;
  onExportJson: () => void;
  onOpenLegalDocument?: (docId: LegalDocumentId) => void;
}

function formatServerTimestampBr(iso: string | null | undefined): string {
  if (!iso) return 'Data indisponível';
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return 'Data indisponível';
  try {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short'
    }).format(parsed);
  } catch {
    return parsed.toISOString();
  }
}

function formatDocumentTitle(docId: LegalDocumentId): string {
  return docId === 'terms_of_use'
    ? LEGAL_DOCUMENTS_REGISTRY.terms_of_use.shortTitle
    : LEGAL_DOCUMENTS_REGISTRY.privacy_policy.shortTitle;
}

function formatAcceptanceKind(kind: AcceptanceKind): string {
  switch (kind) {
    case 'contractual_terms_acceptance':
      return 'Aceite contratual dos Termos de Uso';
    case 'privacy_policy_acknowledgment':
      return 'Ciência da Política de Privacidade';
    case 'optional_commercial_whatsapp_consent':
      return 'Consentimento opcional comercial (legado)';
    default:
      return 'Registro jurídico';
  }
}

function formatConsentSource(source: AcceptanceSource | WhatsappConsentEventSource): string {
  switch (source) {
    case 'legal_consent_gate':
      return 'Portal de acesso';
    case 'reacceptance_prompt':
      return 'Atualização de versão';
    case 'settings_privacy_panel':
      return 'Central de Privacidade';
    case 'explicit_whatsapp_toggle':
      return 'Controle explícito de preferências';
    default:
      return 'Aplicativo';
  }
}

function mergeAcceptanceHistory(
  primary: LegalAcceptanceHistoryItem[],
  secondary: LegalAcceptanceHistoryItem[]
): LegalAcceptanceHistoryItem[] {
  const seen = new Map<string, LegalAcceptanceHistoryItem>();
  for (const item of [...primary, ...secondary]) {
    const key =
      item.id || `${item.documentId}:${item.documentVersion}:${item.acceptanceKind}:${item.acceptedAt}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values()).sort(
    (a, b) => (Date.parse(b.acceptedAt || '') || 0) - (Date.parse(a.acceptedAt || '') || 0)
  );
}

function mergeWhatsappHistory(
  primary: WhatsappConsentEventItem[],
  secondary: WhatsappConsentEventItem[]
): WhatsappConsentEventItem[] {
  const seen = new Map<string, WhatsappConsentEventItem>();
  for (const item of [...primary, ...secondary]) {
    const key = item.id || `${item.eventSeq}:${item.eventType}:${item.occurredAt}`;
    if (!seen.has(key)) {
      seen.set(key, item);
    }
  }
  return Array.from(seen.values()).sort((a, b) => {
    const diff = (Date.parse(b.occurredAt || '') || 0) - (Date.parse(a.occurredAt || '') || 0);
    if (diff !== 0) return diff;
    return b.eventSeq - a.eventSeq;
  });
}

const LGPD_RIGHTS_LIST: Array<{ title: string; description: string }> = [
  {
    title: 'Acesso aos dados pessoais',
    description:
      'Confirmação da existência de tratamento e acesso às informações vinculadas exclusivamente à sua conta.'
  },
  {
    title: 'Correção de informações',
    description:
      'Atualização de dados incompletos, inexatos ou desatualizados diretamente no app ou mediante solicitação formal.'
  },
  {
    title: 'Portabilidade de dados',
    description:
      'Extração estruturada dos seus registros financeiros em arquivo JSON portátil quando aplicável.'
  },
  {
    title: 'Informações sobre compartilhamento',
    description:
      'Esclarecimento transparente sobre operadores técnicos utilizados (autenticação, banco de dados e hospedagem).'
  },
  {
    title: 'Revogação de consentimento',
    description:
      'Retirada expressa de autorizações opcionais, como comunicações comerciais proativas via WhatsApp.'
  },
  {
    title: 'Exclusão de dados pessoais',
    description:
      'Solicitação de eliminação de dados tratados com consentimento ou encerramento de conta, observadas as obrigações legais de conservação.'
  }
];

export const PrivacyCenterSection: React.FC<PrivacyCenterSectionProps> = ({
  userId,
  userEmail,
  userDisplayName,
  isAuthenticated,
  dataCounts,
  hasSafetyReserveConfigured,
  onExportJson,
  onOpenLegalDocument
}) => {
  const { openLegalDocument: openLegalDocumentFromContext } = useLegalNavigation();
  const handleOpenLegalDocument = onOpenLegalDocument || openLegalDocumentFromContext;

  const [consentState, setConsentState] = useState<UserLegalConsentState | null>(null);
  const [acceptanceHistory, setAcceptanceHistory] = useState<LegalAcceptanceHistoryItem[]>([]);
  const [whatsappHistory, setWhatsappHistory] = useState<WhatsappConsentEventItem[]>([]);
  const [hasQueriedServerConsent, setHasQueriedServerConsent] = useState<boolean>(false);
  const [isLoadingConsent, setIsLoadingConsent] = useState<boolean>(false);
  const [isUpdatingWhatsapp, setIsUpdatingWhatsapp] = useState<boolean>(false);
  const [whatsappActionFeedback, setWhatsappActionFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const requestEpochRef = useRef(0);
  const latestUserIdRef = useRef<string | null>(userId);
  latestUserIdRef.current = userId;

  const loadConsentData = useCallback(async () => {
    const targetUserId = userId;
    const requestEpoch = ++requestEpochRef.current;

    setWhatsappActionFeedback(null);
    setHasQueriedServerConsent(true);

    if (!isAuthenticated || !targetUserId) {
      setConsentState(null);
      setAcceptanceHistory([]);
      setWhatsappHistory([]);
      setIsLoadingConsent(false);
      return;
    }

    setIsLoadingConsent(true);
    try {
      const status = await fetchUserLegalConsentStatus(targetUserId);

      if (
        requestEpoch !== requestEpochRef.current ||
        latestUserIdRef.current !== targetUserId
      ) {
        return;
      }

      setConsentState(status);

      if (status.isSchemaMissing || status.mode === 'error') {
        setAcceptanceHistory([]);
        setWhatsappHistory([]);
        return;
      }

      let nextAcceptanceHistory = status.history;
      let nextWhatsappHistory = status.whatsappConsentHistory;

      if (nextAcceptanceHistory.length === 0 || nextWhatsappHistory.length === 0) {
        const [accRes, waRes] = await Promise.all([
          nextAcceptanceHistory.length === 0
            ? fetchMyLegalAcceptanceHistory(targetUserId)
            : Promise.resolve({ success: true, items: nextAcceptanceHistory }),
          nextWhatsappHistory.length === 0
            ? fetchMyWhatsappConsentHistory(targetUserId)
            : Promise.resolve({ success: true, items: nextWhatsappHistory })
        ]);

        if (
          requestEpoch !== requestEpochRef.current ||
          latestUserIdRef.current !== targetUserId
        ) {
          return;
        }

        if (accRes.success) {
          nextAcceptanceHistory = mergeAcceptanceHistory(nextAcceptanceHistory, accRes.items);
        }
        if (waRes.success) {
          nextWhatsappHistory = mergeWhatsappHistory(nextWhatsappHistory, waRes.items);
        }
      }

      setAcceptanceHistory(nextAcceptanceHistory);
      setWhatsappHistory(nextWhatsappHistory);
    } catch {
      if (
        requestEpoch !== requestEpochRef.current ||
        latestUserIdRef.current !== targetUserId
      ) {
        return;
      }
      setConsentState(null);
      setAcceptanceHistory([]);
      setWhatsappHistory([]);
    } finally {
      if (
        requestEpoch === requestEpochRef.current &&
        latestUserIdRef.current === targetUserId
      ) {
        setIsLoadingConsent(false);
      }
    }
  }, [isAuthenticated, userId]);

  useEffect(() => {
    // Limpa estado local imediatamente ao trocar de usuário ou encerrar sessão,
    // sem disparar chamadas automáticas ao Supabase ao montar Configurações.
    requestEpochRef.current += 1;
    setHasQueriedServerConsent(false);
    setConsentState(null);
    setAcceptanceHistory([]);
    setWhatsappHistory([]);
    setWhatsappActionFeedback(null);
    setIsLoadingConsent(false);
    setIsUpdatingWhatsapp(false);
  }, [isAuthenticated, userId]);

  const canManageWhatsappConsent = Boolean(
    isAuthenticated &&
      userId &&
      consentState &&
      !consentState.isSchemaMissing &&
      consentState.mode !== 'error' &&
      !isLoadingConsent
  );

  const handleWhatsappConsentAction = async (action: 'grant' | 'revoke') => {
    if (!canManageWhatsappConsent || !userId || isUpdatingWhatsapp) {
      return;
    }

    const requestEpoch = requestEpochRef.current;
    const targetUserId = userId;
    setIsUpdatingWhatsapp(true);
    setWhatsappActionFeedback(null);

    try {
      const result = await setOptionalWhatsappConsent({
        expectedUserId: targetUserId,
        action,
        eventSource: 'settings_privacy_panel'
      });

      if (
        requestEpoch !== requestEpochRef.current ||
        latestUserIdRef.current !== targetUserId
      ) {
        return;
      }

      if (!result.success || !result.state) {
        setWhatsappActionFeedback({
          type: 'error',
          text:
            result.message ||
            'Não foi possível atualizar sua preferência de comunicação no servidor.'
        });
        return;
      }

      setConsentState(result.state);
      setWhatsappHistory(
        mergeWhatsappHistory(result.state.whatsappConsentHistory, [])
      );
      if (result.state.history.length > 0) {
        setAcceptanceHistory(prev => mergeAcceptanceHistory(result.state!.history, prev));
      }
      setWhatsappActionFeedback({
        type: 'success',
        text: result.message
      });
    } catch {
      if (
        requestEpoch === requestEpochRef.current &&
        latestUserIdRef.current === targetUserId
      ) {
        setWhatsappActionFeedback({
          type: 'error',
          text: 'Falha de conexão ao atualizar sua preferência. Nenhum registro fictício foi criado.'
        });
      }
    } finally {
      if (
        requestEpoch === requestEpochRef.current &&
        latestUserIdRef.current === targetUserId
      ) {
        setIsUpdatingWhatsapp(false);
      }
    }
  };

  const privacyRequestWhatsappUrl = buildWhatsAppUrl(
    [
      'Olá! Gostaria de realizar uma solicitação de privacidade (LGPD) referente à minha conta no Gestão Financeira Pro.',
      '',
      userEmail ? `E-mail da conta: ${userEmail}` : 'Conta: informar meu e-mail de cadastro no atendimento',
      'Direito solicitado (ex.: acesso, correção, compartilhamento, revogação): '
    ].join('\n')
  );

  const accountDeletionWhatsappUrl = buildWhatsAppUrl(
    [
      'Olá! Gostaria de solicitar orientação e exclusão da minha conta no Gestão Financeira Pro.',
      '',
      userEmail ? `E-mail da conta: ${userEmail}` : 'Conta: informar meu e-mail de cadastro no atendimento',
      'Estou ciente de que a exclusão definitiva remove meus registros sincronizados na nuvem.'
    ].join('\n')
  );

  const manualWhatsappOptOutUrl = buildWhatsAppUrl(
    [
      'Olá! Gostaria de atualizar ou revogar minha preferência de comunicações comerciais via WhatsApp no Gestão Financeira Pro.',
      '',
      userEmail ? `E-mail da conta: ${userEmail}` : 'Conta: informar meu e-mail de cadastro no atendimento'
    ].join('\n')
  );

  const whatsappConsentStatusLabel = (() => {
    if (!isAuthenticated || !userId) return 'Sessão não autenticada na nuvem';
    if (isLoadingConsent && !consentState) return 'Consultando no servidor...';
    if (!hasQueriedServerConsent) return 'Não consultado — sem autorização presumida';
    if (!consentState || consentState.isSchemaMissing || consentState.mode === 'error') {
      return 'Indisponível — aguardando implantação SQL no servidor';
    }
    if (consentState.optionalWhatsappConsentStatus === 'granted') {
      return 'Autorizado pelo titular';
    }
    if (consentState.optionalWhatsappConsentStatus === 'revoked') {
      return 'Revogado (sem autorização ativa)';
    }
    return 'Não definido (sem autorização ativa)';
  })();

  const totalFinancialRecords =
    dataCounts.transactions +
    dataCounts.accounts +
    dataCounts.creditCards +
    dataCounts.debts +
    dataCounts.goals;

  return (
    <section
      data-testid="privacy-center-section"
      aria-labelledby="privacy-center-heading"
      className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs overflow-hidden"
    >
      {/* Header da Central de Privacidade */}
      <div className="p-4 sm:p-5 border-b border-slate-200/75 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="min-w-0">
          <h3
            id="privacy-center-heading"
            className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2"
          >
            <Shield className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Privacidade e Seus Dados</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
            Central de transparência, preferências de comunicação, histórico de consentimentos e
            direitos do titular (LGPD) vinculados exclusivamente à conta autenticada.
          </p>
        </div>
        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0">
          Canal oficial: <span className="tabular-nums">{LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}</span>
        </div>
      </div>

      <div className="divide-y divide-slate-200/75 dark:divide-slate-800">
        {/* 1. Meus dados e informações */}
        <div data-testid="privacy-my-data-section" className="p-4 sm:p-5 space-y-4">
          <div>
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-slate-600 dark:text-slate-300 shrink-0" />
              <span>Meus dados e informações</span>
            </h4>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Resumo dos dados básicos e das categorias financeiras tratadas apenas para a sua conta.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 min-w-0">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">Nome de exibição</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                {userDisplayName?.trim() || 'Não informado no perfil'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 min-w-0">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">E-mail da conta</div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white mt-0.5 truncate">
                {userEmail?.trim() || 'Sessão sem e-mail conectado'}
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 min-w-0">
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                Identificador isolado da conta (UUID)
              </div>
              <div className="text-[11px] font-mono font-semibold text-slate-800 dark:text-slate-200 mt-0.5 truncate tabular-nums">
                {isAuthenticated && userId ? userId : 'Não conectado na nuvem'}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Categorias de registros armazenados nesta conta ({' '}
              <span className="tabular-nums">{totalFinancialRecords}</span> registros principais)
            </div>
            <div className="grid grid-cols-2 min-[480px]:grid-cols-3 lg:grid-cols-6 gap-2.5">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Lançamentos</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {dataCounts.transactions}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Contas</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {dataCounts.accounts}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Cartões</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {dataCounts.creditCards}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Dívidas</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {dataCounts.debts}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Objetivos</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {dataCounts.goals}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800">
                <div className="text-[11px] text-slate-500 dark:text-slate-400">Categorias</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums mt-0.5">
                  {dataCounts.categories}
                </div>
              </div>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
              Reserva de segurança configurada:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {hasSafetyReserveConfigured ? 'Sim' : 'Não definida'}
              </span>
              . Seus dados permanecem isolados por identificador único de conta (UUID) no navegador
              e na sincronização em nuvem.
            </p>
          </div>
        </div>

        {/* 2. Termos de Uso e Política de Privacidade */}
        <div
          data-testid="settings-legal-documents-card"
          className="p-4 sm:p-5 space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <FileText className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Documentos Legais, Privacidade & Transparência (LGPD)</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Consulte a qualquer momento as regras de uso, armazenamento local/nuvem, limitações
                técnicas e seus direitos de proteção de dados.
              </p>
            </div>
            <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300 shrink-0">
              Canal oficial: <span className="tabular-nums">{LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}</span>
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <a
              href={LEGAL_DOCUMENTS_REGISTRY.terms_of_use.routePath}
              onClick={e => {
                e.preventDefault();
                handleOpenLegalDocument('terms_of_use');
              }}
              data-testid="settings-terms-link"
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center justify-between gap-3 cursor-pointer min-w-0"
            >
              <div className="flex items-start gap-3 min-w-0">
                <FileText className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {LEGAL_DOCUMENTS_REGISTRY.terms_of_use.shortTitle}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    Versão v{LEGAL_DOCUMENTS_REGISTRY.terms_of_use.version} · Atualizado em{' '}
                    {LEGAL_DOCUMENTS_REGISTRY.terms_of_use.updatedAtBr}
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
            </a>

            <a
              href={LEGAL_DOCUMENTS_REGISTRY.privacy_policy.routePath}
              onClick={e => {
                e.preventDefault();
                handleOpenLegalDocument('privacy_policy');
              }}
              data-testid="settings-privacy-link"
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center justify-between gap-3 cursor-pointer min-w-0"
            >
              <div className="flex items-start gap-3 min-w-0">
                <ShieldCheck className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-slate-900 dark:text-white">
                    {LEGAL_DOCUMENTS_REGISTRY.privacy_policy.shortTitle}
                  </div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 tabular-nums">
                    Versão v{LEGAL_DOCUMENTS_REGISTRY.privacy_policy.version} · Atualizado em{' '}
                    {LEGAL_DOCUMENTS_REGISTRY.privacy_policy.updatedAtBr}
                  </div>
                </div>
              </div>
              <ExternalLink className="w-4 h-4 text-slate-400 shrink-0" />
            </a>
          </div>
        </div>

        {/* 3. Histórico de aceites */}
        <div data-testid="privacy-acceptance-history-section" className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <History className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>Histórico de aceites</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Registros oficiais de aceite dos Termos de Uso e ciência da Política de Privacidade
                gravados no servidor.
              </p>
            </div>
            {isAuthenticated && userId && (
              <button
                type="button"
                onClick={() => void loadConsentData()}
                disabled={isLoadingConsent}
                data-testid="privacy-refresh-history-btn"
                className="w-full sm:w-auto min-h-[40px] px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 inline-flex items-center justify-center gap-2 text-center leading-snug transition-colors shrink-0 cursor-pointer disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isLoadingConsent ? 'animate-spin' : ''}`} />
                <span>
                  {isLoadingConsent
                    ? 'Consultando...'
                    : hasQueriedServerConsent
                    ? 'Atualizar registros'
                    : 'Consultar registros no servidor'}
                </span>
              </button>
            )}
          </div>

          {!isAuthenticated || !userId ? (
            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
              <span>
                Entre na sua conta em nuvem para consultar o histórico oficial de aceites e
                ciências jurídicas vinculados ao seu usuário.
              </span>
            </div>
          ) : !hasQueriedServerConsent ? (
            <div
              data-testid="privacy-acceptance-idle"
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 leading-relaxed"
            >
              Clique em <strong>Consultar registros no servidor</strong> para verificar em tempo
              real os aceites de Termos de Uso e ciências da Política de Privacidade vinculados à
              sua conta. Nenhum registro fictício é criado localmente.
            </div>
          ) : isLoadingConsent && !consentState ? (
            <div
              data-testid="privacy-acceptance-loading"
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 flex items-center gap-2.5"
            >
              <Clock className="w-4 h-4 text-slate-400 shrink-0" />
              <span>Consultando histórico de aceites no servidor...</span>
            </div>
          ) : !consentState || consentState.isSchemaMissing || consentState.mode === 'error' ? (
            <div
              data-testid="privacy-acceptance-unavailable"
              className="p-3.5 rounded-xl bg-amber-50/70 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 flex items-start gap-2.5 leading-relaxed"
            >
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold">Histórico no servidor ainda indisponível</div>
                <p className="mt-0.5">
                  {consentState?.message ||
                    'A estrutura de registro versionado no banco ainda não está disponível neste ambiente.'}{' '}
                  Nenhum aceite fictício foi criado localmente.
                </p>
              </div>
            </div>
          ) : acceptanceHistory.length === 0 ? (
            <div
              data-testid="privacy-acceptance-empty"
              className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300"
            >
              Nenhum registro de aceite contratual ou ciência foi gravado até o momento para esta
              conta. O aplicativo não presume aceite automático sem sua confirmação explícita.
            </div>
          ) : (
            <div
              data-testid="privacy-acceptance-list"
              className="rounded-xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/75 dark:divide-slate-800 overflow-hidden"
            >
              {acceptanceHistory.map((item, idx) => (
                <div
                  key={item.id || `${item.documentId}-${item.acceptedAt}-${idx}`}
                  className="p-3.5 bg-slate-50/60 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5 min-w-0">
                    <div className="font-semibold text-slate-900 dark:text-white flex flex-wrap items-center gap-x-2 gap-y-0.5">
                      <span>{formatDocumentTitle(item.documentId)}</span>
                      <span className="text-slate-400 dark:text-slate-500">·</span>
                      <span className="font-mono text-[11px] text-emerald-700 dark:text-emerald-400 tabular-nums">
                        v{item.documentVersion}
                      </span>
                      {item.isLegacyTransition && (
                        <>
                          <span className="text-slate-400 dark:text-slate-500">·</span>
                          <span className="text-[11px] font-medium text-slate-600 dark:text-slate-300">
                            Transição de conta anterior
                          </span>
                        </>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">
                      {formatAcceptanceKind(item.acceptanceKind)} · Origem:{' '}
                      {formatConsentSource(item.acceptanceSource)}
                    </div>
                  </div>
                  <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                    {formatServerTimestampBr(item.acceptedAt)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 4. Preferências de comunicação (Integrado à Fase 2.4.1) */}
        <div data-testid="privacy-communication-preferences-section" className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Preferências de comunicação</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Gerencie sua autorização opcional para receber comunicações comerciais proativas via
                WhatsApp. Esta escolha é independente do uso do aplicativo e pode ser concedida ou
                revogada a qualquer momento, sem exigir novo aceite contratual dos Termos de Uso.
              </p>
            </div>
          </div>

          {/* Esclarecimento explícito: clique voluntário vs contato proativo */}
          <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
            <strong>Diferença importante:</strong> clicar voluntariamente em um link{' '}
            <span className="font-mono">wa.me</span> para falar com o suporte, contratar ou renovar
            sua assinatura é uma iniciativa direta sua e <strong>não</strong> equivale à autorização
            para comunicações comerciais proativas listada abaixo.
          </div>

          {/* Estado atual e controles */}
          <div className="p-3.5 sm:p-4 rounded-xl border border-slate-200/80 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/35 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                  Comunicações comerciais proativas via WhatsApp (opcional)
                </div>
                <div
                  data-testid="whatsapp-consent-status-label"
                  className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2"
                >
                  {consentState && !consentState.isSchemaMissing && consentState.mode !== 'error' ? (
                    consentState.optionalWhatsappConsentStatus === 'granted' ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                    ) : consentState.optionalWhatsappConsentStatus === 'revoked' ? (
                      <XCircle className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    ) : (
                      <Info className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
                    )
                  ) : (
                    <Clock className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                  )}
                  <span>{whatsappConsentStatusLabel}</span>
                </div>
                {consentState?.optionalWhatsappConsentUpdatedAt &&
                  !consentState.isSchemaMissing &&
                  consentState.mode !== 'error' && (
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                      Última atualização registrada:{' '}
                      {formatServerTimestampBr(consentState.optionalWhatsappConsentUpdatedAt)}
                    </div>
                  )}
              </div>

              {isAuthenticated && userId && !hasQueriedServerConsent && !isLoadingConsent && (
                <button
                  type="button"
                  onClick={() => void loadConsentData()}
                  data-testid="whatsapp-consent-load-btn"
                  className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-2 text-center leading-snug transition-colors shrink-0 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5 shrink-0" />
                  <span>Consultar preferências no servidor</span>
                </button>
              )}

              {canManageWhatsappConsent && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto shrink-0">
                  {consentState?.optionalWhatsappConsentActive ? (
                    <button
                      type="button"
                      disabled={isUpdatingWhatsapp}
                      onClick={() => void handleWhatsappConsentAction('revoke')}
                      data-testid="whatsapp-consent-revoke-btn"
                      className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/30 hover:bg-rose-100 dark:hover:bg-rose-950/50 text-xs font-semibold text-rose-700 dark:text-rose-300 text-center leading-snug transition-colors shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      {isUpdatingWhatsapp ? 'Registrando...' : 'Revogar autorização comercial'}
                    </button>
                  ) : (
                    <button
                      type="button"
                      disabled={isUpdatingWhatsapp}
                      onClick={() => void handleWhatsappConsentAction('grant')}
                      data-testid="whatsapp-consent-grant-btn"
                      className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-xs font-semibold text-white text-center leading-snug transition-colors shrink-0 cursor-pointer disabled:opacity-60"
                    >
                      {isUpdatingWhatsapp ? 'Registrando...' : 'Conceder autorização comercial'}
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Quando SQL 06 não está implantado / erro de consulta: nunca executa ação fictícia */}
            {isAuthenticated &&
              userId &&
              hasQueriedServerConsent &&
              !isLoadingConsent &&
              (!consentState || consentState.isSchemaMissing || consentState.mode === 'error') && (
                <div
                  data-testid="whatsapp-consent-unavailable-notice"
                  className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-900/60 text-xs text-amber-900 dark:text-amber-200 space-y-2 leading-relaxed"
                >
                  <p>
                    O registro eletrônico de concessão e revogação no banco ainda não está ativo
                    neste ambiente. Por segurança, o aplicativo não executa gravações nem
                    revogações fictícias sem confirmação do servidor.
                  </p>
                  <a
                    href={manualWhatsappOptOutUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    data-testid="whatsapp-consent-manual-channel-link"
                    className="inline-flex flex-wrap items-center gap-1.5 font-semibold text-amber-950 dark:text-amber-100 underline underline-offset-2 leading-snug"
                  >
                    <span>
                      Solicitar alteração ou revogação pelo canal oficial (
                      {LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay})
                    </span>
                    <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                  </a>
                </div>
              )}

            {whatsappActionFeedback && (
              <div
                data-testid="whatsapp-consent-feedback"
                className={`p-3 rounded-xl text-xs border ${
                  whatsappActionFeedback.type === 'success'
                    ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900/60 text-emerald-800 dark:text-emerald-200'
                    : 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-800 dark:text-rose-200'
                }`}
              >
                {whatsappActionFeedback.text}
              </div>
            )}
          </div>

          {/* Histórico cronológico de concessão e revogação */}
          {canManageWhatsappConsent && (
            <div className="space-y-2">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                Histórico de eventos de consentimento (WhatsApp comercial)
              </div>
              {whatsappHistory.length === 0 ? (
                <div
                  data-testid="whatsapp-consent-history-empty"
                  className="text-xs text-slate-500 dark:text-slate-400 p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800"
                >
                  Nenhum evento de concessão ou revogação registrado até o momento. Sem registro
                  prévio, nenhuma autorização comercial é presumida.
                </div>
              ) : (
                <div
                  data-testid="whatsapp-consent-history-list"
                  className="rounded-xl border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/75 dark:divide-slate-800 overflow-hidden"
                >
                  {whatsappHistory.map((ev, idx) => (
                    <div
                      key={ev.id || `${ev.eventSeq}-${ev.occurredAt}-${idx}`}
                      className="p-3 bg-slate-50/50 dark:bg-slate-800/30 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
                    >
                      <div className="space-y-0.5">
                        <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                          <span
                            className={
                              ev.eventType === 'granted'
                                ? 'text-emerald-700 dark:text-emerald-400'
                                : 'text-rose-700 dark:text-rose-400'
                            }
                          >
                            {ev.eventType === 'granted' ? 'Concedido' : 'Revogado'}
                          </span>
                          <span className="text-slate-400 dark:text-slate-500">·</span>
                          <span className="font-mono text-[11px] text-slate-500 dark:text-slate-400 tabular-nums">
                            #{ev.eventSeq || idx + 1} · Política v{ev.privacyPolicyVersion || '—'}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          Origem: {formatConsentSource(ev.eventSource)}
                        </div>
                      </div>
                      <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300 tabular-nums shrink-0">
                        {formatServerTimestampBr(ev.occurredAt)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* 5. Exportação dos meus dados */}
        <div data-testid="privacy-data-export-section" className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-1 max-w-2xl min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <Download className="w-4 h-4 text-blue-600 dark:text-blue-400 shrink-0" />
                <span>Exportação dos meus dados</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Gera uma cópia portátil em arquivo <strong>JSON</strong> contendo exclusivamente os
                dados vinculados à conta ativa (contas, cartões, lançamentos, dívidas, objetivos,
                categorias e reserva de segurança), no formato padrão de backup do aplicativo, sem
                alterar nem apagar registros.
              </p>
            </div>
            <button
              type="button"
              onClick={onExportJson}
              data-testid="privacy-export-json-btn"
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white text-white dark:text-slate-900 text-xs font-semibold inline-flex items-center justify-center gap-2 text-center leading-snug transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span>Exportar meus dados (JSON)</span>
            </button>
          </div>
        </div>

        {/* 6. Solicitações de privacidade (Direitos LGPD) */}
        <div data-testid="privacy-rights-requests-section" className="p-4 sm:p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                <span>Solicitações de privacidade</span>
              </h4>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Nos termos da Lei Geral de Proteção de Dados (LGPD — Art. 18), você pode solicitar
                atendimento sobre os seus direitos pelo canal oficial abaixo:
              </p>
            </div>
            <a
              href={privacyRequestWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="privacy-rights-whatsapp-link"
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-100 inline-flex items-center justify-center gap-2 text-center leading-snug transition-colors shrink-0"
            >
              <span>Atendimento LGPD via WhatsApp</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            {LGPD_RIGHTS_LIST.map(right => (
              <div
                key={right.title}
                className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/70 dark:border-slate-800 space-y-1 min-w-0"
              >
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {right.title}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {right.description}
                </p>
              </div>
            ))}
          </div>

          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Transparência: o botão acima abre uma conversa externa no canal oficial (
            <span className="tabular-nums">{LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay}</span>) e{' '}
            <strong>não</strong> gera nem registra protocolo interno ou chamado automático no banco
            de dados do aplicativo.
          </p>
        </div>

        {/* 7. Excluir minha conta (exclusivamente informativo nesta etapa) */}
        <div data-testid="privacy-account-deletion-section" className="p-4 sm:p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div className="space-y-1.5 max-w-2xl min-w-0">
              <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
                <span>Excluir minha conta</span>
              </h4>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                A exclusão definitiva da conta encerra o acesso ao sistema e ocasiona{' '}
                <strong>perda permanente dos dados financeiros sincronizados</strong> após a
                conclusão do pedido. Antes de solicitar a exclusão, recomendamos exportar uma cópia
                em JSON na seção <em>Exportação dos meus dados</em>.
              </p>
              <ul className="text-[11px] text-slate-500 dark:text-slate-400 space-y-1 list-disc pl-4 leading-relaxed">
                <li>
                  Registros sujeitos a obrigações legais, fiscais ou regulatórias (como comprovantes
                  comerciais de pagamento e histórico de aceites jurídicos exigido por lei) podem
                  permanecer conservados pelo prazo legal aplicável.
                </li>
                <li>
                  Cópias técnicas rotativas de segurança da infraestrutura em nuvem seguem o ciclo
                  de expiração do provedor de hospedagem.
                </li>
                <li>
                  A autoexclusão automatizada ainda não está habilitada nesta interface; sua
                  implementação futura exigirá processamento privilegiado no servidor, autenticação
                  recente e confirmação explícita do titular.
                </li>
              </ul>
            </div>

            <a
              href={accountDeletionWhatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              data-testid="privacy-delete-account-whatsapp-link"
              className="w-full sm:w-auto min-h-[40px] px-4 py-2 rounded-xl border border-rose-200 dark:border-rose-800/70 bg-rose-50 dark:bg-rose-950/25 hover:bg-rose-100 dark:hover:bg-rose-950/45 text-xs font-semibold text-rose-700 dark:text-rose-300 inline-flex items-center justify-center gap-2 text-center leading-snug transition-colors shrink-0"
            >
              <span>Solicitar exclusão via canal oficial</span>
              <ExternalLink className="w-3.5 h-3.5 shrink-0" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
};
