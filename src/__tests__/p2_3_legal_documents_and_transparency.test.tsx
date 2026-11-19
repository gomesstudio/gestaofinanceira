// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const {
  getSessionMock,
  authStateListeners,
  financeCtxMock,
  mockAuthStateForUi
} = vi.hoisted(() => ({
  getSessionMock: vi.fn(),
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
    selectedMonth: 10,
    isFutureView: false,
    goToNextMonth: vi.fn(),
    goToPrevMonth: vi.fn(),
    goToCurrentMonth: vi.fn()
  },
  mockAuthStateForUi: {
    isSupabaseAuthenticated: false,
    isSessionLoading: false,
    isPasswordRecoveryMode: false,
    authUrlError: null as string | null,
    supabaseUser: null as any,
    supabaseUserId: null as string | null,
    supabaseUserEmail: null as string | null,
    supabaseUserDisplayName: 'Visitante',
    supabaseConnectionStatus: 'disconnected'
  }
}));

vi.mock('../utils/supabase', () => ({
  SUPABASE_PROJECT_URL: 'https://ficticio.supabase.co',
  isSupabaseConfigured: () => true,
  isValidUuid: (id: unknown) => typeof id === 'string' && id.length > 10,
  getSupabaseClient: () => ({
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
      signInWithPassword: vi.fn(async () => ({ data: {}, error: null })),
      signUp: vi.fn(async () => ({ data: {}, error: null })),
      signInWithOAuth: vi.fn(async () => ({ data: {}, error: null })),
      signInWithOtp: vi.fn(async () => ({ data: {}, error: null })),
      verifyOtp: vi.fn(async () => ({ data: {}, error: null })),
      resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
      updateUser: vi.fn(async () => ({ data: {}, error: null })),
      signOut: vi.fn(async () => ({ error: null }))
    },
    rpc: vi.fn(async () => ({ data: null, error: { code: '42883', message: 'not deployed' } })),
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null }))
        }))
      }))
    }))
  })
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
    AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useAuth: () => ({
      ...mockAuthStateForUi,
      clearAuthUrlError: vi.fn(),
      loginWithSupabase: vi.fn(async () => ({ success: true, message: 'ok' })),
      signUpWithSupabase: vi.fn(async () => ({ success: true, message: 'ok' })),
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
import {
  getLegalDocumentMeta,
  getLegalDocumentsVersionsSnapshot,
  LEGAL_CONTROLLER_INFO,
  LEGAL_DOCUMENTS_REGISTRY,
  resolveLegalDocumentFromLocation,
  VERIFIED_LOCAL_STORAGE_INVENTORY,
  VERIFIED_THIRD_PARTY_PROCESSORS
} from '../legal/legalConfig';
import { TERMS_OF_USE_CONTENT } from '../legal/termsOfUseContent';
import { PRIVACY_POLICY_CONTENT } from '../legal/privacyPolicyContent';
import { LegalNavigationProvider, useLegalNavigation } from '../context/LegalNavigationContext';
import { LegalDocumentsView } from '../components/legal/LegalDocumentsView';
import { SubscriptionGateScreen } from '../components/auth/SubscriptionGateScreen';
import { SettingsView } from '../components/settings/SettingsView';

async function flushEffects() {
  await act(async () => {
    await Promise.resolve();
    await new Promise(resolve => setTimeout(resolve, 15));
  });
}

describe('Fase 2.3 — Termos de Uso, Política de Privacidade e Transparência', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    localStorage.clear();
    sessionStorage.clear();
    document.documentElement.classList.remove('dark');
    window.history.replaceState(null, '', '/');

    getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
    mockAuthStateForUi.isSupabaseAuthenticated = false;
    mockAuthStateForUi.isSessionLoading = false;
    mockAuthStateForUi.isPasswordRecoveryMode = false;
    mockAuthStateForUi.supabaseUserId = null;
    mockAuthStateForUi.supabaseUserEmail = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
    vi.clearAllMocks();
  });

  it('1. Config jurídica centralizada não inventa CPF/CNPJ/e-mail e prepara metadados para a Fase 2.4 sem criar aceite automático', () => {
    expect(LEGAL_CONTROLLER_INFO.officialWhatsAppDisplay).toBe('+55 33 99103-1052');
    expect(LEGAL_CONTROLLER_INFO.legalHolderName).toBeNull();
    expect(LEGAL_CONTROLLER_INFO.taxIdCpfOrCnpj).toBeNull();
    expect(LEGAL_CONTROLLER_INFO.privacyEmail).toBeNull();
    expect(LEGAL_CONTROLLER_INFO.dpoName).toBeNull();
    expect(LEGAL_CONTROLLER_INFO.pendingFields.length).toBeGreaterThanOrEqual(4);

    const termsMeta = getLegalDocumentMeta('terms_of_use');
    const privacyMeta = getLegalDocumentMeta('privacy_policy');
    expect(termsMeta.version).toBe('1.0.0');
    expect(privacyMeta.version).toBe('1.0.0');
    expect(termsMeta.routePath).toBe('/termos');
    expect(privacyMeta.routePath).toBe('/privacidade');
    expect(termsMeta.requiresConsentTrackingInFuturePhase).toBe(true);
    expect(privacyMeta.requiresConsentTrackingInFuturePhase).toBe(true);

    const snapshot = getLegalDocumentsVersionsSnapshot();
    expect(snapshot).toEqual({
      terms_of_use: '1.0.0',
      privacy_policy: '1.0.0',
      capturedMetadataOnly: true
    });
    expect(localStorage.length).toBe(0);
  });

  it('2. Resolução de rota pública reconhece /termos e /privacidade e ignora parâmetros sensíveis de autenticação OAuth/OTP', () => {
    expect(resolveLegalDocumentFromLocation('/termos', '', '')).toBe('terms_of_use');
    expect(resolveLegalDocumentFromLocation('/privacidade', '', '')).toBe('privacy_policy');
    expect(resolveLegalDocumentFromLocation('/', '#/termos', '')).toBe('terms_of_use');
    expect(resolveLegalDocumentFromLocation('/', '#/privacidade', '')).toBe('privacy_policy');
    expect(resolveLegalDocumentFromLocation('/', '', '?legal=privacy')).toBe('privacy_policy');

    // Nunca interceptar callbacks do Supabase Auth
    expect(resolveLegalDocumentFromLocation('/termos', '', '?code=oauth_123')).toBeNull();
    expect(
      resolveLegalDocumentFromLocation('/', '#access_token=abc&type=recovery', '')
    ).toBeNull();
  });

  it('3. Termos de Uso e Política de Privacidade refletem fielmente os fluxos verificados e limitações honestas (sem promessas irreais)', () => {
    const termsText = JSON.stringify(TERMS_OF_USE_CONTENT).toLowerCase();
    expect(termsText).toContain('não é banco');
    expect(termsText).toContain('mensal');
    expect(termsText).toContain('anual');
    expect(termsText).toContain('json');
    expect(termsText).toContain('+55 33 99103-1052');

    const privacyText = JSON.stringify(PRIVACY_POLICY_CONTENT).toLowerCase();
    // Dados & bases legais reais
    expect(privacyText).toContain('supabase');
    expect(privacyText).toContain('cloudflare');
    expect(privacyText).toContain('github');
    expect(privacyText).toContain('whatsapp');
    expect(privacyText).toContain('localstorage');
    expect(privacyText).toContain('indexeddb');
    expect(privacyText).toContain('sessionstorage');
    expect(privacyText).toContain('não sendo utilizado o aceite de termos de uso como consentimento genérico');

    // Honesty rules obrigatórias (sem promessas falsas)
    expect(privacyText).toContain('não contam com criptografia de ponta a ponta');
    expect(privacyText).toContain('administradores com acesso privilegiado');
    expect(privacyText).toContain('não existe botão automatizado de autoexclusão');
    expect(privacyText).toContain('não sendo possível garantir remoção instantânea');

    // Não inventa uso de IA em runtime
    expect(VERIFIED_THIRD_PARTY_PROCESSORS.some(p => p.id.includes('gemini'))).toBe(false);
    expect(VERIFIED_LOCAL_STORAGE_INVENTORY.some(i => i.mechanism === 'IndexedDB')).toBe(true);
  });

  it('4. Rota pública /termos é acessível sem autenticação e permite alternar para Política de Privacidade e voltar ao login', async () => {
    window.history.replaceState(null, '', '/termos');

    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="legal-documents-view"]')).not.toBeNull();
    expect(container.textContent).toContain('Termos de Uso');
    expect(container.textContent).toContain('Versão v1.0.0');
    expect(container.textContent).toContain('Esclarecimento Essencial: Não Somos Instituição Financeira');

    // Alternar para Política de Privacidade
    const privacyTabBtn = Array.from(container.querySelectorAll('button')).find(btn =>
      btn.textContent?.includes('Política de Privacidade')
    );
    expect(privacyTabBtn).toBeTruthy();

    await act(async () => {
      privacyTabBtn!.click();
    });
    await flushEffects();

    expect(container.textContent).toContain('Política de Privacidade e Proteção de Dados (LGPD)');
    expect(container.textContent).toContain('Quadro Resumido de Serviços Externos Verificados');

    // Voltar para tela pública de login sem exigir sessão e sem gravar consentimento falso
    const backBtn = container.querySelector(
      '[data-testid="legal-back-button"]'
    ) as HTMLButtonElement;
    expect(backBtn).not.toBeNull();

    await act(async () => {
      backBtn.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="legal-documents-view"]')).toBeNull();
    expect(container.textContent).toContain('Gestão Financeira Pro');
    expect(container.querySelector('[data-testid="auth-terms-link"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="auth-privacy-link"]')).not.toBeNull();
    expect(localStorage.length).toBe(0);
  });

  it('5. Links na tela de Login/Cadastro e na SubscriptionGateScreen abrem os documentos legais sem bloquear acesso ou exigir autenticação', async () => {
    await act(async () => {
      root.render(<App />);
    });
    await flushEffects();

    const authPrivacyLink = container.querySelector(
      '[data-testid="auth-privacy-link"]'
    ) as HTMLAnchorElement;
    expect(authPrivacyLink).not.toBeNull();
    expect(authPrivacyLink.getAttribute('href')).toBe('/privacidade');

    await act(async () => {
      authPrivacyLink.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="legal-documents-view"]')).not.toBeNull();
    expect(container.textContent).toContain('Segurança da Informação e Limitações Técnicas Reais');

    // Verifica também SubscriptionGateScreen com usuário bloqueado
    const HarnessGate: React.FC = () => {
      const { activeLegalDocument, openLegalDocument, closeLegalDocument } = useLegalNavigation();
      return activeLegalDocument ? (
        <LegalDocumentsView
          documentId={activeLegalDocument}
          onSelectDocument={openLegalDocument}
          onClose={closeLegalDocument}
        />
      ) : (
        <SubscriptionGateScreen
          userId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
          userEmail="cliente@exemplo.com"
          displayName="Cliente Teste"
          accessState={{
            accessStatus: 'expired',
            hasAccess: false,
            isSchemaMissing: false,
            isAdmin: false,
            subscription: null,
            effectiveExpiresAt: '2026-10-01T00:00:00.000Z',
            daysRemaining: 0,
            message: 'Assinatura expirada.'
          }}
          onRetryCheck={vi.fn()}
          onLogout={vi.fn()}
        />
      );
    };

    window.history.replaceState(null, '', '/');
    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <HarnessGate />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const gateTermsLink = container.querySelector(
      '[data-testid="gate-terms-link"]'
    ) as HTMLButtonElement;
    expect(gateTermsLink).not.toBeNull();

    await act(async () => {
      gateTermsLink.click();
    });
    await flushEffects();

    expect(container.querySelector('[data-testid="legal-documents-view"]')).not.toBeNull();
    expect(container.textContent).toContain('Planos, Assinaturas e Condições de Acesso');
  });

  it('6. SettingsView exibe seção Documentos Legais com versões/datas e LegalDocumentsView alterna entre temas claro e escuro', async () => {
    mockAuthStateForUi.isSupabaseAuthenticated = true;
    mockAuthStateForUi.supabaseUserId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    mockAuthStateForUi.supabaseUserEmail = 'usuario@exemplo.com';
    mockAuthStateForUi.supabaseUserDisplayName = 'Usuário Teste';

    const HarnessSettings: React.FC = () => {
      const { activeLegalDocument, openLegalDocument, closeLegalDocument } = useLegalNavigation();
      return activeLegalDocument ? (
        <LegalDocumentsView
          documentId={activeLegalDocument}
          onSelectDocument={openLegalDocument}
          onClose={closeLegalDocument}
        />
      ) : (
        <SettingsView />
      );
    };

    await act(async () => {
      root.render(
        <LegalNavigationProvider>
          <HarnessSettings />
        </LegalNavigationProvider>
      );
    });
    await flushEffects();

    const legalCard = container.querySelector('[data-testid="settings-legal-documents-card"]');
    expect(legalCard).not.toBeNull();
    expect(legalCard?.textContent).toContain('Documentos Legais, Privacidade & Transparência (LGPD)');
    expect(legalCard?.textContent).toContain(
      `Versão v${LEGAL_DOCUMENTS_REGISTRY.terms_of_use.version}`
    );
    expect(legalCard?.textContent).toContain(LEGAL_DOCUMENTS_REGISTRY.privacy_policy.updatedAtBr);

    const settingsPrivacyLink = container.querySelector(
      '[data-testid="settings-privacy-link"]'
    ) as HTMLAnchorElement;
    await act(async () => {
      settingsPrivacyLink.click();
    });
    await flushEffects();

    const viewEl = container.querySelector('[data-testid="legal-documents-view"]');
    expect(viewEl).not.toBeNull();
    expect(viewEl?.getAttribute('data-legal-theme')).toBe('light');

    const toggleThemeBtn = container.querySelector(
      'button[aria-label*="Ativar tema"]'
    ) as HTMLButtonElement;
    expect(toggleThemeBtn).not.toBeNull();

    await act(async () => {
      toggleThemeBtn.click();
    });
    await flushEffects();

    expect(viewEl?.getAttribute('data-legal-theme')).toBe('dark');
  });
});
