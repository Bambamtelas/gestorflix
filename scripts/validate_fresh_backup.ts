/**
 * GESTOR FLIX — VALIDADOR DE BACKUP FINAL E COMPARADOR DE DIFERENÇAS (FASE 8B.1)
 * 
 * Este utilitário de leitura:
 * 1. Valida a sintaxe JSON e calcula o hash SHA-256 de um novo arquivo de backup.
 * 2. Compara os registros com o backup anterior (db_8dac342a.json).
 * 3. Identifica exclusivamente registros reais do revendedor JonJon (UUID: 3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e).
 * 4. Mascara rigorosamente PII (telefones, credenciais, API keys).
 * 5. Não realiza nenhuma operação de escrita em banco ou em arquivos de produção.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const TARGET_USER_ID = '3a4a0f08-1bff-41f6-9b57-5c142a3e1f9e';
const PREVIOUS_BACKUP_PATH = path.resolve(process.cwd(), 'public/assets/aistudio/db_8dac342a.json');

function maskPhone(phone?: string | null): string {
  if (!phone) return 'N/A';
  const clean = phone.replace(/\D/g, '');
  if (clean.length < 6) return '***';
  return clean.slice(0, 4) + '****' + clean.slice(-3);
}

function maskApiKey(key?: string | null): string {
  if (!key) return '(vazio)';
  if (key.length <= 8) return '****';
  return key.slice(0, 5) + '...' + key.slice(-4);
}

export function computeSha256(data: string | Buffer): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export interface BackupValidationResult {
  filePath: string;
  fileSize: number;
  sha256Hash: string;
  isValidJson: boolean;
  timestampExtracted?: string;
  realRecords: {
    plansCount: number;
    plans: { id: string; name: string; price: number; duration: number }[];
    customersCount: number;
    customers: { id: string; name: string; maskedPhone: string; expirationDate: string; status: string }[];
    whatsappSettings: { apiUrl: string; instanceName: string; maskedKey: string; isConnected: boolean } | null;
    billingSettings: { timezone: string; timeDayBefore: string } | null;
  };
  demoRecordsExcluded: {
    plans: number;
    customers: number;
    applications: number;
    users: number;
  };
  differencesFromPrevious: {
    hasNewPlans: boolean;
    hasNewCustomers: boolean;
    plansDiff: string[];
    customersDiff: string[];
    settingsDiff: string[];
  };
}

export function validateAndCompareBackup(newBackupPath: string): BackupValidationResult {
  if (!fs.existsSync(newBackupPath)) {
    throw new Error(`Arquivo de backup não encontrado em: ${newBackupPath}`);
  }

  const fileBuffer = fs.readFileSync(newBackupPath);
  const fileContent = fileBuffer.toString('utf-8');
  const sha256Hash = computeSha256(fileBuffer);

  let parsed: any;
  try {
    parsed = JSON.parse(fileContent);
  } catch (err: any) {
    throw new Error(`Arquivo corrompido ou JSON inválido: ${err.message}`);
  }

  // Carregar backup anterior para comparação
  let prevParsed: any = null;
  if (fs.existsSync(PREVIOUS_BACKUP_PATH)) {
    try {
      prevParsed = JSON.parse(fs.readFileSync(PREVIOUS_BACKUP_PATH, 'utf-8'));
    } catch {
      prevParsed = null;
    }
  }

  // Filtrar dados reais de JonJon
  const rawPlans: any[] = parsed.plans || [];
  const rawCustomers: any[] = parsed.customers || [];
  const rawApps: any[] = parsed.applications || [];
  const rawUsers: any[] = parsed.users || [];
  const rawWs: any[] = parsed.whatsapp_settings || [];
  const rawBs: any[] = parsed.billing_settings || [];

  const realPlans = rawPlans.filter((p) => p.user_id === TARGET_USER_ID);
  const realCustomers = rawCustomers.filter((c) => c.user_id === TARGET_USER_ID);
  const realWs = rawWs.find((w) => w.user_id === TARGET_USER_ID);
  const realBs = rawBs.find((b) => b.user_id === TARGET_USER_ID);

  const demoPlans = rawPlans.filter((p) => p.user_id === 'demo-user-id');
  const demoCustomers = rawCustomers.filter((c) => c.user_id === 'demo-user-id');
  const demoApps = rawApps.filter((a) => a.user_id === 'demo-user-id');
  const demoUsers = rawUsers.filter((u) => u.id === 'demo-user-id' || u.id === 'admin-default-id');

  // Comparação com backup anterior
  const plansDiff: string[] = [];
  const customersDiff: string[] = [];
  const settingsDiff: string[] = [];

  if (prevParsed) {
    const prevRealPlans: any[] = (prevParsed.plans || []).filter((p: any) => p.user_id === TARGET_USER_ID);
    const prevRealCustomers: any[] = (prevParsed.customers || []).filter((c: any) => c.user_id === TARGET_USER_ID);

    if (realPlans.length !== prevRealPlans.length) {
      plansDiff.push(`Contagem de planos alterou: anterior=${prevRealPlans.length}, novo=${realPlans.length}`);
    }
    for (const np of realPlans) {
      const match = prevRealPlans.find((p: any) => p.id === np.id || p.name === np.name);
      if (!match) {
        plansDiff.push(`Novo plano detectado: "${np.name}" (ID legado: ${np.id})`);
      }
    }

    if (realCustomers.length !== prevRealCustomers.length) {
      customersDiff.push(`Contagem de clientes alterou: anterior=${prevRealCustomers.length}, novo=${realCustomers.length}`);
    }
    for (const nc of realCustomers) {
      const match = prevRealCustomers.find((c: any) => c.id === nc.id || c.name === nc.name);
      if (!match) {
        customersDiff.push(`Novo cliente detectado: "${nc.name}" (Vencimento: ${nc.expiration_date})`);
      } else if (match.expiration_date !== nc.expiration_date) {
        customersDiff.push(`Cliente "${nc.name}": vencimento alterou de ${match.expiration_date} para ${nc.expiration_date}`);
      }
    }
  }

  return {
    filePath: newBackupPath,
    fileSize: fileBuffer.length,
    sha256Hash,
    isValidJson: true,
    realRecords: {
      plansCount: realPlans.length,
      plans: realPlans.map((p) => ({
        id: p.id,
        name: p.name,
        price: p.price,
        duration: p.duration_days,
      })),
      customersCount: realCustomers.length,
      customers: realCustomers.map((c) => ({
        id: c.id,
        name: c.name,
        maskedPhone: maskPhone(c.whatsapp),
        expirationDate: c.expiration_date,
        status: c.status,
      })),
      whatsappSettings: realWs
        ? {
            apiUrl: realWs.api_url,
            instanceName: realWs.instance_name,
            maskedKey: maskApiKey(realWs.api_key),
            isConnected: Boolean(realWs.is_connected),
          }
        : null,
      billingSettings: realBs
        ? {
            timezone: realBs.timezone,
            timeDayBefore: realBs.time_day_before,
          }
        : null,
    },
    demoRecordsExcluded: {
      plans: demoPlans.length,
      customers: demoCustomers.length,
      applications: demoApps.length,
      users: demoUsers.length,
    },
    differencesFromPrevious: {
      hasNewPlans: plansDiff.length > 0,
      hasNewCustomers: customersDiff.length > 0,
      plansDiff,
      customersDiff,
      settingsDiff,
    },
  };
}

// Execução direta se fornecido caminho via CLI
if (process.argv[1]?.endsWith('validate_fresh_backup.ts')) {
  const targetFile = process.argv[2] || PREVIOUS_BACKUP_PATH;
  console.log('========================================================================');
  console.log('  GESTOR FLIX — AUDITORIA DE BACKUP FINAL E COMPARADOR DE INTEGRIDADE');
  console.log('========================================================================\n');

  try {
    const result = validateAndCompareBackup(targetFile);
    console.log(`[ARQUIVO ANALISADO]: ${path.basename(result.filePath)}`);
    console.log(`[TAMANHO]: ${result.fileSize} bytes`);
    console.log(`[HASH SHA-256]: ${result.sha256Hash}`);
    console.log(`[INTEGRIDADE JSON]: VÁLIDO (OK)\n`);

    console.log('--- REGISTROS REAIS DO REVENDEDOR JONJON ---');
    console.log(`  - Planos Reais: ${result.realRecords.plansCount}`);
    result.realRecords.plans.forEach((p) =>
      console.log(`      * "${p.name}" (R$ ${p.price.toFixed(2)}, ${p.duration} dias) [ID: ${p.id}]`)
    );
    console.log(`  - Clientes Reais: ${result.realRecords.customersCount}`);
    result.realRecords.customers.forEach((c) =>
      console.log(`      * "${c.name}" (${c.maskedPhone}) [Venc: ${c.expirationDate}, Status: ${c.status}]`)
    );

    console.log('\n--- REGISTROS DE DEMONSTRAÇÃO ISOLADOS E DESCARTADOS ---');
    console.log(`  - Planos demo ignorados: ${result.demoRecordsExcluded.plans}`);
    console.log(`  - Clientes demo ignorados: ${result.demoRecordsExcluded.customers}`);
    console.log(`  - Aplicativos demo ignorados: ${result.demoRecordsExcluded.applications}`);
    console.log(`  - Usuários demo ignorados: ${result.demoRecordsExcluded.users}`);

    console.log('\n--- DIFERENÇAS EM RELAÇÃO AO BACKUP ANTERIOR ---');
    if (result.differencesFromPrevious.plansDiff.length === 0 && result.differencesFromPrevious.customersDiff.length === 0) {
      console.log('  (Nenhuma alteração detectada: registros idênticos ao backup de referência)');
    } else {
      result.differencesFromPrevious.plansDiff.forEach((d) => console.log(`  [PLANO]: ${d}`));
      result.differencesFromPrevious.customersDiff.forEach((d) => console.log(`  [CLIENTE]: ${d}`));
    }
    console.log('\n========================================================================');
  } catch (err: any) {
    console.error('\n[ERRO NA VALIDAÇÃO DO BACKUP]:', err.message);
    process.exit(1);
  }
}
