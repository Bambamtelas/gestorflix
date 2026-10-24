import React, { useState } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { LandingPage } from './components/LandingPage';
import { DashboardView } from './components/DashboardView';
import { CustomersView } from './components/CustomersView';
import { PlansView } from './components/PlansView';
import { ApplicationsView } from './components/ApplicationsView';
import { ExpirationsView } from './components/ExpirationsView';
import { WhatsAppView } from './components/WhatsAppView';
import { HistoryView } from './components/HistoryView';
import { SubscriptionView } from './components/SubscriptionView';
import { AdminView } from './components/AdminView';
import { SubscriptionBanner } from './components/SubscriptionBanner';
import logoImg from './components/logo.png';
import {
  LayoutDashboard,
  Users,
  Package,
  Layers,
  Calendar,
  History,
  Settings,
  CreditCard,
  ShieldAlert,
  LogOut,
  Tv,
  Menu,
  X,
  Clock,
  Sparkles,
} from 'lucide-react';

const MainLayout: React.FC = () => {
  const { user, subscription, logout, loading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // States to open modals directly from dashboard shortcuts
  const [openCustomerModal, setOpenCustomerModal] = useState(false);
  const [openPlanModal, setOpenPlanModal] = useState(false);
  const [openAppModal, setOpenAppModal] = useState(false);

  // Garante que revendedores comuns ou contas deslogadas nunca fiquem retidas na aba administrativa
  React.useEffect(() => {
    if (!user || user.role !== 'admin') {
      if (activeTab === 'admin') {
        setActiveTab('dashboard');
      }
    }
  }, [user, activeTab]);

  const handleLogout = async () => {
    setActiveTab('dashboard');
    await logout();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#141414] flex items-center justify-center">
        <div className="w-9 h-9 border-3 border-neutral-700 border-t-[#E50914] rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <LandingPage />;
  }

  const navigateTo = (tab: string) => {
    setActiveTab(tab);
    setMobileMenuOpen(false);
  };

  const menuItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'customers', label: 'Clientes', icon: Users },
    { id: 'plans', label: 'Planos', icon: Package },
    { id: 'applications', label: 'Aplicativos', icon: Layers },
    { id: 'expirations', label: 'Vencimentos', icon: Calendar },
    { id: 'whatsapp', label: 'Configurações WhatsApp', icon: Settings },
    { id: 'history', label: 'Histórico de Cobranças', icon: History },
    { id: 'subscription', label: 'Minha Licença Vitalícia', icon: CreditCard },
  ];

  if (user.role === 'admin') {
    menuItems.push({ id: 'admin', label: 'Painel Master (Admin)', icon: ShieldAlert });
  }

  return (
    <div className="min-h-screen bg-[#141414] text-white flex flex-col md:flex-row">
      {/* Mobile Top Header */}
      <div className="md:hidden flex items-center justify-between px-4 py-2.5 bg-black border-b border-black z-30 sticky top-0">
        <div className="flex items-center gap-2">
          <img src={logoImg} alt="GestorFlix" className="h-10 object-contain" />
        </div>

        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          aria-label="Abrir Menu"
          className="p-2 rounded-lg bg-[#141414] text-neutral-300 hover:text-white active:scale-95 transition-transform"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </button>
      </div>

      {/* Mobile Drawer Backdrop */}
      {mobileMenuOpen && (
        <div
          onClick={() => setMobileMenuOpen(false)}
          className="fixed inset-0 bg-black/75 backdrop-blur-xs z-35 md:hidden"
        />
      )}

      {/* Sidebar Navigation */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-black border-r border-black flex flex-col justify-between transition-transform duration-300 md:static md:translate-x-0 ${
          mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div>
          <div className="h-24 px-5 flex items-center justify-between border-b border-neutral-900">
            <img src={logoImg} alt="GestorFlix" className="h-14 object-contain max-w-[170px]" />
            <span className="text-[9px] px-2 py-0.5 rounded-full bg-[#141414] border border-neutral-800 text-neutral-300 font-bold uppercase tracking-wider">
              {user.role === 'admin' ? 'Admin' : 'Revenda'}
            </span>
          </div>

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            {menuItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => navigateTo(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-xs font-medium transition-all ${
                    isActive
                      ? 'bg-[#E50914] text-white shadow-md shadow-[#E50914]/25 font-bold'
                      : 'text-neutral-400 hover:text-white hover:bg-[#1a1a1a]'
                  }`}
                >
                  <Icon className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-neutral-400'}`} />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar Footer with User Profile and Logout */}
        <div className="p-4 border-t border-[#222222] bg-[#080808] space-y-3">
          {/* Trial countdown badge */}
          {user.role !== 'admin' && subscription && subscription.status === 'trial' && (
            <div className="p-2.5 rounded-lg bg-[#1a1112] border border-[#E50914]/40 text-[11px] space-y-1">
              <div className="flex items-center justify-between text-[#ff5c66] font-semibold">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-[#E50914]" />
                  Teste Gratuito
                </span>
                <span className="font-mono text-white">
                  {subscription.daysLeft > 0 ? `${subscription.daysLeft}d` : `${subscription.hoursLeft}h`}
                </span>
              </div>
              <div className="w-full bg-[#2a2a2a] rounded-full h-1.5 overflow-hidden">
                <div
                  className="bg-[#E50914] h-1.5 rounded-full"
                  style={{ width: `${Math.max(10, (subscription.daysLeft / 3) * 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* User profile info */}
          <div className="flex items-center justify-between">
            <div className="truncate pr-2">
              <span className="text-xs font-semibold text-white block truncate">{user.name}</span>
              <span className="text-[10px] text-neutral-400 block truncate">{user.email}</span>
            </div>
            <button
              onClick={handleLogout}
              title="Sair da Conta"
              className="p-1.5 rounded-lg bg-[#1f1f1f] hover:bg-[#E50914]/30 text-neutral-400 hover:text-white transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        {/* Top Header Bar */}
        <header className="hidden md:flex h-16 border-b border-[#222222] px-8 items-center justify-between bg-[#141414]/90 backdrop-blur-md sticky top-0 z-20">
          <div className="text-xs text-neutral-400">
            Painel GestorFlix <span className="mx-2 text-neutral-600">/</span>{' '}
            <span className="text-neutral-100 capitalize font-medium">{activeTab}</span>
          </div>

          <div className="flex items-center gap-4">
            {user.role !== 'admin' && subscription?.status === 'trial' && (
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-[#1e1415] border border-[#E50914]/50 text-[#ff616b] text-xs">
                <Clock className="w-3.5 h-3.5 text-[#E50914]" />
                <span>
                  Teste Grátis: <strong className="text-white">{subscription.daysLeft} dia(s) restante(s)</strong>
                </span>
              </div>
            )}

            {user.role !== 'admin' && subscription?.status === 'expired' && (
              <button
                onClick={() => setActiveTab('subscription')}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E50914] hover:bg-[#b81d24] text-white text-xs font-bold animate-pulse shadow-lg shadow-[#E50914]/40 transition-colors"
              >
                <span>Acesso Expirado · Regularizar</span>
              </button>
            )}

            <span className="text-xs text-neutral-200 font-medium">
              {user.name}
            </span>
          </div>
        </header>

        {/* View Viewport */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {/* Trial / Subscription Alert Banner */}
          <SubscriptionBanner onNavigateToSubscription={() => setActiveTab('subscription')} />

          {/* View Components */}
          {activeTab === 'dashboard' && (
            <DashboardView
              onNavigate={navigateTo}
              onOpenCustomerModal={() => {
                setActiveTab('customers');
                setOpenCustomerModal(true);
              }}
              onOpenPlanModal={() => {
                setActiveTab('plans');
                setOpenPlanModal(true);
              }}
              onOpenAppModal={() => {
                setActiveTab('applications');
                setOpenAppModal(true);
              }}
            />
          )}

          {activeTab === 'customers' && (
            <CustomersView
              initialOpenModal={openCustomerModal}
              onCloseInitialModal={() => setOpenCustomerModal(false)}
            />
          )}

          {activeTab === 'plans' && (
            <PlansView
              initialOpenModal={openPlanModal}
              onCloseInitialModal={() => setOpenPlanModal(false)}
            />
          )}

          {activeTab === 'applications' && (
            <ApplicationsView
              initialOpenModal={openAppModal}
              onCloseInitialModal={() => setOpenAppModal(false)}
            />
          )}

          {activeTab === 'expirations' && <ExpirationsView />}

          {activeTab === 'whatsapp' && <WhatsAppView />}

          {activeTab === 'history' && <HistoryView />}

          {activeTab === 'subscription' && <SubscriptionView />}

          {activeTab === 'admin' && user.role === 'admin' && <AdminView />}
        </main>
      </div>
    </div>
  );
};

export default function App() {
  return (
    <AuthProvider>
      <MainLayout />
    </AuthProvider>
  );
}
