/**
 * MassaZap 2.0 — Main Application Controller
 * Orchestrates all modules: WhatsApp, Supabase, AI, Dashboard, Dispatcher
 */

const App = (() => {
  let currentTab = 'tab-dashboard';
  let selectedChatJid = null;
  let selectedChatInstance = null;
  let chatMessages = [];
  let pollingTimer = null;
  let pendingAttachment = null;

  // ========================================================================
  // INIT
  // ========================================================================
  async function init() {
    console.log(' MassaZap 2.0 inicializando...');

    // Initialize modules
    SupabaseModule.init();
    WhatsAppDirect.init();

    // Setup event listeners
    setupThemeToggle();
    setupNavigation();
    setupHeaderControls();
    setupContactsTab();
    setupDispatcherTab();
    setupInboxTab();
    setupAITab();
    setupSettingsTab();

    // Initial data load
    await loadInitialData();

    // Start polling
    startPolling();

    console.log(' MassaZap 2.0 pronto!');
  }

  // ========================================================================
  // THEME TOGGLE
  // ========================================================================
  function setupThemeToggle() {
    const btn = document.getElementById('btnThemeToggle');
    const iconSun = document.getElementById('iconSun');
    const iconMoon = document.getElementById('iconMoon');
    
    // Check saved theme or system preference
    const savedTheme = localStorage.getItem('massazap-theme');
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    
    let isDark = savedTheme ? savedTheme === 'dark' : prefersDark;
    
    // Default in index.html is dark, so adjust if needed
    if (!isDark) {
      document.body.classList.remove('dark-theme');
    } else {
      document.body.classList.add('dark-theme');
    }
    
    updateThemeIcons(isDark, iconSun, iconMoon);

    if (btn) {
      btn.addEventListener('click', () => {
        isDark = !document.body.classList.contains('dark-theme');
        if (isDark) {
          document.body.classList.add('dark-theme');
          localStorage.setItem('massazap-theme', 'dark');
        } else {
          document.body.classList.remove('dark-theme');
          localStorage.setItem('massazap-theme', 'light');
        }
        updateThemeIcons(isDark, iconSun, iconMoon);
      });
    }
  }

  function updateThemeIcons(isDark, sun, moon) {
    if (sun && moon) {
      sun.style.display = isDark ? 'none' : 'block';
      moon.style.display = isDark ? 'block' : 'none';
    }
  }

  // ========================================================================
  // NAVIGATION
  // ========================================================================
  function setupNavigation() {
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.addEventListener('click', () => {
        const tabId = btn.dataset.tab;
        switchTab(tabId);
      });
    });

    // Sidebar toggle
    document.getElementById('btnToggleSidebar')?.addEventListener('click', () => {
      document.getElementById('appSidebar')?.classList.toggle('collapsed');
    });
  }

  function switchTab(tabId) {
    currentTab = tabId;

    // Update nav buttons
    document.querySelectorAll('.tab-btn[data-tab]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });

    // Update tab panels
    document.querySelectorAll('.tab-panel').forEach(panel => {
      panel.classList.toggle('active', panel.id === tabId);
    });

    // Tab-specific actions
    if (tabId === 'tab-dashboard') DashboardModule.init();
    if (tabId === 'tab-inbox') refreshInbox();
    if (tabId === 'tab-ai') refreshAIPanel();
  }

  // ========================================================================
  // HEADER CONTROLS
  // ========================================================================
  function setupHeaderControls() {
    // Test message modal
    document.getElementById('btnOpenTestModal')?.addEventListener('click', () => {
      document.getElementById('testMessageModal')?.classList.add('active');
    });

    document.getElementById('btnSendTestMessage')?.addEventListener('click', async () => {
      const phone = document.getElementById('testPhoneInput')?.value;
      const message = document.getElementById('testMessageInput')?.value;
      if (!phone || !message) return showToast('Preencha telefone e mensagem.', 'warning');

      try {
        await DispatcherModule.sendDirectTestMessage(phone, message);
        showToast('Mensagem de teste enviada!', 'success');
        document.getElementById('testMessageModal')?.classList.remove('active');
      } catch (err) {
        showToast(`Erro: ${err.message}`, 'error');
      }
    });

    // Auto-reply toggle (header)
    document.getElementById('headerAutoReplyCheckbox')?.addEventListener('change', async (e) => {
      await AICopilotModule.toggleAutoReply(e.target.checked);
      showToast(e.target.checked ? ' Auto-resposta ativada!' : ' Auto-resposta desativada.', e.target.checked ? 'success' : 'info');
      updateAIHeaderPill();
    });

    // Global search
    document.getElementById('globalSearch')?.addEventListener('input', (e) => {
      const query = e.target.value.trim().toLowerCase();
      if (currentTab === 'tab-contacts') {
        document.getElementById('contactSearchInput').value = query;
        renderContactsTable();
      }
    });
  }

  // ========================================================================
  // CONTACTS TAB
  // ========================================================================
  function setupContactsTab() {
    document.getElementById('btnRefreshContacts')?.addEventListener('click', loadContacts);
    document.getElementById('btnSelectAllContacts')?.addEventListener('click', () => {
      SupabaseModule.selectAll();
      renderContactsTable();
    });
    document.getElementById('btnDeselectAll')?.addEventListener('click', () => {
      SupabaseModule.deselectAll();
      renderContactsTable();
    });
    document.getElementById('btnInvertSelection')?.addEventListener('click', () => {
      SupabaseModule.invertSelection();
      renderContactsTable();
    });

    document.getElementById('contactSearchInput')?.addEventListener('input', () => renderContactsTable());
    document.getElementById('contactPhoneFilter')?.addEventListener('change', () => renderContactsTable());
    document.getElementById('contactStatusFilter')?.addEventListener('change', () => renderContactsTable());
    document.getElementById('contactRegionFilter')?.addEventListener('change', () => renderContactsTable());

    document.getElementById('checkAllContacts')?.addEventListener('change', (e) => {
      const filtered = getFilteredContacts();
      if (e.target.checked) SupabaseModule.selectAll(filtered);
      else SupabaseModule.deselectAll();
      renderContactsTable();
    });

    // Import Contacts
    document.getElementById('importContactsInput')?.addEventListener('change', handleImportContacts);
  }

  async function handleImportContacts(e) {
    const file = e.target.files[0];
    if (!file) return;

    showToast('Lendo planilha...', 'info');

    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target.result;
        const workbook = window.XLSX.read(data, { type: 'binary' });
        let rows = [];
        workbook.SheetNames.forEach(sheetName => {
          const sheetRows = window.XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]);
          if (sheetRows && sheetRows.length > 0) {
            rows = rows.concat(sheetRows);
          }
        });
        if (!rows || rows.length === 0) {
          throw new Error('Planilha vazia ou em formato inválido.');
        }

        // Parse rows to profiles
        const mappedContacts = rows.map(r => {
          const name = r.Nome || r.nome || r.Name || r.name || 'Sem Nome';
          const phone = r.Telefone || r.telefone || r.WhatsApp || r.whatsapp || r.Phone || r.phone || '';
          const email = r.Email || r.email || '';
          const region = r.Regiao || r.regiao || r.Estado || r.estado || r.Cidade || r.cidade || '';
          const profession = r.Profissao || r.profissao || r.Cargo || r.cargo || '';
          
          return {
            name,
            full_name: name,
            whatsapp: phone,
            phone: phone,
            email,
            region,
            profession
          };
        }).filter(c => c.whatsapp || c.email); // Only import if has some contact info

        if (mappedContacts.length === 0) {
          throw new Error('Nenhum contato com telefone ou email encontrado.');
        }

        showToast(`Importando ${mappedContacts.length} contatos...`, 'info');
        const res = await SupabaseModule.importContacts(mappedContacts);
        
        if (res.success) {
          showToast(`${res.count} contatos importados com sucesso!`, 'success');
          loadContacts();
        }
      } catch (err) {
        showToast(`Erro na importação: ${err.message}`, 'error');
      } finally {
        e.target.value = ''; // Reset file input
      }
    };
    reader.onerror = () => showToast('Erro ao ler arquivo', 'error');
    reader.readAsBinaryString(file);
  }

  function getFilteredContacts() {
    return SupabaseModule.filterContacts({
      query: document.getElementById('contactSearchInput')?.value || '',
      phoneFilter: document.getElementById('contactPhoneFilter')?.value || 'all',
      status: document.getElementById('contactStatusFilter')?.value || 'all',
      region: document.getElementById('contactRegionFilter')?.value || 'all'
    });
  }

  function renderContactsTable() {
    const tbody = document.getElementById('contactsTableBody');
    if (!tbody) return;

    const filtered = getFilteredContacts();
    const selectedIds = SupabaseModule.getSelectedIds();
    
    const badge = document.getElementById('totalContactsBadge');
    if (badge) badge.textContent = filtered.length;

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted py-8">Nenhum contato encontrado.</td></tr>';
      updateContactsCount(0, 0);
      return;
    }

    tbody.innerHTML = filtered.slice(0, 200).map(c => {
      const isSelected = selectedIds.has(c.id);
      const statusClass = {
        'Novo': 'badge-info', 'Contatado': 'badge-warning',
        'Respondido': 'badge-success', 'Convertido': 'badge-purple'
      }[c.status] || 'badge-neutral';

      return `
        <tr class="${isSelected ? 'selected-row' : ''}" onclick="App.toggleContact('${c.id}')">
          <td><input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); App.toggleContact('${c.id}')"></td>
          <td><strong>${c.displayName || 'Sem Nome'}</strong></td>
          <td>${c.hasWhatsApp ? `<span style="color: #000; font-weight: 600;">${c.phoneFormatted}</span>` : `<span class="text-danger">${c.phoneFormatted || 'Sem nº'}</span>`}</td>
          <td>${c.email || '<span class="text-muted">—</span>'}</td>
          <td>${c.profession || '<span class="text-muted">—</span>'}</td>
          <td>${c.region || '<span class="text-muted">—</span>'}</td>
          <td><span class="badge ${statusClass}">${c.status}</span></td>
          <td>${(c.tags || []).map(t => `<span class="badge badge-neutral" style="margin:1px">${t}</span>`).join('') || '—'}</td>
        </tr>
      `;
    }).join('');

    updateContactsCount(filtered.length, SupabaseModule.getSelectedContacts().length);
  }

  function toggleContact(id) {
    SupabaseModule.toggleSelectContact(id);
    renderContactsTable();
  }

  function updateContactsCount(total, selected) {
    const label = document.getElementById('contactsCountLabel');
    if (label) label.textContent = `${total} contatos • ${selected} selecionados com WhatsApp`;

    const badge = document.getElementById('badgeContactsCount');
    if (badge) badge.textContent = SupabaseModule.getAllContacts().length;
  }

  // ========================================================================
  // DISPATCHER TAB
  // ========================================================================
  function setupDispatcherTab() {
    // Preview
    document.getElementById('messageTemplateInput')?.addEventListener('input', refreshPreview);
    document.getElementById('btnRefreshPreview')?.addEventListener('click', refreshPreview);

    // Start Campaign
    document.getElementById('btnStartCampaign')?.addEventListener('click', startCampaign);
    document.getElementById('btnPauseCampaign')?.addEventListener('click', () => DispatcherModule.pauseCampaign());
    document.getElementById('btnStopCampaign')?.addEventListener('click', () => {
      if (confirm('Tem certeza que deseja parar a campanha?')) DispatcherModule.stopCampaign();
    });

    // Send Test
    document.getElementById('btnSendTest')?.addEventListener('click', async () => {
      const phone = prompt('Número para teste:');
      if (!phone) return;
      const template = document.getElementById('messageTemplateInput')?.value || '';
      if (!template.trim()) return showToast('Escreva uma mensagem primeiro.', 'warning');

      const sampleContact = { name: 'Teste', primeiro_nome: 'Teste', first_name: 'Teste', profissao: 'N/A', regiao: 'N/A' };
      const parsed = typeof TemplatesModule !== 'undefined' ? TemplatesModule.parseMessage(template, sampleContact) : template;
      await DispatcherModule.sendDirectTestMessage(phone, parsed, 'Teste');
    });
  }

  function refreshPreview() {
    const template = document.getElementById('messageTemplateInput')?.value || '';
    const bubble = document.getElementById('messagePreviewBubble');
    if (!bubble) return;

    if (!template.trim()) {
      bubble.innerHTML = '<em class="text-muted">A prévia aparecerá aqui...</em>';
      return;
    }

    const sampleContact = {
      name: 'Maria Silva', primeiro_nome: 'Maria', first_name: 'Maria',
      profissao: 'Professora', regiao: 'SP - São Paulo'
    };

    const parsed = typeof TemplatesModule !== 'undefined' ? TemplatesModule.parseMessage(template, sampleContact) : template;
    bubble.textContent = parsed;
  }

  async function startCampaign() {
    const template = document.getElementById('messageTemplateInput')?.value;
    if (!template?.trim()) return showToast('Escreva uma mensagem!', 'warning');

    const contacts = SupabaseModule.getSelectedContacts();
    if (contacts.length === 0) return showToast('Selecione contatos na aba "Contatos" primeiro.', 'warning');

    const delayMin = parseInt(document.getElementById('delayMinInput')?.value || '20');
    const delayMax = parseInt(document.getElementById('delayMaxInput')?.value || '50');
    const instanceId = document.getElementById('instanceSelectDispatcher')?.value || 'round-robin';
    const updateSupabase = document.getElementById('chkUpdateSupabase')?.checked ?? true;

    if (!confirm(`Disparar para ${contacts.length} contatos?\nDelay: ${delayMin}-${delayMax}s`)) return;

    try {
      document.getElementById('btnStartCampaign').disabled = true;
      await DispatcherModule.startDirectCampaign({
        contacts, template, minDelay: delayMin, maxDelay: delayMax,
        updateSupabase, instanceId
      });
      showToast('Campanha concluída!', 'success');
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  // ========================================================================
  // INBOX TAB
  // ========================================================================
  function setupInboxTab() {
    document.getElementById('inboxSearchInput')?.addEventListener('input', () => renderInboxList());

    document.getElementById('btnSendChat')?.addEventListener('click', sendChatMessage);
    document.getElementById('chatInputText')?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
    });

    const fileInput = document.getElementById('chatAttachmentInput');
    const previewContainer = document.getElementById('chatAttachmentPreview');
    const previewImg = document.getElementById('attachmentPreviewImg');
    const previewAudio = document.getElementById('attachmentPreviewAudio');
    const previewName = document.getElementById('attachmentPreviewName');

    document.getElementById('btnAttachMedia')?.addEventListener('click', () => {
      fileInput?.click();
    });

    fileInput?.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (ev) => {
        pendingAttachment = {
          file: file,
          base64Data: ev.target.result.split(',')[1],
          mimeType: file.type,
          dataUrl: ev.target.result
        };

        previewImg.style.display = 'none';
        previewAudio.style.display = 'none';

        if (file.type.startsWith('image/')) {
          previewImg.src = pendingAttachment.dataUrl;
          previewImg.style.display = 'block';
        } else if (file.type.startsWith('audio/')) {
          previewAudio.src = pendingAttachment.dataUrl;
          previewAudio.style.display = 'block';
        }
        
        previewName.textContent = file.name;
        previewContainer.style.display = 'flex';
      };
      reader.readAsDataURL(file);
    });

    document.getElementById('btnRemoveAttachment')?.addEventListener('click', () => {
      pendingAttachment = null;
      if (fileInput) fileInput.value = '';
      previewContainer.style.display = 'none';
      previewImg.src = '';
      previewAudio.src = '';
    });

    // Co-Pilot button
    document.getElementById('btnAskCopilot')?.addEventListener('click', async () => {
      if (!selectedChatJid) return;
      const agentKey = document.getElementById('chatAiModeSelect')?.dataset?.agent || 'tira-duvidas';
      showToast(' Gerando sugestão...', 'info');

      try {
        const convHistory = getChatHistory();
        const result = await AICopilotModule.requestSuggestion(agentKey, convHistory);
        if (result.success) {
          AICopilotModule.renderSuggestionCard('copilotSuggestionArea', result,
            (text) => sendChatMessageDirect(text),
            () => {}
          );
        } else {
          showToast(result.error || 'Erro na sugestão.', 'error');
        }
      } catch (err) {
        showToast(`Erro: ${err.message}`, 'error');
      }
    });
  }

  function getChatHistory() {
    if (!selectedChatJid) return [];
    return chatMessages.filter(m =>
      m.remoteJid === selectedChatJid || m.phone === selectedChatJid.split('@')[0]
    ).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  }

  async function refreshInbox() {
    const allMessages = await WhatsAppDirect.fetchMessages();
    chatMessages = allMessages;

    renderInboxList();
  }

  function renderInboxList() {
    const container = document.getElementById('inboxListScroll');
    if (!container) return;

    const searchQuery = (document.getElementById('inboxSearchInput')?.value || '').toLowerCase();

    // Group by JID
    const conversations = {};
    for (const msg of chatMessages) {
      const key = msg.remoteJid || msg.phone;
      if (!key) continue;
      if (!conversations[key]) {
        conversations[key] = {
          jid: key,
          phone: msg.phone,
          name: msg.fromMe ? null : msg.name,
          instanceId: msg.instanceId,
          instanceColor: msg.instanceColor,
          lastMessage: msg,
          messages: [],
          unreadCount: 0
        };
      }
      conversations[key].messages.push(msg);
      if (!msg.fromMe) {
        if (!conversations[key].name) conversations[key].name = msg.name;
        conversations[key].unreadCount++;
      }
      if (new Date(msg.timestamp) > new Date(conversations[key].lastMessage.timestamp)) {
        conversations[key].lastMessage = msg;
      }
    }

    let convList = Object.values(conversations)
      .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

    if (searchQuery) {
      convList = convList.filter(c =>
        (c.name && c.name.toLowerCase().includes(searchQuery)) ||
        (c.phone && c.phone.includes(searchQuery))
      );
    }

    if (convList.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-8">Nenhuma conversa encontrada.</div>';
      return;
    }

    // Update inbox badge
    const totalUnread = convList.reduce((a, c) => a + c.unreadCount, 0);
    const badge = document.getElementById('badgeInboxCount');
    if (badge) badge.textContent = totalUnread;

    container.innerHTML = convList.map(c => {
      const initials = (c.name || c.phone || '?').substring(0, 2).toUpperCase();
      const preview = c.lastMessage.text ? (c.lastMessage.text.substring(0, 50) + (c.lastMessage.text.length > 50 ? '...' : '')) : '[mídia]';
      const isActive = selectedChatJid === c.jid;

      return `
        <div class="inbox-item ${isActive ? 'active' : ''}" onclick="App.selectChat('${c.jid}', '${c.instanceId}')">
          <div class="inbox-avatar" style="border: 2px solid ${c.instanceColor || '#10b981'}">${initials}</div>
          <div class="inbox-item-info">
            <div class="inbox-item-name">${c.name || c.phone}</div>
            <div class="inbox-item-preview">${c.lastMessage.fromMe ? '↩️ ' : ''}${preview}</div>
          </div>
          <div class="inbox-item-meta">
            <span class="inbox-item-time">${c.lastMessage.timeFormatted || ''}</span>
            ${c.unreadCount > 0 ? `<span class="inbox-unread-badge">${c.unreadCount}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');
  }

  function selectChat(jid, instanceId) {
    selectedChatJid = jid;
    selectedChatInstance = instanceId;

    renderInboxList();
    renderChatMessages();

    // Show co-pilot button
    document.getElementById('btnAskCopilot').style.display = 'flex';
    document.getElementById('chatAiModeSelect').style.display = 'block';

    // Update contact panel
    updateContactPanel(jid);
  }

  function renderChatMessages() {
    const container = document.getElementById('chatMessages');
    if (!container || !selectedChatJid) return;

    const conv = getChatHistory();

    if (conv.length === 0) {
      container.innerHTML = '<div class="text-center text-muted py-8">Nenhuma mensagem nesta conversa.</div>';
      return;
    }

    // Set header
    const firstInbound = conv.find(m => !m.fromMe);
    document.getElementById('chatContactName').textContent = firstInbound?.name || selectedChatJid.split('@')[0];
    document.getElementById('chatContactPhone').textContent = selectedChatJid.split('@')[0];

    container.innerHTML = conv.map(msg => {
      const isAi = msg.isAiGenerated;
      const bubbleClass = msg.fromMe ? (isAi ? 'ai-generated' : 'outgoing') : 'incoming';

      let mediaHtml = '';
      if (msg.mediaUrl) {
        if (msg.mediaType === 'image' || msg.mediaType === 'sticker') {
          mediaHtml = `<img src="${msg.mediaUrl}" class="chat-media-img" />`;
        } else if (msg.mediaType === 'audio') {
          mediaHtml = `<audio src="${msg.mediaUrl}" controls class="chat-media-audio"></audio>`;
        } else if (msg.mediaType === 'video') {
          mediaHtml = `<video src="${msg.mediaUrl}" controls class="chat-media-img"></video>`;
        } else {
          mediaHtml = `<a href="${msg.mediaUrl}" target="_blank" style="color:inherit;text-decoration:underline;">Baixar Arquivo</a>`;
        }
      }

      return `
        <div class="chat-bubble ${bubbleClass}">
          ${isAi ? `<div class="chat-bubble-ai-tag">${msg.aiAgentIcon || ''} ${msg.aiAgentName || 'IA'}</div>` : ''}
          ${mediaHtml}
          <div>${msg.text}</div>
          <div class="chat-bubble-time">${msg.timeFormatted || ''}</div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  }

  async function sendChatMessage() {
    const input = document.getElementById('chatInputText');
    const text = input?.value?.trim();
    if ((!text && !pendingAttachment) || !selectedChatJid) return;

    input.value = '';
    const attachment = pendingAttachment;
    
    // Reset attachment UI immediately
    if (attachment) {
      document.getElementById('btnRemoveAttachment')?.click();
    }

    try {
      if (attachment) {
        showToast('Enviando arquivo...', 'info');
        await WhatsAppDirect.sendMediaMessage(selectedChatJid, attachment.base64Data, attachment.mimeType, text, {
          instanceId: selectedChatInstance
        });
        showToast('Mídia enviada!', 'success');
      } else {
        await WhatsAppDirect.sendMessage(selectedChatJid, text, {
          instanceId: selectedChatInstance
        });
        showToast('Mensagem enviada!', 'success');
      }
      setTimeout(() => refreshInbox(), 1000);
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  async function sendChatMessageDirect(text) {
    if (!text || !selectedChatJid) return;
    try {
      await WhatsAppDirect.sendMessage(selectedChatJid, text, {
        instanceId: selectedChatInstance
      });
      showToast('Sugestão enviada!', 'success');
      setTimeout(() => refreshInbox(), 1000);
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  function updateContactPanel(jid) {
    const phone = jid.split('@')[0];
    const allContacts = SupabaseModule.getAllContacts();
    const contact = allContacts.find(c => {
      const cPhone = (c.formattedPhone || c.rawPhone || '').replace(/\D/g, '');
      return cPhone === phone || cPhone.endsWith(phone) || phone.endsWith(cPhone);
    });

    document.getElementById('contactPanelName').textContent = contact?.displayName || phone;
    document.getElementById('contactPanelPhone').textContent = SupabaseModule.formatDisplayPhone(phone);
    document.getElementById('contactPanelEmail').textContent = contact?.email || '—';
    document.getElementById('contactPanelProfession').textContent = contact?.profession || '—';
    document.getElementById('contactPanelRegion').textContent = contact?.region || '—';
    document.getElementById('contactPanelStatus').textContent = contact?.status || '—';
    document.getElementById('contactPanelAiMode').textContent = contact?.aiMode || 'autonomous';
  }

  // ========================================================================
  // AI TAB
  // ========================================================================
  function setupAITab() {
    document.getElementById('aiGlobalAutoReply')?.addEventListener('change', async (e) => {
      await AICopilotModule.toggleAutoReply(e.target.checked);
      document.getElementById('headerAutoReplyCheckbox').checked = e.target.checked;
      showToast(e.target.checked ? ' Auto-resposta ativada!' : ' Auto-resposta desativada.', 'info');
    });
  }

  async function refreshAIPanel() {
    const status = await AICopilotModule.fetchAgentsStatus();

    const dot = document.getElementById('aiStatusDot');
    const text = document.getElementById('aiStatusText');
    if (dot) dot.classList.toggle('dot-online', status.connected);
    if (dot) dot.classList.toggle('dot-offline', !status.connected);
    if (text) text.textContent = status.connected ? 'Conectado e operacional' : `Desconectado: ${status.error || ''}`;

    const config = await AICopilotModule.fetchConfig();
    const agents = config.customAgents || {};
    window.__currentAgents = agents; // Salva para uso global
    
    renderAgentsGrid(agents);

    if (status.autoReplyEnabled !== undefined) {
      document.getElementById('aiGlobalAutoReply').checked = status.autoReplyEnabled;
      document.getElementById('headerAutoReplyCheckbox').checked = status.autoReplyEnabled;
    }
  }

  function renderAgentsGrid(agents) {
    const grid = document.getElementById('aiAgentsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    for (const [key, agent] of Object.entries(agents)) {
      const cardClass = `card-pastel-${agent.theme || 'blue'}`;
      grid.innerHTML += `
        <div class="card ${cardClass}" style="position:relative;">
          <div class="card-body">
            <button onclick="deleteAgent('${agent.id}')" style="position:absolute; top:12px; right:12px; background:transparent; border:none; color:var(--text-muted); cursor:pointer;" title="Excluir Agente">🗑️</button>
            <button onclick="editAgent('${agent.id}')" style="position:absolute; top:12px; right:40px; background:transparent; border:none; color:var(--text-muted); cursor:pointer;" title="Editar Agente">✏️</button>
            
            <div style="font-size:32px; margin-bottom:8px">${agent.icon || '🤖'}</div>
            <h3>${agent.name}</h3>
            <p class="text-muted text-sm mt-1">${agent.description}</p>
            <div class="mt-3">
              <label class="form-label">Modo Padrão</label>
              <select class="form-select" data-agent="${agent.id}" onchange="AICopilotModule.updateConfig({activeAgent:this.dataset.agent})">
                <option value="autonomous" ${agent.defaultMode === 'autonomous' ? 'selected' : ''}> Autônomo</option>
                <option value="copilot" ${agent.defaultMode === 'copilot' ? 'selected' : ''}> Co-Piloto</option>
              </select>
            </div>
            <div class="mt-3" id="contextFiles-${agent.id}"></div>
          </div>
        </div>
      `;
    }

    // Context files async loading
    for (const key of Object.keys(agents)) {
      AICopilotModule.getContextFiles(key).then(files => {
        AICopilotModule.renderContextFilesPanel(`contextFiles-${key}`, key, files);
      });
    }
  }

  function updateAIHeaderPill() {
    AICopilotModule.fetchConfig().then(cfg => {
      const agents = cfg?.customAgents || {};
      const activeAgentMeta = agents[cfg?.activeAgent];
      document.getElementById('headerActiveAgentName').textContent = activeAgentMeta ? activeAgentMeta.name : (cfg?.activeAgent || '—');
    });
  }

  // ========================================================================
  // SETTINGS TAB
  // ========================================================================
  function setupSettingsTab() {
    document.getElementById('btnAddInstance')?.addEventListener('click', async () => {
      const name = prompt('Nome da nova linha WhatsApp:');
      if (!name) return;
      try {
        const result = await WhatsAppDirect.createInstance(name);
        if (result.success) {
          showToast(`Linha "${name}" criada!`, 'success');
          refreshInstances();
        }
      } catch (err) {
        showToast(`Erro: ${err.message}`, 'error');
      }
    });

    document.getElementById('btnSidebarAddLinha')?.addEventListener('click', () => {
      document.getElementById('btnAddInstance')?.click();
    });
  }

  async function refreshInstances() {
    const instances = await WhatsAppDirect.fetchInstances();

    // Settings grid
    const grid = document.getElementById('instancesGrid');
    if (grid) {
      grid.innerHTML = instances.map(inst => {
        const statusBadge = inst.connected
          ? '<span class="badge badge-success">Conectado</span>'
          : inst.qrCode
            ? '<span class="badge badge-warning">QR Pronto</span>'
            : '<span class="badge badge-neutral">Desconectado</span>';

        return `
          <div class="card" style="border-left: 4px solid ${inst.color}">
            <div class="card-body">
              <div class="flex-between mb-4">
                <div>
                  <strong>${inst.name}</strong>
                  <div class="text-muted text-sm">${inst.user?.phone || inst.id}</div>
                </div>
                ${statusBadge}
              </div>
              ${inst.qrCode ? `<div class="qr-display"><img src="${inst.qrCode}" alt="QR Code"></div>` : ''}
              <div class="flex-gap-2 mt-3">
                <button class="btn btn-sm btn-ghost" onclick="App.logoutInstance('${inst.id}')"> Reconectar</button>
                ${!inst.isDefault ? `<button class="btn btn-sm btn-danger" onclick="App.removeInstance('${inst.id}')"></button>` : ''}
              </div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Sidebar linhas
    const sidebarList = document.getElementById('sidebarLinhasList');
    if (sidebarList) {
      sidebarList.innerHTML = instances.map(inst => `
        <div class="sidebar-linha-card" style="border-left-color: ${inst.color}">
          <div class="flex-between">
            <span class="linha-name" style="font-weight:600">${inst.name}</span>
            <span class="status-dot ${inst.connected ? 'dot-online' : 'dot-offline'}" style="width:8px;height:8px"></span>
          </div>
          ${inst.user?.phone ? `<div class="text-muted" style="font-size:11px">${inst.user.phone}</div>` : ''}
        </div>
      `).join('');
    }

    // Dispatcher instance select
    const select = document.getElementById('instanceSelectDispatcher');
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="round-robin"> Revezamento (Round-Robin)</option>';
      instances.filter(i => i.connected).forEach(inst => {
        select.innerHTML += `<option value="${inst.id}" ${current === inst.id ? 'selected' : ''}>${inst.name} (${inst.user?.phone || inst.id})</option>`;
      });
    }

    // Header status
    updateWhatsAppStatus(instances);
  }

  function updateWhatsAppStatus(instances) {
    const connectedCount = instances.filter(i => i.connected).length;
    const dot = document.getElementById('whatsappDirectDot');
    const text = document.getElementById('whatsappDirectStatusText');

    if (connectedCount > 0) {
      if (dot) { dot.classList.remove('dot-offline', 'dot-warning'); dot.classList.add('dot-online'); }
      if (text) text.textContent = `${connectedCount} linha${connectedCount > 1 ? 's' : ''} ativa${connectedCount > 1 ? 's' : ''}`;
    } else if (instances.some(i => i.qrCode)) {
      if (dot) { dot.classList.remove('dot-online', 'dot-offline'); dot.classList.add('dot-warning'); }
      if (text) text.textContent = 'QR Pendente';
    } else {
      if (dot) { dot.classList.remove('dot-online', 'dot-warning'); dot.classList.add('dot-offline'); }
      if (text) text.textContent = 'Desconectado';
    }
  }

  async function logoutInstance(id) {
    if (!confirm('Desconectar e gerar novo QR Code?')) return;
    try {
      await WhatsAppDirect.logoutInstance(id);
      showToast('Reconectando...', 'info');
      setTimeout(refreshInstances, 2000);
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  async function removeInstance(id) {
    if (!confirm('Excluir esta linha WhatsApp?')) return;
    try {
      await WhatsAppDirect.deleteInstance(id);
      showToast('Linha removida.', 'success');
      refreshInstances();
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  // ========================================================================
  // DATA LOADING
  // ========================================================================
  async function loadInitialData() {
    try {
      await Promise.all([
        loadContacts(),
        refreshInstances(),
        DashboardModule.init()
      ]);
    } catch (err) {
      console.warn('Initial data load warning:', err.message);
    }

    // Load AI config
    try {
      const config = await AICopilotModule.fetchConfig();
      if (config?.autoReplyEnabled !== undefined) {
        document.getElementById('headerAutoReplyCheckbox').checked = config.autoReplyEnabled;
      }
      if (config?.activeAgent) {
        const agentNames = { 'tira-duvidas': 'Tira Dúvidas', 'vendedor': 'Vendedor', 'auxiliar': 'Auxiliar' };
        document.getElementById('headerActiveAgentName').textContent = agentNames[config.activeAgent] || config.activeAgent;
      }
    } catch (e) {}
  }

  async function loadContacts() {
    try {
      showToast('Carregando contatos...', 'info');
      const contacts = await SupabaseModule.fetchContacts();
      renderContactsTable();
      populateRegionFilter();
      showToast(`${contacts.length} contatos carregados!`, 'success');
    } catch (err) {
      showToast(`Erro ao carregar contatos: ${err.message}`, 'error');
    }
  }

  function populateRegionFilter() {
    const select = document.getElementById('contactRegionFilter');
    if (!select) return;
    const regions = SupabaseModule.getUniqueRegions();
    select.innerHTML = '<option value="all">Todas</option>';
    regions.forEach(r => {
      select.innerHTML += `<option value="${r}">${r}</option>`;
    });
  }

  // ========================================================================
  // POLLING
  // ========================================================================
  function startPolling() {
    setInterval(async () => {
      await refreshInstances();
      if (currentTab === 'tab-inbox') {
        await refreshInbox();
        if (selectedChatJid) renderChatMessages();
      }
    }, 5000);
  }

  // ========================================================================
  // TOASTS
  // ========================================================================
  function showToast(message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = { success: '', error: '', warning: '️', info: 'ℹ️' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${icons[type] || ''}</span> <span>${message}</span>`;
    container.appendChild(toast);

    setTimeout(() => { toast.style.opacity = '0'; toast.style.transition = '0.3s'; }, 3500);
    setTimeout(() => toast.remove(), 4000);
  }

  // ========================================================================
  // PUBLIC API
  // ========================================================================
  return {
    init, switchTab, showToast,
    toggleContact, selectChat,
    logoutInstance, removeInstance
  };
})();

// ============================================================================
// BOOT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// ============================================================================
// AGENT MANAGEMENT MODAL FUNCTIONS
// ============================================================================
window.openAgentModal = function() {
  document.getElementById('agentForm').reset();
  document.getElementById('agentId').value = '';
  document.getElementById('agentModalTitle').innerText = 'Novo Agente de IA';
  document.getElementById('agentModal').style.display = 'flex';
};

window.closeAgentModal = function() {
  document.getElementById('agentModal').style.display = 'none';
};

window.handleLogout = async function() {
  if (!confirm('Deseja realmente sair?')) return;
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login.html';
  } catch (e) {
    console.error(e);
    window.location.href = '/login.html';
  }
};

window.handleAdminRegister = async function(e) {
  e.preventDefault();
  const email = document.getElementById('adminRegEmail').value;
  const phone = document.getElementById('adminRegPhone').value;
  const password = document.getElementById('adminRegPassword').value;

  try {
    const btn = e.target.querySelector('button');
    const oldText = btn.innerText;
    btn.innerText = 'Cadastrando...';
    btn.disabled = true;

    const res = await fetch('/api/auth/admin-register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, phone, password })
    });
    
    const data = await res.json();
    btn.innerText = oldText;
    btn.disabled = false;

    if (res.ok && data.success) {
      alert('Usuário cadastrado com sucesso!');
      e.target.reset();
    } else {
      alert(data.error || 'Erro ao cadastrar usuário');
    }
  } catch (err) {
    alert('Erro de conexão');
  }
};

window.editAgent = function(id) {
  const agents = window.__currentAgents || {};
  const agent = agents[id];
  if (!agent) return;
  
  document.getElementById('agentId').value = agent.id;
  document.getElementById('agentName').value = agent.name;
  document.getElementById('agentIcon').value = agent.icon;
  document.getElementById('agentTheme').value = agent.theme || 'blue';
  document.getElementById('agentDesc').value = agent.description;
  document.getElementById('agentPrompt').value = agent.promptPrefix;
  document.getElementById('agentMode').value = agent.defaultMode;
  
  document.getElementById('agentModalTitle').innerText = 'Editar Agente de IA';
  document.getElementById('agentModal').style.display = 'flex';
};

window.deleteAgent = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este agente? Ele não poderá mais responder aos chats.')) return;
  
  try {
    const res = await fetch(`/api/ai/agents/${id}`, { method: 'DELETE' });
    if (res.ok) {
      window.location.reload();
    }
  } catch (err) {
    console.error('Erro ao excluir agente', err);
  }
};

window.saveAgent = async function(e) {
  e.preventDefault();
  
  const idInput = document.getElementById('agentId').value;
  const name = document.getElementById('agentName').value;
  const isEdit = !!idInput;
  
  const payload = {
    id: isEdit ? idInput : name.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
    name: name,
    icon: document.getElementById('agentIcon').value,
    theme: document.getElementById('agentTheme').value,
    description: document.getElementById('agentDesc').value,
    promptPrefix: document.getElementById('agentPrompt').value,
    defaultMode: document.getElementById('agentMode').value,
  };
  
  try {
    const res = await fetch('/api/ai/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      closeAgentModal();
      window.location.reload();
    }
  } catch (err) {
    console.error('Erro ao salvar agente', err);
    alert('Erro ao salvar agente.');
  }
};
