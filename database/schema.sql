-- ============================================================================
-- MassaZap 2.0 — Schema SQL Completo (Supabase / PostgreSQL)
-- Projeto: Raio X | CRM WhatsApp Multi-Agentes (Multi-Tenant)
-- ============================================================================

-- ============================================================================
-- 0. EXTENSÕES NECESSÁRIAS
-- ============================================================================
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================================
-- 0.1 TABELA `accounts` — Contas do Sistema (Multi-Tenant)
-- ============================================================================
CREATE TABLE IF NOT EXISTS accounts (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  plan            TEXT DEFAULT 'basic',
  status          TEXT DEFAULT 'active',
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- 0.2 TABELA `whatsapp_instances` — Conexões de WhatsApp
-- ============================================================================
CREATE TABLE IF NOT EXISTS whatsapp_instances (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  instance_name   TEXT NOT NULL,
  status          TEXT DEFAULT 'disconnected', -- 'connected', 'disconnected', 'qr_ready'
  jid             TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_whatsapp_instances_account_id ON whatsapp_instances (account_id);

-- ============================================================================
-- 1. TABELA `crm_contacts` — Contatos do CRM
-- ============================================================================
CREATE TABLE IF NOT EXISTS crm_contacts (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id              UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  name                    TEXT NOT NULL,
  full_name               TEXT,
  whatsapp                TEXT,
  phone                   TEXT,
  email                   TEXT,
  region                  TEXT,
  profession              TEXT,
  contact_status          TEXT DEFAULT 'Novo',
  ai_mode                 TEXT DEFAULT 'autonomous',
  tags                    TEXT[] DEFAULT '{}',
  total_messages_sent     INTEGER DEFAULT 0,
  total_messages_received INTEGER DEFAULT 0,
  last_contact_at         TIMESTAMPTZ,
  created_at              TIMESTAMPTZ DEFAULT NOW(),
  updated_at              TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para consultas frequentes na tabela crm_contacts
CREATE INDEX IF NOT EXISTS idx_crm_contacts_account_id ON crm_contacts (account_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_status ON crm_contacts (contact_status);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tags ON crm_contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_ai_mode ON crm_contacts (ai_mode);

-- Constraint para garantir que o mesmo telefone não seja duplicado NA MESMA CONTA
ALTER TABLE crm_contacts ADD CONSTRAINT uq_contact_phone_per_account UNIQUE (account_id, phone);

-- ============================================================================
-- 2. TABELA `campaigns` — Registro de Campanhas de Disparo
-- ============================================================================
CREATE TABLE IF NOT EXISTS campaigns (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  name          TEXT NOT NULL,
  description   TEXT,
  template_text TEXT NOT NULL,
  
  -- Configurações Anti-Ban
  delay_min     INTEGER DEFAULT 20,      -- segundos mínimo entre envios
  delay_max     INTEGER DEFAULT 50,      -- segundos máximo entre envios
  
  -- Controle
  status        TEXT DEFAULT 'draft',     -- 'draft', 'running', 'paused', 'completed', 'cancelled'
  instance_id   UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL, -- Qual whatsapp usar
  
  -- Métricas Agregadas (atualizadas em tempo real)
  total_contacts    INTEGER DEFAULT 0,
  total_sent        INTEGER DEFAULT 0,
  total_delivered   INTEGER DEFAULT 0,
  total_read        INTEGER DEFAULT 0,
  total_replied     INTEGER DEFAULT 0,
  total_failed      INTEGER DEFAULT 0,
  
  -- Filtros usados na seleção de contatos
  filter_region     TEXT,
  filter_profession TEXT,
  filter_tags       TEXT[],
  filter_status     TEXT,
  
  -- Timestamps
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW(),
  
  -- Proprietário (user_id do Supabase Auth, se aplicável)
  user_id       UUID REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_campaigns_account_id ON campaigns (account_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns (status);
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_user_id ON campaigns (user_id);

-- ============================================================================
-- 3. TABELA `messages_log` — Log Individual de Cada Envio
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  
  -- Referências
  contact_id      UUID REFERENCES crm_contacts(id) ON DELETE SET NULL,
  campaign_id     UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  
  -- Dados do envio
  contact_name    TEXT,
  contact_phone   TEXT NOT NULL,
  template_raw    TEXT,                   -- Template original com spintax
  message_final   TEXT NOT NULL,          -- Mensagem final enviada (pós-parse)
  
  -- Instância de envio
  instance_id     UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  
  -- Status do envio
  send_status     TEXT DEFAULT 'pending', -- 'pending', 'sent', 'delivered', 'read', 'failed', 'cancelled'
  error_message   TEXT,
  whatsapp_msg_id TEXT,                   -- ID da mensagem retornada pelo Baileys
  
  -- Status de resposta
  reply_status    TEXT DEFAULT 'no_reply', -- 'no_reply', 'replied', 'replied_by_ai', 'replied_by_human'
  reply_text      TEXT,
  replied_at      TIMESTAMPTZ,
  
  -- IA
  is_ai_generated BOOLEAN DEFAULT FALSE,
  ai_agent_name   TEXT,
  ai_mode_used    TEXT,                   -- 'autonomous', 'copilot', NULL
  
  -- Métricas de tempo
  sent_at         TIMESTAMPTZ,
  delivered_at    TIMESTAMPTZ,
  read_at         TIMESTAMPTZ,
  
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Índices para queries de métricas e busca
CREATE INDEX IF NOT EXISTS idx_messages_log_account_id ON messages_log (account_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_contact_id ON messages_log (contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_campaign_id ON messages_log (campaign_id);
CREATE INDEX IF NOT EXISTS idx_messages_log_send_status ON messages_log (send_status);
CREATE INDEX IF NOT EXISTS idx_messages_log_reply_status ON messages_log (reply_status);
CREATE INDEX IF NOT EXISTS idx_messages_log_contact_phone ON messages_log (contact_phone);
CREATE INDEX IF NOT EXISTS idx_messages_log_sent_at ON messages_log (sent_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_log_created_at ON messages_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_log_instance_id ON messages_log (instance_id);

-- ============================================================================
-- 4. TABELA `ai_agents` — Configurações dos Agentes de IA
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_agents (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  agent_key       TEXT NOT NULL,       -- 'tira-duvidas', 'vendedor', 'auxiliar', custom
  name            TEXT NOT NULL,
  icon            TEXT DEFAULT '🤖',
  description     TEXT,
  
  -- AnythingLLM
  workspace_slug  TEXT NOT NULL,              -- Slug do workspace no AnythingLLM
  prompt_prefix   TEXT,                        -- System prompt / instruções do agente
  fallback_workspace TEXT DEFAULT 'meu-workspace',
  
  -- Modo padrão: 'autonomous' (responde sozinha) ou 'copilot' (apenas sugere)
  default_mode    TEXT DEFAULT 'autonomous',
  
  -- Configurações
  is_active       BOOLEAN DEFAULT TRUE,
  max_history     INTEGER DEFAULT 8,           -- Quantas mensagens de histórico enviar ao LLM
  reply_delay_min INTEGER DEFAULT 3,           -- Delay mínimo de resposta (segundos)
  reply_delay_max INTEGER DEFAULT 8,           -- Delay máximo de resposta (segundos)
  
  -- Métricas
  total_interactions  INTEGER DEFAULT 0,
  total_suggestions   INTEGER DEFAULT 0,
  avg_response_time   FLOAT DEFAULT 0,
  
  -- Timestamps
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  -- Um agente com a mesma chave só pode existir uma vez por conta
  UNIQUE(account_id, agent_key)
);

CREATE INDEX IF NOT EXISTS idx_ai_agents_account_id ON ai_agents (account_id);

-- ============================================================================
-- 5. TABELA `ai_context_files` — Arquivos .md de Contexto para IA
-- ============================================================================
CREATE TABLE IF NOT EXISTS ai_context_files (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id    UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  agent_id      UUID REFERENCES ai_agents(id) ON DELETE CASCADE,
  file_name     TEXT NOT NULL,
  file_content  TEXT NOT NULL,             -- Conteúdo Markdown completo
  file_size     INTEGER DEFAULT 0,
  description   TEXT,
  is_active     BOOLEAN DEFAULT TRUE,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_context_files_account_id ON ai_context_files (account_id);
CREATE INDEX IF NOT EXISTS idx_ai_context_files_agent_id ON ai_context_files (agent_id);

-- ============================================================================
-- 6. TABELA `conversations` — Thread de Conversa Consolidada por Contato
-- ============================================================================
CREATE TABLE IF NOT EXISTS conversations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  account_id      UUID REFERENCES accounts(id) ON DELETE CASCADE NOT NULL,
  contact_id      UUID REFERENCES crm_contacts(id) ON DELETE CASCADE,
  contact_phone   TEXT NOT NULL,
  contact_name    TEXT,
  
  -- Status do atendimento
  status          TEXT DEFAULT 'unread',    -- 'unread', 'ai_replied', 'human_replied', 'in_queue', 'closed'
  ai_enabled      BOOLEAN DEFAULT TRUE,
  assigned_agent  TEXT DEFAULT 'tira-duvidas',
  
  -- Última mensagem
  last_message    TEXT,
  last_message_at TIMESTAMPTZ,
  last_sender     TEXT,                     -- 'contact', 'human', 'ai'
  
  -- Métricas
  unread_count    INTEGER DEFAULT 0,
  total_messages  INTEGER DEFAULT 0,
  
  -- WhatsApp
  whatsapp_jid    TEXT,
  instance_id     UUID REFERENCES whatsapp_instances(id) ON DELETE SET NULL,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(account_id, contact_phone)
);

CREATE INDEX IF NOT EXISTS idx_conversations_account_id ON conversations (account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations (status);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message_at ON conversations (last_message_at DESC);

-- ============================================================================
-- 7. TRIGGER: AUTO-UPDATE `updated_at`
-- ============================================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplica o trigger em todas as tabelas
DO $$
DECLARE
  tbl TEXT;
BEGIN
  FOR tbl IN SELECT unnest(ARRAY['accounts', 'whatsapp_instances', 'crm_contacts', 'campaigns', 'messages_log', 'ai_agents', 'ai_context_files', 'conversations'])
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS set_updated_at ON %I', tbl);
    EXECUTE format(
      'CREATE TRIGGER set_updated_at BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at()',
      tbl
    );
  END LOOP;
END $$;

-- ============================================================================
-- 8. ROW LEVEL SECURITY (RLS) E MULTI-TENANCY
-- ============================================================================

-- Habilita RLS em todas as tabelas novas
ALTER TABLE accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE crm_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_context_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

-- Exemplo de Policies baseadas na Conta (account_id)
-- NOTA: Em produção, o ideal é pegar o account_id vinculado ao JWT (auth.uid()) ou nos claims.
-- Como esta é uma adaptação rápida para anon permitindo multi-tenant caso o backend forneça a segurança:
CREATE POLICY "Allow all for anon" ON accounts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON whatsapp_instances FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON crm_contacts FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON campaigns FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON messages_log FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ai_agents FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON ai_context_files FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for anon" ON conversations FOR ALL USING (true) WITH CHECK (true);

-- ============================================================================
-- 9. VIEWS ÚTEIS PARA DASHBOARD (ATUALIZADAS PARA MULTI-TENANT)
-- ============================================================================

-- Vista: Métricas resumidas por campanha e conta
CREATE OR REPLACE VIEW campaign_metrics AS
SELECT
  c.account_id,
  c.id,
  c.name,
  c.status,
  c.total_contacts,
  c.created_at,
  c.started_at,
  c.completed_at,
  COUNT(ml.id) AS logged_messages,
  COUNT(ml.id) FILTER (WHERE ml.send_status = 'sent') AS count_sent,
  COUNT(ml.id) FILTER (WHERE ml.send_status = 'delivered') AS count_delivered,
  COUNT(ml.id) FILTER (WHERE ml.send_status = 'read') AS count_read,
  COUNT(ml.id) FILTER (WHERE ml.send_status = 'failed') AS count_failed,
  COUNT(ml.id) FILTER (WHERE ml.reply_status != 'no_reply') AS count_replied,
  CASE WHEN COUNT(ml.id) > 0
    THEN ROUND((COUNT(ml.id) FILTER (WHERE ml.reply_status != 'no_reply')::NUMERIC / COUNT(ml.id)) * 100, 1)
    ELSE 0
  END AS reply_rate_pct
FROM campaigns c
LEFT JOIN messages_log ml ON ml.campaign_id = c.id
GROUP BY c.account_id, c.id;

-- Vista: Engajamento por profissão e conta
CREATE OR REPLACE VIEW engagement_by_profession AS
SELECT
  p.account_id,
  p.profession,
  COUNT(DISTINCT p.id) AS total_contacts,
  COUNT(ml.id) AS total_messages,
  COUNT(ml.id) FILTER (WHERE ml.reply_status != 'no_reply') AS total_replied,
  CASE WHEN COUNT(ml.id) > 0
    THEN ROUND((COUNT(ml.id) FILTER (WHERE ml.reply_status != 'no_reply')::NUMERIC / COUNT(ml.id)) * 100, 1)
    ELSE 0
  END AS reply_rate_pct
FROM crm_contacts p
LEFT JOIN messages_log ml ON ml.contact_id = p.id
WHERE p.profession IS NOT NULL AND p.profession != ''
GROUP BY p.account_id, p.profession
ORDER BY reply_rate_pct DESC;

-- Vista: Engajamento por região e conta
CREATE OR REPLACE VIEW engagement_by_region AS
SELECT
  p.account_id,
  COALESCE(p.region, 'Não informado') AS region,
  COUNT(DISTINCT p.id) AS total_contacts,
  COUNT(ml.id) AS total_messages,
  COUNT(ml.id) FILTER (WHERE ml.reply_status != 'no_reply') AS total_replied,
  CASE WHEN COUNT(ml.id) > 0
    THEN ROUND((COUNT(ml.id) FILTER (WHERE ml.reply_status != 'no_reply')::NUMERIC / COUNT(ml.id)) * 100, 1)
    ELSE 0
  END AS reply_rate_pct
FROM crm_contacts p
LEFT JOIN messages_log ml ON ml.contact_id = p.id
GROUP BY p.account_id, region
ORDER BY reply_rate_pct DESC;

-- ============================================================================
-- FIM DO SCHEMA
-- ============================================================================
