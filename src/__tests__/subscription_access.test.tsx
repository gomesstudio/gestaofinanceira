// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
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
  onAuthStateChangeMock,
  subscriptionSingleMock,
  financeSingleMock,
  financeUpsertMock,
  financeLimitMock,
  rpcMock,
  logoutMock
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
        userId: userA as string | null,
        email: 'cliente-a@ficticio.com' as string | null,
        displayName: 'Cliente A Fictício',
        authenticated: true
      }
    },
    getSessionMock: vi.fn(),
    onAuthStateChangeMock: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    subscriptionSingleMock: vi.fn(),
    financeSingleMock: vi.fn(),
    financeUpsertMock: vi.fn(),
    financeLimitMock: vi.fn(),
    rpcMock: vi.fn(),
    logoutMock: vi.fn()
  };
});

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: getSessionMock,
      refreshSession: vi.fn(),
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
          // Simula bloqueio RLS caso algum código tente escrita direta pelo cliente
          upsert: vi.fn().mockResolvedValue({
            data: null,
            error: {
              code: '42501',
              message: 'new row violates row-level security policy for table "user_subscriptions"'
            }
          }),
          update: vi.fn(() => ({
            eq: vi.fn().mockResolvedValue({
              data: null,
              error: {
                code: '42501',
                message: 'permission denied for table user_subscriptions'
              }
            })
          }))
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
  COMMERCIAL_WHATSAPP_NUMBER,
  WHATSAPP_ANNUAL_PLAN_URL,
  WHATSAPP_MONTHLY_PLAN_URL,
  evaluateSubscriptionRecord,
  fetchUserSubscriptionAccess,
  exportReadOnlyBackupForBlockedUser,
  executeAdminSubscriptionAction,
  fetchAdminSubscriptionsList,
  getWhatsAppRenewalUrl,
  getWhatsAppSupportUrl
} from '../services/subscriptionService';
import { saveFinanceDataToSupabase } from '../services/supabaseSyncService';
import { SubscriptionGateScreen } from '../components/auth/SubscriptionGateScreen';
import { AdminSubscriptionsPanel } from '../components/settings/AdminSubscriptionsPanel';
import { AuthProvider } from '../context/AuthContext';
import { FinanceProvider, useFinance, FinanceContextType } from '../context/FinanceContext';
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
        name: 'Conta Fictícia',
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

const FinanceProbe: React.FC<{ onCtx: (ctx: FinanceContextType) => void }> = ({ onCtx }) => {
  const ctx = useFinance();
  onCtx(ctx);
  return null;
};

describe('Comercialização C1/C2 — Planos Mensal e Anual, WhatsApp Comercial, RLS e Exportação Segura (100% mocks)', () => {
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
      userId: USER_A,
      email: 'cliente-a@ficticio.com',
      displayName: 'Cliente A Fictício',
      authenticated: true
    };

    getSessionMock.mockImplementation(async () => ({
      data: {
        session:
          authStateRef.current.authenticated && authStateRef.current.userId
            ? {
                user: {
                  id: authStateRef.current.userId,
                  email: authStateRef.current.email,
                  user_metadata: { full_name: authStateRef.current.displayName }
                },
                expires_at: Math.floor(Date.now() / 1000) + 3600
              }
            : null
      },
      error: null
    }));

    financeLimitMock.mockResolvedValue({ data: [{ user_id: USER_A }], error: null });
    financeUpsertMock.mockResolvedValue({ data: null, error: null });
    rpcMock.mockImplementation(async (fnName: string) => {
      if (fnName === 'check_is_subscription_admin') {
        return { data: authStateRef.current.userId === ADMIN_USER, error: null };
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

  it('1. Valida planos Mensal (ativo e vencido) e Anual (ativo e vencido) e rejeita tipo legado/desconhecido', async () => {
    const now = Date.now();
    const futureMonthIso = new Date(now + 10 * 24 * 60 * 60 * 1000).toISOString();
    const futureYearIso = new Date(now + 240 * 24 * 60 * 60 * 1000).toISOString();
    const pastIso = new Date(now - 60 * 1000).toISOString();

    // Mensal ativo
    subscriptionSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        plan_type: 'monthly',
        status: 'active',
        starts_at: new Date(now - 20 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: futureMonthIso
      },
      error: null
    });

    const monthlyActive = await fetchUserSubscriptionAccess(USER_A);
    expect(monthlyActive.hasAccess).toBe(true);
    expect(monthlyActive.accessStatus).toBe('active');
    expect(monthlyActive.subscription?.planType).toBe('monthly');
    expect(monthlyActive.daysRemaining).toBe(10);

    // Mensal vencido (mesmo com status='active' antes de atualização)
    subscriptionSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        plan_type: 'monthly',
        status: 'active',
        starts_at: new Date(now - 31 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastIso
      },
      error: null
    });

    const monthlyExpired = await fetchUserSubscriptionAccess(USER_A);
    expect(monthlyExpired.hasAccess).toBe(false);
    expect(monthlyExpired.accessStatus).toBe('expired');

    // Anual ativo
    subscriptionSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        plan_type: 'annual',
        status: 'active',
        starts_at: new Date(now - 125 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: futureYearIso
      },
      error: null
    });

    const annualActive = await fetchUserSubscriptionAccess(USER_A);
    expect(annualActive.hasAccess).toBe(true);
    expect(annualActive.accessStatus).toBe('active');
    expect(annualActive.subscription?.planType).toBe('annual');
    expect(annualActive.daysRemaining).toBe(240);

    // Anual vencido
    subscriptionSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        plan_type: 'annual',
        status: 'active',
        starts_at: new Date(now - 370 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: pastIso
      },
      error: null
    });

    const annualExpired = await fetchUserSubscriptionAccess(USER_A);
    expect(annualExpired.hasAccess).toBe(false);
    expect(annualExpired.accessStatus).toBe('expired');

    // Plano Vitalício Especial concedido administrativamente (expires_at = null)
    subscriptionSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        plan_type: 'lifetime',
        status: 'active',
        starts_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: null
      },
      error: null
    });

    const lifetimeGranted = await fetchUserSubscriptionAccess(USER_A);
    expect(lifetimeGranted.hasAccess).toBe(true);
    expect(lifetimeGranted.accessStatus).toBe('active');
    expect(lifetimeGranted.subscription?.planType).toBe('lifetime');
    expect(lifetimeGranted.effectiveExpiresAt).toBeNull();

    // Vitalício inconsistente (com expires_at preenchido) ou tipo desconhecido falha com segurança
    subscriptionSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        plan_type: 'enterprise_invalid',
        status: 'active',
        starts_at: new Date(now - 10 * 24 * 60 * 60 * 1000).toISOString(),
        expires_at: null
      },
      error: null
    });

    const invalidPlan = await fetchUserSubscriptionAccess(USER_A);
    expect(invalidPlan.hasAccess).toBe(false);
    expect(invalidPlan.accessStatus).toBe('error');
  });

  it('2. Tela de assinatura exibe apenas Mensal e Anual sem preços e com links oficiais de WhatsApp em nova aba', async () => {
    const expiredAnnualAccess = evaluateSubscriptionRecord({
      userId: USER_A,
      planType: 'annual',
      status: 'expired',
      startsAt: '2025-11-01T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z'
    });

    await act(async () => {
      root.render(
        <SubscriptionGateScreen
          userId={USER_A}
          userEmail="cliente-a@ficticio.com"
          displayName="Cliente A"
          accessState={expiredAnnualAccess}
          onRetryCheck={vi.fn()}
          onLogout={logoutMock}
        />
      );
    });

    const text = container.textContent || '';
    expect(text).toContain('Plano Mensal');
    expect(text).toContain('Acesso por 30 dias');
    expect(text).toContain('Plano Anual');
    expect(text).toContain('Acesso por 12 meses');
    expect(text).toContain(COMMERCIAL_WHATSAPP_NUMBER);

    // Ausência absoluta de plano vitalício e valores monetários
    expect(text.toLowerCase()).not.toContain('vitalício');
    expect(text.toLowerCase()).not.toContain('vitalicio');
    expect(text).not.toMatch(/R\$\s*\d+/i);
    expect(text).not.toMatch(/\$\s*\d+/);

    const anchors = Array.from(container.querySelectorAll('a'));
    const consultLinks = anchors.filter(a => a.textContent?.includes('Consultar plano'));
    expect(consultLinks).toHaveLength(2);
    expect(consultLinks[0].getAttribute('href')).toBe(WHATSAPP_MONTHLY_PLAN_URL);
    expect(consultLinks[1].getAttribute('href')).toBe(WHATSAPP_ANNUAL_PLAN_URL);
    for (const a of consultLinks) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }

    // Assinatura vencida exibe "Renovar pelo WhatsApp" e suporte personalizado sem expor dados privados
    const renewLink = anchors.find(a => a.textContent?.includes('Renovar pelo WhatsApp'));
    expect(renewLink).toBeDefined();
    expect(renewLink?.getAttribute('href')).toBe(getWhatsAppRenewalUrl('annual'));
    expect(renewLink?.getAttribute('target')).toBe('_blank');

    const supportLink = anchors.find(a => a.textContent?.includes('Falar com o suporte'));
    expect(supportLink).toBeDefined();
    expect(supportLink?.getAttribute('href')).toBe(getWhatsAppSupportUrl('expired'));
    expect(supportLink?.getAttribute('target')).toBe('_blank');

    // Nenhum link de WhatsApp pode expor dados privados ou identificadores do cliente
    for (const a of anchors) {
      const href = a.getAttribute('href') || '';
      expect(href.startsWith('https://wa.me/5533991031052')).toBe(true);
      expect(href).not.toContain(USER_A);
      expect(href).not.toContain('cliente-a@ficticio.com');
      expect(href).not.toMatch(/R\$|\$/);
    }
  });

  it('3. Suspensão administrativa bloqueia acesso no App, oculta opção de renovação de vencido e preserva dados financeiros', async () => {
    const stateA = createFixtureAppState(USER_A, 4, 'Reserva Fictícia A', 7500);
    saveStateToStorageForUser(USER_A, stateA);

    subscriptionSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        plan_type: 'monthly',
        status: 'suspended',
        starts_at: '2026-11-01T00:00:00.000Z',
        expires_at: '2026-12-01T00:00:00.000Z'
      },
      error: null
    });

    await act(async () => {
      root.render(<App />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Assinatura Suspensa');
    expect(container.textContent).toContain('Exportar Backup JSON (.json)');
    expect(container.textContent).toContain('Falar com o suporte');
    expect(container.textContent).not.toContain('Renovar pelo WhatsApp');
    expect(container.textContent).not.toContain('Dashboard Principal');
    expect(container.querySelector('[data-testid="admin-subscriptions-panel"]')).toBeNull();

    const supportAnchor = Array.from(container.querySelectorAll('a')).find(a =>
      a.textContent?.includes('Falar com o suporte')
    );
    expect(supportAnchor?.getAttribute('href')).toBe(getWhatsAppSupportUrl('suspended'));
    expect(getUserStateFromStorage(USER_A)?.transactions[0].description).toBe('Reserva Fictícia A');
  });

  it('4. Tentativa de alteração de plano ou acesso administrativo por cliente comum é bloqueada (42501)', async () => {
    const listRes = await fetchAdminSubscriptionsList();
    expect(listRes.success).toBe(false);
    expect(listRes.code).toBe('42501');

    const escalateRes = await executeAdminSubscriptionAction({
      targetUserId: USER_A,
      action: 'activate_annual'
    });
    expect(escalateRes.success).toBe(false);
    expect(escalateRes.code).toBe('42501');

    await act(async () => {
      root.render(<AdminSubscriptionsPanel isAdmin={false} />);
    });
    expect(container.querySelector('[data-testid="admin-subscriptions-panel"]')).toBeNull();
  });

  it('5. Painel admin gerencia planos Mensal e Anual (ativar, renovar, suspender, cancelar) sem preços e sem dados financeiros', async () => {
    authStateRef.current = {
      userId: ADMIN_USER,
      email: 'admin@ficticio.com',
      displayName: 'Admin Fictício',
      authenticated: true
    };

    rpcMock.mockImplementation(async (fnName: string, args?: any) => {
      if (fnName === 'check_is_subscription_admin') {
        return { data: true, error: null };
      }
      if (fnName === 'admin_list_subscriptions') {
        return {
          data: [
            {
              user_id: USER_A,
              email: 'cliente-a@ficticio.com',
              user_created_at: '2026-11-01T00:00:00.000Z',
              plan_type: 'monthly',
              status: 'active',
              starts_at: '2026-11-01T00:00:00.000Z',
              expires_at: '2026-12-01T00:00:00.000Z',
              notes: null,
              updated_at: '2026-11-01T00:00:00.000Z',
              is_effectively_active: true
            },
            {
              user_id: USER_B,
              email: 'cliente-b@ficticio.com',
              user_created_at: '2025-11-01T00:00:00.000Z',
              plan_type: 'annual',
              status: 'expired',
              starts_at: '2025-11-01T00:00:00.000Z',
              expires_at: '2026-11-01T00:00:00.000Z',
              notes: null,
              updated_at: '2026-11-01T00:00:00.000Z',
              is_effectively_active: false
            }
          ],
          error: null
        };
      }
      if (fnName === 'admin_manage_subscription') {
        const isAnnual =
          args.p_action === 'activate_annual' || args.p_action === 'renew_annual';
        return {
          data: {
            user_id: args.p_target_user_id,
            plan_type: isAnnual ? 'annual' : 'monthly',
            status: args.p_action === 'suspend' ? 'suspended' : args.p_action === 'cancel' ? 'canceled' : 'active',
            starts_at: '2026-11-17T00:00:00.000Z',
            expires_at: isAnnual ? '2027-11-17T00:00:00.000Z' : '2026-12-17T00:00:00.000Z',
            notes: null,
            updated_at: '2026-11-17T00:00:00.000Z'
          },
          error: null
        };
      }
      return { data: null, error: null };
    });

    await act(async () => {
      root.render(<AdminSubscriptionsPanel isAdmin={true} />);
    });
    await flushMicrotasks();

    const panel = container.querySelector('[data-testid="admin-subscriptions-panel"]');
    expect(panel).not.toBeNull();
    const panelText = panel?.textContent || '';
    expect(panelText).toContain('cliente-a@ficticio.com');
    expect(panelText).toContain('Plano: Mensal');
    expect(panelText).toContain('cliente-b@ficticio.com');
    expect(panelText).toContain('Plano: Anual');
    expect(panelText).toContain('Vencimento:');
    expect(panelText).toContain('Vitalício Especial');
    expect(panelText).not.toMatch(/R\$\s*\d+/i);
    // Painel admin nunca consulta user_finance_data
    expect(financeSingleMock).not.toHaveBeenCalled();

    // Ativar Anual (12m) para Cliente B vencido
    const activateAnnualButtons = Array.from(container.querySelectorAll('button')).filter(b =>
      b.textContent?.includes('Ativar Anual (12m)')
    ) as HTMLButtonElement[];
    expect(activateAnnualButtons.length).toBeGreaterThanOrEqual(1);

    await act(async () => {
      activateAnnualButtons[activateAnnualButtons.length - 1].click();
    });
    await flushMicrotasks();

    expect(rpcMock).toHaveBeenCalledWith('admin_manage_subscription', {
      p_target_user_id: USER_B,
      p_action: 'activate_annual',
      p_notes: null
    });

    // Renovar Mensal (+30d) para Cliente A ativo
    const renewMonthlyBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Renovar Mensal (+30d)')
    ) as HTMLButtonElement;
    expect(renewMonthlyBtn).toBeDefined();

    await act(async () => {
      renewMonthlyBtn.click();
    });
    await flushMicrotasks();

    expect(rpcMock).toHaveBeenCalledWith('admin_manage_subscription', {
      p_target_user_id: USER_A,
      p_action: 'renew_monthly',
      p_notes: null
    });
  });

  it('6. Exportação de backup JSON funciona após vencimento e mantém isolamento estrito entre usuários A e B', async () => {
    const stateA = createFixtureAppState(USER_A, 6, 'Salário Fictício A', 5500);
    const stateB = createFixtureAppState(USER_B, 3, 'Salário Fictício B', 9200);
    saveStateToStorageForUser(USER_A, stateA);
    saveStateToStorageForUser(USER_B, stateB);

    financeSingleMock.mockImplementation(async (uid: string) => ({
      data: {
        user_id: uid,
        data: uid === USER_A ? stateA : stateB,
        version: uid === USER_A ? 6 : 3,
        client_timestamp: uid === USER_A ? stateA.lastModified : stateB.lastModified,
        updated_at: '2026-11-17T02:00:00.000Z'
      },
      error: null
    }));

    const exportedA = await exportReadOnlyBackupForBlockedUser(USER_A);
    expect(exportedA.success).toBe(true);
    expect(exportedA.source).toBe('cloud');
    const parsedA = JSON.parse(exportedA.jsonContent!);
    expect(parsedA.ownerUserId).toBe(USER_A);
    expect(parsedA.transactions[0].description).toBe('Salário Fictício A');
    expect(exportedA.jsonContent).not.toContain('Salário Fictício B');

    const createObjectURLMock = vi.fn(() => 'blob:ficticio');
    const revokeObjectURLMock = vi.fn();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURLMock, writable: true, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURLMock, writable: true, configurable: true });
    const anchorClickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    const expiredAccess = evaluateSubscriptionRecord({
      userId: USER_A,
      planType: 'monthly',
      status: 'expired',
      startsAt: '2026-10-01T00:00:00.000Z',
      expiresAt: '2026-11-01T00:00:00.000Z'
    });

    await act(async () => {
      root.render(
        <SubscriptionGateScreen
          userId={USER_A}
          userEmail="cliente-a@ficticio.com"
          displayName="Cliente A"
          accessState={expiredAccess}
          onRetryCheck={vi.fn()}
          onLogout={logoutMock}
        />
      );
    });

    const exportBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Exportar Backup JSON')
    ) as HTMLButtonElement;
    expect(exportBtn).toBeDefined();

    await act(async () => {
      exportBtn.click();
    });
    await flushMicrotasks();

    expect(createObjectURLMock).toHaveBeenCalledTimes(1);
    expect(anchorClickSpy).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain('Backup JSON oficial obtido da nuvem');
  });

  it('7. Erros de rede e autorização (42501) falham com segurança e preservam dados locais existentes', async () => {
    const stateA = createFixtureAppState(USER_A, 5, 'Dado Local Preservado A', 4100);
    saveStateToStorageForUser(USER_A, stateA);

    subscriptionSingleMock.mockRejectedValueOnce(new Error('Network offline'));
    const netFailAccess = await fetchUserSubscriptionAccess(USER_A);
    expect(netFailAccess.hasAccess).toBe(false);
    expect(netFailAccess.accessStatus).toBe('error');
    expect(getUserStateFromStorage(USER_A)?.transactions[0].description).toBe('Dado Local Preservado A');

    financeUpsertMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "user_finance_data"'
      }
    });

    const syncRes = await saveFinanceDataToSupabase(stateA, USER_A);
    expect(syncRes.success).toBe(false);
    expect(syncRes.code).toBe('42501');
    expect(syncRes.message).toContain('assinatura inativa ou vencida');
    expect(syncRes.message).toContain('dados locais foram preservados');

    financeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: stateA,
        version: 5,
        client_timestamp: stateA.lastModified,
        updated_at: '2026-11-17T01:00:00.000Z'
      },
      error: null
    });

    let ctx!: FinanceContextType;
    await act(async () => {
      root.render(
        <AuthProvider>
          <FinanceProvider>
            <FinanceProbe onCtx={c => (ctx = c)} />
          </FinanceProvider>
        </AuthProvider>
      );
    });
    await flushMicrotasks();

    if (!ctx.isFinanceHydrated) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(100);
      });
      await flushMicrotasks();
    }

    financeUpsertMock.mockResolvedValueOnce({
      data: null,
      error: {
        code: '42501',
        message: 'new row violates row-level security policy for table "user_finance_data"'
      }
    });

    await act(async () => {
      ctx.addTransaction({
        description: 'Nova Despesa Local Preservada',
        amount: 200,
        type: 'expense_variable',
        category: 'Alimentação',
        date: '2026-11-17',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });
    await flushMicrotasks();

    expect(ctx.cloudSyncStatus).toBe('error');
    expect(ctx.cloudSyncMessage).toContain('dados locais foram preservados');
    expect(ctx.transactions.some(t => t.description === 'Dado Local Preservado A')).toBe(true);
    expect(ctx.transactions.some(t => t.description === 'Nova Despesa Local Preservada')).toBe(true);
    expect(
      getUserStateFromStorage(USER_A)?.transactions.some(
        t => t.description === 'Nova Despesa Local Preservada'
      )
    ).toBe(true);
  });

  it('8. Revalidação após ativação de assinatura anual desbloqueia o acesso ao aplicativo financeiro', async () => {
    const stateA = createFixtureAppState(USER_A, 2, 'Saldo Desbloqueado A', 3200);
    saveStateToStorageForUser(USER_A, stateA);
    financeSingleMock.mockResolvedValue({
      data: {
        user_id: USER_A,
        data: stateA,
        version: 2,
        client_timestamp: stateA.lastModified,
        updated_at: '2026-11-17T01:00:00.000Z'
      },
      error: null
    });

    subscriptionSingleMock.mockResolvedValueOnce({
      data: null,
      error: null
    });

    await act(async () => {
      root.render(<App />);
    });
    await flushMicrotasks();

    expect(container.textContent).toContain('Sem Plano Ativo');

    subscriptionSingleMock.mockResolvedValueOnce({
      data: {
        user_id: USER_A,
        plan_type: 'annual',
        status: 'active',
        starts_at: new Date().toISOString(),
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
      },
      error: null
    });

    const retryBtn = Array.from(container.querySelectorAll('button')).find(b =>
      b.textContent?.includes('Verificar Assinatura Novamente')
    ) as HTMLButtonElement;
    expect(retryBtn).toBeDefined();

    await act(async () => {
      retryBtn.click();
    });
    await flushMicrotasks();

    expect(container.textContent).not.toContain('Sem Plano Ativo');
    expect(container.textContent).toContain('Dashboard Principal');
  });
});
