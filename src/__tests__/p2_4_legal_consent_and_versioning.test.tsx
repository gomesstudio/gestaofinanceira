// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from 'node:fs';
import path from 'node:path';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

const {
  getSessionMock,
  rpcMock,
  authStateListeners,
  financeCtxMock,
  mockAuthStateForUi
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
  rpcMock: vi.fn(),
  authStateListeners: new Set<(event: string, session: any) => void>(),
  financeCtxMock: {
    transactions: [],
    debts: [],
    goals: [],
    categories: [],
    accounts: [],
    safetyReserveDesired: 0,
    setSafetyReserveDesired: vi.fn(),
    addCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    addAccount: vi.fn(),
    updateAccount: vi.fn(),
    deleteAccount: vi.fn(),
    loadSampleData: vi.fn(),
    exportBackupJson: vi.fn(),
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
    openQuickEntry: vi.fn(),
    selectedYear: 2026,
    selectedMonth: 11,
    isFutureView: false,
    goToNextMonth: vi.fn(),
    goToPrevMonth: vi.fn(),
    goToCurrentMonth: vi.fn(),
    isFinanceHydrating: false,
    isFinanceHydrated: true,
    hydratedUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    hydrationError: null,
    retryCloudHydration: vi.fn()
  },
  mockAuthStateForUi: {
    isSupabaseAuthenticated: false,
    isSessionLoading: false,
    isPasswordRecoveryMode: false,
    authUrlError: null as string | null,
    supabaseUser: null as any,
    supabaseUserId: null as string | null,
    supabaseUserEmail: null as string | null,
    supabaseUserDisplayName: 'Usuário Teste',
    supabaseConnectionStatus: 'connected'
  }
}));

vi.mock('../utils/supabase', () => ({
  SUPABASE_PROJECT_URL: 'https://ficticio.supabase.co',
  supabase: {
    auth: {
      getSession: getSessionMock,
      onAuthStateChange: vi.fn((cb: (event: string, session: any) => void) => {
        authStateListeners.add(cb);
        return {
          data: {
            subscription: {
              unsubscribe: () => authStateListeners.delete(cb)
            }
          }
        };
      }),
      signOut: vi.fn(async () => ({ error: null }))
    },
    rpc: rpcMock,
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null }))
        }))
      }))
    }))
  }
}));

vi.mock('../context/FinanceContext', async () => {
  const actual = await vi.importActual<typeof import('../context/FinanceContext')>(
    '../context/FinanceContext'
  );
  return {
    ...actual,
    FinanceProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useFinance: () => financeCtxMock
  };
});

vi.mock('../context/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../context/AuthContext')>(
    '../context/AuthContext'
  );
  return {
    ...actual,
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: () => ({
      ...mockAuthStateForUi,
      clearAuthUrlError: vi.fn(),
      loginWithSupabase: vi.fn(async () => ({ success: true })),
      signUpWithSupabase: vi.fn(async () => ({ success: true })),
      loginWithGitHub: vi.fn(async () => ({ success: true })),
      signInWithOtp: vi.fn(async () => ({ success: true })),
      verifyOtp: vi.fn(async () => ({ success: true })),
      sendPasswordResetEmail: vi.fn(async () => ({ success: true })),
      updatePassword: vi.fn(async () => ({ success: true })),
      cancelPasswordRecovery: vi.fn(),
      checkSessionStatus: vi.fn(async () => false),
      logout: vi.fn(async () => {})
    })
  };
});

import App from '../App';
import { LEGAL_CONSENT_GATE_ENABLED, LEGAL_DOCUMENTS_REGISTRY } from '../legal/legalConfig';
import { computeLegalDocumentSha256 } from '../legal/legalHash';
import {
  evaluateLegalConsentPayload,
  fetchMyWhatsappConsentHistory,
  fetchUserLegalConsentStatus,
  getCurrentLocalLegalDocumentsSpec,
  recordUserLegalConsent,
  resolveOptionalWhatsappDecision,
  setOptionalWhatsappConsent
} from '../services/legalConsentService';
import { LegalConsentGate } from '../components/legal/LegalConsentGate';
import { LegalNavigationProvider } from '../context/LegalNavigationContext';

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 20));
  });
}

describe('Fase 2.4 — Registro de Aceite, Versionamento e Consentimento Seguro', () => {
  let container: HTMLDivElement;
  let root: Root;

  const spec = getCurrentLocalLegalDocumentsSpec();

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    sessionStorage.clear();
    window.history.replaceState(null, '', '/');

    mockAuthStateForUi.isSupabaseAuthenticated = true;
    mockAuthStateForUi.isSessionLoading = false;
    mockAuthStateForUi.isPasswordRecoveryMode = false;
    mockAuthStateForUi.supabaseUserId = USER_A;
    mockAuthStateForUi.supabaseUserEmail = 'usuario-a@exemplo.com';
    mockAuthStateForUi.supabaseUserDisplayName = 'Usuário A';

    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: USER_A, email: 'usuario-a@exemplo.com' } } },
      error: null
    });

    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'check_is_subscription_admin') {
        return { data: false, error: null };
      }
      if (fnName === 'get_my_legal_consent_status') {
        return {
          data: {
            user_id: USER_A,
            is_existing_user: false,
            has_any_prior_acceptance: false,
            has_valid_consent: false,
            terms_accepted: false,
            privacy_acknowledged: false,
            active_terms_version: spec.termsVersion,
            active_terms_hash: spec.termsHash,
            active_privacy_version: spec.privacyVersion,
            active_privacy_hash: spec.privacyHash,
            accepted_terms_version: null,
            accepted_terms_at: null,
            acknowledged_privacy_version: null,
            acknowledged_privacy_at: null,
            optional_whatsapp_consent_at: null,
            history: []
          },
          error: null
        };
      }
      return { data: null, error: { code: '42883', message: 'function not deployed' } };
    });
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('1. Mantém bloqueio obrigatório DESATIVADO em produção (LEGAL_CONSENT_GATE_ENABLED = false) e não bloqueia App padrão', async () => {
    expect(LEGAL_CONSENT_GATE_ENABLED).toBe(false);

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="legal-consent-gate"]')).toBeNull();
    const legalRpcCalls = rpcMock.mock.calls.filter(
      call => call[0] === 'get_my_legal_consent_status'
    );
    expect(legalRpcCalls.length).toBe(0);
  });

  it('2. Script SQL 06 é independente, possui hashes SHA-256 exatos da v1.0.0, usa auth.uid(), evita IP/fingerprint e protege histórico append-only', () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/sql/06_legal_versions_and_consent_logs.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');

    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.legal_document_versions');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.user_legal_acceptances');
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.user_whatsapp_consent_events');
    expect(sql).toContain(computeLegalDocumentSha256('terms_of_use'));
    expect(sql).toContain(computeLegalDocumentSha256('privacy_policy'));

    // Segurança e minimização LGPD (verifica definições SQL ignorando comentários explicativos)
    const sqlWithoutComments = sql.replace(/--.*$/gm, '');
    expect(sqlWithoutComments).toContain('auth.uid()');
    expect(sqlWithoutComments).not.toMatch(/\bp_user_id\b/);
    expect(sqlWithoutComments).not.toMatch(/ip_address|geolocation|user_agent|fingerprint/i);
    expect(sqlWithoutComments).not.toContain('user_finance_data');
    expect(sqlWithoutComments).toContain('trg_prevent_legal_acceptance_mutation');
    expect(sqlWithoutComments).toContain('trg_prevent_whatsapp_consent_event_mutation');
    expect(sqlWithoutComments).toContain('trg_protect_published_legal_document_versions');
    expect(sqlWithoutComments).toContain('GRANT SELECT ON TABLE public.user_legal_acceptances TO authenticated');
    expect(sqlWithoutComments).toContain('GRANT SELECT ON TABLE public.user_whatsapp_consent_events TO authenticated');
    expect(sqlWithoutComments).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*ON TABLE public\.user_legal_acceptances TO authenticated/i
    );
    expect(sqlWithoutComments).not.toMatch(
      /GRANT[^;]*(INSERT|UPDATE|DELETE)[^;]*ON TABLE public\.user_whatsapp_consent_events TO authenticated/i
    );
  });

  it('3. LegalConsentGate exibe título oficial, checkbox obrigatório inicialmente desmarcado e mantém botão Continuar bloqueado sem aceite', async () => {
    const onConsentCompleted = vi.fn();

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <LegalConsentGate
            userId={USER_A}
            userEmail="usuario-a@exemplo.com"
            displayName="Usuário A"
            onConsentCompleted={onConsentCompleted}
          />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    expect(container.textContent).toContain('Seus dados, sua privacidade.');

    const mandatoryBox = container.querySelector(
      '[data-testid="consent-mandatory-checkbox"]'
    ) as HTMLInputElement;
    const optionalBox = container.querySelector(
      '[data-testid="consent-optional-whatsapp-checkbox"]'
    ) as HTMLInputElement;
    const continueBtn = container.querySelector(
      '[data-testid="consent-gate-continue-button"]'
    ) as HTMLButtonElement;

    expect(mandatoryBox.checked).toBe(false);
    expect(optionalBox.checked).toBe(false);
    expect(continueBtn.disabled).toBe(true);

    // Marcar apenas o consentimento opcional NÃO deve liberar o botão Continuar
    await act(async () => {
      optionalBox.click();
    });
    await flushEffects();

    expect(optionalBox.checked).toBe(true);
    expect(mandatoryBox.checked).toBe(false);
    expect(continueBtn.disabled).toBe(true);
    expect(onConsentCompleted).not.toHaveBeenCalled();
  });

  it('4. Permite consultar Termos de Uso e Política de Privacidade diretamente a partir do LegalConsentGate preservando o estado', async () => {
    await act(async () => {
      root.render(<App enableLegalConsentGateOverride={true} />);
    });
    await flushEffects();

    const gate = container.querySelector('[data-testid="legal-consent-gate"]');
    expect(gate).not.toBeNull();

    const mandatoryBox = container.querySelector(
      '[data-testid="consent-mandatory-checkbox"]'
    ) as HTMLInputElement;
    await act(async () => {
      mandatoryBox.click();
    });

    const openPrivacyBtn = container.querySelector(
      '[data-testid="consent-gate-open-privacy"]'
    ) as HTMLButtonElement;
    await act(async () => {
      openPrivacyBtn.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="legal-documents-view"]')).not.toBeNull();
    expect(container.textContent).toContain('Política de Privacidade e Proteção de Dados (LGPD)');

    const backBtn = container.querySelector(
      '[data-testid="legal-back-button"]'
    ) as HTMLButtonElement;
    await act(async () => {
      backBtn.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="legal-documents-view"]')).toBeNull();
    const restoredBox = container.querySelector(
      '[data-testid="consent-mandatory-checkbox"]'
    ) as HTMLInputElement;
    expect(restoredBox.checked).toBe(true);
  });

  it('5. Identifica corretamente a sessão autenticada, rejeita divergência de usuário e não envia user_id do frontend para a RPC', async () => {
    // Sessão ativa é USER_B, mas camada UI tenta consultar para USER_A -> deve falhar fechado
    getSessionMock.mockResolvedValueOnce({
      data: { session: { user: { id: USER_B, email: 'b@exemplo.com' } } },
      error: null
    });

    const mismatchedStatus = await fetchUserLegalConsentStatus(USER_A);
    expect(mismatchedStatus.hasValidConsent).toBe(false);
    expect(mismatchedStatus.mode).toBe('error');
    expect(rpcMock).not.toHaveBeenCalled();

    // Se servidor retornar payload de outro user_id -> também rejeita fechado
    const spoofedPayloadEval = evaluateLegalConsentPayload(
      {
        user_id: USER_B,
        terms_accepted: true,
        privacy_acknowledged: true,
        active_terms_version: spec.termsVersion,
        active_terms_hash: spec.termsHash,
        active_privacy_version: spec.privacyVersion,
        active_privacy_hash: spec.privacyHash,
        accepted_terms_version: spec.termsVersion,
        acknowledged_privacy_version: spec.privacyVersion
      },
      USER_A
    );
    expect(spoofedPayloadEval.hasValidConsent).toBe(false);
    expect(spoofedPayloadEval.mode).toBe('error');

    // Chamada legítima para USER_A registra versão, hash e nunca envia p_user_id
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: USER_A, email: 'a@exemplo.com' } } },
      error: null
    });
    rpcMock.mockImplementationOnce(async (fnName: string, args: any) => {
      expect(fnName).toBe('record_legal_consent');
      expect(args).not.toHaveProperty('user_id');
      expect(args).not.toHaveProperty('p_user_id');
      expect(args.p_terms_version).toBe(LEGAL_DOCUMENTS_REGISTRY.terms_of_use.version);
      expect(args.p_terms_hash).toBe(spec.termsHash);
      expect(args.p_privacy_version).toBe(LEGAL_DOCUMENTS_REGISTRY.privacy_policy.version);
      expect(args.p_privacy_hash).toBe(spec.privacyHash);
      expect(args.p_accept_contractual_terms).toBe(true);
      expect(args.p_acknowledge_privacy_policy).toBe(true);
      expect(args.p_optional_whatsapp_decision).toBe('unchanged');
      return {
        data: {
          user_id: USER_A,
          is_existing_user: false,
          has_any_prior_acceptance: true,
          has_valid_consent: true,
          terms_accepted: true,
          privacy_acknowledged: true,
          active_terms_version: spec.termsVersion,
          active_terms_hash: spec.termsHash,
          active_privacy_version: spec.privacyVersion,
          active_privacy_hash: spec.privacyHash,
          accepted_terms_version: spec.termsVersion,
          accepted_terms_at: '2026-11-19T10:00:00Z',
          acknowledged_privacy_version: spec.privacyVersion,
          acknowledged_privacy_at: '2026-11-19T10:00:00Z',
          optional_whatsapp_consent_at: null,
          history: []
        },
        error: null
      };
    });

    const recorded = await recordUserLegalConsent({
      expectedUserId: USER_A,
      acceptContractualTerms: true,
      acknowledgePrivacyPolicy: true,
      optionalWhatsappConsent: false
    });

    expect(recorded.success).toBe(true);
    expect(recorded.state?.hasValidConsent).toBe(true);
    expect(recorded.state?.mode).toBe('up_to_date');
  });

  it('6. Detecta versões desatualizadas e solicita reaceite sem presumir consentimento prévio', async () => {
    const outdatedState = evaluateLegalConsentPayload(
      {
        user_id: USER_A,
        is_existing_user: true,
        has_any_prior_acceptance: true,
        terms_accepted: false,
        privacy_acknowledged: false,
        active_terms_version: spec.termsVersion,
        active_terms_hash: spec.termsHash,
        active_privacy_version: spec.privacyVersion,
        active_privacy_hash: spec.privacyHash,
        accepted_terms_version: '0.9.0',
        accepted_terms_at: '2026-09-01T10:00:00Z',
        acknowledged_privacy_version: '0.9.0',
        acknowledged_privacy_at: '2026-09-01T10:00:00Z',
        history: []
      },
      USER_A
    );

    expect(outdatedState.mode).toBe('reacceptance_required');
    expect(outdatedState.hasValidConsent).toBe(false);
    expect(outdatedState.needsTermsReacceptance).toBe(true);
    expect(outdatedState.needsPrivacyReacknowledgment).toBe(true);

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <LegalConsentGate
            userId={USER_A}
            initialConsentState={outdatedState}
            onConsentCompleted={vi.fn()}
          />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const notice = container.querySelector('[data-testid="consent-gate-reacceptance-notice"]');
    expect(notice).not.toBeNull();
    expect(notice?.textContent).toContain('v0.9.0');
    expect(notice?.textContent).toContain(`v${spec.termsVersion}`);
  });

  it('7. Trata usuários antigos com transição segura preservando dados sem gravar aceite fictício', async () => {
    const legacyState = evaluateLegalConsentPayload(
      {
        user_id: USER_A,
        is_existing_user: true,
        has_any_prior_acceptance: false,
        terms_accepted: false,
        privacy_acknowledged: false,
        active_terms_version: spec.termsVersion,
        active_terms_hash: spec.termsHash,
        active_privacy_version: spec.privacyVersion,
        active_privacy_hash: spec.privacyHash,
        accepted_terms_version: null,
        acknowledged_privacy_version: null,
        history: []
      },
      USER_A
    );

    expect(legacyState.mode).toBe('legacy_user_transition');
    expect(legacyState.hasValidConsent).toBe(false);

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <LegalConsentGate
            userId={USER_A}
            initialConsentState={legacyState}
            onConsentCompleted={vi.fn()}
          />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const legacyNotice = container.querySelector('[data-testid="consent-gate-legacy-notice"]');
    expect(legacyNotice).not.toBeNull();
    expect(legacyNotice?.textContent).toContain(
      'Sua conta e seus dados financeiros anteriores estão preservados'
    );
    expect(localStorage.length).toBe(0);
  });

  it('8. Falha de conexão ou ausência do schema no banco NUNCA é interpretada como aceite válido e mantém bloqueio seguro', async () => {
    // 8A: Falha de rede / RPC na consulta inicial
    rpcMock.mockRejectedValueOnce(new Error('Network timeout'));
    const networkFailureState = await fetchUserLegalConsentStatus(USER_A);
    expect(networkFailureState.hasValidConsent).toBe(false);
    expect(networkFailureState.mode).toBe('error');

    // 8B: Tabela/RPC ausente no banco (42883)
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: '42883', message: 'function public.get_my_legal_consent_status() does not exist' }
    });
    const schemaMissingState = await fetchUserLegalConsentStatus(USER_A);
    expect(schemaMissingState.hasValidConsent).toBe(false);
    expect(schemaMissingState.mode).toBe('schema_missing');
    expect(schemaMissingState.isSchemaMissing).toBe(true);

    // 8C: Na UI, com erro na consulta, Continuar fica bloqueado e botão Tentar Novamente aparece
    const onConsentCompleted = vi.fn();
    rpcMock.mockRejectedValueOnce(new Error('Offline'));
    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <LegalConsentGate
            userId={USER_A}
            onConsentCompleted={onConsentCompleted}
          />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="consent-gate-load-error"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="consent-gate-retry-load"]')).not.toBeNull();
    const continueBtn = container.querySelector(
      '[data-testid="consent-gate-continue-button"]'
    ) as HTMLButtonElement;
    expect(continueBtn.disabled).toBe(true);
    expect(onConsentCompleted).not.toHaveBeenCalled();

    // 8D: Se consulta funcionou, mas gravação falhar no clique de Continuar -> exibe erro e não libera acesso
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'get_my_legal_consent_status') {
        return {
          data: {
            user_id: USER_A,
            is_existing_user: false,
            has_any_prior_acceptance: false,
            terms_accepted: false,
            privacy_acknowledged: false,
            active_terms_version: spec.termsVersion,
            active_terms_hash: spec.termsHash,
            active_privacy_version: spec.privacyVersion,
            active_privacy_hash: spec.privacyHash,
            history: []
          },
          error: null
        };
      }
      return {
        data: null,
        error: { code: '500', message: 'Falha momentânea ao persistir aceite.' }
      };
    });

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <LegalConsentGate
            key="gate-submit-error-case"
            userId={USER_A}
            onConsentCompleted={onConsentCompleted}
          />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const mandatoryBox = container.querySelector(
      '[data-testid="consent-mandatory-checkbox"]'
    ) as HTMLInputElement;
    const submitBtn = container.querySelector(
      '[data-testid="consent-gate-continue-button"]'
    ) as HTMLButtonElement;

    await act(async () => {
      mandatoryBox.click();
    });
    await act(async () => {
      submitBtn.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="consent-gate-submit-error"]')).not.toBeNull();
    expect(onConsentCompleted).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
  });

  it('9. Fluxo completo com bloqueio ativo (override em teste) libera acesso somente após confirmação real no servidor', async () => {
    let acceptedOnServer = false;

    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'check_is_subscription_admin') {
        return { data: false, error: null };
      }
      if (fnName === 'get_my_legal_consent_status') {
        return {
          data: {
            user_id: USER_A,
            is_existing_user: false,
            has_any_prior_acceptance: acceptedOnServer,
            terms_accepted: acceptedOnServer,
            privacy_acknowledged: acceptedOnServer,
            active_terms_version: spec.termsVersion,
            active_terms_hash: spec.termsHash,
            active_privacy_version: spec.privacyVersion,
            active_privacy_hash: spec.privacyHash,
            accepted_terms_version: acceptedOnServer ? spec.termsVersion : null,
            acknowledged_privacy_version: acceptedOnServer ? spec.privacyVersion : null,
            history: []
          },
          error: null
        };
      }
      if (fnName === 'record_legal_consent') {
        acceptedOnServer = true;
        return {
          data: {
            user_id: USER_A,
            is_existing_user: false,
            has_any_prior_acceptance: true,
            terms_accepted: true,
            privacy_acknowledged: true,
            active_terms_version: spec.termsVersion,
            active_terms_hash: spec.termsHash,
            active_privacy_version: spec.privacyVersion,
            active_privacy_hash: spec.privacyHash,
            accepted_terms_version: spec.termsVersion,
            accepted_terms_at: '2026-11-19T10:30:00Z',
            acknowledged_privacy_version: spec.privacyVersion,
            acknowledged_privacy_at: '2026-11-19T10:30:00Z',
            history: []
          },
          error: null
        };
      }
      return { data: null, error: { code: '42883', message: 'not deployed' } };
    });

    await act(async () => {
      root.render(<App enableLegalConsentGateOverride={true} />);
    });
    await flushEffects();

    // Bloqueado antes do aceite
    expect(container.querySelector('[data-testid="legal-consent-gate"]')).not.toBeNull();

    const mandatoryBox = container.querySelector(
      '[data-testid="consent-mandatory-checkbox"]'
    ) as HTMLInputElement;
    const submitBtn = container.querySelector(
      '[data-testid="consent-gate-continue-button"]'
    ) as HTMLButtonElement;

    await act(async () => {
      mandatoryBox.click();
    });
    await act(async () => {
      submitBtn.click();
    });
    await flushEffects();

    // Após confirmação gravada no servidor, libera o gate e carrega o aplicativo
    expect(container.querySelector('[data-testid="legal-consent-gate"]')).toBeNull();
    expect(acceptedOnServer).toBe(true);
  });

  it('10. [Fase 2.4.1 / Simulado + UI] Concessão e revogação de WhatsApp preservam histórico, invalidam autorização antiga após revogação, dispensam novo aceite contratual e impedem revogação tácita por caixa desmarcada', async () => {
    // 10A: Caixa desmarcada / booleano false NUNCA gera 'revoke' automático
    expect(resolveOptionalWhatsappDecision({})).toBe('unchanged');
    expect(resolveOptionalWhatsappDecision({ optionalWhatsappConsent: false })).toBe('unchanged');
    expect(resolveOptionalWhatsappDecision({ optionalWhatsappConsent: true })).toBe('grant');
    expect(
      resolveOptionalWhatsappDecision({ optionalWhatsappDecision: 'revoke' })
    ).toBe('revoke');

    // 10B: Histórico com concessão antiga + revogação posterior => autorização antiga NUNCA vale após revogação
    const revokedEvaluation = evaluateLegalConsentPayload(
      {
        user_id: USER_A,
        is_existing_user: false,
        has_any_prior_acceptance: true,
        terms_accepted: true,
        privacy_acknowledged: true,
        active_terms_version: spec.termsVersion,
        active_terms_hash: spec.termsHash,
        active_privacy_version: spec.privacyVersion,
        active_privacy_hash: spec.privacyHash,
        accepted_terms_version: spec.termsVersion,
        acknowledged_privacy_version: spec.privacyVersion,
        optional_whatsapp_consent_active: false,
        optional_whatsapp_consent_status: 'revoked',
        optional_whatsapp_consent_at: '2026-11-18T10:00:00Z', // campo legado antigo tentando induzir ativo
        whatsapp_consent_history: [
          {
            id: 'evt-1',
            event_seq: 1,
            consent_scope: 'commercial_whatsapp_communications',
            event_type: 'granted',
            privacy_policy_version: spec.privacyVersion,
            privacy_policy_hash: spec.privacyHash,
            event_source: 'legal_consent_gate',
            explicit_user_action: true,
            occurred_at: '2026-11-18T10:00:00Z'
          },
          {
            id: 'evt-2',
            event_seq: 2,
            consent_scope: 'commercial_whatsapp_communications',
            event_type: 'revoked',
            privacy_policy_version: spec.privacyVersion,
            privacy_policy_hash: spec.privacyHash,
            event_source: 'settings_privacy_panel',
            explicit_user_action: true,
            occurred_at: '2026-11-19T09:00:00Z'
          }
        ],
        history: []
      },
      USER_A
    );

    expect(revokedEvaluation.optionalWhatsappConsentActive).toBe(false);
    expect(revokedEvaluation.optionalWhatsappConsentStatus).toBe('revoked');
    expect(revokedEvaluation.optionalWhatsappConsentAt).toBeNull();
    expect(revokedEvaluation.whatsappConsentHistory.length).toBe(2);
    expect(revokedEvaluation.whatsappConsentHistory.map(i => i.eventType)).toEqual([
      'revoked',
      'granted'
    ]);

    // 10C: Revogação explícita sem novo aceite contratual + consulta de histórico
    let currentWaStatus: 'granted' | 'revoked' = 'granted';
    const recordedEvents: Array<{ type: 'granted' | 'revoked'; seq: number }> = [
      { type: 'granted', seq: 1 }
    ];

    rpcMock.mockImplementation(async (fnName: string, args?: any) => {
      if (fnName === 'set_my_optional_whatsapp_consent') {
        expect(args).not.toHaveProperty('user_id');
        expect(args).not.toHaveProperty('p_user_id');
        if (args.p_consent_action === 'revoke' && currentWaStatus === 'granted') {
          currentWaStatus = 'revoked';
          recordedEvents.push({ type: 'revoked', seq: 2 });
        }
        return {
          data: {
            user_id: USER_A,
            is_existing_user: false,
            has_any_prior_acceptance: true,
            terms_accepted: true,
            privacy_acknowledged: true,
            active_terms_version: spec.termsVersion,
            active_terms_hash: spec.termsHash,
            active_privacy_version: spec.privacyVersion,
            active_privacy_hash: spec.privacyHash,
            accepted_terms_version: spec.termsVersion,
            acknowledged_privacy_version: spec.privacyVersion,
            optional_whatsapp_consent_active: currentWaStatus === 'granted',
            optional_whatsapp_consent_status: currentWaStatus,
            whatsapp_consent_history: recordedEvents.map(ev => ({
              id: `evt-${ev.seq}`,
              event_seq: ev.seq,
              event_type: ev.type,
              privacy_policy_version: spec.privacyVersion,
              privacy_policy_hash: spec.privacyHash,
              event_source: args.p_event_source,
              explicit_user_action: true,
              occurred_at: ev.seq === 1 ? '2026-11-18T10:00:00Z' : '2026-11-19T11:00:00Z'
            })),
            history: []
          },
          error: null
        };
      }
      if (fnName === 'get_my_whatsapp_consent_history') {
        return {
          data: recordedEvents
            .slice()
            .reverse()
            .map(ev => ({
              id: `evt-${ev.seq}`,
              event_seq: ev.seq,
              consent_scope: 'commercial_whatsapp_communications',
              event_type: ev.type,
              privacy_policy_version: spec.privacyVersion,
              privacy_policy_hash: spec.privacyHash,
              event_source: 'settings_privacy_panel',
              explicit_user_action: true,
              occurred_at: ev.seq === 1 ? '2026-11-18T10:00:00Z' : '2026-11-19T11:00:00Z'
            })),
          error: null
        };
      }
      return { data: null, error: null };
    });

    const revokeRes = await setOptionalWhatsappConsent({
      expectedUserId: USER_A,
      action: 'revoke',
      eventSource: 'settings_privacy_panel'
    });
    expect(revokeRes.success).toBe(true);
    expect(revokeRes.state?.optionalWhatsappConsentActive).toBe(false);
    expect(revokeRes.state?.optionalWhatsappConsentStatus).toBe('revoked');

    const waHistRes = await fetchMyWhatsappConsentHistory(USER_A);
    expect(waHistRes.success).toBe(true);
    expect(waHistRes.items.map(i => i.eventType)).toEqual(['revoked', 'granted']);

    // 10D: Na UI (LegalConsentGate durante reaceite com WhatsApp já ativo):
    // botão explícito de revogação funciona sem submeter Termos, e reaceite sem clicar revogar envia 'unchanged'
    const activeWaOutdatedState = evaluateLegalConsentPayload(
      {
        user_id: USER_A,
        is_existing_user: false,
        has_any_prior_acceptance: true,
        terms_accepted: false,
        privacy_acknowledged: false,
        active_terms_version: spec.termsVersion,
        active_terms_hash: spec.termsHash,
        active_privacy_version: spec.privacyVersion,
        active_privacy_hash: spec.privacyHash,
        accepted_terms_version: '0.9.0',
        acknowledged_privacy_version: '0.9.0',
        optional_whatsapp_consent_active: true,
        optional_whatsapp_consent_status: 'granted',
        whatsapp_consent_history: [
          {
            id: 'evt-1',
            event_seq: 1,
            event_type: 'granted',
            privacy_policy_version: '0.9.0',
            privacy_policy_hash: spec.privacyHash,
            event_source: 'legal_consent_gate',
            explicit_user_action: true,
            occurred_at: '2026-10-01T10:00:00Z'
          }
        ],
        history: []
      },
      USER_A
    );

    currentWaStatus = 'granted';
    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <LegalConsentGate
            key="wa-active-reaccept"
            userId={USER_A}
            initialConsentState={activeWaOutdatedState}
            onConsentCompleted={vi.fn()}
          />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="consent-optional-whatsapp-active-box"]')).not.toBeNull();
    const revokeBtn = container.querySelector(
      '[data-testid="consent-revoke-whatsapp-button"]'
    ) as HTMLButtonElement;
    expect(revokeBtn).not.toBeNull();

    await act(async () => {
      revokeBtn.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="consent-whatsapp-revoked-badge"]')).not.toBeNull();
  });

  it('11. [Fase 2.4.1 / Estático SQL + Serviço] Garante integridade de versão e hash (FK composta, trigger imutável e detecção estrita de divergência sem ON CONFLICT DO NOTHING)', () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/sql/06_legal_versions_and_consent_logs.sql');
    const sql = fs.readFileSync(sqlPath, 'utf8');
    const sqlClean = sql.replace(/--.*$/gm, '');

    // FK composta vinculando document_id + version + hash nas duas tabelas de registros
    expect(sqlClean).toContain(
      'CONSTRAINT uq_legal_document_versions_doc_ver_hash UNIQUE (document_id, version, content_sha256)'
    );
    expect(sqlClean).toContain(
      'FOREIGN KEY (document_id, document_version, document_hash)'
    );
    expect(sqlClean).toContain(
      'FOREIGN KEY (document_id, privacy_policy_version, privacy_policy_hash)'
    );

    // Versões publicadas protegidas contra alteração de conteúdo/hash/versão ou exclusão
    expect(sqlClean).toContain('CREATE OR REPLACE FUNCTION public.fn_protect_published_legal_document_versions()');
    expect(sqlClean).toContain('NEW.content_sha256 IS DISTINCT FROM OLD.content_sha256');
    expect(sqlClean).toContain('NEW.version IS DISTINCT FROM OLD.version');

    // Carga inicial identifica divergência de hash e aborta sem ignorar silenciosamente
    const seedSectionMatch = sqlClean.match(/FOR v_seed IN[\s\S]*?END LOOP;\s*END \$\$;/);
    expect(seedSectionMatch).not.toBeNull();
    const seedSection = seedSectionMatch![0];
    expect(seedSection).not.toContain('ON CONFLICT DO NOTHING');
    expect(seedSection).toContain('v_existing.content_sha256 IS DISTINCT FROM v_seed.content_sha256');
    expect(seedSection).toContain('RAISE EXCEPTION');

    // Serviço rejeita se hash ativo do servidor divergir do hash publicado no app
    const hashMismatchState = evaluateLegalConsentPayload(
      {
        user_id: USER_A,
        has_any_prior_acceptance: true,
        terms_accepted: true,
        privacy_acknowledged: true,
        active_terms_version: spec.termsVersion,
        active_terms_hash: 'f'.repeat(64),
        active_privacy_version: spec.privacyVersion,
        active_privacy_hash: spec.privacyHash,
        accepted_terms_version: spec.termsVersion,
        acknowledged_privacy_version: spec.privacyVersion,
        history: []
      },
      USER_A
    );
    expect(hashMismatchState.hasValidConsent).toBe(false);
    expect(hashMismatchState.needsTermsReacceptance).toBe(true);
  });

  it('12. [Fase 2.4.1 / Estático SQL + Simulado] Garante idempotência de aceites e serialização por usuário contra chamadas concorrentes', async () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/sql/06_legal_versions_and_consent_logs.sql');
    const sqlClean = fs
      .readFileSync(sqlPath, 'utf8')
      .replace(/--.*$/gm, '');

    expect(sqlClean).toContain("pg_advisory_xact_lock(hashtext('legal_consent:' || v_uid::TEXT))");
    expect(sqlClean).toContain(
      'ON CONFLICT (user_id, document_id, document_version, acceptance_kind) DO NOTHING'
    );

    // Simulação de chamadas paralelas concorrentes idempotentes no cliente
    rpcMock.mockImplementation(async () => ({
      data: {
        user_id: USER_A,
        is_existing_user: false,
        has_any_prior_acceptance: true,
        terms_accepted: true,
        privacy_acknowledged: true,
        active_terms_version: spec.termsVersion,
        active_terms_hash: spec.termsHash,
        active_privacy_version: spec.privacyVersion,
        active_privacy_hash: spec.privacyHash,
        accepted_terms_version: spec.termsVersion,
        acknowledged_privacy_version: spec.privacyVersion,
        optional_whatsapp_consent_active: true,
        optional_whatsapp_consent_status: 'granted',
        whatsapp_consent_history: [],
        history: []
      },
      error: null
    }));

    const [r1, r2] = await Promise.all([
      recordUserLegalConsent({
        expectedUserId: USER_A,
        acceptContractualTerms: true,
        acknowledgePrivacyPolicy: true,
        optionalWhatsappDecision: 'grant'
      }),
      recordUserLegalConsent({
        expectedUserId: USER_A,
        acceptContractualTerms: true,
        acknowledgePrivacyPolicy: true,
        optionalWhatsappDecision: 'grant'
      })
    ]);

    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);
    expect(r1.state?.hasValidConsent).toBe(true);
    expect(r2.state?.hasValidConsent).toBe(true);
  });

  it('13. [Fase 2.4.1 / Estático SQL + Simulado] Bloqueia acesso cruzado, garante search_path seguro, auth.uid() exclusivo e REVOKE/GRANT estritos nas RPCs SECURITY DEFINER', async () => {
    // 13A: Sessão USER_B tentando executar setOptionalWhatsappConsent ou histórico para USER_A falha fechado
    getSessionMock.mockResolvedValue({
      data: { session: { user: { id: USER_B, email: 'b@exemplo.com' } } },
      error: null
    });

    const crossWa = await setOptionalWhatsappConsent({
      expectedUserId: USER_A,
      action: 'revoke'
    });
    expect(crossWa.success).toBe(false);

    const crossHist = await fetchMyWhatsappConsentHistory(USER_A);
    expect(crossHist.success).toBe(false);
    expect(crossHist.items).toEqual([]);
    expect(rpcMock).not.toHaveBeenCalled();

    // 13B: Auditoria estática de todas as RPCs SECURITY DEFINER no Script 06
    const sqlPath = path.resolve(process.cwd(), 'supabase/sql/06_legal_versions_and_consent_logs.sql');
    const sqlClean = fs
      .readFileSync(sqlPath, 'utf8')
      .replace(/--.*$/gm, '');

    const rpcNames = [
      'get_my_legal_consent_status()',
      'record_legal_consent(TEXT, TEXT, TEXT, TEXT, BOOLEAN, BOOLEAN, TEXT, TEXT)',
      'set_my_optional_whatsapp_consent(TEXT, TEXT)',
      'get_my_legal_acceptance_history()',
      'get_my_whatsapp_consent_history()'
    ];

    for (const sig of rpcNames) {
      expect(sqlClean).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM PUBLIC`);
      expect(sqlClean).toContain(`REVOKE ALL ON FUNCTION public.${sig} FROM anon`);
      expect(sqlClean).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated`);
    }

    expect(sqlClean).not.toMatch(/p_user_id|p_target_user_id/i);
    expect(sqlClean).toContain('SET search_path = public, auth, pg_temp');
    expect(sqlClean).toContain('USING ((SELECT auth.uid()) = user_id)');
  });

  it('14. [Fase 2.4.1 / Estático SQL] Verifica regras do trigger de retenção e compatibilidade de ON DELETE CASCADE (execução real depende de PostgreSQL)', () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/sql/06_legal_versions_and_consent_logs.sql');
    const sqlClean = fs
      .readFileSync(sqlPath, 'utf8')
      .replace(/--.*$/gm, '');

    expect(sqlClean).toContain('CREATE OR REPLACE FUNCTION public.fn_prevent_legal_acceptance_mutation()');
    expect(sqlClean).toContain('REFERENCES auth.users(id) ON DELETE CASCADE');
    // Bloqueia sempre sessões authenticated/anon
    expect(sqlClean).toContain("IF v_caller_uid IS NOT NULL OR v_jwt_role IN ('authenticated', 'anon')");
    // Bloqueia exclusão administrativa direta enquanto a conta existir
    expect(sqlClean).toContain('IF EXISTS (SELECT 1 FROM auth.users u WHERE u.id = OLD.user_id)');
    // Bloqueia exclusão se houver obrigação de conservação por histórico comercial
    expect(sqlClean).toContain("to_regclass('public.commercial_payments')");
    expect(sqlClean).toContain('IF v_has_commercial_payments THEN');
    // Permite conclusão da cascata legítima quando auth.users já foi removida e não há impedimento comercial
    expect(sqlClean).toContain('RETURN OLD;');
  });

  it('15. [Fase 2.6 / Estático SQL] Garante que record_legal_consent e set_my_optional_whatsapp_consent tratam lgpd_whatsapp_consent prévio na revogação', () => {
    const sqlPath = path.resolve(process.cwd(), 'supabase/sql/06_legal_versions_and_consent_logs.sql');
    const sqlClean = fs
      .readFileSync(sqlPath, 'utf8')
      .replace(/--.*$/gm, '');

    const recordFnMatch = sqlClean.match(
      /CREATE OR REPLACE FUNCTION public\.record_legal_consent[\s\S]*?REVOKE ALL ON FUNCTION public\.record_legal_consent/
    );
    expect(recordFnMatch).not.toBeNull();
    const recordFnBody = recordFnMatch?.[0] || '';
    expect(recordFnBody).toContain('v_has_prior_commercial_flag');
    expect(recordFnBody).toContain("to_regclass('public.customer_profiles')");
    expect(recordFnBody).toContain('v_has_legacy_wa_grant OR v_has_prior_commercial_flag');
  });
});
