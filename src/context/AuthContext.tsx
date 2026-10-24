import React, { createContext, useContext, useState, useEffect } from 'react';
import { User } from '../types';
import { api, getStoredToken, setStoredToken, removeStoredToken } from '../services/api';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

interface AuthContextType {
  user: User | null;
  subscription: any | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  quickLoginDemo: (asAdmin?: boolean) => Promise<void>;
  refreshSubscription: () => Promise<void>;
  isSupabaseConnected: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [subscription, setSubscription] = useState<any | null>(null);
  const [token, setToken] = useState<string | null>(getStoredToken());
  const [loading, setLoading] = useState<boolean>(true);

  // Inicialização e persistência de sessão com Supabase Auth
  useEffect(() => {
    let isMounted = true;

    const initSession = async () => {
      // 1. Rejeita e limpa qualquer token antigo no formato legado id:timestamp
      const stored = getStoredToken();
      if (stored && (stored.includes(':') || !stored.includes('.'))) {
        removeStoredToken();
        setToken(null);
        setUser(null);
        setSubscription(null);
        if (isMounted) setLoading(false);
        return;
      }

      // 2. Se o Supabase estiver configurado, recupera a sessão ativa do SDK
      if (isSupabaseConfigured && supabase) {
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session && session.access_token) {
            setStoredToken(session.access_token);
            if (isMounted) setToken(session.access_token);

            const res = await api.getMe();
            if (isMounted && res && res.user) {
              setUser(res.user);
              setSubscription(res.subscription);
            }
          } else {
            removeStoredToken();
            if (isMounted) {
              setToken(null);
              setUser(null);
              setSubscription(null);
            }
          }
        } catch {
          removeStoredToken();
          if (isMounted) {
            setToken(null);
            setUser(null);
            setSubscription(null);
          }
        }
      } else if (stored) {
        // Sem Supabase configurado, limpa sessões inconsistentes
        removeStoredToken();
        if (isMounted) {
          setToken(null);
          setUser(null);
          setSubscription(null);
        }
      }

      if (isMounted) setLoading(false);
    };

    initSession();

    // 3. Listener em tempo real para renovação de token e encerramento de sessão
    let authListener: any = null;
    if (isSupabaseConfigured && supabase) {
      const { data } = supabase.auth.onAuthStateChange(async (event, session) => {
        if (!isMounted) return;

        if (event === 'SIGNED_OUT' || !session) {
          removeStoredToken();
          setToken(null);
          setUser(null);
          setSubscription(null);
        } else if (session?.access_token) {
          setStoredToken(session.access_token);
          setToken(session.access_token);
          try {
            const res = await api.getMe();
            if (isMounted && res && res.user) {
              setUser(res.user);
              setSubscription(res.subscription);
            }
          } catch {
            // Se a sessão expirou no backend, limpa estado
          }
        }
      });
      authListener = data.subscription;
    }

    return () => {
      isMounted = false;
      if (authListener) {
        authListener.unsubscribe();
      }
    };
  }, []);

  const login = async (email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();

    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase não configurado. Por favor, preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.'
      );
    }

    // 1. Tentar login direto via Supabase Auth
    let signInRes = await supabase.auth.signInWithPassword({
      email: cleanEmail,
      password,
    });

    // 2. Se falhar no Supabase Auth, tentar migração suave de conta legada (data/db.json)
    if (signInRes.error) {
      try {
        const migRes = await api.migrateLegacy({ email: cleanEmail, password });
        if (migRes && migRes.success) {
          // Re-executa login no Supabase Auth com a conta agora provisionada
          signInRes = await supabase.auth.signInWithPassword({
            email: cleanEmail,
            password,
          });
        }
      } catch (migErr: any) {
        const msg = migErr.details?.message || migErr.message || signInRes.error?.message;
        throw new Error(msg || 'E-mail ou senha incorretos.');
      }
    }

    if (signInRes.error || !signInRes.data.session) {
      throw new Error(signInRes.error?.message || 'Falha ao autenticar no Supabase Auth.');
    }

    const jwtToken = signInRes.data.session.access_token;
    setStoredToken(jwtToken);
    setToken(jwtToken);

    // Obtém perfil e assinatura validados pelo backend através do token JWT
    const res = await api.getMe();
    if (res && res.user) {
      setUser(res.user);
      setSubscription(res.subscription);
    } else {
      throw new Error('Falha ao carregar perfil do usuário.');
    }
  };

  const register = async (name: string, email: string, password: string) => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name.trim();

    if (!cleanName) throw new Error('Por favor, informe seu nome completo.');
    if (!cleanEmail) throw new Error('Por favor, informe seu e-mail.');
    if (!password || password.length < 6) throw new Error('A senha deve ter no mínimo 6 caracteres.');

    if (!isSupabaseConfigured || !supabase) {
      throw new Error(
        'Supabase não configurado. Por favor, preencha VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY no arquivo .env.'
      );
    }

    const { data, error } = await supabase.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          name: cleanName,
          full_name: cleanName,
        },
      },
    });

    if (error) {
      throw new Error(error.message || 'Erro ao criar conta no Supabase Auth.');
    }

    if (data.session && data.session.access_token) {
      const jwtToken = data.session.access_token;
      setStoredToken(jwtToken);
      setToken(jwtToken);

      const res = await api.getMe();
      if (res && res.user) {
        setUser(res.user);
        setSubscription(res.subscription);
      }
    } else {
      // Caso o projeto exija confirmação de e-mail por link
      throw new Error(
        'Conta criada com sucesso! Por favor, verifique seu e-mail para confirmar seu acesso ou realize o login caso a confirmação esteja desativada.'
      );
    }
  };

  const quickLoginDemo = async (asAdmin: boolean = false) => {
    const email = asAdmin ? 'chavepixedvandyemis@gmail.com' : 'revendedor@demo.com';
    const password = asAdmin ? 'admin123' : 'demo123';
    await login(email, password);
  };

  const logout = async () => {
    if (supabase) {
      try {
        await supabase.auth.signOut();
      } catch {
        // Erro silencioso em logout
      }
    }
    removeStoredToken();
    setToken(null);
    setUser(null);
    setSubscription(null);
  };

  const refreshSubscription = async () => {
    try {
      const res = await api.getMe();
      if (res && res.subscription) {
        setSubscription(res.subscription);
      }
    } catch {
      // Ignora erro em atualização silenciosa de background
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        subscription,
        token,
        loading,
        login,
        register,
        logout,
        quickLoginDemo,
        refreshSubscription,
        isSupabaseConnected: isSupabaseConfigured,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
