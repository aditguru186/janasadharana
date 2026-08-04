# Janasadharana API v1 — Mobile & Web Contract

Base URL: `{ORIGIN}/api/v1`  
Auth header: `Authorization: Bearer <accessToken>`  
Content-Type: `application/json`

All success payloads wrap resources in `{ data, meta? }`.  
Errors: `{ statusCode, error, details? }`.

## Auth (use from iOS / Android Secure Storage)

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| POST | `/auth/register` | No | Citizen signup `{ phone, password, fullName, email? }` |
| POST | `/auth/login` | No | `{ phone, password }` → tokens + user |
| POST | `/auth/refresh` | No | `{ refreshToken }` → new token pair (rotation) |
| POST | `/auth/logout` | No | `{ refreshToken }` revokes session |
| POST | `/auth/logout-all` | Yes | Revoke all sessions |
| GET | `/auth/me` | Yes | Current user |

**Token strategy for mobile**

1. Store `accessToken` + `refreshToken` in Keychain / EncryptedSharedPreferences.
2. On 401, call `/auth/refresh` once; retry original request.
3. Access TTL default `15m`; refresh `30d`.

## Catalog

| Method | Path | Auth |
|--------|------|------|
| GET | `/meta` | No — categories, statuses, geofence |
| GET | `/wards` | No |
| GET | `/health` | No — liveness |
| GET | `/ready` | No — DB readiness |

## Grievances

| Method | Path | Auth | Notes |
|--------|------|------|--------|
| GET | `/grievances` | Optional | Query: `category,status,wardId,page,limit,q,mine` |
| GET | `/grievances/mine` | Yes | Citizen’s tickets |
| GET | `/grievances/nearby` | Optional | `lat,lng,maxDistance?,limit?` |
| GET | `/grievances/track/:code` | No | Public tracking (`PUR-XXXXXXXX`) |
| GET | `/grievances/:id` | Optional | Detail |
| GET | `/grievances/:id/history` | Optional | Status timeline |
| POST | `/grievances` | Yes | Create (geofenced to Puri) |
| POST | `/grievances/cow-welfare` | **No** | Public cow/ox welfare report (name, phone, GPS, text/image/voice) |
| GET | `/media/:filename` | No | Serve uploaded photo/voice evidence |
| PATCH | `/grievances/:id/status` | Officer/Admin | `{ status, note? }` |
| POST | `/grievances/:id/assign` | Officer/Admin | `{ assigneeId }` |
| POST | `/grievances/:id/upvote` | Yes | One per user |
| DELETE | `/grievances/:id/upvote` | Yes | Remove upvote |

### Create body

```json
{
  "title": "No water supply",
  "description": "No water since morning in Ward 3.",
  "category": "water",
  "wardId": "uuid-optional",
  "location": { "type": "Point", "coordinates": [85.8245, 19.8134] },
  "extraDetails": [{ "key": "Landmark", "value": "Near temple" }]
}
```

Coordinates are **`[longitude, latitude]`** (GeoJSON order).

### Categories

`water | electricity | domestic_help | sewage | roads | sanitation | streetlight | other | dharta | cow_welfare`

### Public cow welfare body

```json
{
  "reporterName": "Ramesh Das",
  "reporterPhone": "9876543210",
  "description": "Cow lying near temple gate, left leg injured.",
  "animalType": "cow",
  "condition": "injured",
  "landmark": "Near Jagannath Temple north gate",
  "location": { "type": "Point", "coordinates": [85.8245, 19.8134] },
  "imageBase64": "data:image/jpeg;base64,...",
  "voiceBase64": "data:audio/webm;base64,..."
}
```

No login required. Geofenced to Puri (~20 km). Returns tracking code `PUR-…` for `/track`.

### Statuses & transitions

- `open` → `assigned`, `rejected`
- `assigned` → `in_progress`, `open`, `rejected`
- `in_progress` → `resolved`, `assigned`, `rejected`
- `resolved` → (terminal)
- `rejected` → `open`

## Admin

| Method | Path | Auth |
|--------|------|------|
| GET | `/admin/stats` | Officer/Admin |
| GET | `/admin/officers` | Officer/Admin |

## Roles

| Role | Capabilities |
|------|----------------|
| `citizen` | Register, create, list/mine, upvote, track |
| `officer` | All citizen + status, assign, stats |
| `admin` | Same as officer (extend later for user mgmt) |

## Geofence

Submissions must fall within `GEOFENCE_RADIUS_METERS` of Puri centre (`PURI_LAT` / `PURI_LNG`), default 20 km.
