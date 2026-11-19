/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import {
  LegalNavigationProvider,
  useLegalNavigation
} from './context/LegalNavigationContext';
import { LegalDocumentsView } from './components/legal/LegalDocumentsView';
import { LegalConsentGate } from './components/legal/LegalConsentGate';
import { LEGAL_CONSENT_GATE_ENABLED } from './legal/legalConfig';
import {
  fetchUserLegalConsentStatus,
  UserLegalConsentState
} from './services/legalConsentService';
import { AuthLockScreen } from './components/auth/AuthLockScreen';
import { SafeLogoutModal } from './components/auth/SafeLogoutModal';
import { SubscriptionGateScreen } from './components/auth/SubscriptionGateScreen';
import { AdminSubscriptionsPanel } from './components/settings/AdminSubscriptionsPanel';
import { MasterCommercialPortal } from './components/master/MasterCommercialPortal';
import { FinanceProvider, useFinance } from './context/FinanceContext';
import {
  clearPendingRegistrationIntent,
  fetchUserSubscriptionAccess,
  getPendingRegistrationIntent,
  PublicPlanType,
  submitCustomerAccessRequest,
  SubscriptionAccessState
} from './services/subscriptionService';
import { Sidebar } from './components/layout/Sidebar';
import { Header } from './components/layout/Header';
import { MobileNav } from './components/layout/MobileNav';
import { MobileDrawer } from './components/layout/MobileDrawer';
import { MobileModuleBar } from './components/layout/MobileModuleBar';
import { QuickEntryModal } from './components/quick-entry/QuickEntryModal';
import { DashboardView } from './components/dashboard/DashboardView';
import { TransactionsView } from './components/transactions/TransactionsView';
import { IncomesView } from './components/transactions/IncomesView';
import { ExpensesView } from './components/transactions/ExpensesView';
import { DebtsView } from './components/debts/DebtsView';
import { CardsView } from './components/cards/CardsView';
import { PowerOfPurchaseView } from './components/power-of-purchase/PowerOfPurchaseView';
import { AnalyticsView } from './components/analytics/AnalyticsView';
import { GoalsView } from './components/goals/GoalsView';
import { FinancialCalendarView } from './components/calendar/FinancialCalendarView';
import { ReportsView } from './components/reports/ReportsView';
import { SettingsView } from './components/settings/SettingsView';

type WorkspaceMode = 'finances' | 'master';

const SUBSCRIPTION_REVALIDATION_MIN_INTERVAL_MS = 60_000;

interface MainAppContentProps {
  subscriptionAccess?: SubscriptionAccessState;
  onRefreshSubscription?: () => Promise<void> | void;
  onOpenMasterPortal?: () => void;
}

const MainAppContent: React.FC<MainAppContentProps> = ({
  subscriptionAccess,
  onRefreshSubscription,
  onOpenMasterPortal
}) => {
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const { supabaseUserId, logout } = useAuth();
  const {
    isFinanceHydrating,
    isFinanceHydrated,
    hydratedUserId,
    hydrationError,
    retryCloudHydration
  } = useFinance();

  if (isFinanceHydrating || !isFinanceHydrated || hydratedUserId !== supabaseUserId) {
    if (hydrationError) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-slate-950 text-slate-200 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-4 shadow-xl">
            <h2 className="text-base font-bold text-white">Falha ao carregar os dados da conta</h2>
            <p className="text-xs text-slate-400 leading-relaxed">{hydrationError}</p>
            <div className="flex flex-col sm:flex-row gap-2 pt-2">
              <button
                type="button"
                onClick={retryCloudHydration}
                className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Tentar Novamente
              </button>
              <button
                type="button"
                onClick={() => logout()}
                className="flex-1 py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
              >
                Encerrar Sessão
              </button>
            </div>
          </div>
        </div>
      );
    }

    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 font-sans">
        <div className="w-10 h-10 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-white">Carregando dados exclusivos da sua conta...</p>
        <p className="text-xs text-slate-400 mt-1">Isolamento seguro por usuário autenticado</p>
      </div>
    );
  }

  const renderActiveView = () => {
    switch (currentTab) {
      case 'dashboard':
        return <DashboardView setCurrentTab={setCurrentTab} />;
      case 'transactions':
        return <TransactionsView />;
      case 'incomes':
        return <IncomesView />;
      case 'expenses':
        return <ExpensesView />;
      case 'debts':
        return <DebtsView />;
      case 'cards':
        return <CardsView />;
      case 'power-of-purchase':
        return <PowerOfPurchaseView />;
      case 'analytics':
        return <AnalyticsView />;
      case 'goals':
        return <GoalsView />;
      case 'calendar':
        return <FinancialCalendarView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return (
          <SettingsView
            subscriptionAccess={subscriptionAccess}
            onRefreshSubscription={onRefreshSubscription}
            onOpenMasterPortal={subscriptionAccess?.isAdmin ? onOpenMasterPortal : undefined}
          />
        );
      default:
        return <DashboardView setCurrentTab={setCurrentTab} />;
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-700 dark:selection:text-emerald-300">
      {/* Desktop Sidebar */}
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 lg:pb-8">
        {/* Sticky Header with Hamburger button on mobile */}
        <Header
          currentTab={currentTab}
          onOpenMobileMenu={() => setIsMobileMenuOpen(true)}
          isMasterAdmin={Boolean(subscriptionAccess?.isAdmin)}
          onOpenMasterPortal={subscriptionAccess?.isAdmin ? onOpenMasterPortal : undefined}
        />

        {/* Dedicated Horizontal Mobile Module Selector Ribbon */}
        <MobileModuleBar
          currentTab={currentTab}
          setCurrentTab={setCurrentTab}
        />

        <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8 animate-in fade-in duration-150">
          {renderActiveView()}
        </main>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <MobileNav
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
        openMobileMenu={() => setIsMobileMenuOpen(true)}
      />

      {/* Mobile Drawer Menu for full module list */}
      <MobileDrawer
        isOpen={isMobileMenuOpen}
        onClose={() => setIsMobileMenuOpen(false)}
        currentTab={currentTab}
        setCurrentTab={setCurrentTab}
      />

      {/* Global Quick Entry Modal (+ NOVO LANÇAMENTO) */}
      <QuickEntryModal />

      {/* Safe Logout Confirmation Modal */}
      <SafeLogoutModal />
    </div>
  );
};

interface AuthenticatedAppProps {
  enableLegalConsentGateOverride?: boolean;
}

const AuthenticatedApp: React.FC<AuthenticatedAppProps> = ({
  enableLegalConsentGateOverride
}) => {
  const isLegalConsentGateActive = Boolean(
    enableLegalConsentGateOverride ?? LEGAL_CONSENT_GATE_ENABLED
  );

  const {
    isSupabaseAuthenticated,
    isSessionLoading,
    isPasswordRecoveryMode,
    supabaseUser,
    supabaseUserId,
    supabaseUserEmail,
    supabaseUserDisplayName,
    logout
  } = useAuth();

  const [subscriptionAccess, setSubscriptionAccess] = useState<SubscriptionAccessState | null>(null);
  const [isCheckingSubscription, setIsCheckingSubscription] = useState<boolean>(false);
  const [legalConsentState, setLegalConsentState] = useState<UserLegalConsentState | null>(null);
  const [isCheckingLegalConsent, setIsCheckingLegalConsent] = useState<boolean>(false);
  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>('finances');
  const syncedRequestUsersRef = useRef<Set<string>>(new Set());
  const subscriptionEpochRef = useRef<number>(0);
  const isSubscriptionRequestInFlightRef = useRef<boolean>(false);
  const lastSubscriptionCheckAtRef = useRef<number | null>(null);
  const latestAuthRef = useRef({
    isSupabaseAuthenticated,
    supabaseUserId,
    isPasswordRecoveryMode
  });
  latestAuthRef.current = {
    isSupabaseAuthenticated,
    supabaseUserId,
    isPasswordRecoveryMode
  };

  const verifySubscription = useCallback(
    async (userId: string | null, options?: { background?: boolean }) => {
      const isBackground = Boolean(options?.background);

      if (!userId) {
        subscriptionEpochRef.current += 1;
        isSubscriptionRequestInFlightRef.current = false;
        lastSubscriptionCheckAtRef.current = null;
        setSubscriptionAccess(null);
        setIsCheckingSubscription(false);
        setWorkspaceMode('finances');
        return;
      }

      const authAtStart = latestAuthRef.current;
      if (
        !authAtStart.isSupabaseAuthenticated ||
        authAtStart.isPasswordRecoveryMode ||
        authAtStart.supabaseUserId !== userId
      ) {
        return;
      }

      if (isBackground && isSubscriptionRequestInFlightRef.current) {
        return;
      }

      const callEpoch = ++subscriptionEpochRef.current;
      isSubscriptionRequestInFlightRef.current = true;
      lastSubscriptionCheckAtRef.current = Date.now();
      if (!isBackground) {
        setIsCheckingSubscription(true);
      }

      try {
        const result = await fetchUserSubscriptionAccess(userId);
        const currentAuth = latestAuthRef.current;
        if (
          callEpoch !== subscriptionEpochRef.current ||
          !currentAuth.isSupabaseAuthenticated ||
          currentAuth.isPasswordRecoveryMode ||
          currentAuth.supabaseUserId !== userId
        ) {
          return;
        }

        if (isBackground && result.accessStatus === 'error') {
          setSubscriptionAccess(prev => {
            if (prev && prev.accessStatus !== 'error') {
              console.warn(
                '[Assinatura] Falha temporária na revalidação automática; estado anterior preservado.',
                result.errorCode || result.accessStatus
              );
              return prev;
            }
            return result;
          });
          return;
        }

        setSubscriptionAccess(result);
        if (!result.isAdmin) {
          setWorkspaceMode('finances');
        }
      } catch {
        const currentAuth = latestAuthRef.current;
        if (
          callEpoch !== subscriptionEpochRef.current ||
          !currentAuth.isSupabaseAuthenticated ||
          currentAuth.isPasswordRecoveryMode ||
          currentAuth.supabaseUserId !== userId
        ) {
          return;
        }

        if (isBackground) {
          setSubscriptionAccess(prev => {
            if (prev && prev.accessStatus !== 'error') {
              console.warn(
                '[Assinatura] Erro temporário de conexão na revalidação automática; estado anterior preservado.'
              );
              return prev;
            }
            return {
              accessStatus: 'error',
              hasAccess: false,
              isSchemaMissing: false,
              isAdmin: false,
              subscription: null,
              effectiveExpiresAt: null,
              daysRemaining: null,
              message: 'Não foi possível verificar o status da assinatura no momento.'
            };
          });
          return;
        }

        setSubscriptionAccess({
          accessStatus: 'error',
          hasAccess: false,
          isSchemaMissing: false,
          isAdmin: false,
          subscription: null,
          effectiveExpiresAt: null,
          daysRemaining: null,
          message: 'Não foi possível verificar o status da assinatura no momento.'
        });
        setWorkspaceMode('finances');
      } finally {
        if (callEpoch === subscriptionEpochRef.current) {
          isSubscriptionRequestInFlightRef.current = false;
          if (!isBackground) {
            setIsCheckingSubscription(false);
          }
        }
      }
    },
    []
  );

  useEffect(() => {
    if (!isSupabaseAuthenticated || !supabaseUserId || isPasswordRecoveryMode) {
      subscriptionEpochRef.current += 1;
      isSubscriptionRequestInFlightRef.current = false;
      lastSubscriptionCheckAtRef.current = null;
      setSubscriptionAccess(null);
      setIsCheckingSubscription(false);
      setWorkspaceMode('finances');
      return;
    }

    setSubscriptionAccess(null);
    setWorkspaceMode('finances');
    void verifySubscription(supabaseUserId);

    return () => {
      subscriptionEpochRef.current += 1;
      isSubscriptionRequestInFlightRef.current = false;
    };
  }, [isSupabaseAuthenticated, supabaseUserId, isPasswordRecoveryMode, verifySubscription]);

  useEffect(() => {
    if (
      typeof document === 'undefined' ||
      !isSupabaseAuthenticated ||
      !supabaseUserId ||
      isPasswordRecoveryMode
    ) {
      return;
    }

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') {
        return;
      }

      const currentAuth = latestAuthRef.current;
      if (
        !currentAuth.isSupabaseAuthenticated ||
        !currentAuth.supabaseUserId ||
        currentAuth.isPasswordRecoveryMode ||
        currentAuth.supabaseUserId !== supabaseUserId
      ) {
        return;
      }

      if (isSubscriptionRequestInFlightRef.current) {
        return;
      }

      const now = Date.now();
      const lastCheckAt = lastSubscriptionCheckAtRef.current;
      if (
        lastCheckAt !== null &&
        now >= lastCheckAt &&
        now - lastCheckAt < SUBSCRIPTION_REVALIDATION_MIN_INTERVAL_MS
      ) {
        return;
      }

      void verifySubscription(currentAuth.supabaseUserId, { background: true });
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [isSupabaseAuthenticated, supabaseUserId, isPasswordRecoveryMode, verifySubscription]);

  useEffect(() => {
    let active = true;
    if (
      !isLegalConsentGateActive ||
      !isSupabaseAuthenticated ||
      !supabaseUserId ||
      isPasswordRecoveryMode
    ) {
      setLegalConsentState(null);
      setIsCheckingLegalConsent(false);
      return;
    }

    setIsCheckingLegalConsent(true);
    fetchUserLegalConsentStatus(supabaseUserId)
      .then(result => {
        if (active) {
          setLegalConsentState(result);
          setIsCheckingLegalConsent(false);
        }
      })
      .catch(() => {
        if (active) {
          setLegalConsentState({
            mode: 'error',
            hasValidConsent: false,
            isSchemaMissing: false,
            isExistingUser: false,
            hasAnyPriorAcceptance: false,
            needsTermsReacceptance: false,
            needsPrivacyReacknowledgment: false,
            termsVersionCurrent: '',
            termsHashCurrent: '',
            privacyVersionCurrent: '',
            privacyHashCurrent: '',
            acceptedTermsVersion: null,
            acceptedTermsAt: null,
            acknowledgedPrivacyVersion: null,
            acknowledgedPrivacyAt: null,
            optionalWhatsappConsentActive: false,
            optionalWhatsappConsentStatus: 'not_set',
            optionalWhatsappConsentUpdatedAt: null,
            optionalWhatsappConsentAt: null,
            commercialProfileWhatsappConsent: null,
            legalRetentionNotice:
              'Registros de aceite jurídico permanecem conservados enquanto necessários por obrigação legal.',
            history: [],
            whatsappConsentHistory: [],
            message: 'Falha ao consultar o registro jurídico no servidor.'
          });
          setIsCheckingLegalConsent(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    isLegalConsentGateActive,
    isSupabaseAuthenticated,
    supabaseUserId,
    isPasswordRecoveryMode
  ]);

  // Sincroniza solicitação pendente após confirmação de e-mail / primeiro login autenticado
  useEffect(() => {
    if (
      !isSupabaseAuthenticated ||
      !supabaseUserId ||
      !subscriptionAccess ||
      subscriptionAccess.isSchemaMissing ||
      subscriptionAccess.accessStatus !== 'no_subscription' ||
      syncedRequestUsersRef.current.has(supabaseUserId)
    ) {
      return;
    }

    const pendingLocal = getPendingRegistrationIntent(supabaseUserEmail);
    const meta = supabaseUser?.user_metadata || {};
    const metaPlan: PublicPlanType | null =
      meta.requested_plan === 'annual' || meta.requested_plan === 'monthly'
        ? meta.requested_plan
        : null;
    const metaName = typeof meta.full_name === 'string' ? meta.full_name.trim() : '';
    const metaWhatsapp = typeof meta.whatsapp === 'string' ? meta.whatsapp.trim() : '';

    const fullName = pendingLocal?.fullName || metaName;
    const whatsapp = pendingLocal?.whatsapp || metaWhatsapp;
    const requestedPlan = pendingLocal?.requestedPlan || metaPlan;

    if (!fullName || !whatsapp || !requestedPlan) {
      return;
    }

    if (subscriptionAccess.commercialProfile?.requestId) {
      return;
    }

    syncedRequestUsersRef.current.add(supabaseUserId);
    let active = true;

    submitCustomerAccessRequest({
      fullName,
      whatsapp,
      requestedPlan,
      whatsappConsent: pendingLocal?.whatsappConsent ?? false
    }).then(res => {
      if (!active) return;
      if (res.success && supabaseUserEmail) {
        clearPendingRegistrationIntent(supabaseUserEmail);
        verifySubscription(supabaseUserId);
      }
    });

    return () => {
      active = false;
    };
  }, [
    isSupabaseAuthenticated,
    supabaseUserId,
    supabaseUserEmail,
    supabaseUser,
    subscriptionAccess,
    verifySubscription
  ]);

  // Limpa PII pendente de cadastro local assim que a assinatura já estiver liberada
  useEffect(() => {
    if (isSupabaseAuthenticated && subscriptionAccess?.hasAccess && supabaseUserEmail) {
      clearPendingRegistrationIntent(supabaseUserEmail);
    }
  }, [isSupabaseAuthenticated, subscriptionAccess?.hasAccess, supabaseUserEmail]);

  if (isSessionLoading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 font-sans">
        <div className="w-10 h-10 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-white">Verificando sessão segura...</p>
        <p className="text-xs text-slate-400 mt-1">Autenticação protegida via Supabase Auth</p>
      </div>
    );
  }

  if (!isSupabaseAuthenticated || !supabaseUserId || isPasswordRecoveryMode) {
    return <AuthLockScreen />;
  }

  if (isLegalConsentGateActive) {
    if (isCheckingLegalConsent || !legalConsentState) {
      return (
        <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 font-sans">
          <div className="w-10 h-10 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-4" />
          <p className="text-sm font-semibold text-white">Verificando aceite jurídico e privacidade...</p>
          <p className="text-xs text-slate-400 mt-1">Conferência segura vinculada à sua conta</p>
        </div>
      );
    }

    if (!legalConsentState.hasValidConsent) {
      return (
        <LegalConsentGate
          userId={supabaseUserId}
          userEmail={supabaseUserEmail}
          displayName={supabaseUserDisplayName}
          initialConsentState={legalConsentState}
          onConsentCompleted={updated => setLegalConsentState(updated)}
          onLogout={logout}
        />
      );
    }
  }

  if (isCheckingSubscription || !subscriptionAccess) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-200 font-sans">
        <div className="w-10 h-10 border-3 border-emerald-500/30 border-t-emerald-400 rounded-full animate-spin mb-4" />
        <p className="text-sm font-semibold text-white">Validando plano e assinatura da conta...</p>
        <p className="text-xs text-slate-400 mt-1">Verificação segura vinculada ao Supabase</p>
      </div>
    );
  }

  // Ambiente independente exclusivo do Master (Gestão Comercial) sem montar FinanceProvider
  if (workspaceMode === 'master' && subscriptionAccess.isAdmin) {
    return (
      <MasterCommercialPortal
        isAdmin={subscriptionAccess.isAdmin}
        adminEmail={supabaseUserEmail}
        hasPersonalFinanceAccess={
          subscriptionAccess.hasAccess || subscriptionAccess.isSchemaMissing
        }
        onSwitchToFinances={() => setWorkspaceMode('finances')}
        onLogout={logout}
        onSubscriptionUpdated={() => verifySubscription(supabaseUserId)}
      />
    );
  }

  // Bloqueio comercial quando public.user_subscriptions já existe e usuário não possui plano ativo
  if (!subscriptionAccess.hasAccess && !subscriptionAccess.isSchemaMissing) {
    return (
      <SubscriptionGateScreen
        userId={supabaseUserId}
        userEmail={supabaseUserEmail}
        displayName={supabaseUserDisplayName}
        accessState={subscriptionAccess}
        onRetryCheck={() => verifySubscription(supabaseUserId)}
        onLogout={logout}
        onOpenMasterPortal={
          subscriptionAccess.isAdmin ? () => setWorkspaceMode('master') : undefined
        }
        adminPanel={
          subscriptionAccess.isAdmin ? (
            <AdminSubscriptionsPanel
              isAdmin={subscriptionAccess.isAdmin}
              onSubscriptionUpdated={() => verifySubscription(supabaseUserId)}
              onOpenMasterPortal={() => setWorkspaceMode('master')}
            />
          ) : undefined
        }
      />
    );
  }

  return (
    <FinanceProvider key={supabaseUserId}>
      <MainAppContent
        subscriptionAccess={subscriptionAccess}
        onRefreshSubscription={() => verifySubscription(supabaseUserId)}
        onOpenMasterPortal={
          subscriptionAccess.isAdmin ? () => setWorkspaceMode('master') : undefined
        }
      />
    </FinanceProvider>
  );
};

export interface AppProps {
  enableLegalConsentGateOverride?: boolean;
}

const AppWithLegalRouting: React.FC<AppProps> = ({
  enableLegalConsentGateOverride
}) => {
  const { activeLegalDocument, openLegalDocument, closeLegalDocument } =
    useLegalNavigation();

  return (
    <>
      {activeLegalDocument && (
        <LegalDocumentsView
          documentId={activeLegalDocument}
          onSelectDocument={openLegalDocument}
          onClose={closeLegalDocument}
          backLabel="Voltar ao aplicativo"
        />
      )}
      <div
        className={activeLegalDocument ? 'hidden' : undefined}
        aria-hidden={activeLegalDocument ? true : undefined}
      >
        <AuthProvider>
          <AuthenticatedApp
            enableLegalConsentGateOverride={enableLegalConsentGateOverride}
          />
        </AuthProvider>
      </div>
    </>
  );
};

export default function App({ enableLegalConsentGateOverride }: AppProps = {}) {
  return (
    <LegalNavigationProvider>
      <AppWithLegalRouting
        enableLegalConsentGateOverride={enableLegalConsentGateOverride}
      />
    </LegalNavigationProvider>
  );
}
