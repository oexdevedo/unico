/**
 * MassaZap 2.0 — WhatsApp Direct Frontend Wrapper
 * Comunicação do frontend com a API do backend Baileys
 */

const WhatsAppDirect = (() => {
  let pollingInterval = null;
  let lastMessageCount = 0;
  const messageCallbacks = [];

  function init() {
    // Start polling for new messages every 3 seconds
    if (pollingInterval) clearInterval(pollingInterval);
    pollingInterval = setInterval(async () => {
      try {
        const res = await fetch('/api/whatsapp/messages?limit=50');
        const data = await res.json();
        if (data.success && data.messages) {
          const inbound = data.messages.filter(m => !m.fromMe && m.isNew);
          if (inbound.length > lastMessageCount) {
            const newMsgs = inbound.slice(0, inbound.length - lastMessageCount);
            for (const msg of newMsgs) {
              for (const cb of messageCallbacks) {
                try { cb(msg); } catch (e) {}
              }
            }
          }
          lastMessageCount = inbound.length;
        }
      } catch (e) { /* silent */ }
    }, 3000);
  }

  function onNewMessage(callback) {
    if (typeof callback === 'function') messageCallbacks.push(callback);
  }

  async function fetchStatus() {
    try {
      const res = await fetch('/api/whatsapp/status');
      return await res.json();
    } catch (e) {
      return { connected: false, error: e.message };
    }
  }

  async function fetchInstances() {
    try {
      const res = await fetch('/api/whatsapp/instances');
      const data = await res.json();
      return data.instances || [];
    } catch (e) {
      return [];
    }
  }

  async function createInstance(name, color) {
    const res = await fetch('/api/whatsapp/instances', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
    return await res.json();
  }

  async function deleteInstance(instanceId) {
    const res = await fetch(`/api/whatsapp/instances/${instanceId}`, { method: 'DELETE' });
    return await res.json();
  }

  async function renameInstance(instanceId, name, color) {
    const res = await fetch(`/api/whatsapp/instances/${instanceId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color })
    });
    return await res.json();
  }

  async function logoutInstance(instanceId) {
    const res = await fetch(`/api/whatsapp/instances/${instanceId}/logout`, { method: 'POST' });
    return await res.json();
  }

  async function toggleInstance(instanceId, enabled) {
    const res = await fetch(`/api/whatsapp/instances/${instanceId}/toggle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled })
    });
    return await res.json();
  }

  async function sendMessage(phone, text, options = {}) {
    const res = await fetch('/api/whatsapp/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone, message: text,
        instanceId: options.instanceId,
        contactName: options.contactName,
        contactId: options.contactId,
        campaignId: options.campaignId,
        simulateTyping: options.simulateTyping,
        isAi: options.isAi,
        agentName: options.agentName
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Falha ao enviar');
    return data;
  }

  async function sendMediaMessage(phone, base64Data, mimeType, caption, options = {}) {
    const res = await fetch('/api/whatsapp/send-media', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        phone, base64Data, mimeType, caption,
        fileName: options.fileName,
        contactName: options.contactName,
        contactId: options.contactId,
        campaignId: options.campaignId,
        instanceId: options.instanceId,
        simulateTyping: options.simulateTyping
      })
    });
    const data = await res.json();
    if (!data.success) throw new Error(data.error || 'Falha ao enviar mídia');
    return data;
  }

  async function fetchMessages(instanceId = null) {
    const url = instanceId ? `/api/whatsapp/messages?instanceId=${instanceId}` : '/api/whatsapp/messages';
    const res = await fetch(url);
    const data = await res.json();
    return data.messages || [];
  }

  async function deleteConversation(jid, instanceId = null) {
    const res = await fetch('/api/whatsapp/delete-conversation', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, instanceId })
    });
    return await res.json();
  }

  async function getProfilePicture(jid, instanceId = null) {
    try {
      const params = new URLSearchParams({ jid });
      if (instanceId) params.append('instanceId', instanceId);
      const res = await fetch(`/api/whatsapp/profile-picture?${params}`);
      const data = await res.json();
      return data.url || null;
    } catch { return null; }
  }

  return {
    init, onNewMessage, fetchStatus, fetchInstances,
    createInstance, deleteInstance, renameInstance, logoutInstance, toggleInstance,
    sendMessage, sendMediaMessage, fetchMessages, deleteConversation, getProfilePicture
  };
})();
