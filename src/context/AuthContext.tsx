/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../utils/supabase';
import {
  clearAllLocalDataForUser,
  getUserStateFromStorage,
  saveRecoverySnapshotForUser
} from '../utils/storage';
import { clearRecoveryHistoryForUser } from '../utils/recoveryHistoryDb';
import { clearPendingRegistrationIntent } from '../services/subscriptionService';
import type { User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';

export type CloudAuthStatus = 'connected' | 'not_configured' | 'session_expired' | 'unauthenticated';
export type SupabaseConnectionStatus = CloudAuthStatus;

export interface LogoutCleanupOptions {
  preserveRecoveryBackups?: boolean;
  skipActiveCacheBackupOnPreserve?: boolean;
  userEmailOverride?: string | null;
  indexedDBFactory?: IDBFactory | null;
}

export interface AuthResult {
  success: boolean;
  message?: string;
  userId?: string;
  requiresEmailConfirmation?: boolean;
}

export interface AuthContextType {
  // Estado principal controlado estritamente pelo Supabase Auth
  isAuthenticated: boolean;
  isSessionLoading: boolean;
  isPasswordRecoveryMode: boolean;
  authUrlError?: string | null;
  clearAuthUrlError?: () => void;
  supabaseConnectionStatus: SupabaseConnectionStatus;
  cloudAuthStatus: CloudAuthStatus;
  supabaseUser: SupabaseUser | null;
  supabaseUserId: string | null;
  supabaseUserEmail: string | null;
  supabaseUserDisplayName: string;

  // Alias mantido para compatibilidade com módulos financeiros
  isSupabaseAuthenticated: boolean;

  // Operações oficiais de autenticação comercial
  loginWithSupabase: (email: string, pass: string) => Promise<AuthResult>;
  signInWithSupabase: (email: string, pass: string) => Promise<AuthResult>;
  signUpWithSupabase: (
    email: string,
    pass: string,
    fullName?: string,
    extra?: { whatsapp?: string; requestedPlan?: 'monthly' | 'annual' }
  ) => Promise<AuthResult>;
  loginWithGitHub: () => Promise<{ success: boolean; message?: string; url?: string }>;
  signInWithOtp: (email: string) => Promise<{ success: boolean; message?: string }>;
  verifyOtp: (email: string, token: string) => Promise<AuthResult>;
  sendPasswordResetEmail: (email: string) => Promise<{ success: boolean; message?: string }>;
  updatePassword: (newPassword: string) => Promise<{ success: boolean; message?: string }>;
  cancelPasswordRecovery: () => Promise<void>;
  logout: (options?: LogoutCleanupOptions) => Promise<void>;
  logoutFromSupabase: (options?: LogoutCleanupOptions) => Promise<void>;
  disconnectCloud: (options?: LogoutCleanupOptions) => Promise<void>;
  checkSessionStatus: () => Promise<void>;
}

export const SUPABASE_CONFIGURED_FLAG = 'finance_supabase_was_configured';

// Chaves legadas de PIN local que devem ser removidas do navegador
const LEGACY_AUTH_KEYS = [
  'finance_auth_user',
  'finance_auth_password',
  'finance_auth_session',
  'finance_auth_last_login'
] as const;

export function scrubLegacyLocalAuthKeys(): void {
  if (typeof window === 'undefined') return;
  try {
    LEGACY_AUTH_KEYS.forEach(key => {
      try {
        localStorage.removeItem(key);
      } catch {
        // ignore storage restrictions
      }
      try {
        sessionStorage.removeItem(key);
      } catch {
        // ignore storage restrictions
      }
    });
  } catch {
    // ignore
  }
}

export function isValidEmailFormat(email: string): boolean {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

export function validatePasswordStrength(password: string): { valid: boolean; message?: string } {
  if (!password || password.length < 6) {
    return {
      valid: false,
      message: 'A senha deve conter no mínimo 6 caracteres.'
    };
  }
  if (password.length > 128) {
    return {
      valid: false,
      message: 'A senha excede o limite máximo permitido de 128 caracteres.'
    };
  }
  return { valid: true };
}

export function isTrustedMessageOrigin(eventOrigin: string | undefined, expectedOrigin: string | undefined): boolean {
  if (!eventOrigin || !expectedOrigin) return false;
  if (eventOrigin === 'null') return false;
  return eventOrigin === expectedOrigin;
}

export function isSessionExpired(session: SupabaseSession | null): boolean {
  if (!session || !session.user) return true;
  if (typeof session.expires_at === 'number') {
    const expiresAtMs = session.expires_at * 1000;
    return expiresAtMs <= Date.now();
  }
  return false;
}

export function deriveUserDisplayName(user: SupabaseUser | null): string {
  if (!user) return 'Conta';
  const metaName =
    (typeof user.user_metadata?.full_name === 'string' && user.user_metadata.full_name.trim()) ||
    (typeof user.user_metadata?.name === 'string' && user.user_metadata.name.trim()) ||
    (typeof user.user_metadata?.user_name === 'string' && user.user_metadata.user_name.trim());
  if (metaName) return metaName;
  if (user.email) {
    return user.email.split('@')[0];
  }
  return 'Conta';
}

/**
 * Mapeamento amigável de erros de autenticação Supabase (senha, cadastro, recuperação e OAuth)
 */
export const mapAuthError = (error: any): string => {
  if (!error) return 'Erro inesperado de autenticação.';
  const code = (error.code || '').toString().toLowerCase();
  const msg = (error.message || '').toString().toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado. Verifique sua caixa de entrada e clique no link de confirmação antes de entrar.';
  }
  if (code === 'user_already_exists' || msg.includes('already registered')) {
    return 'Este e-mail já está cadastrado. Faça login ou utilize a opção "Esqueci minha senha".';
  }
  if (code === 'weak_password' || msg.includes('password should be at least')) {
    return 'A senha não atende aos requisitos mínimos de segurança (mínimo de 6 caracteres).';
  }
  if (code === 'same_password' || msg.includes('new password should be different')) {
    return 'A nova senha precisa ser diferente da senha atual.';
  }
  if (code === 'too_many_requests' || msg.includes('too many requests')) {
    return 'Muitas tentativas seguidas. Aguarde alguns minutos antes de tentar novamente.';
  }
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) {
    return 'Limite temporário de envio de e-mails atingido. Aguarde alguns instantes antes de reenviar.';
  }
  if (code === 'invalid_api_key' || msg.includes('api key') || msg.includes('invalid api key')) {
    return 'Configuração de conexão pública do Supabase inválida. Verifique as variáveis de ambiente.';
  }
  if (
    code === 'provider_not_enabled' ||
    code === 'provider_disabled' ||
    msg.includes('provider is not enabled') ||
    msg.includes('provider_not_enabled')
  ) {
    return 'Login com GitHub não está habilitado no projeto Supabase.';
  }
  if (
    code === 'access_denied' ||
    code === 'oauth_canceled' ||
    code === 'oauth' ||
    msg.includes('access_denied') ||
    msg.includes('canceled') ||
    msg.includes('cancelled')
  ) {
    return 'Autenticação cancelada ou negada pelo usuário.';
  }
  if (code === 'otp_expired' || msg.includes('otp has expired') || msg.includes('token has expired')) {
    return 'O link ou código de acesso expirou. Solicite um novo.';
  }
  if (code === 'otp_disabled' || msg.includes('signups not allowed for otp')) {
    return 'Envio de código sem senha está desativado nas configurações de autenticação.';
  }
  if (code === 'session_expired' || code === 'refresh_token_not_found' || msg.includes('session_not_found')) {
    return 'Sua sessão expirou. Faça login novamente para continuar.';
  }
  return error.message || 'Erro inesperado de autenticação.';
};

export const SENSITIVE_AUTH_URL_PARAMS = [
  'code',
  'token_hash',
  'token',
  'type',
  'access_token',
  'refresh_token',
  'expires_in',
  'expires_at',
  'token_type',
  'provider_token',
  'provider_refresh_token',
  'error',
  'error_code',
  'error_description',
  'sb'
] as const;

const SENSITIVE_AUTH_PARAM_SET = new Set<string>(SENSITIVE_AUTH_URL_PARAMS);

function parseHashQueryParams(rawHash: string | undefined): URLSearchParams | null {
  if (!rawHash) return null;
  const trimmed = rawHash.startsWith('#') ? rawHash.slice(1) : rawHash;
  if (!trimmed || !trimmed.includes('=')) return null;
  try {
    return new URLSearchParams(trimmed);
  } catch {
    return null;
  }
}

export function hasPasswordRecoveryParamsInUrl(
  locationLike?: { search?: string; hash?: string }
): boolean {
  const loc = locationLike ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return false;
  try {
    const searchParams = new URLSearchParams(loc.search || '');
    if (searchParams.get('type') === 'recovery') return true;
    const hashParams = parseHashQueryParams(loc.hash);
    if (hashParams?.get('type') === 'recovery') return true;
  } catch {
    // fallback substring check
  }
  return (
    Boolean(loc.hash?.includes('type=recovery')) ||
    Boolean(loc.search?.includes('type=recovery'))
  );
}

export function hasSensitiveAuthParamsInUrl(
  locationLike?: { search?: string; hash?: string }
): boolean {
  const loc = locationLike ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return false;
  try {
    const searchParams = new URLSearchParams(loc.search || '');
    for (const key of searchParams.keys()) {
      if (SENSITIVE_AUTH_PARAM_SET.has(key)) return true;
    }
    const hashParams = parseHashQueryParams(loc.hash);
    if (hashParams) {
      for (const key of hashParams.keys()) {
        if (SENSITIVE_AUTH_PARAM_SET.has(key)) return true;
      }
    }
  } catch {
    // ignore
  }
  return false;
}

export function hasOAuthOrMagicLinkReturnInUrl(
  locationLike?: { search?: string; hash?: string }
): boolean {
  const loc = locationLike ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return false;
  try {
    const searchParams = new URLSearchParams(loc.search || '');
    if (searchParams.has('code') || searchParams.has('token_hash') || searchParams.has('access_token')) {
      return true;
    }
    const hashParams = parseHashQueryParams(loc.hash);
    if (hashParams && (hashParams.has('access_token') || hashParams.has('code') || hashParams.has('refresh_token'))) {
      return true;
    }
  } catch {
    // fallback
  }
  return (
    Boolean(loc.hash?.includes('access_token=')) ||
    Boolean(loc.search?.includes('code=')) ||
    Boolean(loc.search?.includes('token_hash='))
  );
}

export function extractAuthErrorFromUrl(
  locationLike?: { search?: string; hash?: string }
): string | null {
  const loc = locationLike ?? (typeof window !== 'undefined' ? window.location : undefined);
  if (!loc) return null;
  try {
    const searchParams = new URLSearchParams(loc.search || '');
    const hashParams = parseHashQueryParams(loc.hash);
    const error = searchParams.get('error') || hashParams?.get('error') || '';
    const errorCode = searchParams.get('error_code') || hashParams?.get('error_code') || '';
    const errorDescription =
      searchParams.get('error_description') || hashParams?.get('error_description') || '';

    if (!error && !errorCode && !errorDescription) {
      return null;
    }

    return mapAuthError({
      code: errorCode || error,
      message: errorDescription || error || 'Falha na autenticação.'
    });
  } catch {
    return null;
  }
}

/**
 * Remove códigos, tokens e parâmetros sensíveis de autenticação da URL do navegador
 * via history.replaceState, preservando rota atual e parâmetros não relacionados à autenticação.
 */
export function scrubSensitiveAuthParamsFromUrl(): boolean {
  if (typeof window === 'undefined' || !window.location || !window.history?.replaceState) {
    return false;
  }

  try {
    const url = new URL(window.location.href);
    let removedAny = false;

    for (const key of Array.from(url.searchParams.keys())) {
      if (SENSITIVE_AUTH_PARAM_SET.has(key)) {
        url.searchParams.delete(key);
        removedAny = true;
      }
    }

    if (removedAny && url.searchParams.has('state')) {
      url.searchParams.delete('state');
    }

    const hashParams = parseHashQueryParams(url.hash);
    if (hashParams) {
      let removedHashAuth = false;
      for (const key of Array.from(hashParams.keys())) {
        if (SENSITIVE_AUTH_PARAM_SET.has(key)) {
          hashParams.delete(key);
          removedHashAuth = true;
          removedAny = true;
        }
      }
      if (removedHashAuth && hashParams.has('state')) {
        hashParams.delete('state');
      }
      if (removedHashAuth) {
        const nextHash = hashParams.toString();
        url.hash = nextHash ? `#${nextHash}` : '';
      }
    }

    if (!removedAny) return false;

    const currentRelative = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    const nextRelative = `${url.pathname}${url.search}${url.hash}`;
    if (nextRelative !== currentRelative) {
      window.history.replaceState(window.history.state ?? null, '', nextRelative);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [isPasswordRecoveryMode, setIsPasswordRecoveryMode] = useState<boolean>(() =>
    hasPasswordRecoveryParamsInUrl()
  );
  const [authUrlError, setAuthUrlError] = useState<string | null>(() =>
    extractAuthErrorFromUrl()
  );
  const clearAuthUrlError = useCallback(() => setAuthUrlError(null), []);

  const [supabaseConnectionStatus, setSupabaseConnectionStatus] = useState<SupabaseConnectionStatus>(() => {
    try {
      const wasConfigured = localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
      return wasConfigured ? 'session_expired' : 'unauthenticated';
    } catch {
      return 'unauthenticated';
    }
  });

  const isMountedRef = useRef(true);

  const readWasConfigured = (): boolean => {
    try {
      return typeof window !== 'undefined' && localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
    } catch {
      return false;
    }
  };

  const markConfigured = () => {
    try {
      if (typeof window !== 'undefined') {
        localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
      }
    } catch {
      // ignore storage errors
    }
  };

  const applySession = useCallback((session: SupabaseSession | null) => {
    if (!isMountedRef.current) return;
    if (session?.user && !isSessionExpired(session)) {
      setSupabaseUser(session.user);
      setSupabaseConnectionStatus('connected');
      markConfigured();
    } else {
      setSupabaseUser(null);
      setSupabaseConnectionStatus(readWasConfigured() ? 'session_expired' : 'unauthenticated');
    }
  }, []);

  const checkSessionStatus = useCallback(async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        if (isMountedRef.current) {
          setSupabaseUser(null);
          setSupabaseConnectionStatus(readWasConfigured() ? 'session_expired' : 'unauthenticated');
        }
        return;
      }

      if (session && isSessionExpired(session)) {
        const { data: refreshed, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !refreshed.session) {
          applySession(null);
          return;
        }
        applySession(refreshed.session);
        return;
      }

      applySession(session);
    } catch {
      if (isMountedRef.current) {
        setSupabaseUser(null);
        setSupabaseConnectionStatus(readWasConfigured() ? 'session_expired' : 'unauthenticated');
      }
    }
  }, [applySession]);

  useEffect(() => {
    isMountedRef.current = true;

    // Remove quaisquer credenciais legadas em texto simples armazenadas anteriormente no navegador
    scrubLegacyLocalAuthKeys();

    const timeoutTimer = setTimeout(() => {
      if (isMountedRef.current) {
        setIsSessionLoading(false);
      }
    }, 2500);

    const initialHasOAuthReturn = hasOAuthOrMagicLinkReturnInUrl();
    const initialHasSensitiveUrlParams = hasSensitiveAuthParamsInUrl();

    const dispatchOAuthPopupPayload = (session: SupabaseSession | null) => {
      if (
        typeof window === 'undefined' ||
        !initialHasOAuthReturn ||
        !session?.access_token ||
        !session?.refresh_token
      ) {
        return;
      }

      const payload = {
        type: 'SUPABASE_AUTH_SUCCESS',
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        userId: session.user.id,
        email: session.user.email
      };

      const targetOrigin = window.location.origin;

      if (window.opener && window.opener !== window) {
        try {
          window.opener.postMessage(payload, targetOrigin);
        } catch {
          // Origem distinta do opener; fallback via BroadcastChannel/sessão local
        }
      }

      try {
        if (broadcastChannel) {
          broadcastChannel.postMessage(payload);
        }
      } catch {
        // ignore
      }

      if (window.opener && window.opener !== window) {
        setTimeout(() => {
          try {
            window.close();
          } catch {
            // ignore
          }
        }, 1000);
      }
    };

    const handleAuthPayload = async (data: any) => {
      if (data?.type === 'SUPABASE_LOGOUT') {
        if (!isMountedRef.current) return;
        setSupabaseUser(null);
        setIsPasswordRecoveryMode(false);
        setSupabaseConnectionStatus('unauthenticated');
        try {
          sessionStorage.clear();
        } catch {
          // ignore
        }
        return;
      }

      if (data?.type === 'SUPABASE_AUTH_SUCCESS') {
        if (typeof data.access_token === 'string' && typeof data.refresh_token === 'string') {
          try {
            await supabase.auth.setSession({
              access_token: data.access_token,
              refresh_token: data.refresh_token
            });
          } catch {
            // Ignora token inválido; checkSessionStatus refletirá estado real
          }
        }
        await checkSessionStatus();
      }
    };

    const onWindowMessage = (e: MessageEvent) => {
      if (typeof window === 'undefined') return;
      if (!isTrustedMessageOrigin(e.origin, window.location.origin)) {
        return;
      }
      handleAuthPayload(e.data);
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === null || (e.key && (e.key.includes('auth-token') || e.key === SUPABASE_CONFIGURED_FLAG))) {
        checkSessionStatus();
      }
    };

    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('message', onWindowMessage);

      try {
        if ('BroadcastChannel' in window) {
          broadcastChannel = new BroadcastChannel('finance_supabase_oauth');
          broadcastChannel.onmessage = (e: MessageEvent) => {
            if (isTrustedMessageOrigin(e.origin || window.location.origin, window.location.origin)) {
              handleAuthPayload(e.data);
            }
          };
        }
      } catch {
        // BroadcastChannel indisponível
      }
    }

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) return;

      if (event === 'PASSWORD_RECOVERY') {
        if (session?.user) {
          setSupabaseUser(session.user);
          setSupabaseConnectionStatus('connected');
        }
        setIsPasswordRecoveryMode(true);
        setAuthUrlError(null);
        scrubSensitiveAuthParamsFromUrl();
        return;
      }

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user && !isSessionExpired(session)) {
          setSupabaseUser(session.user);
          setSupabaseConnectionStatus('connected');
          setAuthUrlError(null);
          markConfigured();
          if (event === 'SIGNED_IN' && hasSensitiveAuthParamsInUrl()) {
            dispatchOAuthPopupPayload(session);
            scrubSensitiveAuthParamsFromUrl();
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setSupabaseUser(null);
        setIsPasswordRecoveryMode(false);
        setSupabaseConnectionStatus(readWasConfigured() ? 'session_expired' : 'unauthenticated');
      } else if (event === 'USER_UPDATED') {
        if (session?.user) {
          setSupabaseUser(session.user);
        }
      }
    });

    supabase.auth
      .getSession()
      .then(async ({ data: { session }, error }) => {
        clearTimeout(timeoutTimer);
        if (!isMountedRef.current) return;

        let activeSession: SupabaseSession | null = null;
        if (error) {
          setSupabaseUser(null);
          setSupabaseConnectionStatus(readWasConfigured() ? 'session_expired' : 'unauthenticated');
          setIsSessionLoading(false);
          if (initialHasSensitiveUrlParams) {
            scrubSensitiveAuthParamsFromUrl();
          }
          return;
        }

        if (session && isSessionExpired(session)) {
          const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
          if (!refreshErr && refreshed.session) {
            activeSession = refreshed.session;
            applySession(refreshed.session);
          } else {
            applySession(null);
          }
        } else {
          activeSession = session;
          applySession(session);
        }

        if (activeSession) {
          dispatchOAuthPopupPayload(activeSession);
        }

        // Só remove parâmetros sensíveis da URL depois que o Supabase concluiu getSession() e notificações OAuth
        if (initialHasSensitiveUrlParams) {
          scrubSensitiveAuthParamsFromUrl();
        }

        setIsSessionLoading(false);
      })
      .catch(() => {
        clearTimeout(timeoutTimer);
        if (isMountedRef.current) {
          setSupabaseUser(null);
          setSupabaseConnectionStatus(readWasConfigured() ? 'session_expired' : 'unauthenticated');
          setIsSessionLoading(false);
        }
        if (initialHasSensitiveUrlParams) {
          scrubSensitiveAuthParamsFromUrl();
        }
      });

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutTimer);
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
        window.removeEventListener('message', onWindowMessage);
        if (broadcastChannel) {
          try {
            broadcastChannel.close();
          } catch {
            // ignore
          }
        }
      }
    };
  }, [applySession, checkSessionStatus]);

  const loginWithSupabase = async (email: string, pass: string): Promise<AuthResult> => {
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      return { success: false, message: 'Informe um endereço de e-mail válido.' };
    }
    if (!pass) {
      return { success: false, message: 'Informe sua senha.' };
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: pass
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      if (data.user && data.session) {
        setSupabaseUser(data.user);
        setSupabaseConnectionStatus('connected');
        setIsPasswordRecoveryMode(false);
        setAuthUrlError(null);
        markConfigured();
        return { success: true, userId: data.user.id };
      }

      return { success: false, message: 'Não foi possível iniciar a sessão. Verifique suas credenciais.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro de conexão ao autenticar.' };
    }
  };

  const signUpWithSupabase = async (
    email: string,
    pass: string,
    fullName?: string,
    extra?: { whatsapp?: string; requestedPlan?: 'monthly' | 'annual' }
  ): Promise<AuthResult> => {
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      return { success: false, message: 'Informe um endereço de e-mail válido para cadastro.' };
    }

    const strength = validatePasswordStrength(pass);
    if (!strength.valid) {
      return { success: false, message: strength.message };
    }

    try {
      const redirectOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const cleanName = fullName?.trim();
      const cleanWhatsapp = extra?.whatsapp?.trim();
      const safeRequestedPlan =
        extra?.requestedPlan === 'monthly' || extra?.requestedPlan === 'annual'
          ? extra.requestedPlan
          : undefined;

      const metaData: Record<string, string> = {};
      if (cleanName) metaData.full_name = cleanName;
      if (cleanWhatsapp) metaData.whatsapp = cleanWhatsapp;
      if (safeRequestedPlan) metaData.requested_plan = safeRequestedPlan;

      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password: pass,
        options: {
          emailRedirectTo: redirectOrigin,
          data: Object.keys(metaData).length > 0 ? metaData : undefined
        }
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      if (data.user) {
        if (data.session) {
          setSupabaseUser(data.user);
          setSupabaseConnectionStatus('connected');
          setIsPasswordRecoveryMode(false);
          markConfigured();
          return {
            success: true,
            userId: data.user.id,
            requiresEmailConfirmation: false,
            message: 'Conta criada e autenticada com sucesso!'
          };
        }

        // Confirmação por e-mail ativa no Supabase: não autentica ainda
        setSupabaseUser(null);
        setSupabaseConnectionStatus('unauthenticated');
        return {
          success: true,
          userId: undefined,
          requiresEmailConfirmation: true,
          message: 'Cadastro realizado! Enviamos um link de confirmação para o seu e-mail. Confirme antes de entrar.'
        };
      }

      return {
        success: true,
        requiresEmailConfirmation: true,
        message: 'Verifique sua caixa de entrada para confirmar o cadastro.'
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro inesperado ao criar conta.' };
    }
  };

  const loginWithGitHub = async (): Promise<{ success: boolean; message?: string; url?: string }> => {
    try {
      const redirectOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: redirectOrigin,
          scopes: 'read:user user:email',
          skipBrowserRedirect: true
        }
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      if (data?.url) {
        return { success: true, url: data.url };
      }

      return { success: true };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro ao iniciar login com GitHub.' };
    }
  };

  const signInWithOtp = async (email: string): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      return { success: false, message: 'Informe um endereço de e-mail válido.' };
    }

    try {
      const redirectOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: cleanEmail,
        options: {
          emailRedirectTo: redirectOrigin
        }
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      return {
        success: true,
        message: 'Link ou código de acesso enviado! Verifique sua caixa de entrada e spam.'
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro ao enviar código para o e-mail.' };
    }
  };

  const verifyOtp = async (email: string, token: string): Promise<AuthResult> => {
    const cleanEmail = email.trim();
    const cleanToken = token.trim();
    if (!isValidEmailFormat(cleanEmail) || !cleanToken) {
      return { success: false, message: 'Informe o e-mail e o código de verificação recebido.' };
    }

    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: cleanEmail,
        token: cleanToken,
        type: 'email'
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      if (data.user && data.session) {
        setSupabaseUser(data.user);
        setSupabaseConnectionStatus('connected');
        setIsPasswordRecoveryMode(false);
        setAuthUrlError(null);
        markConfigured();
        return { success: true, userId: data.user.id };
      }

      return { success: false, message: 'Código inválido ou expirado.' };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro ao validar código.' };
    }
  };

  const sendPasswordResetEmail = async (email: string): Promise<{ success: boolean; message?: string }> => {
    const cleanEmail = email.trim();
    if (!isValidEmailFormat(cleanEmail)) {
      return { success: false, message: 'Informe um endereço de e-mail válido para recuperar a senha.' };
    }

    try {
      const redirectOrigin = typeof window !== 'undefined' ? `${window.location.origin}/?type=recovery` : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo: redirectOrigin
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      return {
        success: true,
        message: 'Se o e-mail estiver cadastrado, enviaremos um link para você redefinir sua senha.'
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro ao solicitar redefinição de senha.' };
    }
  };

  const updatePassword = async (newPassword: string): Promise<{ success: boolean; message?: string }> => {
    const strength = validatePasswordStrength(newPassword);
    if (!strength.valid) {
      return { success: false, message: strength.message };
    }

    try {
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      if (data.user) {
        setSupabaseUser(data.user);
        setSupabaseConnectionStatus('connected');
      }
      setIsPasswordRecoveryMode(false);
      setAuthUrlError(null);
      scrubSensitiveAuthParamsFromUrl();

      return {
        success: true,
        message: 'Senha atualizada com sucesso!'
      };
    } catch (err: any) {
      return { success: false, message: err?.message || 'Erro ao atualizar a senha.' };
    }
  };

  const logoutFromSupabase = async (rawOptions?: LogoutCleanupOptions | unknown): Promise<void> => {
    const options: LogoutCleanupOptions | undefined =
      rawOptions &&
      typeof rawOptions === 'object' &&
      !('nativeEvent' in rawOptions) &&
      !('preventDefault' in rawOptions)
        ? (rawOptions as LogoutCleanupOptions)
        : undefined;

    const previousUserId = supabaseUser?.id ?? null;
    const previousUserEmail = options?.userEmailOverride ?? supabaseUser?.email ?? null;
    const preserveRecoveryBackups = options?.preserveRecoveryBackups ?? true;

    // Se há obrigação de preservar backups antes de limpar o cache ativo (ex.: logout fora do fluxo verificado),
    // garante cópia de segurança escopada para o UUID antes de remover finance_pro_app_state_<uuid>.
    if (previousUserId && preserveRecoveryBackups && !options?.skipActiveCacheBackupOnPreserve) {
      const activeCache = getUserStateFromStorage(previousUserId);
      if (
        activeCache &&
        !activeCache.isSampleLoaded &&
        (activeCache.transactions.length > 0 || activeCache.debts.length > 0 || activeCache.goals.length > 0)
      ) {
        saveRecoverySnapshotForUser(previousUserId, activeCache, 'pre_unverified_logout');
      }
    }

    // Reseta imediatamente o estado em memória para desmontar o FinanceProvider antes da chamada de rede
    setSupabaseUser(null);
    setIsPasswordRecoveryMode(false);
    setSupabaseConnectionStatus('unauthenticated');

    let signOutErrored = false;
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        signOutErrored = true;
      }
    } catch {
      signOutErrored = true;
    }

    if (signOutErrored) {
      try {
        await supabase.auth.signOut({ scope: 'local' });
      } catch {
        // Continua limpeza local mesmo se houver falha de rede ou ambiente offline
      }
    }

    scrubLegacyLocalAuthKeys();
    clearPendingRegistrationIntent(previousUserEmail);
    clearAllLocalDataForUser(previousUserId, {
      preserveRecoverySnapshot: preserveRecoveryBackups
    });

    if (previousUserId && !preserveRecoveryBackups) {
      try {
        await clearRecoveryHistoryForUser(
          previousUserId,
          options?.indexedDBFactory !== undefined
            ? { indexedDBFactory: options.indexedDBFactory }
            : undefined
        );
      } catch {
        // Falha controlada no IndexedDB não impede encerramento seguro da sessão
      }
    }

    try {
      if (typeof window !== 'undefined') {
        localStorage.removeItem(SUPABASE_CONFIGURED_FLAG);
        sessionStorage.clear();

        if ('BroadcastChannel' in window) {
          const ch = new BroadcastChannel('finance_supabase_oauth');
          ch.postMessage({ type: 'SUPABASE_LOGOUT', userId: previousUserId });
          ch.close();
        }
      }
    } catch {
      // ignore
    }
  };

  const cancelPasswordRecovery = async (): Promise<void> => {
    await logoutFromSupabase({ preserveRecoveryBackups: true });
  };

  const supabaseUserId = supabaseUser?.id ?? null;
  const supabaseUserEmail = supabaseUser?.email ?? null;
  const supabaseUserDisplayName = deriveUserDisplayName(supabaseUser);
  const isSupabaseAuthenticated = !!supabaseUserId && supabaseConnectionStatus === 'connected';

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: isSupabaseAuthenticated,
        isSessionLoading,
        isPasswordRecoveryMode,
        authUrlError,
        clearAuthUrlError,
        supabaseConnectionStatus,
        cloudAuthStatus: supabaseConnectionStatus,
        supabaseUser,
        supabaseUserId,
        supabaseUserEmail,
        supabaseUserDisplayName,
        isSupabaseAuthenticated,
        loginWithSupabase,
        signInWithSupabase: loginWithSupabase,
        signUpWithSupabase,
        loginWithGitHub,
        signInWithOtp,
        verifyOtp,
        sendPasswordResetEmail,
        updatePassword,
        cancelPasswordRecovery,
        logout: logoutFromSupabase,
        logoutFromSupabase,
        disconnectCloud: logoutFromSupabase,
        checkSessionStatus
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
