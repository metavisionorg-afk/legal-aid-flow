-- Phase 6: Lawyer Portal - Notes & Reminders (Additive-only, isolated)
-- These tables are isolated and reference existing tables via foreign keys only

-- Lawyer Case Notes (private notes for lawyers on their cases)
CREATE TABLE IF NOT EXISTS "lawyer_case_notes" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"case_id" varchar NOT NULL,
	"lawyer_id" varchar NOT NULL,
	"note_text" text NOT NULL,
	"is_pinned" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);

-- Lawyer Session Reminders (personal reminders for lawyers)
CREATE TABLE IF NOT EXISTS "lawyer_session_reminders" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" varchar NOT NULL,
	"lawyer_id" varchar NOT NULL,
	"reminder_time" timestamp NOT NULL,
	"note" text,
	"is_sent" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);

-- Foreign key constraints (reference existing tables)
ALTER TABLE "lawyer_case_notes" ADD CONSTRAINT "lawyer_case_notes_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "cases"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lawyer_case_notes" ADD CONSTRAINT "lawyer_case_notes_lawyer_id_users_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

ALTER TABLE "lawyer_session_reminders" ADD CONSTRAINT "lawyer_session_reminders_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "lawyer_session_reminders" ADD CONSTRAINT "lawyer_session_reminders_lawyer_id_users_id_fk" FOREIGN KEY ("lawyer_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "lawyer_case_notes_case_id_idx" ON "lawyer_case_notes" ("case_id");
CREATE INDEX IF NOT EXISTS "lawyer_case_notes_lawyer_id_idx" ON "lawyer_case_notes" ("lawyer_id");
CREATE INDEX IF NOT EXISTS "lawyer_case_notes_created_at_idx" ON "lawyer_case_notes" ("created_at");

CREATE INDEX IF NOT EXISTS "lawyer_session_reminders_session_id_idx" ON "lawyer_session_reminders" ("session_id");
CREATE INDEX IF NOT EXISTS "lawyer_session_reminders_lawyer_id_idx" ON "lawyer_session_reminders" ("lawyer_id");
CREATE INDEX IF NOT EXISTS "lawyer_session_reminders_time_idx" ON "lawyer_session_reminders" ("reminder_time");
CREATE INDEX IF NOT EXISTS "lawyer_session_reminders_is_sent_idx" ON "lawyer_session_reminders" ("is_sent");
