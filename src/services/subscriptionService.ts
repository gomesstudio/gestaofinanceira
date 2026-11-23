/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from '../utils/supabase';
import { AppState, getUserStateFromStorage, isValidStorageUserId } from '../utils/storage';
import {
  areStatesContentEqual,
  fetchFinanceDataFromSupabase,
  getActiveSupabaseSession,
  isValidUUID
} from './supabaseSyncService';
import {
  hasRealFinancialData,
  validateBackupJsonStructure
} from '../utils/backupSecurity';

export const SUBSCRIPTIONS_TABLE_NAME = 'user_subscriptions';

export const COMMERCIAL_WHATSAPP_NUMBER = '+55 33 99103-1052';
export const COMMERCIAL_WHATSAPP_BASE_URL = 'https://wa.me/5533991031052';

export type PublicPlanType = 'monthly' | 'annual';
export type SubscriptionPlanType = PublicPlanType | 'lifetime';

export type SubscriptionStatusType =
  | 'active'
  | 'expired'
  | 'canceled'
  | 'suspended'
  | 'pending';

export type AccessRequestStatusType = 'pending' | 'approved' | 'rejected' | 'canceled';

export type CommercialPaymentMethod =
  | 'pix'
  | 'credit_card'
  | 'debit_card'
  | 'bank_transfer'
  | 'cash'
  | 'other';

export type CommercialPaymentStatus = 'pending' | 'confirmed' | 'canceled';

export type SubscriptionAccessStatus =
  | 'loading'
  | 'active'
  | 'expired'
  | 'suspended'
  | 'canceled'
  | 'pending'
  | 'no_subscription'
  | 'schema_not_deployed'
  | 'error';

export const PUBLIC_COMMERCIAL_PLANS: Array<{
  id: PublicPlanType;
  name: string;
  durationLabel: string;
  description: string;
  benefits: string[];
}> = [
  {
    id: 'monthly',
    name: 'Plano Mensal',
    durationLabel: 'Acesso por 30 dias',
    description:
      'Ideal para começar com flexibilidade mensal e acesso completo a todos os recursos do sistema.',
    benefits: [
      'Controle de contas, cartões, receitas e despesas',
      'Gestão de dívidas, metas e calendário financeiro',
      'Sincronização segura em nuvem e backup em JSON'
    ]
  },
  {
    id: 'annual',
    name: 'Plano Anual',
    durationLabel: 'Acesso por 12 meses',
    description:
      'Para quem busca planejamento contínuo durante todo o ano com tranquilidade e praticidade.',
    benefits: [
      'Todos os módulos financeiros completos por 12 meses',
      'Histórico anual, relatórios e análises sem interrupções',
      'Sincronização multi-dispositivos e suporte dedicado'
    ]
  }
];

export function buildWhatsAppUrl(message: string): string {
  const encoded = encodeURIComponent(message).replace(/!/g, '%21');
  return `${COMMERCIAL_WHATSAPP_BASE_URL}?text=${encoded}`;
}

export const WHATSAPP_MONTHLY_PLAN_URL =
  'https://wa.me/5533991031052?text=Ol%C3%A1%21%20Tenho%20interesse%20no%20Plano%20Mensal%20do%20Gest%C3%A3o%20Financeira%20Pro.';

export const WHATSAPP_ANNUAL_PLAN_URL =
  'https://wa.me/5533991031052?text=Ol%C3%A1%21%20Tenho%20interesse%20no%20Plano%20Anual%20do%20Gest%C3%A3o%20Financeira%20Pro.';

export function buildPostSignupWhatsAppMessage(params: {
  fullName: string;
  whatsapp: string;
  email: string;
  requestedPlan: PublicPlanType;
}): string {
  const cleanName = params.fullName.trim();
  const cleanWhatsapp = params.whatsapp.trim();
  const cleanEmail = params.email.trim();
  const planLabel = params.requestedPlan === 'annual' ? 'ANUAL' : 'MENSAL';

  return [
    'Olá! Acabei de me cadastrar no Gestão Financeira Pro e gostaria de concluir minha contratação.',
    '',
    `Nome: ${cleanName}`,
    `WhatsApp: ${cleanWhatsapp}`,
    `E-mail: ${cleanEmail}`,
    `Plano solicitado: ${planLabel}`,
    '',
    'Gostaria de receber as informações para pagamento e liberação do meu acesso.'
  ].join('\n');
}

export function buildPostSignupWhatsAppUrl(params: {
  fullName: string;
  whatsapp: string;
  email: string;
  requestedPlan: PublicPlanType;
}): string {
  const message = buildPostSignupWhatsAppMessage(params);
  return `${COMMERCIAL_WHATSAPP_BASE_URL}?text=${encodeURIComponent(message)}`;
}

export function getWhatsAppRenewalUrl(planType?: SubscriptionPlanType | null): string {
  if (planType === 'annual') {
    return buildWhatsAppUrl(
      'Olá! Minha assinatura Anual do Gestão Financeira Pro venceu e gostaria de renovar.'
    );
  }
  if (planType === 'monthly') {
    return buildWhatsAppUrl(
      'Olá! Minha assinatura Mensal do Gestão Financeira Pro venceu e gostaria de renovar.'
    );
  }
  return buildWhatsAppUrl(
    'Olá! Minha assinatura do Gestão Financeira Pro venceu e gostaria de renovar meu plano.'
  );
}

export function getWhatsAppSupportUrl(accessStatus?: SubscriptionAccessStatus): string {
  switch (accessStatus) {
    case 'expired':
      return buildWhatsAppUrl(
        'Olá! Preciso de suporte sobre minha assinatura vencida no Gestão Financeira Pro.'
      );
    case 'suspended':
      return buildWhatsAppUrl(
        'Olá! Preciso de suporte sobre a suspensão da minha assinatura no Gestão Financeira Pro.'
      );
    case 'canceled':
      return buildWhatsAppUrl(
        'Olá! Preciso de suporte sobre minha assinatura cancelada no Gestão Financeira Pro.'
      );
    case 'pending':
      return buildWhatsAppUrl(
        'Olá! Preciso de suporte sobre a liberação do meu cadastro no Gestão Financeira Pro.'
      );
    case 'error':
      return buildWhatsAppUrl(
        'Olá! Preciso de suporte sobre a verificação da minha assinatura no Gestão Financeira Pro.'
      );
    case 'active':
      return buildWhatsAppUrl(
        'Olá! Preciso de suporte sobre minha assinatura no Gestão Financeira Pro.'
      );
    default:
      return buildWhatsAppUrl(
        'Olá! Tenho dúvidas sobre os planos e assinatura do Gestão Financeira Pro.'
      );
  }
}

export function normalizeWhatsAppDigits(input: string): string {
  return input.replace(/\D/g, '');
}

export function isValidWhatsAppWithDDD(input: string): boolean {
  const digits = normalizeWhatsAppDigits(input);
  return digits.length >= 10 && digits.length <= 13;
}

export interface PendingRegistrationIntent {
  email: string;
  fullName: string;
  whatsapp: string;
  requestedPlan: PublicPlanType;
  whatsappConsent: boolean;
  requiresEmailConfirmation: boolean;
  syncedToSupabase: boolean;
  createdAt: string;
}

const PENDING_REG_PREFIX = 'gfp_pending_access_request:';

export function savePendingRegistrationIntent(intent: PendingRegistrationIntent): void {
  if (typeof window === 'undefined') return;
  try {
    const key = `${PENDING_REG_PREFIX}${intent.email.trim().toLowerCase()}`;
    localStorage.setItem(key, JSON.stringify(intent));
  } catch {
    // ignore storage limits
  }
}

export function getPendingRegistrationIntent(email: string | null | undefined): PendingRegistrationIntent | null {
  if (typeof window === 'undefined' || !email) return null;
  try {
    const key = `${PENDING_REG_PREFIX}${email.trim().toLowerCase()}`;
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    if (parsed.requestedPlan !== 'monthly' && parsed.requestedPlan !== 'annual') return null;
    return parsed as PendingRegistrationIntent;
  } catch {
    return null;
  }
}

export function clearPendingRegistrationIntent(email: string | null | undefined): void {
  if (typeof window === 'undefined' || !email) return;
  try {
    const key = `${PENDING_REG_PREFIX}${email.trim().toLowerCase()}`;
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export interface CustomerCommercialProfile {
  fullName: string | null;
  whatsapp: string | null;
  lgpdWhatsappConsent: boolean;
  requestId: string | null;
  requestedPlan: PublicPlanType | null;
  requestStatus: AccessRequestStatusType | null;
  requestCreatedAt: string | null;
}

export interface UserSubscriptionRecord {
  userId: string;
  planType: SubscriptionPlanType;
  status: SubscriptionStatusType;
  startsAt: string;
  expiresAt: string | null;
  notes?: string | null;
  updatedAt?: string | null;
}

export interface SubscriptionAccessState {
  accessStatus: SubscriptionAccessStatus;
  hasAccess: boolean;
  isSchemaMissing: boolean;
  isAdmin: boolean;
  subscription: UserSubscriptionRecord | null;
  commercialProfile?: CustomerCommercialProfile | null;
  effectiveExpiresAt: string | null;
  daysRemaining: number | null;
  message: string;
  errorCode?: string;
}

export interface AdminSubscriptionListItem {
  userId: string;
  email: string;
  fullName: string | null;
  whatsapp: string | null;
  userCreatedAt: string;
  requestedPlan: PublicPlanType | null;
  requestStatus: AccessRequestStatusType | null;
  requestCreatedAt: string | null;
  planType: SubscriptionPlanType | null;
  status: SubscriptionStatusType | null;
  startsAt: string | null;
  expiresAt: string | null;
  notes: string | null;
  updatedAt: string | null;
  isEffectivelyActive: boolean;
}

export type AdminSubscriptionAction =
  | 'activate_monthly'
  | 'renew_monthly'
  | 'activate_annual'
  | 'renew_annual'
  | 'activate_lifetime'
  | 'suspend'
  | 'cancel'
  | 'expire'
  | 'reject_request';

export interface CommercialPaymentRecord {
  id: string;
  customerUserId: string;
  customerName: string;
  customerEmail: string;
  subscriptionPlan: SubscriptionPlanType;
  amountCents: number;
  paymentDate: string;
  paymentMethod: CommercialPaymentMethod;
  paymentStatus: CommercialPaymentStatus;
  referenceCode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerCommercialHistory {
  requests: Array<{
    id: string;
    requested_plan: PublicPlanType;
    request_status: AccessRequestStatusType;
    admin_notes: string | null;
    created_at: string;
    reviewed_at: string | null;
  }>;
  payments: Array<{
    id: string;
    subscription_plan: SubscriptionPlanType;
    amount_cents: number;
    payment_date: string;
    payment_method: CommercialPaymentMethod;
    payment_status: CommercialPaymentStatus;
    notes: string | null;
    created_at: string;
  }>;
  auditLogs: Array<{
    id: string;
    action: string;
    entity_type: string;
    details: Record<string, unknown>;
    created_at: string;
  }>;
}

export interface MasterDashboardMetrics {
  monthlyRevenueCents: number;
  ytdRevenueCents: number;
  totalCustomers: number;
  activeSubscriptions: number;
  pendingRequests: number;
  expiringSoon: number;
  expiredSubscriptions: number;
  activeLifetime: number;
  planDistribution: {
    monthly: number;
    annual: number;
    lifetime: number;
  };
  salesByPlan: {
    monthly: number;
    annual: number;
    lifetime: number;
  };
  monthlyRevenueSeries: Array<{ monthKey: string; revenueCents: number }>;
  newCustomersSeries: Array<{ monthKey: string; customersCount: number }>;
}

export interface ReadOnlyBackupExportResult {
  success: boolean;
  jsonContent?: string;
  filename?: string;
  source?: 'cloud' | 'local_cache';
  counts?: {
    transactions: number;
    accounts: number;
    debts: number;
    goals: number;
  };
  message: string;
}

export function formatCentsToBRL(cents: number): string {
  const safe = Number.isFinite(cents) ? cents / 100 : 0;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(safe);
}

export function isSchemaMissingError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    code === '42883' ||
    code === 'PGRST202' ||
    msg.includes('does not exist') ||
    msg.includes('could not find the table') ||
    msg.includes('could not find the function') ||
    (msg.includes('relation') && msg.includes('user_subscriptions'))
  );
}

export function isRlsAuthorizationError(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  const code = String(error.code || '').toUpperCase();
  const msg = String(error.message || '').toLowerCase();
  return (
    code === '42501' ||
    msg.includes('violates row-level security') ||
    msg.includes('row-level security policy') ||
    msg.includes('permission denied') ||
    msg.includes('privilégio administrativo')
  );
}

function parsePlanType(rawPlan: unknown): SubscriptionPlanType | null {
  if (rawPlan === 'monthly') return 'monthly';
  if (rawPlan === 'annual') return 'annual';
  if (rawPlan === 'lifetime') return 'lifetime';
  return null;
}

function parsePublicPlanType(rawPlan: unknown): PublicPlanType | null {
  if (rawPlan === 'monthly') return 'monthly';
  if (rawPlan === 'annual') return 'annual';
  return null;
}

function mapRawSubscriptionRow(row: any, expectedUserId: string): UserSubscriptionRecord | null {
  if (!row || typeof row !== 'object') return null;
  const userId = typeof row.user_id === 'string' ? row.user_id : expectedUserId;
  if (userId !== expectedUserId) return null;

  const planType = parsePlanType(row.plan_type);
  if (!planType) return null;

  const rawStatus = String(row.status || 'pending');
  const status: SubscriptionStatusType =
    rawStatus === 'active' ||
    rawStatus === 'expired' ||
    rawStatus === 'canceled' ||
    rawStatus === 'suspended' ||
    rawStatus === 'pending'
      ? rawStatus
      : 'pending';

  return {
    userId,
    planType,
    status,
    startsAt: typeof row.starts_at === 'string' ? row.starts_at : new Date().toISOString(),
    expiresAt: typeof row.expires_at === 'string' ? row.expires_at : null,
    notes: typeof row.notes === 'string' ? row.notes : null,
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : null
  };
}

export function evaluateSubscriptionRecord(
  record: UserSubscriptionRecord | null,
  nowMs: number = Date.now(),
  isAdmin: boolean = false,
  commercialProfile: CustomerCommercialProfile | null = null
): SubscriptionAccessState {
  // Espelha public.has_active_subscription(uuid): Master ativo em public.app_admins
  // mantém acesso permanente independentemente de registro em user_subscriptions.
  if (isAdmin) {
    return {
      accessStatus: 'active',
      hasAccess: true,
      isSchemaMissing: false,
      isAdmin: true,
      subscription: record,
      commercialProfile,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: record
        ? 'Conta Master ativa com acesso permanente (sem exigência de renovação periódica).'
        : 'Conta Master ativa com acesso permanente às suas finanças e à Gestão Comercial.'
    };
  }

  if (!record) {
    if (commercialProfile?.requestStatus === 'pending') {
      return {
        accessStatus: 'pending',
        hasAccess: false,
        isSchemaMissing: false,
        isAdmin,
        subscription: null,
        commercialProfile,
        effectiveExpiresAt: null,
        daysRemaining: null,
        message:
          'Sua solicitação de acesso foi registrada e está aguardando liberação administrativa.'
      };
    }

    return {
      accessStatus: 'no_subscription',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin,
      subscription: null,
      commercialProfile,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: 'Nenhuma assinatura ativa localizada para esta conta.'
    };
  }

  const planLabel =
    record.planType === 'lifetime'
      ? 'Plano Vitalício Especial'
      : record.planType === 'annual'
      ? 'Plano Anual'
      : 'Plano Mensal';

  if (record.status === 'suspended') {
    return {
      accessStatus: 'suspended',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin,
      subscription: record,
      commercialProfile,
      effectiveExpiresAt: record.expiresAt,
      daysRemaining: 0,
      message:
        'Sua assinatura está suspensa administrativamente. Você ainda pode exportar seus dados em JSON.'
    };
  }

  if (record.status === 'canceled') {
    return {
      accessStatus: 'canceled',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin,
      subscription: record,
      commercialProfile,
      effectiveExpiresAt: record.expiresAt,
      daysRemaining: 0,
      message:
        'Sua assinatura foi cancelada. Você ainda pode exportar seu backup JSON com segurança.'
    };
  }

  if (record.status === 'pending') {
    return {
      accessStatus: 'pending',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin,
      subscription: record,
      commercialProfile,
      effectiveExpiresAt: record.expiresAt,
      daysRemaining: null,
      message: 'Sua conta aguarda liberação administrativa de assinatura.'
    };
  }

  if (record.status === 'expired') {
    return {
      accessStatus: 'expired',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin,
      subscription: record,
      commercialProfile,
      effectiveExpiresAt: record.expiresAt,
      daysRemaining: 0,
      message: `Sua assinatura (${planLabel}) venceu. Renove seu plano para continuar editando e sincronizando; a exportação JSON segue liberada.`
    };
  }

  // status === 'active'
  if (record.planType === 'lifetime') {
    if (record.expiresAt !== null) {
      return {
        accessStatus: 'error',
        hasAccess: false,
        isSchemaMissing: false,
        isAdmin,
        subscription: record,
        commercialProfile,
        effectiveExpiresAt: record.expiresAt,
        daysRemaining: null,
        message: 'Configuração inconsistente de concessão vitalícia. Entre em contato com o suporte.'
      };
    }

    return {
      accessStatus: 'active',
      hasAccess: true,
      isSchemaMissing: false,
      isAdmin,
      subscription: record,
      commercialProfile,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: 'Plano Vitalício Especial ativo (concessão administrativa).'
    };
  }

  // monthly e annual exigem expiresAt válido no futuro
  if (!record.expiresAt) {
    return {
      accessStatus: 'expired',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin,
      subscription: record,
      commercialProfile,
      effectiveExpiresAt: null,
      daysRemaining: 0,
      message: `${planLabel} sem data de validade confirmada.`
    };
  }

  const expiresMs = new Date(record.expiresAt).getTime();
  if (!Number.isFinite(expiresMs) || expiresMs <= nowMs) {
    return {
      accessStatus: 'expired',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin,
      subscription: { ...record, status: 'expired' },
      commercialProfile,
      effectiveExpiresAt: record.expiresAt,
      daysRemaining: 0,
      message: `Sua assinatura (${planLabel}) venceu. Renove para retomar a sincronização na nuvem; seu backup JSON continua disponível.`
    };
  }

  const daysRemaining = Math.max(1, Math.ceil((expiresMs - nowMs) / (1000 * 60 * 60 * 24)));
  return {
    accessStatus: 'active',
    hasAccess: true,
    isSchemaMissing: false,
    isAdmin,
    subscription: record,
    commercialProfile,
    effectiveExpiresAt: record.expiresAt,
    daysRemaining,
    message: `${planLabel} ativo (${daysRemaining} dia(s) restante(s)).`
  };
}

/**
 * Registra perfil mínimo e solicitação de acesso pendente vinculada ao usuário autenticado.
 * Bloqueia no cliente e no servidor qualquer tentativa de solicitar plano vitalício.
 */
export async function submitCustomerAccessRequest(params: {
  fullName: string;
  whatsapp: string;
  requestedPlan: PublicPlanType;
  whatsappConsent: boolean;
}): Promise<{
  success: boolean;
  schemaMissing?: boolean;
  message: string;
}> {
  const cleanName = params.fullName.trim();
  const cleanWhatsapp = params.whatsapp.trim();

  if (cleanName.length < 2) {
    return { success: false, message: 'Informe seu nome completo.' };
  }
  if (!isValidWhatsAppWithDDD(cleanWhatsapp)) {
    return { success: false, message: 'Informe um WhatsApp válido com DDD.' };
  }
  if (params.requestedPlan !== 'monthly' && params.requestedPlan !== 'annual') {
    return {
      success: false,
      message: 'Apenas os planos Mensal e Anual estão disponíveis para solicitação.'
    };
  }

  try {
    const { error } = await supabase.rpc('submit_access_request', {
      p_full_name: cleanName,
      p_whatsapp: cleanWhatsapp,
      p_requested_plan: params.requestedPlan,
      p_whatsapp_consent: params.whatsappConsent
    });

    if (error) {
      if (isSchemaMissingError(error)) {
        return {
          success: false,
          schemaMissing: true,
          message: 'Estrutura comercial C1/C3 ainda não implantada no banco.'
        };
      }
      return {
        success: false,
        message: error.message || 'Não foi possível registrar sua solicitação.'
      };
    }

    return {
      success: true,
      message: 'Solicitação registrada e vinculada à sua conta com status pendente.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Falha de rede ao registrar solicitação.'
    };
  }
}

export async function fetchMyCommercialStatus(): Promise<CustomerCommercialProfile | null> {
  try {
    const { data, error } = await supabase.rpc('get_my_commercial_status');
    if (error || !data || typeof data !== 'object') return null;

    const rawReqStatus = data.request_status;
    const requestStatus: AccessRequestStatusType | null =
      rawReqStatus === 'pending' ||
      rawReqStatus === 'approved' ||
      rawReqStatus === 'rejected' ||
      rawReqStatus === 'canceled'
        ? rawReqStatus
        : null;

    return {
      fullName: typeof data.full_name === 'string' ? data.full_name : null,
      whatsapp: typeof data.whatsapp === 'string' ? data.whatsapp : null,
      lgpdWhatsappConsent: Boolean(data.lgpd_whatsapp_consent),
      requestId: typeof data.request_id === 'string' ? data.request_id : null,
      requestedPlan: parsePublicPlanType(data.requested_plan),
      requestStatus,
      requestCreatedAt:
        typeof data.request_created_at === 'string' ? data.request_created_at : null
    };
  } catch {
    return null;
  }
}

export async function checkIsSubscriptionAdmin(): Promise<boolean> {
  try {
    const sessionInfo = await getActiveSupabaseSession();
    if (!sessionInfo.sessionValid || !sessionInfo.userId) return false;

    const { data, error } = await supabase.rpc('check_is_subscription_admin');
    if (error) return false;
    return data === true;
  } catch {
    return false;
  }
}

export async function fetchUserSubscriptionAccess(userId: string): Promise<SubscriptionAccessState> {
  if (!userId || !isValidUUID(userId)) {
    return {
      accessStatus: 'error',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin: false,
      subscription: null,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: 'Identificador de conta inválido para verificação de assinatura.'
    };
  }

  const sessionCheck = await getActiveSupabaseSession();
  if (!sessionCheck.sessionValid || sessionCheck.userId !== userId) {
    return {
      accessStatus: 'error',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin: false,
      subscription: null,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: 'Sessão ausente ou expirada. Faça login novamente.'
    };
  }

  try {
    const { data, error } = await supabase
      .from(SUBSCRIPTIONS_TABLE_NAME)
      .select('user_id, plan_type, status, starts_at, expires_at, notes, updated_at')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) {
      if (isSchemaMissingError(error)) {
        return {
          accessStatus: 'schema_not_deployed',
          hasAccess: false,
          isSchemaMissing: true,
          isAdmin: false,
          subscription: null,
          effectiveExpiresAt: null,
          daysRemaining: null,
          errorCode: error.code,
          message: 'Estrutura comercial de assinaturas (Etapa C1/C3) ainda não foi aplicada no Supabase.'
        };
      }

      return {
        accessStatus: 'error',
        hasAccess: false,
        isSchemaMissing: false,
        isAdmin: false,
        subscription: null,
        effectiveExpiresAt: null,
        daysRemaining: null,
        errorCode: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Permissão negada ao consultar assinatura no servidor.'
          : error.message || 'Falha ao verificar status da assinatura.'
      };
    }

    const [isAdmin, commercialProfile] = await Promise.all([
      checkIsSubscriptionAdmin(),
      fetchMyCommercialStatus()
    ]);

    if (data && !parsePlanType(data.plan_type)) {
      return {
        accessStatus: 'error',
        hasAccess: false,
        isSchemaMissing: false,
        isAdmin,
        subscription: null,
        commercialProfile,
        effectiveExpiresAt: null,
        daysRemaining: null,
        message: 'Tipo de plano não reconhecido na assinatura. Entre em contato com o suporte.'
      };
    }

    const mapped = mapRawSubscriptionRow(data, userId);
    return evaluateSubscriptionRecord(mapped, Date.now(), isAdmin, commercialProfile);
  } catch (err: any) {
    return {
      accessStatus: 'error',
      hasAccess: false,
      isSchemaMissing: false,
      isAdmin: false,
      subscription: null,
      effectiveExpiresAt: null,
      daysRemaining: null,
      message: err?.message || 'Erro de rede ao consultar sua assinatura. Tente novamente.'
    };
  }
}

function isReliableModificationTimestamp(ts: unknown): ts is number {
  return typeof ts === 'number' && Number.isFinite(ts) && ts > 0;
}

function validateBackupCandidate(
  candidate: AppState | null,
  expectedUserId: string
): { valid: boolean; state: AppState | null; error?: string } {
  if (!candidate) {
    return { valid: false, state: null };
  }

  try {
    const serialized = JSON.stringify(candidate);
    const validation = validateBackupJsonStructure(serialized, expectedUserId);
    if (!validation.valid || !validation.state) {
      return {
        valid: false,
        state: null,
        error: validation.error || 'Estrutura de backup inválida ou incompleta.'
      };
    }
    return {
      valid: true,
      state: validation.state
    };
  } catch {
    return {
      valid: false,
      state: null,
      error: 'Não foi possível serializar o candidato de backup para validação.'
    };
  }
}

export async function exportReadOnlyBackupForBlockedUser(
  userId: string
): Promise<ReadOnlyBackupExportResult> {
  if (!userId || !isValidStorageUserId(userId) || !isValidUUID(userId)) {
    return {
      success: false,
      message: 'Usuário inválido para exportação segura de backup.'
    };
  }

  // 1. Validar sessão Supabase Auth e correspondência estrita de UUID ANTES de acessar cache local ou nuvem
  let sessionCheck: Awaited<ReturnType<typeof getActiveSupabaseSession>>;
  try {
    sessionCheck = await getActiveSupabaseSession();
  } catch {
    return {
      success: false,
      message: 'Não foi possível validar sua sessão para exportação segura de backup.'
    };
  }

  if (!sessionCheck.sessionValid || !sessionCheck.userId || sessionCheck.userId !== userId) {
    return {
      success: false,
      message:
        'Exportação bloqueada: é necessária uma sessão ativa pertencente ao mesmo usuário para exportar seus dados.'
    };
  }

  // 2. Leitura estritamente somente leitura dos candidatos local e nuvem do próprio usuário
  const rawLocalCandidate = getUserStateFromStorage(userId);
  let rawCloudCandidate: AppState | null = null;
  let cloudFetchFailed = false;
  let cloudFetchErrorMessage: string | undefined;
  let cloudMetaVersion: number | undefined;
  let cloudMetaTimestamp: number | undefined;

  try {
    const cloudRes = await fetchFinanceDataFromSupabase(userId);
    if (!cloudRes.success) {
      cloudFetchFailed = true;
      cloudFetchErrorMessage = cloudRes.message;
    } else if (cloudRes.data) {
      if (cloudRes.data.ownerUserId !== userId) {
        return {
          success: false,
          message: 'Exportação bloqueada: divergência de proprietário nos dados retornados pela nuvem.'
        };
      }
      rawCloudCandidate = cloudRes.data;
      cloudMetaVersion = cloudRes.version;
      cloudMetaTimestamp = cloudRes.clientTimestamp;
    }
  } catch {
    cloudFetchFailed = true;
    cloudFetchErrorMessage = 'Falha de conexão ao consultar os dados financeiros na nuvem.';
  }

  // 3. Validar estrutura completa dos candidatos e rejeitar candidatos inválidos ou incompletos
  const localValidation = validateBackupCandidate(rawLocalCandidate, userId);
  const cloudValidation = validateBackupCandidate(rawCloudCandidate, userId);

  const validLocal = localValidation.valid ? localValidation.state : null;
  const validCloud = cloudValidation.valid ? cloudValidation.state : null;

  if (
    validCloud &&
    ((typeof cloudMetaVersion === 'number' && cloudMetaVersion !== validCloud.version) ||
      (typeof cloudMetaTimestamp === 'number' && cloudMetaTimestamp !== validCloud.lastModified))
  ) {
    return {
      success: false,
      message:
        'Inconsistência detectada nos metadados (versão ou timestamp) do registro na nuvem. Nenhuma cópia foi exportada para preservar a integridade dos seus dados.'
    };
  }

  // Nunca permitir que cache local apenas demonstrativo/vazio substitua dados na nuvem estruturalmente corrompidos
  if (!validCloud && cloudValidation.error && validLocal && !hasRealFinancialData(validLocal)) {
    return {
      success: false,
      message:
        cloudValidation.error ||
        'Os dados na nuvem estão incompletos ou corrompidos e o cache local não contém dados reais equivalentes.'
    };
  }

  let chosenState: AppState | null = null;
  let source: 'cloud' | 'local_cache' = 'cloud';

  if (validCloud && validLocal) {
    const cloudHasReal = hasRealFinancialData(validCloud);
    const localHasReal = hasRealFinancialData(validLocal);

    // 4. Impedir que dados demonstrativos ou estados vazios substituam cópia válida com dados financeiros reais
    if (cloudHasReal && !localHasReal) {
      chosenState = validCloud;
      source = 'cloud';
    } else if (!cloudHasReal && localHasReal) {
      if (!isReliableModificationTimestamp(validLocal.lastModified)) {
        return {
          success: false,
          message:
            'O cache local possui dados reais sem timestamp de modificação confiável enquanto a nuvem está vazia ou demonstrativa. Ambas as fontes foram preservadas sem escolha automática.'
        };
      }
      chosenState = validLocal;
      source = 'local_cache';
    } else if (areStatesContentEqual(validCloud, validLocal)) {
      // Conteúdo financeiro idêntico: prioriza a cópia oficial da nuvem sem risco de perda
      chosenState = validCloud;
      source = 'cloud';
    } else {
      // 5 & 6. Estados financeiros divergentes: timestamp confiável é critério principal; versão apenas secundário coerente.
      // Nunca fazer merge automático e recusar caso haja timestamp ausente, inválido ou contradição.
      const cloudTs = validCloud.lastModified;
      const localTs = validLocal.lastModified;
      const cloudVer = validCloud.version;
      const localVer = validLocal.version;

      if (!isReliableModificationTimestamp(cloudTs) || !isReliableModificationTimestamp(localTs)) {
        return {
          success: false,
          message:
            'Divergência entre os dados da nuvem e do cache local com timestamp de modificação ausente ou inválido. Ambas as fontes foram preservadas sem mesclagem automática.'
        };
      }

      const isTimestampVsVersionContradictory =
        (cloudTs > localTs && localVer > cloudVer) ||
        (localTs > cloudTs && cloudVer > localVer);

      if (isTimestampVsVersionContradictory) {
        return {
          success: false,
          message:
            'Conflito de integridade detectado: há contradição entre o timestamp de modificação e o número de versão entre a nuvem e este navegador. Nenhuma cópia foi escolhida automaticamente ou mesclada, preservando ambas as fontes.'
        };
      }

      if (cloudTs > localTs) {
        chosenState = validCloud;
        source = 'cloud';
      } else if (localTs > cloudTs) {
        chosenState = validLocal;
        source = 'local_cache';
      } else if (cloudVer > localVer) {
        chosenState = validCloud;
        source = 'cloud';
      } else if (localVer > cloudVer) {
        chosenState = validLocal;
        source = 'local_cache';
      } else {
        return {
          success: false,
          message:
            'Divergência detectada entre os dados da nuvem e do cache local com o mesmo timestamp e versão. Nenhuma escolha ou mesclagem automática foi feita para preservar ambas as fontes.'
        };
      }
    }
  } else if (validCloud) {
    chosenState = validCloud;
    source = 'cloud';
  } else if (validLocal) {
    chosenState = validLocal;
    source = 'local_cache';
  }

  if (!chosenState) {
    if (cloudValidation.error && localValidation.error) {
      return {
        success: false,
        message: `Não foi possível exportar: dados da nuvem e cache local estão estruturalmente inválidos (${cloudValidation.error}).`
      };
    }
    if (cloudValidation.error) {
      return {
        success: false,
        message: `Dados da nuvem inválidos ou incompletos para exportação segura: ${cloudValidation.error}`
      };
    }
    if (localValidation.error) {
      return {
        success: false,
        message: cloudFetchFailed
          ? `Nuvem indisponível e cache local inválido ou incompleto (${localValidation.error}).`
          : `Cache local inválido ou incompleto para exportação segura: ${localValidation.error}`
      };
    }
    if (cloudFetchFailed) {
      return {
        success: false,
        message:
          cloudFetchErrorMessage ||
          'Não foi possível acessar seus dados na nuvem e não há backup local válido neste navegador.'
      };
    }
    return {
      success: false,
      message: 'Nenhum dado financeiro válido encontrado na nuvem ou neste navegador para esta conta.'
    };
  }

  // 7 & 8. Preservar estrutura e metadados canônicos necessários para restauração e revalidar o JSON final
  const safePayload: AppState = {
    ownerUserId: userId,
    version: chosenState.version,
    lastModified: chosenState.lastModified,
    transactions: chosenState.transactions,
    categories: chosenState.categories,
    accounts: chosenState.accounts,
    creditCards: chosenState.creditCards,
    debts: chosenState.debts,
    goals: chosenState.goals,
    safetyReserveDesired: chosenState.safetyReserveDesired,
    isSampleLoaded: chosenState.isSampleLoaded
  };

  const jsonContent = JSON.stringify(safePayload, null, 2);
  const finalValidation = validateBackupJsonStructure(jsonContent, userId);

  if (!finalValidation.valid || !finalValidation.state) {
    return {
      success: false,
      message:
        finalValidation.error ||
        'Falha na validação final de integridade do JSON de backup antes da conclusão da exportação.'
    };
  }

  const today = new Date().toISOString().split('T')[0];
  return {
    success: true,
    jsonContent,
    filename: `backup_gestao_financeira_${today}.json`,
    source,
    counts: {
      transactions: finalValidation.state.transactions.length,
      accounts: finalValidation.state.accounts.length,
      debts: finalValidation.state.debts.length,
      goals: finalValidation.state.goals.length
    },
    message:
      source === 'cloud'
        ? 'Backup JSON oficial obtido da nuvem e validado (modo somente leitura).'
        : 'Backup JSON válido obtido do cache local desta conta (modo somente leitura).'
  };
}

export async function fetchAdminSubscriptionsList(search?: string): Promise<{
  success: boolean;
  items: AdminSubscriptionListItem[];
  message?: string;
  code?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('admin_list_subscriptions', {
      p_search: search?.trim() || null
    });

    if (error) {
      return {
        success: false,
        items: [],
        code: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Acesso negado: esta conta não possui privilégio administrativo no servidor.'
          : error.message || 'Erro ao consultar lista de clientes e assinaturas.'
      };
    }

    const items: AdminSubscriptionListItem[] = Array.isArray(data)
      ? data.map((row: any) => ({
          userId: String(row.user_id),
          email: String(row.email || 'sem-email'),
          fullName: typeof row.full_name === 'string' && row.full_name.trim() ? row.full_name : null,
          whatsapp: typeof row.whatsapp === 'string' && row.whatsapp.trim() ? row.whatsapp : null,
          userCreatedAt: String(row.user_created_at || ''),
          requestedPlan: parsePublicPlanType(row.requested_plan),
          requestStatus:
            row.request_status === 'pending' ||
            row.request_status === 'approved' ||
            row.request_status === 'rejected' ||
            row.request_status === 'canceled'
              ? row.request_status
              : null,
          requestCreatedAt: row.request_created_at ? String(row.request_created_at) : null,
          planType: parsePlanType(row.plan_type),
          status:
            row.status === 'active' ||
            row.status === 'expired' ||
            row.status === 'canceled' ||
            row.status === 'suspended' ||
            row.status === 'pending'
              ? row.status
              : null,
          startsAt: row.starts_at ? String(row.starts_at) : null,
          expiresAt: row.expires_at ? String(row.expires_at) : null,
          notes: row.notes ? String(row.notes) : null,
          updatedAt: row.updated_at ? String(row.updated_at) : null,
          isEffectivelyActive: Boolean(row.is_effectively_active)
        }))
      : [];

    return { success: true, items };
  } catch (err: any) {
    return {
      success: false,
      items: [],
      message: err?.message || 'Erro de rede ao carregar painel administrativo.'
    };
  }
}

export async function executeAdminSubscriptionAction(params: {
  targetUserId: string;
  action: AdminSubscriptionAction;
  notes?: string;
}): Promise<{
  success: boolean;
  message: string;
  code?: string;
  record?: UserSubscriptionRecord | null;
}> {
  const { targetUserId, action, notes } = params;

  if (!isValidUUID(targetUserId)) {
    return {
      success: false,
      message: 'UUID do usuário alvo inválido.'
    };
  }

  try {
    const { data, error } = await supabase.rpc('admin_manage_subscription', {
      p_target_user_id: targetUserId,
      p_action: action,
      p_notes: notes?.trim() || null
    });

    if (error) {
      return {
        success: false,
        code: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Operação bloqueada: apenas administradores autorizados podem gerenciar assinaturas.'
          : error.message || 'Falha ao atualizar assinatura.'
      };
    }

    const mapped = mapRawSubscriptionRow(data, targetUserId);
    const actionLabels: Record<AdminSubscriptionAction, string> = {
      activate_monthly: 'Plano Mensal ativado (30 dias).',
      renew_monthly: 'Plano Mensal renovado (+30 dias).',
      activate_annual: 'Plano Anual ativado (12 meses).',
      renew_annual: 'Plano Anual renovado (+12 meses).',
      activate_lifetime: 'Concessão Vitalício Especial ativada pelo Master.',
      suspend: 'Assinatura suspensa administrativamente.',
      cancel: 'Assinatura cancelada.',
      expire: 'Assinatura marcada como vencida.',
      reject_request: 'Solicitação de acesso recusada.'
    };

    return {
      success: true,
      message: actionLabels[action],
      record: mapped
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao executar ação administrativa.'
    };
  }
}

export async function fetchCustomerCommercialHistory(targetUserId: string): Promise<{
  success: boolean;
  data?: CustomerCommercialHistory;
  message?: string;
  code?: string;
}> {
  if (!isValidUUID(targetUserId)) {
    return { success: false, message: 'UUID do cliente inválido.' };
  }

  try {
    const { data, error } = await supabase.rpc('admin_get_customer_commercial_history', {
      p_target_user_id: targetUserId
    });

    if (error) {
      return {
        success: false,
        code: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Acesso negado ao histórico comercial.'
          : error.message || 'Erro ao carregar histórico comercial.'
      };
    }

    return {
      success: true,
      data: {
        requests: Array.isArray(data?.requests) ? data.requests : [],
        payments: Array.isArray(data?.payments) ? data.payments : [],
        auditLogs: Array.isArray(data?.audit_logs) ? data.audit_logs : []
      }
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao buscar histórico comercial.'
    };
  }
}

export async function fetchCommercialPayments(filters?: {
  status?: CommercialPaymentStatus | 'all';
  search?: string;
}): Promise<{
  success: boolean;
  items: CommercialPaymentRecord[];
  message?: string;
  code?: string;
}> {
  try {
    const statusParam = filters?.status && filters.status !== 'all' ? filters.status : null;
    const searchParam = filters?.search?.trim() || null;

    const { data, error } = await supabase.rpc('admin_list_commercial_payments', {
      p_status: statusParam,
      p_search: searchParam
    });

    if (error) {
      return {
        success: false,
        items: [],
        code: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Acesso negado: faturamento restrito ao administrador Master.'
          : error.message || 'Erro ao carregar registros de faturamento.'
      };
    }

    const items: CommercialPaymentRecord[] = Array.isArray(data)
      ? data.map((row: any) => ({
          id: String(row.id),
          customerUserId: String(row.customer_user_id),
          customerName: String(row.customer_name || 'Cliente'),
          customerEmail: String(row.customer_email || ''),
          subscriptionPlan: parsePlanType(row.subscription_plan) || 'monthly',
          amountCents: Number(row.amount_cents || 0),
          paymentDate: String(row.payment_date || ''),
          paymentMethod: (row.payment_method || 'pix') as CommercialPaymentMethod,
          paymentStatus: (row.payment_status || 'pending') as CommercialPaymentStatus,
          referenceCode: row.reference_code ? String(row.reference_code) : null,
          notes: row.notes ? String(row.notes) : null,
          createdAt: String(row.created_at || ''),
          updatedAt: String(row.updated_at || '')
        }))
      : [];

    return { success: true, items };
  } catch (err: any) {
    return {
      success: false,
      items: [],
      message: err?.message || 'Erro de rede ao consultar faturamento.'
    };
  }
}

export async function recordCommercialPayment(params: {
  customerUserId: string;
  subscriptionPlan: SubscriptionPlanType;
  amountCents: number;
  paymentDate: string;
  paymentMethod: CommercialPaymentMethod;
  paymentStatus: CommercialPaymentStatus;
  referenceCode?: string;
  notes?: string;
}): Promise<{
  success: boolean;
  message: string;
  code?: string;
}> {
  if (!isValidUUID(params.customerUserId)) {
    return { success: false, message: 'Selecione um cliente válido.' };
  }
  if (!Number.isFinite(params.amountCents) || params.amountCents < 0) {
    return { success: false, message: 'Informe um valor válido.' };
  }
  if (!params.paymentDate) {
    return { success: false, message: 'Informe a data do pagamento.' };
  }

  try {
    const { error } = await supabase.rpc('admin_record_commercial_payment', {
      p_customer_user_id: params.customerUserId,
      p_subscription_plan: params.subscriptionPlan,
      p_amount_cents: Math.round(params.amountCents),
      p_payment_date: params.paymentDate,
      p_payment_method: params.paymentMethod,
      p_payment_status: params.paymentStatus,
      p_reference_code: params.referenceCode?.trim() || null,
      p_notes: params.notes?.trim() || null
    });

    if (error) {
      const isDuplicate = String(error.code) === '23505' || String(error.message || '').toLowerCase().includes('duplicado');
      return {
        success: false,
        code: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Operação bloqueada: faturamento restrito ao administrador Master.'
          : isDuplicate
          ? 'Pagamento duplicado detectado para este cliente, data e valor.'
          : error.message || 'Erro ao registrar pagamento.'
      };
    }

    return {
      success: true,
      message: 'Registro de pagamento salvo com rastreabilidade administrativa.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao registrar pagamento.'
    };
  }
}

export async function updateCommercialPayment(params: {
  paymentId: string;
  paymentStatus: CommercialPaymentStatus;
  amountCents?: number;
  paymentDate?: string;
  paymentMethod?: CommercialPaymentMethod;
  notes?: string;
}): Promise<{
  success: boolean;
  message: string;
  code?: string;
}> {
  if (!isValidUUID(params.paymentId)) {
    return { success: false, message: 'ID de pagamento inválido.' };
  }

  try {
    const { error } = await supabase.rpc('admin_update_commercial_payment', {
      p_payment_id: params.paymentId,
      p_payment_status: params.paymentStatus,
      p_amount_cents: typeof params.amountCents === 'number' ? Math.round(params.amountCents) : null,
      p_payment_date: params.paymentDate || null,
      p_payment_method: params.paymentMethod || null,
      p_notes: params.notes?.trim() || null
    });

    if (error) {
      return {
        success: false,
        code: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Operação bloqueada: apenas o Master pode alterar registros financeiros comerciais.'
          : error.message || 'Erro ao atualizar registro de pagamento.'
      };
    }

    return {
      success: true,
      message: 'Registro de faturamento atualizado com auditoria.'
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de conexão ao atualizar registro.'
    };
  }
}

export async function fetchMasterDashboardMetrics(): Promise<{
  success: boolean;
  metrics?: MasterDashboardMetrics;
  message?: string;
  code?: string;
}> {
  try {
    const { data, error } = await supabase.rpc('admin_get_master_dashboard_metrics');

    if (error) {
      return {
        success: false,
        code: error.code,
        message: isRlsAuthorizationError(error)
          ? 'Acesso negado ao Dashboard Master.'
          : error.message || 'Erro ao carregar indicadores comerciais.'
      };
    }

    const metrics: MasterDashboardMetrics = {
      monthlyRevenueCents: Number(data?.monthly_revenue_cents || 0),
      ytdRevenueCents: Number(data?.ytd_revenue_cents || 0),
      totalCustomers: Number(data?.total_customers || 0),
      activeSubscriptions: Number(data?.active_subscriptions || 0),
      pendingRequests: Number(data?.pending_requests || 0),
      expiringSoon: Number(data?.expiring_soon || 0),
      expiredSubscriptions: Number(data?.expired_subscriptions || 0),
      activeLifetime: Number(data?.active_lifetime || 0),
      planDistribution: {
        monthly: Number(data?.plan_distribution?.monthly || 0),
        annual: Number(data?.plan_distribution?.annual || 0),
        lifetime: Number(data?.plan_distribution?.lifetime || 0)
      },
      salesByPlan: {
        monthly: Number(data?.sales_by_plan?.monthly || 0),
        annual: Number(data?.sales_by_plan?.annual || 0),
        lifetime: Number(data?.sales_by_plan?.lifetime || 0)
      },
      monthlyRevenueSeries: Array.isArray(data?.monthly_revenue_series)
        ? data.monthly_revenue_series.map((m: any) => ({
            monthKey: String(m.month_key || ''),
            revenueCents: Number(m.revenue_cents || 0)
          }))
        : [],
      newCustomersSeries: Array.isArray(data?.new_customers_series)
        ? data.new_customers_series.map((c: any) => ({
            monthKey: String(c.month_key || ''),
            customersCount: Number(c.customers_count || 0)
          }))
        : []
    };

    return { success: true, metrics };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || 'Erro de rede ao consultar métricas comerciais.'
    };
  }
}

/**
 * Função pura auxiliar para cálculos determinísticos de faturamento comercial (somente pagamentos confirmados).
 */
export function computeRevenueSummary(
  payments: CommercialPaymentRecord[],
  referenceDate: Date = new Date()
): {
  monthlyRevenueCents: number;
  ytdRevenueCents: number;
  salesByPlan: { monthly: number; annual: number; lifetime: number };
} {
  const yearPrefix = String(referenceDate.getFullYear());
  const monthPrefix = `${yearPrefix}-${String(referenceDate.getMonth() + 1).padStart(2, '0')}`;

  let monthlyRevenueCents = 0;
  let ytdRevenueCents = 0;
  const salesByPlan = { monthly: 0, annual: 0, lifetime: 0 };

  for (const p of payments) {
    if (p.paymentStatus !== 'confirmed') continue;
    if (p.paymentDate.startsWith(yearPrefix)) {
      ytdRevenueCents += p.amountCents;
    }
    if (p.paymentDate.startsWith(monthPrefix)) {
      monthlyRevenueCents += p.amountCents;
    }
    if (p.amountCents > 0) {
      if (p.subscriptionPlan === 'monthly') salesByPlan.monthly += 1;
      else if (p.subscriptionPlan === 'annual') salesByPlan.annual += 1;
      else if (p.subscriptionPlan === 'lifetime') salesByPlan.lifetime += 1;
    }
  }

  return { monthlyRevenueCents, ytdRevenueCents, salesByPlan };
}
