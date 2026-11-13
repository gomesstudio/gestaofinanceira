/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import {
  BankAccount,
  Category,
  CreditCard,
  DateFilter,
  Debt,
  FinancialGoal,
  FutureCommitmentItem,
  MonthProjection,
  PurchaseSimulationResult,
  Transaction
} from '../types/finance';
import {
  getInitialState,
  resetToCleanState,
  resetToSampleState,
  saveStateToStorage
} from '../utils/storage';
import { getTodayISO, MONTH_NAMES_PT, MONTH_NAMES_SHORT_PT } from '../utils/formatters';
import {
  fetchFinanceDataFromSupabase,
  saveFinanceDataToSupabase,
  testSupabaseConnection,
  migrateAndVerifyFinanceData,
  resolveMultiDeviceConflict,
  runFullSupabaseDiagnostic,
  DiagnosticResult
} from '../services/supabaseSyncService';
import { useAuth } from './AuthContext';

export interface SmartAlert {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  metric?: string;
}

export interface FinanceContextType {
  // Data
  transactions: Transaction[];
  categories: Category[];
  accounts: BankAccount[];
  creditCards: CreditCard[];
  debts: Debt[];
  goals: FinancialGoal[];
  safetyReserveDesired: number;
  filter: DateFilter;
  theme: 'light' | 'dark';
  isSampleLoaded: boolean;
  
  // Quick Entry Modal State
  isQuickEntryOpen: boolean;
  quickEntryType: 'income' | 'expense' | 'all';
  openQuickEntry: (type?: 'income' | 'expense' | 'all') => void;
  closeQuickEntry: () => void;

  // Actions
  setFilter: React.Dispatch<React.SetStateAction<DateFilter>>;
  setSafetyReserveDesired: (val: number) => void;
  toggleTheme: () => void;
  loadSampleData: () => void;
  resetAllData: () => void;
  importBackupJson: (jsonString: string) => boolean;
  exportBackupJson: () => string;

  // CRUD Transactions
  addTransaction: (tx: Omit<Transaction, 'id'>, installmentsCount?: number) => void;
  updateTransaction: (id: string, tx: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => void;
  duplicateTransaction: (id: string) => void;

  // Debts
  addDebt: (debt: Omit<Debt, 'id' | 'totalPaid' | 'paymentsHistory'>) => void;
  updateDebt: (id: string, debt: Partial<Debt>) => void;
  deleteDebt: (id: string) => void;
  amortizeDebt: (debtId: string, accountId: string, amount: number, date?: string, notes?: string) => void;

  // Credit Cards
  addCreditCard: (card: Omit<CreditCard, 'id'>) => void;
  updateCreditCard: (id: string, card: Partial<CreditCard>) => void;
  deleteCreditCard: (id: string) => void;
  payCreditCardInvoice: (cardId: string, accountId: string, amount: number, invoiceMonth: string) => void;
  getCardInvoiceAmount: (cardId: string, monthYear?: string) => number;

  // Accounts
  addAccount: (acc: Omit<BankAccount, 'id'>) => void;
  updateAccount: (id: string, acc: Partial<BankAccount>) => void;
  deleteAccount: (id: string) => void;
  transferBetweenAccounts: (sourceAccountId: string, targetAccountId: string, amount: number, date?: string, notes?: string) => void;

  // Categories
  addCategory: (cat: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, cat: Partial<Category>) => void;
  deleteCategory: (id: string) => boolean;

  // Goals
  addGoal: (goal: Omit<FinancialGoal, 'id' | 'currentAmount' | 'completed'>) => void;
  updateGoal: (id: string, goal: Partial<FinancialGoal>) => void;
  deleteGoal: (id: string) => void;
  contributeToGoal: (goalId: string, accountId: string, amount: number) => void;

  // Computed Values & KPIs
  filteredTransactions: Transaction[];
  totalBankBalance: number;
  totalIncomePeriod: number;
  totalExpensePeriod: number;
  totalFixedExpenses: number;
  totalVariableExpenses: number;
  totalPendingFixed: number;
  totalPendingVariable: number;
  totalActiveDebts: number;
  freeMoneyAvailable: number;
  incomeCommittedPercent: number;
  totalSavedPeriod: number;
  remainingSafeToSpend: number;
  smartAlerts: SmartAlert[];

  // Future Projections & Calendar Alignment
  selectedYear: number;
  selectedMonth: number; // 0-11
  isFutureView: boolean;
  isSpecificMonthView: boolean;
  currentSelectedMonthProjection: MonthProjection;
  nextMonthsProjections: MonthProjection[];
  next12MonthsProjections: MonthProjection[];
  goToNextMonth: () => void;
  goToPrevMonth: () => void;
  goToCurrentMonth: () => void;
  selectSpecificMonth: (year: number, month: number) => void;

  // Purchase Simulation
  simulatePurchase: (amount: number) => PurchaseSimulationResult;

  // Supabase Cloud Synchronization
  cloudSyncStatus: 'connected' | 'not_configured' | 'session_expired' | 'unauthenticated' | 'syncing' | 'synced' | 'table_missing' | 'error' | 'idle';
  cloudSyncMessage: string | null;
  lastCloudSyncDate: Date | null;
  syncNowWithCloud: () => Promise<void>;
  forceUploadLocalToCloud: () => Promise<void>;
  forceDownloadFromCloud: () => Promise<void>;
  runCloudDiagnostic: () => Promise<DiagnosticResult>;
  isCloudConnected: boolean;
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState(getInitialState);
  
  // Theme state
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const savedTheme = localStorage.getItem('finance_theme');
      if (savedTheme === 'dark' || savedTheme === 'light') return savedTheme;
      return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    } catch {
      return 'light';
    }
  });

  // Time filter state
  const [filter, setFilter] = useState<DateFilter>({
    period: 'current_month',
  });

  // Quick entry modal
  const [isQuickEntryOpen, setIsQuickEntryOpen] = useState(false);
  const [quickEntryType, setQuickEntryType] = useState<'income' | 'expense' | 'all'>('all');

  const openQuickEntry = (type: 'income' | 'expense' | 'all' = 'all') => {
    setQuickEntryType(type);
    setIsQuickEntryOpen(true);
  };

  const closeQuickEntry = () => {
    setIsQuickEntryOpen(false);
  };

  // Sync theme to <html> class
  useEffect(() => {
    try {
      const root = document.documentElement;
      if (theme === 'dark') {
        root.classList.add('dark');
      } else {
        root.classList.remove('dark');
      }
      localStorage.setItem('finance_theme', theme);
    } catch (e) {
      console.error(e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
  };

  // Save changes to storage
  useEffect(() => {
    saveStateToStorage(state);
  }, [state]);

  // Supabase Cloud Sync State
  const { supabaseUserId, isSupabaseAuthenticated, cloudAuthStatus } = useAuth();
  const [cloudSyncStatus, setCloudSyncStatus] = useState<'connected' | 'not_configured' | 'session_expired' | 'unauthenticated' | 'syncing' | 'synced' | 'table_missing' | 'error' | 'idle'>(() => {
    if (isSupabaseAuthenticated) return 'connected';
    if (cloudAuthStatus === 'session_expired') return 'session_expired';
    if (cloudAuthStatus === 'not_configured') return 'not_configured';
    return 'unauthenticated';
  });
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string | null>(null);
  const [lastCloudSyncDate, setLastCloudSyncDate] = useState<Date | null>(null);
  const isInitialMount = useRef(true);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Manual trigger to sync now
  const syncNowWithCloud = async () => {
    if (!supabaseUserId || !isSupabaseAuthenticated) {
      if (cloudAuthStatus === 'session_expired') {
        setCloudSyncStatus('session_expired');
      } else {
        setCloudSyncStatus('unauthenticated');
      }
      setCloudSyncMessage('Conecte sua conta Supabase em Configurações > Nuvem para sincronizar.');
      return;
    }

    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Sincronizando com Supabase via UUID autenticado...');

    const res = await saveFinanceDataToSupabase(state, supabaseUserId);
    if (res.success) {
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Sincronizado com sucesso na nuvem!');
      setLastCloudSyncDate(new Date());
    } else {
      if (res.code === '42P01') {
        setCloudSyncStatus('table_missing');
        setCloudSyncMessage('A tabela "user_finance_data" precisa ser criada no Supabase com RLS.');
      } else {
        setCloudSyncStatus('error');
        setCloudSyncMessage(res.message || 'Erro ao sincronizar.');
      }
    }
  };

  // Força o envio dos dados locais para a nuvem
  const forceUploadLocalToCloud = async () => {
    if (!supabaseUserId || !isSupabaseAuthenticated) {
      if (cloudAuthStatus === 'session_expired') {
        setCloudSyncStatus('session_expired');
      } else {
        setCloudSyncStatus('unauthenticated');
      }
      setCloudSyncMessage('Conecte sua conta Supabase em Configurações > Nuvem para sincronizar.');
      return;
    }

    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Enviando dados locais para a nuvem...');

    const res = await saveFinanceDataToSupabase(state, supabaseUserId);
    if (res.success) {
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Dados locais enviados e salvos na nuvem com sucesso!');
      setLastCloudSyncDate(new Date());
    } else {
      if (res.code === '42P01') {
        setCloudSyncStatus('table_missing');
        setCloudSyncMessage('A tabela "user_finance_data" precisa ser criada no Supabase com RLS.');
      } else {
        setCloudSyncStatus('error');
        setCloudSyncMessage(res.message || 'Erro ao enviar dados locais para o Supabase.');
      }
    }
  };

  // Força o download dos dados da nuvem para o dispositivo local
  const forceDownloadFromCloud = async () => {
    if (!supabaseUserId || !isSupabaseAuthenticated) {
      if (cloudAuthStatus === 'session_expired') {
        setCloudSyncStatus('session_expired');
      } else {
        setCloudSyncStatus('unauthenticated');
      }
      setCloudSyncMessage('Conecte sua conta Supabase em Configurações > Nuvem para sincronizar.');
      return;
    }

    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Buscando dados na nuvem...');

    const remote = await fetchFinanceDataFromSupabase(supabaseUserId);
    if (!remote.success) {
      if (remote.code === '42P01') {
        setCloudSyncStatus('table_missing');
        setCloudSyncMessage('A tabela "user_finance_data" precisa ser criada no Supabase com RLS.');
      } else {
        setCloudSyncStatus('error');
        setCloudSyncMessage(remote.message || 'Erro ao buscar dados na nuvem.');
      }
      return;
    }

    if (!remote.data) {
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Nenhum dado financeiro encontrado na nuvem para esta conta.');
      return;
    }

    const remoteTimestamp = remote.clientTimestamp || (remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0);
    const localTimestamp = state.lastModified || 0;

    if (localTimestamp > remoteTimestamp && (state.transactions.length > 0 || state.debts.length > 0)) {
      const confirmOverwrite = typeof window !== 'undefined'
        ? window.confirm('Seus dados locais são mais recentes que os da nuvem. Deseja sobrescrever os dados locais pelos dados da nuvem?')
        : true;
      if (!confirmOverwrite) {
        setCloudSyncStatus('connected');
        setCloudSyncMessage('Download cancelado para manter os dados locais mais recentes.');
        return;
      }
    }

    setState(remote.data);
    saveStateToStorage(remote.data);
    setCloudSyncStatus('connected');
    setCloudSyncMessage('Dados da nuvem baixados e aplicados com sucesso!');
    setLastCloudSyncDate(new Date());
  };

  // Executa diagnóstico completo de conexão, autenticação, leitura e gravação no Supabase
  const runCloudDiagnostic = async (): Promise<DiagnosticResult> => {
    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Executando diagnóstico de conexão e integridade no Supabase...');
    const result = await runFullSupabaseDiagnostic(state, supabaseUserId);
    if (result.allPassed) {
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Diagnóstico aprovado: Conexão, autenticação e gravação operacionais!');
      setLastCloudSyncDate(new Date());
    } else {
      const hasTableMissing = result.steps.some(s => s.name.includes('Tabela') && s.status === 'error');
      if (hasTableMissing) {
        setCloudSyncStatus('table_missing');
        setCloudSyncMessage('Tabela user_finance_data necessária no Supabase.');
      } else {
        const hasAuthIssue = result.steps.some(s => s.name.includes('Autenticação') && s.status !== 'success');
        if (hasAuthIssue) {
          setCloudSyncStatus(cloudAuthStatus === 'session_expired' ? 'session_expired' : 'unauthenticated');
        } else {
          setCloudSyncStatus('error');
        }
        const firstErr = result.steps.find(s => s.status === 'error' || s.status === 'warning');
        setCloudSyncMessage(firstErr?.message || 'Falha no diagnóstico.');
      }
    }
    return result;
  };

  // Initial cloud fetch, conflict detection, and verified auto-migration
  useEffect(() => {
    let isCancelled = false;

    async function initCloudSync() {
      if (!supabaseUserId || !isSupabaseAuthenticated) {
        if (cloudAuthStatus === 'session_expired') {
          setCloudSyncStatus('session_expired');
          setCloudSyncMessage('Sessão Supabase expirada. Reconecte nas configurações para retomar a sincronização.');
        } else {
          setCloudSyncStatus('not_configured');
          setCloudSyncMessage('Modo local ativo. Configure a nuvem nas configurações quando desejar sincronizar.');
        }
        return;
      }

      setCloudSyncStatus('syncing');
      setCloudSyncMessage('Verificando conexão segura com Supabase...');

      const conn = await testSupabaseConnection();
      if (isCancelled) return;

      if (!conn.connected) {
        setCloudSyncStatus('error');
        setCloudSyncMessage(conn.message);
        return;
      }

      if (!conn.tableExists) {
        setCloudSyncStatus('table_missing');
        setCloudSyncMessage('Tabela "user_finance_data" não encontrada no Supabase. Crie a tabela via SQL com RLS para ativar a nuvem.');
        return;
      }

      // Consulta dados do usuário autenticado no Supabase
      const remote = await fetchFinanceDataFromSupabase(supabaseUserId);
      if (isCancelled) return;

      if (remote.success && remote.data) {
        // Já existem dados no Supabase para este usuário autenticado.
        // Resolver conflitos entre múltiplos dispositivos utilizando timestamps:
        const conflict = resolveMultiDeviceConflict(
          state,
          remote.data,
          remote.clientTimestamp || (remote.updatedAt ? new Date(remote.updatedAt).getTime() : 0)
        );

        if (conflict.strategy === 'use_remote') {
          // Dados remotos são mais novos (modificados em outro aparelho)
          setState(conflict.resolvedState);
          saveStateToStorage(conflict.resolvedState);
          setCloudSyncStatus('connected');
          setCloudSyncMessage(conflict.reason);
          setLastCloudSyncDate(new Date());
          return;
        } else if (conflict.strategy === 'use_local') {
          // Dados locais são mais recentes (alterados offline ou recentemente neste aparelho)
          const uploadRes = await saveFinanceDataToSupabase(state, supabaseUserId);
          if (uploadRes.success) {
            setCloudSyncStatus('connected');
            setCloudSyncMessage(conflict.reason);
            setLastCloudSyncDate(new Date());
          }
          return;
        } else {
          // Já estão em sincronia perfeita
          setCloudSyncStatus('connected');
          setCloudSyncMessage('Dispositivo e nuvem em perfeita sincronia.');
          setLastCloudSyncDate(new Date());
          return;
        }
      }

      // Se nenhum dado anterior existe na nuvem para este usuário, efetua migração segura com verificação de ida e volta (round-trip)
      setCloudSyncMessage('Realizando migração inicial com verificação de integridade...');
      const migrationRes = await migrateAndVerifyFinanceData(state, supabaseUserId);
      if (isCancelled) return;

      if (migrationRes.success) {
        setCloudSyncStatus('connected');
        setCloudSyncMessage('Migração local validada e confirmada na nuvem com sucesso!');
        setLastCloudSyncDate(new Date());
      } else {
        setCloudSyncStatus('error');
        setCloudSyncMessage(migrationRes.message || 'Falha na validação da migração.');
      }
    }

    initCloudSync();

    return () => {
      isCancelled = true;
    };
  }, [supabaseUserId, isSupabaseAuthenticated]);

  // Continuous auto-sync with debounce on state changes
  useEffect(() => {
    // Skip initial mount so we don't trigger upload before cloud fetch
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!supabaseUserId || !isSupabaseAuthenticated || cloudSyncStatus === 'table_missing') return;

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    syncTimeoutRef.current = setTimeout(async () => {
      setCloudSyncStatus('syncing');
      const res = await saveFinanceDataToSupabase(state, supabaseUserId);
      if (res.success) {
        setCloudSyncStatus('connected');
        setCloudSyncMessage('Alterações sincronizadas na nuvem.');
        setLastCloudSyncDate(new Date());
      } else {
        if (res.code === '42P01') {
          setCloudSyncStatus('table_missing');
        } else {
          setCloudSyncStatus('error');
          setCloudSyncMessage(res.message || 'Erro ao sincronizar.');
        }
      }
    }, 2000);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
      }
    };
  }, [state, supabaseUserId]);

  // Helpers to get current / previous month ISO bounds aligned with real calendar
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-indexed

  // Active viewed year and month based on filter
  const { selectedYear, selectedMonth, isFutureView, isSpecificMonthView } = useMemo(() => {
    let y = currentYear;
    let m = currentMonth;

    if (filter.period === 'next_month') {
      m = currentMonth === 11 ? 0 : currentMonth + 1;
      y = currentMonth === 11 ? currentYear + 1 : currentYear;
    } else if (filter.period === 'previous_month') {
      m = currentMonth === 0 ? 11 : currentMonth - 1;
      y = currentMonth === 0 ? currentYear - 1 : currentYear;
    } else if (filter.period === 'specific_month') {
      y = filter.year ?? currentYear;
      m = filter.month ?? currentMonth;
    }

    const isFuture = y > currentYear || (y === currentYear && m > currentMonth);
    const isSpecific = filter.period === 'specific_month' || filter.period === 'next_month' || filter.period === 'current_month';

    return {
      selectedYear: y,
      selectedMonth: m,
      isFutureView: isFuture,
      isSpecificMonthView: isSpecific
    };
  }, [filter, currentYear, currentMonth]);

  // 1. Saldo atual total (Soma dos saldos reais nas contas)
  const totalBankBalance = useMemo(() => {
    return state.accounts.reduce((sum, acc) => sum + (acc.balance || 0), 0);
  }, [state.accounts]);

  // Core Projection Engine: Calculates exactly what you will owe in any given month
  const calculateMonthProjection = (
    targetYear: number,
    targetMonth: number,
    customDebtBalances?: Map<string, number>,
    startingCumulativeBalance?: number
  ): MonthProjection => {
    const targetMY = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
    const isFuture = targetYear > currentYear || (targetYear === currentYear && targetMonth > currentMonth);
    const isCurrent = targetYear === currentYear && targetMonth === currentMonth;

    const commitments: FutureCommitmentItem[] = [];

    // 1. Transactions already scheduled for this month
    const monthTransactions = state.transactions.filter(t => t.date.slice(0, 7) === targetMY);

    monthTransactions.forEach(t => {
      if (t.type === 'expense_fixed' || t.type === 'expense_variable') {
        commitments.push({
          id: t.id,
          description: t.description,
          amount: t.amount,
          type: t.installmentInfo ? 'card_installment' : t.type === 'expense_fixed' ? 'fixed_recurring' : 'scheduled_expense',
          category: t.category,
          dueDate: t.dueDate || t.date,
          installmentLabel: t.installmentInfo ? `${t.installmentInfo.current}/${t.installmentInfo.total}` : undefined
        });
      }
    });

    // 2. Projected fixed recurring bills (Aluguel, Luz, Internet, etc.) if not yet generated
    if (isFuture || isCurrent) {
      const recurringFixedMap = new Map<string, Transaction>();
      state.transactions
        .filter(t => t.isRecurring && t.type === 'expense_fixed')
        .forEach(t => {
          if (!recurringFixedMap.has(t.description)) {
            recurringFixedMap.set(t.description, t);
          }
        });

      recurringFixedMap.forEach((sampleTx, desc) => {
        const alreadyExists = commitments.some(c => c.description.toLowerCase().includes(desc.toLowerCase()));
        if (!alreadyExists) {
          const day = sampleTx.dueDate ? parseInt(sampleTx.dueDate.slice(8, 10), 10) : 10;
          const safeDay = Math.min(28, isNaN(day) ? 10 : day);
          const projectedDueDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

          commitments.push({
            id: `proj-rec-${desc}-${targetMY}`,
            description: sampleTx.description,
            amount: sampleTx.amount,
            type: 'fixed_recurring',
            category: sampleTx.category,
            dueDate: projectedDueDate,
          });
        }
      });
    }

    // 3. Debts commitments: for active debts, include their monthly parcel / minimum payment
    state.debts
      .filter(d => d.status !== 'settled' && (d.minimumPayment || 0) > 0)
      .forEach(d => {
        const remaining = customDebtBalances ? (customDebtBalances.get(d.id) ?? d.currentBalance) : d.currentBalance;
        if (remaining <= 0) return;

        const minPay = d.minimumPayment || 0;
        const parcelAmount = Math.min(remaining, minPay);
        if (parcelAmount <= 0) return;

        if (customDebtBalances) {
          customDebtBalances.set(d.id, Math.max(0, remaining - parcelAmount));
        }

        const dueDay = d.dueDate ? parseInt(d.dueDate.slice(8, 10), 10) : 20;
        const safeDay = Math.min(28, isNaN(dueDay) ? 20 : dueDay);
        const projectedDueDate = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

        commitments.push({
          id: `proj-debt-${d.id}-${targetMY}`,
          description: `Parcela/Mínimo: ${d.name}`,
          amount: parcelAmount,
          type: 'debt_commitment',
          category: 'Dívidas & Empréstimos',
          dueDate: projectedDueDate,
          originName: d.creditor
        });
      });

    const fixedExpensesProjected = commitments
      .filter(c => c.type === 'fixed_recurring')
      .reduce((sum, c) => sum + c.amount, 0);

    const cardInstallmentsProjected = commitments
      .filter(c => c.type === 'card_installment')
      .reduce((sum, c) => sum + c.amount, 0);

    const debtsProjected = commitments
      .filter(c => c.type === 'debt_commitment')
      .reduce((sum, c) => sum + c.amount, 0);

    const totalOwedTotal = commitments.reduce((sum, c) => sum + c.amount, 0);

    // Projected income
    let totalIncomeProjected = monthTransactions
      .filter(t => t.type === 'income')
      .reduce((sum, t) => sum + t.amount, 0);

    if (isFuture || totalIncomeProjected === 0) {
      const recurringIncomesMap = new Map<string, Transaction>();
      state.transactions
        .filter(t => t.isRecurring && t.type === 'income')
        .forEach(t => {
          if (!recurringIncomesMap.has(t.description)) {
            recurringIncomesMap.set(t.description, t);
          }
        });

      recurringIncomesMap.forEach((inc, desc) => {
        const alreadyHas = monthTransactions.some(t => t.type === 'income' && t.description.toLowerCase().includes(desc.toLowerCase()));
        if (!alreadyHas) {
          totalIncomeProjected += inc.amount;
        }
      });
    }

    const projectedFreeBalance = Math.max(0, totalIncomeProjected - totalOwedTotal);
    const projectedCumulativeBalance = startingCumulativeBalance !== undefined
      ? startingCumulativeBalance + (totalIncomeProjected - totalOwedTotal)
      : totalBankBalance + (totalIncomeProjected - totalOwedTotal);

    const monthName = MONTH_NAMES_PT[targetMonth] || '';
    const monthShort = MONTH_NAMES_SHORT_PT[targetMonth] || '';

    return {
      year: targetYear,
      month: targetMonth,
      label: `${monthName}/${targetYear}`,
      shortLabel: `${monthShort}/${String(targetYear).slice(2)}`,
      totalIncomeProjected,
      totalOwedTotal,
      fixedExpensesProjected,
      cardInstallmentsProjected,
      debtsProjected,
      projectedFreeBalance,
      projectedCumulativeBalance,
      isFuture,
      isCurrent,
      commitments
    };
  };

  // Next 6 months projections (used for quick navigation)
  const nextMonthsProjections = useMemo(() => {
    const list: MonthProjection[] = [];
    for (let i = 1; i <= 6; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      list.push(calculateMonthProjection(d.getFullYear(), d.getMonth()));
    }
    return list;
  }, [state.transactions, state.debts, totalBankBalance, currentYear, currentMonth]);

  // Next 12 months projections with progressive debt amortization and cumulative balance
  const next12MonthsProjections = useMemo(() => {
    const list: MonthProjection[] = [];
    const virtualDebtBalances = new Map<string, number>();
    state.debts.forEach(d => {
      virtualDebtBalances.set(d.id, d.currentBalance);
    });

    let runningBalance = totalBankBalance;

    for (let i = 1; i <= 12; i++) {
      const d = new Date(currentYear, currentMonth + i, 1);
      const proj = calculateMonthProjection(
        d.getFullYear(),
        d.getMonth(),
        virtualDebtBalances,
        runningBalance
      );
      runningBalance = proj.projectedCumulativeBalance;
      list.push(proj);
    }
    return list;
  }, [state.transactions, state.debts, totalBankBalance, currentYear, currentMonth]);

  // Current selected month projection
  const currentSelectedMonthProjection = useMemo(() => {
    return calculateMonthProjection(selectedYear, selectedMonth);
  }, [selectedYear, selectedMonth, state.transactions, state.debts]);

  // Month navigation helpers
  const goToNextMonth = () => {
    let nextM = selectedMonth + 1;
    let nextY = selectedYear;
    if (nextM > 11) {
      nextM = 0;
      nextY += 1;
    }
    setFilter({ period: 'specific_month', year: nextY, month: nextM });
  };

  const goToPrevMonth = () => {
    let prevM = selectedMonth - 1;
    let prevY = selectedYear;
    if (prevM < 0) {
      prevM = 11;
      prevY -= 1;
    }
    setFilter({ period: 'specific_month', year: prevY, month: prevM });
  };

  const goToCurrentMonth = () => {
    setFilter({ period: 'current_month', year: currentYear, month: currentMonth });
  };

  const selectSpecificMonth = (year: number, month: number) => {
    setFilter({ period: 'specific_month', year, month });
  };

  // Filter transactions according to selected period (including future periods)
  const filteredTransactions = useMemo(() => {
    // If viewing a single specific month or next month or current month:
    if (filter.period === 'current_month' || filter.period === 'next_month' || filter.period === 'previous_month' || filter.period === 'specific_month') {
      const targetMY = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}`;
      const existing = state.transactions.filter(tx => tx.date.slice(0, 7) === targetMY);

      // If it's a future month, also synthesize projected recurring transactions so they appear on tables and graphs!
      if (isFutureView) {
        const synthetic: Transaction[] = [];

        // Add projected recurring fixed bills
        const recurringFixedMap = new Map<string, Transaction>();
        state.transactions
          .filter(t => t.isRecurring && t.type === 'expense_fixed')
          .forEach(t => {
            if (!recurringFixedMap.has(t.description)) recurringFixedMap.set(t.description, t);
          });

        recurringFixedMap.forEach((sampleTx, desc) => {
          const already = existing.some(t => t.description.toLowerCase().includes(desc.toLowerCase()));
          if (!already) {
            const day = sampleTx.dueDate ? parseInt(sampleTx.dueDate.slice(8, 10), 10) : 10;
            const safeDay = Math.min(28, isNaN(day) ? 10 : day);
            const pDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

            synthetic.push({
              ...sampleTx,
              id: `proj-tx-${desc}-${targetMY}`,
              date: pDate,
              dueDate: pDate,
              status: 'pending',
              notes: 'Previsão automática de conta fixa recorrente'
            });
          }
        });

        // Add recurring incomes (Salário, VR)
        const recurringIncomesMap = new Map<string, Transaction>();
        state.transactions
          .filter(t => t.isRecurring && t.type === 'income')
          .forEach(t => {
            if (!recurringIncomesMap.has(t.description)) recurringIncomesMap.set(t.description, t);
          });

        recurringIncomesMap.forEach((inc, desc) => {
          const already = existing.some(t => t.type === 'income' && t.description.toLowerCase().includes(desc.toLowerCase()));
          if (!already) {
            const day = inc.date ? parseInt(inc.date.slice(8, 10), 10) : 5;
            const safeDay = Math.min(28, isNaN(day) ? 5 : day);
            const pDate = `${selectedYear}-${String(selectedMonth + 1).padStart(2, '0')}-${String(safeDay).padStart(2, '0')}`;

            synthetic.push({
              ...inc,
              id: `proj-inc-${desc}-${targetMY}`,
              date: pDate,
              status: 'pending',
              notes: 'Previsão automática de renda recorrente'
            });
          }
        });

        return [...existing, ...synthetic];
      }

      return existing;
    }

    return state.transactions.filter(tx => {
      const txDate = new Date(tx.date + 'T00:00:00');
      const txYear = txDate.getFullYear();
      const txMonth = txDate.getMonth();

      switch (filter.period) {
        case 'next_3_months': {
          const start = new Date(currentYear, currentMonth, 1);
          const end = new Date(currentYear, currentMonth + 3, 0);
          return txDate >= start && txDate <= end;
        }
        case 'next_6_months': {
          const start = new Date(currentYear, currentMonth, 1);
          const end = new Date(currentYear, currentMonth + 6, 0);
          return txDate >= start && txDate <= end;
        }
        case 'last_3_months': {
          const threeMonthsAgo = new Date(currentYear, currentMonth - 2, 1);
          return txDate >= threeMonthsAgo && txDate <= now;
        }
        case 'last_6_months': {
          const sixMonthsAgo = new Date(currentYear, currentMonth - 5, 1);
          return txDate >= sixMonthsAgo && txDate <= now;
        }
        case 'last_12_months': {
          const twelveMonthsAgo = new Date(currentYear, currentMonth - 11, 1);
          return txDate >= twelveMonthsAgo && txDate <= now;
        }
        case 'custom':
          if (filter.startDate && filter.endDate) {
            return tx.date >= filter.startDate && tx.date <= filter.endDate;
          }
          return true;
        case 'all':
        default:
          return true;
      }
    });
  }, [state.transactions, filter, currentYear, currentMonth, selectedYear, selectedMonth, isFutureView]);

  // Total de entradas no período filtrado
  const totalIncomePeriod = useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.type === 'income')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  // Despesas Fixas no período
  const totalFixedExpenses = useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.type === 'expense_fixed')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  // Despesas Variáveis no período
  const totalVariableExpenses = useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.type === 'expense_variable')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  // Total de despesas de consumo (fixas + variáveis, sem contar pagamentos de fatura para não duplicar!)
  const totalExpensePeriod = useMemo(() => {
    return totalFixedExpenses + totalVariableExpenses;
  }, [totalFixedExpenses, totalVariableExpenses]);

  // Despesas fixas e variáveis ainda pendentes no período
  const totalPendingFixed = useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.type === 'expense_fixed' && tx.status !== 'paid')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  const totalPendingVariable = useMemo(() => {
    return filteredTransactions
      .filter(tx => tx.type === 'expense_variable' && tx.status !== 'paid')
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [filteredTransactions]);

  // Entradas ainda previstas/pendentes no mês
  const pendingIncomeCurrentMonth = useMemo(() => {
    return state.transactions
      .filter(tx => {
        const d = new Date(tx.date + 'T00:00:00');
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth && tx.type === 'income' && tx.status !== 'paid';
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [state.transactions, currentYear, currentMonth]);

  // Despesas fixas e variáveis pendentes do mês atual
  const pendingFixedCurrentMonth = useMemo(() => {
    return state.transactions
      .filter(tx => {
        const d = new Date(tx.date + 'T00:00:00');
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth && tx.type === 'expense_fixed' && tx.status !== 'paid';
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [state.transactions, currentYear, currentMonth]);

  const pendingVariableCurrentMonth = useMemo(() => {
    return state.transactions
      .filter(tx => {
        const d = new Date(tx.date + 'T00:00:00');
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth && tx.type === 'expense_variable' && tx.status !== 'paid';
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [state.transactions, currentYear, currentMonth]);

  // Faturas de cartão de crédito pendentes do mês atual
  const pendingCreditCardInvoicesMonth = useMemo(() => {
    // Gastos no cartão no mês atual que ainda não foram liquidados por fatura
    return state.transactions
      .filter(tx => {
        const d = new Date(tx.date + 'T00:00:00');
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth && tx.paymentMethod === 'credit_card' && !tx.isInvoicePayment;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  }, [state.transactions, currentYear, currentMonth]);

  // Dívidas ativas em aberto
  const totalActiveDebts = useMemo(() => {
    return state.debts
      .filter(d => d.status !== 'settled')
      .reduce((sum, d) => sum + (d.currentBalance || 0), 0);
  }, [state.debts]);

  // Compromissos mínimos de dívidas do mês
  const monthlyDebtCommitments = useMemo(() => {
    return state.debts
      .filter(d => d.status !== 'settled')
      .reduce((sum, d) => sum + (d.minimumPayment || 0), 0);
  }, [state.debts]);

  // 7. Dinheiro livre disponível (Poder de Compra Real)
  // Regra fundamental: Saldo atual + entradas previstas - contas fixas pendentes - variáveis pendentes - fatura cartão a vencer - compromissos dívidas - reserva que deseja preservar
  const freeMoneyAvailable = useMemo(() => {
    const calculated = totalBankBalance 
      + pendingIncomeCurrentMonth
      - pendingFixedCurrentMonth
      - pendingVariableCurrentMonth
      - pendingCreditCardInvoicesMonth
      - monthlyDebtCommitments
      - (state.safetyReserveDesired || 0);

    return Math.max(0, calculated);
  }, [
    totalBankBalance,
    pendingIncomeCurrentMonth,
    pendingFixedCurrentMonth,
    pendingVariableCurrentMonth,
    pendingCreditCardInvoicesMonth,
    monthlyDebtCommitments,
    state.safetyReserveDesired
  ]);

  // 8. Percentual da renda comprometida
  const incomeCommittedPercent = useMemo(() => {
    const totalIncome = totalIncomePeriod > 0 ? totalIncomePeriod : 1;
    const totalOutflow = totalExpensePeriod + monthlyDebtCommitments;
    const pct = (totalOutflow / totalIncome) * 100;
    return Math.min(100, Math.max(0, pct));
  }, [totalExpensePeriod, totalIncomePeriod, monthlyDebtCommitments]);

  // 9. Quanto conseguiu economizar no período
  const totalSavedPeriod = useMemo(() => {
    return Math.max(0, totalIncomePeriod - totalExpensePeriod);
  }, [totalIncomePeriod, totalExpensePeriod]);

  // 10. Quanto ainda posso gastar no mês
  const remainingSafeToSpend = useMemo(() => {
    return freeMoneyAvailable;
  }, [freeMoneyAvailable]);

  // Fatura de cartão específica
  const getCardInvoiceAmount = (cardId: string, monthYear?: string): number => {
    const targetMY = monthYear || `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
    return state.transactions
      .filter(tx => {
        if (tx.creditCardId !== cardId || tx.paymentMethod !== 'credit_card' || tx.isInvoicePayment) return false;
        const txMY = tx.date.slice(0, 7);
        return txMY === targetMY;
      })
      .reduce((sum, tx) => sum + tx.amount, 0);
  };

  // Smart Alerts Engine
  const smartAlerts = useMemo(() => {
    const alerts: SmartAlert[] = [];

    // Alerta 1: Despesas maiores que receitas
    if (totalExpensePeriod > totalIncomePeriod && totalIncomePeriod > 0) {
      alerts.push({
        id: 'alert-deficit',
        type: 'danger',
        title: 'Despesas Superando Receitas',
        message: 'Você está gastando mais do que recebe neste período. Reduza despesas variáveis imediatamente.',
        metric: `Déficit de R$ ${(totalExpensePeriod - totalIncomePeriod).toFixed(2).replace('.', ',')}`
      });
    }

    // Alerta 2: Comprometimento de renda elevado
    if (incomeCommittedPercent >= 80) {
      alerts.push({
        id: 'alert-high-commitment',
        type: 'warning',
        title: 'Renda Altamente Comprometida',
        message: `Você já comprometeu ${incomeCommittedPercent.toFixed(1).replace('.', ',')}% da sua renda mensal com despesas e dívidas.`,
        metric: `${incomeCommittedPercent.toFixed(0)}%`
      });
    }

    // Alerta 3: Comparativo de categoria com mês anterior (ex: Alimentação / Supermercado)
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;

    const currentFoodExp = state.transactions
      .filter(tx => {
        const d = new Date(tx.date + 'T00:00:00');
        return d.getFullYear() === currentYear && d.getMonth() === currentMonth && (tx.category.toLowerCase().includes('aliment') || tx.category.toLowerCase().includes('supermercado'));
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    const prevFoodExp = state.transactions
      .filter(tx => {
        const d = new Date(tx.date + 'T00:00:00');
        return d.getFullYear() === prevYear && d.getMonth() === prevMonth && (tx.category.toLowerCase().includes('aliment') || tx.category.toLowerCase().includes('supermercado'));
      })
      .reduce((sum, tx) => sum + tx.amount, 0);

    if (prevFoodExp > 0 && currentFoodExp > prevFoodExp * 1.2) {
      const incPct = ((currentFoodExp - prevFoodExp) / prevFoodExp) * 100;
      alerts.push({
        id: 'alert-food-increase',
        type: 'warning',
        title: 'Aumento nos Gastos com Alimentação',
        message: `Seus gastos com alimentação/mercado aumentaram ${incPct.toFixed(0)}% em relação ao mês anterior.`,
        metric: `+${incPct.toFixed(0)}%`
      });
    }

    // Alerta 4: Pequenas compras acumuladas (compras <= R$ 30)
    const smallPurchases = filteredTransactions
      .filter(tx => (tx.type === 'expense_variable' || tx.type === 'expense_fixed') && tx.amount <= 30)
      .reduce((sum, tx) => sum + tx.amount, 0);

    if (smallPurchases > 150) {
      alerts.push({
        id: 'alert-small-expenses',
        type: 'info',
        title: 'Pequenos Gastos Acumulados',
        message: `Pequenas compras de até R$ 30,00 somam R$ ${smallPurchases.toFixed(2).replace('.', ',')} no período selecionado.`,
        metric: `R$ ${smallPurchases.toFixed(0)}`
      });
    }

    // Alerta 5: Contas pendentes vencendo nos próximos dias
    const todayStr = getTodayISO();
    const overdueBills = state.transactions.filter(tx => 
      (tx.type === 'expense_fixed' || tx.type === 'expense_variable') &&
      tx.status !== 'paid' &&
      tx.dueDate &&
      tx.dueDate < todayStr
    );

    if (overdueBills.length > 0) {
      alerts.push({
        id: 'alert-overdue',
        type: 'danger',
        title: `${overdueBills.length} Conta(s) Atrasada(s)`,
        message: 'Você possui contas com data de vencimento expirada que ainda constam como pendentes.',
        metric: `${overdueBills.length} pendência(s)`
      });
    }

    // Alerta 6: Cartão de crédito próximo do limite
    state.creditCards.forEach(card => {
      const used = getCardInvoiceAmount(card.id);
      if (card.limitTotal > 0 && used / card.limitTotal >= 0.8) {
        alerts.push({
          id: `alert-card-${card.id}`,
          type: 'warning',
          title: `Cartão ${card.name} no Limite`,
          message: `Você utilizou ${((used / card.limitTotal) * 100).toFixed(0)}% do limite total deste cartão.`,
          metric: `${((used / card.limitTotal) * 100).toFixed(0)}%`
        });
      }
    });

    return alerts;
  }, [
    totalExpensePeriod,
    totalIncomePeriod,
    incomeCommittedPercent,
    filteredTransactions,
    state.transactions,
    state.creditCards,
    currentYear,
    currentMonth
  ]);

  // Simulador de Compra
  const simulatePurchase = (amount: number): PurchaseSimulationResult => {
    const freeBefore = freeMoneyAvailable;
    const freeAfter = freeBefore - amount;
    const canAfford = freeAfter >= 0;
    const percentCommitted = freeBefore > 0 ? (amount / freeBefore) * 100 : 100;

    let riskLevel: 'safe' | 'caution' | 'danger' = 'safe';
    let feedbackMessage = '';

    if (!canAfford) {
      riskLevel = 'danger';
      feedbackMessage = `Compra Inviável: Ultrapassa seu dinheiro livre em R$ ${Math.abs(freeAfter).toFixed(2).replace('.', ',')}. Você precisará recorrer à reserva ou entrar no cheque especial/rotativo.`;
    } else if (percentCommitted > 65) {
      riskLevel = 'caution';
      feedbackMessage = `Atenção: A compra comprometerá ${percentCommitted.toFixed(0)}% do seu dinheiro livre restante. Sobrarão apenas R$ ${freeAfter.toFixed(2).replace('.', ',')} para eventuais imprevistos.`;
    } else {
      riskLevel = 'safe';
      feedbackMessage = `Compra Segura: Sobrarão R$ ${freeAfter.toFixed(2).replace('.', ',')} livres sem comprometer suas contas fixas, faturas e a reserva informada.`;
    }

    return {
      purchaseAmount: amount,
      freeMoneyBefore: freeBefore,
      freeMoneyAfter: Math.max(0, freeAfter),
      percentCommitted: Math.min(100, percentCommitted),
      canAfford,
      riskLevel,
      feedbackMessage
    };
  };

  // ================= ACTIONS ================= //

  const addTransaction = (txData: Omit<Transaction, 'id'>, installmentsCount = 1) => {
    setState(prev => {
      const newTransactions: Transaction[] = [...prev.transactions];
      const newAccounts: BankAccount[] = prev.accounts.map(a => ({ ...a }));
      const groupId = installmentsCount > 1 ? `inst-${Date.now()}` : undefined;

      // Handle multiple installments
      for (let i = 1; i <= installmentsCount; i++) {
        const id = `tx-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;
        
        let txDate = txData.date;
        let txDueDate = txData.dueDate;

        if (i > 1) {
          // Increment month
          const d = new Date(txData.date + 'T00:00:00');
          d.setMonth(d.getMonth() + (i - 1));
          txDate = d.toISOString().split('T')[0];

          if (txData.dueDate) {
            const due = new Date(txData.dueDate + 'T00:00:00');
            due.setMonth(due.getMonth() + (i - 1));
            txDueDate = due.toISOString().split('T')[0];
          }
        }

        const newTx: Transaction = {
          ...txData,
          id,
          date: txDate,
          dueDate: txDueDate,
          description: installmentsCount > 1 ? `${txData.description} (${i}/${installmentsCount})` : txData.description,
          installmentInfo: installmentsCount > 1 ? { current: i, total: installmentsCount, groupId } : undefined,
          status: i === 1 ? txData.status : 'pending', // subsequent installments start as pending
        };

        // If installment 1 is paid and NOT paid by credit card, adjust account balance
        if (i === 1 && txData.status === 'paid') {
          if (txData.type === 'income' && txData.accountId) {
            const acc = newAccounts.find(a => a.id === txData.accountId);
            if (acc) acc.balance += txData.amount;
          } else if ((txData.type === 'expense_fixed' || txData.type === 'expense_variable') && txData.paymentMethod !== 'credit_card' && txData.accountId) {
            const acc = newAccounts.find(a => a.id === txData.accountId);
            if (acc) acc.balance -= txData.amount;
          }
        }

        newTransactions.unshift(newTx);
      }

      return {
        ...prev,
        transactions: newTransactions,
        accounts: newAccounts
      };
    });
  };

  const updateTransaction = (id: string, updated: Partial<Transaction>) => {
    setState(prev => {
      const oldTx = prev.transactions.find(t => t.id === id);
      if (!oldTx) return prev;

      const newAccounts = prev.accounts.map(a => ({ ...a }));

      // Reverse previous balance effect if it was paid
      if (oldTx.status === 'paid' && oldTx.accountId) {
        const acc = newAccounts.find(a => a.id === oldTx.accountId);
        if (acc) {
          if (oldTx.type === 'income') acc.balance -= oldTx.amount;
          else if ((oldTx.type === 'expense_fixed' || oldTx.type === 'expense_variable') && oldTx.paymentMethod !== 'credit_card') {
            acc.balance += oldTx.amount;
          }
        }
      }

      const mergedTx: Transaction = { ...oldTx, ...updated };

      // Apply new balance effect if it is paid
      if (mergedTx.status === 'paid' && mergedTx.accountId) {
        const acc = newAccounts.find(a => a.id === mergedTx.accountId);
        if (acc) {
          if (mergedTx.type === 'income') acc.balance += mergedTx.amount;
          else if ((mergedTx.type === 'expense_fixed' || mergedTx.type === 'expense_variable') && mergedTx.paymentMethod !== 'credit_card') {
            acc.balance -= mergedTx.amount;
          }
        }
      }

      return {
        ...prev,
        transactions: prev.transactions.map(t => (t.id === id ? mergedTx : t)),
        accounts: newAccounts
      };
    });
  };

  const deleteTransaction = (id: string) => {
    setState(prev => {
      const oldTx = prev.transactions.find(t => t.id === id);
      if (!oldTx) return prev;

      const newAccounts = prev.accounts.map(a => ({ ...a }));

      // Reverse balance effect if it was paid
      if (oldTx.status === 'paid' && oldTx.accountId) {
        const acc = newAccounts.find(a => a.id === oldTx.accountId);
        if (acc) {
          if (oldTx.type === 'income') acc.balance -= oldTx.amount;
          else if ((oldTx.type === 'expense_fixed' || oldTx.type === 'expense_variable') && oldTx.paymentMethod !== 'credit_card') {
            acc.balance += oldTx.amount;
          }
        }
      }

      return {
        ...prev,
        transactions: prev.transactions.filter(t => t.id !== id),
        accounts: newAccounts
      };
    });
  };

  const duplicateTransaction = (id: string) => {
    const tx = state.transactions.find(t => t.id === id);
    if (!tx) return;
    const { id: _, ...rest } = tx;
    addTransaction({
      ...rest,
      description: `${rest.description} (Cópia)`,
      date: getTodayISO(),
      status: 'paid'
    });
  };

  // Transfer between accounts (does NOT count as income or expense)
  const transferBetweenAccounts = (
    sourceAccountId: string,
    targetAccountId: string,
    amount: number,
    date = getTodayISO(),
    notes?: string
  ) => {
    if (sourceAccountId === targetAccountId || amount <= 0) return;

    setState(prev => {
      const source = prev.accounts.find(a => a.id === sourceAccountId);
      const target = prev.accounts.find(a => a.id === targetAccountId);
      if (!source || !target) return prev;

      const newAccounts = prev.accounts.map(a => {
        if (a.id === sourceAccountId) return { ...a, balance: a.balance - amount };
        if (a.id === targetAccountId) return { ...a, balance: a.balance + amount };
        return a;
      });

      const tx: Transaction = {
        id: `tx-transfer-${Date.now()}`,
        description: `Transferência: ${source.name} → ${target.name}`,
        amount,
        type: 'transfer',
        category: 'Transferência entre contas',
        date,
        accountId: sourceAccountId,
        targetAccountId,
        paymentMethod: 'bank_transfer',
        status: 'paid',
        notes
      };

      return {
        ...prev,
        accounts: newAccounts,
        transactions: [tx, ...prev.transactions]
      };
    });
  };

  // Pay credit card invoice (reduces bank account balance, does not duplicate category consumption)
  const payCreditCardInvoice = (
    cardId: string,
    accountId: string,
    amount: number,
    invoiceMonth: string
  ) => {
    setState(prev => {
      const card = prev.creditCards.find(c => c.id === cardId);
      const account = prev.accounts.find(a => a.id === accountId);
      if (!card || !account || amount <= 0) return prev;

      const newAccounts = prev.accounts.map(a => {
        if (a.id === accountId) return { ...a, balance: a.balance - amount };
        return a;
      });

      const invoicePaymentTx: Transaction = {
        id: `tx-cardpay-${Date.now()}`,
        description: `Pagamento Fatura ${card.name} (${invoiceMonth})`,
        amount,
        type: 'card_payment',
        category: 'Pagamento de Fatura',
        date: getTodayISO(),
        accountId,
        creditCardId: cardId,
        paymentMethod: 'bank_slip',
        status: 'paid',
        isInvoicePayment: true,
        cardInvoiceMonth: invoiceMonth
      };

      return {
        ...prev,
        accounts: newAccounts,
        transactions: [invoicePaymentTx, ...prev.transactions]
      };
    });
  };

  // Amortize debt (reduces debt balance and bank balance, no duplicate consumption)
  const amortizeDebt = (
    debtId: string,
    accountId: string,
    amount: number,
    date = getTodayISO(),
    notes?: string
  ) => {
    setState(prev => {
      const debt = prev.debts.find(d => d.id === debtId);
      const account = prev.accounts.find(a => a.id === accountId);
      if (!debt || !account || amount <= 0) return prev;

      const newBalance = Math.max(0, debt.currentBalance - amount);
      const newStatus = newBalance === 0 ? 'settled' : newBalance < debt.originalAmount ? 'partially_settled' : debt.status;

      const updatedDebt: Debt = {
        ...debt,
        currentBalance: newBalance,
        totalPaid: (debt.totalPaid || 0) + amount,
        status: newStatus,
        paymentsHistory: [
          ...(debt.paymentsHistory || []),
          {
            id: `pay-${Date.now()}`,
            date,
            amount,
            accountId,
            notes
          }
        ]
      };

      const newAccounts = prev.accounts.map(a => {
        if (a.id === accountId) return { ...a, balance: a.balance - amount };
        return a;
      });

      const debtTx: Transaction = {
        id: `tx-debtpay-${Date.now()}`,
        description: `Amortização de Dívida: ${debt.name}`,
        amount,
        type: 'debt_payment',
        category: 'Pagamento de Dívida',
        date,
        accountId,
        debtId,
        paymentMethod: 'pix',
        status: 'paid',
        notes
      };

      return {
        ...prev,
        debts: prev.debts.map(d => (d.id === debtId ? updatedDebt : d)),
        accounts: newAccounts,
        transactions: [debtTx, ...prev.transactions]
      };
    });
  };

  // Debt CRUD
  const addDebt = (debtData: Omit<Debt, 'id' | 'totalPaid' | 'paymentsHistory'>) => {
    setState(prev => ({
      ...prev,
      debts: [
        ...prev.debts,
        {
          ...debtData,
          id: `debt-${Date.now()}`,
          totalPaid: 0,
          paymentsHistory: []
        }
      ]
    }));
  };

  const updateDebt = (id: string, updated: Partial<Debt>) => {
    setState(prev => ({
      ...prev,
      debts: prev.debts.map(d => (d.id === id ? { ...d, ...updated } : d))
    }));
  };

  const deleteDebt = (id: string) => {
    setState(prev => ({
      ...prev,
      debts: prev.debts.filter(d => d.id !== id)
    }));
  };

  // Credit Card CRUD
  const addCreditCard = (cardData: Omit<CreditCard, 'id'>) => {
    setState(prev => ({
      ...prev,
      creditCards: [...prev.creditCards, { ...cardData, id: `card-${Date.now()}` }]
    }));
  };

  const updateCreditCard = (id: string, updated: Partial<CreditCard>) => {
    setState(prev => ({
      ...prev,
      creditCards: prev.creditCards.map(c => (c.id === id ? { ...c, ...updated } : c))
    }));
  };

  const deleteCreditCard = (id: string) => {
    setState(prev => ({
      ...prev,
      creditCards: prev.creditCards.filter(c => c.id !== id)
    }));
  };

  // Account CRUD
  const addAccount = (accData: Omit<BankAccount, 'id'>) => {
    setState(prev => ({
      ...prev,
      accounts: [...prev.accounts, { ...accData, id: `acc-${Date.now()}` }]
    }));
  };

  const updateAccount = (id: string, updated: Partial<BankAccount>) => {
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.map(a => (a.id === id ? { ...a, ...updated } : a))
    }));
  };

  const deleteAccount = (id: string) => {
    setState(prev => ({
      ...prev,
      accounts: prev.accounts.filter(a => a.id !== id)
    }));
  };

  // Category CRUD
  const addCategory = (catData: Omit<Category, 'id'>) => {
    setState(prev => ({
      ...prev,
      categories: [...prev.categories, { ...catData, id: `cat-${Date.now()}`, isCustom: true }]
    }));
  };

  const updateCategory = (id: string, updated: Partial<Category>) => {
    setState(prev => ({
      ...prev,
      categories: prev.categories.map(c => (c.id === id ? { ...c, ...updated } : c))
    }));
  };

  const deleteCategory = (id: string): boolean => {
    // Check if category has transactions
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return false;
    const hasTransactions = state.transactions.some(t => t.category === cat.name);
    if (hasTransactions) return false;

    setState(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c.id !== id)
    }));
    return true;
  };

  // Goals CRUD
  const addGoal = (goalData: Omit<FinancialGoal, 'id' | 'currentAmount' | 'completed'>) => {
    setState(prev => ({
      ...prev,
      goals: [
        ...prev.goals,
        {
          ...goalData,
          id: `goal-${Date.now()}`,
          currentAmount: 0,
          completed: false
        }
      ]
    }));
  };

  const updateGoal = (id: string, updated: Partial<FinancialGoal>) => {
    setState(prev => ({
      ...prev,
      goals: prev.goals.map(g => (g.id === id ? { ...g, ...updated } : g))
    }));
  };

  const deleteGoal = (id: string) => {
    setState(prev => ({
      ...prev,
      goals: prev.goals.filter(g => g.id !== id)
    }));
  };

  const contributeToGoal = (goalId: string, accountId: string, amount: number) => {
    setState(prev => {
      const goal = prev.goals.find(g => g.id === goalId);
      const acc = prev.accounts.find(a => a.id === accountId);
      if (!goal || !acc || amount <= 0) return prev;

      const newCurrent = goal.currentAmount + amount;
      const completed = newCurrent >= goal.targetAmount;

      const newAccounts = prev.accounts.map(a => (a.id === accountId ? { ...a, balance: a.balance - amount } : a));

      const tx: Transaction = {
        id: `tx-goal-${Date.now()}`,
        description: `Aporte Objetivo: ${goal.name}`,
        amount,
        type: 'expense_variable',
        category: 'Investimentos e Metas',
        date: getTodayISO(),
        accountId,
        paymentMethod: 'pix',
        status: 'paid'
      };

      return {
        ...prev,
        goals: prev.goals.map(g => (g.id === goalId ? { ...g, currentAmount: newCurrent, completed } : g)),
        accounts: newAccounts,
        transactions: [tx, ...prev.transactions]
      };
    });
  };

  const setSafetyReserveDesired = (val: number) => {
    setState(prev => ({ ...prev, safetyReserveDesired: Math.max(0, val) }));
  };

  const loadSampleData = () => {
    const s = resetToSampleState();
    setState(s);
  };

  const resetAllData = () => {
    const s = resetToCleanState();
    setState(s);
  };

  const exportBackupJson = (): string => {
    return JSON.stringify(state, null, 2);
  };

  const importBackupJson = (jsonString: string): boolean => {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && Array.isArray(parsed.transactions) && Array.isArray(parsed.categories)) {
        setState(parsed);
        saveStateToStorage(parsed);
        return true;
      }
      return false;
    } catch {
      return false;
    }
  };

  return (
    <FinanceContext.Provider
      value={{
        transactions: state.transactions,
        categories: state.categories,
        accounts: state.accounts,
        creditCards: state.creditCards,
        debts: state.debts,
        goals: state.goals,
        safetyReserveDesired: state.safetyReserveDesired,
        filter,
        theme,
        isSampleLoaded: state.isSampleLoaded,

        isQuickEntryOpen,
        quickEntryType,
        openQuickEntry,
        closeQuickEntry,

        setFilter,
        setSafetyReserveDesired,
        toggleTheme,
        loadSampleData,
        resetAllData,
        importBackupJson,
        exportBackupJson,

        addTransaction,
        updateTransaction,
        deleteTransaction,
        duplicateTransaction,

        addDebt,
        updateDebt,
        deleteDebt,
        amortizeDebt,

        addCreditCard,
        updateCreditCard,
        deleteCreditCard,
        payCreditCardInvoice,
        getCardInvoiceAmount,

        addAccount,
        updateAccount,
        deleteAccount,
        transferBetweenAccounts,

        addCategory,
        updateCategory,
        deleteCategory,

        addGoal,
        updateGoal,
        deleteGoal,
        contributeToGoal,

        filteredTransactions,
        totalBankBalance,
        totalIncomePeriod,
        totalExpensePeriod,
        totalFixedExpenses,
        totalVariableExpenses,
        totalPendingFixed,
        totalPendingVariable,
        totalActiveDebts,
        freeMoneyAvailable,
        incomeCommittedPercent,
        totalSavedPeriod,
        remainingSafeToSpend,
        smartAlerts,

        // Future Projections & Calendar Alignment
        selectedYear,
        selectedMonth,
        isFutureView,
        isSpecificMonthView,
        currentSelectedMonthProjection,
        nextMonthsProjections,
        next12MonthsProjections,
        goToNextMonth,
        goToPrevMonth,
        goToCurrentMonth,
        selectSpecificMonth,

        simulatePurchase,

        // Supabase Cloud Synchronization
        cloudSyncStatus,
        cloudSyncMessage,
        lastCloudSyncDate,
        syncNowWithCloud,
        forceUploadLocalToCloud,
        forceDownloadFromCloud,
        runCloudDiagnostic,
        isCloudConnected:
          cloudSyncStatus === 'connected' ||
          cloudSyncStatus === 'synced' ||
          cloudSyncStatus === 'syncing' ||
          cloudSyncStatus === 'idle'
      }}
    >
      {children}
    </FinanceContext.Provider>
  );
};

export const useFinance = (): FinanceContextType => {
  const context = useContext(FinanceContext);
  if (!context) {
    throw new Error('useFinance must be used within a FinanceProvider');
  }
  return context;
};
