import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Customer, Plan, Application } from '../types';
import {
  Users,
  Search,
  Filter,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  PhoneCall,
  Calendar,
  Layers,
  Package,
  AlertTriangle,
  CheckCircle2,
  X,
} from 'lucide-react';

interface Props {
  initialOpenModal?: boolean;
  onCloseInitialModal?: () => void;
}

export const CustomersView: React.FC<Props> = ({ initialOpenModal, onCloseInitialModal }) => {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'expiring_soon' | 'expired'>('all');

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deletingCustomerId, setDeletingCustomerId] = useState<string | null>(null);

  // Form State
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [notes, setNotes] = useState('');
  const [planId, setPlanId] = useState('');
  const [appId, setAppId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [expirationDate, setExpirationDate] = useState('');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  // Manual WhatsApp Notification Modal
  const [whatsappNotifyCustomer, setWhatsappNotifyCustomer] = useState<Customer | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<'day_before' | 'day_of' | 'day_after'>('day_of');
  const [sendingWhatsapp, setSendingWhatsapp] = useState(false);

  const loadAll = async () => {
    try {
      setLoading(true);
      setError(null);
      const [custList, planList, appList] = await Promise.all([
        api.getCustomers(),
        api.getPlans(),
        api.getApplications(),
      ]);
      setCustomers(custList);
      setPlans(planList);
      setApps(appList);
    } catch (err: any) {
      console.error('Error fetching customers:', err);
      setError('Não foi possível carregar os clientes. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (initialOpenModal) {
      openCreateModal();
      if (onCloseInitialModal) onCloseInitialModal();
    }
  }, [initialOpenModal]);

  const openCreateModal = () => {
    setEditingCustomer(null);
    setName('');
    setEmail('');
    setWhatsapp('');
    setNotes('');
    setPlanId(plans[0]?.id || '');
    setAppId(apps[0]?.id || '');

    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    setStartDate(todayStr);
    setExpirationDate(in30Days);
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (cust: Customer) => {
    setEditingCustomer(cust);
    setName(cust.name);
    setEmail(cust.email || '');
    setWhatsapp(cust.whatsapp);
    setNotes(cust.notes || '');
    setPlanId(cust.plan_id || '');
    setAppId(cust.application_id || '');
    setStartDate(cust.start_date || '');
    setExpirationDate(cust.expiration_date || '');
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim() || !whatsapp.trim() || !expirationDate) {
      setFormError('Preencha os campos obrigatórios (Nome, WhatsApp e Data de Vencimento).');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingCustomer) {
        await api.updateCustomer(editingCustomer.id, {
          name,
          email,
          whatsapp,
          notes,
          plan_id: planId || undefined,
          application_id: appId || undefined,
          start_date: startDate,
          expiration_date: expirationDate,
        });
        setSuccessMsg('Cliente atualizado com sucesso!');
      } else {
        await api.createCustomer({
          name,
          email,
          whatsapp,
          notes,
          plan_id: planId || undefined,
          application_id: appId || undefined,
          start_date: startDate,
          expiration_date: expirationDate,
        });
        setSuccessMsg('Cliente cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 4000);
      loadAll();
    } catch (err: any) {
      setFormError(err.message || 'Falha ao salvar cliente. Verifique se sua assinatura está ativa.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteCustomer(id);
      setDeletingCustomerId(null);
      setSuccessMsg('Cliente excluído com sucesso.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir cliente.');
    }
  };

  const handleRenew = async (id: string) => {
    try {
      const res = await api.renewCustomer(id);
      setSuccessMsg(res.message);
      setTimeout(() => setSuccessMsg(''), 4000);
      loadAll();
    } catch (err: any) {
      alert(err.message || 'Erro ao renovar cliente.');
    }
  };

  const handleSendManualWhatsApp = async () => {
    if (!whatsappNotifyCustomer) return;
    setSendingWhatsapp(true);
    try {
      const res = await api.sendManualWhatsApp({
        customer_id: whatsappNotifyCustomer.id,
        template_type: selectedTemplate,
      });
      setSuccessMsg(res.message || `Mensagem aceita pela Evolution API para processamento!`);
      setWhatsappNotifyCustomer(null);
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err: any) {
      alert(err.message || 'Erro ao enviar mensagem pelo WhatsApp. Verifique as configurações.');
    } finally {
      setSendingWhatsapp(false);
    }
  };

  // Filter customers
  const filteredCustomers = customers.filter((cust) => {
    const matchesSearch =
      cust.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      cust.whatsapp.includes(searchTerm) ||
      (cust.email && cust.email.toLowerCase().includes(searchTerm.toLowerCase()));

    if (!matchesSearch) return false;

    if (statusFilter === 'all') return true;
    return cust.status === statusFilter;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Gerenciamento de Clientes</h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Cadastre, edite e acompanhe os vencimentos e planos dos seus clientes.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {successMsg && (
            <div className="text-xs px-3 py-1.5 rounded-lg bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 font-medium">
              {successMsg}
            </div>
          )}
          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-md shadow-[#E50914]/30 transition-all flex items-center gap-1.5"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Cliente</span>
          </button>
        </div>
      </div>

      {/* Search and Filters Bar */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 shadow-md">
        {/* Search Input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por nome ou WhatsApp..."
            className="w-full pl-9 pr-4 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs placeholder-neutral-500 focus:outline-none focus:border-[#E50914] transition-colors"
          />
        </div>

        {/* Filter Tabs */}
        <div className="flex items-center gap-1 p-1 bg-[#101010] border border-[#262626] rounded-lg overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              statusFilter === 'all'
                ? 'bg-[#E50914] text-white font-bold shadow-sm shadow-[#E50914]/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Todos ({customers.length})
          </button>
          <button
            onClick={() => setStatusFilter('active')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              statusFilter === 'active'
                ? 'bg-[#E50914] text-white font-bold shadow-sm shadow-[#E50914]/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Ativos ({customers.filter((c) => c.status === 'active').length})
          </button>
          <button
            onClick={() => setStatusFilter('expiring_soon')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              statusFilter === 'expiring_soon'
                ? 'bg-[#E50914] text-white font-bold shadow-sm shadow-[#E50914]/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Próx. Vencimento ({customers.filter((c) => c.status === 'expiring_soon').length})
          </button>
          <button
            onClick={() => setStatusFilter('expired')}
            className={`px-3 py-1.5 text-xs font-medium rounded-md whitespace-nowrap transition-colors ${
              statusFilter === 'expired'
                ? 'bg-[#E50914] text-white font-bold shadow-sm shadow-[#E50914]/30'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Vencidos ({customers.filter((c) => c.status === 'expired').length})
          </button>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl overflow-hidden shadow-lg">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
            <span>Carregando clientes...</span>
          </div>
        ) : error ? (
          <div className="p-8 text-center text-xs space-y-3">
            <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
            <p className="text-red-300 font-medium">{error}</p>
            <button
              onClick={loadAll}
              className="px-4 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg inline-flex items-center gap-1.5 transition-colors active:scale-95"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Tentar Novamente</span>
            </button>
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-3">
            <Users className="w-8 h-8 text-slate-600 mx-auto" />
            <p>Nenhum cliente encontrado com os filtros selecionados.</p>
            <button
              onClick={openCreateModal}
              className="px-4 py-2 text-xs font-medium text-white hover:bg-[#b81d24] bg-[#E50914] rounded-lg inline-flex items-center gap-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Cadastrar Primeiro Cliente</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-[#101010] text-neutral-400 uppercase text-[11px] tracking-wider border-b border-[#242424]">
                <tr>
                  <th className="py-3.5 px-4 font-semibold">Cliente</th>
                  <th className="py-3.5 px-4 font-semibold">WhatsApp</th>
                  <th className="py-3.5 px-4 font-semibold">Plano</th>
                  <th className="py-3.5 px-4 font-semibold">Aplicativo</th>
                  <th className="py-3.5 px-4 font-semibold">Vencimento</th>
                  <th className="py-3.5 px-4 font-semibold">Situação</th>
                  <th className="py-3.5 px-4 font-semibold text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredCustomers.map((cust) => {
                  return (
                    <tr key={cust.id} className="hover:bg-[#202020] transition-colors">
                      {/* Name & Email */}
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-white">{cust.name}</div>
                        {cust.email && <div className="text-[11px] text-neutral-400">{cust.email}</div>}
                        {cust.notes && (
                          <div className="text-[10px] text-neutral-500 italic mt-0.5 line-clamp-1">
                            {cust.notes}
                          </div>
                        )}
                      </td>

                      {/* WhatsApp */}
                      <td className="py-3.5 px-4 font-mono text-neutral-200">
                        {cust.whatsapp}
                      </td>

                      {/* Plan */}
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-white">{cust.plan_name || 'Sem plano'}</span>
                        {cust.plan_price !== undefined && (
                          <div className="text-[11px] text-[#ff4d58] font-mono">
                            R$ {cust.plan_price.toFixed(2).replace('.', ',')}
                          </div>
                        )}
                      </td>

                      {/* Application */}
                      <td className="py-3.5 px-4 text-neutral-300">
                        {cust.application_name || '—'}
                      </td>

                      {/* Expiration */}
                      <td className="py-3.5 px-4 font-mono text-neutral-200">
                        {cust.expiration_date.split('-').reverse().join('/')}
                      </td>

                      {/* Status */}
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            cust.status === 'active'
                              ? 'bg-neutral-800 text-white border border-neutral-700'
                              : cust.status === 'expiring_soon'
                              ? 'bg-[#2a1718] text-[#ff6b75] border border-[#E50914]/40'
                              : 'bg-[#E50914]/20 text-[#ff4d58] border border-[#E50914]/50'
                          }`}
                        >
                          {cust.status === 'active'
                            ? 'Ativo'
                            : cust.status === 'expiring_soon'
                            ? 'Próx. Vencimento'
                            : 'Vencido'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => {
                              setWhatsappNotifyCustomer(cust);
                              setSelectedTemplate(cust.status === 'expired' ? 'day_after' : 'day_of');
                            }}
                            title="Cobrar via WhatsApp"
                            className="p-1.5 text-neutral-200 hover:text-white bg-[#222222] hover:bg-[#2e2e2e] rounded border border-neutral-700 transition-colors"
                          >
                            <PhoneCall className="w-3.5 h-3.5 text-[#E50914]" />
                          </button>
                          <button
                            onClick={() => handleRenew(cust.id)}
                            title="Renovar Plano (+30 dias)"
                            className="p-1.5 text-white bg-[#E50914] hover:bg-[#b81d24] rounded transition-colors shadow-sm shadow-[#E50914]/30"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => openEditModal(cust)}
                            title="Editar Dados"
                            className="p-1.5 text-neutral-300 hover:text-white bg-[#222222] hover:bg-[#2e2e2e] rounded border border-neutral-700 transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingCustomerId(cust.id)}
                            title="Excluir Cliente"
                            className="p-1.5 text-neutral-400 hover:text-[#ff4d58] bg-[#222222] hover:bg-[#2e2e2e] rounded border border-neutral-700 transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
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

      {/* Customer Form Modal */}
      {/* Customer Form Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="relative w-full max-w-lg bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-2 border-b border-[#282828]">
              <h2 className="text-lg font-bold text-white">
                {editingCustomer ? 'Editar Cliente' : 'Novo Cliente IPTV'}
              </h2>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-[#262626] hover:bg-[#333333] text-neutral-400 hover:text-white flex items-center justify-center text-xs"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-[#2d1112] border border-[#E50914]/50 text-[#ff737d] text-xs">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {/* Nome */}
              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Nome do Cliente <span className="text-[#E50914]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Marcos Silva"
                  className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914]"
                />
              </div>

              {/* WhatsApp & Email Row */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    WhatsApp (com DDD) <span className="text-[#E50914]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    placeholder="Ex: 5511987654321"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914]"
                  />
                  <span className="text-[10px] text-neutral-500 mt-0.5 block">
                    Armazenado normalizado (DDI + DDD + Número)
                  </span>
                </div>

                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    E-mail (opcional)
                  </label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="cliente@email.com"
                    className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914]"
                  />
                </div>
              </div>

              {/* Plan & App selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    Plano Associado
                  </label>
                  <select
                    value={planId}
                    onChange={(e) => setPlanId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914]"
                  >
                    <option value="">Selecione um plano...</option>
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} - R$ {p.price.toFixed(2)} ({p.duration_days}d){p.panel ? ` · ${p.panel}` : ''}
                      </option>
                    ))}
                  </select>
                  {planId && plans.find((p) => p.id === planId) && (
                    <div className="mt-1.5 p-2 rounded bg-[#0d0d0d] border border-[#262626] text-[10px] space-y-0.5">
                      {plans.find((p) => p.id === planId)?.panel && (
                        <div className="text-neutral-300">
                          <span className="text-neutral-500 font-bold uppercase">Painel:</span>{' '}
                          <span className="text-white font-medium">{plans.find((p) => p.id === planId)?.panel}</span>
                        </div>
                      )}
                      {plans.find((p) => p.id === planId)?.server_dns && (plans.find((p) => p.id === planId)?.server_dns?.length || 0) > 0 && (
                        <div className="text-neutral-300">
                          <span className="text-neutral-500 font-bold uppercase">Servidor/DNS:</span>{' '}
                          <span className="text-[#ff737d] font-mono">{plans.find((p) => p.id === planId)?.server_dns?.join(' | ')}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    Aplicativo IPTV
                  </label>
                  <select
                    value={appId}
                    onChange={(e) => setAppId(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914]"
                  >
                    <option value="">Selecione um aplicativo...</option>
                    {apps.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Start Date & Expiration Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    Data de Início
                  </label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    Data de Vencimento <span className="text-[#E50914]">*</span>
                  </label>
                  <input
                    type="date"
                    required
                    value={expirationDate}
                    onChange={(e) => setExpirationDate(e.target.value)}
                    className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914]"
                  />
                </div>
              </div>

              {/* Observações */}
              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Observações (opcional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Smart TV Samsung da sala, código MAC: 00:1A:79..."
                  className="w-full px-3 py-2 bg-[#121212] border border-[#333333] rounded-lg text-white text-xs focus:outline-none focus:border-[#E50914] resize-none"
                />
              </div>

              {/* Action Buttons */}
              <div className="pt-2 flex items-center justify-end gap-3 border-t border-[#282828]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-[#262626] hover:bg-[#333333] rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-5 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg transition-colors shadow-md shadow-[#E50914]/30"
                >
                  {isSubmitting ? 'Salvando...' : editingCustomer ? 'Atualizar Cliente' : 'Cadastrar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingCustomerId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#E50914]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-bold text-white">Confirmar Exclusão</h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Tem certeza que deseja excluir este cliente? Essa ação não poderá ser desfeita e removerá todo o histórico de cobranças associado.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingCustomerId(null)}
                className="px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-[#262626] hover:bg-[#333333] rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deletingCustomerId)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-md shadow-[#E50914]/30"
              >
                Sim, Excluir
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Quick Manual WhatsApp Send Modal */}
      {whatsappNotifyCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-2 border-b border-[#282828]">
              <div className="flex items-center gap-2">
                <PhoneCall className="w-4 h-4 text-[#E50914]" />
                <h3 className="text-sm font-bold text-white">Disparo Manual via WhatsApp</h3>
              </div>
              <button
                onClick={() => setWhatsappNotifyCustomer(null)}
                className="w-6 h-6 rounded bg-[#262626] text-neutral-400 hover:text-white flex items-center justify-center"
              >
                ✕
              </button>
            </div>

            <div>
              <span className="text-neutral-400">Destinatário:</span>
              <p className="font-semibold text-white mt-0.5">
                {whatsappNotifyCustomer.name} ({whatsappNotifyCustomer.whatsapp})
              </p>
            </div>

            <div>
              <label className="block text-neutral-300 font-medium mb-1.5">
                Escolha o Modelo de Mensagem:
              </label>
              <div className="space-y-2">
                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#121212] border border-[#2e2e2e] cursor-pointer hover:border-[#E50914]/50">
                  <input
                    type="radio"
                    name="tpl"
                    value="day_before"
                    checked={selectedTemplate === 'day_before'}
                    onChange={() => setSelectedTemplate('day_before')}
                    className="accent-[#E50914]"
                  />
                  <span>1. Lembrete de Vencimento (1 dia antes)</span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#121212] border border-[#2e2e2e] cursor-pointer hover:border-[#E50914]/50">
                  <input
                    type="radio"
                    name="tpl"
                    value="day_of"
                    checked={selectedTemplate === 'day_of'}
                    onChange={() => setSelectedTemplate('day_of')}
                    className="accent-[#E50914]"
                  />
                  <span>2. Lembrete no Dia do Vencimento</span>
                </label>

                <label className="flex items-center gap-2.5 p-2.5 rounded-lg bg-[#121212] border border-[#2e2e2e] cursor-pointer hover:border-[#E50914]/50">
                  <input
                    type="radio"
                    name="tpl"
                    value="day_after"
                    checked={selectedTemplate === 'day_after'}
                    onChange={() => setSelectedTemplate('day_after')}
                    className="accent-[#E50914]"
                  />
                  <span>3. Aviso de Vencimento Atrasado (1 dia depois)</span>
                </label>
              </div>
            </div>

            <p className="text-[11px] text-neutral-400 italic">
              As variáveis `{'{nome}'}`, `{'{plano}'}`, `{'{valor}'}` e `{'{vencimento}'}` serão substituídas automaticamente antes do envio pelo WhatsApp.
            </p>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-[#282828]">
              <button
                onClick={() => setWhatsappNotifyCustomer(null)}
                className="px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-[#262626] hover:bg-[#333333] rounded-lg"
              >
                Cancelar
              </button>
              <button
                onClick={handleSendManualWhatsApp}
                disabled={sendingWhatsapp}
                className="px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-md shadow-[#E50914]/30"
              >
                <PhoneCall className="w-3.5 h-3.5" />
                <span>{sendingWhatsapp ? 'Enviando...' : 'Enviar Agora'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
