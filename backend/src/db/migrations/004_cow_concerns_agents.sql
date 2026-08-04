-- Dedicated cow welfare concerns + ground agents
-- Media metadata points at Cloudflare R2 keys (voices/ images/ pdfs/)

CREATE TYPE cow_concern_status AS ENUM (
  'open',
  'assigned',
  'in_progress',
  'resolved',
  'rejected'
);

CREATE TYPE cow_concern_type AS ENUM (
  'injured',
  'unwell',
  'stranded',
  'hit_by_vehicle',
  'malnourished',
  'other'
);

CREATE TABLE ground_agents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name       VARCHAR(120) NOT NULL,
  phone           VARCHAR(15) NOT NULL UNIQUE,
  email           VARCHAR(255),
  area_coverage   VARCHAR(200) NOT NULL DEFAULT 'Puri 20km',
  is_available    BOOLEAN NOT NULL DEFAULT TRUE,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  notes           TEXT,
  user_id         UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ground_agents_available
  ON ground_agents(is_available, is_active)
  WHERE is_active = TRUE;

CREATE TABLE cow_concerns (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code   VARCHAR(16) NOT NULL UNIQUE,
  concern_text    TEXT NOT NULL,
  concern_type    cow_concern_type NOT NULL DEFAULT 'injured',
  -- R2 voice object metadata: { key, bucket, url, mime, sizeBytes, filename, folder }
  voice_id        JSONB,
  -- R2 image objects: [{ key, bucket, url, mime, sizeBytes, filename, folder }, ...]
  images          JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- Optional PDF evidence
  pdfs            JSONB NOT NULL DEFAULT '[]'::jsonb,
  status          cow_concern_status NOT NULL DEFAULT 'open',
  assigned_to     UUID REFERENCES ground_agents(id) ON DELETE SET NULL,
  reporter_name   VARCHAR(120),
  reporter_phone  VARCHAR(15),
  location        GEOGRAPHY(POINT, 4326),
  landmark        VARCHAR(500),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cow_concerns_status_created ON cow_concerns(status, created_at DESC);
CREATE INDEX idx_cow_concerns_type ON cow_concerns(concern_type, status);
CREATE INDEX idx_cow_concerns_assigned ON cow_concerns(assigned_to)
  WHERE assigned_to IS NOT NULL;
CREATE INDEX idx_cow_concerns_location ON cow_concerns USING GIST (location);
CREATE INDEX idx_cow_concerns_tracking ON cow_concerns(tracking_code);

CREATE TABLE cow_concern_status_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  concern_id      UUID NOT NULL REFERENCES cow_concerns(id) ON DELETE CASCADE,
  from_status     cow_concern_status,
  to_status       cow_concern_status NOT NULL,
  changed_by      UUID REFERENCES users(id) ON DELETE SET NULL,
  note            TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_cow_history_concern ON cow_concern_status_history(concern_id, created_at DESC);

CREATE TRIGGER ground_agents_updated_at
  BEFORE UPDATE ON ground_agents
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER cow_concerns_updated_at
  BEFORE UPDATE ON cow_concerns
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
