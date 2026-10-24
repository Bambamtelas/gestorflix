import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Clock, AlertTriangle, ShieldCheck, CreditCard, ChevronRight, Sparkles } from 'lucide-react';

interface Props {
  onNavigateToSubscription: () => void;
}

export const SubscriptionBanner: React.FC<Props> = ({ onNavigateToSubscription }) => {
  const { user, subscription } = useAuth();

  if (!subscription || user?.role === 'admin') {
    return null;
  }

  const { status, daysLeft, hoursLeft } = subscription;

  if (status === 'trial') {
    return (
      <div className="bg-gradient-to-r from-[#211415] via-[#1a1a1a] to-[#141414] border border-[#E50914]/40 rounded-xl p-3.5 sm:p-4 mb-6 shadow-lg shadow-black/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E50914]/20 border border-[#E50914]/40 flex items-center justify-center shrink-0 text-[#E50914]">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ff4d58] animate-pulse flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-[#E50914]" />
                EXPERIMENTE GRÁTIS POR 3 DIAS!
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#E50914]/20 text-white font-mono font-medium border border-[#E50914]/30">
                {daysLeft > 0 ? `${daysLeft} dia(s) restante(s)` : `${hoursLeft} hora(s) restante(s)`}
              </span>
            </div>
            <p className="text-xs text-neutral-300 mt-0.5">
              Aproveite todas as ferramentas liberadas. Adquira o acesso vitalício por apenas <strong className="text-white">R$ 99,90 (valor único, sem mensalidade)</strong>.
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToSubscription}
          className="self-start sm:self-auto px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-md shadow-[#E50914]/30"
        >
          <span>Ver Licença Vitalícia</span>
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    );
  }

  if (status === 'expired') {
    return (
      <div className="bg-gradient-to-r from-[#2a0e10] via-[#1a1a1a] to-[#141414] border border-[#E50914] rounded-xl p-4 mb-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-[#E50914]/25 border border-[#E50914]/60 flex items-center justify-center shrink-0 text-[#ff4d58]">
            <AlertTriangle className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-[#ff4d58]">
                Acesso de Gerenciamento Bloqueado
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[#E50914]/25 text-white font-mono font-medium">
                Teste Expirado
              </span>
            </div>
            <p className="text-xs text-neutral-300 mt-0.5">
              Seu período de teste terminou. Desbloqueie o acesso vitalício por <strong className="text-white">R$ 99,90 (valor único, sem mensalidade)</strong>.
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToSubscription}
          className="self-start sm:self-auto px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg transition-colors flex items-center gap-1.5 shrink-0 shadow-lg shadow-[#E50914]/40"
        >
          <CreditCard className="w-3.5 h-3.5" />
          <span>Ativar Vitalício por R$ 99,90</span>
        </button>
      </div>
    );
  }

  if (status === 'pending_payment') {
    return (
      <div className="bg-gradient-to-r from-[#251a14] via-[#1a1a1a] to-[#141414] border border-amber-600/50 rounded-xl p-4 mb-6 shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0 text-amber-400">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">
                Pagamento Vitalício em Análise
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono font-medium">
                Pendente
              </span>
            </div>
            <p className="text-xs text-neutral-300 mt-0.5">
              Seu comprovante do PIX de R$ 99,90 foi enviado e está aguardando liberação do administrador.
            </p>
          </div>
        </div>

        <button
          onClick={onNavigateToSubscription}
          className="self-start sm:self-auto px-4 py-2 text-xs font-semibold text-white bg-[#262626] hover:bg-[#333333] border border-neutral-700 rounded-lg transition-colors"
        >
          Ver Comprovante
        </button>
      </div>
    );
  }

  if (status === 'suspended') {
    return (
      <div className="bg-[#2a0e10] border border-[#E50914] rounded-xl p-4 mb-6 shadow-md flex items-center gap-3 text-neutral-200">
        <AlertTriangle className="w-5 h-5 shrink-0 text-[#E50914]" />
        <div className="text-xs">
          <span className="font-bold text-white">Conta Suspensa:</span> Esta conta foi suspensa pela administração. Entre em contato com o suporte para reativação.
        </div>
      </div>
    );
  }

  // Active status (Vitalício)
  return (
    <div className="bg-[#181818] border border-[#2b2b2b] rounded-xl px-4 py-2.5 mb-6 flex items-center justify-between text-xs text-neutral-300">
      <div className="flex items-center gap-2">
        <ShieldCheck className="w-4 h-4 text-[#E50914]" />
        <span>
          <strong className="text-white">Licença Vitalícia Ativa:</strong> Acesso permanente liberado sem mensalidades.
        </span>
      </div>
      <button
        onClick={onNavigateToSubscription}
        className="text-xs text-[#ff4d58] hover:text-white hover:underline font-bold"
      >
        Ver Licença
      </button>
    </div>
  );
};
