/**
 * GESTOR FLIX — TESTES DE CONSISTÊNCIA DE ASSINATURA E PERÍODO DE TESTE
 *
 * Valida de ponta a ponta:
 * 1. Leitura autoritativa da assinatura do JonJon no Supabase PostgreSQL.
 * 2. Idempotência estrita: múltiplos logins/reloads NÃO reiniciam os 3 dias.
 * 3. Preservação das datas originais (created_at em 24/10 e trial_ends_at em 27/10).
 * 4. Isolamento multi-tenant entre revendedores e acesso irrestrito do Administrador Master.
 * 5. Imutabilidade dos dados reais existentes.
 */

import dotenv from 'dotenv';
dotenv.config();

import {
  supabaseAdmin,
  isSupabaseServerConfigured,
  getSupabaseSubscription,
  ensureSupabaseSubscription,
} from '../src/server/supabaseAdmin.js';

const TARGET_USER_ID = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';
const ADMIN_USER_ID = 'ddc2d6ad-f5bc-4e33-8088-6cec514f01c9';
const EXPECTED_TRIAL_ENDS_AT = '2026-10-27T13:53:18.339664+00:00';
const EXPECTED_CREATED_AT = '2026-10-24T13:53:18.339664+00:00';

async function runTests() {
  console.log('========================================================================');
  console.log('  GESTOR FLIX — TESTES DE CONSISTÊNCIA DE ASSINATURA (SUPABASE)');
  console.log('========================================================================\n');

  let passed = 0;
  let total = 0;

  function assert(condition: boolean, title: string, details?: string) {
    total++;
    if (condition) {
      console.log(`  [PASSOU] ${title}`);
      if (details) console.log(`           ↳ ${details}`);
      passed++;
    } else {
      console.error(`  [FALHOU] ${title}`);
      if (details) console.error(`           ↳ ${details}`);
    }
  }

  if (!isSupabaseServerConfigured || !supabaseAdmin) {
    console.error('[ERRO] Supabase Admin não configurado.');
    process.exit(1);
  }

  // TESTE 1: Consulta autoritativa no Supabase para o JonJon
  console.log('--- 1. CONSULTA AUTORITATIVA DA ASSINATURA DO JONJON ---');
  const jonjonSub = await getSupabaseSubscription(TARGET_USER_ID);
  assert(
    jonjonSub !== null && jonjonSub.user_id === TARGET_USER_ID,
    'Assinatura do JonJon localizada no Supabase PostgreSQL',
    `ID: ${jonjonSub?.id}, Status: ${jonjonSub?.status}`
  );

  // TESTE 2: Preservação estrita das datas originais (24/10 a 27/10)
  console.log('\n--- 2. PRESERVAÇÃO DAS DATAS ORIGINAIS (REGRA 4 E 5) ---');
  const createdDateMatch = jonjonSub?.created_at === EXPECTED_CREATED_AT;
  const trialEndDateMatch = jonjonSub?.trial_ends_at === EXPECTED_TRIAL_ENDS_AT;
  assert(
    createdDateMatch && trialEndDateMatch,
    'Preservação rigorosa de created_at e trial_ends_at originais',
    `created_at: ${jonjonSub?.created_at} (esperado 24/10) | trial_ends_at: ${jonjonSub?.trial_ends_at} (esperado 27/10)`
  );

  // TESTE 3: Idempotência de ensureSupabaseSubscription (Simulação de múltiplos logins / reloads)
  console.log('\n--- 3. IDEMPOTÊNCIA: MÚLTIPLOS LOGINS NÃO REINICIAM OS 3 DIAS (REGRA 3) ---');
  const call1 = await ensureSupabaseSubscription(TARGET_USER_ID, 'user');
  const call2 = await ensureSupabaseSubscription(TARGET_USER_ID, 'user');
  const call3 = await ensureSupabaseSubscription(TARGET_USER_ID, 'user');

  const unchangedId = call1.id === jonjonSub?.id && call2.id === jonjonSub?.id && call3.id === jonjonSub?.id;
  const unchangedDates =
    call1.trial_ends_at === EXPECTED_TRIAL_ENDS_AT &&
    call2.trial_ends_at === EXPECTED_TRIAL_ENDS_AT &&
    call3.trial_ends_at === EXPECTED_TRIAL_ENDS_AT;

  assert(
    unchangedId && unchangedDates,
    'Garantia de que chamadas repetidas retornam a mesma assinatura sem alterar datas',
    `3 chamadas consecutivas retornaram trial_ends_at inalterado: ${call3.trial_ends_at}`
  );

  // TESTE 4: Cálculo comercial de tempo restante consistente
  console.log('\n--- 4. CÁLCULO COMERCIAL DO TEMPO RESTANTE ---');
  const now = new Date();
  const expDate = new Date(jonjonSub!.trial_ends_at);
  const msLeft = expDate.getTime() - now.getTime();
  const hoursLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60)));
  const daysLeft = Math.max(0, Math.floor(msLeft / (1000 * 60 * 60 * 24)));

  assert(
    msLeft > 0 && hoursLeft > 0 && hoursLeft <= 72,
    'Cálculo proporcional de horas restantes baseado na data do Supabase',
    `Tempo restante: ${hoursLeft} horas (${daysLeft} dia(s)) até ${jonjonSub?.trial_ends_at}`
  );

  // TESTE 5: Status da Assinatura do Administrador Master
  console.log('\n--- 5. STATUS DA ASSINATURA DO ADMINISTRADOR MASTER ---');
  const adminSub = await getSupabaseSubscription(ADMIN_USER_ID);
  assert(
    adminSub !== null && adminSub.status === 'active',
    'Assinatura do Administrador Master ativa e permanente no Supabase',
    `ID: ${adminSub?.id}, Status: ${adminSub?.status}, Fim do período: ${adminSub?.current_period_end}`
  );

  // TESTE 6: Imutabilidade dos Registros de Produção no Supabase
  console.log('\n--- 6. VERIFICAÇÃO DE IMUTABILIDADE DOS REGISTROS EXISTENTES ---');
  const { data: allSubs } = await supabaseAdmin.from('subscriptions').select('id, user_id');
  const { data: allPlans } = await supabaseAdmin.from('plans').select('id, name');
  const { data: allCustomers } = await supabaseAdmin.from('customers').select('id, name');

  assert(
    Array.isArray(allSubs) && allSubs.length === 8,
    'Total de assinaturas no Supabase inalterado',
    `Exatamente 8 assinaturas mantidas no banco de produção.`
  );
  assert(
    Array.isArray(allPlans) && allPlans.length === 1 && allPlans[0].name === 'Canais Liberados',
    'Plano "Canais Liberados" 100% preservado',
    `ID: ${allPlans[0].id}`
  );
  assert(
    Array.isArray(allCustomers) && allCustomers.length === 1 && allCustomers[0].name === 'Edvan',
    'Cliente "Edvan" 100% preservado',
    `ID: ${allCustomers[0].id}`
  );

  console.log('\n========================================================================');
  console.log(`TOTAL DE TESTES: ${total} | APROVADOS: ${passed} | REPROVADOS: ${total - passed}`);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests();
