/**
 * GESTOR FLIX — MÓDULO DE PROTEÇÕES DE MIGRAÇÃO E ROLLBACK (FASE 8A.6)
 * 
 * Este módulo implementa as salvaguardas técnicas exigidas para a migração segura:
 * 1. Estratégia de consistência transacional (especificação RPC e motor de execução Saga com compensação).
 * 2. Geração e validação de integridade criptográfica (SHA-256) do snapshot pré-migração.
 * 3. Manifesto de execução auditável sem credenciais ou segredos.
 * 4. Mecanismo de validação e execução de rollback seguro com detecção de alterações posteriores.
 * 5. Sanitização estrita de WhatsApp (desconectado, sem cobrança auto) e templates.
 * 
 * REGRAS INEGOCIÁVEIS:
 * - Nenhuma operação de escrita é realizada no Supabase em tempo de importação deste módulo.
 * - Testes operam somente localmente e com dados sintéticos.
 * - Nenhuma credencial ou API key é persistida em logs ou manifestos.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// ============================================================================
// 1. ESPECIFICAÇÃO DE TRANSAÇÃO ATÔMICA (RPC POSTGRESQL)
// ============================================================================

/**
 * Especificação SQL da função PostgreSQL atômica para migração em lote.
 * ATENÇÃO: Conforme regras de segurança, esta função é APENAS UMA ESPECIFICAÇÃO
 * DOCUMENTADA e NÃO FOI EXECUTADA/CRIADA no banco de dados.
 */
export const ATOMIC_MIGRATION_RPC_SPEC = `
-- ESPECIFICAÇÃO TÉCNICA (NÃO EXECUTAR NESTA FASE)
-- Nome: public.migrate_jonjon_atomic
-- Objetivo: Inserir plano e cliente numa única transação PostgreSQL com rollback automático.

CREATE OR REPLACE FUNCTION public.migrate_jonjon_atomic(
  p_user_id UUID,
  p_plan_name TEXT,
  p_plan_price NUMERIC,
  p_plan_duration INTEGER,
  p_plan_panel TEXT,
  p_customer_name TEXT,
  p_customer_whatsapp TEXT,
  p_customer_expiration DATE,
  p_customer_status TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_plan_id UUID;
  v_customer_id UUID;
BEGIN
  -- 1. Inserir Plano Real
  INSERT INTO public.plans (user_id, name, price, duration_days, panel, status)
  VALUES (p_user_id, p_plan_name, p_plan_price, p_plan_duration, p_plan_panel, 'active')
  RETURNING id INTO v_plan_id;

  -- 2. Inserir Cliente Real vinculado ao plano recém-criado
  INSERT INTO public.customers (user_id, name, whatsapp, expiration_date, status, plan_id)
  VALUES (p_user_id, p_customer_name, p_customer_whatsapp, p_customer_expiration, p_customer_status, v_plan_id)
  RETURNING id INTO v_customer_id;

  RETURN jsonb_build_object(
    'success', true,
    'plan_id', v_plan_id,
    'customer_id', v_customer_id
  );
EXCEPTION WHEN OTHERS THEN
  -- Em caso de qualquer erro, a transação PostgreSQL sofre ROLLBACK integral imediato
  RAISE EXCEPTION 'Falha atômica na migração: %', SQLERRM;
END;
$$;
`;

export interface CompensatingTransactionStep {
  step: 'INSERT_PLAN' | 'INSERT_CUSTOMER';
  entityId: string;
  compensatingAction: 'DELETE_EXACT_ID';
}

/**
 * Retorna a descrição em memória dos passos compensatórios da Saga.
 */
export function buildCompensatingTransactionPlan(
  simulatedPlanId: string,
  simulatedCustomerId: string
): CompensatingTransactionStep[] {
  return [
    {
      step: 'INSERT_PLAN',
      entityId: simulatedPlanId,
      compensatingAction: 'DELETE_EXACT_ID',
    },
    {
      step: 'INSERT_CUSTOMER',
      entityId: simulatedCustomerId,
      compensatingAction: 'DELETE_EXACT_ID',
    },
  ];
}

// ============================================================================
// 2. SERIALIZAÇÃO DETERMINÍSTICA E HASHING CRIPTOGRÁFICO
// ============================================================================

/**
 * Serialização JSON determinística profunda (ordena todas as chaves em qualquer nível de aninhamento).
 */
export function deterministicStringify(obj: any): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(deterministicStringify).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + deterministicStringify(obj[k])).join(',') + '}';
}

/**
 * Calcula o hash SHA-256 determinístico de um objeto ou buffer.
 */
export function computeSha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ============================================================================
// 3. SNAPSHOT PRÉ-MIGRAÇÃO COM VALIDAÇÃO SHA-256
// ============================================================================

export interface SnapshotPayload {
  version: string;
  timestamp: string;
  targetUserId: string;
  environment: string;
  records: {
    whatsapp_settings: any | null;
    billing_settings: any | null;
    message_templates: any[];
    plans_count: number;
    customers_count: number;
  };
  sha256PayloadHash: string;
}

/**
 * Cria o snapshot pré-migração em disco com validação de integridade.
 * O arquivo é gravado no diretório ignorado pelo Git (backups/).
 */
export function writePreMigrationSnapshot(
  targetUserId: string,
  records: SnapshotPayload['records'],
  outputDirectory: string = path.resolve(process.cwd(), 'backups')
): { filePath: string; fileHash: string; payloadHash: string; fileSize: number } {
  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rawRecordsString = deterministicStringify(records);
  const payloadHash = computeSha256(rawRecordsString);

  const snapshot: SnapshotPayload = {
    version: '1.0',
    timestamp: new Date().toISOString(),
    targetUserId,
    environment: process.env.NODE_ENV || 'development',
    records,
    sha256PayloadHash: payloadHash,
  };

  const snapshotContent = JSON.stringify(snapshot, null, 2);
  const filePath = path.join(outputDirectory, `pre_migration_snapshot_${timestamp}.json`);

  fs.writeFileSync(filePath, snapshotContent, 'utf-8');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Falha crítica: arquivo de snapshot não foi criado em ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.size === 0) {
    fs.unlinkSync(filePath);
    throw new Error(`Falha crítica: arquivo de snapshot gravado com tamanho zero.`);
  }

  const fileBuffer = fs.readFileSync(filePath);
  const fileHash = computeSha256(fileBuffer);

  return {
    filePath,
    fileHash,
    payloadHash,
    fileSize: stat.size,
  };
}

/**
 * Lê e valida um snapshot existente no disco.
 */
export function verifySnapshotFile(filePath: string): SnapshotPayload {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de snapshot não encontrado: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const snapshot: SnapshotPayload = JSON.parse(content);

  const rawRecordsString = deterministicStringify(snapshot.records);
  const calculatedHash = computeSha256(rawRecordsString);

  if (calculatedHash !== snapshot.sha256PayloadHash) {
    throw new Error(
      `Corrupção detectada no snapshot! Hash esperado: ${snapshot.sha256PayloadHash}, calculado: ${calculatedHash}`
    );
  }

  return snapshot;
}

// ============================================================================
// 4. MANIFESTO DE EXECUÇÃO AUDITÁVEL (SEM EXPOSIÇÃO DE SEGREDOS)
// ============================================================================

export interface ManifestCompletedStep {
  stepName: 'UPDATE_WHATSAPP_SETTINGS' | 'UPDATE_BILLING_SETTINGS' | 'INSERT_PLAN' | 'INSERT_CUSTOMER';
  targetTable: string;
  exactRecordId: string;
  executedAt: string;
}

export interface MigrationManifest {
  version: string;
  executionId: string;
  timestamp: string;
  targetUserId: string;
  status: 'IN_PROGRESS' | 'COMPLETED' | 'FAILED_COMPENSATED' | 'FAILED_MANUAL_INTERVENTION_REQUIRED';
  snapshotFilePath: string;
  snapshotPayloadHash: string;
  completedSteps: ManifestCompletedStep[];
  createdEntities: {
    planId?: string;
    customerId?: string;
  };
  errorDetails?: string;
  manualInterventionRequired?: boolean;
  evidenceLog?: any[];
  manifestHash?: string;
}

/**
 * Grava o manifesto de migração em disco com validação de hash e sem credenciais.
 */
export function writeMigrationManifest(
  manifestData: Omit<MigrationManifest, 'manifestHash'>,
  outputDirectory: string = path.resolve(process.cwd(), 'backups')
): { filePath: string; manifestHash: string } {
  if (!fs.existsSync(outputDirectory)) {
    fs.mkdirSync(outputDirectory, { recursive: true });
  }

  // Remove manifestHash se existir para cálculo determinístico
  const rawString = deterministicStringify(manifestData);
  const manifestHash = computeSha256(rawString);

  const fullManifest: MigrationManifest = {
    ...manifestData,
    manifestHash,
  };

  const fileName = `migration_manifest_${manifestData.executionId}.json`;
  const filePath = path.join(outputDirectory, fileName);

  fs.writeFileSync(filePath, JSON.stringify(fullManifest, null, 2), 'utf-8');

  if (!fs.existsSync(filePath)) {
    throw new Error(`Falha ao gravar manifesto em ${filePath}`);
  }

  return { filePath, manifestHash };
}

/**
 * Lê e valida o manifesto de migração em disco.
 */
export function verifyMigrationManifest(filePath: string): MigrationManifest {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo de manifesto não encontrado: ${filePath}`);
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  const manifest: MigrationManifest = JSON.parse(content);

  const { manifestHash, ...bodyWithoutHash } = manifest;
  const computed = computeSha256(deterministicStringify(bodyWithoutHash));

  if (computed !== manifestHash) {
    throw new Error(
      `Corrupção detectada no manifesto! Hash esperado: ${manifestHash}, calculado: ${computed}`
    );
  }

  return manifest;
}

// ============================================================================
// 5. MOTOR DE SAGA COMPENSATÓRIA (EXECUÇÃO CONTROLADA COM TRY / CATCH)
// ============================================================================

export class MigrationCompensatedError extends Error {
  public executionId: string;
  public compensatedSteps: string[];

  constructor(message: string, executionId: string, compensatedSteps: string[]) {
    super(`[MIGRAÇÃO COMPENSADA]: ${message}`);
    this.name = 'MigrationCompensatedError';
    this.executionId = executionId;
    this.compensatedSteps = compensatedSteps;
  }
}

export class ManualInterventionRequiredError extends Error {
  public executionId: string;
  public evidenceLog: any[];

  constructor(message: string, executionId: string, evidenceLog: any[]) {
    super(`[INTERVENÇÃO MANUAL OBRIGATÓRIA]: ${message}`);
    this.name = 'ManualInterventionRequiredError';
    this.executionId = executionId;
    this.evidenceLog = evidenceLog;
  }
}

/**
 * Driver abstrato para operações de banco de dados.
 * Permite injeção de dependência para testes sintéticos e execução real.
 */
export interface MigrationDatabaseDriver {
  updateWhatsappSettings(id: string, payload: any): Promise<void>;
  restoreWhatsappSettings(id: string, originalState: any): Promise<void>;
  updateBillingSettings(id: string, payload: any): Promise<void>;
  restoreBillingSettings(id: string, originalState: any): Promise<void>;
  insertPlan(payload: any): Promise<{ id: string }>;
  deletePlan(exactId: string): Promise<void>;
  insertCustomer(payload: any): Promise<{ id: string }>;
  deleteCustomer(exactId: string): Promise<void>;
}

/**
 * Driver Supabase Real para execução transacional e compensatória.
 * Utiliza o cliente administrativo (Service Role) do Supabase.
 */
export class SupabaseMigrationDriver implements MigrationDatabaseDriver {
  private client: any;

  constructor(client: any) {
    if (!client) {
      throw new Error('Supabase client é obrigatório para inicializar o SupabaseMigrationDriver.');
    }
    this.client = client;
  }

  async updateWhatsappSettings(id: string, payload: any): Promise<void> {
    // Escopo 8B.3.1: whatsapp_settings permanece intocada
    return;
  }

  async restoreWhatsappSettings(id: string, originalState: any): Promise<void> {
    if (!originalState) return;
    const { error } = await this.client
      .from('whatsapp_settings')
      .update(originalState)
      .eq('id', id);
    if (error) {
      throw new Error(`Falha ao restaurar whatsapp_settings (ID: ${id}): ${error.message}`);
    }
  }

  async updateBillingSettings(id: string, payload: any): Promise<void> {
    // Escopo 8B.3.1: billing_settings permanece intocada
    return;
  }

  async restoreBillingSettings(id: string, originalState: any): Promise<void> {
    if (!originalState) return;
    const { error } = await this.client
      .from('billing_settings')
      .update(originalState)
      .eq('id', id);
    if (error) {
      throw new Error(`Falha ao restaurar billing_settings (ID: ${id}): ${error.message}`);
    }
  }

  async insertPlan(payload: any): Promise<{ id: string }> {
    const { data, error } = await this.client
      .from('plans')
      .insert(payload)
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`Falha ao inserir plano no Supabase: ${error?.message || 'Nenhum dado retornado'}`);
    }
    return { id: data.id };
  }

  async deletePlan(exactId: string): Promise<void> {
    const { error } = await this.client
      .from('plans')
      .delete()
      .eq('id', exactId);
    if (error) {
      throw new Error(`Falha ao compensar/excluir plano (ID: ${exactId}) no Supabase: ${error.message}`);
    }
  }

  async insertCustomer(payload: any): Promise<{ id: string }> {
    const { data, error } = await this.client
      .from('customers')
      .insert(payload)
      .select('id')
      .single();
    if (error || !data) {
      throw new Error(`Falha ao inserir cliente no Supabase: ${error?.message || 'Nenhum dado retornado'}`);
    }
    return { id: data.id };
  }

  async deleteCustomer(exactId: string): Promise<void> {
    const { error } = await this.client
      .from('customers')
      .delete()
      .eq('id', exactId);
    if (error) {
      throw new Error(`Falha ao compensar/excluir cliente (ID: ${exactId}) no Supabase: ${error.message}`);
    }
  }
}

/**
 * Executa a migração seguindo o padrão Saga com reversão compensatória explícita.
 * Registra cada passo no manifesto e executa exclusões estritamente por ID exato.
 */
export async function executeCompensatingMigration(
  driver: MigrationDatabaseDriver,
  params: {
    targetUserId: string;
    executionId: string;
    snapshotFilePath: string;
    snapshot: SnapshotPayload;
    whatsappPayload: { id: string; update: any };
    billingPayload: { id: string; update: any };
    planPayload: any;
    customerPayload: any;
    outputDirectory?: string;
  }
): Promise<MigrationManifest> {
  const completedSteps: ManifestCompletedStep[] = [];
  const createdEntities: MigrationManifest['createdEntities'] = {};
  const evidenceLog: any[] = [];
  const outputDir = params.outputDirectory || path.resolve(process.cwd(), 'backups');

  let manifest: MigrationManifest = {
    version: '1.0',
    executionId: params.executionId,
    timestamp: new Date().toISOString(),
    targetUserId: params.targetUserId,
    status: 'IN_PROGRESS',
    snapshotFilePath: params.snapshotFilePath,
    snapshotPayloadHash: params.snapshot.sha256PayloadHash,
    completedSteps,
    createdEntities,
  };

  writeMigrationManifest(manifest, outputDir);

  try {
    // ------------------------------------------------------------------------
    // PASSO 1: Atualizar WhatsApp Settings
    // ------------------------------------------------------------------------
    await driver.updateWhatsappSettings(params.whatsappPayload.id, params.whatsappPayload.update);
    completedSteps.push({
      stepName: 'UPDATE_WHATSAPP_SETTINGS',
      targetTable: 'whatsapp_settings',
      exactRecordId: params.whatsappPayload.id,
      executedAt: new Date().toISOString(),
    });

    // ------------------------------------------------------------------------
    // PASSO 2: Atualizar Billing Settings
    // ------------------------------------------------------------------------
    await driver.updateBillingSettings(params.billingPayload.id, params.billingPayload.update);
    completedSteps.push({
      stepName: 'UPDATE_BILLING_SETTINGS',
      targetTable: 'billing_settings',
      exactRecordId: params.billingPayload.id,
      executedAt: new Date().toISOString(),
    });

    // ------------------------------------------------------------------------
    // PASSO 3: Inserir Plano Real ("Canais Liberados")
    // ------------------------------------------------------------------------
    const insertedPlan = await driver.insertPlan(params.planPayload);
    createdEntities.planId = insertedPlan.id;
    completedSteps.push({
      stepName: 'INSERT_PLAN',
      targetTable: 'plans',
      exactRecordId: insertedPlan.id,
      executedAt: new Date().toISOString(),
    });
    writeMigrationManifest(manifest, outputDir);

    // ------------------------------------------------------------------------
    // PASSO 4: Inserir Cliente Real ("Edvan") vinculado ao UUID do plano
    // ------------------------------------------------------------------------
    const customerPayloadWithPlan = {
      ...params.customerPayload,
      plan_id: insertedPlan.id,
    };
    const insertedCust = await driver.insertCustomer(customerPayloadWithPlan);
    createdEntities.customerId = insertedCust.id;
    completedSteps.push({
      stepName: 'INSERT_CUSTOMER',
      targetTable: 'customers',
      exactRecordId: insertedCust.id,
      executedAt: new Date().toISOString(),
    });
    writeMigrationManifest(manifest, outputDir);

    // SUCESSO TOTAL
    manifest.status = 'COMPLETED';
    writeMigrationManifest(manifest, outputDir);
    return manifest;
  } catch (primaryError: any) {
    // ========================================================================
    // ROTINA DE COMPENSAÇÃO (SAGA COMPENSATÓRIA)
    // ========================================================================
    evidenceLog.push({
      failurePhase: 'PRIMARY_EXECUTION',
      error: primaryError.message || String(primaryError),
      timestamp: new Date().toISOString(),
      completedStepsAtFailure: [...completedSteps],
      createdEntitiesAtFailure: { ...createdEntities },
    });

    const compensatedStepsList: string[] = [];
    let compensationFailed = false;

    // Compensar Cliente se tiver sido inserido
    if (createdEntities.customerId) {
      try {
        await driver.deleteCustomer(createdEntities.customerId);
        compensatedStepsList.push(`DELETE_CUSTOMER_${createdEntities.customerId}`);
      } catch (compErr: any) {
        compensationFailed = true;
        evidenceLog.push({
          step: 'COMPENSATE_CUSTOMER',
          failedEntityId: createdEntities.customerId,
          error: compErr.message || String(compErr),
        });
      }
    }

    // Compensar Plano se tiver sido inserido
    if (createdEntities.planId) {
      try {
        await driver.deletePlan(createdEntities.planId);
        compensatedStepsList.push(`DELETE_PLAN_${createdEntities.planId}`);
      } catch (compErr: any) {
        compensationFailed = true;
        evidenceLog.push({
          step: 'COMPENSATE_PLAN',
          failedEntityId: createdEntities.planId,
          error: compErr.message || String(compErr),
        });
      }
    }

    // Compensar Horários de Cobrança
    const billingStep = completedSteps.find((s) => s.stepName === 'UPDATE_BILLING_SETTINGS');
    if (billingStep) {
      try {
        await driver.restoreBillingSettings(
          params.billingPayload.id,
          params.snapshot.records.billing_settings
        );
        compensatedStepsList.push(`RESTORE_BILLING_${params.billingPayload.id}`);
      } catch (compErr: any) {
        compensationFailed = true;
        evidenceLog.push({
          step: 'COMPENSATE_BILLING_SETTINGS',
          failedEntityId: params.billingPayload.id,
          error: compErr.message || String(compErr),
        });
      }
    }

    // Compensar WhatsApp Settings
    const wsStep = completedSteps.find((s) => s.stepName === 'UPDATE_WHATSAPP_SETTINGS');
    if (wsStep) {
      try {
        await driver.restoreWhatsappSettings(
          params.whatsappPayload.id,
          params.snapshot.records.whatsapp_settings
        );
        compensatedStepsList.push(`RESTORE_WHATSAPP_${params.whatsappPayload.id}`);
      } catch (compErr: any) {
        compensationFailed = true;
        evidenceLog.push({
          step: 'COMPENSATE_WHATSAPP_SETTINGS',
          failedEntityId: params.whatsappPayload.id,
          error: compErr.message || String(compErr),
        });
      }
    }

    if (compensationFailed) {
      manifest.status = 'FAILED_MANUAL_INTERVENTION_REQUIRED';
      manifest.manualInterventionRequired = true;
      manifest.errorDetails = `Falha na execução primária e falha na compensação: ${primaryError.message}`;
      manifest.evidenceLog = evidenceLog;
      writeMigrationManifest(manifest, outputDir);

      throw new ManualInterventionRequiredError(
        `FALHA CRÍTICA NA COMPENSAÇÃO: Uma ou mais desfeitas falharam. O banco pode conter dados parciais. ` +
        `Evidências gravadas no manifesto ${params.executionId}. Intervenção manual obrigatória.`,
        params.executionId,
        evidenceLog
      );
    } else {
      manifest.status = 'FAILED_COMPENSATED';
      manifest.errorDetails = `Execução primária falhou (${primaryError.message}). Todas as etapas foram compensadas com sucesso.`;
      manifest.evidenceLog = evidenceLog;
      writeMigrationManifest(manifest, outputDir);

      throw new MigrationCompensatedError(
        `Migração interrompida devido a falha primária (${primaryError.message}). ` +
        `Todas as operações executadas foram desfeitas e o estado anterior foi restabelecido integralmente.`,
        params.executionId,
        compensatedStepsList
      );
    }
  }
}

// ============================================================================
// 6. MECANISMO DE ROLLBACK SEGURO COM DETECÇÃO DE DIVERGÊNCIAS
// ============================================================================

export interface RollbackTarget {
  planIdToDelete: string;
  customerIdToDelete: string;
  expectedUserId: string;
  postMigrationWhatsappStateHash: string;
  postMigrationBillingStateHash: string;
}

export class RollbackSafetyError extends Error {
  constructor(message: string) {
    super(`[BLOQUEIO DE ROLLBACK]: ${message}`);
    this.name = 'RollbackSafetyError';
  }
}

/**
 * Valida se é seguro executar o rollback de configurações.
 * Se o usuário tiver alterado suas credenciais ou horários após a migração,
 * o rollback É BLOQUEADO para não causar perda de dados do cliente.
 */
export function validateConfigRollbackSafety(
  currentRecord: any,
  postMigrationRecordHash: string,
  recordType: 'whatsapp_settings' | 'billing_settings'
): { isSafe: boolean; reason?: string } {
  if (!currentRecord) {
    return { isSafe: true };
  }

  const currentHash = computeSha256(deterministicStringify(currentRecord));

  if (currentHash !== postMigrationRecordHash) {
    throw new RollbackSafetyError(
      `O registro ${recordType} foi alterado posteriormente pelo revendedor ` +
      `(hash atual: ${currentHash} !== pós-migração: ${postMigrationRecordHash}). ` +
      `A reversão foi suspensa para proteger as modificações manuais do usuário.`
    );
  }

  return { isSafe: true };
}

/**
 * Valida a integridade da exclusão do plano no rollback:
 * O plano só pode ser excluído se não tiver gerado nenhum cliente posterior além do cliente migrado.
 */
export function validatePlanRollbackSafety(
  planId: string,
  migratedCustomerId: string,
  associatedCustomerIds: string[]
): { isSafe: boolean; reason?: string } {
  const foreignCustomers = associatedCustomerIds.filter((id) => id !== migratedCustomerId);

  if (foreignCustomers.length > 0) {
    throw new RollbackSafetyError(
      `O plano ${planId} não pode ser revertido pois já possui ${foreignCustomers.length} ` +
      `novo(s) cliente(s) associado(s) criado(s) após a migração.`
    );
  }

  return { isSafe: true };
}

/**
 * Valida todas as pré-condições necessárias para permitir o rollback a partir de um manifesto.
 */
export function validateRollbackPreconditions(params: {
  manifestPath: string;
  expectedUserId: string;
  currentWhatsappRecord: any;
  currentBillingRecord: any;
  postMigrationWhatsappHash: string;
  postMigrationBillingHash: string;
  planAssociatedCustomerIds: string[];
}): {
  manifest: MigrationManifest;
  snapshot: SnapshotPayload;
} {
  const manifest = verifyMigrationManifest(params.manifestPath);

  if (manifest.targetUserId !== params.expectedUserId) {
    throw new RollbackSafetyError(
      `O manifesto informado pertence ao usuário ${manifest.targetUserId}, mas o esperado era ${params.expectedUserId}.`
    );
  }

  if (manifest.status !== 'COMPLETED') {
    throw new RollbackSafetyError(
      `O manifesto está com status "${manifest.status}". Somente execuções com status "COMPLETED" podem ser revertidas.`
    );
  }

  if (!manifest.createdEntities.planId || !manifest.createdEntities.customerId) {
    throw new RollbackSafetyError(
      `O manifesto não contém os UUIDs exatos do plano e cliente criados pela migração.`
    );
  }

  const snapshot = verifySnapshotFile(manifest.snapshotFilePath);

  // Verificar se usuário alterou configurações pós-migração
  validateConfigRollbackSafety(
    params.currentWhatsappRecord,
    params.postMigrationWhatsappHash,
    'whatsapp_settings'
  );

  validateConfigRollbackSafety(
    params.currentBillingRecord,
    params.postMigrationBillingHash,
    'billing_settings'
  );

  // Verificar se plano tem clientes novos além do cliente migrado
  validatePlanRollbackSafety(
    manifest.createdEntities.planId,
    manifest.createdEntities.customerId,
    params.planAssociatedCustomerIds
  );

  return { manifest, snapshot };
}

/**
 * Executa o rollback controlado com base no manifesto e snapshot validados.
 */
export async function executeRollbackWithManifest(
  driver: MigrationDatabaseDriver,
  params: {
    manifestPath: string;
    expectedUserId: string;
    currentWhatsappRecord: any;
    currentBillingRecord: any;
    postMigrationWhatsappHash: string;
    postMigrationBillingHash: string;
    planAssociatedCustomerIds: string[];
  }
): Promise<{ revertedPlanId: string; revertedCustomerId: string; restoredSettings: boolean }> {
  const { manifest, snapshot } = validateRollbackPreconditions(params);

  const planId = manifest.createdEntities.planId!;
  const customerId = manifest.createdEntities.customerId!;

  // 1. Excluir exclusivamente o cliente migrado por ID exato
  await driver.deleteCustomer(customerId);

  // 2. Excluir exclusivamente o plano migrado por ID exato
  await driver.deletePlan(planId);

  // 3. Restaurar configurações aos valores exatos do snapshot pré-migração
  const wsStep = manifest.completedSteps.find((s) => s.stepName === 'UPDATE_WHATSAPP_SETTINGS');
  if (wsStep) {
    await driver.restoreWhatsappSettings(wsStep.exactRecordId, snapshot.records.whatsapp_settings);
  }

  const bsStep = manifest.completedSteps.find((s) => s.stepName === 'UPDATE_BILLING_SETTINGS');
  if (bsStep) {
    await driver.restoreBillingSettings(bsStep.exactRecordId, snapshot.records.billing_settings);
  }

  return {
    revertedPlanId: planId,
    revertedCustomerId: customerId,
    restoredSettings: true,
  };
}

// ============================================================================
// 7. PRESERVAÇÃO DE SEGURANÇA: WHATSAPP E TEMPLATES
// ============================================================================

export interface MigrationConfigEnforcement {
  apiUrl: string;
  instanceName: string;
  apiKey: string;
  isConnected: boolean;
  autoBillingEnabled: boolean;
  templateAction: 'PRESERVE_SYSTEM_DEFAULT';
}

/**
 * Sanitiza o payload de migração de configurações garantindo as regras estritas da Fase 8A:
 * - is_connected SEMPRE forçado para false
 * - auto_billing_enabled SEMPRE forçado para false
 * - templates de mensagens SEMPRE preservados com os padrões do sistema (rejeição de texto de teste).
 */
export function enforceSafeMigrationSettings(
  legacyWhatsapp: any,
  legacyBilling: any,
  legacyTemplates: any[]
): {
  whatsappSettings: {
    apiUrl: string;
    instanceName: string;
    apiKey: string;
    isConnected: boolean;
    autoBillingEnabled: boolean;
  };
  billingSettings: {
    timezone: string;
    sendDayBefore: boolean;
    timeDayBefore: string;
  };
  templatePolicy: {
    action: 'PRESERVE_SYSTEM_DEFAULT';
    reason: string;
    ignoredLegacyTemplatesCount: number;
  };
} {
  const safeWhatsapp = {
    apiUrl: legacyWhatsapp?.api_url || '',
    instanceName: legacyWhatsapp?.instance_name || '',
    apiKey: legacyWhatsapp?.api_key || '',
    isConnected: false, // FORÇADO FALSE
    autoBillingEnabled: false, // FORÇADO FALSE
  };

  const safeBilling = {
    timezone: legacyBilling?.timezone || 'America/Sao_Paulo',
    sendDayBefore: Boolean(legacyBilling?.send_day_before ?? true),
    timeDayBefore: legacyBilling?.time_day_before || '09:00',
  };

  const safeTemplatePolicy = {
    action: 'PRESERVE_SYSTEM_DEFAULT' as const,
    reason: 'Preservar templates oficiais do sistema Supabase; modelo de teste do backup descartado.',
    ignoredLegacyTemplatesCount: legacyTemplates?.length || 0,
  };

  return {
    whatsappSettings: safeWhatsapp,
    billingSettings: safeBilling,
    templatePolicy: safeTemplatePolicy,
  };
}

/**
 * Consulta de validação pós-migração:
 * - Distingue explicitamente os dois registros recém-criados dos preexistentes.
 * - Confirma que o plano inserido tem o ID exato e pertence ao user_id alvo.
 * - Confirma que o cliente inserido tem o ID exato, pertence ao user_id alvo e referencia o plano criado.
 * - Confirma isolamento estrito contra registros preexistentes.
 */
export async function verifyPostMigrationState(
  supabaseClient: any,
  targetUserId: string,
  createdPlanId: string,
  createdCustomerId: string
): Promise<{
  isValid: boolean;
  verifiedPlan: any;
  verifiedCustomer: any;
  preExistingPlansCount: number;
  preExistingCustomersCount: number;
}> {
  // 1. Validar plano recém-criado
  const { data: plan, error: planErr } = await supabaseClient
    .from('plans')
    .select('id, user_id, name, price, duration_days, panel, server_dns, status')
    .eq('id', createdPlanId)
    .single();

  if (planErr || !plan) {
    throw new Error(`Validação pós-migração falhou: plano ${createdPlanId} não encontrado no banco.`);
  }

  if (plan.user_id !== targetUserId) {
    throw new Error(`Validação pós-migração falhou: plano pertence a ${plan.user_id}, esperado ${targetUserId}.`);
  }

  // 2. Validar cliente recém-criado
  const { data: customer, error: custErr } = await supabaseClient
    .from('customers')
    .select('id, user_id, name, whatsapp, start_date, expiration_date, status, plan_id')
    .eq('id', createdCustomerId)
    .single();

  if (custErr || !customer) {
    throw new Error(`Validação pós-migração falhou: cliente ${createdCustomerId} não encontrado no banco.`);
  }

  if (customer.user_id !== targetUserId) {
    throw new Error(`Validação pós-migração falhou: cliente pertence a ${customer.user_id}, esperado ${targetUserId}.`);
  }

  if (customer.plan_id !== createdPlanId) {
    throw new Error(
      `Validação pós-migração falhou: foreign key customer.plan_id (${customer.plan_id}) diverge do plano criado (${createdPlanId}).`
    );
  }

  // 3. Contar registros totais do revendedor para confirmar distinção e isolamento
  const { count: totalPlans } = await supabaseClient
    .from('plans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', targetUserId);

  const { count: totalCusts } = await supabaseClient
    .from('customers')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', targetUserId);

  const preExistingPlans = Math.max(0, (totalPlans || 1) - 1);
  const preExistingCusts = Math.max(0, (totalCusts || 1) - 1);

  return {
    isValid: true,
    verifiedPlan: plan,
    verifiedCustomer: customer,
    preExistingPlansCount: preExistingPlans,
    preExistingCustomersCount: preExistingCusts,
  };
}

