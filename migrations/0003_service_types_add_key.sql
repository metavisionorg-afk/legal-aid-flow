ALTER TABLE "service_types" ADD COLUMN "key" text;
--> statement-breakpoint

UPDATE "service_types"
SET "key" = COALESCE(
  NULLIF(
    regexp_replace(lower(coalesce(name_en, name_ar)), '[^a-z0-9]+' , '_', 'g'),
    ''
  ),
  'service_type_' || id
)
WHERE "key" IS NULL;
--> statement-breakpoint

ALTER TABLE "service_types" ALTER COLUMN "key" SET NOT NULL;
--> statement-breakpoint

CREATE UNIQUE INDEX IF NOT EXISTS "service_types_key_unique" ON "service_types" ("key");
--> statement-breakpoint
