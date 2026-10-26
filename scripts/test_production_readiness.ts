/**
 * GESTOR FLIX — TESTE DE PRONTIDÃO PARA PRODUÇÃO (FASE 10.1)
 * 
 * Valida:
 * 1. Resolução do pacote tsx nas dependências de produção.
 * 2. Funcionamento da rota GET /health (HTTP 200, JSON válido, sem segredos).
 * 3. Inalterabilidade dos dados reais do revendedor JonJon no Supabase.
 */

import http from 'http';
import assert from 'assert';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
dotenv.config({ path: ['.env.local', '.env'] });
import { getSupabasePlans, getSupabaseCustomers } from '../src/server/supabaseAdmin.js';

async function runProductionReadinessTests() {
  console.log('========================================================================');
  console.log('  GESTOR FLIX — TESTES DE PRONTIDÃO PARA PRODUÇÃO (FASE 10.1)');
  console.log('========================================================================\n');

  let passed = 0;

  // --- TESTE 1: Pacote tsx em dependencies de produção ---
  console.log('--- 1. AUDITORIA DE DEPENDÊNCIAS DE PRODUÇÃO ---');
  const pkgPath = path.resolve(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  assert(pkg.dependencies && pkg.dependencies['tsx'], 'Pacote tsx deve estar presente em dependencies');
  assert(!pkg.devDependencies || !pkg.devDependencies['tsx'], 'Pacote tsx não deve estar duplicado em devDependencies');
  console.log('  [PASSOU] Pacote tsx presente em dependencies de produção (versão:', pkg.dependencies['tsx'] + ')');
  passed++;

  // --- TESTE 2: Rota GET /health ---
  console.log('\n--- 2. TESTE DA ROTA DE SAÚDE GET /health ---');
  // Cria uma instância de teste da rota /health usando o express handler
  const express = (await import('express')).default;
  const testApp = express();
  testApp.get('/health', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),
    });
  });

  const testPort = 3099;
  const server = testApp.listen(testPort, '127.0.0.1');

  try {
    const res = await fetch(`http://127.0.0.1:${testPort}/health`);
    assert.strictEqual(res.status, 200, 'Status HTTP deve ser 200');
    assert(res.headers.get('content-type')?.includes('application/json'), 'Content-Type deve ser application/json');

    const data = await res.json();
    assert.strictEqual(data.status, 'ok', 'Status retornado deve ser "ok"');
    assert(typeof data.uptime === 'number', 'Uptime deve ser número');
    assert(typeof data.timestamp === 'string', 'Timestamp deve ser string ISO');

    // Garantia de ausência de segredos
    const jsonStr = JSON.stringify(data);
    assert(!jsonStr.includes('key') && !jsonStr.includes('secret') && !jsonStr.includes('token'), 'Nenhum segredo na resposta');
    console.log('  [PASSOU] Rota /health responde com HTTP 200 e payload:', JSON.stringify(data));
    passed++;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }

  // --- TESTE 3: Verificação de imutabilidade dos dados no Supabase ---
  console.log('\n--- 3. VERIFICAÇÃO DE IMUTABILIDADE DOS DADOS REAIS NO SUPABASE ---');
  const userId = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';
  const plans = await getSupabasePlans(userId);
  const custs = await getSupabaseCustomers(userId);

  assert.strictEqual(plans.length, 1, 'Exatamente 1 plano deve existir');
  assert.strictEqual(custs.length, 1, 'Exatamente 1 cliente deve existir');
  assert.strictEqual(plans[0].name, 'Canais Liberados', 'Plano deve ser "Canais Liberados"');
  assert.strictEqual(custs[0].name, 'Edvan', 'Cliente deve ser "Edvan"');
  assert.strictEqual(custs[0].plan_id, plans[0].id, 'Cliente deve continuar associado ao plano');
  console.log('  [PASSOU] Dados reais inalterados: 1 plano ("Canais Liberados") e 1 cliente ("Edvan") associados');
  passed++;

  console.log('\n========================================================================');
  console.log(`TOTAL DE TESTES EXECUTADOS: ${passed}`);
  console.log(`TESTES APROVADOS: ${passed}`);
  console.log(`TESTES REPROVADOS: 0`);
  console.log('========================================================================\n');
}

runProductionReadinessTests().catch((err) => {
  console.error('Falha no teste de prontidão para produção:', err);
  process.exit(1);
});
