export type SubscriptionStatus = 'trial' | 'pending_payment' | 'active' | 'expired' | 'suspended';
export type UserRole = 'admin' | 'user';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  created_at: string;
}

export interface Subscription {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  trial_ends_at: string;
  current_period_end: string;
  payment_reference?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  user_id: string;
  name: string;
  price: number;
  duration_days: number;
  description?: string;
  panel?: string;
  server_dns?: string[];
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Application {
  id: string;
  user_id: string;
  name: string;
  description?: string;
  notes?: string;
  status: 'active' | 'inactive';
  created_at: string;
}

export interface Customer {
  id: string;
  user_id: string;
  name: string;
  email?: string;
  whatsapp: string;
  notes?: string;
  plan_id?: string;
  application_id?: string;
  start_date: string;
  expiration_date: string;
  status: 'active' | 'expiring_soon' | 'expired';
  created_at: string;
  updated_at: string;
  // Join fields for convenience
  plan_name?: string;
  plan_price?: number;
  application_name?: string;
}

export interface WhatsAppSettings {
  id?: string;
  user_id: string;
  api_url: string;
  instance_name: string;
  api_key: string;
  is_connected: boolean;
  auto_billing_enabled: boolean;
  last_checked_at?: string;
}

export interface BillingSettings {
  id?: string;
  user_id: string;
  timezone: string;
  send_day_before: boolean;
  time_day_before: string; // e.g. "09:00"
  send_day_of_morning: boolean;
  time_day_of_morning: string; // e.g. "09:00"
  send_day_of_night: boolean;
  time_day_of_night: string; // e.g. "19:00"
  send_day_after: boolean;
  time_day_after: string; // e.g. "10:00"
}

export type TemplateType = 'day_before' | 'day_of' | 'day_after';

export interface MessageTemplate {
  id: string;
  user_id: string;
  type: TemplateType;
  title: string;
  template_text: string;
  created_at?: string;
  updated_at?: string;
}

export type MessageLogStatus = 'pending' | 'sent' | 'failed' | 'cancelled';
export type MessageSlot = 'day_before' | 'day_of_morning' | 'day_of_night' | 'day_after' | 'manual';

export interface MessageLog {
  id: string;
  user_id: string;
  customer_id: string;
  customer_name: string;
  whatsapp: string;
  message_type: MessageSlot;
  cycle_date: string;
  scheduled_for: string;
  attempted_at: string;
  status: MessageLogStatus;
  response_payload?: string;
  error_details?: string;
  idempotency_key: string;
  created_at: string;
}

export interface SaaSSettings {
  admin_pix_key: string;
  admin_pix_name: string;
  saas_monthly_price: number;
  instructions: string;
}

export interface DashboardMetrics {
  totalCustomers: number;
  activeCustomers: number;
  expiringSoonCustomers: number;
  expiredCustomers: number;
  totalPlans: number;
  totalApplications: number;
  whatsAppConnected: boolean;
  autoBillingEnabled: boolean;
  trialDaysLeft: number;
  trialHoursLeft: number;
  subscriptionStatus: SubscriptionStatus;
  monthlyRevenueEstimate: number;
}
