-- Migration: Add Zoom Meetings Integration (Additive Only)
-- No changes to existing tables (sessions, cases, etc.)

CREATE TABLE IF NOT EXISTS integrations_zoom_meetings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  meeting_id VARCHAR NOT NULL, -- Zoom meeting ID
  join_url TEXT NOT NULL, -- Join URL for participants
  provider VARCHAR NOT NULL DEFAULT 'zoom', -- Future-proof for other providers
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  
  -- Ensure one Zoom meeting per session
  UNIQUE(session_id, provider)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS integrations_zoom_meetings_session_id_idx ON integrations_zoom_meetings(session_id);
CREATE INDEX IF NOT EXISTS integrations_zoom_meetings_provider_idx ON integrations_zoom_meetings(provider);

-- Add comment
COMMENT ON TABLE integrations_zoom_meetings IS 'Stores Zoom meeting integrations for court sessions (additive only, no changes to sessions table)';
