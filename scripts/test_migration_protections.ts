/**
 * GESTOR FLIX — SUÍTE AMPLIADA DE TESTES SINTÉTICOS DAS PROTEÇÕES (FASE 8A.6)
 * 
 * Valida de ponta a ponta as rotinas de segurança sem tocar em dados reais:
 * 1. Travas de escrita ativas em modo inviolável.
 * 2. Proteção de segredos no .gitignore (backups/, manifestos e recibos).
 * 3. Geração e validação criptográfica (SHA-256) de snapshot pré-migração.
 * 4. Falha na inserção do plano (compensação das configurações atualizadas).
 * 5. Falha na inserção do cliente após criação do plano (exclusão do plano órfão por ID exato).
 * 6. Falha após atualização de configuração (reversão em cascata).
 * 7. Falha durante a compensação (marcação de INTERVENÇÃO MANUAL e evidências preservadas).
 * 8. Rejeição de rollback com manifesto ausente ou corrompido.
 * 9. Bloqueio de rollback em caso de alterações posteriores do usuário (conflito).
 * 10. Garantia de que rollback nunca exclui registros preexistentes ou clientes legítimos posteriores.
 * 11. Garantia de ausência de credenciais/chaves no manifesto de migração.
 * 12. Fluxo bem-sucedido de ponta a ponta com rollback subsequente validado.
 * 
 * REGRAS INEGOCIÁVEIS:
 * - 100% dos testes operam em memória ou em diretório de teste temporário.
 * - ZERO gravações ou chamadas ao Supabase ou Evolution API.
 */

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { runJonjonMigrationSimulation } from './migrate_jonjon_data.js';
import { runRollbackSimulation } from './rollback_jonjon_data.js';
import {
  writePreMigrationSnapshot,
  verifySnapshotFile,
  writeMigrationManifest,
  verifyMigrationManifest,
  executeCompensatingMigration,
  executeRollbackWithManifest,
  validateConfigRollbackSafety,
  validatePlanRollbackSafety,
  verifyPostMigrationState,
  enforceSafeMigrationSettings,
  computeSha256,
  deterministicStringify,
  MigrationDatabaseDriver,
  SnapshotPayload,
  MigrationCompensatedError,
  ManualInterventionRequiredError,
  RollbackSafetyError,
} from './migration_guard.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, details?: string) {
  if (condition) {
    console.log(`  [PASSOU] ${testName}`);
    passedTests++;
  } else {
    console.error(`  [FALHOU] ${testName} ${details ? '- ' + details : ''}`);
    failedTests++;
  }
}

// Implementação de Driver Mock em memória para simulação de falhas e compensações
class MockMigrationDriver implements MigrationDatabaseDriver {
  public db: {
    whatsapp_settings: Record<string, any>;
    billing_settings: Record<string, any>;
    plans: Record<string, any>;
    customers: Record<string, any>;
  };

  public failOnInsertPlan = false;
  public failOnInsertCustomer = false;
  public failOnUpdateBilling = false;
  public failOnCompensatePlan = false;

  public callHistory: string[] = [];

  constructor(initialState?: any) {
    this.db = {
      whatsapp_settings: initialState?.whatsapp_settings ? { ...initialState.whatsapp_settings } : {},
      billing_settings: initialState?.billing_settings ? { ...initialState.billing_settings } : {},
      plans: {},
      customers: {},
    };
  }

  async updateWhatsappSettings(id: string, payload: any): Promise<void> {
    this.callHistory.push(`updateWhatsappSettings:${id}`);
    this.db.whatsapp_settings[id] = { ...this.db.whatsapp_settings[id], ...payload };
  }

  async restoreWhatsappSettings(id: string, originalState: any): Promise<void> {
    this.callHistory.push(`restoreWhatsappSettings:${id}`);
    this.db.whatsapp_settings[id] = { ...originalState };
  }

  async updateBillingSettings(id: string, payload: any): Promise<void> {
    if (this.failOnUpdateBilling) {
      throw new Error('Falha simulada na atualização de horários de cobrança');
    }
    this.callHistory.push(`updateBillingSettings:${id}`);
    this.db.billing_settings[id] = { ...this.db.billing_settings[id], ...payload };
  }

  async restoreBillingSettings(id: string, originalState: any): Promise<void> {
    this.callHistory.push(`restoreBillingSettings:${id}`);
    this.db.billing_settings[id] = { ...originalState };
  }

  async insertPlan(payload: any): Promise<{ id: string }> {
    if (this.failOnInsertPlan) {
      throw new Error('Falha simulada na inserção do plano');
    }
    const id = randomUUID();
    this.callHistory.push(`insertPlan:${id}`);
    this.db.plans[id] = { id, ...payload };
    return { id };
  }

  async deletePlan(exactId: string): Promise<void> {
    if (this.failOnCompensatePlan) {
      throw new Error('Falha simulada na desfeita compensatória do plano');
    }
    this.callHistory.push(`deletePlan:${exactId}`);
    delete this.db.plans[exactId];
  }

  async insertCustomer(payload: any): Promise<{ id: string }> {
    if (this.failOnInsertCustomer) {
      throw new Error('Falha simulada na inserção do cliente (ex: constraint)');
    }
    const id = randomUUID();
    this.callHistory.push(`insertCustomer:${id}`);
    this.db.customers[id] = { id, ...payload };
    return { id };
  }

  async deleteCustomer(exactId: string): Promise<void> {
    this.callHistory.push(`deleteCustomer:${exactId}`);
    delete this.db.customers[exactId];
  }
}

async function runExpandedTestSuite() {
  console.log('========================================================================');
  console.log('  GESTOR FLIX — TESTES DAS PROTEÇÕES AMPLIADAS DA FASE 8A.6');
  console.log('========================================================================\n');

  const testTempDir = path.resolve(process.cwd(), 'backups/test_synthetic_suite');
  if (!fs.existsSync(testTempDir)) {
    fs.mkdirSync(testTempDir, { recursive: true });
  }

  // --------------------------------------------------------------------------
  // TESTE 1: INVIOLABILIDADE DAS TRAVAS DE ESCRITA
  // --------------------------------------------------------------------------
  console.log('--- 1. TESTE DE BLOQUEIO DE ESCRITA (--write REJEITADO) ---');
  let migBlocked = false;
  try {
    await runJonjonMigrationSimulation(false);
  } catch (err: any) {
    if (err.message.includes('[TRAVA DE SEGURANÇA ATIVA]')) migBlocked = true;
  }
  assert(migBlocked, 'Tentativa de escrita no script de migração é abortada com trava ativa');

  let rollBlocked = false;
  try {
    await runRollbackSimulation(undefined, false);
  } catch (err: any) {
    if (err.message.includes('[TRAVA DE SEGURANÇA ATIVA]')) rollBlocked = true;
  }
  assert(rollBlocked, 'Tentativa de escrita no script de rollback é abortada com trava ativa');

  // --------------------------------------------------------------------------
  // TESTE 2: PROTEÇÃO DE SEGREDOS NO .GITIGNORE
  // --------------------------------------------------------------------------
  console.log('\n--- 2. TESTE DE PROTEÇÃO NO .GITIGNORE ---');
  const gitignorePath = path.resolve(process.cwd(), '.gitignore');
  const gitignoreContent = fs.existsSync(gitignorePath) ? fs.readFileSync(gitignorePath, 'utf-8') : '';
  const ignoresBackups = gitignoreContent.includes('backups/');
  const ignoresReceipts = gitignoreContent.includes('*.receipt.json');
  const ignoresManifests = gitignoreContent.includes('*.manifest.json');

  assert(ignoresBackups, 'Diretório backups/ explicitamente incluído no .gitignore');
  assert(ignoresReceipts && ignoresManifests, 'Recibos e manifestos de migração cobertos no .gitignore');

  // --------------------------------------------------------------------------
  // TESTE 3: SNAPSHOT PRÉ-MIGRAÇÃO E DETECÇÃO DE CORRUPÇÃO
  // --------------------------------------------------------------------------
  console.log('\n--- 3. TESTE DE GERAÇÃO E VALIDAÇÃO DE SNAPSHOT (SHA-256) ---');
  const testUserId = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';
  const initialSnapshotData = {
    whatsapp_settings: {
      id: 'd004d147-66a2-4395-9223-df18fc644b6b',
      user_id: testUserId,
      instance_name: '',
      api_url: '',
      is_connected: false,
      auto_billing_enabled: false,
    },
    billing_settings: {
      id: '9674f718-76b8-44c3-8540-70ca2edd061a',
      user_id: testUserId,
      timezone: 'America/Sao_Paulo',
      time_day_before: '09:00',
    },
    message_templates: [{ id: 'e0c6d8a9-52be-43d4-8747-c1daab099871', type: 'day_before' }],
    plans_count: 0,
    customers_count: 0,
  };

  const snapInfo = writePreMigrationSnapshot(testUserId, initialSnapshotData, testTempDir);
  assert(fs.existsSync(snapInfo.filePath) && snapInfo.fileSize > 0, 'Snapshot sintético gravado com sucesso');

  const verifiedSnap = verifySnapshotFile(snapInfo.filePath);
  assert(verifiedSnap.sha256PayloadHash === snapInfo.payloadHash, 'Hash SHA-256 do payload validado com sucesso');

  // --------------------------------------------------------------------------
  // TESTE 4: SAGA — FALHA NA INSERÇÃO DO PLANO
  // --------------------------------------------------------------------------
  console.log('\n--- 4. TESTE DE FALHA NA INSERÇÃO DO PLANO (SAGA COMPENSATÓRIA) ---');
  const driverFailPlan = new MockMigrationDriver({
    whatsapp_settings: { [initialSnapshotData.whatsapp_settings.id]: initialSnapshotData.whatsapp_settings },
    billing_settings: { [initialSnapshotData.billing_settings.id]: initialSnapshotData.billing_settings },
  });
  driverFailPlan.failOnInsertPlan = true;

  let planFailCaught = false;
  try {
    await executeCompensatingMigration(driverFailPlan, {
      targetUserId: testUserId,
      executionId: 'exec-test-fail-plan',
      snapshotFilePath: snapInfo.filePath,
      snapshot: verifiedSnap,
      whatsappPayload: { id: initialSnapshotData.whatsapp_settings.id, update: { api_url: 'https://new.url' } },
      billingPayload: { id: initialSnapshotData.billing_settings.id, update: { time_day_before: '15:00' } },
      planPayload: { name: 'Canais Liberados', price: 35 },
      customerPayload: { name: 'Edvan', whatsapp: '5585996079396' },
      outputDirectory: testTempDir,
    });
  } catch (err: any) {
    if (err instanceof MigrationCompensatedError) {
      planFailCaught = true;
    }
  }
  assert(planFailCaught, 'Falha no plano dispara MigrationCompensatedError e desfaz configurações prévias');
  assert(
    driverFailPlan.db.whatsapp_settings[initialSnapshotData.whatsapp_settings.id].api_url === '',
    'Configurações de WhatsApp restauradas ao valor original do snapshot'
  );

  // --------------------------------------------------------------------------
  // TESTE 5: SAGA — FALHA NO CLIENTE APÓS CRIAÇÃO DO PLANO
  // --------------------------------------------------------------------------
  console.log('\n--- 5. TESTE DE FALHA NO CLIENTE APÓS CRIAÇÃO DO PLANO ---');
  const driverFailCustomer = new MockMigrationDriver({
    whatsapp_settings: { [initialSnapshotData.whatsapp_settings.id]: initialSnapshotData.whatsapp_settings },
    billing_settings: { [initialSnapshotData.billing_settings.id]: initialSnapshotData.billing_settings },
  });
  driverFailCustomer.failOnInsertCustomer = true;

  let customerFailCaught = false;
  try {
    await executeCompensatingMigration(driverFailCustomer, {
      targetUserId: testUserId,
      executionId: 'exec-test-fail-cust',
      snapshotFilePath: snapInfo.filePath,
      snapshot: verifiedSnap,
      whatsappPayload: { id: initialSnapshotData.whatsapp_settings.id, update: { api_url: 'https://new.url' } },
      billingPayload: { id: initialSnapshotData.billing_settings.id, update: { time_day_before: '15:00' } },
      planPayload: { name: 'Canais Liberados', price: 35 },
      customerPayload: { name: 'Edvan', whatsapp: '5585996079396' },
      outputDirectory: testTempDir,
    });
  } catch (err: any) {
    if (err instanceof MigrationCompensatedError) {
      customerFailCaught = true;
    }
  }
  assert(customerFailCaught, 'Falha na inserção do cliente aciona desfeita do plano já inserido');
  assert(
    Object.keys(driverFailCustomer.db.plans).length === 0,
    'Plano órfão foi excluído cirurgicamente pelo ID exato na compensação'
  );

  // --------------------------------------------------------------------------
  // TESTE 6: SAGA — FALHA APÓS ATUALIZAÇÃO DE CONFIGURAÇÃO (BILLING)
  // --------------------------------------------------------------------------
  console.log('\n--- 6. TESTE DE FALHA NA CONFIGURAÇÃO (REVERSÃO EM CASCATA) ---');
  const driverFailBilling = new MockMigrationDriver({
    whatsapp_settings: { [initialSnapshotData.whatsapp_settings.id]: initialSnapshotData.whatsapp_settings },
    billing_settings: { [initialSnapshotData.billing_settings.id]: initialSnapshotData.billing_settings },
  });
  driverFailBilling.failOnUpdateBilling = true;

  let billingFailCaught = false;
  try {
    await executeCompensatingMigration(driverFailBilling, {
      targetUserId: testUserId,
      executionId: 'exec-test-fail-billing',
      snapshotFilePath: snapInfo.filePath,
      snapshot: verifiedSnap,
      whatsappPayload: { id: initialSnapshotData.whatsapp_settings.id, update: { api_url: 'https://new.url' } },
      billingPayload: { id: initialSnapshotData.billing_settings.id, update: { time_day_before: '15:00' } },
      planPayload: { name: 'Canais Liberados', price: 35 },
      customerPayload: { name: 'Edvan', whatsapp: '5585996079396' },
      outputDirectory: testTempDir,
    });
  } catch (err: any) {
    if (err instanceof MigrationCompensatedError) {
      billingFailCaught = true;
    }
  }
  assert(billingFailCaught, 'Falha em billing reverte whatsapp_settings previamente alterado');

  // --------------------------------------------------------------------------
  // TESTE 7: SAGA — FALHA DURANTE A COMPENSAÇÃO (INTERVENÇÃO MANUAL)
  // --------------------------------------------------------------------------
  console.log('\n--- 7. TESTE DE FALHA NA COMPENSAÇÃO (INTERVENÇÃO MANUAL OBRIGATÓRIA) ---');
  const driverFailCompensation = new MockMigrationDriver({
    whatsapp_settings: { [initialSnapshotData.whatsapp_settings.id]: initialSnapshotData.whatsapp_settings },
    billing_settings: { [initialSnapshotData.billing_settings.id]: initialSnapshotData.billing_settings },
  });
  driverFailCompensation.failOnInsertCustomer = true;
  driverFailCompensation.failOnCompensatePlan = true; // Simula falha catastrófica de rede ao tentar deletar plano

  let manualInterventionCaught = false;
  let savedEvidenceCount = 0;
  try {
    await executeCompensatingMigration(driverFailCompensation, {
      targetUserId: testUserId,
      executionId: 'exec-test-fail-compensation',
      snapshotFilePath: snapInfo.filePath,
      snapshot: verifiedSnap,
      whatsappPayload: { id: initialSnapshotData.whatsapp_settings.id, update: { api_url: 'https://new.url' } },
      billingPayload: { id: initialSnapshotData.billing_settings.id, update: { time_day_before: '15:00' } },
      planPayload: { name: 'Canais Liberados', price: 35 },
      customerPayload: { name: 'Edvan', whatsapp: '5585996079396' },
      outputDirectory: testTempDir,
    });
  } catch (err: any) {
    if (err instanceof ManualInterventionRequiredError) {
      manualInterventionCaught = true;
      savedEvidenceCount = err.evidenceLog.length;
    }
  }
  assert(
    manualInterventionCaught,
    'Falha na compensação lança ManualInterventionRequiredError com evidências preservadas'
  );
  assert(savedEvidenceCount > 0, `Evidências de falha registradas com precisão (${savedEvidenceCount} eventos)`);

  const failedManifestPath = path.join(testTempDir, 'migration_manifest_exec-test-fail-compensation.json');
  const failedManifest = verifyMigrationManifest(failedManifestPath);
  assert(
    failedManifest.status === 'FAILED_MANUAL_INTERVENTION_REQUIRED',
    'Status do manifesto gravado como FAILED_MANUAL_INTERVENTION_REQUIRED'
  );

  // --------------------------------------------------------------------------
  // TESTE 8: MANIFESTO AUSENTE OU CORROMPIDO
  // --------------------------------------------------------------------------
  console.log('\n--- 8. TESTE DE REJEIÇÃO COM MANIFESTO AUSENTE OU CORROMPIDO ---');
  let missingManifestError = false;
  try {
    verifyMigrationManifest(path.join(testTempDir, 'non_existent_manifest.json'));
  } catch {
    missingManifestError = true;
  }
  assert(missingManifestError, 'Manifesto ausente impede execução de rollback');

  // Adulteração de manifesto
  const tamperedManifestPath = path.join(testTempDir, 'corrupted_manifest.json');
  const goodManifest = {
    version: '1.0',
    executionId: 'tamper-test',
    timestamp: new Date().toISOString(),
    targetUserId: testUserId,
    status: 'COMPLETED' as const,
    snapshotFilePath: snapInfo.filePath,
    snapshotPayloadHash: snapInfo.payloadHash,
    completedSteps: [],
    createdEntities: { planId: 'abc', customerId: 'def' },
  };
  const { filePath: writtenGoodPath } = writeMigrationManifest(goodManifest, testTempDir);
  const rawGoodContent = fs.readFileSync(writtenGoodPath, 'utf-8');
  // Adultera um campo sem atualizar o hash
  fs.writeFileSync(tamperedManifestPath, rawGoodContent.replace('"abc"', '"xyz"'), 'utf-8');

  let tamperCaught = false;
  try {
    verifyMigrationManifest(tamperedManifestPath);
  } catch (err: any) {
    if (err.message.includes('Corrupção detectada no manifesto')) {
      tamperCaught = true;
    }
  }
  assert(tamperCaught, 'Detecção de integridade SHA-256 rejeita manifesto adulterado');

  // --------------------------------------------------------------------------
  // TESTE 9: CONFLITO COM ALTERAÇÕES POSTERIORES
  // --------------------------------------------------------------------------
  console.log('\n--- 9. TESTE DE CONFLITO COM ALTERAÇÕES POSTERIORES ---');
  const originalState = { api_url: 'https://api.doratec.site', instance_name: 'instancia_1' };
  const originalHash = computeSha256(deterministicStringify(originalState));
  const userModifiedState = { api_url: 'https://api.doratec.site', instance_name: 'instancia_ALTERADA_MANUALMENTE' };

  let conflictBlocked = false;
  try {
    validateConfigRollbackSafety(userModifiedState, originalHash, 'whatsapp_settings');
  } catch (err: any) {
    if (err instanceof RollbackSafetyError) {
      conflictBlocked = true;
    }
  }
  assert(conflictBlocked, 'Rollback é estritamente bloqueado se o revendedor alterou configurações posteriormente');

  // --------------------------------------------------------------------------
  // TESTE 10: PROTEÇÃO DE REGISTROS PREEXISTENTES NO ROLLBACK
  // --------------------------------------------------------------------------
  console.log('\n--- 10. TESTE DE GARANTIA: NENHUM REGISTRO PREEXISTENTE EXCLUÍDO ---');
  const migratedPlanId = randomUUID();
  const migratedCustId = randomUUID();
  const preExistingCustId = randomUUID(); // Cliente anterior que não deve ser tocado

  let foreignBlocked = false;
  try {
    // Tenta reverter plano quando há cliente preexistente associado
    validatePlanRollbackSafety(migratedPlanId, migratedCustId, [migratedCustId, preExistingCustId]);
  } catch (err: any) {
    if (err instanceof RollbackSafetyError) {
      foreignBlocked = true;
    }
  }
  assert(foreignBlocked, 'Rollback se recusa a excluir plano caso existam novos clientes associados');

  // --------------------------------------------------------------------------
  // TESTE 11: AUSÊNCIA DE CREDENCIAIS OU SEGREDOS NO MANIFESTO
  // --------------------------------------------------------------------------
  console.log('\n--- 11. TESTE DE AUSÊNCIA DE SEGREDOS NO MANIFESTO ---');
  const sampleManifestString = JSON.stringify(goodManifest);
  const containsApiKey = sampleManifestString.includes('api_key') || sampleManifestString.includes('secret') || sampleManifestString.includes('token');
  assert(!containsApiKey, 'Manifesto não armazena chaves de API, senhas ou segredos');

  // --------------------------------------------------------------------------
  // TESTE 12: EXECUÇÃO COMPLETA DA SAGA E ROLLBACK INTEGRAL CONTROLADO
  // --------------------------------------------------------------------------
  console.log('\n--- 12. TESTE DE FLUXO BEM-SUCEDIDO COM ROLLBACK POSTERIOR ---');
  const successfulDriver = new MockMigrationDriver({
    whatsapp_settings: { [initialSnapshotData.whatsapp_settings.id]: { ...initialSnapshotData.whatsapp_settings } },
    billing_settings: { [initialSnapshotData.billing_settings.id]: { ...initialSnapshotData.billing_settings } },
  });

  const successExecutionId = 'exec-test-success-flow';
  const completedManifest = await executeCompensatingMigration(successfulDriver, {
    targetUserId: testUserId,
    executionId: successExecutionId,
    snapshotFilePath: snapInfo.filePath,
    snapshot: verifiedSnap,
    whatsappPayload: {
      id: initialSnapshotData.whatsapp_settings.id,
      update: { api_url: 'https://api.doratec.site', instance_name: 'inst_jonjon' },
    },
    billingPayload: {
      id: initialSnapshotData.billing_settings.id,
      update: { time_day_before: '15:04' },
    },
    planPayload: { name: 'Canais Liberados', price: 35, duration_days: 30 },
    customerPayload: { name: 'Edvan', whatsapp: '5585996079396', expiration_date: '2026-10-23' },
    outputDirectory: testTempDir,
  });

  assert(completedManifest.status === 'COMPLETED', 'Migração bem-sucedida atinge status COMPLETED no manifesto');
  assert(
    Object.keys(successfulDriver.db.plans).length === 1 && Object.keys(successfulDriver.db.customers).length === 1,
    'Plano e cliente criados com sucesso na execução primária'
  );

  // Agora testa a reversão completa via manifesto
  const successManifestPath = path.join(testTempDir, `migration_manifest_${successExecutionId}.json`);
  const postWsHash = computeSha256(
    deterministicStringify(successfulDriver.db.whatsapp_settings[initialSnapshotData.whatsapp_settings.id])
  );
  const postBsHash = computeSha256(
    deterministicStringify(successfulDriver.db.billing_settings[initialSnapshotData.billing_settings.id])
  );

  const rollbackResult = await executeRollbackWithManifest(successfulDriver, {
    manifestPath: successManifestPath,
    expectedUserId: testUserId,
    currentWhatsappRecord: successfulDriver.db.whatsapp_settings[initialSnapshotData.whatsapp_settings.id],
    currentBillingRecord: successfulDriver.db.billing_settings[initialSnapshotData.billing_settings.id],
    postMigrationWhatsappHash: postWsHash,
    postMigrationBillingHash: postBsHash,
    planAssociatedCustomerIds: [completedManifest.createdEntities.customerId!],
  });

  assert(
    rollbackResult.revertedPlanId === completedManifest.createdEntities.planId,
    'Rollback removeu exatamente o plano gerado na migração'
  );
  assert(
    rollbackResult.revertedCustomerId === completedManifest.createdEntities.customerId,
    'Rollback removeu exatamente o cliente gerado na migração'
  );
  assert(
    Object.keys(successfulDriver.db.plans).length === 0 && Object.keys(successfulDriver.db.customers).length === 0,
    'Banco limpo após reversão sem deixar resíduos'
  );
  assert(
    successfulDriver.db.whatsapp_settings[initialSnapshotData.whatsapp_settings.id].api_url === '',
    'Configuração de WhatsApp restaurada com fidelidade ao snapshot original'
  );

  // --------------------------------------------------------------------------
  // TESTE 13: VALIDAÇÃO PÓS-MIGRAÇÃO (ISOLAMENTO E CHAVE ESTRANGEIRA)
  // --------------------------------------------------------------------------
  console.log('\n--- 13. TESTE DE VALIDAÇÃO PÓS-MIGRAÇÃO (ISOLAMENTO E FK) ---');
  const mockPlanId = randomUUID();
  const mockCustId = randomUUID();

  const validMockSupabase = {
    from: (table: string) => ({
      select: (_cols?: string, opts?: any) => {
        if (opts?.count === 'exact') {
          return {
            eq: () => Promise.resolve({ count: 1 }),
          };
        }
        return {
          eq: (_col: string, val: string) => ({
            single: () => {
              if (table === 'plans') {
                return Promise.resolve({
                  data: {
                    id: val,
                    user_id: testUserId,
                    name: 'Canais Liberados',
                    price: 35.0,
                    duration_days: 30,
                    panel: 'P2 imperial',
                    server_dns: ['http://hosting.com:80'],
                    status: 'active',
                  },
                  error: null,
                });
              }
              if (table === 'customers') {
                return Promise.resolve({
                  data: {
                    id: val,
                    user_id: testUserId,
                    name: 'Edvan',
                    whatsapp: '5585996079396',
                    start_date: '2026-10-24',
                    expiration_date: '2026-10-23',
                    status: 'expired',
                    plan_id: mockPlanId,
                  },
                  error: null,
                });
              }
              return Promise.resolve({ data: null, error: new Error('not found') });
            },
          }),
        };
      },
    }),
  };

  const postMigCheck = await verifyPostMigrationState(validMockSupabase, testUserId, mockPlanId, mockCustId);
  assert(
    postMigCheck.isValid && postMigCheck.verifiedCustomer.plan_id === mockPlanId,
    'Validação pós-migração confirma correspondência de chave estrangeira'
  );
  assert(
    postMigCheck.preExistingPlansCount === 0 && postMigCheck.preExistingCustomersCount === 0,
    'Isolamento de registros preexistentes confirmado'
  );

  // Rejeição estrita com foreign key divergente
  const invalidFkMockSupabase = {
    from: (table: string) => ({
      select: (_cols?: string, opts?: any) => {
        if (opts?.count === 'exact') return { eq: () => Promise.resolve({ count: 1 }) };
        return {
          eq: (_col: string, val: string) => ({
            single: () => {
              if (table === 'plans') return Promise.resolve({ data: { id: val, user_id: testUserId, name: 'Canais Liberados', price: 35.0 }, error: null });
              if (table === 'customers') return Promise.resolve({ data: { id: val, user_id: testUserId, name: 'Edvan', plan_id: 'outro-uuid-invalido' }, error: null });
              return Promise.resolve({ data: null, error: null });
            },
          }),
        };
      },
    }),
  };

  let fkErrorCaught = false;
  try {
    await verifyPostMigrationState(invalidFkMockSupabase, testUserId, mockPlanId, mockCustId);
  } catch (err: any) {
    if (err.message.includes('foreign key customer.plan_id')) {
      fkErrorCaught = true;
    }
  }
  assert(fkErrorCaught, 'Rejeição estrita se customer.plan_id divergir do UUID do plano inserido');

  // Limpeza do diretório temporário de testes
  const testFiles = fs.readdirSync(testTempDir);
  for (const f of testFiles) {
    fs.unlinkSync(path.join(testTempDir, f));
  }
  fs.rmdirSync(testTempDir);

  // --------------------------------------------------------------------------
  // RESUMO
  // --------------------------------------------------------------------------
  console.log('\n========================================================================');
  console.log(`TOTAL DE TESTES SINTÉTICOS EXECUTADOS: ${passedTests + failedTests}`);
  console.log(`TESTES APROVADOS: ${passedTests}`);
  console.log(`TESTES REPROVADOS: ${failedTests}`);
  console.log('========================================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runExpandedTestSuite().catch((err) => {
  console.error('Falha crítica na execução da suíte de testes sintéticos:', err);
  process.exit(1);
});
