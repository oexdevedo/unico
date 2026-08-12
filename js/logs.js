/**
 * MassaZap 2.0 — Logs & Relatórios de Envio Module
 * Gerencia histórico detalhado de todas as mensagens disparadas, status e motivos de erro.
 */

const LogsModule = (() => {
  let _logsCache = [];
  let _activeFilter = 'all'; // 'all' | 'success' | 'error'
  let _selectedLog = null;

  async function fetchLogs() {
    try {
      const res = await fetch('/api/dispatch-logs');
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      _logsCache = await res.json();
    } catch (err) {
      console.warn('Não foi possível carregar logs do servidor:', err);
      _logsCache = [];
    }
    return _logsCache;
  }

  async function recordLog(logEntry) {
    const entry = {
      id: logEntry.id || `log-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      timestamp: logEntry.timestamp || new Date().toISOString(),
      timeFormatted: logEntry.timeFormatted || new Date().toLocaleTimeString('pt-BR') + ' ' + new Date().toLocaleDateString('pt-BR'),
      contactName: logEntry.contactName || 'Desconhecido',
      phone: logEntry.phone || '',
      message: logEntry.message || logEntry.text || '',
      media: logEntry.media || null,
      status: logEntry.status || 'success',
      errorReason: logEntry.errorReason || null,
      instanceName: logEntry.instanceName || 'Linha WhatsApp',
      campaignName: logEntry.campaignName || 'Disparo'
    };

    _logsCache.unshift(entry);

    try {
      await fetch('/api/dispatch-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry)
      });
    } catch (err) {
      console.warn('Erro ao salvar log no servidor:', err);
    }

    renderTable();
    updateStats();
    return entry;
  }

  function setFilter(filterType) {
    _activeFilter = filterType;
    document.querySelectorAll('[data-log-filter]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-log-filter') === filterType);
    });
    renderTable();
  }

  function updateStats() {
    const total = _logsCache.length;
    const success = _logsCache.filter(l => l.status === 'success').length;
    const failed = _logsCache.filter(l => l.status === 'error').length;
    const rate = total > 0 ? Math.round((success / total) * 100) : 0;

    const elTotal = document.getElementById('statLogsTotal');
    const elSuccess = document.getElementById('statLogsSuccess');
    const elFailed = document.getElementById('statLogsFailed');
    const elRate = document.getElementById('statLogsSuccessRate');

    const fAll = document.getElementById('countLogsFilterAll');
    const fSuccess = document.getElementById('countLogsFilterSuccess');
    const fError = document.getElementById('countLogsFilterError');

    if (elTotal) elTotal.textContent = total;
    if (elSuccess) elSuccess.textContent = success;
    if (elFailed) elFailed.textContent = failed;
    if (elRate) elRate.textContent = `${rate}%`;

    if (fAll) fAll.textContent = total;
    if (fSuccess) fSuccess.textContent = success;
    if (fError) fError.textContent = failed;
  }

  function renderTable() {
    const tbody = document.getElementById('logsHistoryTableBody');
    if (!tbody) return;

    updateStats();

    const searchQuery = (document.getElementById('logsSearchInput')?.value || '').toLowerCase();

    let filtered = _logsCache;

    if (_activeFilter === 'success') {
      filtered = filtered.filter(l => l.status === 'success');
    } else if (_activeFilter === 'error') {
      filtered = filtered.filter(l => l.status === 'error');
    }

    if (searchQuery) {
      filtered = filtered.filter(l =>
        (l.contactName && l.contactName.toLowerCase().includes(searchQuery)) ||
        (l.phone && l.phone.includes(searchQuery)) ||
        (l.message && l.message.toLowerCase().includes(searchQuery)) ||
        (l.errorReason && l.errorReason.toLowerCase().includes(searchQuery)) ||
        (l.instanceName && l.instanceName.toLowerCase().includes(searchQuery))
      );
    }

    if (filtered.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="text-center text-muted py-8">
            <i class="ti ti-file-search" style="font-size:24px; display:block; margin-bottom:8px;"></i>
            Nenhum registro de log encontrado para os filtros selecionados.
          </td>
        </tr>
      `;
      return;
    }

    tbody.innerHTML = filtered.map(log => {
      const isSuccess = log.status === 'success';
      const statusBadge = isSuccess
        ? `<span class="badge badge-success" style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i class="ti ti-circle-check"></i> Enviada</span>`
        : `<span class="badge badge-danger" style="display:inline-flex; align-items:center; gap:4px; font-weight:600;"><i class="ti ti-circle-x"></i> Não Enviada</span>`;

      const errorText = log.errorReason
        ? `<span class="text-danger" style="font-size:12px; font-weight:500;" title="${escapeHtml(log.errorReason)}">⚠️ ${escapeHtml(log.errorReason)}</span>`
        : `<span class="text-muted text-sm">—</span>`;

      const previewText = log.message ? escapeHtml(log.message.length > 55 ? log.message.substring(0, 55) + '...' : log.message) : (log.media ? `📎 [Mídia: ${log.media}]` : '—');
      const timeStr = log.timeFormatted || log.timestamp;
      const initials = (log.contactName || log.phone || '?').substring(0, 2).toUpperCase();

      return `
        <tr style="cursor:pointer;" onclick="LogsModule.openLogModal('${log.id}')">
          <td style="white-space:nowrap; font-size:12px; color:var(--text-secondary);">
            <i class="ti ti-clock" style="margin-right:4px;"></i> ${timeStr}
          </td>
          <td>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="inbox-avatar" style="width:28px; height:28px; font-size:11px; flex-shrink:0; border:1.5px solid ${isSuccess ? '#10b981' : '#ef4444'};">
                ${initials}
              </div>
              <div style="min-width:0;">
                <div style="font-weight:600; font-size:13px; color:var(--text-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                  ${escapeHtml(log.contactName || 'Lead')}
                </div>
                <div style="font-size:11px; color:var(--text-muted);">${escapeHtml(log.phone || '—')}</div>
              </div>
            </div>
          </td>
          <td style="font-size:12px; white-space:nowrap;">
            <span class="badge badge-ghost" style="font-size:11px;">
              <i class="ti ti-brand-whatsapp" style="color:#25d366;"></i> ${escapeHtml(log.instanceName || 'WhatsApp')}
            </span>
          </td>
          <td style="max-width:280px; font-size:12.5px; color:var(--text-secondary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${previewText}
          </td>
          <td style="white-space:nowrap;">${statusBadge}</td>
          <td style="max-width:240px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
            ${errorText}
          </td>
        </tr>
      `;
    }).join('');
  }

  async function fetchAndRenderLogs() {
    await fetchLogs();
    renderTable();
  }

  async function clearAllLogs() {
    if (_logsCache.length === 0) return;
    if (!confirm('Tem certeza que deseja apagar todo o histórico de logs de envio?')) return;

    try {
      await fetch('/api/dispatch-logs', { method: 'DELETE' });
      _logsCache = [];
      renderTable();
      if (typeof showToast === 'function') showToast('🗑️ Histórico de logs limpo.', 'info');
    } catch (err) {
      if (typeof showToast === 'function') showToast('Erro ao limpar logs: ' + err.message, 'error');
    }
  }

  function exportLogsCsv() {
    if (_logsCache.length === 0) {
      if (typeof showToast === 'function') showToast('Nenhum log para exportar.', 'warning');
      return;
    }

    const headers = ['ID', 'Horário', 'Status', 'Contato', 'Telefone', 'Linha WhatsApp', 'Mensagem', 'Motivo do Erro / Detalhes'];
    const rows = _logsCache.map(l => [
      `"${l.id}"`,
      `"${l.timeFormatted || l.timestamp}"`,
      `"${l.status === 'success' ? 'Enviada' : 'Falha no Envio'}"`,
      `"${(l.contactName || '').replace(/"/g, '""')}"`,
      `"${(l.phone || '').replace(/"/g, '""')}"`,
      `"${(l.instanceName || '').replace(/"/g, '""')}"`,
      `"${(l.message || '').replace(/"/g, '""')}"`,
      `"${(l.errorReason || '').replace(/"/g, '""')}"`
    ]);

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement('a');
    link.setAttribute('href', encodedUri);
    link.setAttribute('download', `unico_relatorio_disparos_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  function openLogModal(logId) {
    const log = _logsCache.find(l => l.id === logId);
    if (!log) return;
    _selectedLog = log;

    const modal = document.getElementById('logDetailModal');
    if (!modal) return;

    const isSuccess = log.status === 'success';

    document.getElementById('logModalTitle').innerHTML = isSuccess
      ? `<i class="ti ti-circle-check text-success" style="margin-right:6px;"></i> Detalhes do Envio (Sucesso)`
      : `<i class="ti ti-circle-x text-danger" style="margin-right:6px;"></i> Detalhes da Falha no Envio`;

    document.getElementById('logModalTime').textContent = log.timeFormatted || log.timestamp;
    document.getElementById('logModalContact').textContent = `${log.contactName} (${log.phone || 'Sem número'})`;
    document.getElementById('logModalInstance').textContent = log.instanceName || 'WhatsApp';
    
    const statusPill = document.getElementById('logModalStatus');
    if (statusPill) {
      statusPill.className = isSuccess ? 'badge badge-success' : 'badge badge-danger';
      statusPill.textContent = isSuccess ? '✅ Enviada com Sucesso' : '❌ Falha / Não Enviada';
    }

    const errorBox = document.getElementById('logModalErrorBox');
    const errorMsg = document.getElementById('logModalErrorMsg');
    if (errorBox && errorMsg) {
      if (log.errorReason) {
        errorBox.style.display = 'block';
        errorMsg.textContent = log.errorReason;
      } else {
        errorBox.style.display = 'none';
      }
    }

    const msgBox = document.getElementById('logModalMessageText');
    if (msgBox) {
      msgBox.textContent = log.message || (log.media ? `[Anexo de Mídia: ${log.media}]` : 'Mensagem vazia');
    }

    modal.classList.add('active');
  }

  function closeLogModal() {
    const modal = document.getElementById('logDetailModal');
    if (modal) modal.classList.remove('active');
  }

  async function retrySelectedLog() {
    if (!_selectedLog) return;
    closeLogModal();
    if (typeof showToast === 'function') showToast(`Reenviando para ${_selectedLog.contactName}...`, 'info');

    const phone = _selectedLog.phone;
    const text = _selectedLog.message;

    if (!phone) {
      if (typeof showToast === 'function') showToast('Número de telefone não disponível para reenvio.', 'warning');
      return;
    }

    try {
      await WhatsAppDirect.sendMessage(phone, text);
      await recordLog({
        contactName: _selectedLog.contactName,
        phone: phone,
        message: text,
        status: 'success',
        instanceName: 'Reenvio Manual',
        campaignName: 'Reenvio de Log'
      });
      if (typeof showToast === 'function') showToast(`✅ Mensagem reenviada com sucesso para ${_selectedLog.contactName}!`, 'success');
    } catch (err) {
      await recordLog({
        contactName: _selectedLog.contactName,
        phone: phone,
        message: text,
        status: 'error',
        errorReason: err.message,
        instanceName: 'Reenvio Manual',
        campaignName: 'Reenvio de Log'
      });
      if (typeof showToast === 'function') showToast(`❌ Falha no reenvio: ${err.message}`, 'error');
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  return {
    fetchLogs,
    fetchAndRenderLogs,
    recordLog,
    renderTable,
    setFilter,
    clearAllLogs,
    exportLogsCsv,
    openLogModal,
    closeLogModal,
    retrySelectedLog
  };
})();
