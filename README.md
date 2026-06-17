# adStudioAI

SaaS completo de marketing com IA para geração de vídeos, automação de leads e integração com Meta (Instagram Graph API e Marketing API).

## 🎯 Visão Geral

**adStudioAI** é uma plataforma SaaS de última geração que combina:
- 🎬 **Studio de Criação**: Gerador de vídeos com IA para marketing
- 🤖 **Automação de Leads**: Captura e qualificação automática via Instagram
- 📊 **Dashboard Inteligente**: Métricas e analytics em tempo real
- 🔗 **Integração Meta**: Conexão completa com Facebook/Instagram

## Stack Tecnológico

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python 3.11 + FastAPI + Async/Await |
| Banco | PostgreSQL 17 + SQLAlchemy Async + asyncpg |
| Frontend | React 18 + TypeScript + Vite + Tailwind CSS |
| API HTTP | Axios com baseURL `/api/v1` |
| Proxy | Nginx Alpine (serve assets + proxy reverso) |
| Container | Docker + Docker Compose |
| Autenticação | OAuth Meta (Facebook/Instagram) |

## 📁 Estrutura do Projeto

```
app-marketing/
├── docker-compose.yml                # Orquestração local (3 containers)
├── backend/
│   ├── Dockerfile                    # Multi-stage Python
│   ├── requirements.txt               # Dependências
│   └── app/
│       ├── main.py                   # FastAPI app com CORS + lifespan
│       ├── core/
│       │   ├── config.py             # Pydantic Settings (variáveis de env)
│       │   └── database.py           # Async SQLAlchemy engine
│       ├── models/
│       │   ├── account.py            # Contas Meta (OAuth)
│       │   ├── lead.py               # Leads capturados
│       │   ├── automation.py         # Config de automação
│       │   └── video.py              # Histórico de vídeos gerados
│       ├── routes/
│       │   ├── auth.py               # OAuth Meta login/callback
│       │   ├── webhook.py            # Webhook Meta (verify + receive)
│       │   ├── automation.py         # Config de automações
│       │   ├── dashboard.py          # Dados agregados (GET /dashboard)
│       │   ├── leads.py              # CRUD de leads
│       │   ├── accounts.py           # CRUD de contas
│       │   ├── automations.py        # CRUD de automações
│       │   └── studio.py             # Geração de vídeos com IA
│       └── schemas/
│           ├── auth.py               # Schemas de autenticação
│           └── automation.py         # Schemas de automação
└── frontend/
    ├── Dockerfile                    # Multi-stage Node → Nginx
    ├── nginx.conf                    # Configuração Nginx com proxy
    ├── package.json                  # Deps: React, TypeScript, Tailwind
    ├── vite.config.ts               # Vite com HMR
    ├── tailwind.config.js           # Tema customizado
    ├── tsconfig.json
    └── src/
        ├── main.tsx
        ├── App.tsx                   # Rotas (/, /login, /onboarding, /app/*)
        ├── components/
        │   ├── Layout.tsx            # Layout com Sidebar + Outlet
        │   └── Sidebar.tsx           # Navegação principal (6 menu items)
        ├── pages/
        │   ├── Landing.tsx           # Marketing + planos
        │   ├── Login.tsx             # Login + "Escolher Plano" button
        │   ├── Onboarding.tsx        # Seleção de plano (4 etapas)
        │   ├── Dashboard.tsx         # Analytics e métricas
        │   ├── Studio.tsx            # 🆕 Gerador de vídeos (6 etapas)
        │   ├── ConexaoMeta.tsx       # Conectar Facebook/Instagram
        │   ├── Automacao.tsx         # Configurar automação
        │   ├── Leads.tsx             # Listagem de leads
        │   └── Configuracoes.tsx     # Configurações da conta
        ├── services/
        │   └── api.ts                # Axios com baseURL `/api/v1`
        └── types/
            └── index.ts              # TypeScript types
```

## 🚀 Como Rodar Localmente

### Pré-requisitos

- Docker e Docker Compose instalados
- Git

### Setup Rápido

```bash
# 1. Clone/entre no projeto
cd app-marketing

# 2. Crie arquivo de ambiente (opcional para dev local)
cp backend/.env.example backend/.env

# 3. Recrie e suba tudo
docker compose down && docker compose up --build -d

# 4. Aguarde ~10s para os containers ficarem healthy
docker compose ps
```

### Acessos

| Serviço | URL |
|---------|-----|
| Frontend (Landing) | http://localhost:5173 |
| Frontend (Login) | http://localhost:5173/login |
| Frontend (Onboarding) | http://localhost:5173/onboarding |
| Frontend (App) | http://localhost:5173/app |
| Frontend (Studio) | http://localhost:5173/app/studio |
| Backend API | http://localhost:5173/api/v1/* |
| Backend Docs (Swagger) | http://localhost:8000/docs |

### Verificar Health

```bash
# Ver status dos containers
docker compose ps

# Logs do backend
docker compose logs -f backend

# Logs do frontend
docker compose logs -f frontend
```

## 📡 API - Endpoints

### Autenticação

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/auth/meta/login` | Gera URL de OAuth do Facebook |
| GET | `/api/v1/auth/meta/callback?code=...` | Troca código por token e salva conta |

### Webhook Meta

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/webhook/meta` | Verificação do webhook (hub.mode, hub.verify_token, hub.challenge) |
| POST | `/api/v1/webhook/meta` | Receber eventos (comments, messaging) |

### Dashboard

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/dashboard` | Dados agregados (leads, clientes, faturamento, conversão) |

### Studio de Criação (🆕 Gerador de Vídeos com IA)

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/v1/studio/analyze-image` | Analisa imagem com Claude Vision → sugestões de prompts |
| POST | `/api/v1/studio/generate-video` | Gera vídeo com IA → retorna job_id |
| GET | `/api/v1/studio/generation-status/{job_id}` | Verifica progresso da geração e URL final |
| POST | `/api/v1/studio/publish-video` | Publica vídeo no Instagram |

**Observação**: Endpoints de Studio são placeholders. Futuras integrações:
- **Análise de Imagem**: Claude Vision API
- **Geração**: Runway / Kling / Pika (com BullMQ job queue)
- **Publicação**: Instagram Graph API

### Leads

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/leads` | Listar todos os leads |
| GET | `/api/v1/leads/{id}` | Detalhe do lead |
| PUT | `/api/v1/leads/{id}` | Atualizar lead |
| DELETE | `/api/v1/leads/{id}` | Remover lead |

### Contas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/v1/accounts` | Listar contas Meta conectadas |
| GET | `/api/v1/accounts/{id}` | Detalhe da conta |
| PUT | `/api/v1/accounts/{id}` | Atualizar conta |
| DELETE | `/api/v1/accounts/{id}` | Remover conta |

### Automações

| Método | Rota | Descrição |
|--------|------|-----------|
| POST | `/api/v1/automation/config` | Salvar configuração de automação |
| GET | `/api/v1/automations` | Listar configurações |
| GET | `/api/v1/automations/{id}` | Detalhe da configuração |
| PUT | `/api/v1/automations/{id}` | Atualizar configuração |
| DELETE | `/api/v1/automations/{id}` | Remover configuração |

## 🗄️ Modelos do Banco

### Account
Conta Meta conectada via OAuth.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| brand_name | String | Nome da marca |
| meta_page_id | String | ID da página do Facebook |
| meta_page_name | String | Nome da página |
| meta_access_token | Text | Token de acesso de longa duração |
| is_active | Boolean | Se a conta está ativa |
| created_at | DateTime | Data de criação |

### Lead
Lead capturado via Instagram.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada (FK) |
| name | String | Nome do lead |
| instagram_handle | String | @ do Instagram |
| email | String | Email |
| phone | String | Telefone |
| source | Enum | Origem (instagram_comment, instagram_dm, instagram_form, manual) |
| status | Enum | Status no funil (new, contacted, qualified, converted, lost) |
| captured_at | DateTime | Data de captura |
| updated_at | DateTime | Última atualização |

### Automation / AutomationConfig
Configuração de automação por palavra-chave.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada (FK) |
| keyword | String | Palavra-chave para ativar automação |
| auto_reply_message | Text | Mensagem de resposta automática |
| is_active | Boolean | Se a automação está ativa |
| created_at | DateTime | Data de criação |

### Video (🆕 Studio)
Histórico de vídeos gerados no Studio.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada (FK) |
| image_url | String | URL da imagem de entrada |
| prompt | Text | Prompt do usuário |
| duration | String | Duração (5s, 10s, 15s, 30s) |
| format | String | Formato (9:16, 1:1, 16:9) |
| style | String | Estilo da geração |
| video_url | String | URL do vídeo final |
| status | Enum | Status (pending, processing, completed, failed) |
| published | Boolean | Se foi publicado no Instagram |
| created_at | DateTime | Data de criação |
| updated_at | DateTime | Última atualização |
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada (FK) |
| name | String | Nome do cliente |
| email | String | Email |
| phone | String | Telefone |
| instagram_handle | String | @ do Instagram |
| lead_id | UUID | Lead de origem (FK) |

### Sale
Venda registrada para um cliente.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada (FK) |
| customer_id | UUID | Cliente relacionado (FK) |
| amount | Float | Valor da venda |
| description | Text | Descrição |
| status | String | Status (completed, pending, cancelled) |
| sold_at | DateTime | Data da venda |

## 🔐 Variáveis de Ambiente

```env
# Database (PostgreSQL)
DATABASE_URL=postgresql+asyncpg://marketing_user:marketing_pass@postgres:5432/adstudioai

# Meta OAuth (Facebook/Instagram)
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_REDIRECT_URI=http://localhost:8000/api/v1/auth/meta/callback
META_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token

# Security
SECRET_KEY=change_this_to_a_random_secret_key
CORS_ORIGINS=["http://localhost:5173"]

# Future: IA APIs
# CLAUDE_API_KEY=sk-ant-...
# RUNWAY_API_KEY=...
# INSTAGRAM_ACCESS_TOKEN=...
```

## 🎬 Fluxo de UI

### Página de Login
```
Landing Page
    ↓
[Escolher Plano] → /onboarding (seleção de plano)
[Entrar]        → /login (login)
```

### Página de Onboarding
4 etapas responsivas:
1. Escolher plano
2. Dados da empresa
3. Conectar Meta (OAuth)
4. Configurar automação

→ Redireciona para `/app` (Dashboard)

### App Authenticated (com Sidebar)
Menu de Navegação:
1. 📊 **Dashboard** - Métricas e analytics
2. 🎬 **Studio de Criação** - Gerador de vídeos (6 etapas)
3. 🔗 **Conexão Meta** - Conectar/gerenciar conta
4. ⚙️ **Automação** - Configurar automações de leads
5. 👥 **Leads** - Listar e gerenciar leads
6. ⚡ **Configurações** - Dados da conta

### Studio de Criação (6 Etapas)
```
1. Upload Media
   ↓ (Drag-drop ou file select: JPG/PNG/WebP até 10MB)
2. Prompt
   ↓ (Claude Vision gera sugestões, usuário edita)
3. Config
   ↓ (Duração, Formato, Estilo)
4. Generating
   ↓ (Progress bar animado, 30-90s)
5. Result
   ↓ (Player + Download/Refine/Publish)
6. Publish
   ↓ (Caption, hashtags, tipo de publicação)
```

## 📦 Próximos Passos

### Priority 1: Integrações de IA
- [ ] **Claude Vision API** para análise de imagem no Studio
  - Endpoint: `POST /api/v1/studio/analyze-image`
  - Gerar prompts inteligentes baseado na imagem
  
- [ ] **Video Generation API** (Runway / Kling / Pika)
  - Endpoint: `POST /api/v1/studio/generate-video`
  - Implementar BullMQ job queue para processamento assíncrono
  - Webhook callbacks para atualizar status

### Priority 2: Instagram Integration
- [ ] **Instagram Graph API** para publicação de vídeos
  - Endpoint: `POST /api/v1/studio/publish-video`
  - OAuth token refresh e validação

### Priority 3: Real-time Updates
- [ ] **WebSocket** para live generation progress
  - Substituir polling por conexão WebSocket
  - Notificações em tempo real

### Priority 4: Database + Persistência
- [ ] Implementar modelos `Video` e `Customer` no banco
- [ ] CRUD endpoints para histórico de vídeos
- [ ] Tracking de créditos/quotas por plano

## 🚀 Deploy

### Docker Compose (Local)
```bash
docker compose up --build -d
```

### Production (Future)
- Kubernetes manifests
- CI/CD pipeline (GitHub Actions)
- Nginx + SSL
- Backup automático de PostgreSQL

## 📝 Configuração do Meta for Developers

1. Crie um App em https://developers.facebook.com
2. Adicione o produto **Instagram Graph API**
3. Configure o redirect OAuth para `http://localhost:8000/api/v1/auth/meta/callback`
4. Gere tokens e adicione ao arquivo `.env`
5. Ative o modo "Em Desenvolvimento" para testes locais
5. No Webhook, configure a URL de callback para `http://SEU_IP/api/v1/webhook/meta` (use ngrok para ambiente local)
6. Defina o token de verificação igual ao `META_WEBHOOK_VERIFY_TOKEN`
7. Inscreva-se nos campos: `comments`, `messaging`

## Próximos Passos

- [ ] Autenticação JWT com login real
- [ ] Gráficos no Dashboard (Recharts)
- [ ] Migrações Alembic
- [ ] Testes (pytest backend, Vitest frontend)
- [ ] Deploy em produção (ECS / Kubernetes)
