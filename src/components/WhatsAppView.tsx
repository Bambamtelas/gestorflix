import React, { useState, useEffect } from 'react';
import { api } from '../services/api';
import { BillingSettings, MessageTemplate } from '../types';
import {
  MessageSquare,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Send,
  Clock,
  ShieldCheck,
  Eye,
  Sliders,
  Play,
  QrCode,
  Smartphone,
  LogOut,
  Wifi,
  WifiOff,
} from 'lucide-react';

export const WhatsAppView: React.FC = () => {
  // Instance state
  const [instanceName, setInstanceName] = useState('');
  const [instanceStatus, setInstanceStatus] = useState<
    'disconnected' | 'waiting_qr' | 'connecting' | 'connected' | 'error'
  >('disconnected');
  const [isCentralConfigured, setIsCentralConfigured] = useState(true);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [autoBillingEnabled, setAutoBillingEnabled] = useState(false);
  const [lastCheckedAt, setLastCheckedAt] = useState<string | undefined>();

  // Action loaders
  const [connectingInstance, setConnectingInstance] = useState(false);
  const [disconnectingInstance, setDisconnectingInstance] = useState(false);
  const [refreshingStatus, setRefreshingStatus] = useState(false);
  const [savingAutoBilling, setSavingAutoBilling] = useState(false);
  const [statusErrorMessage, setStatusErrorMessage] = useState<string | null>(null);

  // Billing Schedules
  const [billingSettings, setBillingSettings] = useState<BillingSettings>({
    timezone: 'America/Sao_Paulo',
    send_day_before: true,
    time_day_before: '09:00',
    send_day_of_morning: true,
    time_day_of_morning: '09:00',
    send_day_of_night: true,
    time_day_of_night: '19:00',
    send_day_after: true,
    time_day_after: '10:00',
    user_id: '',
  });

  // 3 Required Templates
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);

  // Page Load State
  const [loading, setLoading] = useState(true);

  // Test send state
  const [testNumber, setTestNumber] = useState('');
  const [sendingTest, setSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<string>('');

  // Manual Trigger Run state
  const [triggeringCycle, setTriggeringCycle] = useState(false);
  const [cycleResult, setCycleResult] = useState<string>('');

  // Status feedback
  const [feedbackMsg, setFeedbackMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ws, instStatus, bs, tpls] = await Promise.all([
        api.getWhatsAppSettings(),
        api.getWhatsAppInstanceStatus().catch(() => null),
        api.getBillingSettings(),
        api.getTemplates(),
      ]);

      setInstanceName(ws.instance_name || '');
      setAutoBillingEnabled(Boolean(ws.auto_billing_enabled));
      setLastCheckedAt(ws.last_checked_at);
      setIsCentralConfigured(ws.central_configured ?? true);

      if (instStatus) {
        setIsCentralConfigured(instStatus.configured);
        setInstanceStatus(instStatus.status);
        setIsConnected(instStatus.is_connected);
        if (instStatus.instance_name) setInstanceName(instStatus.instance_name);
        if (instStatus.last_checked_at) setLastCheckedAt(instStatus.last_checked_at);
        if (instStatus.error) setStatusErrorMessage(instStatus.error);
      } else {
        setIsConnected(ws.is_connected);
        setInstanceStatus(ws.is_connected ? 'connected' : 'disconnected');
      }

      if (bs) setBillingSettings(bs);
      if (tpls) setTemplates(tpls);
    } catch (err: any) {
      console.error('Error loading WhatsApp settings:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Polling for QR Code reading when awaiting scan or connecting
  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (instanceStatus === 'waiting_qr' || instanceStatus === 'connecting') {
      timer = setInterval(async () => {
        try {
          const res = await api.getWhatsAppInstanceStatus();
          if (res.status === 'connected') {
            setInstanceStatus('connected');
            setIsConnected(true);
            setQrCode(null);
            setStatusErrorMessage(null);
            setFeedbackMsg({ text: 'WhatsApp conectado com sucesso!', type: 'success' });
            setTimeout(() => setFeedbackMsg(null), 5000);
          } else if (res.status === 'error' && res.error) {
            setStatusErrorMessage(res.error);
          }
        } catch (e) {
          // Silent polling fail
        }
      }, 4000);
    }
    return () => {
      if (timer) clearInterval(timer);
    };
  }, [instanceStatus]);

  const handleConnectWhatsApp = async () => {
    setConnectingInstance(true);
    setStatusErrorMessage(null);
    setFeedbackMsg(null);

    try {
      const res = await api.connectWhatsAppInstance();
      setInstanceStatus(res.status);
      setIsConnected(res.is_connected);
      if (res.instance_name) setInstanceName(res.instance_name);

      if (res.status === 'waiting_qr' && res.qrcode) {
        setQrCode(res.qrcode);
        setFeedbackMsg({
          text: 'QR Code gerado! Aponte a câmera do WhatsApp para conectar.',
          type: 'success',
        });
      } else if (res.status === 'connected') {
        setQrCode(null);
        setFeedbackMsg({ text: 'WhatsApp conectado com sucesso!', type: 'success' });
      } else if (res.status === 'connecting') {
        setFeedbackMsg({ text: 'Iniciando conexão com a Evolution API...', type: 'success' });
      }
    } catch (err: any) {
      setInstanceStatus('error');
      setStatusErrorMessage(err.message || 'Falha ao conectar com o WhatsApp');
      setFeedbackMsg({
        text: err.message || 'Erro ao iniciar conexão do WhatsApp.',
        type: 'error',
      });
    } finally {
      setConnectingInstance(false);
      setTimeout(() => setFeedbackMsg(null), 6000);
    }
  };

  const handleDisconnectWhatsApp = async () => {
    if (!window.confirm('Tem certeza de que deseja desconectar seu WhatsApp do Gestor FLIX?')) {
      return;
    }

    setDisconnectingInstance(true);
    setStatusErrorMessage(null);

    try {
      const res = await api.disconnectWhatsAppInstance();
      setIsConnected(false);
      setInstanceStatus('disconnected');
      setQrCode(null);
      setFeedbackMsg({ text: res.message || 'WhatsApp desconectado com sucesso.', type: 'success' });
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Erro ao desconectar WhatsApp.', type: 'error' });
    } finally {
      setDisconnectingInstance(false);
      setTimeout(() => setFeedbackMsg(null), 5000);
    }
  };

  const handleRefreshStatus = async () => {
    setRefreshingStatus(true);
    setStatusErrorMessage(null);

    try {
      const res = await api.getWhatsAppInstanceStatus();
      setIsCentralConfigured(res.configured);
      setInstanceStatus(res.status);
      setIsConnected(res.is_connected);
      if (res.instance_name) setInstanceName(res.instance_name);
      if (res.last_checked_at) setLastCheckedAt(res.last_checked_at);

      if (res.status === 'connected') {
        setQrCode(null);
        setFeedbackMsg({ text: 'WhatsApp verificado: Conexão ativa!', type: 'success' });
      } else if (res.status === 'disconnected') {
        setFeedbackMsg({ text: 'WhatsApp desconectado.', type: 'error' });
      }
    } catch (err: any) {
      setInstanceStatus('error');
      setStatusErrorMessage(err.message || 'Erro ao verificar status.');
    } finally {
      setRefreshingStatus(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleToggleAutoBilling = async (enabled: boolean) => {
    setAutoBillingEnabled(enabled);
    setSavingAutoBilling(true);

    try {
      await api.saveWhatsAppSettings({ auto_billing_enabled: enabled });
      setFeedbackMsg({
        text: enabled ? 'Cobranças automáticas ativadas!' : 'Cobranças automáticas desativadas.',
        type: 'success',
      });
    } catch (err: any) {
      setAutoBillingEnabled(!enabled); // revert on error
      setFeedbackMsg({ text: err.message || 'Erro ao alterar cobranças automáticas.', type: 'error' });
    } finally {
      setSavingAutoBilling(false);
      setTimeout(() => setFeedbackMsg(null), 4000);
    }
  };

  const handleSendTestMessage = async () => {
    if (!testNumber) {
      alert('Informe o número com DDD para enviar o teste.');
      return;
    }

    setSendingTest(true);
    setTestResult('');

    try {
      const res = await api.sendTestWhatsApp({ test_number: testNumber });
      setTestResult('✅ ' + res.message);
    } catch (err: any) {
      setTestResult('❌ ' + (err.message || 'Falha ao enviar mensagem de teste.'));
    } finally {
      setSendingTest(false);
    }
  };

  const handleSaveBillingSettings = async () => {
    try {
      await api.saveBillingSettings(billingSettings);
      setFeedbackMsg({ text: 'Horários de cobrança automática salvos!', type: 'success' });
      setTimeout(() => setFeedbackMsg(null), 4000);
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Erro ao salvar horários de cobrança.', type: 'error' });
    }
  };

  const handleUpdateTemplate = async (type: string, text: string) => {
    try {
      await api.updateTemplate(type, text);
      setFeedbackMsg({ text: 'Modelo de mensagem atualizado com sucesso!', type: 'success' });
      setTimeout(() => setFeedbackMsg(null), 4000);
      loadData();
    } catch (err: any) {
      setFeedbackMsg({ text: err.message || 'Erro ao salvar modelo.', type: 'error' });
    }
  };

  const handleTriggerCycleNow = async () => {
    setTriggeringCycle(true);
    setCycleResult('');
    try {
      const res = await api.triggerBillingCycle();
      setCycleResult(res.message);
    } catch (err: any) {
      setCycleResult('Erro: ' + (err.message || 'Falha ao processar ciclo de cobrança.'));
    } finally {
      setTriggeringCycle(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[300px]">
        <div className="text-slate-400 text-xs flex items-center gap-2">
          <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
          <span>Carregando configurações do WhatsApp...</span>
        </div>
      </div>
    );
  }

  const tplBefore = templates.find((t) => t.type === 'day_before')?.template_text || '';
  const tplDay = templates.find((t) => t.type === 'day_of')?.template_text || '';
  const tplAfter = templates.find((t) => t.type === 'day_after')?.template_text || '';

  return (
    <div className="space-y-8">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white tracking-tight">
            Configurações do WhatsApp
          </h1>
          <p className="text-xs text-neutral-400 mt-0.5">
            Conecte sua instância do WhatsApp e gerencie os horários e modelos das cobranças automáticas.
          </p>
        </div>

        {feedbackMsg && (
          <div
            className={`text-xs px-3 py-2 rounded-lg font-bold border ${
              feedbackMsg.type === 'success'
                ? 'bg-emerald-950/80 border-emerald-500/40 text-emerald-300'
                : 'bg-red-950/80 border-red-500/40 text-red-300'
            }`}
          >
            {feedbackMsg.text}
          </div>
        )}
      </div>

      {/* Grid: Credentials & Connection Status */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Connection Form / Instance Manager */}
        <div className="lg:col-span-7 bg-[#181818] border border-[#282828] rounded-xl p-6 space-y-5 shadow-xl">
          <div className="flex items-center justify-between pb-3 border-b border-[#282828]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-[#E50914]/15 flex items-center justify-center text-[#E50914]">
                <MessageSquare className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-sm font-black text-white">Conexão do WhatsApp</h2>
                <p className="text-[11px] text-neutral-400">Instância individual exclusiva da sua conta</p>
              </div>
            </div>

            {/* Dynamic Status Pill */}
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-neutral-400">Status:</span>
              {instanceStatus === 'connected' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-emerald-950/70 text-emerald-400 border border-emerald-500/30">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                  Conectado
                </span>
              )}
              {instanceStatus === 'waiting_qr' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-amber-950/70 text-amber-300 border border-amber-500/30">
                  <QrCode className="w-3 h-3" />
                  Aguardando QR Code
                </span>
              )}
              {instanceStatus === 'connecting' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-sky-950/70 text-sky-300 border border-sky-500/30">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Conectando...
                </span>
              )}
              {instanceStatus === 'disconnected' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-[#222222] text-neutral-400 border border-[#333333]">
                  <WifiOff className="w-3 h-3" />
                  Desconectado
                </span>
              )}
              {instanceStatus === 'error' && (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-bold bg-red-950/70 text-red-400 border border-red-500/30">
                  <AlertTriangle className="w-3 h-3" />
                  Erro de Conexão
                </span>
              )}
            </div>
          </div>

          {/* If Master Admin has not set up Central Evolution API */}
          {!isCentralConfigured && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-500/30 text-amber-200 text-xs flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-amber-300">Evolution API Central não configurada</p>
                <p className="text-[11px] text-amber-200/80 mt-1 leading-relaxed">
                  A Evolution API central ainda não foi cadastrada pelo Administrador Master no painel administrativo.
                  Assim que a URL e a credencial forem configuradas pela administração, o botão de conexão estará disponível aqui.
                </p>
              </div>
            </div>
          )}

          {/* Instance Status Display & Controls */}
          {isCentralConfigured && (
            <div className="space-y-4">
              {/* Error Alert if any */}
              {statusErrorMessage && (
                <div className="p-3 rounded-lg bg-red-950/50 border border-red-500/30 text-red-300 text-xs flex items-start gap-2.5">
                  <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                  <p className="leading-relaxed">{statusErrorMessage}</p>
                </div>
              )}

              {/* State 1: DISCONNECTED */}
              {instanceStatus === 'disconnected' && (
                <div className="p-5 rounded-xl bg-[#121212] border border-[#262626] text-center space-y-4">
                  <div className="w-12 h-12 mx-auto rounded-full bg-[#E50914]/10 border border-[#E50914]/20 flex items-center justify-center text-[#E50914]">
                    <Smartphone className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-sm font-bold text-white">Nenhum WhatsApp Conectado</h3>
                    <p className="text-xs text-neutral-400 leading-relaxed">
                      Conecte seu WhatsApp para que o Gestor FLIX envie os lembretes de renovação e cobrança aos seus clientes.
                    </p>
                  </div>

                  <button
                    onClick={handleConnectWhatsApp}
                    disabled={connectingInstance}
                    className="inline-flex items-center justify-center gap-2 px-6 py-2.5 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg shadow-lg shadow-red-950/40 transition-all active:scale-95"
                  >
                    {connectingInstance ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        <span>Gerando QR Code...</span>
                      </>
                    ) : (
                      <>
                        <QrCode className="w-4 h-4" />
                        <span>Conectar meu WhatsApp</span>
                      </>
                    )}
                  </button>
                </div>
              )}

              {/* State 2: WAITING QR CODE */}
              {instanceStatus === 'waiting_qr' && (
                <div className="p-5 rounded-xl bg-[#121212] border border-amber-500/30 space-y-4 text-center">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white flex items-center justify-center gap-2">
                      <QrCode className="w-4 h-4 text-amber-400" />
                      Escaneie o QR Code com seu WhatsApp
                    </h3>
                    <p className="text-xs text-neutral-400 max-w-md mx-auto">
                      Abra o WhatsApp no celular &gt; Menu ou Configurações &gt; <strong>Aparelhos conectados</strong> &gt; <strong>Conectar um aparelho</strong>.
                    </p>
                  </div>

                  {qrCode ? (
                    <div className="inline-block p-3 bg-white rounded-xl shadow-2xl mx-auto border border-neutral-300">
                      <img
                        src={qrCode}
                        alt="QR Code WhatsApp"
                        className="w-56 h-56 object-contain block mx-auto"
                      />
                    </div>
                  ) : (
                    <div className="p-8 text-neutral-400 text-xs flex flex-col items-center gap-2">
                      <RefreshCw className="w-6 h-6 animate-spin text-amber-400" />
                      <span>Gerando imagem do QR Code...</span>
                    </div>
                  )}

                  <div className="flex items-center justify-center gap-2 text-[11px] text-amber-300/90 font-medium">
                    <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
                    <span>Aguardando leitura no celular... O sistema detectará automaticamente.</span>
                  </div>

                  <div className="flex flex-wrap items-center justify-center gap-2 pt-2 border-t border-[#252525]">
                    <button
                      onClick={handleConnectWhatsApp}
                      disabled={connectingInstance}
                      className="px-3.5 py-1.5 text-xs font-semibold text-neutral-200 hover:text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#333333] rounded-lg transition-colors flex items-center gap-1.5"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${connectingInstance ? 'animate-spin' : ''}`} />
                      <span>Gerar Novo QR Code</span>
                    </button>

                    <button
                      onClick={handleDisconnectWhatsApp}
                      disabled={disconnectingInstance}
                      className="px-3.5 py-1.5 text-xs font-semibold text-neutral-400 hover:text-neutral-200 hover:bg-[#222] rounded-lg transition-colors"
                    >
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* State 3: CONNECTING */}
              {instanceStatus === 'connecting' && (
                <div className="p-6 rounded-xl bg-[#121212] border border-sky-500/30 text-center space-y-3">
                  <RefreshCw className="w-8 h-8 animate-spin text-sky-400 mx-auto" />
                  <h3 className="text-sm font-bold text-white">Estabelecendo Conexão</h3>
                  <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                    Sincronizando com os servidores do WhatsApp. Isso costuma levar alguns segundos...
                  </p>
                  <button
                    onClick={handleRefreshStatus}
                    disabled={refreshingStatus}
                    className="px-4 py-1.5 text-xs font-semibold text-neutral-200 bg-[#222] hover:bg-[#2a2a2a] border border-[#333] rounded-lg"
                  >
                    Verificar Agora
                  </button>
                </div>
              )}

              {/* State 4: CONNECTED */}
              {instanceStatus === 'connected' && (
                <div className="p-5 rounded-xl bg-[#121212] border border-emerald-500/30 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-emerald-950/30 border border-emerald-500/20 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400">
                        <CheckCircle2 className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="font-bold text-emerald-300 text-sm block">WhatsApp Conectado e Pronto</span>
                        <span className="text-[11px] text-neutral-400 block font-mono">
                          Instância: {instanceName || 'ativa'}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-start sm:self-auto">
                      <button
                        onClick={handleRefreshStatus}
                        disabled={refreshingStatus}
                        title="Verificar status da conexão agora"
                        className="px-3 py-1.5 text-xs font-semibold text-neutral-200 hover:text-white bg-[#222222] hover:bg-[#2c2c2c] border border-[#333333] rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${refreshingStatus ? 'animate-spin text-emerald-400' : ''}`} />
                        <span>Verificar</span>
                      </button>

                      <button
                        onClick={handleDisconnectWhatsApp}
                        disabled={disconnectingInstance}
                        title="Desconectar esta conta de WhatsApp"
                        className="px-3 py-1.5 text-xs font-semibold text-red-300 hover:text-red-200 bg-red-950/40 hover:bg-red-950/80 border border-red-500/30 rounded-lg transition-colors flex items-center gap-1.5"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>{disconnectingInstance ? 'Desconectando...' : 'Desconectar'}</span>
                      </button>
                    </div>
                  </div>

                  {lastCheckedAt && (
                    <p className="text-[10px] text-neutral-500 text-right">
                      Última verificação: {new Date(lastCheckedAt).toLocaleTimeString('pt-BR')}
                    </p>
                  )}
                </div>
              )}

              {/* State 5: ERROR */}
              {instanceStatus === 'error' && (
                <div className="p-5 rounded-xl bg-[#121212] border border-red-500/30 space-y-4 text-center">
                  <div className="w-10 h-10 mx-auto rounded-full bg-red-950/80 border border-red-500/40 flex items-center justify-center text-red-400">
                    <XCircle className="w-5 h-5" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white">Falha na Conexão com o WhatsApp</h3>
                    <p className="text-xs text-neutral-400 max-w-sm mx-auto">
                      Não foi possível estabelecer contato com a Evolution API. Verifique sua conexão e tente novamente.
                    </p>
                  </div>
                  <button
                    onClick={handleConnectWhatsApp}
                    disabled={connectingInstance}
                    className="px-5 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-lg shadow-red-950/40"
                  >
                    Tentar Novamente
                  </button>
                </div>
              )}

              {/* Toggle Auto Billing */}
              <div className="p-3.5 rounded-lg bg-[#101010] border border-[#282828] flex items-center justify-between">
                <div>
                  <span className="font-bold text-white block">Ativar Cobranças Automáticas</span>
                  <span className="text-[11px] text-neutral-400 block mt-0.5">
                    Permite que o agendador envie lembretes nos horários programados quando o WhatsApp estiver conectado.
                  </span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoBillingEnabled}
                    onChange={(e) => handleToggleAutoBilling(e.target.checked)}
                    disabled={savingAutoBilling}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-[#252525] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-[#E50914]"></div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Test Send & Execution Controls */}
        <div className="lg:col-span-5 space-y-6">
          {/* Test Box */}
          <div className="bg-[#181818] border border-[#282828] rounded-xl p-6 space-y-4 text-xs shadow-xl">
            <div className="flex items-center gap-2 pb-2 border-b border-[#282828]">
              <Send className="w-4 h-4 text-[#ff4d58]" />
              <h2 className="text-sm font-black text-white">Enviar Mensagem de Teste</h2>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              Envie uma mensagem instantânea para o seu próprio número de WhatsApp para confirmar que a instância está disparando normalmente.
            </p>

            <div>
              <label className="block font-medium text-neutral-300 mb-1">
                Número com DDD (ex: 5511987654321)
              </label>
              <input
                type="text"
                value={testNumber}
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="5511987654321"
                className="w-full px-3 py-2 bg-[#101010] border border-[#2e2e2e] rounded-lg text-white font-mono placeholder-neutral-500 focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914]"
              />
            </div>

            <button
              onClick={handleSendTestMessage}
              disabled={sendingTest || !testNumber}
              className="w-full py-2.5 font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-50 rounded-lg shadow-lg shadow-red-950/40 transition-all flex items-center justify-center gap-2 active:scale-95"
            >
              <Send className="w-3.5 h-3.5" />
              <span>{sendingTest ? 'Enviando teste...' : 'Disparar Teste no WhatsApp'}</span>
            </button>

            {testResult && (
              <div className="p-2.5 rounded-lg bg-[#101010] border border-[#282828] font-mono text-[11px] text-neutral-300">
                {testResult}
              </div>
            )}
          </div>

          {/* Trigger Cycle Now Box */}
          <div className="bg-[#181818] border border-[#282828] rounded-xl p-6 space-y-3 text-xs shadow-xl">
            <div className="flex items-center justify-between pb-2 border-b border-[#282828]">
              <div className="flex items-center gap-2">
                <Play className="w-4 h-4 text-[#ff4d58]" />
                <h2 className="text-sm font-black text-white">Execução do Servidor</h2>
              </div>
              <span className="text-[10px] text-emerald-400 font-mono font-bold">Agendador 24/7 Ativo</span>
            </div>
            <p className="text-neutral-400 leading-relaxed">
              O agendador roda no servidor a cada 60 segundos. Se desejar, force a verificação e o disparo dos vencimentos devidos agora mesmo:
            </p>

            <button
              onClick={handleTriggerCycleNow}
              disabled={triggeringCycle}
              className="w-full py-2.5 font-bold text-white bg-[#262626] hover:bg-[#333333] border border-[#3e3e3e] hover:border-[#E50914]/50 disabled:opacity-50 rounded-lg transition-all flex items-center justify-center gap-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${triggeringCycle ? 'animate-spin text-[#E50914]' : ''}`} />
              <span>{triggeringCycle ? 'Processando fila...' : 'Processar Cobranças Agora'}</span>
            </button>

            {cycleResult && (
              <div className="p-2.5 rounded-lg bg-[#101010] border border-[#282828] font-mono text-[11px] text-neutral-300">
                {cycleResult}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Agendamentos Obrigatórios (Schedules) */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl p-6 space-y-6 shadow-xl">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#282828]">
          <div>
            <h2 className="text-base font-black text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-[#ff4d58]" />
              Horários das Cobranças Automáticas
            </h2>
            <p className="text-xs text-neutral-400 mt-0.5">
              Defina os horários em que cada lembrete será enviado aos clientes (fuso horário: {billingSettings.timezone}).
            </p>
          </div>

          <button
            onClick={handleSaveBillingSettings}
            className="px-4 py-2 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] rounded-lg shadow-lg shadow-red-950/30 transition-all self-start sm:self-auto active:scale-95"
          >
            Salvar Horários
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-xs">
          {/* A. 1 dia antes */}
          <div className="p-4 rounded-xl bg-[#101010] border border-[#282828] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">A. 1 Dia Antes do Vencimento</span>
              <input
                type="checkbox"
                checked={billingSettings.send_day_before}
                onChange={(e) =>
                  setBillingSettings({ ...billingSettings, send_day_before: e.target.checked })
                }
                className="w-4 h-4 accent-[#E50914] rounded bg-[#202020] border-[#333333]"
              />
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Lembrete preventivo enviado ao cliente no dia anterior à data de vencimento.
            </p>
            <div>
              <label className="block text-neutral-400 mb-1">Horário do envio:</label>
              <input
                type="time"
                value={billingSettings.time_day_before}
                onChange={(e) =>
                  setBillingSettings({ ...billingSettings, time_day_before: e.target.value })
                }
                className="w-full px-3 py-1.5 bg-[#181818] border border-[#2e2e2e] rounded-lg text-white font-mono focus:outline-none focus:border-[#E50914]"
              />
            </div>
          </div>

          {/* B. No dia do vencimento (manhã e noite) */}
          <div className="p-4 rounded-xl bg-[#101010] border border-[#282828] space-y-3">
            <span className="font-bold text-white block">B. No Dia do Vencimento</span>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Dois disparos configuráveis separadamente no dia exato do vencimento:
            </p>

            {/* Manhã */}
            <div className="pt-1 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-neutral-300">Lembrete pela Manhã:</span>
                <input
                  type="checkbox"
                  checked={billingSettings.send_day_of_morning}
                  onChange={(e) =>
                    setBillingSettings({ ...billingSettings, send_day_of_morning: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#E50914] rounded bg-[#202020] border-[#333333]"
                />
              </div>
              <input
                type="time"
                value={billingSettings.time_day_of_morning}
                onChange={(e) =>
                  setBillingSettings({ ...billingSettings, time_day_of_morning: e.target.value })
                }
                className="w-full px-3 py-1.5 bg-[#181818] border border-[#2e2e2e] rounded-lg text-white font-mono focus:outline-none focus:border-[#E50914]"
              />
            </div>

            {/* Noite */}
            <div className="pt-2 border-t border-[#282828] space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-neutral-300">Lembrete à Noite:</span>
                <input
                  type="checkbox"
                  checked={billingSettings.send_day_of_night}
                  onChange={(e) =>
                    setBillingSettings({ ...billingSettings, send_day_of_night: e.target.checked })
                  }
                  className="w-4 h-4 accent-[#E50914] rounded bg-[#202020] border-[#333333]"
                />
              </div>
              <input
                type="time"
                value={billingSettings.time_day_of_night}
                onChange={(e) =>
                  setBillingSettings({ ...billingSettings, time_day_of_night: e.target.value })
                }
                className="w-full px-3 py-1.5 bg-[#181818] border border-[#2e2e2e] rounded-lg text-white font-mono focus:outline-none focus:border-[#E50914]"
              />
            </div>
          </div>

          {/* C. 1 dia depois */}
          <div className="p-4 rounded-xl bg-[#101010] border border-[#282828] space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-white">C. 1 Dia Depois do Vencimento</span>
              <input
                type="checkbox"
                checked={billingSettings.send_day_after}
                onChange={(e) =>
                  setBillingSettings({ ...billingSettings, send_day_after: e.target.checked })
                }
                className="w-4 h-4 accent-[#E50914] rounded bg-[#202020] border-[#333333]"
              />
            </div>
            <p className="text-[11px] text-neutral-400 leading-relaxed">
              Aviso comunicando que o plano está vencido e solicitando a regularização.
            </p>
            <div>
              <label className="block text-neutral-400 mb-1">Horário do aviso:</label>
              <input
                type="time"
                value={billingSettings.time_day_after}
                onChange={(e) =>
                  setBillingSettings({ ...billingSettings, time_day_after: e.target.value })
                }
                className="w-full px-3 py-1.5 bg-[#181818] border border-[#2e2e2e] rounded-lg text-white font-mono focus:outline-none focus:border-[#E50914]"
              />
            </div>
          </div>
        </div>
      </div>

      {/* 3 Modelos de Mensagem Editáveis */}
      <div className="bg-[#181818] border border-[#282828] rounded-xl p-6 space-y-6 shadow-xl">
        <div className="pb-3 border-b border-[#282828]">
          <h2 className="text-base font-black text-white flex items-center gap-2">
            <Sliders className="w-4 h-4 text-[#ff4d58]" />
            Três Modelos de Mensagem Personalizáveis
          </h2>
          <p className="text-xs text-neutral-400 mt-0.5">
            Personalize os textos utilizando as variáveis: <code className="text-[#ff4d58] font-mono">{'{nome}'}</code>,{' '}
            <code className="text-[#ff4d58] font-mono">{'{plano}'}</code>,{' '}
            <code className="text-[#ff4d58] font-mono">{'{valor}'}</code>,{' '}
            <code className="text-[#ff4d58] font-mono">{'{vencimento}'}</code>,{' '}
            <code className="text-[#ff4d58] font-mono">{'{whatsapp}'}</code>.
          </p>
        </div>

        <div className="space-y-6">
          {/* Modelo 1 */}
          <TemplateEditor
            title="Modelo 1 — Um dia antes do vencimento"
            subtitle="Utilizado no disparo preventivo da véspera."
            initialText={tplBefore}
            onSave={(text) => handleUpdateTemplate('day_before', text)}
          />

          {/* Modelo 2 */}
          <TemplateEditor
            title="Modelo 2 — No dia do vencimento"
            subtitle="Utilizado nos disparos do dia (manhã e noite)."
            initialText={tplDay}
            onSave={(text) => handleUpdateTemplate('day_of', text)}
          />

          {/* Modelo 3 */}
          <TemplateEditor
            title="Modelo 3 — Um dia depois do vencimento"
            subtitle="Utilizado no aviso de cobrança após o vencimento."
            initialText={tplAfter}
            onSave={(text) => handleUpdateTemplate('day_after', text)}
          />
        </div>
      </div>
    </div>
  );
};

// Subcomponent for each of the 3 templates with live preview
const TemplateEditor: React.FC<{
  title: string;
  subtitle: string;
  initialText: string;
  onSave: (text: string) => void;
}> = ({ title, subtitle, initialText, onSave }) => {
  const [text, setText] = useState(initialText);
  const [isChanged, setIsChanged] = useState(false);

  useEffect(() => {
    setText(initialText);
  }, [initialText]);

  const handleChange = (newVal: string) => {
    setText(newVal);
    setIsChanged(newVal !== initialText);
  };

  const handleSave = () => {
    onSave(text);
    setIsChanged(false);
  };

  // Preview simulation
  const preview = text
    .replace(/{nome}/g, 'Marcos Silva')
    .replace(/{plano}/g, 'Plano Básico FHD')
    .replace(/{valor}/g, 'R$ 30,00')
    .replace(/{vencimento}/g, '25/10/2026')
    .replace(/{whatsapp}/g, '5511987654321');

  return (
    <div className="p-4 rounded-xl bg-[#101010] border border-[#282828] space-y-3 text-xs">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="font-bold text-white text-sm">{title}</span>
          <p className="text-[11px] text-neutral-400">{subtitle}</p>
        </div>

        <button
          onClick={handleSave}
          disabled={!isChanged}
          className="px-3.5 py-1.5 text-xs font-bold text-white bg-[#E50914] hover:bg-[#b81d24] disabled:opacity-40 rounded-lg shadow-sm transition-all self-start sm:self-auto active:scale-95"
        >
          Salvar Alteração
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        <div>
          <label className="block text-neutral-400 font-medium mb-1">Texto Editável:</label>
          <textarea
            rows={4}
            value={text}
            onChange={(e) => handleChange(e.target.value)}
            className="w-full p-2.5 bg-[#181818] border border-[#2e2e2e] rounded-lg text-white font-sans text-xs focus:outline-none focus:border-[#E50914] focus:ring-1 focus:ring-[#E50914] resize-none leading-relaxed"
          />
        </div>

        <div>
          <label className="block text-neutral-400 font-medium mb-1 flex items-center gap-1.5">
            <Eye className="w-3.5 h-3.5 text-[#ff4d58]" />
            <span>Pré-visualização como o Cliente Receberá:</span>
          </label>
          <div className="p-3 bg-[#181818] border-l-4 border-l-[#E50914] border-y border-r border-[#282828] rounded-r-lg text-neutral-200 text-xs leading-relaxed min-h-[90px]">
            {preview}
          </div>
        </div>
      </div>
    </div>
  );
};
