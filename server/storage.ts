import { drizzle } from "drizzle-orm/node-postgres";
import pkg from "pg";
const { Pool } = pkg;
import { eq, desc, and, sql } from "drizzle-orm";
import * as schema from "@shared/schema";
import type {
  User,
  InsertUser,
  Beneficiary,
  InsertBeneficiary,
  IntakeRequest,
  InsertIntakeRequest,
  Case,
  InsertCase,
  Hearing,
  InsertHearing,
  AuditLog,
  InsertAuditLog,
} from "@shared/schema";

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema });

export interface IStorage {
  // Users
  getUser(id: string): Promise<User | undefined>;
  getUserByUsername(username: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  getAllUsers(): Promise<User[]>;

  // Beneficiaries
  getBeneficiary(id: string): Promise<Beneficiary | undefined>;
  getAllBeneficiaries(): Promise<Beneficiary[]>;
  createBeneficiary(beneficiary: InsertBeneficiary): Promise<Beneficiary>;
  updateBeneficiary(id: string, beneficiary: Partial<InsertBeneficiary>): Promise<Beneficiary | undefined>;
  deleteBeneficiary(id: string): Promise<boolean>;

  // Intake Requests
  getIntakeRequest(id: string): Promise<IntakeRequest | undefined>;
  getAllIntakeRequests(): Promise<IntakeRequest[]>;
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

  async getAllUsers(): Promise<User[]> {
    return db.select().from(schema.users);
  }

  // Beneficiaries
  async getBeneficiary(id: string): Promise<Beneficiary | undefined> {
    const [beneficiary] = await db.select().from(schema.beneficiaries).where(eq(schema.beneficiaries.id, id));
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

  // Intake Requests
  async getIntakeRequest(id: string): Promise<IntakeRequest | undefined> {
    const [request] = await db.select().from(schema.intakeRequests).where(eq(schema.intakeRequests.id, id));
    return request;
  }

  async getAllIntakeRequests(): Promise<IntakeRequest[]> {
    return db.select().from(schema.intakeRequests).orderBy(desc(schema.intakeRequests.createdAt));
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
}

export const storage = new DatabaseStorage();
