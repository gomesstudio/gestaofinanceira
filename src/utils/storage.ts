/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BankAccount, Category, CreditCard, Debt, FinancialGoal, RecurringIncomeRule, Transaction } from '../types/finance';

export const DEFAULT_CATEGORIES: Category[] = [
  // Renda Principal
  { id: 'cat-salario', name: 'Salário', type: 'income', incomeGroup: 'main_income', color: '#10b981', icon: 'Briefcase' },
  { id: 'cat-adiantamento', name: 'Adiantamento salarial', type: 'income', incomeGroup: 'main_income', color: '#059669', icon: 'Coins' },
  { id: 'cat-horas-extras', name: 'Horas extras', type: 'income', incomeGroup: 'main_income', color: '#34d399', icon: 'Clock' },
  { id: 'cat-outros-trabalho', name: 'Outros do trabalho', type: 'income', incomeGroup: 'main_income', color: '#047857', icon: 'Building' },

  // Benefícios e Rendas Adicionais
  { id: 'cat-decimo-terceiro', name: '13º salário', type: 'income', incomeGroup: 'benefits', color: '#0284c7', icon: 'Gift' },
  { id: 'cat-plr', name: 'PLR / Bônus', type: 'income', incomeGroup: 'benefits', color: '#0369a1', icon: 'Award' },
  { id: 'cat-ferias', name: 'Férias', type: 'income', incomeGroup: 'benefits', color: '#38bdf8', icon: 'Palmtree' },
  { id: 'cat-bonificacoes', name: 'Bonificações', type: 'income', incomeGroup: 'benefits', color: '#0ea5e9', icon: 'Trophy' },
  { id: 'cat-vale-beneficios', name: 'Benefícios (VR/VA)', type: 'income', incomeGroup: 'benefits', color: '#60a5fa', icon: 'Utensils' },
  { id: 'cat-comissoes', name: 'Comissões', type: 'income', incomeGroup: 'benefits', color: '#2563eb', icon: 'TrendingUp' },

  // Entradas Extras
  { id: 'cat-freelance', name: 'Trabalhos por fora', type: 'income', incomeGroup: 'extra_income', color: '#8b5cf6', icon: 'Laptop' },
  { id: 'cat-servicos-particulares', name: 'Serviços particulares', type: 'income', incomeGroup: 'extra_income', color: '#7c3aed', icon: 'Wrench' },
  { id: 'cat-vendas', name: 'Vendas', type: 'income', incomeGroup: 'extra_income', color: '#a855f7', icon: 'ShoppingBag' },
  { id: 'cat-presentes-rec', name: 'Presentes recebidos', type: 'income', incomeGroup: 'extra_income', color: '#c084fc', icon: 'Heart' },
  { id: 'cat-reembolsos', name: 'Reembolsos', type: 'income', incomeGroup: 'extra_income', color: '#9333ea', icon: 'RotateCcw' },
  { id: 'cat-outras-entradas', name: 'Outras entradas', type: 'income', incomeGroup: 'extra_income', color: '#6d28d9', icon: 'PlusCircle' },

  // Despesas Fixas
  { id: 'cat-aluguel', name: 'Aluguel / Habitação', type: 'expense', expenseType: 'fixed', color: '#e11d48', icon: 'Home' },
  { id: 'cat-agua', name: 'Água e Esgoto', type: 'expense', expenseType: 'fixed', color: '#0284c7', icon: 'Droplet' },
  { id: 'cat-energia', name: 'Energia elétrica', type: 'expense', expenseType: 'fixed', color: '#eab308', icon: 'Zap' },
  { id: 'cat-internet', name: 'Internet e TV', type: 'expense', expenseType: 'fixed', color: '#6366f1', icon: 'Wifi' },
  { id: 'cat-telefone', name: 'Telefonia / Celular', type: 'expense', expenseType: 'fixed', color: '#4f46e5', icon: 'Smartphone' },
  { id: 'cat-academia', name: 'Academia / Saúde', type: 'expense', expenseType: 'fixed', color: '#14b8a6', icon: 'Activity' },
  { id: 'cat-assinaturas', name: 'Assinaturas e Streaming', type: 'expense', expenseType: 'fixed', color: '#ec4899', icon: 'Tv' },
  { id: 'cat-parcelamentos', name: 'Parcelamentos fixos', type: 'expense', expenseType: 'fixed', color: '#f97316', icon: 'Layers' },
  { id: 'cat-outras-fixas', name: 'Outras despesas fixas', type: 'expense', expenseType: 'fixed', color: '#94a3b8', icon: 'Calendar' },

  // Despesas Variáveis
  { id: 'cat-alimentacao', name: 'Alimentação', type: 'expense', expenseType: 'variable', color: '#f59e0b', icon: 'Utensils' },
  { id: 'cat-supermercado', name: 'Supermercado', type: 'expense', expenseType: 'variable', color: '#d97706', icon: 'ShoppingCart' },
  { id: 'cat-lanches', name: 'Lanches e Delivery', type: 'expense', expenseType: 'variable', color: '#b45309', icon: 'Coffee' },
  { id: 'cat-transporte', name: 'Transporte / Uber', type: 'expense', expenseType: 'variable', color: '#06b6d4', icon: 'Navigation' },
  { id: 'cat-combustivel', name: 'Combustível', type: 'expense', expenseType: 'variable', color: '#0891b2', icon: 'Fuel' },
  { id: 'cat-compras-pessoais', name: 'Compras pessoais', type: 'expense', expenseType: 'variable', color: '#84cc16', icon: 'Package' },
  { id: 'cat-lazer', name: 'Lazer e Passeios', type: 'expense', expenseType: 'variable', color: '#ec4899', icon: 'Smile' },
  { id: 'cat-farmacia', name: 'Farmácia e Medicamentos', type: 'expense', expenseType: 'variable', color: '#ef4444', icon: 'ShieldAlert' },
  { id: 'cat-presentes-dados', name: 'Presentes dados', type: 'expense', expenseType: 'variable', color: '#f43f5e', icon: 'Gift' },
  { id: 'cat-manutencao', name: 'Manutenção da casa/carro', type: 'expense', expenseType: 'variable', color: '#78716c', icon: 'Wrench' },
  { id: 'cat-outras-variaveis', name: 'Outras despesas variáveis', type: 'expense', expenseType: 'variable', color: '#64748b', icon: 'MoreHorizontal' },
];

export const DEFAULT_ACCOUNTS: BankAccount[] = [
  { id: 'acc-1', name: 'Conta Principal (Nubank)', type: 'checking', balance: 3450.00, color: '#820ad1', institution: 'Nubank' },
  { id: 'acc-2', name: 'Conta Salário (Itaú)', type: 'checking', balance: 1200.00, color: '#ec7000', institution: 'Itaú' },
  { id: 'acc-3', name: 'Carteira (Dinheiro Vivo)', type: 'cash', balance: 250.00, color: '#16a34a', institution: 'Dinheiro' },
  { id: 'acc-4', name: 'Reserva Financeira / Poupança', type: 'savings', balance: 4500.00, color: '#0284c7', institution: 'Nubank Guardado' },
];

export const DEFAULT_CARDS: CreditCard[] = [
  { id: 'card-1', name: 'Nubank Ultravioleta', color: '#820ad1', limitTotal: 5000.00, closingDay: 20, dueDay: 27, linkedAccountId: 'acc-1' },
  { id: 'card-2', name: 'Itaú Click Visa', color: '#ec7000', limitTotal: 3000.00, closingDay: 5, dueDay: 12, linkedAccountId: 'acc-2' },
];

export const DEFAULT_DEBTS: Debt[] = [
  {
    id: 'debt-1',
    name: 'Empréstimo Pessoal Reorganização',
    creditor: 'Caixa Econômica',
    originalAmount: 8500.00,
    currentBalance: 5200.00,
    contractDate: '2026-03-10',
    dueDate: '2026-11-20',
    interestRateMonthly: 1.95,
    minimumPayment: 380.00,
    priority: 'high',
    status: 'in_payment',
    notes: 'Negociação com parcelas fixas debitadas no dia 20.',
    totalPaid: 3300.00,
    paymentsHistory: [
      { id: 'pay-1', date: '2026-09-20', amount: 380, accountId: 'acc-1', notes: 'Parcela 07/24' },
      { id: 'pay-2', date: '2026-10-20', amount: 380, accountId: 'acc-1', notes: 'Parcela 08/24' },
    ]
  },
  {
    id: 'debt-2',
    name: 'Cartão de Loja Antigo em Negociação',
    creditor: 'Banco Pan / Riachuelo',
    originalAmount: 1850.00,
    currentBalance: 1200.00,
    contractDate: '2025-11-15',
    dueDate: '2026-11-30',
    interestRateMonthly: 0,
    minimumPayment: 200.00,
    priority: 'medium',
    status: 'in_negotiation',
    notes: 'Aguardando proposta com desconto no Serasa Limpa Nome.',
    totalPaid: 650.00,
    paymentsHistory: []
  }
];

export const DEFAULT_GOALS: FinancialGoal[] = [
  {
    id: 'goal-1',
    name: 'Reserva de Emergência (6 meses)',
    targetAmount: 18000.00,
    currentAmount: 4500.00,
    deadlineDate: '2027-12-31',
    monthlyPlannedContribution: 500.00,
    category: 'Segurança',
    color: '#10b981',
    icon: 'ShieldCheck'
  },
  {
    id: 'goal-2',
    name: 'Troca de Notebook para Trabalho',
    targetAmount: 5000.00,
    currentAmount: 2200.00,
    deadlineDate: '2027-04-15',
    monthlyPlannedContribution: 400.00,
    category: 'Tecnologia',
    color: '#0284c7',
    icon: 'Laptop'
  },
  {
    id: 'goal-3',
    name: 'Viagem de Férias',
    targetAmount: 3500.00,
    currentAmount: 1100.00,
    deadlineDate: '2027-07-20',
    monthlyPlannedContribution: 300.00,
    category: 'Lazer',
    color: '#f59e0b',
    icon: 'Plane'
  }
];

export const DEFAULT_TRANSACTIONS: Transaction[] = [
  // Entradas mês atual (Novembro 2026)
  {
    id: 'tx-inc-1',
    description: 'Salário Mensal',
    amount: 5200.00,
    type: 'income',
    category: 'Salário',
    date: '2026-11-05',
    accountId: 'acc-2',
    paymentMethod: 'bank_transfer',
    status: 'paid',
    isRecurring: true,
    notes: 'Salário líquido após deduções em folha'
  },
  {
    id: 'tx-inc-2',
    description: 'Vale Refeição / Alimentação',
    amount: 850.00,
    type: 'income',
    category: 'Benefícios (VR/VA)',
    date: '2026-11-01',
    accountId: 'acc-1',
    paymentMethod: 'bank_transfer',
    status: 'paid',
    isRecurring: true
  },
  {
    id: 'tx-inc-3',
    description: 'Projeto Freelance Design UI',
    amount: 900.00,
    type: 'income',
    category: 'Trabalhos por fora',
    date: '2026-11-12',
    accountId: 'acc-1',
    paymentMethod: 'pix',
    status: 'pending',
    notes: 'Previsão de recebimento entrega final'
  },

  // Despesas Fixas mês atual
  {
    id: 'tx-fix-1',
    description: 'Aluguel do Apartamento',
    amount: 1400.00,
    type: 'expense_fixed',
    category: 'Aluguel / Habitação',
    date: '2026-11-10',
    dueDate: '2026-11-10',
    accountId: 'acc-1',
    paymentMethod: 'bank_slip',
    status: 'pending',
    isRecurring: true
  },
  {
    id: 'tx-fix-2',
    description: 'Condomínio e IPTU',
    amount: 380.00,
    type: 'expense_fixed',
    category: 'Aluguel / Habitação',
    date: '2026-11-10',
    dueDate: '2026-11-10',
    accountId: 'acc-1',
    paymentMethod: 'bank_slip',
    status: 'pending',
    isRecurring: true
  },
  {
    id: 'tx-fix-3',
    description: 'Energia Elétrica (Enel)',
    amount: 145.30,
    type: 'expense_fixed',
    category: 'Energia elétrica',
    date: '2026-11-15',
    dueDate: '2026-11-15',
    accountId: 'acc-1',
    paymentMethod: 'pix',
    status: 'pending',
    isRecurring: true
  },
  {
    id: 'tx-fix-4',
    description: 'Internet Fibra Óptica 600Mb',
    amount: 119.90,
    type: 'expense_fixed',
    category: 'Internet e TV',
    date: '2026-11-08',
    dueDate: '2026-11-08',
    accountId: 'acc-1',
    paymentMethod: 'pix',
    status: 'paid',
    isRecurring: true
  },
  {
    id: 'tx-fix-5',
    description: 'Academia SmartFit',
    amount: 129.90,
    type: 'expense_fixed',
    category: 'Academia / Saúde',
    date: '2026-11-01',
    dueDate: '2026-11-01',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'paid',
    isRecurring: true
  },
  {
    id: 'tx-fix-6',
    description: 'Plano Celular Claro Controle',
    amount: 54.90,
    type: 'expense_fixed',
    category: 'Telefonia / Celular',
    date: '2026-11-05',
    dueDate: '2026-11-05',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'paid',
    isRecurring: true
  },

  // Despesas Variáveis
  {
    id: 'tx-var-1',
    description: 'Compras Quinzenais Supermercado',
    amount: 485.40,
    type: 'expense_variable',
    category: 'Supermercado',
    date: '2026-11-06',
    accountId: 'acc-1',
    paymentMethod: 'debit_card',
    status: 'paid',
    notes: 'Carnes, produtos de higiene e limpeza'
  },
  {
    id: 'tx-var-2',
    description: 'Combustível Posto Shell',
    amount: 180.00,
    type: 'expense_variable',
    category: 'Combustível',
    date: '2026-11-07',
    accountId: 'acc-1',
    paymentMethod: 'pix',
    status: 'paid'
  },
  {
    id: 'tx-var-3',
    description: 'Almoço Restaurante Por Quilo',
    amount: 38.50,
    type: 'expense_variable',
    category: 'Alimentação',
    date: '2026-11-07',
    accountId: 'acc-3',
    paymentMethod: 'money',
    status: 'paid'
  },
  {
    id: 'tx-var-4',
    description: 'Farmácia Remédios Antialérgicos',
    amount: 62.80,
    type: 'expense_variable',
    category: 'Farmácia e Medicamentos',
    date: '2026-11-04',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'paid'
  },
  {
    id: 'tx-var-5',
    description: 'Jantar Pizzaria Família',
    amount: 115.00,
    type: 'expense_variable',
    category: 'Lanches e Delivery',
    date: '2026-11-02',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'paid'
  },
  {
    id: 'tx-var-6',
    description: 'Bala e chiclete na padaria',
    amount: 2.50,
    type: 'expense_variable',
    category: 'Alimentação',
    date: '2026-11-08',
    accountId: 'acc-3',
    paymentMethod: 'money',
    status: 'paid'
  },

  // Parcelamento no Cartão (Exemplo real de parcelas)
  {
    id: 'tx-inst-1',
    description: 'Tênis de Corrida (Parcela 02/05)',
    amount: 89.90,
    type: 'expense_variable',
    category: 'Compras pessoais',
    date: '2026-11-03',
    dueDate: '2026-11-27',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'paid',
    installmentInfo: { current: 2, total: 5, groupId: 'tenis-corrida' }
  },
  {
    id: 'tx-inst-2',
    description: 'Tênis de Corrida (Parcela 03/05)',
    amount: 89.90,
    type: 'expense_variable',
    category: 'Compras pessoais',
    date: '2026-12-03',
    dueDate: '2026-12-27',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'pending',
    installmentInfo: { current: 3, total: 5, groupId: 'tenis-corrida' }
  },
  {
    id: 'tx-inst-3',
    description: 'Tênis de Corrida (Parcela 04/05)',
    amount: 89.90,
    type: 'expense_variable',
    category: 'Compras pessoais',
    date: '2027-01-03',
    dueDate: '2027-01-27',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'pending',
    installmentInfo: { current: 4, total: 5, groupId: 'tenis-corrida' }
  },
  {
    id: 'tx-inst-4',
    description: 'Tênis de Corrida (Parcela 05/05)',
    amount: 89.90,
    type: 'expense_variable',
    category: 'Compras pessoais',
    date: '2027-02-03',
    dueDate: '2027-02-27',
    creditCardId: 'card-1',
    paymentMethod: 'credit_card',
    status: 'pending',
    installmentInfo: { current: 5, total: 5, groupId: 'tenis-corrida' }
  },

  // Mês anterior (Outubro 2026) para permitir comparações inteligentes
  {
    id: 'tx-oct-inc',
    description: 'Salário Outubro',
    amount: 5200.00,
    type: 'income',
    category: 'Salário',
    date: '2026-10-05',
    accountId: 'acc-2',
    paymentMethod: 'bank_transfer',
    status: 'paid'
  },
  {
    id: 'tx-oct-exp-1',
    description: 'Aluguel Outubro',
    amount: 1400.00,
    type: 'expense_fixed',
    category: 'Aluguel / Habitação',
    date: '2026-10-10',
    accountId: 'acc-1',
    paymentMethod: 'bank_slip',
    status: 'paid'
  },
  {
    id: 'tx-oct-exp-2',
    description: 'Supermercado Total Outubro',
    amount: 720.00,
    type: 'expense_variable',
    category: 'Supermercado',
    date: '2026-10-18',
    accountId: 'acc-1',
    paymentMethod: 'debit_card',
    status: 'paid'
  },
  {
    id: 'tx-oct-exp-3',
    description: 'Energia Elétrica Outubro',
    amount: 130.00,
    type: 'expense_fixed',
    category: 'Energia elétrica',
    date: '2026-10-15',
    accountId: 'acc-1',
    paymentMethod: 'pix',
    status: 'paid'
  }
];

export interface AppState {
  ownerUserId?: string;
  version: number;
  lastModified?: number; // Timestamp epoch em ms para ordenação e prevenção de conflitos
  transactions: Transaction[];
  categories: Category[];
  accounts: BankAccount[];
  creditCards: CreditCard[];
  debts: Debt[];
  goals: FinancialGoal[];
  recurringIncomes?: RecurringIncomeRule[];
  safetyReserveDesired: number; // Reserva que deseja preservar
  isSampleLoaded: boolean;
}

export interface LegacyStorageSummary {
  exists: boolean;
  ownershipVerified: boolean;
  accessBlocked: boolean;
  requiresAdminRecovery: boolean;
  rawSizeBytes: number;
  transactionsCount: number;
  accountsCount: number;
  debtsCount: number;
  goalsCount: number;
  lastModified?: number;
  isSampleLoaded: boolean;
}

export const LEGACY_STORAGE_KEY = 'finance_pro_app_state_v1';
export const USER_STORAGE_KEY_PREFIX = 'finance_pro_app_state_';
export const USER_RECOVERY_KEY_PREFIX = 'finance_pro_recovery_';
export const LEGACY_DISMISSED_KEY_PREFIX = 'finance_pro_legacy_dismissed_';

const STORAGE_UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidStorageUserId(userId?: string | null): userId is string {
  return typeof userId === 'string' && STORAGE_UUID_REGEX.test(userId);
}

export function getUserStorageKey(userId: string): string {
  if (!isValidStorageUserId(userId)) {
    throw new Error('Identificador de usuário inválido para chave de armazenamento local.');
  }
  return `${USER_STORAGE_KEY_PREFIX}${userId}`;
}

export function getUserRecoveryKey(userId: string): string {
  if (!isValidStorageUserId(userId)) {
    throw new Error('Identificador de usuário inválido para chave de recuperação.');
  }
  return `${USER_RECOVERY_KEY_PREFIX}${userId}`;
}

/**
 * Estado neutro inicial enquanto a sessão e os dados do usuário estão sendo hidratados.
 * Nunca contém lançamentos ou saldos financeiros de nenhum usuário.
 */
export function createNeutralLoadingState(userId?: string): AppState {
  return {
    ownerUserId: isValidStorageUserId(userId) ? userId : undefined,
    version: 0,
    lastModified: 0,
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    accounts: [],
    creditCards: [],
    debts: [],
    goals: [],
    recurringIncomes: [],
    safetyReserveDesired: 0,
    isSampleLoaded: false,
  };
}

/**
 * Estado inicial limpo para um usuário autenticado novo sem registro prévio na nuvem.
 * Mantém lastModified: 0 para não se sobrepor indevidamente a dados remotos.
 */
export function createCleanUserState(userId: string): AppState {
  if (!isValidStorageUserId(userId)) {
    throw new Error('UUID de usuário obrigatório para criar estado inicial.');
  }
  return {
    ownerUserId: userId,
    version: 1,
    lastModified: 0,
    transactions: [],
    categories: DEFAULT_CATEGORIES,
    accounts: [
      { id: 'acc-1', name: 'Conta Corrente Principal', type: 'checking', balance: 0, color: '#3b82f6', institution: 'Banco' },
      { id: 'acc-2', name: 'Carteira (Dinheiro)', type: 'cash', balance: 0, color: '#10b981', institution: 'Dinheiro' },
    ],
    creditCards: [
      { id: 'card-1', name: 'Meu Cartão Principal', color: '#6366f1', limitTotal: 2000, closingDay: 20, dueDay: 27 },
    ],
    debts: [],
    goals: [],
    recurringIncomes: [],
    safetyReserveDesired: 1000.00,
    isSampleLoaded: false,
  };
}

/**
 * Lê exclusivamente o cache local pertencente ao userId autenticado.
 * Nunca lê a chave legada global e rejeita estados com ownerUserId divergente.
 */
export function getUserStateFromStorage(userId: string): AppState | null {
  if (!isValidStorageUserId(userId)) {
    return null;
  }

  try {
    const key = getUserStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.categories)) {
      return null;
    }

    // Rejeita se o cache estiver explicitamente marcado com outro proprietário
    if (parsed.ownerUserId && parsed.ownerUserId !== userId) {
      return null;
    }

    return {
      ...parsed,
      ownerUserId: userId,
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      lastModified: typeof parsed.lastModified === 'number' ? parsed.lastModified : 0,
    };
  } catch (err) {
    console.error('Erro ao ler cache local do usuário:', err);
    return null;
  }
}

/**
 * Grava o estado financeiro exclusivamente na chave vinculada ao userId autenticado.
 * Bloqueia gravação se o estado pertencer a outro usuário.
 */
export function saveStateToStorageForUser(userId: string, state: AppState): boolean {
  if (!isValidStorageUserId(userId)) {
    return false;
  }

  if (state.ownerUserId && state.ownerUserId !== userId) {
    console.warn('Bloqueada tentativa de salvar estado financeiro de outro proprietário no cache local.');
    return false;
  }

  try {
    const key = getUserStorageKey(userId);
    const stateToSave: AppState = {
      ...state,
      ownerUserId: userId,
      version: typeof state.version === 'number' && state.version > 0 ? state.version : 1,
      lastModified: typeof state.lastModified === 'number' ? state.lastModified : 0,
    };
    localStorage.setItem(key, JSON.stringify(stateToSave));
    return true;
  } catch (err) {
    console.error('Falha ao gravar cache local do usuário:', err);
    return false;
  }
}

/**
 * Salva snapshot individual de recuperação escopado por usuário antes de limpezas ou substituições.
 */
export function saveRecoverySnapshotForUser(userId: string, state: AppState, reason: string): boolean {
  if (!isValidStorageUserId(userId)) return false;
  if (state.ownerUserId && state.ownerUserId !== userId) return false;
  if (
    state.transactions.length === 0 &&
    state.debts.length === 0 &&
    state.goals.length === 0 &&
    (state.recurringIncomes?.length || 0) === 0
  ) {
    return false;
  }

  try {
    const recoveryKey = getUserRecoveryKey(userId);
    const payload = {
      savedAt: new Date().toISOString(),
      reason,
      ownerUserId: userId,
      state: {
        ...state,
        ownerUserId: userId,
      },
    };
    localStorage.setItem(recoveryKey, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

export function getRecoverySnapshotForUser(userId: string): { savedAt: string; reason: string; state: AppState } | null {
  if (!isValidStorageUserId(userId)) return null;
  try {
    const raw = localStorage.getItem(getUserRecoveryKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.ownerUserId !== userId || !parsed.state || !Array.isArray(parsed.state.transactions)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Limpa o cache ativo do usuário encerrado no logout (preservando snapshots individuais de recuperação
 * caso existam dados reais não sincronizados, e sem tocar na chave legada global).
 */
export function clearUserActiveCache(userId?: string | null): boolean {
  if (!isValidStorageUserId(userId)) return false;
  try {
    localStorage.removeItem(getUserStorageKey(userId));
    return true;
  } catch {
    return false;
  }
}

export function clearUserRecoverySnapshot(userId?: string | null): boolean {
  if (!isValidStorageUserId(userId)) return false;
  try {
    localStorage.removeItem(getUserRecoveryKey(userId));
    return true;
  } catch {
    return false;
  }
}

export function clearUserLegacyDismissedFlag(userId?: string | null): boolean {
  if (!isValidStorageUserId(userId)) return false;
  try {
    localStorage.removeItem(`${LEGACY_DISMISSED_KEY_PREFIX}${userId}`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Limpa estritamente as chaves locais pertencentes ao UUID do usuário informado.
 * Nunca toca na chave legada global, em chaves de outros usuários ou em preferências não sensíveis.
 */
export function clearAllLocalDataForUser(
  userId?: string | null,
  options?: { preserveRecoverySnapshot?: boolean }
): {
  activeCacheRemoved: boolean;
  recoverySnapshotRemoved: boolean;
  legacyDismissedRemoved: boolean;
} {
  if (!isValidStorageUserId(userId)) {
    return {
      activeCacheRemoved: false,
      recoverySnapshotRemoved: false,
      legacyDismissedRemoved: false,
    };
  }

  const activeCacheRemoved = clearUserActiveCache(userId);
  if (options?.preserveRecoverySnapshot) {
    return {
      activeCacheRemoved,
      recoverySnapshotRemoved: false,
      legacyDismissedRemoved: false,
    };
  }

  const recoverySnapshotRemoved = clearUserRecoverySnapshot(userId);
  const legacyDismissedRemoved = clearUserLegacyDismissedFlag(userId);
  return {
    activeCacheRemoved,
    recoverySnapshotRemoved,
    legacyDismissedRemoved,
  };
}

export function resetToCleanStateForUser(userId: string, currentVersion = 0): AppState {
  const clean = createCleanUserState(userId);
  const nextState: AppState = {
    ...clean,
    ownerUserId: userId,
    version: Math.max(1, currentVersion + 1),
    lastModified: Date.now(),
  };
  saveStateToStorageForUser(userId, nextState);
  return nextState;
}

export function resetToSampleStateForUser(userId: string, currentVersion = 0): AppState {
  if (!isValidStorageUserId(userId)) {
    throw new Error('UUID de usuário obrigatório.');
  }
  const sampleState: AppState = {
    ownerUserId: userId,
    version: Math.max(1, currentVersion + 1),
    lastModified: 0,
    transactions: DEFAULT_TRANSACTIONS,
    categories: DEFAULT_CATEGORIES,
    accounts: DEFAULT_ACCOUNTS,
    creditCards: DEFAULT_CARDS,
    debts: DEFAULT_DEBTS,
    goals: DEFAULT_GOALS,
    recurringIncomes: [],
    safetyReserveDesired: 2000.00,
    isSampleLoaded: true,
  };
  saveStateToStorageForUser(userId, sampleState);
  return sampleState;
}

/**
 * Inspeciona a chave legada global em modo SOMENTE LEITURA com bloqueio estrito de propriedade.
 * Se não houver ownerUserId comprovadamente idêntico ao usuário autenticado, bloqueia visualização,
 * exportação e importação, sinalizando necessidade de recuperação administrativa segura sem apagar a chave.
 */
export function inspectLegacyStorageState(
  authenticatedUserId?: string | null
): { summary: LegacyStorageSummary; state: AppState | null } {
  const emptySummary: LegacyStorageSummary = {
    exists: false,
    ownershipVerified: false,
    accessBlocked: false,
    requiresAdminRecovery: false,
    rawSizeBytes: 0,
    transactionsCount: 0,
    accountsCount: 0,
    debtsCount: 0,
    goalsCount: 0,
    isSampleLoaded: false,
  };

  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return { summary: emptySummary, state: null };

    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.transactions) || !Array.isArray(parsed.categories)) {
      return { summary: emptySummary, state: null };
    }

    const ownershipVerified =
      isValidStorageUserId(authenticatedUserId) &&
      isValidStorageUserId(parsed.ownerUserId) &&
      parsed.ownerUserId === authenticatedUserId;

    if (!ownershipVerified) {
      return {
        summary: {
          exists: true,
          ownershipVerified: false,
          accessBlocked: true,
          requiresAdminRecovery: true,
          rawSizeBytes: 0,
          transactionsCount: 0,
          accountsCount: 0,
          debtsCount: 0,
          goalsCount: 0,
          isSampleLoaded: false,
        },
        state: null,
      };
    }

    const transactionsCount = parsed.transactions.length;
    const accountsCount = Array.isArray(parsed.accounts) ? parsed.accounts.length : 0;
    const debtsCount = Array.isArray(parsed.debts) ? parsed.debts.length : 0;
    const goalsCount = Array.isArray(parsed.goals) ? parsed.goals.length : 0;
    const isSampleLoaded = Boolean(parsed.isSampleLoaded);

    return {
      summary: {
        exists: true,
        ownershipVerified: true,
        accessBlocked: false,
        requiresAdminRecovery: false,
        rawSizeBytes: raw.length,
        transactionsCount,
        accountsCount,
        debtsCount,
        goalsCount,
        lastModified: typeof parsed.lastModified === 'number' ? parsed.lastModified : undefined,
        isSampleLoaded,
      },
      state: {
        ...parsed,
        ownerUserId: authenticatedUserId,
      },
    };
  } catch {
    return { summary: emptySummary, state: null };
  }
}

export function exportLegacyStorageJson(authenticatedUserId?: string | null): string | null {
  try {
    const inspection = inspectLegacyStorageState(authenticatedUserId);
    if (!inspection.summary.exists || !inspection.summary.ownershipVerified) {
      return null;
    }
    return localStorage.getItem(LEGACY_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function isLegacyRecoveryDismissedForUser(userId: string): boolean {
  if (!isValidStorageUserId(userId)) return true;
  try {
    return localStorage.getItem(`${LEGACY_DISMISSED_KEY_PREFIX}${userId}`) === 'true';
  } catch {
    return false;
  }
}

export function dismissLegacyRecoveryPromptForUser(userId: string): void {
  if (!isValidStorageUserId(userId)) return;
  try {
    localStorage.setItem(`${LEGACY_DISMISSED_KEY_PREFIX}${userId}`, 'true');
  } catch {
    // ignore
  }
}
