# Manual do Sistema - Unico CRM

Bem-vindo ao manual oficial do **Unico CRM**, uma plataforma unificada para automação de WhatsApp, disparos em massa, gestão de leads e atendimento integrado com Inteligência Artificial.

---

## 1. Visão Geral

O Unico CRM foi desenhado para equipes que precisam de agilidade e escalabilidade no WhatsApp. O sistema permite conectar múltiplos números de WhatsApp, realizar envios em massa de forma inteligente (anti-bloqueio), gerenciar contatos e criar robôs (agentes de IA) personalizados.

### 1.1 Arquitetura Básica
- **Frontend:** HTML5, CSS3 (Design System próprio), JavaScript puro.
- **Backend:** Node.js (sem frameworks pesados, rodando via `server.js`).
- **Banco de Dados (Leads):** Integração com Supabase (PostgreSQL).
- **Integração WhatsApp:** Biblioteca Baileys (Multi-Device).
- **Inteligência Artificial:** Integração com Anything LLM.
- **Armazenamento de Dados Locais:** Arquivos `.json` na raiz (`users.json`, `whatsapp_instances.json`, etc).

---

## 2. Acesso e Autenticação

A tela de login possui um design "split-screen" moderno e seguro.

- **Login:** Requer e-mail e senha cadastrados.
- **Criar Conta:** Acesso restrito para e-mails do domínio `@exdevedor.com.br` (a menos que o usuário seja criado manualmente pelo administrador).
- **Recuperação de Senha:** É feita de forma segura verificando simultaneamente o E-mail e o número de WhatsApp cadastrado. Se ambos baterem, o sistema permite redefinir a senha imediatamente.

---

## 3. Módulos do Painel (Dashboard)

Ao fazer login, você terá acesso a quatro abas principais no menu esquerdo:

### 3.1. 🚀 Disparo em Massa
Módulo responsável pelo envio de mensagens em lote.
- **Mensagem:** Área para digitar o texto que será enviado. Suporta anexos de arquivos de mídia (imagens, áudios `.ogg` simulando gravados na hora, e documentos).
- **Filtros de Envio:** Você pode selecionar a base de contatos (Supabase), filtrar por Tags, ou subir uma planilha manual.
- **Mecanismo Anti-Bloqueio (Spam Shield):** O sistema introduz intervalos aleatórios entre os envios (ex: 2 a 5 segundos) e alterna automaticamente entre as diferentes conexões (instâncias) de WhatsApp cadastradas para não sobrecarregar um único número.
- **Console ao Vivo:** Acompanhe em tempo real o status de entrega para cada lead.

### 3.2. 👥 Base de Leads
Gestão completa dos seus contatos integrados ao Supabase.
- **Visualização de Contatos:** Tabela com nome, telefone, tags e data de criação.
- **Limpeza de Duplicados:** O sistema possui um botão inteligente capaz de varrer o banco de dados e mesclar ou remover números duplicados automaticamente.

### 3.3. 🤖 Agentes de IA
Crie assistentes virtuais personalizados alimentados pelo Anything LLM.
- **Lista de Agentes:** Visualize todos os agentes ativos.
- **Novo Agente:** Permite cadastrar um novo robô definindo:
  - Nome e Avatar/Ícone.
  - Cor do Tema.
  - **Instruções de Comportamento (Prompt):** Defina exatamente como a IA deve agir (ex: tom de voz de vendas, suporte técnico, etc).
- Esses agentes podem ser atribuídos a diferentes instâncias de WhatsApp para responder clientes de forma autônoma.

### 3.4. ⚙️ Configurações & Conexões
O coração do sistema. Gerencie todas as integrações aqui:
- **Instâncias WhatsApp (Baileys):** Adicione novas linhas de WhatsApp escaneando o QR Code diretamente na tela. O sistema suporta múltiplas conexões simultâneas.
- **Supabase:** Insira a URL e a Anon Key do seu projeto Supabase para sincronizar a Base de Leads.
- **Anything LLM:** Configure a URL do seu servidor LLM e a Chave de API para dar inteligência aos Agentes.
- **Gerenciamento de Usuários:** Formulário administrativo para criar novos usuários manualmente, **ignorando a restrição de domínio** (qualquer e-mail pode ser cadastrado por este menu).

---

## 4. Iniciando o Servidor

Para iniciar o CRM no seu ambiente local ou VPS:

1. Instale as dependências:
   ```bash
   npm install
   ```
2. Inicie o servidor:
   ```bash
   npm start
   ```
3. O painel estará disponível em: `http://localhost:4444`

---

## 5. Estrutura de Diretórios Importantes

- `server.js`: Servidor principal Node.js. Cuida das rotas da API, serve arquivos estáticos e gerencia instâncias do WhatsApp.
- `login.html` e `index.html`: Telas do sistema.
- `js/`: Lógica do frontend (`app.js` controla a interface, `auth.js` gerencia login).
- `css/design-system.css`: Arquivo único com todo o design, sistema de grid, cores e estilo dos componentes.
- `auth_instances/`: Onde o Baileys salva as chaves criptográficas de cada conexão do WhatsApp (não apague essa pasta para não derrubar as conexões).
- `users.json`: Banco de dados local de autenticação dos operadores do painel.

---
*Manual gerado para a versão 2.0 do Unico CRM.*
