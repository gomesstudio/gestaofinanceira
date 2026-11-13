/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Default Supabase project credentials provided for this application
export const DEFAULT_SUPABASE_URL = 'https://lwkecyfhpkyuakbbxksl.supabase.co';
export const DEFAULT_SUPABASE_KEY = 'sb_publishable_WJFITYIkMpYJAiPErF4iWA_lzK9QdMI';

/**
 * Valida e sanitiza a URL do Supabase para garantir protocolo HTTP ou HTTPS válido
 */
export function resolveValidUrl(rawUrl?: unknown): string {
  if (typeof rawUrl !== 'string') return DEFAULT_SUPABASE_URL;
  const cleaned = rawUrl.trim().replace(/^["']|["']$/g, '');
  if (!cleaned || cleaned === 'undefined' || cleaned === 'null' || !cleaned.startsWith('http')) {
    return DEFAULT_SUPABASE_URL;
  }
  try {
    const parsed = new URL(cleaned);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return cleaned;
    }
    return DEFAULT_SUPABASE_URL;
  } catch {
    return DEFAULT_SUPABASE_URL;
  }
}

/**
 * Valida e sanitiza a chave anônima/publicável do Supabase
 * Garante que a chave possua formato válido (sb_publishable_... ou JWT eyJ...)
 * Rejeita explicitamente valores corrompidos (como o PIN '6145' ou strings curtas)
 */
export function resolveValidKey(rawKey?: unknown): string {
  if (typeof rawKey !== 'string') return DEFAULT_SUPABASE_KEY;
  const cleaned = rawKey.trim().replace(/^["']|["']$/g, '');
  if (
    !cleaned ||
    cleaned === 'undefined' ||
    cleaned === 'null' ||
    cleaned === '6145' ||
    cleaned.length < 20 ||
    (!cleaned.startsWith('sb_publishable_') && !cleaned.startsWith('eyJ'))
  ) {
    return DEFAULT_SUPABASE_KEY;
  }
  return cleaned;
}

const safeUrl = resolveValidUrl(import.meta.env?.VITE_SUPABASE_URL);
const safeKey = resolveValidKey(import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY);

function initSupabaseClient(): SupabaseClient {
  try {
    return createClient(safeUrl, safeKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    console.error('Falha ao inicializar Supabase com credenciais fornecidas, aplicando fallback padrão:', err);
    return createClient(DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  }
}

export const supabase = initSupabaseClient();
export const SUPABASE_PROJECT_URL = safeUrl;
