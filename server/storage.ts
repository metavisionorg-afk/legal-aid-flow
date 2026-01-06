import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq, desc, and, sql, gte, lte } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User,
  InsertUser,
  Beneficiary,
  InsertBeneficiary,
  ServiceRequest,
  InsertServiceRequest,
  Document,
  InsertDocument,
  IntakeRequest,
  InsertIntakeRequest,
  Case,
  InsertCase,
  Hearing,
  InsertHearing,
  AuditLog,
  InsertAuditLog,
  ExpertProfile,
  InsertExpertProfile,
  Appointment,
  InsertAppointment,
  AvailabilitySlot,
  InsertAvailabilitySlot,
  Notification,
  InsertNotification,
  SystemSettings,
  InsertSystemSettings,
  Rule,
  InsertRule,
  UserRule,
  InsertUserRule,
  Task,
  InsertTask,
  Session,
  InsertSession,
} from "@shared/schema";

const connectionString =
  process.env.DATABASE_URL || (process.env.NODE_ENV === "production" ? "" : "postgresql:///legal_aidflow");

if (!connectionString) {
  throw new Error("DATABASE_URL is required in production");
}

const pool = new Pool({ connectionString });
const db = drizzle(pool, { schema });

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined>;
  getAllUsers(): Promise<User[]>;
  getStaffUsers(): Promise<User[]>;
  getExpertUsers(): Promise<User[]>;

  // Expert Profiles
  getExpertProfile(userId: string): Promise<ExpertProfile | undefined>;
  getAllExpertProfiles(): Promise<ExpertProfile[]>;
  createExpertProfile(profile: InsertExpertProfile): Promise<ExpertProfile>;
  updateExpertProfile(userId: string, updates: Partial<InsertExpertProfile>): Promise<ExpertProfile | undefined>;

  // Beneficiaries
  getBeneficiary(id: string): Promise<Beneficiary | undefined>;
  getBeneficiaryByUserId(userId: string): Promise<Beneficiary | undefined>;
  getBeneficiaryByIdNumber(idNumber: string): Promise<Beneficiary | undefined>;
  getAllBeneficiaries(): Promise<Beneficiary[]>;
  createBeneficiary(beneficiary: InsertBeneficiary): Promise<Beneficiary>;
  updateBeneficiary(id: string, beneficiary: Partial<InsertBeneficiary>): Promise<Beneficiary | undefined>;
  deleteBeneficiary(id: string): Promise<boolean>;

  // Service Requests (self-service)
  getServiceRequest(id: string): Promise<ServiceRequest | undefined>;
  getServiceRequestsByBeneficiary(beneficiaryId: string): Promise<ServiceRequest[]>;
  getAllServiceRequests(): Promise<ServiceRequest[]>;
  createServiceRequest(request: InsertServiceRequest): Promise<ServiceRequest>;
  updateServiceRequestStatus(id: string, status: ServiceRequest["status"]): Promise<ServiceRequest | undefined>;
  attachDocumentsToServiceRequest(input: {
    uploadedBy: string;
    beneficiaryId: string;
    requestId: string;
    documents: Array<{
      storageKey: string;
      fileUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }): Promise<Document[]>;

  createDocumentsForBeneficiary(input: {
    uploadedBy: string;
    beneficiaryId: string;
    documents: Array<{
      storageKey: string;
      fileUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }): Promise<Document[]>;

  createDocumentsForCase(input: {
    uploadedBy: string;
    beneficiaryId: string;
    caseId: string;
    isPublic: boolean;
    documents: Array<{
      storageKey: string;
      fileUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }): Promise<Document[]>;

  getDocumentsByCase(caseId: string): Promise<Document[]>;

  getDocumentsByCaseForBeneficiary(beneficiaryId: string, caseId: string): Promise<Document[]>;

  getDocumentsVisibleToBeneficiary(beneficiaryId: string): Promise<Document[]>;

  getDocumentsByBeneficiary(beneficiaryId: string): Promise<Document[]>;

  // Intake Requests
  getIntakeRequest(id: string): Promise<IntakeRequest | undefined>;
  getAllIntakeRequests(): Promise<IntakeRequest[]>;
  getIntakeRequestsByBeneficiary(beneficiaryId: string): Promise<IntakeRequest[]>;
  createIntakeRequest(request: InsertIntakeRequest): Promise<IntakeRequest>;
  updateIntakeRequest(id: string, request: Partial<InsertIntakeRequest>): Promise<IntakeRequest | undefined>;

  // Cases
  getCase(id: string): Promise<Case | undefined>;
  getAllCases(): Promise<Case[]>;
  getCasesByBeneficiary(beneficiaryId: string): Promise<Case[]>;
  getCasesByLawyer(lawyerId: string): Promise<Case[]>;
  createCase(caseData: InsertCase): Promise<Case>;
  updateCase(id: string, caseData: Partial<InsertCase>): Promise<Case | undefined>;
  deleteCase(id: string): Promise<boolean>;

  // Hearings
  getHearing(id: string): Promise<Hearing | undefined>;
  getAllHearings(): Promise<Hearing[]>;
  getHearingsByCase(caseId: string): Promise<Hearing[]>;
  createHearing(hearing: InsertHearing): Promise<Hearing>;
  updateHearing(id: string, hearing: Partial<InsertHearing>): Promise<Hearing | undefined>;
  deleteHearing(id: string): Promise<boolean>;

  // Appointments
  getAppointment(id: string): Promise<Appointment | undefined>;
  getAllAppointments(): Promise<Appointment[]>;
  getAppointmentsByBeneficiary(beneficiaryId: string): Promise<Appointment[]>;
  getAppointmentsByExpert(expertId: string): Promise<Appointment[]>;
  createAppointment(appointment: InsertAppointment): Promise<Appointment>;
  updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment | undefined>;
  deleteAppointment(id: string): Promise<boolean>;

  // Availability Slots
  getAvailabilitySlotsByExpert(expertId: string): Promise<AvailabilitySlot[]>;
  createAvailabilitySlot(slot: InsertAvailabilitySlot): Promise<AvailabilitySlot>;
  updateAvailabilitySlot(id: string, updates: Partial<InsertAvailabilitySlot>): Promise<AvailabilitySlot | undefined>;
  deleteAvailabilitySlot(id: string): Promise<boolean>;

  // Notifications
  getNotification(id: string): Promise<Notification | undefined>;
  getNotificationsByUser(userId: string): Promise<Notification[]>;
  getUnreadNotifications(userId: string): Promise<Notification[]>;
  createNotification(notification: InsertNotification): Promise<Notification>;
  markNotificationAsRead(id: string): Promise<Notification | undefined>;
  markAllNotificationsAsRead(userId: string): Promise<void>;

  // Audit Log
  createAuditLog(log: InsertAuditLog): Promise<AuditLog>;
  getAuditLogs(limit?: number): Promise<AuditLog[]>;

  // Dashboard Stats
  getDashboardStats(): Promise<{
    totalCases: number;
    activeCases: number;
    pendingIntake: number;
    upcomingHearings: number;
  }>;

  // Beneficiary Dashboard Stats
  getBeneficiaryDashboardStats(beneficiaryId: string): Promise<{
    totalCases: number;
    activeCases: number;
    pendingIntake: number;
    upcomingAppointments: number;
  }>;

  // System Settings
  getSystemSettings(): Promise<SystemSettings | undefined>;
  updateSystemSettings(settings: Partial<InsertSystemSettings>): Promise<SystemSettings>;

  // Rules (Permission bundles)
  getRule(id: string): Promise<Rule | undefined>;
  getRuleByName(name: string): Promise<Rule | undefined>;
  getAllRules(): Promise<Rule[]>;
  createRule(rule: InsertRule): Promise<Rule>;
  updateRule(id: string, updates: Partial<InsertRule>): Promise<Rule | undefined>;
  deleteRule(id: string): Promise<boolean>;

  // User Rules
  getUserRules(userId: string): Promise<Rule[]>;
  assignRuleToUser(userId: string, ruleId: string): Promise<UserRule>;
  removeRuleFromUser(userId: string, ruleId: string): Promise<boolean>;
  getUserPermissions(userId: string): Promise<string[]>;

  // Tasks
  getTask(id: string): Promise<Task | undefined>;
  getAllTasks(): Promise<Task[]>;
  getTasksByAssignee(userId: string): Promise<Task[]>;
  getTasksByCase(caseId: string): Promise<Task[]>;
  createTask(task: InsertTask): Promise<Task>;
  updateTask(id: string, updates: Partial<InsertTask>): Promise<Task | undefined>;
  deleteTask(id: string): Promise<boolean>;

  // Sessions
  getSession(id: string): Promise<Session | undefined>;
  getAllSessions(): Promise<Session[]>;
  getSessionsByCase(caseId: string): Promise<Session[]>;
  createSession(session: InsertSession): Promise<Session>;
  updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined>;
  deleteSession(id: string): Promise<boolean>;

  // Consultations
  getConsultation(id: string): Promise<schema.Consultation | undefined>;
  getAllConsultations(): Promise<schema.Consultation[]>;
  getConsultationsByBeneficiary(beneficiaryId: string): Promise<schema.Consultation[]>;
  createConsultation(consultation: schema.InsertConsultation): Promise<schema.Consultation>;
  updateConsultation(id: string, updates: Partial<schema.InsertConsultation>): Promise<schema.Consultation | undefined>;
  deleteConsultation(id: string): Promise<boolean>;

  // Enhanced Dashboard Stats
  getEnhancedDashboardStats(): Promise<{
    totalCases: number;
    activeCases: number;
    pendingIntake: number;
    upcomingHearings: number;
    pendingTasks: number;
    totalBeneficiaries: number;
    upcomingSessions: number;
  }>;
}

export class DatabaseStorage implements IStorage {
  // Users
  async getUser(id: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.id, id));
    return user;
  }

  async getUserByUsername(username: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.username, username));
    return user;
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
    return user;
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const [user] = await db.insert(schema.users).values(insertUser).returning();
    return user;
  }

  async updateUser(id: string, updates: Partial<InsertUser>): Promise<User | undefined> {
    const [user] = await db
      .update(schema.users)
      .set(updates)
      .where(eq(schema.users.id, id))
      .returning();
    return user;
  }

  async getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users);
  }

  async getStaffUsers(): Promise<User[]> {
    return db.select().from(schema.users).where(eq(schema.users.userType, "staff"));
  }

  async getExpertUsers(): Promise<User[]> {
    return db.select().from(schema.users).where(and(
      eq(schema.users.userType, "staff"),
      eq(schema.users.role, "expert")
    ));
  }

  // Expert Profiles
  async getExpertProfile(userId: string): Promise<ExpertProfile | undefined> {
    const [profile] = await db.select().from(schema.expertProfiles).where(eq(schema.expertProfiles.userId, userId));
    return profile;
  }

  async getAllExpertProfiles(): Promise<ExpertProfile[]> {
    return db.select().from(schema.expertProfiles).where(eq(schema.expertProfiles.isAvailableForBooking, true));
  }

  async createExpertProfile(insertProfile: InsertExpertProfile): Promise<ExpertProfile> {
    const [profile] = await db.insert(schema.expertProfiles).values(insertProfile).returning();
    return profile;
  }

  async updateExpertProfile(userId: string, updates: Partial<InsertExpertProfile>): Promise<ExpertProfile | undefined> {
    const [profile] = await db
      .update(schema.expertProfiles)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.expertProfiles.userId, userId))
      .returning();
    return profile;
  }

  // Beneficiaries
  async getBeneficiary(id: string): Promise<Beneficiary | undefined> {
    const [beneficiary] = await db.select().from(schema.beneficiaries).where(eq(schema.beneficiaries.id, id));
    return beneficiary;
  }

  async getBeneficiaryByUserId(userId: string): Promise<Beneficiary | undefined> {
    const [beneficiary] = await db
      .select()
      .from(schema.beneficiaries)
      .where(eq(schema.beneficiaries.userId, userId));
    return beneficiary;
  }

  async getBeneficiaryByIdNumber(idNumber: string): Promise<Beneficiary | undefined> {
    const [beneficiary] = await db.select().from(schema.beneficiaries).where(eq(schema.beneficiaries.idNumber, idNumber));
    return beneficiary;
  }

  async getAllBeneficiaries(): Promise<Beneficiary[]> {
    return db.select().from(schema.beneficiaries).orderBy(desc(schema.beneficiaries.createdAt));
  }

  async createBeneficiary(insertBeneficiary: InsertBeneficiary): Promise<Beneficiary> {
    const [beneficiary] = await db.insert(schema.beneficiaries).values(insertBeneficiary).returning();
    return beneficiary;
  }

  async updateBeneficiary(id: string, updates: Partial<InsertBeneficiary>): Promise<Beneficiary | undefined> {
    const [beneficiary] = await db
      .update(schema.beneficiaries)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.beneficiaries.id, id))
      .returning();
    return beneficiary;
  }

  async deleteBeneficiary(id: string): Promise<boolean> {
    const result = await db.delete(schema.beneficiaries).where(eq(schema.beneficiaries.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Service Requests
  async getServiceRequest(id: string): Promise<ServiceRequest | undefined> {
    const [request] = await db.select().from(schema.serviceRequests).where(eq(schema.serviceRequests.id, id));
    return request;
  }

  async getServiceRequestsByBeneficiary(beneficiaryId: string): Promise<ServiceRequest[]> {
    return db
      .select()
      .from(schema.serviceRequests)
      .where(eq(schema.serviceRequests.beneficiaryId, beneficiaryId))
      .orderBy(desc(schema.serviceRequests.createdAt));
  }

  async getAllServiceRequests(): Promise<ServiceRequest[]> {
    return db.select().from(schema.serviceRequests).orderBy(desc(schema.serviceRequests.createdAt));
  }

  async createServiceRequest(insertRequest: InsertServiceRequest): Promise<ServiceRequest> {
    const [request] = await db.insert(schema.serviceRequests).values(insertRequest).returning();
    return request;
  }

  async updateServiceRequestStatus(id: string, status: ServiceRequest["status"]): Promise<ServiceRequest | undefined> {
    const [request] = await db
      .update(schema.serviceRequests)
      .set({ status, updatedAt: new Date() })
      .where(eq(schema.serviceRequests.id, id))
      .returning();
    return request;
  }

  async attachDocumentsToServiceRequest(input: {
    uploadedBy: string;
    beneficiaryId: string;
    requestId: string;
    documents: Array<{
      storageKey: string;
      fileUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }): Promise<Document[]> {
    const rows: InsertDocument[] = input.documents.map((d) => ({
      title: d.fileName,
      description: null,
      fileUrl: d.fileUrl,
      fileType: d.mimeType,
      fileSize: d.size,
      uploadedBy: input.uploadedBy,
      beneficiaryId: input.beneficiaryId,
      caseId: null,
      ownerType: "beneficiary",
      ownerId: input.beneficiaryId,
      requestId: input.requestId,
      storageKey: d.storageKey,
      fileName: d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      // Beneficiary uploaded docs should be visible to the beneficiary.
      isPublic: true,
      category: null,
      tags: null,
    } as any));

    if (!rows.length) return [];
    return db.insert(schema.documents).values(rows).returning();
  }

  async createDocumentsForBeneficiary(input: {
    uploadedBy: string;
    beneficiaryId: string;
    documents: Array<{
      storageKey: string;
      fileUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }): Promise<Document[]> {
    const rows: InsertDocument[] = input.documents.map((d) => ({
      title: d.fileName,
      description: null,
      fileUrl: d.fileUrl,
      fileType: d.mimeType,
      fileSize: d.size,
      uploadedBy: input.uploadedBy,
      beneficiaryId: input.beneficiaryId,
      caseId: null,
      ownerType: "beneficiary",
      ownerId: input.beneficiaryId,
      requestId: null,
      storageKey: d.storageKey,
      fileName: d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      // Beneficiary uploaded docs should be visible to the beneficiary.
      isPublic: true,
      category: null,
      tags: null,
    } as any));

    if (!rows.length) return [];
    return db.insert(schema.documents).values(rows).returning();
  }

  async createDocumentsForCase(input: {
    uploadedBy: string;
    beneficiaryId: string;
    caseId: string;
    isPublic: boolean;
    documents: Array<{
      storageKey: string;
      fileUrl: string;
      fileName: string;
      mimeType: string;
      size: number;
    }>;
  }): Promise<Document[]> {
    const rows: InsertDocument[] = input.documents.map((d) => ({
      title: d.fileName,
      description: null,
      fileUrl: d.fileUrl,
      fileType: d.mimeType,
      fileSize: d.size,
      uploadedBy: input.uploadedBy,
      beneficiaryId: input.beneficiaryId,
      caseId: input.caseId,
      ownerType: "beneficiary",
      ownerId: input.beneficiaryId,
      requestId: null,
      storageKey: d.storageKey,
      fileName: d.fileName,
      mimeType: d.mimeType,
      size: d.size,
      isPublic: input.isPublic,
      category: null,
      tags: null,
    } as any));

    if (!rows.length) return [];
    return db.insert(schema.documents).values(rows).returning();
  }

  async getDocumentsByCase(caseId: string): Promise<Document[]> {
    return db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.caseId, caseId))
      .orderBy(desc(schema.documents.createdAt));
  }

  async getDocumentsByCaseForBeneficiary(beneficiaryId: string, caseId: string): Promise<Document[]> {
    return db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.beneficiaryId, beneficiaryId), eq(schema.documents.caseId, caseId), eq(schema.documents.isPublic, true)))
      .orderBy(desc(schema.documents.createdAt));
  }

  async getDocumentsVisibleToBeneficiary(beneficiaryId: string): Promise<Document[]> {
    return db
      .select()
      .from(schema.documents)
      .where(and(eq(schema.documents.beneficiaryId, beneficiaryId), eq(schema.documents.isPublic, true)))
      .orderBy(desc(schema.documents.createdAt));
  }

  async getDocumentsByBeneficiary(beneficiaryId: string): Promise<Document[]> {
    return db
      .select()
      .from(schema.documents)
      .where(eq(schema.documents.beneficiaryId, beneficiaryId))
      .orderBy(desc(schema.documents.createdAt));
  }

  // Intake Requests
  async getIntakeRequest(id: string): Promise<IntakeRequest | undefined> {
    const [request] = await db.select().from(schema.intakeRequests).where(eq(schema.intakeRequests.id, id));
    return request;
  }

  async getAllIntakeRequests(): Promise<IntakeRequest[]> {
    return db.select().from(schema.intakeRequests).orderBy(desc(schema.intakeRequests.createdAt));
  }

  async getIntakeRequestsByBeneficiary(beneficiaryId: string): Promise<IntakeRequest[]> {
    return db.select().from(schema.intakeRequests).where(eq(schema.intakeRequests.beneficiaryId, beneficiaryId));
  }

  async createIntakeRequest(insertRequest: InsertIntakeRequest): Promise<IntakeRequest> {
    const [request] = await db.insert(schema.intakeRequests).values(insertRequest).returning();
    return request;
  }

  async updateIntakeRequest(id: string, updates: Partial<InsertIntakeRequest>): Promise<IntakeRequest | undefined> {
    const [request] = await db
      .update(schema.intakeRequests)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.intakeRequests.id, id))
      .returning();
    return request;
  }

  // Cases
  async getCase(id: string): Promise<Case | undefined> {
    const [caseData] = await db.select().from(schema.cases).where(eq(schema.cases.id, id));
    return caseData;
  }

  async getAllCases(): Promise<Case[]> {
    return db.select().from(schema.cases).orderBy(desc(schema.cases.createdAt));
  }

  async getCasesByBeneficiary(beneficiaryId: string): Promise<Case[]> {
    return db.select().from(schema.cases).where(eq(schema.cases.beneficiaryId, beneficiaryId));
  }

  async getCasesByLawyer(lawyerId: string): Promise<Case[]> {
    return db.select().from(schema.cases).where(eq(schema.cases.assignedLawyerId, lawyerId));
  }

  async createCase(insertCase: InsertCase): Promise<Case> {
    const [caseData] = await db.insert(schema.cases).values(insertCase).returning();
    return caseData;
  }

  async updateCase(id: string, updates: Partial<InsertCase>): Promise<Case | undefined> {
    const [caseData] = await db
      .update(schema.cases)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.cases.id, id))
      .returning();
    return caseData;
  }

  async deleteCase(id: string): Promise<boolean> {
    const result = await db.delete(schema.cases).where(eq(schema.cases.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Hearings

  // Sessions
  async getSession(id: string): Promise<Session | undefined> {
    const [session] = await db.select().from(schema.sessions).where(eq(schema.sessions.id, id));
    return session;
  }

  async getAllSessions(): Promise<Session[]> {
    return db.select().from(schema.sessions).orderBy(desc(schema.sessions.gregorianDate));
  }

  async getSessionsByCase(caseId: string): Promise<Session[]> {
    return db
      .select()
      .from(schema.sessions)
      .where(eq(schema.sessions.caseId, caseId))
      .orderBy(desc(schema.sessions.gregorianDate));
  }

  async createSession(session: InsertSession): Promise<Session> {
    const [created] = await db.insert(schema.sessions).values(session).returning();
    return created;
  }

  async updateSession(id: string, updates: Partial<InsertSession>): Promise<Session | undefined> {
    const [updated] = await db
      .update(schema.sessions)
      .set({ ...updates, updatedAt: new Date() as any })
      .where(eq(schema.sessions.id, id))
      .returning();
    return updated;
  }

  async deleteSession(id: string): Promise<boolean> {
    const result = await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    // @ts-ignore
    return Boolean(result?.rowCount);
  }

  // Consultations
  async getConsultation(id: string): Promise<schema.Consultation | undefined> {
    const [consultation] = await db.select().from(schema.consultations).where(eq(schema.consultations.id, id));
    return consultation;
  }

  async getAllConsultations(): Promise<schema.Consultation[]> {
    return db.select().from(schema.consultations).orderBy(desc(schema.consultations.createdAt));
  }

  async getConsultationsByBeneficiary(beneficiaryId: string): Promise<schema.Consultation[]> {
    return db
      .select()
      .from(schema.consultations)
      .where(eq(schema.consultations.beneficiaryId, beneficiaryId))
      .orderBy(desc(schema.consultations.createdAt));
  }

  async createConsultation(consultation: schema.InsertConsultation): Promise<schema.Consultation> {
    const [created] = await db.insert(schema.consultations).values(consultation).returning();
    return created;
  }

  async updateConsultation(
    id: string,
    updates: Partial<schema.InsertConsultation>
  ): Promise<schema.Consultation | undefined> {
    const [updated] = await db
      .update(schema.consultations)
      .set({ ...updates, updatedAt: new Date() as any })
      .where(eq(schema.consultations.id, id))
      .returning();
    return updated;
  }

  async deleteConsultation(id: string): Promise<boolean> {
    const result = await db.delete(schema.consultations).where(eq(schema.consultations.id, id));
    // @ts-ignore
    return Boolean(result?.rowCount);
  }
  async getHearing(id: string): Promise<Hearing | undefined> {
    const [hearing] = await db.select().from(schema.hearings).where(eq(schema.hearings.id, id));
    return hearing;
  }

  async getAllHearings(): Promise<Hearing[]> {
    return db.select().from(schema.hearings).orderBy(schema.hearings.scheduledDate);
  }

  async getHearingsByCase(caseId: string): Promise<Hearing[]> {
    return db.select().from(schema.hearings).where(eq(schema.hearings.caseId, caseId));
  }

  async createHearing(insertHearing: InsertHearing): Promise<Hearing> {
    const [hearing] = await db.insert(schema.hearings).values(insertHearing).returning();
    return hearing;
  }

  async updateHearing(id: string, updates: Partial<InsertHearing>): Promise<Hearing | undefined> {
    const [hearing] = await db
      .update(schema.hearings)
      .set(updates)
      .where(eq(schema.hearings.id, id))
      .returning();
    return hearing;
  }

  async deleteHearing(id: string): Promise<boolean> {
    const result = await db.delete(schema.hearings).where(eq(schema.hearings.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Appointments
  async getAppointment(id: string): Promise<Appointment | undefined> {
    const [appointment] = await db.select().from(schema.appointments).where(eq(schema.appointments.id, id));
    return appointment;
  }

  async getAllAppointments(): Promise<Appointment[]> {
    return db.select().from(schema.appointments).orderBy(desc(schema.appointments.scheduledDate));
  }

  async getAppointmentsByBeneficiary(beneficiaryId: string): Promise<Appointment[]> {
    return db.select().from(schema.appointments)
      .where(eq(schema.appointments.beneficiaryId, beneficiaryId))
      .orderBy(desc(schema.appointments.scheduledDate));
  }

  async getAppointmentsByExpert(expertId: string): Promise<Appointment[]> {
    return db.select().from(schema.appointments)
      .where(eq(schema.appointments.expertId, expertId))
      .orderBy(desc(schema.appointments.scheduledDate));
  }

  async createAppointment(insertAppointment: InsertAppointment): Promise<Appointment> {
    const [appointment] = await db.insert(schema.appointments).values(insertAppointment).returning();
    return appointment;
  }

  async updateAppointment(id: string, updates: Partial<InsertAppointment>): Promise<Appointment | undefined> {
    const [appointment] = await db
      .update(schema.appointments)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.appointments.id, id))
      .returning();
    return appointment;
  }

  async deleteAppointment(id: string): Promise<boolean> {
    const result = await db.delete(schema.appointments).where(eq(schema.appointments.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Availability Slots
  async getAvailabilitySlotsByExpert(expertId: string): Promise<AvailabilitySlot[]> {
    return db.select().from(schema.availabilitySlots)
      .where(and(
        eq(schema.availabilitySlots.expertId, expertId),
        eq(schema.availabilitySlots.isActive, true)
      ));
  }

  async createAvailabilitySlot(insertSlot: InsertAvailabilitySlot): Promise<AvailabilitySlot> {
    const [slot] = await db.insert(schema.availabilitySlots).values(insertSlot).returning();
    return slot;
  }

  async updateAvailabilitySlot(id: string, updates: Partial<InsertAvailabilitySlot>): Promise<AvailabilitySlot | undefined> {
    const [slot] = await db
      .update(schema.availabilitySlots)
      .set(updates)
      .where(eq(schema.availabilitySlots.id, id))
      .returning();
    return slot;
  }

  async deleteAvailabilitySlot(id: string): Promise<boolean> {
    const result = await db.delete(schema.availabilitySlots).where(eq(schema.availabilitySlots.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Notifications
  async getNotification(id: string): Promise<Notification | undefined> {
    const [notification] = await db.select().from(schema.notifications).where(eq(schema.notifications.id, id));
    return notification;
  }

  async getNotificationsByUser(userId: string): Promise<Notification[]> {
    return db.select().from(schema.notifications)
      .where(eq(schema.notifications.userId, userId))
      .orderBy(desc(schema.notifications.createdAt));
  }

  async getUnreadNotifications(userId: string): Promise<Notification[]> {
    return db.select().from(schema.notifications)
      .where(and(
        eq(schema.notifications.userId, userId),
        eq(schema.notifications.isRead, false)
      ))
      .orderBy(desc(schema.notifications.createdAt));
  }

  async createNotification(insertNotification: InsertNotification): Promise<Notification> {
    const [notification] = await db.insert(schema.notifications).values(insertNotification).returning();
    return notification;
  }

  async markNotificationAsRead(id: string): Promise<Notification | undefined> {
    const [notification] = await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.id, id))
      .returning();
    return notification;
  }

  async markAllNotificationsAsRead(userId: string): Promise<void> {
    await db
      .update(schema.notifications)
      .set({ isRead: true })
      .where(eq(schema.notifications.userId, userId));
  }

  // Audit Log
  async createAuditLog(insertLog: InsertAuditLog): Promise<AuditLog> {
    const [log] = await db.insert(schema.auditLog).values(insertLog).returning();
    return log;
  }

  async getAuditLogs(limit: number = 50): Promise<AuditLog[]> {
    return db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.createdAt)).limit(limit);
  }

  // Dashboard Stats
  async getDashboardStats() {
    const [totalCases] = await db.select({ count: sql<number>`count(*)` }).from(schema.cases);
    const [activeCases] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cases)
      .where(eq(schema.cases.status, "in_progress"));
    const [pendingIntake] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.intakeRequests)
      .where(eq(schema.intakeRequests.status, "pending"));
    
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    const [upcomingHearings] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.hearings)
      .where(and(
        sql`${schema.hearings.scheduledDate} >= ${today}`,
        sql`${schema.hearings.scheduledDate} < ${tomorrow}`
      ));

    return {
      totalCases: Number(totalCases?.count || 0),
      activeCases: Number(activeCases?.count || 0),
      pendingIntake: Number(pendingIntake?.count || 0),
      upcomingHearings: Number(upcomingHearings?.count || 0),
    };
  }

  // Beneficiary Dashboard Stats
  async getBeneficiaryDashboardStats(beneficiaryId: string) {
    const [totalCases] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cases)
      .where(eq(schema.cases.beneficiaryId, beneficiaryId));
    
    const [activeCases] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cases)
      .where(and(
        eq(schema.cases.beneficiaryId, beneficiaryId),
        eq(schema.cases.status, "in_progress")
      ));
    
    const [pendingIntake] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.intakeRequests)
      .where(and(
        eq(schema.intakeRequests.beneficiaryId, beneficiaryId),
        eq(schema.intakeRequests.status, "pending")
      ));
    
    const today = new Date();
    
    const [upcomingAppointments] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.appointments)
      .where(and(
        eq(schema.appointments.beneficiaryId, beneficiaryId),
        gte(schema.appointments.scheduledDate, today),
        eq(schema.appointments.status, "confirmed")
      ));

    return {
      totalCases: Number(totalCases?.count || 0),
      activeCases: Number(activeCases?.count || 0),
      pendingIntake: Number(pendingIntake?.count || 0),
      upcomingAppointments: Number(upcomingAppointments?.count || 0),
    };
  }

  // System Settings
  async getSystemSettings(): Promise<SystemSettings | undefined> {
    const [settings] = await db.select().from(schema.systemSettings).limit(1);
    return settings;
  }

  async updateSystemSettings(updates: Partial<InsertSystemSettings>): Promise<SystemSettings> {
    const existing = await this.getSystemSettings();
    
    if (existing) {
      const [updated] = await db
        .update(schema.systemSettings)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(schema.systemSettings.id, existing.id))
        .returning();
      return updated;
    } else {
      const [created] = await db.insert(schema.systemSettings).values(updates).returning();
      return created;
    }
  }

  // Rules (Permission bundles)
  async getRule(id: string): Promise<Rule | undefined> {
    const [rule] = await db.select().from(schema.rules).where(eq(schema.rules.id, id));
    return rule;
  }

  async getRuleByName(name: string): Promise<Rule | undefined> {
    const [rule] = await db.select().from(schema.rules).where(eq(schema.rules.name, name));
    return rule;
  }

  async getAllRules(): Promise<Rule[]> {
    return db.select().from(schema.rules).orderBy(desc(schema.rules.createdAt));
  }

  async createRule(insertRule: InsertRule): Promise<Rule> {
    const [rule] = await db.insert(schema.rules).values(insertRule).returning();
    return rule;
  }

  async updateRule(id: string, updates: Partial<InsertRule>): Promise<Rule | undefined> {
    const [rule] = await db
      .update(schema.rules)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.rules.id, id))
      .returning();
    return rule;
  }

  async deleteRule(id: string): Promise<boolean> {
    const result = await db.delete(schema.rules).where(eq(schema.rules.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // User Rules
  async getUserRules(userId: string): Promise<Rule[]> {
    const userRules = await db
      .select({ rule: schema.rules })
      .from(schema.userRules)
      .innerJoin(schema.rules, eq(schema.userRules.ruleId, schema.rules.id))
      .where(eq(schema.userRules.userId, userId));
    
    return userRules.map(ur => ur.rule);
  }

  async assignRuleToUser(userId: string, ruleId: string): Promise<UserRule> {
    const [userRule] = await db.insert(schema.userRules).values({ userId, ruleId }).returning();
    return userRule;
  }

  async removeRuleFromUser(userId: string, ruleId: string): Promise<boolean> {
    const result = await db
      .delete(schema.userRules)
      .where(and(
        eq(schema.userRules.userId, userId),
        eq(schema.userRules.ruleId, ruleId)
      ));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    const rules = await this.getUserRules(userId);
    const allPermissions = rules.flatMap(rule => rule.permissions);
    return Array.from(new Set(allPermissions));
  }

  // Tasks
  async getTask(id: string): Promise<Task | undefined> {
    const [task] = await db.select().from(schema.tasks).where(eq(schema.tasks.id, id));
    return task;
  }

  async getAllTasks(): Promise<Task[]> {
    return db.select().from(schema.tasks).orderBy(desc(schema.tasks.createdAt));
  }

  async getTasksByAssignee(userId: string): Promise<Task[]> {
    return db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.assignedTo, userId))
      .orderBy(desc(schema.tasks.createdAt));
  }

  async getTasksByCase(caseId: string): Promise<Task[]> {
    return db
      .select()
      .from(schema.tasks)
      .where(eq(schema.tasks.caseId, caseId))
      .orderBy(desc(schema.tasks.createdAt));
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db.insert(schema.tasks).values(insertTask).returning();
    return task;
  }

  async updateTask(id: string, updates: Partial<InsertTask>): Promise<Task | undefined> {
    const [task] = await db
      .update(schema.tasks)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(schema.tasks.id, id))
      .returning();
    return task;
  }

  async deleteTask(id: string): Promise<boolean> {
    const result = await db.delete(schema.tasks).where(eq(schema.tasks.id, id));
    return result.rowCount ? result.rowCount > 0 : false;
  }

  // Enhanced Dashboard Stats
  async getEnhancedDashboardStats() {
    const [totalCases] = await db.select({ count: sql<number>`count(*)` }).from(schema.cases);
    const [activeCases] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.cases)
      .where(eq(schema.cases.status, "in_progress"));
    const [pendingIntake] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.intakeRequests)
      .where(eq(schema.intakeRequests.status, "pending"));
    const [totalBeneficiaries] = await db.select({ count: sql<number>`count(*)` }).from(schema.beneficiaries);
    const [pendingTasks] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.tasks)
      .where(eq(schema.tasks.status, "pending"));
    
    const today = new Date();
    const nextWeek = new Date(today);
    nextWeek.setDate(nextWeek.getDate() + 7);
    
    const [upcomingHearings] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.hearings)
      .where(and(
        gte(schema.hearings.scheduledDate, today),
        lte(schema.hearings.scheduledDate, nextWeek)
      ));

    const [upcomingSessions] = await db
      .select({ count: sql<number>`count(*)` })
      .from(schema.sessions)
      .where(and(
        gte(schema.sessions.gregorianDate, today),
        lte(schema.sessions.gregorianDate, nextWeek)
      ));

    return {
      totalCases: Number(totalCases?.count || 0),
      activeCases: Number(activeCases?.count || 0),
      pendingIntake: Number(pendingIntake?.count || 0),
      upcomingHearings: Number(upcomingHearings?.count || 0),
      pendingTasks: Number(pendingTasks?.count || 0),
      totalBeneficiaries: Number(totalBeneficiaries?.count || 0),
      upcomingSessions: Number(upcomingSessions?.count || 0),
    };
  }
}

export const storage = new DatabaseStorage();
