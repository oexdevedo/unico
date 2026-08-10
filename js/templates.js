/**
 * MassaZap Pro - Message Templates & Variable Parser Module
 */

const TemplatesModule = (() => {
  const STORAGE_KEY = 'massazap_custom_templates';

  // Templates Padrão do Sistema
  const DEFAULT_TEMPLATES = [
    {
      id: 'tmpl-1',
      name: 'Boas-vindas ao Raio X Financeiro',
      category: 'welcome',
      text: '{Olá|Oi} {primeiro_nome}! {Tudo bem?|Como vai?}\n\n{saudacao}! Vi que você se cadastrou no *Raio X Financeiro* da Ex Devedor. 🚀\n\nEstamos preparando uma análise personalizada para te ajudar a organizar suas receitas e eliminar dívidas de forma inteligente.\n\nVocê já conseguiu preencher todos os seus dados no diagnóstico?'
    },
    {
      id: 'tmpl-2',
      name: 'Diagnóstico Financeiro Pronto',
      category: 'diagnostic',
      text: '{saudacao}, {primeiro_nome}! 👋\n\nAqui é da equipe de consultoria do *Raio X Financeiro*.\n\nNotamos que você atua na área de *{profissao}* em *{regiao}*. Temos estratégias específicas para o seu perfil financeiro que podem acelerar a sua recuperação e multiplicar seu saldo positivo.\n\nGostaria de receber uma análise gratuita dos seus pontos de melhoria?'
    },
    {
      id: 'tmpl-3',
      name: 'Convite para Mentoria / Transformação',
      category: 'mentorship',
      text: 'Olá {primeiro_nome}, {saudacao}! 🌟\n\nPassando para te fazer um convite exclusivo: abrimos algumas vagas para a nossa *Sessão Estratégica de Mentoria Financeira*.\n\nVamos analisar juntos o seu fluxo de despesas e traçar um plano de ação direto ao ponto.\n\nSe tiver interesse em garantir sua vaga, me responde aqui com um *\"QUERO\"*!'
    },
    {
      id: 'tmpl-4',
      name: 'Reengajamento & Acompanhamento',
      category: 'followup',
      text: 'Oi {primeiro_nome}! Tudo bem por aí?\n\nPassando para saber como estão as coisas e se você conseguiu avançar no seu planejamento financeiro este mês.\n\nSe precisar de qualquer apoio ou tirar dúvidas sobre o *Raio X*, estou à disposição por aqui! 👍'
    }
  ];

  /**
   * Obtém todos os templates (Padrão + Customizados)
   */
  function getAllTemplates() {
    const custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    return [...DEFAULT_TEMPLATES, ...custom];
  }

  /**
   * Salva um template customizado
   */
  function saveTemplate(template) {
    const custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    
    if (template.id) {
      const idx = custom.findIndex(t => t.id === template.id);
      if (idx !== -1) {
        custom[idx] = { ...custom[idx], ...template };
      } else {
        custom.push({ ...template, id: 'tmpl-' + Date.now() });
      }
    } else {
      custom.push({ ...template, id: 'tmpl-' + Date.now() });
    }

    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    return getAllTemplates();
  }

  /**
   * Remove um template customizado
   */
  function deleteTemplate(id) {
    let custom = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    custom = custom.filter(t => t.id !== id);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
    return getAllTemplates();
  }

  /**
   * Gera saudação contextual conforme o horário atual
   */
  function getGreeting() {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) return 'Bom dia';
    if (hour >= 12 && hour < 18) return 'Boa tarde';
    return 'Boa noite';
  }

  /**
   * Resolve Spintax {Opção 1|Opção 2|Opção 3}
   */
  function parseSpintax(text) {
    if (!text) return '';
    return text.replace(/\{([^{}]+)\}/g, (match, choices) => {
      // Ignora tags conhecidas como {nome}, {primeiro_nome}
      const knownTags = ['nome', 'primeiro_nome', 'saudacao', 'regiao', 'profissao', 'email', 'whatsapp', 'telefone'];
      if (knownTags.includes(choices.toLowerCase())) {
        return match;
      }
      const options = choices.split('|');
      return options[Math.floor(Math.random() * options.length)].trim();
    });
  }

  /**
   * Substitui todas as tags dinâmicas no template para um contato específico
   */
  function interpolateTemplate(rawTemplate, contact = {}) {
    if (!rawTemplate) return '';

    const fullName = (contact.displayName || contact.name || contact.full_name || 'Amigo(a)').trim();
    const firstName = contact.firstName || fullName.split(' ')[0] || fullName;
    const greeting = getGreeting();
    const region = contact.region || 'sua região';
    const profession = contact.profession || 'sua área';
    const email = contact.email || '';
    const phone = contact.displayPhone || contact.rawPhone || '';

    // Primeiro resolve Spintax se houver
    let result = parseSpintax(rawTemplate);

    // Substitui variáveis
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

  /**
   * Converte formatação WhatsApp (*negrito*, _itálico_, ~tachado~, ```código```) para HTML seguro
   */
  function formatWhatsAppToHtml(text) {
    if (!text) return '';

    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bloco de código ```
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    // Negrito *texto*
    formatted = formatted.replace(/\*([^\*]+)\*/g, '<strong>$1</strong>');
    // Itálico _texto_
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    // Tachado ~texto~
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    // Quebras de linha
    formatted = formatted.replace(/\n/g, '<br>');

    return formatted;
  }

  return {
    DEFAULT_TEMPLATES,
    getAllTemplates,
    getTemplates: getAllTemplates,
    getTemplateById: (id) => getAllTemplates().find(t => t.id === id),
    saveTemplate,
    deleteTemplate,
    getGreeting,
    parseSpintax,
    interpolateTemplate,
    parseMessage: interpolateTemplate,
    formatWhatsAppToHtml
  };
})();
