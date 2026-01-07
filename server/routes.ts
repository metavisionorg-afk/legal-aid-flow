import type { Express, Request } from "express";
import { type Server } from "http";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { storage } from "./storage";
import type { Beneficiary, Rule, User } from "@shared/schema";
import { 
  insertUserSchema, 
  insertBeneficiarySchema, 
  insertIntakeRequestSchema, 
  insertCaseSchema, 
  insertCaseDetailsSchema,
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
  insertServiceRequestSchema,
  registerBeneficiarySchema,
  registerBeneficiarySimpleSchema,
  uploadedFileMetadataSchema
} from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcrypt";
import { z } from "zod";
import { isAdminStatus, isOperatingStatus } from "./lib/caseWorkflow";

interface AuthRequest extends Request {
  user?: User;
  beneficiary?: Beneficiary;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  function getErrorMessage(err: unknown): string {
    if (err instanceof Error && err.message) return err.message;
    if (err && typeof err === "object") {
      const anyErr = err as any;
      return (
        anyErr?.response?.data?.error ||
        anyErr?.response?.data?.message ||
        anyErr?.message ||
        anyErr?.error ||
        "Request failed"
      );
    }
    if (typeof err === "string" && err.trim()) return err;
    return "Request failed";
  }

  function createInMemoryRateLimiter(options: { windowMs: number; max: number }) {
    const hits = new Map<string, { count: number; resetAt: number }>();

    return (req: any, res: any, next: any) => {
      const key = String(req.ip || "unknown");
      const now = Date.now();
      const existing = hits.get(key);

      if (!existing || now > existing.resetAt) {
        hits.set(key, { count: 1, resetAt: now + options.windowMs });
        return next();
      }

      existing.count += 1;
      if (existing.count > options.max) {
        return res.status(429).json({ error: "Too many requests, please try again later" });
      }

      return next();
    };
  }

  const registerBeneficiaryRateLimit = createInMemoryRateLimiter({ windowMs: 10 * 60 * 1000, max: 10 });

  const BENEFICIARY_DEFAULT_RULE_NAME = "beneficiary";
  const BENEFICIARY_DEFAULT_PERMISSIONS = [
    "beneficiary:self:read",
    "beneficiary:self:update",
    "cases:self:read",
    "cases:self:create",
    "documents:self:create",
    "intake:self:create",
  ] as const;

  async function ensureBeneficiaryDefaultRule(): Promise<Rule> {
    const existing = await storage.getRuleByName(BENEFICIARY_DEFAULT_RULE_NAME);
    if (existing) return existing;
    return storage.createRule({
      name: BENEFICIARY_DEFAULT_RULE_NAME,
      description: "Default permissions for beneficiary users",
      permissions: [...BENEFICIARY_DEFAULT_PERMISSIONS],
    } as any);
  }

  async function assignBeneficiaryDefaultRule(userId: string): Promise<void> {
    const rule = await ensureBeneficiaryDefaultRule();
    const current = await storage.getUserRules(userId);
    if (current.some((r) => r.id === rule.id)) return;
    await storage.assignRuleToUser(userId, rule.id);
  }
  
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
    const beneficiary = await storage.getBeneficiaryByUserId(user.id);
    if (!beneficiary) {
      return res.status(404).json({ error: "Beneficiary profile not found" });
    }
    req.user = user;
    req.beneficiary = beneficiary;
    next();
  }

  function requireRole(allowedRoles: Array<string>) {
    return (req: AuthRequest, res: any, next: any) => {
      const user = req.user;
      if (!user) {
        return res.status(500).json({ error: "Auth context missing" });
      }

      const role = user.role;
      const ok =
        allowedRoles.includes(role) ||
        (role === "super_admin" && allowedRoles.includes("admin"));

      if (!ok) {
        return res.status(403).json({ error: "Forbidden" });
      }

      next();
    };
  }

  async function getCurrentUser(req: AuthRequest): Promise<User | undefined> {
    if (!req.session?.userId) return undefined;
    const user = await storage.getUser(req.session.userId);
    if (user) req.user = user;
    return user;
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

  app.post("/api/auth/register-beneficiary", registerBeneficiaryRateLimit, async (req, res) => {
    try {
      const isLegacyPayload = Boolean(req.body && typeof req.body === "object" && (req.body as any).account);

      // Stage 3 (flat) payload
      if (!isLegacyPayload) {
        const parsed = registerBeneficiarySimpleSchema.safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const input = parsed.data;
        const username = (input.username && String(input.username).trim()) || input.email;

        const existingEmail = await storage.getUserByEmail(input.email);
        if (existingEmail) {
          return res.status(409).json({ error: "Email already exists" });
        }

        const existingUsername = await storage.getUserByUsername(username);
        if (existingUsername) {
          return res.status(409).json({ error: "Username already exists" });
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);

        const user = await storage.createUser({
          username,
          email: input.email,
          password: hashedPassword,
          fullName: input.fullName,
          role: "beneficiary",
          userType: "beneficiary",
          emailVerified: false,
        } as any);

        const generatedIdNumber = (input.nationalId && input.nationalId.trim()) || `AUTO-${randomUUID()}`;
        const beneficiary = await storage.createBeneficiary({
          userId: user.id,
          fullName: input.fullName,
          phone: input.phone,
          email: input.email,
          city: input.city,
          address: input.address ?? undefined,
          preferredLanguage: input.preferredLanguage,
          gender: input.gender ?? undefined,
          nationality: input.nationality ?? undefined,
          nationalId: input.nationalId ?? undefined,
          idNumber: generatedIdNumber,
          birthDate: input.birthDate ? new Date(input.birthDate) : undefined,
          serviceType: input.serviceType,
          status: "pending",
        } as any);

        await assignBeneficiaryDefaultRule(user.id);

        const request = await storage.createServiceRequest({
          beneficiaryId: beneficiary.id,
          serviceType: input.serviceType as any,
          issueSummary: (input.details || input.notes || "New request").trim(),
          issueDetails: (input.notes || input.details) ?? undefined,
          urgent: false,
          status: "new",
        } as any);

        req.session.userId = user.id;

        const { password: _, ...userWithoutPassword } = user as any;
        return res.status(201).json({
          success: true,
          user: userWithoutPassword,
          beneficiary,
          serviceRequest: request,
          auth: { type: "session" },
        });
      }

      // Legacy (nested) payload
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
        role: "beneficiary",
        userType: "beneficiary",
        emailVerified: false,
      } as any);

      await storage.updateBeneficiary(beneficiary.id, {
        userId: user.id,
        serviceType: payload.serviceRequest.serviceType,
      } as any);

      await assignBeneficiaryDefaultRule(user.id);

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
        success: true,
        user: userWithoutPassword,
        beneficiary,
        serviceRequest: request,
        auth: { type: "session" },
      });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) || "Registration failed" });
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
        role: "beneficiary",
        userType: "beneficiary",
        emailVerified: false,
      });

      await storage.updateBeneficiary(beneficiary.id, {
        userId: user.id,
      } as any);

      await assignBeneficiaryDefaultRule(user.id);

      const { password: _, ...userWithoutPassword } = user;
      res.json({ user: userWithoutPassword, beneficiary });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== SERVICE REQUESTS ROUTES (STAGE 3) ==========

  // Beneficiary creates a new service request (beneficiary only)
  app.post("/api/service-requests", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;

      // beneficiaryId/status are enforced server-side
      const parsed = insertServiceRequestSchema
        .omit({ beneficiaryId: true, status: true, urgentDate: true })
        .extend({
          urgentDate: z.union([z.string().datetime(), z.null()]).optional(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const input = parsed.data;

      const created = await storage.createServiceRequest({
        beneficiaryId: beneficiary.id,
        serviceType: input.serviceType as any,
        serviceTypeOther: input.serviceTypeOther ?? undefined,
        issueSummary: input.issueSummary,
        issueDetails: input.issueDetails ?? undefined,
        urgent: input.urgent ?? false,
        urgentDate: input.urgentDate ? new Date(input.urgentDate) : undefined,
        status: "new",
      } as any);

      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Beneficiary lists their own requests (beneficiary only)
  app.get("/api/service-requests/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const requests = await storage.getServiceRequestsByBeneficiary(beneficiary.id);
      return res.json(requests);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Staff lists all requests (admin/lawyer only)
  app.get(
    "/api/service-requests",
    requireStaff,
    requireRole(["admin", "lawyer"]),
    async (_req: AuthRequest, res) => {
      try {
        const requests = await storage.getAllServiceRequests();
        return res.json(requests);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Staff updates status (admin/lawyer only)
  app.patch(
    "/api/service-requests/:id/status",
    requireStaff,
    requireRole(["admin", "lawyer"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            status: z.enum(["new", "in_review", "accepted", "rejected"]),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updated = await storage.updateServiceRequestStatus(req.params.id, parsed.data.status);
        if (!updated) {
          return res.status(404).json({ error: "Service request not found" });
        }

        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

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
      res.json(req.beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/portal/profile", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const body = (req.body || {}) as any;
      const updates: any = {};
      const allowed = [
        "fullName",
        "phone",
        "city",
        "address",
        "preferredLanguage",
        "nationalId",
        "nationality",
        "gender",
        "birthDate",
      ];
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      const beneficiary = await storage.updateBeneficiary(req.beneficiary!.id, updates);
      res.json(beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/my-cases", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const cases = await storage.getCasesByBeneficiary(req.beneficiary!.id);
      // Remove internal notes for beneficiary view
      const publicCases = cases.map(({ internalNotes, ...caseData }) => caseData);
      res.json(publicCases);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // ========== STAGE 5: BENEFICIARY SELF ENDPOINTS ==========

  app.get("/api/beneficiary/me", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      res.json(req.beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/beneficiary/me", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const body = (req.body || {}) as any;
      const updates: any = {};
      const allowed = [
        "fullName",
        "phone",
        "city",
        "address",
        "preferredLanguage",
        "nationalId",
        "nationality",
        "gender",
        "birthDate",
      ];
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      const updated = await storage.updateBeneficiary(req.beneficiary!.id, updates);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const cases = await storage.getCasesByBeneficiary(req.beneficiary!.id);
      const publicCases = cases.map(({ internalNotes, ...caseData }) => caseData);
      res.json(publicCases);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/my/:caseId/documents", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const caseData = await storage.getCase(req.params.caseId);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }
      if (caseData.beneficiaryId !== beneficiary.id) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const docs = await storage.getDocumentsByCaseForBeneficiary(beneficiary.id, caseData.id);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/documents/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const bodySchema = z.object({
        requestId: z.string().optional().nullable(),
        documents: z.array(uploadedFileMetadataSchema).min(1),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const user = req.user!;
      const beneficiary = req.beneficiary!;

      const requestId = parsed.data.requestId ? String(parsed.data.requestId) : undefined;
      if (requestId) {
        const sr = await storage.getServiceRequest(requestId);
        if (!sr) {
          return res.status(404).json({ error: "Service request not found" });
        }
        if (sr.beneficiaryId !== beneficiary.id) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const docs = await storage.attachDocumentsToServiceRequest({
          uploadedBy: user.id,
          beneficiaryId: beneficiary.id,
          requestId,
          documents: parsed.data.documents,
        });
        return res.status(201).json({ success: true, documents: docs });
      }

      const docs = await storage.createDocumentsForBeneficiary({
        uploadedBy: user.id,
        beneficiaryId: beneficiary.id,
        documents: parsed.data.documents,
      });
      return res.status(201).json({ success: true, documents: docs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/documents/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const docs = await storage.getDocumentsVisibleToBeneficiary(beneficiary.id);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/portal/my-intake-requests", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const requests = await storage.getIntakeRequestsByBeneficiary(req.beneficiary!.id);
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

      const request = await storage.createIntakeRequest({
        beneficiaryId: req.beneficiary!.id,
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
      const stats = await storage.getBeneficiaryDashboardStats(req.beneficiary!.id);
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

  // ========== CASES ROUTES ==========

  app.get("/api/cases", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      // Beneficiaries: only their cases
      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) {
          return res.json([]);
        }
        const cases = await storage.getCasesByBeneficiary(beneficiary.id);
        const publicCases = cases.map(({ internalNotes, ...caseData }) => caseData);
        return res.json(publicCases);
      }

      // Staff: only admin/lawyer (super_admin allowed)
      const isAllowedStaff = user.role === "admin" || user.role === "lawyer" || user.role === "super_admin";
      if (!isAllowedStaff) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const cases = await storage.getAllCases();
      return res.json(cases);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const caseData = await storage.getCase(req.params.id);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary || caseData.beneficiaryId !== beneficiary.id) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const { internalNotes, ...publicCase } = caseData as any;
        return res.json(publicCase);
      }

      const isAllowedStaff = user.role === "admin" || user.role === "lawyer" || user.role === "super_admin";
      if (!isAllowedStaff) {
        return res.status(403).json({ error: "Forbidden" });
      }

      return res.json(caseData);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/:caseId/documents", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const caseData = await storage.getCase(req.params.caseId);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary || caseData.beneficiaryId !== beneficiary.id) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const docs = await storage.getDocumentsByCaseForBeneficiary(beneficiary.id, caseData.id);
        return res.json(docs);
      }

      const isAllowedStaff = user.role === "admin" || user.role === "lawyer" || user.role === "super_admin";
      if (!isAllowedStaff) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const docs = await storage.getDocumentsByCase(caseData.id);
      return res.json(docs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/cases/:caseId/documents", requireAuth, async (req: AuthRequest, res) => {
    try {
      const uploadMetaSchema = uploadedFileMetadataSchema.extend({
        category: z.string().optional().nullable(),
        description: z.string().optional().nullable(),
        tags: z.array(z.string()).optional().nullable(),
      });

      const bodySchema = z.object({
        isPublic: z.boolean().optional().default(false),
        documents: z.array(uploadMetaSchema).min(1),
      });

      const parsed = bodySchema.safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const user = await storage.getUser(req.session.userId!);
      if (!user) {
        return res.status(404).json({ error: "User not found" });
      }

      const caseData = await storage.getCase(req.params.caseId);
      if (!caseData) {
        return res.status(404).json({ error: "Case not found" });
      }

      // Beneficiary uploads are allowed, but must be for their own case and always public.
      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary || caseData.beneficiaryId !== beneficiary.id) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const docs = await storage.createDocumentsForCase({
          uploadedBy: user.id,
          beneficiaryId: beneficiary.id,
          caseId: caseData.id,
          isPublic: true,
          documents: parsed.data.documents as any,
        });

        return res.status(201).json({ success: true, documents: docs });
      }

      // Staff uploads (admin/lawyer/super_admin) may set visibility.
      const isAllowedStaff = user.role === "admin" || user.role === "lawyer" || user.role === "super_admin";
      if (!isAllowedStaff) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const docs = await storage.createDocumentsForCase({
        uploadedBy: user.id,
        beneficiaryId: caseData.beneficiaryId,
        caseId: caseData.id,
        isPublic: parsed.data.isPublic,
        documents: parsed.data.documents as any,
      });

      return res.status(201).json({ success: true, documents: docs });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Case Details (staff only) - add extended legal details for a case
  app.post(
    "/api/cases/:caseId/details",
    requireStaff,
    requireRole(["admin", "lawyer"]),
    async (req: AuthRequest, res) => {
      try {
        const caseData = await storage.getCase(req.params.caseId);
        if (!caseData) {
          return res.status(404).json({ error: "Case not found" });
        }

        // Accept urgencyDate as an ISO string (common JSON shape) and coerce to Date.
        const parsed = insertCaseDetailsSchema
          .omit({ caseId: true, urgencyDate: true })
          .extend({
            urgencyDate: z.union([z.date(), z.string(), z.null()]).optional(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const data: any = { ...(parsed.data as any) };
        if (typeof data.urgencyDate === "string") {
          data.urgencyDate = data.urgencyDate ? new Date(data.urgencyDate) : undefined;
        }
        if (data.urgencyDate === null) {
          data.urgencyDate = undefined;
        }

        const details = await storage.upsertCaseDetails(caseData.id, data as any);
        return res.status(201).json(details);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // CREATE CASE
  // - Beneficiary: always creates pending_admin_review for themselves.
  // - Admin: may create an internal case (auto accepted), but cannot assign lawyer via this route.
  app.post("/api/cases", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // Beneficiary self-create
      if (user.userType === "beneficiary" || user.role === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) {
          return res.status(404).json({ error: "Beneficiary profile not found" });
        }

        const parsed = insertCaseSchema
          .omit({
            beneficiaryId: true,
            status: true,
            assignedLawyerId: true,
            acceptedByUserId: true,
            acceptedAt: true,
            completedAt: true,
            internalNotes: true,
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const created = await storage.createCase({
          ...(parsed.data as any),
          beneficiaryId: beneficiary.id,
          status: "pending_review",
          assignedLawyerId: null,
          acceptedByUserId: null,
          acceptedAt: null,
          completedAt: null,
        } as any);

        await storage.createCaseTimelineEvent({
          caseId: created.id,
          eventType: "created",
          fromStatus: null,
          toStatus: created.status as any,
          note: null,
          actorUserId: user.id,
        } as any);

        await createAudit(user.id, "create", "case", created.id, `Created case: ${created.caseNumber}`, req.ip);
        return res.status(201).json(created);
      }

      // Staff create (admin only)
      if (user.userType !== "staff" || !(user.role === "admin" || user.role === "super_admin")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const parsed = insertCaseSchema
        .omit({
          status: true,
          assignedLawyerId: true,
          acceptedByUserId: true,
          acceptedAt: true,
          completedAt: true,
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const created = await storage.createCase({
        ...(parsed.data as any),
        status: "accepted_pending_assignment",
        assignedLawyerId: null,
        acceptedByUserId: user.id,
        acceptedAt: new Date(),
        completedAt: null,
      } as any);

      await storage.createCaseTimelineEvent({
        caseId: created.id,
        eventType: "created",
        fromStatus: null,
        toStatus: created.status as any,
        note: null,
        actorUserId: user.id,
      } as any);

      await createAudit(user.id, "create", "case", created.id, `Created case: ${created.caseNumber}`, req.ip);
      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ADMIN: approve
  app.patch(
    "/api/cases/:id/approve",
    requireStaff,
    async (req: AuthRequest, res) => {
      try {
        const user = req.user!;
        const isAdmin = user.role === "admin" || user.role === "super_admin";
        if (!isAdmin) {
          return res.status(403).json({ error: "Only admin can approve cases" });
        }
        const existing = await storage.getCase(req.params.id);
        if (!existing) return res.status(404).json({ error: "Case not found" });

        if (existing.status !== "pending_review" && existing.status !== "pending_admin_review") {
          return res.status(400).json({ error: "Invalid transition" });
        }

        const updated = await storage.updateCase(existing.id, {
          status: "accepted_pending_assignment" as any,
          acceptedByUserId: user.id,
          acceptedAt: new Date(),
        } as any);

        await storage.createCaseTimelineEvent({
          caseId: existing.id,
          eventType: "approved",
          fromStatus: existing.status as any,
          toStatus: "accepted_pending_assignment" as any,
          note: null,
          actorUserId: user.id,
        } as any);

        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ADMIN: reject
  app.patch(
    "/api/cases/:id/reject",
    requireStaff,
    async (req: AuthRequest, res) => {
      try {
        const user = req.user!;
        const isAdmin = user.role === "admin" || user.role === "super_admin";
        if (!isAdmin) {
          return res.status(403).json({ error: "Only admin can reject cases" });
        }
        const existing = await storage.getCase(req.params.id);
        if (!existing) return res.status(404).json({ error: "Case not found" });

        if (existing.status !== "pending_review" && existing.status !== "pending_admin_review") {
          return res.status(400).json({ error: "Invalid transition" });
        }

        const parsed = z
          .object({ rejectReason: z.string().trim().min(1).optional().nullable() })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updated = await storage.updateCase(existing.id, {
          status: "rejected" as any,
        } as any);

        await storage.createCaseTimelineEvent({
          caseId: existing.id,
          eventType: "rejected",
          fromStatus: existing.status as any,
          toStatus: "rejected" as any,
          note: parsed.data.rejectReason ?? null,
          actorUserId: user.id,
        } as any);

        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ADMIN: assign lawyer
  app.patch(
    "/api/cases/:id/assign-lawyer",
    requireStaff,
    async (req: AuthRequest, res) => {
      try {
        const user = req.user!;
        const isAdmin = user.role === "admin" || user.role === "super_admin";
        if (!isAdmin) {
          return res.status(403).json({ error: "Only admin can assign lawyers" });
        }
        const existing = await storage.getCase(req.params.id);
        if (!existing) return res.status(404).json({ error: "Case not found" });

        if (existing.status !== "accepted_pending_assignment" && existing.status !== "accepted") {
          return res.status(400).json({ error: "Invalid transition" });
        }

        const parsed = z.object({ lawyerId: z.string().min(1) }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const lawyer = await storage.getUser(parsed.data.lawyerId);
        if (!lawyer || lawyer.userType !== "staff" || lawyer.role !== "lawyer") {
          return res.status(400).json({ error: "Invalid lawyer" });
        }

        const updated = await storage.updateCase(existing.id, {
          assignedLawyerId: lawyer.id,
          status: "assigned" as any,
        } as any);

        await storage.createCaseTimelineEvent({
          caseId: existing.id,
          eventType: "assigned_lawyer",
          fromStatus: existing.status as any,
          toStatus: "assigned" as any,
          note: lawyer.id,
          actorUserId: user.id,
        } as any);

        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // UPDATE STATUS (operating statuses for assigned lawyer; admin optional)
  app.patch(
    "/api/cases/:id/status",
    requireStaff,
    async (req: AuthRequest, res) => {
      try {
        const user = req.user!;
        const existing = await storage.getCase(req.params.id);
        if (!existing) return res.status(404).json({ error: "Case not found" });

        const parsed = z
          .object({
            status: z.string().min(1),
            note: z.string().trim().max(1000).optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const nextStatus = parsed.data.status;
        const fromStatus = String(existing.status);

        const isAdmin = user.role === "admin" || user.role === "super_admin";
        const isAssignedLawyer = Boolean(existing.assignedLawyerId && existing.assignedLawyerId === user.id);

        // Authz + allowed status sets
        if (isAdmin) {
          if (!isAdminStatus(nextStatus)) {
            return res.status(400).json({ error: "Invalid status" });
          }

          // Prevent setting "assigned" without an assigned lawyer.
          if (nextStatus === "assigned" && !existing.assignedLawyerId) {
            return res.status(400).json({ error: "Cannot set assigned without lawyer" });
          }
        } else {
          if (user.role !== "lawyer" || !isAssignedLawyer) {
            return res.status(403).json({ error: "Only assigned lawyer can update status" });
          }
          if (!isOperatingStatus(nextStatus)) {
            return res.status(400).json({ error: "Invalid status" });
          }
        }

        const updates: any = {
          status: nextStatus as any,
        };
        if (nextStatus === "completed") {
          updates.completedAt = new Date();
        }

        if (nextStatus === "closed_admin") {
          updates.closedAt = new Date();
        }

        const updated = await storage.updateCase(existing.id, updates);

        await storage.createCaseTimelineEvent({
          caseId: existing.id,
          eventType: "status_changed",
          fromStatus: existing.status as any,
          toStatus: nextStatus as any,
          note: parsed.data.note ?? null,
          actorUserId: user.id,
        } as any);

        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // GET TIMELINE
  app.get("/api/cases/:id/timeline", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const existing = await storage.getCase(req.params.id);
      if (!existing) return res.status(404).json({ error: "Case not found" });

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary || existing.beneficiaryId !== beneficiary.id) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const events = await storage.getCaseTimelineEventsByCase(existing.id);
      return res.json(events);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/cases/:id", requireStaff, requireRole(["admin", "lawyer"]), async (req, res) => {
    try {
      const forbiddenKeys = [
        "status",
        "assignedLawyerId",
        "acceptedByUserId",
        "acceptedAt",
        "completedAt",
      ];
      for (const k of forbiddenKeys) {
        if (k in (req.body || {})) {
          return res.status(400).json({ error: "Use workflow endpoints for status/assignment changes" });
        }
      }

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

  app.delete("/api/cases/:id", requireStaff, requireRole(["admin", "lawyer"]), async (req, res) => {
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
      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (beneficiary) {
          appointments = await storage.getAppointmentsByBeneficiary(beneficiary.id);
        }
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
      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (beneficiary) {
          beneficiaryId = beneficiary.id;
        }
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
