# WIZMAC — rald-routing
> RALD Routing Service — ALIA Address Resolution
> Last updated: 2026-06-17 — LILCKY STUDIO LIMITED

---

## 1. Product Overview
**rald-routing** resolves ALIA addresses (e.g. `@boyd`, `boyd@rald`) to wallet IDs and payment destinations. It is the payment routing backbone for PayRald.

| Field | Value |
|-------|-------|
| Live URL | `https://routing.rald.cloud` |
| Repo | `Ostinato-Loop/rald-routing` |
| Stack | Cloudflare Worker (Hono) |
| Database | Supabase `onxdcikfttdmnhofsuwo.supabase.co` |

---

## 2. Architecture
| Layer | Stack | Deployment |
|-------|-------|------------|
| API Worker | Cloudflare Worker (Hono) | `routing.rald.cloud` |
| Database | Supabase `rald_alias_registry` table | Shared Supabase instance |
| Auth | Machine JWT or `X-Internal-Secret` | Internal calls only |

---

## 3. Auth Flow
```
1. PayRald resolves @boyd → GET /aliases/boyd@rald (public, no auth)
2. Returns: { alias, user_id, rald_id, display_name }
3. PayRald uses wallet_id to route payment
4. Identity chain: POST /internal/aliases/provision (X-Internal-Secret)
   → Creates rald_alias_registry row on identity.created
```

---

## 4. Database Schema
```sql
rald_alias_registry (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  alias        TEXT NOT NULL UNIQUE,           -- e.g. boyd@rald
  rald_id      TEXT NOT NULL,                  -- e.g. boyd
  user_id      UUID NOT NULL UNIQUE,           -- links to auth_users.id
  display_name TEXT,
  country      TEXT,
  verified     BOOLEAN NOT NULL DEFAULT false,
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
)
RLS: service role only
```

---

## 5. Key Environment Variables
| Variable | Required | Set In |
|----------|----------|--------|
| `SUPABASE_URL` | ✅ | Cloudflare secret |
| `SUPABASE_SERVICE_ROLE_KEY` | ✅ ⚠️ ROTATE | Cloudflare secret |
| `RALD_INTERNAL_SECRET` | ✅ | Cloudflare secret |
| `MACHINE_IDENTITY_SECRET` | ✅ | Cloudflare secret |
| `ALIA_MACHINE_AUD` | ✅ | Cloudflare secret |

---

## 6. Live Endpoints
| Method | Path | Auth | Status |
|--------|------|------|--------|
| GET | `/health` | None | ✅ |
| GET | `/aliases/:alias` | None (public) | ✅ |
| POST | `/internal/aliases/provision` | `X-Internal-Secret` or Machine JWT | ✅ New |
| GET | `/v1/resolve/:alias` | JWT | ✅ |

---

## 7. CI Pipelines
| Workflow | Trigger | Status |
|----------|---------|--------|
| CI | Push/PR to main | ✅ Green |
| Deploy | Push to main | ✅ Green |

---

## 8. Incidents
| # | Date | Description | Status |
|---|------|-------------|--------|
| R-001 | 2026-06-17 | rald_alias_registry table created — was missing (alias resolution broken) | ✅ SQL ready |
| R-002 | 2026-06-17 | POST /internal/aliases/provision endpoint added for identity chain | ✅ Deployed |
