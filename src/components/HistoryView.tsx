import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { MessageLog } from '../types';
import {
  Clock,
  Search,
  Filter,
  RefreshCw,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ShieldCheck,
  Send,
} from 'lucide-react';

export const HistoryView: React.FC = () => {
  const [logs, setLogs] = useState<MessageLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'pending' | 'failed' | 'cancelled'>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<MessageLog | null>(null);

  const loadLogs = async () => {
    try {
      setLoading(true);
      const data = await api.getMessageLogs();
      setLogs(data);
    } catch (err: any) {
      console.error('Error fetching message logs:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs();
  }, []);

  const formatSlotLabel = (slot: string) => {
    switch (slot) {
      case 'day_before':
        return '1 dia antes';
      case 'day_of_morning':
        return 'No dia (Manhã)';
      case 'day_of_night':
        return 'No dia (Noite)';
      case 'day_after':
        return '1 dia depois';
      case 'manual':
        return 'Envio Manual';
      default:
        return slot;
    }
  };

  const filteredLogs = logs.filter((log) => {
    const matchesSearch =
      log.customer_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      log.whatsapp.includes(searchTerm) ||
      log.idempotency_key.toLowerCase().includes(searchTerm.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter !== 'all' && log.status !== statusFilter) return false;
    if (typeFilter !== 'all' && log.message_type !== typeFilter) return false;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">Histórico de Cobranças</h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Registro real de todas as mensagens agendadas, tentativas de disparo e respostas de envio.
          </p>
        </div>

        <button
          onClick={loadLogs}
          className="px-3.5 py-2 text-xs font-semibold text-neutral-300 hover:text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#333333] rounded-lg transition-colors flex items-center gap-1.5 self-start sm:self-auto"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Atualizar Histórico</span>
        </button>
      </div>

      {/* Idempotency Protection Banner */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl p-3.5 flex items-center justify-between text-xs text-neutral-400 shadow-md">
        <div className="flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-[#ff4d58] shrink-0" />
          <span>
            <strong className="text-white">Prevenção de Duplicidade Ativa:</strong> cada mensagem possui uma chave única baseada em cliente, ciclo e slot para impedir envios repetidos.
          </span>
        </div>
        <span className="text-[11px] font-mono text-neutral-500">Idempotency-Key Enforced</span>
      </div>

      {/* Search and Filters */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl p-3 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 text-xs shadow-lg">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Pesquisar por cliente, WhatsApp ou chave..."
            className="w-full pl-9 pr-4 py-2 bg-[#101010] border border-[#282828] rounded-lg text-white placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1 p-1 bg-[#101010] border border-[#282828] rounded-lg overflow-x-auto">
          <button
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              statusFilter === 'all' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Todos ({logs.length})
          </button>
          <button
            onClick={() => setStatusFilter('sent')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              statusFilter === 'sent' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Enviadas ({logs.filter((l) => l.status === 'sent').length})
          </button>
          <button
            onClick={() => setStatusFilter('pending')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              statusFilter === 'pending' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Pendentes ({logs.filter((l) => l.status === 'pending').length})
          </button>
          <button
            onClick={() => setStatusFilter('failed')}
            className={`px-3 py-1.5 rounded-md font-bold whitespace-nowrap transition-colors ${
              statusFilter === 'failed' ? 'bg-[#E50914] text-white shadow-md' : 'text-neutral-400 hover:text-white'
            }`}
          >
            Falhas ({logs.filter((l) => l.status === 'failed').length})
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl overflow-hidden shadow-xl">
        {loading ? (
          <div className="p-12 text-center text-neutral-400 text-xs flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
            <span>Carregando logs de cobrança...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="p-12 text-center text-neutral-400 text-xs space-y-2">
            <Clock className="w-8 h-8 text-neutral-600 mx-auto" />
            <p className="text-white font-medium">Nenhum registro de envio encontrado com os filtros atuais.</p>
            <p className="text-[11px] text-neutral-500">
              Os registros aparecem conforme os disparos automáticos ou manuais forem executados.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-neutral-300">
              <thead className="bg-[#101010] text-neutral-400 uppercase text-[10px] tracking-wider border-b border-[#282828]">
                <tr>
                  <th className="py-3.5 px-4 font-bold">Cliente</th>
                  <th className="py-3.5 px-4 font-bold">WhatsApp</th>
                  <th className="py-3.5 px-4 font-bold">Tipo de Mensagem</th>
                  <th className="py-3.5 px-4 font-bold">Ciclo Venc.</th>
                  <th className="py-3.5 px-4 font-bold">Programado / Tentativa</th>
                  <th className="py-3.5 px-4 font-bold">Situação</th>
                  <th className="py-3.5 px-4 font-bold text-right">Detalhes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#242424]">
                {filteredLogs.map((log) => {
                  return (
                    <tr key={log.id} className="hover:bg-[#202020] transition-colors">
                      <td className="py-3.5 px-4 font-bold text-white">{log.customer_name}</td>
                      <td className="py-3.5 px-4 font-mono text-neutral-300">{log.whatsapp}</td>
                      <td className="py-3.5 px-4">
                        <span className="font-medium text-neutral-300">
                          {formatSlotLabel(log.message_type)}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 font-mono text-neutral-300">
                        {log.cycle_date ? log.cycle_date.split('-').reverse().join('/') : '—'}
                      </td>
                      <td className="py-3.5 px-4 text-neutral-400">
                        <div className="font-mono text-neutral-200">{log.scheduled_for}</div>
                        <div className="text-[10px] text-neutral-500 font-mono">
                          {new Date(log.attempted_at).toLocaleTimeString('pt-BR')}
                        </div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold ${
                            log.status === 'sent'
                              ? 'bg-emerald-950/70 text-emerald-400 border border-emerald-500/30'
                              : log.status === 'pending'
                              ? 'bg-amber-950/70 text-amber-400 border border-amber-500/30'
                              : 'bg-red-950/70 text-red-400 border border-red-500/30'
                          }`}
                        >
                          {log.status === 'sent'
                            ? 'Enviada'
                            : log.status === 'pending'
                            ? 'Pendente'
                            : log.status === 'failed'
                            ? 'Falhou'
                            : 'Cancelada'}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-neutral-200 hover:text-white bg-[#262626] hover:bg-[#333333] border border-[#3e3e3e] rounded transition-colors"
                        >
                          Ver Resposta
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Details Modal */}
      {selectedLog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-4">
          <div className="w-full max-w-lg bg-[#181818] border border-[#2e2e2e] rounded-2xl p-6 shadow-2xl space-y-4 text-xs">
            <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
              <div className="flex items-center gap-2">
                <div className="w-2.5 h-2.5 rounded-full bg-[#E50914]" />
                <h3 className="text-sm font-black text-white">Detalhes do Envio pelo WhatsApp</h3>
              </div>
              <button
                onClick={() => setSelectedLog(null)}
                className="w-7 h-7 rounded-lg bg-[#252525] text-neutral-400 hover:text-white hover:bg-[#333333] flex items-center justify-center transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#101010] p-3 rounded-lg border border-[#282828]">
              <div>
                <span className="text-neutral-500 block">Cliente:</span>
                <span className="font-bold text-white">{selectedLog.customer_name}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">WhatsApp:</span>
                <span className="font-mono text-[#ff4d58] font-bold">{selectedLog.whatsapp}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Tipo:</span>
                <span className="text-neutral-300">{formatSlotLabel(selectedLog.message_type)}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Status:</span>
                <span className="font-bold text-white uppercase">{selectedLog.status}</span>
              </div>
            </div>

            <div>
              <span className="text-neutral-400 font-medium block mb-1">
                Chave Única de Idempotência:
              </span>
              <div className="p-2 bg-[#101010] border border-[#282828] rounded font-mono text-[11px] text-neutral-300 break-all">
                {selectedLog.idempotency_key}
              </div>
            </div>

            {selectedLog.error_details && (
              <div>
                <span className="text-[#ff4d58] font-medium block mb-1">Detalhes do Erro:</span>
                <div className="p-2.5 bg-red-950/40 border border-red-800/60 rounded font-mono text-[11px] text-red-300 break-all">
                  {selectedLog.error_details}
                </div>
              </div>
            )}

            {selectedLog.response_payload && (
              <div>
                <span className="text-neutral-400 font-medium block mb-1">Payload de Retorno da API:</span>
                <pre className="p-2.5 bg-[#101010] border border-[#282828] rounded font-mono text-[11px] text-emerald-400 max-h-40 overflow-y-auto">
                  {selectedLog.response_payload}
                </pre>
              </div>
            )}

            <div className="flex justify-end pt-3 border-t border-[#282828]">
              <button
                onClick={() => setSelectedLog(null)}
                className="px-4 py-1.5 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
