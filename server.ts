import express, { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import crypto from 'crypto';
import {
  getMercadoPagoConfig,
  saveMercadoPagoConfig,
  testMercadoPagoConnection,
  createPixCharge,
  verifyAndProcessPayment,
  verifyMercadoPagoSignature,
  findRecentPendingPayment,
  findPaymentByIdOrMpId,
  grantLifetimeSubscription,
} from './src/server/mercadoPagoService';
import {
  isSupabaseServerConfigured,
  testSupabaseServerConnection,
  verifySupabaseToken,
  migrateLegacyUserToSupabase,
  supabaseAdmin,
  getSupabasePlans,
  createSupabasePlan,
  updateSupabasePlan,
  deleteSupabasePlan,
  getSupabaseApplications,
  createSupabaseApplication,
  updateSupabaseApplication,
  deleteSupabaseApplication,
  getSupabaseCustomers,
  createSupabaseCustomer,
  updateSupabaseCustomer,
  deleteSupabaseCustomer,
  renewSupabaseCustomer,
  getSupabaseDashboardMetrics,
  getSupabaseSubscription,
  ensureSupabaseSubscription,
  updateSupabaseSubscriptionStatus,
  getSupabaseWhatsAppSettings,
  ensureSupabaseWhatsAppSettings,
  updateSupabaseWhatsAppSettings,
  getSupabaseBillingSettings,
  ensureSupabaseBillingSettings,
  updateSupabaseBillingSettings,
  getSupabaseMessageTemplates,
  ensureSupabaseMessageTemplates,
  updateSupabaseMessageTemplate,
  getSupabaseCentralEvolutionConfig,
  updateSupabaseCentralEvolutionConfig,
  getSupabaseMessageLogs,
  saveSupabaseMessageLog,
  checkSupabaseIdempotency,
  isValidUUID,
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

let cachedEvolutionConfig: EvolutionGlobalConfig | null = null;
let lastEvolutionCacheTime = 0;
const EVOLUTION_CACHE_TTL_MS = 15000;

function loadEvolutionGlobalConfigSync(): EvolutionGlobalConfig {
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

async function loadEvolutionGlobalConfigAsync(): Promise<EvolutionGlobalConfig> {
  const now = Date.now();
  if (cachedEvolutionConfig && now - lastEvolutionCacheTime < EVOLUTION_CACHE_TTL_MS) {
    return cachedEvolutionConfig;
  }

  // 1. Consulta autoritativa no Supabase (Fonte de Verdade Compartilhada entre Ambientes)
  if (isSupabaseServerConfigured && supabaseAdmin) {
    try {
      const supConfig = await getSupabaseCentralEvolutionConfig();
      if (supConfig && (supConfig.api_url || supConfig.api_key)) {
        cachedEvolutionConfig = {
          api_url: supConfig.api_url || '',
          api_key: supConfig.api_key || '',
          updated_at: supConfig.updated_at || undefined,
          updated_by: supConfig.updated_by || 'admin',
        };
        lastEvolutionCacheTime = now;
        return cachedEvolutionConfig;
      }
    } catch (supErr) {
      console.warn('Alerta ao consultar configuração central da Evolution no Supabase:', supErr);
    }
  }

  // 2. Fallback: Arquivo local data/evolution-config.json
  const local = loadEvolutionGlobalConfigSync();
  if (local.api_url || local.api_key) {
    cachedEvolutionConfig = local;
    lastEvolutionCacheTime = now;
    return cachedEvolutionConfig;
  }

  // 3. Fallback: Variáveis de ambiente .env
  cachedEvolutionConfig = {
    api_url: (process.env.EVOLUTION_API_URL || '').trim(),
    api_key: (process.env.EVOLUTION_API_KEY || '').trim(),
  };
  lastEvolutionCacheTime = now;
  return cachedEvolutionConfig;
}

function loadEvolutionGlobalConfig(): EvolutionGlobalConfig {
  return cachedEvolutionConfig || loadEvolutionGlobalConfigSync();
}

function saveEvolutionGlobalConfig(config: EvolutionGlobalConfig) {
  try {
    fs.writeFileSync(EVOLUTION_CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
    cachedEvolutionConfig = config;
    lastEvolutionCacheTime = Date.now();
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

async function getActiveEvolutionConfig() {
  const central = await loadEvolutionGlobalConfigAsync();
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

// Helper to format WhatsApp number into digits only, supporting both Brazilian and international E.164 formats
function normalizeWhatsApp(phone: string): string {
  const trimmed = (phone || '').trim();
  const hadPlus = trimmed.startsWith('+');
  let cleaned = trimmed.replace(/\D/g, '');
  if (!cleaned) return '';

  // If already starts with 55 (Brazil DDI) and is 12 or 13 digits, keep as is
  if (cleaned.startsWith('55') && (cleaned.length === 12 || cleaned.length === 13)) {
    return cleaned;
  }

  // If user explicitly provided country code with '+' or has > 11 digits not starting with 55
  if (hadPlus && cleaned.length >= 10) {
    return cleaned;
  }

  // If user provided Brazilian local number without 55 (10 digits for landline or 11 digits with 9th digit for mobile)
  if (cleaned.length === 10 || (cleaned.length === 11 && cleaned[2] === '9')) {
    cleaned = '55' + cleaned;
  }
  return cleaned;
}

// Validates international or Brazilian WhatsApp numbers
function validateWhatsAppNumber(phone: string): { valid: boolean; normalized: string; error?: string } {
  if (!phone || typeof phone !== 'string') {
    return { valid: false, normalized: '', error: 'Informe o número de WhatsApp com DDD.' };
  }
  const normalized = normalizeWhatsApp(phone);
  // International E.164 standard: between 10 and 15 digits
  if (normalized.length < 10 || normalized.length > 15) {
    return {
      valid: false,
      normalized,
      error: 'Número de WhatsApp inválido. Deve conter entre 10 e 15 dígitos numéricos (com DDD/DDI).',
    };
  }
  // Brazilian numbers start with 55 and must have 12 or 13 digits (55 + DDD de 2 dígitos + 8 ou 9 dígitos)
  if (normalized.startsWith('55')) {
    if (normalized.length !== 12 && normalized.length !== 13) {
      return {
        valid: false,
        normalized,
        error: 'Número brasileiro inválido. Deve conter DDD de 2 dígitos e 8 ou 9 dígitos (ex: 11999998888).',
      };
    }
    const ddd = parseInt(normalized.substring(2, 4), 10);
    if (isNaN(ddd) || ddd < 11 || ddd > 99) {
      return {
        valid: false,
        normalized,
        error: 'DDD brasileiro inválido. Informe um DDD válido entre 11 e 99.',
      };
    }
  }
  return { valid: true, normalized };
}

// Sanitizes Evolution API response payload to prevent logging sensitive message text or headers
function sanitizeEvolutionResponse(data: any): { message_id?: string; status: string; timestamp: string } {
  const messageId =
    data?.key?.id ||
    data?.messageId ||
    data?.id ||
    (data?.response?.key?.id) ||
    undefined;

  const rawStatus = data?.status || data?.message?.status || (messageId ? 'accepted_by_api' : 'processed');
  const timestamp = data?.messageTimestamp
    ? new Date(Number(data.messageTimestamp) * 1000).toISOString()
    : new Date().toISOString();

  return {
    message_id: messageId ? String(messageId) : undefined,
    status: String(rawStatus),
    timestamp,
  };
}

// In-memory send locks for atomic concurrency protection within the process
const activeSendLocks = new Map<string, number>();

function acquireSendLock(key: string, ttlMs: number = 15000): boolean {
  const now = Date.now();
  const existingExpiry = activeSendLocks.get(key);
  if (existingExpiry && existingExpiry > now) {
    return false; // Active lock already exists
  }
  activeSendLocks.set(key, now + ttlMs);
  return true;
}

function releaseSendLock(key: string): void {
  activeSendLocks.delete(key);
}

// Check recent message logs in db to prevent duplication across processes or recent restarts
function checkRecentDuplicateSend(
  userId: string,
  targetPhone: string,
  customerId?: string,
  windowSeconds: number = 15
): boolean {
  const cutoffTime = new Date(Date.now() - windowSeconds * 1000).toISOString();
  const recentLog = db.message_logs.find((log) => {
    if (log.user_id !== userId) return false;
    if (log.attempted_at < cutoffTime) return false;
    if (customerId && log.customer_id === customerId) return true;
    if (targetPhone && log.whatsapp === targetPhone) return true;
    return false;
  });
  return Boolean(recentLog);
}

// Helper to update instance connection state only when reliable disconnection evidence is returned
function checkAndHandleInstanceDisconnect(userId: string, httpStatus: number, responseData: any): void {
  const errorStr = (
    String(responseData?.message || '') +
    ' ' +
    String(responseData?.error || '') +
    ' ' +
    JSON.stringify(responseData || {})
  ).toLowerCase();

  const isDisconnected =
    httpStatus === 404 ||
    errorStr.includes('instance not found') ||
    errorStr.includes('instance not connected') ||
    errorStr.includes('connection closed') ||
    errorStr.includes('connection lost');

  if (isDisconnected) {
    if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(userId)) {
      updateSupabaseWhatsAppSettings(userId, {
        is_connected: false,
        last_checked_at: new Date().toISOString(),
      }).catch((e) => console.warn('Falha ao atualizar desconexão do WhatsApp no Supabase:', e));
    }
    const ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, { id: userId }));
    if (ws && ws.is_connected) {
      ws.is_connected = false;
      ws.last_checked_at = new Date().toISOString();
      saveDB(db);
    }
  }
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

// Helper to get current date and time in specific time zone (default: America/Sao_Paulo)
function getZonedNow(timeZone: string = 'America/Sao_Paulo'): { dateStr: string; timeStr: string } {
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-CA', { timeZone });
  const timeStr = now.toLocaleTimeString('pt-BR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return { dateStr, timeStr };
}

// Calculate days difference with timezone awareness (Brasília: America/Sao_Paulo)
function getDaysDiff(targetDateStr: string, timeZone: string = 'America/Sao_Paulo'): number {
  if (!targetDateStr) return 0;
  const { dateStr } = getZonedNow(timeZone);
  const [tY, tM, tD] = dateStr.split('-').map(Number);
  const todayDate = new Date(tY, tM - 1, tD);

  const parts = targetDateStr.slice(0, 10).split('-').map(Number);
  const targetDate = new Date(parts[0], parts[1] - 1, parts[2]);

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

// Helper to check user subscription status (Supabase PostgreSQL como fonte única da verdade)
async function checkUserSubscription(
  userId: string,
  legacyId?: string,
  userRole?: string
): Promise<{
  allowed: boolean;
  status: string;
  isLifetime?: boolean;
  daysLeft: number;
  hoursLeft: number;
  reason?: string;
  subscription?: any;
}> {
  const user = db.users.find((u) => u.id === userId || (legacyId && u.id === legacyId));
  const adminEmail = (process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com').trim().toLowerCase();
  const isMasterAdmin = Boolean(user && user.email && user.email.trim().toLowerCase() === adminEmail);

  if (userRole === 'admin' || isMasterAdmin || (user && user.role === 'admin')) {
    return {
      allowed: true,
      status: 'active',
      daysLeft: 365,
      hoursLeft: 8760,
      subscription: {
        id: 'sub-admin',
        user_id: userId,
        status: 'active',
        trial_ends_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        current_period_end: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      },
    };
  }

  // 1. Tenta carregar a assinatura autoritativa do Supabase PostgreSQL
  let sub: any = null;
  if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(userId)) {
    try {
      sub = await getSupabaseSubscription(userId);
      if (!sub) {
        // Se ainda não existir no Supabase, provisiona uma única vez no Supabase
        sub = await ensureSupabaseSubscription(userId, userRole);
      }
    } catch (err: any) {
      console.warn('Aviso: falha ao consultar assinatura no Supabase, usando fallback legado:', err.message);
    }
  }

  // 2. Fallback legado em memória / data/db.json (para compatibilidade caso Supabase esteja offline ou para IDs legados)
  if (!sub) {
    sub = db.subscriptions.find((s) => s.user_id === userId || (legacyId && s.user_id === legacyId));
    if (!sub) {
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
    }
  } else {
    // Sincroniza em memória no db.subscriptions mantendo as datas autoritativas do Supabase
    const localIdx = db.subscriptions.findIndex((s) => s.user_id === userId || (legacyId && s.user_id === legacyId));
    const localEntry = {
      id: sub.id,
      user_id: sub.user_id,
      status: sub.status,
      trial_ends_at: sub.trial_ends_at,
      current_period_end: sub.current_period_end,
      payment_reference: sub.payment_reference,
      notes: sub.notes,
      created_at: sub.created_at,
      updated_at: sub.updated_at,
    };
    if (localIdx >= 0) {
      db.subscriptions[localIdx] = localEntry;
    } else {
      db.subscriptions.push(localEntry);
    }
  }

  const now = new Date();
  const trialEnd = new Date(sub.trial_ends_at);
  const periodEnd = new Date(sub.current_period_end);

  const activeEnd = sub.status === 'active' ? periodEnd : trialEnd;
  const msLeft = activeEnd.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
  const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));

  // Verificação de Licença Vitalícia (Mercado Pago Pix ou ativação vitalícia)
  const isLifetime =
    sub.notes === 'vitalicio' ||
    (typeof sub.payment_reference === 'string' && sub.payment_reference.startsWith('MP_')) ||
    periodEnd.getFullYear() >= 2090;

  if (sub.status === 'active' && isLifetime) {
    return {
      allowed: true,
      status: 'active',
      isLifetime: true,
      daysLeft: 36500,
      hoursLeft: 876000,
      reason: 'Licença vitalícia ativa e confirmada.',
      subscription: { ...sub, isLifetime: true },
    };
  }

  if (sub.status === 'suspended') {
    return {
      allowed: false,
      status: 'suspended',
      daysLeft: 0,
      hoursLeft: 0,
      reason: 'Sua conta está suspensa pelo administrador.',
      subscription: sub,
    };
  }

  if (sub.status === 'pending_payment') {
    return {
      allowed: false,
      status: 'pending_payment',
      daysLeft: 0,
      hoursLeft: 0,
      reason: 'Pagamento pendente. Regularize sua assinatura para continuar.',
      subscription: sub,
    };
  }

  if (sub.status === 'trial') {
    if (msLeft <= 0) {
      if (sub.status !== 'expired') {
        sub.status = 'expired';
        sub.updated_at = now.toISOString();
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(userId)) {
          updateSupabaseSubscriptionStatus(sub.id, 'expired').catch(() => {});
        }
        saveDB(db);
      }
      return {
        allowed: false,
        status: 'expired',
        daysLeft: 0,
        hoursLeft: 0,
        reason: 'Seu período de teste gratuito de 3 dias expirou. Regularize seu plano.',
        subscription: sub,
      };
    }
    return { allowed: true, status: 'trial', daysLeft, hoursLeft, subscription: sub };
  }

  if (sub.status === 'active') {
    if (periodEnd.getTime() <= now.getTime()) {
      if (sub.status !== 'expired') {
        sub.status = 'expired';
        sub.updated_at = now.toISOString();
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(userId)) {
          updateSupabaseSubscriptionStatus(sub.id, 'expired').catch(() => {});
        }
        saveDB(db);
      }
      return {
        allowed: false,
        status: 'expired',
        daysLeft: 0,
        hoursLeft: 0,
        reason: 'Sua assinatura mensal expirou. Realize o pagamento para reativar.',
        subscription: sub,
      };
    }
    return { allowed: true, status: 'active', daysLeft, hoursLeft, subscription: sub };
  }

  return {
    allowed: false,
    status: 'expired',
    daysLeft: 0,
    hoursLeft: 0,
    reason: 'Assinatura inativa ou expirada.',
    subscription: sub,
  };
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
async function requireActiveSubscription(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  if (!user) return res.status(401).json({ error: 'UNAUTHORIZED' });
  if (user.role === 'admin') return next();

  const subCheck = await checkUserSubscription(user.id, user.legacy_id, user.role);
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

// Master Admin only middleware (Exclusivo para chavepixedvandyemis@gmail.com; não confia apenas em role === 'admin')
function requireMasterAdmin(req: Request, res: Response, next: NextFunction) {
  const user = (req as any).user;
  const officialAdminEmail = (process.env.ADMIN_EMAIL || 'chavepixedvandyemis@gmail.com').trim().toLowerCase();
  const isMaster = Boolean(user && user.email && user.email.trim().toLowerCase() === officialAdminEmail);

  if (!user || !isMaster) {
    return res.status(403).json({
      error: 'FORBIDDEN',
      message: 'Acesso restrito exclusivamente ao Administrador Master do Gestor FLIX.',
    });
  }
  next();
}

// ====================================================================
// AUTOMATED BILLING SCHEDULER ENGINE (Runs in server background)
// ====================================================================
interface BillingCycleResult {
  total_users_checked: number;
  total_customers_checked: number;
  eligible_candidates: number;
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
  skipped_reasons: {
    whatsapp_not_connected?: number;
    auto_billing_disabled?: number;
    subscription_inactive?: number;
    no_matching_slot_or_time?: number;
    already_sent_today?: number;
    invalid_phone?: number;
  };
  details: string[];
  message: string;
}

export async function runBillingCycleCheck(
  targetUserId?: string,
  options?: { isManual?: boolean; simulateEvolution?: boolean }
): Promise<BillingCycleResult> {
  let processed = 0;
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  let eligible_candidates = 0;
  let total_customers_checked = 0;
  const skipped_reasons: BillingCycleResult['skipped_reasons'] = {};
  const details: string[] = [];

  const evolution = await getActiveEvolutionConfig();
  if (!evolution.isConfigured) {
    console.log('[BillingCycle] Central Evolution API não configurada. Disparos automáticos suspensos de forma segura.');
    return {
      total_users_checked: 0,
      total_customers_checked: 0,
      eligible_candidates: 0,
      processed: 0,
      sent: 0,
      failed: 0,
      skipped: 0,
      skipped_reasons: {},
      details: ['Evolution API Central não configurada no Supabase'],
      message: 'Evolution API Central não configurada pela administração.',
    };
  }

  // 1. Identificar usuários a processar (Supabase PostgreSQL como fonte primária)
  let usersToProcess: Array<{ id: string; email?: string; role?: string; legacy_id?: string }> = [];

  if (isSupabaseServerConfigured && supabaseAdmin) {
    if (targetUserId) {
      if (isValidUUID(targetUserId)) {
        const { data: profile } = await supabaseAdmin
          .from('profiles')
          .select('id, email, role')
          .eq('id', targetUserId)
          .maybeSingle();
        if (profile) {
          usersToProcess = [profile];
        }
      }
      // Se não encontrou no Supabase, tenta no db.users (fallback legado)
      if (usersToProcess.length === 0) {
        usersToProcess = db.users.filter(
          (u) => u.id === targetUserId || (u as any).legacy_id === targetUserId
        );
      }
    } else {
      // Background worker ou admin executando para todos
      const { data: profiles } = await supabaseAdmin
        .from('profiles')
        .select('id, email, role');
      if (profiles && profiles.length > 0) {
        usersToProcess = profiles;
      }
      // Mescla usuários legados locais se houver algum não cadastrado no Supabase
      for (const localUser of db.users) {
        if (!usersToProcess.some((u) => u.id === localUser.id || (u.email && u.email.toLowerCase() === localUser.email.toLowerCase()))) {
          usersToProcess.push(localUser);
        }
      }
    }
  } else {
    // Fallback sem Supabase
    usersToProcess = targetUserId
      ? db.users.filter((u) => u.id === targetUserId || (u as any).legacy_id === targetUserId)
      : db.users;
  }

  const total_users_checked = usersToProcess.length;

  for (const user of usersToProcess) {
    // Se targetUserId foi especificado diretamente (ex: admin clicando para si ou revendedor), processa sem pular
    // Se for execução em massa em background, processa todos os usuários
    const subCheck = await checkUserSubscription(user.id, (user as any).legacy_id, user.role);
    if (!subCheck.allowed) {
      skipped_reasons.subscription_inactive = (skipped_reasons.subscription_inactive || 0) + 1;
      details.push(`Gestor ${user.email || user.id}: Assinatura inativa ou expirada.`);
      continue;
    }

    // Check WhatsApp settings (Supabase authoritative)
    let ws: any = null;
    if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
      try {
        ws = await getSupabaseWhatsAppSettings(user.id);
      } catch (e) {
        console.warn('Erro ao carregar whatsapp_settings do Supabase:', e);
      }
    }
    if (!ws) {
      ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
    }

    if (!ws || !ws.is_connected) {
      skipped_reasons.whatsapp_not_connected = (skipped_reasons.whatsapp_not_connected || 0) + 1;
      details.push(`Gestor ${user.email || user.id}: WhatsApp não está conectado.`);
      continue;
    }

    if (!ws.auto_billing_enabled && !options?.isManual) {
      skipped_reasons.auto_billing_disabled = (skipped_reasons.auto_billing_disabled || 0) + 1;
      details.push(`Gestor ${user.email || user.id}: Cobranças automáticas desativadas.`);
      continue;
    }

    // Instance name derived exclusively from reseller identity; credentials strictly from central config
    const instanceName = getResellerInstanceName(user.id);
    const targetUrl = evolution.cleanUrl;
    const targetKey = evolution.apiKey;

    // Check Billing Settings (Supabase authoritative)
    let bs: any = null;
    if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
      try {
        bs = await getSupabaseBillingSettings(user.id);
      } catch (e) {
        console.warn('Erro ao carregar billing_settings do Supabase:', e);
      }
    }
    if (!bs) {
      bs = db.billing_settings.find((b) => isUserMatch(b.user_id, user));
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
    }
    const safeBs = bs;
    const userTimezone = safeBs.timezone || 'America/Sao_Paulo';
    const { dateStr: todayStr, timeStr: currentTime } = getZonedNow(userTimezone);

    // Get user templates (Supabase authoritative)
    let templates: any[] = [];
    if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
      try {
        templates = await getSupabaseMessageTemplates(user.id);
      } catch (e) {
        console.warn('Erro ao carregar message_templates do Supabase:', e);
      }
    }
    if (!templates || templates.length === 0) {
      templates = db.message_templates.filter((t) => isUserMatch(t.user_id, user));
    }
    const tplBefore = templates.find((t) => t.type === 'day_before')?.template_text ||
      'Olá, {nome}! Tudo bem? 😊 Passando para lembrar que seu plano {plano} vence amanhã, dia {vencimento}. Valor: {valor}. Qualquer dúvida, estou à disposição!';
    const tplDay = templates.find((t) => t.type === 'day_of')?.template_text ||
      'Olá, {nome}! 😊 Hoje é o vencimento do seu plano {plano}. O valor é {valor}. Entre em contato para regularizar e continuar utilizando seu serviço normalmente.';
    const tplAfter = templates.find((t) => t.type === 'day_after')?.template_text ||
      'Olá, {nome}! Identificamos que o vencimento do seu plano {plano} foi ontem, dia {vencimento}. Caso já tenha realizado o pagamento, por favor, desconsidere esta mensagem. Se precisar de ajuda, estamos à disposição.';

    // Get user customers and plans strictly isolated from Supabase
    const userCustomers = isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)
      ? await getSupabaseCustomers(user.id).catch(() => [])
      : db.customers.filter((c) => isUserMatch(c.user_id, user));

    const userPlans = isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)
      ? await getSupabasePlans(user.id).catch(() => [])
      : db.plans.filter((p) => isUserMatch(p.user_id, user));

    total_customers_checked += userCustomers.length;

    for (const cust of userCustomers) {
      if (!cust.whatsapp) {
        skipped_reasons.invalid_phone = (skipped_reasons.invalid_phone || 0) + 1;
        continue;
      }
      const phoneValidation = validateWhatsAppNumber(cust.whatsapp);
      if (!phoneValidation.valid) {
        skipped_reasons.invalid_phone = (skipped_reasons.invalid_phone || 0) + 1;
        continue;
      }
      const normalizedPhone = phoneValidation.normalized;

      const diff = getDaysDiff(cust.expiration_date, userTimezone);
      const plan = userPlans.find((p) => p.id === cust.plan_id);
      const planName = plan ? plan.name : ((cust as any).plan_name || 'Plano IPTV');
      const planPrice = plan ? `R$ ${plan.price.toFixed(2).replace('.', ',')}` : ((cust as any).plan_price ? `R$ ${(cust as any).plan_price.toFixed(2).replace('.', ',')}` : 'R$ 0,00');
      const formattedDate = formatDateBR(cust.expiration_date);

      // Determine which slot triggers
      type SlotInfo = { slot: 'day_before' | 'day_of_morning' | 'day_of_night' | 'day_after'; template: string; schedTime: string };
      const triggers: SlotInfo[] = [];

      // A. 1 day before
      if (diff === 1 && safeBs.send_day_before) {
        if (options?.isManual || currentTime >= safeBs.time_day_before) {
          triggers.push({ slot: 'day_before', template: tplBefore, schedTime: safeBs.time_day_before });
        }
      }

      // B. Day of expiration (morning & night separately)
      if (diff === 0) {
        if (safeBs.send_day_of_morning && (options?.isManual || currentTime >= safeBs.time_day_of_morning)) {
          triggers.push({ slot: 'day_of_morning', template: tplDay, schedTime: safeBs.time_day_of_morning });
        }
        if (safeBs.send_day_of_night && (options?.isManual || currentTime >= safeBs.time_day_of_night)) {
          triggers.push({ slot: 'day_of_night', template: tplDay, schedTime: safeBs.time_day_of_night });
        }
      }

      // C. 1 or 2 days after expiration (overdue notice)
      if ((diff === -1 || diff === -2) && safeBs.send_day_after) {
        if (options?.isManual || currentTime >= safeBs.time_day_after) {
          triggers.push({ slot: 'day_after', template: tplAfter, schedTime: safeBs.time_day_after });
        }
      }

      if (triggers.length === 0) {
        skipped_reasons.no_matching_slot_or_time = (skipped_reasons.no_matching_slot_or_time || 0) + 1;
      } else {
        eligible_candidates++;
      }

      for (const item of triggers) {
        processed++;
        // Idempotency key prevents duplicate sends for same customer, cycle and slot
        const idempotencyKey = `${user.id}_${cust.id}_${cust.expiration_date}_${item.slot}`;

        // Checagem de idempotência: Supabase PostgreSQL autoritativo para usuários Supabase, com fallback local seguro
        let alreadySent = false;
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
          alreadySent = await checkSupabaseIdempotency(idempotencyKey);
        } else {
          const existing = db.message_logs.find((l) => l.idempotency_key === idempotencyKey);
          if (existing && existing.status === 'sent') {
            const isSimulated = typeof existing.response_payload === 'string' && existing.response_payload.includes('"simulated":true');
            if (!isSimulated) {
              alreadySent = true;
            }
          }
        }

        if (alreadySent) {
          skipped++;
          skipped_reasons.already_sent_today = (skipped_reasons.already_sent_today || 0) + 1;
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

        // Execute Evolution API Call (or simulate if requested by test runner)
        if (options?.simulateEvolution) {
          logEntry.status = 'sent';
          logEntry.response_payload = JSON.stringify({ simulated: true, success: true });
          sent++;
          details.push(`[SIMULAÇÃO] Mensagem ${item.slot} enviada para ${cust.name} (${normalizedPhone}).`);
        } else {
          try {
            const cleanApiUrl = targetUrl.replace(/\/+$/, '');
            const endpoint = `${cleanApiUrl}/message/sendText/${encodeURIComponent(instanceName)}`;

            const apiResponse = await fetch(endpoint, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                apikey: targetKey,
              },
              body: JSON.stringify({
                number: normalizedPhone,
                text: finalMessage,
                delay: 1200,
              }),
              signal: AbortSignal.timeout(15000),
            });

            const resData = await apiResponse.json().catch(() => ({}));
            const sanitized = sanitizeEvolutionResponse(resData);

            if (apiResponse.ok) {
              logEntry.status = 'sent';
              logEntry.response_payload = JSON.stringify(sanitized);
              sent++;
              details.push(`Mensagem ${item.slot} enviada com sucesso para ${cust.name}.`);
            } else {
              logEntry.status = 'failed';
              logEntry.error_details = `HTTP ${apiResponse.status}: ${resData?.message || resData?.error || 'Erro no envio'}`;
              failed++;
              details.push(`Falha no envio para ${cust.name}: HTTP ${apiResponse.status}`);
              checkAndHandleInstanceDisconnect(user.id, apiResponse.status, resData);
            }
          } catch (err: any) {
            logEntry.status = 'failed';
            logEntry.error_details = err.message || 'Falha de conexão com Evolution API';
            failed++;
            details.push(`Erro de conexão para ${cust.name}: ${err.message}`);
          }
        }

        // Persistência autoritativa no Supabase PostgreSQL
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
          try {
            await saveSupabaseMessageLog({
              id: logId,
              user_id: user.id,
              customer_id: isValidUUID(cust.id) ? cust.id : null,
              customer_name: cust.name,
              whatsapp: normalizedPhone,
              message_type: item.slot,
              cycle_date: cust.expiration_date,
              scheduled_for: `${todayStr} ${item.schedTime}`,
              attempted_at: logEntry.attempted_at,
              status: logEntry.status,
              response_payload: logEntry.response_payload,
              error_details: logEntry.error_details,
              idempotency_key: idempotencyKey,
            });
          } catch (supLogErr) {
            console.warn('Erro ao salvar log no Supabase:', supLogErr);
          }
        }

        // Espelho local
        db.message_logs.unshift(logEntry);
      }
    }
  }

  saveDB(db);

  // Construir mensagem de diagnóstico transparente e detalhada
  let resultMsg = '';
  if (total_customers_checked === 0) {
    resultMsg = 'Nenhum cliente cadastrado foi encontrado para o gestor selecionado.';
  } else if (eligible_candidates === 0) {
    const reasonsList: string[] = [];
    if (skipped_reasons.whatsapp_not_connected) reasonsList.push('WhatsApp desconectado');
    if (skipped_reasons.auto_billing_disabled) reasonsList.push('cobranças automáticas desativadas');
    if (skipped_reasons.no_matching_slot_or_time) reasonsList.push('sem vencimentos elegíveis para hoje nos horários programados');
    if (skipped_reasons.invalid_phone) reasonsList.push('números de telefone inválidos');
    const reasonsStr = reasonsList.length > 0 ? ` (motivo: ${reasonsList.join(', ')})` : '';
    resultMsg = `Ciclo executado: ${total_customers_checked} clientes verificados, 0 cobranças elegíveis no momento${reasonsStr}.`;
  } else {
    const skipInfo = skipped > 0 ? ` (${skipped} já enviados hoje ou idempotentes)` : '';
    resultMsg = `Ciclo executado: ${sent} processados pela Evolution API, ${failed} falhas, ${skipped} ignorados${skipInfo}. Total de clientes analisados: ${total_customers_checked} (${eligible_candidates} elegíveis).`;
  }

  return {
    total_users_checked,
    total_customers_checked,
    eligible_candidates,
    processed,
    sent,
    failed,
    skipped,
    skipped_reasons,
    details,
    message: resultMsg,
  };
}

// Background scheduler interval: runs every 60 seconds
if (process.env.NODE_ENV !== 'test' && !process.env.TEST_RUNNER) {
  setInterval(() => {
    refreshCustomerStatuses();
    runBillingCycleCheck().catch((err) => {
      console.error('Error during automated billing cycle:', err);
    });
  }, 60 * 1000);
}

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

  app.get('/api/auth/me', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const subCheck = await checkUserSubscription(user.id, user.legacy_id, user.role);
    const sub = subCheck.subscription || db.subscriptions.find((s) => s.user_id === user.id || (user.legacy_id && s.user_id === user.legacy_id));

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
  app.get('/api/dashboard/metrics', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento.',
      });
    }

    try {
      const metrics = await getSupabaseDashboardMetrics(user.id, user.role === 'admin');
      let ws: any = null;
      if (isValidUUID(user.id)) {
        ws = await getSupabaseWhatsAppSettings(user.id).catch(() => null);
      }
      if (!ws) {
        ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
      }
      const subCheck = await checkUserSubscription(user.id, user.legacy_id, user.role);

      return res.json({
        totalCustomers: metrics.totalCustomers,
        activeCustomers: metrics.activeCustomers,
        expiringSoonCustomers: metrics.expiringSoonCustomers,
        expiredCustomers: metrics.expiredCustomers,
        totalPlans: metrics.totalPlans,
        totalApplications: metrics.totalApplications,
        whatsAppConnected: !!ws?.is_connected,
        autoBillingEnabled: !!ws?.auto_billing_enabled,
        trialDaysLeft: subCheck.daysLeft,
        trialHoursLeft: subCheck.hoursLeft,
        subscriptionStatus: subCheck.status,
        monthlyRevenueEstimate: metrics.monthlyRevenueEstimate,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao carregar métricas no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  // 3. CUSTOMERS CRUD
  app.get('/api/customers', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento.',
      });
    }

    try {
      const customers = await getSupabaseCustomers(user.id, user.role === 'admin');
      return res.json(customers);
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao consultar clientes no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.post('/api/customers', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A operação não foi salva.',
      });
    }

    const { name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date } = req.body;

    if (!name || !whatsapp || !expiration_date) {
      return res.status(400).json({ error: 'Nome, WhatsApp e Data de Vencimento são obrigatórios' });
    }

    const phoneValidation = validateWhatsAppNumber(whatsapp);
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error || 'Número de WhatsApp inválido.' });
    }

    try {
      const newCust = await createSupabaseCustomer(user.id, {
        name,
        email,
        whatsapp: phoneValidation.normalized,
        notes,
        plan_id,
        application_id,
        start_date,
        expiration_date,
      });
      return res.status(201).json(newCust);
    } catch (err: any) {
      if (err.message?.includes('PROFILE_NOT_FOUND')) {
        return res.status(409).json({
          error: 'PROFILE_NOT_FOUND',
          message: 'Perfil do revendedor não encontrado na tabela public.profiles do Supabase. Cadastre ou sincronize o perfil antes de criar clientes.',
        });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao salvar cliente no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.put('/api/customers/:id', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A alteração não foi salva.',
      });
    }

    const { name, email, whatsapp, notes, plan_id, application_id, start_date, expiration_date, status } = req.body;

    let normalizedPhone: string | undefined = undefined;
    if (whatsapp) {
      const phoneValidation = validateWhatsAppNumber(whatsapp);
      if (!phoneValidation.valid) {
        return res.status(400).json({ error: phoneValidation.error || 'Número de WhatsApp inválido.' });
      }
      normalizedPhone = phoneValidation.normalized;
    }

    try {
      const updatedCust = await updateSupabaseCustomer(
        req.params.id,
        user.id,
        {
          name,
          email,
          whatsapp: normalizedPhone,
          notes,
          plan_id,
          application_id,
          start_date,
          expiration_date,
          status,
        },
        user.role === 'admin'
      );
      return res.json(updatedCust);
    } catch (err: any) {
      if (err.message?.includes('ID_INVALID') || err.message?.includes('JSON object requested')) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao atualizar cliente no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.delete('/api/customers/:id', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A exclusão não foi concluída.',
      });
    }

    try {
      await deleteSupabaseCustomer(req.params.id, user.id, user.role === 'admin');
      return res.json({ success: true, message: 'Cliente excluído com sucesso' });
    } catch (err: any) {
      if (err.message?.includes('ID_INVALID')) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao excluir cliente no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  // Customer Renewal endpoint
  app.post('/api/customers/:id/renew', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A renovação não foi concluída.',
      });
    }

    try {
      const result = await renewSupabaseCustomer(req.params.id, user.id, user.role === 'admin');
      return res.json({
        success: true,
        customer: result.customer,
        message: `Plano renovado por ${result.durationDays} dias até ${formatDateBR(result.customer.expiration_date)}!`,
      });
    } catch (err: any) {
      if (err.message?.includes('não encontrado') || err.message?.includes('ID_INVALID')) {
        return res.status(404).json({ error: 'Cliente não encontrado' });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao renovar cliente no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  // 4. PLANS CRUD
  app.get('/api/plans', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento.',
      });
    }

    try {
      const plans = await getSupabasePlans(user.id, user.role === 'admin');
      return res.json(plans);
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao consultar planos no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.post('/api/plans', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. O plano não foi salvo.',
      });
    }

    const { name, price, duration_days, description, status, panel, server_dns } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Nome e valor do plano são obrigatórios' });
    }

    try {
      const newPlan = await createSupabasePlan(user.id, {
        name,
        price,
        duration_days,
        description,
        panel,
        server_dns,
        status,
      });
      return res.status(201).json(newPlan);
    } catch (err: any) {
      if (err.message?.includes('PROFILE_NOT_FOUND')) {
        return res.status(409).json({
          error: 'PROFILE_NOT_FOUND',
          message: 'Perfil do revendedor não encontrado na tabela public.profiles do Supabase. Cadastre ou sincronize o perfil antes de criar planos.',
        });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao criar plano no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.put('/api/plans/:id', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A alteração não foi salva.',
      });
    }

    const { name, price, duration_days, description, status, panel, server_dns } = req.body;

    try {
      const updatedPlan = await updateSupabasePlan(
        req.params.id,
        user.id,
        {
          name,
          price,
          duration_days,
          description,
          panel,
          server_dns,
          status,
        },
        user.role === 'admin'
      );
      return res.json(updatedPlan);
    } catch (err: any) {
      if (err.message?.includes('ID_INVALID') || err.message?.includes('JSON object requested')) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao atualizar plano no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.delete('/api/plans/:id', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A exclusão não foi concluída.',
      });
    }

    try {
      await deleteSupabasePlan(req.params.id, user.id, user.role === 'admin');
      return res.json({ success: true, message: 'Plano excluído com sucesso' });
    } catch (err: any) {
      if (err.message?.includes('ID_INVALID')) {
        return res.status(404).json({ error: 'Plano não encontrado' });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao excluir plano no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  // 5. APPLICATIONS CRUD
  app.get('/api/applications', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento.',
      });
    }

    try {
      const apps = await getSupabaseApplications(user.id, user.role === 'admin');
      return res.json(apps);
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao consultar aplicativos no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.post('/api/applications', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. O aplicativo não foi salvo.',
      });
    }

    const { name, description, notes, status } = req.body;
    if (!name) return res.status(400).json({ error: 'Nome do aplicativo é obrigatório' });

    try {
      const newApp = await createSupabaseApplication(user.id, {
        name,
        description,
        notes,
        status,
      });
      return res.status(201).json(newApp);
    } catch (err: any) {
      if (err.message?.includes('PROFILE_NOT_FOUND')) {
        return res.status(409).json({
          error: 'PROFILE_NOT_FOUND',
          message: 'Perfil do revendedor não encontrado na tabela public.profiles do Supabase. Cadastre ou sincronize o perfil antes de criar aplicativos.',
        });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao criar aplicativo no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.put('/api/applications/:id', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A alteração não foi salva.',
      });
    }

    const { name, description, notes, status } = req.body;

    try {
      const updatedApp = await updateSupabaseApplication(
        req.params.id,
        user.id,
        {
          name,
          description,
          notes,
          status,
        },
        user.role === 'admin'
      );
      return res.json(updatedApp);
    } catch (err: any) {
      if (err.message?.includes('ID_INVALID') || err.message?.includes('JSON object requested')) {
        return res.status(404).json({ error: 'Aplicativo não encontrado' });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao atualizar aplicativo no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  app.delete('/api/applications/:id', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    if (!isSupabaseServerConfigured || !supabaseAdmin) {
      return res.status(503).json({
        error: 'DATABASE_UNAVAILABLE',
        message: 'Serviço de banco de dados Supabase indisponível no momento. A exclusão não foi concluída.',
      });
    }

    try {
      await deleteSupabaseApplication(req.params.id, user.id, user.role === 'admin');
      return res.json({ success: true, message: 'Aplicativo excluído com sucesso' });
    } catch (err: any) {
      if (err.message?.includes('ID_INVALID')) {
        return res.status(404).json({ error: 'Aplicativo não encontrado' });
      }
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao excluir aplicativo no banco de dados: ${err.message || String(err)}`,
      });
    }
  });

  // 6. WHATSAPP & EVOLUTION API SETTINGS & INSTANCES
  app.get('/api/whatsapp/settings', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const evolution = await getActiveEvolutionConfig();
      const instanceName = getResellerInstanceName(user.id);

      let ws: any = null;
      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          ws = await ensureSupabaseWhatsAppSettings(user.id);
        } catch (supErr) {
          console.warn('Alerta ao consultar whatsapp_settings no Supabase:', supErr);
        }
      }

      if (!ws) {
        ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
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
      }

      return res.json({
        instance_name: instanceName,
        is_connected: Boolean(ws.is_connected),
        auto_billing_enabled: Boolean(ws.auto_billing_enabled),
        central_configured: evolution.isConfigured,
        last_checked_at: ws.last_checked_at,
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao carregar configurações do WhatsApp: ${err.message || String(err)}`,
      });
    }
  });

  app.post('/api/whatsapp/settings', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const { auto_billing_enabled } = req.body;
      const evolution = await getActiveEvolutionConfig();
      const instanceName = getResellerInstanceName(user.id);
      const isEnabled = Boolean(auto_billing_enabled);

      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          await updateSupabaseWhatsAppSettings(user.id, {
            auto_billing_enabled: isEnabled,
          });
        } catch (supErr: any) {
          console.error('Erro ao salvar whatsapp_settings no Supabase:', supErr);
          return res.status(500).json({
            error: 'DATABASE_ERROR',
            message: `Falha ao salvar configurações do WhatsApp no Supabase: ${supErr.message || String(supErr)}`,
          });
        }
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
          auto_billing_enabled: isEnabled,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        db.whatsapp_settings.push(ws);
      } else {
        ws.auto_billing_enabled = isEnabled;
        ws.updated_at = new Date().toISOString();
      }
      saveDB(db);

      return res.json({ success: true, message: 'Configurações do WhatsApp salvas com sucesso' });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao processar configurações do WhatsApp: ${err.message || String(err)}`,
      });
    }
  });

  // Query individual reseller instance status from Evolution API
  app.get('/api/whatsapp/instance/status', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const evolution = await getActiveEvolutionConfig();
      const instanceName = getResellerInstanceName(user.id);

      let ws: any = null;
      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          ws = await ensureSupabaseWhatsAppSettings(user.id);
        } catch (supErr) {
          console.warn('Alerta ao consultar status no Supabase:', supErr);
        }
      }

      if (!ws) {
        ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
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

      const nowIso = new Date().toISOString();

      if (response.status === 404) {
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
          updateSupabaseWhatsAppSettings(user.id, { is_connected: false, last_checked_at: nowIso }).catch(() => {});
        }
        ws.is_connected = false;
        ws.last_checked_at = nowIso;
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
      ws.last_checked_at = nowIso;

      if (response.ok && state === 'open') {
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
          updateSupabaseWhatsAppSettings(user.id, { is_connected: true, last_checked_at: nowIso }).catch(() => {});
        }
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
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
          updateSupabaseWhatsAppSettings(user.id, { is_connected: false, last_checked_at: nowIso }).catch(() => {});
        }
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
        if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
          updateSupabaseWhatsAppSettings(user.id, { is_connected: false, last_checked_at: nowIso }).catch(() => {});
        }
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
      const evolution = await getActiveEvolutionConfig();
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
      const evolution = await getActiveEvolutionConfig();
      const instanceName = getResellerInstanceName(user.id);
      const nowIso = new Date().toISOString();

      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          await updateSupabaseWhatsAppSettings(user.id, {
            is_connected: false,
            last_checked_at: nowIso,
          });
        } catch (supErr) {
          console.warn('Erro ao atualizar desconexão do WhatsApp no Supabase:', supErr);
        }
      }

      let ws = db.whatsapp_settings.find((w) => isUserMatch(w.user_id, user));
      if (ws) {
        ws.is_connected = false;
        ws.last_checked_at = nowIso;
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
    const evolution = await getActiveEvolutionConfig();
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
      const isConnected = response.ok && state === 'open';
      const nowIso = new Date().toISOString();

      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          await updateSupabaseWhatsAppSettings(user.id, {
            is_connected: isConnected,
            last_checked_at: nowIso,
          });
        } catch (supErr) {
          console.warn('Alerta ao atualizar status da conexão no Supabase:', supErr);
        }
      }

      if (ws) {
        ws.last_checked_at = nowIso;
        ws.is_connected = isConnected;
        saveDB(db);
      }

      if (isConnected) {
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
      const nowIso = new Date().toISOString();
      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        updateSupabaseWhatsAppSettings(user.id, { is_connected: false, last_checked_at: nowIso }).catch(() => {});
      }
      if (ws) {
        ws.is_connected = false;
        ws.last_checked_at = nowIso;
        saveDB(db);
      }
      return res.status(502).json({
        is_connected: false,
        error: `Não foi possível conectar ao servidor de WhatsApp: ${err.message}`,
      });
    }
  });

  // Send Test Message
  app.post('/api/whatsapp/send-test', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    const { test_number, message } = req.body;

    const phoneValidation = validateWhatsAppNumber(test_number);
    if (!phoneValidation.valid) {
      return res.status(400).json({ error: phoneValidation.error });
    }

    const evolution = await getActiveEvolutionConfig();
    if (!evolution.isConfigured) {
      return res.status(400).json({
        error: 'A Evolution API não está configurada centralmente pelo Administrador Master no painel.',
      });
    }

    // Instance derived exclusively from authenticated user id
    const targetInstance = getResellerInstanceName(user.id);

    // Anti-duplication lock: check atomic memory lock and recent logs
    const lockKey = `test:${user.id}:${phoneValidation.normalized}`;
    if (!acquireSendLock(lockKey, 15000) || checkRecentDuplicateSend(user.id, phoneValidation.normalized, undefined, 15)) {
      return res.status(429).json({
        error: 'DUPLICATE_SEND_BLOCKED',
        message: 'Envio duplicado bloqueado: uma mensagem para este número já foi disparada recentemente. Aguarde 15 segundos.',
      });
    }

    const testText = message || 'Olá! Esta é uma mensagem de teste enviada com sucesso pelo Gestor FLIX via WhatsApp! 🚀';

    try {
      const cleanApiUrl = evolution.cleanUrl.replace(/\/+$/, '');
      const endpoint = `${cleanApiUrl}/message/sendText/${encodeURIComponent(targetInstance)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolution.apiKey,
        },
        body: JSON.stringify({
          number: phoneValidation.normalized,
          text: testText,
          delay: 1000,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));
      const sanitized = sanitizeEvolutionResponse(data);

      if (response.ok) {
        db.message_logs.unshift({
          id: 'log-test-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
          user_id: user.id,
          customer_id: 'test',
          customer_name: 'Teste de Instância',
          whatsapp: phoneValidation.normalized,
          message_type: 'manual',
          cycle_date: new Date().toISOString().slice(0, 10),
          scheduled_for: 'Imediato',
          attempted_at: new Date().toISOString(),
          status: 'sent',
          response_payload: JSON.stringify(sanitized),
          idempotency_key: `test_${user.id}_${Date.now()}`,
          created_at: new Date().toISOString(),
        });
        saveDB(db);

        return res.json({
          success: true,
          message: 'Mensagem aceita pela Evolution API para processamento.',
          tracking: sanitized,
        });
      } else {
        checkAndHandleInstanceDisconnect(user.id, response.status, data);
        return res.status(400).json({
          error: `Falha no envio retornado pela Evolution API: ${data?.message || data?.error || `HTTP ${response.status}`}`,
        });
      }
    } catch (err: any) {
      return res.status(502).json({ error: `Erro ao enviar via WhatsApp: ${err.message}` });
    }
  });

  // Send Manual Notification to Customer
  app.post('/api/whatsapp/send-manual', authenticateUser, requireActiveSubscription, async (req, res) => {
    const user = (req as any).user;
    const { customer_id, template_type, custom_text } = req.body;

    if (!customer_id) {
      return res.status(400).json({ error: 'Identificador do cliente é obrigatório.' });
    }

    let cust: any = null;
    let plan: any = null;

    if (isSupabaseServerConfigured && supabaseAdmin) {
      try {
        const supabaseCustomers = await getSupabaseCustomers(user.id, user.role === 'admin');
        cust = supabaseCustomers.find((c) => c.id === customer_id);
        if (cust && cust.plan_id) {
          const supabasePlans = await getSupabasePlans(user.id, user.role === 'admin');
          plan = supabasePlans.find((p) => p.id === cust.plan_id);
        }
      } catch (err) {
        console.error('Falha ao buscar cliente no Supabase para envio manual:', err);
      }
    }

    if (!cust) {
      cust = db.customers.find((c) => c.id === customer_id && isUserMatch(c.user_id, user));
      if (cust && cust.plan_id) {
        plan = db.plans.find((p) => p.id === cust.plan_id);
      }
    }

    if (!cust) {
      return res.status(404).json({ error: 'Cliente não encontrado ou não pertence a esta conta.' });
    }

    const phoneValidation = validateWhatsAppNumber(cust.whatsapp);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        error: `Número de WhatsApp do cliente é inválido (${cust.whatsapp || 'vazio'}). Atualize o cadastro do cliente antes de enviar.`,
      });
    }

    const evolution = await getActiveEvolutionConfig();
    if (!evolution.isConfigured) {
      return res.status(400).json({
        error: 'A Evolution API não está configurada centralmente pelo Administrador Master no painel.',
      });
    }

    // Instance derived exclusively from authenticated reseller
    const targetInstance = getResellerInstanceName(user.id);

    // Anti-duplication lock: debounce 15s per customer/user
    const lockKey = `manual:${user.id}:${cust.id}`;
    if (!acquireSendLock(lockKey, 15000) || checkRecentDuplicateSend(user.id, phoneValidation.normalized, cust.id, 15)) {
      return res.status(429).json({
        error: 'DUPLICATE_SEND_BLOCKED',
        message: 'Envio duplicado bloqueado: uma mensagem para este destinatário já foi disparada recentemente. Aguarde 15 segundos antes de reenviar.',
      });
    }
    const planName = plan ? plan.name : 'Plano IPTV';
    const planPrice = plan ? `R$ ${plan.price.toFixed(2).replace('.', ',')}` : 'R$ 0,00';
    const formattedDate = formatDateBR(cust.expiration_date);

    let messageText = custom_text;
    if (!messageText) {
      let templates: any[] = [];
      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          templates = await getSupabaseMessageTemplates(user.id);
        } catch (e) {
          console.warn('Erro ao carregar templates do Supabase em send-manual:', e);
        }
      }
      if (!templates || templates.length === 0) {
        templates = db.message_templates.filter((t) => isUserMatch(t.user_id, user));
      }
      const chosenTpl = templates.find((t) => t.type === template_type) || templates[0];
      messageText = chosenTpl ? chosenTpl.template_text : 'Olá, {nome}! Seu plano {plano} vence em {vencimento}.';
    }

    messageText = messageText
      .replace(/{nome}/g, cust.name)
      .replace(/{plano}/g, planName)
      .replace(/{valor}/g, planPrice)
      .replace(/{vencimento}/g, formattedDate)
      .replace(/{whatsapp}/g, cust.whatsapp);

    try {
      const cleanApiUrl = evolution.cleanUrl.replace(/\/+$/, '');
      const endpoint = `${cleanApiUrl}/message/sendText/${encodeURIComponent(targetInstance)}`;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          apikey: evolution.apiKey,
        },
        body: JSON.stringify({
          number: phoneValidation.normalized,
          text: messageText,
          delay: 1000,
        }),
        signal: AbortSignal.timeout(10000),
      });

      const data = await response.json().catch(() => ({}));
      const sanitized = sanitizeEvolutionResponse(data);

      const logEntry = {
        id: 'log-manual-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        user_id: user.id,
        customer_id: cust.id,
        customer_name: cust.name,
        whatsapp: phoneValidation.normalized,
        message_type: 'manual' as const,
        cycle_date: cust.expiration_date,
        scheduled_for: 'Envio manual',
        attempted_at: new Date().toISOString(),
        status: (response.ok ? 'sent' : 'failed') as any,
        response_payload: JSON.stringify(sanitized),
        error_details: response.ok ? undefined : String(data?.message || data?.error || `HTTP ${response.status}`),
        idempotency_key: `manual_${user.id}_${cust.id}_${Date.now()}`,
        created_at: new Date().toISOString(),
      };

      db.message_logs.unshift(logEntry);
      saveDB(db);

      if (response.ok) {
        return res.json({
          success: true,
          message: 'Mensagem aceita pela Evolution API para processamento.',
          tracking: sanitized,
        });
      } else {
        checkAndHandleInstanceDisconnect(user.id, response.status, data);
        return res.status(400).json({
          error: 'Erro no envio retornado pela Evolution API',
          details: data?.message || data?.error || `HTTP ${response.status}`,
        });
      }
    } catch (err: any) {
      return res.status(502).json({ error: `Falha na requisição: ${err.message}` });
    }
  });

  // 7. BILLING SETTINGS & TEMPLATES
  app.get('/api/billing/settings', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      let bs: any = null;

      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          bs = await ensureSupabaseBillingSettings(user.id);
        } catch (supErr) {
          console.warn('Erro ao buscar billing_settings no Supabase:', supErr);
        }
      }

      if (!bs) {
        bs = db.billing_settings.find((b) => isUserMatch(b.user_id, user));
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
      }

      return res.json(bs);
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao carregar horários de cobrança: ${err.message || String(err)}`,
      });
    }
  });

  app.post('/api/billing/settings', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
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

      const payload: any = {};
      if (timezone) payload.timezone = timezone;
      if (send_day_before !== undefined) payload.send_day_before = Boolean(send_day_before);
      if (time_day_before) payload.time_day_before = time_day_before;
      if (send_day_of_morning !== undefined) payload.send_day_of_morning = Boolean(send_day_of_morning);
      if (time_day_of_morning) payload.time_day_of_morning = time_day_of_morning;
      if (send_day_of_night !== undefined) payload.send_day_of_night = Boolean(send_day_of_night);
      if (time_day_of_night) payload.time_day_of_night = time_day_of_night;
      if (send_day_after !== undefined) payload.send_day_after = Boolean(send_day_after);
      if (time_day_after) payload.time_day_after = time_day_after;

      let savedBs: any = null;
      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          savedBs = await updateSupabaseBillingSettings(user.id, payload);
        } catch (supErr: any) {
          console.error('Erro ao salvar billing_settings no Supabase:', supErr);
          return res.status(500).json({
            error: 'DATABASE_ERROR',
            message: `Falha ao salvar horários de cobrança no banco de dados: ${supErr.message || String(supErr)}`,
          });
        }
      }

      // Sincroniza cache local db.json
      let localBs = db.billing_settings.find((b) => isUserMatch(b.user_id, user));
      if (!localBs) {
        localBs = {
          id: savedBs?.id || ('bs-' + user.id),
          user_id: user.id,
          timezone: timezone || 'America/Sao_Paulo',
          send_day_before: send_day_before !== undefined ? Boolean(send_day_before) : true,
          time_day_before: time_day_before || '09:00',
          send_day_of_morning: send_day_of_morning !== undefined ? Boolean(send_day_of_morning) : true,
          time_day_of_morning: time_day_of_morning || '09:00',
          send_day_of_night: send_day_of_night !== undefined ? Boolean(send_day_of_night) : true,
          time_day_of_night: time_day_of_night || '19:00',
          send_day_after: send_day_after !== undefined ? Boolean(send_day_after) : true,
          time_day_after: time_day_after || '10:00',
        };
        db.billing_settings.push(localBs);
      } else {
        if (timezone) localBs.timezone = timezone;
        if (send_day_before !== undefined) localBs.send_day_before = Boolean(send_day_before);
        if (time_day_before) localBs.time_day_before = time_day_before;
        if (send_day_of_morning !== undefined) localBs.send_day_of_morning = Boolean(send_day_of_morning);
        if (time_day_of_morning) localBs.time_day_of_morning = time_day_of_morning;
        if (send_day_of_night !== undefined) localBs.send_day_of_night = Boolean(send_day_of_night);
        if (time_day_of_night) localBs.time_day_of_night = time_day_of_night;
        if (send_day_after !== undefined) localBs.send_day_after = Boolean(send_day_after);
        if (time_day_after) localBs.time_day_after = time_day_after;
      }
      saveDB(db);

      return res.json({
        success: true,
        settings: savedBs || localBs,
        message: 'Horários de cobrança salvos!',
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao processar horários de cobrança: ${err.message || String(err)}`,
      });
    }
  });

  // Templates
  app.get('/api/billing/templates', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      let templates: any[] = [];

      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          templates = await ensureSupabaseMessageTemplates(user.id);
        } catch (supErr) {
          console.warn('Erro ao carregar message_templates do Supabase:', supErr);
        }
      }

      if (!templates || templates.length === 0) {
        templates = db.message_templates.filter((t) => isUserMatch(t.user_id, user));
      }

      return res.json(templates);
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao carregar modelos de mensagem: ${err.message || String(err)}`,
      });
    }
  });

  app.put('/api/billing/templates/:type', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const { type } = req.params;
      const { template_text } = req.body;

      if (!template_text || typeof template_text !== 'string' || !template_text.trim()) {
        return res.status(400).json({ error: 'Texto do modelo é obrigatório' });
      }

      if (!['day_before', 'day_of', 'day_after'].includes(type)) {
        return res.status(400).json({ error: 'Tipo de modelo inválido. Deve ser day_before, day_of ou day_after' });
      }

      let savedTemplate: any = null;
      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        try {
          savedTemplate = await updateSupabaseMessageTemplate(user.id, type, template_text);
        } catch (supErr: any) {
          console.error('Erro ao atualizar modelo de mensagem no Supabase:', supErr);
          return res.status(500).json({
            error: 'DATABASE_ERROR',
            message: `Falha ao salvar modelo no banco de dados: ${supErr.message || String(supErr)}`,
          });
        }
      }

      // Sincroniza cache local db.json
      let tpl = db.message_templates.find((t) => isUserMatch(t.user_id, user) && t.type === type);
      if (!tpl) {
        tpl = {
          id: savedTemplate?.id || ('tpl-' + type + '-' + user.id),
          user_id: user.id,
          type: type as any,
          title: type === 'day_before' ? 'Lembrete de Vencimento' : type === 'day_of' ? 'Lembrete no Dia' : 'Aviso de Vencimento Atrasado',
          template_text: template_text.trim(),
          updated_at: new Date().toISOString(),
        };
        db.message_templates.push(tpl);
      } else {
        tpl.template_text = template_text.trim();
        tpl.updated_at = new Date().toISOString();
      }
      saveDB(db);

      return res.json({
        success: true,
        template: savedTemplate || tpl,
        message: 'Modelo salvo com sucesso!',
      });
    } catch (err: any) {
      return res.status(500).json({
        error: 'DATABASE_ERROR',
        message: `Falha ao processar modelo de mensagem: ${err.message || String(err)}`,
      });
    }
  });

  // Manual Trigger Billing Cycle (Worker)
  app.post('/api/billing/trigger-cycle', authenticateUser, requireActiveSubscription, async (req, res) => {
    try {
      const user = (req as any).user;
      // Reseller dispara para seus próprios clientes; Admin pode disparar para um gestor específico ou para todos
      const targetUserId = user.role === 'admin'
        ? (req.query.user_id ? String(req.query.user_id) : (req.query.all === 'true' ? undefined : user.id))
        : user.id;
      const isSimulated = req.query.simulate === 'true' || req.headers['x-simulate-evolution'] === 'true';

      const result = await runBillingCycleCheck(targetUserId, {
        isManual: true,
        simulateEvolution: isSimulated,
      });
      return res.json({
        success: true,
        message: result.message,
        details: result,
      });
    } catch (err: any) {
      return res.status(500).json({ error: 'Erro ao executar ciclo de cobrança: ' + err.message });
    }
  });

  // 8. MESSAGE LOGS (HISTORY - Supabase PostgreSQL como Fonte de Verdade)
  app.get('/api/billing/logs', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      let logs: any[] = [];
      if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(user.id)) {
        logs = await getSupabaseMessageLogs(user.role === 'admin' ? undefined : user.id);
      }
      if (!logs || logs.length === 0) {
        logs = db.message_logs.filter((l) => isUserMatch(l.user_id, user));
      }
      return res.json(logs);
    } catch (err: any) {
      console.warn('Erro ao consultar logs de cobrança no Supabase:', err);
      const user = (req as any).user;
      const logs = db.message_logs.filter((l) => isUserMatch(l.user_id, user));
      return res.json(logs);
    }
  });

  // 9. SAAS SUBSCRIPTION & PAYMENT INFO
  app.get('/api/subscription/info', authenticateUser, async (req, res) => {
    const user = (req as any).user;
    const subCheck = await checkUserSubscription(user.id, user.legacy_id, user.role);
    const sub = subCheck.subscription || db.subscriptions.find((s) => isUserMatch(s.user_id, user));
    const saas = db.saas_settings;

    let mpConfig: any = { configured: false, enabled: false };
    let pendingPayment: any = null;
    try {
      mpConfig = await getMercadoPagoConfig();
      pendingPayment = await findRecentPendingPayment(user.id);
    } catch (e: any) {
      console.warn('Falha não-bloqueante ao verificar status Mercado Pago:', e?.message);
    }

    const isLifetime =
      subCheck.isLifetime ||
      sub?.notes === 'vitalicio' ||
      (typeof sub?.payment_reference === 'string' && sub.payment_reference.startsWith('MP_')) ||
      (sub?.current_period_end && new Date(sub.current_period_end).getFullYear() >= 2090);

    return res.json({
      subscription: {
        ...subCheck,
        isLifetime: Boolean(isLifetime),
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
      mercadopago: {
        available: Boolean(mpConfig.configured && mpConfig.enabled),
        price: 99.90,
        currency: 'BRL',
        title: 'Licença Vitalícia Gestor FLIX',
        pending_payment: pendingPayment
          ? {
              id: pendingPayment.id,
              mercado_pago_payment_id: pendingPayment.mercado_pago_payment_id,
              status: pendingPayment.status,
              amount: pendingPayment.amount,
              qr_code: pendingPayment.qr_code,
              qr_code_base64: pendingPayment.qr_code_base64,
              ticket_url: pendingPayment.ticket_url,
              expires_at: pendingPayment.expires_at,
            }
          : null,
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

        const { data: supCustomers } = await supabaseAdmin
          .from('customers')
          .select('id, user_id');

        const { data: supWsSettings } = await supabaseAdmin
          .from('whatsapp_settings')
          .select('user_id, is_connected');

        if (profiles) {
          for (const p of profiles) {
            const emailKey = (p.email || '').toLowerCase();
            const existing = userMap.get(emailKey);
            const supSub = subs?.find((s) => s.user_id === p.id);
            const supabaseCustCount = supCustomers?.filter((c) => c.user_id === p.id).length || 0;
            const legacyCustCount = db.customers.filter((c) => c.user_id === p.id || (existing && c.user_id === existing.id)).length;
            const custCount = supabaseCustCount + legacyCustCount;
            const ws = db.whatsapp_settings.find((w) => w.user_id === p.id || (existing && w.user_id === existing.id));
            const supWs = supWsSettings?.find((w) => w.user_id === p.id);
            const isWhatsAppConnected = supWs !== undefined ? Boolean(supWs.is_connected) : Boolean(ws?.is_connected);

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
              whatsapp_connected: isWhatsAppConnected,
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
  app.get('/api/admin/evolution/settings', authenticateUser, requireAdmin, async (_req, res) => {
    try {
      const config = await loadEvolutionGlobalConfigAsync();
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

  app.post('/api/admin/evolution/settings', authenticateUser, requireAdmin, async (req, res) => {
    try {
      const user = (req as any).user;
      const { api_url, api_key } = req.body || {};

      const current = await loadEvolutionGlobalConfigAsync();

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

      // 1. Gravação prioritária e persistente no Supabase (compartilhada entre AI Studio e gestorflix.online)
      if (isSupabaseServerConfigured && supabaseAdmin) {
        await updateSupabaseCentralEvolutionConfig({
          api_url: current.api_url,
          api_key: current.api_key,
          updated_by: current.updated_by,
        });
      }

      // 2. Gravação de espelho local (para compatibilidade e execução offline)
      saveEvolutionGlobalConfig(current);

      // Invalida cache imediato
      cachedEvolutionConfig = current;
      lastEvolutionCacheTime = Date.now();

      const hasApiKey = Boolean(current.api_key && current.api_key.trim().length > 0);

      return res.json({
        success: true,
        message: 'Configurações centrais da Evolution API salvas com sucesso no Supabase e sincronizadas!',
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
      const saved = await loadEvolutionGlobalConfigAsync();

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

      // 1. Diagnóstico de Saúde / Alcance do Servidor (GET /)
      let detectedVersion: string | null = null;
      let isHostOnline = false;
      try {
        const rootResponse = await fetch(`${cleanUrl}/`, {
          method: 'GET',
          signal: AbortSignal.timeout(6000),
        });
        if (rootResponse.ok) {
          isHostOnline = true;
          const rootData = await rootResponse.json().catch(() => null);
          if (rootData && typeof rootData.version === 'string') {
            detectedVersion = rootData.version;
          }
        }
      } catch (rootErr) {
        // Host inacessível ou timeout inicial
      }

      // 2. Consulta de Autenticação e Instâncias (GET /instance/fetchInstances com apikey)
      // Usamos 30 segundos pois servidores Evolution com dezenas de instâncias ativas levam mais de 10s para responder
      const endpoint = `${cleanUrl}/instance/fetchInstances`;

      const response = await fetch(endpoint, {
        method: 'GET',
        headers: {
          apikey: testKey,
        },
        signal: AbortSignal.timeout(30000),
      });

      if (response.ok) {
        const body = await response.json().catch(() => null);
        let count = 0;
        if (Array.isArray(body)) {
          count = body.length;
        } else if (body && Array.isArray(body.instances)) {
          count = body.instances.length;
        }

        const versionStr = detectedVersion ? ` v${detectedVersion}` : '';
        return res.json({
          success: true,
          status: response.status,
          message: `Conexão estabelecida com sucesso com a Evolution API${versionStr}! Credencial global validada.`,
          instance_count: count,
        });
      } else if (response.status === 401 || response.status === 403) {
        return res.status(response.status).json({
          success: false,
          status: response.status,
          error: `Falha de autenticação (HTTP ${response.status}): Global API Key inválida ou rejeitada pelo servidor Evolution.`,
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
          ? 'Tempo limite de conexão excedido (30s). O servidor Evolution API respondeu lentamente na listagem de instâncias.'
          : `Falha ao conectar à Evolution API: ${err.message || 'Erro de rede ou DNS/SSL'}`,
      });
    }
  });

  // ====================================================================
  // MERCADO PAGO INTEGRATION (PIX LIFETIME LICENSE R$ 99,90)
  // ====================================================================

  // 1. ADMIN: Obter configurações do Mercado Pago (Segurança: restrito ao Master Admin; token mascarado, nunca exposto)
  app.get('/api/admin/mercadopago/settings', authenticateUser, requireMasterAdmin, async (_req, res) => {
    try {
      const config = await getMercadoPagoConfig();
      return res.json({
        configured: config.configured,
        enabled: config.enabled,
        has_token: config.has_token,
        masked_token: config.masked_token,
        notification_url: config.notification_url || config.webhook_url,
        has_webhook_secret: config.has_webhook_secret,
        updated_at: config.updated_at,
      });
    } catch (err: any) {
      console.error('Erro ao consultar configurações do Mercado Pago:', err);
      return res.status(500).json({ error: 'Falha ao recuperar configurações do Mercado Pago' });
    }
  });

  // 2. ADMIN: Salvar configurações do Mercado Pago (Segurança: restrito ao Master Admin)
  app.post('/api/admin/mercadopago/settings', authenticateUser, requireMasterAdmin, async (req, res) => {
    try {
      const { access_token, enabled, notification_url, webhook_secret } = req.body || {};
      const updated = await saveMercadoPagoConfig({
        access_token: typeof access_token === 'string' ? access_token.trim() : undefined,
        enabled: typeof enabled === 'boolean' ? enabled : undefined,
        webhook_url: typeof notification_url === 'string' ? notification_url.trim() : undefined,
        webhook_secret: typeof webhook_secret === 'string' ? webhook_secret.trim() : undefined,
      });

      return res.json({
        success: true,
        message: 'Configurações do Mercado Pago salvas com sucesso!',
        config: {
          configured: updated.configured,
          enabled: updated.enabled,
          has_token: Boolean(updated.access_token_masked),
          masked_token: updated.access_token_masked,
          notification_url: updated.webhook_url,
          has_webhook_secret: updated.has_webhook_secret,
          updated_at: updated.updated_at,
        },
      });
    } catch (err: any) {
      console.error('Erro ao salvar configurações do Mercado Pago:', err);
      return res.status(500).json({
        error: err.message || 'Falha ao salvar configurações do Mercado Pago',
      });
    }
  });

  // 3. ADMIN: Testar conectividade real com a API do Mercado Pago (Segurança: restrito ao Master Admin)
  app.post('/api/admin/mercadopago/test', authenticateUser, requireMasterAdmin, async (req, res) => {
    try {
      const { access_token } = req.body || {};
      const testResult = await testMercadoPagoConnection(
        typeof access_token === 'string' && access_token.trim() ? access_token.trim() : undefined
      );

      if (testResult.success) {
        return res.json({
          success: true,
          status: testResult.status || 200,
          user_id: testResult.account_id,
          nickname: testResult.nickname,
          site_id: testResult.site_id,
          message: testResult.message,
        });
      } else {
        return res.status(400).json({
          success: false,
          status: testResult.status || 400,
          failed_endpoint: testResult.failed_endpoint,
          error_details: testResult.error_details,
          message: testResult.message,
        });
      }
    } catch (err: any) {
      return res.status(502).json({
        success: false,
        message: `Falha na verificação de conectividade com Mercado Pago: ${err.message || 'Erro inesperado'}`,
      });
    }
  });

  // 4. USUÁRIO: Criar cobrança Pix no valor de R$ 99,90 para Licença Vitalícia
  app.post('/api/payments/pix', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      if (!user || !user.id) {
        return res.status(401).json({ error: 'Usuário não autenticado' });
      }

      const reqBaseUrl = `${req.protocol}://${req.get('host')}`;

      const result = await createPixCharge({
        userId: user.id,
        userEmail: user.email || 'contato@gestorflix.online',
        userName: user.name || user.email?.split('@')[0] || 'Revendedor Gestor FLIX',
        serverBaseUrl: reqBaseUrl,
      });

      const payment = result.payment;
      return res.json({
        success: true,
        payment: {
          id: payment.id,
          mercado_pago_payment_id: payment.mercado_pago_payment_id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          qr_code: payment.qr_code,
          qr_code_base64: payment.qr_code_base64,
          ticket_url: payment.ticket_url,
          expires_at: payment.expires_at,
          created_at: payment.created_at,
        },
      });
    } catch (err: any) {
      console.error('Erro ao gerar pagamento Pix via Mercado Pago:', err);
      return res.status(400).json({
        error: err.message || 'Não foi possível gerar a cobrança Pix no momento.',
      });
    }
  });

  // 5. USUÁRIO: Consultar status de pagamento e acionar sincronização
  app.get('/api/payments/status/:id', authenticateUser, async (req, res) => {
    try {
      const user = (req as any).user;
      const paymentId = req.params.id;

      let payment = await findPaymentByIdOrMpId(paymentId);
      if (!payment) {
        return res.status(404).json({ error: 'Registro de pagamento não localizado' });
      }

      if (payment.user_id !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: 'Acesso negado a este pagamento' });
      }

      if (payment.status === 'pending' && payment.mercado_pago_payment_id) {
        const verifyRes = await verifyAndProcessPayment(payment.mercado_pago_payment_id);
        if (verifyRes.paymentRecord) {
          payment = verifyRes.paymentRecord;
        }
      }

      const isApproved = payment.status === 'approved';
      return res.json({
        success: true,
        payment: {
          id: payment.id,
          mercado_pago_payment_id: payment.mercado_pago_payment_id,
          status: payment.status,
          amount: payment.amount,
          is_approved: isApproved,
          activated: isApproved,
          paid_at: payment.paid_at || payment.approved_at,
          expires_at: payment.expires_at,
        },
      });
    } catch (err: any) {
      console.error('Erro ao verificar status do pagamento:', err);
      return res.status(500).json({ error: 'Erro ao verificar status do pagamento' });
    }
  });

  // 6. WEBHOOK: Recepção pública oficial de notificações do Mercado Pago
  app.post('/api/webhooks/mercadopago', async (req, res) => {
    try {
      const body = req.body || {};
      const query = req.query || {};

      const paymentId =
        body?.data?.id ||
        body?.id ||
        query?.['data.id'] ||
        query?.id;

      const eventType = body?.type || body?.action || query?.topic || query?.type || 'unknown';

      // Responde imediatamente com 200 OK
      res.status(200).json({ received: true, timestamp: new Date().toISOString() });

      if (!paymentId) {
        return;
      }

      const xSignature = req.headers['x-signature'] as string | undefined;
      const xRequestId = req.headers['x-request-id'] as string | undefined;
      const mpConfig = await getMercadoPagoConfig();

      if (mpConfig.webhook_secret) {
        const sigResult = verifyMercadoPagoSignature(
          xSignature,
          xRequestId,
          String(paymentId),
          mpConfig.webhook_secret
        );
        if (!sigResult.valid) {
          console.warn(`[Webhook MP] Assinatura rejeitada (${sigResult.reason}) para pagamento ${paymentId}`);
          return;
        }
      } else {
        console.warn(`[Webhook MP] Segredo de webhook não configurado no servidor. Prosseguindo com consulta autoritativa direta na API oficial do Mercado Pago para ID ${paymentId}.`);
      }

      console.log(`[Webhook MP] Processando notificação de pagamento ID: ${paymentId} (${eventType})`);
      const processResult = await verifyAndProcessPayment(String(paymentId));
      if (processResult.success && processResult.approved) {
        console.log(`[Webhook MP] Licença vitalícia ${processResult.alreadyProcessed ? 'confirmada (idempotente)' : 'ativada'} com sucesso para usuário: ${processResult.userId}`);
      }
    } catch (err: any) {
      console.error('[Webhook MP] Erro ao processar webhook Mercado Pago:', err.message);
      if (!res.headersSent) {
        res.status(200).json({ received: true, error: err.message });
      }
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

  // ROTA DE SAÚDE SIMPLES DO PROCESSO EXPRESS (FASE 10.1)
  app.get('/health', (_req, res) => {
    return res.status(200).json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
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

if (process.env.NODE_ENV !== 'test' && !process.env.TEST_RUNNER) {
  startServer().catch((err) => {
    console.error('Falha crítica ao iniciar servidor:', err);
    process.exit(1);
  });
}
