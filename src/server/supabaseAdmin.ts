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
      } else if (authUser.app_metadata?.role === 'admin' || isMasterAdmin) {
        role = 'admin';
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
