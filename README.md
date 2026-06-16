# adStudioAI

SaaS de automação de marketing e captação de leads integrado com as APIs da Meta (Instagram Graph API e Marketing API).

## Stack

| Camada | Tecnologia |
|--------|-----------|
| Backend | Python 3.11 + FastAPI |
| Banco | PostgreSQL 17 + SQLAlchemy Async + asyncpg |
| Frontend | React 19 + Vite + Tailwind CSS |
| Proxy | Nginx (frontend serve assets e faz proxy reverso) |
| Container | Docker + Docker Compose |

## Estrutura do Projeto

```
app-marketing/
├── docker-compose.yml          # Orquestração local
├── backend/
│   ├── Dockerfile               # Multi-stage (build + runtime)
│   ├── requirements.txt
│   ├── .env.example
│   └── app/
│       ├── main.py              # FastAPI app + CORS + lifespan
│       ├── core/
│       │   ├── config.py        # Pydantic Settings (env vars)
│       │   └── database.py      # Async engine + session
│       ├── models/
│       │   ├── account.py       # Contas Meta conectadas
│       │   ├── lead.py          # Leads capturados
│       │   └── automation.py    # AutomationConfig, Customer, Sale
│       ├── routes/
│       │   ├── auth.py          # OAuth Meta (login + callback)
│       │   ├── webhook.py       # Webhook da Meta (GET verify + POST receive)
│       │   ├── automation.py    # POST /automation/config
│       │   ├── dashboard.py     # GET /dashboard (dados agregados)
│       │   ├── leads.py         # CRUD leads
│       │   ├── accounts.py      # CRUD contas
│       │   └── automations.py   # CRUD automações
│       └── schemas/
│           ├── auth.py
│           ├── automation.py
│           └── __init__.py      # Schemas compartilhados + DashboardResponse
└── frontend/
    ├── Dockerfile               # Multi-stage (Node build + Nginx)
    ├── nginx.conf               # Proxy reverso /api/ -> backend
    ├── package.json
    ├── tailwind.config.js
    ├── vite.config.ts
    ├── tsconfig.json
    ├── index.html
    └── src/
        ├── main.tsx
        ├── App.tsx              # Rotas (/, /login, /app/*)
        ├── index.css
        ├── components/
        │   ├── Layout.tsx       # Sidebar + Outlet
        │   └── Sidebar.tsx      # Navegação interna
        ├── pages/
        │   ├── Landing.tsx      # Página inicial (marketing + planos)
        │   ├── Login.tsx        # Tela de login
        │   ├── Dashboard.tsx    # Dashboard de clientes e faturamento
        │   ├── ConexaoMeta.tsx  # Conectar conta Facebook/Instagram
        │   ├── Automacao.tsx    # Configurar automação de leads
        │   ├── Leads.tsx        # Listagem de leads
        │   └── Configuracoes.tsx
        ├── services/
        │   └── api.ts           # Axios centralizado
        └── types/
            └── index.ts
```

## Como Rodar

### Pré-requisitos

- Docker e Docker Compose instalados

### Passo a passo

```bash
# 1. Entre na pasta do projeto
cd app-marketing

# 2. Crie o arquivo de ambiente
cp backend/.env.example backend/.env

# 3. Edite o .env com suas credenciais da Meta
#    META_APP_ID, META_APP_SECRET, META_WEBHOOK_VERIFY_TOKEN

# 4. Suba tudo
docker compose up --build
```

### Acessos

| Serviço | URL |
|---------|-----|
| Frontend (Landing) | http://localhost:5173 |
| Frontend (App) | http://localhost:5173/app |
| Login | http://localhost:5173/login |
| Backend API | http://localhost:5173/api |
| Swagger | http://localhost:8000/docs |
| Health Check | http://localhost:5173/health |

## API - Endpoints

### Autenticação Meta

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

## Modelos do Banco

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

### Lead
Lead capturado via Instagram.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada |
| name | String | Nome do lead |
| instagram_handle | String | @ do Instagram |
| email | String | Email |
| phone | String | Telefone |
| source | Enum | Origem (instagram_comment, instagram_dm, instagram_form, manual) |
| status | Enum | Status no funil (new, contacted, qualified, converted, lost) |
| captured_at | DateTime | Data de captura |

### AutomationConfig
Configuração de automação por palavra-chave.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada |
| keyword | String | Palavra-chave para ativar automação |
| auto_reply_message | Text | Mensagem de resposta automática |
| is_active | Boolean | Se a automação está ativa |

### Customer
Cliente convertido a partir de um lead.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada |
| name | String | Nome do cliente |
| email | String | Email |
| phone | String | Telefone |
| instagram_handle | String | @ do Instagram |
| lead_id | UUID | Lead de origem |

### Sale
Venda registrada para um cliente.

| Campo | Tipo | Descrição |
|-------|------|-----------|
| id | UUID | Identificador único |
| account_id | UUID | Conta relacionada |
| customer_id | UUID | Cliente relacionado |
| amount | Float | Valor da venda |
| description | Text | Descrição |
| status | String | Status (completed, pending, cancelled) |
| sold_at | DateTime | Data da venda |

## Variáveis de Ambiente

```env
# PostgreSQL
DATABASE_URL=postgresql+asyncpg://marketing_user:marketing_pass@postgres:5432/app_marketing

# Meta OAuth
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_REDIRECT_URI=http://localhost:8000/api/v1/auth/meta/callback
META_WEBHOOK_VERIFY_TOKEN=your_webhook_verify_token

# Security
SECRET_KEY=change_this_to_a_random_secret_key
CORS_ORIGINS=["http://localhost:5173"]
```

## Configuração do Meta for Developers

1. Crie um App em https://developers.facebook.com
2. Adicione o produto **Instagram Graph API**
3. Configure o redirect OAuth para `http://localhost:8000/api/v1/auth/meta/callback`
4. Ative o modo "Em Desenvolvimento" para testar localmente
5. No Webhook, configure a URL de callback para `http://SEU_IP/api/v1/webhook/meta` (use ngrok para ambiente local)
6. Defina o token de verificação igual ao `META_WEBHOOK_VERIFY_TOKEN`
7. Inscreva-se nos campos: `comments`, `messaging`

## Próximos Passos

- [ ] Autenticação JWT com login real
- [ ] Gráficos no Dashboard (Recharts)
- [ ] Migrações Alembic
- [ ] Testes (pytest backend, Vitest frontend)
- [ ] Deploy em produção (ECS / Kubernetes)
