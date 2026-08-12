/**
 * MassaZap Pro - Gestor da Agenda de Contatos & Importador CSV / Excel
 */

const ContactsAgendaModule = (function () {
  let contactsList = [];
  let filteredList = [];
  let selectedContactIds = new Set();
  let currentSearchQuery = '';
  let currentFilterSource = 'ALL';
  let currentFilterStatus = 'ALL';
  let isInitialized = false;

  const AVATAR_COLORS = [
    'linear-gradient(135deg, #10b981, #059669)',
    'linear-gradient(135deg, #3b82f6, #1d4ed8)',
    'linear-gradient(135deg, #8b5cf6, #6d28d9)',
    'linear-gradient(135deg, #ec4899, #be185d)',
    'linear-gradient(135deg, #f59e0b, #d97706)',
    'linear-gradient(135deg, #06b6d4, #0e7490)',
    'linear-gradient(135deg, #6366f1, #4338ca)'
  ];

  function getAvatarColor(name = '') {
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % AVATAR_COLORS.length;
    return AVATAR_COLORS[idx];
  }

  function getInitials(name = '') {
    const parts = name.trim().split(/\s+/);
    if (!parts.length || !parts[0]) return '?';
    if (parts.length === 1) return parts[0].substring(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function sanitizePhone(raw) {
    if (!raw) return '';
    let digits = String(raw).replace(/\D/g, '');
    if (!digits) return '';

    // Se tiver 10 ou 11 dígitos no padrão brasileiro (ex: 11988887777), adiciona DDI 55
    if (digits.length === 10 || digits.length === 11) {
      digits = '55' + digits;
    }
    return digits;
  }

  function formatPhoneDisplay(raw) {
    const digits = sanitizePhone(raw);
    if (!digits) return raw || '';
    if (digits.startsWith('55') && digits.length === 13) {
      // +55 (11) 98888-7777
      return `+${digits.substring(0, 2)} (${digits.substring(2, 4)}) ${digits.substring(4, 9)}-${digits.substring(9)}`;
    }
    if (digits.startsWith('55') && digits.length === 12) {
      // +55 (11) 8888-7777
      return `+${digits.substring(0, 2)} (${digits.substring(2, 4)}) ${digits.substring(4, 8)}-${digits.substring(8)}`;
    }
    return `+${digits}`;
  }

  /**
   * Carrega contatos da API do servidor
   */
  async function loadContacts() {
    try {
      const res = await fetch('/api/contacts');
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.contacts)) {
          contactsList = data.contacts;
          applyFilters();
          updateStatsUI();
          return contactsList;
        }
      }
    } catch (e) {
      console.warn('Erro ao carregar contatos da API:', e);
    }
    return [];
  }

  /**
   * Salva ou atualiza um contato no servidor
   */
  async function saveContact(contactData) {
    try {
      const res = await fetch('/api/contacts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(contactData)
      });
      const data = await res.json();
      if (data.success) {
        await loadContacts();
        return { success: true, contact: data.contact };
      }
      throw new Error(data.error || 'Falha ao salvar contato');
    } catch (err) {
      console.error('Erro ao salvar contato:', err);
      throw err;
    }
  }

  /**
   * Exclui um ou mais contatos
   */
  async function deleteContacts(ids) {
    try {
      const res = await fetch('/api/contacts', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.isArray(ids) ? ids : [ids] })
      });
      const data = await res.json();
      if (data.success) {
        // Remove da seleção
        if (Array.isArray(ids)) {
          ids.forEach(id => selectedContactIds.delete(id));
        } else {
          selectedContactIds.delete(ids);
        }
        await loadContacts();
        return { success: true, deleted: data.deleted };
      }
      throw new Error(data.error || 'Falha ao excluir');
    } catch (err) {
      console.error('Erro ao excluir contato:', err);
      throw err;
    }
  }

  /**
   * Importa lote de contatos (após parsing CSV / Excel)
   */
  async function importContactsBatch(batch) {
    try {
      const res = await fetch('/api/contacts/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: batch })
      });
      const data = await res.json();
      if (data.success) {
        await loadContacts();
        return data;
      }
      throw new Error(data.error || 'Falha na importação');
    } catch (err) {
      console.error('Erro ao importar contatos:', err);
      throw err;
    }
  }

  /**
   * Parse de arquivo CSV ou Excel (.xlsx, .xls)
   */
  function parseFile(file) {
    return new Promise((resolve, reject) => {
      const fileName = file.name.toLowerCase();
      const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');

      const reader = new FileReader();

      if (isExcel) {
        reader.onload = function (e) {
          try {
            if (typeof XLSX === 'undefined') {
              reject(new Error('Biblioteca SheetJS (XLSX) não carregada.'));
              return;
            }
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, { type: 'array' });
            let allRows = [];
            workbook.SheetNames.forEach(sheetName => {
              const worksheet = workbook.Sheets[sheetName];
              if (worksheet) {
                const jsonRows = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
                if (jsonRows && jsonRows.length > 0) {
                  allRows = allRows.concat(jsonRows);
                }
              }
            });
            const parsed = normalizeImportedRows(allRows);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsArrayBuffer(file);
      } else {
        // CSV / Text
        reader.onload = function (e) {
          try {
            const text = e.target.result;
            const rows = parseCSVText(text);
            const parsed = normalizeImportedRows(rows);
            resolve(parsed);
          } catch (err) {
            reject(err);
          }
        };
        reader.onerror = reject;
        reader.readAsText(file, 'utf-8');
      }
    });
  }

  /**
   * Parser robusto de CSV (detecta delimitador vírgula ou ponto-e-vírgula)
   */
  function parseCSVText(csvText) {
    const lines = csvText.split(/\r?\n/).filter(line => line.trim().length > 0);
    if (lines.length === 0) return [];

    // Detecta delimitador
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const semiCount = (firstLine.match(/;/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;

    let delimiter = ',';
    if (semiCount > commaCount && semiCount > tabCount) delimiter = ';';
    else if (tabCount > commaCount && tabCount > semiCount) delimiter = '\t';

    const headers = splitCSVRow(lines[0], delimiter).map(h => h.trim());
    const result = [];

    for (let i = 1; i < lines.length; i++) {
      const values = splitCSVRow(lines[i], delimiter);
      if (!values.length || values.every(v => !v.trim())) continue;
      const row = {};
      headers.forEach((h, idx) => {
        row[h] = (values[idx] !== undefined ? values[idx] : '').trim();
      });
      result.push(row);
    }
    return result;
  }

  function splitCSVRow(rowStr, delimiter) {
    const pattern = new RegExp(
      `(\\${delimiter}|\\r?\\n|\\r|^)(?:"([^"]*(?:""[^"]*)*)"|([^"\\${delimiter}\\r\\n]*))`,
      'gi'
    );
    const result = [];
    let match = null;
    while ((match = pattern.exec(rowStr))) {
      let matchedDelimiter = match[1];
      if (matchedDelimiter.length && matchedDelimiter !== delimiter && result.length === 0) {
        // start
      }
      let val = '';
      if (match[2] !== undefined) {
        val = match[2].replace(/""/g, '"');
      } else if (match[3] !== undefined) {
        val = match[3];
      }
      result.push(val);
    }
    return result;
  }

  /**
   * Normaliza os nomes de colunas encontrados no arquivo
   */
  function normalizeImportedRows(rawRows) {
    if (!Array.isArray(rawRows)) return [];

    return rawRows.map(row => {
      const keys = Object.keys(row);
      let name = '';
      let phone = '';
      let email = '';
      let region = '';
      let profession = '';
      let tags = [];
      let notes = '';

      for (const key of keys) {
        const cleanKey = key.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
        const val = String(row[key] || '').trim();

        if (/^(nome|name|nomecompleto|contato|cliente|lead)/.test(cleanKey) && !name) {
          name = val;
        } else if (/^(telefone|whatsapp|celular|phone|tel|fone|numero|mobile)/.test(cleanKey) && !phone) {
          phone = val;
        } else if (/^(email|e-mail|mail)/.test(cleanKey) && !email) {
          email = val;
        } else if (/^(estado|uf|regiao|cidade|city|state)/.test(cleanKey) && !region) {
          region = val;
        } else if (/^(profissao|cargo|funcao|ocupacao|trabalho|empresa)/.test(cleanKey) && !profession) {
          profession = val;
        } else if (/^(tags|tag|categoria|status)/.test(cleanKey) && tags.length === 0) {
          tags = val ? val.split(',').map(t => t.trim()) : [];
        } else if (/^(notas|obs|observacao|observacoes|notas)/.test(cleanKey) && !notes) {
          notes = val;
        }
      }

      // Se não achou nome ou telefone específico, tenta inferir pelo primeiro campo e campo numérico
      if (!name && keys.length > 0) name = String(row[keys[0]] || '').trim();
      if (!phone) {
        for (const k of keys) {
          const digits = String(row[k] || '').replace(/\D/g, '');
          if (digits.length >= 8 && digits.length <= 15) {
            phone = digits;
            break;
          }
        }
      }

      const cleanPhone = sanitizePhone(phone);

      return {
        name: name || 'Contato Sem Nome',
        phone: cleanPhone,
        rawPhone: phone,
        email: email || '',
        region: region || '',
        profession: profession || '',
        status: 'Pendente',
        source: 'Importado',
        tags: tags.length ? tags : ['Importado'],
        notes: notes || '',
        isValidPhone: !!(cleanPhone && cleanPhone.length >= 10)
      };
    }).filter(c => c.phone || c.name !== 'Contato Sem Nome');
  }

  /**
   * Aplica filtros e busca
   */
  function applyFilters() {
    filteredList = contactsList.filter(c => {
      // Filtro de busca textual (Nome, Telefone, Email, Tags, Região)
      if (currentSearchQuery) {
        const q = currentSearchQuery.toLowerCase();
        const matchName = (c.name || '').toLowerCase().includes(q);
        const matchPhone = (c.phone || '').includes(q.replace(/\D/g, '')) || formatPhoneDisplay(c.phone).toLowerCase().includes(q);
        const matchEmail = (c.email || '').toLowerCase().includes(q);
        const matchRegion = (c.region || '').toLowerCase().includes(q);
        const matchTags = Array.isArray(c.tags) && c.tags.some(t => String(t).toLowerCase().includes(q));
        if (!matchName && !matchPhone && !matchEmail && !matchRegion && !matchTags) {
          return false;
        }
      }

      // Filtro de Origem
      if (currentFilterSource !== 'ALL') {
        if ((c.source || 'Manual').toUpperCase() !== currentFilterSource.toUpperCase()) {
          return false;
        }
      }

      // Filtro de Status
      if (currentFilterStatus !== 'ALL') {
        if ((c.status || 'Pendente').toUpperCase() !== currentFilterStatus.toUpperCase()) {
          return false;
        }
      }

      return true;
    });

    renderContactsList();
  }

  /**
   * Renderiza a lista/tabela moderna de contatos
   */
  function renderContactsList() {
    const tableBody = document.getElementById('agendaContactsTableBody');
    const emptyState = document.getElementById('agendaEmptyState');
    const selectedCountLabel = document.getElementById('agendaSelectedCount');
    const selectAllCheckbox = document.getElementById('agendaSelectAllCheckbox');

    if (!tableBody) return;

    if (filteredList.length === 0) {
      tableBody.innerHTML = '';
      if (emptyState) emptyState.style.display = 'flex';
      return;
    }

    if (emptyState) emptyState.style.display = 'none';

    // Checa se todos filtrados estão selecionados
    const allSelected = filteredList.length > 0 && filteredList.every(c => selectedContactIds.has(c.id));
    if (selectAllCheckbox) selectAllCheckbox.checked = allSelected;

    if (selectedCountLabel) {
      selectedCountLabel.textContent = selectedContactIds.size > 0 ? `${selectedContactIds.size} selecionado(s)` : '';
    }

    const html = filteredList.map(contact => {
      const isSelected = selectedContactIds.has(contact.id);
      const avatarColor = getAvatarColor(contact.name);
      const initials = getInitials(contact.name);
      const formattedPhone = formatPhoneDisplay(contact.phone);
      const isWhatsApp = contact.phone && contact.phone.length >= 10;

      const sourceBadgeClass = 
        contact.source === 'Supabase' ? 'badge-blue' :
        contact.source === 'Importado' ? 'badge-purple' :
        contact.source === 'Inbox' ? 'badge-emerald' : 'badge-neutral';

      const tagsHtml = (contact.tags || []).map(t => `<span class="contact-tag">${escapeHtml(t)}</span>`).join('');

      return `
        <tr class="agenda-row ${isSelected ? 'row-selected' : ''}" data-id="${contact.id}">
          <td class="col-checkbox">
            <label class="custom-checkbox">
              <input type="checkbox" class="agenda-item-checkbox" data-id="${contact.id}" ${isSelected ? 'checked' : ''}>
              <span class="checkmark"></span>
            </label>
          </td>
          <td class="col-contact">
            <div class="agenda-contact-cell">
              <div class="agenda-avatar" style="background: ${avatarColor};">
                ${initials}
              </div>
              <div class="agenda-contact-info">
                <a href="javascript:void(0)" class="contact-name-link" onclick="event.stopPropagation(); window.openSingleContactAddToListModal('${contact.id}')" title="Clique para adicionar a uma lista">
                  <strong class="agenda-contact-name">${escapeHtml(contact.name || 'Sem Nome')}</strong>
                  <i class="ti ti-playlist-add" style="font-size:0.85rem; color:var(--brand-primary); opacity:0.6;"></i>
                </a>
                <div class="agenda-contact-meta">
                  ${contact.email ? `<span class="contact-email">${escapeHtml(contact.email)}</span>` : ''}
                  ${contact.region ? `<span class="contact-region">📍 ${escapeHtml(contact.region)}</span>` : ''}
                  ${contact.profession ? `<span class="contact-prof">💼 ${escapeHtml(contact.profession)}</span>` : ''}
                </div>
              </div>
            </div>
          </td>
          <td class="col-phone">
            <div class="agenda-phone-box">
              <span class="phone-number">${formattedPhone || '<span class="text-muted">Sem número</span>'}</span>
              ${isWhatsApp ? `
                <button type="button" class="btn-icon-sm btn-open-chat-inbox" data-phone="${contact.phone}" data-name="${escapeHtml(contact.name)}" title="Abrir conversa no Inbox">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path>
                  </svg>
                  <span>Chat</span>
                </button>
              ` : ''}
            </div>
          </td>
          <td class="col-source">
            <span class="badge ${sourceBadgeClass}">${escapeHtml(contact.source || 'Manual')}</span>
          </td>
          <td class="col-tags">
            <div class="agenda-tags-container">
              ${tagsHtml || '<span class="text-muted text-xs">—</span>'}
            </div>
          </td>
          <td class="col-actions">
            <div class="agenda-actions-row">
              <button type="button" class="btn-icon btn-edit-contact" data-id="${contact.id}" title="Editar Contato">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path>
                </svg>
              </button>
              <button type="button" class="btn-icon btn-icon-danger btn-delete-contact" data-id="${contact.id}" title="Excluir Contato">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polyline points="3 6 5 6 21 6"></polyline>
                  <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
                </svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');

    tableBody.innerHTML = html;
  }

  function updateStatsUI() {
    const totalCount = contactsList.length;
    const validWhatsAppCount = contactsList.filter(c => c.phone && c.phone.length >= 10).length;
    const importedCount = contactsList.filter(c => c.source === 'Importado').length;

    const elTotal = document.getElementById('agendaStatTotal');
    const elWhatsApp = document.getElementById('agendaStatWhatsApp');
    const elImported = document.getElementById('agendaStatImported');

    if (elTotal) elTotal.textContent = totalCount;
    if (elWhatsApp) elWhatsApp.textContent = validWhatsAppCount;
    if (elImported) elImported.textContent = importedCount;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  /**
   * Exporta contatos para CSV
   */
  function exportToCSV() {
    if (!contactsList.length) {
      alert('Nenhum contato cadastrado para exportar.');
      return;
    }

    const headers = ['Nome', 'Telefone', 'WhatsApp', 'Email', 'Regiao', 'Profissao', 'Origem', 'Status', 'Tags', 'Notas'];
    const rows = contactsList.map(c => [
      `"${(c.name || '').replace(/"/g, '""')}"`,
      `"${c.phone || ''}"`,
      `"${formatPhoneDisplay(c.phone)}"`,
      `"${(c.email || '').replace(/"/g, '""')}"`,
      `"${(c.region || '').replace(/"/g, '""')}"`,
      `"${(c.profession || '').replace(/"/g, '""')}"`,
      `"${c.source || 'Manual'}"`,
      `"${c.status || 'Pendente'}"`,
      `"${(Array.isArray(c.tags) ? c.tags.join(', ') : '').replace(/"/g, '""')}"`,
      `"${(c.notes || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = '\uFEFF' + [headers.join(';'), ...rows.map(r => r.join(';'))].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `agenda_contatos_massazap_${new Date().toISOString().slice(0,10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  /**
   * Envia os contatos selecionados para a tela de Disparo em Massa
   */
  function sendSelectedToDisparador() {
    const listToSend = selectedContactIds.size > 0 
      ? contactsList.filter(c => selectedContactIds.has(c.id))
      : filteredList;

    if (!listToSend.length) {
      alert('Nenhum contato selecionado.');
      return;
    }

    const validWhatsApp = listToSend.filter(c => c.phone && c.phone.length >= 10);
    if (!validWhatsApp.length) {
      alert('Nenhum dos contatos selecionados possui número de WhatsApp válido.');
      return;
    }

    // Dispara evento customizado para o app.js preencher a lista de disparos
    window.dispatchEvent(new CustomEvent('agenda:send-to-dispatcher', {
      detail: { contacts: validWhatsApp }
    }));
  }

  /**
   * Inicializa eventos da interface da Agenda
   */
  function initEvents() {
    if (isInitialized) return;
    isInitialized = true;

    // Campo de busca
    const searchInput = document.getElementById('agendaSearchInput');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearchQuery = e.target.value;
        applyFilters();
      });
    }

    // Filtro de Origem
    const filterSource = document.getElementById('agendaFilterSource');
    if (filterSource) {
      filterSource.addEventListener('change', (e) => {
        currentFilterSource = e.target.value;
        applyFilters();
      });
    }

    // Selecionar todos os checkboxes
    const selectAllCheckbox = document.getElementById('agendaSelectAllCheckbox');
    if (selectAllCheckbox) {
      selectAllCheckbox.addEventListener('change', (e) => {
        const checked = e.target.checked;
        filteredList.forEach(c => {
          if (checked) selectedContactIds.add(c.id);
          else selectedContactIds.delete(c.id);
        });
        renderContactsList();
      });
    }

    // Delegação de eventos na tabela
    const tableBody = document.getElementById('agendaContactsTableBody');
    if (tableBody) {
      tableBody.addEventListener('click', async (e) => {
        // Checkbox individual
        const checkbox = e.target.closest('.agenda-item-checkbox');
        if (checkbox) {
          const id = checkbox.dataset.id;
          if (checkbox.checked) selectedContactIds.add(id);
          else selectedContactIds.delete(id);
          renderContactsList();
          return;
        }

        // Botão Abrir Chat no Inbox
        const btnChat = e.target.closest('.btn-open-chat-inbox');
        if (btnChat) {
          const phone = btnChat.dataset.phone;
          const name = btnChat.dataset.name;
          if (window.openInboxChatWithContact) {
            window.openInboxChatWithContact(phone, name);
          } else {
            // Ativa a aba Inbox e busca o chat
            const tabBtn = document.querySelector('.nav-tab[data-tab="tab-inbox"]');
            if (tabBtn) tabBtn.click();
            setTimeout(() => {
              const inboxSearch = document.getElementById('inboxSearchInput');
              if (inboxSearch) {
                inboxSearch.value = phone;
                inboxSearch.dispatchEvent(new Event('input'));
              }
            }, 200);
          }
          return;
        }

        // Botão Editar Contato
        const btnEdit = e.target.closest('.btn-edit-contact');
        if (btnEdit) {
          const id = btnEdit.dataset.id;
          const contact = contactsList.find(c => c.id === id);
          if (contact && window.openContactModal) {
            window.openContactModal(contact);
          }
          return;
        }

        // Botão Excluir Contato
        const btnDelete = e.target.closest('.btn-delete-contact');
        if (btnDelete) {
          const id = btnDelete.dataset.id;
          const contact = contactsList.find(c => c.id === id);
          if (confirm(`Deseja realmente excluir o contato "${contact?.name || id}" da agenda?`)) {
            await deleteContacts(id);
          }
          return;
        }
      });
    }

    // Botão Excluir Selecionados
    const btnDeleteSelected = document.getElementById('btnAgendaDeleteSelected');
    if (btnDeleteSelected) {
      btnDeleteSelected.addEventListener('click', async () => {
        if (selectedContactIds.size === 0) {
          alert('Selecione pelo menos um contato para excluir.');
          return;
        }
        if (confirm(`Tem certeza que deseja excluir ${selectedContactIds.size} contato(s) selecionado(s)?`)) {
          await deleteContacts(Array.from(selectedContactIds));
        }
      });
    }

    // Botão Exportar CSV
    const btnExport = document.getElementById('btnAgendaExport');
    if (btnExport) {
      btnExport.addEventListener('click', exportToCSV);
    }

    // Botão Enviar para Disparador
    const btnSendDispatcher = document.getElementById('btnAgendaSendToDispatcher');
    if (btnSendDispatcher) {
      btnSendDispatcher.addEventListener('click', sendSelectedToDisparador);
    }
  }

  return {
    init: async () => {
      initEvents();
      await loadContacts();
    },
    loadContacts,
    saveContact,
    deleteContacts,
    importContactsBatch,
    parseFile,
    exportToCSV,
    getContacts: () => contactsList,
    sanitizePhone,
    formatPhoneDisplay
  };
})();

window.ContactsAgendaModule = ContactsAgendaModule;
