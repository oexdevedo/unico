/**
 * MassaZap Pro - Módulo de Teste A/B (Comparação de Performance de Listas)
 */

const ABTestModule = (() => {
  // Elements
  const selGroupA = document.getElementById('abTestGroupA');
  const selGroupB = document.getElementById('abTestGroupB');

  const statsTotalA = document.getElementById('abStatsTotalA');
  const statsHotA = document.getElementById('abStatsHotA');
  const statsConvA = document.getElementById('abStatsConvA');

  const statsTotalB = document.getElementById('abStatsTotalB');
  const statsHotB = document.getElementById('abStatsHotB');
  const statsConvB = document.getElementById('abStatsConvB');

  const barFillA = document.getElementById('abBarFillA');
  const barTextA = document.getElementById('abBarTextA');
  const barFillB = document.getElementById('abBarFillB');
  const barTextB = document.getElementById('abBarTextB');

  function init() {
    console.log('📊 Inicializando Módulo Teste A/B...');
    setupListeners();
  }

  function setupListeners() {
    if (selGroupA) selGroupA.addEventListener('change', updateMetrics);
    if (selGroupB) selGroupB.addEventListener('change', updateMetrics);

    // Quando mudar para a aba de teste A/B, recarregar as tags
    document.getElementById('navABTest')?.addEventListener('click', () => {
      populateSelectors();
    });
  }

  function populateSelectors() {
    if (!window.SupabaseModule) return;
    const profiles = SupabaseModule.getProfiles() || [];
    
    // Extrai todas as tags (listas) únicas
    const allTags = new Set();
    profiles.forEach(p => {
      if (p.tags && Array.isArray(p.tags)) {
        p.tags.forEach(t => allTags.add(t));
      }
    });

    const tagsArray = Array.from(allTags).sort();

    const currentA = selGroupA.value;
    const currentB = selGroupB.value;

    let optionsHtml = '<option value="">Selecione uma lista/tag...</option>';
    tagsArray.forEach(tag => {
      optionsHtml += `<option value="${tag}">${tag}</option>`;
    });

    selGroupA.innerHTML = optionsHtml;
    selGroupB.innerHTML = optionsHtml;

    if (tagsArray.includes(currentA)) selGroupA.value = currentA;
    if (tagsArray.includes(currentB)) selGroupB.value = currentB;

    updateMetrics();
  }

  function calculateMetricsForTag(tag) {
    if (!tag) return { total: 0, hot: 0, conv: 0 };
    
    const profiles = SupabaseModule.getProfiles() || [];
    const contactsInGroup = profiles.filter(p => p.tags && p.tags.includes(tag));
    const total = contactsInGroup.length;
    
    // Considera 'hot' (quentes) contatos que o status está como 'Verde' ou 'Verde / Agendado'
    const hot = contactsInGroup.filter(p => p.status && String(p.status).toLowerCase().includes('verde')).length;
    
    let conv = 0;
    if (total > 0) {
      conv = Math.round((hot / total) * 100);
    }

    return { total, hot, conv };
  }

  function updateMetrics() {
    const tagA = selGroupA ? selGroupA.value : '';
    const tagB = selGroupB ? selGroupB.value : '';

    const metricsA = calculateMetricsForTag(tagA);
    const metricsB = calculateMetricsForTag(tagB);

    // Update UI Group A
    if (statsTotalA) statsTotalA.innerText = metricsA.total;
    if (statsHotA) statsHotA.innerText = metricsA.hot;
    if (statsConvA) statsConvA.innerText = `${metricsA.conv}%`;

    // Update UI Group B
    if (statsTotalB) statsTotalB.innerText = metricsB.total;
    if (statsHotB) statsHotB.innerText = metricsB.hot;
    if (statsConvB) statsConvB.innerText = `${metricsB.conv}%`;

    // Visual Bars
    if (barFillA && barTextA) {
      barFillA.style.width = `${metricsA.conv}%`;
      barTextA.innerText = `${metricsA.conv}%`;
    }
    if (barFillB && barTextB) {
      barFillB.style.width = `${metricsB.conv}%`;
      barTextB.innerText = `${metricsB.conv}%`;
    }
  }

  return {
    init,
    refresh: populateSelectors
  };
})();
