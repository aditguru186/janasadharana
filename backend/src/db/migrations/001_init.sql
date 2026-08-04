-- Janasadharana Puri Municipality — initial schema
-- Requires PostgreSQL 14+ with PostGIS

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE user_role AS ENUM ('citizen', 'officer', 'admin');
CREATE TYPE grievance_status AS ENUM ('open', 'assigned', 'in_progress', 'resolved', 'rejected');
CREATE TYPE grievance_category AS ENUM (
  'water',
  'electricity',
  'domestic_help',
  'sewage',
  'roads',
  'sanitation',
  'streetlight',
  'other',
  'dharta'
);

CREATE TABLE users (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone         VARCHAR(15) NOT NULL UNIQUE,
  email         VARCHAR(255) UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     VARCHAR(120) NOT NULL,
  role          user_role NOT NULL DEFAULT 'citizen',
  ward_id       UUID,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE wards (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code        VARCHAR(20) NOT NULL UNIQUE,
  name        VARCHAR(120) NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE users
  ADD CONSTRAINT users_ward_id_fkey
  FOREIGN KEY (ward_id) REFERENCES wards(id) ON DELETE SET NULL;

CREATE TABLE refresh_tokens (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  user_agent TEXT,
  ip_address INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id)
  WHERE revoked_at IS NULL;

CREATE TABLE grievances (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tracking_code  VARCHAR(16) NOT NULL UNIQUE,
  title          VARCHAR(200) NOT NULL,
  description    TEXT NOT NULL,
  category       grievance_category NOT NULL,
  status         grievance_status NOT NULL DEFAULT 'open',
  location       GEOGRAPHY(POINT, 4326) NOT NULL,
  ward_id        UUID REFERENCES wards(id) ON DELETE SET NULL,
  citizen_id     UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  assignee_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  upvote_count   INTEGER NOT NULL DEFAULT 0 CHECK (upvote_count >= 0),
  extra_details  JSONB NOT NULL DEFAULT '[]'::jsonb,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_grievances_status_created ON grievances(status, created_at DESC);
CREATE INDEX idx_grievances_category_status ON grievances(category, status, created_at DESC);
CREATE INDEX idx_grievances_citizen ON grievances(citizen_id, created_at DESC);
CREATE INDEX idx_grievances_assignee ON grievances(assignee_id, status)
  WHERE assignee_id IS NOT NULL;
CREATE INDEX idx_grievances_ward ON grievances(ward_id)
  WHERE ward_id IS NOT NULL;
CREATE INDEX idx_grievances_location ON grievances USING GIST (location);
CREATE INDEX idx_grievances_upvotes ON grievances(upvote_count DESC, created_at DESC);

CREATE TABLE grievance_upvotes (
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (grievance_id, user_id)
);

CREATE TABLE status_history (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  grievance_id UUID NOT NULL REFERENCES grievances(id) ON DELETE CASCADE,
  from_status  grievance_status,
  to_status    grievance_status NOT NULL,
  changed_by   UUID REFERENCES users(id) ON DELETE SET NULL,
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_status_history_grievance ON status_history(grievance_id, created_at DESC);

CREATE TABLE audit_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id    UUID REFERENCES users(id) ON DELETE SET NULL,
  action      VARCHAR(80) NOT NULL,
  entity_type VARCHAR(40) NOT NULL,
  entity_id   UUID,
  meta        JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address  INET,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_created ON audit_events(created_at DESC);
CREATE INDEX idx_audit_entity ON audit_events(entity_type, entity_id);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();

CREATE TRIGGER grievances_updated_at
  BEFORE UPDATE ON grievances
  FOR EACH ROW EXECUTE PROCEDURE set_updated_at();
