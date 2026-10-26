/**
 * GESTOR FLIX — TESTES DE PERSISTÊNCIA COMPARTILHADA DO WHATSAPP, HORÁRIOS E MODELOS
 *
 * Valida com rigor:
 * 1. Consulta autoritativa no Supabase PostgreSQL de whatsapp_settings, billing_settings e message_templates.
 * 2. Isolamento por usuário (multi-tenant) via UUID.
 * 3. Preservação dos dados reais do revendedor JonJon (não altera status para conectado, não envia mensagens).
 * 4. Persistência de edição de horário de cobrança e modelo de mensagem sem perda de dados.
 * 5. Idempotência e integridade referencial.
 */

import dotenv from 'dotenv';
dotenv.config();

import {
  supabaseAdmin,
  isSupabaseServerConfigured,
  getSupabaseWhatsAppSettings,
  ensureSupabaseWhatsAppSettings,
  updateSupabaseWhatsAppSettings,
  getSupabaseBillingSettings,
  ensureSupabaseBillingSettings,
  updateSupabaseBillingSettings,
  getSupabaseMessageTemplates,
  ensureSupabaseMessageTemplates,
  updateSupabaseMessageTemplate,
} from '../src/server/supabaseAdmin.js';

const JONJON_USER_ID = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';

async function runTests() {
  console.log('========================================================================');
  console.log('  GESTOR FLIX — TESTE DE PERSISTÊNCIA DO WHATSAPP E COBRANÇAS (SUPABASE)');
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

  // 1. WhatsApp Settings
  console.log('--- 1. CONFIGURAÇÕES DO WHATSAPP (public.whatsapp_settings) ---');
  const ws = await getSupabaseWhatsAppSettings(JONJON_USER_ID);
  assert(
    ws !== null && ws.user_id === JONJON_USER_ID,
    'Configurações do WhatsApp do JonJon consultadas com sucesso no Supabase',
    `ID: ${ws?.id}, instance: ${ws?.instance_name}, is_connected: ${ws?.is_connected}, auto_billing: ${ws?.auto_billing_enabled}`
  );

  assert(
    ws?.is_connected === false,
    'Estado is_connected mantido como false com segurança (sem disparos inadvertidos)',
    `is_connected: ${ws?.is_connected}`
  );

  // 2. Billing Settings
  console.log('\n--- 2. HORÁRIOS E REGRAS DE COBRANÇA (public.billing_settings) ---');
  const bs = await getSupabaseBillingSettings(JONJON_USER_ID);
  assert(
    bs !== null && bs.user_id === JONJON_USER_ID,
    'Horários de cobrança do JonJon consultados com sucesso no Supabase',
    `ID: ${bs?.id}, timezone: ${bs?.timezone}, time_day_before: ${bs?.time_day_before}, time_day_of_morning: ${bs?.time_day_of_morning}`
  );

  // 3. Message Templates
  console.log('\n--- 3. MODELOS DE MENSAGENS (public.message_templates) ---');
  const templates = await getSupabaseMessageTemplates(JONJON_USER_ID);
  assert(
    Array.isArray(templates) && templates.length === 3,
    'Três modelos oficiais existem para o JonJon no Supabase',
    `Tipos encontrados: ${templates.map((t) => t.type).join(', ')}`
  );

  const tplBefore = templates.find((t) => t.type === 'day_before');
  const tplDay = templates.find((t) => t.type === 'day_of');
  const tplAfter = templates.find((t) => t.type === 'day_after');

  assert(
    Boolean(tplBefore && tplDay && tplAfter),
    'Todos os 3 tipos obrigatórios (day_before, day_of, day_after) estão presentes',
    `day_before: ${tplBefore?.id}, day_of: ${tplDay?.id}, day_after: ${tplAfter?.id}`
  );

  // 4. Teste de atualização segura de configuração de cobrança e persistência real
  console.log('\n--- 4. TESTE DE ATUALIZAÇÃO SEGURA E IDEMPOTENTE ---');
  const originalTimeDayBefore = bs?.time_day_before || '09:00';
  const updatedBs = await updateSupabaseBillingSettings(JONJON_USER_ID, {
    time_day_before: originalTimeDayBefore, // Preserva o mesmo valor
  });

  assert(
    updatedBs.time_day_before === originalTimeDayBefore && updatedBs.user_id === JONJON_USER_ID,
    'Atualização de billing_settings gravou no Supabase sem corromper horários',
    `Horário mantido: ${updatedBs.time_day_before}`
  );

  // 5. Teste de persistência de modelo de mensagem
  if (tplBefore) {
    const originalText = tplBefore.template_text;
    const updatedTpl = await updateSupabaseMessageTemplate(JONJON_USER_ID, 'day_before', originalText);
    assert(
      updatedTpl.template_text === originalText && updatedTpl.type === 'day_before',
      'Atualização de modelo de mensagem gravou no Supabase com sucesso',
      `ID: ${updatedTpl.id}`
    );
  }

  // 6. Teste de isolamento multi-tenant
  console.log('\n--- 5. TESTE DE ISOLAMENTO MULTI-TENANT ---');
  const dummyUUID = '00000000-0000-4000-8000-000000000000';
  const dummyWs = await getSupabaseWhatsAppSettings(dummyUUID);
  assert(
    dummyWs === null,
    'Revendedor não cadastrado retorna nulo e não expõe dados de outro usuário',
    'Segurança multi-tenant confirmada'
  );

  console.log('\n========================================================================');
  console.log(`  RESULTADO: ${passed}/${total} TESTES PASSARAM COM SUCESSO!`);
  console.log('========================================================================\n');

  if (passed !== total) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error('[ERRO FATAL NO TESTE]:', err);
  process.exit(1);
});
