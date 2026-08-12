/**
 * MassaZap 2.0 — Message Templates & Spintax Module
 * Full CRUD, API persistence, real-time WhatsApp simulation preview & Disparador integration
 */

const TemplatesModule = (() => {
  const STORAGE_KEY = 'massazap_custom_templates';
  let _templatesCache = [];

  const DEFAULT_TEMPLATES = [
    {
      id: 'tmpl-1',
      name: 'Boas-vindas ao Raio X Financeiro',
      category: 'Boas-Vindas',
      text: '{Olá|Oi} {primeiro_nome}! {Tudo bem?|Como vai?}\n\n{saudacao}! Vi que você se cadastrou no *Raio X Financeiro* da Ex Devedor. 🚀\n\nEstamos preparando uma análise personalizada para te ajudar a organizar suas receitas e eliminar dívidas de forma inteligente.\n\nVocê já conseguiu preencher todos os seus dados no diagnóstico?'
    },
    {
      id: 'tmpl-2',
      name: 'Diagnóstico Financeiro Pronto',
      category: 'Diagnóstico',
      text: '{saudacao}, {primeiro_nome}! 👋\n\nAqui é da equipe de consultoria do *Raio X Financeiro*.\n\nNotamos que você atua na área de *{profissao}* em *{regiao}*. Temos estratégias específicas para o seu perfil financeiro que podem acelerar a sua recuperação e multiplicar seu saldo positivo.\n\nGostaria de receber uma análise gratuita dos seus pontos de melhoria?'
    },
    {
      id: 'tmpl-3',
      name: 'Convite para Mentoria / Transformação',
      category: 'Vendas',
      text: 'Olá {primeiro_nome}, {saudacao}! 🌟\n\nPassando para te fazer um convite exclusivo: abrimos algumas vagas para a nossa *Sessão Estratégica de Mentoria Financeira*.\n\nVamos analisar juntos o seu fluxo de despesas e traçar um plano de ação direto ao ponto.\n\nSe tiver interesse em garantir sua vaga, me responde aqui com um *\"QUERO\"*!'
    },
    {
      id: 'tmpl-4',
      name: 'Reengajamento & Acompanhamento',
      category: 'Follow-up',
      text: 'Oi {primeiro_nome}! Tudo bem por aí?\n\nPassando para saber como estão as coisas e se você conseguiu avançar no seu planejamento financeiro este mês.\n\nSe precisar de qualquer apoio ou tirar dúvidas sobre o *Raio X*, estou à disposição por aqui! 👍'
    }
  ];

  /**
   * Carrega os templates da API (/api/templates)
   */
  async function fetchTemplates() {
    try {
      const res = await fetch('/api/templates');
      if (res.ok) {
        _templatesCache = await res.json();
      } else {
        throw new Error('Falha na API de templates');
      }
    } catch (e) {
      console.warn('Usando fallback local de templates:', e);
      const localCustom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      _templatesCache = [...DEFAULT_TEMPLATES, ...localCustom];
    }
    return _templatesCache;
  }

  function getAllTemplates() {
    return _templatesCache.length > 0 ? _templatesCache : DEFAULT_TEMPLATES;
  }

  function getTemplateById(id) {
    return getAllTemplates().find(t => t.id === id);
  }

  /**
   * Renderiza a interface principal de Templates
   */
  async function renderTemplatesUI() {
    await fetchTemplates();
    updateStatsPills();
    renderTemplatesList();
  }

  /**
   * Atualiza os contadores em pill no topo
   */
  function updateStatsPills() {
    const templates = getAllTemplates();

    const setVal = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    setVal('statTotalTemplates', templates.length);
    setVal('statWelcomeTemplates', templates.filter(t => (t.category || '').toLowerCase().includes('boas')).length);
    setVal('statSalesTemplates', templates.filter(t => (t.category || '').toLowerCase().includes('venda')).length);
    setVal('statBillingTemplates', templates.filter(t => (t.category || '').toLowerCase().includes('cobran')).length);
    setVal('statFollowupTemplates', templates.filter(t => (t.category || '').toLowerCase().includes('follow')).length);
  }

  /**
   * Renderiza a lista de templates em formato de tabela
   */
  function renderTemplatesList() {
    const tbody = document.getElementById('templatesListBody');
    const countLabel = document.getElementById('templatesCountLabel');
    if (!tbody) return;

    const templates = getAllTemplates();
    const search = (document.getElementById('templateSearchInput')?.value || '').toLowerCase().trim();
    const categoryFilter = document.getElementById('templateCategoryFilter')?.value || 'all';

    const filtered = templates.filter(t => {
      const matchSearch = !search || t.name.toLowerCase().includes(search) || t.text.toLowerCase().includes(search);
      const matchCat = categoryFilter === 'all' || (t.category || 'Geral') === categoryFilter;
      return matchSearch && matchCat;
    });

    if (countLabel) {
      countLabel.textContent = `${filtered.length} template${filtered.length !== 1 ? 's' : ''} cadastrado${filtered.length !== 1 ? 's' : ''}`;
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="5" class="crx-td-empty">
            <i class="ti ti-file-off" style="font-size: 2rem; opacity: 0.4; display: block; margin-bottom: 8px;"></i>
            Nenhum template encontrado.
            <div style="margin-top: 10px;">
              <button class="crx-btn crx-btn-outline crx-btn--sm" onclick="TemplatesModule.openTemplateModal()">
                <i class="ti ti-plus"></i> Criar Novo Template
              </button>
            </div>
          </td>
        </tr>`;
      return;
    }

    tbody.innerHTML = filtered.map(t => {
      const badgeClass = getCategoryBadgeClass(t.category);
      const detectedVars = extractVariables(t.text);
      const formattedPreview = formatWhatsAppToHtml(t.text);

      return `
        <tr data-template-id="${t.id}" class="template-table-row">
          <td>
            <div style="display:flex; align-items:center; gap:10px;">
              <div class="template-list-icon">
                <i class="ti ti-file-text"></i>
              </div>
              <div>
                <strong style="font-size:0.875rem; color:var(--text-primary); display:block;">${escapeHtml(t.name)}</strong>
              </div>
            </div>
          </td>
          <td>
            <span class="template-card__badge ${badgeClass}">${escapeHtml(t.category || 'Geral')}</span>
          </td>
          <td>
            <div class="template-table-preview" title="${escapeHtml(t.text)}">
              ${formattedPreview}
            </div>
          </td>
          <td>
            <div class="template-card__tags">
              ${detectedVars.length > 0
                ? detectedVars.map(v => `<span class="template-card__tag">${v}</span>`).join('')
                : '<span class="text-muted text-sm">—</span>'
              }
            </div>
          </td>
          <td style="text-align:center;">
            <div class="template-card__actions" style="justify-content:center;">
              <button class="crx-btn crx-btn-primary crx-btn--sm" onclick="TemplatesModule.useTemplateInDispatcher('${t.id}')" title="Usar no Disparador">
                <i class="ti ti-send"></i> Usar
              </button>
              <button class="crx-icon-btn" onclick="TemplatesModule.copyTemplateText('${t.id}')" title="Copiar texto">
                <i class="ti ti-copy"></i>
              </button>
              <button class="crx-icon-btn" onclick="TemplatesModule.openTemplateModal('${t.id}')" title="Editar">
                <i class="ti ti-pencil"></i>
              </button>
              <button class="crx-icon-btn" onclick="TemplatesModule.deleteTemplate('${t.id}')" title="Excluir" style="color:#ef4444;">
                <i class="ti ti-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }

  function getCategoryBadgeClass(cat) {
    const c = (cat || '').toLowerCase();
    if (c.includes('boas')) return 'template-card__badge--welcome';
    if (c.includes('venda')) return 'template-card__badge--sales';
    if (c.includes('diagn')) return 'template-card__badge--diagnostic';
    if (c.includes('cobran')) return 'template-card__badge--billing';
    if (c.includes('follow')) return 'template-card__badge--followup';
    return 'template-card__badge--general';
  }

  function extractVariables(text) {
    if (!text) return [];
    const matches = text.match(/\{[^{}]+\}/g) || [];
    const unique = [...new Set(matches)];
    return unique.slice(0, 4); // max 4 tags
  }

  /**
   * Modal Management
   */
  function openTemplateModal(id = null) {
    const modal = document.getElementById('templateModal');
    if (!modal) return;

    const editIdInput = document.getElementById('templateEditId');
    const nameInput = document.getElementById('templateNameInput');
    const catInput = document.getElementById('templateCategoryInput');
    const textInput = document.getElementById('templateTextInput');
    const titleEl = document.getElementById('templateModalTitle');

    if (id) {
      const tmpl = getTemplateById(id);
      if (tmpl) {
        editIdInput.value = tmpl.id;
        nameInput.value = tmpl.name || '';
        catInput.value = tmpl.category || 'Geral';
        textInput.value = tmpl.text || '';
        if (titleEl) titleEl.innerHTML = '<i class="ti ti-pencil" style="margin-right:0.4rem;"></i> Editar Template';
      }
    } else {
      editIdInput.value = '';
      nameInput.value = '';
      catInput.value = 'Geral';
      textInput.value = '';
      if (titleEl) titleEl.innerHTML = '<i class="ti ti-file-text" style="margin-right:0.4rem;"></i> Novo Template de Mensagem';
    }

    updateModalPreview();
    modal.classList.add('active');
  }

  function closeTemplateModal() {
    const modal = document.getElementById('templateModal');
    if (modal) modal.classList.remove('active');
  }

  function updateModalPreview() {
    const text = document.getElementById('templateTextInput')?.value || '';
    const previewEl = document.getElementById('templateModalPreview');
    if (!previewEl) return;

    if (!text.trim()) {
      previewEl.innerHTML = '<span style="color:#888;">Sua mensagem aparecerá aqui...</span>';
      return;
    }

    const sampleContact = {
      displayName: 'Maria Mickaele',
      firstName: 'Maria',
      region: 'Distrito Federal (DF)',
      profession: 'Lead Rápido',
      email: 'mickaelesilva076@gmail.com',
      displayPhone: '(82) 99331-2731'
    };

    const interpolated = interpolateTemplate(text, sampleContact);
    previewEl.innerHTML = formatWhatsAppToHtml(interpolated);
  }

  function insertVariableInModal(varText) {
    const textarea = document.getElementById('templateTextInput');
    if (!textarea) return;

    const start = textarea.selectionStart || 0;
    const end = textarea.selectionEnd || 0;
    const current = textarea.value;

    textarea.value = current.substring(0, start) + varText + current.substring(end);
    textarea.focus();
    textarea.selectionStart = textarea.selectionEnd = start + varText.length;

    updateModalPreview();
  }

  /**
   * Salva o template criado ou editado no modal
   */
  async function saveTemplateFromModal() {
    const editId = document.getElementById('templateEditId')?.value;
    const name = document.getElementById('templateNameInput')?.value.trim();
    const category = document.getElementById('templateCategoryInput')?.value || 'Geral';
    const text = document.getElementById('templateTextInput')?.value.trim();

    if (!name || !text) {
      if (typeof window.showToast === 'function') window.showToast('Preencha o nome e o texto do template.', 'warning');
      return;
    }

    try {
      const method = editId ? 'PUT' : 'POST';
      const url = editId ? `/api/templates/${editId}` : '/api/templates';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, category, text })
      });

      if (!res.ok) throw new Error('Erro ao salvar no servidor');

      closeTemplateModal();
      if (typeof window.showToast === 'function') {
        window.showToast(editId ? 'Template atualizado com sucesso!' : 'Novo template criado!', 'success');
      }

      await renderTemplatesUI();
      populateTemplateSelect();

    } catch (err) {
      console.error(err);
      // Fallback local
      const custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      const newTmpl = { id: editId || 'tmpl-' + Date.now(), name, category, text };

      if (editId) {
        const idx = custom.findIndex(t => t.id === editId);
        if (idx !== -1) custom[idx] = newTmpl;
      } else {
        custom.push(newTmpl);
      }

      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
      closeTemplateModal();
      renderTemplatesGrid();
      populateTemplateSelect();
      if (typeof window.showToast === 'function') window.showToast('Template salvo localmente!', 'success');
    }
  }

  /**
   * Exclui um template
   */
  async function deleteTemplate(id) {
    if (!confirm('Tem certeza que deseja excluir este template?')) return;

    try {
      const res = await fetch(`/api/templates/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Erro ao excluir no servidor');

      if (typeof window.showToast === 'function') window.showToast('Template excluído!', 'success');
      await renderTemplatesUI();
      populateTemplateSelect();

    } catch (err) {
      console.error(err);
      let custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      custom = custom.filter(t => t.id !== id);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
      renderTemplatesGrid();
      populateTemplateSelect();
      if (typeof window.showToast === 'function') window.showToast('Template excluído localmente!', 'success');
    }
  }

  /**
   * Popula o <select id="templateSelect"> na aba Disparador
   */
  async function populateTemplateSelect() {
    const select = document.getElementById('templateSelect');
    if (!select) return;

    const templates = getAllTemplates().length > 0 ? getAllTemplates() : await fetchTemplates();

    let html = '<option value="">— Selecione um template ou escreva livre —</option>';
    templates.forEach(t => {
      html += `<option value="${t.id}">[${t.category || 'Geral'}] ${t.name}</option>`;
    });

    select.innerHTML = html;

    // Attach event listener once
    if (!select.dataset.listenerAttached) {
      select.dataset.listenerAttached = 'true';
      select.addEventListener('change', (e) => {
        const tmplId = e.target.value;
        if (!tmplId) return;
        const tmpl = getTemplateById(tmplId);
        const textInput = document.getElementById('messageTemplateInput');
        if (tmpl && textInput) {
          textInput.value = tmpl.text;
          textInput.focus();
        }
      });
    }
  }

  /**
   * Direciona para a aba Disparador preenchendo com o template selecionado
   */
  function useTemplateInDispatcher(id) {
    const tmpl = getTemplateById(id);
    if (!tmpl) return;

    const messageInput = document.getElementById('messageTemplateInput');
    const templateSelect = document.getElementById('templateSelect');

    if (messageInput) messageInput.value = tmpl.text;
    if (templateSelect) templateSelect.value = tmpl.id;

    if (typeof window.App?.switchTab === 'function') {
      window.App.switchTab('tab-dispatcher');
    } else {
      const btn = document.querySelector('[data-tab="tab-dispatcher"]');
      if (btn) btn.click();
    }

    if (typeof window.showToast === 'function') {
      window.showToast(`Template "${tmpl.name}" carregado no disparador!`, 'info');
    }
  }

  /**
   * Copia o texto do template para a área de transferência
   */
  function copyTemplateText(id) {
    const tmpl = getTemplateById(id);
    if (!tmpl) return;

    navigator.clipboard.writeText(tmpl.text).then(() => {
      if (typeof window.showToast === 'function') window.showToast('Texto do template copiado!', 'success');
    }).catch(err => {
      console.error('Erro ao copiar:', err);
    });
  }

  /**
   * Helper Utilitários de Spintax, interpolação e formatação
   */
  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  function parseSpintax(text) {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
      const knownTags = ['nome', 'primeiro_nome', 'saudacao', 'regiao', 'profissao', 'email', 'whatsapp', 'telefone'];
      if (knownTags.includes(choices.toLowerCase())) return match;
      const options = choices.split('|');
      return options[Math.floor(Math.random() * options.length)].trim();
    });
  }

  function interpolateTemplate(rawTemplate, contact = {}) {
    if (!rawTemplate) return '';

    const fullName = (contact.displayName || contact.name || contact.full_name || 'Amigo(a)').trim();
    const firstName = contact.firstName || fullName.split(' ')[0] || fullName;
    const greeting = getGreeting();
    const region = contact.region || 'sua região';
    const profession = contact.profession || 'sua área';
    const email = contact.email || '';
    const phone = contact.displayPhone || contact.rawPhone || contact.phone || '';

    let result = parseSpintax(rawTemplate);

    result = result
      .replace(/\{nome\}/gi, fullName)
      .replace(/\{primeiro_nome\}/gi, firstName)
      .replace(/\{saudacao\}/gi, greeting)
      .replace(/\{regiao\}/gi, region)
      .replace(/\{profissao\}/gi, profession)
      .replace(/\{email\}/gi, email)
      .replace(/\{whatsapp\}/gi, phone)
      .replace(/\{telefone\}/gi, phone);

    return result;
  }

  function formatWhatsAppToHtml(text) {
    if (!text) return '';

    let formatted = escapeHtml(text);
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    formatted = formatted.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // Inicialização automática
  document.addEventListener('DOMContentLoaded', () => {
    fetchTemplates().then(() => {
      populateTemplateSelect();
    });
  });

  return {
    DEFAULT_TEMPLATES,
    fetchTemplates,
    getAllTemplates,
    getTemplates: getAllTemplates,
    getTemplateById,
    renderTemplatesUI,
    renderTemplatesList,
    renderTemplatesGrid: renderTemplatesList,
    openTemplateModal,
    closeTemplateModal,
    updateModalPreview,
    insertVariableInModal,
    saveTemplateFromModal,
    deleteTemplate,
    populateTemplateSelect,
    useTemplateInDispatcher,
    copyTemplateText,
    getGreeting,
    parseSpintax,
    interpolateTemplate,
    parseMessage: interpolateTemplate,
    formatWhatsAppToHtml
  };
})();
