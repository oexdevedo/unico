/**
 * MassaZap 2.0 — AI Client (AnythingLLM Integration)
 * Suporte a modo Autônomo, Co-Piloto, upload de contexto .md
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, 'ai_config.json');
const UPLOADS_DIR = path.join(__dirname, 'uploads');

// Garante que a pasta de uploads existe
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const WHATSAPP_HUMAN_DIRECTIVE = `[DIRETRIZ DE LINGUAGEM WHATSAPP — EXTREMAMENTE IMPORTANTE]:
Você é uma pessoa real conversando informalmente pelo WhatsApp. NUNCA fale como robô, inteligência artificial, manual ou assistente corporativo.

REGRAS OBRIGATÓRIAS:
1. FRASES CURTAS E NATURAIS: Escreva em frases curtas e ágeis, exatamente como humanos conversam no WhatsApp.
2. NUNCA ENVIE TEXTÕES: Jamais envie parágrafos longos, blocos densos ou listas de tópicos. Responda em no máximo 1 a 3 frases curtas.
3. QUEBRE EM BALÕES SEPARADOS: Use quebra de linha dupla (\\n\\n) entre ideias ou frases diferentes para que sejam enviadas como mensagens individuais no chat.
4. DIÁLOGO DINÂMICO (PING-PONG): Responda apenas o essencial de forma acolhedora e SEMPRE termine com uma pergunta curta e natural para continuar a conversa.
5. LINGUAGEM BRASILEIRA NATURAL: Use tom empático, amigável e descontraído (ex: "opa, tudo bem?", "então...", "olha só", "me conta:", "beleza?", "show", "tranquilo", "vamos ver isso juntos").
6. PROIBIDO saudações formais antiquadas (ex: "Prezado", "Como posso ajudá-lo hoje?", "Espero que este e-mail...").`;

const DEFAULT_CONFIG = {
  baseUrl: process.env.ANYTHINGLLM_BASE_URL || 'https://area-51-anything-llm.mypaeg.easypanel.host',
  apiKey: process.env.ANYTHINGLLM_API_KEY || 'BGJ66NS-Q2N4TJ9-GQ7HVR0-NX0E70G',
  autoReplyEnabled: false,
  activeAgent: 'tira-duvidas',
  replyDelayMin: 3,
  replyDelayMax: 6,
  disabledChats: [],
  perChatAgents: {},
  perChatModes: {},  // JID → 'autonomous' | 'copilot' | 'off'
  agentWorkspaces: {
    'tira-duvidas': 'tira-duvidas',
    'vendedor': 'vendedor',
    'auxiliar': 'auxiliar'
  },
  customAgents: {
    'tira-duvidas': {
      id: 'tira-duvidas',
      name: 'Tira Dúvidas',
      icon: '🧠',
      description: 'Especialista em tirar dúvidas de finanças e mentoria em frases curtas e acolhedoras.',
      fallbackWorkspace: 'meu-workspace',
      promptPrefix: 'Você é o especialista do Raio X Financeiro no WhatsApp. Converse com calma, empatia e clareza, em frases curtas e diretas. Entenda o que a pessoa precisa e faça perguntas simples para ajudar.',
      defaultMode: 'autonomous',
      theme: 'blue'
    },
    'vendedor': {
      id: 'vendedor',
      name: 'Vendedor',
      icon: '💼',
      description: 'Consultor de vendas do Raio X, focado em conversação leve e fechamento consultivo.',
      fallbackWorkspace: 'meu-workspace',
      promptPrefix: 'Você é o consultor do Raio X Financeiro no WhatsApp. Converse de forma leve, próxima e amigável. Mostre os benefícios da mentoria em poucas palavras e faça perguntas curtas para avançar a conversa.',
      defaultMode: 'autonomous',
      theme: 'yellow'
    },
    'auxiliar': {
      id: 'auxiliar',
      name: 'Auxiliar',
      icon: '🤝',
      description: 'Suporte rápido e acolhedor para triagem e direcionamento.',
      fallbackWorkspace: 'meu-workspace',
      promptPrefix: 'Você é o suporte do Raio X Financeiro no WhatsApp. Seja muito simpático, rápido e direto ao ponto em frases curtas, orientando a pessoa sem enrolação.',
      defaultMode: 'copilot',
      theme: 'green'
    }
  }
};

let currentConfig = loadConfig();

function getAgentsMeta() {
  return currentConfig.customAgents || {};
}

function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return { ...DEFAULT_CONFIG, ...data };
    }
  } catch (e) {
    console.error('Erro ao carregar ai_config.json:', e);
  }
  return { ...DEFAULT_CONFIG };
}

function saveConfig(config) {
  try {
    currentConfig = { ...currentConfig, ...config };
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(currentConfig, null, 2), 'utf8');
    return currentConfig;
  } catch (e) {
    console.error('Erro ao salvar ai_config.json:', e);
    throw e;
  }
}

// ============================================================================
// CONTROLE POR CHAT
// ============================================================================

function isChatAiEnabled(jid) {
  if (!currentConfig.autoReplyEnabled) return false;
  if (!jid) return true;
  const cleanJid = String(jid).trim();
  const cleanPhone = cleanJid.split('@')[0];
  const disabledList = currentConfig.disabledChats || [];
  return !disabledList.includes(cleanJid) && !disabledList.includes(cleanPhone);
}

function getChatMode(jid) {
  if (jid && currentConfig.perChatModes && currentConfig.perChatModes[jid]) {
    return currentConfig.perChatModes[jid];
  }
  const agentKey = getAgentForChat(jid);
  const meta = getAgentsMeta();
  return meta[agentKey]?.defaultMode || 'autonomous';
}

function setChatMode(jid, mode) {
  if (!jid || !['autonomous', 'copilot', 'off'].includes(mode)) {
    return { success: false, error: 'Parâmetros inválidos' };
  }
  const perChatModes = { ...(currentConfig.perChatModes || {}) };
  perChatModes[jid] = mode;
  saveConfig({ perChatModes });
  return { success: true, jid, mode };
}

function toggleChatAi(jid, enabled) {
  if (!jid) return { success: false, error: 'JID inválido' };
  const cleanJid = String(jid).trim();
  const cleanPhone = cleanJid.split('@')[0];
  let disabledList = [...(currentConfig.disabledChats || [])];

  if (enabled) {
    disabledList = disabledList.filter(item => item !== cleanJid && item !== cleanPhone);
  } else {
    if (!disabledList.includes(cleanJid)) disabledList.push(cleanJid);
  }

  saveConfig({ disabledChats: disabledList });
  return { success: true, jid: cleanJid, aiEnabled: enabled };
}

function setChatAgent(jid, agentKey) {
  if (!jid || !AGENTS_META[agentKey]) return { success: false, error: 'Parâmetros inválidos' };
  const perChatAgents = { ...(currentConfig.perChatAgents || {}) };
  perChatAgents[jid] = agentKey;
  saveConfig({ perChatAgents });
  return { success: true, jid, agent: agentKey };
}

function getAgentForChat(jid) {
  if (jid && currentConfig.perChatAgents && currentConfig.perChatAgents[jid]) {
    return currentConfig.perChatAgents[jid];
  }
  return currentConfig.activeAgent || 'tira-duvidas';
}

// ============================================================================
// CONTEXTO .MD
// ============================================================================

function getContextFiles(agentKey) {
  const dir = path.join(UPLOADS_DIR, agentKey || 'general');
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.md'))
    .map(f => {
      const filePath = path.join(dir, f);
      const stats = fs.statSync(filePath);
      return {
        name: f,
        path: filePath,
        size: stats.size,
        updatedAt: stats.mtime.toISOString()
      };
    });
}

function readContextContent(agentKey) {
  const files = getContextFiles(agentKey);
  if (files.length === 0) return '';

  return files.map(f => {
    try {
      return `\n--- DOCUMENTO: ${f.name} ---\n${fs.readFileSync(f.path, 'utf8')}\n--- FIM DOCUMENTO ---\n`;
    } catch (e) {
      return '';
    }
  }).join('\n');
}

function saveContextFile(agentKey, fileName, content) {
  const dir = path.join(UPLOADS_DIR, agentKey || 'general');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const filePath = path.join(dir, safeName.endsWith('.md') ? safeName : `${safeName}.md`);
  fs.writeFileSync(filePath, content, 'utf8');
  return { success: true, path: filePath, name: path.basename(filePath) };
}

function deleteContextFile(agentKey, fileName) {
  const filePath = path.join(UPLOADS_DIR, agentKey || 'general', fileName);
  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return { success: true };
  }
  return { success: false, error: 'Arquivo não encontrado' };
}

// ============================================================================
// ANYTHING LLM API
// ============================================================================

async function checkStatus() {
  const { baseUrl, apiKey } = currentConfig;
  try {
    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/auth`, {
      method: 'GET',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }
    });

    if (!res.ok) return { connected: false, error: `HTTP ${res.status}` };

    const data = await res.json();
    return {
      connected: !!data.authenticated,
      baseUrl,
      activeAgent: currentConfig.activeAgent,
      autoReplyEnabled: currentConfig.autoReplyEnabled,
      disabledChats: currentConfig.disabledChats || [],
      perChatAgents: currentConfig.perChatAgents || {},
      perChatModes: currentConfig.perChatModes || {},
      agents: AGENTS_META
    };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

function formatWhatsAppText(rawText) {
  if (!rawText) return '';
  let text = String(rawText).trim();
  text = text.replace(/```json[\s\S]*?```/gi, '').trim();
  text = text.replace(/```[\s\S]*?```/gi, '').trim();
  if (text.startsWith('"') && text.endsWith('"') && text.length > 2) {
    text = text.slice(1, -1).trim();
  }
  // Remove markdown headers like ### or ##
  text = text.replace(/^#{1,6}\s+/gm, '');
  // Remove robotic bullet points if at line start to make natural
  text = text.replace(/^[\*\-]\s+/gm, '');
  text = text.replace(/\n{3,}/g, '\n\n');
  return text;
}

/**
 * Envia prompt ao AnythingLLM e obtém resposta
 */
async function askAgent(agentKey, userMessage, conversationHistory = []) {
  const meta = getAgentsMeta();
  const agent = meta[agentKey] || meta['tira-duvidas'];

  if (!agent) {
    return { success: false, error: 'Agente não encontrado no sistema.' };
  }

  // 1. Extrair workspace slug da nova estrutura ou do mapeamento antigo
  const { baseUrl, apiKey, agentWorkspaces } = currentConfig;
  const workspaceSlug = agent.workspaceSlug || (agentWorkspaces ? agentWorkspaces[agentKey] : null) || agent.id;

  // Monta histórico
  let historyBlock = '';
  if (Array.isArray(conversationHistory) && conversationHistory.length > 0) {
    const validMessages = conversationHistory
      .filter(m => m && m.text && m.text !== '[Mensagem recebida]')
      .slice(-8);

    if (validMessages.length > 0) {
      const lines = validMessages.map(m => {
        const role = m.fromMe ? 'Atendente / Você' : (m.name || 'Contato');
        return `[${role}]: ${m.text}`;
      });
      historyBlock = `\n\n--- HISTÓRICO RECENTE DA CONVERSA ---\n${lines.join('\n')}\n------------------------------------\n\n`;
    }
  }

  // Contexto .md
  const contextBlock = readContextContent(agentKey);
  const contextSection = contextBlock ? `\n\n--- BASE DE CONHECIMENTO (${agentKey}) ---${contextBlock}--- FIM BASE ---\n\n` : '';

  const prompt = `${WHATSAPP_HUMAN_DIRECTIVE}\n\n[INSTRUÇÃO ESPECÍFICA DO SEU PAPEL]:\n${agent.promptPrefix}${contextSection}${historyBlock}Última mensagem enviada pelo contato: "${userMessage}"\n\nResponda agora ao contato em 1 a 3 frases curtas e humanizadas pelo WhatsApp (sem formalidades, sem textão):`;

  try {
    const url = `${baseUrl.replace(/\/$/, '')}/api/v1/workspace/${encodeURIComponent(workspaceSlug)}/chat`;

    let res = await fetch(url, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: prompt, mode: 'chat' })
    });

    // Fallback workspace
    if (!res.ok && agent.fallbackWorkspace && agent.fallbackWorkspace !== workspaceSlug) {
      console.warn(`⚠️ Workspace "${workspaceSlug}" falhou (${res.status}). Usando fallback...`);
      const fallbackUrl = `${baseUrl.replace(/\/$/, '')}/api/v1/workspace/${encodeURIComponent(agent.fallbackWorkspace)}/chat`;
      res = await fetch(fallbackUrl, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt, mode: 'chat' })
      });
    }

    if (!res.ok) {
      const errBody = await res.text();
      throw new Error(`AnythingLLM (${res.status}): ${errBody}`);
    }

    const data = await res.json();
    const rawReply = data.textResponse || data.response || data.reply || '';
    const formattedReply = formatWhatsAppText(rawReply);

    return {
      success: true,
      agent: agentKey,
      agentName: agent.name,
      agentIcon: agent.icon,
      reply: formattedReply,
      raw: rawReply,
      metrics: data.metrics || null
    };
  } catch (err) {
    console.error(`❌ Erro IA (${agentKey}):`, err);
    throw err;
  }
}

/**
 * Modo Co-Piloto: gera sugestão SEM enviar automaticamente
 */
async function suggestReply(agentKey, conversationHistory = []) {
  const lastUserMessage = [...conversationHistory]
    .reverse()
    .find(m => !m.fromMe && m.text && m.text !== '[Mensagem recebida]');

  if (!lastUserMessage) {
    return { success: false, error: 'Nenhuma mensagem do contato encontrada para sugerir resposta.' };
  }

  const result = await askAgent(agentKey, lastUserMessage.text, conversationHistory);
  return {
    ...result,
    mode: 'copilot',
    suggestion: true,
    originalMessage: lastUserMessage.text
  };
}

module.exports = {
  getConfig: () => currentConfig,
  updateConfig: saveConfig,
  isChatAiEnabled,
  getChatMode,
  setChatMode,
  toggleChatAi,
  setChatAgent,
  saveConfig,
  getAgentsMeta,
  getAgentForChat,
  checkStatus,
  askAgent,
  suggestReply,
  formatWhatsAppText,
  // Context files
  getContextFiles,
  readContextContent,
  saveContextFile,
  deleteContextFile
};
