-- Simplify judicial service status enum to: new | in_review | accepted | rejected
-- This migration maps legacy workflow statuses onto the simplified set.

BEGIN;

-- 1) Create the new enum type.
CREATE TYPE judicial_service_status_new AS ENUM ('new', 'in_review', 'accepted', 'rejected');

-- 2) Drop default temporarily to allow type swap.
ALTER TABLE judicial_services ALTER COLUMN status DROP DEFAULT;

-- 3) Map existing rows from legacy statuses to the new 4-state model.
UPDATE judicial_services
SET status = CASE
  WHEN status = 'pending_review' THEN 'new'
  WHEN status = 'in_progress' THEN 'accepted'
  WHEN status = 'awaiting_documents' THEN 'accepted'
  WHEN status = 'assigned' THEN 'accepted'
  WHEN status = 'completed' THEN 'accepted'
  WHEN status = 'cancelled' THEN 'rejected'
  WHEN status = 'accepted' THEN 'accepted'
  WHEN status = 'rejected' THEN 'rejected'
  ELSE 'new'
END;

-- 4) Convert column to the new enum type.
ALTER TABLE judicial_services
  ALTER COLUMN status TYPE judicial_service_status_new
  USING status::text::judicial_service_status_new;

-- 5) Replace the old enum type.
DROP TYPE judicial_service_status;
ALTER TYPE judicial_service_status_new RENAME TO judicial_service_status;

-- 6) Set new default.
ALTER TABLE judicial_services ALTER COLUMN status SET DEFAULT 'new';

COMMIT;
