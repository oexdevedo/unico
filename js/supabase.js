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
      let crmData = [];
      let profilesData = [];

      try {
        const { data } = await supabaseClient.from('crm_contacts').select('*').order('created_at', { ascending: false });
        crmData = data || [];
      } catch (e) {}

      try {
        const { data } = await supabaseClient.from('profiles').select('*').order('created_at', { ascending: false });
        profilesData = data || [];
      } catch (e) {}

      const mergedMap = new Map();

      // Merge crm_contacts
      crmData.forEach(item => {
        const rawPhone = item.whatsapp || item.phone || '';
        const digits = rawPhone.replace(/\D/g, '');
        const keyStr = digits.length >= 8 ? digits.slice(-10) : item.id;
        mergedMap.set(keyStr, { ...item });
      });

      // Merge profiles with higher priority for email, profession, region
      profilesData.forEach(p => {
        const rawPhone = p.whatsapp || p.phone || '';
        const digits = rawPhone.replace(/\D/g, '');
        const keyStr = digits.length >= 8 ? digits.slice(-10) : p.id;
        const existing = mergedMap.get(keyStr) || {};

        const name = (p.name || p.full_name || existing.name || existing.full_name || 'Sem Nome').trim();
        const email = (p.email && p.email.trim()) ? p.email.trim() : (existing.email || '');
        const profession = (p.profession && p.profession.trim() && p.profession !== 'Não informado') ? p.profession.trim() : (existing.profession || 'Não informado');
        const region = (p.region && p.region.trim() && p.region !== 'Não informado') ? p.region.trim() : (existing.region || 'Não informado');
        const phone = (p.whatsapp && p.whatsapp.trim()) ? p.whatsapp.trim() : (p.phone && p.phone.trim() ? p.phone.trim() : (existing.whatsapp || existing.phone || ''));
        const rawStatus = existing.contact_status || p.contact_status || 'Vermelho';
        const status = (rawStatus === 'Novo' || rawStatus === 'Contatado' || !['Vermelho', 'Amarelo', 'Verde'].includes(rawStatus)) ? 'Vermelho' : rawStatus;

        mergedMap.set(keyStr, {
          ...existing,
          ...p,
          id: existing.id || p.id,
          name,
          full_name: name,
          email,
          profession,
          region,
          whatsapp: phone,
          phone,
          contact_status: status
        });
      });

      allContacts = Array.from(mergedMap.values()).map(item => {
        const phone = item.whatsapp || item.phone || '';
        const isValid = isValidWhatsApp(phone);
        const name = (item.name || item.full_name || 'Sem Nome').trim();
        const firstName = name.split(' ')[0] || name;
        const rawStatus = item.contact_status || 'Vermelho';
        const status = (rawStatus === 'Novo' || rawStatus === 'Contatado' || !['Vermelho', 'Amarelo', 'Verde'].includes(rawStatus)) ? 'Vermelho' : rawStatus;

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
          status,
          region: item.region || item.regiao_estado || item.estado || item.cidade || 'Não informado',
          profession: item.profession || item.profissao || 'Não informado',
          job: item.profession || item.profissao || 'Não informado',
          email: item.email || '',
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

  async function updateContactStatus(contactId, status = 'Vermelho') {
    if (!supabaseClient) init();
    try {
      await supabaseClient
        .from('crm_contacts')
        .update({
          contact_status: status,
          last_contact_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      await supabaseClient
        .from('profiles')
        .update({
          contact_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      return true;
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

  function findDuplicateContact(contactData) {
    if (!contactData) return null;
    const phoneRaw = String(contactData.phone || contactData.whatsapp || '').replace(/\D/g, '');
    const emailRaw = String(contactData.email || '').toLowerCase().trim();

    for (const c of allContacts) {
      const cPhone = String(c.rawPhone || c.phone || c.whatsapp || '').replace(/\D/g, '');
      const cEmail = String(c.email || '').toLowerCase().trim();

      // Verifica correspondência de telefone (mínimo 8 dígitos)
      if (phoneRaw && phoneRaw.length >= 8 && cPhone && cPhone.length >= 8) {
        const p1 = phoneRaw.slice(-8);
        const p2 = cPhone.slice(-8);
        if (p1 === p2) {
          return c;
        }
      }

      // Verifica correspondência de e-mail válido
      if (emailRaw && emailRaw.includes('@') && cEmail && cEmail.includes('@') && emailRaw === cEmail) {
        return c;
      }
    }
    return null;
  }

  async function importContacts(contactsArray) {
    if (!supabaseClient) init();
    try {
      const uniqueToInsert = [];
      const duplicates = [];
      const seenPhonesInBatch = new Set();
      const seenEmailsInBatch = new Set();

      for (const c of contactsArray) {
        const phone = String(c.phone || c.whatsapp || '').trim();
        const rawPhone = phone.replace(/\D/g, '');
        const email = String(c.email || '').toLowerCase().trim();
        const pKey = rawPhone.length >= 8 ? rawPhone.slice(-8) : null;
        const eKey = (email && email.includes('@')) ? email : null;

        // 1. Verifica duplicado dentro do próprio lote da planilha
        let isBatchDup = false;
        if (pKey && seenPhonesInBatch.has(pKey)) isBatchDup = true;
        if (eKey && seenEmailsInBatch.has(eKey)) isBatchDup = true;

        if (isBatchDup) {
          duplicates.push({
            name: c.name || c.full_name || 'Sem Nome',
            phone,
            email,
            reason: 'Duplicado na própria planilha'
          });
          continue;
        }

        // 2. Verifica duplicado contra a base já cadastrada no Supabase
        const existing = findDuplicateContact({ phone, email });
        if (existing) {
          duplicates.push({
            name: c.name || c.full_name || 'Sem Nome',
            phone,
            email,
            existingName: existing.displayName || existing.name,
            reason: `Já cadastrado na agenda como "${existing.displayName || existing.name}"`
          });
          continue;
        }

        // Não é duplicado
        if (pKey) seenPhonesInBatch.add(pKey);
        if (eKey) seenEmailsInBatch.add(eKey);

        uniqueToInsert.push({
          name: c.name || c.full_name || 'Sem Nome',
          full_name: c.name || c.full_name || 'Sem Nome',
          whatsapp: phone,
          phone: phone,
          email: c.email || '',
          region: c.region || '',
          profession: c.profession || '',
          contact_status: c.status || 'Vermelho',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });
      }

      let insertedCount = 0;
      if (uniqueToInsert.length > 0) {
        const { data, error } = await supabaseClient
          .from('crm_contacts')
          .insert(uniqueToInsert);

        if (error) throw error;
        insertedCount = uniqueToInsert.length;
      }

      await fetchContacts();

      return {
        success: true,
        count: insertedCount,
        totalParsed: contactsArray.length,
        duplicatesCount: duplicates.length,
        duplicates
      };
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

  async function updateContact(contactId, updatedData) {
    if (!supabaseClient) init();

    const name = updatedData.name || updatedData.displayName || '';
    const email = updatedData.email || '';
    const phone = updatedData.phone || updatedData.whatsapp || '';
    const profession = updatedData.profession || '';
    const region = updatedData.region || '';
    const status = updatedData.status || 'Vermelho';

    try {
      await supabaseClient
        .from('crm_contacts')
        .update({
          name,
          full_name: name,
          email,
          phone,
          whatsapp: phone,
          profession,
          region,
          contact_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      await supabaseClient
        .from('profiles')
        .update({
          name,
          full_name: name,
          email,
          phone,
          whatsapp: phone,
          profession,
          region,
          contact_status: status,
          updated_at: new Date().toISOString()
        })
        .eq('id', contactId);

      const contact = allContacts.find(c => String(c.id) === String(contactId));
      if (contact) {
        contact.name = name;
        contact.displayName = name;
        contact.email = email;
        contact.phone = phone;
        contact.whatsapp = phone;
        contact.phoneFormatted = formatDisplayPhone(phone);
        contact.formattedPhone = formatPhone(phone);
        contact.profession = profession;
        contact.region = region;
        contact.status = status;
      }

      return true;
    } catch (err) {
      console.error('Erro ao atualizar contato:', err);
      return false;
    }
  }

  async function createContact(contactData) {
    if (!supabaseClient) init();

    const existing = findDuplicateContact(contactData);
    if (existing) {
      const err = new Error(`Contato duplicado! Já existe um cadastro com este número/e-mail: "${existing.displayName || existing.name}" (${existing.displayPhone || existing.phone || existing.whatsapp || 'sem número'})`);
      err.isDuplicate = true;
      err.existingContact = existing;
      throw err;
    }

    const name = contactData.name || contactData.displayName || 'Novo Contato';
    const email = contactData.email || '';
    const phone = contactData.phone || contactData.whatsapp || '';
    const profession = contactData.profession || '';
    const region = contactData.region || '';
    const status = contactData.status || 'Vermelho';

    const payload = {
      name,
      full_name: name,
      email,
      phone,
      whatsapp: phone,
      profession,
      region,
      contact_status: status,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    let createdId = `manual_${Date.now()}`;

    try {
      if (supabaseClient) {
        try {
          const { data, error } = await supabaseClient
            .from('crm_contacts')
            .insert([payload])
            .select();
          
          if (!error && data && data.length > 0) {
            createdId = data[0].id;
          }
        } catch (e) {
          console.warn('Inserção direta no Supabase:', e);
        }
      }
    } catch (err) {
      console.error('Erro ao persistir contato no Supabase:', err);
    }

    // Cria e adiciona ao cache local de contatos
    const newContact = {
      id: createdId,
      name,
      displayName: name,
      firstName: name.split(' ')[0],
      email,
      phone,
      whatsapp: phone,
      rawPhone: phone.replace(/\D/g, ''),
      displayPhone: formatDisplayPhone(phone),
      phoneFormatted: formatDisplayPhone(phone),
      formattedPhone: formatPhone(phone),
      hasValidPhone: phone.replace(/\D/g, '').length >= 10,
      hasWhatsApp: phone.replace(/\D/g, '').length >= 10,
      profession: profession || 'Não informado',
      region: region || 'Não informado',
      status,
      tags: [],
      lists: []
    };

    allContacts.unshift(newContact);
    return newContact;
  }

  async function deleteContact(contactId) {
    if (!supabaseClient) init();
    try {
      await supabaseClient.from('crm_contacts').delete().eq('id', contactId);
      await supabaseClient.from('profiles').delete().eq('id', contactId);

      allContacts = allContacts.filter(c => String(c.id) !== String(contactId));
      selectedContactIds.delete(contactId);

      return true;
    } catch (err) {
      console.error('Erro ao excluir contato:', err);
      return false;
    }
  }

  return {
    init, getClient, formatPhone, formatDisplayPhone, isValidWhatsApp,
    fetchContacts, updateContactStatus, updateContactTags, updateContactAiMode, importContacts,
    createContact, updateContact, deleteContact, findDuplicateContact,
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
