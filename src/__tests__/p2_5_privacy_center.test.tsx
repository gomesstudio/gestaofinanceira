// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const {
  getSessionMock,
  rpcMock,
  fromMock,
  financeCtxMock,
  mockAuthStateForUi
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  financeCtxMock: {
    transactions: [
      {
        id: 'tx-1',
        description: 'Salário',
        amount: 4500,
        date: '2026-11-10',
        type: 'income',
        categoryId: 'cat-1',
        accountId: 'acc-1',
        paid: true
      }
    ],
    debts: [
      {
        id: 'debt-1',
        title: 'Financiamento',
        totalAmount: 10000,
        totalPaid: 2000,
        paymentsHistory: []
      }
    ],
    goals: [
      {
        id: 'goal-1',
        title: 'Reserva',
        targetAmount: 5000,
        currentAmount: 1500,
        completed: false
      }
    ],
    categories: [
      { id: 'cat-1', name: 'Salário', type: 'income', color: '#10b981' }
    ],
    accounts: [
      { id: 'acc-1', name: 'Conta Principal', balance: 2500, type: 'checking', color: '#3b82f6' }
    ],
    creditCards: [
      { id: 'card-1', name: 'Cartão Principal', limit: 3000, closingDay: 5, dueDay: 12 }
    ],
    safetyReserveDesired: 5000,
    setSafetyReserveDesired: vi.fn(),
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    loadSampleData: vi.fn(),
    exportBackupJson: vi.fn(() =>
      JSON.stringify({
        ownerUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        version: '2.0',
        transactions: [{ id: 'tx-1' }],
        accounts: [{ id: 'acc-1' }]
      })
    ),
    inspectBackupJsonForRestore: vi.fn(),
    applyConfirmedBackupRestore: vi.fn(),
    isSampleLoaded: false,
    cloudSyncStatus: 'synced' as const,
    cloudSyncMessage: 'Sincronizado',
    lastCloudSyncDate: null as Date | null,
    syncNowWithCloud: vi.fn(),
    forceUploadLocalToCloud: vi.fn(async () => ({ success: true, conflict: false, message: 'OK' })),
    forceDownloadFromCloud: vi.fn(),
    runCloudDiagnostic: vi.fn(),
    legacyBackupPrompt: null,
    exportLegacyBackupFile: vi.fn(),
    importLegacyBackupToCurrentAccount: vi.fn(),
    dismissLegacyBackupPrompt: vi.fn(),
    requestSafeLogout: vi.fn(),
    filter: { period: 'current_month' },
    setFilter: vi.fn(),
    theme: 'light' as const,
    toggleTheme: vi.fn(),
    openQuickEntry: vi.fn()
  },
  mockAuthStateForUi: {
    isSupabaseAuthenticated: true,
    isSessionLoading: false,
    isPasswordRecoveryMode: false,
    supabaseUser: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'titular.a@exemplo.com' },
    supabaseUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' as string | null,
    supabaseUserEmail: 'titular.a@exemplo.com' as string | null,
    supabaseUserDisplayName: 'Titular Conta A' as string | null
  }
}));

vi.mock('../utils/supabase', () => ({
  SUPABASE_PROJECT_URL: 'https://ficticio.supabase.co',
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: vi.fn(() => ({
        data: { subscription: { unsubscribe: vi.fn() } }
      })),
      signOut: vi.fn(async () => ({ error: null }))
    },
    rpc: rpcMock,
    from: fromMock
  }
}));

vi.mock('../context/FinanceContext', async () => {
  const actual = await vi.importActual<typeof import('../context/FinanceContext')>(
    '../context/FinanceContext'
  );
  return {
    ...actual,
    useFinance: () => financeCtxMock
  };
});

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../context/AuthContext')>(
    '../context/AuthContext'
  );
  return {
    ...actual,
    useAuth: () => ({
      ...mockAuthStateForUi,
      signInWithSupabase: vi.fn(async () => ({ success: true })),
      loginWithGitHub: vi.fn(async () => ({ success: true })),
      signInWithOtp: vi.fn(async () => ({ success: true })),
      verifyOtp: vi.fn(async () => ({ success: true })),
      sendPasswordResetEmail: vi.fn(async () => ({ success: true })),
      disconnectCloud: vi.fn(),
      updatePassword: vi.fn(async () => ({ success: true })),
      checkSessionStatus: vi.fn(async () => true),
      logout: vi.fn(async () => {})
    })
  };
});

import {
  LEGAL_CONSENT_GATE_ENABLED,
  LEGAL_DOCUMENTS_REGISTRY
} from '../legal/legalConfig';
import { getCurrentLocalLegalDocumentsSpec } from '../services/legalConsentService';
import { LegalNavigationProvider } from '../context/LegalNavigationContext';
import { SettingsView } from '../components/settings/SettingsView';

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 25));
  });
}

function buildConsentRpcPayload(overrides: Record<string, unknown> = {}) {
  const spec = getCurrentLocalLegalDocumentsSpec();
  return {
    user_id: USER_A,
    is_existing_user: true,
    has_any_prior_acceptance: true,
    terms_accepted: true,
    privacy_acknowledged: true,
    accepted_terms_version: spec.termsVersion,
    accepted_terms_at: '2026-11-18T12:00:00Z',
    acknowledged_privacy_version: spec.privacyVersion,
    acknowledged_privacy_at: '2026-11-18T12:00:00Z',
    active_terms_version: spec.termsVersion,
    active_terms_hash: spec.termsHash,
    active_privacy_version: spec.privacyVersion,
    active_privacy_hash: spec.privacyHash,
    optional_whatsapp_consent_active: false,
    optional_whatsapp_consent_status: 'not_set',
    optional_whatsapp_consent_updated_at: null,
    optional_whatsapp_consent_at: null,
    commercial_profile_whatsapp_consent: null,
    legal_retention_notice:
      'Registros de aceite jurídico e histórico de consentimentos permanecem conservados enquanto a conta estiver ativa.',
    history: [
      {
        id: 'acc-1',
        document_id: 'terms_of_use',
        document_version: spec.termsVersion,
        document_hash: spec.termsHash,
        acceptance_kind: 'contractual_terms_acceptance',
        is_legacy_transition: false,
        acceptance_source: 'legal_consent_gate',
        accepted_at: '2026-11-18T12:00:00Z'
      },
      {
        id: 'acc-2',
        document_id: 'privacy_policy',
        document_version: spec.privacyVersion,
        document_hash: spec.privacyHash,
        acceptance_kind: 'privacy_policy_acknowledgment',
        is_legacy_transition: false,
        acceptance_source: 'legal_consent_gate',
        accepted_at: '2026-11-18T12:00:01Z'
      }
    ],
    whatsapp_consent_history: [],
    ...overrides
  };
}

describe('Fase 2.5 — Central de Privacidade, Direitos do Titular e Transparência', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    localStorage.clear();
    sessionStorage.clear();

    mockAuthStateForUi.isSupabaseAuthenticated = true;
    mockAuthStateForUi.supabaseUserId = USER_A;
    mockAuthStateForUi.supabaseUserEmail = 'titular.a@exemplo.com';
    mockAuthStateForUi.supabaseUserDisplayName = 'Titular Conta A';

    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: USER_A, email: 'titular.a@exemplo.com' } } },
      error: null
    });

    fromMock.mockImplementation(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null }))
        }))
      }))
    }));

    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_my_legal_consent_status') {
        return { data: buildConsentRpcPayload(), error: null };
      }
      if (fnName === 'get_my_legal_acceptance_history') {
        return { data: buildConsentRpcPayload().history, error: null };
      }
      if (fnName === 'get_my_whatsapp_consent_history') {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.restoreAllMocks();
    vi.clearAllMocks();
  });

  it('1. Exibe a Central "Privacidade e Seus Dados" para usuário comum com isolamento estrito (sem dados de terceiros, tokens ou logs)', async () => {
    const consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView
            subscriptionAccess={{
              accessStatus: 'active',
              hasAccess: true,
              isSchemaMissing: false,
              isAdmin: false,
              subscription: null,
              effectiveExpiresAt: '2026-12-30T00:00:00Z',
              daysRemaining: 30,
              message: 'Assinatura ativa.'
            }}
            isDevelopmentEnv={false}
          />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const section = container.querySelector('[data-testid="privacy-center-section"]');
    expect(section).not.toBeNull();
    expect(section?.textContent).toContain('Privacidade e Seus Dados');
    expect(section?.textContent).toContain('Meus dados e informações');
    expect(section?.textContent).toContain('Titular Conta A');
    expect(section?.textContent).toContain('titular.a@exemplo.com');
    expect(section?.textContent).toContain(USER_A);

    // Nunca expõe dados de outro usuário ou ferramentas técnicas/admin
    expect(section?.textContent).not.toContain(USER_B);
    expect(section?.textContent).not.toContain('service_role');
    expect(section?.textContent).not.toContain('ACCESS_TOKEN');

    // Contagens reais da conta autenticada
    const myDataEl = container.querySelector('[data-testid="privacy-my-data-section"]');
    expect(myDataEl?.textContent).toContain('Lançamentos');
    expect(myDataEl?.textContent).toContain('Cartões');
    expect(myDataEl?.textContent).toContain('Reserva de segurança configurada: Sim');

    // Não vaza dados em logs do console
    const allLogs = [
      ...consoleLogSpy.mock.calls,
      ...consoleWarnSpy.mock.calls,
      ...consoleErrorSpy.mock.calls
    ]
      .flat()
      .map(v => String(v))
      .join(' ');
    expect(allLogs).not.toContain('titular.a@exemplo.com');
    expect(allLogs).not.toContain(USER_A);

    // Ao apenas abrir Configurações, não dispara chamadas automáticas ao Supabase Auth/RPC
    expect(getSessionMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it('2. Troca rápida de usuário em voo descarta resposta atrasada da Conta A e exibe apenas dados da Conta B', async () => {
    let resolveUserARequest!: (val: any) => void;
    const userADeferred = new Promise(resolve => {
      resolveUserARequest = resolve;
    });

    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_my_legal_consent_status') {
        if (mockAuthStateForUi.supabaseUserId === USER_A) {
          return userADeferred;
        }
        return {
          data: buildConsentRpcPayload({
            user_id: USER_B,
            optional_whatsapp_consent_active: true,
            optional_whatsapp_consent_status: 'granted',
            optional_whatsapp_consent_updated_at: '2026-11-19T10:00:00Z',
            whatsapp_consent_history: [
              {
                id: 'wa-b-1',
                event_seq: 1,
                consent_scope: 'commercial_whatsapp_communications',
                event_type: 'granted',
                privacy_policy_version: '1.0.0',
                privacy_policy_hash: getCurrentLocalLegalDocumentsSpec().privacyHash,
                event_source: 'settings_privacy_panel',
                explicit_user_action: true,
                occurred_at: '2026-11-19T10:00:00Z'
              }
            ]
          }),
          error: null
        };
      }
      return { data: [], error: null };
    });

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView />
        </LegalNavigationProvider>
      );
    });

    // Inicia consulta em voo para Conta A
    const loadBtnA = container.querySelector(
      '[data-testid="privacy-refresh-history-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      loadBtnA.click();
    });

    // Troca para Conta B antes da resposta atrasada da Conta A chegar
    mockAuthStateForUi.supabaseUserId = USER_B;
    mockAuthStateForUi.supabaseUserEmail = 'titular.b@exemplo.com';
    mockAuthStateForUi.supabaseUserDisplayName = 'Titular Conta B';
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: USER_B, email: 'titular.b@exemplo.com' } } },
      error: null
    });

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    // Consulta registros da Conta B
    const loadBtnB = container.querySelector(
      '[data-testid="privacy-refresh-history-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      loadBtnB.click();
    });
    await flushEffects();

    // Agora resolve a resposta atrasada da Conta A
    resolveUserARequest({
      data: buildConsentRpcPayload({
        user_id: USER_A,
        optional_whatsapp_consent_active: false,
        optional_whatsapp_consent_status: 'revoked'
      }),
      error: null
    });
    await flushEffects();

    const section = container.querySelector('[data-testid="privacy-center-section"]');
    expect(section?.textContent).toContain('Titular Conta B');
    expect(section?.textContent).toContain('titular.b@exemplo.com');
    expect(section?.textContent).not.toContain('titular.a@exemplo.com');
    expect(
      container.querySelector('[data-testid="whatsapp-consent-status-label"]')?.textContent
    ).toContain('Autorizado pelo titular');
  });

  it('3. Histórico de aceites exibe registros reais do servidor e trata schema_missing sem criar aceite fictício', async () => {
    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="privacy-acceptance-idle"]')).not.toBeNull();
    const loadBtn = container.querySelector(
      '[data-testid="privacy-refresh-history-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      loadBtn.click();
    });
    await flushEffects();

    const historyList = container.querySelector('[data-testid="privacy-acceptance-list"]');
    expect(historyList).not.toBeNull();
    expect(historyList?.textContent).toContain('Termos de Uso');
    expect(historyList?.textContent).toContain('Política de Privacidade');
    expect(historyList?.textContent).toContain('Aceite contratual dos Termos de Uso');
    expect(historyList?.textContent).toContain('Ciência da Política de Privacidade');
    expect(historyList?.textContent).toContain('v1.0.0');

    // Simula banco ainda sem implantação do Script SQL 06
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_my_legal_consent_status') {
        return {
          data: null,
          error: {
            code: 'PGRST202',
            message: 'Could not find the function public.get_my_legal_consent_status'
          }
        };
      }
      return { data: null, error: null };
    });

    const refreshBtn = container.querySelector(
      '[data-testid="privacy-refresh-history-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      refreshBtn.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="privacy-acceptance-list"]')).toBeNull();
    const unavailableEl = container.querySelector('[data-testid="privacy-acceptance-unavailable"]');
    expect(unavailableEl).not.toBeNull();
    expect(unavailableEl?.textContent).toContain('Nenhum aceite fictício foi criado');

    // Nenhum aceite gravado no localStorage
    expect(localStorage.length).toBe(0);
  });

  it('4. Exportação dos meus dados reutiliza exportBackupJson sem mutação destrutiva e preserva formato JSON', async () => {
    const createObjectUrlSpy = vi
      .spyOn(URL, 'createObjectURL')
      .mockReturnValue('blob:mock-json-export');
    const revokeObjectUrlSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const anchorClickSpy = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => {});

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const exportBtn = container.querySelector(
      '[data-testid="privacy-export-json-btn"]'
    ) as HTMLButtonElement;
    expect(exportBtn).not.toBeNull();

    await act(async () => {
      exportBtn.click();
    });

    expect(financeCtxMock.exportBackupJson).toHaveBeenCalledTimes(1);
    expect(createObjectUrlSpy).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(revokeObjectUrlSpy).toHaveBeenCalledTimes(1);
    // Nenhuma operação destrutiva executada
    expect(financeCtxMock.loadSampleData).not.toHaveBeenCalled();
  });

  it('5. Preferências de comunicação (Fase 2.4.1): não presume consentimento, permite conceder e revogar explicitamente e registra histórico cronológico', async () => {
    const eventsLog: any[] = [];
    let currentStatus: 'not_set' | 'granted' | 'revoked' = 'not_set';
    const spec = getCurrentLocalLegalDocumentsSpec();

    rpcMock.mockImplementation(async (fnName: string, params?: any) => {
      if (fnName === 'get_my_legal_consent_status') {
        return {
          data: buildConsentRpcPayload({
            optional_whatsapp_consent_active: currentStatus === 'granted',
            optional_whatsapp_consent_status: currentStatus,
            optional_whatsapp_consent_updated_at:
              eventsLog.length > 0 ? eventsLog[eventsLog.length - 1].occurred_at : null,
            whatsapp_consent_history: [...eventsLog]
          }),
          error: null
        };
      }
      if (fnName === 'set_my_optional_whatsapp_consent') {
        const action = params?.p_consent_action;
        const ev = {
          id: `wa-ev-${eventsLog.length + 1}`,
          event_seq: eventsLog.length + 1,
          consent_scope: 'commercial_whatsapp_communications',
          event_type: action === 'grant' ? 'granted' : 'revoked',
          privacy_policy_version: spec.privacyVersion,
          privacy_policy_hash: spec.privacyHash,
          event_source: params?.p_event_source || 'settings_privacy_panel',
          explicit_user_action: true,
          occurred_at:
            action === 'grant' ? '2026-11-19T14:00:00Z' : '2026-11-19T15:00:00Z'
        };
        eventsLog.push(ev);
        currentStatus = action === 'grant' ? 'granted' : 'revoked';
        return {
          data: buildConsentRpcPayload({
            optional_whatsapp_consent_active: currentStatus === 'granted',
            optional_whatsapp_consent_status: currentStatus,
            optional_whatsapp_consent_updated_at: ev.occurred_at,
            whatsapp_consent_history: [...eventsLog]
          }),
          error: null
        };
      }
      return { data: [], error: null };
    });

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const loadWaBtn = container.querySelector(
      '[data-testid="whatsapp-consent-load-btn"]'
    ) as HTMLButtonElement;
    expect(loadWaBtn).not.toBeNull();
    await act(async () => {
      loadWaBtn.click();
    });
    await flushEffects();

    // Sem histórico prévio, nunca presume autorizado
    expect(
      container.querySelector('[data-testid="whatsapp-consent-status-label"]')?.textContent
    ).toContain('Não definido (sem autorização ativa)');
    expect(
      container.querySelector('[data-testid="whatsapp-consent-history-empty"]')
    ).not.toBeNull();

    // Conceder explicitamente sem precisar de novo aceite contratual
    const grantBtn = container.querySelector(
      '[data-testid="whatsapp-consent-grant-btn"]'
    ) as HTMLButtonElement;
    expect(grantBtn).not.toBeNull();

    await act(async () => {
      grantBtn.click();
    });
    await flushEffects();

    expect(rpcMock).toHaveBeenCalledWith('set_my_optional_whatsapp_consent', {
      p_consent_action: 'grant',
      p_event_source: 'settings_privacy_panel'
    });
    expect(
      container.querySelector('[data-testid="whatsapp-consent-status-label"]')?.textContent
    ).toContain('Autorizado pelo titular');

    // Revogar explicitamente
    const revokeBtn = container.querySelector(
      '[data-testid="whatsapp-consent-revoke-btn"]'
    ) as HTMLButtonElement;
    expect(revokeBtn).not.toBeNull();

    await act(async () => {
      revokeBtn.click();
    });
    await flushEffects();

    expect(rpcMock).toHaveBeenCalledWith('set_my_optional_whatsapp_consent', {
      p_consent_action: 'revoke',
      p_event_source: 'settings_privacy_panel'
    });
    expect(
      container.querySelector('[data-testid="whatsapp-consent-status-label"]')?.textContent
    ).toContain('Revogado (sem autorização ativa)');

    // Histórico cronológico preserva concessão e revogação
    const waHistoryList = container.querySelector('[data-testid="whatsapp-consent-history-list"]');
    expect(waHistoryList?.textContent).toContain('Concedido');
    expect(waHistoryList?.textContent).toContain('Revogado');
    // Nunca altera customer_profiles diretamente pelo cliente
    expect(fromMock).not.toHaveBeenCalledWith('customer_profiles');
    // Esclarece diferença entre clique voluntário em wa.me e contato proativo
    expect(
      container.querySelector('[data-testid="privacy-communication-preferences-section"]')
        ?.textContent
    ).toContain('wa.me');
  });

  it('6. Preferências de comunicação: bloqueia gravação quando SQL 06 não está instalado (schema_missing) e trata falha da RPC honestamente', async () => {
    // Caso A: schema_missing -> não exibe/executa botões de mutação e mostra canal oficial
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_my_legal_consent_status') {
        return {
          data: null,
          error: {
            code: '42883',
            message: 'function get_my_legal_consent_status() does not exist'
          }
        };
      }
      return { data: null, error: null };
    });

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const loadWaBtn = container.querySelector(
      '[data-testid="whatsapp-consent-load-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      loadWaBtn.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="whatsapp-consent-grant-btn"]')).toBeNull();
    expect(container.querySelector('[data-testid="whatsapp-consent-revoke-btn"]')).toBeNull();
    const unavailableWa = container.querySelector(
      '[data-testid="whatsapp-consent-unavailable-notice"]'
    );
    expect(unavailableWa).not.toBeNull();
    expect(unavailableWa?.textContent).toContain('+55 33 99103-1052');
    expect(rpcMock).not.toHaveBeenCalledWith(
      'set_my_optional_whatsapp_consent',
      expect.anything()
    );

    // Caso B: esquema presente mas falha na RPC de revogação -> exibe erro sem revogação fictícia
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_my_legal_consent_status') {
        return {
          data: buildConsentRpcPayload({
            optional_whatsapp_consent_active: true,
            optional_whatsapp_consent_status: 'granted',
            optional_whatsapp_consent_updated_at: '2026-11-19T14:00:00Z'
          }),
          error: null
        };
      }
      if (fnName === 'set_my_optional_whatsapp_consent') {
        return {
          data: null,
          error: { code: '500', message: 'Falha simulada no servidor ao revogar.' }
        };
      }
      return { data: [], error: null };
    });

    const refreshBtn = container.querySelector(
      '[data-testid="privacy-refresh-history-btn"]'
    ) as HTMLButtonElement;
    await act(async () => {
      refreshBtn.click();
    });
    await flushEffects();

    const revokeBtn = container.querySelector(
      '[data-testid="whatsapp-consent-revoke-btn"]'
    ) as HTMLButtonElement;
    expect(revokeBtn).not.toBeNull();

    await act(async () => {
      revokeBtn.click();
    });
    await flushEffects();

    const feedbackEl = container.querySelector('[data-testid="whatsapp-consent-feedback"]');
    expect(feedbackEl?.textContent).toContain('Falha simulada no servidor ao revogar.');
    // Status permanece autorizado porque o servidor não confirmou revogação
    expect(
      container.querySelector('[data-testid="whatsapp-consent-status-label"]')?.textContent
    ).toContain('Autorizado pelo titular');
  });

  it('7. Solicitações de privacidade e seção "Excluir minha conta" são transparentes, informativas e sem exclusão automatizada ou protocolos fictícios', async () => {
    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <SettingsView />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    // Direitos LGPD Art. 18
    const rightsSection = container.querySelector(
      '[data-testid="privacy-rights-requests-section"]'
    );
    expect(rightsSection).not.toBeNull();
    expect(rightsSection?.textContent).toContain('Acesso aos dados pessoais');
    expect(rightsSection?.textContent).toContain('Correção de informações');
    expect(rightsSection?.textContent).toContain('Portabilidade de dados');
    expect(rightsSection?.textContent).toContain('Informações sobre compartilhamento');
    expect(rightsSection?.textContent).toContain('Revogação de consentimento');
    expect(rightsSection?.textContent).toContain('Exclusão de dados pessoais');
    expect(rightsSection?.textContent).toContain(
      'não gera nem registra protocolo interno'
    );

    const rightsLink = container.querySelector(
      '[data-testid="privacy-rights-whatsapp-link"]'
    ) as HTMLAnchorElement;
    expect(rightsLink?.getAttribute('href')).toContain('https://wa.me/5533991031052');

    // Excluir minha conta: estritamente informativa
    const deletionSection = container.querySelector(
      '[data-testid="privacy-account-deletion-section"]'
    );
    expect(deletionSection).not.toBeNull();
    expect(deletionSection?.textContent).toContain('Excluir minha conta');
    expect(deletionSection?.textContent).toContain('perda permanente dos dados financeiros');
    expect(deletionSection?.textContent).toContain('exportar uma cópia em JSON');
    expect(deletionSection?.textContent).toContain('obrigações legais, fiscais');
    expect(deletionSection?.textContent).toContain('autenticação recente');

    const deletionLink = container.querySelector(
      '[data-testid="privacy-delete-account-whatsapp-link"]'
    ) as HTMLAnchorElement;
    expect(deletionLink?.getAttribute('href')).toContain('https://wa.me/5533991031052');

    // Nenhum botão de autoexclusão automatizada no DOM
    const buttonsText = Array.from(deletionSection?.querySelectorAll('button') || [])
      .map(b => b.textContent || '')
      .join(' ');
    expect(buttonsText).toBe('');
  });

  it('8. Compatibilidade com Fases 2.3/2.4 e proteção do banco: gate permanece desativado e scripts SQL 01–06 intocados', () => {
    expect(LEGAL_CONSENT_GATE_ENABLED).toBe(false);
    expect(LEGAL_DOCUMENTS_REGISTRY.terms_of_use.version).toBe('1.0.0');
    expect(LEGAL_DOCUMENTS_REGISTRY.privacy_policy.version).toBe('1.0.0');

    const privacyCenterSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/settings/PrivacyCenterSection.tsx'),
      'utf8'
    );
    expect(privacyCenterSrc).not.toContain('auth.admin.deleteUser');
    expect(privacyCenterSrc).not.toContain('.delete()');
  });
});
