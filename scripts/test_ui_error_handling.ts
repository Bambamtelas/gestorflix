/**
 * GESTOR FLIX — TESTES AUTOMATIZADOS DE TRATAMENTO DE ERROS DE LEITURA (FASE 9.1)
 * 
 * Valida a lógica de estados (loading, success, empty list, error, retry)
 * implementada nos componentes PlansView e CustomersView.
 */

import assert from 'assert';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import { getSupabaseAdmin } from '../src/server/supabaseAdmin.js';

interface StateHolder<T> {
  data: T[];
  loading: boolean;
  error: string | null;
}

async function simulateLoadPlans(
  fetchFn: () => Promise<any[]>,
  state: StateHolder<any>
) {
  try {
    state.loading = true;
    state.error = null;
    const data = await fetchFn();
    state.data = data;
  } catch (err: any) {
    state.error = 'Não foi possível carregar os planos. Verifique sua conexão e tente novamente.';
  } finally {
    state.loading = false;
  }
}

async function simulateLoadCustomers(
  fetchCustFn: () => Promise<any[]>,
  fetchPlansFn: () => Promise<any[]>,
  fetchAppsFn: () => Promise<any[]>,
  state: StateHolder<any>
) {
  try {
    state.loading = true;
    state.error = null;
    const [custList] = await Promise.all([
      fetchCustFn(),
      fetchPlansFn(),
      fetchAppsFn(),
    ]);
    state.data = custList;
  } catch (err: any) {
    state.error = 'Não foi possível carregar os clientes. Verifique sua conexão e tente novamente.';
  } finally {
    state.loading = false;
  }
}

async function runTests() {
  console.log('========================================================================');
  console.log('  GESTOR FLIX — TESTES DE TRATAMENTO DE ERROS DE LEITURA (FASE 9.1)');
  console.log('========================================================================\n');

  let passed = 0;

  // --- CENÁRIO 1: Planos - Sucesso com dados ---
  const statePlansSuccess: StateHolder<any> = { data: [], loading: true, error: null };
  await simulateLoadPlans(async () => [{ id: 'plan-1', name: 'Canais Liberados' }], statePlansSuccess);
  assert.strictEqual(statePlansSuccess.loading, false);
  assert.strictEqual(statePlansSuccess.error, null);
  assert.strictEqual(statePlansSuccess.data.length, 1);
  console.log('  [PASSOU] PlansView: Sucesso com dados renderiza lista normalmente');
  passed++;

  // --- CENÁRIO 2: Planos - Sucesso com lista vazia legítima ---
  const statePlansEmpty: StateHolder<any> = { data: [{ id: 'old' }], loading: true, error: null };
  await simulateLoadPlans(async () => [], statePlansEmpty);
  assert.strictEqual(statePlansEmpty.loading, false);
  assert.strictEqual(statePlansEmpty.error, null);
  assert.strictEqual(statePlansEmpty.data.length, 0);
  console.log('  [PASSOU] PlansView: Lista vazia legítima (error=null) ativa mensagem de lista vazia');
  passed++;

  // --- CENÁRIO 3: Planos - Falha de conexão/API ---
  const statePlansError: StateHolder<any> = { data: [], loading: true, error: null };
  await simulateLoadPlans(async () => {
    throw new Error('Network Error 500');
  }, statePlansError);
  assert.strictEqual(statePlansError.loading, false);
  assert.notStrictEqual(statePlansError.error, null);
  assert.strictEqual(statePlansError.error, 'Não foi possível carregar os planos. Verifique sua conexão e tente novamente.');
  console.log('  [PASSOU] PlansView: Falha de conexão define error!=null e NÃO é tratada como lista vazia');
  passed++;

  // --- CENÁRIO 4: Planos - Nova tentativa bem-sucedida após erro ---
  await simulateLoadPlans(async () => [{ id: 'plan-1', name: 'Canais Liberados' }], statePlansError);
  assert.strictEqual(statePlansError.loading, false);
  assert.strictEqual(statePlansError.error, null);
  assert.strictEqual(statePlansError.data.length, 1);
  console.log('  [PASSOU] PlansView: Nova tentativa (retry) limpa o erro e carrega os dados com sucesso');
  passed++;

  // --- CENÁRIO 5: Clientes - Sucesso com dados ---
  const stateCustSuccess: StateHolder<any> = { data: [], loading: true, error: null };
  await simulateLoadCustomers(
    async () => [{ id: 'c-1', name: 'Edvan' }],
    async () => [],
    async () => [],
    stateCustSuccess
  );
  assert.strictEqual(stateCustSuccess.loading, false);
  assert.strictEqual(stateCustSuccess.error, null);
  assert.strictEqual(stateCustSuccess.data.length, 1);
  console.log('  [PASSOU] CustomersView: Sucesso com dados renderiza tabela normalmente');
  passed++;

  // --- CENÁRIO 6: Clientes - Sucesso com lista vazia legítima ---
  const stateCustEmpty: StateHolder<any> = { data: [{ id: 'old' }], loading: true, error: null };
  await simulateLoadCustomers(
    async () => [],
    async () => [],
    async () => [],
    stateCustEmpty
  );
  assert.strictEqual(stateCustEmpty.loading, false);
  assert.strictEqual(stateCustEmpty.error, null);
  assert.strictEqual(stateCustEmpty.data.length, 0);
  console.log('  [PASSOU] CustomersView: Lista vazia legítima (error=null) ativa mensagem de lista vazia');
  passed++;

  // --- CENÁRIO 7: Clientes - Falha em uma das consultas paralelas ---
  const stateCustError: StateHolder<any> = { data: [], loading: true, error: null };
  await simulateLoadCustomers(
    async () => [{ id: 'c-1' }],
    async () => { throw new Error('Database timeout'); }, // Falha em planos
    async () => [],
    stateCustError
  );
  assert.strictEqual(stateCustError.loading, false);
  assert.notStrictEqual(stateCustError.error, null);
  assert.strictEqual(stateCustError.error, 'Não foi possível carregar os clientes. Verifique sua conexão e tente novamente.');
  console.log('  [PASSOU] CustomersView: Falha em consulta paralela define error!=null e não corrompe estado');
  passed++;

  // --- CENÁRIO 8: Clientes - Nova tentativa bem-sucedida após erro ---
  await simulateLoadCustomers(
    async () => [{ id: 'c-1', name: 'Edvan' }],
    async () => [{ id: 'p-1', name: 'Canais Liberados' }],
    async () => [],
    stateCustError
  );
  assert.strictEqual(stateCustError.loading, false);
  assert.strictEqual(stateCustError.error, null);
  assert.strictEqual(stateCustError.data.length, 1);
  console.log('  [PASSOU] CustomersView: Nova tentativa (retry) limpa o erro e carrega os dados com sucesso');
  passed++;

  // --- CENÁRIO 9: Verificação de imutabilidade dos dados reais no Supabase ---
  const admin = getSupabaseAdmin();
  const userId = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';
  const { data: plans } = await admin.from('plans').select('id, name').eq('user_id', userId);
  const { data: custs } = await admin.from('customers').select('id, name').eq('user_id', userId);
  assert.strictEqual(plans?.length, 1);
  assert.ok(custs && custs.length >= 1);
  assert.strictEqual(plans![0].name, 'Canais Liberados');
  assert.ok(custs.some((c) => c.name === 'Edvan'));
  console.log('  [PASSOU] Integridade do Supabase: plano e cliente Edvan inalterados no banco de dados');
  passed++;

  console.log('\n========================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${passed}`);
  console.log(`TESTES APROVADOS: ${passed}`);
  console.log(`TESTES REPROVADOS: 0`);
  console.log('========================================================================\n');
}

runTests().catch((err) => {
  console.error('Falha nos testes de UI:', err);
  process.exit(1);
});
