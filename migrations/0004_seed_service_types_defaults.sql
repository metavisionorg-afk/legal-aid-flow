INSERT INTO "service_types" ("key", "name_ar", "name_en", "is_active") VALUES
  ('legal_consultation', 'استشارة قانونية', 'Legal consultation', true),
  ('court_representation', 'تمثيل أمام المحكمة', 'Court representation', true),
  ('contract_drafting_review', 'صياغة/مراجعة عقد', 'Contract drafting/review', true),
  ('complaint_drafting', 'صياغة شكوى', 'Complaint drafting', true),
  ('other', 'أخرى', 'Other', true)
ON CONFLICT ("key") DO UPDATE
SET
  "name_ar" = EXCLUDED."name_ar",
  "name_en" = EXCLUDED."name_en";
--> statement-breakpoint
