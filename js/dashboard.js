/**
 * MassaZap 2.0 — Dashboard Métricas Module
 */

const DashboardModule = (() => {
  let cachedMetrics = null;

  async function fetchMetrics(period = '7d') {
    try {
      const res = await fetch(`/api/dashboard/metrics?period=${period}`);
      const data = await res.json();
      if (data.success) {
        cachedMetrics = data.metrics;
        return data.metrics;
      }
      return null;
    } catch (err) {
      console.error('Erro ao buscar métricas:', err);
      return null;
    }
  }

  async function fetchCampaigns() {
    try {
      const res = await fetch('/api/campaigns');
      const data = await res.json();
      return data.campaigns || [];
    } catch { return []; }
  }

  async function fetchCampaignStats(campaignId) {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/stats`);
      return await res.json();
    } catch { return null; }
  }

  function renderMetricsCards(metrics) {
    const container = document.getElementById('dashboardMetricsGrid');
    if (!container || !metrics) return;

    const m = metrics.messages;
    const cards = [
      { label: 'Enviadas', value: m.sent || m.total || 0, icon: '', color: 'var(--brand-primary)', text: '#000' },
      { label: 'Entregues', value: m.delivered || 0, icon: '', color: '#000', text: '#fff' },
      { label: 'Respostas', value: m.replied || 0, icon: '', color: '#222', text: '#fff' },
      { label: 'Falhas', value: m.failed || 0, icon: '', color: '#f59e0b', text: '#000' }
    ];

    container.innerHTML = cards.map(c => `
      <div class="metric-card" style="--accent: ${c.color}; border-radius: 24px; background: ${c.color}; border: none;">
         <div class="metric-card-header">
           <span class="metric-icon">${c.icon}</span>
           <span class="metric-label" style="font-weight:800; color:${c.text}; font-size: 1.1rem;">${c.label}</span>
         </div>
         <div class="metric-value" style="color:${c.text};">${c.value.toLocaleString('pt-BR')}</div>
      </div>
    `).join('');
  }

  function renderCampaignsTable(campaigns) {
    const tbody = document.getElementById('campaignsTableBody');
    if (!tbody) return;

    if (!campaigns || campaigns.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted py-8">Nenhuma campanha registrada.</td></tr>';
      return;
    }

    tbody.innerHTML = campaigns.map(c => {
      const statusBadge = {
        draft: '<span class="badge badge-neutral">Rascunho</span>',
        running: '<span class="badge badge-warning">Em Execução</span>',
        paused: '<span class="badge badge-info">Pausada</span>',
        completed: '<span class="badge badge-success">Concluída</span>',
        cancelled: '<span class="badge badge-danger">Cancelada</span>'
      }[c.status] || `<span class="badge badge-neutral">${c.status}</span>`;

      const date = c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-';

      return `
        <tr>
          <td><strong>${c.name}</strong></td>
          <td>${date}</td>
          <td>${statusBadge}</td>
          <td>${c.total_contacts || 0}</td>
          <td class="text-success">${c.total_sent || 0}</td>
          <td class="text-danger">${c.total_failed || 0}</td>
          <td>
            <button class="btn btn-sm btn-ghost" onclick="DashboardModule.viewCampaignDetails('${c.id}')">Detalhes</button>
          </td>
        </tr>
      `;
    }).join('');
  }

  function renderContactStatusChart(contacts) {
    const container = document.getElementById('contactStatusChart');
    if (!container || !contacts) return;

    const byStatus = contacts.byStatus || {};
    const total = Object.values(byStatus).reduce((a, b) => a + b, 0) || 1;

    const colors = {
      'Novo': 'var(--brand-primary)',
      'Contatado': '#000',
      'Respondido': '#f59e0b',
      'Convertido': '#222',
      'Inativo': '#8b9283'
    };

    container.innerHTML = Object.entries(byStatus).map(([status, count]) => {
      const pct = ((count / total) * 100).toFixed(1);
      const color = colors[status] || '#6b7280';
      return `
        <div class="chart-bar-item">
          <div class="chart-bar-label">
            <span class="chart-dot" style="background:${color}"></span>
            <span>${status}</span>
            <span class="text-muted">(${count})</span>
          </div>
          <div class="chart-bar-track">
            <div class="chart-bar-fill" style="width:${pct}%; background:${color}"></div>
          </div>
          <span class="chart-bar-pct">${pct}%</span>
        </div>
      `;
    }).join('');
  }

  async function viewCampaignDetails(campaignId) {
    const data = await fetchCampaignStats(campaignId);
    if (!data?.success) return alert('Erro ao carregar detalhes.');

    const { campaign, stats } = data;
    const modal = document.getElementById('campaignDetailsModal');
    if (!modal) return;

    modal.querySelector('.modal-title').textContent = campaign.name;
    modal.querySelector('.modal-body').innerHTML = `
      <div class="metric-grid-small">
        <div class="metric-mini"><span class="metric-mini-val">${stats.total}</span><span>Total</span></div>
        <div class="metric-mini"><span class="metric-mini-val text-success">${stats.sent}</span><span>Enviadas</span></div>
        <div class="metric-mini"><span class="metric-mini-val text-info">${stats.delivered}</span><span>Entregues</span></div>
        <div class="metric-mini"><span class="metric-mini-val text-purple">${stats.read}</span><span>Lidas</span></div>
        <div class="metric-mini"><span class="metric-mini-val text-warning">${stats.replied}</span><span>Respondidas</span></div>
        <div class="metric-mini"><span class="metric-mini-val text-danger">${stats.failed}</span><span>Falhas</span></div>
      </div>
      <div class="mt-4">
        <strong>Taxa de Resposta:</strong> ${stats.replyRate}%
      </div>
      <div class="mt-2">
        <strong>Template:</strong>
        <pre class="code-block mt-2">${campaign.template_text || '-'}</pre>
      </div>
    `;
    modal.classList.add('active');
  }

  async function init(period = '7d') {
    const metrics = await fetchMetrics(period);
    if (metrics) {
      renderMetricsCards(metrics);
      renderCampaignsTable(metrics.campaigns);
      renderContactStatusChart(metrics.contacts);
    }
  }

  return {
    init, fetchMetrics, fetchCampaigns, fetchCampaignStats,
    renderMetricsCards, renderCampaignsTable, renderContactStatusChart,
    viewCampaignDetails
  };
})();
