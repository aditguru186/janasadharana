# Database & Cloudflare R2 — Janasadharana Cow Welfare

## Get Postgres (PostGIS) running

The API **requires** Postgres. If you see “database is not running” / concerns “not found”, start the stack from the project root:

```bash
cd /Users/aguru/Desktop/AdiWorkspace/janasadharana

# 1) Docker Desktop must be running
open -a Docker   # wait until whale is idle

# 2) Start DB + Redis + API + Web
docker compose up -d --build

# 3) Check health
docker compose ps
curl -s http://localhost:5430/api/v1/ready
# → {"status":"ready","database":"up"}
```

### Important password note

Postgres only applies `POSTGRES_PASSWORD` on **first volume create**.  
If the volume `postgres_data` already exists, changing `.env` passwords does **not** re-init the DB.

- Containers talk to DB as `db:5432` with the password baked when the volume was first created.
- For host-side tools, use:

```bash
# Inside the running container (always works):
docker exec -it janasadharana-db-1 psql -U janasadharana -d janasadharana

# List cow concerns
docker exec janasadharana-db-1 psql -U janasadharana -d janasadharana \
  -c "SELECT tracking_code, concern_type, status, created_at FROM cow_concerns ORDER BY created_at DESC LIMIT 10;"
```

### Wipe & recreate DB (dev only — destroys data)

```bash
docker compose down
docker volume rm janasadharana_postgres_data
docker compose up -d --build
```

### Migrations

On every backend start, `docker-entrypoint.sh` runs:

```text
node src/db/migrate.js   # 001…004
node src/db/seed.js      # staff + ground agents (if RUN_SEED=true)
```

Tables for cow welfare:

| Table | Purpose |
|-------|---------|
| `cow_concerns` | concern_text, concern_type, voice_id, images, status, assigned_to, dates |
| `ground_agents` | On-ground responders |
| `cow_concern_status_history` | Status timeline |

---

## Cloudflare R2 media

Media (voice / images / PDFs) is stored on **Cloudflare R2**. The DB only keeps **metadata** JSON (key, url, mime, size).

### Bucket layout (Puri cow welfare)

| Path | Contents |
|------|----------|
| `cow-welfare-puri` / `cow-welfare-artefacts/` | Concern **images** (+ PDFs) |
| `cow-welfare-puri` / `cow-welfare-audios/` | **Voice notes** |

Create the bucket `cow-welfare-puri` in Cloudflare R2, enable public access (or a public `r2.dev` URL), then put credentials in **this project’s** root `.env`:

```env
# Same CF account keys as ByteSphere repos are fine (copy from
# ByteSphere/repo/bytesphereinnovation/.env or odia-ai-voice/.env).
# App does NOT auto-read those repos — paste into janasadharana/.env.
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=cow-welfare-puri
R2_KEY_PREFIX=
R2_ARTEFACTS_FOLDER=cow-welfare-artefacts
R2_AUDIOS_FOLDER=cow-welfare-audios
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev
```

If R2 is unset, the API falls back to local `uploads/` (dev only).

### Folder layout (separate folders)

```text
{bucket}/
  janasadharana-welfare/
    voices/   ← voice notes
    images/   ← photos
    pdfs/     ← optional PDFs
```

> **Note:** The R2 API token used here cannot `CreateBucket` (Access Denied).  
> We therefore use the existing `audio-odia-bucket` with prefix `janasadharana-welfare/`.  
> To use a dedicated bucket later: create `janasadharana-welfare` in the Cloudflare dashboard, attach a public R2.dev domain, set `R2_BUCKET_NAME` + `R2_PUBLIC_URL`, and optionally clear `R2_KEY_PREFIX`.

### Concern record shape (API)

```json
{
  "concernText": "...",
  "concernType": "injured",
  "voiceId": { "key": "...", "bucket": "...", "url": "...", "mime": "...", "filename": "..." },
  "images": [ { "key": "...", "url": "..." } ],
  "status": "open",
  "assignedTo": null,
  "date": "2026-08-01T...",
  "updatedAt": "2026-08-01T..."
}
```

### Public raise + track

- UI: http://localhost:5431/cow  
- API: `POST /api/v1/cow-concerns`  
- Track: `GET /api/v1/cow-concerns/track/:code` or http://localhost:5431/track  
