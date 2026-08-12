/**
 * MassaZap 2.0 — WhatsApp Baileys Multi-Instance Manager
 * Gerencia múltiplas conexões simultâneas com o WhatsApp
 * 
 * Features:
 * - Múltiplas linhas WhatsApp ativas simultaneamente
 * - Revezamento Inteligente (Round-Robin) para envio em massa anti-bloqueio
 * - Captura de mensagens com logging no Supabase
 * - Callback system para notificações
 * - Detecção de status de entrega (sent, delivered, read)
 */

const {
  default: makeWASocket,
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  downloadMediaMessage
} = require('@whiskeysockets/baileys');
const pino = require('pino');
const QRCode = require('qrcode');
const fs = require('fs');
const path = require('path');

const INSTANCES_CONFIG_FILE = path.join(__dirname, 'whatsapp_instances.json');
const MESSAGES_FILE = path.join(__dirname, 'received_messages.json');
const AUTH_INSTANCES_BASE = path.join(__dirname, 'auth_instances');
const DEFAULT_AUTH_DIR = path.join(__dirname, 'auth_info_baileys');

const logger = pino({ level: 'silent' });

// Map em memória: instanceId → RuntimeInstance
const runtimeInstances = new Map();

// Histórico de mensagens unificado
let receivedMessages = [];

// Round-Robin pointer
let roundRobinIndex = 0;

// Callbacks para eventos
const eventCallbacks = {
  onMessage: [],
  onMessageSent: [],
  onStatusUpdate: [],
  onDeliveryReceipt: []
};

const COLOR_PALETTE = ['#10b981', '#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#06b6d4', '#84cc16'];

// ============================================================================
// PERSISTÊNCIA DE CONFIGURAÇÕES
// ============================================================================

function loadInstancesConfig() {
  try {
    if (fs.existsSync(INSTANCES_CONFIG_FILE)) {
      const raw = fs.readFileSync(INSTANCES_CONFIG_FILE, 'utf8');
      const list = JSON.parse(raw || '[]');
      if (Array.isArray(list) && list.length > 0) return list;
    }
  } catch (e) {
    console.error('Erro ao ler whatsapp_instances.json:', e);
  }

  const defaultList = [{
    id: 'default',
    name: 'WhatsApp Principal',
    color: '#10b981',
    authFolder: 'auth_info_baileys',
    isDefault: true,
    createdAt: new Date().toISOString()
  }];
  saveInstancesConfig(defaultList);
  return defaultList;
}

function saveInstancesConfig(list) {
  try {
    fs.writeFileSync(INSTANCES_CONFIG_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar whatsapp_instances.json:', e);
  }
}

// Carrega mensagens salvas
try {
  if (fs.existsSync(MESSAGES_FILE)) {
    receivedMessages = JSON.parse(fs.readFileSync(MESSAGES_FILE, 'utf8') || '[]');
  }
} catch (e) {
  receivedMessages = [];
}

function saveMessagesToDisk() {
  try {
    fs.writeFileSync(MESSAGES_FILE, JSON.stringify(receivedMessages.slice(0, 2000), null, 2), 'utf8');
  } catch (e) {
    console.error('Erro ao salvar mensagens:', e);
  }
}

function getAuthDirForInstance(config) {
  if (config.id === 'default' && config.authFolder === 'auth_info_baileys') {
    return DEFAULT_AUTH_DIR;
  }
  return path.join(AUTH_INSTANCES_BASE, config.authFolder || `inst_${config.id}`);
}

// ============================================================================
// EVENT SYSTEM
// ============================================================================

function on(event, callback) {
  if (eventCallbacks[event]) {
    eventCallbacks[event].push(callback);
  }
}

function emit(event, data) {
  if (eventCallbacks[event]) {
    for (const cb of eventCallbacks[event]) {
      try { cb(data); } catch (e) { console.error(`Event callback error [${event}]:`, e); }
    }
  }
}

// ============================================================================
// INICIALIZAÇÃO DE INSTÂNCIAS
// ============================================================================

async function initInstance(config) {
  const instanceId = config.id;
  const authDir = getAuthDirForInstance(config);

  if (!fs.existsSync(authDir)) {
    fs.mkdirSync(authDir, { recursive: true });
  }

  let runtime = runtimeInstances.get(instanceId);
  if (!runtime) {
    runtime = {
      config,
      status: 'disconnected',
      qrCode: null,
      rawQr: null,
      user: null,
      sock: null,
      reconnectAttempts: 0
    };
    runtimeInstances.set(instanceId, runtime);
  } else {
    runtime.config = config;
  }

  runtime.status = 'connecting';

  try {
    const { state: authState, saveCreds } = await useMultiFileAuthState(authDir);
    const { version, isLatest } = await fetchLatestBaileysVersion();

    console.log(`📡 [${config.name}] Conectando ao WhatsApp (v${version.join('.')}, isLatest: ${isLatest})...`);

    const sock = makeWASocket({
      version,
      auth: authState,
      logger,
      printQRInTerminal: config.isDefault,
      browser: ['MassaZap 2.0', 'Chrome', '125.0.0'],
      connectTimeoutMs: 60000,
      defaultQueryTimeoutMs: 60000,
      keepAliveIntervalMs: 10000,
      generateHighQualityLinkPreview: false
    });

    runtime.sock = sock;

    sock.ev.on('creds.update', saveCreds);

    // Connection updates
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        runtime.rawQr = qr;
        runtime.status = 'qr_ready';
        try {
          runtime.qrCode = await QRCode.toDataURL(qr, {
            width: 320, margin: 2,
            color: { dark: '#000000', light: '#ffffff' }
          });
          console.log(`📲 [${config.name}] Novo QR Code gerado!`);
        } catch (qrErr) {
          console.error(`Erro QR Code [${config.name}]:`, qrErr);
        }
      }

      if (connection === 'close') {
        runtime.qrCode = null;
        runtime.rawQr = null;
        runtime.user = null;

        const statusCode = lastDisconnect?.error?.output?.statusCode;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;

        console.log(`⚠️ [${config.name}] Conexão fechada. Motivo: ${statusCode} (reconectar: ${shouldReconnect})`);

        if (shouldReconnect) {
          runtime.status = 'connecting';
          setTimeout(() => {
            if (runtimeInstances.has(instanceId)) initInstance(config);
          }, 3000);
        } else {
          runtime.status = 'disconnected';
          clearAuthFiles(authDir);
        }

        emit('onStatusUpdate', { instanceId, status: runtime.status });
      } else if (connection === 'open') {
        runtime.status = 'connected';
        runtime.qrCode = null;
        runtime.rawQr = null;
        runtime.reconnectAttempts = 0;

        const userJid = sock.user?.id || '';
        const cleanPhone = userJid.split(':')[0].replace(/\D/g, '');

        runtime.user = {
          id: userJid,
          phone: cleanPhone,
          name: sock.user?.name || config.name || 'MassaZap Usuário'
        };

        console.log(`✅ [${config.name}] CONECTADO! Número: ${cleanPhone}`);
        emit('onStatusUpdate', { instanceId, status: 'connected', user: runtime.user });
      }
    });

    // Message receipt (delivered, read)
    sock.ev.on('message-receipt.update', (updates) => {
      for (const update of updates) {
        const receiptType = update.receipt?.receiptTimestamp ? 'delivered' : 'unknown';
        const readType = update.receipt?.readTimestamp ? 'read' : receiptType;
        
        emit('onDeliveryReceipt', {
          messageId: update.key?.id,
          remoteJid: update.key?.remoteJid,
          instanceId: config.id,
          status: readType,
          timestamp: new Date().toISOString()
        });
      }
    });

    // Captura de mensagens recebidas
    sock.ev.on('messages.upsert', async (m) => {
      if (!m || !m.messages) return;

      for (const msg of m.messages) {
        if (!msg.message) continue;

        const remoteJid = msg.key?.remoteJid || '';
        const isFromMe = msg.key?.fromMe ?? false;

        if (remoteJid === 'status@broadcast' || remoteJid.includes('@broadcast')) continue;

        let textContent = '';
        let mediaUrl = null;
        let mediaType = null;
        const msgType = Object.keys(msg.message)[0];

        if (msg.message.conversation) {
          textContent = msg.message.conversation;
        } else if (msg.message.extendedTextMessage?.text) {
          textContent = msg.message.extendedTextMessage.text;
        } else if (msgType === 'imageMessage') {
          textContent = msg.message.imageMessage?.caption || '📷 [Imagem recebida]';
        } else if (msgType === 'audioMessage') {
          textContent = '🎤 [Áudio / Mensagem de voz]';
        } else if (msgType === 'videoMessage') {
          textContent = '🎥 [Vídeo recebido]';
        } else if (msgType === 'documentMessage') {
          textContent = `📄 Documento: ${msg.message.documentMessage.fileName || 'arquivo'}`;
        } else if (msgType === 'stickerMessage') {
          textContent = '🧩 [Sticker recebido]';
        } else if (msg.message.contactMessage) {
          textContent = '👤 [Contato recebido]';
        } else if (msg.message.locationMessage) {
          textContent = '📍 [Localização recebida]';
        } else {
          textContent = '[Mensagem recebida]';
        }

        // Tenta baixar a mídia
        if (['imageMessage', 'videoMessage', 'audioMessage', 'stickerMessage', 'documentMessage'].includes(msgType)) {
          try {
            const buffer = await downloadMediaMessage(
              msg,
              'buffer',
              {},
              { reuploadRequest: sock.updateMediaMessage }
            );
            const ext = msgType === 'imageMessage' ? 'jpg' :
                        msgType === 'videoMessage' ? 'mp4' :
                        msgType === 'audioMessage' ? 'ogg' :
                        msgType === 'stickerMessage' ? 'webp' : 'bin';
            const fileName = `media_${Date.now()}_${Math.random().toString(36).substring(2,8)}.${ext}`;
            const filePath = path.join(__dirname, 'uploads', fileName);
            fs.writeFileSync(filePath, buffer);
            mediaUrl = `/uploads/${fileName}`;
            mediaType = msgType.replace('Message', '');
          } catch (err) {
            console.error('❌ Falha ao baixar mídia:', err.message);
          }
        }

        const senderPhone = remoteJid.split('@')[0].replace(/\D/g, '');
        const senderName = msg.pushName || senderPhone || 'Contato WhatsApp';
        const timestampMs = msg.messageTimestamp ? Number(msg.messageTimestamp) * 1000 : Date.now();
        const timeIso = new Date(timestampMs).toISOString();

        const messageItem = {
          id: msg.key?.id || `msg-${Date.now()}-${Math.random()}`,
          instanceId: config.id,
          instanceName: config.name,
          instanceColor: config.color || '#10b981',
          remoteJid,
          phone: senderPhone,
          name: senderName,
          text: textContent,
          mediaUrl: mediaUrl,
          mediaType: mediaType,
          fromMe: isFromMe,
          timestamp: timeIso,
          timeFormatted: new Date(timestampMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
          dateFormatted: new Date(timestampMs).toLocaleDateString('pt-BR'),
          isNew: !isFromMe,
          status: 'received',
          sender: { name: senderName, phone: senderPhone },
          source: 'whatsapp'
        };

        const exists = receivedMessages.some(existing => existing.id === messageItem.id);
        if (!exists) {
          receivedMessages.unshift(messageItem);
          saveMessagesToDisk();

          if (!isFromMe) {
            console.log(`📥 [${config.name}] ${senderName} (${senderPhone}): "${textContent}"`);
            emit('onMessage', messageItem);
          }
        }
      }
    });

    return runtime;
  } catch (err) {
    console.error(`❌ Erro ao inicializar [${config.name}]:`, err);
    runtime.status = 'disconnected';
    return runtime;
  }
}

async function initAllInstances() {
  const configs = loadInstancesConfig();
  console.log(`🚀 Inicializando ${configs.length} instância(s) de WhatsApp...`);
  for (const config of configs) {
    await initInstance(config);
  }
}

async function initWhatsApp() {
  return initAllInstances();
}

function clearAuthFiles(authDir) {
  try {
    if (fs.existsSync(authDir)) {
      fs.rmSync(authDir, { recursive: true, force: true });
    }
  } catch (e) {
    console.error(`Erro ao limpar auth (${authDir}):`, e);
  }
}

// ============================================================================
// CRUD DE INSTÂNCIAS
// ============================================================================

function getInstancesList() {
  const configs = loadInstancesConfig();
  return configs.map(config => {
    const runtime = runtimeInstances.get(config.id) || { status: 'disconnected', qrCode: null, user: null };
    const instanceMessages = receivedMessages.filter(m => m.instanceId === config.id);
    const unreadCount = instanceMessages.filter(m => !m.fromMe && m.isNew).length;

    return {
      id: config.id,
      name: config.name,
      color: config.color || '#10b981',
      isDefault: !!config.isDefault,
      status: runtime.status,
      connected: runtime.status === 'connected',
      qrCode: runtime.qrCode,
      user: runtime.user,
      unreadCount,
      totalMessages: instanceMessages.length,
      createdAt: config.createdAt
    };
  });
}

async function createInstance({ name, color }) {
  const configs = loadInstancesConfig();
  const newId = `inst_${Date.now()}`;
  const cleanName = (name && name.trim()) || `WhatsApp ${configs.length + 1}`;
  const chosenColor = color || COLOR_PALETTE[configs.length % COLOR_PALETTE.length];

  const newConfig = {
    id: newId, name: cleanName, color: chosenColor,
    authFolder: `inst_${newId}`, isDefault: false,
    createdAt: new Date().toISOString()
  };

  configs.push(newConfig);
  saveInstancesConfig(configs);
  console.log(`➕ Nova instância: "${cleanName}" (${newId})`);

  const runtime = await initInstance(newConfig);
  return {
    success: true,
    instance: {
      id: newConfig.id, name: newConfig.name, color: newConfig.color,
      status: runtime.status, connected: runtime.status === 'connected',
      qrCode: runtime.qrCode, user: runtime.user
    }
  };
}

async function deleteInstance(instanceId) {
  let configs = loadInstancesConfig();
  const target = configs.find(c => c.id === instanceId);
  if (!target) throw new Error(`Instância ${instanceId} não encontrada.`);
  if (target.isDefault && configs.length === 1) throw new Error('Não é possível excluir a única instância.');

  const runtime = runtimeInstances.get(instanceId);
  if (runtime?.sock) {
    try { await runtime.sock.logout(); } catch (e) {}
    try { runtime.sock.end(); } catch (e) {}
  }

  clearAuthFiles(getAuthDirForInstance(target));
  runtimeInstances.delete(instanceId);
  configs = configs.filter(c => c.id !== instanceId);
  saveInstancesConfig(configs);
  return { success: true, instanceId };
}

function renameInstance(instanceId, { name, color }) {
  const configs = loadInstancesConfig();
  const config = configs.find(c => c.id === instanceId);
  if (!config) throw new Error(`Instância ${instanceId} não encontrada.`);

  if (name?.trim()) config.name = name.trim();
  if (color?.trim()) config.color = color.trim();
  saveInstancesConfig(configs);

  const runtime = runtimeInstances.get(instanceId);
  if (runtime) {
    runtime.config = config;
    if (runtime.user) runtime.user.name = config.name;
  }
  return { success: true, instance: config };
}

async function logoutInstance(instanceId) {
  const configs = loadInstancesConfig();
  const config = configs.find(c => c.id === instanceId);
  if (!config) throw new Error(`Instância ${instanceId} não encontrada.`);

  const runtime = runtimeInstances.get(instanceId);
  if (runtime?.sock) {
    try { await runtime.sock.logout(); } catch (e) {}
  }

  clearAuthFiles(getAuthDirForInstance(config));
  if (runtime) {
    runtime.status = 'disconnected';
    runtime.qrCode = null;
    runtime.user = null;
    runtime.sock = null;
  }

  setTimeout(() => initInstance(config), 1000);
  return { success: true, message: `"${config.name}" desconectado. Novo QR Code será gerado.` };
}

function getInstance(instanceId) {
  const configs = loadInstancesConfig();
  const config = configs.find(c => c.id === instanceId);
  if (!config) return null;
  const runtime = runtimeInstances.get(instanceId) || { status: 'disconnected', qrCode: null, user: null };
  return { ...config, status: runtime.status, connected: runtime.status === 'connected', qrCode: runtime.qrCode, user: runtime.user };
}

// ============================================================================
// ROUND-ROBIN & ENVIO
// ============================================================================

function getConnectedInstances() {
  const connected = [];
  for (const [id, runtime] of runtimeInstances.entries()) {
    if (runtime.status === 'connected' && runtime.sock) {
      connected.push({
        id, name: runtime.config.name, color: runtime.config.color,
        phone: runtime.user?.phone || 'Conectado', runtime
      });
    }
  }
  return connected;
}

function getNextRoundRobinInstance() {
  const connected = getConnectedInstances();
  if (connected.length === 0) return null;
  const selected = connected[roundRobinIndex % connected.length];
  roundRobinIndex++;
  return selected;
}

async function resolveJid(target, sock = null) {
  if (!target) return null;
  const str = String(target).trim();

  if (str.endsWith('@lid') || str.endsWith('@g.us') || str.endsWith('@s.whatsapp.net')) {
    return str;
  }

  let digits = str.replace(/\D/g, '');
  if (digits.length === 0) return null;
  if (digits.length === 10 || digits.length === 11) digits = '55' + digits;

  if (sock) {
    try {
      const check1 = await sock.onWhatsApp(digits);
      if (check1?.[0]?.exists && check1[0]?.jid) return check1[0].jid;

      if (digits.startsWith('55')) {
        let altDigits = null;
        if (digits.length === 13 && digits[4] === '9') {
          altDigits = digits.slice(0, 4) + digits.slice(5);
        } else if (digits.length === 12) {
          altDigits = digits.slice(0, 4) + '9' + digits.slice(4);
        }
        if (altDigits) {
          const check2 = await sock.onWhatsApp(altDigits);
          if (check2?.[0]?.exists && check2[0]?.jid) return check2[0].jid;
        }
      }
    } catch (err) { /* ignore */ }
  }

  return `${digits}@s.whatsapp.net`;
}

async function sendTextMessage(phone, text, options = {}) {
  let targetInstance = null;

  if (options.instanceId === 'round-robin') {
    const rr = getNextRoundRobinInstance();
    if (!rr) throw new Error('Nenhuma conta conectada para revezamento.');
    targetInstance = rr.runtime;
  } else if (options.instanceId) {
    const runtime = runtimeInstances.get(options.instanceId);
    if (!runtime || runtime.status !== 'connected' || !runtime.sock) {
      throw new Error(`Conta ${options.instanceId} não está conectada.`);
    }
    targetInstance = runtime;
  } else {
    const connected = getConnectedInstances();
    if (connected.length > 0) targetInstance = connected[0].runtime;
    else throw new Error('Nenhum WhatsApp conectado.');
  }

  const sock = targetInstance.sock;
  const config = targetInstance.config;
  const jid = await resolveJid(phone, sock);
  if (!jid) throw new Error(`Número inválido: ${phone}`);

  console.log(`📤 [${config.name}] Enviando para: ${phone} (JID: ${jid})`);

  try {
    // Simula digitação se solicitado
    if (options.simulateTyping) {
      try {
        await sock.sendPresenceUpdate('composing', jid);
        await new Promise(r => setTimeout(r, 1500 + Math.random() * 2000));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) { /* ignore */ }
    }

    const res = await sock.sendMessage(jid, { text });
    const sentPhone = jid.split('@')[0];
    const timestampIso = new Date().toISOString();

    const sentItem = {
      id: res?.key?.id || `out-${Date.now()}`,
      instanceId: config.id,
      instanceName: config.name,
      instanceColor: config.color || '#10b981',
      remoteJid: jid,
      phone: jid,
      name: options.isAi ? `🤖 IA (${options.agentName || 'Assistente'})` : `Você (${config.name})`,
      text,
      fromMe: true,
      isAiGenerated: !!options.isAi,
      aiAgentName: options.agentName || null,
      aiAgentIcon: options.agentIcon || null,
      timestamp: timestampIso,
      timeFormatted: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dateFormatted: new Date().toLocaleDateString('pt-BR'),
      isNew: false
    };

    receivedMessages.unshift(sentItem);
    saveMessagesToDisk();

    const result = {
      success: true,
      messageId: res?.key?.id,
      jid, phone: sentPhone,
      instanceId: config.id,
      instanceName: config.name,
      isAi: !!options.isAi,
      timestamp: timestampIso
    };

    // Emite evento para logging no Supabase
    emit('onMessageSent', {
      ...result,
      text,
      contactName: options.contactName,
      contactId: options.contactId,
      campaignId: options.campaignId
    });

    console.log(`✅ [${config.name}] Enviado! ID: ${res?.key?.id}`);
    return result;
  } catch (err) {
    console.error(`❌ [${config.name}] Erro ao enviar para ${phone}:`, err);
    throw new Error(err.message || 'Falha ao enviar mensagem');
  }
}

async function sendMediaMessage(phone, base64Data, mimeType, caption, options = {}) {
  let targetInstance = null;

  if (options.instanceId === 'round-robin') {
    const rr = getNextRoundRobinInstance();
    if (!rr) throw new Error('Nenhuma conta conectada para revezamento.');
    targetInstance = rr.runtime;
  } else if (options.instanceId) {
    const runtime = runtimeInstances.get(options.instanceId);
    if (!runtime || runtime.status !== 'connected' || !runtime.sock) {
      throw new Error(`Conta ${options.instanceId} não está conectada.`);
    }
    targetInstance = runtime;
  } else {
    for (const [id, rt] of runtimeInstances.entries()) {
      if (rt.status === 'connected' && rt.sock) { targetInstance = rt; break; }
    }
    if (!targetInstance) throw new Error('Nenhuma conta conectada.');
  }

  const { sock, config } = targetInstance;
  const jid = await resolveJid(phone, sock);
  if (!jid) throw new Error(`Número inválido ou sem WhatsApp: ${phone}`);

  try {
    if (options.simulateTyping !== false) {
      try {
        await sock.presenceSubscribe(jid);
        await sock.sendPresenceUpdate('recording', jid);
        await new Promise(resolve => setTimeout(resolve, 1500));
        await sock.sendPresenceUpdate('paused', jid);
      } catch (e) { /* ignore */ }
    }

    const buffer = Buffer.from(base64Data, 'base64');
    let messagePayload = {};

    if (mimeType.startsWith('image/')) {
      messagePayload = { image: buffer, caption: caption || '' };
    } else if (mimeType.startsWith('audio/')) {
      messagePayload = { audio: buffer, mimetype: mimeType, ptt: true };
    } else if (mimeType.startsWith('video/')) {
      messagePayload = { video: buffer, caption: caption || '' };
    } else if (mimeType.includes('webp')) {
      messagePayload = { sticker: buffer };
    } else {
      const docName = options.fileName || (caption && caption.length < 80 && !caption.includes('\n') ? caption : 'documento.pdf');
      messagePayload = {
        document: buffer,
        mimetype: mimeType || 'application/pdf',
        fileName: docName,
        caption: caption || ''
      };
    }

    const res = await sock.sendMessage(jid, messagePayload);
    const sentPhone = jid.split('@')[0];
    const timestampIso = new Date().toISOString();

    const sentItem = {
      id: res?.key?.id || `out-media-${Date.now()}`,
      instanceId: config.id,
      instanceName: config.name,
      instanceColor: config.color || '#10b981',
      remoteJid: jid,
      phone: jid,
      name: options.isAi ? `🤖 IA (${options.agentName || 'Assistente'})` : `Você (${config.name})`,
      text: caption || `[Mídia enviada: ${mimeType}]`,
      mediaUrl: null, // Omitido localmente para envio por enquanto
      mediaType: mimeType.split('/')[0],
      fromMe: true,
      isAiGenerated: !!options.isAi,
      aiAgentName: options.agentName || null,
      aiAgentIcon: options.agentIcon || null,
      timestamp: timestampIso,
      timeFormatted: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
      dateFormatted: new Date().toLocaleDateString('pt-BR'),
      isNew: false
    };

    receivedMessages.unshift(sentItem);
    saveMessagesToDisk();

    console.log(`✅ [${config.name}] Mídia enviada! ID: ${res?.key?.id}`);
    return { success: true, messageId: res?.key?.id, jid, phone: sentPhone, instanceId: config.id };
  } catch (err) {
    console.error(`❌ [${config.name}] Erro ao enviar mídia para ${phone}:`, err);
    throw new Error(err.message || 'Falha ao enviar mídia');
  }
}

// ============================================================================
// MENSAGENS & STATUS
// ============================================================================

function deleteConversation(targetJid, instanceId = null) {
  if (!targetJid) return { success: false, error: 'JID inválido' };
  const cleanTarget = String(targetJid).trim();
  const cleanPhone = cleanTarget.split('@')[0];
  const beforeCount = receivedMessages.length;

  receivedMessages = receivedMessages.filter(m => {
    if (instanceId && m.instanceId !== instanceId) return true;
    return m.remoteJid !== cleanTarget && m.remoteJid !== cleanPhone &&
           m.phone !== cleanTarget && m.phone !== cleanPhone;
  });

  saveMessagesToDisk();
  return { success: true, jid: cleanTarget, countDeleted: beforeCount - receivedMessages.length };
}

function deleteMessage(messageId) {
  if (!messageId) return { success: false, error: 'ID inválido' };
  const beforeCount = receivedMessages.length;
  receivedMessages = receivedMessages.filter(m => m.id !== messageId);
  if (beforeCount > receivedMessages.length) saveMessagesToDisk();
  return { success: beforeCount > receivedMessages.length, messageId };
}

function getMessages(options = {}) {
  let list = receivedMessages;
  if (options.instanceId) list = list.filter(m => m.instanceId === options.instanceId);
  return list.slice(0, options.limit || 500);
}

function clearMessages(instanceId = null) {
  if (instanceId) {
    receivedMessages = receivedMessages.filter(m => m.instanceId !== instanceId);
  } else {
    receivedMessages = [];
  }
  saveMessagesToDisk();
  return { success: true };
}

function getStatus() {
  const instances = getInstancesList();
  const connectedInstances = instances.filter(i => i.connected);
  const defaultInstance = instances.find(i => i.isDefault) || instances[0];

  return {
    status: connectedInstances.length > 0 ? 'connected' : (instances.some(i => i.status === 'qr_ready') ? 'qr_ready' : 'disconnected'),
    connected: connectedInstances.length > 0,
    totalInstances: instances.length,
    connectedCount: connectedInstances.length,
    instances,
    qrCode: defaultInstance?.qrCode || null,
    user: defaultInstance?.user || null,
    unreadCount: receivedMessages.filter(m => !m.fromMe && m.isNew).length,
    timestamp: new Date().toISOString()
  };
}

async function getProfilePicture(jid, instanceId = null) {
  let sock = null;
  if (instanceId) {
    const inst = runtimeInstances.get(instanceId);
    if (inst) sock = inst.sock;
  } else {
    for (const [, inst] of runtimeInstances.entries()) {
      if (inst.status === 'connected' && inst.sock) { sock = inst.sock; break; }
    }
  }
  if (!sock) return null;
  try { return await sock.profilePictureUrl(jid, 'image'); } catch { return null; }
}

module.exports = {
  initWhatsApp, initAllInstances, initInstance,
  getInstancesList, getInstance, createInstance, deleteInstance,
  renameInstance, logoutInstance,
  getConnectedInstances, getNextRoundRobinInstance,
  sendTextMessage, sendMediaMessage, resolveJid,
  getMessages, deleteConversation, deleteMessage, clearMessages,
  getStatus, getProfilePicture,
  on, emit,
  logout: () => logoutInstance('default')
};
