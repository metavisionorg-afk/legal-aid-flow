-- Migration: Add Zoom Integration Config Table (Additive Only)
-- Stores encrypted Zoom credentials in database
-- NO changes to existing tables

CREATE TABLE IF NOT EXISTS integrations_zoom_config (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id VARCHAR NOT NULL,
  client_id VARCHAR NOT NULL,
  client_secret_enc TEXT NOT NULL, -- AES-256-GCM encrypted
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by_user_id VARCHAR REFERENCES users(id)
);

-- Only one config row allowed (singleton pattern)
CREATE UNIQUE INDEX IF NOT EXISTS integrations_zoom_config_singleton_idx ON integrations_zoom_config ((1));

-- Add comment
COMMENT ON TABLE integrations_zoom_config IS 'Stores encrypted Zoom Server-to-Server OAuth credentials (additive only, singleton)';
COMMENT ON COLUMN integrations_zoom_config.client_secret_enc IS 'AES-256-GCM encrypted client secret';
