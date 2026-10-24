import { createClient, SupabaseClient } from '@supabase/supabase-js';

function normalizeSupabaseUrl(url: string): string {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

// Variáveis públicas de ambiente para o frontend (iniciadas com VITE_)
const rawSupabaseUrl: string = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseUrl: string = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseAnonKey: string = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

/**
 * Verifica se as credenciais públicas do Supabase foram preenchidas no ambiente do frontend
 */
export const isSupabaseConfigured: boolean = Boolean(
  supabaseUrl &&
  supabaseAnonKey &&
  !supabaseUrl.includes('your-project') &&
  supabaseUrl.startsWith('https://') &&
  !supabaseAnonKey.includes('your-anon-key')
);

/**
 * Cliente Supabase para uso no Frontend / Navegador
 * Utiliza exclusivamente a chave anônima pública (ANON_KEY).
 * Sujeito a todas as regras de segurança RLS (Row Level Security).
 */
export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'gestorflix-auth-token',
      },
    })
  : null;

/**
 * Retorna a instância do cliente Supabase ou lança erro explicativo se não configurado
 */
export const getSupabaseClient = (): SupabaseClient => {
  if (!supabase) {
    throw new Error(
      'Supabase não configurado no frontend. Defina VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo de ambiente.'
    );
  }
  return supabase;
};
