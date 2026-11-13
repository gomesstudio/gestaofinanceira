/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Settings,
  Plus,
  Trash2,
  Edit2,
  FolderPlus,
  Wallet,
  Download,
  Upload,
  RotateCcw,
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
  Sparkles
} from 'lucide-react';
import { useFinance } from '../../context/FinanceContext';
import { useAuth } from '../../context/AuthContext';
import { formatCurrency } from '../../utils/formatters';
import { BankAccount, Category } from '../../types/finance';
import { SUPABASE_SQL_SETUP, DiagnosticResult } from '../../services/supabaseSyncService';

export const SettingsView: React.FC = () => {
  const {
    categories,
    accounts,
    safetyReserveDesired,
    setSafetyReserveDesired,
    addCategory,
    updateCategory,
    deleteCategory,
    addAccount,
    updateAccount,
    deleteAccount,
    loadSampleData,
    resetAllData,
    exportBackupJson,
    importBackupJson,
    isSampleLoaded,
    cloudSyncStatus,
    cloudSyncMessage,
    lastCloudSyncDate,
    syncNowWithCloud,
    forceUploadLocalToCloud,
    forceDownloadFromCloud,
    runCloudDiagnostic
  } = useFinance();

  // Supabase SQL script display and copy states
  const [showSqlScript, setShowSqlScript] = useState(false);
  const [isCopiedSql, setIsCopiedSql] = useState(false);

  const handleCopySql = () => {
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

  const {
    username,
    logout,
    updateCredentials,
    supabaseUserId,
    supabaseUserEmail,
    isSupabaseAuthenticated,
    signInWithSupabase,
    loginWithGitHub,
    signInWithOtp,
    verifyOtp,
    sendPasswordResetEmail,
    disconnectCloud,
    checkSessionStatus
  } = useAuth();

  // Supabase Diagnostic state
  const [diagnosticResult, setDiagnosticResult] = useState<DiagnosticResult | null>(null);
  const [isRunningDiagnostic, setIsRunningDiagnostic] = useState(false);

  const handleRunDiagnostic = async () => {
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
  const [sbEmail, setSbEmail] = useState('gomes.studio.ai@gmail.com');
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
      setStatusMsg({ type: 'success', text: 'Conectado à nuvem Supabase com sucesso!' });
    }
  }, [isSupabaseAuthenticated, isSbModalOpen]);

  // Security modal & state
  const [isSecurityModalOpen, setIsSecurityModalOpen] = useState(false);
  const [securityUser, setSecurityUser] = useState(username);
  const [securityPass, setSecurityPass] = useState('');
  const [securityConfirmPass, setSecurityConfirmPass] = useState('');
  const [securityError, setSecurityError] = useState<string | null>(null);

  const handleOpenSecurityModal = () => {
    setSecurityUser(username);
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
      setSbError('Informe seu e-mail do Supabase.');
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
        setSbSuccess('Autenticado com sucesso no Supabase com UUID oficial!');
        setStatusMsg({ type: 'success', text: 'Conectado ao Supabase com sucesso via código de acesso!' });
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
        setSbError(res.message || 'Falha na autenticação com Supabase.');
      } else {
        setIsSbModalOpen(false);
        setSbPass('');
        setStatusMsg({ type: 'success', text: 'Autenticado com sucesso no Supabase com UUID oficial!' });
      }
    } finally {
      setSbLoading(false);
    }
  };

  const handleSaveSecurity = (e: React.FormEvent) => {
    e.preventDefault();
    if (!securityUser.trim()) {
      setSecurityError('O nome de usuário não pode ficar vazio.');
      return;
    }
    if (!securityPass || securityPass.length < 4) {
      setSecurityError('A nova senha deve ter no mínimo 4 dígitos ou caracteres.');
      return;
    }
    if (securityPass !== securityConfirmPass) {
      setSecurityError('A confirmação da senha não coincide.');
      return;
    }

    const res = updateCredentials(securityUser.trim(), securityPass.trim());
    if (res.success) {
      setIsSecurityModalOpen(false);
      setStatusMsg({ type: 'success', text: 'Senha e credenciais de segurança atualizadas com sucesso!' });
    } else {
      setSecurityError(res.message);
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

  const handleImportJson = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = ev => {
      const content = ev.target?.result as string;
      const ok = importBackupJson(content);
      if (ok) {
        setStatusMsg({ type: 'success', text: 'Backup restaurado com sucesso! Seus dados foram atualizados.' });
      } else {
        setStatusMsg({ type: 'error', text: 'Falha ao restaurar: Arquivo JSON inválido ou corrompido.' });
      }
      setTimeout(() => setStatusMsg(null), 4000);
    };
    reader.readAsText(file);
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

      {/* Security & Access Protection Card */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                <Lock className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Segurança e Senha de Acesso ao Sistema
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              O aplicativo está protegido por senha exclusiva. Apenas você consegue acessar e gerenciar suas finanças.
            </p>
          </div>

          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200/70 dark:border-emerald-800/70 self-start sm:self-auto">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>Proteção Ativa</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
          {/* Active User Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                <UserCheck className="w-4 h-4" />
              </div>
              <div>
                <div className="text-[11px] text-slate-400 font-medium">Usuário Proprietário</div>
                <div className="text-sm font-bold font-mono text-slate-900 dark:text-white">{username}</div>
              </div>
            </div>
          </div>

          {/* Change Password Button */}
          <button
            onClick={handleOpenSecurityModal}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3 cursor-pointer"
          >
            <KeyRound className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Alterar Senha ou Usuário</div>
              <div className="text-[11px] text-slate-400">Atualizar credenciais de acesso</div>
            </div>
          </button>

          {/* Lock App Now Button */}
          <button
            onClick={logout}
            className="p-3.5 rounded-xl border border-rose-200/80 dark:border-rose-900/50 bg-rose-50/50 dark:bg-rose-950/20 hover:bg-rose-100 dark:hover:bg-rose-900/30 text-left transition-colors flex items-center gap-3 cursor-pointer"
          >
            <Lock className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-rose-700 dark:text-rose-300">Bloquear Aplicativo Agora</div>
              <div className="text-[11px] text-rose-500/80">Exigir senha para reabrir</div>
            </div>
          </button>
        </div>
      </div>

      {/* Supabase Cloud Sync Card */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-blue-500/15 text-blue-600 dark:text-blue-400">
                <Cloud className="w-4 h-4" />
              </span>
              <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                Sincronização na Nuvem com Supabase (Multi-Dispositivos)
              </h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Conexão com PostgreSQL no Supabase para sincronizar automaticamente seus lançamentos entre celular e computador.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
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
                  ? 'Tabela SQL Necessária'
                  : cloudSyncStatus === 'session_expired'
                  ? 'Sessão Expirada'
                  : isSupabaseAuthenticated
                  ? 'Conectado (Pronto)'
                  : 'Nuvem Desconectada'}
              </span>
            </span>
          </div>
        </div>

        {cloudSyncMessage && (
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
            <span className="leading-relaxed">{cloudSyncMessage}</span>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 pt-1">
          {/* Connection URL Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850">
            <div className="text-[11px] text-slate-400 font-medium">Projeto Supabase Ativo</div>
            <div className="text-xs font-mono font-bold text-slate-800 dark:text-slate-200 truncate mt-0.5">
              lwkecyfhpkyuakbbxksl.supabase.co
            </div>
            <div className="text-[10px] text-slate-400 mt-1">Conexão pública (anon key)</div>
          </div>

          {/* Authenticated Supabase UUID Card */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-850 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 font-medium">Usuário UUID (auth.users)</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${isSupabaseAuthenticated ? 'bg-emerald-500/15 text-emerald-400' : 'bg-amber-500/15 text-amber-400'}`}>
                  {isSupabaseAuthenticated ? 'Autenticado' : 'Pendente'}
                </span>
              </div>
              <div className="text-xs font-mono text-slate-800 dark:text-slate-200 truncate mt-0.5" title={supabaseUserId || 'Não conectado no Supabase'}>
                {supabaseUserId ? `${supabaseUserId.slice(0, 14)}...` : 'Nenhum login Supabase'}
              </div>
              {supabaseUserEmail && (
                <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                  {supabaseUserEmail}
                </div>
              )}
            </div>
            <div className="pt-2">
              {isSupabaseAuthenticated ? (
                <button
                  type="button"
                  onClick={disconnectCloud}
                  className="text-[11px] text-rose-500 hover:text-rose-400 font-medium transition-colors cursor-pointer"
                >
                  Desconectar Supabase
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSbModalOpen(true)}
                  className="text-[11px] text-blue-500 hover:text-blue-400 font-semibold transition-colors cursor-pointer"
                >
                  Conectar Conta Supabase
                </button>
              )}
            </div>
          </div>

          {/* Sync / Upload Actions */}
          <div className="p-3.5 rounded-xl border border-blue-200 dark:border-blue-900/60 bg-blue-50/50 dark:bg-blue-950/20 flex flex-col justify-between gap-2">
            <div>
              <div className="text-xs font-semibold text-blue-900 dark:text-blue-200 flex items-center gap-1.5">
                <RefreshCw className={`w-3.5 h-3.5 text-blue-600 dark:text-blue-400 ${cloudSyncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                <span>Sincronização Direta</span>
              </div>
              <div className="text-[11px] text-blue-600/80 dark:text-blue-400/80 mt-0.5">
                {lastCloudSyncDate ? `Última: ${lastCloudSyncDate.toLocaleTimeString()}` : 'Pronto para sincronizar'}
              </div>
            </div>
            <div className="flex gap-1.5 pt-1">
              <button
                type="button"
                onClick={forceUploadLocalToCloud}
                disabled={cloudSyncStatus === 'syncing'}
                title="Subir dados deste dispositivo para a nuvem"
                className="flex-1 py-1.5 px-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>Enviar</span>
              </button>
              <button
                type="button"
                onClick={forceDownloadFromCloud}
                disabled={cloudSyncStatus === 'syncing'}
                title="Baixar dados mais recentes da nuvem"
                className="flex-1 py-1.5 px-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-lg text-[11px] font-semibold transition-colors flex items-center justify-center gap-1 cursor-pointer"
              >
                <Download className="w-3 h-3" />
                <span>Baixar</span>
              </button>
            </div>
          </div>

          {/* SQL Script View Button */}
          <button
            onClick={() => setShowSqlScript(!showSqlScript)}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3 cursor-pointer"
          >
            <Database className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {showSqlScript ? 'Ocultar Script SQL' : 'Script SQL com RLS'}
              </div>
              <div className="text-[11px] text-slate-400">auth.uid() = user_id</div>
            </div>
          </button>
        </div>

        {/* Diagnostic Section */}
        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-850/80 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-emerald-500" />
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
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all shadow-xs cursor-pointer shrink-0"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRunningDiagnostic ? 'animate-spin' : ''}`} />
              <span>{isRunningDiagnostic ? 'Testando Conexão...' : 'Testar Conexão e Gravação'}</span>
            </button>
          </div>

          {diagnosticResult && (
            <div className="space-y-2 pt-2 border-t border-slate-200/80 dark:border-slate-800 animate-in fade-in">
              <div className="flex items-center justify-between text-xs">
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
                      <div className="font-semibold text-[11px] flex items-center justify-between">
                        <span>{st.name}</span>
                        <span className="text-[10px] font-mono opacity-70 uppercase tracking-wider">{st.status}</span>
                      </div>
                      <div className="text-[11px] mt-0.5 leading-snug">{st.message}</div>
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

        {/* Collapsible Supabase SQL Script Card */}
        {(showSqlScript || cloudSyncStatus === 'table_missing') && (
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-950 text-slate-100 text-xs space-y-3 animate-in fade-in">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-800 pb-2.5">
              <div>
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

            <pre className="font-mono text-[11px] text-emerald-300 bg-slate-900/90 p-3 rounded-lg overflow-x-auto leading-relaxed border border-slate-800">
              {SUPABASE_SQL_SETUP}
            </pre>
          </div>
        )}
      </div>

      {/* Backup and Data Storage Card */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-blue-500" />
            Armazenamento Local, Backup e Restauração
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Seus dados são salvos com segurança no navegador e nunca se perdem ao fechar a página.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* Download Backup */}
          <button
            onClick={handleExportJson}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3"
          >
            <Download className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Fazer Backup Completo</div>
              <div className="text-[11px] text-slate-400">Baixar arquivo .json com tudo</div>
            </div>
          </button>

          {/* Restore Backup */}
          <label className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3 cursor-pointer">
            <Upload className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">Restaurar de Arquivo</div>
              <div className="text-[11px] text-slate-400">Carregar backup .json anterior</div>
            </div>
            <input type="file" accept=".json" onChange={handleImportJson} className="hidden" />
          </label>

          {/* Reset / Sample Toggle */}
          <button
            onClick={() => {
              if (isSampleLoaded) {
                if (confirm('Deseja zerar os dados de teste e começar do zero com uma conta limpa?')) {
                  resetAllData();
                }
              } else {
                if (confirm('Deseja carregar os dados de demonstração para testar todas as funcionalidades?')) {
                  loadSampleData();
                }
              }
            }}
            className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-800 text-left transition-colors flex items-center gap-3"
          >
            <RotateCcw className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
            <div>
              <div className="text-xs font-semibold text-slate-900 dark:text-white">
                {isSampleLoaded ? 'Zerar Dados (Começar do Zero)' : 'Carregar Dados Demonstrativos'}
              </div>
              <div className="text-[11px] text-slate-400">
                {isSampleLoaded ? 'Limpar e iniciar vazio' : 'Preencher com dados de teste'}
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Accounts Management */}
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wallet className="w-4 h-4 text-emerald-500" />
              Contas Bancárias, Carteiras e Dinheiro Vivo
            </h3>
            <p className="text-xs text-slate-500">
              Personalize suas contas correntes, contas salário, poupanças e dinheiro em espécie
            </p>
          </div>
          <button
            onClick={() => setIsAccModalOpen(true)}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Adicionar Conta</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {accounts.map(acc => (
            <div
              key={acc.id}
              className="p-3.5 rounded-xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: acc.color }} />
                    <span className="font-semibold text-slate-900 dark:text-white text-xs truncate">
                      {acc.name}
                    </span>
                  </div>
                  {accounts.length > 1 && (
                    <button
                      onClick={() => {
                        if (confirm(`Deseja excluir a conta "${acc.name}"?`)) {
                          deleteAccount(acc.id);
                        }
                      }}
                      className="text-slate-400 hover:text-rose-600 p-1"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider capitalize">
                  {acc.type === 'checking' ? 'Conta Corrente' : acc.type === 'savings' ? 'Poupança / Reserva' : acc.type === 'cash' ? 'Dinheiro em Espécie' : 'Investimento'}
                </div>
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex justify-between items-baseline">
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
      <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-purple-500" />
              Categorias de Entradas e Despesas
            </h3>
            <p className="text-xs text-slate-500">
              Crie, edite e personalize suas próprias categorias com total liberdade
            </p>
          </div>
          <button
            onClick={() => handleOpenCatModal()}
            className="px-3 py-1.5 text-xs font-semibold rounded-xl bg-slate-900 dark:bg-emerald-600 text-white flex items-center gap-1.5"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Nova Categoria</span>
          </button>
        </div>

        {/* Categories list divided into Entradas and Despesas */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
          {/* Entradas */}
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
              Categorias de Entradas ({categories.filter(c => c.type === 'income').length})
            </h4>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {categories.filter(c => c.type === 'income').map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <button onClick={() => handleOpenCatModal(cat)} className="p-1 hover:text-slate-600">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDeleteCategory(cat)} className="p-1 hover:text-rose-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Despesas */}
          <div>
            <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-2 pb-1 border-b border-slate-100 dark:border-slate-800">
              Categorias de Despesas ({categories.filter(c => c.type === 'expense').length})
            </h4>
            <div className="space-y-1.5 max-h-72 overflow-y-auto">
              {categories.filter(c => c.type === 'expense').map(cat => (
                <div key={cat.id} className="flex items-center justify-between p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 hover:bg-slate-100 transition-colors">
                  <div className="flex items-center gap-2 truncate">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: cat.color }} />
                    <span className="font-medium text-slate-800 dark:text-slate-200 truncate">{cat.name}</span>
                    <span className="text-[10px] text-slate-400">
                      ({cat.expenseType === 'fixed' ? 'Fixa' : 'Variável'})
                    </span>
                  </div>
                  <div className="flex items-center gap-1 text-slate-400">
                    <button onClick={() => handleOpenCatModal(cat)} className="p-1 hover:text-slate-600">
                      <Edit2 className="w-3 h-3" />
                    </button>
                    <button onClick={() => handleDeleteCategory(cat)} className="p-1 hover:text-rose-600">
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Modal: Category */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                {editingCategory ? 'Editar Categoria' : 'Nova Categoria'}
              </h3>
              <button onClick={() => setIsCatModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCat} className="space-y-3">
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
                <label className="block font-medium text-slate-500 mb-1">Cor</label>
                <div className="flex items-center gap-2">
                  {['#10b981', '#0284c7', '#8b5cf6', '#ec4899', '#f59e0b', '#e11d48', '#64748b'].map(c => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setCatColor(c)}
                      className={`w-6 h-6 rounded-full ${catColor === c ? 'ring-2 ring-emerald-500 ring-offset-2' : ''}`}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl"
                >
                  Salvar Categoria
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Account */}
      {isAccModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                Cadastrar Nova Conta
              </h3>
              <button onClick={() => setIsAccModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="space-y-3">
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

              <div className="pt-2">
                <button
                  type="submit"
                  className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl"
                >
                  Cadastrar Conta
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Change Security Credentials */}
      {isSecurityModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-2xl p-5 text-xs space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  <KeyRound className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-sm">
                  Alterar Senha e Usuário
                </h3>
              </div>
              <button
                onClick={() => setIsSecurityModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {securityError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{securityError}</span>
              </div>
            )}

            <form onSubmit={handleSaveSecurity} className="space-y-3">
              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nome de Usuário *
                </label>
                <input
                  type="text"
                  required
                  value={securityUser}
                  onChange={e => setSecurityUser(e.target.value)}
                  placeholder="lucasgomes"
                  className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white font-mono"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Nova Senha (Mínimo 4 dígitos) *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Nova senha (ex: 6145)"
                  value={securityPass}
                  onChange={e => setSecurityPass(e.target.value)}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Confirmar Nova Senha *
                </label>
                <input
                  type="password"
                  required
                  placeholder="Repita a nova senha"
                  value={securityConfirmPass}
                  onChange={e => setSecurityConfirmPass(e.target.value)}
                  className="w-full px-3 py-2 font-mono bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setIsSecurityModalOpen(false)}
                  className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="w-1/2 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-xs"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supabase Auth Connection Modal */}
      {isSbModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-md w-full p-6 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <Cloud className="w-5 h-5 text-blue-500" />
                <h3 className="font-bold text-slate-900 dark:text-white text-base">
                  Conectar Conta Supabase
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSbModalOpen(false);
                  setSbError(null);
                  setSbSuccess(null);
                  setSbOtpSent(false);
                }}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Conecte sua conta do Supabase para obter a sessão JWT e o seu UUID exclusivo de <code className="font-mono text-blue-500">auth.users</code> para proteger seus dados via RLS.
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
                className={`flex-1 py-1.5 font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  sbAuthTab === 'otp'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <Mail className="w-3.5 h-3.5" />
                <span>Código E-mail</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSbAuthTab('github');
                  setSbError(null);
                  setSbSuccess(null);
                }}
                className={`flex-1 py-1.5 font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  sbAuthTab === 'github'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                  <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                </svg>
                <span>GitHub</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setSbAuthTab('password');
                  setSbError(null);
                  setSbSuccess(null);
                }}
                className={`flex-1 py-1.5 font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  sbAuthTab === 'password'
                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                <KeyRound className="w-3.5 h-3.5" />
                <span>Senha</span>
              </button>
            </div>

            {sbError && (
              <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>{sbError}</span>
              </div>
            )}

            {sbSuccess && (
              <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                <span>{sbSuccess}</span>
              </div>
            )}

            {/* TAB 1: Link de Acesso por E-mail (Magic Link / OTP) */}
            {sbAuthTab === 'otp' && (
              <div className="space-y-3">
                <div className="p-2.5 rounded-xl bg-emerald-50/60 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/50 text-[11px] text-emerald-800 dark:text-emerald-300 space-y-1">
                  <div className="font-semibold flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                    <span>Como funciona a conexão por e-mail:</span>
                  </div>
                  <p className="text-slate-600 dark:text-slate-400 leading-relaxed text-[11px]">
                    O Supabase envia um e-mail com um botão <strong>"Log In"</strong> (Magic Link).
                    Basta clicar nele para conectar este app diretamente à nuvem!
                  </p>
                </div>

                {!sbOtpSent ? (
                  <form onSubmit={handleSbSendOtp} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                        Seu E-mail do Supabase *
                      </label>
                      <input
                        type="email"
                        required
                        value={sbEmail}
                        onChange={e => setSbEmail(e.target.value)}
                        placeholder="gomes.studio.ai@gmail.com"
                        className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-mono"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={sbOtpLoading}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 transition-colors cursor-pointer"
                    >
                      {sbOtpLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                      <span>{sbOtpLoading ? 'Enviando Link...' : 'Enviar Link de Acesso por E-mail'}</span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3 animate-in fade-in">
                    {/* Instruções do Link Mágico */}
                    <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-emerald-500/40 text-xs space-y-2">
                      <div className="flex items-center gap-1.5 font-semibold text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 shrink-0" />
                        <span>Link enviado para {sbEmail}!</span>
                      </div>
                      <p className="text-slate-600 dark:text-slate-300 text-[11px] leading-relaxed">
                        Abra seu e-mail e clique no botão <strong>"Log In"</strong>. O Supabase conectará este aplicativo automaticamente.
                      </p>
                      <button
                        type="button"
                        disabled={sbLoading}
                        onClick={async () => {
                          setSbLoading(true);
                          await checkSessionStatus();
                          setSbLoading(false);
                        }}
                        className="w-full py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                      >
                        {sbLoading ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        <span>Já cliquei no link do e-mail (Verificar)</span>
                      </button>
                    </div>

                    {/* Opção secundária se houver código numérico de 6 dígitos */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
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
                            className="w-1/3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
                          >
                            Reenviar
                          </button>
                          <button
                            type="submit"
                            disabled={sbOtpLoading || !sbOtpCode.trim()}
                            className="w-2/3 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-50 text-white font-semibold rounded-xl text-xs transition-colors cursor-pointer"
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

            {/* TAB 2: GitHub OAuth */}
            {sbAuthTab === 'github' && (
              <div className="space-y-3">
                {sbWaitingGithub || sbGithubUrl ? (
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-emerald-500/30 text-xs space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                        <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                        <span>Aguardando Autorização no GitHub...</span>
                      </div>
                    </div>

                    <p className="text-slate-300 text-[11px] leading-relaxed">
                      Se a nova aba não abriu ou foi bloqueada pelo navegador, clique no link abaixo para autorizar:
                    </p>

                    {sbGithubUrl && (
                      <a
                        href={sbGithubUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="w-full py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer border border-slate-700"
                      >
                        <ExternalLink className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Abrir Autorização do GitHub ↗</span>
                      </a>
                    )}

                    <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                      <button
                        type="button"
                        onClick={() => {
                          setSbGithubUrl(null);
                          setSbWaitingGithub(false);
                        }}
                        className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={async () => {
                          setSbLoading(true);
                          await checkSessionStatus();
                          setSbLoading(false);
                        }}
                        className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Já autorizei</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-slate-500 text-xs leading-relaxed">
                      Conecta diretamente utilizando sua conta do GitHub associada ao projeto Supabase.
                    </p>

                    <button
                      type="button"
                      disabled={sbLoading || sbGithubLoading}
                      onClick={handleSbGitHub}
                      className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-850 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 shadow-xs cursor-pointer"
                    >
                      {sbGithubLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <svg className="w-4 h-4 fill-current text-white shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                            <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                          </svg>
                          <span>Entrar com GitHub</span>
                        </>
                      )}
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: Email + Password */}
            {sbAuthTab === 'password' && (
              <form onSubmit={handleSupabaseLoginSubmit} className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">
                    E-mail do Supabase *
                  </label>
                  <input
                    type="email"
                    required
                    value={sbEmail}
                    onChange={e => setSbEmail(e.target.value)}
                    placeholder="gomes.studio.ai@gmail.com"
                    className="w-full px-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm font-mono"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400">
                      Senha do Supabase *
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

                <div className="pt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => setIsSbModalOpen(false)}
                    className="w-1/2 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-semibold rounded-xl text-xs cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={sbLoading}
                    className="w-1/2 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-semibold rounded-xl text-xs shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {sbLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Cloud className="w-4 h-4" />}
                    <span>Entrar com Senha</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

