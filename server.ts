import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  isSupabaseServerConfigured,
  testSupabaseServerConnection,
  verifySupabaseToken,
  migrateLegacyUserToSupabase,
  supabaseAdmin,
} from './src/server/supabaseAdmin';

dotenv.config();

const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');
const EVOLUTION_CONFIG_FILE = path.join(DATA_DIR, 'evolution-config.json');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Memory database types
interface DBData {
  users: Array<{
    id: string;
    email: string;
    name: string;
    passwordHash: string;
    role: 'admin' | 'user';
    created_at: string;
  }>;
  subscriptions: Array<{
    id: string;
    user_id: string;
    status: 'trial' | 'pending_payment' | 'active' | 'expired' | 'suspended';
    trial_ends_at: string;
    current_period_end: string;
    payment_reference?: string;
    notes?: string;
    created_at: string;
    updated_at: string;
  }>;
  plans: Array<{
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
  }>;
  applications: Array<{
    id: string;
    user_id: string;
    name: string;
    description?: string;
    notes?: string;
    status: 'active' | 'inactive';
    created_at: string;
  }>;
  customers: Array<{
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
  }>;
  whatsapp_settings: Array<{
    id: string;
    user_id: string;
    api_url: string;
    instance_name: string;
    api_key: string;
    is_connected: boolean;
    auto_billing_enabled: boolean;
    last_checked_at?: string;
    created_at: string;
    updated_at: string;
  }>;
  billing_settings: Array<{
    id: string;
    user_id: string;
    timezone: string;
    send_day_before: boolean;
    time_day_before: string;
    send_day_of_morning: boolean;
    time_day_of_morning: string;
    send_day_of_night: boolean;
    time_day_of_night: string;
    send_day_after: boolean;
    time_day_after: string;
  }>;
  message_templates: Array<{
    id: string;
    user_id: string;
    type: 'day_before' | 'day_of' | 'day_after';
    title: string;
    template_text: string;
    updated_at: string;
  }>;
  message_logs: Array<{
    id: string;
    user_id: string;
    customer_id: string;
    customer_name: string;
    whatsapp: string;
    message_type: 'day_before' | 'day_of_morning' | 'day_of_night' | 'day_after' | 'manual';
    cycle_date: string;
    scheduled_for: string;
    attempted_at: string;
    status: 'pending' | 'sent' | 'failed' | 'cancelled';
    response_payload?: string;
    error_details?: string;
    idempotency_key: string;
    created_at: string;
  }>;
  saas_settings: {
    admin_pix_key: string;
    admin_pix_name: string;
    saas_monthly_price: number;
    instructions: string;
  };
}

function hashPassword(password: string): string {
  return crypto.createHash('sha256').update(password).digest('hex');
}

function getInitialDB(): DBData {
  const adminEmail = process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com';
  const adminId = 'admin-default-id';
  const demoUserId = 'demo-user-id';
  const now = new Date();
  const threeDaysAhead = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
  const oneYearAhead = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000).toISOString();

  // Create sample dates
  const todayStr = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const inTenDays = new Date(now.getTime() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

  return {
    users: [
      {
        id: adminId,
        email: adminEmail,
        name: 'Administrador Gestor IPTV',
        passwordHash: hashPassword('admin123'),
        role: 'admin',
        created_at: now.toISOString(),
      },
      {
        id: demoUserId,
        email: 'revendedor@demo.com',
        name: 'Carlos Revendedor IPTV',
        passwordHash: hashPassword('demo123'),
        role: 'user',
        created_at: now.toISOString(),
      },
    ],
    subscriptions: [
      {
        id: 'sub-admin',
        user_id: adminId,
        status: 'active',
        trial_ends_at: oneYearAhead,
        current_period_end: oneYearAhead,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        id: 'sub-demo',
        user_id: demoUserId,
        status: 'trial',
        trial_ends_at: threeDaysAhead,
        current_period_end: threeDaysAhead,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    ],
    plans: [
      {
        id: 'plan-1',
        user_id: demoUserId,
        name: 'Plano Básico IPTV',
        price: 30.0,
        duration_days: 30,
        description: '1 tela FHD + Canais e Filmes',
        status: 'active',
        created_at: now.toISOString(),
      },
      {
        id: 'plan-2',
        user_id: demoUserId,
        name: 'Plano Família 2 Telas',
        price: 45.0,
        duration_days: 30,
        description: '2 telas simultâneas 4K + Filmes e Séries atualizadas',
        status: 'active',
        created_at: now.toISOString(),
      },
      {
        id: 'plan-3',
        user_id: demoUserId,
        name: 'Plano Trimestral Promo',
        price: 80.0,
        duration_days: 90,
        description: '3 meses com desconto especial',
        status: 'active',
        created_at: now.toISOString(),
      },
    ],
    applications: [
      {
        id: 'app-1',
        user_id: demoUserId,
        name: 'IBO Player Pro',
        description: 'Aplicativo rápido e intuitivo para Smart TVs LG e Samsung',
        notes: 'Código MAC e Device Key necessários',
        status: 'active',
        created_at: now.toISOString(),
      },
      {
        id: 'app-2',
        user_id: demoUserId,
        name: 'Bob Player',
        description: 'Excelente para TV Box e Android TV',
        notes: '',
        status: 'active',
        created_at: now.toISOString(),
      },
      {
        id: 'app-3',
        user_id: demoUserId,
        name: 'XCIPTV Player',
        description: 'Player clássico para smartphone e tablets Android',
        notes: '',
        status: 'active',
        created_at: now.toISOString(),
      },
    ],
    customers: [
      {
        id: 'cust-1',
        user_id: demoUserId,
        name: 'Marcos Silva',
        email: 'marcos@email.com',
        whatsapp: '5511987654321',
        notes: 'TV Samsung sala',
        plan_id: 'plan-1',
        application_id: 'app-1',
        start_date: yesterday,
        expiration_date: tomorrow, // vence amanhã (próximo do vencimento)
        status: 'expiring_soon',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        id: 'cust-2',
        user_id: demoUserId,
        name: 'Fernanda Souza',
        email: 'fernanda@email.com',
        whatsapp: '5521998877665',
        notes: 'Plano Família',
        plan_id: 'plan-2',
        application_id: 'app-2',
        start_date: '2026-09-23',
        expiration_date: todayStr, // vence hoje
        status: 'expiring_soon',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        id: 'cust-3',
        user_id: demoUserId,
        name: 'Lucas Pereira',
        email: '',
        whatsapp: '5531988884433',
        notes: 'Venceu ontem',
        plan_id: 'plan-1',
        application_id: 'app-1',
        start_date: '2026-09-22',
        expiration_date: yesterday, // vencido
        status: 'expired',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        id: 'cust-4',
        user_id: demoUserId,
        name: 'Juliana Costa',
        email: 'ju.costa@email.com',
        whatsapp: '5541977771234',
        notes: 'Cliente fiel',
        plan_id: 'plan-3',
        application_id: 'app-3',
        start_date: todayStr,
        expiration_date: inTenDays, // ativo regular
        status: 'active',
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    ],
    whatsapp_settings: [
      {
        id: 'ws-demo',
        user_id: demoUserId,
        api_url: '',
        instance_name: '',
        api_key: '',
        is_connected: false,
        auto_billing_enabled: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
      {
        id: 'ws-admin',
        user_id: adminId,
        api_url: '',
        instance_name: '',
        api_key: '',
        is_connected: false,
        auto_billing_enabled: false,
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      },
    ],
    billing_settings: [
      {
        id: 'bs-demo',
        user_id: demoUserId,
        timezone: 'America/Sao_Paulo',
        send_day_before: true,
        time_day_before: '09:00',
        send_day_of_morning: true,
        time_day_of_morning: '09:00',
        send_day_of_night: true,
        time_day_of_night: '19:00',
        send_day_after: true,
        time_day_after: '10:00',
      },
      {
        id: 'bs-admin',
        user_id: adminId,
        timezone: 'America/Sao_Paulo',
        send_day_before: true,
        time_day_before: '09:00',
        send_day_of_morning: true,
        time_day_of_morning: '09:00',
        send_day_of_night: true,
        time_day_of_night: '19:00',
        send_day_after: true,
        time_day_after: '10:00',
      },
    ],
    message_templates: [
      {
        id: 'tpl-1-demo',
        user_id: demoUserId,
        type: 'day_before',
        title: 'Lembrete de Vencimento (1 dia antes)',
        template_text: 'Olá, {nome}! Tudo bem? 😊 Passando para lembrar que seu plano {plano} vence amanhã, dia {vencimento}. Valor: {valor}. Qualquer dúvida, estou à disposição!',
        updated_at: now.toISOString(),
      },
      {
        id: 'tpl-2-demo',
        user_id: demoUserId,
        type: 'day_of',
        title: 'Lembrete no Dia do Vencimento',
        template_text: 'Olá, {nome}! 😊 Hoje é o vencimento do seu plano {plano}. O valor é {valor}. Entre em contato para regularizar e continuar utilizando seu serviço normalmente.',
        updated_at: now.toISOString(),
      },
      {
        id: 'tpl-3-demo',
        user_id: demoUserId,
        type: 'day_after',
        title: 'Aviso de Vencimento Atrasado (1 dia depois)',
        template_text: 'Olá, {nome}! Identificamos que o vencimento do seu plano {plano} foi ontem, dia {vencimento}. Caso já tenha realizado o pagamento, por favor, desconsidere esta mensagem. Se precisar de ajuda, estamos à disposição.',
        updated_at: now.toISOString(),
      },
    ],
    message_logs: [],
    saas_settings: {
      admin_pix_key: adminEmail,
      admin_pix_name: 'Administração Gestor IPTV',
      saas_monthly_price: 99.9,
      instructions: 'Após realizar o pagamento via PIX no valor de R$ 99,90 (valor único vitalício, sem mensalidade), envie o comprovante para ativação imediata da sua conta.',
    },
  };
}

let db: DBData;

function loadDB(): DBData {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      return JSON.parse(content);
    }
  } catch (err) {
    console.error('Failed to load DB file, initializing default:', err);
  }
  const initial = getInitialDB();
  saveDB(initial);
  return initial;
}

function saveDB(data: DBData) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save DB file:', err);
  }
}

db = loadDB();

// ====================================================================
// CENTRAL EVOLUTION API CONFIGURATION (Admin Global Scope)
// ====================================================================
interface EvolutionGlobalConfig {
  api_url: string;
  api_key: string;
  updated_at?: string;
  updated_by?: string;
}

function loadEvolutionGlobalConfig(): EvolutionGlobalConfig {
  try {
    if (fs.existsSync(EVOLUTION_CONFIG_FILE)) {
      const content = fs.readFileSync(EVOLUTION_CONFIG_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed === 'object') {
        return {
          api_url: (parsed.api_url || process.env.EVOLUTION_API_URL || '').trim(),
          api_key: (parsed.api_key || process.env.EVOLUTION_API_KEY || '').trim(),
          updated_at: parsed.updated_at,
          updated_by: parsed.updated_by,
        };
      }
    }
  } catch (err) {
    console.error('Failed to read evolution config file:', err);
  }

  return {
    api_url: (process.env.EVOLUTION_API_URL || '').trim(),
    api_key: (process.env.EVOLUTION_API_KEY || '').trim(),
  };
}

function saveEvolutionGlobalConfig(config: EvolutionGlobalConfig) {
  try {
    fs.writeFileSync(EVOLUTION_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
  } catch (err) {
    console.error('Failed to save evolution config file:', err);
    throw err;
  }
}

function maskApiKey(key: string): string {
  if (!key) return '';
  const trimmed = key.trim();
  if (trimmed.length <= 8) {
    return '••••••••';
  }
  return `${trimmed.slice(0, 4)}••••••••••••${trimmed.slice(-4)}`;
}

function getActiveEvolutionConfig() {
  const central = loadEvolutionGlobalConfig();
  const cleanUrl = (central.api_url || '').trim().replace(/\/+$/, '');
  const apiKey = (central.api_key || '').trim();
  const isConfigured = Boolean(cleanUrl && apiKey && /^https?:\/\//i.test(cleanUrl));
  return {
    isConfigured,
    cleanUrl,
    apiKey,
  };
}

function getResellerInstanceName(userId: string): string {
  // Safe alphanumeric instance name derived strictly from authenticated user id
  const sanitized = String(userId).toLowerCase().replace(/[^a-z0-9]/g, '_');
  return `gestorflix_${sanitized}`;
}

// Helper to format WhatsApp number into digits only
function normalizeWhatsApp(phone: string): string {
  let cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10 || cleaned.length === 11) {
    // If user provided Brazilian DDD without country code 55
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

// Format date to Brazilian format DD/MM/YYYY
function formatDateBR(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.slice(0, 10).split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Calculate days difference
function getDaysDiff(targetDateStr: string): number {
  const now = new Date();
  const todayDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const parts = targetDateStr.slice(0, 10).split('-');
  const targetDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  const diffTime = targetDate.getTime() - todayDate.getTime();
  return Math.round(diffTime / (1000 * 60 * 60 * 24));
}

// Update customer status dynamically based on current date
function refreshCustomerStatuses(user_id?: string) {
  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  let changed = false;

  db.customers.forEach((cust) => {
    if (user_id && cust.user_id !== user_id) return;
    const diff = getDaysDiff(cust.expiration_date);
    let nextStatus: 'active' | 'expiring_soon' | 'expired' = 'active';
    if (diff < 0) {
      nextStatus = 'expired';
    } else if (diff <= 2) {
      nextStatus = 'expiring_soon';
    } else {
      nextStatus = 'active';
    }

    if (cust.status !== nextStatus) {
      cust.status = nextStatus;
      cust.updated_at = now.toISOString();
      changed = true;
    }
  });

  if (changed) {
    saveDB(db);
  }
}

// Helper to check user ownership matching current Supabase user or legacy user
function isUserMatch(recordUserId: string, user?: { id: string; legacy_id?: string }): boolean {
  if (!user) return false;
  return recordUserId === user.id || (Boolean(user.legacy_id) && recordUserId === user.legacy_id);
}

// Helper to check user subscription status
function checkUserSubscription(
  userId: string,
  legacyId?: string,
  userRole?: string
): {
  allowed: boolean;
  status: string;
  daysLeft: number;
  hoursLeft: number;
  reason?: string;
} {
  const user = db.users.find((u) => u.id === userId || (legacyId && u.id === legacyId));
  if (userRole === 'admin' || (user && user.role === 'admin')) {
    return { allowed: true, status: 'active', daysLeft: 365, hoursLeft: 8760 };
  }

  let sub = db.subscriptions.find((s) => s.user_id === userId || (legacyId && s.user_id === legacyId));
  if (!sub) {
    // Para novos usuários criados no Supabase, provisiona o período de 3 dias de teste gratuito
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
    sub = {
      id: 'sub-' + userId,
      user_id: userId,
      status: 'trial',
      trial_ends_at: trialEndsAt,
      current_period_end: trialEndsAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };
    db.subscriptions.push(sub);
    saveDB(db);
    return { allowed: true, status: 'trial', daysLeft: 3, hoursLeft: 72 };
  }

  const now = new Date();
  const trialEnd = new Date(sub.trial_ends_at);
  const periodEnd = new Date(sub.current_period_end);

  const activeEnd = sub.status === 'active' ? periodEnd : trialEnd;
  const msLeft = activeEnd.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
  const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));

  if (sub.status === 'suspended') {
    return { allowed: false, status: 'suspended', daysLeft: 0, hoursLeft: 0, reason: 'Sua conta está suspensa pelo administrador.' };
  }

  if (sub.status === 'pending_payment') {
    return { allowed: false, status: 'pending_payment', daysLeft: 0, hoursLeft: 0, reason: 'Pagamento pendente. Regularize sua assinatura para continuar.' };
  }

  if (sub.status === 'trial') {
    if (msLeft <= 0) {
      sub.status = 'expired';
      sub.updated_at = now.toISOString();
      saveDB(db);
      return { allowed: false, status: 'expired', daysLeft: 0, hoursLeft: 0, reason: 'Seu período de teste gratuito de 3 dias expirou. Regularize seu plano.' };
    }
    return { allowed: true, status: 'trial', daysLeft, hoursLeft };
  }

  if (sub.status === 'active') {
    if (periodEnd.getTime() <= now.getTime()) {
      sub.status = 'expired';
      sub.updated_at = now.toISOString();
      saveDB(db);
      return { allowed: false, status: 'expired', daysLeft: 0, hoursLeft: 0, reason: 'Sua assinatura mensal expirou. Realize o pagamento para reativar.' };
    }
    return { allowed: true, status: 'active', daysLeft, hoursLeft };
  }

  return { allowed: false, status: 'expired', daysLeft: 0, hoursLeft: 0, reason: 'Assinatura inativa ou expirada.' };
}

// Middleware de Autenticação Segura via Supabase Auth
async function authenticateUser(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token não fornecido ou cabeçalho inválido.' });
  }

  const token = authHeader.replace('Bearer ', '').trim();

  // Rejeita estritamente tokens antigos no formato legado id:timestamp ou tokens sem padrão JWT
  if (token.includes(':') || !token.includes('.')) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: 'Tokens no formato legado (id:timestamp) não são mais aceitos. Faça login novamente via Supabase Auth.',
    });
  }

  if (!isSupabaseServerConfigured) {
    return res.status(503).json({
      error: 'SUPABASE_NOT_CONFIGURED',
      message: 'Supabase não está configurado no servidor. Configure as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.',
    });
  }

  const verification = await verifySupabaseToken(token);
  if (!verification.valid || !verification.user) {
    return res.status(401).json({
      error: 'UNAUTHORIZED',
      message: verification.error || 'Sessão inválida ou expirada no Supabase Auth.',
    });
  }

  const authUser = verification.user;
  // Localiza usuário legado para preservar relacionamento com clientes/planos já existentes
  const legacyUser = db.users.find((u) => u.email.toLowerCase() === authUser.email.toLowerCase());

  const officialAdminEmail = (process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com').trim().toLowerCase();
  const isMasterAdmin = Boolean(authUser.email && authUser.email.trim().toLowerCase() === officialAdminEmail);
  const effectiveRole: 'admin' | 'user' = (isMasterAdmin || authUser.role === 'admin' || legacyUser?.role === 'admin') ? 'admin' : 'user';

  (req as any).user = {
    id: authUser.id,
    email: authUser.email,
    name: authUser.name || legacyUser?.name || 'Usuário GestorFlix',
    role: effectiveRole,
    legacy_id: legacyUser?.id,
  };

  next();
}

// Middleware to block mutation when subscription expired/inactive
function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (user.role === 'admin') return next();

  const subCheck = checkUserSubscription(user.id, user.legacy_id, user.role);
  if (!subCheck.allowed) {
    return res.status(403).json({
      error: 'SUBSCRIPTION_REQUIRED',
      message: subCheck.reason || 'Seu período de teste expirou ou sua assinatura está pendente.',
      status: subCheck.status,
    });
  }

  next();
}

// Admin only middleware (Validação estrita pelo servidor)
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'FORBIDDEN', message: 'Acesso restrito ao administrador do SaaS' });
  }
  next();
}

// ====================================================================
// AUTOMATED BILLING SCHEDULER ENGINE (Runs in server background)
// ====================================================================
async function runBillingCycleCheck(): Promise<{ processed: number; sent: number; failed: number; skipped: number }> {
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;

  const now = new Date();
  const todayStr = now.toISOString().slice(0, 10);
  const currentHour = now.getHours().toString().padStart(2, '0');
  const currentMin = now.getMinutes().toString().padStart(2, '0');
  const currentTime = `${currentHour}:${currentMin}`;

  // Process all users that have auto_billing_enabled
  for (const user of db.users) {
    if (user.role === 'admin') continue;

    // Check if user has active sub
    const subCheck = checkUserSubscription(user.id);
    if (!subCheck.allowed) continue;

    // Check WhatsApp settings
    const ws = db.whatsapp_settings.find((w) => w.user_id === user.id);
    if (!ws || !ws.auto_billing_enabled || !ws.api_url || !ws.instance_name || !ws.api_key) {
      continue;
    }

    // Check Billing Settings
    let bs = db.billing_settings.find((b) => b.user_id === user.id);
    if (!bs) {
      bs = {
        id: 'bs-' + user.id,
        user_id: user.id,
        timezone: 'America/Sao_Paulo',
        send_day_before: true,
        time_day_before: '09:00',
        send_day_of_morning: true,
        time_day_of_morning: '09:00',
        send_day_of_night: true,
        time_day_of_night: '19:00',
        send_day_after: true,
        time_day_after: '10:00',
      };
      db.billing_settings.push(bs);
    }
    const safeBs = bs;

    // Get user templates
    const templates = db.message_templates.filter((t) => t.user_id === user.id);
    const tplBefore = templates.find((t) => t.type === 'day_before')?.template_text ||
      'Olá, {nome}! Tudo bem? 😊 Passando para lembrar que seu plano {plano} vence amanhã, dia {vencimento}. Valor: {valor}. Qualquer dúvida, estou à disposição!';
    const tplDay = templates.find((t) => t.type === 'day_of')?.template_text ||
      'Olá, {nome}! 😊 Hoje é o vencimento do seu plano {plano}. O valor é {valor}. Entre em contato para regularizar e continuar utilizando seu serviço normalmente.';
    const tplAfter = templates.find((t) => t.type === 'day_after')?.template_text ||
      'Olá, {nome}! Identificamos que o vencimento do seu plano {plano} foi ontem, dia {vencimento}. Caso já tenha realizado o pagamento, por favor, desconsidere esta mensagem. Se precisar de ajuda, estamos à disposição.';

    // Get user customers
    const userCustomers = db.customers.filter((c) => c.user_id === user.id);

    for (const cust of userCustomers) {
      if (!cust.whatsapp) continue;
      const normalizedPhone = normalizeWhatsApp(cust.whatsapp);
      if (normalizedPhone.length < 10) continue;

      const diff = getDaysDiff(cust.expiration_date);
      const plan = db.plans.find((p) => p.id === cust.plan_id);
      const planName = plan ? plan.name : 'Plano IPTV';
      const planPrice = plan ? `R$ ${plan.price.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
      const formattedDate = formatDateBR(cust.expiration_date);

      // Determine which slot triggers
      type SlotInfo = { slot: 'day_before' | 'day_of_morning' | 'day_of_night' | 'day_after'; template: string; schedTime: string };
      const triggers: SlotInfo[] = [];

      // A. 1 day before
      if (diff === 1 && safeBs.send_day_before) {
        if (currentTime >= safeBs.time_day_before) {
          triggers.push({ slot: 'day_before', template: tplBefore, schedTime: safeBs.time_day_before });
        }
      }

      // B. Day of expiration (morning & night separately)
      if (diff === 0) {
        if (safeBs.send_day_of_morning && currentTime >= safeBs.time_day_of_morning) {
          triggers.push({ slot: 'day_of_morning', template: tplDay, schedTime: safeBs.time_day_of_morning });
        }
        if (safeBs.send_day_of_night && currentTime >= safeBs.time_day_of_night) {
          triggers.push({ slot: 'day_of_night', template: tplDay, schedTime: safeBs.time_day_of_night });
        }
      }

      // C. 1 day after expiration
      if (diff === -1 && safeBs.send_day_after) {
        if (currentTime >= safeBs.time_day_after) {
          triggers.push({ slot: 'day_after', template: tplAfter, schedTime: safeBs.time_day_after });
        }
      }

      for (const item of triggers) {
        processed++;
        // Idempotency key prevents duplicate sends for same customer, cycle and slot
        const idempotencyKey = `${user.id}_${cust.id}_${cust.expiration_date}_${item.slot}`;
        const existing = db.message_logs.find((l) => l.idempotency_key === idempotencyKey);

        if (existing && (existing.status === 'sent' || existing.status === 'pending')) {
          skipped++;
          continue;
        }

        // Variable substitution
        const finalMessage = item.template
          .replace(/{nome}/g, cust.name)
          .replace(/{plano}/g, planName)
          .replace(/{valor}/g, planPrice)
          .replace(/{vencimento}/g, formattedDate)
          .replace(/{whatsapp}/g, cust.whatsapp);

        // Record log attempt
        const logId = 'log-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6);
        const logEntry: {
          id: string;
          user_id: string;
          customer_id: string;
          customer_name: string;
          whatsapp: string;
          message_type: 'day_before' | 'day_of_morning' | 'day_of_night' | 'day_after' | 'manual';
          cycle_date: string;
          scheduled_for: string;
          attempted_at: string;
          status: 'pending' | 'sent' | 'failed' | 'cancelled';
          response_payload?: string;
          error_details?: string;
          idempotency_key: string;
          created_at: string;
        } = {
          id: logId,
          user_id: user.id,
          customer_id: cust.id,
          customer_name: cust.name,
          whatsapp: normalizedPhone,
          message_type: item.slot,
          cycle_date: cust.expiration_date,
          scheduled_for: `${todayStr} ${item.schedTime}`,
          attempted_at: new Date().toISOString(),
          status: 'pending',
          idempotency_key: idempotencyKey,
          created_at: new Date().toISOString(),
        };

        db.message_logs.unshift(logEntry);

        // Execute Evolution API Call
        try {
          const cleanApiUrl = ws.api_url.replace(/\/+$/, '');
          const endpoint = `${cleanApiUrl}/message/sendText/${encodeURIComponent(ws.instance_name)}`;

          const apiResponse = await fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              apikey: ws.api_key,
            },
            body: JSON.stringify({
              number: normalizedPhone,
              text: finalMessage,
              delay: 1200,
            }),
          });

          const resData = await apiResponse.json().catch(() => ({}));

          if (apiResponse.ok) {
            logEntry.status = 'sent';
            logEntry.response_payload = JSON.stringify(resData);
            sent++;
          } else {
            logEntry.status = 'failed';
            logEntry.error_details = `HTTP ${apiResponse.status}: ${JSON.stringify(resData)}`;
            failed++;
          }
        } catch (err: any) {
          logEntry.status = 'failed';
          logEntry.error_details = err.message || 'Falha de conexão com Evolution API';
          failed++;
        }
      }
    }
  }

  saveDB(db);
  return { processed, sent, failed, skipped };
}

// Background scheduler interval: runs every 60 seconds
setInterval(() => {
  refreshCustomerStatuses();
  runBillingCycleCheck().catch((err) => {
    console.error('Error during automated billing cycle:', err);
  });
}, 60 * 1000);

// ====================================================================
// APPLICATION STARTUP & EXPRESS ROUTER
// ====================================================================
async function startServer() {
  const app = express();
  app.use(express.json());

  // 1. AUTH ROUTES

  // Migração Suave ("Lazy Migration") de contas legadas de data/db.json para Supabase Auth
  app.post('/api/auth/migrate-legacy', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const legacyUser = db.users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!legacyUser) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    // Validação estrita do hash SHA-256 com os registros existentes em data/db.json
    if (legacyUser.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    if (!isSupabaseServerConfigured) {
      return res.status(503).json({
        error: 'SUPABASE_NOT_CONFIGURED',
        message: 'Supabase não está configurado no servidor. Configure as variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no arquivo .env.',
      });
    }

    const migResult = await migrateLegacyUserToSupabase(legacyUser, password);
    if (!migResult.success) {
      return res.status(500).json({
        error: 'MIGRATION_FAILED',
        message: migResult.error || 'Falha ao sincronizar conta com o Supabase Auth.',
      });
    }

    // Preserva o relacionamento da assinatura em db.subscriptions
    const existingSub = db.subscriptions.find((s) => s.user_id === legacyUser.id);
    if (migResult.user?.id && !db.subscriptions.find((s) => s.user_id === migResult.user?.id)) {
      db.subscriptions.push({
        id: 'sub-' + migResult.user.id,
        user_id: migResult.user.id,
        status: legacyUser.role === 'admin' ? 'active' : (existingSub?.status || 'trial'),
        trial_ends_at: existingSub?.trial_ends_at || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        current_period_end: existingSub?.current_period_end || new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      saveDB(db);
    }

    return res.json({
      success: true,
      migrated: true,
      message: 'Conta migrada com sucesso para o Supabase Auth!',
    });
  });

  app.post('/api/auth/register', async (req, res) => {
    const { name, email, password } = req.body;
    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Campos nome, e-mail e senha são obrigatórios' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const existing = db.users.find((u) => u.email.toLowerCase() === cleanEmail);
    if (existing) {
      return res.status(400).json({ error: 'Este e-mail já está cadastrado no Gestor IPTV' });
    }

    const now = new Date();
    const userId = 'usr-' + Date.now();
    const role: 'admin' | 'user' = cleanEmail === (process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com') ? 'admin' : 'user';

    // 3 days free trial
    const trialEndsAt = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();

    const newUser = {
      id: userId,
      email: cleanEmail,
      name: name.trim(),
      passwordHash: hashPassword(password),
      role,
      created_at: now.toISOString(),
    };

    db.users.push(newUser);

    db.subscriptions.push({
      id: 'sub-' + userId,
      user_id: userId,
      status: role === 'admin' ? 'active' : 'trial',
      trial_ends_at: trialEndsAt,
      current_period_end: trialEndsAt,
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });

    saveDB(db);

    return res.json({
      message: 'Usuário registrado. Utilize o Supabase Auth para obter o token de sessão.',
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
      },
    });
  });

  app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ error: 'Informe e-mail e senha' });
    }

    const cleanEmail = email.trim().toLowerCase();
    const user = db.users.find((u) => u.email.toLowerCase() === cleanEmail);

    if (!user || user.passwordHash !== hashPassword(password)) {
      return res.status(401).json({ error: 'E-mail ou senha incorretos' });
    }

    // Se o Supabase estiver configurado no servidor, realiza a migração suave
    if (isSupabaseServerConfigured) {
      const migResult = await migrateLegacyUserToSupabase(user, password);
      if (migResult.success) {
        return res.json({
          migrated: true,
          message: 'Conta migrada com sucesso para o Supabase Auth. Conecte-se utilizando a sessão do Supabase.',
          user: migResult.user,
        });
      }
    }

    return res.status(400).json({
      error: 'AUTH_LEGACY_MIGRATION_REQUIRED',
      message: 'O Gestor FLIX agora utiliza autenticação segura via Supabase Auth. Conecte-se pela interface da aplicação.',
    });
  });

  app.get('/api/auth/me', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const subCheck = checkUserSubscription(user.id, user.legacy_id, user.role);
    const sub = db.subscriptions.find((s) => s.user_id === user.id || (user.legacy_id && s.user_id === user.legacy_id));

    return res.json({
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      subscription: {
        ...subCheck,
        trial_ends_at: sub?.trial_ends_at,
        current_period_end: sub?.current_period_end,
      },
    });
  });

  // 2. DASHBOARD METRICS
  app.get('/api/dashboard/metrics', authenticateUser, (req, res) => {
    const user = (req as any).user;
    refreshCustomerStatuses(user.id);

    const userCustomers = db.customers.filter((c) => isUserMatch(c.user_id, user));
    const userPlans = db.plans.filter((p) => isUserMatch(p.user_id, user));
    const userApps = db.applications.filter((a) => isUserMatch(a.user_id, user));
    const ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
    const subCheck = checkUserSubscription(user.id, user.legacy_id, user.role);

    const activeCustomers = userCustomers.filter((c) => c.status === 'active').length;
    const expiringSoonCustomers = userCustomers.filter((c) => c.status === 'expiring_soon').length;
    const expiredCustomers = userCustomers.filter((c) => c.status === 'expired').length;

    // Estimate monthly revenue
    let monthlyRevenueEstimate = 0;
    userCustomers.forEach((cust) => {
      const plan = userPlans.find((p) => p.id === cust.plan_id);
      if (plan && plan.price) {
        monthlyRevenueEstimate += plan.price;
      }
    });

    return res.json({
      totalCustomers: userCustomers.length,
      activeCustomers,
      expiringSoonCustomers,
      expiredCustomers,
      totalPlans: userPlans.length,
      totalApplications: userApps.length,
      whatsAppConnected: !!ws?.is_connected,
      autoBillingEnabled: !!ws?.auto_billing_enabled,
      trialDaysLeft: subCheck.daysLeft,
      trialHoursLeft: subCheck.hoursLeft,
      subscriptionStatus: subCheck.status,
      monthlyRevenueEstimate,
    });
  });

  // 3. CUSTOMERS CRUD
  app.get('/api/customers', authenticateUser, (req, res) => {
    const user = (req as any).user;
    refreshCustomerStatuses(user.id);

    const userCustomers = db.customers
      .filter((c) => isUserMatch(c.user_id, user))
      .map((c) => {
        const plan = db.plans.find((p) => p.id === c.plan_id);
        const appItem = db.applications.find((a) => a.id === c.application_id);
        return {
          ...c,
          plan_name: plan?.name,
          plan_price: plan?.price,
          application_name: appItem?.name,
        };
      });

    return res.json(userCustomers);
  });

  app.post('/api/customers', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const { name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date } = req.body;

    if (!name || !whatsapp || !expiration_date) {
      return res.status(400).json({ error: 'Nome, WhatsApp e Data de Vencimento são obrigatórios' });
    }

    const now = new Date();
    const newCust: {
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
    } = {
      id: 'cust-' + Date.now(),
      user_id: user.id,
      name: name.trim(),
      email: email ? email.trim() : '',
      whatsapp: normalizeWhatsApp(whatsapp),
      notes: notes ? notes.trim() : '',
      plan_id: plan_id || undefined,
      application_id: application_id || undefined,
      start_date: start_date || now.toISOString().slice(0, 10),
      expiration_date,
      status: 'active',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    };

    const diff = getDaysDiff(expiration_date);
    if (diff < 0) newCust.status = 'expired';
    else if (diff <= 2) newCust.status = 'expiring_soon';

    db.customers.push(newCust);
    saveDB(db);
    return res.status(201).json(newCust);
  });

  app.put('/api/customers/:id', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const cust = db.customers.find((c) => c.id === req.params.id && isUserMatch(c.user_id, user));
    if (!cust) return res.status(404).json({ error: 'Cliente não encontrado' });

    const { name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date, status } = req.body;

    if (name) cust.name = name.trim();
    if (email !== undefined) cust.email = email.trim();
    if (whatsapp) cust.whatsapp = normalizeWhatsApp(whatsapp);
    if (notes !== undefined) cust.notes = notes.trim();
    if (plan_id !== undefined) cust.plan_id = plan_id || undefined;
    if (application_id !== undefined) cust.application_id = application_id || undefined;
    if (start_date) cust.start_date = start_date;
    if (expiration_date) {
      cust.expiration_date = expiration_date;
      const diff = getDaysDiff(expiration_date);
      if (diff < 0) cust.status = 'expired';
      else if (diff <= 2) cust.status = 'expiring_soon';
      else cust.status = 'active';
    } else if (status) {
      cust.status = status;
    }

    cust.updated_at = new Date().toISOString();
    saveDB(db);
    return res.json(cust);
  });

  app.delete('/api/customers/:id', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const index = db.customers.findIndex((c) => c.id === req.params.id && isUserMatch(c.user_id, user));
    if (index === -1) return res.status(404).json({ error: 'Cliente não encontrado' });

    db.customers.splice(index, 1);
    saveDB(db);
    return res.json({ success: true, message: 'Cliente excluído com sucesso' });
  });

  // Customer Renewal endpoint
  app.post('/api/customers/:id/renew', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const cust = db.customers.find((c) => c.id === req.params.id && isUserMatch(c.user_id, user));
    if (!cust) return res.status(404).json({ error: 'Cliente não encontrado' });

    const plan = db.plans.find((p) => p.id === cust.plan_id);
    const durationDays = plan ? plan.duration_days : 30;

    // Calculate new expiration date: from current expiration or from today if already expired
    const now = new Date();
    const currentExp = new Date(cust.expiration_date + 'T00:00:00');
    const baseDate = currentExp.getTime() > now.getTime() ? currentExp : now;

    const newExp = new Date(baseDate.getTime() + durationDays * 24 * 60 * 60 * 1000);
    cust.expiration_date = newExp.toISOString().slice(0, 10);
    cust.status = 'active';
    cust.updated_at = now.toISOString();

    saveDB(db);
    return res.json({ success: true, customer: cust, message: `Plano renovado por ${durationDays} dias até ${formatDateBR(cust.expiration_date)}!` });
  });

  // 4. PLANS CRUD
  app.get('/api/plans', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const userPlans = db.plans.filter((p) => isUserMatch(p.user_id, user));
    return res.json(userPlans);
  });

  app.post('/api/plans', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const { name, price, duration_days, description, status, panel, server_dns } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Nome e valor do plano são obrigatórios' });
    }

    const planStatus: 'active' | 'inactive' = status === 'inactive' ? 'inactive' : 'active';
    const cleanDnsList = Array.isArray(server_dns)
      ? server_dns.map((d: any) => String(d).trim()).filter((d: string) => d.length > 0)
      : [];

    const newPlan = {
      id: 'plan-' + Date.now(),
      user_id: user.id,
      name: name.trim(),
      price: Number(price) || 0,
      duration_days: parseInt(duration_days, 10) || 30,
      description: description ? description.trim() : '',
      panel: panel ? String(panel).trim() : '',
      server_dns: cleanDnsList,
      status: planStatus,
      created_at: new Date().toISOString(),
    };

    db.plans.push(newPlan);
    saveDB(db);
    return res.status(201).json(newPlan);
  });

  app.put('/api/plans/:id', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const plan = db.plans.find((p) => p.id === req.params.id && isUserMatch(p.user_id, user));
    if (!plan) return res.status(404).json({ error: 'Plano não encontrado' });

    const { name, price, duration_days, description, status, panel, server_dns } = req.body;
    if (name) plan.name = name.trim();
    if (price !== undefined) plan.price = Number(price);
    if (duration_days !== undefined) plan.duration_days = parseInt(duration_days, 10);
    if (description !== undefined) plan.description = description.trim();
    if (panel !== undefined) plan.panel = String(panel).trim();
    if (server_dns !== undefined) {
      plan.server_dns = Array.isArray(server_dns)
        ? server_dns.map((d: any) => String(d).trim()).filter((d: string) => d.length > 0)
        : [];
    }
    if (status !== undefined) plan.status = status;

    saveDB(db);
    return res.json(plan);
  });

  app.delete('/api/plans/:id', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const index = db.plans.findIndex((p) => p.id === req.params.id && isUserMatch(p.user_id, user));
    if (index === -1) return res.status(404).json({ error: 'Plano não encontrado' });

    db.plans.splice(index, 1);
    saveDB(db);
    return res.json({ success: true, message: 'Plano excluído com sucesso' });
  });

  // 5. APPLICATIONS CRUD
  app.get('/api/applications', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const userApps = db.applications.filter((a) => isUserMatch(a.user_id, user));
    return res.json(userApps);
  });

  app.post('/api/applications', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const { name, description, notes, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome do aplicativo é obrigatório' });

    const appStatus: 'active' | 'inactive' = status === 'inactive' ? 'inactive' : 'active';
    const newApp = {
      id: 'app-' + Date.now(),
      user_id: user.id,
      name: name.trim(),
      description: description ? description.trim() : '',
      notes: notes ? notes.trim() : '',
      status: appStatus,
      created_at: new Date().toISOString(),
    };

    db.applications.push(newApp);
    saveDB(db);
    return res.status(201).json(newApp);
  });

  app.put('/api/applications/:id', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const appItem = db.applications.find((a) => a.id === req.params.id && isUserMatch(a.user_id, user));
    if (!appItem) return res.status(404).json({ error: 'Aplicativo não encontrado' });

    const { name, description, notes, status } = req.body;
    if (name) appItem.name = name.trim();
    if (description !== undefined) appItem.description = description.trim();
    if (notes !== undefined) appItem.notes = notes.trim();
    if (status !== undefined) appItem.status = status;

    saveDB(db);
    return res.json(appItem);
  });

  app.delete('/api/applications/:id', authenticateUser, requireActiveSubscription, (req, res) => {
    const user = (req as any).user;
    const index = db.applications.findIndex((a) => a.id === req.params.id && isUserMatch(a.user_id, user));
    if (index === -1) return res.status(404).json({ error: 'Aplicativo não encontrado' });

    db.applications.splice(index, 1);
    saveDB(db);
    return res.json({ success: true, message: 'Aplicativo excluído com sucesso' });
  });

  // 6. WHATSAPP & EVOLUTION API SETTINGS & INSTANCES
  app.get('/api/whatsapp/settings', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const evolution = getActiveEvolutionConfig();
    const instanceName = getResellerInstanceName(user.id);

    let ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
    if (!ws) {
      ws = {
        id: 'ws-' + user.id,
        user_id: user.id,
        api_url: evolution.cleanUrl,
        instance_name: instanceName,
        api_key: evolution.apiKey,
        is_connected: false,
        auto_billing_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.whatsapp_settings.push(ws);
      saveDB(db);
    }

    return res.json({
      instance_name: instanceName,
      is_connected: ws.is_connected,
      auto_billing_enabled: ws.auto_billing_enabled,
      central_configured: evolution.isConfigured,
      last_checked_at: ws.last_checked_at,
    });
  });

  app.post('/api/whatsapp/settings', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const { auto_billing_enabled } = req.body;
    const evolution = getActiveEvolutionConfig();
    const instanceName = getResellerInstanceName(user.id);

    let ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
    if (!ws) {
      ws = {
        id: 'ws-' + user.id,
        user_id: user.id,
        api_url: evolution.cleanUrl,
        instance_name: instanceName,
        api_key: evolution.apiKey,
        is_connected: false,
        auto_billing_enabled: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      db.whatsapp_settings.push(ws);
    }

    if (auto_billing_enabled !== undefined) {
      ws.auto_billing_enabled = Boolean(auto_billing_enabled);
    }

    ws.updated_at = new Date().toISOString();
    saveDB(db);

    return res.json({ success: true, message: 'Configurações do WhatsApp salvas com sucesso' });
  });

  // Query individual reseller instance status from Evolution API
  app.get('/api/whatsapp/instance/status', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const evolution = getActiveEvolutionConfig();
      const instanceName = getResellerInstanceName(user.id);

      let ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
      if (!ws) {
        ws = {
          id: 'ws-' + user.id,
          user_id: user.id,
          api_url: evolution.cleanUrl,
          instance_name: instanceName,
          api_key: evolution.apiKey,
          is_connected: false,
          auto_billing_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.whatsapp_settings.push(ws);
      }

      if (!evolution.isConfigured) {
        return res.json({
          configured: false,
          status: 'disconnected',
          state: 'unconfigured',
          is_connected: false,
          instance_name: instanceName,
          message: 'A Evolution API ainda não foi configurada pelo Administrador Master no painel central.',
          last_checked_at: new Date().toISOString(),
        });
      }

      // Check real status from Evolution API
      const endpoint = `${evolution.cleanUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { apikey: evolution.apiKey },
        signal: AbortSignal.timeout(8000),
      });

      if (response.status === 404) {
        ws.is_connected = false;
        ws.last_checked_at = new Date().toISOString();
        saveDB(db);
        return res.json({
          configured: true,
          status: 'disconnected',
          state: 'not_created',
          is_connected: false,
          instance_name: instanceName,
          message: 'Instância ainda não criada. Clique em "Conectar meu WhatsApp".',
          last_checked_at: ws.last_checked_at,
        });
      }

      const data = await response.json().catch(() => ({}));
      const state = String(data?.instance?.state || data?.state || '').toLowerCase();
      ws.last_checked_at = new Date().toISOString();

      if (response.ok && state === 'open') {
        ws.is_connected = true;
        ws.api_url = evolution.cleanUrl;
        ws.instance_name = instanceName;
        ws.api_key = evolution.apiKey;
        saveDB(db);
        return res.json({
          configured: true,
          status: 'connected',
          state: 'open',
          is_connected: true,
          instance_name: instanceName,
          message: 'WhatsApp conectado com sucesso!',
          last_checked_at: ws.last_checked_at,
        });
      } else if (state === 'connecting') {
        ws.is_connected = false;
        saveDB(db);
        return res.json({
          configured: true,
          status: 'connecting',
          state: 'connecting',
          is_connected: false,
          instance_name: instanceName,
          message: 'Conectando ao WhatsApp...',
          last_checked_at: ws.last_checked_at,
        });
      } else {
        ws.is_connected = false;
        saveDB(db);
        return res.json({
          configured: true,
          status: 'disconnected',
          state: state || 'close',
          is_connected: false,
          instance_name: instanceName,
          message: 'WhatsApp desconectado.',
          last_checked_at: ws.last_checked_at,
        });
      }
    } catch (err: any) {
      return res.status(502).json({
        configured: true,
        status: 'error',
        is_connected: false,
        error: `Erro ao consultar status da instância: ${err.message || 'Falha de comunicação'}`,
      });
    }
  });

  // Connect or create individual reseller instance and retrieve QR code
  app.post('/api/whatsapp/instance/connect', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const evolution = getActiveEvolutionConfig();
      const instanceName = getResellerInstanceName(user.id);

      if (!evolution.isConfigured) {
        return res.status(400).json({
          status: 'error',
          error: 'A Evolution API não está configurada pelo Administrador Master. Configure primeiro no painel central.',
        });
      }

      let ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
      if (!ws) {
        ws = {
          id: 'ws-' + user.id,
          user_id: user.id,
          api_url: evolution.cleanUrl,
          instance_name: instanceName,
          api_key: evolution.apiKey,
          is_connected: false,
          auto_billing_enabled: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.whatsapp_settings.push(ws);
      }

      ws.api_url = evolution.cleanUrl;
      ws.instance_name = instanceName;
      ws.api_key = evolution.apiKey;

      // 1. Check if instance already exists and is connected
      const stateUrl = `${evolution.cleanUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;
      let instanceExists = false;

      try {
        const stateRes = await fetch(stateUrl, {
          method: 'GET',
          headers: { apikey: evolution.apiKey },
          signal: AbortSignal.timeout(6000),
        });

        if (stateRes.ok) {
          const stateData = await stateRes.json().catch(() => ({}));
          const currentState = String(stateData?.instance?.state || stateData?.state || '').toLowerCase();
          instanceExists = true;

          if (currentState === 'open') {
            ws.is_connected = true;
            ws.last_checked_at = new Date().toISOString();
            saveDB(db);
            return res.json({
              status: 'connected',
              is_connected: true,
              instance_name: instanceName,
              message: 'Instância já está conectada e pronta para uso!',
            });
          }
        }
      } catch (e) {
        // Proceed with flow
      }

      let qrCodeString = '';

      // 2. If instance doesn't exist on Evolution API, create it
      if (!instanceExists) {
        const createUrl = `${evolution.cleanUrl}/instance/create`;
        const createRes = await fetch(createUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: evolution.apiKey,
          },
          body: JSON.stringify({
            instanceName,
            qrcode: true,
            integration: 'WHATSAPP-BAILEYS',
          }),
          signal: AbortSignal.timeout(10000),
        });

        const createData = await createRes.json().catch(() => ({}));

        if (!createRes.ok && createRes.status !== 403 && createRes.status !== 400) {
          return res.status(createRes.status).json({
            status: 'error',
            error: createData?.message || createData?.error || `Falha ao criar instância: HTTP ${createRes.status}`,
          });
        }

        const candidateQr =
          createData?.qrcode?.base64 ||
          createData?.base64 ||
          (typeof createData?.qrcode === 'string' ? createData.qrcode : '');
        if (candidateQr) {
          qrCodeString = candidateQr;
        }
      }

      // 3. If we don't have a QR Code yet, request /instance/connect
      if (!qrCodeString) {
        const connectUrl = `${evolution.cleanUrl}/instance/connect/${encodeURIComponent(instanceName)}`;
        const connectRes = await fetch(connectUrl, {
          method: 'GET',
          headers: { apikey: evolution.apiKey },
          signal: AbortSignal.timeout(8000),
        });

        const connectData = await connectRes.json().catch(() => ({}));
        const candidateQr =
          connectData?.base64 ||
          connectData?.qrcode?.base64 ||
          (typeof connectData?.qrcode === 'string' ? connectData.qrcode : '');

        if (candidateQr) {
          qrCodeString = candidateQr;
        } else if (connectData?.instance?.state === 'open' || connectData?.state === 'open') {
          ws.is_connected = true;
          ws.last_checked_at = new Date().toISOString();
          saveDB(db);
          return res.json({
            status: 'connected',
            is_connected: true,
            instance_name: instanceName,
            message: 'WhatsApp já conectado com sucesso!',
          });
        }
      }

      // Format QR Code correctly
      let formattedQr = qrCodeString ? qrCodeString.trim() : '';
      if (formattedQr && !formattedQr.startsWith('data:image')) {
        formattedQr = `data:image/png;base64,${formattedQr}`;
      }

      ws.is_connected = false;
      ws.last_checked_at = new Date().toISOString();
      saveDB(db);

      if (formattedQr) {
        return res.json({
          status: 'waiting_qr',
          is_connected: false,
          instance_name: instanceName,
          qrcode: formattedQr,
          message: 'QR Code gerado. Aponte a câmera do WhatsApp para conectar.',
        });
      } else {
        return res.json({
          status: 'connecting',
          is_connected: false,
          instance_name: instanceName,
          message: 'Instância iniciada. Aguardando geração do QR Code pela Evolution API...',
        });
      }
    } catch (err: any) {
      return res.status(502).json({
        status: 'error',
        error: `Falha ao conectar instância: ${err.message || 'Erro de rede'}`,
      });
    }
  });

  // Disconnect / logout reseller instance
  app.post('/api/whatsapp/instance/disconnect', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const evolution = getActiveEvolutionConfig();
      const instanceName = getResellerInstanceName(user.id);

      let ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
      if (ws) {
        ws.is_connected = false;
        ws.last_checked_at = new Date().toISOString();
        saveDB(db);
      }

      if (evolution.isConfigured) {
        try {
          const logoutUrl = `${evolution.cleanUrl}/instance/logout/${encodeURIComponent(instanceName)}`;
          await fetch(logoutUrl, {
            method: 'DELETE',
            headers: { apikey: evolution.apiKey },
            signal: AbortSignal.timeout(6000),
          });
        } catch (e) {
          // Fallback or ignore network issue
        }
      }

      return res.json({
        success: true,
        status: 'disconnected',
        is_connected: false,
        message: 'WhatsApp desconectado com sucesso.',
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao desconectar WhatsApp: ' + err.message });
    }
  });

  // Verify Evolution API Connection in real time (legacy alias)
  app.post('/api/whatsapp/check-connection', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const evolution = getActiveEvolutionConfig();
    const instanceName = getResellerInstanceName(user.id);
    let ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));

    if (!evolution.isConfigured) {
      return res.status(400).json({
        is_connected: false,
        error: 'A Evolution API ainda não foi configurada pelo Administrador Master no painel central.',
      });
    }

    try {
      const endpoint = `${evolution.cleanUrl}/instance/connectionState/${encodeURIComponent(instanceName)}`;
      const response = await fetch(endpoint, {
        method: 'GET',
        headers: { apikey: evolution.apiKey },
        signal: AbortSignal.timeout(8000),
      });

      const data = await response.json().catch(() => ({}));
      const state = String(data?.instance?.state || data?.state || '').toLowerCase();

      if (ws) {
        ws.last_checked_at = new Date().toISOString();
        ws.is_connected = response.ok && state === 'open';
        saveDB(db);
      }

      if (response.ok && state === 'open') {
        return res.json({
          is_connected: true,
          state: 'open',
          message: 'Instância do WhatsApp conectada com sucesso!',
          details: data,
        });
      } else {
        return res.json({
          is_connected: false,
          state: state || 'close',
          message: `Instância não está conectada ao WhatsApp (Estado: ${state || 'fechada'}). Conecte o QR Code no seu WhatsApp.`,
          details: data,
        });
      }
    } catch (err: any) {
      if (ws) {
        ws.is_connected = false;
        ws.last_checked_at = new Date().toISOString();
        saveDB(db);
      }
      return res.status(502).json({
        is_connected: false,
        error: `Não foi possível conectar ao servidor de WhatsApp: ${err.message}`,
      });
    }
  });

  // Send Test Message
  app.post('/api/whatsapp/send-test', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const { test_number, message } = req.body;

    if (!test_number) {
      return res.status(400).json({ error: 'Informe o número de WhatsApp com DDD para o teste' });
    }

    const evolution = getActiveEvolutionConfig();
    const ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
    const targetUrl = evolution.cleanUrl || ws?.api_url;
    const targetKey = evolution.apiKey || ws?.api_key;
    const targetInstance = ws?.instance_name || getResellerInstanceName(user.id);

    if (!targetUrl || !targetKey || !targetInstance) {
      return res.status(400).json({
        error: 'A Evolution API não está configurada ou a instância do WhatsApp não foi inicializada.',
      });
    }

    const formattedNumber = normalizeWhatsApp(test_number);
    const testText = message || 'Olá! Esta é uma mensagem de teste enviada com sucesso pelo Gestor FLIX via WhatsApp! 🚀';

    try {
      const cleanApiUrl = targetUrl.replace(/\/+$/, '');
      const endpoint = `${cleanApiUrl}/message/sendText/${encodeURIComponent(targetInstance)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: targetKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          text: testText,
          delay: 1000,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok) {
        // Record test log
        db.message_logs.unshift({
          id: 'log-test-' + Date.now(),
          user_id: user.id,
          customer_id: 'test',
          customer_name: 'Teste de Instância',
          whatsapp: formattedNumber,
          message_type: 'manual',
          cycle_date: new Date().toISOString().slice(0, 10),
          scheduled_for: 'Imediato',
          attempted_at: new Date().toISOString(),
          status: 'sent',
          response_payload: JSON.stringify(data),
          idempotency_key: `test_${user.id}_${Date.now()}`,
          created_at: new Date().toISOString(),
        });
        saveDB(db);

        return res.json({ success: true, message: 'Mensagem de teste enviada com sucesso!', data });
      } else {
        return res.status(400).json({
          error: `Falha no envio retornado pelo WhatsApp: ${JSON.stringify(data)}`,
        });
      }
    } catch (err: any) {
      return res.status(502).json({ error: `Erro ao enviar via WhatsApp: ${err.message}` });
    }
  });

  // Send Manual Notification to Customer
  app.post('/api/whatsapp/send-manual', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const { customer_id, template_type, custom_text } = req.body;

    const cust = db.customers.find((c) => c.id === customer_id && c.user_id === user.id);
    if (!cust) return res.status(404).json({ error: 'Cliente não encontrado' });

    const evolution = getActiveEvolutionConfig();
    const ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
    const targetUrl = evolution.cleanUrl || ws?.api_url;
    const targetKey = evolution.apiKey || ws?.api_key;
    const targetInstance = ws?.instance_name || getResellerInstanceName(user.id);

    if (!targetUrl || !targetKey || !targetInstance) {
      return res.status(400).json({ error: 'Instância de WhatsApp não configurada' });
    }

    const plan = db.plans.find((p) => p.id === cust.plan_id);
    const planName = plan ? plan.name : 'Plano IPTV';
    const planPrice = plan ? `R$ ${plan.price.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
    const formattedDate = formatDateBR(cust.expiration_date);

    let messageText = custom_text;
    if (!messageText) {
      const templates = db.message_templates.filter((t) => t.user_id === user.id);
      const chosenTpl = templates.find((t) => t.type === template_type) || templates[0];
      messageText = chosenTpl ? chosenTpl.template_text : 'Olá, {nome}! Seu plano {plano} vence em {vencimento}.';
    }

    messageText = messageText
      .replace(/{nome}/g, cust.name)
      .replace(/{plano}/g, planName)
      .replace(/{valor}/g, planPrice)
      .replace(/{vencimento}/g, formattedDate)
      .replace(/{whatsapp}/g, cust.whatsapp);

    const formattedNumber = normalizeWhatsApp(cust.whatsapp);

    try {
      const cleanApiUrl = targetUrl.replace(/\/+$/, '');
      const endpoint = `${cleanApiUrl}/message/sendText/${encodeURIComponent(targetInstance)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: targetKey,
        },
        body: JSON.stringify({
          number: formattedNumber,
          text: messageText,
          delay: 1000,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));

      const logEntry = {
        id: 'log-manual-' + Date.now(),
        user_id: user.id,
        customer_id: cust.id,
        customer_name: cust.name,
        whatsapp: formattedNumber,
        message_type: 'manual' as const,
        cycle_date: cust.expiration_date,
        scheduled_for: 'Envio manual',
        attempted_at: new Date().toISOString(),
        status: (response.ok ? 'sent' : 'failed') as any,
        response_payload: JSON.stringify(data),
        error_details: response.ok ? undefined : JSON.stringify(data),
        idempotency_key: `manual_${cust.id}_${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      db.message_logs.unshift(logEntry);
      saveDB(db);

      if (response.ok) {
        return res.json({ success: true, message: 'Mensagem enviada com sucesso ao cliente!', data });
      } else {
        return res.status(400).json({ error: 'Erro no envio pelo WhatsApp', details: data });
      }
    } catch (err: any) {
      return res.status(502).json({ error: `Falha na requisição: ${err.message}` });
    }
  });

  // 7. BILLING SETTINGS & TEMPLATES
  app.get('/api/billing/settings', authenticateUser, (req, res) => {
    const user = (req as any).user;
    let bs = db.billing_settings.find((b) => isUserMatch(b.user_id, user));
    if (!bs) {
      bs = {
        id: 'bs-' + user.id,
        user_id: user.id,
        timezone: 'America/Sao_Paulo',
        send_day_before: true,
        time_day_before: '09:00',
        send_day_of_morning: true,
        time_day_of_morning: '09:00',
        send_day_of_night: true,
        time_day_of_night: '19:00',
        send_day_after: true,
        time_day_after: '10:00',
      };
      db.billing_settings.push(bs);
      saveDB(db);
    }
    return res.json(bs);
  });

  app.post('/api/billing/settings', authenticateUser, (req, res) => {
    const user = (req as any).user;
    let bs = db.billing_settings.find((b) => isUserMatch(b.user_id, user));
    if (!bs) {
      bs = {
        id: 'bs-' + user.id,
        user_id: user.id,
        timezone: 'America/Sao_Paulo',
        send_day_before: true,
        time_day_before: '09:00',
        send_day_of_morning: true,
        time_day_of_morning: '09:00',
        send_day_of_night: true,
        time_day_of_night: '19:00',
        send_day_after: true,
        time_day_after: '10:00',
      };
      db.billing_settings.push(bs);
    }

    const {
      timezone,
      send_day_before,
      time_day_before,
      send_day_of_morning,
      time_day_of_morning,
      send_day_of_night,
      time_day_of_night,
      send_day_after,
      time_day_after,
    } = req.body;

    if (timezone) bs.timezone = timezone;
    if (send_day_before !== undefined) bs.send_day_before = Boolean(send_day_before);
    if (time_day_before) bs.time_day_before = time_day_before;
    if (send_day_of_morning !== undefined) bs.send_day_of_morning = Boolean(send_day_of_morning);
    if (time_day_of_morning) bs.time_day_of_morning = time_day_of_morning;
    if (send_day_of_night !== undefined) bs.send_day_of_night = Boolean(send_day_of_night);
    if (time_day_of_night) bs.time_day_of_night = time_day_of_night;
    if (send_day_after !== undefined) bs.send_day_after = Boolean(send_day_after);
    if (time_day_after) bs.time_day_after = time_day_after;

    saveDB(db);
    return res.json({ success: true, settings: bs, message: 'Horários de cobrança salvos!' });
  });

  // Templates
  app.get('/api/billing/templates', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const userTemplates = db.message_templates.filter((t) => isUserMatch(t.user_id, user));
    return res.json(userTemplates);
  });

  app.put('/api/billing/templates/:type', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const { type } = req.params;
    const { template_text } = req.body;

    if (!template_text) return res.status(400).json({ error: 'Texto do modelo é obrigatório' });

    let tpl = db.message_templates.find((t) => isUserMatch(t.user_id, user) && t.type === type);
    if (!tpl) {
      tpl = {
        id: 'tpl-' + type + '-' + user.id,
        user_id: user.id,
        type: type as any,
        title: type === 'day_before' ? 'Lembrete de Vencimento' : type === 'day_of' ? 'Lembrete no Dia' : 'Aviso de Vencimento Atrasado',
        template_text,
        updated_at: new Date().toISOString(),
      };
      db.message_templates.push(tpl);
    } else {
      tpl.template_text = template_text;
      tpl.updated_at = new Date().toISOString();
    }

    saveDB(db);
    return res.json({ success: true, template: tpl, message: 'Modelo salvo com sucesso!' });
  });

  // Manual Trigger Billing Cycle (Worker)
  app.post('/api/billing/trigger-cycle', authenticateUser, async (req, res) => {
    try {
      const result = await runBillingCycleCheck();
      return res.json({
        success: true,
        message: `Ciclo executado: ${result.sent} enviados, ${result.failed} falhas, ${result.skipped} ignorados/já enviados hoje.`,
        details: result,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao executar ciclo de cobrança: ' + err.message });
    }
  });

  // 8. MESSAGE LOGS (HISTORY)
  app.get('/api/billing/logs', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const logs = db.message_logs.filter((l) => isUserMatch(l.user_id, user));
    return res.json(logs);
  });

  // 9. SAAS SUBSCRIPTION & PAYMENT INFO
  app.get('/api/subscription/info', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const sub = db.subscriptions.find((s) => isUserMatch(s.user_id, user));
    const subCheck = checkUserSubscription(user.id, user.legacy_id, user.role);
    const saas = db.saas_settings;

    return res.json({
      subscription: {
        ...subCheck,
        trial_ends_at: sub?.trial_ends_at,
        current_period_end: sub?.current_period_end,
        payment_reference: sub?.payment_reference,
      },
      payment_info: {
        pix_key: saas.admin_pix_key,
        pix_name: saas.admin_pix_name,
        monthly_price: saas.saas_monthly_price,
        instructions: saas.instructions,
      },
    });
  });

  // User submits payment confirmation request
  app.post('/api/subscription/submit-payment-request', authenticateUser, (req, res) => {
    const user = (req as any).user;
    const { reference } = req.body;
    const sub = db.subscriptions.find((s) => isUserMatch(s.user_id, user));
    if (!sub) return res.status(404).json({ error: 'Assinatura não encontrada' });

    sub.status = 'pending_payment';
    sub.payment_reference = reference ? reference.trim() : 'Comprovante informado pelo cliente';
    sub.updated_at = new Date().toISOString();

    saveDB(db);
    return res.json({
      success: true,
      message: 'Comprovante recebido! O administrador validará o pagamento para liberar sua conta.',
    });
  });

  // 10. SAAS ADMIN ROUTES (Exclusive to Master Admin)
  app.get('/api/admin/users', authenticateUser, requireAdmin, async (req, res) => {
    const userMap = new Map<string, any>();

    // 1. Carrega usuários legados do db.json
    for (const u of db.users) {
      const sub = db.subscriptions.find((s) => s.user_id === u.id);
      const custCount = db.customers.filter((c) => c.user_id === u.id).length;
      const ws = db.whatsapp_settings.find((w) => w.user_id === u.id);

      userMap.set(u.email.toLowerCase(), {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        created_at: u.created_at,
        customer_count: custCount,
        subscription: sub || {
          status: 'expired',
          trial_ends_at: u.created_at,
          current_period_end: u.created_at,
        },
        whatsapp_connected: !!ws?.is_connected,
      });
    }

    // 2. Mescla com usuários e perfis registrados no Supabase Auth / profiles
    if (supabaseAdmin) {
      try {
        const { data: profiles } = await supabaseAdmin
          .from('profiles')
          .select('id, email, full_name, role, created_at');

        const { data: subs } = await supabaseAdmin
          .from('subscriptions')
          .select('*');

        if (profiles) {
          for (const p of profiles) {
            const emailKey = (p.email || '').toLowerCase();
            const existing = userMap.get(emailKey);
            const supSub = subs?.find((s) => s.user_id === p.id);
            const custCount = db.customers.filter((c) => c.user_id === p.id || (existing && c.user_id === existing.id)).length;
            const ws = db.whatsapp_settings.find((w) => w.user_id === p.id || (existing && w.user_id === existing.id));

            const subData = supSub
              ? {
                  status: supSub.status,
                  trial_ends_at: supSub.trial_ends_at,
                  current_period_end: supSub.current_period_end,
                }
              : existing?.subscription || {
                  status: 'trial',
                  trial_ends_at: p.created_at || new Date().toISOString(),
                  current_period_end: p.created_at || new Date().toISOString(),
                };

            userMap.set(emailKey, {
              id: p.id,
              email: p.email,
              name: p.full_name || existing?.name || p.email.split('@')[0],
              role: p.role || existing?.role || 'user',
              created_at: p.created_at || existing?.created_at || new Date().toISOString(),
              customer_count: custCount,
              subscription: subData,
              whatsapp_connected: !!ws?.is_connected,
            });
          }
        }
      } catch (err: any) {
        console.warn('Erro ao consultar perfis do Supabase para lista de admin:', err.message);
      }
    }

    return res.json(Array.from(userMap.values()));
  });

  app.post('/api/admin/users/:id/subscription', authenticateUser, requireAdmin, async (req, res) => {
    const targetUserId = req.params.id;
    const { action, days_to_add, new_status } = req.body;

    let user = db.users.find((u) => u.id === targetUserId);
    let isSupabaseUser = false;

    if (!user && supabaseAdmin) {
      try {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id, email, full_name, role')
          .eq('id', targetUserId)
          .maybeSingle();

        if (profile) {
          isSupabaseUser = true;
          user = {
            id: profile.id,
            email: profile.email,
            name: profile.full_name || profile.email,
            role: profile.role,
            created_at: new Date().toISOString(),
          } as any;
        }
      } catch {}
    }

    if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

    let sub = db.subscriptions.find((s) => s.user_id === targetUserId);
    const now = new Date();

    if (!sub) {
      sub = {
        id: 'sub-' + targetUserId,
        user_id: targetUserId,
        status: 'trial',
        trial_ends_at: now.toISOString(),
        current_period_end: now.toISOString(),
        created_at: now.toISOString(),
        updated_at: now.toISOString(),
      };
      db.subscriptions.push(sub);
    }

    if (action === 'extend_trial') {
      const extraDays = parseInt(days_to_add, 10) || 3;
      const currentEnd = new Date(sub.trial_ends_at).getTime() > now.getTime() ? new Date(sub.trial_ends_at) : now;
      const nextDate = new Date(currentEnd.getTime() + extraDays * 24 * 60 * 60 * 1000);
      sub.trial_ends_at = nextDate.toISOString();
      sub.current_period_end = nextDate.toISOString();
      sub.status = 'trial';
    } else if (action === 'activate_paid') {
      const days = parseInt(days_to_add, 10) || 30;
      const nextDate = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
      sub.status = 'active';
      sub.current_period_end = nextDate.toISOString();
    } else if (action === 'suspend') {
      sub.status = 'suspended';
    } else if (action === 'reactivate') {
      sub.status = 'active';
      if (new Date(sub.current_period_end).getTime() < now.getTime()) {
        sub.current_period_end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    } else if (new_status) {
      sub.status = new_status;
    }

    sub.updated_at = now.toISOString();
    saveDB(db);

    // Se o usuário existir no Supabase, sincroniza a assinatura também na tabela pública do Supabase
    if (supabaseAdmin) {
      try {
        await supabaseAdmin
          .from('subscriptions')
          .upsert({
            user_id: targetUserId,
            status: sub.status,
            trial_ends_at: sub.trial_ends_at,
            current_period_end: sub.current_period_end,
            updated_at: sub.updated_at,
          }, { onConflict: 'user_id' });
      } catch (err: any) {
        console.warn('Aviso: Não foi possível sincronizar assinatura no Supabase:', err.message);
      }
    }

    return res.json({ success: true, message: 'Assinatura atualizada com sucesso pelo administrador', subscription: sub });
  });

  app.post('/api/admin/settings', authenticateUser, requireAdmin, (req, res) => {
    const { admin_pix_key, admin_pix_name, saas_monthly_price, instructions } = req.body;
    if (admin_pix_key) db.saas_settings.admin_pix_key = admin_pix_key.trim();
    if (admin_pix_name) db.saas_settings.admin_pix_name = admin_pix_name.trim();
    if (saas_monthly_price !== undefined) db.saas_settings.saas_monthly_price = Number(saas_monthly_price);
    if (instructions !== undefined) db.saas_settings.instructions = instructions.trim();

    saveDB(db);
    return res.json({ success: true, settings: db.saas_settings, message: 'Configurações de licença salvas com sucesso!' });
  });

  // 11. CENTRAL EVOLUTION API (Exclusive to Master Admin)
  app.get('/api/admin/evolution/settings', authenticateUser, requireAdmin, (_req, res) => {
    try {
      const config = loadEvolutionGlobalConfig();
      const hasApiKey = Boolean(config.api_key && config.api_key.trim().length > 0);
      return res.json({
        api_url: config.api_url || '',
        has_api_key: hasApiKey,
        api_key_masked: hasApiKey ? maskApiKey(config.api_key) : '',
        updated_at: config.updated_at || null,
        updated_by: config.updated_by || null,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao consultar configurações centrais da Evolution API.' });
    }
  });

  app.post('/api/admin/evolution/settings', authenticateUser, requireAdmin, (req, res) => {
    try {
      const user = (req as any).user;
      const { api_url, api_key } = req.body || {};

      const current = loadEvolutionGlobalConfig();

      if (typeof api_url === 'string') {
        const cleanUrl = api_url.trim().replace(/\/+$/, '');
        if (cleanUrl && !/^https?:\/\//i.test(cleanUrl)) {
          return res.status(400).json({ error: 'A URL base deve iniciar com http:// ou https://' });
        }
        current.api_url = cleanUrl;
      }

      if (typeof api_key === 'string') {
        const trimmedKey = api_key.trim();
        // Ignore placeholder/masked string so saving without changing key preserves existing key
        if (trimmedKey && !trimmedKey.includes('••••')) {
          current.api_key = trimmedKey;
        }
      }

      current.updated_at = new Date().toISOString();
      current.updated_by = user?.email || 'admin';

      saveEvolutionGlobalConfig(current);

      const hasApiKey = Boolean(current.api_key && current.api_key.trim().length > 0);

      return res.json({
        success: true,
        message: 'Configurações centrais da Evolution API salvas com sucesso!',
        settings: {
          api_url: current.api_url,
          has_api_key: hasApiKey,
          api_key_masked: hasApiKey ? maskApiKey(current.api_key) : '',
          updated_at: current.updated_at,
        },
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao salvar configurações centrais da Evolution API: ' + err.message });
    }
  });

  app.post('/api/admin/evolution/test', authenticateUser, requireAdmin, async (req, res) => {
    try {
      const { api_url, api_key } = req.body || {};
      const saved = loadEvolutionGlobalConfig();

      const rawUrl = typeof api_url === 'string' && api_url.trim() ? api_url.trim() : saved.api_url;
      const cleanUrl = (rawUrl || '').replace(/\/+$/, '');

      // If user typed a new key in the UI, test with it; if blank or contains masked chars, use saved key
      let testKey = saved.api_key;
      if (typeof api_key === 'string' && api_key.trim() && !api_key.includes('••••')) {
        testKey = api_key.trim();
      }

      if (!cleanUrl) {
        return res.status(400).json({ success: false, error: 'URL base da Evolution API não informada.' });
      }

      if (!testKey) {
        return res.status(400).json({ success: false, error: 'Chave global (API Key) não informada.' });
      }

      if (!/^https?:\/\//i.test(cleanUrl)) {
        return res.status(400).json({ success: false, error: 'A URL base deve iniciar com http:// ou https://' });
      }

      // Endpoint padrão da Evolution API v1/v2 para listar instâncias com a chave global
      const endpoint = `${cleanUrl}/instance/fetchInstances`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: testKey,
        },
        signal: AbortSignal.timeout(10000),
      });

      if (response.ok) {
        const body = await response.json().catch(() => null);
        let count = 0;
        if (Array.isArray(body)) {
          count = body.length;
        } else if (body && Array.isArray(body.instances)) {
          count = body.instances.length;
        }

        return res.json({
          success: true,
          status: response.status,
          message: 'Conexão estabelecida com sucesso com a Evolution API!',
          instance_count: count,
        });
      } else if (response.status === 401 || response.status === 403) {
        return res.status(response.status).json({
          success: false,
          status: response.status,
          error: 'Falha de autenticação: Global API Key inválida ou rejeitada pelo servidor Evolution.',
        });
      } else if (response.status === 404) {
        return res.status(404).json({
          success: false,
          status: 404,
          error: 'Servidor alcançado, porém a rota /instance/fetchInstances não foi encontrada (HTTP 404). Verifique a URL base da Evolution API.',
        });
      } else {
        return res.status(response.status).json({
          success: false,
          status: response.status,
          error: `O servidor Evolution retornou o status HTTP ${response.status}.`,
        });
      }
    } catch (err: any) {
      const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('abort');
      return res.status(502).json({
        success: false,
        error: isTimeout
          ? 'Tempo limite de conexão excedido (10s). Verifique se o servidor Evolution API está online e acessível.'
          : `Falha ao conectar à Evolution API: ${err.message || 'Erro de rede'}`,
      });
    }
  });

  // VERIFICAÇÃO DE STATUS DO SUPABASE (Etapa 2 - Somente Diagnóstico de Conexão)
  app.get('/api/supabase/status', async (_req, res) => {
    if (!isSupabaseServerConfigured) {
      return res.json({
        configured: false,
        connected: false,
        message: 'Variáveis SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY ainda não configuradas no servidor.',
      });
    }

    const result = await testSupabaseServerConnection();
    return res.json({
      configured: true,
      ...result,
    });
  });

  // VITE DEV SERVER INTEGRATION
  if (!isProd) {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Gestor IPTV SaaS rodando na porta ${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Falha crítica ao iniciar servidor:', err);
  process.exit(1);
});
