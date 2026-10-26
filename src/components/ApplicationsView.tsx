import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { Application } from '../types';
import {
  Layers,
  Plus,
  Edit2,
  Trash2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';

interface Props {
  initialOpenModal?: boolean;
  onCloseInitialModal?: () => void;
}

export const ApplicationsView: React.FC<Props> = ({ initialOpenModal, onCloseInitialModal }) => {
  const [apps, setApps] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingApp, setEditingApp] = useState<Application | null>(null);
  const [deletingAppId, setDeletingAppId] = useState<string | null>(null);

  // Form
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'active' | 'inactive'>('active');
  const [formError, setFormError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  const [error, setError] = useState<string | null>(null);

  const loadApps = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await api.getApplications();
      setApps(data);
    } catch (err: any) {
      console.error('Error fetching applications:', err);
      setError('Não foi possível carregar os aplicativos. Verifique sua conexão e tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadApps();
  }, []);

  useEffect(() => {
    if (initialOpenModal) {
      openCreateModal();
      if (onCloseInitialModal) onCloseInitialModal();
    }
  }, [initialOpenModal]);

  const openCreateModal = () => {
    setEditingApp(null);
    setName('');
    setDescription('');
    setNotes('');
    setStatus('active');
    setFormError('');
    setIsModalOpen(true);
  };

  const openEditModal = (appItem: Application) => {
    setEditingApp(appItem);
    setName(appItem.name);
    setDescription(appItem.description || '');
    setNotes(appItem.notes || '');
    setStatus(appItem.status);
    setFormError('');
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!name.trim()) {
      setFormError('O nome do aplicativo é obrigatório.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingApp) {
        await api.updateApplication(editingApp.id, {
          name,
          description,
          notes,
          status,
        });
        setSuccessMsg('Aplicativo atualizado com sucesso!');
      } else {
        await api.createApplication({
          name,
          description,
          notes,
          status,
        });
        setSuccessMsg('Aplicativo cadastrado com sucesso!');
      }
      setIsModalOpen(false);
      setTimeout(() => setSuccessMsg(''), 4000);
      loadApps();
    } catch (err: any) {
      setFormError(err.message || 'Falha ao salvar aplicativo.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteApplication(id);
      setDeletingAppId(null);
      setSuccessMsg('Aplicativo excluído com sucesso.');
      setTimeout(() => setSuccessMsg(''), 4000);
      loadApps();
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir aplicativo.');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Cadastro de Aplicativos</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Gerencie os aplicativos IPTV utilizados por seus clientes (ex: IBO Player, Bob Player, XCIPTV).
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
            <span>Novo Aplicativo</span>
          </button>
        </div>
      </div>

      {/* Applications Grid */}
      {loading ? (
        <div className="p-12 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
          <span>Carregando aplicativos...</span>
        </div>
      ) : error ? (
        <div className="p-8 text-center text-xs bg-[#181818] border border-red-500/30 rounded-xl space-y-3">
          <AlertTriangle className="w-8 h-8 text-red-500 mx-auto" />
          <p className="text-red-300 font-medium">{error}</p>
          <button
            onClick={loadApps}
            className="px-4 py-2 text-xs font-semibold text-white bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-lg inline-flex items-center gap-1.5 transition-colors active:scale-95"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Tentar Novamente</span>
          </button>
        </div>
      ) : apps.length === 0 ? (
        <div className="p-12 text-center text-neutral-400 text-xs bg-[#181818] border border-[#282828] rounded-xl space-y-3">
          <Layers className="w-8 h-8 text-neutral-600 mx-auto" />
          <p>Nenhum aplicativo cadastrado ainda.</p>
          <button
            onClick={openCreateModal}
            className="px-4 py-2 text-xs font-semibold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg inline-flex items-center gap-1.5 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Cadastrar Primeiro Aplicativo</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {apps.map((a) => (
            <div
              key={a.id}
              className="p-5 rounded-xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/50 transition-all flex flex-col justify-between space-y-4 shadow-lg group hover:-translate-y-0.5"
            >
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                      a.status === 'active'
                        ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                        : 'bg-[#222222] text-neutral-400 border border-[#333333]'
                    }`}
                  >
                    {a.status === 'active' ? 'Ativo' : 'Inativo'}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(a)}
                      title="Editar Aplicativo"
                      className="p-1.5 text-neutral-400 hover:text-white rounded hover:bg-[#282828] transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingAppId(a.id)}
                      title="Excluir Aplicativo"
                      className="p-1.5 text-neutral-400 hover:text-[#ff4d58] rounded hover:bg-red-950/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                <h3 className="text-base font-bold text-white group-hover:text-red-400 transition-colors">{a.name}</h3>
                {a.description && (
                  <p className="text-xs text-neutral-400 mt-1">{a.description}</p>
                )}
              </div>

              {a.notes && (
                <div className="pt-3 border-t border-[#282828] text-[11px] text-neutral-400">
                  <span className="font-bold text-neutral-300 block mb-0.5 uppercase text-[10px] tracking-wider text-neutral-500">Instruções / Notas:</span>
                  <p className="italic line-clamp-2">{a.notes}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* App Modal Form */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-md bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#E50914]" />
                <h2 className="text-base font-black text-white">
                  {editingApp ? 'Editar Aplicativo' : 'Novo Aplicativo IPTV'}
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
                  Nome do Aplicativo <span className="text-[#ff4d58]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: IBO Player Pro"
                  className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                />
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

              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Descrição (opcional)
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Ex: Compatível com Smart TVs LG e Samsung."
                  className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white resize-none placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-300 mb-1">
                  Observações / Dados técnicos (opcional)
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ex: Requer ativação do MAC Address no portal do desenvolvedor."
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
                  {isSubmitting ? 'Salvando...' : editingApp ? 'Atualizar Aplicativo' : 'Cadastrar Aplicativo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deletingAppId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-sm bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center gap-3 text-[#ff4d58]">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="text-base font-black text-white">Confirmar Exclusão</h3>
            </div>
            <p className="text-xs text-neutral-300 leading-relaxed">
              Deseja realmente excluir este aplicativo? O vínculo com clientes existentes será removido sem afetar seus cadastros.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setDeletingAppId(null)}
                className="px-3.5 py-2 text-xs font-medium text-neutral-300 hover:text-white bg-[#252525] hover:bg-[#303030] rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deletingAppId)}
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
