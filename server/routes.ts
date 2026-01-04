import type { Express, Request } from "express";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import type { User } from "@shared/schema";
import { 
  insertUserSchema, 
  insertBeneficiarySchema, 
  insertIntakeRequestSchema, 
  insertCaseSchema, 
  insertHearingSchema,
  insertExpertProfileSchema,
  insertAppointmentSchema,
  insertAvailabilitySlotSchema,
  insertNotificationSchema,
  insertSystemSettingsSchema,
  insertRuleSchema,
  insertTaskSchema,
  insertSessionSchema,
  insertConsultationSchema,
  registerBeneficiarySchema,
  uploadedFileMetadataSchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcrypt";

interface AuthRequest extends Request {
  user?: User;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Authentication Middleware
  function requireAuth(req: any, res: any, next: any) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    next();
  }

  // Staff-only Middleware
  async function requireStaff(req: AuthRequest, res: any, next: any) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.userType !== "staff") {
      return res.status(403).json({ error: "Staff access required" });
    }
    req.user = user;
    next();
  }

  // Beneficiary-only Middleware
  async function requireBeneficiary(req: AuthRequest, res: any, next: any) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user || user.userType !== "beneficiary") {
      return res.status(403).json({ error: "Beneficiary access required" });
    }
    req.user = user;
    next();
  }

  // Helper to create audit log
  async function createAudit(userId: string, action: string, entity: string, entityId?: string, details?: string, ipAddress?: string) {
    await storage.createAuditLog({
      userId,
      action,
      entity,
      entityId,
      details,
      ipAddress,
    });
  }

  // ========== AUTH ROUTES (STAFF) ==========
  
  app.post("/api/auth/register", async (req, res) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const { username, email, password, fullName, role } = result.data;
      
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        fullName,
        role: role || "viewer",
        userType: "staff",
        emailVerified: false,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/login", async (req, res) => {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({ error: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "Invalid credentials" });
      }

      req.session.userId = user.id;

      await createAudit(user.id, "login", "user", user.id, "User logged in", req.ip);

      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/auth/logout", requireAuth, async (req, res) => {
    const userId = req.session.userId;
    await createAudit(userId!, "logout", "user", userId, "User logged out", req.ip);
    req.session.destroy((err) => {
      if (err) {
        return res.status(500).json({ error: "Failed to logout" });
      }
      res.json({ success: true });
    });
  });

  app.get("/api/auth/me", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }
      const { password: _, ...userWithoutPassword } = user;
      res.json(userWithoutPassword);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== PUBLIC UPLOADS (REGISTRATION) ==========

  const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  const UPLOAD_ALLOWED_MIME = new Set(["image/jpeg", "image/png", "application/pdf"]);
  const uploadsDir = path.resolve(process.cwd(), "uploads");
  if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

  app.post("/api/uploads", async (req, res) => {
    try {
      const contentTypeHeader = req.headers["content-type"] || "";
      const mimeType = String(contentTypeHeader).split(";")[0].trim().toLowerCase();
      if (!UPLOAD_ALLOWED_MIME.has(mimeType)) {
        return res.status(400).json({ error: "Unsupported file type" });
      }

      const sizeHeader = req.headers["content-length"];
      const declaredSize = typeof sizeHeader === "string" ? Number(sizeHeader) : undefined;
      if (declaredSize != null && Number.isFinite(declaredSize) && declaredSize > UPLOAD_MAX_BYTES) {
        return res.status(413).json({ error: "File too large" });
      }

      const fileNameHeader = req.headers["x-file-name"];
      const originalFileName = typeof fileNameHeader === "string" && fileNameHeader.trim() ? fileNameHeader.trim() : "upload";
      const fileName = originalFileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 120);

      const ext = mimeType === "application/pdf" ? ".pdf" : mimeType === "image/png" ? ".png" : ".jpg";
      const storageKey = `${randomUUID()}${ext}`;
      const fullPath = path.join(uploadsDir, storageKey);

      let received = 0;
      const writeStream = fs.createWriteStream(fullPath, { flags: "wx" });

      req.on("data", (chunk: any) => {
        received += chunk.length || 0;
        if (received > UPLOAD_MAX_BYTES) {
          writeStream.destroy(new Error("MAX_SIZE"));
          req.destroy();
        }
      });

      await new Promise<void>((resolve, reject) => {
        req.pipe(writeStream);
        writeStream.on("finish", () => resolve());
        writeStream.on("error", reject);
        req.on("error", reject);
      });

      const fileUrl = `/uploads/${storageKey}`;
      const response = uploadedFileMetadataSchema.parse({
        storageKey,
        fileUrl,
        fileName,
        mimeType,
        size: received,
      });

      return res.status(201).json(response);
    } catch (error: any) {
      if (error?.message === "MAX_SIZE") {
        return res.status(413).json({ error: "File too large" });
      }
      return res.status(400).json({ error: "Upload failed" });
    }
  });

  // ========== PUBLIC BENEFICIARY SELF-REGISTRATION ==========

  app.post("/api/auth/register-beneficiary", async (req, res) => {
    try {
      const parsed = registerBeneficiarySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const payload = parsed.data;

      const existingEmail = await storage.getUserByEmail(payload.account.email);
      if (existingEmail) {
        return res.status(409).json({ error: "Email already exists" });
      }

      const existingId = await storage.getBeneficiaryByIdNumber(payload.profile.idNumber);
      if (existingId) {
        return res.status(409).json({ error: "ID number already exists" });
      }

      const hashedPassword = await bcrypt.hash(payload.account.password, 10);

      const beneficiary = await storage.createBeneficiary({
        fullName: payload.account.fullName,
        phone: payload.account.phone,
        email: payload.account.email,
        idNumber: payload.profile.idNumber,
        dateOfBirth: payload.profile.dateOfBirth ? new Date(payload.profile.dateOfBirth) : undefined,
        gender: payload.profile.gender ?? undefined,
        nationality: payload.profile.nationality ?? undefined,
        city: payload.profile.city ?? undefined,
        region: payload.profile.region ?? undefined,
        address: payload.profile.address ?? undefined,
        maritalStatus: payload.profile.maritalStatus ?? undefined,
        dependentsCount: payload.profile.dependentsCount ?? undefined,
        employmentStatus: payload.profile.employmentStatus ?? undefined,
        monthlyIncomeRange: payload.profile.monthlyIncomeRange ?? undefined,
        educationLevel: payload.profile.educationLevel ?? undefined,
        specialNeeds: payload.profile.specialNeeds ?? false,
        specialNeedsDetails: payload.profile.specialNeedsDetails ?? undefined,
        hasLawyerBefore: payload.profile.hasLawyerBefore ?? false,
        hasLawyerBeforeDetails: payload.profile.hasLawyerBeforeDetails ?? undefined,
        preferredContact: payload.profile.preferredContact ?? undefined,
        preferredLanguage: payload.profile.preferredLanguage ?? undefined,
        status: "pending",
      } as any);

      const user = await storage.createUser({
        username: payload.account.email,
        email: payload.account.email,
        password: hashedPassword,
        fullName: payload.account.fullName,
        role: "viewer",
        userType: "beneficiary",
        emailVerified: false,
        beneficiaryId: beneficiary.id,
      } as any);

      const request = await storage.createServiceRequest({
        beneficiaryId: beneficiary.id,
        serviceType: payload.serviceRequest.serviceType,
        serviceTypeOther: payload.serviceRequest.serviceTypeOther ?? undefined,
        issueSummary: payload.serviceRequest.issueSummary,
        issueDetails: payload.serviceRequest.issueDetails ?? undefined,
        urgent: payload.serviceRequest.urgent ?? false,
        urgentDate: payload.serviceRequest.urgentDate ? new Date(payload.serviceRequest.urgentDate) : undefined,
        status: "new",
      } as any);

      if (payload.serviceRequest.documents?.length) {
        await storage.attachDocumentsToServiceRequest({
          uploadedBy: user.id,
          beneficiaryId: beneficiary.id,
          requestId: request.id,
          documents: payload.serviceRequest.documents,
        });
      }

      req.session.userId = user.id;

      const { password: _, ...userWithoutPassword } = user as any;
      return res.status(201).json({
        user: userWithoutPassword,
        beneficiary,
        serviceRequest: request,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message || "Registration failed" });
    }
  });

  // ========== BENEFICIARY PORTAL AUTH ROUTES ==========

  app.post("/api/portal/register", async (req, res) => {
    try {
      const { username, email, password, fullName, idNumber, phone } = req.body;

      if (!username || !email || !password || !fullName || !idNumber || !phone) {
        return res.status(400).json({ error: "All fields are required" });
      }

      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      // Create beneficiary record
      const beneficiary = await storage.createBeneficiary({
        fullName,
        idNumber,
        phone,
        email,
        status: "pending",
      });

      // Create user account
      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        fullName,
        role: "viewer",
        userType: "beneficiary",
        emailVerified: false,
        beneficiaryId: beneficiary.id,
      });

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, beneficiary });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== BENEFICIARIES ROUTES (STAFF) ==========

  app.get("/api/beneficiaries", requireStaff, async (req, res) => {
    try {
      const beneficiaries = await storage.getAllBeneficiaries();
      res.json(beneficiaries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/beneficiaries/:id", requireStaff, async (req, res) => {
    try {
      const beneficiary = await storage.getBeneficiary(req.params.id);
      if (!beneficiary) {
        return res.status(404).json({ error: "Beneficiary not found" });
      }
      res.json(beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/beneficiaries", requireStaff, async (req, res) => {
    try {
      const result = insertBeneficiarySchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const beneficiary = await storage.createBeneficiary(result.data);
      await createAudit(req.session.userId!, "create", "beneficiary", beneficiary.id, `Created beneficiary: ${beneficiary.fullName}`, req.ip);
      res.json(beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/beneficiaries/:id", requireStaff, async (req, res) => {
    try {
      const beneficiary = await storage.updateBeneficiary(req.params.id, req.body);
      if (!beneficiary) {
        return res.status(404).json({ error: "Beneficiary not found" });
      }
      await createAudit(req.session.userId!, "update", "beneficiary", beneficiary.id, `Updated beneficiary: ${beneficiary.fullName}`, req.ip);
      res.json(beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/beneficiaries/:id", requireStaff, async (req, res) => {
    try {
      const success = await storage.deleteBeneficiary(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Beneficiary not found" });
      }
      await createAudit(req.session.userId!, "delete", "beneficiary", req.params.id, "Deleted beneficiary", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== BENEFICIARY PORTAL ROUTES ==========

  app.get("/api/portal/profile", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user.beneficiaryId) {
        return res.status(404).json({ error: "Beneficiary profile not found" });
      }
      const beneficiary = await storage.getBeneficiary(user.beneficiaryId);
      res.json(beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/portal/profile", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user.beneficiaryId) {
        return res.status(404).json({ error: "Beneficiary profile not found" });
      }
      const beneficiary = await storage.updateBeneficiary(user.beneficiaryId, req.body);
      res.json(beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/my-cases", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user.beneficiaryId) {
        return res.json([]);
      }
      const cases = await storage.getCasesByBeneficiary(user.beneficiaryId);
      // Remove internal notes for beneficiary view
      const publicCases = cases.map(({ internalNotes, ...caseData }) => caseData);
      res.json(publicCases);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/my-intake-requests", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user.beneficiaryId) {
        return res.json([]);
      }
      const requests = await storage.getIntakeRequestsByBeneficiary(user.beneficiaryId);
      // Remove review notes for beneficiary view
      const publicRequests = requests.map(({ reviewNotes, ...request }) => request);
      res.json(publicRequests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/portal/intake-requests", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user.beneficiaryId) {
        return res.status(400).json({ error: "Beneficiary profile not found" });
      }

      const request = await storage.createIntakeRequest({
        beneficiaryId: user.beneficiaryId,
        caseType: req.body.caseType,
        description: req.body.description,
        documents: req.body.documents || [],
        status: "pending",
      });

      // Create notification for staff
      await storage.createNotification({
        userId: user.id,
        type: "intake_request",
        title: "New Intake Request",
        message: `New intake request submitted by ${user.fullName}`,
        relatedEntityId: request.id,
      });

      res.json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/dashboard-stats", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      if (!user.beneficiaryId) {
        return res.json({ totalCases: 0, activeCases: 0, pendingIntake: 0, upcomingAppointments: 0 });
      }
      const stats = await storage.getBeneficiaryDashboardStats(user.beneficiaryId);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== INTAKE REQUESTS ROUTES (STAFF) ==========

  app.get("/api/intake-requests", requireStaff, async (req, res) => {
    try {
      const requests = await storage.getAllIntakeRequests();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/intake-requests/:id", requireStaff, async (req, res) => {
    try {
      const request = await storage.getIntakeRequest(req.params.id);
      if (!request) {
        return res.status(404).json({ error: "Intake request not found" });
      }
      res.json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/intake-requests", requireStaff, async (req, res) => {
    try {
      const result = insertIntakeRequestSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const request = await storage.createIntakeRequest(result.data);
      await createAudit(req.session.userId!, "create", "intake_request", request.id, "Created intake request", req.ip);
      res.json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/intake-requests/:id", requireStaff, async (req, res) => {
    try {
      const request = await storage.updateIntakeRequest(req.params.id, req.body);
      if (!request) {
        return res.status(404).json({ error: "Intake request not found" });
      }
      await createAudit(req.session.userId!, "update", "intake_request", request.id, "Updated intake request", req.ip);
      res.json(request);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== CASES ROUTES (STAFF) ==========

  app.get("/api/cases", requireStaff, async (req, res) => {
    try {
      const cases = await storage.getAllCases();
      res.json(cases);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/:id", requireStaff, async (req, res) => {
    try {
      const caseData = await storage.getCase(req.params.id);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }
      res.json(caseData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cases", requireStaff, async (req, res) => {
    try {
      const result = insertCaseSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const caseData = await storage.createCase(result.data);
      await createAudit(req.session.userId!, "create", "case", caseData.id, `Created case: ${caseData.caseNumber}`, req.ip);
      res.json(caseData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/cases/:id", requireStaff, async (req, res) => {
    try {
      const caseData = await storage.updateCase(req.params.id, req.body);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }
      await createAudit(req.session.userId!, "update", "case", caseData.id, `Updated case: ${caseData.caseNumber}`, req.ip);
      res.json(caseData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/cases/:id", requireStaff, async (req, res) => {
    try {
      const success = await storage.deleteCase(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Case not found" });
      }
      await createAudit(req.session.userId!, "delete", "case", req.params.id, "Deleted case", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== HEARINGS ROUTES (STAFF) ==========

  app.get("/api/hearings", requireStaff, async (req, res) => {
    try {
      const hearings = await storage.getAllHearings();
      res.json(hearings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/hearings/:id", requireStaff, async (req, res) => {
    try {
      const hearing = await storage.getHearing(req.params.id);
      if (!hearing) {
        return res.status(404).json({ error: "Hearing not found" });
      }
      res.json(hearing);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/hearings", requireStaff, async (req, res) => {
    try {
      const result = insertHearingSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const hearing = await storage.createHearing(result.data);
      await createAudit(req.session.userId!, "create", "hearing", hearing.id, `Created hearing: ${hearing.title}`, req.ip);
      res.json(hearing);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/hearings/:id", requireStaff, async (req, res) => {
    try {
      const hearing = await storage.updateHearing(req.params.id, req.body);
      if (!hearing) {
        return res.status(404).json({ error: "Hearing not found" });
      }
      await createAudit(req.session.userId!, "update", "hearing", hearing.id, `Updated hearing: ${hearing.title}`, req.ip);
      res.json(hearing);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/hearings/:id", requireStaff, async (req, res) => {
    try {
      const success = await storage.deleteHearing(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Hearing not found" });
      }
      await createAudit(req.session.userId!, "delete", "hearing", req.params.id, "Deleted hearing", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== EXPERT PROFILES ROUTES ==========

  app.get("/api/experts", async (req, res) => {
    try {
      const profiles = await storage.getAllExpertProfiles();
      const expertsWithUsers = await Promise.all(
        profiles.map(async (profile) => {
          const user = await storage.getUser(profile.userId);
          return {
            ...profile,
            user: user ? { id: user.id, fullName: user.fullName, email: user.email } : null,
          };
        })
      );
      res.json(expertsWithUsers);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/experts/:userId", async (req, res) => {
    try {
      const profile = await storage.getExpertProfile(req.params.userId);
      if (!profile) {
        return res.status(404).json({ error: "Expert profile not found" });
      }
      const user = await storage.getUser(profile.userId);
      res.json({ ...profile, user: user ? { id: user.id, fullName: user.fullName, email: user.email } : null });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/experts", requireStaff, async (req, res) => {
    try {
      const result = insertExpertProfileSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const profile = await storage.createExpertProfile(result.data);
      await createAudit(req.session.userId!, "create", "expert_profile", profile.id, "Created expert profile", req.ip);
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/experts/:userId", requireStaff, async (req, res) => {
    try {
      const profile = await storage.updateExpertProfile(req.params.userId, req.body);
      if (!profile) {
        return res.status(404).json({ error: "Expert profile not found" });
      }
      await createAudit(req.session.userId!, "update", "expert_profile", profile.id, "Updated expert profile", req.ip);
      res.json(profile);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== APPOINTMENTS ROUTES ==========

  app.get("/api/appointments", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let appointments: any[] = [];
      if (user.userType === "beneficiary" && user.beneficiaryId) {
        appointments = await storage.getAppointmentsByBeneficiary(user.beneficiaryId);
      } else if (user.userType === "staff") {
        appointments = await storage.getAllAppointments();
      }

      res.json(appointments);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/appointments/:id", requireAuth, async (req, res) => {
    try {
      const appointment = await storage.getAppointment(req.params.id);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/appointments", requireAuth, async (req, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      let beneficiaryId = req.body.beneficiaryId;
      
      // If beneficiary user, use their beneficiaryId
      if (user.userType === "beneficiary" && user.beneficiaryId) {
        beneficiaryId = user.beneficiaryId;
      }

      if (!beneficiaryId) {
        return res.status(400).json({ error: "Beneficiary ID required" });
      }

      const appointment = await storage.createAppointment({
        beneficiaryId,
        expertId: req.body.expertId,
        appointmentType: req.body.appointmentType,
        scheduledDate: new Date(req.body.scheduledDate),
        duration: req.body.duration || 60,
        topic: req.body.topic,
        notes: req.body.notes,
        location: req.body.location,
        status: "pending",
      });

      // Create notifications
      await storage.createNotification({
        userId: req.body.expertId,
        type: "appointment_request",
        title: "New Appointment Request",
        message: `New appointment request for ${req.body.topic}`,
        relatedEntityId: appointment.id,
      });

      if (user.userType === "beneficiary") {
        await storage.createNotification({
          userId: user.id,
          type: "appointment_created",
          title: "Appointment Requested",
          message: "Your appointment request has been submitted",
          relatedEntityId: appointment.id,
        });
      }

      await createAudit(req.session.userId!, "create", "appointment", appointment.id, "Created appointment", req.ip);
      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/appointments/:id", requireAuth, async (req, res) => {
    try {
      const appointment = await storage.updateAppointment(req.params.id, req.body);
      if (!appointment) {
        return res.status(404).json({ error: "Appointment not found" });
      }

      // Notify beneficiary if status changed
      if (req.body.status && req.body.status !== "pending") {
        const beneficiary = await storage.getBeneficiary(appointment.beneficiaryId);
        if (beneficiary) {
          const user = await storage.getUser(req.session.userId!);
          await storage.createNotification({
            userId: appointment.beneficiaryId,
            type: "appointment_updated",
            title: "Appointment Status Updated",
            message: `Your appointment has been ${req.body.status}`,
            relatedEntityId: appointment.id,
          });
        }
      }

      await createAudit(req.session.userId!, "update", "appointment", appointment.id, "Updated appointment", req.ip);
      res.json(appointment);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/appointments/:id", requireAuth, async (req, res) => {
    try {
      const success = await storage.deleteAppointment(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Appointment not found" });
      }
      await createAudit(req.session.userId!, "delete", "appointment", req.params.id, "Deleted appointment", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== NOTIFICATIONS ROUTES ==========

  app.get("/api/notifications", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getNotificationsByUser(req.session.userId!);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/notifications/unread", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.getUnreadNotifications(req.session.userId!);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res) => {
    try {
      const notification = await storage.markNotificationAsRead(req.params.id);
      if (!notification) {
        return res.status(404).json({ error: "Notification not found" });
      }
      res.json(notification);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/notifications/mark-all-read", requireAuth, async (req, res) => {
    try {
      await storage.markAllNotificationsAsRead(req.session.userId!);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== DASHBOARD & REPORTS ROUTES ==========

  app.get("/api/dashboard/stats", requireStaff, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/audit-logs", requireStaff, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const logs = await storage.getAuditLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", requireStaff, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== SYSTEM SETTINGS ROUTES ==========

  app.get("/api/system-settings", requireStaff, async (req, res) => {
    try {
      const settings = await storage.getSystemSettings();
      res.json(settings || {});
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/system-settings", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const settings = await storage.updateSystemSettings(req.body);
      await createAudit(user.id, "update", "system_settings", settings.id, "Updated system settings", req.ip);
      res.json(settings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== RULES & PERMISSIONS ROUTES ==========

  app.get("/api/rules", requireStaff, async (req, res) => {
    try {
      const rules = await storage.getAllRules();
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/rules/:id", requireStaff, async (req, res) => {
    try {
      const rule = await storage.getRule(req.params.id);
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/rules", requireStaff, async (req: AuthRequest, res) => {
    try {
      const result = insertRuleSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }
      const user = req.user as User;
      const rule = await storage.createRule(result.data);
      await createAudit(user.id, "create", "rule", rule.id, `Created rule: ${rule.name}`, req.ip);
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/rules/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const rule = await storage.updateRule(req.params.id, req.body);
      if (!rule) {
        return res.status(404).json({ error: "Rule not found" });
      }
      await createAudit(user.id, "update", "rule", rule.id, `Updated rule: ${rule.name}`, req.ip);
      res.json(rule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/rules/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const success = await storage.deleteRule(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Rule not found" });
      }
      await createAudit(user.id, "delete", "rule", req.params.id, "Deleted rule", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User Rules (assign/remove rules from users)
  app.get("/api/users/:userId/rules", requireStaff, async (req, res) => {
    try {
      const rules = await storage.getUserRules(req.params.userId);
      res.json(rules);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/users/:userId/rules/:ruleId", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const userRule = await storage.assignRuleToUser(req.params.userId, req.params.ruleId);
      await createAudit(user.id, "assign_rule", "user", req.params.userId, `Assigned rule ${req.params.ruleId}`, req.ip);
      res.json(userRule);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/users/:userId/rules/:ruleId", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const success = await storage.removeRuleFromUser(req.params.userId, req.params.ruleId);
      if (!success) {
        return res.status(404).json({ error: "User rule not found" });
      }
      await createAudit(user.id, "remove_rule", "user", req.params.userId, `Removed rule ${req.params.ruleId}`, req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users/:userId/permissions", requireStaff, async (req, res) => {
    try {
      const permissions = await storage.getUserPermissions(req.params.userId);
      res.json(permissions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== TASKS ROUTES ==========

  app.get("/api/tasks", requireStaff, async (req, res) => {
    try {
      const tasks = await storage.getAllTasks();
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/tasks/:id", requireStaff, async (req, res) => {
    try {
      const task = await storage.getTask(req.params.id);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users/:userId/tasks", requireStaff, async (req, res) => {
    try {
      const tasks = await storage.getTasksByAssignee(req.params.userId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/:caseId/tasks", requireStaff, async (req, res) => {
    try {
      const tasks = await storage.getTasksByCase(req.params.caseId);
      res.json(tasks);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/tasks", requireStaff, async (req: AuthRequest, res) => {
    try {
      const result = insertTaskSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }
      const user = req.user as User;
      const task = await storage.createTask({
        ...result.data,
        assignedBy: user.id,
      });
      
      // Send notification to assignee
      await storage.createNotification({
        userId: task.assignedTo,
        type: "task_assigned",
        title: "New Task Assigned",
        message: `You have been assigned a new task: ${task.title}`,
        relatedEntityId: task.id,
      });

      await createAudit(user.id, "create", "task", task.id, `Created task: ${task.title}`, req.ip);
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/tasks/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const task = await storage.updateTask(req.params.id, req.body);
      if (!task) {
        return res.status(404).json({ error: "Task not found" });
      }
      await createAudit(user.id, "update", "task", task.id, `Updated task: ${task.title}`, req.ip);
      res.json(task);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/tasks/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const success = await storage.deleteTask(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Task not found" });
      }
      await createAudit(user.id, "delete", "task", req.params.id, "Deleted task", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== ENHANCED DASHBOARD STATS ==========

  app.get("/api/dashboard/enhanced-stats", requireStaff, async (req, res) => {
    try {
      const stats = await storage.getEnhancedDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== SESSIONS ROUTES ==========

  app.get("/api/sessions", requireStaff, async (req, res) => {
    try {
      const sessions = await storage.getAllSessions();
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/:caseId/sessions", requireStaff, async (req, res) => {
    try {
      const sessions = await storage.getSessionsByCase(req.params.caseId);
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/sessions", requireStaff, async (req: AuthRequest, res) => {
    try {
      const result = insertSessionSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const user = req.user as User;
      const session = await storage.createSession(result.data);
      await createAudit(user.id, "create", "session", session.id, `Created session: ${session.title}`, req.ip);
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/sessions/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const session = await storage.updateSession(req.params.id, req.body);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }
      await createAudit(user.id, "update", "session", session.id, `Updated session: ${session.title}`, req.ip);
      res.json(session);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/sessions/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const success = await storage.deleteSession(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Session not found" });
      }
      await createAudit(user.id, "delete", "session", req.params.id, "Deleted session", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== CONSULTATIONS ROUTES ==========

  app.get("/api/consultations", requireStaff, async (req, res) => {
    try {
      const consultations = await storage.getAllConsultations();
      res.json(consultations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/beneficiaries/:beneficiaryId/consultations", requireStaff, async (req, res) => {
    try {
      const consultations = await storage.getConsultationsByBeneficiary(req.params.beneficiaryId);
      res.json(consultations);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/consultations", requireStaff, async (req: AuthRequest, res) => {
    try {
      const createSchema = insertConsultationSchema.omit({ consultationNumber: true });
      const result = createSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const user = req.user as User;

      // Generate a readable unique consultation number
      const consultationNumber = `CONS-${Date.now()}`;

      const consultation = await storage.createConsultation({
        ...(result.data as any),
        consultationNumber,
        lawyerId: result.data.lawyerId ?? user.id,
      });

      await createAudit(user.id, "create", "consultation", consultation.id, `Created consultation: ${consultation.consultationNumber}`, req.ip);
      res.json(consultation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/consultations/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const consultation = await storage.updateConsultation(req.params.id, req.body);
      if (!consultation) {
        return res.status(404).json({ error: "Consultation not found" });
      }
      await createAudit(user.id, "update", "consultation", consultation.id, `Updated consultation: ${consultation.consultationNumber}`, req.ip);
      res.json(consultation);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/consultations/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const success = await storage.deleteConsultation(req.params.id);
      if (!success) {
        return res.status(404).json({ error: "Consultation not found" });
      }
      await createAudit(user.id, "delete", "consultation", req.params.id, "Deleted consultation", req.ip);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
