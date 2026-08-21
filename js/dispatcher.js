/**
 * MassaZap 2.0 — Campaign Dispatcher & Queue Manager Anti-Ban
 */

const DispatcherModule = (() => {
  const logsHistory = [];

  const campaignState = {
    isRunning: false,
    isPaused: false,
    isStopped: false,
    currentIndex: 0,
    total: 0,
    successCount: 0,
    failCount: 0,
    contacts: [],
    startTime: null,
    campaignId: null
  };

  function addLog(type, message, details = null) {
    const timestamp = new Date().toLocaleTimeString('pt-BR');
    logsHistory.unshift({ timestamp, type, message, details, date: new Date().toISOString() });

    const consoleEl = document.getElementById('activityLogConsole');
    if (consoleEl) {
      const entry = document.createElement('div');
      entry.className = `log-entry log-${type}`;
      entry.innerHTML = `<span class="log-time">[${timestamp}]</span> <span class="log-msg">${message}</span>`;
      consoleEl.prepend(entry);
    }
  }

  // ========================================================================
  // DISPARO DIRETO (WhatsApp Baileys)
  // ========================================================================

  async function sendDirectTestMessage(phone, text, contactName = 'Teste') {
    addLog('info', `Enviando teste para ${phone}...`);
    const formattedNumber = SupabaseModule.formatPhone(phone) || phone;

    try {
      const result = await WhatsAppDirect.sendMessage(formattedNumber, text);
      addLog('success', `Teste enviado para ${formattedNumber}!`, { contactName, phone: formattedNumber, text });
      return { success: true, data: result };
    } catch (err) {
      addLog('error', `Falha: ${err.message}`, { contactName, phone: formattedNumber, text, error: err.message });
      return { success: false, error: err.message };
    }
  }

  async function startDirectCampaign(options) {
    const { contacts, template, minDelay, maxDelay, updateSupabase, instanceId, mediaAttachment, batchSize, batchPause } = options;

    if (!contacts?.length) throw new Error('Nenhum contato selecionado.');
    if (!template?.trim() && !mediaAttachment) throw new Error('Mensagem ou mídia é obrigatória.');

    const wsStatus = await WhatsAppDirect.fetchStatus();
    if (!wsStatus.connected) throw new Error('Nenhum WhatsApp conectado!');

    // Cria campanha no Supabase
    let campaignId = null;
    try {
      const campRes = await fetch('/api/campaigns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `Campanha ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR')}`,
          template_text: template || '',
          delay_min: minDelay || 20,
          delay_max: maxDelay || 50,
          total_contacts: contacts.length,
          instance_id: instanceId || 'round-robin',
          status: 'running'
        })
      });
      const campData = await campRes.json();
      if (campData.success) campaignId = campData.campaign.id;
    } catch (e) {
      console.warn('Não foi possível criar campanha no Supabase:', e);
    }

    campaignState.isRunning = true;
    campaignState.isPaused = false;
    campaignState.isStopped = false;
    campaignState.currentIndex = 0;
    campaignState.total = contacts.length;
    campaignState.successCount = 0;
    campaignState.failCount = 0;
    campaignState.contacts = contacts;
    campaignState.startTime = Date.now();
    campaignState.campaignId = campaignId;

    updateCampaignUI();

    const routingInfo = instanceId === 'round-robin' || !instanceId ? 'Revezamento (Round-Robin)' : `Linha: ${instanceId}`;
    const mediaTag = mediaAttachment ? ` 📁 [Mídia Anexada]` : '';
    addLog('info', `🚀 Campanha iniciada: ${contacts.length} contatos (${routingInfo})${mediaTag}`);

    const delayMin = Math.max(2, minDelay || 20);
    const delayMax = Math.max(delayMin, maxDelay || 50);

    for (let i = 0; i < contacts.length; i++) {
      if (campaignState.isStopped) { addLog('warning', 'Campanha interrompida.'); break; }

      while (campaignState.isPaused && !campaignState.isStopped) {
        await new Promise(r => setTimeout(r, 500));
      }
      if (campaignState.isStopped) break;

      campaignState.currentIndex = i;
      const contact = contacts[i];
      const targetPhone = contact.whatsapp || contact.phone;
      const parsedText = template ? TemplatesModule.parseMessage(template, contact) : '';

      const statusTitle = document.getElementById('progressStatusTitle');
      if (statusTitle) {
        statusTitle.textContent = `Enviando para ${contact.displayName || contact.name} (${i + 1}/${contacts.length})...`;
      }

      try {
        let sendResult;
        if (mediaAttachment && mediaAttachment.base64Data) {
          sendResult = await WhatsAppDirect.sendMediaMessage(targetPhone, mediaAttachment.base64Data, mediaAttachment.mimeType, parsedText, {
            instanceId,
            fileName: mediaAttachment.name || mediaAttachment.fileName,
            contactName: contact.displayName || contact.name,
            contactId: contact.id,
            campaignId,
            simulateTyping: true,
            disableLinkPreview: true
          });
        } else {
          sendResult = await WhatsAppDirect.sendMessage(targetPhone, parsedText, {
            instanceId,
            contactName: contact.displayName || contact.name,
            contactId: contact.id,
            campaignId,
            simulateTyping: true,
            disableLinkPreview: true
          });
        }

        campaignState.successCount++;

        const tag = sendResult?.instanceName ? ` [${sendResult.instanceName}]` : '';
        addLog('success', `✅ ${contact.displayName || targetPhone}${tag}`, {
          contactName: contact.displayName || contact.name, phone: targetPhone, text: parsedText
        });

        if (typeof LogsModule !== 'undefined' && LogsModule.recordLog) {
          LogsModule.recordLog({
            contactName: contact.displayName || contact.name || targetPhone,
            phone: targetPhone,
            message: parsedText,
            media: mediaAttachment?.filename || null,
            status: 'success',
            instanceName: sendResult?.instanceName || instanceId || 'WhatsApp Linha 1',
            campaignName: `Campanha ${new Date().toLocaleDateString('pt-BR')}`
          });
        }

        if (updateSupabase && contact.id) {
          try { await SupabaseModule.updateContactStatus(contact.id, 'Contatado'); } catch (e) {}
        }
      } catch (err) {
        campaignState.failCount++;
        addLog('error', `❌ ${contact.displayName || targetPhone}: ${err.message}`, {
          contactName: contact.displayName || contact.name, phone: targetPhone, text: parsedText, error: err.message
        });

        if (typeof LogsModule !== 'undefined' && LogsModule.recordLog) {
          LogsModule.recordLog({
            contactName: contact.displayName || contact.name || targetPhone,
            phone: targetPhone,
            message: parsedText,
            media: mediaAttachment?.filename || null,
            status: 'error',
            errorReason: err.message || 'Erro de envio',
            instanceName: instanceId || 'WhatsApp Linha 1',
            campaignName: `Campanha ${new Date().toLocaleDateString('pt-BR')}`
          });
        }
      }

      updateCampaignUI();

      // Delay e Pausa em Lote Anti-Ban
      if (i < contacts.length - 1 && !campaignState.isStopped) {
        // Pausa especial por lote
        if (batchSize > 0 && batchPause > 0 && (i + 1) % batchSize === 0) {
          addLog('info', `☕ Pausa de descanso anti-ban (${i + 1} disparos concluídos). Aguardando ${batchPause}s...`);
          for (let s = batchPause; s > 0; s--) {
            if (campaignState.isStopped) break;
            while (campaignState.isPaused && !campaignState.isStopped) {
              await new Promise(r => setTimeout(r, 500));
            }
            if (statusTitle) statusTitle.textContent = `☕ Pausa anti-ban por lote (${s}s restantes)...`;
            await new Promise(r => setTimeout(r, 1000));
          }
        } else {
          // Delay randômico padrão entre mensagens
          const randomDelay = Math.floor(Math.random() * (delayMax - delayMin + 1)) + delayMin;
          for (let s = randomDelay; s > 0; s--) {
            if (campaignState.isStopped) break;
            while (campaignState.isPaused && !campaignState.isStopped) {
              await new Promise(r => setTimeout(r, 500));
            }
            if (statusTitle) statusTitle.textContent = `⏳ Aguardando ${s}s (anti-bloqueio)...`;
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }

    campaignState.isRunning = false;
    updateCampaignUI();

    // Atualiza campanha no Supabase
    if (campaignId) {
      try {
        await fetch(`/api/campaigns/${campaignId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: campaignState.isStopped ? 'cancelled' : 'completed',
            total_sent: campaignState.successCount,
            total_failed: campaignState.failCount,
            completed_at: new Date().toISOString()
          })
        });
      } catch (e) {}
    }

    addLog('system', `🏁 Campanha finalizada! ${campaignState.successCount} enviadas, ${campaignState.failCount} falhas.`);
    return { success: true, total: contacts.length, sent: campaignState.successCount, failed: campaignState.failCount };
  }

  function pauseCampaign() {
    campaignState.isPaused = true;
    addLog('warning', '⏸ Campanha pausada.');
  }

  function resumeCampaign() {
    campaignState.isPaused = false;
    addLog('info', '▶ Campanha retomada.');
  }

  function stopCampaign() {
    campaignState.isStopped = true;
    campaignState.isRunning = false;
    updateCampaignUI();
    addLog('warning', '⏹ Campanha interrompida.');
  }

  function updateCampaignUI() {
    const progressBox = document.getElementById('campaignProgressBox');
    const fillEl = document.getElementById('progressBarFill');
    const pctEl = document.getElementById('progressPct');
    const countEl = document.getElementById('progressCountText');
    const successEl = document.getElementById('progressSuccessText');
    const failEl = document.getElementById('progressFailText');
    const btnStart = document.getElementById('btnStartCampaign');
    const btnPause = document.getElementById('btnPauseCampaign');
    const btnStop = document.getElementById('btnStopCampaign');
    const statusTitle = document.getElementById('progressStatusTitle');

    if (!progressBox) return;

    if (campaignState.isRunning || campaignState.total > 0) {
      progressBox.style.display = 'block';
    }

    const processed = campaignState.successCount + campaignState.failCount;
    const pct = campaignState.total > 0 ? Math.round((processed / campaignState.total) * 100) : 0;

    if (fillEl) fillEl.style.width = `${pct}%`;
    if (pctEl) pctEl.textContent = `${pct}%`;
    if (countEl) countEl.textContent = `${processed} / ${campaignState.total}`;
    if (successEl) successEl.textContent = campaignState.successCount;
    if (failEl) failEl.textContent = campaignState.failCount;

    if (campaignState.isRunning) {
      if (btnStart) btnStart.style.display = 'none';
      if (btnPause) btnPause.style.display = 'inline-flex';
      if (btnStop) btnStop.style.display = 'inline-flex';
    } else {
      if (btnStart) { btnStart.style.display = 'inline-flex'; btnStart.disabled = false; }
      if (btnPause) btnPause.style.display = 'none';
      if (btnStop) btnStop.style.display = 'none';
      if (statusTitle && processed >= campaignState.total && campaignState.total > 0) {
        statusTitle.textContent = '🏁 Campanha Concluída!';
      }
    }
  }

  function getLogs() { return logsHistory; }
  function clearLogs() { logsHistory.length = 0; }
  function getCampaignState() { return { ...campaignState }; }

  function exportLogsToCsv() {
    if (logsHistory.length === 0) return alert('Nenhum log.');
    const headers = ['Horário', 'Status', 'Contato', 'Telefone', 'Mensagem', 'Detalhes'];
    const rows = logsHistory.map(l => [
      `"${l.timestamp}"`, `"${l.type}"`,
      `"${(l.details?.contactName || '').replace(/"/g, '""')}"`,
      `"${(l.details?.phone || '').replace(/"/g, '""')}"`,
      `"${(l.details?.text || l.message || '').replace(/"/g, '""')}"`,
      `"${(l.details?.error || l.details?.response || '').replace(/"/g, '""')}"`
    ]);
    const csv = 'data:text/csv;charset=utf-8,\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csv));
    link.setAttribute('download', `massazap_relatorio_${Date.now()}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  return {
    addLog, sendDirectTestMessage, startDirectCampaign,
    pauseCampaign, resumeCampaign, stopCampaign,
    getLogs, clearLogs, exportLogsToCsv, getCampaignState
  };
})();
