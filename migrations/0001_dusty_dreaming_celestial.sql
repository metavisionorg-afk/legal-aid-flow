ALTER TYPE "public"."service_type" ADD VALUE 'case_filing';--> statement-breakpoint
ALTER TYPE "public"."service_type" ADD VALUE 'contract_review';--> statement-breakpoint
ALTER TYPE "public"."service_type" ADD VALUE 'representation';--> statement-breakpoint
ALTER TYPE "public"."service_type" ADD VALUE 'mediation';--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD COLUMN "national_id" text;--> statement-breakpoint
ALTER TABLE "beneficiaries" ADD COLUMN "birth_date" date;