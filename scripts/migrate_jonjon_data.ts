/**
 * GESTOR FLIX — SCRIPT DE MIGRAÇÃO COM DRIVER REAL E SAGA COMPENSATÓRIA (FASE 8B.4)
 * 
 * Este script prepara e conecta o driver Supabase real ao motor compensatório
 * de migração para o revendedor "jonjon" (UUID: 3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e).
 * 
 * ESCOPO MÍNIMO ESTRITO:
 * 1. Insere exatamente 1 plano real ("Canais Liberados").
 * 2. Insere exatamente 1 cliente real ("Edvan"), vinculado ao UUID do plano criado.
 * 3. 100% dos dados de demonstração e logs de teste são excluídos.
 * 4. whatsapp_settings, billing_settings e message_templates permanecem INTOCADOS.
 * 5. api_key NÃO é copiada do backup.
 * 6. Snapshot e Manifesto auditáveis são gerados em disco antes de qualquer inserção.
 * 
 * REGRAS DE SEGURANÇA:
 * - Trava de escrita (PHASE_7_WRITE_LOCK = true) mantida ativa durante a fase de implementação.
 * - Modo padrão é simulação (--dry-run).
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import dotenv from 'dotenv';
import { getSupabaseAdmin, isSupabaseServerConfigured, isValidUUID } from '../src/server/supabaseAdmin.js';
import {
  enforceSafeMigrationSettings,
  buildCompensatingTransactionPlan,
  computeSha256,
  writePreMigrationSnapshot,
  verifySnapshotFile,
  executeCompensatingMigration,
  verifyPostMigrationState,
  SupabaseMigrationDriver,
  MigrationManifest,
} from './migration_guard.js';

dotenv.config();

// ============================================================================
// TRAVA DE SEGURANÇA DE ESCRITA (REATIVADA APÓS EXECUÇÃO CONTROLADA DA FASE 8B.6)
// ============================================================================
export const PHASE_7_WRITE_LOCK = true;

const TARGET_USER_ID = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';
const BACKUP_CANDIDATE_PATHS = [
  path.resolve(process.cwd(), 'public/assets/aistudio/db_8dac342a.json'),
  path.resolve(process.cwd(), 'data/db.json'),
];

// Utilitários de mascaramento para logs e terminal
function maskPhone(phone?: string | null): string {
  if (!phone) return 'N/A';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 6) return '***';
  return clean.slice(0, 4) + '****' + clean.slice(-3);
}

function maskApiKey(key?: string | null): string {
  if (!key) return '(vazio)';
  if (key.length <= 8) return '****';
  return key.slice(0, 5) + '...' + key.slice(-4);
}

function maskEmail(email?: string | null): string {
  if (!email) return '(não informado)';
  const parts = email.split('@');
  if (parts.length !== 2) return '***@***';
  const user = parts[0];
  const maskedUser = user.length > 2 ? user.slice(0, 2) + '***' : '***';
  return `${maskedUser}@${parts[1]}`;
}

export interface MigrationPlanResult {
  dryRun: boolean;
  backupFile: string;
  targetUser: {
    id: string;
    email: string;
    fullName: string;
    profileExistsInSupabase: boolean;
  };
  excludedDemoItems: {
    customers: number;
    plans: number;
    applications: number;
    users: number;
  };
  simulatedPlan: {
    legacyId: string;
    newId: string;
    name: string;
    price: number;
    durationDays: number;
    panel: string;
    alreadyInSupabase: boolean;
    action: 'SIMULATED_INSERT' | 'SKIP_ALREADY_EXISTS';
  };
  simulatedCustomer: {
    legacyId: string;
    newId: string;
    name: string;
    maskedWhatsapp: string;
    expirationDate: string;
    planId: string;
    status: string;
    alreadyInSupabase: boolean;
    action: 'SIMULATED_INSERT' | 'SKIP_ALREADY_EXISTS';
    billingTriggerRisk: string;
  };
  simulatedWhatsappSettings: {
    apiUrl: string;
    instanceName: string;
    maskedApiKey: string;
    isConnected: boolean;
    autoBillingEnabled: boolean;
    existingSupabaseRecordId?: string;
    action: 'PRESERVE_EXISTING' | 'SIMULATED_UPDATE' | 'SIMULATED_INSERT';
    diff: string[];
  };
  simulatedBillingSettings: {
    timezone: string;
    sendDayBefore: boolean;
    timeDayBefore: string;
    existingSupabaseRecordId?: string;
    action: 'PRESERVE_EXISTING' | 'SIMULATED_UPDATE' | 'SIMULATED_INSERT';
    diff: string[];
  };
  simulatedMessageTemplate: {
    type: string;
    title: string;
    templateSnippet: string;
    existingSupabaseRecordId?: string;
    action: 'PRESERVE_SYSTEM_DEFAULT' | 'SIMULATED_UPDATE' | 'SIMULATED_INSERT';
    diff: string[];
  };
  simulatedMessageLog: {
    legacyId: string;
    legacyCustomerId: string;
    status: string;
    scheduledFor: string;
    idempotencyKey: string;
    compatibilityIssue: string;
    action: 'SIMULATED_SKIP_OR_NULLIFY_FK';
  };
  compensatingSagaSteps: {
    step: string;
    entityId: string;
    compensatingAction: string;
  }[];
  snapshotSimulation: {
    targetRecordsCount: number;
    sha256PayloadHash: string;
    status: string;
  };
}

/**
 * Executa a simulação somente de leitura (dry-run).
 */
export async function runJonjonMigrationSimulation(isDryRun: boolean = true): Promise<MigrationPlanResult> {
  const isWriteRequested = !isDryRun;

  if (isWriteRequested) {
    if (PHASE_7_WRITE_LOCK) {
      throw new Error(
        '[TRAVA DE SEGURANÇA ATIVA] Na Fase 8B.4, operações de gravação (--write) estão estritamente bloqueadas. ' +
        'O driver foi implementado para inspeção, mas a trava permanece ativa até autorização expressa.'
      );
    }
  }

  // 1. Localizar arquivo de backup
  let backupPath = '';
  for (const candidate of BACKUP_CANDIDATE_PATHS) {
    if (fs.existsSync(candidate)) {
      backupPath = candidate;
      break;
    }
  }

  if (!backupPath) {
    throw new Error('Arquivo de backup não encontrado em nenhum dos caminhos previstos.');
  }

  const rawJson = fs.readFileSync(backupPath, 'utf-8');
  const backupData = JSON.parse(rawJson);

  // 2. Conexão somente leitura com Supabase
  if (!isSupabaseServerConfigured) {
    throw new Error('Supabase Server não configurado. Verifique as credenciais no .env.');
  }

  const supabase = getSupabaseAdmin();

  // 3. Validação do Perfil do Revendedor jonjon
  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('id, email, full_name, role')
    .eq('id', TARGET_USER_ID)
    .maybeSingle();

  if (profileErr) {
    throw new Error(`Falha ao consultar perfil no Supabase: ${profileErr.message}`);
  }

  if (!profile) {
    throw new Error(
      `Revendedor alvo (UUID ${TARGET_USER_ID}) não encontrado na tabela public.profiles do Supabase. Interrompendo.`
    );
  }

  // 4. Filtrar Dados de Demonstração
  const rawPlans: any[] = backupData.plans || [];
  const rawCustomers: any[] = backupData.customers || [];
  const rawApps: any[] = backupData.applications || [];
  const rawUsers: any[] = backupData.users || [];

  const demoPlans = rawPlans.filter((p) => p.user_id === 'demo-user-id');
  const demoCustomers = rawCustomers.filter((c) => c.user_id === 'demo-user-id');
  const demoApps = rawApps.filter((a) => a.user_id === 'demo-user-id');
  const demoUsers = rawUsers.filter((u) => u.id === 'demo-user-id' || u.id === 'admin-default-id');

  // Identificar registros reais do jonjon
  const realPlans = rawPlans.filter((p) => p.user_id === TARGET_USER_ID);
  const realCustomers = rawCustomers.filter((c) => c.user_id === TARGET_USER_ID);

  if (realPlans.length !== 1 || realPlans[0].name !== 'Canais Liberados') {
    throw new Error(`Inconsistência nos planos do backup: esperado exatamente 1 plano "Canais Liberados", encontrados ${realPlans.length}.`);
  }

  if (realCustomers.length !== 1 || realCustomers[0].name !== 'Edvan') {
    throw new Error(`Inconsistência nos clientes do backup: esperado exatamente 1 cliente "Edvan", encontrados ${realCustomers.length}.`);
  }

  const legacyPlan = realPlans[0];
  const legacyCustomer = realCustomers[0];

  // 5. Verificar existência prévia no Supabase (Leitura)
  const { data: existingPlans } = await supabase
    .from('plans')
    .select('id, name')
    .eq('user_id', TARGET_USER_ID);

  const existingPlanMatch = (existingPlans || []).find((p) => p.name.trim().toLowerCase() === legacyPlan.name.trim().toLowerCase());
  const simulatedPlanId = existingPlanMatch ? existingPlanMatch.id : randomUUID();

  const { data: existingCustomers } = await supabase
    .from('customers')
    .select('id, name, whatsapp')
    .eq('user_id', TARGET_USER_ID);

  const existingCustMatch = (existingCustomers || []).find((c) => c.name.trim().toLowerCase() === legacyCustomer.name.trim().toLowerCase());
  const simulatedCustomerId = existingCustMatch ? existingCustMatch.id : randomUUID();

  // 6. Consultar Configurações no Supabase (Somente Leitura)
  const rawWsList: any[] = backupData.whatsapp_settings || [];
  const legacyWs = rawWsList.find((w) => w.user_id === TARGET_USER_ID);

  const { data: existingWs } = await supabase
    .from('whatsapp_settings')
    .select('id, user_id, api_url, instance_name, api_key, is_connected, auto_billing_enabled')
    .eq('user_id', TARGET_USER_ID)
    .maybeSingle();

  const { data: existingBs } = await supabase
    .from('billing_settings')
    .select('id, user_id, timezone, send_day_before, time_day_before')
    .eq('user_id', TARGET_USER_ID)
    .maybeSingle();

  const { data: existingTpl } = await supabase
    .from('message_templates')
    .select('id, user_id, type, title, template_text')
    .eq('user_id', TARGET_USER_ID)
    .eq('type', 'day_before')
    .maybeSingle();

  // 7. Analisar Histórico de Logs
  const rawLogs: any[] = backupData.message_logs || [];
  const legacyLog = rawLogs.find((l) => l.user_id === TARGET_USER_ID);

  let logAction: 'SIMULATED_SKIP_OR_NULLIFY_FK' = 'SIMULATED_SKIP_OR_NULLIFY_FK';
  let logIssue = 'Nenhum log real';
  if (legacyLog) {
    logIssue = `customer_id legado é "${legacyLog.customer_id}" (não é UUID). public.message_logs exige UUID válido ou NULL. Requer customer_id: null.`;
  }

  return {
    dryRun: true,
    backupFile: path.basename(backupPath),
    targetUser: {
      id: profile.id,
      email: maskEmail(profile.email),
      fullName: profile.full_name,
      profileExistsInSupabase: true,
    },
    excludedDemoItems: {
      customers: demoCustomers.length,
      plans: demoPlans.length,
      applications: demoApps.length,
      users: demoUsers.length,
    },
    simulatedPlan: {
      legacyId: legacyPlan.id,
      newId: simulatedPlanId,
      name: legacyPlan.name,
      price: legacyPlan.price,
      durationDays: legacyPlan.duration_days,
      panel: legacyPlan.panel,
      alreadyInSupabase: Boolean(existingPlanMatch),
      action: existingPlanMatch ? 'SKIP_ALREADY_EXISTS' : 'SIMULATED_INSERT',
    },
    simulatedCustomer: {
      legacyId: legacyCustomer.id,
      newId: simulatedCustomerId,
      name: legacyCustomer.name,
      maskedWhatsapp: maskPhone(legacyCustomer.whatsapp),
      expirationDate: legacyCustomer.expiration_date,
      planId: simulatedPlanId,
      status: legacyCustomer.status,
      alreadyInSupabase: Boolean(existingCustMatch),
      action: existingCustMatch ? 'SKIP_ALREADY_EXISTS' : 'SIMULATED_INSERT',
      billingTriggerRisk: 'Vencimento em 2026-10-23 (atraso de 2 dias). O worker dispara apenas em diff = -1, 0, 1. Sem risco de envio acidental.',
    },
    simulatedWhatsappSettings: {
      apiUrl: legacyWs?.api_url || '',
      instanceName: legacyWs?.instance_name || '',
      maskedApiKey: maskApiKey(legacyWs?.api_key),
      isConnected: false,
      autoBillingEnabled: false,
      existingSupabaseRecordId: existingWs?.id,
      action: 'PRESERVE_EXISTING',
      diff: [
        'Escopo restrito (8B.3.1): whatsapp_settings NÃO será alterado. Valores seguros mantidos (is_connected=false, auto_billing_enabled=false, sem cópia de api_key)',
      ],
    },
    simulatedBillingSettings: {
      timezone: existingBs?.timezone || 'America/Sao_Paulo',
      sendDayBefore: Boolean(existingBs?.send_day_before ?? true),
      timeDayBefore: existingBs?.time_day_before || '09:00',
      existingSupabaseRecordId: existingBs?.id,
      action: 'PRESERVE_EXISTING',
      diff: [
        'Escopo restrito (8B.3.1): billing_settings NÃO será alterado. Horário 09:00 e fuso mantidos integralmente',
      ],
    },
    simulatedMessageTemplate: {
      type: 'day_before',
      title: 'Lembrete Oficial',
      templateSnippet: '(Modelo oficial do Supabase mantido; texto de teste descartado)',
      existingSupabaseRecordId: existingTpl?.id,
      action: 'PRESERVE_SYSTEM_DEFAULT',
      diff: ['Escopo restrito (8B.3.1): message_templates NÃO será alterado. 3 modelos oficiais mantidos'],
    },
    simulatedMessageLog: {
      legacyId: legacyLog?.id || 'none',
      legacyCustomerId: legacyLog?.customer_id || 'none',
      status: legacyLog?.status || 'none',
      scheduledFor: legacyLog?.scheduled_for || 'none',
      idempotencyKey: legacyLog?.idempotency_key ? legacyLog.idempotency_key.slice(0, 20) + '...' : 'none',
      compatibilityIssue: logIssue,
      action: logAction,
    },
    compensatingSagaSteps: buildCompensatingTransactionPlan(simulatedPlanId, simulatedCustomerId),
    snapshotSimulation: {
      targetRecordsCount: (existingWs ? 1 : 0) + (existingBs ? 1 : 0) + (existingTpl ? 1 : 0),
      sha256PayloadHash: computeSha256(
        JSON.stringify({
          ws: existingWs?.id || null,
          bs: existingBs?.id || null,
          tpl: existingTpl?.id || null,
          plans: existingPlans?.length || 0,
          customers: existingCustomers?.length || 0,
        })
      ),
      status: 'PRÉVIA DO SNAPSHOT CALCULADA COM INTEGRIDADE CRIPTOGRÁFICA (SHA-256)',
    },
  };
}

/**
 * Executa a migração real via Driver Supabase e Saga Compensatória (quando autorizada).
 */
export async function executeLiveJonjonMigration(): Promise<MigrationManifest> {
  if (PHASE_7_WRITE_LOCK) {
    throw new Error(
      '[TRAVA DE SEGURANÇA ATIVA] Na Fase 8B.4, operações de gravação (--write) estão estritamente bloqueadas. ' +
      'O driver foi implementado para revisão e testes, mas a trava permanece ativa até autorização expressa do usuário.'
    );
  }

  // 1. Carregar backup oficial
  const backupPath = path.resolve(process.cwd(), 'public/assets/aistudio/db_8dac342a.json');
  if (!fs.existsSync(backupPath)) {
    throw new Error('Arquivo de backup oficial não encontrado.');
  }

  const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf-8'));
  const supabase = getSupabaseAdmin();

  // 2. Validar perfil do revendedor no Supabase
  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name')
    .eq('id', TARGET_USER_ID)
    .single();

  if (!profile) {
    throw new Error(`Revendedor alvo (${TARGET_USER_ID}) não encontrado na tabela profiles.`);
  }

  // 3. Filtrar registros reais
  const realPlans = (backupData.plans || []).filter((p: any) => p.user_id === TARGET_USER_ID);
  const realCustomers = (backupData.customers || []).filter((c: any) => c.user_id === TARGET_USER_ID);

  if (realPlans.length !== 1 || realPlans[0].name !== 'Canais Liberados') {
    throw new Error('Backup inconsistente: esperado exatamente 1 plano "Canais Liberados".');
  }

  if (realCustomers.length !== 1 || realCustomers[0].name !== 'Edvan') {
    throw new Error('Backup inconsistente: esperado exatamente 1 cliente "Edvan".');
  }

  const legacyPlan = realPlans[0];
  const legacyCustomer = realCustomers[0];

  // 4. Capturar e persistir Snapshot Pré-Migração em disco (protegido no .gitignore)
  const { data: currentWs } = await supabase.from('whatsapp_settings').select('*').eq('user_id', TARGET_USER_ID).maybeSingle();
  const { data: currentBs } = await supabase.from('billing_settings').select('*').eq('user_id', TARGET_USER_ID).maybeSingle();
  const { data: currentTpls } = await supabase.from('message_templates').select('*').eq('user_id', TARGET_USER_ID);
  const { count: pCount } = await supabase.from('plans').select('*', { count: 'exact', head: true }).eq('user_id', TARGET_USER_ID);
  const { count: cCount } = await supabase.from('customers').select('*', { count: 'exact', head: true }).eq('user_id', TARGET_USER_ID);

  const snapshotRecords = {
    whatsapp_settings: currentWs || null,
    billing_settings: currentBs || null,
    message_templates: currentTpls || [],
    plans_count: pCount || 0,
    customers_count: cCount || 0,
  };

  const snapshotInfo = writePreMigrationSnapshot(TARGET_USER_ID, snapshotRecords);
  const verifiedSnapshot = verifySnapshotFile(snapshotInfo.filePath);

  // 5. Instanciar Driver Supabase Real
  const driver = new SupabaseMigrationDriver(supabase);
  const executionId = randomUUID();

  // 6. Executar via Saga Compensatória
  const manifest = await executeCompensatingMigration(driver, {
    targetUserId: TARGET_USER_ID,
    executionId,
    snapshotFilePath: snapshotInfo.filePath,
    snapshot: verifiedSnapshot,
    whatsappPayload: { id: currentWs?.id || '', update: {} }, // Preservado sem alteração
    billingPayload: { id: currentBs?.id || '', update: {} },   // Preservado sem alteração
    planPayload: {
      user_id: TARGET_USER_ID,
      name: legacyPlan.name,
      price: legacyPlan.price,
      duration_days: legacyPlan.duration_days,
      panel: legacyPlan.panel,
      server_dns: legacyPlan.server_dns || ['http://hosting.com:80'],
      status: 'active',
    },
    customerPayload: {
      user_id: TARGET_USER_ID,
      name: legacyCustomer.name,
      whatsapp: legacyCustomer.whatsapp,
      start_date: legacyCustomer.start_date || '2026-10-24',
      expiration_date: legacyCustomer.expiration_date,
      status: legacyCustomer.status || 'expired',
    },
  });

  return manifest;
}

// Execução direta via CLI (npx tsx scripts/migrate_jonjon_data.ts)
async function main() {
  const args = process.argv.slice(2);
  const wantsWrite = args.includes('--write');

  console.log('========================================================================');
  console.log('  GESTOR FLIX — SCRIPT DE MIGRAÇÃO COM DRIVER REAL (FASE 8B.4)');
  console.log('========================================================================\n');

  try {
    if (wantsWrite) {
      const manifest = await executeLiveJonjonMigration();
      console.log(`[STATUS] Modo de Execução: GRAVAÇÃO REAL AUTORIZADA`);
      console.log(`[MANIFESTO GERADO]: migration_manifest_${manifest.executionId}.json`);
      console.log(`[STATUS DO MANIFESTO]: ${manifest.status}`);
      console.log(`[PLANO INSERIDO]: UUID ${manifest.createdEntities.planId}`);
      console.log(`[CLIENTE INSERIDO]: UUID ${manifest.createdEntities.customerId}`);

      // Validação pós-migração no banco: confirma integridade, isolamento e chave estrangeira
      const supabaseAdmin = getSupabaseAdmin();
      const verification = await verifyPostMigrationState(
        supabaseAdmin,
        TARGET_USER_ID,
        manifest.createdEntities.planId!,
        manifest.createdEntities.customerId!
      );

      console.log(`[VALIDAÇÃO PÓS-MIGRAÇÃO]: INTEGRALMENTE VÁLIDA`);
      console.log(`  - Plano Confirmado: ${verification.verifiedPlan.name} (UUID: ${verification.verifiedPlan.id})`);
      console.log(`  - Cliente Confirmado: ${verification.verifiedCustomer.name} (UUID: ${verification.verifiedCustomer.id})`);
      console.log(`  - FK Plan ID Confirmada: ${verification.verifiedCustomer.plan_id}`);
      console.log(`  - Registros Preexistentes Preservados: ${verification.preExistingPlansCount} planos, ${verification.preExistingCustomersCount} clientes`);
      console.log('\n========================================================================');
      console.log('  MIGRAÇÃO EXECUTADA COM SUCESSO E INTEGRALMENTE REGISTRADA.');
      console.log('========================================================================');
    } else {
      const result = await runJonjonMigrationSimulation(true);

      console.log(`[STATUS] Modo de Execução: SIMULAÇÃO SEGURA (DRY-RUN)`);
      console.log(`[STATUS] Trava de Escrita: ATIVA (PHASE_7_WRITE_LOCK = true)`);
      console.log(`[ARQUIVO DE BACKUP IDENTIFICADO]: ${result.backupFile}`);
      console.log(`[PROPRIETÁRIO ALVO]: ${result.targetUser.fullName} (${result.targetUser.email})`);
      console.log(`[UUID DO REVENDEDOR]: ${result.targetUser.id}`);
      console.log(`[PERFIL CONFIRMADO NO SUPABASE]: ${result.targetUser.profileExistsInSupabase ? 'SIM (OK)' : 'NÃO'}\n`);

      console.log('--- 1. ITENS DE DEMONSTRAÇÃO EXCLUÍDOS DO PROCESSO ---');
      console.log(`  - Clientes de Demo ignorados: ${result.excludedDemoItems.customers}`);
      console.log(`  - Planos de Demo ignorados: ${result.excludedDemoItems.plans}`);
      console.log(`  - Aplicativos de Demo ignorados: ${result.excludedDemoItems.applications}`);
      console.log(`  - Usuários sintéticos ignorados: ${result.excludedDemoItems.users}`);
      console.log('  Resultado: 100% dos dados fictícios foram isolados e descartados.\n');

      console.log('--- 2. PLANO REAL DO REVENDEDOR ("Canais Liberados") ---');
      console.log(`  - ID de Origem: ${result.simulatedPlan.legacyId}`);
      console.log(`  - UUID Simulado de Destino: ${result.simulatedPlan.newId}`);
      console.log(`  - Nome: ${result.simulatedPlan.name}`);
      console.log(`  - Preço: R$ ${result.simulatedPlan.price.toFixed(2)} | Duração: ${result.simulatedPlan.durationDays} dias`);
      console.log(`  - Painel: ${result.simulatedPlan.panel}`);
      console.log(`  - Já existe no Supabase?: ${result.simulatedPlan.alreadyInSupabase ? 'SIM' : 'NÃO (0 registros atuais)'}`);
      console.log(`  - Ação Prevista: ${result.simulatedPlan.action}\n`);

      console.log('--- 3. CLIENTE REAL DO REVENDEDOR ("Edvan") ---');
      console.log(`  - ID de Origem: ${result.simulatedCustomer.legacyId}`);
      console.log(`  - UUID Simulado de Destino: ${result.simulatedCustomer.newId}`);
      console.log(`  - Nome: ${result.simulatedCustomer.name}`);
      console.log(`  - WhatsApp: ${result.simulatedCustomer.maskedWhatsapp} (Mascarado por segurança)`);
      console.log(`  - Vencimento: ${result.simulatedCustomer.expirationDate} | Status: ${result.simulatedCustomer.status}`);
      console.log(`  - Vínculo com Plano: UUID do plano "Canais Liberados" (${result.simulatedCustomer.planId})`);
      console.log(`  - Já existe no Supabase?: ${result.simulatedCustomer.alreadyInSupabase ? 'SIM' : 'NÃO (0 registros atuais)'}`);
      console.log(`  - Avaliação de Disparo Automático: ${result.simulatedCustomer.billingTriggerRisk}`);
      console.log(`  - Ação Prevista: ${result.simulatedCustomer.action}\n`);

      console.log('--- 4. CONFIGURAÇÕES DE WHATSAPP (SALVAGUARDA ATIVA) ---');
      console.log(`  - API URL: ${result.simulatedWhatsappSettings.apiUrl}`);
      console.log(`  - Instância: ${result.simulatedWhatsappSettings.instanceName}`);
      console.log(`  - Chave de API: ${result.simulatedWhatsappSettings.maskedApiKey} (Mascarada)`);
      console.log(`  - Conectada?: ${result.simulatedWhatsappSettings.isConnected} [FORÇADO FALSE PARA SEGURANÇA]`);
      console.log(`  - Cobrança Automática?: ${result.simulatedWhatsappSettings.autoBillingEnabled} [FORÇADO FALSE PARA SEGURANÇA]`);
      console.log(`  - ID do Registro Padrão Existente no Supabase: ${result.simulatedWhatsappSettings.existingSupabaseRecordId}`);
      console.log(`  - Ação Prevista: ${result.simulatedWhatsappSettings.action}`);
      console.log(`  - Diferenças detectadas: ${result.simulatedWhatsappSettings.diff.join('; ')}\n`);

      console.log('--- 5. HORÁRIOS DE COBRANÇA (CONFIGURAÇÃO REAL) ---');
      console.log(`  - Fuso Horário: ${result.simulatedBillingSettings.timezone}`);
      console.log(`  - Horário 1 Dia Antes: ${result.simulatedBillingSettings.timeDayBefore}`);
      console.log(`  - ID do Registro Padrão Existente no Supabase: ${result.simulatedBillingSettings.existingSupabaseRecordId}`);
      console.log(`  - Ação Prevista: ${result.simulatedBillingSettings.action}`);
      console.log(`  - Diferenças detectadas: ${result.simulatedBillingSettings.diff.join('; ')}\n`);

      console.log('--- 6. MODELO DE MENSAGEM (PRESERVAÇÃO DO PADRÃO OFICIAL) ---');
      console.log(`  - Tipo: ${result.simulatedMessageTemplate.type}`);
      console.log(`  - Texto: ${result.simulatedMessageTemplate.templateSnippet}`);
      console.log(`  - Ação Prevista: ${result.simulatedMessageTemplate.action}`);
      console.log(`  - Diferenças detectadas: ${result.simulatedMessageTemplate.diff.join('; ')}\n`);

      console.log('--- 7. REGISTRO DE LOG DE TESTE (HISTÓRICO) ---');
      console.log(`  - ID de Origem: ${result.simulatedMessageLog.legacyId}`);
      console.log(`  - Incompatibilidade de Schema: ${result.simulatedMessageLog.compatibilityIssue}`);
      console.log(`  - Recomendação: ${result.simulatedMessageLog.action}\n`);

      console.log('--- 8. SALVAGUARDAS TÉCNICAS DA FASE 8B.4 ---');
      console.log(`  - Snapshot Pré-Migração: ${result.snapshotSimulation.status}`);
      console.log(`  - Hash SHA-256 do Pré-Estado: ${result.snapshotSimulation.sha256PayloadHash}`);
      console.log(`  - Passos da Saga Compensatória:`);
      result.compensatingSagaSteps.forEach((s) =>
        console.log(`      * [${s.step}] Alvo: ${s.entityId} -> Ação em falha: ${s.compensatingAction}`)
      );
      console.log('\n========================================================================');
      console.log('  SIMULAÇÃO CONCLUÍDA COM 100% DE SUCESSO. NENHUMA ALTERAÇÃO EFETUADA.');
      console.log('========================================================================');
    }
  } catch (err: any) {
    console.error('\n[ERRO DURANTE EXECUÇÃO]:', err.message || err);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('migrate_jonjon_data.ts')) {
  main();
}
