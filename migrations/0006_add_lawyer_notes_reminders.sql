-- Phase 6: Lawyer Portal - Notes & Reminders (Additive-only, isolated tables)

-- Lawyer Case Notes (private notes for lawyers on their cases)
CREATE TABLE IF NOT EXISTS lawyer_case_notes (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  case_id VARCHAR NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  lawyer_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  note_text TEXT NOT NULL,
  is_pinned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawyer_case_notes_case_id_idx ON lawyer_case_notes(case_id);
CREATE INDEX IF NOT EXISTS lawyer_case_notes_lawyer_id_idx ON lawyer_case_notes(lawyer_id);
CREATE INDEX IF NOT EXISTS lawyer_case_notes_created_at_idx ON lawyer_case_notes(created_at DESC);

-- Lawyer Session Reminders (personal reminders for lawyers)
CREATE TABLE IF NOT EXISTS lawyer_session_reminders (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id VARCHAR NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  lawyer_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reminder_time TIMESTAMP NOT NULL,
  note TEXT,
  is_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lawyer_session_reminders_session_id_idx ON lawyer_session_reminders(session_id);
CREATE INDEX IF NOT EXISTS lawyer_session_reminders_lawyer_id_idx ON lawyer_session_reminders(lawyer_id);
CREATE INDEX IF NOT EXISTS lawyer_session_reminders_time_idx ON lawyer_session_reminders(reminder_time);
CREATE INDEX IF NOT EXISTS lawyer_session_reminders_is_sent_idx ON lawyer_session_reminders(is_sent);
