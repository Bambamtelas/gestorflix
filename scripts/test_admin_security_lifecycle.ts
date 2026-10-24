import { getSupabaseAdmin, verifySupabaseToken } from '../src/server/supabaseAdmin';

async function runLifecycleSecurityAudit() {
  console.log('================================================================');
  console.log('TESTE DE DIAGNÓSTICO E CICLO DE VIDA DE AUTORIZAÇÃO (GESTOR FLIX)');
  console.log('================================================================\n');

  const client = getSupabaseAdmin();
  const { data: usersData, error: usersErr } = await client.auth.admin.listUsers();
  if (usersErr || !usersData?.users) {
    throw new Error('Falha ao listar usuários do Supabase Auth: ' + usersErr?.message);
  }

  const adminAuthUser = usersData.users.find(u => u.email === 'chavepixedvandyemis@gmail.com');
  const commonAuthUser = usersData.users.find(u => u.email === 'jonjontelaspremium@gmail.com');

  console.log('1. Verificação de Contas no Supabase Auth:');
  console.log(`   - Master Admin: ${adminAuthUser ? 'EXISTE (' + adminAuthUser.id + ')' : 'NÃO ENCONTRADO'}`);
  console.log(`   - Usuário Comum: ${commonAuthUser ? 'EXISTE (' + commonAuthUser.id + ')' : 'NÃO ENCONTRADO'}`);

  // Teste 1: Simulação do reconhecimento da role do Master Admin no backend
  console.log('\n2. Teste de Identidade e Autorização do Master Admin:');
  const adminEmail = (adminAuthUser?.email || '').trim().toLowerCase();
  const isMaster = adminEmail === 'chavepixedvandyemis@gmail.com';
  console.log(`   - Reconhecido como Master Admin pelo e-mail oficial: ${isMaster}`);
  
  const { data: adminProf } = await client.from('profiles').select('role').eq('id', adminAuthUser!.id).single();
  console.log(`   - Papel na tabela profiles: "${adminProf?.role}"`);
  console.log(`   - Autorização esperada no endpoint /api/admin/users: PERMITIDO (HTTP 200)`);

  // Teste 2: Simulação do reconhecimento da role do Usuário Comum no backend
  console.log('\n3. Teste de Identidade e Autorização do Usuário Comum:');
  const commonEmail = (commonAuthUser?.email || '').trim().toLowerCase();
  const isCommonMaster = commonEmail === 'chavepixedvandyemis@gmail.com';
  const { data: commonProf } = await client.from('profiles').select('role').eq('id', commonAuthUser!.id).single();
  console.log(`   - Reconhecido como Master Admin: ${isCommonMaster} (deve ser false)`);
  console.log(`   - Papel na tabela profiles: "${commonProf?.role}" (deve ser 'user')`);
  console.log(`   - Autorização esperada no endpoint /api/admin/users: NEGADO (HTTP 403)`);

  // Teste 3: Requisições HTTP reais contra o servidor Express
  console.log('\n4. Testes HTTP Diretos na API:');
  
  // Requisição sem token
  const resNoAuth = await fetch('http://localhost:3000/api/admin/users');
  console.log(`   - GET /api/admin/users [Sem Token] => HTTP ${resNoAuth.status} (Esperado: 401)`);

  // Requisição com token de usuário forjado
  const resForged = await fetch('http://localhost:3000/api/admin/users', {
    headers: { Authorization: 'Bearer token.invalido.assinatura' }
  });
  console.log(`   - GET /api/admin/users [Token Inválido] => HTTP ${resForged.status} (Esperado: 401)`);

  console.log('\n================================================================');
  console.log('AUDITORIA DE CICLO DE VIDA CONCLUÍDA COM SUCESSO');
  console.log('================================================================\n');
}

runLifecycleSecurityAudit().catch(console.error);
