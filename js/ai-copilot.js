/**
 * MassaZap 2.0 — AI Co-Pilot Module
 * Sugestão de resposta no painel, envio com 1 clique
 */

const AICopilotModule = (() => {

  async function fetchAgentsStatus() {
    try {
      const res = await fetch('/api/ai/status');
      return await res.json();
    } catch { return { connected: false }; }
  }

  async function fetchConfig() {
    try {
      const res = await fetch('/api/ai/config');
      return await res.json();
    } catch { return {}; }
  }

  async function updateConfig(config) {
    const res = await fetch('/api/ai/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config)
    });
    return await res.json();
  }

  async function toggleAutoReply(enabled) {
    return updateConfig({ autoReplyEnabled: enabled });
  }

  async function setActiveAgent(agentKey) {
    return updateConfig({ activeAgent: agentKey });
  }

  async function setChatAgent(jid, agentKey) {
    const res = await fetch('/api/ai/chat-agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, agent: agentKey })
    });
    return await res.json();
  }

  async function setChatMode(jid, mode) {
    const res = await fetch('/api/ai/chat-mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, mode })
    });
    return await res.json();
  }

  async function toggleChatAi(jid, enabled) {
    const res = await fetch('/api/ai/chat-toggle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jid, enabled })
    });
    return await res.json();
  }

  /**
   * Solicita sugestão do Co-Piloto (não envia automaticamente)
   */
  async function requestSuggestion(agentKey, conversationHistory) {
    const res = await fetch('/api/ai/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentKey, history: conversationHistory })
    });
    return await res.json();
  }

  /**
   * Pede resposta ao agente (modo autônomo)
   */
  async function askAgent(agentKey, message, history = []) {
    const res = await fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentKey, message, history })
    });
    return await res.json();
  }

  // ========================================================================
  // CONTEXT FILES (.md)
  // ========================================================================

  async function getContextFiles(agentKey) {
    try {
      const res = await fetch(`/api/ai/context-files?agent=${agentKey || 'general'}`);
      const data = await res.json();
      return data.files || [];
    } catch { return []; }
  }

  async function uploadContextFile(agentKey, fileName, content) {
    const res = await fetch('/api/ai/context-files', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentKey, fileName, content })
    });
    return await res.json();
  }

  async function deleteContextFile(agentKey, fileName) {
    const res = await fetch('/api/ai/context-files', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent: agentKey, fileName })
    });
    return await res.json();
  }

  // ========================================================================
  // UI RENDERING: Suggestion card inside chat
  // ========================================================================

  function renderSuggestionCard(containerId, suggestion, onSend, onEdit) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="copilot-suggestion-card">
        <div class="copilot-header">
          <span class="copilot-icon">${suggestion.agentIcon || '🤖'}</span>
          <span class="copilot-label">Sugestão do ${suggestion.agentName || 'Co-Piloto'}</span>
          <span class="copilot-badge">CO-PILOTO</span>
        </div>
        <div class="copilot-body">
          <div class="copilot-text" id="copilotSuggestionText">${suggestion.reply || 'Sem sugestão.'}</div>
        </div>
        <div class="copilot-actions">
          <button class="btn btn-success btn-sm" id="btnSendSuggestion">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
            Enviar
          </button>
          <button class="btn btn-ghost btn-sm" id="btnEditSuggestion">
            ✏️ Editar
          </button>
          <button class="btn btn-ghost btn-sm" id="btnDismissSuggestion">
            ✖ Descartar
          </button>
        </div>
      </div>
    `;

    document.getElementById('btnSendSuggestion')?.addEventListener('click', () => {
      if (onSend) onSend(suggestion.reply);
      container.innerHTML = '';
    });

    document.getElementById('btnEditSuggestion')?.addEventListener('click', () => {
      const textEl = document.getElementById('copilotSuggestionText');
      if (textEl) {
        textEl.contentEditable = 'true';
        textEl.focus();
        textEl.classList.add('copilot-editing');
        // Update send button to use edited text
        document.getElementById('btnSendSuggestion')?.addEventListener('click', () => {
          if (onSend) onSend(textEl.textContent);
          container.innerHTML = '';
        });
      }
      if (onEdit) onEdit();
    });

    document.getElementById('btnDismissSuggestion')?.addEventListener('click', () => {
      container.innerHTML = '';
    });
  }

  function renderContextFilesPanel(containerId, agentKey, files) {
    const container = document.getElementById(containerId);
    if (!container) return;

    container.innerHTML = `
      <div class="context-files-panel">
        <div class="context-files-header">
          <h4>📄 Documentos de Contexto</h4>
          <button class="btn btn-sm btn-primary" id="btnUploadMd">
            + Upload .md
          </button>
        </div>
        <div class="context-files-list">
          ${files.length === 0 ? '<p class="text-muted">Nenhum documento vinculado.</p>' :
            files.map(f => `
              <div class="context-file-item">
                <span class="context-file-icon">📝</span>
                <div class="context-file-info">
                  <span class="context-file-name">${f.name}</span>
                  <span class="context-file-size">${(f.size / 1024).toFixed(1)} KB</span>
                </div>
                <button class="btn btn-ghost btn-sm btn-danger" onclick="AICopilotModule.deleteContextFile('${agentKey}', '${f.name}').then(() => AICopilotModule.refreshContextPanel('${containerId}', '${agentKey}'))">
                  🗑
                </button>
              </div>
            `).join('')}
        </div>
      </div>
    `;

    document.getElementById('btnUploadMd')?.addEventListener('click', () => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.md,.txt';
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const content = await file.text();
        await uploadContextFile(agentKey, file.name, content);
        refreshContextPanel(containerId, agentKey);
      };
      input.click();
    });
  }

  async function refreshContextPanel(containerId, agentKey) {
    const files = await getContextFiles(agentKey);
    renderContextFilesPanel(containerId, agentKey, files);
  }

  return {
    fetchAgentsStatus, fetchConfig, updateConfig,
    toggleAutoReply, setActiveAgent, setChatAgent, setChatMode, toggleChatAi,
    requestSuggestion, askAgent,
    getContextFiles, uploadContextFile, deleteContextFile,
    renderSuggestionCard, renderContextFilesPanel, refreshContextPanel
  };
})();
