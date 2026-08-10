/**
 * MassaZap 2.0 — Server Principal
 * API REST completa com Supabase, WhatsApp Baileys, Anything LLM
 */

require('dotenv').config();
const http = require('http');
const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const crypto = require('crypto');
const whatsappClient = require('./whatsapp-client');
const aiClient = require('./ai-client');

const PORT = process.env.PORT || 4444;

// ============================================================================
// AUTH CONFIGURATION
// ============================================================================
const AUTH_FILE = path.join(__dirname, 'users.json');
let usersDB = [];
let passwordTokens = {}; // email -> code

try {
  if (fs.existsSync(AUTH_FILE)) {
    usersDB = JSON.parse(fs.readFileSync(AUTH_FILE, 'utf8'));
  }
} catch (e) { console.error('Erro ao ler users.json'); }

function saveUsers() {
  fs.writeFileSync(AUTH_FILE, JSON.stringify(usersDB, null, 2), 'utf8');
}

function parseCookies(request) {
  const list = {};
  const rc = request.headers.cookie;
  if (rc) {
    rc.split(';').forEach(cookie => {
      const parts = cookie.split('=');
      list[parts.shift().trim()] = decodeURI(parts.join('='));
    });
  }
  return list;
}

// ============================================================================
// SUPABASE SERVER-SIDE CLIENT
// ============================================================================
const supabaseUrl = process.env.SUPABASE_URL || 'https://iwpveyworwdymlzdmloq.supabase.co';
const supabaseKey = process.env.SUPABASE_ANON_KEY || '';
let supabase = null;

try {
  if (supabaseUrl && supabaseKey) {
    const ws = require('ws');
    supabase = createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
      global: { headers: { 'x-my-custom-header': 'massazap' } },
      realtime: {
        transport: ws
      }
    });
    console.log('✅ Supabase server-side client inicializado.');
  }
} catch (e) {
  console.warn('⚠️ Supabase não configurado:', e.message);
}

// ============================================================================
// MIME TYPES
// ============================================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon',
  '.woff2': 'font/woff2', '.woff': 'font/woff', '.ttf': 'font/ttf',
  '.md': 'text/markdown; charset=utf-8'
};

// ============================================================================
// HELPERS
// ============================================================================
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(body || '{}')); }
      catch (e) { resolve({}); }
    });
    req.on('error', reject);
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

function jsonError(res, msg, status = 400) {
  json(res, { success: false, error: msg }, status);
}

// ============================================================================
// SUPABASE LOGGING: Registra envios no banco
// ============================================================================
async function logMessageToSupabase(data) {
  if (!supabase) return;
  try {
    await supabase.from('messages_log').insert({
      contact_id: data.contactId || null,
      campaign_id: data.campaignId || null,
      contact_name: data.contactName || null,
      contact_phone: data.phone || data.jid,
      message_final: data.text,
      instance_id: data.instanceId,
      instance_name: data.instanceName,
      send_status: data.success ? 'sent' : 'failed',
      error_message: data.error || null,
      whatsapp_msg_id: data.messageId || null,
      is_ai_generated: data.isAi || false,
      ai_agent_name: data.agentName || null,
      sent_at: data.timestamp || new Date().toISOString()
    });
  } catch (err) {
    console.warn('Supabase log error:', err.message);
  }
}

// Hook de logging automático
whatsappClient.on('onMessageSent', (data) => {
  logMessageToSupabase(data);
});

// Função para quebrar mensagens longas organicamente simulando um humano
function splitOrganicMessage(text) {
  let chunks = text.split(/\n\n+/);
  if (chunks.length === 1) chunks = text.split(/\n/);
  chunks = chunks.map(c => c.trim()).filter(c => c.length > 0);
  
  // Se ainda for um bloco único e muito grande, quebra por frases
  if (chunks.length === 1 && chunks[0].length > 150) {
    const sentences = chunks[0].match(/[^.!?]+[.!?]+/g);
    if (sentences && sentences.length > 1) {
      let merged = [];
      let current = "";
      for (let s of sentences) {
        if ((current.length + s.length) > 100 && current.length > 0) {
          merged.push(current.trim());
          current = s;
        } else {
          current += " " + s;
        }
      }
      if (current.trim().length > 0) merged.push(current.trim());
      chunks = merged;
    }
  }
  return chunks;
}

// Hook de auto-reply por IA
whatsappClient.on('onMessage', async (msg) => {
  try {
    const aiConfig = aiClient.getConfig();
    if (!aiConfig.autoReplyEnabled) return;
    if (!aiClient.isChatAiEnabled(msg.remoteJid)) return;
    if (!msg.text || msg.text === '[Mensagem recebida]') return;

    const chatMode = aiClient.getChatMode(msg.remoteJid);
    if (chatMode === 'off') return;
    if (chatMode === 'copilot') return; // Co-piloto não responde automaticamente

    const agentKey = aiClient.getAgentForChat(msg.remoteJid);
    const delayMin = aiConfig.replyDelayMin || 3;
    const delayMax = aiConfig.replyDelayMax || 7;
    const delayMs = Math.floor(Math.random() * (delayMax - delayMin + 1) + delayMin) * 1000;

    console.log(`🤖 [IA Auto-Reply] Respondendo ${msg.remoteJid} com "${agentKey}" em ${(delayMs/1000).toFixed(1)}s...`);

    setTimeout(async () => {
      try {
        const allMessages = whatsappClient.getMessages({});
        const convHistory = allMessages
          .filter(m => m.remoteJid === msg.remoteJid)
          .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        const aiRes = await aiClient.askAgent(agentKey, msg.text, convHistory);
        if (aiRes?.reply) {
          const chunks = splitOrganicMessage(aiRes.reply);
          for (let i = 0; i < chunks.length; i++) {
            // Pausa orgânica entre balões subsequentes
            if (i > 0) {
              const pauseMs = Math.floor(Math.random() * 2500) + 1500; // 1.5s a 4s
              await new Promise(r => setTimeout(r, pauseMs));
            }
            
            await whatsappClient.sendTextMessage(msg.remoteJid, chunks[i], {
              instanceId: msg.instanceId,
              isAi: true,
              agentName: aiRes.agentName,
              agentIcon: aiRes.agentIcon,
              simulateTyping: true
            });
            console.log(`🤖 [IA] Enviado balão ${i+1}/${chunks.length} para ${msg.remoteJid}`);
          }
        }
      } catch (aiErr) {
        console.error(`❌ [IA Auto-Reply] Erro:`, aiErr.message);
      }
    }, delayMs);
  } catch (err) {
    console.warn('Auto-reply check error:', err.message);
  }
});

// ============================================================================
// HTTP SERVER
// ============================================================================
const server = http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, PUT, PATCH, DELETE');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,content-type,apikey,Authorization');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  const parsedUrl = new URL(req.url, `http://localhost:${PORT}`);
  let pathname = parsedUrl.pathname;

  try {
    // ========================================================================
    // API AUTH
    // ========================================================================
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const payload = await parseBody(req);
      const { email, phone, password } = payload;
      if (!email || !phone || !password) return jsonError(res, 'Dados incompletos');
      if (!email.endsWith('@exdevedor.com.br')) return jsonError(res, 'Acesso restrito');
      
      const existing = usersDB.find(u => u.email === email);
      if (existing) return jsonError(res, 'E-mail já cadastrado');
      
      usersDB.push({ email, phone, password });
      saveUsers();
      return json(res, { success: true });
    }

    // Cadastro manual via painel (ignora restrição de domínio)
    if (pathname === '/api/auth/admin-register' && req.method === 'POST') {
      const payload = await parseBody(req);
      const { email, phone, password } = payload;
      if (!email || !phone || !password) return jsonError(res, 'Dados incompletos');
      
      const existing = usersDB.find(u => u.email === email);
      if (existing) return jsonError(res, 'E-mail já cadastrado');
      
      usersDB.push({ email, phone, password });
      saveUsers();
      return json(res, { success: true });
    }

    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const payload = await parseBody(req);
      const user = usersDB.find(u => u.email === payload.email && u.password === payload.password);
      if (!user) return jsonError(res, 'Credenciais inválidas', 401);
      
      const token = Buffer.from(user.email).toString('base64');
      res.setHeader('Set-Cookie', `auth-token=${token}; Path=/; HttpOnly; Max-Age=86400`);
      return json(res, { success: true });
    }

    if (pathname === '/api/auth/recover' && req.method === 'POST') {
      const payload = await parseBody(req);
      const user = usersDB.find(u => u.email === payload.email);
      if (!user) return jsonError(res, 'Usuário não encontrado');
      
      // Verifica se o WhatsApp fornecido bate com o do banco de dados (ignorando espaços/traços)
      const inputPhone = (payload.phone || '').replace(/\D/g, '');
      const userPhone = (user.phone || '').replace(/\D/g, '');
      
      if (inputPhone !== userPhone) {
        return jsonError(res, 'WhatsApp não confere com o cadastro');
      }
      
      const code = Math.floor(100000 + Math.random() * 900000).toString();
      passwordTokens[user.email] = code;
      
      return json(res, { success: true, token: code });
    }

    if (pathname === '/api/auth/reset' && req.method === 'POST') {
      const payload = await parseBody(req);
      const { email, token, newPassword } = payload;
      if (passwordTokens[email] !== token) return jsonError(res, 'Token inválido');
      
      const user = usersDB.find(u => u.email === email);
      if (user) {
        user.password = newPassword;
        saveUsers();
        delete passwordTokens[email];
        return json(res, { success: true });
      }
      return jsonError(res, 'Erro ao redefinir');
    }

    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      res.setHeader('Set-Cookie', 'auth-token=; Path=/; HttpOnly; Max-Age=0');
      return json(res, { success: true });
    }

    // ========================================================================
    // API WHATSAPP
    // ========================================================================

    // Status Geral
    if (pathname === '/api/whatsapp/status' && req.method === 'GET') {
      return json(res, whatsappClient.getStatus());
    }

    // Listar instâncias
    if (pathname === '/api/whatsapp/instances' && req.method === 'GET') {
      const instances = whatsappClient.getInstancesList();
      return json(res, { success: true, count: instances.length, instances });
    }

    // Criar instância
    if (pathname === '/api/whatsapp/instances' && req.method === 'POST') {
      const payload = await parseBody(req);
      const result = await whatsappClient.createInstance({ name: payload.name, color: payload.color });
      return json(res, result, 201);
    }

    // Operações em instância individual
    if (pathname.startsWith('/api/whatsapp/instances/') && pathname.length > 24) {
      const parts = pathname.replace('/api/whatsapp/instances/', '').split('/');
      const instanceId = parts[0];
      const subAction = parts[1];

      if (!subAction && req.method === 'GET') {
        const instance = whatsappClient.getInstance(instanceId);
        if (!instance) return jsonError(res, 'Instância não encontrada', 404);
        return json(res, { success: true, instance });
      }

      if (!subAction && req.method === 'PUT') {
        const payload = await parseBody(req);
        return json(res, whatsappClient.renameInstance(instanceId, payload));
      }

      if (subAction === 'logout' && req.method === 'POST') {
        return json(res, await whatsappClient.logoutInstance(instanceId));
      }

      if (!subAction && req.method === 'DELETE') {
        return json(res, await whatsappClient.deleteInstance(instanceId));
      }
    }

    // Enviar mensagem
    if (pathname === '/api/whatsapp/send' && req.method === 'POST') {
      const payload = await parseBody(req);
      const phone = payload.phone || payload.number;
      const message = payload.message || payload.text;
      if (!phone || !message) return jsonError(res, '"phone" e "message" são obrigatórios.');

      const result = await whatsappClient.sendTextMessage(phone, message, {
        instanceId: payload.instanceId,
        isAi: payload.isAi,
        agentName: payload.agentName,
        agentIcon: payload.agentIcon,
        contactName: payload.contactName,
        contactId: payload.contactId,
        campaignId: payload.campaignId,
        simulateTyping: payload.simulateTyping
      });
      return json(res, result);
    }

    // Enviar mídia
    if (pathname === '/api/whatsapp/send-media' && req.method === 'POST') {
      const payload = await parseBody(req);
      const { phone, base64Data, mimeType, caption, instanceId } = payload;
      if (!phone || !base64Data || !mimeType) {
        return jsonError(res, '"phone", "base64Data" e "mimeType" são obrigatórios.');
      }

      // Check max size (limit payload size artificially if needed, though parseBody handles it)
      const result = await whatsappClient.sendMediaMessage(phone, base64Data, mimeType, caption, {
        instanceId: instanceId,
        simulateTyping: payload.simulateTyping
      });
      return json(res, result);
    }

    // Logout padrão
    if (pathname === '/api/whatsapp/logout' && req.method === 'POST') {
      return json(res, await whatsappClient.logout());
    }

    // Mensagens
    if (pathname === '/api/whatsapp/messages' && req.method === 'GET') {
      const instanceId = parsedUrl.searchParams.get('instanceId') || null;
      const messages = whatsappClient.getMessages({ instanceId });
      return json(res, { success: true, messages, total: messages.length });
    }

    // Foto de perfil
    if (pathname === '/api/whatsapp/profile-picture' && req.method === 'GET') {
      const jid = parsedUrl.searchParams.get('jid');
      if (!jid) return jsonError(res, '"jid" é obrigatório.');
      const url = await whatsappClient.getProfilePicture(jid, parsedUrl.searchParams.get('instanceId'));
      return json(res, { success: true, url });
    }

    // Limpar mensagens
    if (pathname === '/api/whatsapp/messages/clear' && req.method === 'POST') {
      const payload = await parseBody(req);
      return json(res, whatsappClient.clearMessages(payload.instanceId));
    }

    // Excluir conversa
    if (pathname === '/api/whatsapp/delete-conversation' && req.method === 'POST') {
      const payload = await parseBody(req);
      if (!payload.jid) return jsonError(res, '"jid" é obrigatório.');
      return json(res, whatsappClient.deleteConversation(payload.jid, payload.instanceId));
    }

    // Excluir mensagem
    if (pathname === '/api/whatsapp/delete-message' && req.method === 'POST') {
      const payload = await parseBody(req);
      return json(res, whatsappClient.deleteMessage(payload.messageId || payload.id));
    }

    // ========================================================================
    // API INTELIGÊNCIA ARTIFICIAL
    // ========================================================================

    if (pathname === '/api/ai/status' && req.method === 'GET') {
      return json(res, await aiClient.checkStatus());
    }

    if (pathname === '/api/ai/config' && req.method === 'GET') {
      return json(res, aiClient.getConfig());
    }

    if (pathname === '/api/ai/config' && req.method === 'POST') {
      const payload = await parseBody(req);
      return json(res, { success: true, config: aiClient.updateConfig(payload) });
    }

    if (pathname === '/api/ai/agents' && req.method === 'POST') {
      const payload = await parseBody(req);
      const { id, name, icon, description, promptPrefix, defaultMode, theme, workspaceSlug } = payload;
      if (!id || !name) return jsonError(res, 'ID e Nome são obrigatórios');

      const config = aiClient.getConfig();
      const customAgents = config.customAgents || {};
      
      customAgents[id] = {
        id,
        name,
        icon: icon || '🤖',
        description: description || '',
        fallbackWorkspace: 'meu-workspace',
        workspaceSlug: workspaceSlug || id,
        promptPrefix: promptPrefix || '',
        defaultMode: defaultMode || 'copilot',
        theme: theme || 'blue'
      };

      aiClient.updateConfig({ customAgents });
      return json(res, { success: true, agent: customAgents[id] });
    }

    if (pathname.startsWith('/api/ai/agents/') && req.method === 'DELETE') {
      const agentId = pathname.split('/').pop();
      const config = aiClient.getConfig();
      const customAgents = config.customAgents || {};
      
      if (customAgents[agentId]) {
        delete customAgents[agentId];
        aiClient.updateConfig({ customAgents });
      }
      return json(res, { success: true });
    }

    if (pathname === '/api/ai/chat-toggle' && req.method === 'POST') {
      const payload = await parseBody(req);
      return json(res, aiClient.toggleChatAi(payload.jid, payload.enabled));
    }

    if (pathname === '/api/ai/chat-agent' && req.method === 'POST') {
      const payload = await parseBody(req);
      return json(res, aiClient.setChatAgent(payload.jid, payload.agent));
    }

    if (pathname === '/api/ai/chat-mode' && req.method === 'POST') {
      const payload = await parseBody(req);
      return json(res, aiClient.setChatMode(payload.jid, payload.mode));
    }

    // Chat com IA (modo autônomo)
    if (pathname === '/api/ai/chat' && req.method === 'POST') {
      const payload = await parseBody(req);
      const message = payload.message || payload.prompt;
      if (!message) return jsonError(res, '"message" é obrigatório.');
      const result = await aiClient.askAgent(
        payload.agent || payload.agentKey || 'tira-duvidas',
        message, payload.history || []
      );
      return json(res, result);
    }

    // Sugestão Co-Piloto (gera sugestão sem enviar)
    if (pathname === '/api/ai/suggest' && req.method === 'POST') {
      const payload = await parseBody(req);
      const result = await aiClient.suggestReply(
        payload.agent || 'tira-duvidas',
        payload.history || []
      );
      return json(res, result);
    }

    // ========================================================================
    // API CONTEXT FILES (.md)
    // ========================================================================

    if (pathname === '/api/ai/context-files' && req.method === 'GET') {
      const agentKey = parsedUrl.searchParams.get('agent') || 'general';
      return json(res, { success: true, files: aiClient.getContextFiles(agentKey) });
    }

    if (pathname === '/api/ai/context-files' && req.method === 'POST') {
      const payload = await parseBody(req);
      if (!payload.fileName || !payload.content) {
        return jsonError(res, '"fileName" e "content" são obrigatórios.');
      }
      const result = aiClient.saveContextFile(payload.agent || 'general', payload.fileName, payload.content);
      return json(res, result);
    }

    if (pathname === '/api/ai/context-files' && req.method === 'DELETE') {
      const payload = await parseBody(req);
      if (!payload.fileName) return jsonError(res, '"fileName" é obrigatório.');
      return json(res, aiClient.deleteContextFile(payload.agent || 'general', payload.fileName));
    }

    // ========================================================================
    // API CAMPANHAS (SUPABASE)
    // ========================================================================

    if (pathname === '/api/campaigns' && req.method === 'GET') {
      if (!supabase) return jsonError(res, 'Supabase não configurado', 503);
      const { data, error } = await supabase
        .from('campaigns')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) return jsonError(res, error.message, 500);
      return json(res, { success: true, campaigns: data });
    }

    if (pathname === '/api/campaigns' && req.method === 'POST') {
      if (!supabase) return jsonError(res, 'Supabase não configurado', 503);
      const payload = await parseBody(req);
      const { data, error } = await supabase
        .from('campaigns')
        .insert({
          name: payload.name || `Campanha ${new Date().toLocaleDateString('pt-BR')}`,
          description: payload.description,
          template_text: payload.template_text || payload.template,
          delay_min: payload.delay_min || 20,
          delay_max: payload.delay_max || 50,
          total_contacts: payload.total_contacts || 0,
          instance_id: payload.instance_id || 'round-robin',
          filter_region: payload.filter_region,
          filter_profession: payload.filter_profession,
          filter_tags: payload.filter_tags,
          filter_status: payload.filter_status,
          status: 'draft'
        })
        .select()
        .single();
      if (error) return jsonError(res, error.message, 500);
      return json(res, { success: true, campaign: data }, 201);
    }

    // Estatísticas de uma campanha
    if (pathname.startsWith('/api/campaigns/') && pathname.endsWith('/stats') && req.method === 'GET') {
      if (!supabase) return jsonError(res, 'Supabase não configurado', 503);
      const campaignId = pathname.replace('/api/campaigns/', '').replace('/stats', '');
      
      const { data: campaign } = await supabase
        .from('campaigns').select('*').eq('id', campaignId).single();
      
      const { data: messages } = await supabase
        .from('messages_log').select('send_status, reply_status').eq('campaign_id', campaignId);

      const stats = {
        total: messages?.length || 0,
        sent: messages?.filter(m => m.send_status === 'sent').length || 0,
        delivered: messages?.filter(m => m.send_status === 'delivered').length || 0,
        read: messages?.filter(m => m.send_status === 'read').length || 0,
        failed: messages?.filter(m => m.send_status === 'failed').length || 0,
        replied: messages?.filter(m => m.reply_status !== 'no_reply').length || 0
      };
      stats.replyRate = stats.total > 0 ? ((stats.replied / stats.total) * 100).toFixed(1) : 0;

      return json(res, { success: true, campaign, stats });
    }

    // Atualizar status da campanha
    if (pathname.startsWith('/api/campaigns/') && req.method === 'PATCH') {
      if (!supabase) return jsonError(res, 'Supabase não configurado', 503);
      const campaignId = pathname.replace('/api/campaigns/', '');
      const payload = await parseBody(req);
      const { data, error } = await supabase
        .from('campaigns').update(payload).eq('id', campaignId).select().single();
      if (error) return jsonError(res, error.message, 500);
      return json(res, { success: true, campaign: data });
    }

    // ========================================================================
    // API DASHBOARD MÉTRICAS
    // ========================================================================

    if (pathname === '/api/dashboard/metrics' && req.method === 'GET') {
      if (!supabase) return jsonError(res, 'Supabase não configurado', 503);

      const period = parsedUrl.searchParams.get('period') || '7d';
      let dateFilter = new Date();
      if (period === '7d') dateFilter.setDate(dateFilter.getDate() - 7);
      else if (period === '30d') dateFilter.setDate(dateFilter.getDate() - 30);
      else if (period === '90d') dateFilter.setDate(dateFilter.getDate() - 90);
      else dateFilter.setDate(dateFilter.getDate() - 7);

      const [messagesRes, campaignsRes, contactsRes] = await Promise.all([
        supabase.from('messages_log').select('send_status, reply_status, is_ai_generated, sent_at')
          .gte('created_at', dateFilter.toISOString()),
        supabase.from('campaigns').select('id, name, status, total_contacts, total_sent, total_failed')
          .order('created_at', { ascending: false }).limit(10),
        supabase.from('profiles').select('id, contact_status, profession, region', { count: 'exact' })
      ]);

      const msgs = messagesRes.data || [];
      const metrics = {
        period,
        messages: {
          total: msgs.length,
          sent: msgs.filter(m => m.send_status === 'sent').length,
          delivered: msgs.filter(m => m.send_status === 'delivered').length,
          read: msgs.filter(m => m.send_status === 'read').length,
          failed: msgs.filter(m => m.send_status === 'failed').length,
          replied: msgs.filter(m => m.reply_status !== 'no_reply').length,
          aiGenerated: msgs.filter(m => m.is_ai_generated).length
        },
        campaigns: campaignsRes.data || [],
        contacts: {
          total: contactsRes.count || 0,
          byStatus: {}
        }
      };

      // Agrupar contatos por status
      for (const c of (contactsRes.data || [])) {
        const st = c.contact_status || 'Novo';
        metrics.contacts.byStatus[st] = (metrics.contacts.byStatus[st] || 0) + 1;
      }

      // Taxas
      metrics.messages.replyRate = metrics.messages.total > 0
        ? ((metrics.messages.replied / metrics.messages.total) * 100).toFixed(1) : 0;
      metrics.messages.deliveryRate = metrics.messages.total > 0
        ? ((metrics.messages.delivered / metrics.messages.total) * 100).toFixed(1) : 0;

      return json(res, { success: true, metrics });
    }

    // ========================================================================
    // API MESSAGES LOG (SUPABASE)
    // ========================================================================

    if (pathname === '/api/messages/log' && req.method === 'POST') {
      const payload = await parseBody(req);
      await logMessageToSupabase(payload);
      return json(res, { success: true });
    }

    if (pathname === '/api/messages/log' && req.method === 'GET') {
      if (!supabase) return jsonError(res, 'Supabase não configurado', 503);
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '100');
      const campaignId = parsedUrl.searchParams.get('campaign_id');

      let query = supabase.from('messages_log').select('*').order('created_at', { ascending: false }).limit(limit);
      if (campaignId) query = query.eq('campaign_id', campaignId);

      const { data, error } = await query;
      if (error) return jsonError(res, error.message, 500);
      return json(res, { success: true, logs: data });
    }

    // ========================================================================
    // PROXY EXTERNO (n8n / outros)
    // ========================================================================
    if (pathname === '/api/proxy' && req.method === 'POST') {
      const payload = await parseBody(req);
      if (!payload.url) return jsonError(res, '"url" é obrigatório no proxy.');

      const fetchOptions = {
        method: payload.method || 'GET',
        headers: payload.headers || {}
      };
      const targetBody = payload.data ? (typeof payload.data === 'string' ? payload.data : JSON.stringify(payload.data)) : undefined;
      if (targetBody && ['POST', 'PUT', 'PATCH'].includes(fetchOptions.method)) {
        fetchOptions.body = targetBody;
      }

      try {
        const response = await fetch(payload.url, fetchOptions);
        const text = await response.text();
        let responseJson;
        try { responseJson = text ? JSON.parse(text) : {}; } catch { responseJson = { raw: text }; }
        return json(res, responseJson, response.status);
      } catch (err) {
        return jsonError(res, `Falha proxy: ${err.message}`, 502);
      }
    }

    // ========================================================================
    // ARQUIVOS ESTÁTICOS & PROTEÇÃO
    // ========================================================================
    if (pathname === '/') pathname = '/index.html';

    const safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
    const filePath = path.join(__dirname, safePath);

    // Proteção da tela principal
    if (safePath === 'index.html' || safePath.startsWith('api/')) {
      // Deixar APIs abertas por enquanto, exceto se eu quiser proteger. 
      // Focando na tela principal:
      if (safePath === 'index.html') {
        const cookies = parseCookies(req);
        if (!cookies['auth-token']) {
          res.writeHead(302, { Location: '/login.html' });
          return res.end();
        }
        
        // Verifica se token corresponde a algum usuário válido
        const emailBase64 = cookies['auth-token'];
        const emailDecoded = Buffer.from(emailBase64, 'base64').toString('ascii');
        const userExists = usersDB.find(u => u.email === emailDecoded);
        
        if (!userExists) {
          res.writeHead(302, { Location: '/login.html' });
          return res.end();
        }
      }
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<h1>404</h1><p>${safePath} não encontrado.</p>`);
        return;
      }

      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, {
        'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
        'Cache-Control': 'no-cache'
      });
      fs.createReadStream(filePath).pipe(res);
    });
  } catch (err) {
    console.error('Server error:', err);
    jsonError(res, err.message, 500);
  }
});

server.listen(PORT, async () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Unico — CRM WhatsApp Multi-Agentes`);
  console.log(`🌐 http://localhost:${PORT}`);
  console.log(`======================================================\n`);

  await whatsappClient.initWhatsApp();
});
