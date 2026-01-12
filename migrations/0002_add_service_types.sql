CREATE TABLE "service_types" (
	"id" varchar PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_ar" text NOT NULL,
	"name_en" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
