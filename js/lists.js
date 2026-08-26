// ============================================================================
// LISTAS DE ENVIO - js/lists.js
// ============================================================================

window.ListsModule = (() => {
  let allContactsCache = [];

  // ---- Sub-Tab Switch ----
  window.switchContactsSubTab = function(tab) {
    const panels = { contatos: 'panelContatos', listas: 'panelListas' };
    const tabs   = { contatos: 'subTabContatos', listas: 'subTabListas' };

    Object.keys(panels).forEach(k => {
      document.getElementById(panels[k]).style.display = k === tab ? '' : 'none';
      const btn = document.getElementById(tabs[k]);
      if (k === tab) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    if (tab === 'listas') renderListsBoard();
  };

  // ---- Render Folder Tabs Board ----
  let _activeListId = null;
  let _cachedLists = [];

  async function renderListsBoard() {
    const tabsScroll = document.getElementById('folderTabsScroll');
    const contentPanel = document.getElementById('folderContent');
    if (!tabsScroll || !contentPanel) return;

    tabsScroll.innerHTML = '<span class="text-muted text-sm" style="padding:8px;">Carregando...</span>';

    try {
      const res = await fetch('/api/lists');
      _cachedLists = await res.json();

      if (!_cachedLists.length) {
        tabsScroll.innerHTML = '';
        contentPanel.innerHTML = `
          <div class="folder-content__empty">
            <i class="ti ti-folder-plus" style="font-size:3rem; opacity:0.35;"></i>
            <p style="margin:12px 0 16px; font-size:0.9rem;">Nenhuma lista criada ainda.</p>
            <button class="crx-btn crx-btn-primary" onclick="openNewListModal()"><i class="ti ti-plus"></i> Criar primeira lista</button>
          </div>`;
        return;
      }

      // Render folder tabs
      tabsScroll.innerHTML = _cachedLists.map(list => `
        <button class="folder-tab ${_activeListId === list.id ? 'active' : ''}"
                onclick="window.selectListTab('${list.id}')"
                data-list-id="${list.id}">
          <span class="folder-tab__dot" style="background:${list.color};"></span>
          <span class="folder-tab__name">${list.name}</span>
          <span class="folder-tab__count">${list.contacts.length}</span>
        </button>
      `).join('');

      // Auto-select first tab if none active
      if (!_activeListId || !_cachedLists.find(l => l.id === _activeListId)) {
        _activeListId = _cachedLists[0].id;
        const firstTab = tabsScroll.querySelector('.folder-tab');
        if (firstTab) firstTab.classList.add('active');
      }

      renderActiveListContent();

    } catch (err) {
      tabsScroll.innerHTML = '';
      contentPanel.innerHTML = `<div class="folder-content__empty"><p class="text-muted">Erro ao carregar listas.</p></div>`;
      console.error(err);
    }
  }

  window.selectListTab = function(listId) {
    _activeListId = listId;

    // Update tab active state
    document.querySelectorAll('.folder-tab').forEach(tab => {
      tab.classList.toggle('active', tab.dataset.listId === listId);
    });

    renderActiveListContent();
  };

  function renderActiveListContent() {
    const contentPanel = document.getElementById('folderContent');
    if (!contentPanel) return;

    const list = _cachedLists.find(l => l.id === _activeListId);
    if (!list) {
      contentPanel.innerHTML = `
        <div class="folder-content__empty">
          <i class="ti ti-folder-off" style="font-size:2.5rem; opacity:0.4;"></i>
          <p>Selecione uma lista acima.</p>
        </div>`;
      return;
    }

    const safeName = list.name.replace(/'/g, "\\'");

    contentPanel.innerHTML = `
      <!-- List Info Bar -->
      <div class="folder-info-bar">
        <div class="folder-info-bar__left">
          <span class="folder-info-bar__dot" style="background:${list.color};"></span>
          <div>
            <strong class="folder-info-bar__name">${list.name}</strong>
            ${list.description ? `<span class="folder-info-bar__desc">${list.description}</span>` : ''}
          </div>
        </div>
        <div class="folder-info-bar__right">
          <span class="folder-info-bar__badge">${list.contacts.length} contato${list.contacts.length !== 1 ? 's' : ''}</span>
          <button class="crx-btn crx-btn-ghost crx-btn--sm" onclick="openAddToList('${list.id}', '${safeName}')"><i class="ti ti-user-plus"></i> Adicionar</button>
          <button class="crx-btn crx-btn-primary crx-btn--sm" onclick="dispatchToList('${list.id}', '${safeName}')"><i class="ti ti-send"></i> Disparar</button>
          <button class="crx-icon-btn" onclick="editList('${list.id}')" title="Editar lista"><i class="ti ti-pencil"></i></button>
          <button class="crx-icon-btn" onclick="deleteList('${list.id}')" title="Excluir lista" style="color:#ef4444;"><i class="ti ti-trash"></i></button>
        </div>
      </div>

      <!-- List Contacts -->
      ${list.contacts.length === 0
        ? `<div class="folder-content__empty" style="min-height:200px;">
             <i class="ti ti-address-book-off" style="font-size:2rem; opacity:0.3;"></i>
             <p style="margin:8px 0 12px;">Nenhum contato nesta lista.</p>
             <button class="crx-btn crx-btn-outline crx-btn--sm" onclick="openAddToList('${list.id}', '${safeName}')"><i class="ti ti-user-plus"></i> Adicionar contatos</button>
           </div>`
        : `<div class="folder-contacts-grid">
             ${list.contacts.map(c => `
               <div class="folder-contact-card">
                 <div class="folder-contact-card__avatar" style="background:${list.color}18; border-color:${list.color}40; color:${list.color};">
                   ${(c.name || c.phone || '?').charAt(0).toUpperCase()}
                 </div>
                 <div class="folder-contact-card__info">
                   <span class="folder-contact-card__name">${c.name || '—'}</span>
                   <span class="folder-contact-card__phone">${c.phone || ''}</span>
                 </div>
                 <button class="folder-contact-card__remove" onclick="removeFromList('${list.id}', '${c.phone}')" title="Remover da lista">
                   <i class="ti ti-x"></i>
                 </button>
               </div>
             `).join('')}
           </div>`
      }
    `;
  }

  // ---- New List Modal ----
  window.openNewListModal = function() {
    document.getElementById('listEditId').value = '';
    document.getElementById('listName').value = '';
    document.getElementById('listDesc').value = '';
    document.getElementById('listModalTitle').textContent = '📋 Nova Lista de Envio';
    document.querySelector('input[name="listColor"][value="#3b82f6"]').checked = true;
    document.getElementById('newListModal').classList.add('active');
  };

  window.closeNewListModal = function() {
    document.getElementById('newListModal').classList.remove('active');
  };

  window.editList = async function(listId) {
    const res = await fetch('/api/lists');
    const lists = await res.json();
    const list = lists.find(l => l.id === listId);
    if (!list) return;
    document.getElementById('listEditId').value = list.id;
    document.getElementById('listName').value = list.name;
    document.getElementById('listDesc').value = list.description || '';
    document.getElementById('listModalTitle').textContent = '✏️ Editar Lista';
    const colorInput = document.querySelector(`input[name="listColor"][value="${list.color}"]`);
    if (colorInput) colorInput.checked = true;
    document.getElementById('newListModal').classList.add('active');
  };

  window.saveList = async function() {
    const name = document.getElementById('listName').value.trim();
    if (!name) { alert('Informe o nome da lista.'); return; }
    const description = document.getElementById('listDesc').value.trim();
    const color = document.querySelector('input[name="listColor"]:checked')?.value || '#3b82f6';
    const editId = document.getElementById('listEditId').value;

    const method = editId ? 'PUT' : 'POST';
    const url    = editId ? `/api/lists/${editId}` : '/api/lists';

    await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, description, color })
    });

    closeNewListModal();
    renderListsBoard();
  };

  window.deleteList = async function(listId) {
    if (!confirm('Excluir esta lista? Os contatos não serão apagados.')) return;
    await fetch(`/api/lists/${listId}`, { method: 'DELETE' });
    renderListsBoard();
  };

  // ---- Add Contacts to List Modal ----
  window.openAddToList = async function(listId, listName) {
    document.getElementById('addToListId').value = listId;
    document.getElementById('addToListTitle').textContent = `➕ Adicionar à "${listName}"`;
    document.getElementById('addToListSearch').value = '';
    document.getElementById('addToListModal').classList.add('active');

    const container = document.getElementById('addToListContactsList');
    container.innerHTML = '<p class="text-muted text-sm text-center">Carregando...</p>';

    try {
      // Usa contatos já carregados pelo módulo de agenda se disponível
      let contacts = [];
      if (window.ContactsAgendaModule && typeof window.ContactsAgendaModule.getContacts === 'function') {
        contacts = window.ContactsAgendaModule.getContacts() || [];
      }

      // Se vazio, busca direto na API
      if (!contacts.length) {
        const r = await fetch('/api/contacts');
        if (r.ok) {
          const d = await r.json();
          contacts = (d.success && Array.isArray(d.contacts)) ? d.contacts : (Array.isArray(d) ? d : []);
        }
      }

      allContactsCache = contacts;
      renderAddToListContacts(contacts);
    } catch (e) {
      console.error('Erro ao carregar contatos para lista:', e);
      container.innerHTML = '<p class="text-muted text-sm text-center">Erro ao carregar contatos.</p>';
    }
  };

  function renderAddToListContacts(contacts) {
    const container = document.getElementById('addToListContactsList');
    if (!contacts.length) {
      container.innerHTML = '<p class="text-muted text-sm text-center">Nenhum contato encontrado.</p>';
      return;
    }
    container.innerHTML = contacts.slice(0, 200).map(c => `
      <label style="display:flex; align-items:center; gap:0.75rem; padding:0.5rem 0.75rem; border:1px solid var(--border); border-radius:8px; cursor:pointer; background:var(--background);">
        <input type="checkbox" class="addlist-check" value="${c.telefone || c.phone || ''}" data-name="${c.nome || c.name || ''}" style="flex-shrink:0;">
        <div>
          <div style="font-size:0.875rem; font-weight:500;">${c.nome || c.name || '—'}</div>
          <div class="text-muted text-sm">${c.telefone || c.phone || ''}</div>
        </div>
      </label>
    `).join('');
  }

  window.filterAddToListContacts = function(query) {
    const q = query.toLowerCase();
    const filtered = allContactsCache.filter(c =>
      (c.nome || c.name || '').toLowerCase().includes(q) ||
      (c.telefone || c.phone || '').includes(q)
    );
    renderAddToListContacts(filtered);
  };

  window.confirmAddToList = async function() {
    const listId = document.getElementById('addToListId').value;
    const checked = document.querySelectorAll('.addlist-check:checked');
    if (!checked.length) { alert('Selecione pelo menos um contato.'); return; }

    const contacts = Array.from(checked).map(cb => ({
      phone: cb.value,
      name: cb.dataset.name
    }));

    const res = await fetch(`/api/lists/${listId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts })
    });
    const data = await res.json();
    document.getElementById('addToListModal').classList.remove('active');
    renderListsBoard();
    alert(`✅ ${checked.length} contato(s) adicionado(s)! Total na lista: ${data.total}`);
  };

  window.removeFromList = async function(listId, phone) {
    if (!confirm('Remover este contato da lista?')) return;
    await fetch(`/api/lists/${listId}/contacts`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phones: [phone] })
    });
    renderListsBoard();
  };

  // ---- Dispatch to List ----
  window.dispatchToList = function(listId, listName) {
    // Switch to dispatcher tab
    document.querySelector('[data-tab="tab-dispatcher"]')?.click();
    // Select this list in the dispatcher source dropdown
    setTimeout(() => {
      const sel = document.getElementById('dispatcherContactSource');
      if (sel) {
        // Ensure the option exists (populate first if needed)
        populateDispatcherListSource().then(() => {
          sel.value = `list:${listId}`;
          updateDispatcherSourceInfo();
        });
      }
    }, 300);
    // Store selected list globally for dispatcher to use
    window.__selectedList = { id: listId, name: listName };
  };

  return { renderListsBoard };
})();

// ============================================================================
// CONTACTS → LIST DROPDOWN (contextual action bar)
// ============================================================================

let _allListsCache = [];

async function fetchListsCache() {
  try {
    const res = await fetch('/api/lists');
    _allListsCache = await res.json();
  } catch (e) {
    _allListsCache = [];
  }
  return _allListsCache;
}

function toggleAddToListDropdown() {
  const menu = document.getElementById('addToListDropdownMenu');
  if (!menu) return;
  const isOpen = menu.style.display !== 'none';
  if (isOpen) {
    menu.style.display = 'none';
  } else {
    renderListDropdown();
    menu.style.display = 'block';
  }
}

async function renderListDropdown(filterQuery = '') {
  const container = document.getElementById('listDropdownItems');
  if (!container) return;

  if (_allListsCache.length === 0) await fetchListsCache();

  const q = filterQuery.toLowerCase();
  const filtered = q
    ? _allListsCache.filter(l => l.name.toLowerCase().includes(q))
    : _allListsCache;

  if (filtered.length === 0) {
    container.innerHTML = '<div style="padding:12px; text-align:center; color:var(--text-muted); font-size:0.82rem;">Nenhuma lista encontrada</div>';
    return;
  }

  container.innerHTML = filtered.map(list => `
    <button class="btn btn-sm btn-ghost" style="width:100%; justify-content:flex-start; gap:0.6rem; border-radius:8px;" onclick="addSelectedContactsToList('${list.id}', '${list.name.replace(/'/g, "\\'")}')">
      <span style="width:10px; height:10px; border-radius:50%; background:${list.color}; flex-shrink:0;"></span>
      <span style="flex:1; text-align:left; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${list.name}</span>
      <span class="text-muted text-sm">${list.contacts?.length || 0}</span>
    </button>
  `).join('');
}

function filterListDropdown(query) {
  renderListDropdown(query);
}

async function addSelectedContactsToList(listId, listName) {
  // Get selected contacts from SupabaseModule
  let selectedContacts = [];
  if (typeof SupabaseModule !== 'undefined' && typeof SupabaseModule.getSelectedContacts === 'function') {
    selectedContacts = SupabaseModule.getSelectedContacts();
  }

  if (!selectedContacts.length) {
    alert('Nenhum contato selecionado.');
    return;
  }

  const contacts = selectedContacts.map(c => ({
    phone: c.telefone || c.phone || '',
    name: c.nome || c.name || ''
  })).filter(c => c.phone);

  if (!contacts.length) {
    alert('Nenhum contato com telefone válido na seleção.');
    return;
  }

  try {
    const res = await fetch(`/api/lists/${listId}/contacts`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contacts })
    });
    const data = await res.json();

    // Close dropdown
    const menu = document.getElementById('addToListDropdownMenu');
    if (menu) menu.style.display = 'none';

    // Refresh lists cache
    await fetchListsCache();

    // Update dispatcher source
    populateDispatcherListSource();

    // Show feedback
    if (typeof showToast === 'function') {
      showToast(`✅ ${contacts.length} contato(s) adicionados à lista "${listName}"!`, 'success');
    } else {
      alert(`✅ ${contacts.length} contato(s) adicionados à lista "${listName}"! Total: ${data.total}`);
    }
  } catch (err) {
    console.error('Erro ao adicionar à lista:', err);
    alert('Erro ao adicionar contatos à lista.');
  }
}

// Open new list modal with intent to add selected contacts after creation
let _pendingAddSelectionToNewList = false;

function openNewListModalWithSelection() {
  _pendingAddSelectionToNewList = true;
  // Close the dropdown
  const menu = document.getElementById('addToListDropdownMenu');
  if (menu) menu.style.display = 'none';
  // Open modal
  openNewListModal();
}

// Patch saveList to handle post-creation addition
const _originalSaveList = window.saveList;
window.saveList = async function() {
  const name = document.getElementById('listName').value.trim();
  if (!name) { alert('Informe o nome da lista.'); return; }
  const description = document.getElementById('listDesc').value.trim();
  const color = document.querySelector('input[name="listColor"]:checked')?.value || '#3b82f6';
  const editId = document.getElementById('listEditId').value;

  const method = editId ? 'PUT' : 'POST';
  const url    = editId ? `/api/lists/${editId}` : '/api/lists';

  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, description, color })
  });

  const savedData = await res.json();
  closeNewListModal();

  // Refresh cache
  await fetchListsCache();
  populateDispatcherListSource();

  // If we had pending selection, add contacts to the new list
  if (_pendingAddSelectionToNewList && !editId && savedData?.id) {
    _pendingAddSelectionToNewList = false;
    await addSelectedContactsToList(savedData.id, name);
  } else {
    _pendingAddSelectionToNewList = false;
  }

  if (typeof ListsModule !== 'undefined' && ListsModule.renderListsBoard) {
    ListsModule.renderListsBoard();
  }
};

// ============================================================================
// DISPATCHER: Populate list source dropdown
// ============================================================================

async function populateDispatcherListSource() {
  const select = document.getElementById('dispatcherContactSource');
  if (!select) return;

  if (_allListsCache.length === 0) await fetchListsCache();

  // Keep "selection" as first option, then add lists
  const currentValue = select.value;
  select.innerHTML = '<option value="selection">👥 Contatos selecionados na Agenda</option>';

  _allListsCache.forEach(list => {
    const opt = document.createElement('option');
    opt.value = `list:${list.id}`;
    opt.textContent = `📋 ${list.name} (${list.contacts?.length || 0} contatos)`;
    select.appendChild(opt);
  });

  // Restore selection if it was a list
  if (currentValue && currentValue.startsWith('list:')) {
    select.value = currentValue;
  } else if (_allListsCache.length > 0) {
    // Default to first list
    select.value = `list:${_allListsCache[0].id}`;
  }

  // Info text
  select.addEventListener('change', updateDispatcherSourceInfo);
  updateDispatcherSourceInfo();
}

window.setDispatcherSourceMode = function(mode) {
  const btnSel = document.getElementById('btnSourceSelection');
  const btnList = document.getElementById('btnSourceList');
  const panelSel = document.getElementById('sourceSelectionPanel');
  const panelList = document.getElementById('sourceListPanel');
  const select = document.getElementById('dispatcherContactSource');

  if (mode === 'selection') {
    if (btnSel) btnSel.classList.add('active');
    if (btnList) btnList.classList.remove('active');
    if (panelSel) panelSel.style.display = 'flex';
    if (panelList) panelList.style.display = 'none';
    if (select) select.value = 'selection';
  } else {
    if (btnList) btnList.classList.add('active');
    if (btnSel) btnSel.classList.remove('active');
    if (panelList) panelList.style.display = 'flex';
    if (panelSel) panelSel.style.display = 'none';

    // If currently 'selection', switch to first list option
    if (select && select.value === 'selection' && select.options.length > 1) {
      select.selectedIndex = 1;
    }
  }

  updateDispatcherSourceInfo();
};

function updateDispatcherSourceInfo() {
  const select = document.getElementById('dispatcherContactSource');
  const info = document.getElementById('dispatcherSourceInfo');
  const btnSel = document.getElementById('btnSourceSelection');
  const btnList = document.getElementById('btnSourceList');
  const panelSel = document.getElementById('sourceSelectionPanel');
  const panelList = document.getElementById('sourceListPanel');
  const statTotal = document.getElementById('statDispatcherTotalContacts');
  const statSource = document.getElementById('statDispatcherSourceLabel');
  const selCountSpan = document.getElementById('sourceSelectionCount');
  const selBadge = document.getElementById('sourceSelectionBadge');

  const selectionCount = typeof SupabaseModule !== 'undefined' ? SupabaseModule.getSelectedContacts().length : 0;
  if (selCountSpan) selCountSpan.textContent = selectionCount;
  if (selBadge) selBadge.textContent = `${selectionCount} selecionado(s)`;

  if (!select) return;

  if (select.value === 'selection') {
    if (btnSel) btnSel.classList.add('active');
    if (btnList) btnList.classList.remove('active');
    if (panelSel) panelSel.style.display = 'flex';
    if (panelList) panelList.style.display = 'none';

    if (info) info.textContent = selectionCount > 0 ? `${selectionCount} contato(s) selecionados` : 'Nenhum contato selecionado na aba Contatos';
    if (statTotal) statTotal.textContent = selectionCount;
    if (statSource) statSource.textContent = 'Agenda';
  } else if (select.value.startsWith('list:')) {
    if (btnList) btnList.classList.add('active');
    if (btnSel) btnSel.classList.remove('active');
    if (panelList) panelList.style.display = 'flex';
    if (panelSel) panelSel.style.display = 'none';

    const listId = select.value.replace('list:', '');
    const list = _allListsCache.find(l => l.id === listId);
    const count = list ? (list.contacts?.length || 0) : 0;
    const name = list ? list.name : 'Lista';

    if (info) info.textContent = `${count} contato(s) nesta lista`;
    if (statTotal) statTotal.textContent = count;
    if (statSource) statSource.textContent = name;
  }
}

// ============================================================================
// CONTEXTUAL ACTION BAR — show/hide based on selection count
// ============================================================================

function updateContactsActionBar(selectionCount) {
  const barSelection = document.getElementById('contactsActionBarSelection');
  const badge = document.getElementById('selectionCountBadge');
  const btnDeselect = document.getElementById('btnDeselectAll');
  const btnInvert = document.getElementById('btnInvertSelection');

  if (barSelection) {
    barSelection.style.display = selectionCount > 0 ? 'inline-flex' : 'none';
  }
  if (btnDeselect) btnDeselect.style.display = selectionCount > 0 ? '' : 'none';
  if (btnInvert) btnInvert.style.display = selectionCount > 0 ? '' : 'none';
  if (badge) badge.textContent = `${selectionCount} selecionado${selectionCount !== 1 ? 's' : ''}`;

  // Update stat pill
  const statSel = document.getElementById('statSelectedContacts');
  if (statSel) statSel.textContent = selectionCount;
}

// Close dropdown on outside click
document.addEventListener('click', (e) => {
  const wrapper = document.getElementById('addToListDropdownWrapper');
  const menu = document.getElementById('addToListDropdownMenu');
  if (wrapper && menu && !wrapper.contains(e.target)) {
    menu.style.display = 'none';
  }
});

// Initialize dispatcher source on page load
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(populateDispatcherListSource, 1000);
});

// ============================================================================
// SINGLE CONTACT ADD TO LIST MODAL LOGIC
// ============================================================================
let _currentSingleContact = null;

window.openSingleContactAddToListModal = async function(contactId) {
  let contact = null;
  if (typeof SupabaseModule !== 'undefined' && typeof SupabaseModule.getAllContacts === 'function') {
    contact = SupabaseModule.getAllContacts().find(c => String(c.id) === String(contactId));
  }
  if (!contact && window.ContactsAgendaModule && typeof window.ContactsAgendaModule.getContacts === 'function') {
    contact = window.ContactsAgendaModule.getContacts().find(c => String(c.id) === String(contactId));
  }

  if (!contact) {
    if (typeof showToast === 'function') showToast('Contato não encontrado.', 'warning');
    return;
  }

  _currentSingleContact = contact;
  const name = contact.displayName || contact.name || contact.nome || 'Contato';
  const phone = contact.phone || contact.telefone || '';

  const modal = document.getElementById('singleContactAddToListModal');
  const title = document.getElementById('singleContactModalTitle');
  const subtitle = document.getElementById('singleContactModalSubtitle');

  if (title) title.innerHTML = `<i class="ti ti-playlist-add" style="margin-right:0.4rem;"></i> Adicionar "${name}" a uma Lista`;
  if (subtitle) subtitle.textContent = `WhatsApp: ${phone || 'Não informado'}`;

  if (modal) modal.classList.add('active');

  await renderSingleContactLists();
};

window.closeSingleContactAddToListModal = function() {
  const modal = document.getElementById('singleContactAddToListModal');
  if (modal) modal.classList.remove('active');
  _currentSingleContact = null;
};

async function renderSingleContactLists() {
  const container = document.getElementById('singleContactListsContainer');
  if (!container || !_currentSingleContact) return;

  container.innerHTML = '<p class="text-muted text-sm text-center py-4">Carregando listas...</p>';

  try {
    const res = await fetch('/api/lists');
    const lists = await res.json();
    _allListsCache = lists;

    if (!lists.length) {
      container.innerHTML = `
        <div style="text-align:center; padding:1.5rem 0; color:var(--text-muted);">
          <i class="ti ti-layout-list" style="font-size:2rem; display:block; margin-bottom:0.5rem;"></i>
          <p class="text-sm">Nenhuma lista criada ainda.</p>
          <button type="button" class="btn btn-sm btn-primary mt-2" onclick="openNewListFromSingleContactModal()">+ Criar Primeira Lista</button>
        </div>
      `;
      return;
    }

    const phone = _currentSingleContact.phone || _currentSingleContact.telefone || '';
    const safeName = (_currentSingleContact.displayName || _currentSingleContact.name || _currentSingleContact.nome || '').replace(/'/g, "\\'");

    container.innerHTML = lists.map(list => {
      const inList = (list.contacts || []).some(c => (c.phone || c.id) === phone);

      return `
        <div class="single-list-option" style="
          display:flex; align-items:center; justify-content:space-between;
          padding:10px 14px; background:var(--background); border:1px solid var(--border);
          border-radius:10px; cursor:pointer; transition:all 0.2s ease;
        " onclick="toggleContactInList('${list.id}', '${phone}', '${safeName}', ${inList})">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <span style="width:12px; height:12px; border-radius:50%; background:${list.color || '#3b82f6'}; flex-shrink:0;"></span>
            <div style="min-width:0;">
              <strong style="font-size:0.9rem; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; color:var(--text-primary);">${list.name}</strong>
              <span class="text-muted text-sm">${list.contacts?.length || 0} contato${(list.contacts?.length !== 1) ? 's' : ''}</span>
            </div>
          </div>
          <div>
            ${inList
              ? `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px; font-size:12px; padding:4px 8px;"><i class="ti ti-check"></i> Na lista</span>`
              : `<span class="btn btn-sm btn-ghost" style="font-size:12px; padding:4px 8px; color:var(--brand-primary); border:1px solid var(--brand-primary); font-weight:600;">+ Adicionar</span>`}
          </div>
        </div>
      `;
    }).join('');
  } catch (err) {
    console.error('Erro ao renderizar listas:', err);
    container.innerHTML = '<p class="text-muted text-sm text-center">Erro ao carregar listas.</p>';
  }
}

window.toggleContactInList = async function(listId, phone, name, inList) {
  if (!phone) {
    if (typeof showToast === 'function') showToast('Contato não possui telefone válido.', 'warning');
    return;
  }

  const list = _allListsCache.find(l => l.id === listId);
  const listName = list ? list.name : 'Lista';

  try {
    if (inList) {
      // Remove from list
      await fetch(`/api/lists/${listId}/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: [phone] })
      });
      if (typeof showToast === 'function') showToast(`Removido da lista "${listName}"`, 'info');
    } else {
      // Add to list
      await fetch(`/api/lists/${listId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: [{ phone, name }] })
      });
      if (typeof showToast === 'function') showToast(`✅ "${name}" adicionado à lista "${listName}"!`, 'success');
    }

    // Refresh modal rendering
    await renderSingleContactLists();
    // Refresh board if on lists tab
    if (typeof renderListsBoard === 'function') renderListsBoard();
    // Update dispatcher source
    populateDispatcherListSource();
  } catch (err) {
    console.error('Erro ao alterar lista:', err);
    if (typeof showToast === 'function') showToast('Erro ao atualizar lista.', 'error');
  }
};

window.openNewListFromSingleContactModal = function() {
  closeSingleContactAddToListModal();
  openNewListModal();
};

window.getAllListsCache = function() {
  return _allListsCache || [];
};

window.handleContactListChange = async function(selectEl, phone, name, previousListId) {
  const newListId = selectEl.value;

  if (!phone) {
    if (typeof showToast === 'function') showToast('Contato sem telefone válido.', 'warning');
    return;
  }

  try {
    // If contact was in a previous list and it changed, remove from previous list
    if (previousListId && previousListId !== newListId) {
      await fetch(`/api/lists/${previousListId}/contacts`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phones: [phone] })
      });
    }

    // If a new list is selected, add to new list
    if (newListId) {
      await fetch(`/api/lists/${newListId}/contacts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contacts: [{ phone, name }] })
      });
      const list = _allListsCache.find(l => l.id === newListId);
      const listName = list ? list.name : 'Lista';

      if (typeof showToast === 'function') showToast(`✅ "${name}" adicionado a ${listName}!`, 'success');
    } else {
      if (typeof showToast === 'function') showToast(`Removido da lista.`, 'info');
    }

    // Refresh cache & UI
    await fetchListsCache();
    populateDispatcherListSource();
    if (typeof window.renderContactsTable === 'function') {
      window.renderContactsTable();
    }
    if (typeof renderListsBoard === 'function') renderListsBoard();
  } catch (err) {
    console.error('Erro ao atualizar lista do contato:', err);
    if (typeof showToast === 'function') showToast('Erro ao atualizar lista.', 'error');
  }
};


