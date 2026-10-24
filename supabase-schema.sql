-- ====================================================================
-- GESTOR IPTV PARA REVENDEDORES - SCHEMA COMPLETO SUPABASE POSTGRESQL COM RLS
-- ====================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. TABELA DE PERFIS (profiles)
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 3. TABELA DE LICENÇAS (subscriptions)
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'trial' CHECK (status IN ('trial', 'pending_payment', 'active', 'expired', 'suspended')),
  trial_ends_at TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '3 days'),
  current_period_end TIMESTAMPTZ NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '3 days'),
  payment_reference TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 4. TABELA DE PLANOS (plans)
CREATE TABLE IF NOT EXISTS public.plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  duration_days INTEGER NOT NULL DEFAULT 30,
  description TEXT,
  panel TEXT,
  server_dns TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Garantir adição das colunas caso a tabela já tenha sido criada anteriormente
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS panel TEXT;
ALTER TABLE public.plans ADD COLUMN IF NOT EXISTS server_dns TEXT[] NOT NULL DEFAULT '{}'::TEXT[];


-- 5. TABELA DE APLICATIVOS (applications)
CREATE TABLE IF NOT EXISTS public.applications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 6. TABELA DE CLIENTES (customers)
CREATE TABLE IF NOT EXISTS public.customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT,
  whatsapp TEXT NOT NULL,
  notes TEXT,
  plan_id UUID REFERENCES public.plans(id) ON DELETE SET NULL,
  application_id UUID REFERENCES public.applications(id) ON DELETE SET NULL,
  start_date DATE NOT NULL DEFAULT CURRENT_DATE,
  expiration_date DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expiring_soon', 'expired')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 7. TABELA DE CONFIGURAÇÕES WHATSAPP (whatsapp_settings)
CREATE TABLE IF NOT EXISTS public.whatsapp_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  api_url TEXT NOT NULL DEFAULT '',
  instance_name TEXT NOT NULL DEFAULT '',
  api_key TEXT NOT NULL DEFAULT '',
  is_connected BOOLEAN NOT NULL DEFAULT FALSE,
  auto_billing_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_checked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 8. TABELA DE CONFIGURAÇÕES DE HORÁRIOS DE COBRANÇA (billing_settings)
CREATE TABLE IF NOT EXISTS public.billing_settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  send_day_before BOOLEAN NOT NULL DEFAULT TRUE,
  time_day_before TEXT NOT NULL DEFAULT '09:00',
  send_day_of_morning BOOLEAN NOT NULL DEFAULT TRUE,
  time_day_of_morning TEXT NOT NULL DEFAULT '09:00',
  send_day_of_night BOOLEAN NOT NULL DEFAULT TRUE,
  time_day_of_night TEXT NOT NULL DEFAULT '19:00',
  send_day_after BOOLEAN NOT NULL DEFAULT TRUE,
  time_day_after TEXT NOT NULL DEFAULT '10:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 9. TABELA DE MODELOS DE MENSAGENS (message_templates)
CREATE TABLE IF NOT EXISTS public.message_templates (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('day_before', 'day_of', 'day_after')),
  title TEXT NOT NULL,
  template_text TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  UNIQUE(user_id, type)
);

-- 10. TABELA DE HISTÓRICO DE ENVIOS COM CONTROLE DE IDEMPOTÊNCIA (message_logs)
CREATE TABLE IF NOT EXISTS public.message_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  whatsapp TEXT NOT NULL,
  message_type TEXT NOT NULL,
  cycle_date DATE NOT NULL,
  scheduled_for TEXT NOT NULL,
  attempted_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed', 'cancelled')),
  response_payload TEXT,
  error_details TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- 11. TABELA DE CONFIGURAÇÕES GERAIS DA LICENÇA (saas_settings)
CREATE TABLE IF NOT EXISTS public.saas_settings (
  id INTEGER PRIMARY KEY DEFAULT 1,
  admin_pix_key TEXT NOT NULL DEFAULT 'chavepixedvandyemis@gmail.com',
  admin_pix_name TEXT NOT NULL DEFAULT 'Administração Gestor IPTV',
  saas_monthly_price NUMERIC(10,2) NOT NULL DEFAULT 99.90,
  instructions TEXT NOT NULL DEFAULT 'Após realizar o pagamento via PIX no valor de R$ 99,90 (valor único vitalício, sem mensalidade), envie o comprovante para ativação imediata da sua conta.',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Inserir dados padrão de saas_settings
INSERT INTO public.saas_settings (id, admin_pix_key, admin_pix_name, saas_monthly_price, instructions)
VALUES (1, 'chavepixedvandyemis@gmail.com', 'Administração Gestor IPTV', 99.90, 'Após realizar o pagamento via PIX no valor de R$ 99,90 (valor único vitalício, sem mensalidade), envie o comprovante para ativação imediata da sua conta.')
ON CONFLICT (id) DO NOTHING;

-- ====================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ====================================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.message_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.saas_settings ENABLE ROW LEVEL SECURITY;

-- Helper function to check if current auth user is admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Profiles: users read their own, admins read/update all
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_admin());
CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- Trigger de segurança para impedir escalonamento de privilégios (role) por usuários comuns
CREATE OR REPLACE FUNCTION public.protect_profile_role_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Bloqueia alteração da coluna role se a requisição originou de um cliente autenticado (JWT)
  IF NEW.role IS DISTINCT FROM OLD.role THEN
    IF auth.role() = 'authenticated' THEN
      RAISE EXCEPTION 'Acesso negado: a função de acesso (role) não pode ser alterada via cliente.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Bloqueia alteração do identificador do usuário
  IF NEW.id IS DISTINCT FROM OLD.id THEN
    RAISE EXCEPTION 'Acesso negado: o ID do perfil é imutável.'
      USING ERRCODE = '42501';
  END IF;

  -- Bloqueia alteração direta de e-mail na tabela profiles
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'Acesso negado: o e-mail deve ser atualizado através do fluxo de autenticação.'
      USING ERRCODE = '42501';
  END IF;

  -- Atualiza o carimbo de data/hora
  NEW.updated_at := timezone('utc'::text, now());

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.protect_profile_role_update() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_protect_profile_role ON public.profiles;
CREATE TRIGGER trg_protect_profile_role
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.protect_profile_role_update();


-- Subscriptions: users view own, admins manage all
CREATE POLICY "Users can view own subscription" ON public.subscriptions FOR SELECT USING (auth.uid() = user_id OR public.is_admin());
CREATE POLICY "Admins can update subscriptions" ON public.subscriptions FOR ALL USING (public.is_admin());

-- Plans: user isolated
CREATE POLICY "Users can manage own plans" ON public.plans FOR ALL USING (auth.uid() = user_id);

-- Applications: user isolated
CREATE POLICY "Users can manage own applications" ON public.applications FOR ALL USING (auth.uid() = user_id);

-- Customers: user isolated
CREATE POLICY "Users can manage own customers" ON public.customers FOR ALL USING (auth.uid() = user_id);

-- WhatsApp settings: user isolated
CREATE POLICY "Users can manage own whatsapp settings" ON public.whatsapp_settings FOR ALL USING (auth.uid() = user_id);

-- Billing settings: user isolated
CREATE POLICY "Users can manage own billing settings" ON public.billing_settings FOR ALL USING (auth.uid() = user_id);

-- Message templates: user isolated
CREATE POLICY "Users can manage own message templates" ON public.message_templates FOR ALL USING (auth.uid() = user_id);

-- Message logs: user isolated
CREATE POLICY "Users can manage own message logs" ON public.message_logs FOR ALL USING (auth.uid() = user_id);

-- SaaS settings: readable by all authenticated, manageable by admin
CREATE POLICY "All authenticated can view saas settings" ON public.saas_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Only admin can update saas settings" ON public.saas_settings FOR ALL USING (public.is_admin());

-- ====================================================================
-- AUTOMATIC TRIAL TRIGGER NA CRIAÇÃO DO USUÁRIO
-- ====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  v_role TEXT := 'user';
BEGIN
  -- Se o email for o email do administrador definido
  IF NEW.email = 'chavepixedvandyemis@gmail.com' THEN
    v_role := 'admin';
  END IF;

  -- 1. Cria o perfil
  INSERT INTO public.profiles (id, email, full_name, role)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), v_role);

  -- 2. Cria a assinatura com 3 dias grátis de trial
  INSERT INTO public.subscriptions (user_id, status, trial_ends_at, current_period_end)
  VALUES (
    NEW.id,
    CASE WHEN v_role = 'admin' THEN 'active' ELSE 'trial' END,
    timezone('utc'::text, now()) + interval '3 days',
    CASE WHEN v_role = 'admin' THEN timezone('utc'::text, now()) + interval '365 days' ELSE timezone('utc'::text, now()) + interval '3 days' END
  );

  -- 3. Cria configurações padrão de WhatsApp e Cobrança
  INSERT INTO public.whatsapp_settings (user_id) VALUES (NEW.id);
  INSERT INTO public.billing_settings (user_id) VALUES (NEW.id);

  -- 4. Cria os 3 templates padrão de cobrança exigidos
  INSERT INTO public.message_templates (user_id, type, title, template_text) VALUES
  (NEW.id, 'day_before', 'Lembrete de Vencimento (1 dia antes)', 'Olá, {nome}! Tudo bem? 😊 Passando para lembrar que seu plano {plano} vence amanhã, dia {vencimento}. Valor: {valor}. Qualquer dúvida, estou à disposição!'),
  (NEW.id, 'day_of', 'Lembrete no Dia do Vencimento', 'Olá, {nome}! 😊 Hoje é o vencimento do seu plano {plano}. O valor é {valor}. Entre em contato para regularizar e continuar utilizando seu serviço normalmente.'),
  (NEW.id, 'day_after', 'Aviso de Vencimento Atrasado (1 dia depois)', 'Olá, {nome}! Identificamos que o vencimento do seu plano {plano} foi ontem, dia {vencimento}. Caso já tenha realizado o pagamento, por favor, desconsidere esta mensagem. Se precisar de ajuda, estamos à disposição.');

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger disparado no Supabase Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Índices para alta performance e verificação de vencimentos
CREATE INDEX IF NOT EXISTS idx_plans_user ON public.plans (user_id);
CREATE INDEX IF NOT EXISTS idx_applications_user ON public.applications (user_id);
CREATE INDEX IF NOT EXISTS idx_customers_user_exp ON public.customers (user_id, expiration_date);
CREATE INDEX IF NOT EXISTS idx_message_logs_idempotency ON public.message_logs (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_message_logs_user_status ON public.message_logs (user_id, status);

