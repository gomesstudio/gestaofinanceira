// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  AppState,
  DEFAULT_CATEGORIES,
  getUserStateFromStorage,
  saveStateToStorageForUser
} from '../utils/storage';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const {
  USER_A,
  USER_B,
  ADMIN_USER,
  authStateRef,
  getSessionMock,
  signInWithPasswordMock,
  signUpMock,
  onAuthStateChangeMock,
  subscriptionSingleMock,
  financeSingleMock,
  financeUpsertMock,
  financeLimitMock,
  rpcMock
} = vi.hoisted(() => {
  const userA = '11111111-1111-4111-8111-111111111111';
  const userB = '22222222-2222-4222-8222-222222222222';
  const adminUser = '99999999-9999-4999-8999-999999999999';

  return {
    USER_A: userA,
    USER_B: userB,
    ADMIN_USER: adminUser,
    authStateRef: {
      current: {
        authenticated: false,
        userId: null as string | null,
        email: null as string | null,
        displayName: 'Conta',
        userMetadata: {} as Record<string, unknown>
      }
    },
    getSessionMock: vi.fn(),
    signInWithPasswordMock: vi.fn(),
    signUpMock: vi.fn(),
    onAuthStateChangeMock: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    subscriptionSingleMock: vi.fn(),
    financeSingleMock: vi.fn(),
    financeUpsertMock: vi.fn(),
    financeLimitMock: vi.fn(),
    rpcMock: vi.fn()
  };
});

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: vi.fn(),
      signInWithPassword: signInWithPasswordMock,
      signUp: signUpMock,
      signInWithOAuth: vi.fn(),
      signInWithOtp: vi.fn(),
      verifyOtp: vi.fn(),
      resetPasswordForEmail: vi.fn(),
      updateUser: vi.fn(),
      onAuthStateChange: onAuthStateChangeMock,
      signOut: vi.fn().mockResolvedValue({ error: null })
    },
    from: vi.fn((tableName: string) => {
      if (tableName === 'user_subscriptions') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, targetUserId: string) => ({
              maybeSingle: () => subscriptionSingleMock(targetUserId)
            }))
          })),
          upsert: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'row-level security policy violation' }
          })
        };
      }

      if (
        tableName === 'access_requests' ||
        tableName === 'commercial_payments' ||
        tableName === 'commercial_audit_logs'
      ) {
        return {
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: { code: '42501', message: 'permission denied' }
            })
          })),
          insert: vi.fn().mockResolvedValue({
            data: null,
            error: { code: '42501', message: 'permission denied' }
          })
        };
      }

      return {
        select: vi.fn(() => ({
          eq: vi.fn((_col: string, targetUserId: string) => ({
            maybeSingle: () => financeSingleMock(targetUserId)
          })),
          limit: financeLimitMock
        })),
        upsert: financeUpsertMock
      };
    }),
    rpc: rpcMock
  },
  SUPABASE_PROJECT_URL: 'https://ficticio.supabase.co'
}));

import {
  buildPostSignupWhatsAppMessage,
  buildPostSignupWhatsAppUrl,
  CommercialPaymentRecord,
  computeRevenueSummary,
  evaluateSubscriptionRecord,
  fetchCommercialPayments,
  fetchMasterDashboardMetrics,
  getPendingRegistrationIntent,
  recordCommercialPayment,
  submitCustomerAccessRequest
} from '../services/subscriptionService';
import { AuthProvider } from '../context/AuthContext';
import { AuthLockScreen } from '../components/auth/AuthLockScreen';
import { MasterCommercialPortal } from '../components/master/MasterCommercialPortal';
import App from '../App';

function makeMockStorage() {
  let store: Record<string, string> = {};
  return {
    getItem: (key: string) => (key in store ? store[key] : null),
    setItem: (key: string, value: string) => {
      store[key] = String(value);
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
    key: (index: number) => Object.keys(store)[index] ?? null,
    get length() {
      return Object.keys(store).length;
    }
  };
}

function createFixtureAppState(userId: string, version: number, label: string, amount: number): AppState {
  return {
    ownerUserId: userId,
    version,
    lastModified: 1700000000000 + version * 1000,
    transactions: [
      {
        id: `tx-${userId.slice(0, 4)}-${version}`,
        description: label,
        amount,
        type: 'income',
        category: 'Salário',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      }
    ],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Pessoal',
        type: 'checking',
        balance: amount,
        color: '#10b981'
      }
    ],
    creditCards: [],
    debts: [],
    goals: [],
    safetyReserveDesired: 1000,
    isSampleLoaded: false
  };
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  nativeSetter?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

describe('Etapa C3 — Cadastro com Aprovação, WhatsApp, Painel Master, Vitalício Especial e Faturamento (100% mocks)', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    const localMock = makeMockStorage();
    const sessionMock = makeMockStorage();
    Object.defineProperty(window, 'localStorage', { value: localMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'localStorage', { value: localMock, writable: true, configurable: true });
    Object.defineProperty(window, 'sessionStorage', { value: sessionMock, writable: true, configurable: true });
    Object.defineProperty(globalThis, 'sessionStorage', { value: sessionMock, writable: true, configurable: true });

    authStateRef.current = {
      authenticated: false,
      userId: null,
      email: null,
      displayName: 'Conta',
      userMetadata: {}
    };

    getSessionMock.mockImplementation(async () => ({
      data: {
        session:
          authStateRef.current.authenticated && authStateRef.current.userId
            ? {
                user: {
                  id: authStateRef.current.userId,
                  email: authStateRef.current.email,
                  user_metadata: {
                    full_name: authStateRef.current.displayName,
                    ...authStateRef.current.userMetadata
                  }
                },
                expires_at: Math.floor(Date.now() / 1000) + 3600
              }
            : null
      },
      error: null
    }));

    financeLimitMock.mockResolvedValue({ data: [], error: null });
    financeUpsertMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'check_is_subscription_admin') {
        return { data: authStateRef.current.userId === ADMIN_USER, error: null };
      }
      if (fnName === 'get_my_commercial_status') {
        return { data: null, error: null };
      }
      return {
        data: null,
        error: { code: '42501', message: 'Acesso negado: privilégio administrativo obrigatório.' }
      };
    });

    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('1. Login de usuário existente continua funcionando e carrega finanças exclusivas da conta', async () => {
    const stateA = createFixtureAppState(USER_A, 3, 'Salário Mensal A', 4500);
    saveStateToStorageForUser(USER_A, stateA);

    authStateRef.current = {
      authenticated: true,
      userId: USER_A,
      email: 'cliente-a@ficticio.com',
      displayName: 'Cliente A',
      userMetadata: {}
    };

    subscriptionSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        plan_type: 'monthly',
        status: 'active',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: new Date(Date.now() + 20 * 24 * 60 * 60 * 1000).toISOString()
      },
      error: null
    });

    financeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: stateA,
        version: 3,
        client_timestamp: stateA.lastModified,
        updated_at: '2026-11-17T00:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(<App />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Dashboard Principal');
    // Usuário comum jamais vê botão do Painel Master
    expect(container.textContent).not.toContain('Gestão Comercial');
  });

  it('2. Cadastro de novo cliente exige apenas Mensal/Anual (sem preços e sem Vitalício), gera WhatsApp com encodeURIComponent e guarda consentimento', async () => {
    signUpMock.mockResolvedValueOnce({
      data: {
        user: { id: USER_B, email: 'novo-cliente@ficticio.com' },
        session: null // confirmação de e-mail ativa no Supabase
      },
      error: null
    });

    await act(async () => {
      root.render(
        <AuthProvider>
          <AuthLockScreen />
        </AuthProvider>
      );
    });
    await flushMicrotasks();

    // Alterna para aba Criar Conta
    const createTabBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Criar Conta')
    ) as HTMLButtonElement;
    expect(createTabBtn).toBeDefined();

    await act(async () => {
      createTabBtn.click();
    });

    const signupText = container.textContent || '';
    expect(signupText).toContain('Mensal');
    expect(signupText).toContain('30 dias');
    expect(signupText).toContain('Anual');
    expect(signupText).toContain('12 meses');
    expect(signupText.toLowerCase()).not.toContain('vitalício');
    expect(signupText).not.toMatch(/R\$\s*\d+/i);

    const nameInput = container.querySelector('input[placeholder="Seu nome completo"]') as HTMLInputElement;
    const whatsappInput = container.querySelector('input[placeholder="(33) 99999-9999"]') as HTMLInputElement;
    const emailInput = container.querySelector('input[placeholder="seu@email.com"]') as HTMLInputElement;
    const passInput = container.querySelector('input[placeholder="Mín. 6 chars"]') as HTMLInputElement;
    const confirmInput = container.querySelector('input[placeholder="Repita a senha"]') as HTMLInputElement;

    const annualBtn = Array.from(container.querySelectorAll('button')).find(
      b => b.textContent?.includes('Anual') && b.textContent?.includes('12 meses')
    ) as HTMLButtonElement;

    await act(async () => {
      setInputValue(nameInput, 'Maria Fictícia');
      setInputValue(whatsappInput, '(33) 99999-1234');
      setInputValue(emailInput, 'novo-cliente@ficticio.com');
      setInputValue(passInput, 'SenhaForte123');
      setInputValue(confirmInput, 'SenhaForte123');
      annualBtn.click();
    });

    const form = container.querySelector('form') as HTMLFormElement;
    await act(async () => {
      form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await flushMicrotasks();

    expect(signUpMock).toHaveBeenCalledTimes(1);
    const signUpArgs = signUpMock.mock.calls[0][0];
    expect(signUpArgs.email).toBe('novo-cliente@ficticio.com');
    expect(signUpArgs.options.data.full_name).toBe('Maria Fictícia');
    expect(signUpArgs.options.data.whatsapp).toBe('(33) 99999-1234');
    expect(signUpArgs.options.data.requested_plan).toBe('annual');

    // Tela de confirmação pós-cadastro
    const confirmedText = container.textContent || '';
    expect(confirmedText).toContain('Cadastro realizado com sucesso!');
    expect(confirmedText).toContain('aguardando liberação');
    expect(confirmedText).toContain('WhatsApp');

    // Consentimento LGPD bloqueia link direto antes de marcar checkbox
    expect(
      Array.from(container.querySelectorAll('a')).find(a =>
        a.textContent?.includes('CONCLUIR CONTRATAÇÃO PELO WHATSAPP')
      )
    ).toBeUndefined();

    const consentCheckbox = container.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(consentCheckbox).toBeDefined();

    await act(async () => {
      consentCheckbox.click();
    });

    const waAnchor = Array.from(container.querySelectorAll('a')).find(a =>
      a.textContent?.includes('CONCLUIR CONTRATAÇÃO PELO WHATSAPP')
    ) as HTMLAnchorElement;
    expect(waAnchor).toBeDefined();
    expect(waAnchor.getAttribute('target')).toBe('_blank');
    expect(waAnchor.getAttribute('rel')).toBe('noopener noreferrer');

    const expectedUrl = buildPostSignupWhatsAppUrl({
      fullName: 'Maria Fictícia',
      whatsapp: '(33) 99999-1234',
      email: 'novo-cliente@ficticio.com',
      requestedPlan: 'annual'
    });
    expect(waAnchor.getAttribute('href')).toBe(expectedUrl);

    const decodedMsg = decodeURIComponent(expectedUrl.split('?text=')[1]);
    expect(decodedMsg).toBe(
      buildPostSignupWhatsAppMessage({
        fullName: 'Maria Fictícia',
        whatsapp: '(33) 99999-1234',
        email: 'novo-cliente@ficticio.com',
        requestedPlan: 'annual'
      })
    );
    expect(decodedMsg).not.toContain('SenhaForte123');
    expect(decodedMsg).toContain('Plano solicitado: ANUAL');

    // Solicitação local preservada mesmo com confirmação de e-mail pendente
    const savedIntent = getPendingRegistrationIntent('novo-cliente@ficticio.com');
    expect(savedIntent?.requestedPlan).toBe('annual');
    expect(savedIntent?.requiresEmailConfirmation).toBe(true);
  });

  it('3. Primeiro login após confirmação de e-mail sincroniza solicitação pendente no banco sem ativar assinatura automaticamente', async () => {
    authStateRef.current = {
      authenticated: true,
      userId: USER_B,
      email: 'pendente-b@ficticio.com',
      displayName: 'Cliente Pendente B',
      userMetadata: {
        full_name: 'Cliente Pendente B',
        whatsapp: '33988887777',
        requested_plan: 'monthly'
      }
    };

    let requestPersisted = false;
    subscriptionSingleMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockImplementation(async (fnName: string, args?: any) => {
      if (fnName === 'check_is_subscription_admin') return { data: false, error: null };
      if (fnName === 'submit_access_request') {
        requestPersisted = true;
        expect(args.p_requested_plan).toBe('monthly');
        return { data: { id: 'req-1', request_status: 'pending' }, error: null };
      }
      if (fnName === 'get_my_commercial_status') {
        return {
          data: requestPersisted
            ? {
                full_name: 'Cliente Pendente B',
                whatsapp: '33988887777',
                lgpd_whatsapp_consent: false,
                request_id: 'req-1',
                requested_plan: 'monthly',
                request_status: 'pending',
                request_created_at: '2026-11-17T00:00:00.000Z'
              }
            : null,
          error: null
        };
      }
      return { data: null, error: null };
    });

    await act(async () => {
      root.render(<App />);
    });
    await flushMicrotasks(12);

    expect(rpcMock).toHaveBeenCalledWith(
      'submit_access_request',
      expect.objectContaining({
        p_full_name: 'Cliente Pendente B',
        p_whatsapp: '33988887777',
        p_requested_plan: 'monthly'
      })
    );
    expect(container.textContent).toContain('Aguardando Liberação');
    expect(container.textContent).not.toContain('Dashboard Principal');
  });

  it('4. Cliente comum não consegue solicitar Vitalício Especial nem acessar faturamento ou métricas do Master (42501)', async () => {
    const reqRes = await submitCustomerAccessRequest({
      fullName: 'Cliente Malicioso',
      whatsapp: '33999990000',
      requestedPlan: 'lifetime' as any,
      whatsappConsent: true
    });
    expect(reqRes.success).toBe(false);
    expect(reqRes.message).toContain('Apenas os planos Mensal e Anual');

    const metricsRes = await fetchMasterDashboardMetrics();
    expect(metricsRes.success).toBe(false);
    expect(metricsRes.code).toBe('42501');

    const paymentsRes = await fetchCommercialPayments();
    expect(paymentsRes.success).toBe(false);
    expect(paymentsRes.code).toBe('42501');

    const recordRes = await recordCommercialPayment({
      customerUserId: USER_A,
      subscriptionPlan: 'monthly',
      amountCents: 4990,
      paymentDate: '2026-11-17',
      paymentMethod: 'pix',
      paymentStatus: 'confirmed'
    });
    expect(recordRes.success).toBe(false);
    expect(recordRes.code).toBe('42501');
  });

  it('5. Vitalício Especial concedido pelo Master libera acesso sem vencimento, mas suspensão e cancelamento bloqueiam', () => {
    const activeLifetime = evaluateSubscriptionRecord({
      userId: USER_A,
      planType: 'lifetime',
      status: 'active',
      startsAt: '2026-11-17T00:00:00.000Z',
      expiresAt: null
    });
    expect(activeLifetime.hasAccess).toBe(true);
    expect(activeLifetime.effectiveExpiresAt).toBeNull();

    const suspendedLifetime = evaluateSubscriptionRecord({
      userId: USER_A,
      planType: 'lifetime',
      status: 'suspended',
      startsAt: '2026-11-17T00:00:00.000Z',
      expiresAt: null
    });
    expect(suspendedLifetime.hasAccess).toBe(false);
    expect(suspendedLifetime.accessStatus).toBe('suspended');

    const canceledLifetime = evaluateSubscriptionRecord({
      userId: USER_A,
      planType: 'lifetime',
      status: 'canceled',
      startsAt: '2026-11-17T00:00:00.000Z',
      expiresAt: null
    });
    expect(canceledLifetime.hasAccess).toBe(false);
    expect(canceledLifetime.accessStatus).toBe('canceled');
  });

  it('6. Cálculo de faturamento considera somente pagamentos confirmados, ignora pendentes/cancelados e mantém Vitalício gratuito em R$ 0,00', async () => {
    const payments: CommercialPaymentRecord[] = [
      {
        id: 'p1',
        customerUserId: USER_A,
        customerName: 'Cliente A',
        customerEmail: 'a@ficticio.com',
        subscriptionPlan: 'monthly',
        amountCents: 5000,
        paymentDate: '2026-11-10',
        paymentMethod: 'pix',
        paymentStatus: 'confirmed',
        referenceCode: 'REF-1',
        notes: null,
        createdAt: '2026-11-10T10:00:00Z',
        updatedAt: '2026-11-10T10:00:00Z'
      },
      {
        id: 'p2',
        customerUserId: USER_B,
        customerName: 'Cliente B',
        customerEmail: 'b@ficticio.com',
        subscriptionPlan: 'annual',
        amountCents: 45000,
        paymentDate: '2026-08-15',
        paymentMethod: 'credit_card',
        paymentStatus: 'confirmed',
        referenceCode: 'REF-2',
        notes: null,
        createdAt: '2026-08-15T10:00:00Z',
        updatedAt: '2026-08-15T10:00:00Z'
      },
      {
        id: 'p3',
        customerUserId: USER_A,
        customerName: 'Cliente A',
        customerEmail: 'a@ficticio.com',
        subscriptionPlan: 'monthly',
        amountCents: 5000,
        paymentDate: '2026-11-12',
        paymentMethod: 'pix',
        paymentStatus: 'pending',
        referenceCode: 'REF-3',
        notes: null,
        createdAt: '2026-11-12T10:00:00Z',
        updatedAt: '2026-11-12T10:00:00Z'
      },
      {
        id: 'p4',
        customerUserId: USER_B,
        customerName: 'Cliente B',
        customerEmail: 'b@ficticio.com',
        subscriptionPlan: 'annual',
        amountCents: 45000,
        paymentDate: '2026-11-13',
        paymentMethod: 'pix',
        paymentStatus: 'canceled',
        referenceCode: 'REF-4',
        notes: null,
        createdAt: '2026-11-13T10:00:00Z',
        updatedAt: '2026-11-13T10:00:00Z'
      },
      {
        id: 'p5',
        customerUserId: USER_B,
        customerName: 'Cortesia Vitalícia',
        customerEmail: 'cortesia@ficticio.com',
        subscriptionPlan: 'lifetime',
        amountCents: 0,
        paymentDate: '2026-11-14',
        paymentMethod: 'other',
        paymentStatus: 'confirmed',
        referenceCode: 'CORTESIA-1',
        notes: 'Vitalício gratuito',
        createdAt: '2026-11-14T10:00:00Z',
        updatedAt: '2026-11-14T10:00:00Z'
      }
    ];

    const summary = computeRevenueSummary(payments, new Date('2026-11-17T12:00:00Z'));
    expect(summary.monthlyRevenueCents).toBe(5000);
    expect(summary.ytdRevenueCents).toBe(50000);
    expect(summary.salesByPlan.monthly).toBe(1);
    expect(summary.salesByPlan.annual).toBe(1);
    expect(summary.salesByPlan.lifetime).toBe(0);

    // Prevenção contra duplicidade no registro manual
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { code: '23505', message: 'duplicate key value violates unique constraint' }
    });
    const dupRes = await recordCommercialPayment({
      customerUserId: USER_A,
      subscriptionPlan: 'monthly',
      amountCents: 5000,
      paymentDate: '2026-11-10',
      paymentMethod: 'pix',
      paymentStatus: 'confirmed',
      referenceCode: 'REF-1'
    });
    expect(dupRes.success).toBe(false);
    expect(dupRes.code).toBe('23505');
    expect(dupRes.message).toContain('Pagamento duplicado detectado');
  });

  it('7. Master alterna com isolamento entre Minhas Finanças e Gestão Comercial sem consultar dados financeiros dos clientes', async () => {
    const masterFinance = createFixtureAppState(ADMIN_USER, 2, 'Saldo Pessoal Master', 12000);
    saveStateToStorageForUser(ADMIN_USER, masterFinance);

    authStateRef.current = {
      authenticated: true,
      userId: ADMIN_USER,
      email: 'master@ficticio.com',
      displayName: 'Master Admin',
      userMetadata: {}
    };

    subscriptionSingleMock.mockResolvedValue({
      data: {
        user_id: ADMIN_USER,
        plan_type: 'lifetime',
        status: 'active',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: null
      },
      error: null
    });

    financeSingleMock.mockResolvedValue({
      data: {
        user_id: ADMIN_USER,
        data: masterFinance,
        version: 2,
        client_timestamp: masterFinance.lastModified,
        updated_at: '2026-11-17T00:00:00.000Z'
      },
      error: null
    });

    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'check_is_subscription_admin') return { data: true, error: null };
      if (fnName === 'get_my_commercial_status') return { data: null, error: null };
      if (fnName === 'admin_get_master_dashboard_metrics') {
        return {
          data: {
            monthly_revenue_cents: 15000,
            ytd_revenue_cents: 95000,
            total_customers: 12,
            active_subscriptions: 9,
            pending_requests: 2,
            expiring_soon: 1,
            expired_subscriptions: 1,
            active_lifetime: 1,
            plan_distribution: { monthly: 5, annual: 3, lifetime: 1 },
            sales_by_plan: { monthly: 5, annual: 3, lifetime: 0 },
            monthly_revenue_series: [{ month_key: '2026-11', revenue_cents: 15000 }],
            new_customers_series: [{ month_key: '2026-11', customers_count: 4 }]
          },
          error: null
        };
      }
      if (fnName === 'admin_list_subscriptions') {
        return {
          data: [
            {
              user_id: USER_A,
              email: 'cliente-a@ficticio.com',
              full_name: 'Cliente A Fictício',
              whatsapp: '33999990001',
              user_created_at: '2026-11-15T00:00:00Z',
              requested_plan: 'monthly',
              request_status: 'pending',
              request_created_at: '2026-11-15T00:00:00Z',
              plan_type: null,
              status: null,
              starts_at: null,
              expires_at: null,
              notes: null,
              updated_at: null,
              is_effectively_active: false
            }
          ],
          error: null
        };
      }
      if (fnName === 'admin_list_commercial_payments') {
        return { data: [], error: null };
      }
      return { data: null, error: null };
    });

    await act(async () => {
      root.render(<App />);
    });
    await flushMicrotasks(10);

    // Primeiro entra em Minhas Finanças
    expect(container.textContent).toContain('Dashboard Principal');
    expect(container.textContent).toContain('Gestão Comercial');

    const switchToMasterBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Gestão Comercial')
    ) as HTMLButtonElement;
    expect(switchToMasterBtn).toBeDefined();

    financeSingleMock.mockClear();

    await act(async () => {
      switchToMasterBtn.click();
    });
    await flushMicrotasks(10);

    expect(container.querySelector('[data-testid="master-commercial-portal"]')).not.toBeNull();
    expect(container.textContent).toContain('Faturamento Bruto do Mês');
    expect(container.textContent).toContain('150,00');
    expect(container.textContent).toContain('950,00');
    // No modo Master, não consulta finanças de ninguém
    expect(financeSingleMock).not.toHaveBeenCalled();

    // Vai para aba Clientes e Solicitações e verifica botão Vitalício Especial
    const clientsTabBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Clientes e Solicitações')
    ) as HTMLButtonElement;
    await act(async () => {
      clientsTabBtn.click();
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Cliente A Fictício');
    expect(container.textContent).toContain('Conceder Vitalício Especial');

    // Volta para Minhas Finanças
    const backBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Minhas Finanças')
    ) as HTMLButtonElement;
    expect(backBtn).toBeDefined();

    await act(async () => {
      backBtn.click();
    });
    await flushMicrotasks(10);

    expect(container.textContent).toContain('Dashboard Principal');
    expect(getUserStateFromStorage(ADMIN_USER)?.transactions[0].description).toBe('Saldo Pessoal Master');
  });

  it('8. MasterCommercialPortal bloqueia renderização quando isAdmin=false', async () => {
    await act(async () => {
      root.render(
        <MasterCommercialPortal
          isAdmin={false}
          adminEmail="invasor@ficticio.com"
          hasPersonalFinanceAccess={true}
          onSwitchToFinances={vi.fn()}
          onLogout={vi.fn()}
        />
      );
    });

    expect(container.querySelector('[data-testid="master-commercial-portal"]')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('9. Conta Master possui acesso permanente sem exigir assinatura paga e ignora adulteração de user_metadata em conta comum', async () => {
    const masterPerm = evaluateSubscriptionRecord(null, Date.now(), true, null);
    expect(masterPerm.hasAccess).toBe(true);
    expect(masterPerm.accessStatus).toBe('active');
    expect(masterPerm.isAdmin).toBe(true);
    expect(masterPerm.effectiveExpiresAt).toBeNull();

    // Mesmo com user_metadata adulterado em conta comum, check_is_subscription_admin decide no servidor
    authStateRef.current = {
      authenticated: true,
      userId: USER_A,
      email: 'comum-tentativa@ficticio.com',
      displayName: 'Comum Adulterado',
      userMetadata: { is_admin: true, role: 'master', app_admin: true }
    };
    subscriptionSingleMock.mockResolvedValue({ data: null, error: null });

    await act(async () => {
      root.render(<App />);
    });
    await flushMicrotasks(10);

    expect(container.textContent).toContain('Sem Plano Ativo');
    expect(container.textContent).not.toContain('Gestão Comercial');

    // Agora autentica Master confirmado pelo servidor sem nenhuma assinatura paga em user_subscriptions
    const masterState = createFixtureAppState(ADMIN_USER, 1, 'Finanças Pessoais Master', 9800);
    saveStateToStorageForUser(ADMIN_USER, masterState);

    authStateRef.current = {
      authenticated: true,
      userId: ADMIN_USER,
      email: 'master-ficticio@ficticio.com',
      displayName: 'Master Oficial',
      userMetadata: {}
    };
    subscriptionSingleMock.mockResolvedValue({ data: null, error: null });
    financeSingleMock.mockResolvedValue({
      data: {
        user_id: ADMIN_USER,
        data: masterState,
        version: 1,
        client_timestamp: masterState.lastModified,
        updated_at: '2026-11-17T00:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(<App key="master-no-sub" />);
    });
    await flushMicrotasks(12);

    expect(container.textContent).toContain('Dashboard Principal');
    expect(container.textContent).toContain('Gestão Comercial');
  });

  it('10. SQL 01 preserva atomicidade, NO FORCE RLS, bloqueio de sondagem em has_active_subscription, DATE payment_date e DROP seguro', () => {
    const sql01 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/sql/01_subscriptions_schema_and_rpcs.sql'),
      'utf8'
    );
    const sql04 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/sql/04_rls_isolated_validation_tests.sql'),
      'utf8'
    );

    // Transação atômica
    expect(sql01).toMatch(/^\s*--[\s\S]*?\nBEGIN;\n/m);
    expect(sql01).toMatch(/\nCOMMIT;\s*$/);

    // Fix 1: NO FORCE ROW LEVEL SECURITY nas 6 tabelas comerciais (evita bloqueio de SECURITY DEFINER)
    const commercialTables = [
      'user_subscriptions',
      'app_admins',
      'customer_profiles',
      'access_requests',
      'commercial_payments',
      'commercial_audit_logs'
    ];
    for (const table of commercialTables) {
      expect(sql01).toContain(`ALTER TABLE public.${table} ENABLE ROW LEVEL SECURITY;`);
      expect(sql01).toContain(`ALTER TABLE public.${table} NO FORCE ROW LEVEL SECURITY;`);
      expect(sql01).not.toContain(`ALTER TABLE public.${table} FORCE ROW LEVEL SECURITY;`);
    }

    // Fix 2: has_active_subscription não usa current_user para checar privilégio
    const hasActiveMatch = sql01.match(
      /CREATE OR REPLACE FUNCTION public\.has_active_subscription\([\s\S]*?END;\n\$\$;/
    );
    expect(hasActiveMatch).not.toBeNull();
    const hasActiveBody = hasActiveMatch![0];
    expect(hasActiveBody).not.toContain('current_user');
    expect(hasActiveBody).toContain('session_user IN');
    expect(hasActiveBody).toContain("COALESCE(v_jwt_role, '') <> 'authenticated'");
    expect(hasActiveBody).toContain('p_user_id IS DISTINCT FROM v_caller_uid');

    // Fix 3: Agrupamento mensal por DATE payment_date sem cast para TIMESTAMPTZ
    const dashboardMatch = sql01.match(
      /CREATE OR REPLACE FUNCTION public\.admin_get_master_dashboard_metrics\(\)[\s\S]*?END;\n\$\$;/
    );
    expect(dashboardMatch).not.toBeNull();
    const dashboardBody = dashboardMatch![0];
    expect(dashboardBody).not.toContain('payment_date::TIMESTAMPTZ');
    expect(dashboardBody).toContain('cp.payment_date >= gs.m::DATE');
    expect(dashboardBody).toContain("cp.payment_date < (gs.m::DATE + INTERVAL '1 month')::DATE");
    expect(dashboardBody).toContain("payment_date < (v_month_start + INTERVAL '1 month')::DATE");
    expect(dashboardBody).toContain("payment_date < (v_year_start + INTERVAL '1 year')::DATE");

    // Fix 4: Sem DROP FUNCTION incondicional no topo; único DROP ocorre sob guarda DO $$ verificando retorno incompatível
    expect(sql01).not.toMatch(/^DROP FUNCTION\b/m);
    expect(sql01.match(/DROP FUNCTION\b/g)?.length ?? 0).toBe(1);
    expect(sql01).not.toContain('DROP FUNCTION IF EXISTS public.admin_manage_subscription');
    expect(sql01).toContain("to_regprocedure('public.admin_list_subscriptions(text)')");
    expect(sql01).toContain("pg_get_function_result(v_proc_oid) NOT LIKE '%full_name%'");

    // SQL 04 cobre sondagem de terceiro ativo (2a-bis)
    expect(sql04).toContain('2a-bis.');
    expect(sql04).toContain('public.has_active_subscription(v_user_a)');
  });

  it('11. SQL 02 remove dinamicamente todas as políticas antigas via pg_policies dentro de transação atômica', () => {
    const sql02 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/sql/02_user_finance_data_subscription_rls.sql'),
      'utf8'
    );

    expect(sql02).toMatch(/^\s*--[\s\S]*?\nBEGIN;\n/m);
    expect(sql02).toMatch(/\nCOMMIT;\s*$/);
    expect(sql02).toContain("to_regclass('public.user_finance_data')");
    expect(sql02).toContain("to_regprocedure('public.has_active_subscription(uuid)')");
    expect(sql02).toContain('FROM pg_policies');
    expect(sql02).toContain("tablename = 'user_finance_data'");
    expect(sql02).toContain('DROP POLICY IF EXISTS %I ON public.user_finance_data');
    expect(sql02).toContain('ALTER TABLE public.user_finance_data FORCE ROW LEVEL SECURITY;');
  });

  it('12. SQL 01 elimina OR em consentimento WhatsApp, bloqueia escrita direta em customer_profiles, endurece is_subscription_admin e serializa pagamentos sem reference_code', () => {
    const sql01 = fs.readFileSync(
      path.resolve(process.cwd(), 'supabase/sql/01_subscriptions_schema_and_rpcs.sql'),
      'utf8'
    );

    // 1. customer_profiles somente leitura para authenticated
    expect(sql01).toContain('GRANT SELECT ON TABLE public.customer_profiles TO authenticated;');
    expect(sql01).not.toContain('GRANT SELECT, INSERT, UPDATE ON TABLE public.customer_profiles TO authenticated;');
    expect(sql01).not.toContain('CREATE POLICY "customer_profiles_insert_own"');
    expect(sql01).not.toContain('CREATE POLICY "customer_profiles_update_own"');

    // 2. Sem OR tornando consentimento permanente e com compatibilidade dinâmica com Script 06
    expect(sql01).not.toContain('public.customer_profiles.lgpd_whatsapp_consent OR EXCLUDED.lgpd_whatsapp_consent');
    expect(sql01).not.toContain('whatsapp_redirect_confirmed OR COALESCE(p_whatsapp_consent');
    expect(sql01).toContain("to_regclass('public.user_whatsapp_consent_events')");
    expect(sql01).toContain('whatsapp_redirect_confirmed = v_redirect_confirmed');
    expect(sql01).toContain('lgpd_whatsapp_consent = v_marketing_whatsapp_consent');

    // 3. is_subscription_admin exige JWT authenticated
    const adminFnMatch = sql01.match(
      /CREATE OR REPLACE FUNCTION public\.is_subscription_admin\(\)[\s\S]*?END;\n\$\$;/
    );
    expect(adminFnMatch).not.toBeNull();
    expect(adminFnMatch![0]).toContain("COALESCE(v_jwt_role, '') <> 'authenticated'");

    // 4. Pagamentos concorrentes sem reference_code serializados e protegidos por índice único parcial
    expect(sql01).toContain('CREATE UNIQUE INDEX IF NOT EXISTS idx_commercial_payments_unique_no_ref');
    expect(sql01).toContain("WHERE reference_code IS NULL AND payment_status <> 'canceled'");
    expect(sql01).toContain("pg_advisory_xact_lock(hashtext('commercial_payment:' || p_customer_user_id::TEXT))");
  });
});
