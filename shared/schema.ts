import { sql } from "drizzle-orm";
import { pgTable, text, varchar, timestamp, integer, pgEnum } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod";

// Enums
export const roleEnum = pgEnum("role", ["admin", "lawyer", "intake_officer", "viewer"]);
export const caseTypeEnum = pgEnum("case_type", ["civil", "criminal", "family", "labor", "asylum"]);
export const caseStatusEnum = pgEnum("case_status", ["open", "in_progress", "pending", "closed", "urgent"]);
export const priorityEnum = pgEnum("priority", ["low", "medium", "high", "urgent"]);
export const intakeStatusEnum = pgEnum("intake_status", ["pending", "approved", "rejected", "under_review"]);
export const beneficiaryStatusEnum = pgEnum("beneficiary_status", ["active", "pending", "archived"]);

// Users table
export const users = pgTable("users", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  username: text("username").notNull().unique(),
  password: text("password").notNull(),
  fullName: text("full_name").notNull(),
  email: text("email").notNull().unique(),
  role: roleEnum("role").notNull().default("viewer"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertUserSchema = createInsertSchema(users).omit({ id: true, createdAt: true });
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof users.$inferSelect;

// Beneficiaries table
export const beneficiaries = pgTable("beneficiaries", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  fullName: text("full_name").notNull(),
  idNumber: text("id_number").notNull().unique(),
  phone: text("phone").notNull(),
  email: text("email"),
  address: text("address"),
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
