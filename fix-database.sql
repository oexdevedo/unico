-- 1. Cria a nova tabela sem as restrições que estavam bloqueando o CSV
CREATE TABLE IF NOT EXISTS crm_contacts (
  id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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

-- 2. Copia os seus 137 contatos antigos (da tabela profiles) para a nova tabela
INSERT INTO crm_contacts (id, name, full_name, whatsapp, phone, email, region, profession, created_at, updated_at)
SELECT id, COALESCE(name, full_name, 'Sem Nome'), full_name, whatsapp, phone, email, region, profession, created_at, updated_at
FROM profiles
ON CONFLICT (id) DO NOTHING;

-- 3. Libera o acesso para o nosso sistema
DROP POLICY IF EXISTS "Allow all for anon" ON crm_contacts;
CREATE POLICY "Allow all for anon" ON crm_contacts FOR ALL TO anon USING (true) WITH CHECK (true);

-- 4. Força a API a recarregar e enxergar a tabela imediatamente
NOTIFY pgrst, 'reload schema';
