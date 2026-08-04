# Coolify deployment — Janasadharana (Puri)

ByteSphere Coolify panel: **http://5.223.44.201:8000/**  
Server: `5.223.44.201`  
GitHub: `https://github.com/aditguru186/janasadharana`

This stack is **Docker Compose** (db + redis + backend + frontend). Prefer one **Docker Compose** resource in Coolify, not four separate apps (unless you already split them).

---

## Ports (reference)

| Service   | Container listen | Coolify / prod | Local (override file) |
|-----------|------------------|----------------|------------------------|
| Postgres  | 5432             | **Internal only** (no host bind) | `15432→5432` via override |
| API       | 5430             | Coolify domain → service `backend` | `5430` |
| Web       | 5431             | Coolify domain → service `frontend` | `5431` |

**Coolify:** main `docker-compose.yml` only uses `expose` (no host ports). That avoids
`Bind for 0.0.0.0:15432 failed: port is already allocated`.

**Local laptop:** `cp docker-compose.override.example.yml docker-compose.override.yml`

In Coolify UI: attach domains to **frontend** and **backend** services; proxy uses the
internal Docker network. Do not publish Postgres on a public port.

---

## A. First-time deploy (new Compose resource)

### 1. Code on GitHub

```bash
# From a machine with this repo (already done on dev branch):
git checkout dev
git push -u origin dev
```

Coolify should track **`dev`** for staging, or **`main`** for production once merged.

### 2. Coolify UI

1. Open http://5.223.44.201:8000/
2. **Project** (e.g. Janasadharana / Puri) → **+ New Resource**
3. Choose **Docker Compose** (or “Docker Compose Empty” then connect Git)
4. **Source:** GitHub App → `aditguru186/janasadharana`
5. **Branch:** `dev` (staging) or `main` (prod)
6. **Compose file:** `docker-compose.yml` (repo root)
7. **Base directory:** `/` (repo root)

### 3. Environment variables

In Coolify → resource → **Environment Variables**, paste from `.env.example` and **override**:

```env
NODE_ENV=production
ALLOW_INSECURE_DEFAULTS=false

POSTGRES_USER=janasadharana
POSTGRES_PASSWORD=<strong-random>
POSTGRES_DB=janasadharana
# Do NOT publish Postgres publicly. Compose already uses service name "db".

JWT_ACCESS_SECRET=<≥32 random chars>
JWT_REFRESH_SECRET=<≥32 random chars different>
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# Browser-visible API base (must include /api/v1)
PUBLIC_API_URL=https://api.YOUR-DOMAIN/api/v1
# Web origin(s) for CORS
CORS_ORIGINS=https://YOUR-DOMAIN,https://www.YOUR-DOMAIN

SEED_ADMIN_PHONE=9999999999
SEED_ADMIN_PASSWORD=<change-immediately>
SEED_OFFICER_PHONE=8888888888
SEED_OFFICER_PASSWORD=<change-immediately>
RUN_SEED=true

# Cow welfare R2 (create bucket cow-welfare-puri first)
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=cow-welfare-puri
R2_KEY_PREFIX=
R2_ARTEFACTS_FOLDER=cow-welfare-artefacts
R2_AUDIOS_FOLDER=cow-welfare-audios
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

PURI_LAT=19.8134
PURI_LNG=85.8245
GEOFENCE_RADIUS_METERS=20000
```

Generate secrets:

```bash
./scripts/generate-secrets.sh
```

### 4. Domains / SSL

| Host role | Example domain | Points to service |
|-----------|----------------|-------------------|
| Web UI    | `puri.yourdomain.com` or `janasadharana.bytesphereinnovation.com` | **frontend** |
| API       | `api-puri.yourdomain.com` | **backend** |

1. Cloudflare DNS: **A** records → `5.223.44.201` (grey cloud first, then orange if proxy OK)
2. Coolify → attach domains to the compose services / ports Coolify exposes
3. Enable Let’s Encrypt

Set:

- `PUBLIC_API_URL=https://<api-host>/api/v1`
- `CORS_ORIGINS=https://<web-host>`

**Rebuild frontend** after changing `PUBLIC_API_URL` (it is a **build-time** arg for SvelteKit).

### 5. Persistent volumes

Confirm Compose volumes exist and are **not** wiped on redeploy:

- `postgres_data` — required  
- `redis_data` — recommended  
- `uploads_data` — local media fallback  

### 6. Deploy

Coolify → **Deploy**. Wait for:

- `db` healthy  
- backend migrations + optional seed  
- frontend built with `PUBLIC_API_URL`  

### 7. Smoke checklist

```bash
# Health (use your public API host)
curl -sS https://API-HOST/api/v1/health
curl -sS https://API-HOST/api/v1/ready

# Meta catalog
curl -sS https://API-HOST/api/v1/meta | head -c 200
```

Browser:

- [ ] Web loads (HTTPS green)  
- [ ] `/cow` public form works  
- [ ] Staff login → `/admin` board  
- [ ] Open a ticket → Proceed / Reject / Assignee  
- [ ] Image/voice upload lands in R2 when configured  

---

## B. Redeploy after code change

```bash
# Local: push branch Coolify watches
git push origin dev

# Coolify: Auto Deploy (if enabled) OR click Redeploy
# Or use helper (needs COOLIFY_TOKEN + app UUID):
./scripts/coolify-redeploy.sh
```

If only **env** changed for `PUBLIC_API_URL`, force a **frontend rebuild** (not only restart).

---

## C. Staging on `dev` vs production on `main`

| Branch | Use |
|--------|-----|
| `dev`  | Feature Coolify resource or same stack with staging domains |
| `main` | Production after PR / merge from `dev` |

Suggested:

1. Deploy **`dev`** first → verify  
2. Merge to **`main`** → production redeploy  

---

## D. Troubleshooting

| Symptom | Fix |
|---------|-----|
| Web loads, API fails | Wrong `PUBLIC_API_URL` (must be browser-reachable + `/api/v1`) |
| CORS errors | `CORS_ORIGINS` must list exact web origin (scheme + host) |
| DB not ready | Wait for health; check Postgres volume / password (password only applied on **first** volume create) |
| Weak JWT crash | Set strong secrets or temporarily `ALLOW_INSECURE_DEFAULTS=true` only for smoke |
| Media 503 / no images | Set R2_* and public URL; bucket `cow-welfare-puri` exists |
| Port conflicts on host | Coolify uses its own network; local 5430/5431/15432 only matter for laptop |

---

## E. Security (production)

- [ ] `ALLOW_INSECURE_DEFAULTS=false`  
- [ ] Strong JWT + DB passwords  
- [ ] Seed passwords rotated; consider `RUN_SEED=false` after bootstrap  
- [ ] Postgres **not** exposed on public internet  
- [ ] TLS on web + API  
- [ ] R2 keys only in Coolify secrets, never committed  

---

## Helper scripts

| Script | Purpose |
|--------|---------|
| `scripts/generate-secrets.sh` | Print JWT + password candidates |
| `scripts/coolify-redeploy.sh` | Trigger redeploy via Coolify API |
| `scripts/smoke-check.sh` | Hit health/ready on a base URL |

See also: root `README.md` § Coolify, `docs/DB-AND-R2.md` for R2 layout.
