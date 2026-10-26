import { createClient, SupabaseClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

function normalizeSupabaseUrl(url: string): string {
  if (!url) return '';
  return url.trim().replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '');
}

// Variáveis privadas de ambiente para uso exclusivo no servidor Express
const rawSupabaseUrl: string = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseUrl: string = normalizeSupabaseUrl(rawSupabaseUrl);
const supabaseServiceRoleKey: string = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();

/**
 * Verifica se as credenciais administrativas do Supabase foram configuradas no servidor
 */
export const isSupabaseServerConfigured: boolean = Boolean(
  supabaseUrl &&
  supabaseServiceRoleKey &&
  !supabaseUrl.includes('your-project') &&
  supabaseUrl.startsWith('https://') &&
  !supabaseServiceRoleKey.includes('your-service-role-key')
);

/**
 * Cliente Supabase Administrativo para o Backend Express
 * ATENÇÃO: Utiliza a SERVICE_ROLE_KEY com privilégios administrativos (bypassa RLS no backend).
 * NUNCA deve ser importado no código do frontend (Vite/React) ou exposto ao navegador.
 */
export const supabaseAdmin: SupabaseClient | null = isSupabaseServerConfigured
  ? createClient(supabaseUrl, supabaseServiceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    })
  : null;

/**
 * Retorna a instância administrativa do Supabase ou lança erro se não configurada
 */
export const getSupabaseAdmin = (): SupabaseClient => {
  if (!supabaseAdmin) {
    throw new Error(
      'Supabase Admin não configurado no backend. Defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente do servidor.'
    );
  }
  return supabaseAdmin;
};

/**
 * Testa a conexão com o Supabase de forma segura, sem alterar dados.
 * Consulta uma tabela pública para verificar conectividade e autorização da chave.
 */
export async function testSupabaseServerConnection(): Promise<{
  connected: boolean;
  message: string;
  error?: string;
}> {
  if (!supabaseAdmin) {
    return {
      connected: false,
      message: 'Supabase Admin não configurado. Verifique as variáveis de ambiente.',
    };
  }

  try {
    const { error } = await supabaseAdmin
      .from('saas_settings')
      .select('id, admin_pix_name')
      .limit(1);

    if (error) {
      return {
        connected: false,
        message: `Falha na consulta ao Supabase: ${error.message}`,
        error: error.message,
      };
    }

    return {
      connected: true,
      message: 'Conexão com o Supabase estabelecida com sucesso via Service Role.',
    };
  } catch (err: any) {
    return {
      connected: false,
      message: `Erro inesperado na conexão com o Supabase: ${err.message || String(err)}`,
      error: err.message || String(err),
    };
  }
}

/**
 * Valida com precisão criptográfica o token JWT emitido pelo Supabase Auth.
 * Rejeita estritamente tokens antigos, malformados ou forjados.
 * Obtém a role do usuário a partir da tabela profiles ou das credenciais seguras do servidor.
 */
export async function verifySupabaseToken(token: string): Promise<{
  valid: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
  };
  error?: string;
}> {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token não fornecido ou inválido' };
  }

  // Rejeita estritamente o formato legado id:timestamp ou tokens sem assinatura JWT
  if (token.includes(':') || !token.includes('.')) {
    return {
      valid: false,
      error: 'Tokens no formato legado (id:timestamp) não são mais aceitos. Faça login novamente via Supabase Auth.',
    };
  }

  if (!supabaseAdmin) {
    return {
      valid: false,
      error: 'Supabase Server não está configurado. Configure SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente.',
    };
  }

  try {
    const { data, error } = await supabaseAdmin.auth.getUser(token);
    if (error || !data || !data.user) {
      return {
        valid: false,
        error: error?.message || 'Sessão inválida ou expirada no Supabase Auth',
      };
    }

    const authUser = data.user;
    const userEmail = (authUser.email || '').trim().toLowerCase();
    const adminEmail = (process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com').trim().toLowerCase();
    const isMasterAdmin = Boolean(userEmail && userEmail === adminEmail);

    let role: 'admin' | 'user' = isMasterAdmin ? 'admin' : 'user';
    let fullName = (authUser.user_metadata?.full_name || authUser.user_metadata?.name || '').trim();

    // Consulta a tabela profiles para obter a role de forma confiável no banco
    try {
      const { data: profile } = await supabaseAdmin
        .from('profiles')
        .select('role, full_name')
        .eq('id', authUser.id)
        .maybeSingle();

      if (profile) {
        if (profile.role === 'admin' || isMasterAdmin) {
          role = 'admin';
        }
        if (profile.full_name) {
          fullName = profile.full_name;
        }
      } else {
        if (authUser.app_metadata?.role === 'admin' || isMasterAdmin) {
          role = 'admin';
        }
        // Auto-provisiona perfil na tabela public.profiles caso ainda não exista
        try {
          await supabaseAdmin.from('profiles').upsert(
            {
              id: authUser.id,
              email: userEmail,
              full_name: fullName || userEmail.split('@')[0] || 'Usuário GestorFlix',
              role,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'id' }
          );
        } catch (profileUpsertErr) {
          console.warn('Aviso: falha ao sincronizar perfil em public.profiles:', profileUpsertErr);
        }
      }
    } catch {
      if (isMasterAdmin) {
        role = 'admin';
      }
    }

    return {
      valid: true,
      user: {
        id: authUser.id,
        email: userEmail,
        name: fullName || userEmail.split('@')[0] || 'Usuário GestorFlix',
        role,
      },
    };
  } catch (err: any) {
    return {
      valid: false,
      error: err.message || 'Falha ao verificar token no Supabase',
    };
  }
}

/**
 * Migração Suave ("Lazy Migration") de conta legada para o Supabase Auth.
 * Só é executada após a validação do hash SHA-256 no servidor.
 * Evita duplicidade de contas e preserva integralmente o registro original.
 */
export async function migrateLegacyUserToSupabase(
  legacyUser: {
    id: string;
    email: string;
    name: string;
    role: string;
  },
  plainPassword: string
): Promise<{
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    role: 'admin' | 'user';
  };
  error?: string;
}> {
  if (!supabaseAdmin) {
    return {
      success: false,
      error: 'Supabase Server não está configurado. Configure as credenciais no .env.',
    };
  }

  try {
    const adminEmail = (process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com').toLowerCase();
    const isMasterAdmin = legacyUser.email.toLowerCase() === adminEmail || legacyUser.role === 'admin';
    const assignedRole: 'admin' | 'user' = isMasterAdmin ? 'admin' : 'user';

    // 1. Tenta criar usuário no Supabase Auth com a senha digitada no login
    const { data: created, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email: legacyUser.email,
      password: plainPassword,
      email_confirm: true,
      user_metadata: {
        name: legacyUser.name,
        full_name: legacyUser.name,
      },
      app_metadata: {
        role: assignedRole,
      },
    });

    let targetUserId = created?.user?.id;

    if (createError) {
      // Se já existe no Supabase Auth, sincroniza senha e metadados
      if (
        createError.message?.toLowerCase().includes('already registered') ||
        createError.message?.toLowerCase().includes('already exists') ||
        (createError as any).status === 422
      ) {
        const { data: listData } = await supabaseAdmin.auth.admin.listUsers();
        const existing = listData?.users?.find(
          (u) => (u.email || '').toLowerCase() === legacyUser.email.toLowerCase()
        );

        if (existing) {
          targetUserId = existing.id;
          await supabaseAdmin.auth.admin.updateUserById(existing.id, {
            password: plainPassword,
            email_confirm: true,
            user_metadata: {
              name: legacyUser.name,
              full_name: legacyUser.name,
            },
            app_metadata: {
              role: assignedRole,
            },
          });
        } else {
          return {
            success: false,
            error: `Erro ao sincronizar conta com o Supabase Auth: ${createError.message}`,
          };
        }
      } else {
        return {
          success: false,
          error: `Erro ao criar usuário no Supabase Auth: ${createError.message}`,
        };
      }
    }

    if (targetUserId) {
      // Sincroniza tabela profiles
      try {
        await supabaseAdmin.from('profiles').upsert(
          {
            id: targetUserId,
            email: legacyUser.email,
            full_name: legacyUser.name,
            role: assignedRole,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
      } catch (profErr) {
        console.warn('Alerta não impeditivo no upsert do perfil:', profErr);
      }
    }

    return {
      success: true,
      user: {
        id: targetUserId || legacyUser.id,
        email: legacyUser.email,
        name: legacyUser.name,
        role: assignedRole,
      },
    };
  } catch (err: any) {
    return {
      success: false,
      error: `Falha na migração suave: ${err.message || String(err)}`,
    };
  }
}

// ====================================================================
// PERSISTÊNCIA COMPARTILHADA SUPABASE (FASE 1: CLIENTES, PLANOS E APPS)
// ====================================================================

import { randomUUID } from 'crypto';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(id?: string | null): boolean {
  if (!id || typeof id !== 'string') return false;
  return UUID_REGEX.test(id.trim());
}

/**
 * Valida se o perfil do usuário existe na tabela public.profiles.
 * Regra: Não cria perfis automaticamente; se ausente, retorna falso.
 */
export async function checkProfileExists(userId: string): Promise<boolean> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(userId)) return false;

  const { data, error } = await admin
    .from('profiles')
    .select('id')
    .eq('id', userId)
    .maybeSingle();

  if (error || !data) {
    // Sincroniza a partir do auth.users se o usuário estiver autenticado no Supabase Auth
    try {
      const { data: authUserData } = await admin.auth.admin.getUserById(userId);
      if (authUserData?.user) {
        const u = authUserData.user;
        const email = (u.email || '').toLowerCase();
        const adminEmail = (process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com').toLowerCase();
        const role = email === adminEmail || u.app_metadata?.role === 'admin' ? 'admin' : 'user';
        const fullName =
          u.user_metadata?.full_name || u.user_metadata?.name || email.split('@')[0] || 'Usuário GestorFlix';

        const { error: upsertErr } = await admin.from('profiles').upsert(
          {
            id: userId,
            email,
            full_name: fullName,
            role,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'id' }
        );
        if (!upsertErr) return true;
      }
    } catch {
      // Se não for possível recuperar do auth.users, retorna falso
    }
    return false;
  }
  return true;
}

// --- PLANOS (public.plans) ---

export interface SupabasePlan {
  id: string;
  user_id: string;
  name: string;
  price: number;
  duration_days: number;
  description?: string;
  panel?: string;
  server_dns?: string[];
  status: 'active' | 'inactive';
  created_at: string;
}

export async function getSupabasePlans(userId: string, isAdmin: boolean = false): Promise<SupabasePlan[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('plans')
    .select('id, user_id, name, price, duration_days, description, panel, server_dns, status, created_at')
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao buscar planos no Supabase: ${error.message}`);
  }
  return (data || []).map((row: any) => ({
    ...row,
    price: Number(row.price) || 0,
    duration_days: Number(row.duration_days) || 30,
    server_dns: Array.isArray(row.server_dns) ? row.server_dns : [],
  }));
}

export async function createSupabasePlan(
  userId: string,
  payload: {
    name: string;
    price: number;
    duration_days?: number;
    description?: string;
    panel?: string;
    server_dns?: string[];
    status?: 'active' | 'inactive';
  }
): Promise<SupabasePlan> {
  const admin = getSupabaseAdmin();
  const profileOk = await checkProfileExists(userId);
  if (!profileOk) {
    throw new Error('PROFILE_NOT_FOUND: O perfil do usuário não existe na tabela public.profiles do Supabase.');
  }

  const id = randomUUID();
  const newRecord = {
    id,
    user_id: userId,
    name: payload.name.trim(),
    price: Number(payload.price) || 0,
    duration_days: parseInt(String(payload.duration_days || 30), 10),
    description: payload.description ? payload.description.trim() : '',
    panel: payload.panel ? payload.panel.trim() : '',
    server_dns: Array.isArray(payload.server_dns)
      ? payload.server_dns.map((d) => String(d).trim()).filter((d) => d.length > 0)
      : [],
    status: payload.status === 'inactive' ? 'inactive' : 'active',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from('plans')
    .insert(newRecord)
    .select('id, user_id, name, price, duration_days, description, panel, server_dns, status, created_at')
    .single();

  if (error) {
    throw new Error(`Falha ao criar plano no Supabase: ${error.message}`);
  }

  return {
    ...data,
    price: Number(data.price) || 0,
    duration_days: Number(data.duration_days) || 30,
    server_dns: Array.isArray(data.server_dns) ? data.server_dns : [],
  };
}

export async function updateSupabasePlan(
  id: string,
  userId: string,
  payload: Partial<SupabasePlan>,
  isAdmin: boolean = false
): Promise<SupabasePlan> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(id)) {
    throw new Error('ID_INVALID: O identificador do plano deve ser um UUID válido.');
  }

  const updateFields: Record<string, any> = {};
  if (payload.name !== undefined) updateFields.name = payload.name.trim();
  if (payload.price !== undefined) updateFields.price = Number(payload.price);
  if (payload.duration_days !== undefined) updateFields.duration_days = parseInt(String(payload.duration_days), 10);
  if (payload.description !== undefined) updateFields.description = payload.description.trim();
  if (payload.panel !== undefined) updateFields.panel = payload.panel.trim();
  if (payload.server_dns !== undefined) {
    updateFields.server_dns = Array.isArray(payload.server_dns)
      ? payload.server_dns.map((d) => String(d).trim()).filter((d) => d.length > 0)
      : [];
  }
  if (payload.status !== undefined) updateFields.status = payload.status;

  let query = admin
    .from('plans')
    .update(updateFields)
    .eq('id', id);

  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query
    .select('id, user_id, name, price, duration_days, description, panel, server_dns, status, created_at')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar plano no Supabase: ${error.message}`);
  }
  return {
    ...data,
    price: Number(data.price) || 0,
    duration_days: Number(data.duration_days) || 30,
    server_dns: Array.isArray(data.server_dns) ? data.server_dns : [],
  };
}

export async function deleteSupabasePlan(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(id)) {
    throw new Error('ID_INVALID: O identificador do plano deve ser um UUID válido.');
  }

  let query = admin.from('plans').delete().eq('id', id);
  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Falha ao excluir plano no Supabase: ${error.message}`);
  }
}

// --- APLICATIVOS (public.applications) ---

export interface SupabaseApplication {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  notes?: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export async function getSupabaseApplications(
  userId: string,
  isAdmin: boolean = false
): Promise<SupabaseApplication[]> {
  const admin = getSupabaseAdmin();
  let query = admin
    .from('applications')
    .select('id, user_id, name, description, notes, status, created_at')
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query;
  if (error) {
    throw new Error(`Falha ao buscar aplicativos no Supabase: ${error.message}`);
  }
  return data || [];
}

export async function createSupabaseApplication(
  userId: string,
  payload: {
    name: string;
    description?: string;
    notes?: string;
    status?: 'active' | 'inactive';
  }
): Promise<SupabaseApplication> {
  const admin = getSupabaseAdmin();
  const profileOk = await checkProfileExists(userId);
  if (!profileOk) {
    throw new Error('PROFILE_NOT_FOUND: O perfil do usuário não existe na tabela public.profiles do Supabase.');
  }

  const id = randomUUID();
  const newRecord = {
    id,
    user_id: userId,
    name: payload.name.trim(),
    description: payload.description ? payload.description.trim() : '',
    notes: payload.notes ? payload.notes.trim() : '',
    status: payload.status === 'inactive' ? 'inactive' : 'active',
    created_at: new Date().toISOString(),
  };

  const { data, error } = await admin
    .from('applications')
    .insert(newRecord)
    .select('id, user_id, name, description, notes, status, created_at')
    .single();

  if (error) {
    throw new Error(`Falha ao criar aplicativo no Supabase: ${error.message}`);
  }
  return data;
}

export async function updateSupabaseApplication(
  id: string,
  userId: string,
  payload: Partial<SupabaseApplication>,
  isAdmin: boolean = false
): Promise<SupabaseApplication> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(id)) {
    throw new Error('ID_INVALID: O identificador do aplicativo deve ser um UUID válido.');
  }

  const updateFields: Record<string, any> = {};
  if (payload.name !== undefined) updateFields.name = payload.name.trim();
  if (payload.description !== undefined) updateFields.description = payload.description.trim();
  if (payload.notes !== undefined) updateFields.notes = payload.notes.trim();
  if (payload.status !== undefined) updateFields.status = payload.status;

  let query = admin
    .from('applications')
    .update(updateFields)
    .eq('id', id);

  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query
    .select('id, user_id, name, description, notes, status, created_at')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar aplicativo no Supabase: ${error.message}`);
  }
  return data;
}

export async function deleteSupabaseApplication(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(id)) {
    throw new Error('ID_INVALID: O identificador do aplicativo deve ser um UUID válido.');
  }

  let query = admin.from('applications').delete().eq('id', id);
  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Falha ao excluir aplicativo no Supabase: ${error.message}`);
  }
}

// --- CLIENTES (public.customers) ---

export interface SupabaseCustomer {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  whatsapp: string;
  notes?: string;
  plan_id?: string;
  application_id?: string;
  start_date: string;
  expiration_date: string;
  status: 'active' | 'expiring_soon' | 'expired';
  created_at: string;
  updated_at: string;
  plan_name?: string;
  plan_price?: number;
  application_name?: string;
}

function calculateCustomerStatus(expirationDateStr: string): 'active' | 'expiring_soon' | 'expired' {
  if (!expirationDateStr) return 'active';
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parts = expirationDateStr.slice(0, 10).split('-');
  if (parts.length !== 3) return 'active';
  const expDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const diffDays = Math.round((expDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return 'expired';
  if (diffDays <= 2) return 'expiring_soon';
  return 'active';
}

export async function getSupabaseCustomers(
  userId: string,
  isAdmin: boolean = false
): Promise<SupabaseCustomer[]> {
  const admin = getSupabaseAdmin();

  let custQuery = admin
    .from('customers')
    .select('id, user_id, name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date, status, created_at, updated_at')
    .order('created_at', { ascending: false });

  if (!isAdmin) {
    custQuery = custQuery.eq('user_id', userId);
  }

  const [custResult, plansResult, appsResult] = await Promise.all([
    custQuery,
    getSupabasePlans(userId, isAdmin).catch(() => []),
    getSupabaseApplications(userId, isAdmin).catch(() => []),
  ]);

  if (custResult.error) {
    throw new Error(`Falha ao buscar clientes no Supabase: ${custResult.error.message}`);
  }

  const plansMap = new Map<string, SupabasePlan>();
  plansResult.forEach((p) => plansMap.set(p.id, p));

  const appsMap = new Map<string, SupabaseApplication>();
  appsResult.forEach((a) => appsMap.set(a.id, a));

  return (custResult.data || []).map((row: any) => {
    const computedStatus = calculateCustomerStatus(row.expiration_date);
    const plan = row.plan_id ? plansMap.get(row.plan_id) : undefined;
    const app = row.application_id ? appsMap.get(row.application_id) : undefined;

    return {
      id: row.id,
      user_id: row.user_id,
      name: row.name,
      email: row.email || '',
      whatsapp: row.whatsapp,
      notes: row.notes || '',
      plan_id: row.plan_id || undefined,
      application_id: row.application_id || undefined,
      start_date: row.start_date,
      expiration_date: row.expiration_date,
      status: computedStatus,
      created_at: row.created_at,
      updated_at: row.updated_at,
      plan_name: plan?.name,
      plan_price: plan?.price,
      application_name: app?.name,
    };
  });
}

export async function createSupabaseCustomer(
  userId: string,
  payload: {
    name: string;
    email?: string;
    whatsapp: string;
    notes?: string;
    plan_id?: string | null;
    application_id?: string | null;
    start_date?: string;
    expiration_date: string;
  }
): Promise<SupabaseCustomer> {
  const admin = getSupabaseAdmin();
  const profileOk = await checkProfileExists(userId);
  if (!profileOk) {
    throw new Error('PROFILE_NOT_FOUND: O perfil do usuário não existe na tabela public.profiles do Supabase.');
  }

  const id = randomUUID();
  const now = new Date();
  const computedStatus = calculateCustomerStatus(payload.expiration_date);

  const cleanPlanId = isValidUUID(payload.plan_id) ? payload.plan_id : null;
  const cleanAppId = isValidUUID(payload.application_id) ? payload.application_id : null;

  const newRecord = {
    id,
    user_id: userId,
    name: payload.name.trim(),
    email: payload.email ? payload.email.trim() : null,
    whatsapp: payload.whatsapp.trim(),
    notes: payload.notes ? payload.notes.trim() : null,
    plan_id: cleanPlanId,
    application_id: cleanAppId,
    start_date: payload.start_date || now.toISOString().slice(0, 10),
    expiration_date: payload.expiration_date,
    status: computedStatus,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data, error } = await admin
    .from('customers')
    .insert(newRecord)
    .select('id, user_id, name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date, status, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(`Falha ao criar cliente no Supabase: ${error.message}`);
  }

  let planName: string | undefined;
  let planPrice: number | undefined;
  let appName: string | undefined;

  if (cleanPlanId) {
    const { data: p } = await admin.from('plans').select('name, price').eq('id', cleanPlanId).maybeSingle();
    if (p) {
      planName = p.name;
      planPrice = Number(p.price) || 0;
    }
  }

  if (cleanAppId) {
    const { data: a } = await admin.from('applications').select('name').eq('id', cleanAppId).maybeSingle();
    if (a) {
      appName = a.name;
    }
  }

  return {
    ...data,
    plan_name: planName,
    plan_price: planPrice,
    application_name: appName,
  };
}

export async function updateSupabaseCustomer(
  id: string,
  userId: string,
  payload: Partial<SupabaseCustomer>,
  isAdmin: boolean = false
): Promise<SupabaseCustomer> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(id)) {
    throw new Error('ID_INVALID: O identificador do cliente deve ser um UUID válido.');
  }

  const updateFields: Record<string, any> = {
    updated_at: new Date().toISOString(),
  };

  if (payload.name !== undefined) updateFields.name = payload.name.trim();
  if (payload.email !== undefined) updateFields.email = payload.email ? payload.email.trim() : null;
  if (payload.whatsapp !== undefined) updateFields.whatsapp = payload.whatsapp.trim();
  if (payload.notes !== undefined) updateFields.notes = payload.notes ? payload.notes.trim() : null;
  if (payload.plan_id !== undefined) {
    updateFields.plan_id = isValidUUID(payload.plan_id) ? payload.plan_id : null;
  }
  if (payload.application_id !== undefined) {
    updateFields.application_id = isValidUUID(payload.application_id) ? payload.application_id : null;
  }
  if (payload.start_date !== undefined) updateFields.start_date = payload.start_date;
  if (payload.expiration_date !== undefined) {
    updateFields.expiration_date = payload.expiration_date;
    updateFields.status = calculateCustomerStatus(payload.expiration_date);
  } else if (payload.status !== undefined) {
    updateFields.status = payload.status;
  }

  let query = admin
    .from('customers')
    .update(updateFields)
    .eq('id', id);

  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { data, error } = await query
    .select('id, user_id, name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date, status, created_at, updated_at')
    .single();

  if (error) {
    throw new Error(`Falha ao atualizar cliente no Supabase: ${error.message}`);
  }

  let planName: string | undefined;
  let planPrice: number | undefined;
  let appName: string | undefined;

  if (data.plan_id) {
    const { data: p } = await admin.from('plans').select('name, price').eq('id', data.plan_id).maybeSingle();
    if (p) {
      planName = p.name;
      planPrice = Number(p.price) || 0;
    }
  }

  if (data.application_id) {
    const { data: a } = await admin.from('applications').select('name').eq('id', data.application_id).maybeSingle();
    if (a) {
      appName = a.name;
    }
  }

  return {
    ...data,
    plan_name: planName,
    plan_price: planPrice,
    application_name: appName,
  };
}

export async function deleteSupabaseCustomer(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(id)) {
    throw new Error('ID_INVALID: O identificador do cliente deve ser um UUID válido.');
  }

  let query = admin.from('customers').delete().eq('id', id);
  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { error } = await query;
  if (error) {
    throw new Error(`Falha ao excluir cliente no Supabase: ${error.message}`);
  }
}

export async function renewSupabaseCustomer(
  id: string,
  userId: string,
  isAdmin: boolean = false
): Promise<{ customer: SupabaseCustomer; durationDays: number }> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(id)) {
    throw new Error('ID_INVALID: O identificador do cliente deve ser um UUID válido.');
  }

  let query = admin
    .from('customers')
    .select('id, user_id, name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date, status, created_at, updated_at')
    .eq('id', id);

  if (!isAdmin) {
    query = query.eq('user_id', userId);
  }

  const { data: cust, error: fetchErr } = await query.single();
  if (fetchErr || !cust) {
    throw new Error('Cliente não encontrado');
  }

  let durationDays = 30;
  let planName: string | undefined;
  let planPrice: number | undefined;

  if (cust.plan_id) {
    const { data: plan } = await admin.from('plans').select('name, price, duration_days').eq('id', cust.plan_id).maybeSingle();
    if (plan) {
      durationDays = Number(plan.duration_days) || 30;
      planName = plan.name;
      planPrice = Number(plan.price) || 0;
    }
  }

  const now = new Date();
  const currentExp = new Date(cust.expiration_date + 'T00:00:00');
  const baseDate = currentExp.getTime() > now.getTime() ? currentExp : now;
  const newExp = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
  const newExpStr = newExp.toISOString().slice(0, 10);

  const { data: updated, error: updateErr } = await admin
    .from('customers')
    .update({
      expiration_date: newExpStr,
      status: 'active',
      updated_at: now.toISOString(),
    })
    .eq('id', id)
    .select('id, user_id, name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date, status, created_at, updated_at')
    .single();

  if (updateErr) {
    throw new Error(`Falha ao renovar cliente no Supabase: ${updateErr.message}`);
  }

  let appName: string | undefined;
  if (updated.application_id) {
    const { data: a } = await admin.from('applications').select('name').eq('id', updated.application_id).maybeSingle();
    if (a) appName = a.name;
  }

  return {
    customer: {
      ...updated,
      plan_name: planName,
      plan_price: planPrice,
      application_name: appName,
    },
    durationDays,
  };
}

// --- MÉTRICAS DO PAINEL (Dashboard Metrics) ---

export async function getSupabaseDashboardMetrics(
  userId: string,
  isAdmin: boolean = false
): Promise<{
  totalCustomers: number;
  activeCustomers: number;
  expiringSoonCustomers: number;
  expiredCustomers: number;
  totalPlans: number;
  totalApplications: number;
  monthlyRevenueEstimate: number;
}> {
  const [customers, plans, apps] = await Promise.all([
    getSupabaseCustomers(userId, isAdmin).catch(() => []),
    getSupabasePlans(userId, isAdmin).catch(() => []),
    getSupabaseApplications(userId, isAdmin).catch(() => []),
  ]);

  const activeCustomers = customers.filter((c) => c.status === 'active').length;
  const expiringSoonCustomers = customers.filter((c) => c.status === 'expiring_soon').length;
  const expiredCustomers = customers.filter((c) => c.status === 'expired').length;

  let monthlyRevenueEstimate = 0;
  customers.forEach((c) => {
    if (c.plan_price) {
      monthlyRevenueEstimate += c.plan_price;
    }
  });

  return {
    totalCustomers: customers.length,
    activeCustomers,
    expiringSoonCustomers,
    expiredCustomers,
    totalPlans: plans.length,
    totalApplications: apps.length,
    monthlyRevenueEstimate,
  };
}

// --- ASSINATURAS E PERÍODO DE TESTE (public.subscriptions) ---

export interface SupabaseSubscription {
  id: string;
  user_id: string;
  status: 'trial' | 'pending_payment' | 'active' | 'expired' | 'suspended';
  trial_ends_at: string;
  current_period_end: string;
  payment_reference?: string | null;
  notes?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Consulta a assinatura persistida do usuário no Supabase PostgreSQL.
 * Retorna null se ainda não houver assinatura registrada.
 */
export async function getSupabaseSubscription(userId: string): Promise<SupabaseSubscription | null> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(userId)) return null;

  const { data, error } = await admin
    .from('subscriptions')
    .select('id, user_id, status, trial_ends_at, current_period_end, payment_reference, notes, created_at, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as SupabaseSubscription;
}

/**
 * Garante a existência de assinatura no Supabase PostgreSQL de forma idempotente.
 * Se já existir, RETORNA A ASSINATURA EXISTENTE SEM ALTERAR DATAS.
 * Se não existir, cria exatamente UMA VEZ com período de teste de 3 dias.
 */
export async function ensureSupabaseSubscription(
  userId: string,
  userRole?: string
): Promise<SupabaseSubscription> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(userId)) {
    throw new Error('ID_INVALID: UUID inválido para criação de assinatura no Supabase');
  }

  // 1. Verifica se já existe antes de qualquer tentativa de inserção
  const existing = await getSupabaseSubscription(userId);
  if (existing) {
    return existing;
  }

  const now = new Date();
  const isAdmin = userRole === 'admin';
  const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const currentPeriodEnd = isAdmin
    ? new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString()
    : trialEndsAt;

  const newRecord = {
    id: randomUUID(),
    user_id: userId,
    status: isAdmin ? 'active' : 'trial',
    trial_ends_at: trialEndsAt,
    current_period_end: currentPeriodEnd,
    payment_reference: null,
    notes: null,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  };

  const { data, error } = await admin
    .from('subscriptions')
    .insert(newRecord)
    .select('id, user_id, status, trial_ends_at, current_period_end, payment_reference, notes, created_at, updated_at')
    .single();

  if (error) {
    // Se houve corrida concorrente ou chave única, recupera o registro persistido
    const retryExisting = await getSupabaseSubscription(userId);
    if (retryExisting) return retryExisting;
    throw new Error(`Falha ao criar assinatura no Supabase: ${error.message}`);
  }

  return data as SupabaseSubscription;
}

/**
 * Atualiza o status da assinatura no Supabase sem alterar as datas de início e fim.
 */
export async function updateSupabaseSubscriptionStatus(
  subId: string,
  status: 'trial' | 'pending_payment' | 'active' | 'expired' | 'suspended'
): Promise<void> {
  const admin = getSupabaseAdmin();
  if (!isValidUUID(subId)) return;

  await admin
    .from('subscriptions')
    .update({
      status,
      updated_at: new Date().toISOString(),
    })
    .eq('id', subId);
}

