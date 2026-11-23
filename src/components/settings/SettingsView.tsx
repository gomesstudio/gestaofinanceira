/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Edit2,
  FolderPlus,
  Wallet,
  Download,
  Upload,
  Shield,
  CheckCircle,
  AlertTriangle,
  X,
  Lock,
  KeyRound,
  ShieldCheck,
  UserCheck,
  Cloud,
  CloudOff,
  RefreshCw,
  Database,
  Copy,
  Check,
  CheckCircle2,
  XCircle,
  Activity,
  Mail,
  ExternalLink,
  Sparkles,
  LogOut,
  History,
  Eye,
  Clock,
  ShieldAlert
} from 'lucide-react';
import {
  BackupInspectionOutcome,
  useFinance
} from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { SUPABASE_PROJECT_URL } from '../../utils/supabase';
import { formatCurrency } from '../../utils/formatters';
import { BankAccount, Category } from '../../types/finance';
import { SUPABASE_SQL_SETUP, DiagnosticResult } from '../../services/supabaseSyncService';
import { hasRealFinancialData } from '../../utils/backupSecurity';
import { formatRecoveryReason } from '../../utils/recoverySnapshot';
import { RecoveryDbRuntimeOptions } from '../../utils/recoveryHistoryDb';
import {
  EMPTY_RECOVERY_HISTORY_MESSAGE,
  exportHybridRecoverySnapshot,
  HybridRecoveryHistoryLoadResult,
  HybridRecoverySnapshotItem,
  loadHybridRecoveryHistory
} from '../../utils/recoveryHistoryService';
import {
  getWhatsAppSupportUrl,
  SubscriptionAccessState
} from '../../services/subscriptionService';
import {
  resolveTechnicalAccessPermissions,
  sanitizeCloudSyncMessageForUser
} from '../../utils/technicalAccess';
import { AdminSubscriptionsPanel } from './AdminSubscriptionsPanel';
import { PrivacyCenterSection } from './PrivacyCenterSection';
import { ActionFeedback, ActionFeedbackBanner, ConfirmDeleteModal } from '../common/ConfirmDeleteModal';
import { ResponsiveModal } from '../common/ResponsiveModal';

export interface SettingsViewProps {
  recoveryHistoryOptions?: RecoveryDbRuntimeOptions;
  subscriptionAccess?: SubscriptionAccessState;
  onRefreshSubscription?: () => Promise<void> | void;
  onOpenMasterPortal?: () => void;
  isDevelopmentEnv?: boolean;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  recoveryHistoryOptions,
  subscriptionAccess,
  onRefreshSubscription,
  onOpenMasterPortal,
  isDevelopmentEnv
}) => {
  const { canViewAdminTools, canViewDevDiagnostics } = resolveTechnicalAccessPermissions({
    subscriptionAccess,
    isDev: isDevelopmentEnv
  });
  const {
    transactions,
    debts,
    goals,
    categories,
    accounts,
    creditCards = [],
    safetyReserveDesired,
    setSafetyReserveDesired,
    addCategory,
    updateCategory,
    deleteCategory,
    addAccount,
    updateAccount,
    deleteAccount,
    loadSampleData,
    exportBackupJson,
    inspectBackupJsonForRestore,
    applyConfirmedBackupRestore,
    isSampleLoaded,
    cloudSyncStatus,
    cloudSyncMessage,
    lastCloudSyncDate,
    syncNowWithCloud,
    forceUploadLocalToCloud,
    forceDownloadFromCloud,
    runCloudDiagnostic,
    legacyBackupPrompt,
    exportLegacyBackupFile,
    importLegacyBackupToCurrentAccount,
    dismissLegacyBackupPrompt,
    requestSafeLogout
  } = useFinance();

  const [confirmLegacyOwnership, setConfirmLegacyOwnership] = useState(false);
  const [isImportingLegacy, setIsImportingLegacy] = useState(false);
  const hasRealData = hasRealFinancialData({ isSampleLoaded, transactions, debts, goals });

  // Backup inspection & confirmation modal states
  const [isInspectingBackup, setIsInspectingBackup] = useState(false);
  const [isApplyingBackupRestore, setIsApplyingBackupRestore] = useState(false);
  const [pendingBackupReview, setPendingBackupReview] = useState<{
    fileName: string;
    outcome: BackupInspectionOutcome;
  } | null>(null);
  const [confirmBackupReplaceChecked, setConfirmBackupReplaceChecked] = useState(false);

  // Demo confirmation modal state (Zerar Dados desabilitado temporariamente no MVP pessoal)
  const [pendingDestructiveAction, setPendingDestructiveAction] = useState<'sample' | null>(null);
  const [isExecutingDestructiveAction, setIsExecutingDestructiveAction] = useState(false);

  // Manual cloud upload conflict state
  const [manualUploadConflictMsg, setManualUploadConflictMsg] = useState<string | null>(null);

  // Supabase SQL script display and copy states
  const [showSqlScript, setShowSqlScript] = useState(false);
  const [isCopiedSql, setIsCopiedSql] = useState(false);

  const handleCopySql = () => {
    if (!canViewDevDiagnostics) return;
    navigator.clipboard.writeText(SUPABASE_SQL_SETUP);
    setIsCopiedSql(true);
    setTimeout(() => setIsCopiedSql(false), 2500);
  };

  // Category modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [catName, setCatName] = useState('');
  const [catType, setCatType] = useState<'income' | 'expense'>('expense');
  const [catExpenseType, setCatExpenseType] = useState<'fixed' | 'variable'>('variable');
  const [catColor, setCatColor] = useState('#10b981');

  // Account modal
  const [isAccModalOpen, setIsAccModalOpen] = useState(false);
  const [accName, setAccName] = useState('');
  const [accBalanceStr, setAccBalanceStr] = useState('0');
  const [accType, setAccType] = useState<BankAccount['type']>('checking');
  const [accColor, setAccColor] = useState('#3b82f6');
  const [pendingDeleteAccount, setPendingDeleteAccount] = useState<BankAccount | null>(null);
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [accountDeleteFeedback, setAccountDeleteFeedback] = useState<ActionFeedback | null>(null);

  const handleConfirmDeleteAccount = async () => {
    if (!pendingDeleteAccount || isDeletingAccount) return;
    setIsDeletingAccount(true);
    try {
      const result = await deleteAccount(pendingDeleteAccount.id);
      const feedback: ActionFeedback = {
        type: result.success && result.synced ? 'success' : 'error',
        text: result.message
      };
      setAccountDeleteFeedback(feedback);
      setStatusMsg(feedback);
    } catch (err: any) {
      const feedback: ActionFeedback = {
        type: 'error',
        text: err?.message || 'Não foi possível excluir a conta bancária.'
      };
      setAccountDeleteFeedback(feedback);
      setStatusMsg(feedback);
    } finally {
      setIsDeletingAccount(false);
      setPendingDeleteAccount(null);
    }
  };

  const {
    logout,
    updatePassword,
    supabaseUserId,
    supabaseUserEmail,
    supabaseUserDisplayName,
    isSupabaseAuthenticated,
    signInWithSupabase,
    loginWithGitHub,
    signInWithOtp,
    verifyOtp,
    sendPasswordResetEmail,
    disconnectCloud,
    checkSessionStatus
  } = useAuth();

  // Histórico de Recuperação híbrido (IndexedDB + cópia local anterior, somente leitura e exportação individual)
  const [historyLoadResult, setHistoryLoadResult] = useState<HybridRecoveryHistoryLoadResult | null>(
    null
  );
  const [isLoadingRecoveryHistory, setIsLoadingRecoveryHistory] = useState<boolean>(true);
  const [selectedRecoveryItem, setSelectedRecoveryItem] =
    useState<HybridRecoverySnapshotItem | null>(null);
  const [downloadingRecoveryId, setDownloadingRecoveryId] = useState<string | null>(null);
  const [recoveryActionFeedback, setRecoveryActionFeedback] = useState<ActionFeedback | null>(null);

  const recoveryHistoryOptionsRef = useRef<RecoveryDbRuntimeOptions | undefined>(
    recoveryHistoryOptions
  );
  recoveryHistoryOptionsRef.current = recoveryHistoryOptions;

  const recoveryRequestEpochRef = useRef(0);
  const latestRecoveryUserIdRef = useRef<string | null | undefined>(supabaseUserId);
  latestRecoveryUserIdRef.current = supabaseUserId;

  useEffect(() => {
    const targetUserId = supabaseUserId;
    const requestEpoch = ++recoveryRequestEpochRef.current;
    let cancelled = false;

    setSelectedRecoveryItem(null);
    setRecoveryActionFeedback(null);
    setDownloadingRecoveryId(null);

    if (!targetUserId) {
      setHistoryLoadResult({
        items: [],
        totalDistinctCount: 0,
        extraOmittedCount: 0,
        indexedDbStatus: 'available',
        legacyStatus: 'empty',
        skippedCorruptedCount: 0,
        hasAnyWarning: false
      });
      setIsLoadingRecoveryHistory(false);
      return;
    }

    setHistoryLoadResult(null);
    setIsLoadingRecoveryHistory(true);

    loadHybridRecoveryHistory(targetUserId, recoveryHistoryOptionsRef.current)
      .then(result => {
        if (
          cancelled ||
          requestEpoch !== recoveryRequestEpochRef.current ||
          latestRecoveryUserIdRef.current !== targetUserId
        ) {
          return;
        }
        setHistoryLoadResult(result);
        setIsLoadingRecoveryHistory(false);
      })
      .catch(() => {
        if (
          cancelled ||
          requestEpoch !== recoveryRequestEpochRef.current ||
          latestRecoveryUserIdRef.current !== targetUserId
        ) {
          return;
        }
        setHistoryLoadResult({
          items: [],
          totalDistinctCount: 0,
          extraOmittedCount: 0,
          indexedDbStatus: 'error',
          indexedDbMessage:
            'Não foi possível consultar o histórico de recuperação neste navegador.',
          legacyStatus: 'empty',
          skippedCorruptedCount: 0,
          hasAnyWarning: true
        });
        setIsLoadingRecoveryHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [
    supabaseUserId,
    recoveryHistoryOptions?.indexedDBFactory,
    recoveryHistoryOptions?.maxSnapshotsPerUser
  ]);

  const handleDownloadRecoverySnapshot = async (item: HybridRecoverySnapshotItem) => {
    const requestUserId = supabaseUserId;
    if (!requestUserId || downloadingRecoveryId) return;

    setDownloadingRecoveryId(item.id);
    setRecoveryActionFeedback(null);

    try {
      const payload = await exportHybridRecoverySnapshot(
        requestUserId,
        item,
        recoveryHistoryOptionsRef.current
      );

      if (latestRecoveryUserIdRef.current !== requestUserId) {
        return;
      }

      if (!payload.success || !payload.jsonContent || !payload.filename) {
        const errorText =
          payload.error || 'Nenhum ponto de recuperação válido disponível para download.';
        setRecoveryActionFeedback({ type: 'error', text: errorText });
        setStatusMsg({ type: 'error', text: errorText });
        return;
      }

      const blob = new Blob([payload.jsonContent], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = payload.filename;
      a.click();
      URL.revokeObjectURL(url);

      const successText =
        'Cópia do ponto de recuperação baixada em JSON sem alterar seus dados atuais.';
      setRecoveryActionFeedback({ type: 'success', text: successText });
      setStatusMsg({ type: 'success', text: successText });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch {
      if (latestRecoveryUserIdRef.current !== requestUserId) {
        return;
      }
      const errorText =
        'Não foi possível exportar a cópia JSON deste ponto de recuperação.';
      setRecoveryActionFeedback({ type: 'error', text: errorText });
      setStatusMsg({ type: 'error', text: errorText });
    } finally {
      setDownloadingRecoveryId(prev => (prev === item.id ? null : prev));
    }
  };

  // Supabase Diagnostic state
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);

  const handleRunDiagnostic = async () => {
    if (!canViewDevDiagnostics) return;
    setIsRunningDiagnostic(true);
    try {
      const res = await runCloudDiagnostic();
      setDiagnosticResult(res);
      if (res.allPassed) {
        setStatusMsg({ type: 'success', text: 'Diagnóstico da nuvem concluído: Conexão, RLS e gravação 100% operacionais!' });
      } else {
        setStatusMsg({ type: 'error', text: 'O diagnóstico identificou itens que necessitam de atenção na nuvem.' });
      }
    } catch (e: any) {
      setStatusMsg({ type: 'error', text: e.message || 'Erro ao executar diagnóstico.' });
    } finally {
      setIsRunningDiagnostic(false);
    }
  };

  // Supabase Auth modal
  const [isSbModalOpen, setIsSbModalOpen] = useState(false);
  const [sbAuthTab, setSbAuthTab] = useState<'otp' | 'github' | 'password'>('otp');
  const [sbEmail, setSbEmail] = useState(supabaseUserEmail || '');
  const [sbPass, setSbPass] = useState('');
  const [sbOtpCode, setSbOtpCode] = useState('');
  const [sbOtpSent, setSbOtpSent] = useState(false);
  const [sbOtpLoading, setSbOtpLoading] = useState(false);
  const [sbResetLoading, setSbResetLoading] = useState(false);
  const [sbError, setSbError] = useState<string | null>(null);
  const [sbSuccess, setSbSuccess] = useState<string | null>(null);
  const [sbLoading, setSbLoading] = useState(false);
  const [sbGithubLoading, setSbGithubLoading] = useState(false);
  const [sbGithubUrl, setSbGithubUrl] = useState<string | null>(null);
  const [sbWaitingGithub, setSbWaitingGithub] = useState(false);

  React.useEffect(() => {
    if (!sbWaitingGithub && !sbGithubUrl) return;
    const interval = setInterval(async () => {
      await checkSessionStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [sbWaitingGithub, sbGithubUrl, checkSessionStatus]);

  React.useEffect(() => {
    if (isSupabaseAuthenticated && isSbModalOpen) {
      setSbGithubUrl(null);
      setSbWaitingGithub(false);
      setSbOtpSent(false);
      setIsSbModalOpen(false);
      setStatusMsg({ type: 'success', text: 'Conectado à nuvem com sucesso!' });
    }
  }, [isSupabaseAuthenticated, isSbModalOpen]);

  // Password Update modal & state (Supabase Auth)
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [securityPass, setSecurityPass] = useState('');
  const [securityConfirmPass, setSecurityConfirmPass] = useState('');
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [securityLoading, setSecurityLoading] = useState(false);

  const handleOpenSecurityModal = () => {
    setSecurityPass('');
    setSecurityConfirmPass('');
    setSecurityError(null);
    setIsSecurityModalOpen(true);
  };

  const handleSbGitHub = async () => {
    setSbError(null);
    setSbGithubLoading(true);
    try {
      const res = await loginWithGitHub();
      if (!res.success) {
        setSbError(res.message || 'Erro ao conectar com GitHub.');
        setSbGithubLoading(false);
        return;
      }
      if (res.url) {
        setSbGithubUrl(res.url);
        setSbWaitingGithub(true);
        try {
          window.open(res.url, '_blank', 'width=700,height=800,scrollbars=yes,status=yes');
        } catch (e) {
          console.warn('Popup blocked:', e);
        }
      }
    } catch (err: any) {
      setSbError(err.message || 'Erro ao conectar com GitHub.');
    } finally {
      setSbGithubLoading(false);
    }
  };

  const handleSbSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbEmail.trim()) {
      setSbError('Informe o e-mail da sua conta.');
      return;
    }
    setSbError(null);
    setSbSuccess(null);
    setSbOtpLoading(true);
    try {
      const res = await signInWithOtp(sbEmail.trim());
      if (!res.success) {
        setSbError(res.message || 'Erro ao enviar link de acesso.');
      } else {
        setSbOtpSent(true);
        setSbSuccess('Link de acesso enviado! Abra seu e-mail e clique no botão "Log In".');
      }
    } finally {
      setSbOtpLoading(false);
    }
  };

  const handleSbVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sbOtpCode.trim()) {
      setSbError('Informe o código de 6 dígitos recebido por e-mail.');
      return;
    }
    setSbError(null);
    setSbSuccess(null);
    setSbOtpLoading(true);
    try {
      const res = await verifyOtp(sbEmail.trim(), sbOtpCode.trim());
      if (!res.success) {
        setSbError(res.message || 'Código inválido ou expirado.');
      } else {
        setSbSuccess('Autenticado com sucesso na sua conta!');
        setStatusMsg({ type: 'success', text: 'Conectado à nuvem com sucesso via código de acesso!' });
        setTimeout(() => {
          setIsSbModalOpen(false);
          setSbOtpSent(false);
          setSbOtpCode('');
        }, 1200);
      }
    } finally {
      setSbOtpLoading(false);
    }
  };

  const handleSbResetPassword = async () => {
    if (!sbEmail.trim()) {
      setSbError('Informe seu e-mail para receber o link de criação de senha.');
      return;
    }
    setSbResetLoading(true);
    setSbError(null);
    try {
      const res = await sendPasswordResetEmail(sbEmail.trim());
      if (!res.success) {
        setSbError(res.message || 'Erro ao solicitar link de redefinição.');
      } else {
        setSbSuccess('Link para definir ou redefinir senha enviado para seu e-mail!');
      }
    } finally {
      setSbResetLoading(false);
    }
  };

  const handleSupabaseLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSbError(null);
    setSbSuccess(null);
    setSbLoading(true);
    try {
      const res = await signInWithSupabase(sbEmail, sbPass);
      if (!res.success) {
        setSbError(res.message || 'Não foi possível autenticar sua conta. Tente novamente.');
      } else {
        setIsSbModalOpen(false);
        setSbPass('');
        setStatusMsg({ type: 'success', text: 'Autenticado com sucesso na sua conta!' });
      }
    } finally {
      setSbLoading(false);
    }
  };

  const handleSaveSecurity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityPass || securityPass.length < 6) {
      setSecurityError('A nova senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (securityPass !== securityConfirmPass) {
      setSecurityError('A confirmação da senha não coincide.');
      return;
    }

    setSecurityLoading(true);
    setSecurityError(null);
    try {
      const res = await updatePassword(securityPass);
      if (res.success) {
        setIsSecurityModalOpen(false);
        setStatusMsg({ type: 'success', text: 'Senha da conta atualizada com sucesso!' });
      } else {
        setSecurityError(res.message || 'Erro ao atualizar a senha.');
      }
    } finally {
      setSecurityLoading(false);
    }
  };

  // Status banners
  const [statusMsg, setStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleOpenCatModal = (cat?: Category) => {
    if (cat) {
      setEditingCategory(cat);
      setCatName(cat.name);
      setCatType(cat.type);
      setCatExpenseType(cat.expenseType || 'variable');
      setCatColor(cat.color);
    } else {
      setEditingCategory(null);
      setCatName('');
      setCatType('expense');
      setCatExpenseType('variable');
      setCatColor('#10b981');
    }
    setIsCatModalOpen(true);
  };

  const handleSaveCat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!catName.trim()) return;

    if (editingCategory) {
      updateCategory(editingCategory.id, {
        name: catName.trim(),
        type: catType,
        expenseType: catType === 'expense' ? catExpenseType : undefined,
        color: catColor
      });
      setStatusMsg({ type: 'success', text: `Categoria "${catName}" atualizada com sucesso.` });
    } else {
      addCategory({
        name: catName.trim(),
        type: catType,
        expenseType: catType === 'expense' ? catExpenseType : undefined,
        incomeGroup: catType === 'income' ? 'extra_income' : undefined,
        color: catColor,
        icon: 'Tag'
      });
      setStatusMsg({ type: 'success', text: `Nova categoria "${catName}" criada!` });
    }

    setIsCatModalOpen(false);
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleDeleteCategory = (cat: Category) => {
    const success = deleteCategory(cat.id);
    if (!success) {
      setStatusMsg({
        type: 'error',
        text: `Não é possível excluir "${cat.name}" porque existem lançamentos financeiros associados a ela.`
      });
    } else {
      setStatusMsg({ type: 'success', text: `Categoria "${cat.name}" excluída.` });
    }
    setTimeout(() => setStatusMsg(null), 4000);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    const bal = parseFloat(accBalanceStr.replace(/\./g, '').replace(',', '.')) || 0;
    if (!accName.trim()) return;

    addAccount({
      name: accName.trim(),
      type: accType,
      balance: bal,
      color: accColor
    });

    setIsAccModalOpen(false);
    setAccName('');
    setAccBalanceStr('0');
    setStatusMsg({ type: 'success', text: `Conta "${accName}" cadastrada com sucesso!` });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleExportJson = () => {
    const jsonStr = exportBackupJson();
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backup_gestao_financeira_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setStatusMsg({ type: 'success', text: 'Backup JSON baixado com sucesso!' });
    setTimeout(() => setStatusMsg(null), 3500);
  };

  const handleForceUpload = async () => {
    setManualUploadConflictMsg(null);
    const res = await forceUploadLocalToCloud();
    if (res.conflict) {
      setManualUploadConflictMsg(res.message);
      setStatusMsg({ type: 'error', text: res.message });
    } else {
      setStatusMsg({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
    }
  };

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputEl = e.target;
    const file = inputEl.files?.[0];
    inputEl.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async ev => {
      const content = typeof ev.target?.result === 'string' ? ev.target.result : '';
      setIsInspectingBackup(true);
      setConfirmBackupReplaceChecked(false);
      try {
        const outcome = await inspectBackupJsonForRestore(content);
        setPendingBackupReview({
          fileName: file.name,
          outcome
        });
      } finally {
        setIsInspectingBackup(false);
      }
    };
    reader.onerror = () => {
      setStatusMsg({
        type: 'error',
        text: 'Não foi possível ler o arquivo selecionado.'
      });
    };
    reader.readAsText(file);
  };

  const handleConfirmBackupRestore = async () => {
    if (!pendingBackupReview?.outcome.canRestore || !pendingBackupReview.outcome.prepared || isApplyingBackupRestore) {
      return;
    }
    setIsApplyingBackupRestore(true);
    try {
      const res = await applyConfirmedBackupRestore(pendingBackupReview.outcome.prepared);
      setStatusMsg({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
      if (res.success) {
        setPendingBackupReview(null);
        setConfirmBackupReplaceChecked(false);
      }
    } finally {
      setIsApplyingBackupRestore(false);
    }
  };

  const handleConfirmDestructiveAction = async () => {
    if (pendingDestructiveAction !== 'sample' || isExecutingDestructiveAction) return;
    setIsExecutingDestructiveAction(true);
    try {
      const res = await loadSampleData();
      setStatusMsg({
        type: res.success ? 'success' : 'error',
        text: res.message
      });
    } finally {
      setIsExecutingDestructiveAction(false);
      setPendingDestructiveAction(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-emerald-500" />
          Configurações & Personalização Total
        </h2>
        <p className="text-xs text-slate-500">
          Personalize categorias, gerencie contas bancárias e controle backups e segurança
        </p>
      </div>

      {statusMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs font-medium animate-in fade-in ${
            statusMsg.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
              : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-900 dark:text-rose-200'
          }`}
        >
          {statusMsg.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
          )}
          <span>{statusMsg.text}</span>
        </div>
      )}

      {/* Account & Session Security Card (Supabase Auth) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 shrink-0">
                <Lock className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Conta Autenticada & Segurança da Sessão
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Sua conta utiliza autenticação individual com isolamento e proteção dos seus dados.
            </p>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70 self-start sm:self-auto shrink-0">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            <span>Sessão Autenticada</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {/* Active User Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between min-w-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 shrink-0">
                <UserCheck className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400 font-medium">Usuário Conectado</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                  {supabaseUserDisplayName}
                </div>
                {supabaseUserEmail && (
                  <div className="text-[11px] text-slate-500 truncate">{supabaseUserEmail}</div>
                )}
              </div>
            </div>
          </div>

          {/* Change Password Button */}
          <button
            onClick={handleOpenSecurityModal}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3 cursor-pointer min-w-0 min-h-[56px]"
          >
            <KeyRound className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Alterar Senha</div>
              <div className="text-[11px] text-slate-400">Definir nova senha na conta</div>
            </div>
          </button>

          {/* Logout Button */}
          <button
            onClick={() => (requestSafeLogout ? requestSafeLogout() : logout())}
            className="p-3.5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-left transition-colors flex items-center gap-3 cursor-pointer min-w-0 min-h-[56px] sm:col-span-2 lg:col-span-1"
          >
            <LogOut className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">Encerrar Sessão (Sair)</div>
              <div className="text-[11px] text-rose-500/80">Sair e limpar sessão ativa</div>
            </div>
          </button>
        </div>
      </div>

      {/* Subscription Plan & Admin Card */}
      {subscriptionAccess && (
        <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                <span>Plano & Assinatura da Conta</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                {subscriptionAccess.isSchemaMissing
                  ? canViewDevDiagnostics
                    ? 'Estrutura comercial (SQL Etapa C1) preparada e aguardando aplicação no Supabase de produção.'
                    : 'Plano padrão ativo para sua conta.'
                  : subscriptionAccess.message}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
              <span
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold border ${
                  subscriptionAccess.isSchemaMissing
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                    : subscriptionAccess.hasAccess
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/70'
                    : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70'
                }`}
              >
                <span>
                  {subscriptionAccess.isSchemaMissing
                    ? canViewDevDiagnostics
                      ? 'C1/C3 Pendente no Banco'
                      : 'Conta Ativa'
                    : canViewAdminTools && !subscriptionAccess.subscription
                    ? 'Conta Master (Acesso Permanente)'
                    : subscriptionAccess.subscription?.planType === 'lifetime'
                    ? 'Plano Vitalício Especial'
                    : subscriptionAccess.subscription?.planType === 'annual'
                    ? 'Plano Anual'
                    : subscriptionAccess.subscription?.planType === 'monthly'
                    ? 'Plano Mensal'
                    : 'Sem Plano'}
                </span>
              </span>

              <a
                href={getWhatsAppSupportUrl(subscriptionAccess.accessStatus)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 min-h-[34px]"
              >
                <span>Falar com o suporte</span>
                <ExternalLink className="w-3 h-3 shrink-0" />
              </a>

              {onRefreshSubscription && (
                <button
                  type="button"
                  onClick={onRefreshSubscription}
                  className="p-2 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white cursor-pointer min-w-[34px] min-h-[34px] flex items-center justify-center"
                  title="Atualizar status da assinatura"
                  aria-label="Atualizar status da assinatura"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>

          {subscriptionAccess.effectiveExpiresAt && (
            <div className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
              Válida até:{' '}
              <strong className="text-slate-800 dark:text-slate-200">
                {new Date(subscriptionAccess.effectiveExpiresAt).toLocaleString('pt-BR')}
              </strong>
            </div>
          )}
        </div>
      )}

      {canViewAdminTools && (
        <AdminSubscriptionsPanel
          isAdmin={canViewAdminTools}
          onSubscriptionUpdated={onRefreshSubscription}
          onOpenMasterPortal={onOpenMasterPortal}
        />
      )}

      {/* Supabase Cloud Sync Card */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400 shrink-0">
                <Cloud className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Sincronização na Nuvem (Multi-Dispositivos)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Sincronize automaticamente seus lançamentos financeiros na nuvem entre celular e computador.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto shrink-0">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${
                cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced'
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200/70 dark:border-emerald-800/70'
                  : cloudSyncStatus === 'syncing'
                  ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border-blue-200/70 dark:border-blue-800/70'
                  : cloudSyncStatus === 'table_missing'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70'
                  : cloudSyncStatus === 'session_expired'
                  ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200/70 dark:border-amber-800/70'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
              }`}
            >
              {cloudSyncStatus === 'syncing' ? (
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600 dark:text-blue-400" />
              ) : cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced' ? (
                <Cloud className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
              ) : cloudSyncStatus === 'table_missing' ? (
                <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              ) : cloudSyncStatus === 'session_expired' ? (
                <CloudOff className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
              ) : (
                <CloudOff className="w-3.5 h-3.5 text-slate-500" />
              )}
              <span>
                {cloudSyncStatus === 'syncing'
                  ? 'Sincronizando...'
                  : cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced'
                  ? 'Nuvem Conectada'
                  : cloudSyncStatus === 'table_missing'
                  ? canViewDevDiagnostics
                    ? 'Tabela SQL Necessária'
                    : 'Nuvem Indisponível'
                  : cloudSyncStatus === 'session_expired'
                  ? 'Sessão Expirada'
                  : isSupabaseAuthenticated
                  ? 'Conectado (Pronto)'
                  : 'Nuvem Desconectada'}
              </span>
            </span>
          </div>
        </div>

        {(() => {
          const safeSyncMessage = sanitizeCloudSyncMessageForUser(
            cloudSyncMessage,
            canViewDevDiagnostics
          );
          if (!safeSyncMessage) return null;
          return (
            <div
              className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${
                cloudSyncStatus === 'connected' || cloudSyncStatus === 'synced'
                  ? 'bg-emerald-50/70 dark:bg-emerald-950/30 border-emerald-200/60 dark:border-emerald-800/60 text-emerald-800 dark:text-emerald-200'
                  : cloudSyncStatus === 'table_missing' || cloudSyncStatus === 'session_expired'
                  ? 'bg-amber-50/70 dark:bg-amber-950/30 border-amber-200/60 dark:border-amber-800/60 text-amber-800 dark:text-amber-200'
                  : 'bg-blue-50/70 dark:bg-blue-950/30 border-blue-200/60 dark:border-blue-800/60 text-blue-800 dark:text-blue-200'
              }`}
            >
              <Database className="w-4 h-4 shrink-0" />
              <span className="leading-relaxed">{safeSyncMessage}</span>
            </div>
          );
        })()}

        <div
          className={`grid grid-cols-1 sm:grid-cols-2 ${
            canViewDevDiagnostics ? 'lg:grid-cols-4' : 'lg:grid-cols-2'
          } gap-3 pt-1`}
        >
          {/* Connection URL Card (Dev Diagnostics Only) */}
          {canViewDevDiagnostics && (
            <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
              <div className="text-[11px] text-slate-400 font-medium">Projeto Supabase Ativo</div>
              <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">
                {(() => {
                  try {
                    return new URL(SUPABASE_PROJECT_URL).host;
                  } catch {
                    return SUPABASE_PROJECT_URL;
                  }
                })()}
              </div>
              <div className="text-[10px] text-slate-400 mt-1">Chave pública + RLS</div>
            </div>
          )}

          {/* Authenticated Account Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex flex-col justify-between min-w-0">
            <div className="min-w-0">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 font-medium truncate">
                  {canViewDevDiagnostics ? 'Usuário UUID (auth.users)' : 'Conta na Nuvem'}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold shrink-0 ${isSupabaseAuthenticated ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {isSupabaseAuthenticated ? 'Autenticado' : 'Pendente'}
                </span>
              </div>
              {canViewDevDiagnostics && (
                <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate mt-0.5" title={supabaseUserId || 'Não conectado no Supabase'}>
                  {supabaseUserId ? `${supabaseUserId.slice(0, 14)}...` : 'Nenhum login Supabase'}
                </div>
              )}
              {supabaseUserEmail && (
                <div className={`${canViewDevDiagnostics ? 'text-[10px] text-slate-500 dark:text-slate-400' : 'text-xs font-semibold text-slate-800 dark:text-slate-200'} truncate mt-0.5`}>
                  {supabaseUserEmail}
                </div>
              )}
            </div>
            <div className="pt-2">
              {isSupabaseAuthenticated ? (
                <button
                  type="button"
                  onClick={() => (requestSafeLogout ? requestSafeLogout() : disconnectCloud())}
                  className="text-[11px] text-rose-500 hover:text-rose-400 font-medium transition-colors cursor-pointer"
                >
                  Desconectar Conta
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSbModalOpen(true)}
                  className="text-[11px] text-blue-500 hover:text-blue-400 font-semibold transition-colors cursor-pointer"
                >
                  Conectar Conta na Nuvem
                </button>
              )}
            </div>
          </div>

          {/* Sync / Upload Actions */}
          <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 flex flex-col justify-between gap-2 min-w-0">
            <div className="min-w-0">
              <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 shrink-0 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                <span className="truncate">Sincronização Direta</span>
              </div>
              <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                {lastCloudSyncDate ? `Última: ${lastCloudSyncDate.toLocaleTimeString()}` : 'Pronto para sincronizar'}
              </div>
            </div>
            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={handleForceUpload}
                disabled={cloudSyncStatus === 'syncing'}
                title="Verificar nuvem e enviar alterações locais mais recentes"
                className="flex-1 min-h-[34px] py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3 shrink-0" />
                <span>Enviar</span>
              </button>
              <button
                type="button"
                onClick={forceDownloadFromCloud}
                disabled={cloudSyncStatus === 'syncing'}
                title="Baixar dados mais recentes da nuvem"
                className="flex-1 min-h-[34px] py-1.5 px-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3 shrink-0" />
                <span>Baixar</span>
              </button>
            </div>
          </div>

          {/* SQL Script View Button (Dev Diagnostics Only) */}
          {canViewDevDiagnostics && (
            <button
              onClick={() => setShowSqlScript(!showSqlScript)}
              className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3 cursor-pointer min-w-0"
            >
              <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  {showSqlScript ? 'Ocultar Script SQL' : 'Script SQL com RLS'}
                </div>
                <div className="text-[11px] text-slate-400">auth.uid() = user_id</div>
              </div>
            </button>
          )}
        </div>

        {/* Diagnostic Section (Dev Diagnostics Only) */}
        {canViewDevDiagnostics && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/80 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500 shrink-0" />
                  <h4 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">
                    Diagnóstico de Integridade e Gravação na Nuvem
                  </h4>
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Testa a conexão de rede, valida a sessão Supabase Auth com UUID, executa consulta com RLS e grava dados com verificação de ida e volta.
                </p>
              </div>

              <button
                type="button"
                onClick={handleRunDiagnostic}
                disabled={isRunningDiagnostic}
                className="w-full sm:w-auto px-3.5 py-2 min-h-[38px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer shrink-0"
              >
                <RefreshCw className={`w-3.5 h-3.5 shrink-0 ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
                <span>{isRunningDiagnostic ? 'Testando Conexão...' : 'Testar Conexão e Gravação'}</span>
              </button>
            </div>

            {diagnosticResult && (
              <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 animate-in fade-in">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-700 dark:text-slate-300">
                    Resultado do Diagnóstico ({diagnosticResult.timestamp}):
                  </span>
                  <span className={`inline-flex items-center gap-1 font-bold px-2 py-0.5 rounded-full text-[11px] ${
                    diagnosticResult.allPassed
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 border border-amber-500/30'
                  }`}>
                    {diagnosticResult.allPassed ? '✅ 100% Operacional e Sincronizado' : 'Atenção Necessária'}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2">
                  {diagnosticResult.steps.map((st, idx) => (
                    <div
                      key={idx}
                      className={`p-2.5 rounded-lg border text-xs flex items-start gap-2.5 ${
                        st.status === 'success'
                          ? 'bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-200/60 dark:border-emerald-900/60 text-emerald-900 dark:text-emerald-200'
                          : st.status === 'warning'
                          ? 'bg-amber-50/50 dark:bg-amber-950/20 border-amber-200/60 dark:border-amber-900/60 text-amber-900 dark:text-amber-200'
                          : 'bg-rose-50/50 dark:bg-rose-950/20 border-rose-200/60 dark:border-rose-900/60 text-rose-900 dark:text-rose-200'
                      }`}
                    >
                      {st.status === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                      ) : st.status === 'warning' ? (
                        <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-semibold text-[11px] flex flex-wrap items-center justify-between gap-1">
                          <span>{st.name}</span>
                          <span className="text-[10px] font-mono opacity-70 uppercase tracking-wider">{st.status}</span>
                        </div>
                        <div className="text-[11px] mt-0.5 leading-snug break-words">{st.message}</div>
                        {st.detail && (
                          <div className="text-[10px] font-mono opacity-80 mt-0.5 break-all">{st.detail}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Collapsible Supabase SQL Script Card (Dev Diagnostics Only) */}
        {canViewDevDiagnostics && (showSqlScript || cloudSyncStatus === 'table_missing') && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 text-xs space-y-3 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div className="min-w-0">
                <span className="font-bold text-emerald-400">Script SQL para Criação da Tabela no Supabase:</span>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  No painel do Supabase, vá em <strong>SQL Editor</strong> &gt; <strong>New Query</strong>, cole este código e clique em <strong>Run</strong>.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopySql}
                className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center gap-1.5 self-start sm:self-auto shrink-0 transition-all cursor-pointer"
              >
                {isCopiedSql ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{isCopiedSql ? 'Copiado!' : 'Copiar Código SQL'}</span>
              </button>
            </div>

            <pre className="font-mono text-[11px] text-emerald-300 bg-slate-900/90 p-3 rounded-lg overflow-x-auto overscroll-x-contain leading-relaxed border border-slate-800">
              {SUPABASE_SQL_SETUP}
            </pre>
          </div>
        )}
      </div>

      {/* Backup and Data Storage Card */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500 shrink-0" />
            Armazenamento Local, Backup e Restauração
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Os dados em cache são salvos neste navegador entre sessões, mas dependem da sincronização na nuvem ou de backups JSON externos para preservação permanente.
          </p>
        </div>

        {manualUploadConflictMsg && (
          <div className="p-3.5 rounded-xl border border-amber-300 dark:border-amber-800 bg-amber-50/80 dark:bg-amber-950/30 text-amber-900 dark:text-amber-200 text-xs space-y-2 animate-in fade-in">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <div className="font-bold">Envio manual bloqueado por conflito com a nuvem</div>
                  <p className="leading-relaxed opacity-95 break-words">{manualUploadConflictMsg}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setManualUploadConflictMsg(null)}
                aria-label="Fechar aviso de conflito"
                className="p-1.5 rounded-lg opacity-70 hover:opacity-100 cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="flex flex-wrap gap-2 sm:pl-6">
              <button
                type="button"
                onClick={async () => {
                  await forceDownloadFromCloud();
                  setManualUploadConflictMsg(null);
                }}
                className="px-3 py-1.5 min-h-[36px] rounded-lg bg-blue-600 hover:bg-blue-500 text-white font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Baixar Versão da Nuvem</span>
              </button>
              <button
                type="button"
                onClick={handleExportJson}
                className="px-3 py-1.5 min-h-[36px] rounded-lg border border-amber-400/70 dark:border-amber-700 text-amber-900 dark:text-amber-200 hover:bg-amber-100/70 dark:hover:bg-amber-900/40 font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5 shrink-0" />
                <span>Exportar Backup Local Primeiro</span>
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Download Backup */}
          <button
            type="button"
            onClick={handleExportJson}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3 cursor-pointer min-w-0 min-h-[56px]"
          >
            <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Fazer Backup Completo</div>
              <div className="text-[11px] text-slate-400">Baixar arquivo .json com tudo</div>
            </div>
          </button>

          {/* Restore Backup (Prévia + Validação antes de restaurar) */}
          <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3 cursor-pointer min-w-0 min-h-[56px]">
            <Upload className={`w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0 ${isInspectingBackup ? 'animate-pulse' : ''}`} />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {isInspectingBackup ? 'Validando Backup...' : 'Restaurar de Arquivo'}
              </div>
              <div className="text-[11px] text-slate-400">Prévia segura de backup .json</div>
            </div>
            <input
              type="file"
              accept=".json"
              disabled={isInspectingBackup || isApplyingBackupRestore}
              onChange={handleImportJson}
              className="hidden"
            />
          </label>

          {/* Load Demo Data (Protected when real user data exists) */}
          <button
            type="button"
            onClick={() => {
              if (hasRealData) {
                setStatusMsg({
                  type: 'error',
                  text: 'Ação bloqueada: esta conta possui dados financeiros reais. Para protegê-los, os dados demonstrativos não podem sobrescrever registros existentes.'
                });
                return;
              }
              setPendingDestructiveAction('sample');
            }}
            className={`p-3.5 rounded-xl border text-left transition-colors flex items-center gap-3 cursor-pointer min-w-0 min-h-[56px] sm:col-span-2 lg:col-span-1 ${
              hasRealData
                ? 'border-slate-200/70 dark:border-slate-800 bg-slate-100/60 dark:bg-slate-900/40 opacity-75'
                : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Sparkles className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div className="min-w-0">
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Carregar Dados Demonstrativos</div>
              <div className="text-[11px] text-slate-400">
                {hasRealData ? 'Bloqueado: dados reais ativos' : 'Preencher localmente para testes'}
              </div>
            </div>
          </button>
        </div>

        {/* Legacy Local Backup Controlled Recovery (Strict ownership enforcement) */}
        {legacyBackupPrompt?.exists && (legacyBackupPrompt.accessBlocked || !legacyBackupPrompt.ownershipVerified) && (
          <div className="p-4 rounded-xl border border-rose-300/80 dark:border-rose-800/80 bg-rose-50/70 dark:bg-rose-950/20 space-y-3">
            <div className="flex items-start gap-2.5">
              <ShieldAlert className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-bold text-rose-900 dark:text-rose-200">
                  Dados Locais Legados Bloqueados por Segurança
                </div>
                <p className="text-rose-800/90 dark:text-rose-300/90 leading-relaxed">
                  Foi identificado um registro local legado neste navegador sem comprovação de propriedade para esta conta ({supabaseUserEmail || 'usuário atual'}). Por segurança e privacidade, a visualização, exportação e importação estão bloqueadas. Caso pertençam a você, solicite recuperação administrativa segura.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  dismissLegacyBackupPrompt();
                  setConfirmLegacyOwnership(false);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                Ocultar neste usuário
              </button>
            </div>
          </div>
        )}

        {legacyBackupPrompt?.exists && legacyBackupPrompt.ownershipVerified && !legacyBackupPrompt.accessBlocked && (
          <div className="p-4 rounded-xl border border-amber-300/80 dark:border-amber-800/80 bg-amber-50/70 dark:bg-amber-950/20 space-y-3">
            <div className="flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs space-y-1">
                <div className="font-bold text-amber-900 dark:text-amber-200">
                  Dados Locais Legados Detectados neste Navegador (Propriedade Verificada)
                </div>
                <p className="text-amber-800/90 dark:text-amber-300/90 leading-relaxed">
                  Há um registro local anterior pertencente a esta conta neste navegador ({legacyBackupPrompt.transactionsCount} lançamentos, {legacyBackupPrompt.accountsCount} contas). Ele permanece isolado e preservado sem vínculo automático até sua confirmação.
                </p>
              </div>
            </div>

            <label className="flex items-start gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={confirmLegacyOwnership}
                onChange={e => setConfirmLegacyOwnership(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
              />
              <span>
                Confirmo que esses dados legados pertencem exclusivamente a esta conta autenticada ({supabaseUserEmail || 'usuário atual'}).
              </span>
            </label>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  const raw = exportLegacyBackupFile();
                  if (!raw) {
                    setStatusMsg({
                      type: 'error',
                      text: 'Exportação bloqueada: propriedade dos dados legados não comprovada.'
                    });
                    return;
                  }
                  const blob = new Blob([raw], { type: 'application/json' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `backup_legado_preservado_${new Date().toISOString().split('T')[0]}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  setStatusMsg({ type: 'success', text: 'Backup legado exportado com segurança sem alterar dados atuais.' });
                }}
                className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Baixar Backup Legado (.json)</span>
              </button>

              <button
                type="button"
                disabled={!confirmLegacyOwnership || isImportingLegacy}
                onClick={async () => {
                  if (isImportingLegacy) return;
                  setIsImportingLegacy(true);
                  try {
                    const res = await importLegacyBackupToCurrentAccount(confirmLegacyOwnership);
                    setStatusMsg({ type: res.success ? 'success' : 'error', text: res.message });
                    if (res.success) {
                      setConfirmLegacyOwnership(false);
                    }
                  } finally {
                    setIsImportingLegacy(false);
                  }
                }}
                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {isImportingLegacy ? 'Importando...' : 'Importar para Esta Conta'}
              </button>

              <button
                type="button"
                onClick={() => {
                  dismissLegacyBackupPrompt();
                  setConfirmLegacyOwnership(false);
                }}
                className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-medium cursor-pointer"
              >
                Ocultar neste usuário
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Histórico de Recuperação (Somente leitura e exportação individual) */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-2">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-slate-500 dark:text-slate-400 shrink-0" />
              Histórico de Recuperação
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Até 5 cópias preventivas desta conta salvas neste navegador antes de substituições importantes. Somente consulta e download individual em JSON.
            </p>
          </div>
          {!isLoadingRecoveryHistory && historyLoadResult && historyLoadResult.items.length > 0 && (
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400 tabular-nums shrink-0 sm:pt-0.5">
              {historyLoadResult.items.length} de 5 pontos disponíveis
            </span>
          )}
        </div>

        <ActionFeedbackBanner
          feedback={recoveryActionFeedback}
          onClose={() => setRecoveryActionFeedback(null)}
        />

        {!isLoadingRecoveryHistory && historyLoadResult?.indexedDbStatus === 'unavailable' && (
          <div
            role="status"
            className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200/80 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            <span>{historyLoadResult.indexedDbMessage}</span>
          </div>
        )}

        {!isLoadingRecoveryHistory && historyLoadResult?.indexedDbStatus === 'error' && (
          <div
            role="alert"
            className="p-3 rounded-xl bg-rose-50/80 dark:bg-rose-950/30 border border-rose-200/80 dark:border-rose-800/60 text-xs text-rose-800 dark:text-rose-200 flex items-start gap-2"
          >
            <AlertTriangle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
            <span>{historyLoadResult.indexedDbMessage}</span>
          </div>
        )}

        {!isLoadingRecoveryHistory &&
          historyLoadResult &&
          (historyLoadResult.skippedCorruptedCount > 0 ||
            historyLoadResult.legacyStatus === 'corrupted') && (
            <div
              role="status"
              className="p-3 rounded-xl bg-amber-50/70 dark:bg-amber-950/25 border border-amber-200/70 dark:border-amber-800/50 text-xs text-amber-800 dark:text-amber-200 flex items-start gap-2"
            >
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
              <span>
                {historyLoadResult.skippedCorruptedCount > 0 &&
                historyLoadResult.legacyStatus === 'corrupted'
                  ? 'Registros locais corrompidos ou incompatíveis foram ignorados por segurança.'
                  : historyLoadResult.skippedCorruptedCount > 0
                    ? `${historyLoadResult.skippedCorruptedCount} registro(s) corrompido(s) ou incompatível(is) no histórico local foi(ram) ignorado(s) por segurança.`
                    : historyLoadResult.legacyMessage}
              </span>
            </div>
          )}

        {isLoadingRecoveryHistory ? (
          <div
            role="status"
            className="p-3.5 rounded-xl bg-slate-50/80 dark:bg-slate-800/30 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2"
          >
            <RefreshCw className="w-3.5 h-3.5 animate-spin text-slate-400 shrink-0" />
            <span>Carregando histórico de recuperação...</span>
          </div>
        ) : historyLoadResult && historyLoadResult.items.length > 0 ? (
          <div className="space-y-2.5">
            <div className="rounded-xl bg-slate-50/70 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-800 divide-y divide-slate-200/70 dark:divide-slate-800">
              {historyLoadResult.items.map(item => (
                <div
                  key={item.id}
                  data-testid="recovery-history-item"
                  data-snapshot-id={item.id}
                  data-snapshot-source={item.source}
                  className="p-3.5 flex flex-col md:flex-row md:items-center justify-between gap-3"
                >
                  <div className="min-w-0 space-y-1.5">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                        {item.formattedSavedAt}
                      </span>
                      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500">
                        v{item.version}
                      </span>
                      {item.source === 'legacy_localstorage' && (
                        <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                          · Cópia local anterior
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-200">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                      <span className="truncate">{item.reason.label}</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-600 dark:text-slate-400 tabular-nums">
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          {item.counts.transactions}
                        </strong>{' '}
                        lançamentos
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          {item.counts.accounts}
                        </strong>{' '}
                        contas
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          {item.counts.creditCards}
                        </strong>{' '}
                        cartões
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          {item.counts.debts}
                        </strong>{' '}
                        dívidas
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>
                        <strong className="text-slate-900 dark:text-white">
                          {item.counts.goals}
                        </strong>{' '}
                        objetivos
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setSelectedRecoveryItem(item)}
                      className="px-3 py-1.5 min-h-[36px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/80 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                    >
                      <Eye className="w-3.5 h-3.5 shrink-0" />
                      <span>Visualizar Detalhes</span>
                    </button>
                    <button
                      type="button"
                      disabled={downloadingRecoveryId === item.id}
                      onClick={() => handleDownloadRecoverySnapshot(item)}
                      className="px-3 py-1.5 min-h-[36px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 transition-colors cursor-pointer"
                    >
                      <Download className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {downloadingRecoveryId === item.id ? 'Preparando...' : 'Baixar Cópia'}
                      </span>
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {historyLoadResult.extraOmittedCount > 0 && (
              <div
                role="status"
                data-testid="recovery-history-omitted-notice"
                className="p-3 rounded-xl bg-slate-50/90 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2"
              >
                <History className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                <span>
                  Há {historyLoadResult.extraOmittedCount} ponto(s) de recuperação mais antigo(s) preservado(s) no armazenamento local deste navegador além do limite visual de 5 registros.
                </span>
              </div>
            )}
          </div>
        ) : (
          <div className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/30 border border-slate-200/70 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <History className="w-4 h-4 text-slate-400 shrink-0" />
            <span>{EMPTY_RECOVERY_HISTORY_MESSAGE}</span>
          </div>
        )}

        <div
          role="note"
          data-testid="recovery-browser-risk-notice"
          className="p-3 rounded-xl bg-slate-50/80 dark:bg-slate-800/30 border border-slate-200/80 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-300 flex items-start gap-2 leading-relaxed"
        >
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />
          <span>
            Os pontos de recuperação são armazenados neste navegador e podem ser perdidos ao limpar os dados do site, trocar de dispositivo ou utilizar navegação privada. Faça backups JSON regularmente e guarde-os em local seguro.
          </span>
        </div>
      </div>

      {/* Accounts Management */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Contas Bancárias, Carteiras e Dinheiro Vivo</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Personalize suas contas correntes, contas salário, poupanças e dinheiro em espécie
            </p>
          </div>
          <button
            onClick={() => setIsAccModalOpen(true)}
            className="w-full sm:w-auto px-3.5 py-2 min-h-[38px] text-xs font-semibold rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Adicionar Conta</span>
          </button>
        </div>

        <ActionFeedbackBanner
          feedback={accountDeleteFeedback}
          onClose={() => setAccountDeleteFeedback(null)}
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {accounts.map(acc => (
            <div
              key={acc.id}
              className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between min-w-0"
            >
              <div className="min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                    <span className="font-semibold text-slate-900 dark:text-white text-xs truncate">
                      {acc.name}
                    </span>
                  </div>
                  {accounts.length > 1 && (
                    <button
                      type="button"
                      onClick={e => {
                        e.stopPropagation();
                        setPendingDeleteAccount(acc);
                      }}
                      title="Excluir conta"
                      aria-label={`Excluir conta ${acc.name}`}
                      className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors cursor-pointer shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider capitalize">
                  {acc.type === 'checking' ? 'Conta Corrente' : acc.type === 'savings' ? 'Poupança / Reserva' : acc.type === 'cash' ? 'Dinheiro em Espécie' : 'Investimento'}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex justify-between items-baseline gap-2">
                <span className="text-[11px] text-slate-400">Saldo:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white tabular-nums text-sm">
                  {formatCurrency(acc.balance)}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Categories Management */}
      <div className="p-4 sm:p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="min-w-0">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-purple-500 shrink-0" />
              <span>Categorias de Entradas e Despesas</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Crie, edite e personalize suas próprias categorias com total liberdade
            </p>
          </div>
          <button
            onClick={() => handleOpenCatModal()}
            className="w-full sm:w-auto px-3.5 py-2 min-h-[38px] text-xs font-semibold rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            <span>Nova Categoria</span>
          </button>
        </div>

        {/* Categories list divided into Entradas and Despesas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Entradas */}
          <div className="min-w-0">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
              Categorias de Entradas ({categories.filter(c => c.type === 'income').length})
            </h4>
            <div className="space-y-1.5 max-h-72 overflow-y-auto overscroll-contain">
              {categories.filter(c => c.type === 'income').map(cat => (
                <div key={cat.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 shrink-0">
                    <button onClick={() => handleOpenCatModal(cat)} className="p-1.5 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer" aria-label={`Editar categoria ${cat.name}`}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteCategory(cat)} className="p-1.5 hover:text-rose-600 cursor-pointer" aria-label={`Excluir categoria ${cat.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Despesas */}
          <div className="min-w-0">
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
              Categorias de Despesas ({categories.filter(c => c.type === 'expense').length})
            </h4>
            <div className="space-y-1.5 max-h-72 overflow-y-auto overscroll-contain">
              {categories.filter(c => c.type === 'expense').map(cat => (
                <div key={cat.id} className="flex items-center justify-between gap-2 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors min-w-0">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: cat.color }} />
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">
                      ({cat.expenseType === 'fixed' ? 'Fixa' : 'Variável'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400 shrink-0">
                    <button onClick={() => handleOpenCatModal(cat)} className="p-1.5 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer" aria-label={`Editar categoria ${cat.name}`}>
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => handleDeleteCategory(cat)} className="p-1.5 hover:text-rose-600 cursor-pointer" aria-label={`Excluir categoria ${cat.name}`}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Central de Privacidade, Direitos do Titular e Transparência (Fase 2.5 + 2.4.1) */}
      <PrivacyCenterSection
        userId={supabaseUserId}
        userEmail={supabaseUserEmail}
        userDisplayName={supabaseUserDisplayName}
        isAuthenticated={isSupabaseAuthenticated}
        dataCounts={{
          transactions: (transactions || []).length,
          accounts: (accounts || []).length,
          creditCards: (creditCards || []).length,
          debts: (debts || []).length,
          goals: (goals || []).length,
          categories: (categories || []).length
        }}
        hasSafetyReserveConfigured={Number(safetyReserveDesired || 0) > 0}
        onExportJson={handleExportJson}
      />

      {/* Modal: Category */}
      <ResponsiveModal
        isOpen={isCatModalOpen}
        onClose={() => setIsCatModalOpen(false)}
        title={editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
        size="sm"
        bodyClassName="text-xs space-y-3"
        onSubmit={handleSaveCat}
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsCatModalOpen(false)}
              className="px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs cursor-pointer"
            >
              Salvar Categoria
            </button>
          </div>
        }
      >
        <div>
          <label className="block font-medium text-slate-500 mb-1">Nome da Categoria *</label>
          <input
            type="text"
            required
            placeholder="Ex: Assinaturas, Cursos, Pets..."
            value={catName}
            onChange={e => setCatName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Tipo Principal</label>
          <select
            value={catType}
            onChange={e => setCatType(e.target.value as any)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="expense">Despesa (Saída)</option>
            <option value="income">Entrada (Receita)</option>
          </select>
        </div>

        {catType === 'expense' && (
          <div>
            <label className="block font-medium text-slate-500 mb-1">Classificação de Despesa</label>
            <select
              value={catExpenseType}
              onChange={e => setCatExpenseType(e.target.value as any)}
              className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
            >
              <option value="variable">Despesa Variável</option>
              <option value="fixed">Despesa Fixa</option>
            </select>
          </div>
        )}

        <div>
          <label className="block font-medium text-slate-500 mb-1.5">Cor</label>
          <div className="flex flex-wrap items-center gap-2">
            {['#10b981', '#0284c7', '#8b5cf6', '#ec4899', '#f59e0b', '#e11d48', '#64748b'].map(c => (
              <button
                key={c}
                type="button"
                onClick={() => setCatColor(c)}
                aria-label={`Cor ${c}`}
                className={`w-7 h-7 rounded-full cursor-pointer ${catColor === c ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
      </ResponsiveModal>

      {/* Modal: Account */}
      <ResponsiveModal
        isOpen={isAccModalOpen}
        onClose={() => setIsAccModalOpen(false)}
        title="Cadastrar Nova Conta"
        size="sm"
        bodyClassName="text-xs space-y-3"
        onSubmit={handleSaveAccount}
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setIsAccModalOpen(false)}
              className="px-4 py-2.5 min-h-[42px] rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-xs cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs cursor-pointer"
            >
              Cadastrar Conta
            </button>
          </div>
        }
      >
        <div>
          <label className="block font-medium text-slate-500 mb-1">Nome da Conta *</label>
          <input
            type="text"
            required
            placeholder="Ex: Inter, C6, Poupança Caixa..."
            value={accName}
            onChange={e => setAccName(e.target.value)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Saldo Atual Inicial (R$)</label>
          <input
            type="text"
            value={accBalanceStr}
            onChange={e => setAccBalanceStr(e.target.value.replace(/[^0-9,]/g, ''))}
            className="w-full px-3 py-2 font-mono font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block font-medium text-slate-500 mb-1">Tipo de Conta</label>
          <select
            value={accType}
            onChange={e => setAccType(e.target.value as any)}
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          >
            <option value="checking">Conta Corrente</option>
            <option value="savings">Poupança / Reserva</option>
            <option value="cash">Dinheiro em Espécie (Carteira)</option>
            <option value="investment">Investimento</option>
          </select>
        </div>
      </ResponsiveModal>

      {/* Modal: Update Account Password (Supabase Auth) */}
      <ResponsiveModal
        isOpen={isSecurityModalOpen}
        onClose={() => setIsSecurityModalOpen(false)}
        title="Alterar Senha da Conta"
        size="sm"
        disableClose={securityLoading}
        icon={
          <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <KeyRound className="w-4 h-4" />
          </div>
        }
        bodyClassName="text-xs space-y-3"
        onSubmit={handleSaveSecurity}
        footer={
          <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2">
            <button
              type="button"
              disabled={securityLoading}
              onClick={() => setIsSecurityModalOpen(false)}
              className="sm:flex-1 py-2.5 px-4 min-h-[42px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer disabled:opacity-50"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={securityLoading}
              className="sm:flex-1 py-2.5 px-4 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs shadow-xs cursor-pointer"
            >
              {securityLoading ? 'Salvando...' : 'Atualizar Senha'}
            </button>
          </div>
        }
      >
        {securityError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{securityError}</span>
          </div>
        )}

        <div>
          <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
            Conta Autenticada
          </label>
          <div className="w-full px-3 py-2 bg-slate-100 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-700 dark:text-slate-300 font-mono truncate">
            {supabaseUserEmail || supabaseUserDisplayName}
          </div>
        </div>

        <div>
          <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
            Nova Senha (mínimo 6 caracteres) *
          </label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="Digite a nova senha"
            value={securityPass}
            onChange={e => setSecurityPass(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>

        <div>
          <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
            Confirmar Nova Senha *
          </label>
          <input
            type="password"
            required
            minLength={6}
            placeholder="Repita a nova senha"
            value={securityConfirmPass}
            onChange={e => setSecurityConfirmPass(e.target.value)}
            autoComplete="new-password"
            className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
          />
        </div>
      </ResponsiveModal>

      {/* Supabase Auth Connection Modal */}
      <ResponsiveModal
        isOpen={isSbModalOpen}
        onClose={() => {
          setIsSbModalOpen(false);
          setSbError(null);
          setSbSuccess(null);
          setSbOtpSent(false);
        }}
        title="Conectar Conta na Nuvem"
        icon={<Cloud className="w-5 h-5 text-blue-500" />}
        size="md"
        bodyClassName="space-y-4"
      >
        <p className="text-xs text-slate-500">
          Conecte sua conta para sincronizar e proteger seus dados financeiros na nuvem com isolamento individual.
        </p>

        {/* Auth Method Navigation Tabs */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs">
          <button
            type="button"
            onClick={() => {
              setSbAuthTab('otp');
              setSbError(null);
              setSbSuccess(null);
            }}
            className={`flex-1 py-2 font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              sbAuthTab === 'otp'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5 shrink-0" />
            <span>Código E-mail</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setSbAuthTab('password');
              setSbError(null);
              setSbSuccess(null);
            }}
            className={`flex-1 py-2 font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
              sbAuthTab === 'password'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <KeyRound className="w-3.5 h-3.5 shrink-0" />
            <span>Senha</span>
          </button>
        </div>

        {sbError && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span className="min-w-0 break-words">{sbError}</span>
          </div>
        )}

        {sbSuccess && (
          <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span className="min-w-0 break-words">{sbSuccess}</span>
          </div>
        )}

        {/* TAB 1: Link de Acesso por E-mail (Magic Link / OTP) */}
        {sbAuthTab === 'otp' && (
          <div className="space-y-3">
            <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-[11px] text-emerald-800 dark:text-emerald-300 space-y-1">
              <div className="font-semibold flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>Como funciona a conexão por e-mail:</span>
              </div>
              <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                Enviamos um e-mail com um botão <strong>"Log In"</strong> (Link de Acesso).
                Basta clicar nele para conectar este app diretamente à nuvem!
              </p>
            </div>

            {!sbOtpSent ? (
              <form onSubmit={handleSbSendOtp} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    Seu E-mail *
                  </label>
                  <input
                    type="email"
                    required
                    value={sbEmail}
                    onChange={e => setSbEmail(e.target.value)}
                    placeholder="seu@email.com"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-mono"
                  />
                </div>

                <button
                  type="submit"
                  disabled={sbOtpLoading}
                  className="w-full py-2.5 min-h-[42px] bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  {sbOtpLoading ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Mail className="w-4 h-4 shrink-0" />}
                  <span>{sbOtpLoading ? 'Enviando Link...' : 'Enviar Link de Acesso por E-mail'}</span>
                </button>
              </form>
            ) : (
              <div className="space-y-3 animate-in fade-in">
                {/* Instruções do Link Mágico */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-emerald-500/40 text-xs space-y-2">
                  <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400 min-w-0">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span className="truncate">Link enviado para {sbEmail}!</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                    Abra seu e-mail e clique no botão <strong>"Log In"</strong>. Sua conta será conectada automaticamente.
                  </p>
                  <button
                    type="button"
                    disabled={sbLoading}
                    onClick={async () => {
                      setSbLoading(true);
                      await checkSessionStatus();
                      setSbLoading(false);
                    }}
                    className="w-full py-2.5 min-h-[40px] bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                  >
                    {sbLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin shrink-0" /> : <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />}
                    <span>Já cliquei no link do e-mail (Verificar)</span>
                  </button>
                </div>

                {/* Opção secundária se houver código numérico de 6 dígitos */}
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[11px] font-semibold text-slate-500">
                      (Opcional) Código numérico recebido:
                    </span>
                    <button
                      type="button"
                      onClick={() => setSbOtpSent(false)}
                      className="text-[11px] text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline cursor-pointer"
                    >
                      Trocar e-mail
                    </button>
                  </div>
                  <form onSubmit={handleSbVerifyOtp} className="space-y-2">
                    <input
                      type="text"
                      maxLength={8}
                      value={sbOtpCode}
                      onChange={e => setSbOtpCode(e.target.value)}
                      placeholder="123456"
                      className="w-full px-3 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-center font-mono text-sm tracking-widest"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={handleSbSendOtp}
                        disabled={sbOtpLoading}
                        className="w-1/3 py-2 min-h-[38px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
                      >
                        Reenviar
                      </button>
                      <button
                        type="submit"
                        disabled={sbOtpLoading || !sbOtpCode.trim()}
                        className="w-2/3 py-2 min-h-[38px] bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
                      >
                        <span>Validar Código</span>
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* TAB 2: Email + Password */}
        {sbAuthTab === 'password' && (
          <form onSubmit={handleSupabaseLoginSubmit} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                E-mail da Conta *
              </label>
              <input
                type="email"
                required
                value={sbEmail}
                onChange={e => setSbEmail(e.target.value)}
                placeholder="seu@email.com"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-mono"
              />
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                  Senha da Conta *
                </label>
                <button
                  type="button"
                  disabled={sbResetLoading}
                  onClick={handleSbResetPassword}
                  className="text-[11px] text-blue-500 hover:text-blue-400 underline underline-offset-2 cursor-pointer"
                >
                  {sbResetLoading ? 'Enviando link...' : 'Criar/Redefinir Senha'}
                </button>
              </div>
              <input
                type="password"
                required
                value={sbPass}
                onChange={e => setSbPass(e.target.value)}
                placeholder="Sua senha"
                className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm"
              />
            </div>

            <div className="pt-2 flex flex-col-reverse sm:flex-row gap-2">
              <button
                type="button"
                onClick={() => setIsSbModalOpen(false)}
                className="sm:w-1/2 py-2.5 min-h-[42px] bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={sbLoading}
                className="sm:w-1/2 py-2.5 min-h-[42px] bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {sbLoading ? <RefreshCw className="w-4 h-4 animate-spin shrink-0" /> : <Cloud className="w-4 h-4 shrink-0" />}
                <span>Entrar com Senha</span>
              </button>
            </div>
          </form>
        )}
      </ResponsiveModal>

      <ConfirmDeleteModal
        isOpen={!!pendingDeleteAccount}
        title="Excluir Conta Bancária"
        description="Deseja excluir esta conta bancária? Os demais saldos e lançamentos permanecerão preservados."
        itemLabel={pendingDeleteAccount?.name}
        itemValue={pendingDeleteAccount ? formatCurrency(pendingDeleteAccount.balance) : undefined}
        isDeleting={isDeletingAccount}
        onConfirm={handleConfirmDeleteAccount}
        onCancel={() => setPendingDeleteAccount(null)}
      />

      <ConfirmDeleteModal
        isOpen={pendingDestructiveAction === 'sample'}
        title="Carregar Dados Demonstrativos"
        description="Esta operação preencherá o aplicativo localmente com dados fictícios de demonstração para testes, preservando os registros salvos na nuvem."
        variant="warning"
        confirmLabel="Confirmar: Carregar Demonstração"
        confirmingLabel="Carregando..."
        requireCheckboxLabel="Confirmo que desejo executar &quot;Carregar Dados Demonstrativos&quot; para visualização local."
        isDeleting={isExecutingDestructiveAction}
        onConfirm={handleConfirmDestructiveAction}
        onCancel={() => setPendingDestructiveAction(null)}
      />

      <ResponsiveModal
        isOpen={!!pendingBackupReview}
        onClose={() => {
          if (!isApplyingBackupRestore) {
            setPendingBackupReview(null);
            setConfirmBackupReplaceChecked(false);
          }
        }}
        disableClose={isApplyingBackupRestore}
        size="lg"
        titleId="backup-preview-modal-title"
        closeAriaLabel="Fechar prévia de backup"
        icon={
          <div
            className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
              pendingBackupReview?.outcome.canRestore
                ? 'bg-blue-50 dark:bg-blue-950/50 text-blue-600 dark:text-blue-400'
                : 'bg-rose-50 dark:bg-rose-950/50 text-rose-600 dark:text-rose-400'
            }`}
          >
            {pendingBackupReview?.outcome.canRestore ? (
              <ShieldCheck className="w-4 h-4" />
            ) : (
              <AlertTriangle className="w-4 h-4" />
            )}
          </div>
        }
        title="Prévia da Restauração de Backup"
        subtitle={pendingBackupReview?.fileName}
        bodyClassName="text-xs"
        footer={
          pendingBackupReview && (
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 text-xs">
              <button
                type="button"
                disabled={isApplyingBackupRestore}
                onClick={() => {
                  setPendingBackupReview(null);
                  setConfirmBackupReplaceChecked(false);
                }}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-colors disabled:opacity-50 cursor-pointer"
              >
                {pendingBackupReview.outcome.canRestore ? 'Cancelar' : 'Fechar'}
              </button>
              {pendingBackupReview.outcome.canRestore && (
                <button
                  type="button"
                  disabled={isApplyingBackupRestore || !confirmBackupReplaceChecked}
                  onClick={handleConfirmBackupRestore}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-semibold transition-colors inline-flex items-center justify-center gap-2 shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isApplyingBackupRestore ? (
                    <>
                      <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                      <span>Restaurando...</span>
                    </>
                  ) : (
                    <>
                      <Upload className="w-3.5 h-3.5" />
                      <span>Confirmar Restauração</span>
                    </>
                  )}
                </button>
              )}
            </div>
          )
        }
      >
        {pendingBackupReview && (
          <>
            {!pendingBackupReview.outcome.valid || !pendingBackupReview.outcome.prepared ? (
              <div className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300 space-y-1">
                <div className="font-bold flex items-center gap-1.5">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>Arquivo Rejeitado na Validação</span>
                </div>
                <p className="leading-relaxed">{pendingBackupReview.outcome.message}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Lançamentos</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {pendingBackupReview.outcome.prepared.counts.transactions}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Contas</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {pendingBackupReview.outcome.prepared.counts.accounts}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Cartões</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {pendingBackupReview.outcome.prepared.counts.creditCards}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Dívidas</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {pendingBackupReview.outcome.prepared.counts.debts}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Objetivos</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {pendingBackupReview.outcome.prepared.counts.goals}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                    <div className="text-[10px] text-slate-500">Categorias</div>
                    <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                      {pendingBackupReview.outcome.prepared.counts.categories}
                    </div>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 space-y-1.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500">Formato do Arquivo:</span>
                    <span className="font-semibold text-slate-900 dark:text-white text-right">
                      {pendingBackupReview.outcome.prepared.sourceFormat === 'recovery_snapshot'
                        ? 'Ponto de Recuperação (.json)'
                        : 'Backup Completo (.json)'}
                    </span>
                  </div>
                  {pendingBackupReview.outcome.prepared.sourceFormat === 'recovery_snapshot' &&
                    pendingBackupReview.outcome.prepared.snapshotReason && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-500">Origem do Ponto:</span>
                        <span className="font-medium text-slate-700 dark:text-slate-200 text-right">
                          {formatRecoveryReason(pendingBackupReview.outcome.prepared.snapshotReason).label}
                        </span>
                      </div>
                    )}
                  {pendingBackupReview.outcome.prepared.sourceFormat === 'recovery_snapshot' &&
                    pendingBackupReview.outcome.prepared.snapshotSavedAt && (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-slate-500">Capturado em:</span>
                        <span className="font-mono font-medium text-slate-700 dark:text-slate-200 tabular-nums">
                          {new Date(pendingBackupReview.outcome.prepared.snapshotSavedAt).toLocaleString('pt-BR')}
                        </span>
                      </div>
                    )}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500">Versão do Backup:</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      v{pendingBackupReview.outcome.prepared.version}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500">Data do Backup:</span>
                    <span className="font-mono font-semibold text-slate-800 dark:text-slate-200 tabular-nums">
                      {pendingBackupReview.outcome.prepared.lastModified > 0
                        ? new Date(pendingBackupReview.outcome.prepared.lastModified).toLocaleString('pt-BR')
                        : 'Sem registro de edição'}
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-slate-500">Proprietário (UUID):</span>
                    <span className="font-mono text-[11px] text-emerald-600 dark:text-emerald-400">
                      Confirmado ({pendingBackupReview.outcome.prepared.ownerUserId.slice(0, 8)}...)
                    </span>
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border space-y-1 ${
                    pendingBackupReview.outcome.canRestore
                      ? 'border-emerald-200 dark:border-emerald-900/60 bg-emerald-50/70 dark:bg-emerald-950/30 text-emerald-900 dark:text-emerald-200'
                      : 'border-rose-200 dark:border-rose-900/60 bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-300'
                  }`}
                >
                  <div className="font-bold flex items-center gap-1.5">
                    {pendingBackupReview.outcome.canRestore ? (
                      <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 dark:text-rose-400" />
                    )}
                    <span>
                      {pendingBackupReview.outcome.canRestore
                        ? 'Verificação na Nuvem Aprovada'
                        : 'Restauração Bloqueada por Segurança'}
                    </span>
                  </div>
                  <p className="leading-relaxed">{pendingBackupReview.outcome.message}</p>
                </div>

                {pendingBackupReview.outcome.canRestore && (
                  <label className="flex items-start gap-2.5 p-3 rounded-xl border border-amber-200 dark:border-amber-900/60 bg-amber-50/60 dark:bg-amber-950/20 text-amber-900 dark:text-amber-200 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={confirmBackupReplaceChecked}
                      onChange={e => setConfirmBackupReplaceChecked(e.target.checked)}
                      disabled={isApplyingBackupRestore}
                      className="mt-0.5 rounded border-amber-400 text-blue-600 focus:ring-blue-500 shrink-0"
                    />
                    <span className="leading-snug font-medium">
                      Confirmo que desejo substituir os dados atuais desta conta pelo conteúdo deste arquivo (o aplicativo tentará salvar uma cópia preventiva local antes).
                    </span>
                  </label>
                )}
              </>
            )}
          </>
        )}
      </ResponsiveModal>

      <ResponsiveModal
        isOpen={!!selectedRecoveryItem}
        onClose={() => setSelectedRecoveryItem(null)}
        size="md"
        titleId="recovery-details-modal-title"
        closeAriaLabel="Fechar detalhes do ponto de recuperação"
        icon={
          <div className="w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 flex items-center justify-center shrink-0">
            <History className="w-4 h-4" />
          </div>
        }
        title="Detalhes do Ponto de Recuperação"
        subtitle="Consulta preventiva somente leitura"
        bodyClassName="text-xs"
        footer={
          selectedRecoveryItem && (
            <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedRecoveryItem(null)}
                className="min-h-[40px] px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 font-semibold transition-colors cursor-pointer"
              >
                Fechar
              </button>
              <button
                type="button"
                disabled={downloadingRecoveryId === selectedRecoveryItem.id}
                onClick={() => handleDownloadRecoverySnapshot(selectedRecoveryItem)}
                className="min-h-[40px] px-4 py-2 rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold transition-colors inline-flex items-center justify-center gap-2 shadow-xs cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>
                  {downloadingRecoveryId === selectedRecoveryItem.id
                    ? 'Preparando...'
                    : 'Baixar Cópia'}
                </span>
              </button>
            </div>
          )
        }
      >
        {selectedRecoveryItem && (
          <>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/80 dark:border-slate-700 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500">Data e horário:</span>
                <span className="font-semibold text-slate-900 dark:text-white tabular-nums">
                  {selectedRecoveryItem.formattedSavedAt}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500">Versão capturada:</span>
                <span className="font-mono font-bold text-slate-900 dark:text-white">
                  v{selectedRecoveryItem.version}
                </span>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-slate-500">Origem local:</span>
                <span className="font-medium text-slate-700 dark:text-slate-200 text-right">
                  {selectedRecoveryItem.source === 'legacy_localstorage'
                    ? 'Cópia local anterior'
                    : 'Histórico local (IndexedDB)'}
                </span>
              </div>
              <div className="pt-1 border-t border-slate-200/70 dark:border-slate-700/70 space-y-1">
                <div className="text-slate-500">Motivo da criação:</div>
                <div className="font-semibold text-slate-900 dark:text-white">
                  {selectedRecoveryItem.reason.label}
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  {selectedRecoveryItem.reason.description}
                </p>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                <div className="text-[10px] text-slate-500">Lançamentos</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {selectedRecoveryItem.counts.transactions}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                <div className="text-[10px] text-slate-500">Contas</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {selectedRecoveryItem.counts.accounts}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                <div className="text-[10px] text-slate-500">Cartões</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {selectedRecoveryItem.counts.creditCards}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                <div className="text-[10px] text-slate-500">Dívidas</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {selectedRecoveryItem.counts.debts}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                <div className="text-[10px] text-slate-500">Objetivos</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {selectedRecoveryItem.counts.goals}
                </div>
              </div>
              <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200/70 dark:border-slate-700">
                <div className="text-[10px] text-slate-500">Categorias</div>
                <div className="text-sm font-bold text-slate-900 dark:text-white tabular-nums">
                  {selectedRecoveryItem.counts.categories}
                </div>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-blue-50/70 dark:bg-blue-950/30 border border-blue-200/70 dark:border-blue-900/60 text-blue-900 dark:text-blue-200 text-[11px] leading-relaxed">
              Este ponto de recuperação é exclusivo da conta autenticada neste navegador. A visualização e o download não modificam seus dados atuais nem sincronizam alterações com a nuvem.
            </div>
          </>
        )}
      </ResponsiveModal>
    </div>
  );
};

