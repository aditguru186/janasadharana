# Janasadharana — Puri Municipality Grievance Redressal

> **Living handbook** for this project: product scope, architecture decisions, how to run/test, API overview, deployment (Coolify → K8s), security, and scaling.  
> Full mobile/web API contract: **[docs/API.md](docs/API.md)**.

---

## Table of contents

1. [What is this?](#1-what-is-this)
2. [Scope & product goals](#2-scope--product-goals)
3. [Architecture decisions](#3-architecture-decisions)
4. [Features](#4-features)
5. [Project layout](#5-project-layout)
6. [Prerequisites](#6-prerequisites)
7. [How to test (quick start)](#7-how-to-test-quick-start)
8. [Local development (without full Compose)](#8-local-development-without-full-compose)
9. [Seed accounts & first-time flows](#9-seed-accounts--first-time-flows)
10. [Environment variables](#10-environment-variables)
11. [API overview](#11-api-overview)
12. [Domain model (roles, status, geo)](#12-domain-model-roles-status-geo)
13. [Web routes (UI map)](#13-web-routes-ui-map)
14. [Coolify deployment](#14-coolify-deployment)
15. [Scaling path (Puri load → K8s)](#15-scaling-path-puri-load--k8s)
16. [Security checklist](#16-security-checklist)
17. [Useful commands](#17-useful-commands)
18. [Troubleshooting](#18-troubleshooting)
19. [Future roadmap (suggested)](#19-future-roadmap-suggested)
20. [License](#20-license)

---

## 1. What is this?

**Janasadharana** is a production-oriented full-stack grievance redressal platform for **Puri Municipality** (Odisha):

| Actor | What they do |
|-------|----------------|
| **Citizens** | Register, file geo-tagged grievances, track by code, upvote once per ticket |
| **Officers / Admin** | View operations board, assign, advance status, resolve/reject, see stats |
| **Mobile apps (future)** | Same REST API as the web (`Bearer` JWT + refresh tokens) |

Stack:

| Layer | Choice | Why |
|-------|--------|-----|
| Web | **SvelteKit** (custom CSS, **no Tailwind**) | Fast citizen + staff UI; `@sveltejs/adapter-node` for Docker/Coolify |
| API | **Fastify** | High throughput, JSON Schema validation, clear route modules for mobile |
| DB | **PostgreSQL 16 + PostGIS** | Relational users/RBAC/audit + geo queries; K8s-ready |
| Cache | **Redis** (in Compose) | Ready for distributed rate-limit / session scale-out |
| Deploy | **Docker Compose → Coolify** | Fits ~16GB hosts; path to multi-replica + K8s later |

Postgres + PostGIS is the source of truth (users, roles, assignments, unique upvotes, audit, geo).

---

## 2. Scope & product goals

### In scope (current)

- **Puri Municipality only** (not multi-city / statewide multi-tenant).
- Geofenced submissions around Puri city centre (default **20 km** radius; env-configurable).
- Web app for citizens and staff.
- REST API designed so **iOS and Android** can share the same contract later.
- Docker-based deploy for **Coolify**; architecture that can grow to Kubernetes.

### In scope (cow welfare unit)

- **Public** mobile-first cow/ox concern flow at `/cow` (no login).
- Text + optional photo + optional voice evidence.
- Mandatory GPS inside Puri **20 km** geofence.
- Odia + English for the concern-raiser UI (admin remains English).
- Staff track concerns on the existing Operations board (`category=cow_welfare`).

### Out of scope (for now — see roadmap)

- SMS/WhatsApp OTP, multi-ULB tenancy, offline field apps, push notifications to agents.

### Design targets (capacity mindset)

- Population base: Puri Municipality (not 20 lakh statewide).
- Coolify host ~**16 GB RAM** is enough for municipal load with headroom.
- When concurrent citizens + staff grow: scale **API replicas** first, then managed DB / K8s.

---

## 3. Architecture decisions

### Why PostgreSQL + PostGIS

| Need | Postgres fit |
|------|----------------|
| Users, roles, officers, wards | Natural relational model + FKs |
| One upvote per user | Unique `(grievance_id, user_id)` |
| Status transitions + history | Transactions + `status_history` |
| Nearby / geofence | PostGIS `GEOGRAPHY`, `ST_DWithin`, GIST index |
| Audit / compliance | Append-only-style `audit_events` |
| Mobile consistency | Strong ACID for concurrent writes |

### High-level diagram

```
  Citizens / Officers / (future) Mobile
                 │
                 ▼
         ┌───────────────┐
         │  SvelteKit    │  :5431
         │  (Web UI)     │
         └───────┬───────┘
                 │  HTTPS / HTTP  →  PUBLIC_API_URL
                 ▼
         ┌───────────────┐
         │  Fastify API  │  :5430
         │  /api/v1/*    │
         └───────┬───────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
  PostgreSQL+PostGIS    Redis (optional scale-out)
   users, grievances,
   geo, audit, tokens
```

### Auth model

- **Access token:** JWT (`Authorization: Bearer …`), short TTL (default `15m`).
- **Refresh token:** opaque random string, **hashed** in DB, rotated on refresh (default `30d`).
- Store refresh tokens securely on mobile (Keychain / EncryptedSharedPreferences).
- Roles: `citizen` | `officer` | `admin`.

### Security baseline (built-in)

- Helmet, CORS allowlist, rate limiting, bcrypt passwords, RBAC on status/assign, geofence on create, one-upvote-per-user, migrate-on-boot, health/ready probes.

---

## 4. Features

- Phone + password registration/login (citizens self-serve).
- Staff seed accounts (admin + officer) for operations.
- Grievance create with GeoJSON point `[lng, lat]` and optional ward + extra key/value details.
- Human tracking codes: `PUR-XXXXXXXX`.
- Public track page/API (no login required).
- Paginated public board with category/status filters and upvotes.
- Staff operations board (kanban-style), assign-to-self, advance status, reject.
- Admin stats (totals, last 24h / 7d, by category).
- Status history timeline per grievance.
- API meta catalog for clients (`/meta` — categories, statuses, geofence).
- Docker Compose with memory limits suitable for Coolify 16GB.

---

## 5. Project layout

```
janasadharana/
├── README.md                 ← this handbook
├── LICENSE
├── .env.example              ← copy to .env
├── docker-compose.yml        ← db, redis, backend, frontend, optional seed
├── docs/
│   └── API.md                ← full mobile/web API contract
├── backend/
│   ├── Dockerfile
│   ├── docker-entrypoint.sh  ← migrate → optional seed → start
│   ├── package.json
│   └── src/
│       ├── index.js          # boot, wait for DB, graceful shutdown
│       ├── app.js            # Fastify plugins, error handler, route mount
│       ├── config.js         # env validation
│       ├── db/
│       │   ├── pool.js
│       │   ├── migrate.js
│       │   ├── seed.js
│       │   └── migrations/001_init.sql
│       ├── plugins/auth.js   # JWT + RBAC helpers
│       ├── routes/           # distinct endpoint modules
│       ├── services/         # business logic
│       └── utils/            # geo, constants, tracking codes, errors
└── frontend/
    ├── Dockerfile
    ├── package.json
    ├── svelte.config.js
    ├── vite.config.js
    └── src/
        ├── app.css           # design system (no Tailwind)
        ├── lib/
        │   ├── api.js        # shared HTTP client (same contract as mobile)
        │   └── auth.js       # token session store
        └── routes/           # SvelteKit pages
```

---

## 6. Prerequisites

| Tool | Notes |
|------|--------|
| **Docker Desktop** (or Docker Engine + Compose v2) | Preferred for full-stack test |
| **Node.js 20+** | Only if developing API/web outside Docker |
| **Git** | Clone / deploy from repo |

Optional: `curl` for API smoke tests.

---

## 7. How to test (quick start)

### A. Full stack with Docker (recommended)

1. **Start Docker Desktop** (daemon must be running).

2. From the repo root:

```bash
cd /path/to/janasadharana

cp -n .env.example .env
# For public deploys: edit .env — strong JWT secrets, DB password, CORS, PUBLIC_API_URL

docker compose up --build -d
```

3. Wait ~30–60 seconds for Postgres health + migrations + seed.

4. Open:

| Service | URL |
|---------|-----|
| **Web UI** | http://localhost:5431 |
| **API base** | http://localhost:5430/api/v1 |
| **Liveness** | http://localhost:5430/api/v1/health |
| **Readiness** | http://localhost:5430/api/v1/ready |
| **Meta catalog** | http://localhost:5430/api/v1/meta |

5. **Browser smoke path**

| Step | Action |
|------|--------|
| 1 | Go to `/register` → create a citizen (10-digit phone, password ≥ 8 chars) |
| 2 | `/submit` → fill form → **Use my GPS** or **Use Puri centre (demo)** → submit |
| 3 | Copy tracking code `PUR-…` → `/track` |
| 4 | Home board → filter / upvote |
| 5 | Logout → login as **admin** or **officer** (seed table below) |
| 6 | `/admin` → advance status, assign, reject |

6. **API smoke (curl)**

```bash
curl -s http://localhost:5430/api/v1/health
curl -s http://localhost:5430/api/v1/meta | head -c 400
echo
```

7. **Stop**

```bash
docker compose down
# wipe DB volume only if you want a clean slate:
# docker compose down -v
```

### B. Optional one-shot seed job

Seed also runs on API boot when `RUN_SEED=true`. To re-run seed manually:

```bash
docker compose --profile seed run --rm seed
```

---

## 8. Local development (without full Compose)

Use when iterating on code with hot reload. Still need PostGIS.

### Database only

```bash
docker compose up -d db
```

Default connection:

```text
postgres://janasadharana:janasadharana@localhost:15432/janasadharana
```

### API

```bash
cd backend
npm install

export DATABASE_URL=postgres://janasadharana:janasadharana@localhost:15432/janasadharana
export JWT_ACCESS_SECRET=local-dev-only-access-secret-32b-min
export JWT_REFRESH_SECRET=local-dev-only-refresh-secret-32b-min
export ALLOW_INSECURE_DEFAULTS=true
export NODE_ENV=development
export PORT=5430
export CORS_ORIGINS=http://localhost:5431

npm run db:setup   # migrate + seed
npm run dev        # node --watch
```

### Web

```bash
cd frontend
echo 'PUBLIC_API_URL=http://localhost:5430/api/v1' > .env
npm install
npm run dev
# → http://localhost:5431
```

### Production build check (web)

```bash
cd frontend
npm run build
npm run preview
```

> **Note:** If global `npm` cache has permission errors on macOS, use  
> `npm install --cache /tmp/npm-cache-jana`.

---

## 9. Seed accounts & first-time flows

### Default staff (change after first login)

| Role | Phone | Default password | Env overrides |
|------|-------|------------------|---------------|
| **Admin** | `9999999999` | `ChangeMeAdmin!23` | `SEED_ADMIN_PHONE` / `SEED_ADMIN_PASSWORD` |
| **Officer** | `8888888888` | `ChangeMeOfficer!23` | `SEED_OFFICER_PHONE` / `SEED_OFFICER_PASSWORD` |

Citizens **self-register** at `/register` (or `POST /api/v1/auth/register`).

### What seed also creates

- Sample **wards** (W01–W08 labels for Puri).
- Upserts admin/officer users (safe to re-run).

Set `RUN_SEED=false` after production bootstrap if you do not want seed on every container start (admin/officer upsert is idempotent, but locking down is cleaner).

---

## 10. Environment variables

Copy `.env.example` → `.env`. Important keys:

| Variable | Purpose |
|----------|---------|
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Database credentials |
| `DATABASE_URL` | Full Postgres URL (set automatically in Compose for backend) |
| `JWT_ACCESS_SECRET` | Access JWT secret (**≥ 32 chars** in production) |
| `JWT_REFRESH_SECRET` | Used in app config validation; refresh tokens are opaque + hashed |
| `ALLOW_INSECURE_DEFAULTS` | `true` only for local smoke tests; **false** in real deploys |
| `JWT_ACCESS_TTL` / `JWT_REFRESH_TTL` | e.g. `15m`, `30d` |
| `CORS_ORIGINS` | Comma-separated browser origins for the web app |
| `PUBLIC_API_URL` | **Browser-visible** API base including `/api/v1` |
| `PURI_LAT` / `PURI_LNG` / `GEOFENCE_RADIUS_METERS` | Municipality geofence |
| `RATE_LIMIT_MAX` / `RATE_LIMIT_WINDOW` | Global API rate limit |
| `PG_POOL_MAX` | Postgres pool size per API process |
| `SEED_*` / `RUN_SEED` | Bootstrap staff users |
| `BACKEND_PORT` / `FRONTEND_PORT` | Host port mappings |

**Coolify tip:** `PUBLIC_API_URL` must be the URL the **user’s browser** can reach (public hostname), not the internal Docker service name.

---

## 11. API overview

Base path: **`/api/v1`**  
Success shape: `{ "data": ..., "meta"?: ... }`  
Error shape: `{ "statusCode": number, "error": string, "details"?: ... }`  
Auth header: `Authorization: Bearer <accessToken>`

Full tables, request bodies, and mobile guidance: **[docs/API.md](docs/API.md)**.

### Endpoint map (distinct routes)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| GET | `/health` | No | Liveness |
| GET | `/ready` | No | DB readiness |
| GET | `/meta` | No | Categories, statuses, geofence |
| GET | `/wards` | No | Ward list |
| POST | `/auth/register` | No | Citizen signup |
| POST | `/auth/login` | No | Login → tokens + user |
| POST | `/auth/refresh` | No | Rotate tokens |
| POST | `/auth/logout` | No | Revoke refresh token |
| POST | `/auth/logout-all` | Yes | Revoke all sessions |
| GET | `/auth/me` | Yes | Current user |
| GET | `/grievances` | Optional | List + filters + pagination |
| GET | `/grievances/mine` | Yes | Citizen’s tickets |
| GET | `/grievances/nearby` | Optional | `lat`, `lng`, `maxDistance` |
| GET | `/grievances/track/:code` | No | Public track by `PUR-…` |
| GET | `/grievances/:id` | Optional | Detail |
| GET | `/grievances/:id/history` | Optional | Status timeline |
| POST | `/grievances` | Yes | Create (geofenced) |
| PATCH | `/grievances/:id/status` | Officer/Admin | Status transition |
| POST | `/grievances/:id/assign` | Officer/Admin | Assign officer |
| POST | `/grievances/:id/upvote` | Yes | Upvote once |
| DELETE | `/grievances/:id/upvote` | Yes | Remove upvote |
| GET | `/admin/stats` | Officer/Admin | Dashboard counts |
| GET | `/admin/officers` | Officer/Admin | Staff list |

### Create grievance body (example)

```json
{
  "title": "No water supply",
  "description": "No water since morning in Ward 3.",
  "category": "water",
  "wardId": "uuid-optional",
  "location": {
    "type": "Point",
    "coordinates": [85.8245, 19.8134]
  },
  "extraDetails": [{ "key": "Landmark", "value": "Near temple" }]
}
```

Coordinates are **GeoJSON order: `[longitude, latitude]`**.

### Mobile client rules (iOS / Android)

1. Persist `accessToken` + `refreshToken` in secure storage.
2. Send `Authorization: Bearer <accessToken>` on protected calls.
3. On **401**, call `POST /auth/refresh` once with `refreshToken`, store new pair, retry once.
4. Do not embed secrets in the app binary; only the API base URL.

---

## 12. Domain model (roles, status, geo)

### Roles

| Role | Capabilities |
|------|----------------|
| `citizen` | Register, create, list/mine, upvote, track |
| `officer` | All citizen + status change, assign, stats |
| `admin` | Same as officer today (extend later for user management) |

### Categories

`water` · `electricity` · `domestic_help` · `sewage` · `roads` · `sanitation` · `streetlight` · `other` · `dharta`

### Status machine

```
open ──► assigned ──► in_progress ──► resolved
 │          │              │
 │          ├─► open       ├─► assigned
 │          └─► rejected   └─► rejected
 └─► rejected ──► open (reopen)
```

- `resolved` is terminal.
- Only **officer/admin** may change status.

### Geofence

- Centre: `PURI_LAT` / `PURI_LNG` (defaults `19.8134`, `85.8245`).
- Radius: `GEOFENCE_RADIUS_METERS` (default `20000`).
- Enforced **server-side** on create (UI demo pin only helps local testing).

### Core tables (summary)

| Table | Role |
|-------|------|
| `users` | Citizens + staff |
| `wards` | Municipality wards |
| `grievances` | Tickets + PostGIS `location` |
| `grievance_upvotes` | Unique upvote pairs |
| `status_history` | Timeline |
| `refresh_tokens` | Hashed refresh sessions |
| `audit_events` | Security/ops audit trail |
| `schema_migrations` | Applied SQL migrations |

Indexes cover status/category/time, citizen/assignee, geo GIST, upvotes.

---

## 13. Web routes (UI map)

| Path | Audience | Purpose |
|------|----------|---------|
| `/` | Public | Community board (filters, pagination, upvotes) + cow welfare banner |
| `/cow` | Public | **Cow Welfare Unit** — mobile wizard (awareness → name/phone/GPS → details/media) · Odia/EN |
| `/register` | Public | Citizen signup |
| `/login` | Public | Login (all roles) |
| `/submit` | Logged-in | File civic grievance + GPS |
| `/my` | Citizen | My tickets |
| `/track` | Public | Track by `PUR-…` code (civic + cow welfare) |
| `/grievance/[id]` | Public | Detail + timeline + media evidence |
| `/admin` | Officer/Admin | Operations board + stats (filter **Cow Welfare**) |

---

## 14. Coolify deployment

1. Create a **Docker Compose** resource from this repository.
2. Set env vars from `.env.example` (do **not** keep default passwords on a public host).
3. Generate strong `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` (≥ 32 random characters).
4. Set `ALLOW_INSECURE_DEFAULTS=false` (or remove it) in production.
5. Set `PUBLIC_API_URL` to the **public** API URL Coolify exposes  
   e.g. `https://api.yourdomain.example/api/v1`.
6. Set `CORS_ORIGINS` to the web origin(s), e.g. `https://grievance.yourdomain.example`.
7. Persist volume **`postgres_data`** (and `redis_data` if used).
8. Proxy TLS at Coolify; expose **frontend** on 443; expose API on its own hostname if preferred.
9. Health checks:
   - Liveness: `GET /api/v1/health`
   - Readiness: `GET /api/v1/ready`
10. After first login, change seed admin/officer passwords (or rotate via DB / future admin UI).
11. Optionally set `RUN_SEED=false` after bootstrap.

### Memory guide (~16 GB Coolify host)

| Service | Compose limit (approx.) |
|---------|-------------------------|
| Postgres | 2G |
| Redis | 512M |
| API | 1G |
| Web | 512M |

Leaves headroom for OS, Coolify agent, and bursts.

### Rebuild after code change

```bash
docker compose up --build -d
```

On Coolify: redeploy / rebuild image as usual for the Compose resource.

---

## 15. Scaling path (Puri load → K8s)

| Phase | When | What to do |
|-------|------|------------|
| **0 — Now** | Coolify / single host | One API + PostGIS + backups; monitor `/ready` |
| **1 — Soon** | Higher concurrent users | 2–3 API replicas behind load balancer; connection pooling; Redis rate limits |
| **2 — Growth** | Heavy read dashboards | Read replica for analytics; cache hot lists |
| **3 — K8s** | Ops maturity | Deployments for API/web, managed Postgres or operator, HPA on CPU/RPS, ingress TLS, secrets manager |

### Historical note (pre-rebuild issues that were fixed)

An earlier prototype lacked auth on writes, used open CORS, unlimited upvotes, client-only kanban limits, and weak indexing. The current stack is built for municipal production use with RBAC, geofence, and Postgres as the sole datastore.

---

## 16. Security checklist

Use before any public / Coolify production traffic:

- [ ] Strong unique `JWT_ACCESS_SECRET` / `JWT_REFRESH_SECRET` (≥ 32 chars)
- [ ] `ALLOW_INSECURE_DEFAULTS` is **not** `true` in production
- [ ] Strong `POSTGRES_PASSWORD`
- [ ] `CORS_ORIGINS` limited to real web origin(s)
- [ ] Seed admin/officer passwords changed
- [ ] Postgres port **not** exposed publicly (Compose port publish is for local dev)
- [ ] TLS via Coolify / reverse proxy
- [ ] `RUN_SEED=false` after bootstrap (optional but recommended)
- [ ] Backups enabled for `postgres_data`
- [ ] Rate limits reviewed (`RATE_LIMIT_*`) if under abuse

---

## 17. Useful commands

```bash
# Start / rebuild
docker compose up --build -d

# Status
docker compose ps

# Logs
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db

# Stop (keep volumes)
docker compose down

# Stop + wipe database
docker compose down -v

# Backend migrate/seed only (local Node)
cd backend && npm run db:setup

# Backend unit of work scripts
cd backend && npm run migrate && npm run seed
```

---

## 18. Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| `Cannot connect to the Docker daemon` | Docker Desktop not running | Start Docker, retry `docker compose up` |
| API exits on JWT error in production | Weak secrets | Set strong JWT secrets; set `ALLOW_INSECURE_DEFAULTS=true` only for local |
| Web loads but API calls fail | Wrong `PUBLIC_API_URL` | Must be reachable from the **browser** (not `http://backend:5430`) |
| CORS errors in browser | Origin not allowed | Add web origin to `CORS_ORIGINS` |
| Create fails “outside Puri” | GPS outside geofence | Use location inside radius or demo Puri centre; adjust `GEOFENCE_RADIUS_METERS` if needed |
| `/admin` forbidden | Logged in as citizen | Use seed officer/admin phone |
| Empty board after submit | Filter mismatch / not refreshed | Clear filters; check API with `/grievances` |
| `npm` EACCES on cache | Root-owned `~/.npm` | `npm install --cache /tmp/npm-cache-jana` or fix `~/.npm` ownership |
| DB not ready loops | Postgres still starting | Wait for healthy `db`; check `docker compose logs db` |
| Port already in use | 5431/5430/15432 taken | Change `FRONTEND_PORT` / `BACKEND_PORT` / `POSTGRES_PORT` in `.env` |

---

## 19. Future roadmap (suggested)

Prioritized for Puri operations and later mobile:

1. **Photo attachments** — object storage (S3/R2) + virus scan; never store blobs in Postgres.
2. **Phone OTP / WhatsApp** — reduce password friction for citizens.
3. **Odia (and Hindi) UI strings** — civic accessibility.
4. **Ward polygons** — replace/enhance circle geofence with official boundaries.
5. **Duplicate / “me too” clustering** — geo-hash + text similarity.
6. **SMS status notifications** on status change.
7. **Native iOS/Android** — consume [docs/API.md](docs/API.md) as-is.
8. **K8s manifests / Helm** — when Coolify single-node is no longer enough.

---

## 20. License

See [LICENSE](LICENSE).

---

### Document maintenance

When you change architecture, env vars, ports, seed accounts, or API routes, update:

1. This **README.md** (handbook)
2. **docs/API.md** (if routes or payloads change)
3. **.env.example** (if new configuration is introduced)

*Last consolidated for the production Postgres + Fastify + SvelteKit rebuild (Puri Municipality).*
