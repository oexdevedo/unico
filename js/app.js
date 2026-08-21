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
    if (window.ABTestModule) ABTestModule.init();

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
    if (tabId === 'tab-templates') TemplatesModule.renderTemplatesUI();
    if (tabId === 'tab-dispatcher') {
      TemplatesModule.populateTemplateSelect();
      if (typeof populateDispatcherListSource === 'function') populateDispatcherListSource();
    }
    if (tabId === 'tab-logs') {
      if (typeof LogsModule !== 'undefined' && LogsModule.fetchAndRenderLogs) {
        LogsModule.fetchAndRenderLogs();
      }
    }
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
      if (currentTab === 'tab-ai') refreshAIPanel();
    });

    // Assistant selector (header)
    document.getElementById('headerAgentSelect')?.addEventListener('change', async (e) => {
      const selectedAgentKey = e.target.value;
      await AICopilotModule.updateConfig({ activeAgent: selectedAgentKey });
      const selName = e.target.options[e.target.selectedIndex]?.text || selectedAgentKey;
      showToast(`🤖 Assistente "${selName}" ativado para respostas automáticas!`, 'success');
      updateAIHeaderPill();
      if (currentTab === 'tab-ai') refreshAIPanel();
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
          if (res.duplicatesCount > 0 && res.count > 0) {
            showToast(`✅ ${res.count} novos contatos importados! ⚠️ ${res.duplicatesCount} contato(s) duplicado(s) foram identificados e ignorados.`, 'info');
          } else if (res.count > 0) {
            showToast(`🎉 ${res.count} contatos importados com sucesso!`, 'success');
          } else {
            showToast(`⚠️ Todos os ${res.duplicatesCount} contatos da planilha já estavam cadastrados no sistema (duplicados).`, 'warning');
          }
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
    const allContacts = SupabaseModule.getAllContacts();
    
    const badge = document.getElementById('totalContactsBadge');
    if (badge) badge.textContent = filtered.length;

    // Update stats pills
    const setStatText = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
    setStatText('statTotalContacts', allContacts.length);
    setStatText('statWhatsAppContacts', allContacts.filter(c => c.hasValidPhone).length);
    setStatText('statRedContacts', allContacts.filter(c => c.status === 'Vermelho').length);
    setStatText('statYellowContacts', allContacts.filter(c => c.status === 'Amarelo').length);
    setStatText('statGreenContacts', allContacts.filter(c => c.status === 'Verde').length);
    setStatText('statSelectedContacts', selectedIds.size);

    if (filtered.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" class="crx-td-empty">Nenhum contato encontrado.</td></tr>';
      updateContactsCount(0, 0);
      return;
    }

    const allLists = (typeof window.getAllListsCache === 'function') ? window.getAllListsCache() : [];

    tbody.innerHTML = filtered.slice(0, 200).map(c => {
      const isSelected = selectedIds.has(c.id);
      
      const rawStatus = c.status || 'Vermelho';
      const curStatus = ['Vermelho', 'Amarelo', 'Verde'].includes(rawStatus) ? rawStatus : 'Vermelho';
      const statusColors = {
        'Vermelho': '#ef4444',
        'Amarelo': '#f59e0b',
        'Verde': '#10b981'
      };
      const statusBg = statusColors[curStatus] || '#ef4444';

      const phone = c.phone || c.telefone || '';
      const assignedList = allLists.find(l => (l.contacts || []).some(item => (item.phone || item.id) === phone));
      const selectedListId = assignedList ? assignedList.id : '';
      const badgeBg = assignedList ? assignedList.color : 'rgba(255,255,255,0.05)';
      const badgeColor = assignedList ? '#ffffff' : 'var(--text-muted)';
      const badgeBorder = assignedList ? assignedList.color : 'var(--border)';
      const safeName = (c.displayName || c.name || '').replace(/'/g, "\\'");

      return `
        <tr class="${isSelected ? 'selected-row' : ''}" onclick="App.toggleContact('${c.id}')">
          <td><input type="checkbox" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation(); App.toggleContact('${c.id}')"></td>
          <td>
            <a href="javascript:void(0)" class="contact-name-link" onclick="event.stopPropagation(); openSingleContactAddToListModal('${c.id}')" title="Clique para gerenciar listas deste contato">
              <span>${c.displayName || 'Sem Nome'}</span>
              <i class="ti ti-playlist-add" style="font-size:0.85rem; color:var(--brand-primary); opacity:0.6;"></i>
            </a>
          </td>
          <td>${c.hasWhatsApp ? `<span style="color: #000; font-weight: 600;">${c.phoneFormatted}</span>` : `<span class="text-danger">${c.phoneFormatted || 'Sem nº'}</span>`}</td>
          <td>${c.email || '<span class="text-muted">—</span>'}</td>
          <td>${(c.profession && c.profession !== 'Não informado') ? c.profession : '<span class="text-muted">Não informado</span>'}</td>
          <td>${(c.region && c.region !== 'Não informado') ? c.region : '<span class="text-muted">Não informado</span>'}</td>
          <td>
            <select class="status-select-badge"
                    style="background:${statusBg}; color:#ffffff; border:1px solid ${statusBg};"
                    onclick="event.stopPropagation();"
                    onchange="event.stopPropagation(); window.handleContactStatusChange(this, '${c.id}', '${phone}')">
              <option value="Vermelho" ${curStatus === 'Vermelho' ? 'selected' : ''}>🔴 Vermelho</option>
              <option value="Amarelo" ${curStatus === 'Amarelo' ? 'selected' : ''}>🟡 Amarelo</option>
              <option value="Verde" ${curStatus === 'Verde' ? 'selected' : ''}>🟢 Verde</option>
            </select>
          </td>
          <td>
            <select class="tag-select-badge"
                    style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder};"
                    onclick="event.stopPropagation();"
                    onchange="event.stopPropagation(); window.handleContactListChange(this, '${phone}', '${safeName}', '${selectedListId}')">
              <option value="" ${!selectedListId ? 'selected' : ''}>+ Sem Lista</option>
              ${allLists.map(l => `
                <option value="${l.id}" ${l.id === selectedListId ? 'selected' : ''}>${l.name}</option>
              `).join('')}
            </select>
          </td>
          <td style="white-space:nowrap; text-align:center;">
            <div style="display:inline-flex; gap:4px; align-items:center;">
              <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.openChatWithContact('${phone}')" title="Mandar Mensagem" style="padding:4px 6px; color:var(--brand-primary);">
                <i class="ti ti-message-circle" style="font-size:0.95rem;"></i>
              </button>
              <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.openEditContactModal('${c.id}')" title="Editar contato" style="padding:4px 6px; color:var(--text-muted);">
                <i class="ti ti-pencil" style="font-size:0.95rem;"></i>
              </button>
              <button type="button" class="btn btn-sm btn-ghost" onclick="event.stopPropagation(); window.confirmDeleteContact('${c.id}', '${safeName}')" title="Excluir contato" style="padding:4px 6px; color:#ef4444;">
                <i class="ti ti-trash" style="font-size:0.95rem;"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    window.handleContactStatusChange = async function(selectEl, contactId, phone) {
      const newStatus = selectEl.value;
      const colors = {
        'Vermelho': '#ef4444',
        'Amarelo': '#f59e0b',
        'Verde': '#10b981'
      };

      const newColor = colors[newStatus] || '#ef4444';
      selectEl.style.background = newColor;
      selectEl.style.borderColor = newColor;

      if (window.SupabaseModule && typeof SupabaseModule.getAllContacts === 'function') {
        const contact = SupabaseModule.getAllContacts().find(c => String(c.id) === String(contactId));
        if (contact) contact.status = newStatus;
      }

      try {
        if (window.SupabaseModule && typeof SupabaseModule.updateContactStatus === 'function') {
          await SupabaseModule.updateContactStatus(contactId, newStatus);
        }
        if (typeof showToast === 'function') showToast(`✅ Status do Raio X alterado para ${newStatus}!`, 'success');
      } catch (err) {
        console.error('Erro ao atualizar status:', err);
      }
    };

    window.openNewContactModal = function() {
      document.getElementById('editContactId').value = '';
      document.getElementById('editContactName').value = '';
      document.getElementById('editContactPhone').value = '';
      document.getElementById('editContactEmail').value = '';
      document.getElementById('editContactProfession').value = '';
      document.getElementById('editContactRegion').value = '';
      document.getElementById('editContactStatus').value = 'Vermelho';

      const title = document.getElementById('editContactModalTitle');
      if (title) title.innerHTML = '<i class="ti ti-user-plus" style="margin-right:0.4rem;"></i> Novo Contato Manual';

      const modal = document.getElementById('editContactModal');
      if (modal) modal.classList.add('active');
    };

    window.openChatWithContact = function(phoneStr) {
      if (!phoneStr) return showToast('Telefone inválido para chat.', 'warning');
      const raw = String(phoneStr).replace(/\D/g, '');
      if (!raw) return showToast('Telefone inválido para chat.', 'warning');
      
      const jid = `${raw}@s.whatsapp.net`;
      
      // Mudar aba
      App.switchTab('tab-inbox');
      
      // Selecionar o chat (null seleciona primeira instância auto)
      if (typeof selectChat === 'function') {
        selectChat(jid, null);
      }
    };


    window.openEditContactModal = function(contactId) {
      const contact = SupabaseModule.getAllContacts().find(c => String(c.id) === String(contactId));
      if (!contact) return showToast('Contato não encontrado.', 'warning');

      document.getElementById('editContactId').value = contact.id;
      document.getElementById('editContactName').value = contact.displayName || contact.name || '';
      document.getElementById('editContactPhone').value = contact.phone || contact.whatsapp || '';
      document.getElementById('editContactEmail').value = contact.email || '';
      document.getElementById('editContactProfession').value = (contact.profession !== 'Não informado') ? contact.profession : '';
      document.getElementById('editContactRegion').value = (contact.region !== 'Não informado') ? contact.region : '';
      document.getElementById('editContactStatus').value = ['Vermelho', 'Amarelo', 'Verde'].includes(contact.status) ? contact.status : 'Vermelho';

      const title = document.getElementById('editContactModalTitle');
      if (title) title.innerHTML = '<i class="ti ti-user-edit" style="margin-right:0.4rem;"></i> Editar Contato';

      const modal = document.getElementById('editContactModal');
      if (modal) modal.classList.add('active');
    };

    window.closeEditContactModal = function() {
      const modal = document.getElementById('editContactModal');
      if (modal) modal.classList.remove('active');
    };

    window.saveContactEdits = async function() {
      const contactId = document.getElementById('editContactId').value;
      const name = document.getElementById('editContactName').value.trim();
      const phone = document.getElementById('editContactPhone').value.trim();
      const email = document.getElementById('editContactEmail').value.trim();
      const profession = document.getElementById('editContactProfession').value.trim();
      const region = document.getElementById('editContactRegion').value.trim();
      const status = document.getElementById('editContactStatus').value;

      if (!name) return showToast('O nome é obrigatório.', 'warning');

      try {
        if (contactId) {
          // Atualização de contato existente
          await SupabaseModule.updateContact(contactId, {
            name, email, phone, profession, region, status
          });
          showToast(`✅ Contato "${name}" atualizado com sucesso!`, 'success');
        } else {
          // Criação manual de novo contato
          await SupabaseModule.createContact({
            name, email, phone, profession, region, status
          });
          showToast(`🎉 Novo contato "${name}" cadastrado com sucesso!`, 'success');
        }
        closeEditContactModal();
        renderContactsTable();
        renderInboxList();
        if (selectedChatJid) {
          renderChatMessages();
          updateContactPanel(selectedChatJid);
        }
      } catch (err) {
        if (err.isDuplicate) {
          showToast(`⚠️ ${err.message}`, 'warning');
        } else {
          showToast('Erro ao salvar contato: ' + err.message, 'error');
        }
      }
    };

    window.confirmDeleteContact = async function(contactId, name) {
      if (!confirm(`Tem certeza que deseja excluir o contato "${name}"?`)) return;

      try {
        await SupabaseModule.deleteContact(contactId);
        renderContactsTable();
        showToast(`🗑️ Contato "${name}" excluído com sucesso.`, 'info');
      } catch (err) {
        showToast('Erro ao excluir contato: ' + err.message, 'error');
      }
    };

    window.confirmDeleteSelectedContacts = async function() {
      const selected = SupabaseModule.getSelectedContacts();
      const selectedIds = Array.from(SupabaseModule.getSelectedIds());
      if (selectedIds.length === 0) return showToast('Nenhum contato selecionado.', 'warning');

      if (!confirm(`Tem certeza que deseja excluir os ${selectedIds.length} contatos selecionados?`)) return;

      try {
        for (const id of selectedIds) {
          await SupabaseModule.deleteContact(id);
        }
        renderContactsTable();
        showToast(`🗑️ ${selectedIds.length} contato(s) excluídos com sucesso.`, 'info');
      } catch (err) {
        showToast('Erro ao excluir contatos: ' + err.message, 'error');
      }
    };

    window.renderContactsTable = renderContactsTable;
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

    // Toggle contextual action bar
    if (typeof updateContactsActionBar === 'function') {
      updateContactsActionBar(selected);
    }

    // Keep dispatcher source info updated
    if (typeof updateDispatcherSourceInfo === 'function') {
      updateDispatcherSourceInfo();
    }
  }

  // ========================================================================
  // DISPATCHER TAB
  // ========================================================================
  // ========================================================================
  // DISPATCHER TAB ENHANCEMENTS
  // ========================================================================
  let currentDispatcherMedia = null;

  window.insertVariable = function(varText) {
    const textarea = document.getElementById('messageTemplateInput');
    if (!textarea) return;

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const val = textarea.value;

    textarea.value = val.substring(0, start) + varText + val.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + varText.length;
    textarea.focus();
    refreshPreview();
  };

  window.removeDispatcherMedia = function() {
    currentDispatcherMedia = null;
    const fileInput = document.getElementById('dispatcherMediaInput');
    if (fileInput) fileInput.value = '';

    const label = document.getElementById('mediaFileName');
    if (label) label.textContent = 'Nenhum arquivo';

    const btnRemove = document.getElementById('btnRemoveDispatcherMedia');
    if (btnRemove) btnRemove.style.display = 'none';

    const previewBox = document.getElementById('dispatcherMediaPreview');
    if (previewBox) previewBox.style.display = 'none';
  };

  async function populateDispatcherInstances() {
    const select = document.getElementById('instanceSelectDispatcher');
    if (!select) return;

    try {
      const instances = await WhatsAppDirect.fetchInstances();
      const connected = instances.filter(i => i.status === 'connected' || i.status === 'open');

      select.innerHTML = '<option value="round-robin">🔄 Revezamento (Round-Robin)</option>';
      connected.forEach(inst => {
        const opt = document.createElement('option');
        opt.value = inst.id;
        opt.textContent = `📱 ${inst.name} (${inst.phone || 'Conectado'})`;
        select.appendChild(opt);
      });
    } catch (e) {
      console.warn('Erro ao carregar instâncias para o disparador:', e);
    }
  }

  async function populateChatInstanceSelect() {
    const select = document.getElementById('chatInstanceSelect');
    if (!select) return;

    try {
      const instances = await WhatsAppDirect.fetchInstances();
      const connected = instances.filter(i => i.status === 'connected' || i.status === 'open');

      select.innerHTML = '<option value="">Automático</option>';
      connected.forEach(inst => {
        const opt = document.createElement('option');
        opt.value = inst.id;
        opt.textContent = `${inst.name}`;
        select.appendChild(opt);
      });
    } catch (e) {
      console.warn('Erro ao carregar instâncias para o chat:', e);
    }
  }

  function setupDispatcherTab() {
    // Preview
    document.getElementById('messageTemplateInput')?.addEventListener('input', refreshPreview);
    document.getElementById('btnRefreshPreview')?.addEventListener('click', refreshPreview);

    // Carrega instâncias ativas no seletor
    populateDispatcherInstances();

    // Listener de anexo de mídia
    const mediaInput = document.getElementById('dispatcherMediaInput');
    if (mediaInput) {
      mediaInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;

        if (file.size > 25 * 1024 * 1024) {
          showToast('O arquivo selecionado deve ter menos de 25MB.', 'warning');
          fileInput.value = '';
          return;
        }

        const reader = new FileReader();
        reader.onload = (evt) => {
          const base64Data = evt.target.result.split(',')[1];
          currentDispatcherMedia = {
            base64Data,
            mimeType: file.type || 'application/octet-stream',
            filename: file.name
          };

          const label = document.getElementById('mediaFileName');
          if (label) label.textContent = `${file.name} (${(file.size / 1024 / 1024).toFixed(1)}MB)`;

          const btnRemove = document.getElementById('btnRemoveDispatcherMedia');
          if (btnRemove) btnRemove.style.display = 'inline-flex';

          const previewBox = document.getElementById('dispatcherMediaPreview');
          const previewImg = document.getElementById('dispatcherMediaPreviewImg');
          const previewText = document.getElementById('dispatcherMediaPreviewText');

          if (previewBox) previewBox.style.display = 'block';
          if (file.type.startsWith('image/') && previewImg) {
            previewImg.src = evt.target.result;
            previewImg.style.display = 'block';
            if (previewText) previewText.style.display = 'none';
          } else {
            if (previewImg) previewImg.style.display = 'none';
            if (previewText) {
              previewText.textContent = `📎 ${file.name}`;
              previewText.style.display = 'block';
            }
          }
        };
        reader.readAsDataURL(file);
      });
    }

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
      if (!template.trim() && !currentDispatcherMedia) return showToast('Escreva uma mensagem ou anexe uma mídia primeiro.', 'warning');

      const sampleContact = { name: 'Teste', primeiro_nome: 'Teste', first_name: 'Teste', profissao: 'N/A', regiao: 'N/A' };
      const parsed = typeof TemplatesModule !== 'undefined' ? TemplatesModule.parseMessage(template, sampleContact) : template;

      if (currentDispatcherMedia) {
        try {
          await WhatsAppDirect.sendMediaMessage(phone, currentDispatcherMedia.base64Data, currentDispatcherMedia.mimeType, parsed, { simulateTyping: true });
          showToast('Teste com mídia enviado!', 'success');
        } catch (err) {
          showToast(`Erro no envio do teste: ${err.message}`, 'error');
        }
      } else {
        await DispatcherModule.sendDirectTestMessage(phone, parsed, 'Teste');
      }
    });
  }

  function refreshPreview() {
    const template = document.getElementById('messageTemplateInput')?.value || '';
    const bubble = document.getElementById('messagePreviewBubble');
    if (!bubble) return;

    if (!template.trim()) {
      if (currentDispatcherMedia) {
        bubble.innerHTML = `<em class="text-muted">📁 Anexo: ${currentDispatcherMedia.filename}</em>`;
      } else {
        bubble.innerHTML = '<em class="text-muted">A prévia aparecerá aqui...</em>';
      }
      return;
    }

    const sampleContact = {
      name: 'Maria Silva', primeiro_nome: 'Maria', first_name: 'Maria',
      profissao: 'Professora', regiao: 'SP - São Paulo'
    };

    const parsed = typeof TemplatesModule !== 'undefined' ? TemplatesModule.parseMessage(template, sampleContact) : template;
    const mediaTag = currentDispatcherMedia ? `<div style="font-size:12px; opacity:0.8; margin-bottom:4px;">📎 [Mídia: ${currentDispatcherMedia.filename}]</div>` : '';
    bubble.innerHTML = mediaTag + TemplatesModule.formatWhatsAppToHtml(parsed);
  }

  async function startCampaign() {
    const template = document.getElementById('messageTemplateInput')?.value || '';
    if (!template.trim() && !currentDispatcherMedia) return showToast('Escreva uma mensagem ou selecione um anexo de mídia!', 'warning');

    // Determine contact source
    const sourceSelect = document.getElementById('dispatcherContactSource');
    const sourceValue = sourceSelect ? sourceSelect.value : 'selection';
    let contacts = [];
    let sourceName = 'Seleção';

    if (sourceValue === 'selection') {
      contacts = SupabaseModule.getSelectedContacts();
      if (contacts.length === 0) return showToast('Selecione contatos na aba "Contatos" primeiro.', 'warning');
    } else if (sourceValue.startsWith('list:')) {
      const listId = sourceValue.replace('list:', '');
      try {
        const res = await fetch('/api/lists');
        const lists = await res.json();
        const list = lists.find(l => l.id === listId);
        if (!list || !list.contacts?.length) {
          return showToast('A lista selecionada está vazia.', 'warning');
        }
        // Convert list contacts to dispatcher format
        contacts = list.contacts.filter(c => c.phone && c.phone.length >= 10).map(c => ({
          id: c.phone,
          name: c.name || '',
          nome: c.name || '',
          phone: c.phone,
          telefone: c.phone,
          hasValidPhone: true
        }));
        sourceName = list.name;
        if (contacts.length === 0) return showToast('Nenhum contato com WhatsApp válido nesta lista.', 'warning');
      } catch (err) {
        return showToast('Erro ao carregar lista: ' + err.message, 'error');
      }
    }

    const delayMin = parseInt(document.getElementById('delayMinInput')?.value || '20');
    const delayMax = parseInt(document.getElementById('delayMaxInput')?.value || '50');
    const batchSize = parseInt(document.getElementById('batchSizeInput')?.value || '0');
    const batchPause = parseInt(document.getElementById('batchPauseInput')?.value || '0');
    const instanceId = document.getElementById('instanceSelectDispatcher')?.value || 'round-robin';
    const updateSupabase = document.getElementById('chkUpdateSupabase')?.checked ?? true;

    const mediaInfo = currentDispatcherMedia ? ` com anexo (${currentDispatcherMedia.filename})` : '';
    const batchInfo = batchSize > 0 ? ` (Pausa de ${batchPause}s a cada ${batchSize} disparos)` : '';

    if (!confirm(`Disparar para ${contacts.length} contatos da lista "${sourceName}"${mediaInfo}?\nDelay entre mensagens: ${delayMin}-${delayMax}s${batchInfo}`)) return;

    try {
      document.getElementById('btnStartCampaign').disabled = true;
      await DispatcherModule.startDirectCampaign({
        contacts,
        template,
        minDelay: delayMin,
        maxDelay: delayMax,
        batchSize,
        batchPause,
        updateSupabase,
        instanceId,
        mediaAttachment: currentDispatcherMedia
      });
      showToast('Campanha concluída com sucesso!', 'success');
    } catch (err) {
      showToast(`Erro na campanha: ${err.message}`, 'error');
    }
  }

  // ========================================================================
  // INBOX TAB
  // ========================================================================
  function setupInboxTab() {
    populateChatInstanceSelect();
    document.getElementById('inboxSearchInput')?.addEventListener('input', () => renderInboxList());

    document.getElementById('btnDeleteChat')?.addEventListener('click', async () => {
      if (!selectedChatJid) return showToast('Selecione uma conversa primeiro', 'warning');
      if (!confirm('Tem certeza que deseja apagar esta conversa?')) return;
      try {
        await WhatsAppDirect.deleteConversation(selectedChatJid, selectedChatInstance);
        showToast('Conversa apagada com sucesso', 'success');
        selectedChatJid = null;
        renderInboxList();
        const chatMessages = document.getElementById('chatMessages');
        if (chatMessages) {
          chatMessages.innerHTML = '<div class="text-center text-muted py-8">Selecione uma conversa para ver as mensagens</div>';
        }
        document.getElementById('chatContactName').textContent = 'Selecione uma conversa';
        document.getElementById('chatContactPhone').textContent = 'Clique em um contato à esquerda';
        document.getElementById('chatAvatar').innerHTML = '';
      } catch (e) {
        showToast('Erro ao apagar conversa: ' + e.message, 'error');
      }
    });

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

    // --- Emoji Picker Logic ---
    const btnEmojiPicker = document.getElementById('btnEmojiPicker');
    const emojiPickerContainer = document.getElementById('emojiPickerContainer');
    const chatInput = document.getElementById('chatInputText');
    const emojiPicker = document.querySelector('emoji-picker');

    if (btnEmojiPicker && emojiPickerContainer && emojiPicker) {
      btnEmojiPicker.addEventListener('click', (e) => {
        e.stopPropagation();
        emojiPickerContainer.style.display = emojiPickerContainer.style.display === 'none' ? 'block' : 'none';
      });

      document.addEventListener('click', (e) => {
        if (!emojiPickerContainer.contains(e.target) && e.target !== btnEmojiPicker) {
          emojiPickerContainer.style.display = 'none';
        }
      });

      emojiPicker.addEventListener('emoji-click', (e) => {
        const emoji = e.detail.unicode;
        if (chatInput) {
          const start = chatInput.selectionStart;
          const end = chatInput.selectionEnd;
          const text = chatInput.value;
          chatInput.value = text.substring(0, start) + emoji + text.substring(end);
          chatInput.selectionStart = chatInput.selectionEnd = start + emoji.length;
          chatInput.focus();
        }
      });
    }

    // --- Audio Recording Logic ---
    let mediaRecorder;
    let audioChunks = [];
    let isRecordingAudio = false;
    let recordingTimerInterval;
    let recordingStartTime;
    let cancelRecording = false;
    
    const btnRecordAudio = document.getElementById('btnRecordAudio');
    const btnCancelRecording = document.getElementById('btnCancelRecording');
    const chatRecordingUI = document.getElementById('chatRecordingUI');
    const btnSendChat = document.getElementById('btnSendChat');
    const btnAttachMedia = document.getElementById('btnAttachMedia');
    const chatInputWrapper = document.querySelector('.chat-input-wrapper');
    
    function updateRecordingTimer() {
        const now = Date.now();
        const diff = new Date(now - recordingStartTime);
        const m = diff.getMinutes().toString().padStart(2, '0');
        const s = diff.getSeconds().toString().padStart(2, '0');
        document.getElementById('chatRecordingTimer').textContent = `${m}:${s}`;
    }

    function resetRecordingUI() {
        if (recordingTimerInterval) clearInterval(recordingTimerInterval);
        isRecordingAudio = false;
        cancelRecording = false;
        
        chatRecordingUI.style.display = 'none';
        chatInput.style.display = 'block';
        btnAttachMedia.style.display = 'flex';
        btnEmojiPicker.style.display = 'flex';
        btnSendChat.style.display = 'flex';
        
        // Reset mic icon
        btnRecordAudio.innerHTML = `
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"></path>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
            <line x1="12" y1="19" x2="12" y2="23"></line>
            <line x1="8" y1="23" x2="16" y2="23"></line>
          </svg>
        `;
        btnRecordAudio.classList.remove('recording-pulse');
        btnRecordAudio.style.color = '';
    }
    
    if (btnCancelRecording) {
        btnCancelRecording.addEventListener('click', (e) => {
            e.preventDefault();
            if (mediaRecorder && mediaRecorder.state === 'recording') {
                cancelRecording = true;
                mediaRecorder.stop();
            }
        });
    }
    
    if (btnRecordAudio) {
      btnRecordAudio.addEventListener('click', async () => {
        if (isRecordingAudio && mediaRecorder && mediaRecorder.state === 'recording') {
          // User clicked send!
          mediaRecorder.stop();
        } else {
          // Start recording
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.addEventListener('dataavailable', event => {
              audioChunks.push(event.data);
            });
            
            mediaRecorder.addEventListener('stop', async () => {
              stream.getTracks().forEach(track => track.stop());
              
              if (cancelRecording) {
                  resetRecordingUI();
                  return;
              }
              
              // Proceed to send
              const audioBlob = new Blob(audioChunks, { type: 'audio/webm;codecs=opus' });
              const reader = new FileReader();
              reader.onload = async (ev) => {
                const base64Data = ev.target.result.split(',')[1];
                resetRecordingUI();
                
                try {
                  showToast('Enviando áudio...', 'info');
                  await WhatsAppDirect.sendMediaMessage(selectedChatJid, base64Data, 'audio/webm;codecs=opus', '', {
                    instanceId: selectedChatInstance
                  });
                  await refreshInbox();
                  
                  const container = document.getElementById('chatMessages');
                  if (container) container.scrollTop = container.scrollHeight;
                } catch (err) {
                  showToast('Erro ao enviar áudio.', 'error');
                }
              };
              reader.readAsDataURL(audioBlob);
            });
            
            mediaRecorder.start();
            isRecordingAudio = true;
            cancelRecording = false;
            
            // Update UI
            chatInput.style.display = 'none';
            btnAttachMedia.style.display = 'none';
            btnEmojiPicker.style.display = 'none';
            btnSendChat.style.display = 'none';
            chatRecordingUI.style.display = 'flex';
            
            // Start timer
            recordingStartTime = Date.now();
            updateRecordingTimer();
            recordingTimerInterval = setInterval(updateRecordingTimer, 1000);
            
            // Change mic icon to Send icon
            btnRecordAudio.innerHTML = `
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2">
                <line x1="22" y1="2" x2="11" y2="13"></line>
                <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
              </svg>
            `;
            
          } catch (err) {
            showToast('Não foi possível acessar o microfone.', 'error');
          }
        }
      });
    }


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

  let lastChatMessagesHash = '';

  async function refreshInbox() {
    const allMessages = await WhatsAppDirect.fetchMessages();
    const newHash = JSON.stringify(allMessages);
    
    if (newHash === lastChatMessagesHash) {
      return false; // No changes, prevent flicker
    }
    
    lastChatMessagesHash = newHash;
    chatMessages = allMessages;

    renderInboxList();
    return true;
  }

  // Helper to match a JID or raw phone against registered contacts in SupabaseModule
  function getMatchedContact(jid, phone) {
    const rawDigits = (phone || jid?.split('@')[0] || '').replace(/\D/g, '');
    if (!rawDigits) return null;
    const allContacts = (typeof SupabaseModule !== 'undefined' && SupabaseModule.getAllContacts) ? SupabaseModule.getAllContacts() : [];
    
    return allContacts.find(c => {
      const cPhone = (c.formattedPhone || c.rawPhone || c.phone || c.whatsapp || '').replace(/\D/g, '');
      if (!cPhone) return false;
      if (cPhone === rawDigits) return true;
      if (c.remoteJid && (c.remoteJid === jid || c.remoteJid === `${rawDigits}@lid`)) return true;
      
      if (rawDigits.length >= 8 && cPhone.length >= 8) {
        const norm1 = rawDigits.startsWith('55') ? rawDigits.substring(2) : rawDigits;
        const norm2 = cPhone.startsWith('55') ? cPhone.substring(2) : cPhone;
        if (norm1 === norm2) return true;
        if (norm1.length === 11 && norm2.length === 10 && norm1.substring(0, 2) === norm2.substring(0, 2) && norm1.substring(3) === norm2.substring(2)) return true;
        if (norm2.length === 11 && norm1.length === 10 && norm2.substring(0, 2) === norm1.substring(0, 2) && norm2.substring(3) === norm1.substring(2)) return true;
      }
      return false;
    }) || null;
  }

  // Quick add to agenda handlers
  window.quickAddToAgenda = async function(jid, suggestedName, rawPhone) {
    let phone = rawPhone || (jid ? jid.split('@')[0].replace(/\D/g, '') : '');
    
    // Se for um LID do WhatsApp (>13 dígitos ou @lid), resolve o número real com DDD
    const isLid = (jid && jid.includes('@lid')) || (phone && phone.length > 13);
    if (isLid) {
      const foundMsg = chatMessages.find(m => (m.remoteJid === jid || m.phone === phone) && m.realPhone && m.realPhone.length <= 13);
      if (foundMsg && foundMsg.realPhone) {
        phone = foundMsg.realPhone;
      } else {
        try {
          const res = await fetch(`/api/whatsapp/resolve-phone?jid=${encodeURIComponent(jid || phone)}`);
          const data = await res.json();
          if (data && data.phone && data.phone.length <= 13) {
            phone = data.phone;
          } else {
            phone = '';
          }
        } catch (e) {
          phone = '';
        }
      }
    }

    const cleanPhone = (typeof SupabaseModule !== 'undefined' && SupabaseModule.formatDisplayPhone && phone) ? SupabaseModule.formatDisplayPhone(phone) : (phone || '');
    
    let cleanName = (suggestedName || '').trim();
    if (cleanName.includes('@') || /^\+?\d[\d\s\-()]+$/.test(cleanName)) {
      cleanName = '';
    }

    if (typeof openNewContactModal === 'function') {
      openNewContactModal();
      if (cleanName) {
        const nameInput = document.getElementById('editContactName');
        if (nameInput) nameInput.value = cleanName;
      }
      const phoneInput = document.getElementById('editContactPhone');
      if (phoneInput) {
        phoneInput.value = cleanPhone;
        if (!cleanPhone) {
          phoneInput.placeholder = 'Digite o número do WhatsApp com DDD';
          phoneInput.focus();
        }
      }
    }
  };

  window.quickAddCurrentChatToAgenda = async function() {
    if (!selectedChatJid) return;
    const rawDigits = (selectedChatJid.split('@')[0] || '').replace(/\D/g, '');
    const firstInbound = chatMessages.find(m => (m.remoteJid === selectedChatJid || m.phone === rawDigits) && !m.fromMe && m.name);
    const whatsAppName = firstInbound?.name || '';
    await window.quickAddToAgenda(selectedChatJid, whatsAppName, firstInbound?.realPhone || rawDigits);
  };

  window.editCurrentChatContact = function() {
    if (!selectedChatJid) return;
    const matched = getMatchedContact(selectedChatJid);
    if (matched && typeof openEditContactModal === 'function') {
      openEditContactModal(matched.id);
    }
  };

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
        if (!conversations[key].name && msg.name) conversations[key].name = msg.name;
        conversations[key].unreadCount++;
      }
      if (new Date(msg.timestamp) > new Date(conversations[key].lastMessage.timestamp)) {
        conversations[key].lastMessage = msg;
      }
    }

    let convList = Object.values(conversations)
      .sort((a, b) => new Date(b.lastMessage.timestamp) - new Date(a.lastMessage.timestamp));

    if (searchQuery) {
      convList = convList.filter(c => {
        const rawDigits = (c.phone || c.jid.split('@')[0] || '').replace(/\D/g, '');
        const matched = getMatchedContact(c.jid, c.phone);
        const contactName = matched ? (matched.displayName || matched.name || '').toLowerCase() : '';
        const waName = (c.name || '').toLowerCase();
        return contactName.includes(searchQuery) || waName.includes(searchQuery) || rawDigits.includes(searchQuery);
      });
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
      const rawDigits = (c.phone || c.jid.split('@')[0] || '').replace(/\D/g, '');
      const displayPhone = (typeof SupabaseModule !== 'undefined' && SupabaseModule.formatDisplayPhone) ? SupabaseModule.formatDisplayPhone(rawDigits) : rawDigits;
      const matched = getMatchedContact(c.jid, c.phone);
      
      const cleanWhatsAppName = (c.name && !c.name.includes('@') && !/^\d+$/.test(c.name.replace(/\D/g, ''))) ? c.name : '';
      
      let titleName = '';
      let isInAgenda = false;
      let statusColor = c.instanceColor || '#10b981';

      if (matched) {
        titleName = matched.displayName || matched.name;
        isInAgenda = true;
        if (matched.status === 'Verde') statusColor = '#10b981';
        else if (matched.status === 'Amarelo') statusColor = '#f59e0b';
        else if (matched.status === 'Vermelho') statusColor = '#ef4444';
      } else {
        titleName = cleanWhatsAppName || displayPhone;
        isInAgenda = false;
      }

      const initials = (titleName || '?').substring(0, 2).toUpperCase();
      const preview = c.lastMessage.text ? (c.lastMessage.text.substring(0, 45) + (c.lastMessage.text.length > 45 ? '...' : '')) : '[mídia]';
      const isActive = selectedChatJid === c.jid;
      const escapedPush = (cleanWhatsAppName || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');

      return `
        <div class="inbox-item ${isActive ? 'active' : ''}" onclick="App.selectChat('${c.jid}', '${c.instanceId}')">
          <div class="inbox-avatar" style="border: 2px solid ${statusColor}">${initials}</div>
          <div class="inbox-item-info">
            <div class="inbox-item-name-row" style="display:flex; align-items:center; justify-content:space-between; gap:4px;">
              <span class="inbox-item-name" style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;" title="${titleName}">${titleName}</span>
              ${!isInAgenda ? `<button type="button" class="btn-inbox-add-agenda" title="Incluir na Agenda" onclick="event.stopPropagation(); quickAddToAgenda('${c.jid}', '${escapedPush}', '${rawDigits}')"><i class="ti ti-user-plus"></i> + Agenda</button>` : `<span style="font-size:10px; color:${statusColor}; font-weight:700;" title="Na Agenda (${matched.status})">●</span>`}
            </div>
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

    // Update instance selector
    const instSelect = document.getElementById('chatInstanceSelect');
    if (instSelect) {
      instSelect.value = instanceId || '';
      // If the exact instance is not connected/listed, keep it on Auto
      if (instSelect.value !== instanceId) {
         instSelect.value = '';
      }
    }

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

    // Set header with Agenda matching
    const rawDigits = (selectedChatJid.split('@')[0] || '').replace(/\D/g, '');
    const displayPhone = (typeof SupabaseModule !== 'undefined' && SupabaseModule.formatDisplayPhone) ? SupabaseModule.formatDisplayPhone(rawDigits) : rawDigits;
    const matched = getMatchedContact(selectedChatJid);
    const firstInbound = conv.find(m => !m.fromMe && m.name);
    const whatsAppName = (firstInbound?.name && !firstInbound.name.includes('@')) ? firstInbound.name : '';

    const nameEl = document.getElementById('chatContactName');
    const phoneEl = document.getElementById('chatContactPhone');
    const btnQuickAdd = document.getElementById('btnChatQuickAddAgenda');
    const avatarEl = document.getElementById('chatAvatar');

    if (matched) {
      const statusBadge = `<span class="badge badge-${matched.status === 'Verde' ? 'success' : matched.status === 'Amarelo' ? 'warning' : 'danger'}" style="font-size:11px; margin-left:6px; vertical-align:middle;">${matched.status}</span>`;
      if (nameEl) nameEl.innerHTML = `${matched.displayName || matched.name} ${statusBadge}`;
      if (phoneEl) phoneEl.textContent = `${displayPhone}${matched.profession && matched.profession !== 'Não informado' ? ` • ${matched.profession}` : ' • Contato na Agenda'}`;
      if (btnQuickAdd) btnQuickAdd.style.display = 'none';
      if (avatarEl) {
        avatarEl.textContent = (matched.displayName || matched.name || '?').substring(0, 2).toUpperCase();
        avatarEl.style.borderColor = matched.status === 'Verde' ? '#10b981' : matched.status === 'Amarelo' ? '#f59e0b' : '#ef4444';
      }
    } else {
      if (nameEl) nameEl.textContent = whatsAppName || displayPhone;
      if (phoneEl) phoneEl.textContent = `${displayPhone} • Não cadastrado na Agenda`;
      if (btnQuickAdd) btnQuickAdd.style.display = 'inline-flex';
      if (avatarEl) {
        avatarEl.textContent = (whatsAppName || displayPhone || '?').substring(0, 2).toUpperCase();
        avatarEl.style.borderColor = '#9ca3af';
      }
    }

    const html = conv.map(msg => {
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

    const newHTML = html;

    // Check if user is scrolled near bottom
    const isScrolledToBottom = container.scrollHeight - container.scrollTop <= container.clientHeight + 100;
    
    // Only update DOM if HTML changed
    if (container.innerHTML !== newHTML) {
      container.innerHTML = newHTML;
      // Maintain scroll position or scroll to bottom if they were already there
      if (isScrolledToBottom || container.scrollTop === 0) {
        container.scrollTop = container.scrollHeight;
      }
    }
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
      const selectedSelectInstance = document.getElementById('chatInstanceSelect')?.value || selectedChatInstance;
      
      if (attachment) {
        showToast('Enviando arquivo...', 'info');
        await WhatsAppDirect.sendMediaMessage(selectedChatJid, attachment.base64Data, attachment.mimeType, text, {
          instanceId: selectedSelectInstance
        });
        showToast('Mídia enviada!', 'success');
      } else {
        await WhatsAppDirect.sendMessage(selectedChatJid, text, {
          instanceId: selectedSelectInstance
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
      const selectedSelectInstance = document.getElementById('chatInstanceSelect')?.value || selectedChatInstance;
      await WhatsAppDirect.sendMessage(selectedChatJid, text, {
        instanceId: selectedSelectInstance
      });
      showToast('Sugestão enviada!', 'success');
      setTimeout(() => refreshInbox(), 1000);
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  function updateContactPanel(jid) {
    if (!jid) return;
    const rawDigits = (jid.split('@')[0] || '').replace(/\D/g, '');
    const displayPhone = (typeof SupabaseModule !== 'undefined' && SupabaseModule.formatDisplayPhone) ? SupabaseModule.formatDisplayPhone(rawDigits) : rawDigits;
    const matched = getMatchedContact(jid);

    const nameEl = document.getElementById('contactPanelName');
    const phoneEl = document.getElementById('contactPanelPhone');
    const emailEl = document.getElementById('contactPanelEmail');
    const profEl = document.getElementById('contactPanelProfession');
    const regEl = document.getElementById('contactPanelRegion');
    const statusEl = document.getElementById('contactPanelStatus');
    const aiEl = document.getElementById('contactPanelAiMode');
    const notRegBox = document.getElementById('contactPanelNotRegisteredBox');
    const editBtnWrap = document.getElementById('contactPanelEditBtnWrapper');
    const avatarEl = document.getElementById('contactPanelAvatar');

    if (matched) {
      if (nameEl) nameEl.textContent = matched.displayName || matched.name;
      if (phoneEl) phoneEl.textContent = displayPhone;
      if (emailEl) emailEl.textContent = matched.email || '—';
      if (profEl) profEl.textContent = matched.profession || '—';
      if (regEl) regEl.textContent = matched.region || '—';
      if (statusEl) {
        const color = matched.status === 'Verde' ? '#10b981' : matched.status === 'Amarelo' ? '#f59e0b' : '#ef4444';
        statusEl.innerHTML = `<span style="color:${color}; font-weight:600;">● ${matched.status}</span>`;
      }
      if (aiEl) aiEl.textContent = matched.aiMode || 'autonomous';
      if (notRegBox) notRegBox.style.display = 'none';
      if (editBtnWrap) editBtnWrap.style.display = 'block';
      if (avatarEl) {
        avatarEl.textContent = (matched.displayName || matched.name || '?').substring(0, 2).toUpperCase();
        avatarEl.style.borderColor = matched.status === 'Verde' ? '#10b981' : matched.status === 'Amarelo' ? '#f59e0b' : '#ef4444';
      }
    } else {
      const conv = chatMessages.find(m => (m.remoteJid === jid || m.phone === rawDigits) && !m.fromMe && m.name);
      const whatsAppName = (conv?.name && !conv.name.includes('@')) ? conv.name : '';

      if (nameEl) nameEl.textContent = whatsAppName || displayPhone;
      if (phoneEl) phoneEl.textContent = displayPhone;
      if (emailEl) emailEl.textContent = '—';
      if (profEl) profEl.textContent = '—';
      if (regEl) regEl.textContent = '—';
      if (statusEl) statusEl.innerHTML = '<span class="text-muted">Não cadastrado</span>';
      if (aiEl) aiEl.textContent = 'autonomous';
      if (notRegBox) notRegBox.style.display = 'block';
      if (editBtnWrap) editBtnWrap.style.display = 'none';
      if (avatarEl) {
        avatarEl.textContent = (whatsAppName || displayPhone || '?').substring(0, 2).toUpperCase();
        avatarEl.style.borderColor = '#9ca3af';
      }
    }
  }

  // ========================================================================
  // AI TAB
  // ========================================================================
  function setupAITab() {
    document.getElementById('aiGlobalAutoReply')?.addEventListener('change', async (e) => {
      await AICopilotModule.toggleAutoReply(e.target.checked);
      document.getElementById('headerAutoReplyCheckbox').checked = e.target.checked;
      showToast(e.target.checked ? ' Auto-resposta ativada!' : ' Auto-resposta desativada.', 'info');
      updateAIHeaderPill();
    });
  }

  window.setActiveAiAssistant = async function(agentKey) {
    try {
      await AICopilotModule.updateConfig({ activeAgent: agentKey });
      const config = await AICopilotModule.fetchConfig();
      const agentName = config.customAgents?.[agentKey]?.name || agentKey;
      showToast(`⭐ Assistente "${agentName}" ativado para respostas automáticas!`, 'success');
      updateAIHeaderPill();
      refreshAIPanel();
    } catch (err) {
      showToast('Erro ao trocar assistente: ' + err.message, 'error');
    }
  };

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
    
    renderAgentsGrid(agents, config.activeAgent || 'tira-duvidas');

    const isAutoOn = (config.autoReplyEnabled !== undefined) ? config.autoReplyEnabled : (status.autoReplyEnabled ?? false);
    const chkGlobal = document.getElementById('aiGlobalAutoReply');
    if (chkGlobal) chkGlobal.checked = isAutoOn;
    const chkHeader = document.getElementById('headerAutoReplyCheckbox');
    if (chkHeader) chkHeader.checked = isAutoOn;

    updateAIHeaderPill();
  }

  function renderAgentsGrid(agents, activeAgentId) {
    const grid = document.getElementById('aiAgentsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    for (const [key, agent] of Object.entries(agents)) {
      const themeColors = {
        blue: '#3b82f6', yellow: '#f59e0b', purple: '#8b5cf6', green: '#10b981'
      };
      const color = themeColors[agent.theme] || '#3b82f6';
      const isActive = (agent.id === activeAgentId);

      grid.innerHTML += `
        <div class="card" style="position:relative; border-left: 4px solid ${color}; border-radius:16px; box-shadow: ${isActive ? '0 0 0 2px var(--brand-primary)' : 'none'};">
          <div class="card-body" style="display:flex; align-items:center; gap:1.25rem; padding: 1rem 1.25rem; flex-wrap:wrap;">
            <div style="width:40px; height:40px; border-radius:12px; background:${color}22; border:1px solid ${color}44; display:flex; align-items:center; justify-content:center; color:${color}; font-size:1.3rem; flex-shrink:0;">
              ${agent.icon ? `<span>${agent.icon}</span>` : `<i class="ti ti-robot"></i>`}
            </div>
            <div style="flex:1; min-width:200px;">
              <div style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap;">
                <strong style="font-size:1.02rem;">${agent.name}</strong>
                ${isActive ? `<span class="badge badge-success" style="font-weight:700;"><i class="ti ti-star-filled"></i> Ativo no Auto-Reply</span>` : ''}
                <span class="badge" style="background:${color}20; color:${color}; border:1px solid ${color}40;">${agent.defaultMode === 'copilot' ? 'Co-Piloto' : 'Autônomo'}</span>
              </div>
              <p class="text-muted text-sm mt-1" style="margin:4px 0 0; line-height:1.4;">${agent.description}</p>
            </div>
            <div style="display:flex; align-items:center; gap:0.6rem; flex-shrink:0;">
              ${isActive ? `
                <button type="button" class="crx-btn crx-btn-primary crx-btn--sm" style="cursor:default; pointer-events:none;">
                  <i class="ti ti-check"></i> Assistente Ativo
                </button>
              ` : `
                <button type="button" class="crx-btn crx-btn-outline crx-btn--sm" onclick="setActiveAiAssistant('${agent.id}')">
                  <i class="ti ti-power"></i> Ligar neste Assistente
                </button>
              `}
              <button class="crx-btn crx-btn-ghost crx-btn--sm" onclick="editAgent('${agent.id}')" title="Editar"><i class="ti ti-pencil"></i></button>
              <button class="crx-btn crx-btn-ghost crx-btn--sm text-danger" onclick="deleteAgent('${agent.id}')" title="Excluir"><i class="ti ti-trash"></i></button>
            </div>
          </div>
          <div id="contextFiles-${agent.id}" style="padding: 0 1.25rem 0.75rem; border-top: 1px solid var(--border-color-light);"></div>
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
      const activeKey = cfg?.activeAgent || 'tira-duvidas';
      const select = document.getElementById('headerAgentSelect');
      if (select) {
        select.innerHTML = Object.entries(agents).map(([key, ag]) => {
          const icon = ag.icon || '🤖';
          return `<option value="${key}" ${key === activeKey ? 'selected' : ''}>${icon} ${ag.name}</option>`;
        }).join('');
        select.value = activeKey;
      }
      if (cfg?.autoReplyEnabled !== undefined) {
        const chk = document.getElementById('headerAutoReplyCheckbox');
        if (chk) chk.checked = cfg.autoReplyEnabled;
        const dot = document.getElementById('headerAiDot');
        if (dot) {
          dot.className = cfg.autoReplyEnabled ? 'status-dot dot-online' : 'status-dot dot-offline';
        }
      }
    });
  }

  // ========================================================================
  // SETTINGS TAB
  // ========================================================================
  function setupSettingsTab() {
    document.getElementById('btnAddInstance')?.addEventListener('click', () => {
      openNewInstanceModal();
    });

    document.getElementById('btnSidebarAddLinha')?.addEventListener('click', () => {
      openNewInstanceModal();
    });
  }

  async function refreshInstances() {
    const instances = await WhatsAppDirect.fetchInstances();

    // Settings grid
    const grid = document.getElementById('instancesGrid');
    if (grid) {
      if (!instances || instances.length === 0) {
        grid.innerHTML = `
          <div style="grid-column: 1 / -1; text-align:center; padding: 2.5rem; background: var(--surface-card); border-radius: 12px; border: 1px dashed var(--border-color);">
            <div style="font-size:2.5rem; margin-bottom:0.5rem; color:#10b981;"><i class="ti ti-brand-whatsapp"></i></div>
            <h4 style="font-weight:600; margin-bottom:4px;">Nenhuma conexão WhatsApp configurada</h4>
            <p class="text-muted text-sm mb-4">Adicione uma nova linha WhatsApp para começar a enviar e receber mensagens.</p>
            <button class="btn btn-sm btn-primary" onclick="openNewInstanceModal()"><i class="ti ti-plus"></i> Criar Nova Linha</button>
          </div>
        `;
      } else {
        grid.innerHTML = instances.map(inst => {
          let statusBadge = '';
          if (inst.disabled) {
            statusBadge = '<span class="badge" style="background:var(--surface-muted); color:var(--text-muted); border:1px solid var(--border-color);"><i class="ti ti-player-pause"></i> Desativado</span>';
          } else if (inst.connected) {
            statusBadge = '<span class="badge badge-success"><i class="ti ti-circle-check"></i> Conectado</span>';
          } else if (inst.qrCode) {
            statusBadge = '<span class="badge badge-warning"><i class="ti ti-qrcode"></i> QR Pronto</span>';
          } else {
            statusBadge = '<span class="badge badge-neutral"><i class="ti ti-plug-off"></i> Desconectado</span>';
          }

          const phoneNumber = inst.user?.phone ? (typeof SupabaseModule !== 'undefined' && SupabaseModule.formatDisplayPhone ? SupabaseModule.formatDisplayPhone(inst.user.phone) : inst.user.phone) : (inst.disabled ? 'Linha Desativada' : (inst.id === 'default' ? 'Linha Principal' : inst.id));

          return `
            <div class="card" style="border-left: 5px solid ${inst.color}; position: relative; opacity: ${inst.disabled ? '0.75' : '1'}; transition: all 0.2s ease;">
              <div class="card-body" style="padding: 1.25rem;">
                <div class="flex-between mb-3" style="align-items: flex-start;">
                  <div>
                    <div style="display:flex; align-items:center; gap:6px;">
                      <span style="display:inline-block; width:10px; height:10px; border-radius:50%; background:${inst.color};"></span>
                      <strong style="font-size:1rem;">${inst.name}</strong>
                      <button type="button" class="btn btn-sm btn-ghost" onclick="openEditInstanceModal('${inst.id}', '${inst.name.replace(/'/g, "\\'")}', '${inst.color}')" title="Editar nome e cor da conexão" style="padding:2px 6px; color:var(--text-muted); font-size:12px;">
                        <i class="ti ti-edit"></i>
                      </button>
                      ${inst.isDefault ? '<span class="badge badge-sm badge-neutral" style="font-size:10px; padding:2px 6px;">Padrão</span>' : ''}
                    </div>
                    <div class="text-muted text-sm" style="margin-top:2px; font-family:var(--font-mono);">${phoneNumber}</div>
                  </div>
                  <div>${statusBadge}</div>
                </div>

                ${!inst.disabled && inst.qrCode ? `
                  <div class="qr-display" style="text-align:center; padding:12px; background:var(--surface-subtle, #f8fafc); border-radius:8px; margin: 12px 0;">
                    <div style="font-size:12px; color:var(--text-muted); margin-bottom:6px;">Escaneie o QR Code no seu WhatsApp:</div>
                    <img src="${inst.qrCode}" alt="QR Code WhatsApp" style="width:160px; height:160px; border-radius:8px; border: 1px solid var(--border-color); background:#fff; padding:4px;">
                  </div>
                ` : ''}

                <div style="display:flex; gap:0.5rem; flex-wrap:wrap; margin-top: 1rem; padding-top: 0.75rem; border-top: 1px solid var(--border-color); align-items:center;">
                  <button class="btn btn-sm btn-ghost" onclick="openEditInstanceModal('${inst.id}', '${inst.name.replace(/'/g, "\\'")}', '${inst.color}')" title="Mudar nome da conexão" style="color:var(--text-muted);">
                    <i class="ti ti-edit"></i> Renomear
                  </button>

                  ${inst.disabled ? `
                    <button class="btn btn-sm btn-primary" onclick="App.toggleInstance('${inst.id}', true)" title="Ativar esta linha" style="flex:1;">
                      <i class="ti ti-player-play"></i> Ativar WhatsApp
                    </button>
                  ` : `
                    <button class="btn btn-sm btn-ghost" onclick="App.toggleInstance('${inst.id}', false)" title="Desativar/Pausar individualmente" style="color:var(--text-muted);">
                      <i class="ti ti-player-pause"></i> Desativar
                    </button>
                    <button class="btn btn-sm btn-ghost" onclick="App.logoutInstance('${inst.id}')" title="Desconectar e gerar novo QR Code">
                      <i class="ti ti-refresh"></i> Reconectar
                    </button>
                  `}
                  
                  <button class="btn btn-sm btn-danger" onclick="App.removeInstance('${inst.id}')" title="Excluir conexão definitivamente" style="padding: 6px 10px; margin-left:auto;">
                    <i class="ti ti-trash"></i> Deletar
                  </button>
                </div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    // Sidebar linhas
    const sidebarList = document.getElementById('sidebarLinhasList');
    if (sidebarList) {
      sidebarList.innerHTML = instances.map(inst => `
        <div class="sidebar-linha-card" style="border-left-color: ${inst.color}; opacity: ${inst.disabled ? '0.5' : '1'};">
          <div class="flex-between">
            <span class="linha-name" style="font-weight:600">${inst.name}</span>
            <span class="status-dot ${inst.disabled ? 'dot-offline' : (inst.connected ? 'dot-online' : 'dot-warning')}" style="width:8px;height:8px"></span>
          </div>
          ${inst.user?.phone ? `<div class="text-muted" style="font-size:11px">${inst.user.phone}</div>` : (inst.disabled ? '<div class="text-muted" style="font-size:10px">Desativada</div>' : '')}
        </div>
      `).join('');
    }

    // Dispatcher instance select
    const select = document.getElementById('instanceSelectDispatcher');
    if (select) {
      const current = select.value;
      select.innerHTML = '<option value="round-robin"> Revezamento (Round-Robin)</option>';
      instances.filter(i => i.connected && !i.disabled).forEach(inst => {
        select.innerHTML += `<option value="${inst.id}" ${current === inst.id ? 'selected' : ''}>${inst.name} (${inst.user?.phone || inst.id})</option>`;
      });
    }

    // Header status
    updateWhatsAppStatus(instances);
  }

  function updateWhatsAppStatus(instances) {
    const activeInstances = instances.filter(i => !i.disabled);
    const connectedCount = activeInstances.filter(i => i.connected).length;
    const dot = document.getElementById('whatsappDirectDot');
    const text = document.getElementById('whatsappDirectStatusText');

    if (connectedCount > 0) {
      if (dot) { dot.classList.remove('dot-offline', 'dot-warning'); dot.classList.add('dot-online'); }
      if (text) text.textContent = `${connectedCount} linha${connectedCount > 1 ? 's' : ''} ativa${connectedCount > 1 ? 's' : ''}`;
    } else if (activeInstances.some(i => i.qrCode)) {
      if (dot) { dot.classList.remove('dot-online', 'dot-offline'); dot.classList.add('dot-warning'); }
      if (text) text.textContent = 'QR Pendente';
    } else {
      if (dot) { dot.classList.remove('dot-online', 'dot-warning'); dot.classList.add('dot-offline'); }
      if (text) text.textContent = 'Desconectado';
    }
  }

  async function toggleInstance(id, enabled) {
    const actionLabel = enabled ? 'Ativando' : 'Desativando';
    showToast(`${actionLabel} linha WhatsApp...`, 'info');
    try {
      const res = await WhatsAppDirect.toggleInstance(id, enabled);
      if (res.success) {
        showToast(res.message || (enabled ? 'Linha WhatsApp ativada!' : 'Linha WhatsApp desativada.'), 'success');
        refreshInstances();
      } else {
        showToast(`Erro: ${res.error || 'Falha ao alterar estado da linha.'}`, 'error');
      }
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  async function logoutInstance(id) {
    if (!confirm('Desconectar e gerar novo QR Code para esta linha?')) return;
    try {
      await WhatsAppDirect.logoutInstance(id);
      showToast('Reconectando linha...', 'info');
      setTimeout(refreshInstances, 2000);
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  }

  async function removeInstance(id) {
    if (!confirm('Deseja realmente EXCLUIR esta conexão WhatsApp definitivamente?')) return;
    try {
      showToast('Excluindo linha WhatsApp...', 'info');
      const res = await WhatsAppDirect.deleteInstance(id);
      if (res.success) {
        showToast('Linha WhatsApp removida com sucesso.', 'success');
        refreshInstances();
      } else {
        showToast(`Erro: ${res.error || 'Falha ao excluir linha.'}`, 'error');
      }
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
    refreshInstances, toggleInstance,
    logoutInstance, removeInstance
  };
})();

// Modal de Nova Linha WhatsApp
window.openNewInstanceModal = function() {
  const modal = document.getElementById('newInstanceModal');
  if (modal) {
    const input = document.getElementById('newInstanceName');
    if (input) input.value = '';
    modal.classList.add('active');
    setTimeout(() => input?.focus(), 100);
  }
};

window.closeNewInstanceModal = function() {
  const modal = document.getElementById('newInstanceModal');
  if (modal) modal.classList.remove('active');
};

window.confirmCreateInstance = async function() {
  const nameInput = document.getElementById('newInstanceName');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    if (typeof App !== 'undefined' && App.showToast) App.showToast('Informe o nome da nova linha WhatsApp.', 'warning');
    nameInput?.focus();
    return;
  }

  const selectedColorEl = document.querySelector('input[name="newInstanceColor"]:checked');
  const color = selectedColorEl ? selectedColorEl.value : '#10b981';

  const btn = document.getElementById('btnConfirmCreateInstance');
  if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }

  try {
    if (typeof App !== 'undefined' && App.showToast) App.showToast(`Criando linha "${name}"...`, 'info');
    const result = await WhatsAppDirect.createInstance(name, color);
    if (result.success) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast(`Linha "${name}" criada com sucesso! Escaneie o QR Code.`, 'success');
      closeNewInstanceModal();
      if (typeof App !== 'undefined' && App.refreshInstances) {
        App.refreshInstances();
      }
    } else {
      if (typeof App !== 'undefined' && App.showToast) App.showToast(`Erro: ${result.error || 'Falha ao criar linha.'}`, 'error');
    }
  } catch (err) {
    if (typeof App !== 'undefined' && App.showToast) App.showToast(`Erro: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Criar e Gerar QR'; }
  }
};

// Modal de Edição de Linha WhatsApp
window.openEditInstanceModal = function(id, name, color) {
  const modal = document.getElementById('editInstanceModal');
  if (!modal) return;
  document.getElementById('editInstanceId').value = id;
  const nameInput = document.getElementById('editInstanceName');
  if (nameInput) nameInput.value = name || '';

  const radios = document.querySelectorAll('input[name="editInstanceColor"]');
  radios.forEach(r => {
    r.checked = (r.value === color);
  });

  modal.classList.add('active');
  setTimeout(() => nameInput?.focus(), 100);
};

window.closeEditInstanceModal = function() {
  const modal = document.getElementById('editInstanceModal');
  if (modal) modal.classList.remove('active');
};

window.confirmEditInstance = async function() {
  const id = document.getElementById('editInstanceId').value;
  const nameInput = document.getElementById('editInstanceName');
  const name = nameInput ? nameInput.value.trim() : '';
  if (!name) {
    if (typeof App !== 'undefined' && App.showToast) App.showToast('Informe o nome da conexão.', 'warning');
    nameInput?.focus();
    return;
  }

  const selectedColorEl = document.querySelector('input[name="editInstanceColor"]:checked');
  const color = selectedColorEl ? selectedColorEl.value : '#10b981';

  const btn = document.getElementById('btnConfirmEditInstance');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

  try {
    const result = await WhatsAppDirect.renameInstance(id, name, color);
    if (result.success) {
      if (typeof App !== 'undefined' && App.showToast) App.showToast(`Conexão atualizada para "${name}"!`, 'success');
      closeEditInstanceModal();
      if (typeof App !== 'undefined' && App.refreshInstances) {
        App.refreshInstances();
      }
    } else {
      if (typeof App !== 'undefined' && App.showToast) App.showToast(`Erro: ${result.error || 'Falha ao salvar conexão.'}`, 'error');
    }
  } catch (err) {
    if (typeof App !== 'undefined' && App.showToast) App.showToast(`Erro: ${err.message}`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = 'Salvar Alterações'; }
  }
};

// ============================================================================
// BOOT
// ============================================================================
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});

// ============================================================================
// AGENT MANAGEMENT MODAL FUNCTIONS
// ============================================================================
// ============================================================================
// AGENT MANAGEMENT MODAL FUNCTIONS (TEMPLATE ESTRUTURADO)
// ============================================================================

function compileAgentPrompt(fields) {
  return `[PAPEL E FUNÇÃO]:
- Nome do Agente: ${fields.name}
- Função Principal: ${fields.role || fields.description}
- Objetivo Final: ${fields.goal || 'Atendimento com excelência e direcionamento quando necessário'}

[PERSONALIDADE E TOM DE VOZ]:
- Estilo de Comunicação: ${fields.commStyle || 'Descontraído, moderno, empático e ágil'}
- Tom de Voz: ${fields.tone || 'Educado, acolhedor e direto ao ponto'}
- Uso de Emojis: ${fields.emojiPolicy || 'Usar com moderação'}
- Idioma/Regionalismo: ${fields.language || 'Português do Brasil'}

[RESTRIÇÕES E LIMITES — O QUE NÃO DEVE FALAR]:
- Assuntos Proibidos: ${fields.forbiddenTopics || 'Não falar sobre política, religião ou concorrentes.'}
- Informações Confidenciais: ${fields.confidentialPolicy || 'Nunca solicitar senhas ou dados sensíveis.'}
- Limites de Conhecimento: ${fields.knowledgeLimits || 'Se não souber a resposta, não invente. Diga que vai direcionar para a equipe humana.'}
- Tom e Promessas a Evitar: ${fields.toneAvoid || 'Nunca seja irônico ou defensivo. Não prometa prazos sem autorização.'}

[CONHECIMENTO E BASE DE CONTEXTO]:
- Informações Principais: ${fields.mainKnowledge || 'Base de serviços e diretrizes da empresa.'}
(IMPORTANTE: O agente SEMPRE deve acessar e priorizar as informações da Base de Conhecimento anexada para responder com máxima precisão).

[DIRETRIZES DE RESPOSTA E FLUXO]:
- Estrutura da Resposta: ${fields.responseStructure || 'Frases curtas de WhatsApp, direto ao ponto e sem textão.'}
- Fluxo de Atendimento:
${fields.flow || '1. Cumprimentar pelo nome.\n2. Entender a necessidade.\n3. Oferecer a solução clara.\n4. Fazer pergunta de fechamento.'}`.trim();
}

window.handleAgentMdImport = function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const text = evt.target.result;
      const parsed = parseMarkdownAgentTemplate(text, file.name);
      
      // Preenche os campos do formulário
      if (parsed.name) document.getElementById('agentName').value = parsed.name;
      if (parsed.icon) document.getElementById('agentIcon').value = parsed.icon;
      if (parsed.role) document.getElementById('agentRole').value = parsed.role;
      if (parsed.goal) document.getElementById('agentGoal').value = parsed.goal;
      if (parsed.commStyle) document.getElementById('agentCommStyle').value = parsed.commStyle;
      if (parsed.tone) document.getElementById('agentTone').value = parsed.tone;
      if (parsed.emojiPolicy) {
        const sel = document.getElementById('agentEmojiPolicy');
        const ep = parsed.emojiPolicy.toLowerCase();
        if (ep.includes('não') || ep.includes('nenhum') || ep.includes('sem')) {
          sel.value = 'Não utilizar emojis';
        } else if (ep.includes('livre') || ep.includes('frequente') || ep.includes('expressivo')) {
          sel.value = 'Uso livre e expressivo de emojis';
        } else {
          sel.value = 'Usar com moderação (1 a 2 emojis por mensagem) para manter o tom amigável';
        }
      }
      if (parsed.language) document.getElementById('agentLanguage').value = parsed.language;
      if (parsed.forbiddenTopics) document.getElementById('agentForbiddenTopics').value = parsed.forbiddenTopics;
      if (parsed.confidentialPolicy) document.getElementById('agentConfidentialPolicy').value = parsed.confidentialPolicy;
      if (parsed.knowledgeLimits) document.getElementById('agentKnowledgeLimits').value = parsed.knowledgeLimits;
      if (parsed.toneAvoid) document.getElementById('agentToneAvoid').value = parsed.toneAvoid;
      if (parsed.mainKnowledge) document.getElementById('agentMainKnowledge').value = parsed.mainKnowledge;
      if (parsed.responseStructure) document.getElementById('agentResponseStructure').value = parsed.responseStructure;
      if (parsed.flow) document.getElementById('agentFlow').value = parsed.flow;

      // Anexa automaticamente à base de conhecimento do agente
      const agentId = document.getElementById('agentId').value || (parsed.name ? parsed.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') : '');
      if (agentId) {
        try {
          await AICopilotModule.saveContextFile(agentId, file.name, text);
          renderModalContextFilesList(agentId);
        } catch (fErr) {
          console.warn('Não foi possível anexar arquivo de contexto:', fErr);
        }
      }

      showToast(`✨ Formulário preenchido com sucesso a partir de "${file.name}"!`, 'success');
    } catch (err) {
      console.error('Erro ao importar arquivo Markdown:', err);
      showToast('Erro ao processar arquivo Markdown: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };
  reader.onerror = () => showToast('Erro ao ler arquivo Markdown.', 'error');
  reader.readAsText(file);
};

function cleanAnswerText(str) {
  if (!str) return '';
  let cleaned = str.trim();
  
  // Remove outer brackets [ ]
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1).trim();
  }
  
  // Extrai resposta ou exemplo real caso seja texto instrucional
  const exMatch = cleaned.match(/(?:ex|exemplo|por exemplo)\s*:\s*([^/\]]+)/i);
  if (exMatch && (cleaned.toLowerCase().startsWith('descreva') || cleaned.toLowerCase().startsWith('liste') || cleaned.toLowerCase().startsWith('nome da') || cleaned.toLowerCase().startsWith('o que o') || cleaned.toLowerCase().startsWith('quem sou'))) {
    cleaned = exMatch[1].trim();
  } else if (/^ex:\s*/i.test(cleaned)) {
    cleaned = cleaned.replace(/^ex:\s*/i, '').trim();
  }

  // Remove formatações markdown residuais
  cleaned = cleaned.replace(/^\*\*|\*\*$/g, '').replace(/^\*|\*$/g, '').replace(/^_|_$/g, '');
  return cleaned.trim();
}

function extractMultilineItems(text, headerPatterns) {
  for (const headerPattern of headerPatterns) {
    const match = text.match(headerPattern);
    if (!match) continue;

    const startIndex = match.index + match[0].length;
    const remaining = text.slice(startIndex);
    const lines = remaining.split('\n');
    const items = [];

    for (let line of lines) {
      const trimmed = line.trim();
      if (!trimmed) {
        if (items.length > 0) continue;
        else continue;
      }

      // Interrompe ao encontrar outro rótulo em negrito, título ou separador
      if (/^(?:(?:\*|\-|>)\s*)?\*\*[A-Za-z0-9\sÀ-ÿ\/\-—–]+:\*\*/i.test(trimmed) || /^#+/i.test(trimmed) || /^---+/.test(trimmed)) {
        break;
      }

      const bulletMatch = trimmed.match(/^(?:(?:\*|\-|>|\d+\.)\s*)(.+)/);
      if (bulletMatch) {
        const itemClean = cleanAnswerText(bulletMatch[1]);
        if (itemClean) items.push(itemClean);
      } else {
        const itemClean = cleanAnswerText(trimmed);
        if (itemClean) items.push(itemClean);
      }
    }

    if (items.length > 0) return items.join('\n');
  }
  return '';
}

function parseMarkdownAgentTemplate(text, fileName = '') {
  const result = {};

  // Extrai emoji no texto ou título
  const emojiMatch = text.match(/[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/u);
  if (emojiMatch) result.icon = emojiMatch[0];

  function extractSingleLine(patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1] && match[1].trim()) {
        const val = cleanAnswerText(match[1]);
        if (val) return val;
      }
    }
    return '';
  }

  // Bloco de exemplo preenchido (se houver)
  const exemploBlockMatch = text.match(/(?:##+\s*(?:📌\s*)?Exemplo Preenchido[\s\S]+)/i);
  const exemploText = exemploBlockMatch ? exemploBlockMatch[0] : '';

  // 1. Nome do Agente
  result.name = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Nome(?: do Agente)?(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i,
    /(?:Você é a|Você é o)\s+\*\*([A-Za-z0-9\s\-_]+)\*\*/i,
    /#+\s*(?:🤖|🧠|💼|⚡)?\s*Template de Prompt para Agente de IA:?\s*([^\n]+)/i
  ]);

  if (!result.name && exemploText) {
    const nomeExemplo = exemploText.match(/(?:Você é a|Você é o)\s+\*\*([A-Za-z0-9\s\-_]+)\*\*/i) || exemploText.match(/Nome:\s*([^\n]+)/i);
    if (nomeExemplo) result.name = cleanAnswerText(nomeExemplo[1]);
  }

  if (!result.name) {
    result.name = fileName.replace(/\.[^/.]+$/, '').replace(/[-_]/g, ' ');
  }

  // 2. Função Principal
  result.role = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Função(?: Principal)?(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i,
    /(?:\*|\-|>)?\s*(?:\*\*)?Papel(?: e Função)?(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  if (!result.role && exemploText) {
    const papelExemplo = exemploText.match(/(?:>|\*|-)?\s*\*\*Papel e Função:\*\*\s*([^\n]+)/i);
    if (papelExemplo) result.role = cleanAnswerText(papelExemplo[1]);
  }

  // 3. Objetivo Final
  result.goal = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Objetivo(?: Final)?(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  // 4. Personalidade e Tom
  result.commStyle = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Estilo(?: de Comunicação)?(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  result.tone = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Tom(?: de Voz)?(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  result.emojiPolicy = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Uso de Emojis(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i,
    /(?:\*|\-|>)?\s*(?:\*\*)?Emojis(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  result.language = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Idioma(?:\/Regionalismo)?(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i,
    /(?:\*|\-|>)?\s*(?:\*\*)?Regionalismo(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  if (!result.commStyle && exemploText) {
    const persExemplo = exemploText.match(/(?:>|\*|-)?\s*\*\*Personalidade:\*\*\s*([^\n]+)/i);
    if (persExemplo) result.commStyle = cleanAnswerText(persExemplo[1]);
  }

  // 5. Restrições e Limites (captura itens multilinhas)
  result.forbiddenTopics = extractMultilineItems(text, [
    /(?:\*|\-|>)?\s*\*\*Assuntos Proibidos:\*\*/i
  ]) || extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Assuntos Proibidos(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  result.confidentialPolicy = extractMultilineItems(text, [
    /(?:\*|\-|>)?\s*\*\*Informações Confidenciais:\*\*/i
  ]) || extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Informações Confidenciais(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  result.knowledgeLimits = extractMultilineItems(text, [
    /(?:\*|\-|>)?\s*\*\*Limites?(?: de Conhecimento)?:\*\*/i
  ]) || extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Limites? de Conhecimento(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  result.toneAvoid = extractMultilineItems(text, [
    /(?:\*|\-|>)?\s*\*\*Tom a Evitar:\*\*/i
  ]) || extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Tom a Evitar(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  if (!result.forbiddenTopics && exemploText) {
    const naoFalar = extractMultilineItems(exemploText, [
      /(?:>|\*|-)?\s*\*\*O que NÃO (?:falar|devo falar):\*\*/i
    ]);
    if (naoFalar) result.forbiddenTopics = naoFalar;
  }

  // 6. Conhecimento e Base
  const mainK = extractMultilineItems(text, [
    /(?:\*|\-|>)?\s*\*\*Informações Principais:\*\*/i
  ]) || extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Informações Principais(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  const fontK = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Fontes Recomendadas(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);
  result.mainKnowledge = [mainK, fontK ? `Fontes Recomendadas: ${fontK}` : ''].filter(Boolean).join('\n');

  // 7. Diretrizes e Fluxo
  result.responseStructure = extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Estrutura da Resposta(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  if (!result.responseStructure && exemploText) {
    const dirExemplo = exemploText.match(/(?:>|\*|-)?\s*\*\*Diretrizes:\*\*\s*([^\n]+)/i);
    if (dirExemplo) result.responseStructure = cleanAnswerText(dirExemplo[1]);
  }

  result.flow = extractMultilineItems(text, [
    /(?:\*|\-|>)?\s*\*\*Fluxo de Atendimento:\*\*/i
  ]) || extractSingleLine([
    /(?:\*|\-|>)?\s*(?:\*\*)?Fluxo de Atendimento(?:\*\*)?:?\s*(?:\[)?([^\n\]]+)(?:\])?/i
  ]);

  // Fallback se for markdown de formato livre
  if (!result.role && !result.goal && text.trim().length > 0) {
    result.role = text.slice(0, 250).trim();
    result.mainKnowledge = text.slice(250).trim();
  }

  return result;
}

window.openAgentModal = function() {
  document.getElementById('agentForm').reset();
  document.getElementById('agentId').value = '';
  document.getElementById('agentModalTitle').innerHTML = '<i class="ti ti-robot" style="margin-right:0.4rem;"></i> Novo Agente de IA';
  
  // Preenche valores padrão inteligentes
  document.getElementById('agentIcon').value = '🤖';
  document.getElementById('agentEmojiPolicy').value = 'Usar com moderação (1 a 2 emojis por mensagem) para manter o tom amigável';
  document.getElementById('agentLanguage').value = 'Português do Brasil natural para WhatsApp (sem formalidades excessivas)';
  document.getElementById('agentForbiddenTopics').value = 'Não falar sobre política, religião, concorrentes ou assuntos pessoais. Não fornecer conselhos médicos ou jurídicos não autorizados.';
  document.getElementById('agentConfidentialPolicy').value = 'Nunca solicitar nem divulgar senhas, dados de cartão de crédito ou CPF de terceiros.';
  document.getElementById('agentKnowledgeLimits').value = 'Se não souber a resposta, não invente. Diga: "Não tenho essa informação no momento, mas posso direcioná-lo para a nossa equipe."';
  document.getElementById('agentToneAvoid').value = 'Nunca ser irônico, defensivo ou confrontador. Não prometer prazos ou descontos não documentados.';
  document.getElementById('agentResponseStructure').value = 'Frases curtas para WhatsApp (1 a 3 balões), direto ao ponto e sem textão';
  document.getElementById('agentFlow').value = '1. Cumprimentar o usuário pelo nome (se disponível).\n2. Entender a necessidade antes de dar a resposta.\n3. Oferecer a solução clara.\n4. Pergunta de fechamento: "Posso ajudar com algo mais?"';

  renderModalContextFilesList('');
  const modal = document.getElementById('agentModal');
  if (modal) modal.classList.add('active');
};

window.closeAgentModal = function() {
  const modal = document.getElementById('agentModal');
  if (modal) modal.classList.remove('active');
};

window.editAgent = function(id) {
  const agents = window.__currentAgents || {};
  const agent = agents[id];
  if (!agent) return;
  
  document.getElementById('agentId').value = agent.id;
  document.getElementById('agentName').value = agent.name || '';
  document.getElementById('agentIcon').value = agent.icon || '🤖';
  document.getElementById('agentTheme').value = agent.theme || 'blue';
  document.getElementById('agentMode').value = agent.defaultMode || 'autonomous';

  const sf = agent.structuredFields || {};
  document.getElementById('agentRole').value = sf.role || agent.description || '';
  document.getElementById('agentGoal').value = sf.goal || '';
  document.getElementById('agentCommStyle').value = sf.commStyle || '';
  document.getElementById('agentTone').value = sf.tone || '';
  document.getElementById('agentEmojiPolicy').value = sf.emojiPolicy || 'Usar com moderação (1 a 2 emojis por mensagem) para manter o tom amigável';
  document.getElementById('agentLanguage').value = sf.language || 'Português do Brasil natural para WhatsApp (sem formalidades excessivas)';
  document.getElementById('agentForbiddenTopics').value = sf.forbiddenTopics || '';
  document.getElementById('agentConfidentialPolicy').value = sf.confidentialPolicy || '';
  document.getElementById('agentKnowledgeLimits').value = sf.knowledgeLimits || '';
  document.getElementById('agentToneAvoid').value = sf.toneAvoid || '';
  document.getElementById('agentMainKnowledge').value = sf.mainKnowledge || '';
  document.getElementById('agentResponseStructure').value = sf.responseStructure || 'Frases curtas para WhatsApp (1 a 3 balões), direto ao ponto e sem textão';
  document.getElementById('agentFlow').value = sf.flow || '';
  
  document.getElementById('agentModalTitle').innerHTML = `<i class="ti ti-pencil" style="margin-right:0.4rem;"></i> Editar Agente: ${agent.name}`;
  
  renderModalContextFilesList(agent.id);
  const modal = document.getElementById('agentModal');
  if (modal) modal.classList.add('active');
};

window.deleteAgent = async function(id) {
  if (!confirm('Tem certeza que deseja excluir este agente? Ele não poderá mais responder aos chats.')) return;
  
  try {
    const res = await fetch(`/api/ai/agents/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('Agente removido com sucesso.', 'info');
      refreshAIPanel();
    }
  } catch (err) {
    console.error('Erro ao excluir agente', err);
    showToast('Erro ao excluir agente: ' + err.message, 'error');
  }
};

window.saveAgent = async function(e) {
  if (e) e.preventDefault();
  
  try {
    const idInput = document.getElementById('agentId').value;
    const nameInput = document.getElementById('agentName');
    
    if (!nameInput) {
      return showToast('Erro interno: Campo de nome não encontrado.', 'error');
    }
    
    const name = nameInput.value.trim();
    if (!name) return showToast('Nome do agente é obrigatório.', 'warning');

    const isEdit = !!idInput;
    const agentId = isEdit ? idInput : name.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  
  const structuredFields = {
    name,
    role: document.getElementById('agentRole').value.trim(),
    goal: document.getElementById('agentGoal').value.trim(),
    commStyle: document.getElementById('agentCommStyle').value.trim(),
    tone: document.getElementById('agentTone').value.trim(),
    emojiPolicy: document.getElementById('agentEmojiPolicy').value,
    language: document.getElementById('agentLanguage').value.trim(),
    forbiddenTopics: document.getElementById('agentForbiddenTopics').value.trim(),
    confidentialPolicy: document.getElementById('agentConfidentialPolicy').value.trim(),
    knowledgeLimits: document.getElementById('agentKnowledgeLimits').value.trim(),
    toneAvoid: document.getElementById('agentToneAvoid').value.trim(),
    mainKnowledge: document.getElementById('agentMainKnowledge').value.trim(),
    responseStructure: document.getElementById('agentResponseStructure').value.trim(),
    flow: document.getElementById('agentFlow').value.trim()
  };

  const compiledPrompt = compileAgentPrompt(structuredFields);
  const description = structuredFields.role || 'Assistente de IA do CRM';

  const payload = {
    id: agentId,
    name: name,
    icon: document.getElementById('agentIcon').value.trim() || '🤖',
    theme: document.getElementById('agentTheme').value,
    description: description,
    promptPrefix: compiledPrompt,
    defaultMode: document.getElementById('agentMode').value,
    structuredFields
  };
  
    const res = await fetch('/api/ai/agents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    
    if (res.ok) {
      showToast(`🎉 Agente "${name}" salvo com sucesso!`, 'success');
      closeAgentModal();
      refreshAIPanel();
    } else {
      const errData = await res.json();
      alert('Erro ao salvar agente: ' + (errData.error || 'Erro desconhecido'));
      showToast('Erro ao salvar agente: ' + (errData.error || 'Erro desconhecido'), 'error');
    }
  } catch (err) {
    console.error('Erro GERAL ao salvar agente:', err);
    alert('Erro CRÍTICO no JavaScript:\n\n' + err.message + '\n\n' + err.stack);
  }
};

async function renderModalContextFilesList(agentId) {
  const container = document.getElementById('modalContextFilesList');
  if (!container) return;
  
  if (!agentId) {
    container.innerHTML = '<div style="font-size:11.5px; color:var(--text-muted); text-align:center; padding:4px;">Arquivos poderão ser vinculados assim que preencher o nome do agente.</div>';
    return;
  }

  try {
    const files = await AICopilotModule.getContextFiles(agentId);
    if (!files || files.length === 0) {
      container.innerHTML = '<div style="font-size:11.5px; color:var(--text-muted); text-align:center; padding:4px;">Nenhum documento anexado a este agente ainda.</div>';
      return;
    }

    container.innerHTML = files.map(f => `
      <div style="display:flex; align-items:center; justify-content:space-between; background:var(--bg-surface-raised, #f6f7f7); border:1px solid var(--border-color-light); border-radius:8px; padding:6px 10px; font-size:12px;">
        <span style="display:flex; align-items:center; gap:6px; font-weight:600; color:var(--text-primary); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
          <i class="ti ti-file-text" style="color:var(--brand-primary, #25d366);"></i> ${f.name}
        </span>
        <button type="button" class="btn-icon-sm" style="color:#ef4444; background:transparent; border:none; cursor:pointer;" onclick="deleteModalContextFile('${agentId}', '${f.name}')" title="Excluir arquivo">
          <i class="ti ti-trash"></i>
        </button>
      </div>
    `).join('');
  } catch (err) {
    container.innerHTML = '<div style="font-size:11.5px; color:#ef4444;">Erro ao carregar arquivos da base.</div>';
  }
}

window.handleModalContextFileUpload = async function(e) {
  const file = e.target.files[0];
  if (!file) return;

  const agentId = document.getElementById('agentId').value || document.getElementById('agentName').value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (!agentId) {
    showToast('Por favor, preencha o Nome do Agente antes de anexar arquivos.', 'warning');
    e.target.value = '';
    return;
  }

  showToast('Enviando documento para a base de conhecimento...', 'info');

  const reader = new FileReader();
  reader.onload = async (evt) => {
    try {
      const content = evt.target.result;
      await AICopilotModule.saveContextFile(agentId, file.name, content);
      showToast(`📄 Arquivo "${file.name}" anexado à base do agente com sucesso!`, 'success');
      renderModalContextFilesList(agentId);
    } catch (err) {
      showToast('Erro ao anexar arquivo: ' + err.message, 'error');
    } finally {
      e.target.value = '';
    }
  };
  reader.onerror = () => showToast('Erro ao ler arquivo.', 'error');
  reader.readAsText(file);
};

window.deleteModalContextFile = async function(agentId, fileName) {
  if (!confirm(`Remover o arquivo "${fileName}" da base de conhecimento do agente?`)) return;
  try {
    await AICopilotModule.deleteContextFile(agentId, fileName);
    showToast(`Arquivo "${fileName}" removido.`, 'info');
    renderModalContextFilesList(agentId);
  } catch (err) {
    showToast('Erro ao excluir arquivo: ' + err.message, 'error');
  }
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
