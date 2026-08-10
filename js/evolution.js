/**
 * MassaZap Pro - Evolution API Connector Module
 */

const EvolutionModule = (() => {
  const STORAGE_KEYS = {
    URL: 'massazap_evolution_url',
    KEY: 'massazap_evolution_key',
    INSTANCE: 'massazap_evolution_instance'
  };

  /**
   * Obtém as configurações salvas ou padrão
   */
  function getConfig() {
    return {
      url: (localStorage.getItem(STORAGE_KEYS.URL) || 'http://localhost:8080').replace(/\/+$/, ''),
      apiKey: localStorage.getItem(STORAGE_KEYS.KEY) || '',
      instance: localStorage.getItem(STORAGE_KEYS.INSTANCE) || 'raiox'
    };
  }

  /**
   * Salva as configurações no LocalStorage
   */
  function saveConfig(url, apiKey, instance) {
    if (url) localStorage.setItem(STORAGE_KEYS.URL, url.replace(/\/+$/, ''));
    if (apiKey !== undefined) localStorage.setItem(STORAGE_KEYS.KEY, apiKey.trim());
    if (instance) localStorage.setItem(STORAGE_KEYS.INSTANCE, instance.trim());
  }

  /**
   * Cabeçalhos padrão para a Evolution API
   */
  function getHeaders(customKey) {
    const key = customKey !== undefined ? customKey : getConfig().apiKey;
    const headers = {
      'Content-Type': 'application/json'
    };
    if (key) {
      headers['apikey'] = key;
    }
    return headers;
  }

  /**
   * Faz requisição segura usando o proxy local para contornar CORS e tratar respostas vazias/não-JSON
   */
  async function makeRequest(targetUrl, method = 'GET', bodyData = null) {
    const headers = getHeaders();

    // Tenta via Proxy Local (/api/proxy) para contornar CORS
    try {
      const proxyRes = await fetch('/api/proxy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: targetUrl,
          method: method,
          headers: headers,
          data: bodyData
        })
      });

      const proxyText = await proxyRes.text();
      let proxyData = {};
      try {
        proxyData = proxyText ? JSON.parse(proxyText) : {};
      } catch (e) {
        proxyData = { raw: proxyText };
      }

      return {
        status: proxyRes.status,
        ok: proxyRes.ok,
        data: proxyData
      };
    } catch (proxyErr) {
      console.warn('Proxy local falhou, tentando requisição direta:', proxyErr);

      // Fallback: Requisição Direta no Navegador
      try {
        const fetchOptions = {
          method: method,
          headers: headers
        };
        if (bodyData && method !== 'GET') {
          fetchOptions.body = JSON.stringify(bodyData);
        }

        const directRes = await fetch(targetUrl, fetchOptions);
        const directText = await directRes.text();
        let directData = {};
        try {
          directData = directText ? JSON.parse(directText) : {};
        } catch (e) {
          directData = { raw: directText };
        }

        return {
          status: directRes.status,
          ok: directRes.ok,
          data: directData
        };
      } catch (directErr) {
        return {
          status: 0,
          ok: false,
          data: { error: directErr.message }
        };
      }
    }
  }

  /**
   * Formata mensagem de erro amigável
   */
  function parseErrorMessage(status, data, defaultMsg = 'Falha na comunicação com a Evolution API') {
    if (!data) return `${defaultMsg} (HTTP ${status})`;

    if (data.error && typeof data.error === 'string') return data.error;
    if (data.message) {
      if (Array.isArray(data.message)) return data.message.join(', ');
      if (typeof data.message === 'string') return data.message;
      if (typeof data.message === 'object') return JSON.stringify(data.message);
    }
    if (data.response?.message) {
      if (Array.isArray(data.response.message)) return data.response.message.join(', ');
      return String(data.response.message);
    }

    if (status === 404) {
      const { instance, url } = getConfig();
      return `Instância "${instance}" não encontrada na Evolution API ou URL incorreta (${url}). Verifique na aba Configurações.`;
    }
    if (status === 401 || status === 403) {
      return `Chave de API (apikey) inválida ou não autorizada (HTTP ${status}). Configure a chave na aba Configurações.`;
    }
    if (status === 0 || status === 502) {
      const { url } = getConfig();
      return `Não foi possível conectar ao servidor da Evolution API em "${url}". Verifique se a URL está correta na aba Configurações.`;
    }

    return `${defaultMsg} (HTTP ${status})`;
  }

  /**
   * Verifica o status da conexão da instância
   */
  async function checkConnectionState() {
    const { url, apiKey, instance } = getConfig();

    if (!url || !instance) {
      return { connected: false, state: 'NOT_CONFIGURED', message: 'URL ou Instância não configuradas' };
    }

    try {
      const targetUrl = `${url}/instance/connectionState/${instance}`;
      const res = await makeRequest(targetUrl, 'GET');

      if (!res.ok) {
        // Tenta fallback para /instance/fetchInstances
        const fallbackRes = await makeRequest(`${url}/instance/fetchInstances`, 'GET');

        if (fallbackRes.ok && Array.isArray(fallbackRes.data)) {
          const target = fallbackRes.data.find(i => i.instance?.instanceName === instance || i.name === instance);
          if (target) {
            const state = target.instance?.status || target.connectionStatus || 'open';
            const isConn = state === 'open' || state === 'CONNECTED';
            return {
              connected: isConn,
              state: state,
              message: isConn ? 'WhatsApp Conectado' : `Status: ${state}`
            };
          }
        }

        const errorMsg = parseErrorMessage(res.status, res.data, 'Instância desconectada ou não encontrada');
        return {
          connected: false,
          state: 'ERROR',
          message: errorMsg
        };
      }

      const data = res.data;
      const state = data.instance?.state || data.state || (data.connectionStatus ? data.connectionStatus : 'unknown');
      const isConnected = state === 'open' || state === 'CONNECTED' || state === 'connecting';

      return {
        connected: isConnected,
        state: state,
        data: data,
        message: isConnected ? 'WhatsApp Conectado' : `Status: ${state}`
      };
    } catch (err) {
      console.warn('Erro ao verificar status da Evolution API:', err);
      return {
        connected: false,
        state: 'DISCONNECTED',
        error: err.message,
        message: 'Servidor Evolution inacessível ou offline'
      };
    }
  }

  /**
   * Busca o QR Code da instância para conexão do aparelho
   */
  async function fetchQrCode() {
    const { url, instance } = getConfig();

    if (!url || !instance) {
      throw new Error('Configure a URL e o Nome da Instância na aba Configurações.');
    }

    const targetUrl = `${url}/instance/connect/${instance}`;
    const res = await makeRequest(targetUrl, 'GET');

    if (!res.ok) {
      throw new Error(parseErrorMessage(res.status, res.data, 'Erro ao buscar QR Code'));
    }

    const data = res.data;
    const base64 = data.base64 || data.qrcode?.base64 || data.code;
    const pairingCode = data.pairingCode || data.pairing_code;

    return {
      base64: base64,
      pairingCode: pairingCode,
      state: data.instance?.state || 'QRCODE',
      fullData: data
    };
  }

  /**
   * Envia uma mensagem de texto simples pelo WhatsApp
   */
  async function sendTextMessage(phone, text, simulateTyping = true) {
    const { url, apiKey, instance } = getConfig();

    if (!url || !instance) {
      throw new Error('Configure a URL e a Instância da Evolution API na aba Configurações.');
    }

    // Normaliza número (adiciona 55 se necessário)
    let formattedNumber = SupabaseModule.formatPhone(phone);
    if (!formattedNumber) {
      formattedNumber = String(phone).replace(/\D/g, '');
      if (formattedNumber.length === 10 || formattedNumber.length === 11) {
        formattedNumber = '55' + formattedNumber;
      }
    }

    if (!formattedNumber || formattedNumber.length < 10) {
      throw new Error(`Número de WhatsApp inválido: ${phone}`);
    }

    const payload = {
      number: formattedNumber,
      text: text,
      delay: simulateTyping ? 1200 : 0,
      linkPreview: true
    };

    const targetUrl = `${url}/message/sendText/${instance}`;
    const res = await makeRequest(targetUrl, 'POST', payload);

    if (!res.ok) {
      const errorDetail = parseErrorMessage(res.status, res.data, 'Erro ao enviar mensagem via Evolution API');
      return {
        success: false,
        error: errorDetail,
        number: formattedNumber,
        status: res.status,
        data: res.data
      };
    }

    return {
      success: true,
      data: res.data,
      number: formattedNumber
    };
  }

  return {
    getConfig,
    saveConfig,
    checkConnectionState,
    fetchQrCode,
    sendTextMessage
  };
})();
