import fs from 'fs';
import path from 'path';

const API_BASE = 'http://localhost:3000';

async function runTests() {
  console.log('================================================================');
  console.log('INICIANDO BATERIA DE TESTES OBRIGATÓRIOS - ETAPA 3 (GESTOR FLIX)');
  console.log('================================================================\n');

  let passedCount = 0;
  let totalCount = 0;

  function assert(condition: boolean, title: string, details?: string) {
    totalCount++;
    if (condition) {
      console.log(`[PASS] ${title}`);
      if (details) console.log(`       ↳ ${details}`);
      passedCount++;
    } else {
      console.error(`[FAIL] ${title}`);
      if (details) console.error(`       ↳ ${details}`);
    }
  }

  // TESTE 1: Integridade física de data/db.json
  const dbPath = path.resolve(process.cwd(), 'data/db.json');
  const dbExists = fs.existsSync(dbPath);
  const dbContent = dbExists ? JSON.parse(fs.readFileSync(dbPath, 'utf-8')) : null;
  assert(
    dbExists && Array.isArray(dbContent?.users) && dbContent.users.length >= 2,
    'Preservação estrita de data/db.json',
    `Arquivo intacto com ${dbContent?.users?.length} usuários e ${dbContent?.customers?.length} clientes legados.`
  );

  // TESTE 2: Rejeição de tokens forjados no formato legado id:timestamp
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: 'Bearer admin-default-id:1729000000000',
      },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401 && data.error === 'UNAUTHORIZED',
      'Rejeição estrita de token forjado no formato legado id:timestamp',
      `Status HTTP ${res.status}: "${data.message || data.error}"`
    );
  } catch (err: any) {
    assert(false, 'Rejeição estrita de token forjado no formato legado id:timestamp', err.message);
  }

  // TESTE 3: Rejeição de token malformado ou sem separador JWT (.)
  try {
    const res = await fetch(`${API_BASE}/api/auth/me`, {
      headers: {
        Authorization: 'Bearer token_malformado_sem_pontos_jwt',
      },
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      'Rejeição de token malformado sem padrão JWT',
      `Status HTTP ${res.status}: "${data.message || data.error}"`
    );
  } catch (err: any) {
    assert(false, 'Rejeição de token malformado sem padrão JWT', err.message);
  }

  // TESTE 4: Proteção de rotas administrativas sem token
  try {
    const res = await fetch(`${API_BASE}/api/admin/users`);
    assert(
      res.status === 401,
      'Proteção de rota administrativa /api/admin/users sem autenticação',
      `Status HTTP ${res.status} impediu acesso não autorizado.`
    );
  } catch (err: any) {
    assert(false, 'Proteção de rota administrativa /api/admin/users sem autenticação', err.message);
  }

  // TESTE 5: Proteção de rota administrativa com token forjado
  try {
    const res = await fetch(`${API_BASE}/api/admin/users`, {
      headers: {
        Authorization: 'Bearer admin-default-id:1729000000000',
      },
    });
    assert(
      res.status === 401,
      'Proteção de rota administrativa contra token forjado',
      `Status HTTP ${res.status} bloqueou tentativa de escalação de privilégio.`
    );
  } catch (err: any) {
    assert(false, 'Proteção de rota administrativa contra token forjado', err.message);
  }

  // TESTE 6: Migração com senha incorreta (Verificação SHA-256)
  try {
    const res = await fetch(`${API_BASE}/api/auth/migrate-legacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'chavepixedvandyemis@gmail.com',
        password: 'senha_completamente_incorreta',
      }),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401 && (data.error === 'E-mail ou senha incorretos' || data.message?.includes('incorretos')),
      'Tratamento de falha na migração suave: bloqueio de senha incorreta via SHA-256',
      `Status HTTP ${res.status}: "${data.error || data.message}". Hash preservado sem migração indevida.`
    );
  } catch (err: any) {
    assert(false, 'Tratamento de falha na migração suave: bloqueio de senha incorreta', err.message);
  }

  // TESTE 7: Migração com e-mail inexistente no data/db.json
  try {
    const res = await fetch(`${API_BASE}/api/auth/migrate-legacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'inexistente@dominio-fantasma.com',
        password: 'qualquer_senha',
      }),
    });
    const data = await res.json().catch(() => ({}));
    assert(
      res.status === 401,
      'Tratamento de falha na migração suave: rejeição de e-mail inexistente',
      `Status HTTP ${res.status}: "${data.error || data.message}"`
    );
  } catch (err: any) {
    assert(false, 'Tratamento de falha na migração suave: rejeição de e-mail inexistente', err.message);
  }

  // TESTE 8: Migração com payload vazio / campos obrigatórios ausentes
  try {
    const res = await fetch(`${API_BASE}/api/auth/migrate-legacy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: '' }),
    });
    assert(
      res.status === 400,
      'Validação de payload da rota de migração',
      `Status HTTP ${res.status} para requisição com dados incompletos.`
    );
  } catch (err: any) {
    assert(false, 'Validação de payload da rota de migração', err.message);
  }

  // TESTE 9: Diagnóstico da Conexão Supabase
  try {
    const res = await fetch(`${API_BASE}/api/supabase/status`);
    const statusData = await res.json().catch(() => ({}));
    assert(
      res.status === 200 && typeof statusData.configured === 'boolean',
      'Rota de status e diagnóstico do Supabase (/api/supabase/status)',
      `Status retornado: configured=${statusData.configured}. Instruções ativas para credenciamento.`
    );
  } catch (err: any) {
    assert(false, 'Rota de status e diagnóstico do Supabase', err.message);
  }

  // TESTE 10: Verificação de preservação de data/db.json pós-testes
  const dbPost = JSON.parse(fs.readFileSync(dbPath, 'utf-8'));
  const sameUsers = JSON.stringify(dbContent.users) === JSON.stringify(dbPost.users);
  assert(
    sameUsers,
    'Confirmação de não-mutação dos usuários legados em data/db.json',
    'Nenhum usuário foi apagado, sobrescrito ou corrompido durante a execução dos testes.'
  );

  console.log('\n================================================================');
  console.log(`RESULTADO FINAL DA SUÍTE DE TESTES: ${passedCount}/${totalCount} TESTES PASSARAM COM SUCESSO!`);
  console.log('================================================================\n');
}

runTests().catch(console.error);
