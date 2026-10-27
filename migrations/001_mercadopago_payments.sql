-- ====================================================================
-- MIGRAÇÃO INCREMENTAL: TABELA DE PAGAMENTOS MERCADO PAGO E SEGREDOS SEGUROS
-- Gestor FLIX SaaS
-- ====================================================================

-- 1. Criação da tabela de pagamentos Pix Mercado Pago
-- Estratégia de Histórico Financeiro: ON DELETE SET NULL
-- Se o usuário for excluído de auth.users, o registro contábil do pagamento
-- NUNCA é apagado (preservando valor, data, external_reference, payer_email e comprovante Pix).
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  external_reference TEXT NOT NULL UNIQUE,
  mercado_pago_payment_id TEXT UNIQUE,
  amount NUMERIC(10, 2) NOT NULL DEFAULT 99.90,
  currency TEXT NOT NULL DEFAULT 'BRL',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'refunded')),
  license_type TEXT NOT NULL DEFAULT 'vitalicio',
  qr_code TEXT,
  qr_code_base64 TEXT,
  ticket_url TEXT,
  payer_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  approved_at TIMESTAMPTZ
);

-- 2. Índices para performance, unicidade e idempotência
CREATE INDEX IF NOT EXISTS idx_payments_user_id ON public.payments(user_id);
CREATE INDEX IF NOT EXISTS idx_payments_mp_id ON public.payments(mercado_pago_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_ext_ref ON public.payments(external_reference);
CREATE INDEX IF NOT EXISTS idx_payments_status ON public.payments(status);

-- 3. Habilitação de Row Level Security (RLS)
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- 4. Políticas de Segurança (RLS) Estritas
-- Apenas permissão de LEITURA (SELECT) para o próprio titular do pagamento
DROP POLICY IF EXISTS "Users can view own payments" ON public.payments;
CREATE POLICY "Users can view own payments" ON public.payments
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Leitura de auditoria para administradores (somente SELECT)
DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
DROP POLICY IF EXISTS "Admins can manage payments" ON public.payments;
CREATE POLICY "Admins can view all payments" ON public.payments
  FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- REGRA CRÍTICA DE SEGURANÇA:
-- NENHUMA POLÍTICA DE INSERT, UPDATE OU DELETE É CONCEDIDA A anon OU authenticated!
-- Nem usuários nem administradores conseguem alterar status ou forjar pagamentos via cliente Supabase.
-- Toda mutação financeira e aprovação é executada com exclusividade pelo backend Node/Express via Service Role,
-- que aplica validação autoritativa na API oficial do Mercado Pago e autenticação estrita do Administrador Master.

-- 5. Tabela de Segredos Administrativos do Backend (Persistência Segura)
-- Totalmente isolada da tabela saas_settings (que possui leitura liberada para revendedores).
CREATE TABLE IF NOT EXISTS public.admin_secrets (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.admin_secrets ENABLE ROW LEVEL SECURITY;

-- Revogação total de privilégios para roles públicas de clientes
REVOKE ALL ON public.admin_secrets FROM anon, authenticated;

-- RLS ativado SEM NENHUMA política para clientes.
-- Apenas o processo do backend (via SUPABASE_SERVICE_ROLE_KEY) tem acesso de leitura e escrita.
