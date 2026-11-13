/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '../utils/supabase';
import type { User as SupabaseUser, Session as SupabaseSession } from '@supabase/supabase-js';

export type CloudAuthStatus = 'connected' | 'not_configured' | 'session_expired' | 'unauthenticated';
export type SupabaseConnectionStatus = CloudAuthStatus;

export interface AuthContextType {
  // Estado local (Senha/PIN do dispositivo)
  isAuthenticated: boolean;
  username: string;
  isSessionLoading: boolean;
  login: (user: string, pass: string, remember?: boolean) => { success: boolean; message?: string };
  logout: () => void;
  updateCredentials: (newUser: string, newPass: string) => { success: boolean; message: string };
  lastLoginDate: string | null;

  // Supabase Auth oficial (Nuvem com RLS)
  supabaseConnectionStatus: SupabaseConnectionStatus;
  cloudAuthStatus: CloudAuthStatus;
  supabaseUser: SupabaseUser | null;
  supabaseUserId: string | null;
  supabaseUserEmail: string | null;
  isSupabaseAuthenticated: boolean;
  loginWithSupabase: (email: string, pass: string) => Promise<{ success: boolean; message?: string; userId?: string }>;
  loginWithGitHub: () => Promise<{ success: boolean; message?: string; url?: string }>;
  signInWithOtp: (email: string) => Promise<{ success: boolean; message?: string }>;
  verifyOtp: (email: string, token: string) => Promise<{ success: boolean; message?: string; userId?: string }>;
  sendPasswordResetEmail: (email: string) => Promise<{ success: boolean; message?: string }>;
  signInWithSupabase: (email: string, pass: string) => Promise<{ success: boolean; message?: string; userId?: string }>;
  signUpWithSupabase: (email: string, pass: string) => Promise<{ success: boolean; message?: string; userId?: string }>;
  logoutFromSupabase: () => Promise<void>;
  disconnectCloud: () => Promise<void>;
  checkSessionStatus: () => Promise<void>;
}

const DEFAULT_USERNAME = 'lucasgomes';
const DEFAULT_PASSWORD = '6145';

const USERNAME_STORAGE_KEY = 'finance_auth_user';
const PASSWORD_STORAGE_KEY = 'finance_auth_password';
const SESSION_STORAGE_KEY = 'finance_auth_session';
const LAST_LOGIN_KEY = 'finance_auth_last_login';
export const SUPABASE_CONFIGURED_FLAG = 'finance_supabase_was_configured';

/**
 * Mapeamento amigável de erros de autenticação Supabase (senha e OAuth)
 */
export const mapAuthError = (error: any): string => {
  if (!error) return 'Erro inesperado de autenticação.';
  const code = (error.code || '').toString().toLowerCase();
  const msg = (error.message || '').toString().toLowerCase();

  if (code === 'invalid_credentials' || msg.includes('invalid login credentials')) {
    return 'E-mail ou senha incorretos.';
  }
  if (code === 'email_not_confirmed' || msg.includes('email not confirmed')) {
    return 'E-mail ainda não confirmado no Supabase. Confirme no painel Authentication > Users ou reenvie o e-mail de confirmação.';
  }
  if (code === 'too_many_requests' || msg.includes('too many requests')) {
    return 'Muitas tentativas. Aguarde alguns minutos.';
  }
  if (code === 'over_email_send_rate_limit' || msg.includes('rate limit')) {
    return 'Limite de envio de e-mails atingido temporariamente pelo Supabase. Aguarde alguns instantes ou entre via GitHub ou Senha.';
  }
  if (code === 'invalid_api_key' || msg.includes('api key') || msg.includes('invalid api key')) {
    return 'Chave de conexão pública do Supabase inválida. Restaurando chave padrão oficial.';
  }
  if (
    code === 'provider_not_enabled' ||
    code === 'provider_disabled' ||
    msg.includes('provider is not enabled') ||
    msg.includes('provider_not_enabled')
  ) {
    return 'Login com GitHub não está habilitado no projeto Supabase. Ative em Authentication > Providers > GitHub.';
  }
  if (
    code === 'access_denied' ||
    code === 'oauth_canceled' ||
    code === 'oauth' ||
    msg.includes('access_denied') ||
    msg.includes('canceled') ||
    msg.includes('cancelled')
  ) {
    return 'Login com GitHub cancelado ou negado.';
  }
  if (code === 'otp_expired' || msg.includes('otp has expired') || msg.includes('token has expired')) {
    return 'O código de acesso por e-mail expirou. Solicite um novo código.';
  }
  if (code === 'otp_disabled' || msg.includes('signups not allowed for otp')) {
    return 'Envio de código por e-mail desativado no momento.';
  }
  return error.message || 'Erro inesperado de autenticação.';
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Indica se a verificação inicial de sessão Supabase ainda está rodando
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);

  // Credenciais locais (PIN do dispositivo)
  const [storedUsername, setStoredUsername] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(USERNAME_STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
      localStorage.setItem(USERNAME_STORAGE_KEY, DEFAULT_USERNAME);
      return DEFAULT_USERNAME;
    } catch {
      return DEFAULT_USERNAME;
    }
  });

  const [storedPassword, setStoredPassword] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(PASSWORD_STORAGE_KEY);
      if (saved && saved.trim()) return saved.trim();
      localStorage.setItem(PASSWORD_STORAGE_KEY, DEFAULT_PASSWORD);
      return DEFAULT_PASSWORD;
    } catch {
      return DEFAULT_PASSWORD;
    }
  });

  // Estado de desbloqueio da tela local
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    try {
      const session = sessionStorage.getItem(SESSION_STORAGE_KEY);
      const localSession = localStorage.getItem(SESSION_STORAGE_KEY);
      return session === 'true' || localSession === 'true';
    } catch {
      return false;
    }
  });

  const [lastLoginDate, setLastLoginDate] = useState<string | null>(() => {
    try {
      return localStorage.getItem(LAST_LOGIN_KEY);
    } catch {
      return null;
    }
  });

  // Supabase Auth State (auth.users)
  const [supabaseUser, setSupabaseUser] = useState<SupabaseUser | null>(null);
  const [supabaseConnectionStatus, setSupabaseConnectionStatus] = useState<SupabaseConnectionStatus>(() => {
    try {
      const wasConfigured = localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
      return wasConfigured ? 'session_expired' : 'not_configured';
    } catch {
      return 'not_configured';
    }
  });
  const isMountedRef = useRef(true);

  const applySession = (session: SupabaseSession | null) => {
    if (!isMountedRef.current) return;
    if (session?.user) {
      setSupabaseUser(session.user);
      setSupabaseConnectionStatus('connected');
      try {
        localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
      } catch (e) {
        console.warn('Storage error saving configured flag:', e);
      }
    } else {
      setSupabaseUser(null);
      let wasConfigured = false;
      try {
        wasConfigured = localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
      } catch {
        wasConfigured = false;
      }
      setSupabaseConnectionStatus(wasConfigured ? 'session_expired' : 'not_configured');
    }
  };

  const checkSessionStatus = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        console.warn('Erro ao consultar sessão Supabase:', error.message);
        if (isMountedRef.current) {
          setSupabaseUser(null);
          const wasConfigured = typeof window !== 'undefined' && localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
          setSupabaseConnectionStatus(wasConfigured ? 'session_expired' : 'not_configured');
        }
        return;
      }
      applySession(session);
    } catch (err) {
      console.warn('Erro de rede ao verificar sessão Supabase:', err);
    }
  };

  // 1. Recupera a sessão Supabase com getSession() na montagem com fallback seguro de tempo limite
  useEffect(() => {
    isMountedRef.current = true;

    // Timeout de segurança (máximo 1.5s) para garantir que a UI nunca fique travada
    const timeoutTimer = setTimeout(() => {
      if (isMountedRef.current && isSessionLoading) {
        setIsSessionLoading(false);
      }
    }, 1500);

    supabase.auth.getSession().then(({ data: { session }, error }) => {
      clearTimeout(timeoutTimer);
      if (isMountedRef.current) {
        if (error) {
          console.warn('Aviso ao recuperar sessão inicial Supabase:', error.message);
          const wasConfigured = typeof window !== 'undefined' && localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
          setSupabaseConnectionStatus(wasConfigured ? 'session_expired' : 'not_configured');
        } else if (session?.user) {
          setSupabaseUser(session.user);
          setSupabaseConnectionStatus('connected');
          try {
            localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
          } catch (e) {
            console.warn('Storage error on setItem:', e);
          }
        } else {
          const wasConfigured = typeof window !== 'undefined' && localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
          setSupabaseConnectionStatus(wasConfigured ? 'session_expired' : 'not_configured');
        }
        setIsSessionLoading(false);
      }
    }).catch(err => {
      clearTimeout(timeoutTimer);
      console.warn('Falha na inicialização da sessão Supabase:', err);
      if (isMountedRef.current) {
        const wasConfigured = typeof window !== 'undefined' && localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
        setSupabaseConnectionStatus(wasConfigured ? 'session_expired' : 'not_configured');
        setIsSessionLoading(false);
      }
    });

    // 2. Escuta mudanças na autenticação em tempo real (TOKEN_REFRESHED, SIGNED_IN, SIGNED_OUT)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!isMountedRef.current) return;

      if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') {
        if (session?.user) {
          setSupabaseUser(session.user);
          setSupabaseConnectionStatus('connected');
          try {
            localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
          } catch (e) {
            console.warn('Storage error on setItem:', e);
          }
        }
      } else if (event === 'SIGNED_OUT') {
        setSupabaseUser(null);
        let wasConfigured = false;
        try {
          wasConfigured = localStorage.getItem(SUPABASE_CONFIGURED_FLAG) === 'true';
        } catch {
          wasConfigured = false;
        }
        setSupabaseConnectionStatus(wasConfigured ? 'session_expired' : 'not_configured');
      } else if (event === 'USER_UPDATED') {
        if (session?.user) {
          setSupabaseUser(session.user);
        }
      }
    });

    // 3. Ouvintes de eventos entre janelas e abas para sincronizar sessão OAuth (incluindo iframes particionados)
    const handleAuthMessage = async (data: any) => {
      if (data?.type === 'SUPABASE_AUTH_SUCCESS') {
        if (data.access_token && data.refresh_token) {
          try {
            await supabase.auth.setSession({
              access_token: data.access_token,
              refresh_token: data.refresh_token
            });
          } catch (err) {
            console.warn('Erro ao aplicar setSession recebida:', err);
          }
        }
        await checkSessionStatus();
      }
    };

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key && (e.key.includes('auth-token') || e.key === SUPABASE_CONFIGURED_FLAG)) {
        checkSessionStatus();
      }
    };

    let broadcastChannel: BroadcastChannel | null = null;
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', handleStorageChange);
      window.addEventListener('message', (e: MessageEvent) => handleAuthMessage(e.data));

      try {
        if ('BroadcastChannel' in window) {
          broadcastChannel = new BroadcastChannel('finance_supabase_oauth');
          broadcastChannel.onmessage = (e: MessageEvent) => handleAuthMessage(e.data);
        }
      } catch (err) {
        console.warn('BroadcastChannel não suportado neste navegador:', err);
      }
    }

    // Se esta janela foi aberta pelo retorno OAuth (hash com access_token ou query com code)
    if (typeof window !== 'undefined') {
      const hasOAuthReturn =
        window.location.hash.includes('access_token=') ||
        window.location.search.includes('code=');
      if (hasOAuthReturn) {
        // Aguarda a sessão ser inicializada pelo SDK do Supabase
        supabase.auth.getSession().then(({ data: { session } }) => {
          if (session?.access_token && session?.refresh_token) {
            const payload = {
              type: 'SUPABASE_AUTH_SUCCESS',
              access_token: session.access_token,
              refresh_token: session.refresh_token,
              userId: session.user.id,
              email: session.user.email
            };

            // Notifica window.opener (janela que abriu o popup)
            if (window.opener && window.opener !== window) {
              try {
                window.opener.postMessage(payload, '*');
              } catch (err) {
                console.warn('Não foi possível notificar window.opener:', err);
              }
            }

            // Notifica outras abas/iframes via BroadcastChannel
            try {
              if (broadcastChannel) {
                broadcastChannel.postMessage(payload);
              }
            } catch (err) {
              console.warn('Erro ao transmitir pelo BroadcastChannel:', err);
            }

            // Se for popup filho, fecha após notificar para uma experiência limpa
            if (window.opener && window.opener !== window) {
              setTimeout(() => {
                try {
                  window.close();
                } catch {
                  // Caso o navegador bloqueie o window.close()
                }
              }, 1000);
            }
          }
        });
      }
    }

    return () => {
      isMountedRef.current = false;
      clearTimeout(timeoutTimer);
      subscription.unsubscribe();
      if (typeof window !== 'undefined') {
        window.removeEventListener('storage', handleStorageChange);
        if (broadcastChannel) {
          try {
            broadcastChannel.close();
          } catch {
            // ignore
          }
        }
      }
    };
  }, []);

  // Login no Supabase Auth com mensagens de erro tratadas individualmente
  const loginWithSupabase = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; message?: string; userId?: string }> => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: pass.trim()
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      if (data.user && data.session) {
        setSupabaseUser(data.user);
        setSupabaseConnectionStatus('connected');
        try {
          localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
        } catch (e) {
          console.warn('Storage error on loginWithSupabase:', e);
        }
        return { success: true, userId: data.user.id };
      }

      return { success: false, message: 'Sessão não pôde ser iniciada. Verifique suas credenciais.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro inesperado ao autenticar com Supabase.' };
    }
  };

  // Login OAuth com GitHub no Supabase (compatível com iframe via skipBrowserRedirect)
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
      return { success: false, message: err.message || 'Erro ao iniciar login com GitHub.' };
    }
  };

  // Envia código OTP ou link mágico para o e-mail
  const signInWithOtp = async (email: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const redirectOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.signInWithOtp({
        email: email.trim(),
        options: {
          emailRedirectTo: redirectOrigin
        }
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      return {
        success: true,
        message: 'Código de acesso enviado! Verifique sua caixa de entrada e pasta de spam.'
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao enviar código para o e-mail.' };
    }
  };

  // Valida o código OTP de 6 dígitos recebido por e-mail
  const verifyOtp = async (
    email: string,
    token: string
  ): Promise<{ success: boolean; message?: string; userId?: string }> => {
    try {
      const { data, error } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: token.trim(),
        type: 'email'
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      if (data.user && data.session) {
        setSupabaseUser(data.user);
        setSupabaseConnectionStatus('connected');
        try {
          localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
        } catch (e) {
          console.warn('Storage error on verifyOtp:', e);
        }
        return { success: true, userId: data.user.id };
      }

      return { success: false, message: 'Código inválido ou expirado.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao validar código.' };
    }
  };

  // Envia e-mail de redefinição de senha para o usuário poder cadastrar uma senha no Supabase
  const sendPasswordResetEmail = async (email: string): Promise<{ success: boolean; message?: string }> => {
    try {
      const redirectOrigin = typeof window !== 'undefined' ? window.location.origin : undefined;
      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo: redirectOrigin
      });

      if (error) {
        return { success: false, message: mapAuthError(error) };
      }

      return {
        success: true,
        message: 'Link para cadastrar/redefinir senha enviado para seu e-mail!'
      };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao solicitar redefinição de senha.' };
    }
  };

  const signInWithSupabase = loginWithSupabase;

  // Cadastro no Supabase Auth
  // Se data.session for null (confirmação por e-mail ligada), NÃO marca como autenticado
  const signUpWithSupabase = async (
    email: string,
    pass: string
  ): Promise<{ success: boolean; message?: string; userId?: string }> => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password: pass.trim()
      });

      if (error) {
        let friendlyMessage = error.message;
        if (error.code === 'user_already_exists' || error.message.toLowerCase().includes('already registered')) {
          friendlyMessage = 'Este e-mail já está cadastrado. Faça login ou recupere a senha.';
        }
        return { success: false, message: friendlyMessage };
      }

      if (data.user) {
        if (data.session) {
          // Sessão imediata (confirmação de email desligada)
          setSupabaseUser(data.user);
          setSupabaseConnectionStatus('connected');
          try {
            localStorage.setItem(SUPABASE_CONFIGURED_FLAG, 'true');
          } catch (e) {
            console.warn('Storage error on signUp:', e);
          }
          return {
            success: true,
            userId: data.user.id,
            message: 'Conta criada e conectada com sucesso!'
          };
        } else {
          // Confirmação de e-mail obrigatória: NÃO autentica
          setSupabaseUser(null);
          return {
            success: true,
            userId: undefined,
            message: 'Verifique sua caixa de entrada para confirmar o e-mail antes de usar a nuvem.'
          };
        }
      }

      return { success: true, message: 'Verifique sua caixa de entrada para confirmar o e-mail antes de usar a nuvem.' };
    } catch (err: any) {
      return { success: false, message: err.message || 'Erro ao criar conta no Supabase.' };
    }
  };

  // Desconecta explicitamente a nuvem (botão nas configurações ou modal)
  const logoutFromSupabase = async (): Promise<void> => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Erro ao deslogar do Supabase', err);
    }
    try {
      localStorage.removeItem(SUPABASE_CONFIGURED_FLAG);
    } catch (err) {
      console.warn('Erro ao remover flag do Supabase:', err);
    }
    setSupabaseUser(null);
    setSupabaseConnectionStatus('not_configured');
  };

  const disconnectCloud = logoutFromSupabase;

  // Login por senha local (PIN do dispositivo) — NUNCA define supabaseUserId!
  const login = (inputUser: string, inputPass: string, remember = false): { success: boolean; message?: string } => {
    const cleanInputUser = inputUser.trim().toLowerCase();
    const cleanStoredUser = storedUsername.trim().toLowerCase();
    const cleanInputPass = inputPass.trim();
    const cleanStoredPass = storedPassword.trim();

    if (!cleanInputUser || !cleanInputPass) {
      return { success: false, message: 'Por favor, preencha o usuário e a senha.' };
    }

    if (cleanInputUser !== cleanStoredUser || cleanInputPass !== cleanStoredPass) {
      return {
        success: false,
        message: 'Credenciais incorretas. Apenas o proprietário autorizado tem permissão de acesso.'
      };
    }

    const nowISO = new Date().toISOString();
    try {
      sessionStorage.setItem(SESSION_STORAGE_KEY, 'true');
      if (remember) {
        localStorage.setItem(SESSION_STORAGE_KEY, 'true');
      } else {
        localStorage.removeItem(SESSION_STORAGE_KEY);
      }
      localStorage.setItem(LAST_LOGIN_KEY, nowISO);
    } catch (e) {
      console.warn('Storage error on login', e);
    }

    setLastLoginDate(nowISO);
    setIsAuthenticated(true);
    return { success: true };
  };

  // Bloqueio do aplicativo (volta para a tela de PIN local sem deslogar da nuvem)
  const logout = () => {
    try {
      sessionStorage.removeItem(SESSION_STORAGE_KEY);
      localStorage.removeItem(SESSION_STORAGE_KEY);
    } catch (e) {
      console.warn('Storage error on logout', e);
    }
    setIsAuthenticated(false);
  };

  const updateCredentials = (newUser: string, newPass: string): { success: boolean; message: string } => {
    const cleanUser = newUser.trim();
    const cleanPass = newPass.trim();

    if (!cleanUser) {
      return { success: false, message: 'O nome de usuário não pode ficar vazio.' };
    }
    if (!cleanPass || cleanPass.length < 4) {
      return { success: false, message: 'A senha deve conter no mínimo 4 caracteres ou dígitos.' };
    }

    try {
      localStorage.setItem(USERNAME_STORAGE_KEY, cleanUser);
      localStorage.setItem(PASSWORD_STORAGE_KEY, cleanPass);
      setStoredUsername(cleanUser);
      setStoredPassword(cleanPass);
      return { success: true, message: 'Credenciais de segurança atualizadas com sucesso!' };
    } catch (e) {
      return { success: false, message: 'Erro ao salvar credenciais no armazenamento local.' };
    }
  };

  // O UUID oficial é estritamente auth.users.id
  const supabaseUserId = supabaseUser?.id ?? null;
  const supabaseUserEmail = supabaseUser?.email ?? null;
  const isSupabaseAuthenticated = !!supabaseUserId && supabaseConnectionStatus === 'connected';

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated,
        username: storedUsername,
        isSessionLoading,
        login,
        logout,
        updateCredentials,
        lastLoginDate,
        supabaseConnectionStatus,
        cloudAuthStatus: supabaseConnectionStatus,
        supabaseUser,
        supabaseUserId,
        supabaseUserEmail,
        isSupabaseAuthenticated,
        loginWithSupabase,
        loginWithGitHub,
        signInWithOtp,
        verifyOtp,
        sendPasswordResetEmail,
        signInWithSupabase,
        signUpWithSupabase,
        logoutFromSupabase,
        disconnectCloud,
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
