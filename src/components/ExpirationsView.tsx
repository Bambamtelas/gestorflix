import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Customer } from '../types';
import {
  Calendar,
  Search,
  Filter,
  RefreshCw,
  PhoneCall,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowUpDown,
  Send,
} from 'lucide-react';

export const ExpirationsView: React.FC = () => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [periodFilter, setPeriodFilter] = useState<'all' | 'today' | 'next3' | 'expired' | 'regularized'>('all');
  const [successMsg, setSuccessMsg] = useState('');

  // Quick WhatsApp notify modal
  const [notifyCustomer, setNotifyCustomer] = useState<Customer | null>(null);
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);
  const [templateChoice, setTemplateChoice] = useState<'day_before' | 'day_of' | 'day_after'>('day_of');

  const loadData = async () => {
    try {
      setLoading(true);
      const data = await api.getCustomers();
      setCustomers(data);
    } catch (err: any) {
      console.error('Error fetching customers for expirations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRenew = async (id: string) => {
    try {
      const res = await api.renewCustomer(id);
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(''), 4000);
      loadData();
    } catch (err: any) {
      alert(err.message || 'Erro ao renovar plano');
    }
  };

  const handleSendWhatsApp = async () => {
    if (!notifyCustomer) return;
    setSendingWhatsapp(true);
    try {
      await api.sendManualWhatsApp({
        customer_id: notifyCustomer.id,
        template_type: templateChoice,
      });
      setSuccessMsg(`Cobrança enviada com sucesso para ${notifyCustomer.name}!`);
      setNotifyCustomer(null);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar mensagem pelo WhatsApp. Verifique suas configurações de conexão.');
    } finally {
      setSendingWhatsapp(false);
    }
  };

  // Helper to calculate expiration state tag
  const getExpirationState = (expDateStr: string) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const parts = expDateStr.split('-');
    const expDate = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));

    const diffMs = expDate.getTime() - today.getTime();
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return {
        label: 'Vencido',
        category: 'expired',
        days: diffDays,
        badgeStyle: 'bg-red-500/10 text-red-400 border border-red-500/30',
      };
    } else if (diffDays === 0) {
      return {
        label: 'Vence Hoje',
        category: 'today',
        days: 0,
        badgeStyle: 'bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold',
      };
    } else if (diffDays <= 2) {
      return {
        label: `Vence em ${diffDays}d`,
        category: 'next3',
        days: diffDays,
        badgeStyle: 'bg-amber-500/10 text-amber-400 border border-amber-500/30',
      };
    } else {
      return {
        label: 'Regularizado',
        category: 'regularized',
        days: diffDays,
        badgeStyle: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30',
      };
    }
  };

  // Filter list
  const filteredCustomers = customers
    .map((cust) => ({
      ...cust,
      stateInfo: getExpirationState(cust.expiration_date),
    }))
    .filter((cust) => {
      const matchesSearch =
        cust.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        cust.whatsapp.includes(searchTerm);
      if (!matchesSearch) return false;

      if (periodFilter === 'all') return true;
      if (periodFilter === 'today') return cust.stateInfo.category === 'today';
      if (periodFilter === 'next3') return cust.stateInfo.category === 'next3' || cust.stateInfo.category === 'today';
      if (periodFilter === 'expired') return cust.stateInfo.category === 'expired';
      if (periodFilter === 'regularized') return cust.stateInfo.category === 'regularized';
      return true;
    })
    .sort((a, b) => a.expiration_date.localeCompare(b.expiration_date));

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Controle de Vencimentos</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Acompanhe a situação detalhada dos vencimentos e execute renovações ou cobranças rápidas.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {successMsg && (
            <div className="text-xs px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-medium">
              {successMsg}
            </div>
          )}
          <button
            onClick={loadData}
            className="px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#333333] rounded-lg transition-colors flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Atualizar Lista</span>
          </button>
        </div>
      </div>

      {/* Filter and Period Row */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-lg">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por cliente ou WhatsApp..."
            className="w-full pl-9 pr-4 py-2 bg-[#101010] border border-[#282828] rounded-lg text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
          />
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#101010] border border-[#282828] rounded-lg overflow-x-auto text-xs">
          <button
            onClick={() => setPeriodFilter('all')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              periodFilter === 'all' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Todos ({customers.length})
          </button>
          <button
            onClick={() => setPeriodFilter('today')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              periodFilter === 'today' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Vence Hoje
          </button>
          <button
            onClick={() => setPeriodFilter('next3')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              periodFilter === 'next3' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Próximos 2-3 Dias
          </button>
          <button
            onClick={() => setPeriodFilter('expired')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              periodFilter === 'expired' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Vencidos
          </button>
          <button
            onClick={() => setPeriodFilter('regularized')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              periodFilter === 'regularized' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Em Dia / Regularizados
          </button>
        </div>
      </div>

      {/* Expirations Table */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
            <span>Calculando vencimentos...</span>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-neutral-500 text-xs">
            Nenhum cliente para o filtro de vencimento selecionado.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-[#101010] text-neutral-400 uppercase text-[10px] tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3.5 px-4 font-bold">Cliente</th>
                  <th className="py-3.5 px-4 font-bold">WhatsApp</th>
                  <th className="py-3.5 px-4 font-bold">Plano</th>
                  <th className="py-3.5 px-4 font-bold">Valor</th>
                  <th className="py-3.5 px-4 font-bold">Data Vencimento</th>
                  <th className="py-3.5 px-4 font-bold">Situação do Vencimento</th>
                  <th className="py-3.5 px-4 font-bold text-right">Ação Imediata</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredCustomers.map((c) => {
                  return (
                    <tr key={c.id} className="hover:bg-[#202020] transition-colors">
                      <td className="py-3.5 px-4">
                        <span className="font-bold text-white block">{c.name}</span>
                        {c.application_name && (
                          <span className="text-[10px] text-neutral-400 block mt-0.5">
                            App: {c.application_name}
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-neutral-300">{c.whatsapp}</td>

                      <td className="py-3.5 px-4 text-neutral-300 font-medium">{c.plan_name || 'Sem plano'}</td>

                      <td className="py-3.5 px-4 font-mono text-white font-bold">
                        {c.plan_price !== undefined
                          ? `R$ ${c.plan_price.toFixed(2).replace('.', ',')}`
                          : 'R$ 0,00'}
                      </td>

                      <td className="py-3.5 px-4 font-mono text-neutral-300">
                        {c.expiration_date.split('-').reverse().join('/')}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${c.stateInfo.badgeStyle}`}>
                          {c.stateInfo.label}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setNotifyCustomer(c);
                              setTemplateChoice(c.stateInfo.category === 'expired' ? 'day_after' : 'day_of');
                            }}
                            title="Cobrar via WhatsApp"
                            className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded shadow transition-colors flex items-center gap-1 active:scale-95"
                          >
                            <PhoneCall className="w-3 h-3" />
                            <span>Cobrar</span>
                          </button>

                          <button
                            onClick={() => handleRenew(c.id)}
                            title="Renovar (+duração do plano)"
                            className="px-2.5 py-1 text-[11px] font-semibold text-neutral-300 hover:text-white bg-[#262626] hover:bg-[#333333] border border-[#3a3a3a] rounded transition-colors flex items-center gap-1"
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

      {/* Manual Notification Modal */}
      {notifyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#E50914]" />
                <h3 className="text-sm font-black text-white">Enviar Mensagem pelo WhatsApp</h3>
              </div>
              <button
                onClick={() => setNotifyCustomer(null)}
                className="w-7 h-7 rounded-lg bg-[#252525] text-neutral-400 hover:text-white hover:bg-[#333333] flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="bg-[#101010] p-3 rounded-lg border border-[#282828] space-y-1">
              <div className="text-neutral-400">Cliente: <strong className="text-white">{notifyCustomer.name}</strong></div>
              <div className="text-neutral-400">Número: <strong className="text-[#ff4d58] font-mono">{notifyCustomer.whatsapp}</strong></div>
              <div className="text-neutral-400">Vencimento: <strong className="text-white font-mono">{notifyCustomer.expiration_date.split('-').reverse().join('/')}</strong></div>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Selecione o Modelo de Mensagem:
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#101010] border border-[#282828] cursor-pointer hover:border-[#E50914]/50 transition-colors">
                  <input
                    type="radio"
                    name="exp_tpl"
                    value="day_before"
                    checked={templateChoice === 'day_before'}
                    onChange={() => setTemplateChoice('day_before')}
                    className="accent-[#E50914]"
                  />
                  <span className="text-neutral-200">1. Lembrete de Vencimento (1 dia antes)</span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#101010] border border-[#282828] cursor-pointer hover:border-[#E50914]/50 transition-colors">
                  <input
                    type="radio"
                    name="exp_tpl"
                    value="day_of"
                    checked={templateChoice === 'day_of'}
                    onChange={() => setTemplateChoice('day_of')}
                    className="accent-[#E50914]"
                  />
                  <span className="text-neutral-200">2. Lembrete no Dia do Vencimento</span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#101010] border border-[#282828] cursor-pointer hover:border-[#E50914]/50 transition-colors">
                  <input
                    type="radio"
                    name="exp_tpl"
                    value="day_after"
                    checked={templateChoice === 'day_after'}
                    onChange={() => setTemplateChoice('day_after')}
                    className="accent-[#E50914]"
                  />
                  <span className="text-neutral-200">3. Aviso de Vencimento Atrasado (1 dia depois)</span>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[#282828]">
              <button
                onClick={() => setNotifyCustomer(null)}
                className="px-3.5 py-2 font-medium text-neutral-300 hover:text-white bg-[#252525] hover:bg-[#303030] rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendWhatsApp}
                disabled={sendingWhatsapp}
                className="px-4 py-2 font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg shadow-lg shadow-red-950/40 transition-all flex items-center gap-1.5 active:scale-95"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{sendingWhatsapp ? 'Enviando...' : 'Confirmar Envio'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
