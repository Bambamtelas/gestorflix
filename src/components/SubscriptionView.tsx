import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  CreditCard,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Copy,
  RefreshCw,
  ShieldCheck,
  Send,
  Sparkles,
  Zap,
} from 'lucide-react';

export const SubscriptionView: React.FC = () => {
  const { user, refreshSubscription } = useAuth();
  const [subInfo, setSubInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [proofText, setProofText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string>('');

  const loadInfo = async () => {
    try {
      setLoading(true);
      const data = await api.getSubscriptionInfo();
      setSubInfo(data);
    } catch (err: any) {
      console.error('Error fetching subscription info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const handleCopyPix = () => {
    if (subInfo?.payment_info?.pix_key) {
      navigator.clipboard.writeText(subInfo.payment_info.pix_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!proofText.trim()) return;

    setSubmitting(true);
    setFeedback('');
    try {
      const res = await api.submitPaymentRequest(proofText);
      setFeedback(res.message);
      setProofText('');
      await loadInfo();
      await refreshSubscription();
    } catch (err: any) {
      setFeedback('Erro: ' + (err.message || 'Falha ao enviar comprovante.'));
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-slate-400 text-xs flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
          <span>Carregando dados da licença...</span>
        </div>
      </div>
    );
  }

  const sub = subInfo?.subscription || {};
  const pay = subInfo?.payment_info || {
    pix_key: 'chavepixedvandyemis@gmail.com',
    pix_name: 'Administração GestorFlix',
    monthly_price: 99.9,
    instructions: 'Realize o pagamento de R$ 99,90 via PIX (valor único vitalício, sem mensalidade) e informe a autenticação para liberação imediata.',
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return { label: 'Licença Vitalícia Ativa', style: 'bg-emerald-950/70 text-emerald-400 border-emerald-500/30' };
      case 'trial':
        return { label: 'Em Período de Teste Gratuito (3 Dias)', style: 'bg-[#E50914]/20 text-[#ff4d58] border-[#E50914]/40' };
      case 'pending_payment':
        return { label: 'Pagamento em Análise', style: 'bg-amber-950/70 text-amber-400 border-amber-500/30' };
      case 'expired':
        return { label: 'Teste Expirado (Acesso Bloqueado)', style: 'bg-red-950/80 text-red-400 border-red-500/40' };
      case 'suspended':
        return { label: 'Conta Suspensa', style: 'bg-red-950/90 text-red-300 border-red-600/50' };
      default:
        return { label: status, style: 'bg-[#222222] text-neutral-400' };
    }
  };

  const badge = getStatusBadge(sub.status);

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Top Header */}
      <div>
        <h1 className="text-2xl font-black text-white tracking-tight">Licença do Sistema</h1>
        <p className="text-xs text-neutral-400 mt-0.5">
          Consulte o status da sua conta, período de teste e instruções de ativação da licença vitalícia.
        </p>
      </div>

      {/* Subscription Status Card */}
      <div className="p-6 rounded-xl bg-[#181818] border border-[#282828] space-y-4 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#282828]">
          <div>
            <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider text-[10px]">Situação Atual:</span>
            <div className="flex items-center gap-2 mt-1">
              <span className={`px-2.5 py-1 rounded-lg text-xs font-black border ${badge.style}`}>
                {badge.label}
              </span>
            </div>
          </div>

          <div className="text-left sm:text-right">
            <span className="text-xs font-semibold text-neutral-400 block uppercase tracking-wider text-[10px]">Tempo Restante de Teste:</span>
            <span className="text-xl font-black text-white font-mono tabular-nums">
              {sub.status === 'active'
                ? 'Vitalício (Sem Expiração)'
                : sub.daysLeft > 0
                ? `${sub.daysLeft} dia(s)`
                : `${sub.hoursLeft} hora(s)`}
            </span>
          </div>
        </div>

        {/* Server Block Enforcement Notice if expired */}
        {sub.status === 'expired' && (
          <div className="p-4 rounded-xl bg-red-950/80 border border-[#E50914]/50 space-y-2 text-xs">
            <div className="flex items-center gap-2 text-[#ff4d58] font-black">
              <AlertTriangle className="w-4 h-4" />
              <span>Funcionalidades de Gerenciamento Bloqueadas no Servidor</span>
            </div>
            <p className="text-neutral-200 leading-relaxed">
              O período de 3 dias de teste gratuito terminou. Você ainda pode visualizar seus clientes e dados cadastrados, mas as ações de cadastro, edição, exclusão e os disparos automáticos estão pausados até a ativação da licença vitalícia por <strong className="text-white">R$ 99,90 (valor único, sem mensalidade)</strong>.
            </p>
          </div>
        )}

        {sub.status === 'trial' && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#211415] to-[#161616] border border-[#E50914]/40 space-y-1 text-xs">
            <div className="flex items-center gap-2 text-[#ff4d58] font-black tracking-wider animate-pulse">
              <Sparkles className="w-4 h-4 text-[#E50914]" />
              <span>EXPERIMENTE GRÁTIS POR 3 DIAS!</span>
            </div>
            <p className="text-neutral-300 leading-relaxed">
              Você pode cadastrar clientes, planos, aplicativos e testar a automação pelo WhatsApp normalmente durante os 3 dias.
            </p>
          </div>
        )}
      </div>

      {/* Payment Instructions & PIX Card */}
      <div className="p-6 rounded-xl bg-[#181818] border border-[#282828] space-y-5 text-xs shadow-xl">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#282828]">
          <div className="w-9 h-9 rounded-lg bg-[#E50914]/15 flex items-center justify-center text-[#E50914]">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-base font-black text-white">Ativação da Licença Vitalícia via PIX</h2>
            <span className="text-[#ff4d58] font-bold text-[11px] flex items-center gap-1 mt-0.5">
              <Zap className="w-3.5 h-3.5" />
              Valor: R$ 99,90 · Valor Único · Sem Mensalidade · Acesso Vitalício
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Key and Details */}
          <div className="space-y-3.5 bg-[#101010] p-4 rounded-xl border border-[#282828]">
            <div>
              <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block">Chave PIX (E-mail):</span>
              <div className="flex items-center justify-between gap-2 mt-1 p-2 bg-[#181818] rounded-lg border border-[#2e2e2e]">
                <span className="font-mono text-white font-bold text-xs truncate">
                  {pay.pix_key}
                </span>
                <button
                  onClick={handleCopyPix}
                  className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded flex items-center gap-1 transition-colors shrink-0 active:scale-95"
                >
                  <Copy className="w-3 h-3" />
                  <span>{copied ? 'Copiado!' : 'Copiar'}</span>
                </button>
              </div>
            </div>

            <div>
              <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block">Titular:</span>
              <span className="font-bold text-white">{pay.pix_name}</span>
            </div>

            <div>
              <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block">Valor:</span>
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-black text-white font-mono">
                  R$ 99,90
                </span>
                <span className="text-xs text-[#ff4d58] font-bold">
                  (Valor único, sem mensalidade, vitalício)
                </span>
              </div>
            </div>

            <div>
              <span className="text-neutral-500 text-[10px] font-bold uppercase tracking-wider block">Instruções:</span>
              <p className="text-neutral-300 text-[11px] leading-relaxed mt-0.5">
                Faça o PIX de R$ 99,90 e informe o código da transferência ao lado para ativação definitiva da sua licença.
              </p>
            </div>
          </div>

          {/* Submit Proof Form */}
          <div className="bg-[#101010] p-4 rounded-xl border border-[#282828] space-y-3 flex flex-col justify-between">
            <div>
              <span className="font-black text-white text-sm block mb-1">
                Informar Pagamento / Enviar Comprovante
              </span>
              <p className="text-neutral-400 text-[11px] leading-relaxed mb-3">
                Após realizar o PIX de R$ 99,90, informe abaixo a chave de autenticação para liberação imediata.
              </p>

              {feedback && (
                <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[11px] mb-3">
                  {feedback}
                </div>
              )}

              <form onSubmit={handleSubmitProof} className="space-y-3">
                <div>
                  <label className="block text-neutral-300 font-medium mb-1">
                    Código de Autenticação / Link do Comprovante
                  </label>
                  <textarea
                    rows={3}
                    required
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    placeholder="Ex: PIX E12345678... ou comprovante de R$ 99,90 enviado no WhatsApp."
                    className="w-full p-2.5 bg-[#181818] border border-[#2e2e2e] rounded-lg text-white font-mono text-xs placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !proofText.trim()}
                  className="w-full py-2.5 font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-red-950/40 active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Enviando...' : 'Confirmar Pagamento de R$ 99,90'}</span>
                </button>
              </form>
            </div>

            <p className="text-[10px] text-neutral-500 italic mt-2">
              * Licença vitalícia: pague uma única vez e use sem cobranças mensais.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
