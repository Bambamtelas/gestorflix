import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import {
  supabaseAdmin,
  isSupabaseServerConfigured,
  isValidUUID,
} from './supabaseAdmin';

export const PIX_LIFETIME_PRICE = 99.90;

const MP_CONFIG_FILE = path.resolve(process.cwd(), 'data/mercadopago-config.json');

export interface MercadoPagoConfig {
  configured: boolean;
  enabled: boolean;
  access_token: string;
  has_token: boolean;
  masked_token: string;
  webhook_secret: string;
  has_webhook_secret: boolean;
  webhook_url: string;
  notification_url: string;
  updated_at: string | null;
  updated_by?: string;
  source?: 'env' | 'supabase_admin_secrets' | 'file';
}

export interface PaymentRecord {
  id: string;
  user_id: string;
  external_reference: string;
  mercado_pago_payment_id?: string | null;
  amount: number;
  currency: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled' | 'refunded';
  qr_code?: string | null;
  qr_code_base64?: string | null;
  ticket_url?: string | null;
  payer_email?: string | null;
  license_type: string;
  created_at: string;
  updated_at: string;
  approved_at?: string | null;
  paid_at?: string | null;
  expires_at?: string | null;
}

export function maskToken(token: string): string {
  if (!token || token.length < 12) return '••••••••';
  const prefix = token.slice(0, 7);
  const suffix = token.slice(-4);
  return `${prefix}••••••••••••${suffix}`;
}

/**
 * Carrega a configuração do Mercado Pago do Supabase (tabela admin_secrets)
 */
async function loadConfigFromSupabase(): Promise<{
  access_token?: string;
  webhook_secret?: string;
  enabled?: boolean;
  webhook_url?: string;
  updated_at?: string;
} | null> {
  if (!isSupabaseServerConfigured || !supabaseAdmin) return null;
  try {
    const { data, error } = await supabaseAdmin
      .from('admin_secrets')
      .select('key, value, updated_at')
      .in('key', ['mp_access_token', 'mp_webhook_secret', 'mp_enabled', 'mp_webhook_url']);

    if (error || !data || data.length === 0) return null;

    const map = new Map(data.map((r: any) => [r.key, r.value]));
    let latestUpdatedAt: string | undefined = undefined;
    for (const r of data) {
      if (r.updated_at && (!latestUpdatedAt || r.updated_at > latestUpdatedAt)) {
        latestUpdatedAt = r.updated_at;
      }
    }

    return {
      access_token: map.get('mp_access_token') || '',
      webhook_secret: map.get('mp_webhook_secret') || '',
      enabled: map.has('mp_enabled') ? map.get('mp_enabled') === 'true' : undefined,
      webhook_url: map.get('mp_webhook_url') || '',
      updated_at: latestUpdatedAt,
    };
  } catch {
    return null;
  }
}

/**
 * Salva a configuração de forma persistente no Supabase (tabela admin_secrets)
 */
async function saveConfigToSupabase(payload: {
  access_token?: string;
  webhook_secret?: string;
  enabled?: boolean;
  webhook_url?: string;
}): Promise<boolean> {
  if (!isSupabaseServerConfigured || !supabaseAdmin) return false;
  try {
    const records = [];
    const now = new Date().toISOString();

    if (payload.access_token !== undefined) {
      records.push({ key: 'mp_access_token', value: payload.access_token, updated_at: now });
    }
    if (payload.webhook_secret !== undefined) {
      records.push({ key: 'mp_webhook_secret', value: payload.webhook_secret, updated_at: now });
    }
    if (payload.enabled !== undefined) {
      records.push({ key: 'mp_enabled', value: String(payload.enabled), updated_at: now });
    }
    if (payload.webhook_url !== undefined) {
      records.push({ key: 'mp_webhook_url', value: payload.webhook_url, updated_at: now });
    }

    if (records.length > 0) {
      const { error } = await supabaseAdmin
        .from('admin_secrets')
        .upsert(records, { onConflict: 'key' });

      if (error) {
        return false;
      }
      return true;
    }
    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Carrega a configuração do Mercado Pago:
 * Ordem de prioridade segura:
 * 1. Variáveis de ambiente (process.env.MERCADO_PAGO_ACCESS_TOKEN / MP_ACCESS_TOKEN)
 * 2. Banco de dados Supabase (tabela admin_secrets, restrita ao service_role)
 * 3. Arquivo local seguro (data/mercadopago-config.json)
 */
export async function getMercadoPagoConfig(): Promise<MercadoPagoConfig> {
  const envToken = (process.env.MERCADO_PAGO_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || '').trim();
  const envSecret = (process.env.MERCADO_PAGO_WEBHOOK_SECRET || process.env.MP_WEBHOOK_SECRET || '').trim();
  const envEnabled = process.env.MERCADO_PAGO_ENABLED === 'true' || process.env.MP_ENABLED === 'true';

  let dbConfig: any = null;
  try {
    dbConfig = await loadConfigFromSupabase();
  } catch {}

  let fileConfig: any = {};
  if (fs.existsSync(MP_CONFIG_FILE)) {
    try {
      fileConfig = JSON.parse(fs.readFileSync(MP_CONFIG_FILE, 'utf8'));
    } catch {
      fileConfig = {};
    }
  }

  let source: 'env' | 'supabase_admin_secrets' | 'file' = 'file';
  let effectiveToken = '';
  let effectiveSecret = '';
  let effectiveEnabled = true;
  let effectiveWebhookUrl = '';
  let effectiveUpdatedAt: string | null = null;

  if (envToken) {
    effectiveToken = envToken;
    effectiveSecret = envSecret;
    effectiveEnabled = envEnabled;
    source = 'env';
  } else {
    const hasDbToken = Boolean(dbConfig && dbConfig.access_token);
    const hasFileToken = Boolean(fileConfig && fileConfig.access_token);

    // Se ambos tiverem token, escolhe a configuração com updated_at mais recente
    let preferDb = hasDbToken;
    if (hasDbToken && hasFileToken) {
      const dbTime = dbConfig?.updated_at ? new Date(dbConfig.updated_at).getTime() : 0;
      const fileTime = fileConfig?.updated_at ? new Date(fileConfig.updated_at).getTime() : 0;
      const validDbTime = Number.isFinite(dbTime) ? dbTime : 0;
      const validFileTime = Number.isFinite(fileTime) ? fileTime : 0;
      if (validDbTime > 0 || validFileTime > 0) {
        preferDb = validDbTime >= validFileTime;
      }
    } else if (!hasDbToken && hasFileToken) {
      preferDb = false;
    }

    if (preferDb && dbConfig) {
      effectiveToken = dbConfig.access_token || '';
      effectiveSecret = dbConfig.webhook_secret || '';
      effectiveEnabled = typeof dbConfig.enabled === 'boolean' ? dbConfig.enabled : true;
      effectiveWebhookUrl = dbConfig.webhook_url || '';
      effectiveUpdatedAt = dbConfig.updated_at || null;
      source = 'supabase_admin_secrets';
    } else if (hasFileToken && fileConfig) {
      effectiveToken = fileConfig.access_token || '';
      effectiveSecret = fileConfig.webhook_secret || '';
      effectiveEnabled = typeof fileConfig.enabled === 'boolean' ? fileConfig.enabled : Boolean(effectiveToken);
      effectiveWebhookUrl = fileConfig.webhook_url || '';
      effectiveUpdatedAt = fileConfig.updated_at || null;
      source = 'file';
    } else {
      effectiveToken = dbConfig?.access_token || fileConfig?.access_token || '';
      effectiveSecret = dbConfig?.webhook_secret || fileConfig?.webhook_secret || '';
      effectiveEnabled = typeof fileConfig?.enabled === 'boolean' ? fileConfig.enabled : Boolean(effectiveToken);
      effectiveWebhookUrl = fileConfig?.webhook_url || dbConfig?.webhook_url || '';
      effectiveUpdatedAt = fileConfig?.updated_at || dbConfig?.updated_at || null;
    }
  }

  return {
    configured: Boolean(effectiveToken && effectiveToken.length > 10),
    enabled: effectiveEnabled && Boolean(effectiveToken),
    access_token: effectiveToken,
    has_token: Boolean(effectiveToken && effectiveToken.length > 10),
    masked_token: effectiveToken ? maskToken(effectiveToken) : '',
    webhook_secret: effectiveSecret,
    has_webhook_secret: Boolean(effectiveSecret && effectiveSecret.length > 5),
    webhook_url: effectiveWebhookUrl,
    notification_url: effectiveWebhookUrl,
    updated_at: effectiveUpdatedAt,
    source,
  };
}

/**
 * Grava as configurações de forma segura no backend (nunca expostas ao cliente).
 * Persiste tanto no banco Supabase (admin_secrets) quanto no arquivo local 0600.
 */
export async function saveMercadoPagoConfig(payload: {
  access_token?: string;
  webhook_secret?: string;
  enabled?: boolean;
  webhook_url?: string;
  updated_by?: string;
}): Promise<{
  success: boolean;
  configured: boolean;
  enabled: boolean;
  access_token_masked: string;
  webhook_url: string;
  has_webhook_secret: boolean;
  updated_at: string;
}> {
  const current = await getMercadoPagoConfig();

  let newToken = current.access_token;
  if (payload.access_token !== undefined) {
    const raw = payload.access_token.trim();
    if (raw && !raw.includes('••••')) {
      newToken = raw;
    }
  }

  let newSecret = current.webhook_secret;
  if (payload.webhook_secret !== undefined) {
    const rawSec = payload.webhook_secret.trim();
    if (rawSec && !rawSec.includes('••••')) {
      newSecret = rawSec;
    }
  }

  const newEnabled = payload.enabled !== undefined ? Boolean(payload.enabled) : current.enabled;
  const newWebhookUrl = payload.webhook_url !== undefined ? payload.webhook_url.trim() : current.webhook_url;
  const now = new Date().toISOString();

  // 1. Grava no Supabase (admin_secrets) de forma persistente
  await saveConfigToSupabase({
    access_token: newToken,
    webhook_secret: newSecret,
    enabled: newEnabled,
    webhook_url: newWebhookUrl,
  });

  // 2. Grava no arquivo local seguro (cache rápido e fallback)
  const toSave = {
    access_token: newToken,
    webhook_secret: newSecret,
    enabled: newEnabled,
    webhook_url: newWebhookUrl,
    updated_at: now,
    updated_by: payload.updated_by || current.updated_by,
  };

  const dir = path.dirname(MP_CONFIG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(MP_CONFIG_FILE, JSON.stringify(toSave, null, 2), { mode: 0o600 });

  return {
    success: true,
    configured: Boolean(newToken && newToken.length > 10),
    enabled: newEnabled && Boolean(newToken),
    access_token_masked: newToken ? maskToken(newToken) : '',
    webhook_url: newWebhookUrl,
    has_webhook_secret: Boolean(newSecret),
    updated_at: now,
  };
}

/**
 * Teste seguro de conectividade com a API oficial do Mercado Pago (GET /v1/users/me).
 * Não expõe segredos.
 */
/**
 * Sanitiza objetos de resposta para log diagnóstico, eliminando segredos e dados pessoais
 */
function sanitizeDiagnosticBody(data: any): any {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return `Array com ${data.length} itens`;
  }
  const safe: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (['token', 'access_token', 'authorization', 'email', 'first_name', 'last_name', 'phone', 'address'].includes(k.toLowerCase())) {
      continue;
    }
    safe[k] = v;
  }
  return safe;
}

export async function testMercadoPagoConnection(tokenToTest?: string): Promise<{
  success: boolean;
  status: number;
  message: string;
  account_id?: string | number;
  nickname?: string;
  site_id?: string;
  failed_endpoint?: string;
  error_details?: string;
}> {
  const cfg = await getMercadoPagoConfig();
  const rawToken = tokenToTest && !tokenToTest.includes('••••') ? tokenToTest.trim() : cfg.access_token;
  const cleanToken = (rawToken || '').replace(/["'\r\n\t]/g, '').trim();

  if (!cleanToken) {
    return {
      success: false,
      status: 400,
      message: 'Access Token não configurado. Por favor, forneça uma credencial de produção.',
    };
  }

  try {
    // 1. Tenta obter dados da conta via /users/me
    let accountData: any = null;
    let usersMeStatus = 0;
    let usersMeErrorBody: any = null;

    try {
      const userRes = await fetch('https://api.mercadopago.com/users/me', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${cleanToken}`,
          Accept: 'application/json',
        },
        signal: AbortSignal.timeout(10000),
      });
      usersMeStatus = userRes.status;
      const userBody = await userRes.json().catch(() => null);

      if (userRes.ok && userBody) {
        accountData = userBody;
        console.log(`[MercadoPago Diagnóstico] GET /users/me sucesso HTTP ${usersMeStatus}`);
      } else {
        usersMeErrorBody = userBody;
        console.log(
          `[MercadoPago Diagnóstico] GET /users/me retornou HTTP ${usersMeStatus}:`,
          sanitizeDiagnosticBody(usersMeErrorBody)
        );
      }
    } catch (userErr: any) {
      console.warn(`[MercadoPago Diagnóstico] Falha de conexão em GET /users/me: ${userErr.message}`);
    }

    if (accountData && (accountData.id || accountData.nickname)) {
      return {
        success: true,
        status: 200,
        message: `Conexão estabelecida com sucesso com a API do Mercado Pago! Conta identificada: ${accountData.nickname || accountData.id}.`,
        account_id: accountData.id,
        nickname: accountData.nickname,
        site_id: accountData.site_id,
      };
    }

    // 2. Se /users/me retornou 403 (comum em credenciais de Checkout Transparente) ou 404,
    // valida diretamente no gateway de pagamentos (/v1/payment_methods)
    console.log(`[MercadoPago Diagnóstico] /users/me indisponível (HTTP ${usersMeStatus}). Acionando validação via /v1/payment_methods...`);

    const pmRes = await fetch('https://api.mercadopago.com/v1/payment_methods', {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cleanToken}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(12000),
    });

    const pmStatus = pmRes.status;
    const pmBody = await pmRes.json().catch(() => null);

    if (pmRes.ok) {
      const pmData = Array.isArray(pmBody) ? pmBody : [];
      const hasPix = pmData.some((m: any) => m.id === 'pix');
      const pixStatusMsg = hasPix ? 'Método Pix verificado e ativo.' : 'Gateway de pagamentos conectado.';
      console.log(`[MercadoPago Diagnóstico] GET /v1/payment_methods sucesso HTTP 200 (${pmData.length} métodos, Pix: ${hasPix})`);

      return {
        success: true,
        status: 200,
        message: `Conexão estabelecida com sucesso com a API de Pagamentos do Mercado Pago! ${pixStatusMsg}`,
        nickname: accountData?.nickname || 'Produção (Checkout)',
        site_id: accountData?.site_id || 'MLB',
      };
    }

    // Log de diagnóstico higienizado do erro retornado por /v1/payment_methods
    console.log(
      `[MercadoPago Diagnóstico] GET /v1/payment_methods falhou com HTTP ${pmStatus}:`,
      sanitizeDiagnosticBody(pmBody)
    );

    // Tratamento específico de erro HTTP 400 (invalid_token retornado pelo Mercado Pago)
    if (pmStatus === 400 && (pmBody?.message === 'invalid_token' || pmBody?.error === 'bad_request')) {
      const detailStr = pmBody?.message || 'invalid_token';
      return {
        success: false,
        status: 400,
        failed_endpoint: '/v1/payment_methods',
        error_details: detailStr,
        message: `Token rejeitado pelo Mercado Pago (HTTP 400: ${detailStr}). O Access Token informado é inválido, expirou ou foi revogado. Verifique se você copiou o "Access Token de Produção" completo (iniciado com APP_USR-) e não a Public Key ou Client Secret.`,
      };
    }

    if (pmStatus === 401 || pmStatus === 403) {
      const detail = pmBody?.message || pmBody?.error || `HTTP ${pmStatus}`;
      return {
        success: false,
        status: pmStatus,
        failed_endpoint: '/v1/payment_methods',
        error_details: detail,
        message: `Credencial inválida ou sem permissão na API de pagamentos (HTTP ${pmStatus}: ${detail}). Verifique o Access Token de Produção no portal de Desenvolvedores do Mercado Pago.`,
      };
    }

    const detailMsg = pmBody?.message || pmBody?.error || `HTTP ${pmStatus}`;
    return {
      success: false,
      status: pmStatus || usersMeStatus || 500,
      failed_endpoint: '/v1/payment_methods',
      error_details: detailMsg,
      message: `A API de Pagamentos do Mercado Pago (/v1/payment_methods) retornou HTTP ${pmStatus}: ${detailMsg}.`,
    };
  } catch (err: any) {
    const isTimeout = err.name === 'TimeoutError' || err.message?.includes('timeout') || err.message?.includes('abort');
    console.warn(`[MercadoPago Diagnóstico] Exceção de rede: ${err.message}`);
    return {
      success: false,
      status: 502,
      message: isTimeout
        ? 'Tempo limite de conexão excedido (12s) ao contatar a API do Mercado Pago.'
        : `Erro de rede ao conectar à API do Mercado Pago: ${err.message || 'Falha de conexão'}`,
    };
  }
}

/**
 * Cria ou recupera uma cobrança Pix de R$ 99,90 para a Licença Vitalícia do Gestor FLIX.
 */
export async function createPixCharge(params: {
  userId: string;
  userEmail: string;
  userName?: string;
  serverBaseUrl: string;
  simulatedResponse?: any;
}): Promise<{
  success: boolean;
  payment: {
    id: string;
    external_reference: string;
    mercado_pago_payment_id?: string | null;
    amount: number;
    currency: string;
    status: string;
    qr_code?: string | null;
    qr_code_base64?: string | null;
    ticket_url?: string | null;
    created_at: string;
    expires_at?: string;
  };
  reused?: boolean;
}> {
  const cfg = await getMercadoPagoConfig();
  if (!cfg.configured || !cfg.enabled) {
    throw new Error('Pagamento Pix via Mercado Pago indisponível no momento. Por favor, utilize a Chave Pix manual informada no painel.');
  }

  // 1. Reutilização de cobrança pendente recente (evita duplicação em cliques rápidos)
  const existingPending = await findRecentPendingPayment(params.userId);
  if (existingPending && existingPending.qr_code) {
    return {
      success: true,
      payment: {
        id: existingPending.id,
        external_reference: existingPending.external_reference,
        mercado_pago_payment_id: existingPending.mercado_pago_payment_id,
        amount: existingPending.amount,
        currency: existingPending.currency,
        status: existingPending.status,
        qr_code: existingPending.qr_code,
        qr_code_base64: existingPending.qr_code_base64,
        ticket_url: existingPending.ticket_url,
        created_at: existingPending.created_at,
      },
      reused: true,
    };
  }

  // 2. Criação de nova cobrança oficial na API do Mercado Pago
  const externalReference = `GFLIX_${params.userId}_${Date.now()}`;
  const webhookUrl = cfg.webhook_url || `${params.serverBaseUrl.replace(/\/+$/, '')}/api/webhooks/mercadopago`;

  let mpData: any = null;

  if (params.simulatedResponse) {
    mpData = params.simulatedResponse;
  } else {
    const payload = {
      transaction_amount: PIX_LIFETIME_PRICE,
      description: 'Gestor FLIX — Licença Vitalícia (Acesso Ilimitado)',
      payment_method_id: 'pix',
      payer: {
        email: params.userEmail,
        first_name: (params.userName || 'Cliente').slice(0, 30),
      },
      external_reference: externalReference,
      notification_url: webhookUrl,
    };

    const idempotencyKey = crypto.randomUUID();

    const response = await fetch('https://api.mercadopago.com/v1/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${cfg.access_token}`,
        'X-Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const errMsg = errBody.message || errBody.error || `HTTP ${response.status}`;
      throw new Error(`Falha ao gerar Pix no Mercado Pago: ${errMsg}`);
    }

    mpData = await response.json();
  }

  const mpId = String(mpData.id || '');
  const qrCode = mpData.point_of_interaction?.transaction_data?.qr_code || mpData.qr_code || '';
  const qrCodeBase64 = mpData.point_of_interaction?.transaction_data?.qr_code_base64 || mpData.qr_code_base64 || '';
  const ticketUrl = mpData.point_of_interaction?.transaction_data?.ticket_url || mpData.ticket_url || '';

  const newPayment: PaymentRecord = {
    id: crypto.randomUUID(),
    user_id: params.userId,
    external_reference: externalReference,
    mercado_pago_payment_id: mpId || null,
    amount: PIX_LIFETIME_PRICE,
    currency: 'BRL',
    status: 'pending',
    qr_code: qrCode,
    qr_code_base64: qrCodeBase64,
    ticket_url: ticketUrl,
    payer_email: params.userEmail,
    license_type: 'vitalicio',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    approved_at: null,
  };

  await persistPaymentRecord(newPayment);

  return {
    success: true,
    payment: {
      id: newPayment.id,
      external_reference: newPayment.external_reference,
      mercado_pago_payment_id: newPayment.mercado_pago_payment_id,
      amount: newPayment.amount,
      currency: newPayment.currency,
      status: newPayment.status,
      qr_code: newPayment.qr_code,
      qr_code_base64: newPayment.qr_code_base64,
      ticket_url: newPayment.ticket_url,
      created_at: newPayment.created_at,
    },
    reused: false,
  };
}

/**
 * Consulta e valida o estado autêntico do pagamento diretamente no Mercado Pago.
 * Se o pagamento for comprovadamente aprovado (status: 'approved'), libera a licença vitalícia.
 */
export async function verifyAndProcessPayment(
  paymentIdOrMpId: string,
  options?: { simulatedData?: any }
): Promise<{
  success: boolean;
  status: string;
  approved: boolean;
  message: string;
  userId?: string;
  paymentRecord?: PaymentRecord | null;
  alreadyProcessed?: boolean;
}> {
  const cfg = await getMercadoPagoConfig();

  // 1. Localiza registro local / Supabase
  let payment = await findPaymentByIdOrMpId(paymentIdOrMpId);

  // 2. Consulta estado real no Mercado Pago
  let mpData: any = null;
  if (options?.simulatedData) {
    mpData = options.simulatedData;
  } else {
    if (!cfg.access_token) {
      throw new Error('Access Token do Mercado Pago não configurado.');
    }
    const mpPaymentId = payment?.mercado_pago_payment_id || paymentIdOrMpId;
    const res = await fetch(`https://api.mercadopago.com/v1/payments/${mpPaymentId}`, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${cfg.access_token}`,
      },
      signal: AbortSignal.timeout(12000),
    });

    if (!res.ok) {
      const errJson = await res.json().catch(() => ({}));
      throw new Error(`Erro ao consultar pagamento no Mercado Pago: HTTP ${res.status} ${errJson.message || ''}`);
    }
    mpData = await res.json();
  }

  // 3. Se o registro local não foi encontrado, tenta localizar pela external_reference retornada pelo MP
  if (!payment && mpData.external_reference) {
    payment = await findPaymentByExternalRef(mpData.external_reference);
  }

  const mpStatus = String(mpData.status || '').toLowerCase();
  const amount = Number(mpData.transaction_amount || 0);
  const currency = String(mpData.currency_id || 'BRL').toUpperCase();

  // Validação estrita de valor e moeda (R$ 99,90 BRL)
  const isAmountValid = Math.abs(amount - PIX_LIFETIME_PRICE) < 0.01;
  const isCurrencyValid = currency === 'BRL';

  // Extrai o ID de usuário vinculado à referência externa
  const extRefUserId = extractUserIdFromExtRef(mpData.external_reference);
  const userId = payment?.user_id || extRefUserId;

  if (mpStatus === 'approved') {
    // Validação estrita de valor
    if (!isAmountValid) {
      console.warn(`[MercadoPago] Pagamento ${mpData.id} aprovado com valor divergente: R$ ${amount}. Rejeitado.`);
      return {
        success: false,
        status: 'invalid_amount',
        approved: false,
        message: `Valor divergente (R$ ${amount}). O valor da licença vitalícia é exatamente R$ ${PIX_LIFETIME_PRICE.toFixed(2)}.`,
      };
    }

    // Validação estrita de moeda
    if (!isCurrencyValid) {
      return {
        success: false,
        status: 'invalid_currency',
        approved: false,
        message: `Moeda inválida (${currency}). Esperado BRL.`,
      };
    }

    // Validação de correspondência de referência externa
    if (payment && payment.external_reference && mpData.external_reference && payment.external_reference !== mpData.external_reference) {
      return {
        success: false,
        status: 'reference_mismatch',
        approved: false,
        message: 'A referência externa do pagamento não coincide com o registro local.',
      };
    }

    // Validação de correspondência de usuário
    if (payment && payment.user_id && extRefUserId && payment.user_id !== extRefUserId) {
      return {
        success: false,
        status: 'user_mismatch',
        approved: false,
        message: 'O usuário do pagamento não corresponde ao titular da referência externa.',
      };
    }

    if (!userId) {
      return {
        success: false,
        status: 'user_not_found',
        approved: false,
        message: 'Não foi possível associar o pagamento a uma conta de usuário do Gestor FLIX.',
      };
    }

    // IDEMPOTÊNCIA: Se o pagamento já foi registrado como aprovado anteriormente, retorna sem reprocessar
    if (payment && payment.status === 'approved' && payment.approved_at) {
      console.log(`[MercadoPago] Pagamento ${mpData.id} já foi processado anteriormente (idempotente).`);
      return {
        success: true,
        status: 'approved',
        approved: true,
        message: 'Pagamento já processado e licença vitalícia ativa.',
        userId,
        paymentRecord: payment,
        alreadyProcessed: true,
      };
    }

    const approvedAt = mpData.date_approved || new Date().toISOString();

    // 1. Atualiza e persiste o pagamento
    if (payment) {
      payment.status = 'approved';
      payment.approved_at = approvedAt;
      payment.updated_at = new Date().toISOString();
      if (!payment.mercado_pago_payment_id) {
        payment.mercado_pago_payment_id = String(mpData.id);
      }
      await persistPaymentRecord(payment);
    } else {
      const newPayment: PaymentRecord = {
        id: crypto.randomUUID(),
        user_id: userId,
        external_reference: mpData.external_reference || `GFLIX_${userId}_${Date.now()}`,
        mercado_pago_payment_id: String(mpData.id),
        amount: PIX_LIFETIME_PRICE,
        currency: 'BRL',
        status: 'approved',
        qr_code: null,
        qr_code_base64: null,
        ticket_url: null,
        payer_email: mpData.payer?.email || null,
        license_type: 'vitalicio',
        created_at: mpData.date_created || new Date().toISOString(),
        updated_at: new Date().toISOString(),
        approved_at: approvedAt,
      };
      await persistPaymentRecord(newPayment);
      payment = newPayment;
    }

    // 2. Libera a Licença Vitalícia no Supabase / Sistema com idempotência
    await grantLifetimeSubscription(userId, `MP_${mpData.id}`);

    return {
      success: true,
      status: 'approved',
      approved: true,
      message: 'Pagamento aprovado com sucesso! Sua Licença Vitalícia do Gestor FLIX foi ativada.',
      userId,
      paymentRecord: payment,
      alreadyProcessed: false,
    };
  } else if (mpStatus === 'rejected' || mpStatus === 'cancelled') {
    if (payment) {
      payment.status = mpStatus === 'rejected' ? 'rejected' : 'cancelled';
      payment.updated_at = new Date().toISOString();
      await persistPaymentRecord(payment);
    }
    return {
      success: true,
      status: mpStatus,
      approved: false,
      message: mpStatus === 'rejected' ? 'O pagamento foi recusado pelo banco emissor.' : 'O pagamento foi cancelado.',
      paymentRecord: payment,
    };
  } else {
    // pending / in_process
    return {
      success: true,
      status: 'pending',
      approved: false,
      message: 'Aguardando confirmação do pagamento pelo Banco Central / Pix.',
      paymentRecord: payment,
    };
  }
}

/**
 * Validação criptográfica de assinatura de webhook do Mercado Pago.
 * - Se secret configurado: valida rigorosamente o HMAC SHA-256 e rejeita ausência ou divergência.
 * - Se secret NÃO configurado: define explicitamente { valid: false, reason: 'SECRET_NOT_CONFIGURED' }.
 *   NUNCA considera uma assinatura ausente automaticamente válida!
 */
export function verifyMercadoPagoSignature(
  xSignature: string | undefined,
  xRequestId: string | undefined,
  dataId: string,
  secret: string
): { valid: boolean; reason: string } {
  if (!secret) {
    return {
      valid: false,
      reason: 'SECRET_NOT_CONFIGURED',
    };
  }

  if (!xSignature) {
    return {
      valid: false,
      reason: 'MISSING_SIGNATURE',
    };
  }

  try {
    const parts = xSignature.split(',');
    let ts = '';
    let hash = '';
    for (const part of parts) {
      const [k, v] = part.trim().split('=');
      if (k === 'ts') ts = v;
      if (k === 'v1') hash = v;
    }

    if (!ts || !hash) {
      return { valid: false, reason: 'MALFORMED_SIGNATURE' };
    }

    // Prevenção contra Replay Attack (máximo 15 minutos de desvio temporal)
    const timestampMs = parseInt(ts, 10) * 1000;
    const nowMs = Date.now();
    if (!Number.isNaN(timestampMs) && Math.abs(nowMs - timestampMs) > 15 * 60 * 1000) {
      return { valid: false, reason: 'EXPIRED_TIMESTAMP' };
    }

    const manifest = `id:${dataId};request-id:${xRequestId || ''};ts:${ts};`;
    const hmac = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    if (hmac === hash) {
      return { valid: true, reason: 'VALID_SIGNATURE' };
    } else {
      return { valid: false, reason: 'HASH_MISMATCH' };
    }
  } catch (err: any) {
    return { valid: false, reason: `VERIFICATION_ERROR: ${err.message}` };
  }
}

// -------------------------------------------------------------
// FUNÇÕES AUXILIARES DE PERSISTÊNCIA (SUPABASE + LOCAL)
// -------------------------------------------------------------

export function extractUserIdFromExtRef(extRef?: string): string | null {
  if (!extRef) return null;
  const parts = extRef.split('_');
  if (parts.length >= 2 && isValidUUID(parts[1])) {
    return parts[1];
  }
  return null;
}

export async function findRecentPendingPayment(userId: string): Promise<PaymentRecord | null> {
  const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(userId)) {
    try {
      const { data, error } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'pending')
        .gte('created_at', thirtyMinutesAgo)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!error && data) {
        return data as PaymentRecord;
      }
    } catch {}
  }

  const dbFile = path.resolve(process.cwd(), 'data/db.json');
  if (fs.existsSync(dbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      const found = (db.payments || []).find(
        (p: any) =>
          p.user_id === userId &&
          p.status === 'pending' &&
          p.created_at >= thirtyMinutesAgo
      );
      if (found) return found;
    } catch {}
  }

  return null;
}

export async function findPaymentByIdOrMpId(idOrMpId: string): Promise<PaymentRecord | null> {
  if (isSupabaseServerConfigured && supabaseAdmin) {
    try {
      const isUUID = isValidUUID(idOrMpId);
      const query = supabaseAdmin.from('payments').select('*');
      const { data } = isUUID
        ? await query.or(`id.eq.${idOrMpId},mercado_pago_payment_id.eq.${idOrMpId}`).maybeSingle()
        : await query.eq('mercado_pago_payment_id', idOrMpId).maybeSingle();

      if (data) return data as PaymentRecord;
    } catch {}
  }

  const dbFile = path.resolve(process.cwd(), 'data/db.json');
  if (fs.existsSync(dbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      const found = (db.payments || []).find(
        (p: any) => p.id === idOrMpId || p.mercado_pago_payment_id === idOrMpId
      );
      if (found) return found;
    } catch {}
  }

  return null;
}

export async function findPaymentByExternalRef(extRef: string): Promise<PaymentRecord | null> {
  if (isSupabaseServerConfigured && supabaseAdmin) {
    try {
      const { data } = await supabaseAdmin.from('payments').select('*').eq('external_reference', extRef).maybeSingle();
      if (data) return data as PaymentRecord;
    } catch {}
  }

  const dbFile = path.resolve(process.cwd(), 'data/db.json');
  if (fs.existsSync(dbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      const found = (db.payments || []).find((p: any) => p.external_reference === extRef);
      if (found) return found;
    } catch {}
  }

  return null;
}

export async function persistPaymentRecord(payment: PaymentRecord): Promise<void> {
  let supabaseError: any = null;

  // 1. Supabase PostgreSQL
  if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(payment.user_id)) {
    try {
      const { error } = await supabaseAdmin.from('payments').upsert({
        id: payment.id,
        user_id: payment.user_id,
        external_reference: payment.external_reference,
        mercado_pago_payment_id: payment.mercado_pago_payment_id || null,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        qr_code: payment.qr_code || null,
        qr_code_base64: payment.qr_code_base64 || null,
        ticket_url: payment.ticket_url || null,
        payer_email: payment.payer_email || null,
        license_type: payment.license_type,
        created_at: payment.created_at,
        updated_at: payment.updated_at,
        approved_at: payment.approved_at || null,
      }, { onConflict: 'external_reference' });

      if (error) {
        supabaseError = error;
        console.error('[MercadoPago] Erro retornado pelo Supabase ao persistir pagamento:', error.message);
      }
    } catch (err: any) {
      supabaseError = err;
      console.error('[MercadoPago] Falha de rede ao persistir pagamento no Supabase:', err.message);
    }
  }

  // 2. Fallback / Espelho local em data/db.json
  const dbFile = path.resolve(process.cwd(), 'data/db.json');
  if (fs.existsSync(dbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      if (!Array.isArray(db.payments)) {
        db.payments = [];
      }
      const idx = db.payments.findIndex(
        (p: any) => p.id === payment.id || p.external_reference === payment.external_reference
      );
      if (idx >= 0) {
        db.payments[idx] = payment;
      } else {
        db.payments.unshift(payment);
      }
      fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
    } catch (localErr) {
      console.error('[MercadoPago] Falha ao persistir pagamento no db local:', localErr);
    }
  }

  // Não ignorar erros reais de banco: se o Supabase estiver configurado e o erro não for tabela ainda inexistente, reporta!
  if (supabaseError) {
    const isTableMissing = supabaseError.message?.includes('relation "public.payments" does not exist') ||
                           supabaseError.message?.includes('does not exist') ||
                           supabaseError.code === '42P01';
    if (!isTableMissing) {
      throw new Error(`Erro na persistência do pagamento no banco de dados: ${supabaseError.message}`);
    }
  }
}

/**
 * Libera definitivamente a Licença Vitalícia para o usuário no Supabase e no sistema local.
 */
export async function grantLifetimeSubscription(userId: string, paymentReference: string): Promise<void> {
  const farFutureDate = '2099-12-31T23:59:59.999Z';
  const now = new Date().toISOString();

  // 1. Atualizar Supabase PostgreSQL
  if (isSupabaseServerConfigured && supabaseAdmin && isValidUUID(userId)) {
    try {
      const { data: existingSub, error: selError } = await supabaseAdmin
        .from('subscriptions')
        .select('id, user_id, status, notes')
        .eq('user_id', userId)
        .maybeSingle();

      if (selError) {
        throw new Error(`Erro ao consultar assinatura no Supabase: ${selError.message}`);
      }

      if (existingSub) {
        const { error: updError } = await supabaseAdmin
          .from('subscriptions')
          .update({
            status: 'active',
            notes: 'vitalicio',
            current_period_end: farFutureDate,
            payment_reference: paymentReference,
            updated_at: now,
          })
          .eq('id', existingSub.id);

        if (updError) {
          throw new Error(`Erro ao atualizar assinatura no Supabase: ${updError.message}`);
        }
      } else {
        const { error: insError } = await supabaseAdmin
          .from('subscriptions')
          .insert({
            user_id: userId,
            status: 'active',
            notes: 'vitalicio',
            trial_ends_at: farFutureDate,
            current_period_end: farFutureDate,
            payment_reference: paymentReference,
            created_at: now,
            updated_at: now,
          });

        if (insError) {
          throw new Error(`Erro ao inserir assinatura vitalícia no Supabase: ${insError.message}`);
        }
      }
      console.log(`[Licença Vitalícia] Supabase atualizado com sucesso para o usuário ${userId}`);
    } catch (err: any) {
      console.error('[Licença Vitalícia] Erro ao atualizar assinatura no Supabase:', err.message);
      throw err;
    }
  }

  // 2. Atualizar em memória / data/db.json
  const dbFile = path.resolve(process.cwd(), 'data/db.json');
  if (fs.existsSync(dbFile)) {
    try {
      const db = JSON.parse(fs.readFileSync(dbFile, 'utf8'));
      if (Array.isArray(db.subscriptions)) {
        const sub = db.subscriptions.find((s: any) => s.user_id === userId);
        if (sub) {
          sub.status = 'active';
          sub.notes = 'vitalicio';
          sub.current_period_end = farFutureDate;
          sub.payment_reference = paymentReference;
          sub.updated_at = now;
        } else {
          db.subscriptions.push({
            id: 'sub-' + userId,
            user_id: userId,
            status: 'active',
            notes: 'vitalicio',
            trial_ends_at: farFutureDate,
            current_period_end: farFutureDate,
            payment_reference: paymentReference,
            created_at: now,
            updated_at: now,
          });
        }
        fs.writeFileSync(dbFile, JSON.stringify(db, null, 2));
      }
    } catch (localErr) {
      console.warn('Aviso: falha ao espelhar assinatura localmente:', localErr);
    }
  }
}
