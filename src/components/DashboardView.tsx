import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { DashboardMetrics, Customer } from '../types';
import {
  Users,
  UserCheck,
  AlertCircle,
  XCircle,
  Package,
  Layers,
  MessageSquare,
  PlusCircle,
  Calendar,
  Settings,
  RefreshCw,
  PhoneCall,
  CheckCircle2,
  DollarSign,
  TrendingUp,
} from 'lucide-react';

interface Props {
  onNavigate: (tab: string) => void;
  onOpenCustomerModal?: () => void;
  onOpenPlanModal?: () => void;
  onOpenAppModal?: () => void;
}

export const DashboardView: React.FC<Props> = ({
  onNavigate,
  onOpenCustomerModal,
  onOpenPlanModal,
  onOpenAppModal,
}) => {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [urgentCustomers, setUrgentCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionSuccess, setActionSuccess] = useState('');

  const loadData = async () => {
    try {
      const [metricsData, customersData] = await Promise.all([
        api.getDashboardMetrics(),
        api.getCustomers(),
      ]);
      setMetrics(metricsData);

      // Filter urgent customers: expiring soon or expired
      const urgent = customersData
        .filter((c) => c.status === 'expiring_soon' || c.status === 'expired')
        .slice(0, 6);
      setUrgentCustomers(urgent);
    } catch (err: any) {
      console.error('Error loading dashboard:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRenew = async (id: string) => {
    try {
      const res = await api.renewCustomer(id);
      setActionSuccess(res.message);
      setTimeout(() => setActionSuccess(''), 4000);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao renovar cliente');
    }
  };

  const handleNotifyWhatsApp = async (customer: Customer) => {
    try {
      const res = await api.sendManualWhatsApp({
        customer_id: customer.id,
        template_type: customer.status === 'expired' ? 'day_after' : 'day_of',
      });
      setActionSuccess(`Mensagem enviada com sucesso para ${customer.name}!`);
      setTimeout(() => setActionSuccess(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar mensagem pelo WhatsApp. Verifique as configurações de conexão.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-slate-400 text-sm flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
          <span>Carregando indicadores do painel...</span>
        </div>
      </div>
    );
  }

  const m = metrics || {
    totalCustomers: 0,
    activeCustomers: 0,
    expiringSoonCustomers: 0,
    expiredCustomers: 0,
    totalPlans: 0,
    totalApplications: 0,
    whatsAppConnected: false,
    autoBillingEnabled: false,
    trialDaysLeft: 0,
    trialHoursLeft: 0,
    subscriptionStatus: 'trial' as const,
    monthlyRevenueEstimate: 0,
  };

  return (
    <div className="space-y-6">
      {/* Top Header Row with Refresh and Revenue Highlight */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Painel Principal</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Visão geral da sua revenda IPTV e situação dos clientes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {actionSuccess && (
            <div className="text-xs px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-medium">
              {actionSuccess}
            </div>
          )}
          <button
            onClick={() => {
              setRefreshing(true);
              loadData();
            }}
            disabled={refreshing}
            className="px-3.5 py-2 text-xs font-medium text-slate-300 hover:text-white bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700 rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-blue-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Shortcuts Strip */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl p-4 shadow-md">
        <span className="text-xs font-bold text-neutral-400 uppercase tracking-wider block mb-3">
          Atalhos Rápidos
        </span>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
          <button
            onClick={() => onOpenCustomerModal ? onOpenCustomerModal() : onNavigate('customers')}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] hover:border-[#E50914]/60 border border-[#333333] text-neutral-200 hover:text-white transition-all text-left group"
          >
            <PlusCircle className="w-4 h-4 text-[#E50914] group-hover:scale-110 transition-transform shrink-0" />
            <span className="text-xs font-medium">Cadastrar Cliente</span>
          </button>

          <button
            onClick={() => onOpenPlanModal ? onOpenPlanModal() : onNavigate('plans')}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] hover:border-[#E50914]/60 border border-[#333333] text-neutral-200 hover:text-white transition-all text-left group"
          >
            <Package className="w-4 h-4 text-[#E50914] group-hover:scale-110 transition-transform shrink-0" />
            <span className="text-xs font-medium">Cadastrar Plano</span>
          </button>

          <button
            onClick={() => onOpenAppModal ? onOpenAppModal() : onNavigate('applications')}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] hover:border-[#E50914]/60 border border-[#333333] text-neutral-200 hover:text-white transition-all text-left group"
          >
            <Layers className="w-4 h-4 text-[#E50914] group-hover:scale-110 transition-transform shrink-0" />
            <span className="text-xs font-medium">Cadastrar Aplicativo</span>
          </button>

          <button
            onClick={() => onNavigate('expirations')}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] hover:border-[#E50914]/60 border border-[#333333] text-neutral-200 hover:text-white transition-all text-left group"
          >
            <Calendar className="w-4 h-4 text-[#E50914] group-hover:scale-110 transition-transform shrink-0" />
            <span className="text-xs font-medium">Consultar Vencimentos</span>
          </button>

          <button
            onClick={() => onNavigate('whatsapp')}
            className="flex items-center gap-2.5 p-3 rounded-lg bg-[#222222] hover:bg-[#2a2a2a] hover:border-[#E50914]/60 border border-[#333333] text-neutral-200 hover:text-white transition-all text-left group col-span-2 sm:col-span-1"
          >
            <Settings className="w-4 h-4 text-[#E50914] group-hover:scale-110 transition-transform shrink-0" />
            <span className="text-xs font-medium">Configurar WhatsApp</span>
          </button>
        </div>
      </div>

      {/* 7 Required Metrics Cards Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Clientes */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/40 transition-colors space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Total de Clientes</span>
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/15 flex items-center justify-center text-[#E50914]">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {m.totalCustomers}
          </div>
          <div className="text-[11px] text-neutral-500">Clientes cadastrados no sistema</div>
        </div>

        {/* Clientes Ativos */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/40 transition-colors space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Clientes Ativos</span>
            <div className="w-8 h-8 rounded-lg bg-[#262626] flex items-center justify-center text-white">
              <UserCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {m.activeCustomers}
          </div>
          <div className="text-[11px] text-neutral-500">Planos com pagamento em dia</div>
        </div>

        {/* Próximos do Vencimento */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/40 transition-colors space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Próximos do Vencimento</span>
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/15 flex items-center justify-center text-[#ff4d58]">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#ff4d58] font-mono tabular-nums">
            {m.expiringSoonCustomers}
          </div>
          <div className="text-[11px] text-neutral-500">Vencem hoje ou nos próximos 2 dias</div>
        </div>

        {/* Clientes Vencidos */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#E50914]/40 transition-colors space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Clientes Vencidos</span>
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/25 flex items-center justify-center text-[#ff4d58]">
              <XCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-[#E50914] font-mono tabular-nums">
            {m.expiredCustomers}
          </div>
          <div className="text-[11px] text-neutral-500">Necessitam de cobrança e renovação</div>
        </div>

        {/* Planos Cadastrados */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/40 transition-colors space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Planos Cadastrados</span>
            <div className="w-8 h-8 rounded-lg bg-[#262626] flex items-center justify-center text-white">
              <Package className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {m.totalPlans}
          </div>
          <div className="text-[11px] text-neutral-500">Planos de IPTV configurados</div>
        </div>

        {/* Aplicativos Cadastrados */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/40 transition-colors space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Aplicativos Cadastrados</span>
            <div className="w-8 h-8 rounded-lg bg-[#262626] flex items-center justify-center text-white">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white font-mono tabular-nums">
            {m.totalApplications}
          </div>
          <div className="text-[11px] text-neutral-500">IBO Player, Bob Player, XCIPTV...</div>
        </div>

        {/* Situação Conexão WhatsApp */}
        <div className="p-4 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/40 transition-colors space-y-2 col-span-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-400">Situação do WhatsApp</span>
            <div className="w-8 h-8 rounded-lg bg-[#E50914]/15 flex items-center justify-center text-[#E50914]">
              <MessageSquare className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span
              className={`text-lg font-bold ${
                m.whatsAppConnected ? 'text-white' : 'text-neutral-400'
              }`}
            >
              {m.whatsAppConnected ? 'Conectado (WhatsApp)' : 'Desconectado'}
            </span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded font-mono ${
                m.autoBillingEnabled
                  ? 'bg-[#E50914]/20 text-[#ff4d58] border border-[#E50914]/30'
                  : 'bg-[#222222] text-neutral-400'
              }`}
            >
              {m.autoBillingEnabled ? 'Cobrança Automática Ativa' : 'Cobrança Desativada'}
            </span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-0.5">
            <span>
              {m.whatsAppConnected
                ? 'Pronto para disparar avisos e lembretes automáticos'
                : 'Configure os dados do WhatsApp para enviar cobranças'}
            </span>
            <button
              onClick={() => onNavigate('whatsapp')}
              className="text-[#ff4d58] hover:text-white hover:underline font-bold"
            >
              {m.whatsAppConnected ? 'Ver Regras' : 'Conectar Agora'}
            </button>
          </div>
        </div>
      </div>

      {/* Urgent Expirations Table Preview */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#282828] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Vencimentos que Exigem Atenção</h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Clientes que venceram recentemente ou vencem hoje/amanhã.
            </p>
          </div>
          <button
            onClick={() => onNavigate('expirations')}
            className="text-xs font-bold text-[#ff4d58] hover:text-white hover:underline"
          >
            Ver todos os vencimentos →
          </button>
        </div>

        {urgentCustomers.length === 0 ? (
          <div className="p-8 text-center text-neutral-400 text-xs">
            Nenhum cliente vencido ou próximo do vencimento no momento! Todos em dia. 🎉
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-[#101010] text-neutral-400 uppercase text-[11px] tracking-wider border-b border-[#242424]">
                <tr>
                  <th className="py-3 px-4 font-semibold">Cliente</th>
                  <th className="py-3 px-4 font-semibold">WhatsApp</th>
                  <th className="py-3 px-4 font-semibold">Plano</th>
                  <th className="py-3 px-4 font-semibold">Vencimento</th>
                  <th className="py-3 px-4 font-semibold">Situação</th>
                  <th className="py-3 px-4 font-semibold text-right">Ações Rápidas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {urgentCustomers.map((cust) => {
                  const isExpired = cust.status === 'expired';
                  return (
                    <tr key={cust.id} className="hover:bg-[#202020] transition-colors">
                      <td className="py-3 px-4 font-bold text-white">{cust.name}</td>
                      <td className="py-3 px-4 font-mono text-neutral-300">{cust.whatsapp}</td>
                      <td className="py-3 px-4 text-neutral-300">{cust.plan_name || '—'}</td>
                      <td className="py-3 px-4 font-mono text-neutral-300">
                        {cust.expiration_date.split('-').reverse().join('/')}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            isExpired
                              ? 'bg-[#E50914]/20 text-[#ff4d58] border border-[#E50914]/40'
                              : 'bg-neutral-800 text-neutral-200 border border-neutral-700'
                          }`}
                        >
                          {isExpired ? 'Vencido' : 'Próximo do vencimento'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => handleNotifyWhatsApp(cust)}
                            title="Cobrar via WhatsApp"
                            className="px-2.5 py-1 text-[11px] font-semibold text-neutral-200 bg-[#262626] hover:bg-[#333333] border border-neutral-700 rounded transition-colors flex items-center gap-1"
                          >
                            <PhoneCall className="w-3 h-3 text-[#E50914]" />
                            <span>Cobrar</span>
                          </button>
                          <button
                            onClick={() => handleRenew(cust.id)}
                            title="Renovar Plano (+30 dias)"
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded transition-colors flex items-center gap-1 shadow-sm shadow-[#E50914]/30"
                          >
                            <RefreshCw className="w-3 h-3" />
                            <span>Renovar</span>
                          </button>
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
    </div>
  );
};
