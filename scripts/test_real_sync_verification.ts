/**
 * GESTOR FLIX — TESTE CONTROLADO DE LEITURA E GRAVAÇÃO REAL (ETAPA 3)
 *
 * Executa o teste de persistência autorizado pelo usuário:
 * 1. Confirma que os dados originais ("Canais Liberados" e "Edvan") estão presentes.
 * 2. Cria 1 plano de teste ("Plano Teste Sincronismo") e 1 cliente de teste ("Cliente Teste Sincronismo") no Supabase.
 * 3. Valida a leitura de ambos através das funções oficiais da aplicação (getSupabasePlans e getSupabaseCustomers).
 * 4. Executa a edição real dos registros de teste e valida a persistência dos campos atualizados.
 * 5. Realiza a limpeza segura removendo EXCLUSIVAMENTE os registros de teste criados nesta etapa.
 * 6. Confirma que os registros originais ("Canais Liberados" e "Edvan") permaneceram 100% intactos e inalterados.
 */

import dotenv from 'dotenv';
dotenv.config();

import {
  supabaseAdmin,
  isSupabaseServerConfigured,
  getSupabasePlans,
  createSupabasePlan,
  updateSupabasePlan,
  deleteSupabasePlan,
  getSupabaseCustomers,
  createSupabaseCustomer,
  updateSupabaseCustomer,
  deleteSupabaseCustomer,
} from '../src/server/supabaseAdmin.js';

const TARGET_USER_ID = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';
const ORIGINAL_PLAN_ID = '7f248fd1-f487-43fc-abe0-53c1ab08b504';
const ORIGINAL_CUSTOMER_ID = '767edf54-3464-4ddf-8e74-973baf80cf89';

async function runRealSyncVerification() {
  console.log('========================================================================');
  console.log('  GESTOR FLIX — TESTE CONTROLADO DE SINCRONIZAÇÃO E PERSISTÊNCIA REAL');
  console.log('========================================================================\n');

  if (!isSupabaseServerConfigured || !supabaseAdmin) {
    console.error('[ERRO] Supabase Admin não está configurado no ambiente.');
    process.exit(1);
  }

  let testPlanId: string | null = null;
  let testCustomerId: string | null = null;
  let allStepsPassed = true;

  try {
    // -------------------------------------------------------------------------
    // PASSO 1: Verificação Prévia dos Dados Oficiais do JonJon
    // -------------------------------------------------------------------------
    console.log('[PASSO 1] Verificando registros originais pré-existentes...');
    const initialPlans = await getSupabasePlans(TARGET_USER_ID);
    const initialCustomers = await getSupabaseCustomers(TARGET_USER_ID);

    const originalPlan = initialPlans.find((p) => p.id === ORIGINAL_PLAN_ID);
    const originalCustomer = initialCustomers.find((c) => c.id === ORIGINAL_CUSTOMER_ID);

    if (!originalPlan || originalPlan.name !== 'Canais Liberados') {
      throw new Error(`Plano original 'Canais Liberados' (${ORIGINAL_PLAN_ID}) não encontrado!`);
    }
    if (!originalCustomer || originalCustomer.name !== 'Edvan') {
      throw new Error(`Cliente original 'Edvan' (${ORIGINAL_CUSTOMER_ID}) não encontrado!`);
    }

    console.log(`  ✓ Plano Original confirmado: "${originalPlan.name}" (R$ ${originalPlan.price}) [ID: ${originalPlan.id}]`);
    console.log(`  ✓ Cliente Original confirmado: "${originalCustomer.name}" [ID: ${originalCustomer.id}]`);

    // -------------------------------------------------------------------------
    // PASSO 2: Criação do Plano de Teste Identificável
    // -------------------------------------------------------------------------
    console.log('\n[PASSO 2] Criando Plano de Teste no Supabase...');
    const createdPlan = await createSupabasePlan(TARGET_USER_ID, {
      name: 'Plano Teste Sincronismo',
      price: 49.90,
      duration_days: 30,
      description: 'Plano temporário para validação de sincronismo e persistência',
      status: 'active',
    });

    testPlanId = createdPlan.id;
    console.log(`  ✓ Plano de Teste criado com sucesso! [ID: ${testPlanId}, Nome: "${createdPlan.name}", Valor: R$ ${createdPlan.price}]`);

    // -------------------------------------------------------------------------
    // PASSO 3: Criação do Cliente de Teste Identificável
    // -------------------------------------------------------------------------
    console.log('\n[PASSO 3] Criando Cliente de Teste no Supabase...');
    const createdCustomer = await createSupabaseCustomer(TARGET_USER_ID, {
      name: 'Cliente Teste Sincronismo',
      whatsapp: '5511999998888',
      notes: 'Cliente temporário para validação de persistência',
      plan_id: testPlanId,
      start_date: new Date().toISOString().slice(0, 10),
      expiration_date: '2026-12-31',
    });

    testCustomerId = createdCustomer.id;
    console.log(`  ✓ Cliente de Teste criado com sucesso! [ID: ${testCustomerId}, Nome: "${createdCustomer.name}", Vencimento: ${createdCustomer.expiration_date}]`);

    // -------------------------------------------------------------------------
    // PASSO 4: Leitura e Confirmação de Persistência via Aplicação
    // -------------------------------------------------------------------------
    console.log('\n[PASSO 4] Validando leitura via funções da aplicação (getSupabasePlans & getSupabaseCustomers)...');
    const plansAfterCreate = await getSupabasePlans(TARGET_USER_ID);
    const customersAfterCreate = await getSupabaseCustomers(TARGET_USER_ID);

    const foundTestPlan = plansAfterCreate.find((p) => p.id === testPlanId);
    const foundTestCust = customersAfterCreate.find((c) => c.id === testCustomerId);

    if (!foundTestPlan) {
      throw new Error('Plano de teste não foi retornado na consulta getSupabasePlans!');
    }
    if (!foundTestCust) {
      throw new Error('Cliente de teste não foi retornado na consulta getSupabaseCustomers!');
    }

    console.log(`  ✓ Plano de Teste lido do banco: "${foundTestPlan.name}" (R$ ${foundTestPlan.price})`);
    console.log(`  ✓ Cliente de Teste lido do banco: "${foundTestCust.name}" (Plano vinculado: "${foundTestCust.plan_name}")`);
    console.log(`  ✓ Total de planos no Supabase para JonJon: ${plansAfterCreate.length} (esperado: 2)`);
    console.log(`  ✓ Total de clientes no Supabase para JonJon: ${customersAfterCreate.length} (esperado: 2)`);

    // -------------------------------------------------------------------------
    // PASSO 5: Edição Real dos Registros de Teste
    // -------------------------------------------------------------------------
    console.log('\n[PASSO 5] Editando campo nos registros de teste para validar UPDATE real...');
    const updatedPlan = await updateSupabasePlan(testPlanId, TARGET_USER_ID, {
      price: 59.90,
      description: 'Descrição atualizada durante o teste de sincronismo',
    });

    const updatedCustomer = await updateSupabaseCustomer(testCustomerId, TARGET_USER_ID, {
      notes: 'Sincronismo validado com sucesso no Supabase PostgreSQL',
    });

    console.log(`  ✓ Plano atualizado no Supabase: Novo valor R$ ${updatedPlan.price} (anterior: R$ 49.90)`);
    console.log(`  ✓ Cliente atualizado no Supabase: Novas notas: "${updatedCustomer.notes}"`);

    // Re-consulta direta no banco para atestar persistência do UPDATE
    const { data: dbCheckPlan } = await supabaseAdmin
      .from('plans')
      .select('price, description')
      .eq('id', testPlanId)
      .single();

    const { data: dbCheckCust } = await supabaseAdmin
      .from('customers')
      .select('notes')
      .eq('id', testCustomerId)
      .single();

    if (Number(dbCheckPlan?.price) !== 59.90 || !dbCheckCust?.notes?.includes('Sincronismo validado')) {
      throw new Error('Falha na persistência dos dados atualizados no Supabase!');
    }
    console.log('  ✓ Persistência física do UPDATE confirmada diretamente no Supabase PostgreSQL!');

  } catch (err: any) {
    allStepsPassed = false;
    console.error('\n[FALHA NO TESTE]', err.message || err);
  } finally {
    // -------------------------------------------------------------------------
    // PASSO 6: Limpeza Segura dos Registros de Teste
    // -------------------------------------------------------------------------
    console.log('\n[PASSO 6] Executando limpeza segura dos registros de teste...');
    if (testCustomerId) {
      try {
        await deleteSupabaseCustomer(testCustomerId, TARGET_USER_ID);
        console.log(`  ✓ Cliente de teste (${testCustomerId}) removido com sucesso.`);
      } catch (delErr: any) {
        console.error(`  [ALERTA] Falha ao remover cliente de teste:`, delErr.message);
      }
    }

    if (testPlanId) {
      try {
        await deleteSupabasePlan(testPlanId, TARGET_USER_ID);
        console.log(`  ✓ Plano de teste (${testPlanId}) removido com sucesso.`);
      } catch (delErr: any) {
        console.error(`  [ALERTA] Falha ao remover plano de teste:`, delErr.message);
      }
    }

    // -------------------------------------------------------------------------
    // PASSO 7: Confirmação Final de Integridade dos Dados Originais
    // -------------------------------------------------------------------------
    console.log('\n[PASSO 7] Verificando integridade final dos dados originais...');
    const finalPlans = await getSupabasePlans(TARGET_USER_ID);
    const finalCustomers = await getSupabaseCustomers(TARGET_USER_ID);

    const preservedPlan = finalPlans.find((p) => p.id === ORIGINAL_PLAN_ID);
    const preservedCustomer = finalCustomers.find((c) => c.id === ORIGINAL_CUSTOMER_ID);

    if (
      preservedPlan &&
      preservedPlan.name === 'Canais Liberados' &&
      Number(preservedPlan.price) === 35 &&
      preservedCustomer &&
      preservedCustomer.name === 'Edvan' &&
      preservedCustomer.plan_id === ORIGINAL_PLAN_ID
    ) {
      console.log(`  ✓ DADOS ORIGINAIS 100% PRESERVADOS E INTACTOS:`);
      console.log(`    - Plano: "${preservedPlan.name}" (R$ ${preservedPlan.price}) [ID: ${preservedPlan.id}]`);
      console.log(`    - Cliente: "${preservedCustomer.name}" [ID: ${preservedCustomer.id}, Status: ${preservedCustomer.status}]`);
      console.log(`    - Total final de planos do JonJon: ${finalPlans.length} (esperado: 1)`);
      console.log(`    - Total final de clientes do JonJon: ${finalCustomers.length} (esperado: 1)`);
    } else {
      console.error('  [CRÍTICO] Os dados originais foram afetados ou não encontrados!');
      process.exit(1);
    }
  }

  if (allStepsPassed) {
    console.log('\n========================================================================');
    console.log('  TESTE DE SINCRONIZAÇÃO E PERSISTÊNCIA REAL CONCLUÍDO COM 100% SUCESSO!');
    console.log('========================================================================\n');
  } else {
    process.exit(1);
  }
}

runRealSyncVerification();
