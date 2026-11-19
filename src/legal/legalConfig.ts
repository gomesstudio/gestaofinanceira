/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  COMMERCIAL_WHATSAPP_BASE_URL,
  COMMERCIAL_WHATSAPP_NUMBER
} from '../services/subscriptionService';

export type LegalDocumentId = 'terms_of_use' | 'privacy_policy';

export interface LegalDocumentMetadata {
  id: LegalDocumentId;
  slug: 'termos' | 'privacidade';
  routePath: '/termos' | '/privacidade';
  hashRoute: '#/termos' | '#/privacidade';
  title: string;
  shortTitle: string;
  version: string;
  publishedAt: string;
  updatedAt: string;
  publishedAtBr: string;
  updatedAtBr: string;
  requiresConsentTrackingInFuturePhase: boolean;
}

export interface PendingLegalField {
  key:
    | 'legalHolderName'
    | 'taxIdCpfOrCnpj'
    | 'privacyEmail'
    | 'dpoName'
    | 'jurisdictionCityState';
  label: string;
  description: string;
}

export interface LegalControllerInfo {
  productName: string;
  productTagline: string;
  officialWhatsAppDisplay: string;
  officialWhatsAppUrl: string;
  legalHolderName: string | null;
  taxIdCpfOrCnpj: string | null;
  privacyEmail: string | null;
  dpoName: string | null;
  jurisdictionCityState: string | null;
  pendingFields: PendingLegalField[];
}

export interface VerifiedThirdPartyProcessor {
  id: string;
  name: string;
  role: string;
  dataProcessed: string;
  internationalTransferNote: string;
  optional: boolean;
}

export interface VerifiedLocalStorageItem {
  mechanism: 'localStorage' | 'sessionStorage' | 'IndexedDB';
  keyOrStore: string;
  purpose: string;
  retentionAndCleanup: string;
}

export const LEGAL_APP_NAME = 'Gestão Financeira Pro';
export const LEGAL_PUBLICATION_DATE_ISO = '2026-11-18';
export const LEGAL_PUBLICATION_DATE_BR = '18/11/2026';

/**
 * Controle da Fase 2.4: permanece `false` até revisão e implantação do Script 06 no Supabase,
 * testes em produção e preenchimento formal de `LEGAL_CONTROLLER_INFO`.
 */
export const LEGAL_CONSENT_GATE_ENABLED = false;
export const LEGAL_CONSENT_ROLLOUT_CUTOFF_ISO = '2026-11-19T00:00:00Z';

export const LEGAL_DOCUMENTS_REGISTRY: Record<LegalDocumentId, LegalDocumentMetadata> = {
  terms_of_use: {
    id: 'terms_of_use',
    slug: 'termos',
    routePath: '/termos',
    hashRoute: '#/termos',
    title: 'Termos de Uso',
    shortTitle: 'Termos de Uso',
    version: '1.0.0',
    publishedAt: LEGAL_PUBLICATION_DATE_ISO,
    updatedAt: LEGAL_PUBLICATION_DATE_ISO,
    publishedAtBr: LEGAL_PUBLICATION_DATE_BR,
    updatedAtBr: LEGAL_PUBLICATION_DATE_BR,
    requiresConsentTrackingInFuturePhase: true
  },
  privacy_policy: {
    id: 'privacy_policy',
    slug: 'privacidade',
    routePath: '/privacidade',
    hashRoute: '#/privacidade',
    title: 'Política de Privacidade e Proteção de Dados (LGPD)',
    shortTitle: 'Política de Privacidade',
    version: '1.0.0',
    publishedAt: LEGAL_PUBLICATION_DATE_ISO,
    updatedAt: LEGAL_PUBLICATION_DATE_ISO,
    publishedAtBr: LEGAL_PUBLICATION_DATE_BR,
    updatedAtBr: LEGAL_PUBLICATION_DATE_BR,
    requiresConsentTrackingInFuturePhase: true
  }
};

export const LEGAL_CONTROLLER_INFO: LegalControllerInfo = {
  productName: LEGAL_APP_NAME,
  productTagline: 'Organização e Planejamento Financeiro Pessoal',
  officialWhatsAppDisplay: COMMERCIAL_WHATSAPP_NUMBER,
  officialWhatsAppUrl: COMMERCIAL_WHATSAPP_BASE_URL,
  legalHolderName: null,
  taxIdCpfOrCnpj: null,
  privacyEmail: null,
  dpoName: null,
  jurisdictionCityState: null,
  pendingFields: [
    {
      key: 'legalHolderName',
      label: 'Nome completo ou Razão Social do controlador',
      description:
        'Identificação jurídica formal da pessoa física ou jurídica responsável pela operação comercial do Gestão Financeira Pro.'
    },
    {
      key: 'taxIdCpfOrCnpj',
      label: 'CPF ou CNPJ do responsável',
      description:
        'Documento fiscal oficial do controlador para constar nos Termos de Uso e na Política de Privacidade antes da abertura comercial ampla.'
    },
    {
      key: 'privacyEmail',
      label: 'E-mail oficial de privacidade e suporte jurídico (LGPD)',
      description:
        'Endereço eletrônico dedicado para solicitações de titulares de dados, alternativa formal ao WhatsApp de suporte.'
    },
    {
      key: 'dpoName',
      label: 'Encarregado pelo Tratamento de Dados (DPO), se aplicável',
      description:
        'Indicação formal do encarregado ou justificativa de dispensa conforme regulamentação da ANPD para agentes de pequeno porte.'
    },
    {
      key: 'jurisdictionCityState',
      label: 'Cidade/UF de domicílio e foro contratual',
      description:
        'Localidade de referência para comunicações formais e foro aplicável, respeitado o domicílio do consumidor quando aplicável.'
    }
  ]
};

export const VERIFIED_THIRD_PARTY_PROCESSORS: VerifiedThirdPartyProcessor[] = [
  {
    id: 'supabase',
    name: 'Supabase (Supabase Auth & PostgreSQL)',
    role: 'Autenticação de usuários, emissão de tokens de sessão e armazenamento em banco de dados PostgreSQL com políticas de controle de acesso (RLS).',
    dataProcessed:
      'Credenciais de acesso (e-mail, senha gerenciada pelo Supabase Auth, identificador UUID), dados cadastrais/comerciais quando habilitados no banco e registros financeiros sincronizados (JSONB).',
    internationalTransferNote:
      'Infraestrutura gerenciada em nuvem que pode operar em servidores fora do Brasil, conforme a região configurada no projeto.',
    optional: false
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare (Hospedagem estática e rede CDN/HTTPS)',
    role: 'Entrega dos arquivos estáticos da aplicação web (HTML, CSS e scripts do navegador) sob conexão HTTPS.',
    dataProcessed:
      'Metadados técnicos padrão de requisição HTTP/HTTPS inerentes ao tráfego web (como endereço IP e cabeçalhos de rede tratados na borda da rede).',
    internationalTransferNote:
      'Rede distribuída globalmente para roteamento e entrega segura de conteúdo.',
    optional: false
  },
  {
    id: 'github-oauth',
    name: 'GitHub OAuth (via Supabase Auth)',
    role: 'Provedor opcional de autenticação caso o usuário escolha entrar com sua conta GitHub.',
    dataProcessed:
      'Identificador e dados básicos de perfil autorizados durante o fluxo OAuth (como nome e e-mail associados à conta GitHub).',
    internationalTransferNote:
      'Serviço operado nos Estados Unidos / infraestrutura global; utilizado exclusivamente se o usuário selecionar essa forma de login.',
    optional: true
  },
  {
    id: 'whatsapp',
    name: 'WhatsApp (Canal externo de atendimento e contratação)',
    role: 'Atendimento comercial, contratação de planos, renovação e suporte direto mediante clique voluntário do usuário.',
    dataProcessed:
      'Dados incluídos na mensagem pré-preenchida e informações enviadas voluntariamente pelo usuário na conversa externa com o número oficial +55 33 99103-1052.',
    internationalTransferNote:
      'Serviço externo independente (Meta/WhatsApp), acessado apenas por iniciativa explícita do usuário fora do ambiente interno do aplicativo.',
    optional: true
  }
];

export const VERIFIED_LOCAL_STORAGE_INVENTORY: VerifiedLocalStorageItem[] = [
  {
    mechanism: 'localStorage',
    keyOrStore: 'finance_pro_app_state_<uuid>',
    purpose: 'Cache local das informações financeiras da conta autenticada para resposta rápida e continuidade de uso.',
    retentionAndCleanup:
      'Isolado por UUID; removido automaticamente ao escolher "Limpar dados locais" no logout explícito ou ao trocar para outra conta no mesmo navegador.'
  },
  {
    mechanism: 'localStorage',
    keyOrStore: 'finance_pro_recovery_<uuid>',
    purpose: 'Cópia preventiva local antes de substituições importantes ou encerramento de sessão com preservação offline.',
    retentionAndCleanup:
      'Isolado por UUID; removido no logout com limpeza local ou substituído apenas para o respectivo usuário.'
  },
  {
    mechanism: 'IndexedDB',
    keyOrStore: 'gestao_financeira_recovery_db (recovery_snapshots)',
    purpose: 'Histórico local de até 5 pontos de recuperação preventiva por usuário autenticado.',
    retentionAndCleanup:
      'Isolado por UUID; removido no logout com limpeza local e sujeito à limpeza de dados do navegador.'
  },
  {
    mechanism: 'localStorage',
    keyOrStore: 'gfp_pending_access_request:<email>',
    purpose: 'Preserva temporariamente a solicitação de acesso pós-cadastro caso o usuário ainda precise confirmar o e-mail antes do primeiro login.',
    retentionAndCleanup:
      'Removido automaticamente após sincronização da solicitação ou liberação da assinatura e durante limpeza de logout.'
  },
  {
    mechanism: 'localStorage',
    keyOrStore: 'finance_theme / flags de interface',
    purpose: 'Preferência visual (tema claro/escuro) e sinalizador técnico auxiliar de sessão/legado.',
    retentionAndCleanup:
      'Não armazena lançamentos financeiros; permanece apenas para experiência visual no navegador.'
  },
  {
    mechanism: 'sessionStorage',
    keyOrStore: 'Armazenamento temporário de sessão',
    purpose: 'Estado transitório de navegação durante a aba ativa.',
    retentionAndCleanup:
      'Limpo integralmente no encerramento explícito da sessão.'
  }
];

export interface LegalDocumentsVersionSnapshot {
  terms_of_use: string;
  privacy_policy: string;
  capturedMetadataOnly: true;
}

/**
 * Estrutura preparatória exclusivamente informativa para a Fase 2.4.
 * Não cria registros de aceite, não presume consentimento prévio e não ativa bloqueios.
 */
export function getLegalDocumentMeta(docId: LegalDocumentId): LegalDocumentMetadata {
  return LEGAL_DOCUMENTS_REGISTRY[docId];
}

export function getLegalDocumentsVersionsSnapshot(): LegalDocumentsVersionSnapshot {
  return {
    terms_of_use: LEGAL_DOCUMENTS_REGISTRY.terms_of_use.version,
    privacy_policy: LEGAL_DOCUMENTS_REGISTRY.privacy_policy.version,
    capturedMetadataOnly: true
  };
}

export function hasAuthSensitiveUrlParameters(search: string, hash: string): boolean {
  const lowerSearch = search.toLowerCase();
  const lowerHash = hash.toLowerCase();
  return (
    lowerSearch.includes('code=') ||
    lowerSearch.includes('error=') ||
    lowerSearch.includes('error_description=') ||
    lowerSearch.includes('token_hash=') ||
    lowerHash.includes('access_token=') ||
    lowerHash.includes('refresh_token=') ||
    lowerHash.includes('type=recovery') ||
    lowerHash.includes('error=')
  );
}

/**
 * Resolve qual documento legal público foi solicitado pela URL atual.
 * Ignora URLs com parâmetros sensíveis de retorno OAuth/OTP/Recuperação de senha.
 */
export function resolveLegalDocumentFromLocation(
  pathname: string,
  hash: string,
  search = ''
): LegalDocumentId | null {
  if (hasAuthSensitiveUrlParameters(search, hash)) {
    return null;
  }

  const normalizedPath = pathname.trim().toLowerCase().replace(/\/+$/, '') || '/';
  const normalizedHash = hash.trim().toLowerCase().replace(/^#\/?/, '');
  const params = new URLSearchParams(search);
  const queryDoc = (params.get('legal') || params.get('doc') || '').trim().toLowerCase();

  if (
    normalizedPath === '/termos' ||
    normalizedPath === '/termos-de-uso' ||
    normalizedHash === 'termos' ||
    normalizedHash === 'termos-de-uso' ||
    queryDoc === 'termos' ||
    queryDoc === 'terms' ||
    queryDoc === 'terms_of_use'
  ) {
    return 'terms_of_use';
  }

  if (
    normalizedPath === '/privacidade' ||
    normalizedPath === '/politica-de-privacidade' ||
    normalizedHash === 'privacidade' ||
    normalizedHash === 'politica-de-privacidade' ||
    queryDoc === 'privacidade' ||
    queryDoc === 'privacy' ||
    queryDoc === 'privacy_policy'
  ) {
    return 'privacy_policy';
  }

  return null;
}
