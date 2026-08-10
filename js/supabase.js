/**
 * MassaZap 2.0 — Supabase Data Module (Raio X Integration)
 */

const SupabaseModule = (() => {
  let supabaseClient = null;
  let allContacts = [];
  let selectedContactIds = new Set();

  const DEFAULT_SUPABASE_URL = 'https://iwpveyworwdymlzdmloq.supabase.co';
  const DEFAULT_SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Iml3cHZleXdvcndkeW1semRtbG9xIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MjcyNjksImV4cCI6MjA5MjUwMzI2OX0.8HyxCqcwQTc7-EFZQqOJbLr18h79dn6Ywyk1oDphaCI';

  function init(url, key) {
    const finalUrl = url || localStorage.getItem('massazap_supabase_url') || DEFAULT_SUPABASE_URL;
    const finalKey = key || localStorage.getItem('massazap_supabase_key') || DEFAULT_SUPABASE_KEY;

    try {
      if (window.supabase) {
        supabaseClient = window.supabase.createClient(finalUrl, finalKey);
        return { success: true };
      }
      return { success: false, error: 'Supabase JS não carregado' };
    } catch (err) {
      return { success: false, error: err.message };
    }
  }

  function getClient() {
    return supabaseClient;
  }

  function formatPhone(raw) {
    if (!raw) return null;
    let digits = String(raw).replace(/\D/g, '');
    if (digits.length === 0) return null;
    if (digits.length === 10 || digits.length === 11) digits = '55' + digits;
    return digits;
  }

  function formatDisplayPhone(raw) {
    if (!raw) return '<span class="text-muted">Sem telefone</span>';
    let digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('55') && digits.length >= 12) digits = digits.substring(2);
    if (digits.length === 11) return `(${digits.substring(0, 2)}) ${digits.substring(2, 7)}-${digits.substring(7)}`;
    if (digits.length === 10) return `(${digits.substring(0, 2)}) ${digits.substring(2, 6)}-${digits.substring(6)}`;
    return raw;
  }

  function isValidWhatsApp(raw) {
    if (!raw) return false;
    const digits = String(raw).replace(/\D/g, '');
    return digits.length >= 10 && digits.length <= 13;
  }

  async function fetchContacts() {
    if (!supabaseClient) init();

    try {
      const { data, error } = await supabaseClient
        .from('crm_contacts')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;

      allContacts = (data || []).map(item => {
        const phone = item.whatsapp || item.phone || '';
        const isValid = isValidWhatsApp(phone);
        const name = (item.name || item.full_name || 'Sem Nome').trim();
        const firstName = name.split(' ')[0] || name;

        return {
          ...item,
          displayName: name,
          firstName,
          name,
          first_name: firstName,
          whatsapp: phone,
          phone,
          rawPhone: phone,
          formattedPhone: formatPhone(phone),
          phoneFormatted: formatDisplayPhone(phone),
          displayPhone: formatDisplayPhone(phone),
          hasWhatsApp: isValid,
          hasValidPhone: isValid,
          status: item.contact_status || 'Novo',
          region: item.region || item.regiao_estado || item.estado || item.cidade || 'Não informado',
          profession: item.profession || item.profissao || 'Não informado',
          job: item.profession || item.profissao || 'Não informado',
          tags: item.tags || [],
          aiMode: item.ai_mode || 'autonomous'
        };
      });

      selectedContactIds.clear();
      allContacts.forEach(c => {
        if (c.hasValidPhone) selectedContactIds.add(c.id);
      });

      return allContacts;
    } catch (err) {
      console.error('Erro ao buscar contatos:', err);
      throw err;
    }
  }

  async function updateContactStatus(contactId, status = 'Contatado') {
    if (!supabaseClient) init();
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({
          contact_status: status,
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);
      return !error;
    } catch { return false; }
  }

  async function updateContactTags(contactId, tags) {
    if (!supabaseClient) init();
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({ tags, updated_at: new Date().toISOString() })
        .eq('id', contactId);
      return !error;
    } catch { return false; }
  }

  async function updateContactAiMode(contactId, mode) {
    if (!supabaseClient) init();
    try {
      const { error } = await supabaseClient
        .from('profiles')
        .update({ ai_mode: mode, updated_at: new Date().toISOString() })
        .eq('id', contactId);
      return !error;
    } catch { return false; }
  }

  async function importContacts(contactsArray) {
    if (!supabaseClient) init();
    try {
      const payload = contactsArray.map(c => ({
        ...c
      }));

      const { data, error } = await supabaseClient
        .from('crm_contacts')
        .insert(payload);
      
      if (error) throw error;
      return { success: true, count: contactsArray.length };
    } catch (err) {
      console.error('Erro ao importar contatos:', err);
      throw err;
    }
  }

  function filterContacts(optionsOrQuery = '', phoneFilter = 'all', statusFilter = 'all') {
    let q = '', pFilter = phoneFilter, sFilter = statusFilter, rFilter = 'all', tagFilter = '';

    if (typeof optionsOrQuery === 'object' && optionsOrQuery !== null) {
      q = (optionsOrQuery.query || '').toLowerCase().trim();
      pFilter = optionsOrQuery.hasWhatsApp || optionsOrQuery.phoneFilter || 'all';
      sFilter = optionsOrQuery.status || 'all';
      rFilter = (optionsOrQuery.region || 'all').toLowerCase();
      tagFilter = (optionsOrQuery.tag || '').toLowerCase();
    } else {
      q = (optionsOrQuery || '').toLowerCase().trim();
    }

    return allContacts.filter(contact => {
      const matchesQuery = !q ||
        (contact.displayName && contact.displayName.toLowerCase().includes(q)) ||
        (contact.rawPhone && contact.rawPhone.includes(q)) ||
        (contact.email && contact.email.toLowerCase().includes(q)) ||
        (contact.profession && contact.profession.toLowerCase().includes(q)) ||
        (contact.region && contact.region.toLowerCase().includes(q));

      if (!matchesQuery) return false;

      if ((pFilter === 'valid' || pFilter === 'with_wa') && !contact.hasWhatsApp) return false;
      if ((pFilter === 'invalid' || pFilter === 'no_wa') && contact.hasWhatsApp) return false;
      if (rFilter !== 'all' && contact.region && !contact.region.toLowerCase().includes(rFilter)) return false;
      if (sFilter !== 'all' && contact.status !== sFilter) return false;
      if (tagFilter && (!contact.tags || !contact.tags.some(t => t.toLowerCase().includes(tagFilter)))) return false;

      return true;
    });
  }

  // Selection management
  function getSelectedIds() { return selectedContactIds; }
  function getSelectedContacts() { return allContacts.filter(c => selectedContactIds.has(c.id) && c.hasValidPhone); }
  function toggleSelection(id) { selectedContactIds.has(id) ? selectedContactIds.delete(id) : selectedContactIds.add(id); }
  function selectAll(list) { (list || allContacts).forEach(c => { if (c.hasValidPhone) selectedContactIds.add(c.id); }); }
  function deselectAll() { selectedContactIds.clear(); }
  function invertSelection(list) {
    (list || allContacts).forEach(c => {
      if (c.hasValidPhone) { selectedContactIds.has(c.id) ? selectedContactIds.delete(c.id) : selectedContactIds.add(c.id); }
    });
  }

  function getAllContacts() { return allContacts; }
  function getUniqueRegions() { return [...new Set(allContacts.map(c => c.region).filter(Boolean))].sort(); }
  function getUniqueProfessions() { return [...new Set(allContacts.map(c => c.profession).filter(Boolean))].sort(); }
  function getUniqueTags() {
    const tags = new Set();
    allContacts.forEach(c => (c.tags || []).forEach(t => tags.add(t)));
    return [...tags].sort();
  }

  return {
    init, getClient, formatPhone, formatDisplayPhone, isValidWhatsApp,
    fetchContacts, updateContactStatus, updateContactTags, updateContactAiMode, importContacts,
    filterContacts,
    isContactSelected: (id) => selectedContactIds.has(id),
    toggleSelectContact: (id, force) => {
      if (force === true) selectedContactIds.add(id);
      else if (force === false) selectedContactIds.delete(id);
      else toggleSelection(id);
    },
    selectAllValid: () => selectAll(),
    getSelectedIds, getSelectedContacts, toggleSelection,
    selectAll, deselectAll, invertSelection,
    getAllContacts, getUniqueRegions, getUniqueProfessions, getUniqueTags,
    DEFAULT_SUPABASE_URL, DEFAULT_SUPABASE_KEY
  };
})();
