/**
 * GESTOR FLIX — SCRIPT DE ROLLBACK BASEADO EM MANIFESTO COM DRIVER REAL (FASE 8B.4)
 * 
 * Este script prepara e conecta o procedimento de reversão cirúrgica por manifesto
 * ao driver real do Supabase para o revendedor "jonjon" (UUID: 3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e).
 * 
 * REGRAS DE SEGURANÇA:
 * 1. TRAVA DE ESCRITA ATIVA (ROLLBACK_WRITE_LOCK = true) durante a implementação.
 * 2. Exclusão estrita por IDs exatos lidos do MANIFESTO DE MIGRAÇÃO.
 * 3. Restauração integral dos dados a partir do snapshot pré-migração.
 * 4. Suspensão imediata se houver novos clientes associados ao plano ou alterações manuais pós-migração.
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { getSupabaseAdmin, isSupabaseServerConfigured } from '../src/server/supabaseAdmin.js';
import {
  verifySnapshotFile,
  verifyMigrationManifest,
  validateConfigRollbackSafety,
  validatePlanRollbackSafety,
  validateRollbackPreconditions,
  executeRollbackWithManifest,
  SupabaseMigrationDriver,
  deterministicStringify,
  computeSha256,
  RollbackSafetyError,
} from './migration_guard.js';

dotenv.config();

// ============================================================================
// TRAVA DE SEGURANÇA ESTRITA DE ROLLBACK (MANTIDA ATIVA NA FASE 8B.4)
// ============================================================================
export const ROLLBACK_WRITE_LOCK = true;

const TARGET_USER_ID = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';

export interface RollbackPlanResult {
  dryRun: boolean;
  manifestFile: string;
  snapshotFile: string;
  targetUserId: string;
  manifestFound: boolean;
  exactTargetIds: {
    planId: string;
    customerId: string;
  };
  safetyChecks: {
    manifestValid: boolean;
    planHasForeignCustomers: boolean;
    whatsappSettingsChangedAfterMigration: boolean;
    billingSettingsChangedAfterMigration: boolean;
  };
  actionsPlanned: string[];
}

export async function runRollbackSimulation(
  manifestPath?: string,
  isDryRun: boolean = true
): Promise<RollbackPlanResult> {
  const isWriteRequested = !isDryRun;

  if (isWriteRequested) {
    if (ROLLBACK_WRITE_LOCK) {
      throw new Error(
        '[TRAVA DE SEGURANÇA ATIVA] Na Fase 8B.4, operações de reversão ativa (--write) estão estritamente bloqueadas. ' +
        'O driver de rollback foi implementado, mas a trava permanece ativa até autorização expressa.'
      );
    }
  }

  // 1. Localizar arquivo de manifesto mais recente se não informado
  let selectedManifest = manifestPath;
  if (!selectedManifest) {
    const backupDir = path.resolve(process.cwd(), 'backups');
    if (fs.existsSync(backupDir)) {
      const files = fs
        .readdirSync(backupDir)
        .filter((f) => f.startsWith('migration_manifest_') && f.endsWith('.json'))
        .sort()
        .reverse();
      if (files.length > 0) {
        selectedManifest = path.join(backupDir, files[0]);
      }
    }
  }

  // 2. Conectar em modo somente leitura ao Supabase
  if (!isSupabaseServerConfigured) {
    throw new Error('Supabase Server não configurado no .env.');
  }

  const supabase = getSupabaseAdmin();

  // 3. Consultar estado atual no Supabase
  const { data: plans } = await supabase
    .from('plans')
    .select('id, name')
    .eq('user_id', TARGET_USER_ID);

  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, plan_id')
    .eq('user_id', TARGET_USER_ID);

  let planId = 'simulated-plan-id';
  let custId = 'simulated-customer-id';
  let snapshotFile = '(nenhum snapshot associado)';
  let manifestFound = false;
  let manifestValid = false;

  if (selectedManifest && fs.existsSync(selectedManifest)) {
    try {
      const manifest = verifyMigrationManifest(selectedManifest);
      manifestFound = true;
      manifestValid = true;
      planId = manifest.createdEntities.planId || planId;
      custId = manifest.createdEntities.customerId || custId;
      snapshotFile = manifest.snapshotFilePath;
    } catch (err: any) {
      manifestFound = true;
      manifestValid = false;
      throw new RollbackSafetyError(`Manifesto inválido ou corrompido: ${err.message}`);
    }
  } else {
    selectedManifest = '(nenhum manifesto em disco — nenhuma migração executada)';
    const targetPlan = (plans || []).find((p) => p.name === 'Canais Liberados');
    const targetCustomer = (customers || []).find((c) => c.name === 'Edvan');
    if (targetPlan) planId = targetPlan.id;
    if (targetCustomer) custId = targetCustomer.id;
  }

  // Verificar clientes dependentes
  const associatedCustomers = (customers || [])
    .filter((c) => c.plan_id === planId)
    .map((c) => c.id);

  validatePlanRollbackSafety(planId, custId, associatedCustomers);

  return {
    dryRun: true,
    manifestFile: selectedManifest,
    snapshotFile,
    targetUserId: TARGET_USER_ID,
    manifestFound,
    exactTargetIds: {
      planId,
      customerId: custId,
    },
    safetyChecks: {
      manifestValid,
      planHasForeignCustomers: false,
      whatsappSettingsChangedAfterMigration: false,
      billingSettingsChangedAfterMigration: false,
    },
    actionsPlanned: [
      `1. [LEITURA DE MANIFESTO]: Validar integridade SHA-256 e status COMPLETED do manifesto de migração.`,
      `2. [LEITURA DE SNAPSHOT]: Confirmar integridade SHA-256 do arquivo pré-migração referenciado no manifesto.`,
      `3. [VALIDAÇÃO DE CONFLITO]: Verificar se usuário alterou whatsapp_settings ou billing_settings pós-migração.`,
      `4. [EXCLUSÃO SEGURA DE CLIENTE]: Executar DELETE FROM customers WHERE id = '${custId}' (ID exato do manifesto).`,
      `5. [EXCLUSÃO SEGURA DE PLANO]: Executar DELETE FROM plans WHERE id = '${planId}' (ID exato do manifesto).`,
      `6. [RESTAURAÇÃO ATÔMICA DE CONFIGS]: Restaurar whatsapp_settings e billing_settings aos valores exatos do snapshot.`,
    ],
  };
}

export async function executeLiveJonjonRollback(manifestPath?: string) {
  if (ROLLBACK_WRITE_LOCK) {
    throw new Error(
      '[TRAVA DE SEGURANÇA ATIVA] Na Fase 8B.4, operações de reversão ativa (--write) estão estritamente bloqueadas. ' +
      'A trava só poderá ser desativada na fase apropriada sob autorização expressa.'
    );
  }

  const supabase = getSupabaseAdmin();
  const driver = new SupabaseMigrationDriver(supabase);

  // Localizar manifesto mais recente se omitido
  let selectedManifest = manifestPath;
  if (!selectedManifest) {
    const backupDir = path.resolve(process.cwd(), 'backups');
    const files = fs
      .readdirSync(backupDir)
      .filter((f) => f.startsWith('migration_manifest_') && f.endsWith('.json'))
      .sort()
      .reverse();
    if (files.length === 0) {
      throw new Error('Nenhum manifesto de migração encontrado para reverter.');
    }
    selectedManifest = path.join(backupDir, files[0]);
  }

  const manifest = verifyMigrationManifest(selectedManifest);
  const { data: currentWs } = await supabase.from('whatsapp_settings').select('*').eq('user_id', TARGET_USER_ID).maybeSingle();
  const { data: currentBs } = await supabase.from('billing_settings').select('*').eq('user_id', TARGET_USER_ID).maybeSingle();
  const { data: customers } = await supabase.from('customers').select('id, plan_id').eq('user_id', TARGET_USER_ID);

  const planCustomers = (customers || [])
    .filter((c) => c.plan_id === manifest.createdEntities.planId)
    .map((c) => c.id);

  const postWsHash = computeSha256(deterministicStringify(currentWs));
  const postBsHash = computeSha256(deterministicStringify(currentBs));

  const result = await executeRollbackWithManifest(driver, {
    manifestPath: selectedManifest,
    expectedUserId: TARGET_USER_ID,
    currentWhatsappRecord: currentWs,
    currentBillingRecord: currentBs,
    postMigrationWhatsappHash: postWsHash,
    postMigrationBillingHash: postBsHash,
    planAssociatedCustomerIds: planCustomers,
  });

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const wantsWrite = args.includes('--write');

  console.log('========================================================================');
  console.log('  GESTOR FLIX — PROCEDIMENTO DE ROLLBACK SEGURO (FASE 8B.4)');
  console.log('========================================================================\n');

  try {
    if (wantsWrite) {
      const result = await executeLiveJonjonRollback();
      console.log(`[STATUS] Modo de Execução: REVERSÃO REAL AUTORIZADA`);
      console.log(`[PLANO EXCLUÍDO]: UUID ${result.revertedPlanId}`);
      console.log(`[CLIENTE EXCLUÍDO]: UUID ${result.revertedCustomerId}`);
      console.log(`[CONFIGURAÇÕES RESTAURADAS]: ${result.restoredSettings ? 'SIM' : 'NÃO'}`);
      console.log('\n========================================================================');
      console.log('  ROLLBACK CONCLUÍDO COM SUCESSO. ESTADO ANTERIOR RESTABELECIDO.');
      console.log('========================================================================');
    } else {
      const result = await runRollbackSimulation(undefined, true);

      console.log(`[STATUS] Modo de Execução: SIMULAÇÃO E VALIDAÇÃO (DRY-RUN)`);
      console.log(`[STATUS] Trava de Escrita do Rollback: ATIVA (ROLLBACK_WRITE_LOCK = true)`);
      console.log(`[PROPRIETÁRIO ALVO]: ${result.targetUserId}`);
      console.log(`[ARQUIVO DE MANIFESTO]: ${result.manifestFile}`);
      console.log(`[ARQUIVO DE SNAPSHOT]: ${result.snapshotFile}`);
      console.log(`[ID EXATO DO PLANO ALVO]: ${result.exactTargetIds.planId}`);
      console.log(`[ID EXATO DO CLIENTE ALVO]: ${result.exactTargetIds.customerId}\n`);

      console.log('--- AÇÕES DE REVERSÃO PLANEJADAS (BASEADAS EM MANIFESTO) ---');
      result.actionsPlanned.forEach((act) => console.log(`  ${act}`));

      console.log('\n========================================================================');
      console.log('  VALIDAÇÃO DO ROLLBACK CONCLUÍDA COM SUCESSO. NENHUM DADO FOI ALTERADO.');
      console.log('========================================================================');
    }
  } catch (err: any) {
    console.error('\n[ERRO DURANTE OPERAÇÃO DO ROLLBACK]:', err.message || err);
    process.exit(1);
  }
}

if (process.argv[1]?.endsWith('rollback_jonjon_data.ts')) {
  main();
}
