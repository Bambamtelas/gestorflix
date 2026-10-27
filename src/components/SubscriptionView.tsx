import React, { useState, useEffect, useRef } from 'react';
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
  QrCode,
  Check,
  ExternalLink,
} from 'lucide-react';

export const SubscriptionView: React.FC = () => {
  const { user, refreshSubscription } = useAuth();
  const [subInfo, setSubInfo] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [copiedPixCode, setCopiedPixCode] = useState(false);
  const [proofText, setProofText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<string>('');

  // Mercado Pago Pix State
  const [pixPayment, setPixPayment] = useState<any>(null);
  const [loadingPix, setLoadingPix] = useState(false);
  const [pixError, setPixError] = useState<string | null>(null);
  const [pixApproved, setPixApproved] = useState(false);

  const pollingRef = useRef<any>(null);

  const loadInfo = async () => {
    try {
      setLoading(true);
      const data = await api.getSubscriptionInfo();
      setSubInfo(data);

      // Carrega pagamento pendente se houver
      if (data?.mercadopago?.pending_payment) {
        setPixPayment(data.mercadopago.pending_payment);
      }
    } catch (err: any) {
      console.error('Error fetching subscription info:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInfo();
  }, []);

  // Polling de status do Pix a cada 3 segundos enquanto o pagamento estiver pendente
  useEffect(() => {
    if (!pixPayment || pixPayment.status !== 'pending' || pixApproved) {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
      return;
    }

    const checkStatus = async () => {
      try {
        const res = await api.getPaymentStatus(pixPayment.id || pixPayment.mercado_pago_payment_id);
        if (res.success && res.payment) {
          if (res.payment.is_approved || res.payment.status === 'approved') {
            setPixApproved(true);
            setPixPayment((prev: any) => ({ ...prev, status: 'approved' }));
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
            await refreshSubscription();
            await loadInfo();
          } else if (res.payment.status === 'cancelled' || res.payment.status === 'rejected') {
            setPixPayment((prev: any) => ({ ...prev, status: res.payment.status }));
            if (pollingRef.current) {
              clearInterval(pollingRef.current);
              pollingRef.current = null;
            }
          }
        }
      } catch (err) {
        // Polling silencioso
      }
    };

    pollingRef.current = setInterval(checkStatus, 3000);

    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, [pixPayment?.id, pixPayment?.status, pixApproved]);

  const handleCreatePix = async () => {
    setLoadingPix(true);
    setPixError(null);
    try {
      const res = await api.createPixPayment();
      if (res.success && res.payment) {
        setPixPayment(res.payment);
        setPixApproved(false);
      } else {
        setPixError('Não foi possível gerar a cobrança Pix no momento.');
      }
    } catch (err: any) {
      setPixError(err.message || 'Falha ao conectar ao serviço de pagamentos Mercado Pago.');
    } finally {
      setLoadingPix(false);
    }
  };

  const handleCopyPixCopiaECola = () => {
    if (pixPayment?.qr_code) {
      navigator.clipboard.writeText(pixPayment.qr_code);
      setCopiedPixCode(true);
      setTimeout(() => setCopiedPixCode(false), 3000);
    }
  };

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
          <RefreshCw className="w-4 h-4 animate-spin text-[#E50914]" />
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
  const isMpAvailable = subInfo?.mercadopago?.available !== false;
  const isLifetime = Boolean(sub.isLifetime || sub.notes === 'vitalicio' || (sub.status === 'active' && new Date(sub.current_period_end || 0).getFullYear() >= 2090));

  const getStatusBadge = (status: string) => {
    if (isLifetime || status === 'active') {
      return { label: 'Licença Vitalícia Ativa', style: 'bg-emerald-950/70 text-emerald-400 border-emerald-500/30' };
    }
    switch (status) {
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
          Consulte o status da sua conta, período de teste e ativação da licença vitalícia com Pix Mercado Pago.
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
            <span className="text-xs font-semibold text-neutral-400 block uppercase tracking-wider text-[10px]">
              {isLifetime ? 'Validade da Licença:' : 'Tempo Restante de Teste:'}
            </span>
            <span className="text-xl font-black text-white font-mono tabular-nums">
              {isLifetime
                ? 'Vitalício (Sem Expiração)'
                : sub.daysLeft > 0
                ? `${sub.daysLeft} dia(s)`
                : `${sub.hoursLeft} hora(s)`}
            </span>
          </div>
        </div>

        {/* Server Block Enforcement Notice if expired */}
        {sub.status === 'expired' && !isLifetime && (
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

        {sub.status === 'trial' && !isLifetime && (
          <div className="p-4 rounded-xl bg-gradient-to-r from-[#211415] to-[#161616] border border-[#E50914]/40 space-y-1 text-xs">
            <div className="flex items-center gap-2 text-[#ff4d58] font-black tracking-wider animate-pulse">
              <Sparkles className="w-4 h-4 text-[#E50914]" />
              <span>EXPERIMENTE GRÁTIS POR 3 DIAS!</span>
            </div>
            <p className="text-neutral-300 leading-relaxed">
              Você pode cadastrar clientes, planos, aplicativos e testar a automação pelo WhatsApp normalmente durante os 3 dias. Adquira sua licença vitalícia antecipadamente abaixo para nunca perder o acesso.
            </p>
          </div>
        )}

        {isLifetime && (
          <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 space-y-1.5 text-xs">
            <div className="flex items-center gap-2 text-emerald-400 font-black text-sm">
              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              <span>Sua Licença Vitalícia está 100% Ativa e Confirmada!</span>
            </div>
            <p className="text-neutral-300 leading-relaxed text-[11px]">
              Obrigado por confiar no Gestor FLIX. Seu acesso é permanente, sem mensalidades futuras e com todas as atualizações e automações liberadas.
            </p>
          </div>
        )}
      </div>

      {/* SEÇÃO PRINCIPAL: COMPRA DA LICENÇA VITALÍCIA VIA MERCADO PAGO PIX */}
      {!isLifetime && (
        <div className="p-6 rounded-xl bg-gradient-to-b from-[#1c1c1c] to-[#141414] border border-[#333333] space-y-6 text-xs shadow-2xl">
          {/* Header Oferta */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#282828]">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 shadow-inner">
                <Zap className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-lg font-black text-white">Licença Vitalícia Gestor FLIX</h2>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-emerald-950 text-emerald-400 border border-emerald-500/30">
                    OFERTA OFICIAL
                  </span>
                </div>
                <p className="text-neutral-400 text-xs mt-0.5">
                  Pagamento único de R$ 99,90 via Pix oficial com liberação automática instantânea.
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right bg-[#101010] px-4 py-2.5 rounded-xl border border-[#282828]">
              <span className="text-[10px] uppercase font-bold text-neutral-400 block tracking-wider">Preço Fixo Único</span>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-black text-white font-mono">R$ 99,90</span>
                <span className="text-[10px] text-emerald-400 font-bold">/ Vitalício</span>
              </div>
            </div>
          </div>

          {/* Destaques Comerciais */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3.5 rounded-lg bg-[#111111] border border-[#222222] space-y-1">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                Sem Mensalidades
              </span>
              <p className="text-[11px] text-neutral-400">Pague uma única vez e nunca mais se preocupe com renovação ou cobranças recorrentes.</p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#111111] border border-[#222222] space-y-1">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <Zap className="w-4 h-4 text-emerald-400 shrink-0" />
                Liberação Automática
              </span>
              <p className="text-[11px] text-neutral-400">Após o pagamento no app do seu banco, o sistema reconhece em segundos sem intervenção manual.</p>
            </div>
            <div className="p-3.5 rounded-lg bg-[#111111] border border-[#222222] space-y-1">
              <span className="font-bold text-white flex items-center gap-1.5 text-xs">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                Mercado Pago Oficial
              </span>
              <p className="text-[11px] text-neutral-400">Transação processada com a segurança e garantia da infraestrutura oficial do Mercado Pago.</p>
            </div>
          </div>

          {/* Erro ao gerar Pix */}
          {pixError && (
            <div className="p-4 rounded-xl bg-red-950/60 border border-red-500/40 text-red-200 flex items-center gap-2 text-xs">
              <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
              <span>{pixError}</span>
            </div>
          )}

          {/* Sucesso instantâneo caso aprovado */}
          {pixApproved && (
            <div className="p-6 rounded-xl bg-emerald-950/70 border border-emerald-500/50 text-emerald-200 text-center space-y-2 animate-bounce">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h3 className="text-base font-black text-white">Pagamento Confirmado com Sucesso!</h3>
              <p className="text-xs text-neutral-300">
                Sua Licença Vitalícia foi ativada automaticamente no Gestor FLIX.
              </p>
            </div>
          )}

          {/* Estado 1: Botão para Iniciar Compra se não houver Pix pendente */}
          {!pixPayment && !pixApproved && (
            <div className="text-center py-4 bg-[#111111] rounded-xl border border-[#262626] p-6 space-y-4">
              <div className="max-w-md mx-auto space-y-1.5">
                <h3 className="text-sm font-bold text-white">Pronto para ativar seu acesso vitalício?</h3>
                <p className="text-neutral-400 text-xs">
                  Clique no botão abaixo para gerar o QR Code Pix no valor de R$ 99,90 e liberar sua conta instantaneamente.
                </p>
              </div>

              <button
                onClick={handleCreatePix}
                disabled={loadingPix}
                className="px-8 py-3.5 bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 text-white font-black text-sm rounded-xl shadow-xl shadow-red-950/50 hover:shadow-red-900/60 transition-all flex items-center justify-center gap-2 mx-auto active:scale-95"
              >
                {loadingPix ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin text-white" />
                    <span>Gerando Cobrança Pix Oficial...</span>
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4 fill-white" />
                    <span>Comprar Licença Vitalícia (R$ 99,90 via Pix)</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Estado 2: Exibição do Pix Aberto / Aguardando Pagamento */}
          {pixPayment && pixPayment.status === 'pending' && !pixApproved && (
            <div className="p-6 rounded-xl bg-[#101010] border border-[#2e2e2e] space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[#222222]">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                  <Clock className="w-4 h-4 text-amber-400 animate-spin" />
                  <span>Aguardando Pagamento do Pix...</span>
                </div>
                <span className="text-[11px] font-mono text-neutral-400">
                  {pixPayment.expires_at
                    ? `Expira em: ${new Date(pixPayment.expires_at).toLocaleTimeString('pt-BR')}`
                    : 'Válido por 30 minutos'}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
                {/* QR Code Container */}
                <div className="flex flex-col items-center justify-center p-5 bg-[#181818] rounded-xl border border-[#282828] text-center space-y-3">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                    Escaneie no App do seu Banco
                  </span>

                  <div className="p-3 bg-white rounded-xl shadow-md">
                    {pixPayment.qr_code_base64 ? (
                      <img
                        src={`data:image/png;base64,${pixPayment.qr_code_base64}`}
                        alt="QR Code Pix Mercado Pago"
                        className="w-48 h-48 object-contain"
                      />
                    ) : pixPayment.qr_code ? (
                      <img
                        src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(
                          pixPayment.qr_code
                        )}`}
                        alt="QR Code Pix"
                        className="w-48 h-48 object-contain"
                      />
                    ) : (
                      <div className="w-48 h-48 flex items-center justify-center bg-neutral-100 text-neutral-400">
                        <QrCode className="w-12 h-12" />
                      </div>
                    )}
                  </div>

                  <span className="text-[11px] font-mono text-emerald-400 font-bold">
                    R$ 99,90 (Mercado Pago)
                  </span>
                </div>

                {/* Copia e Cola & Status Detection */}
                <div className="space-y-4">
                  <div>
                    <label className="block text-[11px] font-bold text-neutral-300 mb-1">
                      Código Pix Copia e Cola
                    </label>
                    <div className="relative">
                      <textarea
                        readOnly
                        rows={4}
                        value={pixPayment.qr_code || ''}
                        className="w-full p-2.5 bg-[#141414] border border-[#2a2a2a] rounded-lg text-neutral-300 font-mono text-[11px] focus:outline-none select-all resize-none"
                      />
                    </div>
                    <button
                      onClick={handleCopyPixCopiaECola}
                      className="mt-2 w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-md active:scale-95"
                    >
                      {copiedPixCode ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Código Pix Copiado com Sucesso!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar Código Pix Copia e Cola</span>
                        </>
                      )}
                    </button>
                  </div>

                  {/* Automatic confirmation notice */}
                  <div className="p-3.5 rounded-lg bg-[#141414] border border-amber-500/20 text-neutral-300 space-y-1.5">
                    <div className="flex items-center gap-2 text-amber-400 font-bold text-xs">
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-amber-400" />
                      <span>Confirmação Automática Ativa</span>
                    </div>
                    <p className="text-[11px] text-neutral-400 leading-relaxed">
                      Assim que você pagar no app do seu banco, o Mercado Pago avisará o sistema e sua licença vitalícia será liberada automaticamente em poucos segundos nesta mesma tela.
                    </p>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    <button
                      type="button"
                      onClick={handleCreatePix}
                      disabled={loadingPix}
                      className="text-[10px] text-neutral-400 hover:text-white underline"
                    >
                      Gerar nova cobrança Pix
                    </button>
                    {pixPayment.ticket_url && (
                      <a
                        href={pixPayment.ticket_url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[10px] text-neutral-400 hover:text-emerald-400 flex items-center gap-1 underline"
                      >
                        <span>Abrir fatura Mercado Pago</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Alternativa Manual / Contato Direto */}
      <div className="p-6 rounded-xl bg-[#181818] border border-[#282828] space-y-5 text-xs shadow-xl opacity-90">
        <div className="flex items-center gap-2.5 pb-3 border-b border-[#282828]">
          <div className="w-9 h-9 rounded-lg bg-[#282828] flex items-center justify-center text-neutral-400">
            <CreditCard className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-neutral-200">Alternativa: Pagamento Manual Direto via PIX</h2>
            <span className="text-neutral-400 text-[11px] block mt-0.5">
              Caso prefira enviar um comprovante manualmente para validação do administrador.
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
                  className="px-2.5 py-1 text-[11px] font-bold text-white bg-[#2a2a2a] hover:bg-[#383838] rounded flex items-center gap-1 transition-colors shrink-0 active:scale-95"
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
                <span className="text-xl font-black text-white font-mono">
                  R$ 99,90
                </span>
                <span className="text-xs text-neutral-400 font-bold">
                  (Valor único vitalício)
                </span>
              </div>
            </div>
          </div>

          {/* Submit Proof Form */}
          <div className="bg-[#101010] p-4 rounded-xl border border-[#282828] space-y-3 flex flex-col justify-between">
            <div>
              <span className="font-black text-white text-xs block mb-1">
                Informar Pagamento / Enviar Comprovante
              </span>
              <p className="text-neutral-400 text-[11px] leading-relaxed mb-3">
                Após realizar o PIX manual de R$ 99,90, informe a chave de autenticação para o administrador liberar sua conta.
              </p>

              {feedback && (
                <div className="p-2.5 rounded-lg bg-emerald-950/70 border border-emerald-500/40 text-emerald-300 text-[11px] mb-3">
                  {feedback}
                </div>
              )}

              <form onSubmit={handleSubmitProof} className="space-y-3">
                <div>
                  <textarea
                    rows={2}
                    required
                    value={proofText}
                    onChange={(e) => setProofText(e.target.value)}
                    placeholder="Ex: PIX E12345678... ou comprovante enviado no WhatsApp."
                    className="w-full p-2 bg-[#181818] border border-[#2e2e2e] rounded-lg text-white font-mono text-xs placeholder-neutral-500 focus:outline-none focus:border-[#E50914] resize-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={submitting || !proofText.trim()}
                  className="w-full py-2 font-bold text-white bg-[#222222] hover:bg-[#303030] border border-[#3a3a3a] disabled:opacity-50 rounded-lg transition-all flex items-center justify-center gap-1.5 text-xs active:scale-95"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{submitting ? 'Enviando...' : 'Enviar Comprovante Manual'}</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
