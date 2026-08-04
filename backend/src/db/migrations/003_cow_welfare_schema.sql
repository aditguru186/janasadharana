-- Columns + indexes for cow welfare (runs after enum value is committed)

ALTER TABLE grievances
  ADD COLUMN IF NOT EXISTS media JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS source VARCHAR(40) NOT NULL DEFAULT 'web';

COMMENT ON COLUMN grievances.media IS
  'Array of {type: image|voice, mime, filename, path, sizeBytes} for cow welfare and future uploads';
COMMENT ON COLUMN grievances.source IS
  'Origin channel: web | cow_welfare | mobile | admin';

CREATE INDEX IF NOT EXISTS idx_grievances_source ON grievances(source);
CREATE INDEX IF NOT EXISTS idx_grievances_cow ON grievances(category, status, created_at DESC)
  WHERE category = 'cow_welfare';
