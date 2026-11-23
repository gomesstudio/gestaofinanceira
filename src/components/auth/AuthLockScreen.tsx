/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  Lock,
  User,
  KeyRound,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Mail,
  CheckCircle2,
  RefreshCw,
  ExternalLink,
  Send,
  Key,
  UserPlus,
  ArrowLeft,
  Phone,
  MessageCircle,
  Clock,
  CalendarRange
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useLegalNavigation } from '../../context/LegalNavigationContext';
import { LEGAL_DOCUMENTS_REGISTRY } from '../../legal/legalConfig';
import { SUPABASE_PROJECT_URL } from '../../utils/supabase';
import {
  buildPostSignupWhatsAppUrl,
  COMMERCIAL_WHATSAPP_NUMBER,
  isValidWhatsAppWithDDD,
  PendingRegistrationIntent,
  PublicPlanType,
  savePendingRegistrationIntent,
  submitCustomerAccessRequest
} from '../../services/subscriptionService';

type AuthViewMode = 'login' | 'signup' | 'forgot' | 'otp' | 'signup_confirmed';

export const AuthLockScreen: React.FC = () => {
  const {
    isPasswordRecoveryMode,
    authUrlError,
    clearAuthUrlError,
    supabaseConnectionStatus,
    loginWithSupabase,
    signUpWithSupabase,
    loginWithGitHub,
    signInWithOtp,
    verifyOtp,
    sendPasswordResetEmail,
    updatePassword,
    cancelPasswordRecovery,
    checkSessionStatus
  } = useAuth();

  const { openLegalDocument } = useLegalNavigation();
  const [mode, setMode] = useState<AuthViewMode>('login');

  // Campos de autenticação comercial
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [requestedPlan, setRequestedPlan] = useState<PublicPlanType>('monthly');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Confirmação pós-cadastro e consentimento LGPD para WhatsApp
  const [confirmedRegistration, setConfirmedRegistration] =
    useState<PendingRegistrationIntent | null>(null);
  const [whatsappConsent, setWhatsappConsent] = useState(false);

  // Campos de redefinição de senha (PASSWORD_RECOVERY)
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Estados de OTP / Magic Link
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');

  // Estados de GitHub OAuth em popup/aba externa
  const [githubAuthUrl, setGithubAuthUrl] = useState<string | null>(null);
  const [isWaitingGithub, setIsWaitingGithub] = useState(false);

  // Feedback e carregamento
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!isWaitingGithub && !githubAuthUrl) return;
    const interval = setInterval(async () => {
      await checkSessionStatus();
    }, 2000);
    return () => clearInterval(interval);
  }, [isWaitingGithub, githubAuthUrl, checkSessionStatus]);

  const switchMode = (nextMode: AuthViewMode) => {
    setMode(nextMode);
    setErrorMessage(null);
    clearAuthUrlError?.();
    setSuccessMessage(null);
    setOtpSent(false);
    setOtpCode('');
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await loginWithSupabase(email, password);
      if (!res.success) {
        setErrorMessage(res.message || 'Não foi possível entrar. Verifique seus dados.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSignUpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const cleanName = fullName.trim();
    const cleanWhatsapp = whatsapp.trim();
    const cleanEmail = email.trim();

    if (cleanName.length < 2) {
      setErrorMessage('Informe seu nome completo para realizar o cadastro.');
      return;
    }
    if (!isValidWhatsAppWithDDD(cleanWhatsapp)) {
      setErrorMessage('Informe um número de WhatsApp válido com DDD (ex.: (33) 99999-9999).');
      return;
    }
    if (password.length < 6) {
      setErrorMessage('A senha deve conter no mínimo 6 caracteres.');
      return;
    }
    if (password !== confirmPassword) {
      setErrorMessage('As senhas digitadas não coincidem.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await signUpWithSupabase(cleanEmail, password, cleanName, {
        whatsapp: cleanWhatsapp,
        requestedPlan
      });

      if (!res.success) {
        setErrorMessage(res.message || 'Erro ao criar conta.');
        return;
      }

      let syncedToSupabase = false;
      if (!res.requiresEmailConfirmation && res.userId) {
        const reqRes = await submitCustomerAccessRequest({
          fullName: cleanName,
          whatsapp: cleanWhatsapp,
          requestedPlan,
          whatsappConsent: false
        });
        syncedToSupabase = reqRes.success;
      }

      const intent: PendingRegistrationIntent = {
        email: cleanEmail,
        fullName: cleanName,
        whatsapp: cleanWhatsapp,
        requestedPlan,
        whatsappConsent: false,
        requiresEmailConfirmation: Boolean(res.requiresEmailConfirmation),
        syncedToSupabase,
        createdAt: new Date().toISOString()
      };

      savePendingRegistrationIntent(intent);
      setConfirmedRegistration(intent);
      setWhatsappConsent(false);
      setPassword('');
      setConfirmPassword('');
      setMode('signup_confirmed');
    } finally {
      setIsLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await sendPasswordResetEmail(email);
      if (!res.success) {
        setErrorMessage(res.message || 'Erro ao solicitar redefinição de senha.');
      } else {
        setSuccessMessage(
          res.message || 'Se o e-mail estiver cadastrado, enviaremos um link para você redefinir sua senha.'
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handlePasswordRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (newPassword.length < 6) {
      setErrorMessage('A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      setErrorMessage('A confirmação da nova senha não coincide.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await updatePassword(newPassword);
      if (!res.success) {
        setErrorMessage(res.message || 'Não foi possível atualizar sua senha.');
      } else {
        setSuccessMessage('Senha redefinida com sucesso! Carregando sua conta...');
        setNewPassword('');
        setConfirmNewPassword('');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await signInWithOtp(email);
      if (!res.success) {
        setErrorMessage(res.message || 'Erro ao enviar código/link de acesso.');
      } else {
        setOtpSent(true);
        setSuccessMessage(res.message || 'Link/código enviado! Verifique seu e-mail.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await verifyOtp(email, otpCode);
      if (!res.success) {
        setErrorMessage(res.message || 'Código inválido ou expirado.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleGitHubLogin = async () => {
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsLoading(true);
    try {
      const res = await loginWithGitHub();
      if (!res.success) {
        setErrorMessage(res.message || 'Erro ao conectar com GitHub.');
        return;
      }
      if (res.url) {
        setGithubAuthUrl(res.url);
        setIsWaitingGithub(true);
        try {
          window.open(res.url, '_blank', 'width=700,height=800,scrollbars=yes,status=yes');
        } catch {
          // Link manual fica visível na tela
        }
      }
    } finally {
      setIsLoading(false);
    }
  };

  const githubCallbackUrl = `${SUPABASE_PROJECT_URL.replace(/\/$/, '')}/auth/v1/callback`;

  const postSignupWhatsAppUrl = confirmedRegistration
    ? buildPostSignupWhatsAppUrl({
        fullName: confirmedRegistration.fullName,
        whatsapp: confirmedRegistration.whatsapp,
        email: confirmedRegistration.email,
        requestedPlan: confirmedRegistration.requestedPlan
      })
    : '';

  return (
    <div className="min-h-screen min-h-[100dvh] w-full flex flex-col p-3 sm:p-6 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950 text-slate-100 font-sans selection:bg-emerald-500/20 selection:text-emerald-300 relative overflow-x-clip overflow-y-auto">
      {/* Ambient background glows */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[280px] h-[280px] sm:w-[500px] sm:h-[500px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-10 w-48 h-48 sm:w-80 sm:h-80 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      <div className="w-full max-w-md m-auto relative z-10 animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 sm:p-8 bg-slate-900/90 backdrop-blur-xl border border-slate-800 rounded-3xl shadow-2xl shadow-black/60 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-500" />

          {/* Header & Logo */}
          <div className="text-center space-y-2.5 mb-5 sm:mb-6">
            <img
              src="/favicon.svg"
              alt="Gestão Financeira Pro"
              className="w-16 h-16 mx-auto block"
            />

            <div>
              <div className="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider mb-1">
                CONTROLE FINANCEIRO PESSOAL
              </div>
              <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight text-balance">
                Gestão Financeira Pro
              </h1>
              <p className="text-xs text-slate-400 mt-1 max-w-xs mx-auto leading-relaxed">
                {isPasswordRecoveryMode
                  ? 'Defina uma nova senha segura para concluir a recuperação da sua conta.'
                  : mode === 'signup_confirmed'
                  ? 'Sua solicitação de acesso foi registrada.'
                  : mode === 'signup'
                  ? 'Preencha seus dados e escolha seu plano de interesse para solicitar liberação.'
                  : mode === 'forgot'
                  ? 'Informe seu e-mail cadastrado para receber o link de redefinição de senha.'
                  : mode === 'otp'
                  ? 'Acesse sua conta com um link mágico ou código enviado ao seu e-mail.'
                  : 'Assuma o controle das suas finanças.'}
              </p>
            </div>
          </div>

          {/* Banner de sessão expirada */}
          {!isPasswordRecoveryMode && supabaseConnectionStatus === 'session_expired' && !errorMessage && !authUrlError && mode !== 'signup_confirmed' && (
            <div className="mb-4 p-3 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                Sua sessão expirou por segurança. Faça login novamente para continuar.
              </div>
            </div>
          )}

          {/* Feedback de erro */}
          {(errorMessage || authUrlError) && (
            <div className="mb-4 p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{errorMessage || authUrlError}</div>
            </div>
          )}

          {/* Feedback de sucesso */}
          {successMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-200 text-xs flex items-start gap-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="leading-relaxed">{successMessage}</div>
            </div>
          )}

          {/* FLUXO 0: Redefinição de Senha (PASSWORD_RECOVERY) */}
          {isPasswordRecoveryMode ? (
            <form onSubmit={handlePasswordRecoverySubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Nova Senha *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    autoComplete="new-password"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    aria-label={showNewPassword ? 'Ocultar senha' : 'Ver senha'}
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Confirmar Nova Senha *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    value={confirmNewPassword}
                    onChange={e => setConfirmNewPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {isLoading ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Salvar Nova Senha e Entrar</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={cancelPasswordRecovery}
                className="w-full py-2 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Cancelar e voltar ao login
              </button>
            </form>
          ) : isWaitingGithub || githubAuthUrl ? (
            /* FLUXO OAuth GitHub em aba externa */
            <div className="p-4 rounded-2xl bg-slate-950/80 border border-emerald-500/30 text-xs space-y-3.5 animate-in fade-in">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Autorização GitHub em andamento</span>
                </div>
              </div>

              <p className="text-slate-300 text-[11px] leading-relaxed">
                Complete a autenticação com o GitHub na aba aberta. Caso o navegador tenha bloqueado a janela, utilize o botão abaixo:
              </p>

              {githubAuthUrl && (
                <a
                  href={githubAuthUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-700 text-white font-semibold rounded-xl border border-slate-600 flex items-center justify-center gap-2 transition-all text-xs"
                >
                  <ExternalLink className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Abrir Autorização no GitHub</span>
                </a>
              )}

              {import.meta.env?.DEV && (
                <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-[11px] space-y-1.5">
                  <div className="font-semibold text-amber-300">Callback OAuth esperado:</div>
                  <div className="bg-slate-950 p-2 rounded-lg border border-slate-800 font-mono text-[10px] text-emerald-400 break-all select-all">
                    {githubCallbackUrl}
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between pt-1 border-t border-slate-800 text-[11px]">
                <button
                  type="button"
                  onClick={() => {
                    setGithubAuthUrl(null);
                    setIsWaitingGithub(false);
                  }}
                  className="text-slate-400 hover:text-slate-200 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={checkSessionStatus}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold underline cursor-pointer"
                >
                  Já autorizei — Verificar sessão
                </button>
              </div>
            </div>
          ) : mode === 'signup_confirmed' && confirmedRegistration ? (
            /* TELA DE CONFIRMAÇÃO DO CADASTRO + WHATSAPP COM CONSENTIMENTO */
            <div data-testid="signup-confirmation-screen" className="space-y-4 animate-in fade-in">
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                  <div className="space-y-1.5 text-xs text-slate-200 leading-relaxed">
                    <p className="font-bold text-white text-sm">
                      Cadastro realizado com sucesso!
                    </p>
                    <p>
                      Sua solicitação foi registrada e está aguardando liberação.
                    </p>
                    <p>
                      Para concluir sua contratação, entre em contato com nossa equipe pelo WhatsApp.
                    </p>
                  </div>
                </div>
              </div>

              {confirmedRegistration.requiresEmailConfirmation && (
                <div className="p-3.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-200 text-xs flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                  <div className="leading-relaxed">
                    Enviamos um link de confirmação para <strong>{confirmedRegistration.email}</strong>. Confirme seu e-mail antes do primeiro login; sua solicitação permanecerá preservada com segurança.
                  </div>
                </div>
              )}

              <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1 text-xs text-slate-300 break-words">
                <div>
                  <span className="text-slate-500">Nome:</span>{' '}
                  <strong className="text-white">{confirmedRegistration.fullName}</strong>
                </div>
                <div>
                  <span className="text-slate-500">WhatsApp:</span>{' '}
                  <strong className="text-white">{confirmedRegistration.whatsapp}</strong>
                </div>
                <div>
                  <span className="text-slate-500">E-mail:</span>{' '}
                  <strong className="text-white break-all">{confirmedRegistration.email}</strong>
                </div>
                <div>
                  <span className="text-slate-500">Plano solicitado:</span>{' '}
                  <strong className="text-emerald-400">
                    {confirmedRegistration.requestedPlan === 'annual' ? 'ANUAL (12 meses)' : 'MENSAL (30 dias)'}
                  </strong>
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-950/60 border border-slate-800 cursor-pointer text-xs text-slate-300 leading-relaxed">
                <input
                  type="checkbox"
                  checked={whatsappConsent}
                  onChange={e => {
                    const checked = e.target.checked;
                    setWhatsappConsent(checked);
                    const updated = { ...confirmedRegistration, whatsappConsent: checked };
                    setConfirmedRegistration(updated);
                    savePendingRegistrationIntent(updated);
                  }}
                  className="mt-0.5 rounded border-slate-600 text-emerald-500 focus:ring-emerald-500 shrink-0"
                />
                <span>
                  Autorizo compartilhar meu nome, WhatsApp, e-mail e plano solicitado com o atendimento oficial ({COMMERCIAL_WHATSAPP_NUMBER}) pelo WhatsApp para conclusão da contratação.
                </span>
              </label>

              {whatsappConsent ? (
                <a
                  href={postSignupWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full min-h-[44px] py-3 px-4 bg-emerald-600 hover:bg-emerald-500 text-white text-xs sm:text-sm font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 text-center leading-snug"
                >
                  <MessageCircle className="w-4 h-4 shrink-0" />
                  <span>CONCLUIR CONTRATAÇÃO PELO WHATSAPP</span>
                  <ExternalLink className="w-3.5 h-3.5 shrink-0" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setErrorMessage(
                      'Marque a autorização de compartilhamento de dados cadastrais acima para abrir o WhatsApp.'
                    )
                  }
                  className="w-full min-h-[44px] py-3 px-4 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs sm:text-sm font-bold rounded-xl border border-slate-700 transition-all flex items-center justify-center gap-2 text-center leading-snug cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span>CONCLUIR CONTRATAÇÃO PELO WHATSAPP</span>
                </button>
              )}

              <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                A mensagem não é enviada automaticamente: ao abrir o WhatsApp, toque em <strong>Enviar</strong> na conversa. Sua solicitação já está salva mesmo que você envie depois.
              </p>

              <button
                type="button"
                onClick={() => switchMode('login')}
                className="w-full py-2.5 px-4 bg-slate-800/80 hover:bg-slate-800 text-slate-200 text-xs font-semibold rounded-xl border border-slate-700 transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Ir para Entrar</span>
              </button>
            </div>
          ) : (
            <>
              {/* Navegação principal entre Entrar / Criar Conta */}
              {(mode === 'login' || mode === 'signup') && (
                <div className="flex rounded-xl bg-slate-950/80 border border-slate-800 p-1 mb-5 text-xs">
                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className={`flex-1 py-2 font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      mode === 'login'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <Lock className="w-3.5 h-3.5" />
                    <span>Entrar</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('signup')}
                    className={`flex-1 py-2 font-semibold rounded-lg transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                      mode === 'signup'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    <span>Criar Conta</span>
                  </button>
                </div>
              )}

              {/* MODO 1: ENTRAR */}
              {mode === 'login' && (
                <form onSubmit={handleLoginSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      E-mail *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        autoComplete="email"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-semibold text-slate-300">
                        Senha *
                      </label>
                      <button
                        type="button"
                        onClick={() => switchMode('forgot')}
                        className="text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer"
                      >
                        Recuperar senha
                      </button>
                    </div>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <KeyRound className="w-4 h-4" />
                      </div>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        placeholder="Sua senha"
                        autoComplete="current-password"
                        className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                        aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 group cursor-pointer"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <span>Entrar</span>
                        <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* MODO 2: CRIAR CONTA */}
              {mode === 'signup' && (
                <form onSubmit={handleSignUpSubmit} className="space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      Nome completo *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <User className="w-4 h-4" />
                      </div>
                      <input
                        type="text"
                        required
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        placeholder="Seu nome completo"
                        autoComplete="name"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      WhatsApp com DDD *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Phone className="w-4 h-4" />
                      </div>
                      <input
                        type="tel"
                        required
                        value={whatsapp}
                        onChange={e => setWhatsapp(e.target.value)}
                        placeholder="(33) 99999-9999"
                        autoComplete="tel"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1">
                      E-mail *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        autoComplete="email"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Criar senha *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={password}
                          onChange={e => setPassword(e.target.value)}
                          placeholder="Mín. 6 chars"
                          autoComplete="new-password"
                          className="w-full pl-9 pr-9 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                          aria-label={showPassword ? 'Ocultar senha' : 'Ver senha'}
                        >
                          {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Confirmar senha *
                      </label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-500">
                          <KeyRound className="w-4 h-4" />
                        </div>
                        <input
                          type={showPassword ? 'text' : 'password'}
                          required
                          minLength={6}
                          value={confirmPassword}
                          onChange={e => setConfirmPassword(e.target.value)}
                          placeholder="Repita a senha"
                          autoComplete="new-password"
                          className="w-full pl-9 pr-3 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Seleção pública de plano desejado (somente Mensal e Anual, sem preços) */}
                  <div>
                    <span className="block text-xs font-semibold text-slate-300 mb-1.5">
                      Selecionar plano desejado *
                    </span>
                    <div className="grid grid-cols-2 gap-2.5">
                      <button
                        type="button"
                        onClick={() => setRequestedPlan('monthly')}
                        aria-pressed={requestedPlan === 'monthly'}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          requestedPlan === 'monthly'
                            ? 'bg-blue-500/15 border-blue-400 text-white'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold">Mensal</span>
                          <Clock className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">30 dias</div>
                      </button>

                      <button
                        type="button"
                        onClick={() => setRequestedPlan('annual')}
                        aria-pressed={requestedPlan === 'annual'}
                        className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                          requestedPlan === 'annual'
                            ? 'bg-emerald-500/15 border-emerald-400 text-white'
                            : 'bg-slate-950/60 border-slate-800 text-slate-300 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-1.5">
                          <span className="text-xs font-bold">Anual</span>
                          <CalendarRange className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">12 meses</div>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      A seleção indica seu interesse inicial. A liberação ocorre após contato comercial e aprovação administrativa.
                    </p>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full mt-1 py-3 px-4 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-60 text-white text-sm font-bold rounded-xl shadow-lg shadow-emerald-950/50 transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <UserPlus className="w-4 h-4" />
                        <span>Criar Conta e Solicitar Acesso</span>
                      </>
                    )}
                  </button>
                </form>
              )}

              {/* MODO 3: RECUPERAR SENHA */}
              {mode === 'forgot' && (
                <form onSubmit={handleForgotSubmit} className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                      E-mail da Conta *
                    </label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                        <Mail className="w-4 h-4" />
                      </div>
                      <input
                        type="email"
                        required
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        placeholder="seu@email.com"
                        autoComplete="email"
                        className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-500 transition-all"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={isLoading}
                    className="w-full py-3 px-4 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {isLoading ? (
                      <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        <span>Enviar Link de Recuperação</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para o login</span>
                  </button>
                </form>
              )}

              {/* MODO 4: OTP / LINK MÁGICO POR E-MAIL */}
              {mode === 'otp' && (
                <div className="space-y-4">
                  {!otpSent ? (
                    <form onSubmit={handleSendOtp} className="space-y-4">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                          Seu E-mail *
                        </label>
                        <div className="relative">
                          <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                            <Mail className="w-4 h-4" />
                          </div>
                          <input
                            type="email"
                            required
                            value={email}
                            onChange={e => setEmail(e.target.value)}
                            placeholder="seu@email.com"
                            autoComplete="email"
                            className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700/80 rounded-xl text-white text-base sm:text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/40 focus:border-blue-500 transition-all"
                          />
                        </div>
                      </div>

                      <button
                        type="submit"
                        disabled={isLoading}
                        className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isLoading ? (
                          <RefreshCw className="w-4 h-4 animate-spin" />
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            <span>Enviar Link / Código</span>
                          </>
                        )}
                      </button>
                    </form>
                  ) : (
                    <div className="space-y-3">
                      <form onSubmit={handleVerifyOtp} className="space-y-3">
                        <div>
                          <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                            Código de verificação (se enviado no e-mail)
                          </label>
                          <div className="relative">
                            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                              <Key className="w-4 h-4" />
                            </div>
                            <input
                              type="text"
                              value={otpCode}
                              onChange={e => setOtpCode(e.target.value.trim())}
                              placeholder="Código de 6 dígitos"
                              maxLength={8}
                              className="w-full pl-10 pr-4 py-2.5 bg-slate-950/70 border border-slate-700 rounded-xl text-white text-base sm:text-sm text-center font-mono tracking-widest"
                            />
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={handleSendOtp}
                            disabled={isLoading}
                            className="w-1/3 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-xl cursor-pointer"
                          >
                            Reenviar
                          </button>
                          <button
                            type="submit"
                            disabled={isLoading || !otpCode.trim()}
                            className="w-2/3 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold rounded-xl cursor-pointer"
                          >
                            Confirmar Código
                          </button>
                        </div>
                      </form>

                      <button
                        type="button"
                        onClick={checkSessionStatus}
                        className="w-full py-2 bg-slate-800/80 hover:bg-slate-800 text-emerald-400 text-xs font-semibold rounded-xl border border-slate-700 cursor-pointer"
                      >
                        Já cliquei no link do e-mail — Verificar sessão
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    onClick={() => switchMode('login')}
                    className="w-full py-2 text-xs text-slate-400 hover:text-white flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    <span>Voltar para entrada com senha</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* Footer comercial neutro + Documentos Legais */}
          <div className="mt-5 pt-4 border-t border-slate-800/80 text-center text-[11px] text-slate-500 space-y-2">
            <div className="inline-flex items-center justify-center gap-1.5 text-slate-400">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Seus dados são privados e protegidos.</span>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <a
                href={LEGAL_DOCUMENTS_REGISTRY.terms_of_use.routePath}
                onClick={e => {
                  e.preventDefault();
                  openLegalDocument('terms_of_use');
                }}
                data-testid="auth-terms-link"
                className="text-slate-300 hover:text-emerald-400 underline underline-offset-2 transition-colors"
              >
                Termos de Uso
              </a>
              <span aria-hidden="true" className="text-slate-700">
                ·
              </span>
              <a
                href={LEGAL_DOCUMENTS_REGISTRY.privacy_policy.routePath}
                onClick={e => {
                  e.preventDefault();
                  openLegalDocument('privacy_policy');
                }}
                data-testid="auth-privacy-link"
                className="text-slate-300 hover:text-emerald-400 underline underline-offset-2 transition-colors"
              >
                Política de Privacidade
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
