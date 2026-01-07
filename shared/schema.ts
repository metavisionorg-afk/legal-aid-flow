import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, pgEnum, boolean, date } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userTypeEnum = pgEnum("user_type", ["staff", "beneficiary"]);
export const roleEnum = pgEnum("role", ["super_admin", "admin", "lawyer", "intake_officer", "viewer", "expert", "beneficiary"]);
export const caseTypeEnum = pgEnum("case_type", ["civil", "criminal", "family", "labor", "asylum"]);
// NOTE: Keep legacy statuses to avoid destructive enum drops in existing DBs.
// New workflow statuses are appended for add-only migrations.
export const caseStatusEnum = pgEnum("case_status", [
  // Legacy
  "open",
  "in_progress",
  "pending",
  "closed",
  "urgent",
  // Workflow (Stage: case workflow)
  "pending_admin_review",
  "accepted",
  "rejected",
  "assigned",
  "awaiting_documents",
  "awaiting_hearing",
  "on_hold",
  "completed",
  "cancelled",
  // Workflow (Requested - Stage 0)
  // Appended for add-only migrations.
  "pending_review",
  "accepted_pending_assignment",
  "awaiting_judgment",
  "closed_admin",
]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const intakeStatusEnum = pgEnum("intake_status", ["pending", "approved", "rejected", "under_review"]);
export const beneficiaryStatusEnum = pgEnum("beneficiary_status", ["active", "pending", "archived"]);
export const appointmentTypeEnum = pgEnum("appointment_type", ["online", "in_person"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["pending", "confirmed", "cancelled", "completed"]);
export const taskStatusEnum = pgEnum("task_status", ["pending", "in_progress", "completed", "cancelled"]);
export const taskTypeEnum = pgEnum("task_type", ["follow_up", "document_preparation", "court_appearance", "client_meeting", "research", "other"]);
export const paymentMethodEnum = pgEnum("payment_method", ["cash", "transfer", "sadad", "cheque"]);
export const voucherTypeEnum = pgEnum("voucher_type", ["receipt", "disbursement"]);
export const templateTypeEnum = pgEnum("template_type", ["settlement", "voucher", "acknowledgement", "invoice", "contract"]);
export const genderEnum = pgEnum("gender", ["male", "female"]);
export const preferredContactEnum = pgEnum("preferred_contact", ["whatsapp", "phone", "email"]);
export const preferredLanguageEnum = pgEnum("preferred_language", ["ar", "en"]);
export const serviceTypeEnum = pgEnum("service_type", [
  "legal_consultation",
  "court_representation",
  "contract_drafting_review",
  "complaint_drafting",
  "family_case",
  "labor_case",
  "criminal_case",
  "commercial_case",
  "civil_compensation_case",
  "administrative_case",
  "judgment_enforcement",
  "rental_disputes",
  "inheritance_estates",
  "other",
  // Stage 2 (UI-friendly service types)
  "case_filing",
  "contract_review",
  "representation",
  "mediation",
]);
export const serviceRequestStatusEnum = pgEnum("service_request_status", ["new", "in_review", "accepted", "rejected"]);
export const documentOwnerTypeEnum = pgEnum("document_owner_type", ["beneficiary"]);
export const documentVisibilityEnum = pgEnum("document_visibility", ["INTERNAL", "BENEFICIARY"]);
export const permissionEnum = pgEnum("permission", [
  "view_dashboard", "manage_users", "manage_beneficiaries", "manage_cases",
  "manage_intake", "manage_tasks", "manage_finance", "manage_documents",
  "manage_templates", "manage_settings", "view_reports", "manage_consultations",
  "manage_power_of_attorney", "manage_sessions",
  "beneficiary:self:read",
  "beneficiary:self:update",
  "cases:self:read",
  "cases:self:create",
  "documents:self:create",
  "intake:self:create"
]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  userType: userTypeEnum("user_type").notNull().default("staff"),
  role: roleEnum("role").notNull().default("viewer"),
  emailVerified: boolean("email_verified").notNull().default(false),
  verificationToken: text("verification_token"),
  // Legacy columns present in some DBs; kept to avoid destructive drops
  beneficiaryId: varchar("beneficiary_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  isActive: boolean("is_active").notNull().default(true),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Expert Profiles table
export const expertProfiles = pgTable("expert_profiles", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  bio: text("bio"),
  specialties: text("specialties").array(),
  languages: text("languages").array(),
  photoUrl: text("photo_url"),
  isAvailableForBooking: boolean("is_available_for_booking").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertExpertProfileSchema = createInsertSchema(expertProfiles).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertExpertProfile = z.infer<typeof insertExpertProfileSchema>;
export type ExpertProfile = typeof expertProfiles.$inferSelect;

// Beneficiaries table
export const beneficiaries = pgTable("beneficiaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").references(() => users.id).unique(),
  fullName: text("full_name").notNull(),
  // Stage 2: optional national id (system-dependent)
  nationalId: text("national_id"),
  idNumber: text("id_number").notNull().unique(),
  phone: text("phone").notNull(),
  email: text("email"),
  city: text("city"),
  region: text("region"),
  address: text("address"),
  dateOfBirth: timestamp("date_of_birth"),
  // Stage 2: birth date alias (kept separate for backwards compatibility)
  birthDate: date("birth_date"),
  nationality: text("nationality"),
  gender: genderEnum("gender"),
  serviceType: serviceTypeEnum("service_type"),
  maritalStatus: text("marital_status"),
  dependentsCount: integer("dependents_count"),
  employmentStatus: text("employment_status"),
  monthlyIncomeRange: text("monthly_income_range"),
  educationLevel: text("education_level"),
  specialNeeds: boolean("special_needs").notNull().default(false),
  specialNeedsDetails: text("special_needs_details"),
  hasLawyerBefore: boolean("has_lawyer_before").notNull().default(false),
  hasLawyerBeforeDetails: text("has_lawyer_before_details"),
  preferredContact: preferredContactEnum("preferred_contact"),
  preferredLanguage: preferredLanguageEnum("preferred_language"),
  roleCapacity: text("role_capacity"),
  attachments: text("attachments").array(),
  // Legacy notes column present in some DBs; kept to avoid destructive drops
  notes: text("notes"),
  status: beneficiaryStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBeneficiarySchema = createInsertSchema(beneficiaries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBeneficiary = z.infer<typeof insertBeneficiarySchema>;
export type Beneficiary = typeof beneficiaries.$inferSelect;

// Service Requests table (Beneficiary self-service requests)
export const serviceRequests = pgTable("service_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => beneficiaries.id),
  serviceType: serviceTypeEnum("service_type").notNull(),
  serviceTypeOther: text("service_type_other"),
  issueSummary: text("issue_summary").notNull(),
  issueDetails: text("issue_details"),
  urgent: boolean("urgent").notNull().default(false),
  urgentDate: timestamp("urgent_date"),
  status: serviceRequestStatusEnum("status").notNull().default("new"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertServiceRequestSchema = createInsertSchema(serviceRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertServiceRequest = z.infer<typeof insertServiceRequestSchema>;
export type ServiceRequest = typeof serviceRequests.$inferSelect;

// Intake Requests table
export const intakeRequests = pgTable("intake_requests", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => beneficiaries.id),
  caseType: caseTypeEnum("case_type").notNull(),
  description: text("description").notNull(),
  status: intakeStatusEnum("status").notNull().default("pending"),
  reviewedBy: varchar("reviewed_by").references(() => users.id),
  reviewNotes: text("review_notes"),
  documents: text("documents").array(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertIntakeRequestSchema = createInsertSchema(intakeRequests).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertIntakeRequest = z.infer<typeof insertIntakeRequestSchema>;
export type IntakeRequest = typeof intakeRequests.$inferSelect;

// Cases table
export const cases = pgTable("cases", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseNumber: text("case_number").notNull().unique(),
  title: text("title").notNull(),
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => beneficiaries.id),
  caseType: caseTypeEnum("case_type").notNull(),
  description: text("description").notNull(),
  opponentName: text("opponent_name"),
  opponentLawyer: text("opponent_lawyer"),
  opponentContact: text("opponent_contact"),
  status: caseStatusEnum("status").notNull().default("open"),
  priority: priorityEnum("priority").notNull().default("medium"),
  assignedLawyerId: varchar("assigned_lawyer_id").references(() => users.id),
  acceptedByUserId: varchar("accepted_by_user_id").references(() => users.id),
  acceptedAt: timestamp("accepted_at"),
  internalNotes: text("internal_notes"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
  // Legacy workflow/stage columns present in some DBs; kept to avoid destructive drops
  workflowId: varchar("workflow_id"),
  stageKey: text("stage_key"),
  stageUpdatedAt: timestamp("stage_updated_at"),
});

export const insertCaseSchema = createInsertSchema(cases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;

// Case Timeline Events (audit trail for workflow changes)
export const caseTimelineEventTypeEnum = pgEnum("case_timeline_event_type", [
  "created",
  "approved",
  "rejected",
  "assigned_lawyer",
  "lawyer_assigned",
  "status_changed",
]);

export const caseTimelineEvents = pgTable("case_timeline_events", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => cases.id),
  eventType: caseTimelineEventTypeEnum("event_type").notNull(),
  fromStatus: caseStatusEnum("from_status"),
  toStatus: caseStatusEnum("to_status"),
  note: text("note"),
  actorUserId: varchar("actor_user_id").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertCaseTimelineEventSchema = createInsertSchema(caseTimelineEvents).omit({
  id: true,
  createdAt: true,
});
export type InsertCaseTimelineEvent = z.infer<typeof insertCaseTimelineEventSchema>;
export type CaseTimelineEvent = typeof caseTimelineEvents.$inferSelect;

// Case Details table (extended case information)
export const caseDetails = pgTable("case_details", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id")
    .notNull()
    .references(() => cases.id)
    .unique(),
  issueSummary: text("issue_summary").notNull(),
  issueDetails: text("issue_details"),
  urgency: boolean("urgency").notNull().default(false),
  urgencyDate: timestamp("urgency_date"),
  jurisdiction: text("jurisdiction"),
  relatedLaws: text("related_laws"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertCaseDetailsSchema = createInsertSchema(caseDetails).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertCaseDetails = z.infer<typeof insertCaseDetailsSchema>;
export type CaseDetails = typeof caseDetails.$inferSelect;

// Hearings table
export const hearings = pgTable("hearings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => cases.id),
  title: text("title").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  location: text("location"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertHearingSchema = createInsertSchema(hearings).omit({ id: true, createdAt: true });
export type InsertHearing = z.infer<typeof insertHearingSchema>;
export type Hearing = typeof hearings.$inferSelect;

// Appointments table
export const appointments = pgTable("appointments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => beneficiaries.id),
  expertId: varchar("expert_id").notNull().references(() => users.id),
  appointmentType: appointmentTypeEnum("appointment_type").notNull(),
  scheduledDate: timestamp("scheduled_date").notNull(),
  duration: integer("duration").notNull().default(60),
  status: appointmentStatusEnum("status").notNull().default("pending"),
  topic: text("topic").notNull(),
  notes: text("notes"),
  location: text("location"),
  meetingLink: text("meeting_link"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertAppointmentSchema = createInsertSchema(appointments).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertAppointment = z.infer<typeof insertAppointmentSchema>;
export type Appointment = typeof appointments.$inferSelect;

// Availability Slots table
export const availabilitySlots = pgTable("availability_slots", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  expertId: varchar("expert_id").notNull().references(() => users.id),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: text("start_time").notNull(),
  endTime: text("end_time").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAvailabilitySlotSchema = createInsertSchema(availabilitySlots).omit({ id: true, createdAt: true });
export type InsertAvailabilitySlot = z.infer<typeof insertAvailabilitySlotSchema>;
export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;

// Notifications table
export const notifications = pgTable("notifications", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: text("type").notNull(),
  title: text("title").notNull(),
  message: text("message").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  relatedEntityId: text("related_entity_id"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(notifications).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notifications.$inferSelect;

// Audit Log table
export const auditLog = pgTable("audit_log", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  action: text("action").notNull(),
  entity: text("entity").notNull(),
  entityId: text("entity_id"),
  details: text("details"),
  ipAddress: text("ip_address"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertAuditLogSchema = createInsertSchema(auditLog).omit({ id: true, createdAt: true });
export type InsertAuditLog = z.infer<typeof insertAuditLogSchema>;
export type AuditLog = typeof auditLog.$inferSelect;

// System Settings table
export const systemSettings = pgTable("system_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  orgName: text("org_name").notNull().default("Adala Legal Aid"),
  orgLogoUrl: text("org_logo_url"),
  vatPercentage: integer("vat_percentage").notNull().default(15),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  address: text("address"),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSystemSettingsSchema = createInsertSchema(systemSettings).omit({ id: true, updatedAt: true });
export type InsertSystemSettings = z.infer<typeof insertSystemSettingsSchema>;
export type SystemSettings = typeof systemSettings.$inferSelect;

// Rules table (permission bundles)
export const rules = pgTable("rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull().unique(),
  description: text("description"),
  permissions: text("permissions").array().notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertRuleSchema = createInsertSchema(rules).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertRule = z.infer<typeof insertRuleSchema>;
export type Rule = typeof rules.$inferSelect;

// User Rules junction table
export const userRules = pgTable("user_rules", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  ruleId: varchar("rule_id").notNull().references(() => rules.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserRuleSchema = createInsertSchema(userRules).omit({ id: true, createdAt: true });
export type InsertUserRule = z.infer<typeof insertUserRuleSchema>;
export type UserRule = typeof userRules.$inferSelect;

// Tasks table
export const tasks = pgTable("tasks", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  taskType: taskTypeEnum("task_type").notNull(),
  assignedTo: varchar("assigned_to").notNull().references(() => users.id),
  assignedBy: varchar("assigned_by").notNull().references(() => users.id),
  caseId: varchar("case_id").references(() => cases.id),
  status: taskStatusEnum("status").notNull().default("pending"),
  priority: priorityEnum("priority").notNull().default("medium"),
  dueDate: timestamp("due_date"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTaskSchema = createInsertSchema(tasks).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTask = z.infer<typeof insertTaskSchema>;
export type Task = typeof tasks.$inferSelect;

// Sessions table (court sessions with Hijri/Gregorian dates)
export const sessions = pgTable("sessions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  caseId: varchar("case_id").notNull().references(() => cases.id),
  title: text("title").notNull(),
  sessionNumber: integer("session_number"),
  gregorianDate: timestamp("gregorian_date").notNull(),
  hijriDate: text("hijri_date"),
  location: text("location"),
  notes: text("notes"),
  outcome: text("outcome"),
  nextSessionDate: timestamp("next_session_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertSessionSchema = createInsertSchema(sessions).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertSession = z.infer<typeof insertSessionSchema>;
export type Session = typeof sessions.$inferSelect;

// Consultations table
export const consultations = pgTable("consultations", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  consultationNumber: text("consultation_number").notNull().unique(),
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => beneficiaries.id),
  lawyerId: varchar("lawyer_id").references(() => users.id),
  topic: text("topic").notNull(),
  description: text("description").notNull(),
  consultationType: text("consultation_type"),
  status: text("status").notNull().default("pending"),
  scheduledDate: timestamp("scheduled_date"),
  notes: text("notes"),
  followUpRequired: boolean("follow_up_required").default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertConsultationSchema = createInsertSchema(consultations).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConsultation = z.infer<typeof insertConsultationSchema>;
export type Consultation = typeof consultations.$inferSelect;

// Power of Attorney table
export const powerOfAttorney = pgTable("power_of_attorney", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  poaNumber: text("poa_number").notNull().unique(),
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => beneficiaries.id),
  lawyerId: varchar("lawyer_id").references(() => users.id),
  caseId: varchar("case_id").references(() => cases.id),
  issueDate: timestamp("issue_date").notNull(),
  expiryDate: timestamp("expiry_date"),
  scope: text("scope").notNull(),
  restrictions: text("restrictions"),
  isActive: boolean("is_active").notNull().default(true),
  documentUrl: text("document_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertPowerOfAttorneySchema = createInsertSchema(powerOfAttorney).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertPowerOfAttorney = z.infer<typeof insertPowerOfAttorneySchema>;
export type PowerOfAttorney = typeof powerOfAttorney.$inferSelect;

// Contracts table
export const contracts = pgTable("contracts", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractNumber: text("contract_number").notNull().unique(),
  caseId: varchar("case_id").notNull().references(() => cases.id),
  beneficiaryId: varchar("beneficiary_id").notNull().references(() => beneficiaries.id),
  contractValue: integer("contract_value").notNull(),
  vatAmount: integer("vat_amount").notNull().default(0),
  totalAmount: integer("total_amount").notNull(),
  paidAmount: integer("paid_amount").notNull().default(0),
  remainingAmount: integer("remaining_amount").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  signedDate: timestamp("signed_date"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertContractSchema = createInsertSchema(contracts).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertContract = z.infer<typeof insertContractSchema>;
export type Contract = typeof contracts.$inferSelect;

// Installments table
export const installments = pgTable("installments", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  contractId: varchar("contract_id").notNull().references(() => contracts.id),
  installmentNumber: integer("installment_number").notNull(),
  amount: integer("amount").notNull(),
  dueDate: timestamp("due_date").notNull(),
  paidDate: timestamp("paid_date"),
  status: text("status").notNull().default("pending"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertInstallmentSchema = createInsertSchema(installments).omit({ id: true, createdAt: true });
export type InsertInstallment = z.infer<typeof insertInstallmentSchema>;
export type Installment = typeof installments.$inferSelect;

// Vouchers table (receipts and disbursements)
export const vouchers = pgTable("vouchers", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  voucherNumber: text("voucher_number").notNull().unique(),
  voucherType: voucherTypeEnum("voucher_type").notNull(),
  beneficiaryId: varchar("beneficiary_id").references(() => beneficiaries.id),
  caseId: varchar("case_id").references(() => cases.id),
  contractId: varchar("contract_id").references(() => contracts.id),
  amount: integer("amount").notNull(),
  paymentMethod: paymentMethodEnum("payment_method").notNull(),
  description: text("description").notNull(),
  issuedBy: varchar("issued_by").notNull().references(() => users.id),
  issuedDate: timestamp("issued_date").notNull().defaultNow(),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertVoucherSchema = createInsertSchema(vouchers).omit({ id: true, createdAt: true });
export type InsertVoucher = z.infer<typeof insertVoucherSchema>;
export type Voucher = typeof vouchers.$inferSelect;

// Documents Library table
export const documents = pgTable("documents", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  title: text("title").notNull(),
  description: text("description"),
  fileUrl: text("file_url").notNull(),
  fileType: text("file_type").notNull(),
  fileSize: integer("file_size"),
  category: text("category"),
  tags: text("tags").array(),
  uploadedBy: varchar("uploaded_by").notNull().references(() => users.id),
  beneficiaryId: varchar("beneficiary_id").references(() => beneficiaries.id),
  caseId: varchar("case_id").references(() => cases.id),
  ownerType: documentOwnerTypeEnum("owner_type"),
  ownerId: varchar("owner_id"),
  requestId: varchar("request_id").references(() => serviceRequests.id),
  storageKey: text("storage_key"),
  fileName: text("file_name"),
  mimeType: text("mime_type"),
  size: integer("size"),
  isPublic: boolean("is_public").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  // Legacy visibility column present in some DBs; kept to avoid destructive drops
  visibility: documentVisibilityEnum("visibility").notNull().default("INTERNAL"),
});

export const insertDocumentSchema = createInsertSchema(documents).omit({ id: true, createdAt: true });
export type InsertDocument = z.infer<typeof insertDocumentSchema>;
export type Document = typeof documents.$inferSelect;

// ====== Shared payload schemas (client + server) ======

export const uploadedFileMetadataSchema = z.object({
  storageKey: z.string().min(1),
  fileUrl: z.string().min(1),
  fileName: z.string().min(1),
  mimeType: z.string().min(1),
  size: z.number().int().nonnegative(),
});

// Stage 3: simple public beneficiary self-registration payload (flat fields)
export const registerBeneficiarySimpleSchema = z
  .object({
    username: z.string().min(1).optional().nullable(),
    email: z.string().email(),
    password: z
      .string()
      .min(8)
      .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/, "Password must include uppercase, lowercase, and a number"),
    confirmPassword: z.string().min(8),
    fullName: z.string().min(1),
    phone: z.string().min(1),
    city: z.string().min(1),
    preferredLanguage: z.enum(["ar", "en"]),
    serviceType: z.enum([
      "legal_consultation",
      "case_filing",
      "contract_review",
      "representation",
      "mediation",
      "other",
    ]),
    nationalId: z.string().optional().nullable(),
    address: z.string().optional().nullable(),
    birthDate: z.string().optional().nullable(),
    gender: z.enum(["male", "female"]).optional().nullable(),
    nationality: z.string().optional().nullable(),
    notes: z.string().optional().nullable(),
    details: z.string().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (data.password !== data.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["confirmPassword"],
        message: "Passwords do not match",
      });
    }
  });

export const registerBeneficiarySchema = z
  .object({
    account: z.object({
      fullName: z.string().min(1),
      phone: z.string().min(1),
      email: z.string().email(),
      password: z.string().min(8),
      confirmPassword: z.string().min(8),
    }),
    profile: z.object({
      idNumber: z.string().min(1),
      dateOfBirth: z.string().optional().nullable(),
      gender: z.enum(["male", "female"]).optional().nullable(),
      nationality: z.string().optional().nullable(),
      city: z.string().optional().nullable(),
      region: z.string().optional().nullable(),
      address: z.string().optional().nullable(),
      maritalStatus: z.string().optional().nullable(),
      dependentsCount: z.number().int().min(0).optional().nullable(),
      employmentStatus: z.string().optional().nullable(),
      monthlyIncomeRange: z.string().optional().nullable(),
      educationLevel: z.string().optional().nullable(),
      specialNeeds: z.boolean().optional().default(false),
      specialNeedsDetails: z.string().optional().nullable(),
      hasLawyerBefore: z.boolean().optional().default(false),
      hasLawyerBeforeDetails: z.string().optional().nullable(),
      preferredContact: z.enum(["whatsapp", "phone", "email"]).optional().nullable(),
      preferredLanguage: z.enum(["ar", "en"]).optional().nullable(),
    }),
    serviceRequest: z.object({
      serviceType: z.enum([
        "legal_consultation",
        "court_representation",
        "contract_drafting_review",
        "complaint_drafting",
        "family_case",
        "labor_case",
        "criminal_case",
        "commercial_case",
        "civil_compensation_case",
        "administrative_case",
        "judgment_enforcement",
        "rental_disputes",
        "inheritance_estates",
        "other",
        // Stage 2 (UI-friendly service types)
        "case_filing",
        "contract_review",
        "representation",
        "mediation",
      ]),
      serviceTypeOther: z.string().optional().nullable(),
      issueSummary: z.string().min(1),
      issueDetails: z.string().optional().nullable(),
      urgent: z.boolean().optional().default(false),
      urgentDate: z.string().optional().nullable(),
      documents: z.array(uploadedFileMetadataSchema).optional().default([]),
    }),
  })
  .superRefine((data, ctx) => {
    if (data.account.password !== data.account.confirmPassword) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["account", "confirmPassword"],
        message: "Passwords do not match",
      });
    }

    if (data.profile.specialNeeds && !data.profile.specialNeedsDetails?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["profile", "specialNeedsDetails"],
        message: "Details are required",
      });
    }

    if (data.profile.hasLawyerBefore && !data.profile.hasLawyerBeforeDetails?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["profile", "hasLawyerBeforeDetails"],
        message: "Details are required",
      });
    }

    if (data.serviceRequest.serviceType === "other" && !data.serviceRequest.serviceTypeOther?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceRequest", "serviceTypeOther"],
        message: "Please specify",
      });
    }

    if (data.serviceRequest.urgent && !data.serviceRequest.urgentDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["serviceRequest", "urgentDate"],
        message: "Urgent date is required",
      });
    }
  });

export type RegisterBeneficiaryPayload = z.infer<typeof registerBeneficiarySchema>;

// Templates table
export const templates = pgTable("templates", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  templateType: templateTypeEnum("template_type").notNull(),
  content: text("content").notNull(),
  variables: text("variables").array(),
  isActive: boolean("is_active").notNull().default(true),
  createdBy: varchar("created_by").notNull().references(() => users.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertTemplateSchema = createInsertSchema(templates).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertTemplate = z.infer<typeof insertTemplateSchema>;
export type Template = typeof templates.$inferSelect;
