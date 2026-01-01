import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, pgEnum, boolean } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const userTypeEnum = pgEnum("user_type", ["staff", "beneficiary"]);
export const roleEnum = pgEnum("role", ["admin", "lawyer", "intake_officer", "viewer", "expert"]);
export const caseTypeEnum = pgEnum("case_type", ["civil", "criminal", "family", "labor", "asylum"]);
export const caseStatusEnum = pgEnum("case_status", ["open", "in_progress", "pending", "closed", "urgent"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const intakeStatusEnum = pgEnum("intake_status", ["pending", "approved", "rejected", "under_review"]);
export const beneficiaryStatusEnum = pgEnum("beneficiary_status", ["active", "pending", "archived"]);
export const appointmentTypeEnum = pgEnum("appointment_type", ["online", "in_person"]);
export const appointmentStatusEnum = pgEnum("appointment_status", ["pending", "confirmed", "cancelled", "completed"]);

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
  beneficiaryId: varchar("beneficiary_id").references(() => beneficiaries.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
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
  fullName: text("full_name").notNull(),
  idNumber: text("id_number").notNull().unique(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
  dateOfBirth: timestamp("date_of_birth"),
  nationality: text("nationality"),
  gender: text("gender"),
  status: beneficiaryStatusEnum("status").notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const insertBeneficiarySchema = createInsertSchema(beneficiaries).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBeneficiary = z.infer<typeof insertBeneficiarySchema>;
export type Beneficiary = typeof beneficiaries.$inferSelect;

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
  status: caseStatusEnum("status").notNull().default("open"),
  priority: priorityEnum("priority").notNull().default("medium"),
  assignedLawyerId: varchar("assigned_lawyer_id").references(() => users.id),
  internalNotes: text("internal_notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
  closedAt: timestamp("closed_at"),
});

export const insertCaseSchema = createInsertSchema(cases).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertCase = z.infer<typeof insertCaseSchema>;
export type Case = typeof cases.$inferSelect;

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
