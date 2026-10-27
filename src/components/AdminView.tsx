import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  ShieldAlert,
  Users,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Clock,
  Database,
  Copy,
  Lock,
  Unlock,
  PlusCircle,
  MessageSquare,
  Key,
  Eye,
  EyeOff,
  Activity,
  ShieldCheck,
  Server,
} from 'lucide-react';

export const AdminView: React.FC = () => {
  const { user } = useAuth();
  const isMasterAdmin = Boolean(
    user?.email && user.email.trim().toLowerCase() === 'chavepixedvandyemis@gmail.com'
  );
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [adminError, setAdminError] = useState<string>('');
  const [actionSuccess, setActionSuccess] = useState('');
  const [activeTab, setActiveTab] = useState<'users' | 'mercadopago' | 'evolution' | 'settings' | 'sql'>('users');

  // License Settings
  const [pixKey, setPixKey] = useState('chavepixedvandyemis@gmail.com');
  const [pixName, setPixName] = useState('Administração GestorFlix');
  const [price, setPrice] = useState(99.9);
  const [instructions, setInstructions] = useState('Após realizar o pagamento via PIX no valor de R$ 99,90 (valor único vitalício, sem mensalidade), envie o comprovante para ativação imediata da sua conta.');
  const [savingSettings, setSavingSettings] = useState(false);

  // Mercado Pago Settings (Master Admin)
  const [mpConfig, setMpConfig] = useState<{
    configured: boolean;
    enabled: boolean;
    has_token: boolean;
    masked_token: string;
    notification_url: string;
    has_webhook_secret: boolean;
    updated_at?: string;
  } | null>(null);
  const [mpToken, setMpToken] = useState('');
  const [mpEnabled, setMpEnabled] = useState(true);
  const [mpNotificationUrl, setMpNotificationUrl] = useState('');
  const [mpWebhookSecret, setMpWebhookSecret] = useState('');
  const [showMpTokenInput, setShowMpTokenInput] = useState(false);
  const [showMpSecretInput, setShowMpSecretInput] = useState(false);
  const [savingMp, setSavingMp] = useState(false);
  const [testingMp, setTestingMp] = useState(false);
  const [copiedMpWebhook, setCopiedMpWebhook] = useState(false);
  const [mpTestResult, setMpTestResult] = useState<{
    success: boolean;
    message: string;
    status?: number;
    user_id?: number;
    nickname?: string;
    site_id?: string;
  } | null>(null);

  // Evolution Central Settings (Master Admin)
  const [evolutionUrl, setEvolutionUrl] = useState('');
  const [evolutionKey, setEvolutionKey] = useState('');
  const [hasEvolutionKey, setHasEvolutionKey] = useState(false);
  const [maskedEvolutionKey, setMaskedEvolutionKey] = useState('');
  const [evolutionUpdatedAt, setEvolutionUpdatedAt] = useState<string | null>(null);
  const [showEvolutionKeyInput, setShowEvolutionKeyInput] = useState(false);
  const [savingEvolution, setSavingEvolution] = useState(false);
  const [testingEvolution, setTestingEvolution] = useState(false);
  const [evolutionTestResult, setEvolutionTestResult] = useState<{
    success: boolean;
    message: string;
    status?: number;
    instance_count?: number;
  } | null>(null);

  // SQL code viewer state
  const [sqlCopied, setSqlCopied] = useState(false);
  const [sqlContent, setSqlContent] = useState<string>('');

  const loadData = async () => {
    if (user?.role !== 'admin') {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setAdminError('');
      const data = await api.getAdminUsers();
      setUsers(Array.isArray(data) ? data : []);

      const subInfo = await api.getSubscriptionInfo();
      if (subInfo?.payment_info) {
        setPixKey(subInfo.payment_info.pix_key || '');
        setPixName(subInfo.payment_info.pix_name || '');
        setPrice(subInfo.payment_info.monthly_price || 99.9);
        setInstructions(subInfo.payment_info.instructions || '');
      }

      // Fetch SQL content
      fetch('/supabase-schema.sql')
        .then((res) => res.text())
        .then((txt) => setSqlContent(txt))
        .catch(() => {});

      // Fetch Mercado Pago Settings (exclusivo para o Master Admin)
      if (isMasterAdmin) {
        try {
          const mpSettings = await api.getAdminMercadoPagoSettings();
          setMpConfig(mpSettings);
          setMpEnabled(Boolean(mpSettings.enabled));
          setMpNotificationUrl(mpSettings.notification_url || `${window.location.origin}/api/webhooks/mercadopago`);
        } catch (mpErr) {
          console.warn('Configurações do Mercado Pago não puderam ser carregadas:', mpErr);
        }
      }

      // Fetch Central Evolution API Settings
      try {
        const evoSettings = await api.getAdminEvolutionSettings();
        setEvolutionUrl(evoSettings.api_url || '');
        setHasEvolutionKey(Boolean(evoSettings.has_api_key));
        setMaskedEvolutionKey(evoSettings.api_key_masked || '');
        setEvolutionUpdatedAt(evoSettings.updated_at || null);
      } catch (evoErr) {
        console.warn('Configurações centrais da Evolution não puderam ser carregadas:', evoErr);
      }
    } catch (err: any) {
      const msg = err?.message || 'Erro ao carregar dados do painel master.';
      setAdminError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'admin') {
      loadData();
    } else {
      setLoading(false);
    }
  }, [user?.role]);

  const handleUpdateSubscription = async (
    targetUserId: string,
    action: string,
    daysToAdd?: number,
    newStatus?: string
  ) => {
    try {
      const res = await api.updateAdminUserSubscription(targetUserId, {
        action,
        days_to_add: daysToAdd,
        new_status: newStatus,
      });
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(''), 4000);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao atualizar assinatura.');
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      await api.saveAdminSettings({
        admin_pix_key: pixKey,
        admin_pix_name: pixName,
        saas_monthly_price: Number(price),
        instructions,
      });
      setActionSuccess('Configurações de licença atualizadas!');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar configurações.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleCopySql = () => {
    if (sqlContent) {
      navigator.clipboard.writeText(sqlContent);
      setSqlCopied(true);
      setTimeout(() => setSqlCopied(false), 3000);
    }
  };

  const handleSaveMercadoPago = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingMp(true);
    try {
      const res = await api.saveAdminMercadoPagoSettings({
        access_token: mpToken ? mpToken.trim() : undefined,
        enabled: mpEnabled,
        notification_url: mpNotificationUrl ? mpNotificationUrl.trim() : undefined,
        webhook_secret: mpWebhookSecret ? mpWebhookSecret.trim() : undefined,
      });
      setMpConfig(res.config);
      setMpEnabled(res.config.enabled);
      setMpNotificationUrl(res.config.notification_url);
      setMpToken('');
      setMpWebhookSecret('');
      setShowMpTokenInput(false);
      setShowMpSecretInput(false);
      setActionSuccess('Configurações do Mercado Pago salvas com sucesso!');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar configurações do Mercado Pago.');
    } finally {
      setSavingMp(false);
    }
  };

  const handleTestMercadoPago = async () => {
    setTestingMp(true);
    setMpTestResult(null);
    try {
      const res = await api.testAdminMercadoPagoConnection({
        access_token: mpToken ? mpToken.trim() : undefined,
      });
      setMpTestResult(res);
    } catch (err: any) {
      setMpTestResult({
        success: false,
        message: err.message || 'Falha ao testar conexão com o Mercado Pago.',
        status: err.status,
      });
    } finally {
      setTestingMp(false);
    }
  };

  const handleCopyWebhookUrl = () => {
    const url = mpNotificationUrl || `${window.location.origin}/api/webhooks/mercadopago`;
    navigator.clipboard.writeText(url);
    setCopiedMpWebhook(true);
    setTimeout(() => setCopiedMpWebhook(false), 3000);
  };

  const handleSaveEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEvolution(true);
    try {
      const res = await api.saveAdminEvolutionSettings({
        api_url: evolutionUrl,
        api_key: evolutionKey ? evolutionKey : undefined,
      });
      setHasEvolutionKey(res.settings.has_api_key);
      setMaskedEvolutionKey(res.settings.api_key_masked);
      setEvolutionUpdatedAt(res.settings.updated_at || null);
      setEvolutionKey('');
      setShowEvolutionKeyInput(false);
      setActionSuccess('Configurações centrais da Evolution API salvas com sucesso!');
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar configurações centrais da Evolution API.');
    } finally {
      setSavingEvolution(false);
    }
  };

  const handleTestEvolution = async () => {
    setTestingEvolution(true);
    setEvolutionTestResult(null);
    try {
      const res = await api.testAdminEvolutionConnection({
        api_url: evolutionUrl,
        api_key: evolutionKey ? evolutionKey : undefined,
      });
      setEvolutionTestResult(res);
    } catch (err: any) {
      setEvolutionTestResult({
        success: false,
        message: err.message || 'Falha ao testar conexão com a Evolution API.',
        status: err.status,
      });
    } finally {
      setTestingEvolution(false);
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="p-8 text-center bg-[#1c1415] border border-red-900/60 rounded-2xl max-w-xl mx-auto my-12">
        <ShieldAlert className="w-12 h-12 text-[#ff4d58] mx-auto mb-3" />
        <h2 className="text-lg font-bold text-white mb-2">Acesso Restrito ao Administrador</h2>
        <p className="text-sm text-neutral-400 mb-4">
          Este painel é de uso exclusivo do Administrador Proprietário do SaaS GestorFlix ({user?.email || 'usuário atual'}).
        </p>
        <span className="text-xs text-neutral-500 font-mono">
          Papel atual da conta: {user?.role || 'user'}
        </span>
      </div>
    );
  }

  // Calculate platform totals
  const totalUsers = users.length;
  const inTrial = users.filter((u) => u.subscription?.status === 'trial').length;
  const activeSubs = users.filter((u) => u.subscription?.status === 'active').length;
  const pendingPayment = users.filter((u) => u.subscription?.status === 'pending_payment').length;
  const expiredOrSuspended = users.filter((u) => u.subscription?.status === 'expired' || u.subscription?.status === 'suspended').length;

  return (
    <div className="space-y-6">
      {/* Admin Error Alert if any */}
      {adminError && (
        <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 flex items-center justify-between gap-3 text-amber-200 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>{adminError}</span>
          </div>
          <button
            onClick={loadData}
            className="px-2.5 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 font-semibold transition-colors shrink-0"
          >
            Tentar Novamente
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-[#ff4d58]" />
            <h1 className="text-2xl font-black text-white tracking-tight">Painel do Administrador Master</h1>
          </div>
          <p className="text-xs text-neutral-400 mt-0.5">
            Gestão exclusiva do proprietário: monitoramento de revendedores, controle de licenças e banco Supabase.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {actionSuccess && (
            <div className="text-xs px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-medium">
              {actionSuccess}
            </div>
          )}
          <button
            onClick={loadData}
            className="px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#333333] rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Overview Cards Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div className="p-3.5 rounded-xl bg-[#181818] border border-[#282828] shadow-md">
          <span className="text-neutral-500 font-bold uppercase tracking-wider block text-[10px]">Total de Revendedores</span>
          <span className="text-xl font-black text-white font-mono">{totalUsers}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#181818] border border-[#282828] shadow-md">
          <span className="text-[#ff4d58] font-bold uppercase tracking-wider block text-[10px]">Em Teste Gratuito</span>
          <span className="text-xl font-black text-white font-mono">{inTrial}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#181818] border border-[#282828] shadow-md">
          <span className="text-emerald-400 font-bold uppercase tracking-wider block text-[10px]">Revendedores Ativos</span>
          <span className="text-xl font-black text-emerald-400 font-mono">{activeSubs}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#181818] border border-[#282828] shadow-md">
          <span className="text-amber-400 font-bold uppercase tracking-wider block text-[10px]">Pagamento Pendente</span>
          <span className="text-xl font-black text-amber-400 font-mono">{pendingPayment}</span>
        </div>
        <div className="p-3.5 rounded-xl bg-[#181818] border border-[#282828] col-span-2 sm:col-span-1 shadow-md">
          <span className="text-[#ff4d58] font-bold uppercase tracking-wider block text-[10px]">Bloqueados / Expirados</span>
          <span className="text-xl font-black text-[#ff4d58] font-mono">{expiredOrSuspended}</span>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap items-center gap-2 border-b border-[#282828] pb-2 text-xs">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'users' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Usuários & Licenças
        </button>
        {isMasterAdmin && (
          <button
            onClick={() => setActiveTab('mercadopago')}
            className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
              activeTab === 'mercadopago' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            Pagamentos e Mercado Pago
          </button>
        )}
        <button
          onClick={() => setActiveTab('evolution')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'evolution' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          WhatsApp Central
        </button>
        <button
          onClick={() => setActiveTab('settings')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'settings' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <CreditCard className="w-3.5 h-3.5" />
          Configurações de Licença & PIX
        </button>
        <button
          onClick={() => setActiveTab('sql')}
          className={`px-4 py-2 font-bold rounded-lg transition-colors flex items-center gap-1.5 ${
            activeTab === 'sql' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
          }`}
        >
          <Database className="w-3.5 h-3.5" />
          Script SQL Supabase (RLS)
        </button>
      </div>

      {/* Tab 1: Users & Subscriptions */}
      {activeTab === 'users' && (
        <div className="bg-[#181818] border border-[#282828] rounded-xl overflow-hidden shadow-xl">
          {loading ? (
            <div className="p-12 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
              <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
              <span>Carregando revendedores...</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-300">
                <thead className="bg-[#101010] text-neutral-400 uppercase text-[10px] tracking-wider border-b border-[#282828]">
                  <tr>
                    <th className="py-3.5 px-4 font-bold">Usuário / Revendedor</th>
                    <th className="py-3.5 px-4 font-bold">Data Cadastro</th>
                    <th className="py-3.5 px-4 font-bold">Clientes</th>
                    <th className="py-3.5 px-4 font-bold">WhatsApp</th>
                    <th className="py-3.5 px-4 font-bold">Status Assinatura</th>
                    <th className="py-3.5 px-4 font-bold">Término Teste / Ciclo</th>
                    <th className="py-3.5 px-4 font-bold text-right">Ações do Administrador</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#242424]">
                  {users.map((u) => {
                    const status = u.subscription?.status || 'expired';
                    const trialEnd = u.subscription?.trial_ends_at
                      ? new Date(u.subscription.trial_ends_at).toLocaleDateString('pt-BR')
                      : '—';
                    const periodEnd = u.subscription?.current_period_end
                      ? new Date(u.subscription.current_period_end).toLocaleDateString('pt-BR')
                      : '—';

                    return (
                      <tr key={u.id} className="hover:bg-[#202020] transition-colors">
                        <td className="py-3.5 px-4">
                          <span className="font-bold text-white block">{u.name}</span>
                          <span className="text-[11px] text-neutral-400 block">{u.email}</span>
                          {u.role === 'admin' && (
                            <span className="text-[10px] text-[#ff4d58] font-bold uppercase tracking-wider block mt-0.5">
                              Master Admin
                            </span>
                          )}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-neutral-300">
                          {new Date(u.created_at).toLocaleDateString('pt-BR')}
                        </td>

                        <td className="py-3.5 px-4 font-mono text-neutral-200">
                          {u.customer_count} cliente(s)
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              u.whatsapp_connected
                                ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                                : 'bg-[#222222] text-neutral-400 border border-[#333333]'
                            }`}
                          >
                            {u.whatsapp_connected ? 'Conectado' : 'Desconectado'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                              status === 'active'
                                ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                                : status === 'trial'
                                ? 'bg-[#E50914]/20 text-[#ff4d58] border border-[#E50914]/40'
                                : status === 'pending_payment'
                                ? 'bg-amber-950/70 text-amber-400 border border-amber-500/30'
                                : 'bg-red-950/70 text-red-400 border border-red-500/30'
                            }`}
                          >
                            {status === 'active'
                              ? 'Ativo'
                              : status === 'trial'
                              ? 'Teste Grátis'
                              : status === 'pending_payment'
                              ? 'Pgto Pendente'
                              : status === 'suspended'
                              ? 'Suspenso'
                              : 'Expirado'}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 font-mono text-neutral-300">
                          {status === 'trial' ? trialEnd : periodEnd}
                        </td>

                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            {/* Extend trial */}
                            <button
                              onClick={() => handleUpdateSubscription(u.id, 'extend_trial', 3)}
                              title="+3 Dias de Teste"
                              className="px-2 py-1 text-[11px] font-semibold text-neutral-200 hover:text-white bg-[#262626] hover:bg-[#333333] border border-[#3e3e3e] rounded transition-colors"
                            >
                              +3d Teste
                            </button>

                            {/* Activate Paid (Vitalício) */}
                            <button
                              onClick={() => handleUpdateSubscription(u.id, 'activate_paid', 36500)}
                              title="Aprovar Pagamento e Ativar Licença Vitalícia"
                              className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded shadow transition-all active:scale-95"
                            >
                              Ativar Vitalício
                            </button>

                            {/* Suspend or Reactivate */}
                            {status === 'suspended' ? (
                              <button
                                onClick={() => handleUpdateSubscription(u.id, 'reactivate')}
                                title="Reativar Conta"
                                className="px-2 py-1 text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900/60 border border-emerald-500/30 rounded transition-colors"
                              >
                                Reativar
                              </button>
                            ) : (
                              <button
                                onClick={() => handleUpdateSubscription(u.id, 'suspend')}
                                title="Suspender Conta"
                                className="px-2 py-1 text-[11px] font-semibold text-neutral-400 hover:text-red-400 bg-[#222222] hover:bg-red-950/40 border border-[#333333] rounded transition-colors"
                              >
                                Suspender
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Tab: Pagamentos e Mercado Pago (Licença Vitalícia Pix R$ 99,90) - Exclusivo Master Admin */}
      {activeTab === 'mercadopago' && isMasterAdmin && (
        <div className="p-6 rounded-xl bg-[#181818] border border-[#282828] max-w-3xl space-y-6 text-xs shadow-xl">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#282828] pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-400">
                <CreditCard className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-white">Pagamentos e Mercado Pago</h2>
                <p className="text-neutral-400 mt-0.5">
                  Integração oficial Pix Mercado Pago para venda da Licença Vitalícia do Gestor FLIX (R$ 99,90).
                </p>
              </div>
            </div>
            {mpConfig?.updated_at && (
              <span className="text-[11px] text-neutral-400 font-mono self-start sm:self-auto bg-[#101010] px-2.5 py-1 rounded-md border border-[#282828]">
                Atualizado: {new Date(mpConfig.updated_at).toLocaleString('pt-BR')}
              </span>
            )}
          </div>

          {/* Security & Commercial Rules Banner */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-[#101010] border border-emerald-500/30 text-neutral-300 space-y-1.5">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span>Segurança e Credenciais Restritas</span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                O <strong>Access Token</strong> é armazenado exclusivamente no servidor backend. Revendedores e usuários comuns <strong>nunca</strong> visualizam suas credenciais ou configurações financeiras.
              </p>
            </div>

            <div className="p-4 rounded-xl bg-[#121212] border border-[#282828] text-neutral-300 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase font-bold text-neutral-400 tracking-wider">Regra Comercial</span>
                <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                  R$ 99,90 Vitalício
                </span>
              </div>
              <p className="text-[11px] text-neutral-400 leading-relaxed">
                Pagamento único via Pix, sem mensalidades e sem renovação automática. A ativação vitalícia é liberada instantaneamente após confirmação autêntica do Mercado Pago.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveMercadoPago} className="space-y-5">
            {/* Enable / Disable Gateway Toggle */}
            <div className="p-4 rounded-xl bg-[#141414] border border-[#262626] flex items-center justify-between">
              <div>
                <label className="font-bold text-white block text-sm">Disponibilidade de Pagamentos</label>
                <p className="text-[11px] text-neutral-400 mt-0.5">
                  Permitir que usuários e revendedores comprem a licença vitalícia via Pix no sistema.
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={mpEnabled}
                  onChange={(e) => setMpEnabled(e.target.checked)}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-[#2a2a2a] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
              </label>
            </div>

            {/* Access Token Input */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Access Token do Mercado Pago (Produção)</span>
                </label>
                {mpConfig?.configured && !showMpTokenInput && (
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-500/30 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> Token Configurado com Segurança
                  </span>
                )}
              </div>

              {mpConfig?.configured && !showMpTokenInput ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#101010] border border-[#282828] rounded-lg px-3.5 py-2.5 font-mono text-neutral-300 text-xs flex items-center justify-between">
                    <span>{mpConfig.masked_token}</span>
                    <span className="text-[10px] text-neutral-400 uppercase font-bold">Oculto</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMpTokenInput(true);
                      setMpToken('');
                    }}
                    className="px-3.5 py-2.5 bg-[#222222] hover:bg-[#2c2c2c] text-white rounded-lg border border-[#333333] transition-colors font-semibold text-xs whitespace-nowrap"
                  >
                    Alterar Token
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <Key className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      value={mpToken}
                      onChange={(e) => setMpToken(e.target.value)}
                      placeholder="APP_USR-0000000000000000-000000-..."
                      className="w-full bg-[#101010] border border-[#333333] focus:border-emerald-500 focus:outline-none rounded-lg pl-9 pr-10 py-2.5 text-white placeholder-neutral-600 font-mono text-xs transition-colors"
                      required={!mpConfig?.configured}
                    />
                  </div>
                  {showMpTokenInput && (
                    <button
                      type="button"
                      onClick={() => setShowMpTokenInput(false)}
                      className="text-[10px] text-neutral-400 hover:text-white underline"
                    >
                      Cancelar alteração e manter o token atual
                    </button>
                  )}
                </div>
              )}
              <p className="text-[10px] text-neutral-400 mt-1">
                Obtenha seu Access Token de Produção no portal de Desenvolvedores do Mercado Pago (Suas Aplicações &gt; Credenciais de Produção).
              </p>
            </div>

            {/* Webhook Notification URL */}
            <div>
              <label className="block font-semibold text-neutral-200 mb-1.5 flex items-center justify-between">
                <span>URL de Notificação Instantânea (Webhook)</span>
                <span className="text-[10px] text-neutral-400">Recebe a confirmação automática do Pix</span>
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={mpNotificationUrl}
                  onChange={(e) => setMpNotificationUrl(e.target.value)}
                  placeholder="https://gestorflix.online/api/webhooks/mercadopago"
                  className="flex-1 bg-[#101010] border border-[#333333] focus:border-emerald-500 focus:outline-none rounded-lg px-3 py-2 text-white placeholder-neutral-600 font-mono text-xs transition-colors"
                />
                <button
                  type="button"
                  onClick={handleCopyWebhookUrl}
                  className="px-3.5 py-2 bg-[#222222] hover:bg-[#2c2c2c] text-neutral-200 hover:text-white rounded-lg border border-[#333333] transition-colors flex items-center gap-1.5 font-semibold text-xs whitespace-nowrap"
                >
                  <Copy className="w-3.5 h-3.5" />
                  {copiedMpWebhook ? 'Copiado!' : 'Copiar URL'}
                </button>
              </div>
              <p className="text-[10px] text-neutral-400 mt-1">
                Configure esta URL no painel Mercado Pago em <strong>Notificações Webhooks</strong> para o evento <strong>Pagamentos (payments)</strong>.
              </p>
            </div>

            {/* Optional Webhook Secret */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="font-semibold text-neutral-200 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-neutral-400" />
                  <span>Segredo de Assinatura do Webhook (Opcional - Validação HMAC)</span>
                </label>
                {mpConfig?.has_webhook_secret && !showMpSecretInput && (
                  <span className="text-[10px] font-mono text-neutral-400 bg-[#151515] px-2 py-0.5 rounded border border-[#282828]">
                    Chave secreta configurada
                  </span>
                )}
              </div>
              {mpConfig?.has_webhook_secret && !showMpSecretInput ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-[#101010] border border-[#282828] rounded-lg px-3 py-2 font-mono text-neutral-400 text-xs">
                    ••••••••••••••••••••••••••••••••
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setShowMpSecretInput(true);
                      setMpWebhookSecret('');
                    }}
                    className="px-3 py-2 bg-[#222222] hover:bg-[#2c2c2c] text-white rounded-lg border border-[#333333] transition-colors font-semibold text-xs whitespace-nowrap"
                  >
                    Alterar Segredo
                  </button>
                </div>
              ) : (
                <input
                  type="text"
                  value={mpWebhookSecret}
                  onChange={(e) => setMpWebhookSecret(e.target.value)}
                  placeholder="Cole aqui o Segredo de Assinatura fornecido pelo Mercado Pago"
                  className="w-full bg-[#101010] border border-[#333333] focus:border-emerald-500 focus:outline-none rounded-lg px-3 py-2 text-white placeholder-neutral-600 font-mono text-xs transition-colors"
                />
              )}
            </div>

            {/* Actions: Save & Test */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-3 border-t border-[#282828]">
              <button
                type="button"
                onClick={handleTestMercadoPago}
                disabled={testingMp || (!mpConfig?.configured && !mpToken)}
                className="px-4 py-2.5 bg-[#202020] hover:bg-[#2a2a2a] disabled:opacity-50 text-white rounded-lg font-bold border border-[#383838] transition-colors flex items-center justify-center gap-2"
              >
                {testingMp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                    <span>Testando Conexão Real com MP...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Testar Conexão com Mercado Pago</span>
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={savingMp}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg font-bold shadow-lg shadow-emerald-950/50 transition-colors flex items-center justify-center gap-2"
              >
                {savingMp ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Salvar Configurações</span>
                  </>
                )}
              </button>
            </div>
          </form>

          {/* Test Result Diagnostic Card */}
          {mpTestResult && (
            <div
              className={`p-4 rounded-xl border text-xs space-y-2 ${
                mpTestResult.success
                  ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-200'
                  : 'bg-red-950/50 border-red-500/40 text-red-200'
              }`}
            >
              <div className="flex items-center gap-2 font-bold">
                {mpTestResult.success ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                )}
                <span>
                  {mpTestResult.success ? 'Conexão Real Estabelecida com Sucesso' : 'Falha na Conexão com Mercado Pago'}
                </span>
                {mpTestResult.status && (
                  <span className="ml-auto font-mono text-[10px] px-2 py-0.5 rounded bg-black/40 border border-white/10">
                    HTTP {mpTestResult.status}
                  </span>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-neutral-300">{mpTestResult.message}</p>
              {mpTestResult.success && mpTestResult.nickname && (
                <div className="pt-2 border-t border-emerald-500/20 grid grid-cols-2 sm:grid-cols-3 gap-2 text-[10px] font-mono text-neutral-400">
                  <div>
                    <span className="block text-neutral-400">Conta:</span>
                    <span className="text-white font-bold">{mpTestResult.nickname}</span>
                  </div>
                  <div>
                    <span className="block text-neutral-400">Site ID:</span>
                    <span className="text-white font-bold">{mpTestResult.site_id || 'MLB'}</span>
                  </div>
                  <div>
                    <span className="block text-neutral-400">User ID:</span>
                    <span className="text-white font-bold">{mpTestResult.user_id}</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tab: WhatsApp Central (Evolution API Global) */}
      {activeTab === 'evolution' && (
        <div className="p-6 rounded-xl bg-[#181818] border border-[#282828] max-w-3xl space-y-6 text-xs shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#282828] pb-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-[#E50914]/10 border border-[#E50914]/30 text-[#E50914]">
                  <MessageSquare className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-black text-white">WhatsApp Central (Evolution API)</h2>
                  <p className="text-neutral-400 mt-0.5">
                    Servidor central para gerenciamento global de instâncias de WhatsApp dos revendedores.
                  </p>
                </div>
              </div>
            </div>

            {evolutionUpdatedAt && (
              <span className="text-[11px] text-neutral-400 font-mono self-start sm:self-auto bg-[#101010] px-2.5 py-1 rounded-md border border-[#282828]">
                Atualizado: {new Date(evolutionUpdatedAt).toLocaleString('pt-BR')}
              </span>
            )}
          </div>

          {/* Security Banner */}
          <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-950/40 to-[#101010] border border-emerald-500/30 text-neutral-300 space-y-1.5">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-xs">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>Isolamento e Segurança Centralizada</span>
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              A <strong>URL Base</strong> e a <strong>Global API Key</strong> configuradas aqui são de acesso exclusivo do servidor backend. Os revendedores <strong>nunca</strong> visualizam estas credenciais nem podem alterá-las: cada revendedor receberá sua instância individual automaticamente vinculada à sua conta.
            </p>
          </div>

          <form onSubmit={handleSaveEvolution} className="space-y-5">
            {/* Base URL */}
            <div>
              <label className="block font-semibold text-neutral-200 mb-1.5 flex items-center justify-between">
                <span>URL Base da Evolution API</span>
                <span className="text-[10px] text-neutral-400">Ex: https://evolution.seudominio.com</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                  <Server className="w-4 h-4" />
                </div>
                <input
                  type="url"
                  required
                  placeholder="https://api.seudominio.com"
                  value={evolutionUrl}
                  onChange={(e) => setEvolutionUrl(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                />
              </div>
              <p className="text-[11px] text-neutral-400 mt-1">
                Sem barra invertida no final. O servidor usará este endereço para provisionar e checar conexões.
              </p>
            </div>

            {/* Global API Key */}
            <div>
              <label className="block font-semibold text-neutral-200 mb-1.5 flex items-center justify-between">
                <span>Global API Key (Chave Mestra da Evolution API)</span>
                {hasEvolutionKey && (
                  <span className="text-[10px] text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Chave gravada no servidor
                  </span>
                )}
              </label>

              {hasEvolutionKey && !showEvolutionKeyInput ? (
                <div className="p-3 bg-[#101010] border border-[#2e2e2e] rounded-lg flex items-center justify-between">
                  <div className="flex items-center gap-2.5">
                    <Key className="w-4 h-4 text-neutral-400" />
                    <span className="font-mono text-neutral-300 font-semibold">{maskedEvolutionKey}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowEvolutionKeyInput(true)}
                    className="px-3 py-1 text-[11px] font-semibold text-neutral-300 hover:text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#383838] rounded-md transition-colors"
                  >
                    Alterar Chave
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-neutral-400">
                      <Key className="w-4 h-4" />
                    </div>
                    <input
                      type="password"
                      placeholder={
                        hasEvolutionKey
                          ? 'Digite a nova chave ou clique em Cancelar para manter a atual'
                          : 'Cole a Global API Key da sua Evolution API'
                      }
                      value={evolutionKey}
                      onChange={(e) => setEvolutionKey(e.target.value)}
                      className="w-full pl-9 pr-3 py-2.5 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono text-xs focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                    />
                  </div>
                  {hasEvolutionKey && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={() => {
                          setEvolutionKey('');
                          setShowEvolutionKeyInput(false);
                        }}
                        className="text-[11px] text-neutral-400 hover:text-white underline"
                      >
                        Cancelar alteração (manter chave atual)
                      </button>
                    </div>
                  )}
                </div>
              )}
              <p className="text-[11px] text-neutral-400 mt-1">
                A Global API Key deve corresponder ao parâmetro AUTHENTICATION_API_KEY configurado no ambiente da Evolution API.
              </p>
            </div>

            {/* Test Result Box */}
            {evolutionTestResult && (
              <div
                className={`p-4 rounded-xl border text-xs flex items-start gap-3 ${
                  evolutionTestResult.success
                    ? 'bg-emerald-950/30 border-emerald-600/50 text-emerald-200'
                    : 'bg-red-950/30 border-red-700/50 text-red-200'
                }`}
              >
                {evolutionTestResult.success ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1 flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">
                      {evolutionTestResult.success ? 'Conexão Bem-Sucedida' : 'Falha na Conexão'}
                    </span>
                    {evolutionTestResult.status && (
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-black/40 border border-white/10">
                        HTTP {evolutionTestResult.status}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-relaxed text-neutral-300">
                    {evolutionTestResult.message}
                  </p>
                  {evolutionTestResult.instance_count !== undefined && (
                    <div className="mt-2 pt-2 border-t border-emerald-500/20 text-[11px] text-emerald-300 flex items-center gap-1.5">
                      <span className="font-semibold">Instâncias ativas detectadas na Evolution API:</span>
                      <span className="font-mono font-bold bg-emerald-900/60 px-2 py-0.5 rounded text-white">
                        {evolutionTestResult.instance_count}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Buttons Row */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#282828]">
              <button
                type="button"
                onClick={handleTestEvolution}
                disabled={testingEvolution || (!evolutionUrl && !hasEvolutionKey)}
                className="px-4 py-2.5 font-bold text-neutral-200 hover:text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#383838] disabled:opacity-50 rounded-lg transition-all flex items-center gap-2 active:scale-95"
              >
                {testingEvolution ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
                    <span>Testando Conectividade...</span>
                  </>
                ) : (
                  <>
                    <Activity className="w-4 h-4 text-emerald-400" />
                    <span>Testar Conexão com Evolution API</span>
                  </>
                )}
              </button>

              <button
                type="submit"
                disabled={savingEvolution || !evolutionUrl}
                className="px-5 py-2.5 font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg shadow-lg shadow-red-950/40 transition-all flex items-center gap-2 active:scale-95"
              >
                {savingEvolution ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Salvando...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Salvar Configurações Centrais</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Tab 2: Settings & PIX */}
      {activeTab === 'settings' && (
        <div className="p-6 rounded-xl bg-[#181818] border border-[#282828] max-w-2xl space-y-5 text-xs shadow-xl">
          <div>
            <h2 className="text-base font-black text-white">Configurações de Pagamento da Licença Vitalícia</h2>
            <p className="text-neutral-400 mt-0.5">
              Defina a chave PIX e os dados bancários onde você receberá o valor único dos revendedores (R$ 99,90 vitalício, sem mensalidade).
            </p>
          </div>

          <form onSubmit={handleSaveSettings} className="space-y-4">
            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                Chave PIX do Administrador
              </label>
              <input
                type="text"
                required
                value={pixKey}
                onChange={(e) => setPixKey(e.target.value)}
                className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
              />
            </div>

            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                Nome do Titular da Chave PIX
              </label>
              <input
                type="text"
                required
                value={pixName}
                onChange={(e) => setPixName(e.target.value)}
                className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
              />
            </div>

            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                Valor da Licença Vitalícia (R$) - Sem Mensalidade
              </label>
              <input
                type="number"
                step="0.01"
                required
                value={price}
                onChange={(e) => setPrice(Number(e.target.value))}
                className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
              />
            </div>

            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                Instruções de Pagamento para os Revendedores
              </label>
              <textarea
                rows={3}
                value={instructions}
                onChange={(e) => setInstructions(e.target.value)}
                className="w-full p-2.5 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] resize-none leading-relaxed"
              />
            </div>

            <button
              type="submit"
              disabled={savingSettings}
              className="px-5 py-2.5 font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg shadow-lg shadow-red-950/40 transition-all active:scale-95"
            >
              {savingSettings ? 'Salvando...' : 'Salvar Dados da Licença'}
            </button>
          </form>
        </div>
      )}

      {/* Tab 3: SQL Script */}
      {activeTab === 'sql' && (
        <div className="p-6 rounded-xl bg-[#181818] border border-[#282828] space-y-4 text-xs shadow-xl">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-white flex items-center gap-2">
                <Database className="w-4 h-4 text-[#ff4d58]" />
                Script de Migração SQL Completo para Supabase (RLS)
              </h2>
              <p className="text-neutral-400 mt-0.5">
                Execute este script no <strong>SQL Editor</strong> do painel do Supabase para criar todas as tabelas, políticas de isolamento RLS e o trigger de 3 dias grátis.
              </p>
            </div>

            <button
              onClick={handleCopySql}
              className="px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-lg shadow-red-950/40 transition-all flex items-center gap-1.5 self-start sm:self-auto active:scale-95"
            >
              <Copy className="w-3.5 h-3.5" />
              <span>{sqlCopied ? 'Copiado para Área de Transferência!' : 'Copiar SQL Completo'}</span>
            </button>
          </div>

          <pre className="p-4 bg-[#101010] border border-[#282828] rounded-xl font-mono text-[11px] text-neutral-300 overflow-x-auto max-h-[500px] leading-relaxed">
            {sqlContent || '-- Carregando script supabase-schema.sql...'}
          </pre>
        </div>
      )}
    </div>
  );
};
