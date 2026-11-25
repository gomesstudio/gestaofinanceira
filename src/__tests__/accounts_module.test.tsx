// @vitest-environment jsdom
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppState, DEFAULT_CATEGORIES } from '../utils/storage';
import {
  getAccountBalanceDistribution,
  getAccountDependencies,
  parseCurrencyInput
} from '../utils/accountManagement';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const USER_SYNTH = '11111111-1111-4111-8111-111111111111';

const {
  activeRemoteState,
  upsertMock,
  limitMock,
  maybeSingleMock,
  getSessionMock
} = vi.hoisted(() => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const remoteState: AppState = {
    ownerUserId: userId,
    version: 4,
    lastModified: 1795600000000,
    transactions: [
      {
        id: 'tx-acc1-income',
        description: 'Recebimento Sintético',
        amount: 1200,
        type: 'income',
        category: 'Freelance',
        date: '2026-11-10',
        accountId: 'acc-1',
        paymentMethod: 'pix',
        status: 'paid'
      },
      {
        id: 'tx-acc2-expense',
        description: 'Compra Dinheiro',
        amount: 80,
        type: 'expense_variable',
        category: 'Alimentação',
        date: '2026-11-12',
        accountId: 'acc-2',
        paymentMethod: 'money',
        status: 'paid'
      }
    ],
    categories: [],
    accounts: [
      {
        id: 'acc-1',
        name: 'Conta Corrente Alfa',
        type: 'checking',
        balance: 2500,
        color: '#059669',
        institution: 'Banco Alfa'
      },
      {
        id: 'acc-2',
        name: 'Carteira Física',
        type: 'cash',
        balance: 1500,
        color: '#d97706'
      },
      {
        id: 'acc-3',
        name: 'Reserva Sem Vínculos',
        type: 'savings',
        balance: 500,
        color: '#2563eb'
      }
    ],
    creditCards: [],
    debts: [],
    goals: [],
    recurringIncomes: [
      {
        id: 'rec-future-1',
        description: 'Salário Fixo Previsto',
        amount: 5000,
        category: 'Salário',
        accountId: 'acc-1',
        paymentMethod: 'bank_transfer',
        frequency: 'monthly',
        dayOfMonth: 5,
        startDate: '2026-12-05',
        startPeriod: '2026-12',
        isIndefinite: true,
        isActive: true,
        createdAt: '2026-11-01T10:00:00.000Z',
        updatedAt: '2026-11-01T10:00:00.000Z'
      }
    ],
    safetyReserveDesired: 1000,
    isSampleLoaded: false
  };

  return {
    activeRemoteState: remoteState,
    upsertMock: vi.fn().mockResolvedValue({ data: null, error: null }),
    limitMock: vi.fn().mockResolvedValue({ data: [{ user_id: userId }], error: null }),
    maybeSingleMock: vi.fn().mockResolvedValue({
      data: {
        user_id: userId,
        data: remoteState,
        version: 4,
        client_timestamp: 1795600000000,
        updated_at: '2026-11-25T10:00:00.000Z'
      },
      error: null
    }),
    getSessionMock: vi.fn().mockResolvedValue({
      data: {
        session: {
          user: { id: userId, email: 'teste-contas@exemplo.com' }
        }
      },
      error: null
    })
  };
});

activeRemoteState.categories = DEFAULT_CATEGORIES;

vi.mock('../utils/supabase', () => ({
  supabase: {
    auth: {
      getSession: (...args: any[]) => getSessionMock(...args)
    },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        limit: limitMock,
        eq: vi.fn(() => ({
          maybeSingle: maybeSingleMock
        }))
      })),
      upsert: upsertMock
    }))
  },
  SUPABASE_PROJECT_URL: 'https://exemplo.supabase.co'
}));

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    logout: vi.fn(),
    updatePassword: vi.fn(),
    supabaseUserId: USER_SYNTH,
    supabaseUserEmail: 'teste-contas@exemplo.com',
    supabaseUserDisplayName: 'Usuário Teste',
    isSupabaseAuthenticated: true,
    cloudAuthStatus: 'connected',
    signInWithSupabase: vi.fn(),
    loginWithGitHub: vi.fn(),
    signInWithOtp: vi.fn(),
    verifyOtp: vi.fn(),
    sendPasswordResetEmail: vi.fn(),
    disconnectCloud: vi.fn(),
    checkSessionStatus: vi.fn()
  })
}));

import { FinanceProvider, FinanceContextType, useFinance } from '../context/FinanceContext';
import { AccountsView } from '../components/accounts/AccountsView';
import { Sidebar } from '../components/layout/Sidebar';
import { MobileDrawer } from '../components/layout/MobileDrawer';
import { MobileModuleBar } from '../components/layout/MobileModuleBar';
import { Header } from '../components/layout/Header';
import { DashboardView } from '../components/dashboard/DashboardView';
import { SettingsView } from '../components/settings/SettingsView';
import { TransactionsView } from '../components/transactions/TransactionsView';

function installIsolatedStorageMock() {
  let store: Record<string, string> = {};
  Object.defineProperty(window, 'localStorage', {
    value: {
      getItem: (key: string) => (key in store ? store[key] : null),
      setItem: (key: string, val: string) => {
        store[key] = String(val);
      },
      removeItem: (key: string) => {
        delete store[key];
      },
      clear: () => {
        store = {};
      }
    },
    writable: true
  });
}

async function flushMicrotasks(rounds = 8) {
  for (let i = 0; i < rounds; i++) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

function setInputValue(el: HTMLInputElement | HTMLSelectElement, value: string) {
  const proto =
    el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(proto, 'value');
  descriptor?.set?.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function clickButtonByText(container: ParentNode, text: string) {
  const btn = Array.from(container.querySelectorAll('button')).find(b =>
    (b.textContent || '').includes(text)
  );
  if (!btn) {
    throw new Error(`Botão não encontrado com texto: ${text}`);
  }
  btn.click();
  return btn;
}

describe('Módulo Minhas Contas — Navegação, Atalhos, CRUD, Proteção e Acessibilidade', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    installIsolatedStorageMock();
    window.localStorage.clear();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
    upsertMock.mockClear();
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    container.remove();
  });

  it('calcula distribuição, dependências e parsing de valores corretamente', () => {
    const dist = getAccountBalanceDistribution(activeRemoteState.accounts);
    const checking = dist.find(d => d.type === 'checking');
    const cash = dist.find(d => d.type === 'cash');
    const savings = dist.find(d => d.type === 'savings');
    const investment = dist.find(d => d.type === 'investment');

    expect(checking?.totalBalance).toBe(2500);
    expect(cash?.totalBalance).toBe(1500);
    expect(savings?.totalBalance).toBe(500);
    expect(investment?.totalBalance).toBe(0);
    expect(investment?.count).toBe(0);

    const depsAcc1 = getAccountDependencies('acc-1', {
      transactions: activeRemoteState.transactions,
      creditCards: activeRemoteState.creditCards,
      recurringIncomes: activeRemoteState.recurringIncomes || [],
      debts: activeRemoteState.debts
    });
    expect(depsAcc1.transactionsCount).toBe(1);
    expect(depsAcc1.recurringIncomesCount).toBe(1);
    expect(depsAcc1.totalCount).toBe(2);

    const depsAcc3 = getAccountDependencies('acc-3', {
      transactions: activeRemoteState.transactions,
      creditCards: activeRemoteState.creditCards,
      recurringIncomes: activeRemoteState.recurringIncomes || [],
      debts: activeRemoteState.debts
    });
    expect(depsAcc3.totalCount).toBe(0);

    expect(parseCurrencyInput('1.250,50')).toBeCloseTo(1250.5);
    expect(parseCurrencyInput('-300,25')).toBeCloseTo(-300.25);
  });

  it('posiciona Minhas Contas imediatamente abaixo do Dashboard nos menus e cabeçalho', async () => {
    const onTabChange = vi.fn();

    await act(async () => {
      root.render(
        <FinanceProvider>
          <Header currentTab="accounts" />
          <Sidebar currentTab="accounts" setCurrentTab={onTabChange} />
          <MobileModuleBar currentTab="accounts" setCurrentTab={onTabChange} />
          <MobileDrawer
            isOpen={true}
            onClose={vi.fn()}
            currentTab="accounts"
            setCurrentTab={onTabChange}
          />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    // Header exibe Minhas Contas
    const headerHeadings = Array.from(container.querySelectorAll('header h1')).map(
      el => el.textContent?.trim()
    );
    expect(headerHeadings).toContain('Minhas Contas');

    // Ordem na Sidebar
    const sidebarLabels = Array.from(container.querySelectorAll('aside nav button')).map(
      b => b.textContent?.trim()
    );
    expect(sidebarLabels.slice(0, 5)).toEqual([
      'Dashboard',
      'Minhas Contas',
      'Extrato Geral',
      'Entradas',
      'Despesas'
    ]);

    // Ordem na MobileModuleBar
    const ribbonButtons = Array.from(container.querySelectorAll('div.lg\\:hidden button')).map(
      b => b.textContent?.trim()
    );
    const dashboardIdx = ribbonButtons.indexOf('Dashboard');
    expect(ribbonButtons.slice(dashboardIdx, dashboardIdx + 5)).toEqual([
      'Dashboard',
      'Minhas Contas',
      'Extrato',
      'Entradas',
      'Despesas'
    ]);

    // Ordem no MobileDrawer
    const drawerLabels = Array.from(container.querySelectorAll('div.fixed nav button')).map(
      b => b.querySelector('div.text-xs')?.textContent?.trim()
    );
    expect(drawerLabels.slice(0, 5)).toEqual([
      'Dashboard Principal',
      'Minhas Contas',
      'Extrato Geral',
      'Entradas Financeiras',
      'Despesas Fixas & Variáveis'
    ]);

    // Atalho "Saldo em Contas" da Sidebar leva a 'accounts'
    await act(async () => {
      clickButtonByText(container.querySelector('aside')!, 'Saldo em Contas');
    });
    expect(onTabChange).toHaveBeenCalledWith('accounts');
  });

  it('redireciona atalhos do Dashboard e de Configurações para o módulo Minhas Contas', async () => {
    const onTabChange = vi.fn();

    await act(async () => {
      root.render(
        <FinanceProvider>
          <DashboardView setCurrentTab={onTabChange} />
          <SettingsView onNavigateToAccounts={() => onTabChange('accounts')} />
        </FinanceProvider>
      );
    });
    await flushMicrotasks();

    // Card Hero "Patrimônio Líquido em Contas" -> 'accounts'
    const heroCard = Array.from(container.querySelectorAll('div')).find(
      el =>
        el.textContent?.includes('Patrimônio Líquido em Contas') &&
        el.className.includes('cursor-pointer')
    );
    expect(heroCard).toBeTruthy();
    await act(async () => {
      heroCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onTabChange).toHaveBeenLastCalledWith('accounts');

    // KPI Card "1. Saldo Total" -> 'accounts'
    const kpiCard = Array.from(container.querySelectorAll('div')).find(
      el =>
        el.textContent?.includes('1. Saldo Total') &&
        el.className.includes('cursor-pointer')
    );
    expect(kpiCard).toBeTruthy();
    await act(async () => {
      kpiCard!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onTabChange).toHaveBeenLastCalledWith('accounts');

    // Botão "Gerenciar" em "Minhas Contas & Carteiras" -> 'accounts'
    await act(async () => {
      clickButtonByText(container, 'Gerenciar');
    });
    expect(onTabChange).toHaveBeenLastCalledWith('accounts');

    // SettingsView exibe card enxuto sem a antiga seção pesada e navega ao clicar
    expect(container.textContent).not.toContain('Contas Bancárias, Carteiras e Dinheiro Vivo');
    expect(container.textContent).toContain(
      'Gerencie suas contas bancárias, carteiras e dinheiro em espécie.'
    );
    await act(async () => {
      clickButtonByText(container, 'Gerenciar minhas contas');
    });
    expect(onTabChange).toHaveBeenLastCalledWith('accounts');
  });

  it('mantém saldo consolidado idêntico ao Dashboard e permite criar, editar, transferir, filtrar extrato e proteger exclusão', async () => {
    let financeRef: FinanceContextType | null = null;
    const ContextCapture: React.FC = () => {
      financeRef = useFinance();
      return null;
    };

    const Harness: React.FC = () => {
      const [tab, setTab] = React.useState<'accounts' | 'transactions'>('accounts');
      const [txAccFilter, setTxAccFilter] = React.useState('all');

      return (
        <FinanceProvider>
          <ContextCapture />
          {tab === 'accounts' ? (
            <AccountsView
              onViewAccountTransactions={accId => {
                setTxAccFilter(accId);
                setTab('transactions');
              }}
            />
          ) : (
            <TransactionsView
              accountFilter={txAccFilter}
              onAccountFilterChange={setTxAccFilter}
            />
          )}
        </FinanceProvider>
      );
    };

    await act(async () => {
      root.render(<Harness />);
    });
    await flushMicrotasks();

    // 1. Coerência financeira: 2500 + 1500 + 500 = 4500 (sem incluir receita futura de 5000)
    const consolidatedEl = container.querySelector('[data-testid="accounts-consolidated-balance"]');
    const countEl = container.querySelector('[data-testid="accounts-total-count"]');
    expect(consolidatedEl?.textContent).toContain('4.500,00');
    expect(countEl?.textContent).toContain('3 contas');
    expect(financeRef!.totalBankBalance).toBe(4500);

    // 2. Criar nova conta (+ Nova Conta) e verificar acessibilidade de id/name/htmlFor
    await act(async () => {
      clickButtonByText(container, '+ Nova Conta');
    });

    const formInputs = Array.from(document.body.querySelectorAll('form input, form select')) as Array<
      HTMLInputElement | HTMLSelectElement
    >;
    const seenIds = new Set<string>();
    for (const el of formInputs) {
      expect(el.id).toBeTruthy();
      expect(el.name).toBeTruthy();
      expect(seenIds.has(el.id)).toBe(false);
      seenIds.add(el.id);
      const hasLabel =
        Boolean(document.body.querySelector(`label[for="${el.id}"]`)) ||
        Boolean(el.getAttribute('aria-label'));
      expect(hasLabel).toBe(true);
    }

    const nameInput = document.body.querySelector('input[name="account_name"]') as HTMLInputElement;
    const typeSelect = document.body.querySelector('select[name="account_type"]') as HTMLSelectElement;
    const balanceInput = document.body.querySelector('input[name="account_balance"]') as HTMLInputElement;
    const institutionInput = document.body.querySelector('input[name="account_institution"]') as HTMLInputElement;

    await act(async () => {
      setInputValue(nameInput, 'Conta Investimentos Beta');
      setInputValue(typeSelect, 'investment');
      setInputValue(balanceInput, '1000,00');
      setInputValue(institutionInput, 'Corretora Beta');
    });

    await act(async () => {
      clickButtonByText(document.body, 'Cadastrar Conta');
    });
    await flushMicrotasks();

    expect(financeRef!.accounts).toHaveLength(4);
    expect(financeRef!.totalBankBalance).toBe(5500);
    expect(
      container.querySelector('[data-testid="accounts-consolidated-balance"]')?.textContent
    ).toContain('5.500,00');

    // 3. Editar conta existente
    const editBtn = container.querySelector(
      'button[aria-label="Editar conta Carteira Física"]'
    ) as HTMLButtonElement;
    await act(async () => {
      editBtn.click();
    });

    const editNameInput = document.body.querySelector('input[name="account_name"]') as HTMLInputElement;
    const editBalInput = document.body.querySelector('input[name="account_balance"]') as HTMLInputElement;
    await act(async () => {
      setInputValue(editNameInput, 'Dinheiro em Casa');
      setInputValue(editBalInput, '1600,00');
    });
    await act(async () => {
      clickButtonByText(document.body, 'Salvar Alterações');
    });
    await flushMicrotasks();

    expect(financeRef!.accounts.find(a => a.id === 'acc-2')?.name).toBe('Dinheiro em Casa');
    expect(financeRef!.totalBankBalance).toBe(5600);

    // 4. Transferência entre contas (não altera saldo consolidado total)
    await act(async () => {
      clickButtonByText(container, 'Transferir');
    });
    const sourceSel = document.body.querySelector(
      'select[name="transfer_source_account"]'
    ) as HTMLSelectElement;
    const targetSel = document.body.querySelector(
      'select[name="transfer_target_account"]'
    ) as HTMLSelectElement;
    const amountInp = document.body.querySelector(
      'input[name="transfer_amount"]'
    ) as HTMLInputElement;

    await act(async () => {
      setInputValue(sourceSel, 'acc-1');
      setInputValue(targetSel, 'acc-2');
      setInputValue(amountInp, '300,00');
    });
    await act(async () => {
      clickButtonByText(document.body, 'Confirmar Transferência');
    });
    await flushMicrotasks();

    expect(financeRef!.accounts.find(a => a.id === 'acc-1')?.balance).toBe(2200);
    expect(financeRef!.accounts.find(a => a.id === 'acc-2')?.balance).toBe(1900);
    expect(financeRef!.totalBankBalance).toBe(5600);

    // 5. Proteção contra exclusão de conta com movimentações vinculadas (acc-1)
    const delAcc1Btn = container.querySelector(
      'button[aria-label="Excluir conta Conta Corrente Alfa"]'
    ) as HTMLButtonElement;
    await act(async () => {
      delAcc1Btn.click();
    });
    expect(document.body.textContent).toContain('Exclusão Protegida');
    expect(financeRef!.accounts.some(a => a.id === 'acc-1')).toBe(true);
    await act(async () => {
      clickButtonByText(document.body, 'Entendi');
    });

    // 6. Exclusão segura de conta sem vínculos (acc-3)
    const delAcc3Btn = container.querySelector(
      'button[aria-label="Excluir conta Reserva Sem Vínculos"]'
    ) as HTMLButtonElement;
    await act(async () => {
      delAcc3Btn.click();
    });
    expect(document.body.textContent).toContain('Deseja excluir esta conta?');
    await act(async () => {
      clickButtonByText(document.body, 'Confirmar Exclusão');
    });
    await flushMicrotasks();

    expect(financeRef!.accounts.some(a => a.id === 'acc-3')).toBe(false);
    expect(financeRef!.totalBankBalance).toBe(5100);

    // 7. Atalho "Movimentações" abre Extrato Geral já filtrado pela conta
    const viewMovsBtn = container.querySelector(
      'button[aria-label="Ver movimentações de Conta Corrente Alfa"]'
    ) as HTMLButtonElement;
    await act(async () => {
      viewMovsBtn.click();
    });
    await flushMicrotasks();

    const accountFilterEl = container.querySelector(
      'select[name="transactions_account_filter"]'
    ) as HTMLSelectElement;
    expect(accountFilterEl).toBeTruthy();
    expect(accountFilterEl.value).toBe('acc-1');
    expect(container.textContent).toContain('Recebimento Sintético');
    expect(container.textContent).not.toContain('Compra Dinheiro');
  });
});
