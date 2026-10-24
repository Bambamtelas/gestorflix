import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Plan } from '../types';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  AlertTriangle,
  Server,
  Globe,
} from 'lucide-react';

interface Props {
  initialOpenModal?: boolean;
  onCloseInitialModal?: () => void;
}

export const PlansView: React.FC<Props> = ({ initialOpenModal, onCloseInitialModal }) => {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPlan, setEditingPlan] = useState<Plan | null>(null);
  const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [price, setPrice] = useState<number | string>(30);
  const [durationDays, setDurationDays] = useState<number | string>(30);
  const [description, setDescription] = useState('');
  const [panel, setPanel] = useState('');
  const [serverDnsList, setServerDnsList] = useState<string[]>(['']);
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const addDnsField = () => {
    setServerDnsList((prev) => [...prev, '']);
  };

  const removeDnsField = (index: number) => {
    setServerDnsList((prev) => {
      if (prev.length <= 1) return [''];
      return prev.filter((_, i) => i !== index);
    });
  };

  const updateDnsField = (index: number, val: string) => {
    setServerDnsList((prev) => {
      const next = [...prev];
      next[index] = val;
      return next;
    });
  };

  const loadPlans = async () => {
    try {
      setLoading(true);
      const data = await api.getPlans();
      setPlans(data);
    } catch (err: any) {
      console.error('Error fetching plans:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPlans();
  }, []);

  useEffect(() => {
    if (initialOpenModal) {
      openCreateModal();
      if (onCloseInitialModal) onCloseInitialModal();
    }
  }, [initialOpenModal]);

  const openCreateModal = () => {
    setEditingPlan(null);
    setName('');
    setPrice(35);
    setDurationDays(30);
    setDescription('');
    setPanel('');
    setServerDnsList(['']);
    setStatus('active');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (p: Plan) => {
    setEditingPlan(p);
    setName(p.name);
    setPrice(p.price);
    setDurationDays(p.duration_days);
    setDescription(p.description || '');
    setPanel(p.panel || '');
    setServerDnsList(p.server_dns && p.server_dns.length > 0 ? [...p.server_dns] : ['']);
    setStatus(p.status);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('O nome do plano é obrigatório.');
      return;
    }

    const cleanedDns = serverDnsList.map((d) => d.trim()).filter((d) => d.length > 0);

    setIsSubmitting(true);
    try {
      if (editingPlan) {
        await api.updatePlan(editingPlan.id, {
          name,
          price: Number(price),
          duration_days: Number(durationDays),
          description,
          panel: panel.trim(),
          server_dns: cleanedDns,
          status,
        });
        setSuccessMsg('Plano atualizado com sucesso!');
      } else {
        await api.createPlan({
          name,
          price: Number(price),
          duration_days: Number(durationDays),
          description,
          panel: panel.trim(),
          server_dns: cleanedDns,
          status,
        });
        setSuccessMsg('Plano cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 4000);
      loadPlans();
    } catch (err: any) {
      setFormError(err.message || 'Falha ao salvar plano.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deletePlan(id);
      setDeletingPlanId(null);
      setSuccessMsg('Plano excluído com sucesso.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadPlans();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir plano.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Cadastro de Planos</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Configure seus planos de IPTV com valores e durações personalizadas.
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
            className="px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-lg shadow-red-950/30 transition-all flex items-center gap-1.5 active:scale-95"
          >
            <Plus className="w-4 h-4" />
            <span>Novo Plano</span>
          </button>
        </div>
      </div>

      {/* Plans Grid */}
      {loading ? (
        <div className="p-12 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
          <span>Carregando planos...</span>
        </div>
      ) : plans.length === 0 ? (
        <div className="p-12 text-center text-neutral-400 text-xs bg-[#181818] border border-[#282828] rounded-xl space-y-3">
          <Package className="w-8 h-8 text-neutral-600 mx-auto" />
          <p>Nenhum plano cadastrado ainda.</p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white hover:text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Criar Primeiro Plano</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {plans.map((p) => (
            <div
              key={p.id}
              className="p-5 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/50 transition-all flex flex-col justify-between space-y-4 shadow-lg group hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      p.status === 'active'
                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                        : 'bg-[#222222] text-neutral-400 border border-[#333333]'
                    }`}
                  >
                    {p.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(p)}
                      title="Editar Plano"
                      className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-[#282828] transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingPlanId(p.id)}
                      title="Excluir Plano"
                      className="p-1.5 text-neutral-400 hover:text-[#ff4d58] rounded hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-red-400 transition-colors">{p.name}</h3>
                {p.description && (
                  <p className="text-xs text-neutral-400 mt-1 line-clamp-2">{p.description}</p>
                )}

                {/* Panel & DNS Tags */}
                {(p.panel || (p.server_dns && p.server_dns.length > 0)) && (
                  <div className="mt-3 pt-2.5 border-t border-[#252525] space-y-1.5">
                    {p.panel && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Server className="w-3 h-3 text-[#ff4d58] shrink-0" />
                        <span className="text-[10px] uppercase font-bold text-neutral-500 tracking-wider">Painel:</span>
                        <span className="px-2 py-0.5 rounded bg-[#202020] border border-[#303030] text-neutral-200 font-semibold text-[11px]">
                          {p.panel}
                        </span>
                      </div>
                    )}
                    {p.server_dns && p.server_dns.length > 0 && (
                      <div className="space-y-1 text-xs">
                        <div className="flex items-center gap-1.5 text-neutral-400 text-[10px] uppercase font-bold tracking-wider">
                          <Globe className="w-3 h-3 text-neutral-400 shrink-0" />
                          <span>Servidor / DNS ({p.server_dns.length}):</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {p.server_dns.map((dns, dIdx) => (
                            <span
                              key={dIdx}
                              className="px-2 py-0.5 rounded bg-[#121212] border border-[#2c2c2c] text-[#ff737d] font-mono text-[10px] break-all"
                              title={dns}
                            >
                              {dns}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <div className="pt-3 border-t border-[#282828] flex items-baseline justify-between">
                <div>
                  <span className="text-[11px] text-neutral-500 block uppercase font-bold tracking-wider">Valor</span>
                  <span className="text-xl font-black text-white font-mono tabular-nums">
                    R$ {p.price.toFixed(2).replace('.', ',')}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-[11px] text-neutral-500 block uppercase font-bold tracking-wider">Validade</span>
                  <span className="text-xs font-mono font-bold text-[#ff4d58]">
                    {p.duration_days} dias
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Plan Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4 text-xs max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#E50914]" />
                <h2 className="text-base font-black text-white">
                  {editingPlan ? 'Editar Plano' : 'Novo Plano IPTV'}
                </h2>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-7 h-7 rounded-lg bg-[#252525] text-neutral-400 hover:text-white hover:bg-[#333333] flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            {formError && (
              <div className="p-3 rounded-lg bg-red-950/80 border border-red-800 text-red-300">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3.5">
              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Nome do Plano <span className="text-[#ff4d58]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Mensal 1 Tela Full HD"
                  className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    Valor (R$) <span className="text-[#ff4d58]">*</span>
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    placeholder="30.00"
                    className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                  />
                </div>

                <div>
                  <label className="block font-medium text-neutral-300 mb-1">
                    Duração (em dias) <span className="text-[#ff4d58]">*</span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={durationDays}
                    onChange={(e) => setDurationDays(e.target.value)}
                    placeholder="30"
                    className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Situação
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                >
                  <option value="active">Ativo</option>
                  <option value="inactive">Inativo</option>
                </select>
              </div>

              {/* Painel Block */}
              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Painel (opcional)
                </label>
                <input
                  type="text"
                  value={panel}
                  onChange={(e) => setPanel(e.target.value)}
                  placeholder="Ex: Koffice, Sigma, Xtream, P2P, Office..."
                  className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                />
              </div>

              {/* Servidor / DNS Block with Multiple DNS Support */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="block font-medium text-neutral-300">
                    Servidor / DNS (opcional)
                  </label>
                  <button
                    type="button"
                    onClick={addDnsField}
                    className="text-xs font-semibold text-[#ff4d58] hover:text-[#ff737d] flex items-center gap-1 hover:underline active:scale-95 transition-transform"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Adicionar outra DNS</span>
                  </button>
                </div>

                <div className="space-y-2 max-h-44 overflow-y-auto pr-1">
                  {serverDnsList.map((dns, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <div className="relative flex-1">
                        <span className="absolute left-2.5 top-2.5 text-[9px] font-mono font-bold text-neutral-500 uppercase">
                          DNS {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={dns}
                          onChange={(e) => updateDnsField(idx, e.target.value)}
                          placeholder="Ex: http://dns1.servidor.com:80"
                          className="w-full pl-14 pr-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono text-xs placeholder-neutral-600 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                        />
                      </div>
                      {serverDnsList.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removeDnsField(idx)}
                          title="Remover esta DNS"
                          className="p-2 text-neutral-400 hover:text-[#ff4d58] bg-[#1a1a1a] hover:bg-[#252525] rounded-lg transition-colors shrink-0"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <p className="text-[11px] text-neutral-500">
                  Clique em "+ Adicionar outra DNS" para cadastrar múltiplos servidores DNS para este plano.
                </p>
              </div>

              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Descrição (opcional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Canais abertos e fechados, filmes sob demanda e séries atualizadas."
                  className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white resize-none placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                />
              </div>

              <div className="pt-3 flex items-center justify-end gap-3 border-t border-[#282828]">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-2 font-medium text-neutral-300 hover:text-white bg-[#252525] hover:bg-[#303030] rounded-lg transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg shadow-lg shadow-red-950/40 transition-all active:scale-95"
                >
                  {isSubmitting ? 'Salvando...' : editingPlan ? 'Atualizar Plano' : 'Cadastrar Plano'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingPlanId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#ff4d58]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-black text-white">Confirmar Exclusão</h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Deseja realmente excluir este plano? Clientes atualmente vinculados a ele manterão suas datas de vencimento atuais.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingPlanId(null)}
                className="px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-[#252525] hover:bg-[#303030] rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deletingPlanId)}
                className="px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-lg shadow-red-950/40 transition-all"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
