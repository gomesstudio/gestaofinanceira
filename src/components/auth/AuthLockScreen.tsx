/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  ShieldCheck,
  Lock,
  Unlock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Cloud,
  Mail,
  CheckCircle2,
  X,
  RefreshCw,
  LogOut,
  Upload,
  Download,
  ExternalLink,
  Send,
  Key
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useFinance } from '../../context/FinanceContext';

export const AuthLockScreen: React.FC = () => {
  const {
    login,
    username: defaultUser,
    isSupabaseAuthenticated,
    supabaseConnectionStatus,
    supabaseUserId,
    supabaseUserEmail,
    loginWithSupabase,
    loginWithGitHub,
    signInWithOtp,
    verifyOtp,
    sendPasswordResetEmail,
    signUpWithSupabase,
    logoutFromSupabase,
    checkSessionStatus
  } = useAuth();

  const {
    forceUploadLocalToCloud,
    forceDownloadFromCloud,
    cloudSyncStatus,
    cloudSyncMessage
  } = useFinance();

  // Local PIN State (Único método visível por padrão na tela principal)
  const [inputUser, setInputUser] = useState(defaultUser || 'lucasgomes');
  const [inputPass, setInputPass] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Modal secundário de Configuração da Nuvem (Supabase)
  const [isCloudModalOpen, setIsCloudModalOpen] = useState(false);
  const [cloudEmail, setCloudEmail] = useState(supabaseUserEmail || 'gomes.studio.ai@gmail.com');
  const [cloudPass, setCloudPass] = useState('');
  const [showCloudPass, setShowCloudPass] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [cloudError, setCloudError] = useState<string | null>(null);
  const [cloudSuccess, setCloudSuccess] = useState<string | null>(null);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  // Estados dedicados para o fluxo OAuth GitHub em nova aba/janela (anti-bloqueio iframe)
  const [githubAuthUrl, setGithubAuthUrl] = useState<string | null>(null);
  const [isWaitingGithub, setIsWaitingGithub] = useState(false);

  // Estados para login sem senha por OTP (Link Mágico / Código por E-mail)
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);

  // Polling automático da sessão enquanto aguarda confirmação no GitHub
  React.useEffect(() => {
    if (!isWaitingGithub && !githubAuthUrl) return;

    const interval = setInterval(async () => {
      await checkSessionStatus();
    }, 2000);

    return () => clearInterval(interval);
  }, [isWaitingGithub, githubAuthUrl, checkSessionStatus]);

  // Se detectar que a sessão do Supabase conectou com sucesso (seja por Link de E-mail, OTP ou GitHub)
  React.useEffect(() => {
    if (isSupabaseAuthenticated) {
      setGithubAuthUrl(null);
      setIsWaitingGithub(false);
      setOtpSent(false);
      if (isCloudModalOpen) {
        setCloudSuccess('Nuvem Supabase conectada com sucesso!');
        const timer = setTimeout(() => {
          setIsCloudModalOpen(false);
        }, 1200);
        return () => clearTimeout(timer);
      }
    }
  }, [isSupabaseAuthenticated, isCloudModalOpen]);

  const handleLocalSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsLoading(true);

    setTimeout(() => {
      const res = login(inputUser, inputPass, remember);
      if (!res.success) {
        setErrorMessage(res.message || 'Usuário ou senha incorretos.');
        setIsLoading(false);
      }
    }, 200);
  };

  const handleCloudSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCloudError(null);
    setCloudSuccess(null);
    setCloudLoading(true);

    try {
      if (isSignUp) {
        const res = await signUpWithSupabase(cloudEmail, cloudPass);
        if (!res.success) {
          setCloudError(res.message || 'Erro ao cadastrar conta no Supabase.');
        } else {
          setCloudSuccess(res.message || 'Cadastro realizado com sucesso!');
          if (!res.userId) {
            // Confirmação de e-mail obrigatória
            setIsSignUp(false);
          } else {
            // Sessão iniciada imediatamente
            setTimeout(() => setIsCloudModalOpen(false), 1200);
          }
        }
      } else {
        const res = await loginWithSupabase(cloudEmail, cloudPass);
        if (!res.success) {
          setCloudError(res.message || 'Erro ao conectar com Supabase.');
        } else {
          setCloudSuccess('Nuvem Supabase conectada com sucesso!');
          setTimeout(() => setIsCloudModalOpen(false), 1200);
        }
      }
    } finally {
      setCloudLoading(false);
    }
  };

  const handleDisconnectCloud = async () => {
    setCloudLoading(true);
    try {
      await logoutFromSupabase();
      setCloudSuccess('Nuvem desconectada. O app funcionará apenas no modo local.');
    } finally {
      setCloudLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setCloudError(null);
    setCloudSuccess(null);
    setGithubLoading(true);

    try {
      const res = await loginWithGitHub();
      if (!res.success) {
        setCloudError(res.message || 'Erro ao conectar com GitHub.');
        setGithubLoading(false);
        return;
      }

      if (res.url) {
        setGithubAuthUrl(res.url);
        setIsWaitingGithub(true);

        // Tenta abrir em nova aba para contornar restrições de iframe e X-Frame-Options do GitHub
        try {
          const popup = window.open(res.url, '_blank', 'width=700,height=800,scrollbars=yes,status=yes');
          if (!popup || popup.closed || typeof popup.closed === 'undefined') {
            console.info('Aba externa aguardando confirmação do usuário.');
          }
        } catch (e) {
          console.warn('Popup bloqueado pelo navegador:', e);
        }
      }
    } catch (err: any) {
      setCloudError(err.message || 'Erro inesperado ao conectar com GitHub.');
    } finally {
      setGithubLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cloudEmail.trim()) {
      setCloudError('Informe seu e-mail do Supabase.');
      return;
    }
    setCloudError(null);
    setCloudSuccess(null);
    setOtpLoading(true);

    try {
      const res = await signInWithOtp(cloudEmail);
      if (!res.success) {
        setCloudError(res.message || 'Erro ao enviar link de acesso.');
      } else {
        setOtpSent(true);
        setCloudSuccess('Link de acesso enviado! Abra seu e-mail e clique em "Log In".');
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otpCode.trim()) {
      setCloudError('Informe o código de 6 dígitos recebido por e-mail.');
      return;
    }
    setCloudError(null);
    setCloudSuccess(null);
    setOtpLoading(true);

    try {
      const res = await verifyOtp(cloudEmail, otpCode);
      if (!res.success) {
        setCloudError(res.message || 'Código inválido ou expirado.');
      } else {
        setCloudSuccess('Autenticado com sucesso! Sincronização em nuvem ativada.');
        setTimeout(() => setIsCloudModalOpen(false), 1200);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResetPasswordRequest = async () => {
    if (!cloudEmail.trim()) {
      setCloudError('Informe seu e-mail para receber o link de criação de senha.');
      return;
    }
    setCloudLoading(true);
    setCloudError(null);
    try {
      const res = await sendPasswordResetEmail(cloudEmail);
      if (!res.success) {
        setCloudError(res.message || 'Erro ao solicitar link de redefinição.');
      } else {
        setCloudSuccess(res.message || 'Link para definir senha enviado para seu e-mail!');
      }
    } finally {
      setCloudLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-3 sm:p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-300 relative overflow-hidden max-w-full">
      {/* Ambient background glows */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] sm:w-[500px] sm:h-[500px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none max-w-full" />
      <div className="absolute bottom-10 right-10 w-48 h-48 sm:w-80 sm:h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none max-w-full" />

      {/* Security Card */}
      <div className="w-full max-w-md mx-auto relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-5 sm:p-8 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 relative overflow-hidden">
          {/* Subtle top indicator bar */}
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500" />

          {/* Header & Logo */}
          <div className="text-center space-y-2.5 mb-5 sm:mb-6">
            <div className="inline-flex items-center justify-center p-3 sm:p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 shadow-inner">
              <ShieldCheck className="w-7 h-7 sm:w-8 sm:h-8" />
            </div>

            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] sm:text-[11px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 mb-2">
                <Lock className="w-3 h-3" />
                <span>Acesso Seguro & Restrito</span>
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                Controle Financeiro Pessoal
              </h1>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto">
                Seus dados financeiros estão totalmente protegidos. Identifique-se para acessar o sistema.
              </p>
            </div>
          </div>

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-5 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 animate-in shake">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {/* Banner de Nuvem Supabase Conectada */}
          {isSupabaseAuthenticated && (
            <div className="mb-5 p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/40 text-emerald-200 text-xs space-y-2 shadow-lg shadow-emerald-950/40 animate-in fade-in duration-300">
              <div className="flex items-center gap-2 font-bold text-emerald-400 text-sm">
                <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
                <span>Nuvem Supabase Conectada!</span>
              </div>
              <p className="text-slate-300 leading-relaxed text-[11px]">
                Sua conta <strong>{supabaseUserEmail}</strong> está autenticada na nuvem e pronta para sincronizar.
              </p>
              <div className="p-2.5 rounded-xl bg-slate-950/70 border border-emerald-500/30 text-emerald-300 font-semibold text-xs flex items-center gap-2">
                <span>👉 Digite a senha local (<strong>6145</strong>) abaixo para acessar o sistema.</span>
              </div>
            </div>
          )}

          {/* Form de Senha Local (Único formulário principal) */}
          <form onSubmit={handleLocalSubmit} className="space-y-4">
            {/* Username Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                Usuário Autorizado
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  value={inputUser}
                  onChange={e => setInputUser(e.target.value)}
                  placeholder="lucasgomes"
                  autoComplete="username"
                  className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-mono"
                />
              </div>
            </div>

            {/* Password Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="block text-xs font-semibold text-slate-300">
                  Senha de Acesso
                </label>
                <span className="text-[11px] text-slate-500">
                  4 dígitos
                </span>
              </div>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <KeyRound className="w-4 h-4" />
                </div>
                <input
                  type={showPass ? 'text' : 'password'}
                  required
                  value={inputPass}
                  onChange={e => setInputPass(e.target.value)}
                  placeholder="••••"
                  autoComplete="current-password"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-mono tracking-widest"
                />
                <button
                  type="button"
                  onClick={() => setShowPass(!showPass)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  aria-label={showPass ? 'Ocultar senha' : 'Ver senha'}
                >
                  {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Remember Me Option */}
            <div className="flex items-center justify-between text-xs pt-1">
              <label className="flex items-center gap-2 text-slate-400 hover:text-slate-200 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={e => setRemember(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-700 text-emerald-600 focus:ring-emerald-500 bg-slate-800 cursor-pointer"
                />
                <span>Lembrar neste navegador</span>
              </label>

              <span className="text-[11px] text-slate-500">
                Uso individual
              </span>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 group cursor-pointer"
            >
              {isLoading ? (
                <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Unlock className="w-4 h-4 transition-transform group-hover:scale-110" />
                  <span>Desbloquear Sistema</span>
                  <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                </>
              )}
            </button>
          </form>

          {/* Footer discreto */}
          <div className="mt-6 pt-5 border-t border-slate-800/80 flex flex-col items-center gap-2 text-center text-[11px] text-slate-500">
            <div className="flex items-center justify-center gap-1.5 text-slate-400 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
              <span>Ambiente Protegido para Lucas Gomes</span>
            </div>

            {/* Link discreto de status da nuvem */}
            <div className="pt-0.5">
              {supabaseConnectionStatus === 'connected' ? (
                <button
                  type="button"
                  onClick={() => {
                    setCloudError(null);
                    setCloudSuccess(null);
                    setIsCloudModalOpen(true);
                  }}
                  className="text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-1.5 cursor-pointer font-medium"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>☁ Nuvem conectada</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCloudError(null);
                    setCloudSuccess(null);
                    setIsCloudModalOpen(true);
                  }}
                  className="text-slate-500 hover:text-emerald-400 transition-colors inline-flex items-center gap-1.5 underline underline-offset-2 cursor-pointer"
                >
                  <Cloud className="w-3.5 h-3.5 text-slate-500" />
                  <span>☁ Configurar nuvem</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Modal Secundário: Configuração da Nuvem Supabase */}
      {isCloudModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl shadow-black/80 max-w-md w-full p-6 sm:p-7 space-y-4 relative overflow-hidden animate-in zoom-in-95 duration-150">
            {/* Top decorative line */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-blue-500 to-teal-400" />

            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-blue-500/15 text-blue-400 border border-blue-500/30">
                  <Cloud className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">
                    Configuração da Nuvem
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Sincronização com Supabase (RLS seguro)
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setIsCloudModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Banner de status / sessão expirada */}
            {supabaseConnectionStatus === 'session_expired' && !isSupabaseAuthenticated && (
              <div className="p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
                <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">
                  Sua sessão na nuvem expirou. Faça login novamente para restabelecer a sincronização.
                </div>
              </div>
            )}

            {cloudError && (
              <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 animate-in shake">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{cloudError}</div>
              </div>
            )}

            {cloudSuccess && (
              <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                <div className="leading-relaxed">{cloudSuccess}</div>
              </div>
            )}

            {isSupabaseAuthenticated ? (
              /* Estado: Já conectado */
              <div className="space-y-4 pt-1">
                <div className="p-4 rounded-2xl bg-slate-950/60 border border-slate-800 text-xs space-y-2.5">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Nuvem Ativa e Sincronizada</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                      auth.uid()
                    </span>
                  </div>

                  <p className="text-slate-400 text-[11px] leading-relaxed">
                    Sua sessão foi autenticada no Supabase. Os dados financeiros são protegidos por Row Level Security exclusivo.
                  </p>

                  <div className="space-y-1 pt-1 border-t border-slate-800/80 text-[11px]">
                    {supabaseUserEmail && (
                      <div className="text-slate-300">
                        <span className="text-slate-500">Conta:</span> <strong>{supabaseUserEmail}</strong>
                      </div>
                    )}
                    {supabaseUserId && (
                      <div className="text-slate-300 font-mono">
                        <span className="text-slate-500">UUID Oficial:</span>{' '}
                        <strong>{supabaseUserId.slice(0, 8)}...</strong>
                      </div>
                    )}
                    {cloudSyncMessage && (
                      <div className="text-slate-400 text-[10px] pt-1">
                        Status sync: {cloudSyncMessage}
                      </div>
                    )}
                  </div>
                </div>

                {/* Ações de sincronização */}
                <div className="space-y-2">
                  <button
                    type="button"
                    disabled={cloudLoading || cloudSyncStatus === 'syncing'}
                    onClick={async () => {
                      setCloudLoading(true);
                      setCloudError(null);
                      try {
                        await forceUploadLocalToCloud();
                        setCloudSuccess('Dados locais enviados com sucesso para a nuvem!');
                      } catch (err: any) {
                        setCloudError(err.message || 'Erro ao enviar dados.');
                      } finally {
                        setCloudLoading(false);
                      }
                    }}
                    className="w-full py-2.5 px-3 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {cloudLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Upload className="w-3.5 h-3.5" />
                    )}
                    <span>Enviar dados locais agora</span>
                  </button>

                  <button
                    type="button"
                    disabled={cloudLoading || cloudSyncStatus === 'syncing'}
                    onClick={async () => {
                      setCloudLoading(true);
                      setCloudError(null);
                      try {
                        await forceDownloadFromCloud();
                        setCloudSuccess('Dados baixados da nuvem e aplicados localmente!');
                      } catch (err: any) {
                        setCloudError(err.message || 'Erro ao baixar dados.');
                      } finally {
                        setCloudLoading(false);
                      }
                    }}
                    className="w-full py-2.5 px-3 bg-blue-600/20 hover:bg-blue-600/30 border border-blue-500/40 text-blue-300 rounded-xl text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60"
                  >
                    {cloudLoading ? (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <Download className="w-3.5 h-3.5" />
                    )}
                    <span>Baixar dados da nuvem</span>
                  </button>

                  <div className="flex gap-2 pt-1">
                    <button
                      type="button"
                      onClick={() => setIsCloudModalOpen(false)}
                      className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Fechar
                    </button>
                    <button
                      type="button"
                      onClick={handleDisconnectCloud}
                      disabled={cloudLoading}
                      className="py-2.5 px-3.5 bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/30 text-rose-300 rounded-xl text-xs font-semibold transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Desconectar nuvem</span>
                    </button>
                  </div>
                </div>
              </div>
            ) : isWaitingGithub || githubAuthUrl ? (
              /* Estado: Aguardando autorização externa do GitHub */
              <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30 text-xs space-y-3.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                    <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                    <span>Autorização do GitHub em Andamento</span>
                  </div>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
                    Aguardando Login
                  </span>
                </div>

                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Por medidas de segurança do navegador, a autenticação com o GitHub precisa ocorrer em uma aba externa.
                </p>

                {githubAuthUrl && (
                  <a
                    href={githubAuthUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 text-white font-semibold rounded-xl border border-slate-600 hover:border-slate-500 flex items-center justify-center gap-2 transition-all cursor-pointer text-xs shadow-md"
                  >
                    <svg className="w-4 h-4 fill-current text-white shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                      <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                    </svg>
                    <span>Abrir Autorização no GitHub ↗</span>
                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                  </a>
                )}

                {/* Card explicativo sobre o erro "redirect_uri não associado" do GitHub */}
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] space-y-2">
                  <div className="font-semibold flex items-center gap-1.5 text-amber-300">
                    <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                    <span>Apareceu o aviso "redirect_uri não associado" no GitHub?</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    No seu painel do GitHub Developer Settings (OAuth App), o campo <strong>Authorization callback URL</strong> precisa ser exatamente:
                  </p>
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 font-mono text-[10px] text-emerald-400 break-all select-all">
                    https://lwkecyfhpkyuakbbxksl.supabase.co/auth/v1/callback
                  </div>
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setGithubAuthUrl(null);
                        setIsWaitingGithub(false);
                        setIsOtpMode(true);
                        setOtpSent(false);
                      }}
                      className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-colors flex items-center justify-center gap-1.5 cursor-pointer shadow-sm"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Ou entrar via Código no E-mail (Sem precisar do GitHub)</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setGithubAuthUrl(null);
                      setIsWaitingGithub(false);
                    }}
                    className="text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  >
                    Voltar / Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={cloudLoading}
                    onClick={async () => {
                      setCloudLoading(true);
                      await checkSessionStatus();
                      setCloudLoading(false);
                    }}
                    className="text-emerald-400 hover:text-emerald-300 font-semibold underline underline-offset-2 flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Já autorizei no GitHub</span>
                  </button>
                </div>
              </div>
            ) : isOtpMode ? (
              /* Estado: Login sem senha por Link de Acesso / Código no E-mail (OTP / Magic Link) */
              <div className="space-y-3.5 animate-in fade-in">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 text-blue-400 font-semibold text-xs">
                    <Mail className="w-4 h-4" />
                    <span>Acesso sem Senha via E-mail</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOtpMode(false);
                      setOtpSent(false);
                      setCloudError(null);
                    }}
                    className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                  >
                    Voltar para Senha
                  </button>
                </div>

                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/25 text-blue-200 text-xs space-y-1.5">
                  <div className="font-semibold text-blue-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>Como funciona o link no e-mail:</span>
                  </div>
                  <p className="text-slate-300 leading-relaxed text-[11px]">
                    O Supabase envia um e-mail com um botão de acesso direto (<strong>Magic Link</strong>).
                    Basta clicar nele no seu e-mail para conectar este aplicativo à nuvem instantaneamente!
                  </p>
                </div>

                {!otpSent ? (
                  <form onSubmit={handleSendOtp} className="space-y-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                        Seu E-mail do Supabase
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                          <Mail className="w-4 h-4" />
                        </div>
                        <input
                          type="email"
                          required
                          value={cloudEmail}
                          onChange={e => setCloudEmail(e.target.value)}
                          placeholder="gomes.studio.ai@gmail.com"
                          className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-mono"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={otpLoading}
                      className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {otpLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                      <span>Enviar Link de Acesso por E-mail</span>
                    </button>
                  </form>
                ) : (
                  <div className="space-y-3.5">
                    {/* Instruções do Link Mágico */}
                    <div className="p-3.5 rounded-2xl bg-slate-950/90 border border-emerald-500/30 text-xs space-y-2.5">
                      <div className="flex items-center gap-2 font-semibold text-emerald-400">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        <span>Link enviado para {cloudEmail}!</span>
                      </div>
                      <p className="text-slate-300 leading-relaxed text-[11px]">
                        <strong>Passo principal:</strong> Abra seu e-mail e clique no botão ou link <strong>"Log In"</strong>.
                        O Supabase autentica a conta e redireciona você de volta ao app automaticamente.
                      </p>
                      <div className="pt-1">
                        <button
                          type="button"
                          disabled={cloudLoading}
                          onClick={async () => {
                            setCloudLoading(true);
                            setCloudError(null);
                            await checkSessionStatus();
                            setCloudLoading(false);
                          }}
                          className="w-full py-2.5 px-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
                        >
                          {cloudLoading ? (
                            <RefreshCw className="w-4 h-4 animate-spin" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                          <span>Já cliquei no link do e-mail (Verificar)</span>
                        </button>
                      </div>
                    </div>

                    {/* Opção secundária: código numérico */}
                    <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-xs space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-slate-400">
                          (Opcional) Recebeu um código de 6 dígitos?
                        </span>
                        <button
                          type="button"
                          onClick={() => setOtpSent(false)}
                          className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                        >
                          Trocar e-mail
                        </button>
                      </div>
                      <form onSubmit={handleVerifyOtp} className="space-y-2">
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                            <Key className="w-4 h-4" />
                          </div>
                          <input
                            type="text"
                            value={otpCode}
                            onChange={e => setOtpCode(e.target.value.trim())}
                            placeholder="Digite os 6 dígitos (se houver)"
                            maxLength={8}
                            className="w-full pl-10 pr-4 py-2 bg-slate-950/70 border border-slate-700 rounded-xl text-white text-xs placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all font-mono tracking-widest text-center"
                          />
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={otpLoading}
                            className="w-1/3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                          >
                            Reenviar
                          </button>
                          <button
                            type="submit"
                            disabled={otpLoading || !otpCode.trim()}
                            className="w-2/3 py-2 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                          >
                            <span>Validar Código</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Estado: Não configurado ainda ou Sessão Expirada (Visual Padrão) */
              <div className="space-y-3.5">
                <p className="text-xs text-slate-400 leading-relaxed">
                  Conecte sua conta do Supabase uma única vez para ativar a sincronização na nuvem. A sessão será mantida no seu navegador.
                </p>

                {/* Opção Rápida 1: Link sem senha no E-mail (Recomendado) */}
                <button
                  type="button"
                  disabled={cloudLoading || githubLoading}
                  onClick={() => {
                    setIsOtpMode(true);
                    setOtpSent(false);
                    setCloudError(null);
                    setCloudSuccess(null);
                  }}
                  className="w-full py-2.5 px-4 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-md shadow-blue-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer border border-blue-400/30"
                >
                  <Mail className="w-4 h-4 shrink-0" />
                  <span>Entrar com Link de Acesso por E-mail</span>
                  <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded-full bg-blue-400/20 text-blue-200 border border-blue-300/30 font-medium">
                    Sem Senha
                  </span>
                </button>

                {/* Opção 2: Login OAuth com GitHub */}
                <button
                  type="button"
                  disabled={cloudLoading || githubLoading}
                  onClick={handleGitHubLogin}
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-750 active:bg-slate-700 disabled:opacity-60 text-white text-xs font-semibold rounded-xl border border-slate-700 hover:border-slate-600 transition-all flex items-center justify-center gap-2.5 shadow-sm cursor-pointer"
                >
                  {githubLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-300" />
                      <span>Conectando ao GitHub...</span>
                    </>
                  ) : (
                    <>
                      <svg className="w-4 h-4 fill-current text-white shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path fillRule="evenodd" clipRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.53 1.032 1.53 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
                      </svg>
                      <span>Entrar com GitHub</span>
                    </>
                  )}
                </button>

                {/* Divisor visual com texto 'ou' */}
                <div className="relative flex items-center justify-center my-0.5">
                  <div className="border-t border-slate-800 w-full" />
                  <span className="bg-slate-900 px-3 text-[11px] uppercase tracking-wider text-slate-500 font-medium">
                    ou com senha cadastrada
                  </span>
                </div>

                <form onSubmit={handleCloudSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      E-mail do Supabase
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={cloudEmail}
                        onChange={e => setCloudEmail(e.target.value)}
                        placeholder="gomes.studio.ai@gmail.com"
                        autoComplete="email"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all font-mono"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        Senha da Conta Supabase
                      </label>
                      <button
                        type="button"
                        onClick={handleResetPasswordRequest}
                        className="text-[11px] text-slate-400 hover:text-blue-400 transition-colors cursor-pointer"
                      >
                        Esqueci / Criar senha
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type={showCloudPass ? 'text' : 'password'}
                        required
                        value={cloudPass}
                        onChange={e => setCloudPass(e.target.value)}
                        placeholder="Sua senha no Supabase"
                        autoComplete="current-password"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowCloudPass(!showCloudPass)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                      >
                        {showCloudPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsOtpMode(true);
                        setCloudError(null);
                        setCloudSuccess(null);
                      }}
                      className="text-emerald-400 hover:text-emerald-300 font-medium transition-colors cursor-pointer inline-flex items-center gap-1"
                    >
                      <Mail className="w-3.5 h-3.5" />
                      <span>Entrar sem senha via código</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setIsSignUp(!isSignUp);
                        setCloudError(null);
                        setCloudSuccess(null);
                      }}
                      className="text-blue-400 hover:text-blue-300 transition-colors cursor-pointer"
                    >
                      {isSignUp ? 'Já tem conta? Entrar' : 'Criar conta nova'}
                    </button>
                  </div>

                  <div className="pt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setIsCloudModalOpen(false)}
                      className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={cloudLoading}
                      className="w-2/3 py-2.5 bg-blue-600 hover:bg-blue-500 active:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold rounded-xl shadow-lg shadow-blue-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {cloudLoading ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Cloud className="w-4 h-4" />
                          <span>{isSignUp ? 'Criar Conta no Supabase' : 'Entrar no Supabase'}</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
