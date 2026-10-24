import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import logoImg from './logo.png';
import bgHeroImage from './imagem de fundo.jpg';
import {
  Tv,
  CheckCircle2,
  Calendar,
  MessageSquare,
  ShieldCheck,
  ArrowRight,
  Sparkles,
  Send,
  Zap,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { login, register, isSupabaseConnected } = useAuth();
  const [modalMode, setModalMode] = useState<'login' | 'register' | null>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setIsSubmitting(true);

    try {
      if (modalMode === 'register') {
        if (!name.trim()) throw new Error('Por favor, informe seu nome completo.');
        await register(name, email, password);
      } else {
        await login(email, password);
      }
      setModalMode(null);
    } catch (err: any) {
      setErrorMsg(err.message || 'Falha na autenticação. Verifique os dados informados.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col relative overflow-hidden select-none">
      {/* Ambient Streaming Cinema Background with Custom Hero Image & Netflix Red Glows */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        {/* User custom background image with opacity */}
        <div
          className="absolute inset-0 bg-cover bg-center bg-no-repeat opacity-25"
          style={{ backgroundImage: `url(${bgHeroImage})` }}
        />
        {/* Darkening overlays for high contrast and readability */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#141414] via-[#141414]/80 to-[#141414]/90" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#141414] via-[#141414]/70 to-[#141414]/85" />

        {/* Ambient glow highlights */}
        <div className="absolute -top-40 -left-40 w-[30rem] h-[30rem] bg-[#E50914]/15 rounded-full blur-[160px]" />
        <div className="absolute top-1/3 -right-40 w-[32rem] h-[32rem] bg-[#B81D24]/12 rounded-full blur-[180px]" />
        <div className="absolute -bottom-40 left-1/3 w-[36rem] h-[36rem] bg-[#E50914]/10 rounded-full blur-[200px]" />
      </div>

      {/* Top Bar */}
      <header className="relative z-10 border-b border-black bg-black shadow-md sticky top-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 min-h-16 sm:min-h-20 lg:min-h-24 py-2 sm:py-3 flex items-center justify-between gap-3 sm:gap-6">
          {/* Brand Wordmark */}
          <div className="flex items-center gap-2 sm:gap-3">
            <img src={logoImg} alt="GestorFlix" className="h-10 sm:h-16 lg:h-20 max-w-[140px] sm:max-w-none object-contain" />
          </div>

          {/* Nav links (Desktop) */}
          <nav className="hidden md:flex items-center gap-8 text-sm font-medium text-neutral-300">
            <a href="#beneficios" className="hover:text-white transition-colors cursor-pointer">
              Benefícios
            </a>
            <a href="#preco-vitalicio" className="hover:text-white transition-colors cursor-pointer">
              Preço & Vitalício
            </a>
          </nav>

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => {
                setErrorMsg('');
                setModalMode('login');
              }}
              className="px-3 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium text-neutral-300 hover:text-white hover:bg-[#222222] rounded-lg transition-all"
            >
              Entrar
            </button>
            <button
              onClick={() => {
                setErrorMsg('');
                setModalMode('register');
              }}
              className="px-4 sm:px-5 py-1.5 sm:py-2.5 text-xs sm:text-sm font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-lg shadow-[#E50914]/35 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              Criar
            </button>
          </div>
        </div>

        {/* Mobile Sub-Navigation Pills */}
        <div className="md:hidden flex items-center justify-center gap-2 py-1.5 px-3 bg-[#0a0a0a] border-t border-neutral-900 text-xs">
          <a
            href="#beneficios"
            className="px-3 py-1 rounded-full bg-[#161616] border border-neutral-800 text-neutral-300 hover:text-white text-[11px] font-medium transition-colors active:bg-[#222222]"
          >
            Benefícios
          </a>
          <a
            href="#preco-vitalicio"
            className="px-3 py-1 rounded-full bg-[#161616] border border-neutral-800 text-neutral-300 hover:text-white text-[11px] font-medium transition-colors active:bg-[#222222]"
          >
            Preço & Vitalício
          </a>
        </div>
      </header>

      {/* Hero Section */}
      <main className="relative z-10 flex-1 flex flex-col justify-center">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 lg:py-24 grid lg:grid-cols-12 gap-8 lg:gap-12 items-center">
          {/* Left Column: Value Proposition */}
          <div className="lg:col-span-7 flex flex-col items-start text-left space-y-5 sm:space-y-6">
            {/* Blinking 3-Day Free Trial Highlight */}
            <div className="inline-flex items-center gap-2 px-3 sm:px-4 py-1 sm:py-1.5 rounded-full bg-[#1f1012] border-2 border-[#E50914] text-[#ff4d58] text-[10px] sm:text-xs font-bold uppercase tracking-wider shadow-lg shadow-[#E50914]/30 animate-pulse">
              <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[#E50914] shrink-0" />
              <span>EXPERIMENTE GRÁTIS POR 3 DIAS!</span>
            </div>

            {/* Official Headline */}
            <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-white leading-tight">
              Gerencie seus clientes IPTV{' '}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#ff3b47] via-white to-neutral-200">
                em um só lugar.
              </span>
            </h1>

            {/* Subtitle / Planos & Preço Section Anchor */}
            <div id="preco-vitalicio" className="scroll-mt-28 space-y-5 sm:space-y-6 w-full">
              <p className="text-lg sm:text-xl text-neutral-300 max-w-2xl font-normal leading-relaxed">
                Controle seus planos, organize vencimentos e automatize suas cobranças pelo WhatsApp.
              </p>

              {/* Vitalício Value Card Highlight */}
              <div className="p-4 rounded-xl bg-gradient-to-r from-[#1c1414] via-[#181818] to-[#141414] border border-[#E50914]/40 flex items-center gap-4 w-full sm:w-auto shadow-xl">
              <div className="w-11 h-11 rounded-lg bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#E50914] shrink-0">
                <Zap className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xl sm:text-2xl font-extrabold text-white font-mono">
                    R$ 99,90
                  </span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-[#E50914] text-white font-bold uppercase tracking-wider shadow-sm shadow-[#E50914]/40">
                    Valor Único
                  </span>
                </div>
                <p className="text-xs text-neutral-300 mt-0.5 font-medium">
                  Sem mensalidades · Acesso vitalício para revendedores IPTV
                </p>
              </div>
            </div>

            {/* CTA Buttons */}
            <div className="pt-1 flex flex-wrap items-center gap-4 w-full sm:w-auto">
              <button
                onClick={() => {
                  setErrorMsg('');
                  setModalMode('register');
                }}
                className="w-full sm:w-auto px-8 py-3.5 text-base font-bold text-white bg-gradient-to-r from-[#E50914] to-[#B81D24] hover:from-[#ff1a26] hover:to-[#d01e26] rounded-xl shadow-xl shadow-[#E50914]/35 transition-all flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98]"
              >
                <span>Criar conta grátis (3 dias)</span>
                <ArrowRight className="w-5 h-5" />
              </button>

              <button
                onClick={() => {
                  setErrorMsg('');
                  setModalMode('login');
                }}
                className="w-full sm:w-auto px-6 py-3.5 text-base font-medium text-neutral-200 hover:text-white bg-[#1f1f1f] hover:bg-[#2a2a2a] border border-[#333333] rounded-xl transition-all flex items-center justify-center gap-2"
              >
                <span>Entrar</span>
              </button>
            </div>
            </div>
          </div>

          {/* Right Column: Preview Mockup */}
          <div className="lg:col-span-5 relative">
            <div className="relative mx-auto rounded-2xl p-4 bg-[#181818]/95 border border-[#2d2d2d] shadow-2xl backdrop-blur-xl">
              {/* Card Header */}
              <div className="flex items-center justify-between pb-3 border-b border-[#282828] text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-[#E50914]" />
                  <div className="w-3 h-3 rounded-full bg-neutral-600" />
                  <div className="w-3 h-3 rounded-full bg-neutral-700" />
                  <span className="ml-2 font-mono text-neutral-400 text-[11px]">painel.gestorflix.com</span>
                </div>
                <div className="flex items-center gap-1.5 text-white font-medium text-[11px]">
                  <span className="w-2 h-2 rounded-full bg-[#E50914] inline-block shadow-sm shadow-[#E50914]" />
                  WhatsApp Conectado
                </div>
              </div>

              {/* Card Body */}
              <div className="pt-4 space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <div className="p-3 rounded-xl bg-[#222222] border border-[#333333]">
                    <span className="text-[11px] text-neutral-400 block">Clientes Ativos</span>
                    <span className="text-xl font-bold text-white font-mono tabular-nums">148</span>
                    <span className="text-[10px] text-[#ff4d58] block mt-0.5">+12 esse mês</span>
                  </div>
                  <div className="p-3 rounded-xl bg-[#222222] border border-[#333333]">
                    <span className="text-[11px] text-neutral-400 block">Cobranças Automáticas</span>
                    <span className="text-xl font-bold text-[#E50914] font-mono tabular-nums">100% Ativo</span>
                    <span className="text-[10px] text-neutral-400 block mt-0.5">3 horários configurados</span>
                  </div>
                </div>

                <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#221617] to-[#1e1e1e] border border-[#E50914]/30 space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-white flex items-center gap-1.5">
                      <MessageSquare className="w-3.5 h-3.5 text-[#E50914]" />
                      Lembrete no WhatsApp (Dia anterior)
                    </span>
                    <span className="text-[10px] text-neutral-400 font-mono">09:00</span>
                  </div>
                  <p className="text-xs text-neutral-200 leading-relaxed font-sans bg-[#121212] p-2.5 rounded-lg border border-[#2a2a2a]">
                    “Olá, <strong className="text-white">Marcos</strong>! 😊 Seu plano <strong className="text-[#ff4d58]">FHD + Filmes</strong> vence amanhã, dia 24/10. Valor: <strong className="text-white">R$ 30,00</strong>.”
                  </p>
                  <div className="flex items-center justify-between text-[11px] text-neutral-400 pt-1">
                    <span>Instância WhatsApp: <strong className="text-white">Ativa</strong></span>
                    <span className="text-[#ff4d58] font-medium">Sem duplicidade de envios</span>
                  </div>
                </div>

                <div className="space-y-1.5 text-xs text-neutral-300 pt-1">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
                    <span>Lembretes automáticos: 1 dia antes, no dia e 1 dia depois</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
                    <span>Vínculo com aplicativos (IBO Player, Bob Player, XCIPTV)</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#E50914] shrink-0" />
                    <span>R$ 99,90 valor único vitalício sem mensalidades</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Cards Section */}
        <section id="beneficios" className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16 border-t border-[#242424] scroll-mt-24">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
            <div className="p-5 sm:p-6 rounded-2xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#E50914]">
                <Send className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">Cobrança no WhatsApp</h3>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                Conecte seu WhatsApp e automatize mensagens em horários estratégicos com variáveis personalizadas para seus clientes.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#E50914]">
                <Calendar className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">Controle de Vencimentos</h3>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                Saiba exatamente quem vence hoje, nos próximos dias ou quem já está vencido. Renovação com 1 clique e histórico auditável.
              </p>
            </div>

            <div className="p-5 sm:p-6 rounded-2xl bg-[#181818] border border-[#282828] hover:border-[#E50914]/50 transition-colors space-y-3">
              <div className="w-10 h-10 rounded-xl bg-[#E50914]/15 border border-[#E50914]/30 flex items-center justify-center text-[#E50914]">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <h3 className="text-base sm:text-lg font-bold text-white">Licença Vitalícia</h3>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed">
                Pague apenas R$ 99,90 uma única vez. Sem mensalidades recorrentes, com acesso vitalício para gerenciar seus clientes.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-[#242424] bg-[#0c0c0c] py-6 sm:py-8 text-xs text-neutral-400">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-center sm:text-left">
          <div className="flex flex-col sm:flex-row items-center gap-3">
            <img src={logoImg} alt="GestorFlix" className="h-9 sm:h-11 object-contain" />
            <p>© {new Date().getFullYear()} GestorFlix. Todos os direitos reservados.</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-4 sm:gap-6 text-[11px] sm:text-xs">
            <span>Privacidade & Segurança</span>
            <span className="text-white font-medium">R$ 99,90 Vitalício</span>
            <span className="text-[#ff4d58] font-bold animate-pulse">3 Dias de Teste Grátis</span>
          </div>
        </div>
      </footer>

      {/* Auth Modal (Login / Register) */}
      {modalMode && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-3 sm:p-4">
          <div className="relative w-full max-w-md bg-[#141414] border border-[#2a2a2a] rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">
            {/* Full Black Top Bar with Centered Logo */}
            <div className="w-full bg-black py-4 px-6 border-b border-black flex items-center justify-center relative select-none">
              <img src={logoImg} alt="GestorFlix" className="h-12 sm:h-14 object-contain mx-auto" />
              <button
                onClick={() => setModalMode(null)}
                aria-label="Fechar"
                className="absolute top-3.5 right-3.5 w-8 h-8 rounded-full bg-[#161616] hover:bg-[#262626] text-neutral-400 hover:text-white flex items-center justify-center text-sm transition-colors"
              >
                ✕
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 sm:p-8 space-y-5 overflow-y-auto">
              <div className="text-center space-y-1">
                <h2 className="text-xl font-bold text-white">
                  {modalMode === 'register' ? 'Criar Conta' : 'Entrar'}
                </h2>
                <p className="text-xs text-neutral-400">
                  {modalMode === 'register'
                    ? 'Inicie seus 3 dias de teste gratuito imediatamente.'
                    : 'Acesse seu painel do GestorFlix.'}
                </p>
              </div>

              {!isSupabaseConnected && (
                <div className="p-3 rounded-lg bg-amber-950/40 border border-amber-600/40 text-amber-200 text-xs leading-relaxed text-center">
                  Ambiente Supabase não detectado no frontend. Configure <code>VITE_SUPABASE_URL</code> e <code>VITE_SUPABASE_ANON_KEY</code> no arquivo <code>.env</code> para habilitar o Supabase Auth.
                </div>
              )}

              {errorMsg && (
                <div className="p-3 rounded-lg bg-[#2d1112] border border-[#E50914]/50 text-[#ff737d] text-xs leading-relaxed text-center">
                  {errorMsg}
                </div>
              )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {modalMode === 'register' && (
                <div>
                  <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                    Nome Completo <span className="text-[#E50914]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex: Carlos Silva"
                    className="w-full px-3.5 py-2.5 bg-[#121212] border border-[#333333] rounded-lg text-white text-sm focus:outline-none focus:border-[#E50914] transition-colors"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  E-mail <span className="text-[#E50914]">*</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-3.5 py-2.5 bg-[#121212] border border-[#333333] rounded-lg text-white text-sm focus:outline-none focus:border-[#E50914] transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                  Senha <span className="text-[#E50914]">*</span>
                </label>
                <input
                  type="password"
                  required
                  minLength={4}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 bg-[#121212] border border-[#333333] rounded-lg text-white text-sm focus:outline-none focus:border-[#E50914] transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-3 bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 text-white font-bold rounded-lg shadow-lg shadow-[#E50914]/35 transition-all text-sm mt-2"
              >
                {isSubmitting
                  ? 'Processando...'
                  : modalMode === 'register'
                  ? 'Começar Teste Grátis de 3 Dias'
                  : 'Entrar no Sistema'}
              </button>
            </form>

            <div className="pt-2 text-center text-xs text-neutral-400">
              {modalMode === 'register' ? (
                <span>
                  Já possui uma conta?{' '}
                  <button
                    onClick={() => {
                      setErrorMsg('');
                      setModalMode('login');
                    }}
                    className="text-[#ff4d58] hover:underline font-semibold"
                  >
                    Entrar agora
                  </button>
                </span>
              ) : (
                <span>
                  Ainda não tem conta?{' '}
                  <button
                    onClick={() => {
                      setErrorMsg('');
                      setModalMode('register');
                    }}
                    className="text-[#ff4d58] hover:underline font-semibold"
                  >
                    Cadastre-se grátis
                  </button>
                </span>
              )}
            </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
