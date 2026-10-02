-- Adiciona as colunas necessárias para separar os leads por usuário
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS owner_email TEXT;
ALTER TABLE crm_contacts ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS group_id TEXT;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'user';

-- Recarrega o cache do PostgREST (opcional)
NOTIFY pgrst, 'reload schema';
