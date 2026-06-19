# adStudioAI

SaaS multi-tenant de gestão de marketing com integração completa Meta (Instagram, WhatsApp Business e Meta Ads).

---

## Visão Geral

**adStudioAI** é uma plataforma SaaS que permite a donos de negócio conectarem suas próprias contas Meta ao produto via OAuth e gerenciá-las de forma independente. Cada cliente é um **tenant** isolado.

| Módulo | O que faz |
|---|---|
| **Meta Integration** | OAuth multi-provider (Instagram, WhatsApp, Ads), tokens criptografados, webhooks com validação HMAC |
| **Studio de Criação** | Gerador de vídeos com IA (fluxo de 6 etapas) |
| **Automação de Leads** | Captura e resposta automática via Instagram |
| **Dashboard** | Métricas de leads, faturamento, ads e Instagram em tempo real |

---

## Stack

| Camada | Tecnologia |
|---|---|
| Backend | Python 3.11 + FastAPI (async) |
| Banco | PostgreSQL 17 + SQLAlchemy 2.0 async + asyncpg |
| Frontend | React 19 + TypeScript + Vite + Tailwind CSS |
| HTTP Client | Axios (baseURL `/api/v1`) |
| Containers | Docker + Docker Compose |
| Criptografia | Fernet (cryptography) para tokens em repouso |
| Testes | pytest + pytest-asyncio + SQLite in-memory |
| Automações | n8n (via webhook dispatch) |

---

## Estrutura do Projeto

```
app-marketing/
├── docker-compose.yml            # PostgreSQL + Backend + Frontend
├── backend/
│   ├── requirements.txt
│   ├── pytest.ini
│   ├── tests/
│   │   ├── conftest.py           # SQLite in-memory + dependency override
│   │   ├── test_webhook.py       # Assinatura HMAC, challenge, payload
│   │   ├── test_auth.py          # State assinado, connections endpoints
│   │   └── test_tenant.py        # Isolamento por account_id
│   └── app/
│       ├── main.py               # FastAPI app, CORS, lifespan (create_all)
│       ├── core/
│       │   ├── config.py         # Pydantic Settings (todas as env vars)
│       │   └── database.py       # Async engine + get_db dependency
│       ├── models/
│       │   ├── account.py        # Tenant principal (OAuth legacy)
│       │   ├── meta_connection.py # Conexões por provider (NOVO)
│       │   ├── lead.py           # Leads capturados
│       │   ├── automation.py     # AutomationConfig, Customer, Sale
│       │   └── video.py          # VideoGeneration, CreditUsage, Alert
│       ├── routes/
│       │   ├── auth.py           # OAuth Meta (start, callback, connections)
│       │   ├── webhook.py        # Webhook Meta (verify + receive + dispatch)
│       │   ├── dashboard.py      # GET /dashboard (métricas agregadas)
│       │   ├── leads.py          # CRUD leads
│       │   ├── accounts.py       # CRUD accounts
│       │   ├── automations.py    # CRUD automations
│       │   ├── automation.py     # POST /automation/config
│       │   └── studio.py         # Geração e publicação de vídeos
│       ├── services/
│       │   ├── meta_token_service.py  # Fernet, long-lived token, state HMAC (NOVO)
│       │   ├── instagram_service.py   # DM, comentário, publicação, mídia (NOVO)
│       │   ├── whatsapp_service.py    # Texto, template, mark_as_read (NOVO)
│       │   └── ads_service.py         # Campanhas, ad sets, insights (NOVO)
│       └── schemas/
│           ├── auth.py
│           └── automation.py
└── frontend/
    └── src/
        ├── App.tsx               # Rotas (/, /login, /onboarding, /app/*)
        ├── pages/
        │   ├── Landing.tsx
        │   ├── Login.tsx
        │   ├── Onboarding.tsx
        │   ├── Dashboard.tsx
        │   ├── Studio.tsx
        │   ├── ConexaoMeta.tsx   # 3 provider cards + status + disconnect (ATUALIZADO)
        │   ├── Automacao.tsx
        │   ├── Leads.tsx
        │   └── Configuracoes.tsx
        └── services/
            └── api.ts            # Axios com baseURL /api/v1
```

---

## Como Rodar Localmente

### Pré-requisitos

- Docker e Docker Compose
- Python 3.11+ (apenas para gerar o `FERNET_KEY`)

### 1. Copie e preencha o `.env`

```bash
cp backend/.env.example backend/.env
```

Gere um `FERNET_KEY`:

```bash
pip install cryptography
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Cole a chave gerada em `backend/.env`:

```env
FERNET_KEY=<chave_gerada_aqui>
```

Preencha também as credenciais Meta:

```env
META_APP_ID=seu_app_id
META_APP_SECRET=seu_app_secret
META_WEBHOOK_VERIFY_TOKEN=um_token_secreto_qualquer
SECRET_KEY=uma_string_aleatoria_longa
```

### 2. Suba os containers

```bash
docker compose up --build -d
```

### 3. Acesse

| Serviço | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| Swagger docs | http://localhost:8000/docs |

---

## Variáveis de Ambiente

```env
# PostgreSQL
DATABASE_URL=postgresql+asyncpg://marketing_user:marketing_pass@localhost:5432/adstudioai

# Meta / Facebook Graph API
META_APP_ID=your_meta_app_id
META_APP_SECRET=your_meta_app_secret
META_API_VERSION=v21.0                  # centralizado — mude aqui para upgrade
META_REDIRECT_URI=http://localhost:8000/api/v1/auth/meta/callback
META_WEBHOOK_VERIFY_TOKEN=your_token

# Criptografia de tokens em repouso (obrigatório)
FERNET_KEY=your_fernet_key

# n8n (opcional — se vazio, eventos são apenas logados)
N8N_WEBHOOK_URL=

# App
SECRET_KEY=change_this_to_a_random_secret_key
CORS_ORIGINS=["http://localhost:5173"]
```

---

## API — Endpoints

### Autenticação e Conexões Meta

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/auth/meta/login` | URL OAuth com scopes legados (onboarding) |
| GET | `/api/v1/auth/meta/start?account_id=&provider=` | URL OAuth por provider com state HMAC assinado |
| GET | `/api/v1/auth/meta/callback` | Troca código, obtém long-lived token, persiste MetaConnection |
| GET | `/api/v1/auth/meta/connections?account_id=` | Lista conexões ativas do tenant |
| DELETE | `/api/v1/auth/meta/connections/{id}?account_id=` | Revoga token e remove conexão |
| GET | `/api/v1/auth/meta/ad-accounts?account_id=` | Lista ad accounts da conta |
| GET | `/api/v1/auth/onboarding/status?account_id=` | Status do onboarding |
| POST | `/api/v1/auth/onboarding/plan?account_id=` | Seleciona plano |
| POST | `/api/v1/auth/onboarding/complete-step?account_id=&step=` | Marca etapa como concluída |

**Providers aceitos em `/auth/meta/start`:** `instagram` · `whatsapp` · `ads`

### Webhook Meta

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/webhook/meta` | Verificação do challenge (`hub.mode`, `hub.verify_token`, `hub.challenge`) |
| POST | `/api/v1/webhook/meta` | Recebe eventos — valida `X-Hub-Signature-256` antes de processar |

O webhook roteia por tipo de evento:

| Evento | Handler | Dispatch |
|---|---|---|
| `changes[].field == "comments"` | `handle_ig_comment()` | `dispatch_event("ig_comment", ...)` |
| `changes[].field == "messaging"` | `handle_ig_dm()` | `dispatch_event("ig_dm", ...)` |
| `messages[]` (WhatsApp) | `handle_whatsapp_message()` | `dispatch_event("whatsapp_message", ...)` |

`dispatch_event()` envia para o `N8N_WEBHOOK_URL` se configurado, caso contrário apenas loga.

### Dashboard

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/dashboard?account_id=` | Leads, faturamento, ads, Instagram, vídeos, alertas |

### Leads

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/leads` | Listar leads |
| GET | `/api/v1/leads/{id}` | Detalhe |
| PUT | `/api/v1/leads/{id}` | Atualizar |
| DELETE | `/api/v1/leads/{id}` | Remover |

### Contas

| Método | Rota | Descrição |
|---|---|---|
| GET | `/api/v1/accounts` | Listar |
| GET | `/api/v1/accounts/{id}` | Detalhe |
| PUT | `/api/v1/accounts/{id}` | Atualizar |
| DELETE | `/api/v1/accounts/{id}` | Remover |

### Automações

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/automation/config` | Salvar configuração |
| GET | `/api/v1/automations` | Listar |
| GET | `/api/v1/automations/{id}` | Detalhe |
| PUT | `/api/v1/automations/{id}` | Atualizar |
| DELETE | `/api/v1/automations/{id}` | Remover |

### Studio

| Método | Rota | Descrição |
|---|---|---|
| POST | `/api/v1/studio/analyze-image` | Analisa imagem → sugestões de prompt |
| POST | `/api/v1/studio/generate-video` | Inicia geração de vídeo → `job_id` |
| GET | `/api/v1/studio/generation-status/{job_id}` | Status e progresso da geração |
| POST | `/api/v1/studio/publish-video` | Publica no Instagram |

---

## Banco de Dados

### `accounts` — tenant principal

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| brand_name | String | Nome da marca |
| meta_page_id | String | ID da Página Facebook (UNIQUE) |
| meta_page_name | String | Nome da Página |
| meta_access_token | Text | Token legacy (onboarding) |
| meta_token_expires_at | DateTime | Validade do token |
| plan_type | String | `autonomo` ou `agencia` |
| onboarding_step | Integer | Etapa atual (0–4) |
| is_active | Boolean | |

### `meta_connections` — conexões por provider (NOVO)

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| account_id | String | FK → accounts, indexed |
| provider | String | `instagram` · `whatsapp` · `ads` |
| meta_user_id | String | ID do usuário Meta |
| page_id | String | ID da Página Facebook |
| ig_business_account_id | String | ID do IG Business Account |
| waba_id | String | ID da conta WhatsApp Business |
| ad_account_id | String | ID da conta de anúncios |
| access_token_encrypted | Text | Token criptografado com Fernet |
| token_type | String | `long_lived` |
| expires_at | DateTime | ~60 dias após conexão |
| scopes | Text | Escopos OAuth concedidos (CSV) |
| status | String | `active` · `expired` · `needs_reauth` · `revoked` |

### `leads`

| Campo | Tipo | Notas |
|---|---|---|
| id | UUID | PK |
| account_id | String | FK → accounts |
| instagram_handle | String | @ do usuário |
| name / email / phone | String | Dados do lead |
| source | Enum | `instagram_comment` · `instagram_dm` · `instagram_form` · `manual` |
| status | Enum | `new` · `contacted` · `qualified` · `converted` · `lost` |
| captured_at | DateTime | |

### `automation_configs`, `customers`, `sales`, `video_generations`, `credit_usages`, `alerts`

Todos com `account_id` FK → accounts para isolamento de tenant.

---

## Fluxo OAuth Multi-Provider

```
Frontend
  → GET /auth/meta/start?account_id=xxx&provider=instagram
  ← { auth_url: "https://facebook.com/...&state=<HMAC>" }

  → redireciona usuário para auth_url

Meta OAuth
  → redireciona para /auth/meta/callback?code=yyy&state=<HMAC>

Backend /auth/meta/callback
  1. Valida state (HMAC SHA-256, expira em 10 min)
  2. Troca code → short-lived token
  3. Troca short-lived → long-lived token (~60 dias)
  4. Descobre Page, IG Business Account, WABA ou Ad Account
  5. Criptografa token com Fernet
  6. Upsert em meta_connections
  ← { account_id, brand_name, page_name, onboarding_step }
```

---

## Serviços Meta

### `instagram_service.py`

| Função | Descrição |
|---|---|
| `send_dm(token, recipient_id, message)` | Envia DM via Messaging API |
| `reply_to_comment(token, comment_id, message)` | Responde comentário |
| `publish_image_post(token, ig_user_id, image_url, caption)` | Publica imagem (container flow) |
| `publish_video_post(token, ig_user_id, video_url, caption)` | Publica Reel (container + polling) |
| `list_media(token, ig_user_id, limit)` | Lista mídias do IG Business |

### `whatsapp_service.py`

| Função | Descrição |
|---|---|
| `send_text(token, phone_number_id, to, body)` | Texto livre (janela de 24h) |
| `send_template(token, phone_number_id, to, template_name, ...)` | Template aprovado |
| `mark_as_read(token, phone_number_id, message_id)` | Marca mensagem como lida |

### `ads_service.py`

| Função | Descrição |
|---|---|
| `list_campaigns(token, ad_account_id)` | Lista campanhas |
| `create_campaign(token, ad_account_id, name, objective, ...)` | Cria campanha |
| `create_ad_set(token, ad_account_id, campaign_id, ...)` | Cria ad set |
| `create_ad_creative(token, ad_account_id, ...)` | Cria criativo |
| `create_ad(token, ad_account_id, ad_set_id, creative_id, ...)` | Cria anúncio |
| `get_account_insights(token, ad_account_id, date_preset, ...)` | Insights da conta |

Todos os serviços têm **retry com exponential back-off** em HTTP 429/5xx (máx. 3 tentativas).

---

## Testes

```bash
cd backend
pip install -r requirements.txt
pytest
```

| Arquivo | O que testa |
|---|---|
| `test_webhook.py` | Validação HMAC, challenge GET, rejeição de payload sem assinatura |
| `test_auth.py` | State HMAC (roundtrip, expirado, adulterado), encrypt/decrypt, endpoints de connections |
| `test_tenant.py` | Isolamento por account_id, DELETE bloqueado de outro tenant, multi-provider por conta |

Os testes usam SQLite in-memory — sem necessidade de PostgreSQL rodando.

---

## Configuração do Meta for Developers (manual)

1. Acesse https://developers.facebook.com e crie um app tipo **Business**
2. Adicione os produtos: **Instagram Graph API**, **WhatsApp Business**, **Marketing API**
3. Em **Configurações > OAuth**, adicione o redirect URI:
   ```
   http://localhost:8000/api/v1/auth/meta/callback
   ```
4. Copie o **App ID** e **App Secret** para o `.env`
5. No painel **Webhooks**, configure:
   - URL: `https://SEU_DOMINIO/api/v1/webhook/meta` (use ngrok para local)
   - Verify Token: mesmo valor de `META_WEBHOOK_VERIFY_TOKEN` no `.env`
   - Campos para inscrever: `messages`, `messaging`, `comments`

---

## Deploy

### Docker Compose (local)

```bash
docker compose up --build -d
```

### Produção (Render / ECS)

- Defina todas as variáveis de ambiente no painel do provedor
- `FERNET_KEY` **diferente** do ambiente local
- `DATABASE_URL` apontando para o banco de produção
- `META_REDIRECT_URI` com o domínio de produção
- `CORS_ORIGINS` com o domínio do frontend

---

## Próximos Passos

- [ ] Implementar Claude Vision API em `studio/analyze-image`
- [ ] Integrar gerador de vídeo (Runway / Kling / Pika) com job queue assíncrono
- [ ] Adicionar JWT para autenticação de sessão (remover account_id em query params)
- [ ] Middleware de autorização: validar que a request pertence ao tenant correto
- [ ] Alembic para migrations incrementais
- [ ] Gráficos no Dashboard (Recharts)
- [ ] WebSocket para progresso de geração em tempo real
- [ ] Lógica real em `handle_ig_comment` / `handle_ig_dm` (captura de lead + auto-reply)
