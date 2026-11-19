/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../utils/supabase';
import { isValidUUID } from './supabaseSyncService';
import { LEGAL_DOCUMENTS_REGISTRY, LegalDocumentId } from '../legal/legalConfig';
import { computeLegalDocumentSha256 } from '../legal/legalHash';

export type AcceptanceKind =
  | 'contractual_terms_acceptance'
  | 'privacy_policy_acknowledgment'
  | 'optional_commercial_whatsapp_consent';

export type AcceptanceSource =
  | 'legal_consent_gate'
  | 'reacceptance_prompt'
  | 'settings_privacy_panel';

export type WhatsappConsentDecision = 'unchanged' | 'grant' | 'revoke';

export type WhatsappConsentStatus = 'granted' | 'revoked' | 'not_set';

export type WhatsappConsentEventSource =
  | AcceptanceSource
  | 'explicit_whatsapp_toggle';

export type LegalConsentMode =
  | 'up_to_date'
  | 'first_acceptance'
  | 'legacy_user_transition'
  | 'reacceptance_required'
  | 'schema_missing'
  | 'error';

export interface LegalAcceptanceHistoryItem {
  id: string;
  documentId: LegalDocumentId;
  documentVersion: string;
  documentHash: string;
  acceptanceKind: AcceptanceKind;
  isLegacyTransition: boolean;
  acceptanceSource: AcceptanceSource;
  acceptedAt: string;
}

export interface WhatsappConsentEventItem {
  id: string;
  eventSeq: number;
  consentScope: 'commercial_whatsapp_communications';
  eventType: 'granted' | 'revoked';
  privacyPolicyVersion: string;
  privacyPolicyHash: string;
  eventSource: WhatsappConsentEventSource;
  explicitUserAction: boolean;
  occurredAt: string;
}

export interface LocalLegalDocumentsSpec {
  termsVersion: string;
  termsHash: string;
  privacyVersion: string;
  privacyHash: string;
}

export interface UserLegalConsentState {
  mode: LegalConsentMode;
  hasValidConsent: boolean;
  isSchemaMissing: boolean;
  isExistingUser: boolean;
  hasAnyPriorAcceptance: boolean;
  needsTermsReacceptance: boolean;
  needsPrivacyReacknowledgment: boolean;
  termsVersionCurrent: string;
  termsHashCurrent: string;
  privacyVersionCurrent: string;
  privacyHashCurrent: string;
  acceptedTermsVersion: string | null;
  acceptedTermsAt: string | null;
  acknowledgedPrivacyVersion: string | null;
  acknowledgedPrivacyAt: string | null;
  optionalWhatsappConsentActive: boolean;
  optionalWhatsappConsentStatus: WhatsappConsentStatus;
  optionalWhatsappConsentUpdatedAt: string | null;
  optionalWhatsappConsentAt: string | null;
  commercialProfileWhatsappConsent: boolean | null;
  legalRetentionNotice: string;
  history: LegalAcceptanceHistoryItem[];
  whatsappConsentHistory: WhatsappConsentEventItem[];
  message: string;
  errorCode?: string;
}

export interface RecordLegalConsentInput {
  expectedUserId: string;
  acceptContractualTerms: boolean;
  acknowledgePrivacyPolicy: boolean;
  /**
   * Decisão explícita quanto a comunicações comerciais via WhatsApp.
   * Nunca converte uma caixa desmarcada em revogação tácita sem ação explícita.
   */
  optionalWhatsappDecision?: WhatsappConsentDecision;
  /** Compatibilidade: `true` equivale a `'grant'`; `false`/omisso mantém `'unchanged'`. */
  optionalWhatsappConsent?: boolean;
  acceptanceSource?: AcceptanceSource;
}

export interface RecordLegalConsentResult {
  success: boolean;
  state?: UserLegalConsentState;
  message: string;
  errorCode?: string;
}

export interface SetOptionalWhatsappConsentInput {
  expectedUserId: string;
  action: 'grant' | 'revoke';
  eventSource?: WhatsappConsentEventSource;
}

const DEFAULT_LEGAL_RETENTION_NOTICE =
  'Registros de aceite jurídico e histórico de consentimentos permanecem conservados enquanto a conta estiver ativa ou pelo prazo exigido por obrigações legais e histórico comercial.';

export function getCurrentLocalLegalDocumentsSpec(): LocalLegalDocumentsSpec {
  return {
    termsVersion: LEGAL_DOCUMENTS_REGISTRY.terms_of_use.version,
    termsHash: computeLegalDocumentSha256('terms_of_use'),
    privacyVersion: LEGAL_DOCUMENTS_REGISTRY.privacy_policy.version,
    privacyHash: computeLegalDocumentSha256('privacy_policy')
  };
}

function isMissingLegalSchemaError(error: any): boolean {
  if (!error) return false;
  const code = String(error.code || '');
  const msg = String(error.message || '').toLowerCase();
  const details = String(error.details || '').toLowerCase();
  const hint = String(error.hint || '').toLowerCase();

  if (code === '42P01' || code === '42883' || code === 'PGRST202' || code === 'PGRST205') {
    return true;
  }

  return (
    msg.includes('get_my_legal_consent_status') ||
    msg.includes('record_legal_consent') ||
    msg.includes('set_my_optional_whatsapp_consent') ||
    msg.includes('get_my_whatsapp_consent_history') ||
    msg.includes('legal_document_versions') ||
    msg.includes('user_legal_acceptances') ||
    msg.includes('user_whatsapp_consent_events') ||
    details.includes('legal_document_versions') ||
    hint.includes('get_my_legal_consent_status')
  );
}

function normalizeHistoryRows(raw: unknown): LegalAcceptanceHistoryItem[] {
  if (!Array.isArray(raw)) return [];
  const items: LegalAcceptanceHistoryItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const docId = r.document_id;
    const kind = r.acceptance_kind;
    if (docId !== 'terms_of_use' && docId !== 'privacy_policy') continue;
    if (
      kind !== 'contractual_terms_acceptance' &&
      kind !== 'privacy_policy_acknowledgment' &&
      kind !== 'optional_commercial_whatsapp_consent'
    ) {
      continue;
    }
    const sourceRaw = r.acceptance_source;
    const acceptanceSource: AcceptanceSource =
      sourceRaw === 'reacceptance_prompt' || sourceRaw === 'settings_privacy_panel'
        ? sourceRaw
        : 'legal_consent_gate';

    items.push({
      id: String(r.id || ''),
      documentId: docId,
      documentVersion: String(r.document_version || ''),
      documentHash: String(r.document_hash || ''),
      acceptanceKind: kind,
      isLegacyTransition: Boolean(r.is_legacy_transition),
      acceptanceSource,
      acceptedAt: String(r.accepted_at || '')
    });
  }
  return items;
}

function normalizeWhatsappHistoryRows(raw: unknown): WhatsappConsentEventItem[] {
  if (!Array.isArray(raw)) return [];
  const items: WhatsappConsentEventItem[] = [];
  for (const row of raw) {
    if (!row || typeof row !== 'object') continue;
    const r = row as Record<string, unknown>;
    const eventType = r.event_type;
    if (eventType !== 'granted' && eventType !== 'revoked') continue;

    const sourceRaw = r.event_source;
    const eventSource: WhatsappConsentEventSource =
      sourceRaw === 'reacceptance_prompt' ||
      sourceRaw === 'settings_privacy_panel' ||
      sourceRaw === 'explicit_whatsapp_toggle'
        ? sourceRaw
        : 'legal_consent_gate';

    const eventSeqRaw = Number(r.event_seq ?? 0);
    items.push({
      id: String(r.id || ''),
      eventSeq: Number.isFinite(eventSeqRaw) ? eventSeqRaw : 0,
      consentScope: 'commercial_whatsapp_communications',
      eventType,
      privacyPolicyVersion: String(r.privacy_policy_version || ''),
      privacyPolicyHash: String(r.privacy_policy_hash || ''),
      eventSource,
      explicitUserAction: r.explicit_user_action !== false,
      occurredAt: String(r.occurred_at || '')
    });
  }

  return items.sort((a, b) => {
    const timeDiff = Date.parse(b.occurredAt || '') - Date.parse(a.occurredAt || '');
    if (Number.isFinite(timeDiff) && timeDiff !== 0) return timeDiff;
    return b.eventSeq - a.eventSeq;
  });
}

function resolveWhatsappConsentSnapshot(
  payload: Record<string, unknown>,
  whatsappHistory: WhatsappConsentEventItem[]
): {
  active: boolean;
  status: WhatsappConsentStatus;
  updatedAt: string | null;
  legacyGrantAt: string | null;
} {
  // Regra de ouro: quando há eventos registrados, somente o evento cronologicamente
  // mais recente define o estado atual. Qualquer autorização antiga após revogação é inválida.
  if (whatsappHistory.length > 0) {
    const latest = whatsappHistory[0];
    const active = latest.eventType === 'granted';
    return {
      active,
      status: latest.eventType,
      updatedAt: latest.occurredAt || null,
      legacyGrantAt: active ? latest.occurredAt || null : null
    };
  }

  const rawStatus = payload.optional_whatsapp_consent_status;
  const rawUpdatedAt =
    typeof payload.optional_whatsapp_consent_updated_at === 'string'
      ? payload.optional_whatsapp_consent_updated_at
      : null;

  if (rawStatus === 'revoked') {
    return {
      active: false,
      status: 'revoked',
      updatedAt: rawUpdatedAt,
      legacyGrantAt: null
    };
  }

  if (rawStatus === 'granted') {
    return {
      active: true,
      status: 'granted',
      updatedAt: rawUpdatedAt,
      legacyGrantAt: rawUpdatedAt
    };
  }

  const legacyAt =
    typeof payload.optional_whatsapp_consent_at === 'string'
      ? payload.optional_whatsapp_consent_at
      : null;

  if (typeof payload.optional_whatsapp_consent_active === 'boolean') {
    const active = payload.optional_whatsapp_consent_active;
    return {
      active,
      status: active ? 'granted' : rawUpdatedAt ? 'revoked' : 'not_set',
      updatedAt: rawUpdatedAt || (active ? legacyAt : null),
      legacyGrantAt: active ? rawUpdatedAt || legacyAt : null
    };
  }

  if (legacyAt) {
    return {
      active: true,
      status: 'granted',
      updatedAt: legacyAt,
      legacyGrantAt: legacyAt
    };
  }

  return {
    active: false,
    status: 'not_set',
    updatedAt: null,
    legacyGrantAt: null
  };
}

export function resolveOptionalWhatsappDecision(
  input: Pick<RecordLegalConsentInput, 'optionalWhatsappDecision' | 'optionalWhatsappConsent'>
): WhatsappConsentDecision {
  if (
    input.optionalWhatsappDecision === 'grant' ||
    input.optionalWhatsappDecision === 'revoke' ||
    input.optionalWhatsappDecision === 'unchanged'
  ) {
    return input.optionalWhatsappDecision;
  }

  // Nunca converte `false` ou omissão em `'revoke'` automático: apenas `true` equivale a `'grant'`.
  return input.optionalWhatsappConsent === true ? 'grant' : 'unchanged';
}

export function evaluateLegalConsentPayload(
  payload: Record<string, unknown>,
  verifiedSessionUserId: string,
  localSpec: LocalLegalDocumentsSpec = getCurrentLocalLegalDocumentsSpec()
): UserLegalConsentState {
  const payloadUserId = typeof payload.user_id === 'string' ? payload.user_id : null;
  if (payloadUserId && payloadUserId !== verifiedSessionUserId) {
    return {
      mode: 'error',
      hasValidConsent: false,
      isSchemaMissing: false,
      isExistingUser: false,
      hasAnyPriorAcceptance: false,
      needsTermsReacceptance: false,
      needsPrivacyReacknowledgment: false,
      termsVersionCurrent: localSpec.termsVersion,
      termsHashCurrent: localSpec.termsHash,
      privacyVersionCurrent: localSpec.privacyVersion,
      privacyHashCurrent: localSpec.privacyHash,
      acceptedTermsVersion: null,
      acceptedTermsAt: null,
      acknowledgedPrivacyVersion: null,
      acknowledgedPrivacyAt: null,
      optionalWhatsappConsentActive: false,
      optionalWhatsappConsentStatus: 'not_set',
      optionalWhatsappConsentUpdatedAt: null,
      optionalWhatsappConsentAt: null,
      commercialProfileWhatsappConsent: null,
      legalRetentionNotice: DEFAULT_LEGAL_RETENTION_NOTICE,
      history: [],
      whatsappConsentHistory: [],
      message: 'Divergência de identificação da conta autenticada ao validar registros jurídicos.'
    };
  }

  const isExistingUser = Boolean(payload.is_existing_user);
  const hasAnyPriorAcceptance = Boolean(payload.has_any_prior_acceptance);
  const acceptedTermsVersion =
    typeof payload.accepted_terms_version === 'string' ? payload.accepted_terms_version : null;
  const acceptedTermsAt =
    typeof payload.accepted_terms_at === 'string' ? payload.accepted_terms_at : null;
  const acknowledgedPrivacyVersion =
    typeof payload.acknowledged_privacy_version === 'string'
      ? payload.acknowledged_privacy_version
      : null;
  const acknowledgedPrivacyAt =
    typeof payload.acknowledged_privacy_at === 'string' ? payload.acknowledged_privacy_at : null;

  const activeServerTermsVersion =
    typeof payload.active_terms_version === 'string' ? payload.active_terms_version : null;
  const activeServerTermsHash =
    typeof payload.active_terms_hash === 'string' ? payload.active_terms_hash : null;
  const activeServerPrivacyVersion =
    typeof payload.active_privacy_version === 'string' ? payload.active_privacy_version : null;
  const activeServerPrivacyHash =
    typeof payload.active_privacy_hash === 'string' ? payload.active_privacy_hash : null;

  const serverTermsFlag = Boolean(payload.terms_accepted);
  const serverPrivacyFlag = Boolean(payload.privacy_acknowledged);

  // Validação dupla: servidor confirma aceite E versões/hashes vigentes coincidem com o app
  const termsValid =
    serverTermsFlag &&
    acceptedTermsVersion === localSpec.termsVersion &&
    activeServerTermsVersion === localSpec.termsVersion &&
    activeServerTermsHash === localSpec.termsHash;

  const privacyValid =
    serverPrivacyFlag &&
    acknowledgedPrivacyVersion === localSpec.privacyVersion &&
    activeServerPrivacyVersion === localSpec.privacyVersion &&
    activeServerPrivacyHash === localSpec.privacyHash;

  const history = normalizeHistoryRows(payload.history);
  const whatsappConsentHistory = normalizeWhatsappHistoryRows(payload.whatsapp_consent_history);
  const waSnapshot = resolveWhatsappConsentSnapshot(payload, whatsappConsentHistory);

  const commercialProfileWhatsappConsent =
    typeof payload.commercial_profile_whatsapp_consent === 'boolean'
      ? payload.commercial_profile_whatsapp_consent
      : null;

  const legalRetentionNotice =
    typeof payload.legal_retention_notice === 'string' && payload.legal_retention_notice.trim()
      ? payload.legal_retention_notice
      : DEFAULT_LEGAL_RETENTION_NOTICE;

  const baseFields = {
    termsVersionCurrent: localSpec.termsVersion,
    termsHashCurrent: localSpec.termsHash,
    privacyVersionCurrent: localSpec.privacyVersion,
    privacyHashCurrent: localSpec.privacyHash,
    optionalWhatsappConsentActive: waSnapshot.active,
    optionalWhatsappConsentStatus: waSnapshot.status,
    optionalWhatsappConsentUpdatedAt: waSnapshot.updatedAt,
    optionalWhatsappConsentAt: waSnapshot.legacyGrantAt,
    commercialProfileWhatsappConsent,
    legalRetentionNotice,
    history,
    whatsappConsentHistory
  };

  if (termsValid && privacyValid) {
    return {
      mode: 'up_to_date',
      hasValidConsent: true,
      isSchemaMissing: false,
      isExistingUser,
      hasAnyPriorAcceptance: true,
      needsTermsReacceptance: false,
      needsPrivacyReacknowledgment: false,
      acceptedTermsVersion,
      acceptedTermsAt,
      acknowledgedPrivacyVersion,
      acknowledgedPrivacyAt,
      ...baseFields,
      message: 'Aceite dos Termos de Uso e ciência da Política de Privacidade em dia.'
    };
  }

  const hasPriorVersionRecord =
    hasAnyPriorAcceptance || Boolean(acceptedTermsVersion) || Boolean(acknowledgedPrivacyVersion);

  const needsTermsReacceptance = hasPriorVersionRecord && !termsValid;
  const needsPrivacyReacknowledgment = hasPriorVersionRecord && !privacyValid;

  if (hasPriorVersionRecord) {
    return {
      mode: 'reacceptance_required',
      hasValidConsent: false,
      isSchemaMissing: false,
      isExistingUser,
      hasAnyPriorAcceptance: true,
      needsTermsReacceptance,
      needsPrivacyReacknowledgment,
      acceptedTermsVersion,
      acceptedTermsAt,
      acknowledgedPrivacyVersion,
      acknowledgedPrivacyAt,
      ...baseFields,
      message:
        'Os documentos jurídicos foram atualizados. Revise as alterações e confirme para continuar.'
    };
  }

  if (isExistingUser) {
    return {
      mode: 'legacy_user_transition',
      hasValidConsent: false,
      isSchemaMissing: false,
      isExistingUser: true,
      hasAnyPriorAcceptance: false,
      needsTermsReacceptance: false,
      needsPrivacyReacknowledgment: false,
      acceptedTermsVersion: null,
      acceptedTermsAt: null,
      acknowledgedPrivacyVersion: null,
      acknowledgedPrivacyAt: null,
      ...baseFields,
      message:
        'Seus dados financeiros anteriores permanecem preservados. Confirme o aceite da versão atual para registrar sua adesão.'
    };
  }

  return {
    mode: 'first_acceptance',
    hasValidConsent: false,
    isSchemaMissing: false,
    isExistingUser: false,
    hasAnyPriorAcceptance: false,
    needsTermsReacceptance: false,
    needsPrivacyReacknowledgment: false,
    acceptedTermsVersion: null,
    acceptedTermsAt: null,
    acknowledgedPrivacyVersion: null,
    acknowledgedPrivacyAt: null,
    ...baseFields,
    message:
      'Confirme o aceite dos Termos de Uso e a ciência da Política de Privacidade para continuar.'
  };
}

function buildErrorConsentState(
  mode: 'schema_missing' | 'error',
  message: string,
  localSpec: LocalLegalDocumentsSpec,
  errorCode?: string
): UserLegalConsentState {
  return {
    mode,
    hasValidConsent: false,
    isSchemaMissing: mode === 'schema_missing',
    isExistingUser: false,
    hasAnyPriorAcceptance: false,
    needsTermsReacceptance: false,
    needsPrivacyReacknowledgment: false,
    termsVersionCurrent: localSpec.termsVersion,
    termsHashCurrent: localSpec.termsHash,
    privacyVersionCurrent: localSpec.privacyVersion,
    privacyHashCurrent: localSpec.privacyHash,
    acceptedTermsVersion: null,
    acceptedTermsAt: null,
    acknowledgedPrivacyVersion: null,
    acknowledgedPrivacyAt: null,
    optionalWhatsappConsentActive: false,
    optionalWhatsappConsentStatus: 'not_set',
    optionalWhatsappConsentUpdatedAt: null,
    optionalWhatsappConsentAt: null,
    commercialProfileWhatsappConsent: null,
    legalRetentionNotice: DEFAULT_LEGAL_RETENTION_NOTICE,
    history: [],
    whatsappConsentHistory: [],
    message,
    errorCode
  };
}

async function resolveVerifiedSessionUserId(
  expectedUserId: string
): Promise<{ ok: true; userId: string } | { ok: false; message: string }> {
  if (!isValidUUID(expectedUserId)) {
    return { ok: false, message: 'Conta autenticada inválida ou não identificada.' };
  }
  if (!supabase) {
    return {
      ok: false,
      message: 'Conexão segura com o servidor não está configurada neste ambiente.'
    };
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    return {
      ok: false,
      message: 'Não foi possível validar sua sessão autenticada. Tente novamente.'
    };
  }

  const sessionUserId = sessionData?.session?.user?.id || null;
  if (!sessionUserId || sessionUserId !== expectedUserId) {
    return {
      ok: false,
      message: 'Sessão expirada ou divergente da conta ativa. Faça login novamente.'
    };
  }

  return { ok: true, userId: sessionUserId };
}

/**
 * Consulta o status real de aceite jurídico e eventos de consentimento no servidor.
 * Nunca presume aceite em caso de falha ou esquema ausente.
 */
export async function fetchUserLegalConsentStatus(
  expectedAuthenticatedUserId: string
): Promise<UserLegalConsentState> {
  const localSpec = getCurrentLocalLegalDocumentsSpec();

  const verified = await resolveVerifiedSessionUserId(expectedAuthenticatedUserId);
  if (!verified.ok) {
    return buildErrorConsentState('error', verified.message, localSpec);
  }

  try {
    const { data, error } = await supabase.rpc('get_my_legal_consent_status');

    if (error) {
      if (isMissingLegalSchemaError(error)) {
        return buildErrorConsentState(
          'schema_missing',
          'A estrutura de registro de aceite jurídico no banco ainda não foi implantada.',
          localSpec,
          String(error.code || 'SCHEMA_MISSING')
        );
      }

      return buildErrorConsentState(
        'error',
        'Não foi possível verificar seu histórico de aceite jurídico no servidor. Tente novamente.',
        localSpec,
        String(error.code || 'RPC_ERROR')
      );
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return buildErrorConsentState(
        'error',
        'Resposta inválida do servidor ao consultar o aceite jurídico.',
        localSpec
      );
    }

    return evaluateLegalConsentPayload(
      data as Record<string, unknown>,
      verified.userId,
      localSpec
    );
  } catch {
    return buildErrorConsentState(
      'error',
      'Falha de conexão ao verificar seu registro de aceite e privacidade.',
      localSpec,
      'NETWORK_ERROR'
    );
  }
}

/**
 * Registra aceite contratual dos Termos de Uso, ciência da Política de Privacidade e
 * decisão explícita opcional de comunicações comerciais via WhatsApp ('unchanged' | 'grant' | 'revoke').
 */
export async function recordUserLegalConsent(
  input: RecordLegalConsentInput
): Promise<RecordLegalConsentResult> {
  if (!input.acceptContractualTerms || !input.acknowledgePrivacyPolicy) {
    return {
      success: false,
      message:
        'Marque a confirmação obrigatória de aceite dos Termos de Uso e ciência da Política de Privacidade.'
    };
  }

  const verified = await resolveVerifiedSessionUserId(input.expectedUserId);
  if (!verified.ok) {
    return {
      success: false,
      message: verified.message
    };
  }

  const localSpec = getCurrentLocalLegalDocumentsSpec();
  const acceptanceSource: AcceptanceSource = input.acceptanceSource || 'legal_consent_gate';
  const whatsappDecision = resolveOptionalWhatsappDecision(input);

  try {
    const { data, error } = await supabase.rpc('record_legal_consent', {
      p_terms_version: localSpec.termsVersion,
      p_terms_hash: localSpec.termsHash,
      p_privacy_version: localSpec.privacyVersion,
      p_privacy_hash: localSpec.privacyHash,
      p_accept_contractual_terms: true,
      p_acknowledge_privacy_policy: true,
      p_optional_whatsapp_decision: whatsappDecision,
      p_acceptance_source: acceptanceSource
    });

    if (error) {
      if (isMissingLegalSchemaError(error)) {
        return {
          success: false,
          errorCode: String(error.code || 'SCHEMA_MISSING'),
          message:
            'O registro oficial ainda não está disponível no banco de dados. Nenhum aceite fictício foi gravado.'
        };
      }

      return {
        success: false,
        errorCode: String(error.code || 'RPC_ERROR'),
        message:
          error.message ||
          'Não foi possível gravar seu aceite no servidor. Verifique sua conexão e tente novamente.'
      };
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        success: false,
        message: 'Não foi possível confirmar a gravação do aceite no servidor.'
      };
    }

    const evaluated = evaluateLegalConsentPayload(
      data as Record<string, unknown>,
      verified.userId,
      localSpec
    );

    if (!evaluated.hasValidConsent) {
      return {
        success: false,
        state: evaluated,
        message:
          'O servidor não confirmou o registro da versão vigente. Tente novamente ou atualize a página.'
      };
    }

    return {
      success: true,
      state: evaluated,
      message: 'Registro de aceite e ciência gravado com segurança.'
    };
  } catch {
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      message: 'Falha de rede ao gravar o aceite. Tente novamente.'
    };
  }
}

/**
 * Permite conceder ou revogar explicitamente o consentimento opcional de comunicações
 * comerciais via WhatsApp SEM exigir novo aceite contratual dos Termos de Uso.
 */
export async function setOptionalWhatsappConsent(
  input: SetOptionalWhatsappConsentInput
): Promise<RecordLegalConsentResult> {
  if (input.action !== 'grant' && input.action !== 'revoke') {
    return {
      success: false,
      message: 'Ação de consentimento inválida.'
    };
  }

  const verified = await resolveVerifiedSessionUserId(input.expectedUserId);
  if (!verified.ok) {
    return {
      success: false,
      message: verified.message
    };
  }

  const localSpec = getCurrentLocalLegalDocumentsSpec();
  const eventSource: WhatsappConsentEventSource = input.eventSource || 'settings_privacy_panel';

  try {
    const { data, error } = await supabase.rpc('set_my_optional_whatsapp_consent', {
      p_consent_action: input.action,
      p_event_source: eventSource
    });

    if (error) {
      if (isMissingLegalSchemaError(error)) {
        return {
          success: false,
          errorCode: String(error.code || 'SCHEMA_MISSING'),
          message:
            'A estrutura de registro de consentimento ainda não foi implantada no banco de dados.'
        };
      }

      return {
        success: false,
        errorCode: String(error.code || 'RPC_ERROR'),
        message:
          error.message ||
          'Não foi possível atualizar sua preferência de consentimento no servidor.'
      };
    }

    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return {
        success: false,
        message: 'Resposta inválida do servidor ao atualizar o consentimento opcional.'
      };
    }

    const evaluated = evaluateLegalConsentPayload(
      data as Record<string, unknown>,
      verified.userId,
      localSpec
    );

    return {
      success: true,
      state: evaluated,
      message:
        input.action === 'revoke'
          ? 'Consentimento comercial via WhatsApp revogado e registrado no histórico.'
          : 'Consentimento comercial via WhatsApp concedido e registrado no histórico.'
    };
  } catch {
    return {
      success: false,
      errorCode: 'NETWORK_ERROR',
      message: 'Falha de rede ao registrar preferência opcional.'
    };
  }
}

export async function fetchMyLegalAcceptanceHistory(
  expectedAuthenticatedUserId: string
): Promise<{
  success: boolean;
  items: LegalAcceptanceHistoryItem[];
  message?: string;
}> {
  const verified = await resolveVerifiedSessionUserId(expectedAuthenticatedUserId);
  if (!verified.ok) {
    return { success: false, items: [], message: verified.message };
  }

  try {
    const { data, error } = await supabase.rpc('get_my_legal_acceptance_history');
    if (error) {
      return {
        success: false,
        items: [],
        message: isMissingLegalSchemaError(error)
          ? 'Histórico jurídico no servidor ainda aguardando implantação SQL.'
          : 'Não foi possível carregar o histórico jurídico no servidor.'
      };
    }

    return {
      success: true,
      items: normalizeHistoryRows(data)
    };
  } catch {
    return {
      success: false,
      items: [],
      message: 'Falha de conexão ao consultar seu histórico jurídico.'
    };
  }
}

export async function fetchMyWhatsappConsentHistory(
  expectedAuthenticatedUserId: string
): Promise<{
  success: boolean;
  items: WhatsappConsentEventItem[];
  message?: string;
}> {
  const verified = await resolveVerifiedSessionUserId(expectedAuthenticatedUserId);
  if (!verified.ok) {
    return { success: false, items: [], message: verified.message };
  }

  try {
    const { data, error } = await supabase.rpc('get_my_whatsapp_consent_history');
    if (error) {
      return {
        success: false,
        items: [],
        message: isMissingLegalSchemaError(error)
          ? 'Histórico de eventos de WhatsApp aguardando implantação SQL.'
          : 'Não foi possível carregar o histórico de consentimento do WhatsApp.'
      };
    }

    return {
      success: true,
      items: normalizeWhatsappHistoryRows(data)
    };
  } catch {
    return {
      success: false,
      items: [],
      message: 'Falha de conexão ao consultar histórico de consentimento opcional.'
    };
  }
}
