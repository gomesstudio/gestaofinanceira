/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import type { SubscriptionAccessState } from '../services/subscriptionService';

export interface TechnicalAccessPermissions {
  isServerConfirmedAdmin: boolean;
  isDevelopmentEnv: boolean;
  canViewAdminTools: boolean;
  canViewDevDiagnostics: boolean;
}

/**
 * Resolve permissões de visualização para painéis administrativos e recursos técnicos.
 *
 * Regras de segurança:
 * 1. Privilégios administrativos dependem exclusivamente de confirmação do servidor
 *    (subscriptionAccess?.isAdmin === true com schema comercial instalado).
 * 2. Antes da instalação das tabelas comerciais (isSchemaMissing) ou sem resposta do servidor,
 *    nunca concede privilégios administrativos por e-mail, UUID fixo, localStorage ou metadados editáveis.
 * 3. Diagnósticos técnicos, scripts SQL e detalhes de infraestrutura ficam restritos ao ambiente de desenvolvimento.
 */
export function resolveTechnicalAccessPermissions(params: {
  subscriptionAccess?: SubscriptionAccessState | null;
  isDev?: boolean;
}): TechnicalAccessPermissions {
  const isDevelopmentEnv =
    typeof params.isDev === 'boolean'
      ? params.isDev
      : Boolean(import.meta.env?.DEV);

  const isServerConfirmedAdmin = Boolean(
    params.subscriptionAccess &&
      !params.subscriptionAccess.isSchemaMissing &&
      params.subscriptionAccess.isAdmin === true
  );

  return {
    isServerConfirmedAdmin,
    isDevelopmentEnv,
    canViewAdminTools: isServerConfirmedAdmin,
    canViewDevDiagnostics: isDevelopmentEnv
  };
}

const INTERNAL_INFRA_TERMS_REGEX =
  /(user_finance_data|auth\.users|auth\.uid|row level security|\bRLS\b|script sql|sql editor|postgresql|42p01|create table|user_subscriptions|app_admins)/i;

/**
 * Impede que mensagens internas com nomes de tabelas, políticas RLS ou SQL
 * sejam exibidas para usuários comuns em produção.
 */
export function sanitizeCloudSyncMessageForUser(
  message: string | null | undefined,
  allowTechnicalDetails: boolean
): string | null {
  if (!message) return null;
  if (allowTechnicalDetails) return message;
  if (INTERNAL_INFRA_TERMS_REGEX.test(message)) {
    return 'Sincronização na nuvem temporariamente indisponível. Seus dados continuam salvos com segurança neste dispositivo.';
  }
  return message;
}
