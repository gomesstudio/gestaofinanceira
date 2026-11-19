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
  AppState,
  LegacyStorageSummary,
  createCleanUserState,
  createNeutralLoadingState,
  dismissLegacyRecoveryPromptForUser,
  exportLegacyStorageJson,
  getRecoverySnapshotForUser,
  getUserStateFromStorage,
  inspectLegacyStorageState,
  isLegacyRecoveryDismissedForUser,
  isValidStorageUserId,
  resetToCleanStateForUser,
  resetToSampleStateForUser,
  saveStateToStorageForUser
} from '../utils/storage';
import { getTodayISO, MONTH_NAMES_PT, MONTH_NAMES_SHORT_PT } from '../utils/formatters';
import {
  fetchFinanceDataFromSupabase,
  saveFinanceDataToSupabase,
  testSupabaseConnection,
  migrateAndVerifyFinanceData,
  resolveMultiDeviceConflict,
  runFullSupabaseDiagnostic,
  hasConfirmedStateOwnership,
  verifyCloudPreservationForUser,
  DiagnosticResult,
  SyncResult
} from '../services/supabaseSyncService';
import {
  evaluateBackupRestorationSafety,
  evaluateManualCloudUploadSafety,
  hasRealFinancialData,
  ManualCloudUploadDecision,
  PreparedBackupRestore,
  validateBackupJsonStructure
} from '../utils/backupSecurity';
import {
  ExperimentalRecoveryAdapterOptions,
  saveRecoverySnapshotWithExperimentalHistory
} from '../utils/recoverySnapshotAdapter';
import { useAuth } from './AuthContext';

export interface SmartAlert {
  id: string;
  type: 'danger' | 'warning' | 'info' | 'success';
  title: string;
  message: string;
  metric?: string;
}

export interface DeleteResult {
  success: boolean;
  synced: boolean;
  message: string;
}

export interface BackupInspectionOutcome {
  valid: boolean;
  canRestore: boolean;
  message: string;
  prepared?: PreparedBackupRestore;
}

export interface BackupRestoreOutcome {
  success: boolean;
  synced: boolean;
  snapshotStatus?: 'saved' | 'not_needed' | 'failed';
  message: string;
}

export interface ManualUploadOutcome {
  success: boolean;
  conflict?: boolean;
  alreadySynced?: boolean;
  message: string;
  decision?: ManualCloudUploadDecision;
}

export interface DestructiveActionOutcome {
  success: boolean;
  synced: boolean;
  blockedByRealData?: boolean;
  snapshotStatus?: 'saved' | 'not_needed' | 'failed';
  message: string;
}

export interface PendingLogoutPrompt {
  reasonCode:
    | 'unsynced_changes'
    | 'missing_on_cloud'
    | 'table_missing'
    | 'cloud_unreachable'
    | 'sync_in_progress'
    | 'owner_mismatch'
    | 'state_changed';
  message: string;
  hasLocalRecoveryBackup: boolean;
  canRetrySync: boolean;
  actionError?: string | null;
  isProcessing?: boolean;
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
  loadSampleData: () => Promise<DestructiveActionOutcome>;
  resetAllData: () => Promise<DestructiveActionOutcome>;
  inspectBackupJsonForRestore: (jsonString: string) => Promise<BackupInspectionOutcome>;
  applyConfirmedBackupRestore: (prepared: PreparedBackupRestore) => Promise<BackupRestoreOutcome>;
  exportBackupJson: () => string;

  // CRUD Transactions
  addTransaction: (tx: Omit<Transaction, 'id'>, installmentsCount?: number) => void;
  updateTransaction: (id: string, tx: Partial<Transaction>) => void;
  deleteTransaction: (id: string) => Promise<DeleteResult>;
  duplicateTransaction: (id: string) => void;

  // Debts
  addDebt: (debt: Omit<Debt, 'id' | 'totalPaid' | 'paymentsHistory'>) => void;
  updateDebt: (id: string, debt: Partial<Debt>) => void;
  deleteDebt: (id: string) => Promise<DeleteResult>;
  amortizeDebt: (debtId: string, accountId: string, amount: number, date?: string, notes?: string) => void;

  // Credit Cards
  addCreditCard: (card: Omit<CreditCard, 'id'>) => void;
  updateCreditCard: (id: string, card: Partial<CreditCard>) => void;
  deleteCreditCard: (id: string) => Promise<DeleteResult>;
  payCreditCardInvoice: (cardId: string, accountId: string, amount: number, invoiceMonth: string) => void;
  getCardInvoiceAmount: (cardId: string, monthYear?: string) => number;

  // Accounts
  addAccount: (acc: Omit<BankAccount, 'id'>) => void;
  updateAccount: (id: string, acc: Partial<BankAccount>) => void;
  deleteAccount: (id: string) => Promise<DeleteResult>;
  transferBetweenAccounts: (sourceAccountId: string, targetAccountId: string, amount: number, date?: string, notes?: string) => void;

  // Categories
  addCategory: (cat: Omit<Category, 'id'>) => void;
  updateCategory: (id: string, cat: Partial<Category>) => void;
  deleteCategory: (id: string) => boolean;

  // Goals
  addGoal: (goal: Omit<FinancialGoal, 'id' | 'currentAmount' | 'completed'>) => void;
  updateGoal: (id: string, goal: Partial<FinancialGoal>) => void;
  deleteGoal: (id: string) => Promise<DeleteResult>;
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

  // Hydration & Isolation State
  isFinanceHydrating: boolean;
  isFinanceHydrated: boolean;
  hydratedUserId: string | null;
  hydrationError: string | null;
  retryCloudHydration: () => Promise<void>;
  legacyBackupPrompt: LegacyStorageSummary | null;
  exportLegacyBackupFile: () => string | null;
  importLegacyBackupToCurrentAccount: (confirmedOwnership: boolean) => Promise<{ success: boolean; message: string }>;
  dismissLegacyBackupPrompt: () => void;

  // Supabase Cloud Synchronization
  cloudSyncStatus: 'connected' | 'not_configured' | 'session_expired' | 'unauthenticated' | 'syncing' | 'synced' | 'table_missing' | 'error' | 'idle';
  cloudSyncMessage: string | null;
  lastCloudSyncDate: Date | null;
  syncNowWithCloud: () => Promise<void>;
  forceUploadLocalToCloud: () => Promise<ManualUploadOutcome>;
  forceDownloadFromCloud: () => Promise<void>;
  runCloudDiagnostic: () => Promise<DiagnosticResult>;
  isCloudConnected: boolean;

  // Safe Logout Protection (Fase 2.1)
  pendingLogoutPrompt: PendingLogoutPrompt | null;
  isCheckingLogoutSafety: boolean;
  requestSafeLogout: () => Promise<void>;
  cancelPendingLogout: () => void;
  syncAndConfirmLogout: () => Promise<void>;
  confirmSafeLogout: (options?: { alsoDeleteRecoveryBackups?: boolean }) => Promise<void>;
  exportBackupForPendingLogout: () => { success: boolean; filename: string; jsonContent: string };
}

export type CloudSyncStatusType =
  | 'connected'
  | 'not_configured'
  | 'session_expired'
  | 'unauthenticated'
  | 'syncing'
  | 'synced'
  | 'table_missing'
  | 'error'
  | 'idle';

/**
 * Centraliza atualização de version, lastModified e verificação de proprietário em todas as mutações CRUD.
 * Bloqueia alterações caso o contexto ainda não esteja hidratado ou haja divergência de usuário.
 */
export function applyAuthenticatedMutation(
  prev: AppState,
  userId: string | null | undefined,
  isHydrated: boolean,
  updater: (current: AppState) => AppState
): AppState {
  if (!isHydrated || !userId || !isValidStorageUserId(userId)) {
    return prev;
  }
  if (prev.ownerUserId && prev.ownerUserId !== userId) {
    return prev;
  }
  const next = updater(prev);
  if (next === prev) {
    return prev;
  }
  return {
    ...next,
    ownerUserId: userId,
    version: Math.max(1, (prev.version || 0) + 1),
    lastModified: Date.now()
  };
}

/**
 * Funções puras de remoção isolada de um único registro por ID (preservando os demais registros).
 */
export function removeTransactionFromState(
  prev: AppState,
  id: string
): { nextState: AppState; removed: Transaction | null } {
  const oldTx = prev.transactions.find(t => t.id === id);
  if (!oldTx) {
    return { nextState: prev, removed: null };
  }

  const newAccounts = prev.accounts.map(a => ({ ...a }));

  if (oldTx.status === 'paid' && oldTx.accountId) {
    const acc = newAccounts.find(a => a.id === oldTx.accountId);
    if (acc) {
      if (oldTx.type === 'income') acc.balance -= oldTx.amount;
      else if (
        (oldTx.type === 'expense_fixed' || oldTx.type === 'expense_variable') &&
        oldTx.paymentMethod !== 'credit_card'
      ) {
        acc.balance += oldTx.amount;
      }
    }
  }

  return {
    nextState: {
      ...prev,
      transactions: prev.transactions.filter(t => t.id !== id),
      accounts: newAccounts
    },
    removed: oldTx
  };
}

export function removeDebtFromState(
  prev: AppState,
  id: string
): { nextState: AppState; removed: Debt | null } {
  const oldDebt = prev.debts.find(d => d.id === id);
  if (!oldDebt) return { nextState: prev, removed: null };
  return {
    nextState: {
      ...prev,
      debts: prev.debts.filter(d => d.id !== id)
    },
    removed: oldDebt
  };
}

export function removeCreditCardFromState(
  prev: AppState,
  id: string
): { nextState: AppState; removed: CreditCard | null } {
  const oldCard = prev.creditCards.find(c => c.id === id);
  if (!oldCard) return { nextState: prev, removed: null };
  return {
    nextState: {
      ...prev,
      creditCards: prev.creditCards.filter(c => c.id !== id)
    },
    removed: oldCard
  };
}

export function removeAccountFromState(
  prev: AppState,
  id: string
): { nextState: AppState; removed: BankAccount | null } {
  const oldAccount = prev.accounts.find(a => a.id === id);
  if (!oldAccount) return { nextState: prev, removed: null };
  return {
    nextState: {
      ...prev,
      accounts: prev.accounts.filter(a => a.id !== id)
    },
    removed: oldAccount
  };
}

export function removeGoalFromState(
  prev: AppState,
  id: string
): { nextState: AppState; removed: FinancialGoal | null } {
  const oldGoal = prev.goals.find(g => g.id === id);
  if (!oldGoal) return { nextState: prev, removed: null };
  return {
    nextState: {
      ...prev,
      goals: prev.goals.filter(g => g.id !== id)
    },
    removed: oldGoal
  };
}

export interface HydrationSessionResult {
  aborted: boolean;
  hydrated: boolean;
  state: AppState;
  skipNextAutoSync: boolean;
  status: CloudSyncStatusType;
  message: string;
  error?: string;
}

/**
 * Orquestrador puro de hidratação inicial por usuário autenticado.
 * - Verifica propriedade estrita do cache local (nunca usa chave legada global).
 * - Invalida imediatamente resultados caso a sessão/usuário mude durante chamadas assíncronas.
 * - Faz prevalecer dados remotos sobre caches sem propriedade ou demonstrativos.
 * - Nunca faz upload automático quando há falha de conexão com Supabase.
 */
export async function hydrateUserFinanceSession(params: {
  userId: string | null | undefined;
  isSessionMatch: () => boolean;
  localUserCache: AppState | null;
  fetchRemote: () => Promise<SyncResult>;
  uploadLocal?: (state: AppState) => Promise<SyncResult>;
  experimentalHistoryOptions?: ExperimentalRecoveryAdapterOptions;
}): Promise<HydrationSessionResult> {
  const { userId, isSessionMatch, localUserCache, fetchRemote, uploadLocal, experimentalHistoryOptions } = params;

  if (!userId || !isValidStorageUserId(userId) || !isSessionMatch()) {
    return {
      aborted: true,
      hydrated: false,
      state: createNeutralLoadingState(),
      skipNextAutoSync: true,
      status: 'unauthenticated',
      message: 'Sessão inválida ou encerrada antes da hidratação.'
    };
  }

  // Aceita apenas cache local estritamente vinculado ao mesmo userId e já inicializado
  const validLocalCache =
    localUserCache &&
    localUserCache.ownerUserId === userId &&
    (localUserCache.version ?? 0) > 0
      ? localUserCache
      : null;

  const remote = await fetchRemote();

  // Se o usuário trocou de conta ou fez logout enquanto a resposta vinha da rede, descarta tudo!
  if (!isSessionMatch()) {
    return {
      aborted: true,
      hydrated: false,
      state: createNeutralLoadingState(),
      skipNextAutoSync: true,
      status: 'unauthenticated',
      message: 'Operação assíncrona descartada por troca de usuário ou logout.'
    };
  }

  if (remote.success && remote.data) {
    const normalizedRemote: AppState = {
      ...remote.data,
      ownerUserId: userId,
      version: Math.max(1, remote.version || remote.data.version || 1),
      lastModified: remote.clientTimestamp || remote.data.lastModified || 0
    };

    if (!validLocalCache) {
      saveStateToStorageForUser(userId, normalizedRemote);
      return {
        aborted: false,
        hydrated: true,
        state: normalizedRemote,
        skipNextAutoSync: true,
        status: 'connected',
        message: 'Dados da conta carregados automaticamente da nuvem.'
      };
    }

    const conflict = resolveMultiDeviceConflict(
      validLocalCache,
      normalizedRemote,
      normalizedRemote.lastModified || 0,
      userId
    );

    if (conflict.strategy === 'use_local' && uploadLocal) {
      const prePushSnap = await saveRecoverySnapshotWithExperimentalHistory(
        userId,
        normalizedRemote,
        'pre_local_push',
        {
          ...experimentalHistoryOptions,
          isSessionStillValid: isSessionMatch
        }
      );
      if (prePushSnap.abortedBySessionChange || !isSessionMatch()) {
        return {
          aborted: true,
          hydrated: false,
          state: createNeutralLoadingState(),
          skipNextAutoSync: true,
          status: 'unauthenticated',
          message: 'Sessão alterada durante gravação preventiva de recuperação.'
        };
      }
      const pushedState: AppState = {
        ...validLocalCache,
        ownerUserId: userId
      };
      const uploadRes = await uploadLocal(pushedState);
      if (!isSessionMatch()) {
        return {
          aborted: true,
          hydrated: false,
          state: createNeutralLoadingState(),
          skipNextAutoSync: true,
          status: 'unauthenticated',
          message: 'Sessão alterada durante sincronização.'
        };
      }
      saveStateToStorageForUser(userId, pushedState);
      return {
        aborted: false,
        hydrated: true,
        state: pushedState,
        skipNextAutoSync: true,
        status: uploadRes.success ? 'connected' : 'error',
        message: uploadRes.success ? conflict.reason : (uploadRes.message || 'Falha ao enviar alterações locais.')
      };
    }

    if (conflict.strategy === 'conflict') {
      const conflictSnap = await saveRecoverySnapshotWithExperimentalHistory(
        userId,
        validLocalCache,
        'timestamp_tie_content_conflict',
        {
          ...experimentalHistoryOptions,
          isSessionStillValid: isSessionMatch
        }
      );
      if (conflictSnap.abortedBySessionChange || !isSessionMatch()) {
        return {
          aborted: true,
          hydrated: false,
          state: createNeutralLoadingState(),
          skipNextAutoSync: true,
          status: 'unauthenticated',
          message: 'Sessão alterada durante gravação preventiva de conflito.'
        };
      }
    }

    saveStateToStorageForUser(userId, normalizedRemote);
    return {
      aborted: false,
      hydrated: true,
      state: normalizedRemote,
      skipNextAutoSync: true,
      status: 'connected',
      message: conflict.reason
    };
  }

  if (remote.success && !remote.data) {
    // Conta sem registro prévio na nuvem: só envia se existir cache próprio DESTA conta com edições reais
    if (
      validLocalCache &&
      !validLocalCache.isSampleLoaded &&
      (validLocalCache.lastModified || 0) > 0 &&
      uploadLocal
    ) {
      const uploadRes = await uploadLocal(validLocalCache);
      if (!isSessionMatch()) {
        return {
          aborted: true,
          hydrated: false,
          state: createNeutralLoadingState(),
          skipNextAutoSync: true,
          status: 'unauthenticated',
          message: 'Sessão encerrada durante migração.'
        };
      }
      saveStateToStorageForUser(userId, validLocalCache);
      return {
        aborted: false,
        hydrated: true,
        state: validLocalCache,
        skipNextAutoSync: true,
        status: uploadRes.success ? 'connected' : 'error',
        message: uploadRes.success
          ? 'Dados locais desta conta sincronizados na nuvem.'
          : (uploadRes.message || 'Erro ao sincronizar dados iniciais.')
      };
    }

    const cleanState = createCleanUserState(userId);
    saveStateToStorageForUser(userId, cleanState);
    return {
      aborted: false,
      hydrated: true,
      state: cleanState,
      skipNextAutoSync: true,
      status: 'connected',
      message: 'Ambiente limpo e isolado pronto para uso.'
    };
  }

  // Falha de conexão ou erro na tabela: NUNCA envia cache local nem carrega dados sem proprietário!
  const isTableMissing = remote.code === '42P01';
  if (validLocalCache) {
    return {
      aborted: false,
      hydrated: true,
      state: validLocalCache,
      skipNextAutoSync: true,
      status: isTableMissing ? 'table_missing' : 'error',
      message: remote.message || 'Modo offline local desta conta (nuvem indisponível no momento).'
    };
  }

  return {
    aborted: false,
    hydrated: false,
    state: createNeutralLoadingState(userId),
    skipNextAutoSync: true,
    status: isTableMissing ? 'table_missing' : 'error',
    message: remote.message || 'Não foi possível carregar os dados financeiros desta conta.',
    error: remote.message || 'Falha de conexão ao carregar os dados seguros da sua conta.'
  };
}

const FinanceContext = createContext<FinanceContextType | undefined>(undefined);

export const FinanceProvider: React.FC<{
  children: React.ReactNode;
  experimentalHistoryOptions?: ExperimentalRecoveryAdapterOptions;
}> = ({ children, experimentalHistoryOptions }) => {
  const {
    supabaseUserId,
    supabaseUserEmail,
    isSupabaseAuthenticated,
    cloudAuthStatus,
    logout
  } = useAuth();

  // Estado inicial SEMPRE neutro enquanto aguarda validação e hidratação exclusiva do userId atual
  const [state, setState] = useState<AppState>(() => createNeutralLoadingState(supabaseUserId ?? undefined));
  const [isFinanceHydrating, setIsFinanceHydrating] = useState<boolean>(true);
  const [isFinanceHydrated, setIsFinanceHydrated] = useState<boolean>(false);
  const [hydratedUserId, setHydratedUserId] = useState<string | null>(null);
  const [hydrationError, setHydrationError] = useState<string | null>(null);
  const [legacyBackupPrompt, setLegacyBackupPrompt] = useState<LegacyStorageSummary | null>(null);
  const [hydrationNonce, setHydrationNonce] = useState<number>(0);
  const [pendingLogoutPrompt, setPendingLogoutPrompt] = useState<PendingLogoutPrompt | null>(null);
  const [isCheckingLogoutSafety, setIsCheckingLogoutSafety] = useState<boolean>(false);
  const logoutCheckInFlightRef = useRef<boolean>(false);

  // Refs de controle contra race conditions, trocas de usuário e uploads indevidos
  const isMountedRef = useRef<boolean>(true);
  const sessionEpochRef = useRef<number>(0);
  const activeUserIdRef = useRef<string | null>(supabaseUserId);
  const isHydratedRef = useRef<boolean>(false);
  const skipNextAutoSyncRef = useRef<boolean>(true);
  const operationLockRef = useRef<boolean>(false);
  const autoSyncInFlightRef = useRef<boolean>(false);
  const lastSyncedSignatureRef = useRef<string | null>(null);
  const syncTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const latestStateRef = useRef<AppState>(state);
  latestStateRef.current = state;
  const latestAuthSessionRef = useRef<{ userId: string | null; authenticated: boolean }>({
    userId: supabaseUserId,
    authenticated: isSupabaseAuthenticated
  });
  latestAuthSessionRef.current = {
    userId: supabaseUserId,
    authenticated: isSupabaseAuthenticated
  };

  const getStateSyncSignature = (targetState: AppState, userId: string): string =>
    `${userId}:${targetState.version || 0}:${targetState.lastModified || 0}`;

  // Theme state (preferência visual não sensível)
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
    if (!isHydratedRef.current) return;
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

  // Cleanup geral ao desmontar (logout ou troca de usuário)
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sessionEpochRef.current += 1;
      isHydratedRef.current = false;
      activeUserIdRef.current = null;
      autoSyncInFlightRef.current = false;
      lastSyncedSignatureRef.current = null;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, []);

  // Persiste apenas quando já hidratado, com usuário válido e propriedade confirmada
  useEffect(() => {
    if (!isHydratedRef.current || !supabaseUserId || hydratedUserId !== supabaseUserId) {
      return;
    }
    if (state.ownerUserId !== supabaseUserId) {
      return;
    }
    saveStateToStorageForUser(supabaseUserId, state);
  }, [state, supabaseUserId, hydratedUserId]);

  // Supabase Cloud Sync State
  const [cloudSyncStatus, setCloudSyncStatus] = useState<CloudSyncStatusType>(() => {
    if (isSupabaseAuthenticated) return 'connected';
    if (cloudAuthStatus === 'session_expired') return 'session_expired';
    if (cloudAuthStatus === 'not_configured') return 'not_configured';
    return 'unauthenticated';
  });
  const [cloudSyncMessage, setCloudSyncMessage] = useState<string | null>(null);
  const [lastCloudSyncDate, setLastCloudSyncDate] = useState<Date | null>(null);
  const cloudSyncStatusRef = useRef<CloudSyncStatusType>(cloudSyncStatus);
  cloudSyncStatusRef.current = cloudSyncStatus;

  const isSessionOperationValid = (epoch: number, expectedUserId: string | null): expectedUserId is string => {
    return (
      isMountedRef.current &&
      !!expectedUserId &&
      sessionEpochRef.current === epoch &&
      activeUserIdRef.current === expectedUserId &&
      latestAuthSessionRef.current.authenticated &&
      latestAuthSessionRef.current.userId === expectedUserId
    );
  };

  // Envio manual protegido: consulta o estado remoto antes e bloqueia sobrescrita em caso de conflito ou nuvem mais recente
  const forceUploadLocalToCloud = async (): Promise<ManualUploadOutcome> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;

    if (!reqUserId || !isSupabaseAuthenticated || !isHydratedRef.current) {
      setCloudSyncStatus(cloudAuthStatus === 'session_expired' ? 'session_expired' : 'unauthenticated');
      const msg = 'Sessão não autenticada ou ainda em carregamento.';
      setCloudSyncMessage(msg);
      return { success: false, message: msg };
    }

    const currentState = latestStateRef.current;
    if (!hasConfirmedStateOwnership(currentState, reqUserId)) {
      setCloudSyncStatus('error');
      const msg = 'Envio cancelado: dados locais não pertencem ao usuário autenticado.';
      setCloudSyncMessage(msg);
      return { success: false, message: msg };
    }

    if (operationLockRef.current || autoSyncInFlightRef.current) {
      const msg = 'Outra sincronização ou operação crítica está em andamento. Aguarde a conclusão.';
      setCloudSyncMessage(msg);
      return { success: false, message: msg };
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    operationLockRef.current = true;
    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Verificando alterações na nuvem antes de enviar...');

    try {
      const remoteResult = await fetchFinanceDataFromSupabase(reqUserId);
      if (!isSessionOperationValid(reqEpoch, reqUserId)) {
        return { success: false, message: 'Sessão encerrada ou alterada durante a verificação.' };
      }

      if (!remoteResult.success && remoteResult.code === '42P01') {
        setCloudSyncStatus('table_missing');
        const msg = 'A tabela "user_finance_data" precisa ser criada no Supabase com RLS.';
        setCloudSyncMessage(msg);
        return { success: false, message: msg };
      }

      const decision = evaluateManualCloudUploadSafety({
        localState: currentState,
        remoteResult,
        expectedUserId: reqUserId
      });

      if (!decision.allowed) {
        if (decision.alreadySynced) {
          lastSyncedSignatureRef.current = getStateSyncSignature(currentState, reqUserId);
          setCloudSyncStatus('connected');
          setCloudSyncMessage(decision.message);
          return {
            success: true,
            alreadySynced: true,
            message: decision.message,
            decision
          };
        }

        setCloudSyncStatus(decision.conflict ? 'connected' : 'error');
        setCloudSyncMessage(decision.message);
        return {
          success: false,
          conflict: decision.conflict,
          message: decision.message,
          decision
        };
      }

      setCloudSyncMessage('Enviando dados locais verificados para a nuvem...');
      const bumpedState: AppState = {
        ...currentState,
        ownerUserId: reqUserId,
        version: Math.max(1, (currentState.version || 0) + 1),
        lastModified: Date.now()
      };

      const res = await saveFinanceDataToSupabase(bumpedState, reqUserId);
      if (!isSessionOperationValid(reqEpoch, reqUserId)) {
        return { success: false, message: 'Sessão encerrada durante o envio.' };
      }

      if (res.success) {
        skipNextAutoSyncRef.current = true;
        lastSyncedSignatureRef.current = getStateSyncSignature(bumpedState, reqUserId);
        latestStateRef.current = bumpedState;
        setState(bumpedState);
        saveStateToStorageForUser(reqUserId, bumpedState);
        setCloudSyncStatus('connected');
        const msg = 'Dados locais enviados e salvos na nuvem com sucesso!';
        setCloudSyncMessage(msg);
        setLastCloudSyncDate(new Date());
        return { success: true, conflict: false, message: msg, decision };
      }

      if (res.code === '42P01') {
        setCloudSyncStatus('table_missing');
        const msg = 'A tabela "user_finance_data" precisa ser criada no Supabase com RLS.';
        setCloudSyncMessage(msg);
        return { success: false, message: msg };
      }

      setCloudSyncStatus('error');
      const msg = res.message || 'Erro ao enviar dados locais para o Supabase.';
      setCloudSyncMessage(msg);
      return { success: false, message: msg };
    } finally {
      operationLockRef.current = false;
    }
  };

  // Gatilho manual protegido: sempre verifica o estado remoto antes de enviar
  const syncNowWithCloud = async () => {
    await forceUploadLocalToCloud();
  };

  // Força o download dos dados da nuvem para o dispositivo local (com snapshot local prévio)
  const forceDownloadFromCloud = async () => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;

    if (!reqUserId || !isSupabaseAuthenticated) {
      setCloudSyncStatus(cloudAuthStatus === 'session_expired' ? 'session_expired' : 'unauthenticated');
      setCloudSyncMessage('Conecte sua conta Supabase para baixar dados da nuvem.');
      return;
    }

    if (operationLockRef.current) {
      setCloudSyncMessage('Outra operação crítica em andamento. Aguarde a conclusão.');
      return;
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    operationLockRef.current = true;
    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Buscando dados exclusivos desta conta na nuvem...');

    try {
      const remote = await fetchFinanceDataFromSupabase(reqUserId);
      if (!isSessionOperationValid(reqEpoch, reqUserId)) return;

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

      const currentStateBeforeDownload = latestStateRef.current;
      // Preserva cópia local escopada por usuário antes de aplicar o estado da nuvem
      if (isHydratedRef.current && hasConfirmedStateOwnership(currentStateBeforeDownload, reqUserId)) {
        const downloadSnap = await saveRecoverySnapshotWithExperimentalHistory(
          reqUserId,
          currentStateBeforeDownload,
          'pre_force_download',
          {
            ...experimentalHistoryOptions,
            isSessionStillValid: () => isSessionOperationValid(reqEpoch, reqUserId)
          }
        );
        if (downloadSnap.abortedBySessionChange || !isSessionOperationValid(reqEpoch, reqUserId)) {
          return;
        }
      }

      const hydratedRemote: AppState = {
        ...remote.data,
        ownerUserId: reqUserId,
        version: Math.max(1, remote.version || remote.data.version || 1),
        lastModified: remote.clientTimestamp || remote.data.lastModified || Date.now()
      };

      skipNextAutoSyncRef.current = true;
      lastSyncedSignatureRef.current = getStateSyncSignature(hydratedRemote, reqUserId);
      isHydratedRef.current = true;
      latestStateRef.current = hydratedRemote;
      setHydratedUserId(reqUserId);
      setIsFinanceHydrated(true);
      setIsFinanceHydrating(false);
      setHydrationError(null);
      setState(hydratedRemote);
      saveStateToStorageForUser(reqUserId, hydratedRemote);
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Dados da nuvem baixados e aplicados com sucesso!');
      setLastCloudSyncDate(new Date());
    } finally {
      operationLockRef.current = false;
    }
  };

  // Executa diagnóstico completo de conexão, autenticação, leitura e gravação segura no Supabase
  const runCloudDiagnostic = async (): Promise<DiagnosticResult> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;

    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Executando diagnóstico de conexão e integridade no Supabase...');
    const result = await runFullSupabaseDiagnostic(state, reqUserId);
    if (!isSessionOperationValid(reqEpoch, reqUserId)) {
      return result;
    }

    if (result.allPassed) {
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Diagnóstico aprovado: Conexão, autenticação e isolamento RLS operacionais!');
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

  const retryCloudHydration = async () => {
    setHydrationNonce(prev => prev + 1);
  };

  const exportLegacyBackupFile = (): string | null => {
    return exportLegacyStorageJson(supabaseUserId);
  };

  const dismissLegacyBackupPrompt = () => {
    if (supabaseUserId && isValidStorageUserId(supabaseUserId)) {
      dismissLegacyRecoveryPromptForUser(supabaseUserId);
    }
    setLegacyBackupPrompt(null);
  };

  const importLegacyBackupToCurrentAccount = async (
    confirmedOwnership: boolean
  ): Promise<{ success: boolean; message: string }> => {
    if (!confirmedOwnership) {
      return {
        success: false,
        message: 'Confirme explicitamente que os dados legados pertencem a esta conta antes de importar.'
      };
    }

    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;
    if (
      !isHydratedRef.current ||
      !reqUserId ||
      !isValidStorageUserId(reqUserId) ||
      hydratedUserId !== reqUserId ||
      !isSessionOperationValid(reqEpoch, reqUserId)
    ) {
      return {
        success: false,
        message: 'A conta autenticada precisa concluir a hidratação antes de importar dados legados.'
      };
    }

    if (operationLockRef.current) {
      return {
        success: false,
        message: 'Outra operação crítica em andamento. Aguarde a conclusão antes de importar dados legados.'
      };
    }

    const { summary, state: legacyState } = inspectLegacyStorageState(reqUserId);
    if (!summary.exists || !summary.ownershipVerified || !legacyState) {
      return {
        success: false,
        message: summary.accessBlocked
          ? 'Importação bloqueada: não foi possível comprovar que os dados legados pertencem a esta conta. Solicite recuperação administrativa segura.'
          : 'Nenhum dado legado válido encontrado para importação.'
      };
    }

    const currentState = latestStateRef.current;
    if (currentState.ownerUserId && currentState.ownerUserId !== reqUserId) {
      return {
        success: false,
        message: 'Importação bloqueada: divergência de proprietário nos dados locais ativos.'
      };
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    operationLockRef.current = true;
    try {
      const legacySnap = await saveRecoverySnapshotWithExperimentalHistory(
        reqUserId,
        currentState,
        'pre_legacy_import',
        {
          ...experimentalHistoryOptions,
          isSessionStillValid: () => isSessionOperationValid(reqEpoch, reqUserId)
        }
      );

      if (legacySnap.abortedBySessionChange || !isSessionOperationValid(reqEpoch, reqUserId)) {
        return {
          success: false,
          message: 'Sessão encerrada ou alterada durante a gravação preventiva. Importação cancelada.'
        };
      }

      const nextState: AppState = {
        ...legacyState,
        ownerUserId: reqUserId,
        version: Math.max(1, (currentState.version || 0) + 1),
        lastModified: Date.now(),
        isSampleLoaded: Boolean(legacyState.isSampleLoaded)
      };

      latestStateRef.current = nextState;
      setState(nextState);
      saveStateToStorageForUser(reqUserId, nextState);
      dismissLegacyRecoveryPromptForUser(reqUserId);
      setLegacyBackupPrompt(null);

      return {
        success: true,
        message: `Dados legados (${summary.transactionsCount} lançamentos) importados com segurança para esta conta.`
      };
    } finally {
      operationLockRef.current = false;
    }
  };

  // Hidratação segura e estritamente isolada por usuário a cada login / troca de conta
  useEffect(() => {
    sessionEpochRef.current += 1;
    const currentEpoch = sessionEpochRef.current;
    activeUserIdRef.current = supabaseUserId;
    isHydratedRef.current = false;
    skipNextAutoSyncRef.current = true;
    autoSyncInFlightRef.current = false;
    lastSyncedSignatureRef.current = null;

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    // Limpa estado financeiro em memória imediatamente ao trocar de usuário ou deslogar
    const neutralState = createNeutralLoadingState(supabaseUserId ?? undefined);
    latestStateRef.current = neutralState;
    setState(neutralState);
    setIsFinanceHydrated(false);
    setHydratedUserId(null);
    setHydrationError(null);
    setLegacyBackupPrompt(null);
    setPendingLogoutPrompt(null);
    setIsCheckingLogoutSafety(false);
    logoutCheckInFlightRef.current = false;

    if (!supabaseUserId || !isSupabaseAuthenticated || !isValidStorageUserId(supabaseUserId)) {
      setIsFinanceHydrating(false);
      setCloudSyncStatus(cloudAuthStatus === 'session_expired' ? 'session_expired' : 'unauthenticated');
      setCloudSyncMessage('Sessão não autenticada. Faça login para acessar seus dados.');
      return;
    }

    const reqUserId = supabaseUserId;
    setIsFinanceHydrating(true);
    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Carregando dados exclusivos da conta autenticada...');

    async function initCloudSync() {
      const conn = await testSupabaseConnection();
      if (!isSessionOperationValid(currentEpoch, reqUserId)) return;

      if (!conn.connected) {
        // Sem conexão na primeira checagem: ainda consulta o orquestrador que bloqueia uploads e só aceita cache próprio do usuário
        const offlineOutcome = await hydrateUserFinanceSession({
          userId: reqUserId,
          isSessionMatch: () => isSessionOperationValid(currentEpoch, reqUserId),
          localUserCache: getUserStateFromStorage(reqUserId),
          fetchRemote: async () => ({ success: false, message: conn.message }),
          experimentalHistoryOptions
        });
        if (offlineOutcome.aborted || !isSessionOperationValid(currentEpoch, reqUserId)) return;

        skipNextAutoSyncRef.current = true;
        isHydratedRef.current = offlineOutcome.hydrated;
        latestStateRef.current = offlineOutcome.state;
        setState(offlineOutcome.state);
        setIsFinanceHydrated(offlineOutcome.hydrated);
        setHydratedUserId(offlineOutcome.hydrated ? reqUserId : null);
        setHydrationError(offlineOutcome.error || null);
        setIsFinanceHydrating(false);
        setCloudSyncStatus(offlineOutcome.status);
        setCloudSyncMessage(offlineOutcome.message);
        return;
      }

      if (!conn.tableExists) {
        const missingOutcome = await hydrateUserFinanceSession({
          userId: reqUserId,
          isSessionMatch: () => isSessionOperationValid(currentEpoch, reqUserId),
          localUserCache: getUserStateFromStorage(reqUserId),
          fetchRemote: async () => ({
            success: false,
            code: '42P01',
            message: 'Tabela "user_finance_data" não encontrada no Supabase.'
          }),
          experimentalHistoryOptions
        });
        if (missingOutcome.aborted || !isSessionOperationValid(currentEpoch, reqUserId)) return;

        skipNextAutoSyncRef.current = true;
        isHydratedRef.current = missingOutcome.hydrated;
        latestStateRef.current = missingOutcome.state;
        setState(missingOutcome.state);
        setIsFinanceHydrated(missingOutcome.hydrated);
        setHydratedUserId(missingOutcome.hydrated ? reqUserId : null);
        setHydrationError(missingOutcome.error || null);
        setIsFinanceHydrating(false);
        setCloudSyncStatus('table_missing');
        setCloudSyncMessage(missingOutcome.message);
        return;
      }

      const localUserCache = getUserStateFromStorage(reqUserId);
      const outcome = await hydrateUserFinanceSession({
        userId: reqUserId,
        isSessionMatch: () => isSessionOperationValid(currentEpoch, reqUserId),
        localUserCache,
        fetchRemote: () => fetchFinanceDataFromSupabase(reqUserId),
        uploadLocal: (s) => migrateAndVerifyFinanceData(s, reqUserId),
        experimentalHistoryOptions
      });

      if (outcome.aborted || !isSessionOperationValid(currentEpoch, reqUserId)) {
        return;
      }

      skipNextAutoSyncRef.current = outcome.skipNextAutoSync;
      isHydratedRef.current = outcome.hydrated;
      latestStateRef.current = outcome.state;
      setState(outcome.state);
      setIsFinanceHydrated(outcome.hydrated);
      setHydratedUserId(outcome.hydrated ? reqUserId : null);
      setHydrationError(outcome.error || null);
      setIsFinanceHydrating(false);
      setCloudSyncStatus(outcome.status);
      setCloudSyncMessage(outcome.message);
      if (outcome.hydrated && outcome.status === 'connected') {
        lastSyncedSignatureRef.current = getStateSyncSignature(outcome.state, reqUserId);
        setLastCloudSyncDate(new Date());
      }

      // Inspeção somente leitura da chave legada global com validação estrita de propriedade
      if (outcome.hydrated && !isLegacyRecoveryDismissedForUser(reqUserId)) {
        const legacyInfo = inspectLegacyStorageState(reqUserId);
        if (
          legacyInfo.summary.exists &&
          (legacyInfo.summary.accessBlocked || legacyInfo.summary.transactionsCount > 0)
        ) {
          setLegacyBackupPrompt(legacyInfo.summary);
        }
      }
    }

    initCloudSync();

    return () => {
      sessionEpochRef.current += 1;
      isHydratedRef.current = false;
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [supabaseUserId, isSupabaseAuthenticated, hydrationNonce]);

  // Continuous auto-sync com debounce: bloqueado até hidratação concluída e confirmação estrita de propriedade
  // Não depende de cloudSyncStatus para evitar loops de reenvio quando o status muda para 'syncing'/'connected'/'error'.
  useEffect(() => {
    if (!isHydratedRef.current || !supabaseUserId || !isSupabaseAuthenticated || hydratedUserId !== supabaseUserId) {
      return;
    }

    if (operationLockRef.current) {
      return;
    }

    if (cloudSyncStatusRef.current === 'table_missing' || !hasConfirmedStateOwnership(state, supabaseUserId)) {
      return;
    }

    if (skipNextAutoSyncRef.current) {
      skipNextAutoSyncRef.current = false;
      return;
    }

    if (state.isSampleLoaded && (!state.lastModified || state.lastModified <= 0)) {
      return;
    }

    const targetSignature = getStateSyncSignature(state, supabaseUserId);
    if (lastSyncedSignatureRef.current === targetSignature) {
      return;
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;

    const runAutoSync = async () => {
      syncTimeoutRef.current = null;
      if (
        !isSessionOperationValid(reqEpoch, reqUserId) ||
        !isHydratedRef.current ||
        operationLockRef.current ||
        cloudSyncStatusRef.current === 'table_missing'
      ) {
        return;
      }

      if (autoSyncInFlightRef.current) {
        syncTimeoutRef.current = setTimeout(runAutoSync, 400);
        return;
      }

      const stateToSync = latestStateRef.current;
      if (!hasConfirmedStateOwnership(stateToSync, reqUserId)) {
        return;
      }

      if (stateToSync.isSampleLoaded && (!stateToSync.lastModified || stateToSync.lastModified <= 0)) {
        return;
      }

      const signatureToSync = getStateSyncSignature(stateToSync, reqUserId);
      if (lastSyncedSignatureRef.current === signatureToSync) {
        return;
      }

      autoSyncInFlightRef.current = true;
      setCloudSyncStatus('syncing');
      try {
        const res = await saveFinanceDataToSupabase(stateToSync, reqUserId);
        if (!isSessionOperationValid(reqEpoch, reqUserId)) {
          return;
        }
        if (res.success) {
          lastSyncedSignatureRef.current = signatureToSync;
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
      } finally {
        autoSyncInFlightRef.current = false;
      }
    };

    syncTimeoutRef.current = setTimeout(runAutoSync, 2000);

    return () => {
      if (syncTimeoutRef.current) {
        clearTimeout(syncTimeoutRef.current);
        syncTimeoutRef.current = null;
      }
    };
  }, [state, supabaseUserId, isSupabaseAuthenticated, hydratedUserId]);

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

  const mutateState = (updater: (current: AppState) => AppState) => {
    const reqUserId = supabaseUserId;
    if (!isHydratedRef.current || !reqUserId || !isSupabaseAuthenticated || activeUserIdRef.current !== reqUserId) {
      return;
    }
    setState(prev => {
      const next = applyAuthenticatedMutation(prev, reqUserId, isHydratedRef.current, updater);
      latestStateRef.current = next;
      return next;
    });
  };

  const executeAuthenticatedDeletion = async <T,>(
    entityLabel: string,
    remover: (prev: AppState) => { nextState: AppState; removed: T | null }
  ): Promise<DeleteResult> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;

    if (
      !isHydratedRef.current ||
      !reqUserId ||
      !isSupabaseAuthenticated ||
      activeUserIdRef.current !== reqUserId ||
      hydratedUserId !== reqUserId
    ) {
      return {
        success: false,
        synced: false,
        message: 'Sessão não autenticada ou ainda em carregamento. Aguarde antes de excluir.'
      };
    }

    const currentState = latestStateRef.current;
    if (currentState.ownerUserId && currentState.ownerUserId !== reqUserId) {
      return {
        success: false,
        synced: false,
        message: 'Operação bloqueada: divergência de proprietário nos dados locais.'
      };
    }

    const { nextState: candidateState, removed } = remover(currentState);
    if (!removed) {
      return {
        success: false,
        synced: false,
        message: `${entityLabel} não encontrado(a) ou já removido(a).`
      };
    }

    const nextState: AppState = {
      ...candidateState,
      ownerUserId: reqUserId,
      version: Math.max(1, (currentState.version || 0) + 1),
      lastModified: Date.now()
    };

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    skipNextAutoSyncRef.current = true;
    latestStateRef.current = nextState;
    setState(nextState);
    saveStateToStorageForUser(reqUserId, nextState);

    setCloudSyncStatus('syncing');
    setCloudSyncMessage(`Sincronizando exclusão de ${entityLabel.toLowerCase()} na nuvem...`);

    const res = await saveFinanceDataToSupabase(nextState, reqUserId);
    if (!isSessionOperationValid(reqEpoch, reqUserId)) {
      return {
        success: true,
        synced: false,
        message: `${entityLabel} excluído(a) localmente antes da troca ou encerramento da sessão.`
      };
    }

    if (res.success) {
      lastSyncedSignatureRef.current = getStateSyncSignature(nextState, reqUserId);
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Alterações sincronizadas na nuvem.');
      setLastCloudSyncDate(new Date());
      return {
        success: true,
        synced: true,
        message: `${entityLabel} excluído(a) e sincronizado(a) na nuvem com sucesso!`
      };
    }

    if (res.code === '42P01') {
      setCloudSyncStatus('table_missing');
      setCloudSyncMessage('A tabela "user_finance_data" precisa ser criada no Supabase com RLS.');
    } else {
      setCloudSyncStatus('error');
      setCloudSyncMessage(res.message || 'Erro ao sincronizar exclusão com a nuvem.');
    }

    return {
      success: true,
      synced: false,
      message: `${entityLabel} excluído(a) localmente, mas falhou ao sincronizar com a nuvem: ${res.message || 'verifique sua conexão.'}`
    };
  };

  const addTransaction = (txData: Omit<Transaction, 'id'>, installmentsCount = 1) => {
    mutateState(prev => {
      const newTransactions: Transaction[] = [...prev.transactions];
      const newAccounts: BankAccount[] = prev.accounts.map(a => ({ ...a }));
      const groupId = installmentsCount > 1 ? `inst-${Date.now()}` : undefined;

      for (let i = 1; i <= installmentsCount; i++) {
        const id = `tx-${Date.now()}-${i}-${Math.random().toString(36).substring(2, 6)}`;

        let txDate = txData.date;
        let txDueDate = txData.dueDate;

        if (i > 1) {
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
          status: i === 1 ? txData.status : 'pending',
        };

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
    mutateState(prev => {
      const oldTx = prev.transactions.find(t => t.id === id);
      if (!oldTx) return prev;

      const newAccounts = prev.accounts.map(a => ({ ...a }));

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

  const deleteTransaction = (id: string): Promise<DeleteResult> => {
    return executeAuthenticatedDeletion('Lançamento', prev => removeTransactionFromState(prev, id));
  };

  const duplicateTransaction = (id: string) => {
    if (!isHydratedRef.current || !supabaseUserId || !isSupabaseAuthenticated) return;
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

    mutateState(prev => {
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
    mutateState(prev => {
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
    mutateState(prev => {
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
    mutateState(prev => ({
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
    mutateState(prev => {
      if (!prev.debts.some(d => d.id === id)) return prev;
      return {
        ...prev,
        debts: prev.debts.map(d => (d.id === id ? { ...d, ...updated } : d))
      };
    });
  };

  const deleteDebt = (id: string): Promise<DeleteResult> => {
    return executeAuthenticatedDeletion('Dívida', prev => removeDebtFromState(prev, id));
  };

  // Credit Card CRUD
  const addCreditCard = (cardData: Omit<CreditCard, 'id'>) => {
    mutateState(prev => ({
      ...prev,
      creditCards: [...prev.creditCards, { ...cardData, id: `card-${Date.now()}` }]
    }));
  };

  const updateCreditCard = (id: string, updated: Partial<CreditCard>) => {
    mutateState(prev => {
      if (!prev.creditCards.some(c => c.id === id)) return prev;
      return {
        ...prev,
        creditCards: prev.creditCards.map(c => (c.id === id ? { ...c, ...updated } : c))
      };
    });
  };

  const deleteCreditCard = (id: string): Promise<DeleteResult> => {
    return executeAuthenticatedDeletion('Cartão', prev => removeCreditCardFromState(prev, id));
  };

  // Account CRUD
  const addAccount = (accData: Omit<BankAccount, 'id'>) => {
    mutateState(prev => ({
      ...prev,
      accounts: [...prev.accounts, { ...accData, id: `acc-${Date.now()}` }]
    }));
  };

  const updateAccount = (id: string, updated: Partial<BankAccount>) => {
    mutateState(prev => {
      if (!prev.accounts.some(a => a.id === id)) return prev;
      return {
        ...prev,
        accounts: prev.accounts.map(a => (a.id === id ? { ...a, ...updated } : a))
      };
    });
  };

  const deleteAccount = (id: string): Promise<DeleteResult> => {
    return executeAuthenticatedDeletion('Conta bancária', prev => removeAccountFromState(prev, id));
  };

  // Category CRUD
  const addCategory = (catData: Omit<Category, 'id'>) => {
    mutateState(prev => ({
      ...prev,
      categories: [...prev.categories, { ...catData, id: `cat-${Date.now()}`, isCustom: true }]
    }));
  };

  const updateCategory = (id: string, updated: Partial<Category>) => {
    mutateState(prev => {
      if (!prev.categories.some(c => c.id === id)) return prev;
      return {
        ...prev,
        categories: prev.categories.map(c => (c.id === id ? { ...c, ...updated } : c))
      };
    });
  };

  const deleteCategory = (id: string): boolean => {
    if (!isHydratedRef.current || !supabaseUserId || !isSupabaseAuthenticated) return false;
    const cat = state.categories.find(c => c.id === id);
    if (!cat) return false;
    const hasTransactions = state.transactions.some(t => t.category === cat.name);
    if (hasTransactions) return false;

    mutateState(prev => ({
      ...prev,
      categories: prev.categories.filter(c => c.id !== id)
    }));
    return true;
  };

  // Goals CRUD
  const addGoal = (goalData: Omit<FinancialGoal, 'id' | 'currentAmount' | 'completed'>) => {
    mutateState(prev => ({
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
    mutateState(prev => {
      if (!prev.goals.some(g => g.id === id)) return prev;
      return {
        ...prev,
        goals: prev.goals.map(g => (g.id === id ? { ...g, ...updated } : g))
      };
    });
  };

  const deleteGoal = (id: string): Promise<DeleteResult> => {
    return executeAuthenticatedDeletion('Objetivo', prev => removeGoalFromState(prev, id));
  };

  const contributeToGoal = (goalId: string, accountId: string, amount: number) => {
    mutateState(prev => {
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
    mutateState(prev => ({ ...prev, safetyReserveDesired: Math.max(0, val) }));
  };

  const loadSampleData = async (): Promise<DestructiveActionOutcome> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;
    if (
      !isHydratedRef.current ||
      !reqUserId ||
      !isSupabaseAuthenticated ||
      hydratedUserId !== reqUserId ||
      !isSessionOperationValid(reqEpoch, reqUserId)
    ) {
      return {
        success: false,
        synced: false,
        message: 'Aguarde o carregamento da sessão autenticada antes de alterar os dados.'
      };
    }

    if (operationLockRef.current) {
      return {
        success: false,
        synced: false,
        message: 'Outra operação crítica em andamento. Aguarde a conclusão.'
      };
    }

    const currentState = latestStateRef.current;
    if (currentState.ownerUserId && currentState.ownerUserId !== reqUserId) {
      return {
        success: false,
        synced: false,
        message: 'Operação bloqueada: divergência de proprietário nos dados locais.'
      };
    }

    if (hasRealFinancialData(currentState)) {
      return {
        success: false,
        synced: false,
        blockedByRealData: true,
        message:
          'Ação bloqueada: esta conta possui dados financeiros reais. Para protegê-los, os dados demonstrativos não podem substituir lançamentos, dívidas ou objetivos reais.'
      };
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    operationLockRef.current = true;
    try {
      const hadEligibleContent =
        (currentState.transactions?.length || 0) > 0 ||
        (currentState.debts?.length || 0) > 0 ||
        (currentState.goals?.length || 0) > 0;
      const sampleSnap = await saveRecoverySnapshotWithExperimentalHistory(
        reqUserId,
        currentState,
        'pre_load_sample',
        {
          ...experimentalHistoryOptions,
          isSessionStillValid: () => isSessionOperationValid(reqEpoch, reqUserId)
        }
      );
      if (sampleSnap.abortedBySessionChange || !isSessionOperationValid(reqEpoch, reqUserId)) {
        return {
          success: false,
          synced: false,
          message: 'Sessão encerrada ou alterada durante a gravação preventiva.'
        };
      }

      const anySampleSnapshotSaved = sampleSnap.legacySaved || sampleSnap.historySaved;
      const sampleSnapshotStatus: 'saved' | 'not_needed' | 'failed' = anySampleSnapshotSaved
        ? 'saved'
        : !hadEligibleContent || sampleSnap.historyCode === 'skipped_ineligible'
          ? 'not_needed'
          : 'failed';

      skipNextAutoSyncRef.current = true;
      const sampleState = resetToSampleStateForUser(reqUserId, currentState.version || 0);
      latestStateRef.current = sampleState;
      setState(sampleState);
      return {
        success: true,
        synced: false,
        snapshotStatus: sampleSnapshotStatus,
        message:
          sampleSnapshotStatus === 'failed'
            ? 'Dados demonstrativos carregados apenas para visualização local (nuvem preservada), porém não foi possível gravar o snapshot preventivo local.'
            : 'Dados demonstrativos carregados apenas para visualização local (nuvem preservada).'
      };
    } finally {
      operationLockRef.current = false;
    }
  };

  const resetAllData = async (): Promise<DestructiveActionOutcome> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;
    if (!isHydratedRef.current || !reqUserId || !isSupabaseAuthenticated || hydratedUserId !== reqUserId) {
      return {
        success: false,
        synced: false,
        message: 'Aguarde o carregamento da sessão autenticada antes de zerar os dados.'
      };
    }

    if (operationLockRef.current) {
      return {
        success: false,
        synced: false,
        message: 'Outra operação crítica em andamento. Aguarde a conclusão.'
      };
    }

    const currentState = latestStateRef.current;
    if (currentState.ownerUserId && currentState.ownerUserId !== reqUserId) {
      return {
        success: false,
        synced: false,
        message: 'Operação bloqueada: divergência de proprietário nos dados locais.'
      };
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    operationLockRef.current = true;

    try {
      const hadEligibleContent =
        (currentState.transactions?.length || 0) > 0 ||
        (currentState.debts?.length || 0) > 0 ||
        (currentState.goals?.length || 0) > 0;
      const resetSnap = await saveRecoverySnapshotWithExperimentalHistory(
        reqUserId,
        currentState,
        'pre_reset_clean',
        {
          ...experimentalHistoryOptions,
          isSessionStillValid: () => isSessionOperationValid(reqEpoch, reqUserId)
        }
      );
      if (resetSnap.abortedBySessionChange || !isSessionOperationValid(reqEpoch, reqUserId)) {
        return {
          success: false,
          synced: false,
          message: 'Sessão alterada antes da reinicialização dos dados.'
        };
      }

      const anyResetSnapshotSaved = resetSnap.legacySaved || resetSnap.historySaved;
      const resetSnapshotStatus: 'saved' | 'not_needed' | 'failed' = anyResetSnapshotSaved
        ? 'saved'
        : !hadEligibleContent || resetSnap.historyCode === 'skipped_ineligible'
          ? 'not_needed'
          : 'failed';

      const cleanState = resetToCleanStateForUser(reqUserId, currentState.version || 0);
      skipNextAutoSyncRef.current = true;
      latestStateRef.current = cleanState;
      setState(cleanState);

      setCloudSyncStatus('syncing');
      setCloudSyncMessage('Sincronizando reinicialização limpa da conta com a nuvem...');
      const syncRes = await saveFinanceDataToSupabase(cleanState, reqUserId);
      if (!isSessionOperationValid(reqEpoch, reqUserId)) {
        return {
          success: true,
          synced: false,
          snapshotStatus: resetSnapshotStatus,
          message: 'Dados zerados localmente antes do encerramento da sessão.'
        };
      }

      if (syncRes.success) {
        lastSyncedSignatureRef.current = getStateSyncSignature(cleanState, reqUserId);
        setCloudSyncStatus('connected');
        setCloudSyncMessage('Conta zerada e sincronizada com a nuvem!');
        setLastCloudSyncDate(new Date());

        const syncedMessage =
          resetSnapshotStatus === 'saved'
            ? 'Dados zerados com segurança! Um snapshot local prévio foi preservado e a nuvem foi atualizada.'
            : resetSnapshotStatus === 'not_needed'
              ? 'Dados zerados com segurança e nuvem atualizada. Nenhum snapshot preventivo foi necessário pois a conta não possuía lançamentos, dívidas ou objetivos.'
              : 'Dados zerados e nuvem atualizada, porém não foi possível gravar o snapshot preventivo local neste navegador.';

        return {
          success: true,
          synced: true,
          snapshotStatus: resetSnapshotStatus,
          message: syncedMessage
        };
      }

      if (syncRes.code === '42P01') {
        setCloudSyncStatus('table_missing');
      } else {
        setCloudSyncStatus('error');
      }
      setCloudSyncMessage(syncRes.message || 'Dados zerados localmente, mas não sincronizados com a nuvem.');

      const unsyncedMessage =
        resetSnapshotStatus === 'saved'
          ? 'Dados zerados localmente (snapshot de recuperação salvo), mas houve falha ao sincronizar na nuvem.'
          : resetSnapshotStatus === 'not_needed'
            ? 'Dados zerados localmente (nenhum snapshot preventivo necessário para conta sem registros), mas houve falha ao sincronizar na nuvem.'
            : 'Dados zerados localmente, porém não foi possível gravar o snapshot preventivo local e houve falha ao sincronizar na nuvem.';

      return {
        success: true,
        synced: false,
        snapshotStatus: resetSnapshotStatus,
        message: unsyncedMessage
      };
    } finally {
      operationLockRef.current = false;
    }
  };

  const exportBackupJson = (): string => {
    return JSON.stringify(latestStateRef.current, null, 2);
  };

  const requestSafeLogout = async (): Promise<void> => {
    if (logoutCheckInFlightRef.current) return;

    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;
    const idbOverride = experimentalHistoryOptions?.indexedDBFactory;

    if (
      !reqUserId ||
      !isSupabaseAuthenticated ||
      !isValidStorageUserId(reqUserId) ||
      !isHydratedRef.current ||
      hydratedUserId !== reqUserId
    ) {
      await logout({
        preserveRecoveryBackups: true,
        userEmailOverride: supabaseUserEmail,
        indexedDBFactory: idbOverride
      });
      return;
    }

    const currentState = latestStateRef.current;
    const hasInFlightSync = autoSyncInFlightRef.current || operationLockRef.current;
    const hasExistingRecovery = Boolean(getRecoverySnapshotForUser(reqUserId));

    if (hasInFlightSync) {
      setPendingLogoutPrompt({
        reasonCode: 'sync_in_progress',
        message:
          'Uma sincronização com a nuvem está em andamento neste instante. Aguarde a conclusão ou exporte seu backup antes de sair.',
        hasLocalRecoveryBackup: hasExistingRecovery || hasRealFinancialData(currentState),
        canRetrySync: true,
        actionError: null,
        isProcessing: false
      });
      return;
    }

    const signatureBefore = getStateSyncSignature(currentState, reqUserId);
    logoutCheckInFlightRef.current = true;
    setIsCheckingLogoutSafety(true);

    try {
      const preservation = await verifyCloudPreservationForUser(reqUserId, currentState);
      if (!isSessionOperationValid(reqEpoch, reqUserId)) {
        return;
      }

      const signatureAfter = getStateSyncSignature(latestStateRef.current, reqUserId);
      if (signatureBefore !== signatureAfter) {
        setPendingLogoutPrompt({
          reasonCode: 'state_changed',
          message:
            'Novas alterações locais ocorreram durante a verificação da nuvem. Sincronize ou exporte um backup antes de encerrar a sessão.',
          hasLocalRecoveryBackup:
            Boolean(getRecoverySnapshotForUser(reqUserId)) || hasRealFinancialData(latestStateRef.current),
          canRetrySync: true,
          actionError: null,
          isProcessing: false
        });
        return;
      }

      if (preservation.verified) {
        if (syncTimeoutRef.current) {
          clearTimeout(syncTimeoutRef.current);
          syncTimeoutRef.current = null;
        }
        setPendingLogoutPrompt(null);
        await logout({
          preserveRecoveryBackups: false,
          userEmailOverride: supabaseUserEmail,
          indexedDBFactory: idbOverride
        });
        return;
      }

      setPendingLogoutPrompt({
        reasonCode:
          preservation.reasonCode === 'cloud_matches_local' ||
          preservation.reasonCode === 'empty_account'
            ? 'unsynced_changes'
            : preservation.reasonCode,
        message: preservation.message,
        hasLocalRecoveryBackup:
          hasExistingRecovery || hasRealFinancialData(latestStateRef.current),
        canRetrySync:
          preservation.reasonCode !== 'table_missing' &&
          preservation.reasonCode !== 'owner_mismatch',
        actionError: null,
        isProcessing: false
      });
    } finally {
      logoutCheckInFlightRef.current = false;
      if (isMountedRef.current) {
        setIsCheckingLogoutSafety(false);
      }
    }
  };

  const cancelPendingLogout = () => {
    setPendingLogoutPrompt(null);
  };

  const exportBackupForPendingLogout = (): {
    success: boolean;
    filename: string;
    jsonContent: string;
  } => {
    const jsonContent = exportBackupJson();
    const filename = `backup_seguro_antes_sair_${new Date().toISOString().split('T')[0]}.json`;
    try {
      if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const blob = new Blob([jsonContent], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch {
      // Ambientes headless sem suporte completo a download ainda recebem jsonContent
    }
    return {
      success: true,
      filename,
      jsonContent
    };
  };

  const syncAndConfirmLogout = async (): Promise<void> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;
    const idbOverride = experimentalHistoryOptions?.indexedDBFactory;

    if (!reqUserId || !isSessionOperationValid(reqEpoch, reqUserId)) {
      return;
    }

    setPendingLogoutPrompt(prev =>
      prev ? { ...prev, isProcessing: true, actionError: null } : null
    );

    const uploadRes = await forceUploadLocalToCloud();
    if (!isSessionOperationValid(reqEpoch, reqUserId)) {
      return;
    }

    if (!uploadRes.success) {
      setPendingLogoutPrompt(prev =>
        prev
          ? {
              ...prev,
              isProcessing: false,
              actionError: uploadRes.message
            }
          : null
      );
      return;
    }

    const recheck = await verifyCloudPreservationForUser(reqUserId, latestStateRef.current);
    if (!isSessionOperationValid(reqEpoch, reqUserId)) {
      return;
    }

    if (!recheck.verified) {
      setPendingLogoutPrompt(prev =>
        prev
          ? {
              ...prev,
              isProcessing: false,
              actionError: recheck.message
            }
          : null
      );
      return;
    }

    setPendingLogoutPrompt(null);
    await logout({
      preserveRecoveryBackups: false,
      userEmailOverride: supabaseUserEmail,
      indexedDBFactory: idbOverride
    });
  };

  const confirmSafeLogout = async (options?: {
    alsoDeleteRecoveryBackups?: boolean;
  }): Promise<void> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;
    const idbOverride = experimentalHistoryOptions?.indexedDBFactory;
    const alsoDeleteRecoveryBackups = Boolean(options?.alsoDeleteRecoveryBackups);

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }

    if (!reqUserId || !isValidStorageUserId(reqUserId)) {
      setPendingLogoutPrompt(null);
      await logout({
        preserveRecoveryBackups: true,
        userEmailOverride: supabaseUserEmail,
        indexedDBFactory: idbOverride
      });
      return;
    }

    if (!alsoDeleteRecoveryBackups) {
      const reason =
        pendingLogoutPrompt?.reasonCode === 'cloud_unreachable' ||
        pendingLogoutPrompt?.reasonCode === 'table_missing'
          ? 'pre_unverified_logout'
          : 'pre_unsynced_logout';

      await saveRecoverySnapshotWithExperimentalHistory(
        reqUserId,
        latestStateRef.current,
        reason,
        {
          ...experimentalHistoryOptions,
          isSessionStillValid: () => isSessionOperationValid(reqEpoch, reqUserId)
        }
      );

      setPendingLogoutPrompt(null);
      await logout({
        preserveRecoveryBackups: true,
        skipActiveCacheBackupOnPreserve: true,
        userEmailOverride: supabaseUserEmail,
        indexedDBFactory: idbOverride
      });
      return;
    }

    setPendingLogoutPrompt(null);
    await logout({
      preserveRecoveryBackups: false,
      userEmailOverride: supabaseUserEmail,
      indexedDBFactory: idbOverride
    });
  };

  // Etapa 1 da restauração: leitura, validação completa de schema/owner e verificação na nuvem SEM alterar estado ou localStorage
  const inspectBackupJsonForRestore = async (jsonString: string): Promise<BackupInspectionOutcome> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;

    if (!isHydratedRef.current || !reqUserId || !isSupabaseAuthenticated || hydratedUserId !== reqUserId) {
      return {
        valid: false,
        canRestore: false,
        message: 'Sessão não autenticada ou ainda em carregamento. Aguarde antes de restaurar backups.'
      };
    }

    const validation = validateBackupJsonStructure(jsonString, reqUserId);
    if (!validation.valid || !validation.state || !validation.counts) {
      return {
        valid: false,
        canRestore: false,
        message: validation.error || 'Arquivo de backup inválido ou incompatível.'
      };
    }

    const remoteResult = await fetchFinanceDataFromSupabase(reqUserId);
    if (!isSessionOperationValid(reqEpoch, reqUserId)) {
      return {
        valid: false,
        canRestore: false,
        message: 'Sessão alterada durante a verificação do backup na nuvem.'
      };
    }

    const safety = evaluateBackupRestorationSafety({
      backupState: validation.state,
      currentLocalState: latestStateRef.current,
      remoteResult,
      expectedUserId: reqUserId
    });

    const prepared: PreparedBackupRestore = {
      backupState: validation.state,
      counts: validation.counts,
      version: validation.version ?? validation.state.version,
      lastModified: validation.lastModified ?? (validation.state.lastModified || 0),
      ownerUserId: reqUserId,
      sourceFormat: validation.sourceFormat,
      snapshotSavedAt: validation.snapshotSavedAt,
      snapshotReason: validation.snapshotReason,
      remoteStateSnapshot: remoteResult.data,
      remoteVersion: remoteResult.version,
      remoteTimestamp: remoteResult.clientTimestamp,
      safety
    };

    return {
      valid: true,
      canRestore: safety.allowed,
      message: safety.message,
      prepared
    };
  };

  // Etapa 2 da restauração: executa somente após confirmação explícita do usuário no modal de prévia
  const applyConfirmedBackupRestore = async (
    prepared: PreparedBackupRestore
  ): Promise<BackupRestoreOutcome> => {
    const reqUserId = supabaseUserId;
    const reqEpoch = sessionEpochRef.current;

    if (!isHydratedRef.current || !reqUserId || !isSupabaseAuthenticated || hydratedUserId !== reqUserId) {
      return {
        success: false,
        synced: false,
        message: 'Sessão não autenticada ou alterada. Restauração cancelada por segurança.'
      };
    }

    if (prepared.ownerUserId !== reqUserId || prepared.backupState.ownerUserId !== reqUserId) {
      return {
        success: false,
        synced: false,
        message: 'Restauração bloqueada: o backup não pertence à conta atualmente autenticada.'
      };
    }

    if (operationLockRef.current) {
      return {
        success: false,
        synced: false,
        message: 'Outra operação crítica em andamento. Aguarde a conclusão antes de restaurar.'
      };
    }

    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
      syncTimeoutRef.current = null;
    }
    operationLockRef.current = true;
    setCloudSyncStatus('syncing');
    setCloudSyncMessage('Validando integridade na nuvem antes de aplicar a restauração...');

    try {
      // Revalida estado remoto imediatamente antes de gravar para evitar race conditions
      const freshRemote = await fetchFinanceDataFromSupabase(reqUserId);
      if (!isSessionOperationValid(reqEpoch, reqUserId)) {
        return {
          success: false,
          synced: false,
          message: 'Sessão encerrada ou alterada durante a restauração.'
        };
      }

      const freshSafety = evaluateBackupRestorationSafety({
        backupState: prepared.backupState,
        currentLocalState: latestStateRef.current,
        remoteResult: freshRemote,
        expectedUserId: reqUserId
      });

      if (!freshSafety.allowed) {
        setCloudSyncStatus(freshSafety.reasonCode === 'cloud_unavailable' ? 'error' : 'connected');
        setCloudSyncMessage(freshSafety.message);
        return {
          success: false,
          synced: false,
          message: freshSafety.message
        };
      }

      // Preserva metadados autênticos do backup (nunca mascara backup antigo com Date.now())
      const restoredState: AppState = {
        ...prepared.backupState,
        ownerUserId: reqUserId
      };

      const previousState = latestStateRef.current;
      const hadEligibleContentBeforeRestore =
        (previousState.transactions?.length || 0) > 0 ||
        (previousState.debts?.length || 0) > 0 ||
        (previousState.goals?.length || 0) > 0;
      const restoreSnap = await saveRecoverySnapshotWithExperimentalHistory(
        reqUserId,
        previousState,
        'pre_json_import',
        {
          ...experimentalHistoryOptions,
          isSessionStillValid: () => isSessionOperationValid(reqEpoch, reqUserId)
        }
      );
      if (restoreSnap.abortedBySessionChange || !isSessionOperationValid(reqEpoch, reqUserId)) {
        return {
          success: false,
          synced: false,
          message: 'Sessão encerrada ou alterada durante a gravação preventiva.'
        };
      }

      const restoreSnapshotStatus: 'saved' | 'not_needed' | 'failed' =
        restoreSnap.legacySaved || restoreSnap.historySaved
          ? 'saved'
          : !hadEligibleContentBeforeRestore || restoreSnap.historyCode === 'skipped_ineligible'
            ? 'not_needed'
            : 'failed';

      // Grava primeiro na nuvem; só substitui o estado local ativo se o envio remoto for confirmado
      const saveRes = await saveFinanceDataToSupabase(restoredState, reqUserId);
      if (!isSessionOperationValid(reqEpoch, reqUserId)) {
        return {
          success: false,
          synced: false,
          snapshotStatus: restoreSnapshotStatus,
          message: 'Sessão alterada durante a gravação do backup restaurado.'
        };
      }

      if (!saveRes.success) {
        if (saveRes.code === '42P01') {
          setCloudSyncStatus('table_missing');
        } else {
          setCloudSyncStatus('error');
        }
        const failMsg =
          saveRes.message ||
          'Restauração cancelada: não foi possível confirmar a gravação do backup na nuvem Supabase.';
        setCloudSyncMessage(failMsg);
        return {
          success: false,
          synced: false,
          snapshotStatus: restoreSnapshotStatus,
          message: failMsg
        };
      }

      skipNextAutoSyncRef.current = true;
      lastSyncedSignatureRef.current = getStateSyncSignature(restoredState, reqUserId);
      latestStateRef.current = restoredState;
      setState(restoredState);
      saveStateToStorageForUser(reqUserId, restoredState);
      setCloudSyncStatus('connected');
      setCloudSyncMessage('Backup restaurado e sincronizado com sucesso na nuvem!');
      setLastCloudSyncDate(new Date());

      return {
        success: true,
        synced: true,
        snapshotStatus: restoreSnapshotStatus,
        message:
          restoreSnapshotStatus === 'failed'
            ? 'Backup restaurado e confirmado na nuvem Supabase com sucesso, porém não foi possível gravar a cópia preventiva local neste navegador.'
            : 'Backup restaurado e confirmado na nuvem Supabase com sucesso!'
      };
    } finally {
      operationLockRef.current = false;
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
        inspectBackupJsonForRestore,
        applyConfirmedBackupRestore,
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

        // Hydration & Isolation State
        isFinanceHydrating,
        isFinanceHydrated,
        hydratedUserId,
        hydrationError,
        retryCloudHydration,
        legacyBackupPrompt,
        exportLegacyBackupFile,
        importLegacyBackupToCurrentAccount,
        dismissLegacyBackupPrompt,

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
          cloudSyncStatus === 'idle',

        // Safe Logout Protection (Fase 2.1)
        pendingLogoutPrompt,
        isCheckingLogoutSafety,
        requestSafeLogout,
        cancelPendingLogout,
        syncAndConfirmLogout,
        confirmSafeLogout,
        exportBackupForPendingLogout
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
