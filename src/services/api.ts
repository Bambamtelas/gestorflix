import {
  Customer,
  Plan,
  Application,
  WhatsAppSettings,
  BillingSettings,
  MessageTemplate,
  MessageLog,
  DashboardMetrics,
  Subscription,
  User,
} from '../types';

const TOKEN_KEY = 'gestor_iptv_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setStoredToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function removeStoredToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(endpoint, {
    ...options,
    headers,
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    if (response.status === 401) {
      removeStoredToken();
    }
    const errorMsg = data.message || data.error || `Erro HTTP ${response.status}`;
    const err = new Error(errorMsg) as any;
    err.status = data.status || response.status;
    err.code = data.error;
    err.details = data;
    throw err;
  }

  return data as T;
}

export const api = {
  // Auth
  async register(data: { name: string; email: string; password: string }) {
    return request<{ token: string; user: User; subscription: any }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async login(data: { email: string; password: string }) {
    return request<{ token: string; user: User; subscription: any }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async migrateLegacy(data: { email: string; password: string }) {
    return request<{ success: boolean; migrated: boolean; message: string }>('/api/auth/migrate-legacy', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMe(): Promise<{ user: User; subscription: any } | null> {
    const token = getStoredToken();
    if (!token) return null;
    try {
      return await request<{ user: User; subscription: any }>('/api/auth/me');
    } catch (err: any) {
      if (err.status === 401 || err.status === 403) {
        removeStoredToken();
        return null;
      }
      throw err;
    }
  },

  // Dashboard
  async getDashboardMetrics(): Promise<DashboardMetrics> {
    return request<DashboardMetrics>('/api/dashboard/metrics');
  },

  // Customers
  async getCustomers(): Promise<Customer[]> {
    return request<Customer[]>('/api/customers');
  },

  async createCustomer(data: Partial<Customer>): Promise<Customer> {
    return request<Customer>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateCustomer(id: string, data: Partial<Customer>): Promise<Customer> {
    return request<Customer>(`/api/customers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteCustomer(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/customers/${id}`, {
      method: 'DELETE',
    });
  },

  async renewCustomer(id: string): Promise<{ success: boolean; customer: Customer; message: string }> {
    return request<{ success: boolean; customer: Customer; message: string }>(`/api/customers/${id}/renew`, {
      method: 'POST',
    });
  },

  // Plans
  async getPlans(): Promise<Plan[]> {
    return request<Plan[]>('/api/plans');
  },

  async createPlan(data: Partial<Plan>): Promise<Plan> {
    return request<Plan>('/api/plans', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updatePlan(id: string, data: Partial<Plan>): Promise<Plan> {
    return request<Plan>(`/api/plans/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deletePlan(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/plans/${id}`, {
      method: 'DELETE',
    });
  },

  // Applications
  async getApplications(): Promise<Application[]> {
    return request<Application[]>('/api/applications');
  },

  async createApplication(data: Partial<Application>): Promise<Application> {
    return request<Application>('/api/applications', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async updateApplication(id: string, data: Partial<Application>): Promise<Application> {
    return request<Application>(`/api/applications/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteApplication(id: string): Promise<{ success: boolean; message: string }> {
    return request<{ success: boolean; message: string }>(`/api/applications/${id}`, {
      method: 'DELETE',
    });
  },

  // WhatsApp & Evolution API
  async getWhatsAppSettings(): Promise<{
    api_url?: string;
    instance_name: string;
    api_key_masked?: string;
    has_api_key?: boolean;
    is_connected: boolean;
    auto_billing_enabled: boolean;
    central_configured?: boolean;
    last_checked_at?: string;
  }> {
    return request('/api/whatsapp/settings');
  },

  async saveWhatsAppSettings(data: {
    api_url?: string;
    instance_name?: string;
    api_key?: string;
    auto_billing_enabled?: boolean;
  }): Promise<{ success: boolean; message: string }> {
    return request('/api/whatsapp/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getWhatsAppInstanceStatus(): Promise<{
    configured: boolean;
    status: 'connected' | 'disconnected' | 'connecting' | 'waiting_qr' | 'error';
    state?: string;
    is_connected: boolean;
    instance_name: string;
    message?: string;
    last_checked_at?: string;
    error?: string;
  }> {
    return request('/api/whatsapp/instance/status');
  },

  async connectWhatsAppInstance(): Promise<{
    status: 'connected' | 'waiting_qr' | 'connecting' | 'error';
    is_connected: boolean;
    instance_name: string;
    qrcode?: string;
    message?: string;
    error?: string;
  }> {
    return request('/api/whatsapp/instance/connect', {
      method: 'POST',
    });
  },

  async disconnectWhatsAppInstance(): Promise<{
    success: boolean;
    status: string;
    is_connected: boolean;
    message: string;
  }> {
    return request('/api/whatsapp/instance/disconnect', {
      method: 'POST',
    });
  },

  async checkWhatsAppConnection(): Promise<{
    is_connected: boolean;
    state?: string;
    message: string;
    details?: any;
    error?: string;
  }> {
    return request('/api/whatsapp/check-connection', {
      method: 'POST',
    });
  },

  async sendTestWhatsApp(data: { test_number: string; message?: string }): Promise<{
    success: boolean;
    message: string;
  }> {
    return request('/api/whatsapp/send-test', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async sendManualWhatsApp(data: {
    customer_id: string;
    template_type?: string;
    custom_text?: string;
  }): Promise<{ success: boolean; message: string }> {
    return request('/api/whatsapp/send-manual', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Billing & Templates
  async getBillingSettings(): Promise<BillingSettings> {
    return request<BillingSettings>('/api/billing/settings');
  },

  async saveBillingSettings(data: Partial<BillingSettings>): Promise<{
    success: boolean;
    settings: BillingSettings;
    message: string;
  }> {
    return request('/api/billing/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getTemplates(): Promise<MessageTemplate[]> {
    return request<MessageTemplate[]>('/api/billing/templates');
  },

  async updateTemplate(type: string, template_text: string): Promise<{
    success: boolean;
    template: MessageTemplate;
    message: string;
  }> {
    return request(`/api/billing/templates/${type}`, {
      method: 'PUT',
      body: JSON.stringify({ template_text }),
    });
  },

  async triggerBillingCycle(): Promise<{
    success: boolean;
    message: string;
    details: { processed: number; sent: number; failed: number; skipped: number };
  }> {
    return request('/api/billing/trigger-cycle', {
      method: 'POST',
    });
  },

  // History / Logs
  async getMessageLogs(): Promise<MessageLog[]> {
    return request<MessageLog[]>('/api/billing/logs');
  },

  // Subscription
  async getSubscriptionInfo(): Promise<{
    subscription: any;
    payment_info: {
      pix_key: string;
      pix_name: string;
      monthly_price: number;
      instructions: string;
    };
    mercadopago?: {
      available: boolean;
      price: number;
      currency: string;
      title: string;
      pending_payment: any;
    };
  }> {
    return request('/api/subscription/info');
  },

  async submitPaymentRequest(reference: string): Promise<{ success: boolean; message: string }> {
    return request('/api/subscription/submit-payment-request', {
      method: 'POST',
      body: JSON.stringify({ reference }),
    });
  },

  // SaaS Master Admin
  async getAdminUsers(): Promise<any[]> {
    return request<any[]>('/api/admin/users');
  },

  async updateAdminUserSubscription(
    userId: string,
    data: { action: string; days_to_add?: number; new_status?: string }
  ): Promise<{ success: boolean; message: string; subscription: any }> {
    return request(`/api/admin/users/${userId}/subscription`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async saveAdminSettings(data: any): Promise<{ success: boolean; message: string }> {
    return request('/api/admin/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Central Evolution API (Master Admin)
  async getAdminEvolutionSettings(): Promise<{
    api_url: string;
    has_api_key: boolean;
    api_key_masked: string;
    updated_at?: string;
  }> {
    return request('/api/admin/evolution/settings');
  },

  async saveAdminEvolutionSettings(data: {
    api_url?: string;
    api_key?: string;
  }): Promise<{
    success: boolean;
    message: string;
    settings: {
      api_url: string;
      has_api_key: boolean;
      api_key_masked: string;
      updated_at?: string;
    };
  }> {
    return request('/api/admin/evolution/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async testAdminEvolutionConnection(data?: {
    api_url?: string;
    api_key?: string;
  }): Promise<{
    success: boolean;
    message: string;
    status?: number;
    instance_count?: number;
  }> {
    return request('/api/admin/evolution/test', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  // ====================================================================
  // MERCADO PAGO INTEGRATION (PIX LIFETIME LICENSE)
  // ====================================================================

  // Admin: Get Mercado Pago configuration (token is masked, never leaked)
  async getAdminMercadoPagoSettings(): Promise<{
    configured: boolean;
    enabled: boolean;
    has_token: boolean;
    masked_token: string;
    notification_url: string;
    has_webhook_secret: boolean;
    updated_at?: string;
  }> {
    return request('/api/admin/mercadopago/settings');
  },

  // Admin: Save Mercado Pago configuration
  async saveAdminMercadoPagoSettings(data: {
    access_token?: string;
    enabled?: boolean;
    notification_url?: string;
    webhook_secret?: string;
  }): Promise<{
    success: boolean;
    message: string;
    config: {
      configured: boolean;
      enabled: boolean;
      has_token: boolean;
      masked_token: string;
      notification_url: string;
      has_webhook_secret: boolean;
      updated_at?: string;
    };
  }> {
    return request('/api/admin/mercadopago/settings', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  // Admin: Test Mercado Pago connection
  async testAdminMercadoPagoConnection(data?: {
    access_token?: string;
  }): Promise<{
    success: boolean;
    message: string;
    user_id?: number;
    nickname?: string;
    site_id?: string;
    status?: number;
  }> {
    return request('/api/admin/mercadopago/test', {
      method: 'POST',
      body: JSON.stringify(data || {}),
    });
  },

  // User: Create Pix payment charge (R$ 99.90 lifetime)
  async createPixPayment(): Promise<{
    success: boolean;
    payment: {
      id: string;
      mercado_pago_payment_id?: string;
      status: string;
      amount: number;
      qr_code: string;
      qr_code_base64?: string;
      ticket_url?: string;
      expires_at?: string;
    };
  }> {
    return request('/api/payments/pix', {
      method: 'POST',
    });
  },

  // User: Poll Pix payment status
  async getPaymentStatus(paymentId: string): Promise<{
    success: boolean;
    payment: {
      id: string;
      mercado_pago_payment_id?: string;
      status: string;
      is_approved: boolean;
      activated: boolean;
    };
  }> {
    return request(`/api/payments/status/${encodeURIComponent(paymentId)}`);
  },
};
