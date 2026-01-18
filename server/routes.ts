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

const intakeLegacyCaseTypeSchema = z.enum(["civil", "criminal", "family", "labor", "asylum", "other"]);

interface AuthRequest extends Request {
  user?: User;
  beneficiary?: Beneficiary;
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  const sessionDebug = process.env.SESSION_DEBUG === "1";

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

  // Safe error message for beneficiaries (never expose internal details)
  function getSafeErrorMessage(err: unknown, userType?: "beneficiary" | "staff"): string {
    if (userType === "beneficiary") {
      // For beneficiaries, only return generic safe messages
      if (err instanceof Error) {
        const msg = err.message.toLowerCase();
        if (msg.includes("not found")) return "Resource not found";
        if (msg.includes("unauthorized") || msg.includes("forbidden")) return "Access denied";
        if (msg.includes("validation") || msg.includes("invalid")) return "Invalid request";
      }
      return "An error occurred. Please try again or contact support if the problem persists.";
    }
    // For staff, return detailed error messages
    return getErrorMessage(err);
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

  // ====== Feature flags (Pro features; default OFF) ======
  // Exposed to the client as a simple config object.
  const featureFlags = {
    FEATURE_CALENDAR_SYNC: process.env.FEATURE_CALENDAR_SYNC === "1",
    FEATURE_DOC_OCR: process.env.FEATURE_DOC_OCR === "1",
    FEATURE_AI_SUGGESTIONS: process.env.FEATURE_AI_SUGGESTIONS === "1",
    FEATURE_SLA: process.env.FEATURE_SLA === "1",
    FEATURE_2FA: process.env.FEATURE_2FA === "1",
    // Core feature flag; enabled by default unless explicitly disabled.
    FEATURE_JUDICIAL_SERVICES: process.env.FEATURE_JUDICIAL_SERVICES !== "0",
  } as const;

  app.get("/api/config/features", (_req, res) => {
    res.json(featureFlags);
  });

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

  // Attach user context (for role-based checks) without changing the auth model.
  async function requireUser(req: AuthRequest, res: any, next: any) {
    if (!req.session?.userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    const user = await storage.getUser(req.session.userId);
    if (!user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.user = user;
    next();
  }

  async function requireLawyer(req: AuthRequest, res: any, next: any) {
    await requireStaff(req, res, () => {});
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    if (req.user.role !== "lawyer") {
      return res.status(403).json({ error: "Forbidden" });
    }
    next();
  }

  function canLawyerAccessCase(user: User, caseData: any): boolean {
    if (user.role === "admin" || user.role === "super_admin") return true;
    if (user.role !== "lawyer") return false;
    return Boolean(caseData?.assignedLawyerId && String(caseData.assignedLawyerId) === String(user.id));
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
        return res.status(400).json({ error: "MISSING_CREDENTIALS", message: "Username and password required" });
      }

      const user = await storage.getUserByUsername(username);
      if (!user) {
        return res.status(401).json({ error: "USER_NOT_FOUND", message: "Invalid credentials" });
      }

      const validPassword = await bcrypt.compare(password, user.password);
      if (!validPassword) {
        return res.status(401).json({ error: "WRONG_PASSWORD", message: "Invalid credentials" });
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

  // Auth state probe
  // Always returns 200 with `{ ok: true, user: User | null }`.
  // This avoids client-side "Unauthorized loops" when the user is simply logged out.
  app.get("/api/auth/me", async (req, res) => {
    res.setHeader("Cache-Control", "no-store");
    res.setHeader("Vary", "Cookie");

    let user: any = null;
    try {
      const userId = (req as any).session?.userId;
      if (userId) {
        const u = await storage.getUser(String(userId));
        if (u) {
          const { password: _pw, ...safe } = u as any;
          user = safe;
        }
      }
    } catch {
      user = null;
    }

    const payload: any = { ok: true, user };
    if (sessionDebug) {
      payload.debug = {
        session: Boolean((req as any).session),
        sessionID: (req as any).sessionID ?? null,
        hasCookieHeader: Boolean(req.headers.cookie),
        cookieHeaderSample: req.headers.cookie ? String(req.headers.cookie).slice(0, 200) : null,
        protocol: req.protocol,
        secure: (req as any).secure,
        xForwardedProto: req.headers["x-forwarded-proto"] ?? null,
        origin: req.headers.origin ?? null,
      };
    }

    return res.status(200).json(payload);
  });

  //app.get("/api/auth/me", requireAuth, async (req, res) => {
    //try {
      //const user = await storage.getUser(req.session.userId!);
      //if (!user) {
        //return res.status(404).json({ error: "User not found" });
     // }
     // const { password: _, ...userWithoutPassword } = user;
      //res.json(userWithoutPassword);
    //} catch (error: any) {
      //res.status(500).json({ error: error.message });
    //}
  //});

  // ========== PUBLIC UPLOADS (REGISTRATION) ==========

  const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
  const UPLOAD_ALLOWED_MIME = new Set([
    "image/jpeg",
    "image/png",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/msword",
  ]);
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

      const decodePossiblyEncodedHeader = (value: string): string => {
        // Client sends encodeURIComponent(file.name) to ensure headers are ASCII-safe.
        // But older clients/scripts may send a raw name; decode only if safe.
        const trimmed = value.trim();
        try {
          return decodeURIComponent(trimmed);
        } catch {
          return trimmed;
        }
      };

      const sanitizeFileName = (value: string): string => {
        // Keep Unicode letters/numbers for display, but strip path separators and control chars.
        // Storage uses a random UUID key, so this is only metadata.
        const noPath = value.replace(/[\\/]+/g, "_");
        const noControls = noPath.replace(/[\u0000-\u001F\u007F]/g, "");
        const collapsed = noControls.replace(/\s+/g, " ").trim();
        return (collapsed || "upload").slice(0, 120);
      };

      const originalFileNameRaw =
        typeof fileNameHeader === "string" && fileNameHeader.trim()
          ? decodePossiblyEncodedHeader(fileNameHeader)
          : "upload";
      const fileName = sanitizeFileName(originalFileNameRaw);

      const ext =
        mimeType === "application/pdf"
          ? ".pdf"
          : mimeType === "image/png"
            ? ".png"
            : mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              ? ".docx"
              : mimeType === "application/msword"
                ? ".doc"
                : ".jpg";
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
      const user = req.user!;
      const beneficiary = req.beneficiary!;

      // Security: beneficiaryId and status are enforced server-side
      const parsed = insertServiceRequestSchema
        .omit({ beneficiaryId: true, status: true, urgentDate: true })
        .extend({
          urgentDate: z.union([z.string().datetime(), z.null()]).optional(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request" });
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

      // Audit log for service request creation
      await createAudit(user.id, "create", "service_request", created.id, `Created service request: ${input.serviceType}`, req.ip);
      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  // Beneficiary lists their own requests (beneficiary only)
  app.get("/api/service-requests/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const requests = await storage.getServiceRequestsByBeneficiary(beneficiary.id);
      return res.json(requests);
    } catch (error: any) {
      return res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
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

  // ========== CASE TYPES ROUTES (STAFF/ADMIN) ==========

  app.get("/api/case-types", requireStaff, requireRole(["admin"]), async (_req: AuthRequest, res) => {
    try {
      const rows = await storage.getAllCaseTypes();
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Active case types are safe to expose to any authenticated user
  // (staff and beneficiaries) so the case creation forms can populate the dropdown.
  app.get("/api/case-types/active", requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await storage.getActiveCaseTypes();
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/case-types", requireStaff, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const parsed = z
        .object({
          nameAr: z.string().trim().min(1),
          nameEn: z.string().trim().optional().nullable(),
          sortOrder: z.number().int().optional().nullable(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const created = await storage.createCaseType({
        nameAr: parsed.data.nameAr,
        nameEn: parsed.data.nameEn ?? null,
        sortOrder: parsed.data.sortOrder ?? 0,
        isActive: true,
      } as any);

      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/case-types/:id", requireStaff, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const parsed = z
        .object({
          nameAr: z.string().trim().min(1).optional(),
          nameEn: z.string().trim().optional().nullable(),
          sortOrder: z.number().int().optional().nullable(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updated = await storage.updateCaseType(req.params.id, {
        ...(parsed.data.nameAr != null ? { nameAr: parsed.data.nameAr } : {}),
        ...(parsed.data.nameEn !== undefined ? { nameEn: parsed.data.nameEn } : {}),
        ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder ?? 0 } : {}),
      } as any);

      if (!updated) return res.status(404).json({ error: "Case type not found" });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/case-types/:id/toggle", requireStaff, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updated = await storage.toggleCaseType(req.params.id, parsed.data.isActive);
      if (!updated) return res.status(404).json({ error: "Case type not found" });
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.delete("/api/case-types/:id", requireStaff, requireRole(["admin"]), async (req: AuthRequest, res) => {
    try {
      const result = await storage.deleteCaseType(req.params.id);
      if (!result.ok && result.reason === "not_found") {
        return res.status(404).json({ error: "Case type not found" });
      }
      if (!result.ok && result.reason === "linked") {
        return res.status(409).json({ error: "Cannot delete: case type is linked to existing cases" });
      }

      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========== SERVICE TYPES SETTINGS ROUTES (STAFF/ADMIN) ==========

  // Admin/staff settings list
  app.get(
    "/api/settings/service-types",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (_req: AuthRequest, res) => {
      try {
        const rows = await storage.getAllServiceTypes();
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Active list (safe for any authenticated user; used by dropdowns)
  app.get("/api/settings/service-types/active", requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await storage.getActiveServiceTypes();
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post(
    "/api/settings/service-types",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            key: z.string().trim().min(1).optional(),
            nameAr: z.string().trim().min(1),
            nameEn: z.string().trim().optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const makeBaseKey = (nameAr: string) => {
          const cleaned = nameAr
            .trim()
            .toLowerCase()
            // Keep ASCII letters/numbers/underscore; normalize separators.
            .replace(/[^a-z0-9]+/g, "_")
            .replace(/^_+|_+$/g, "")
            .slice(0, 40);

          return cleaned || `service_${Date.now()}`;
        };

        // If caller provided a key, trust it (still must be unique in DB).
        // Otherwise generate one and retry on collision.
        const requestedKey = parsed.data.key?.trim();
        const baseKey = requestedKey || makeBaseKey(parsed.data.nameAr);

        let created: any = null;
        const maxAttempts = 5;
        for (let attempt = 0; attempt < maxAttempts; attempt++) {
          const suffix = attempt === 0 ? "" : `_${Math.random().toString(36).slice(2, 7)}`;
          const key = requestedKey || `${baseKey}${suffix}`;
          try {
            created = await storage.createServiceType({
              key,
              nameAr: parsed.data.nameAr,
              nameEn: parsed.data.nameEn ?? null,
              isActive: true,
            } as any);
            break;
          } catch (e: any) {
            const msg = getErrorMessage(e);
            // Unique violation; retry if we generated the key.
            if (!requestedKey && /duplicate key value|unique constraint/i.test(msg)) {
              continue;
            }
            throw e;
          }
        }

        if (!created) {
          return res.status(409).json({ error: "Could not generate a unique key" });
        }

        await createAudit(req.session.userId!, "create", "service_type", created.id, `Created service type: ${created.nameAr}`);
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/settings/service-types/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            nameAr: z.string().trim().min(1).optional(),
            nameEn: z.string().trim().optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updated = await storage.updateServiceType(req.params.id, {
          ...(parsed.data.nameAr !== undefined ? { nameAr: parsed.data.nameAr } : {}),
          ...(parsed.data.nameEn !== undefined ? { nameEn: parsed.data.nameEn } : {}),
        } as any);

        if (!updated) return res.status(404).json({ error: "Service type not found" });

        await createAudit(req.session.userId!, "update", "service_type", updated.id, `Updated service type: ${updated.nameAr}`);
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/settings/service-types/:id/toggle",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updated = await storage.toggleServiceType(req.params.id, parsed.data.isActive);
        if (!updated) return res.status(404).json({ error: "Service type not found" });

        await createAudit(req.session.userId!, "toggle", "service_type", updated.id, `Toggled service type: ${updated.nameAr}`);
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.delete(
    "/api/settings/service-types/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const result = await storage.deleteServiceType(req.params.id);
        if (!result.ok && result.reason === "not_found") {
          return res.status(404).json({ error: "Service type not found" });
        }

        await createAudit(req.session.userId!, "delete", "service_type", req.params.id, "Deleted service type");
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ========== JUDICIAL SERVICE TYPES ROUTES (STAFF/ADMIN) ==========

  app.get(
    "/api/judicial-service-types",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (_req: AuthRequest, res) => {
      try {
        const rows = await storage.getAllJudicialServiceTypes();
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Active types are safe to expose to any authenticated user
  app.get("/api/judicial-service-types/active", requireAuth, async (_req: AuthRequest, res) => {
    try {
      const rows = await storage.getActiveJudicialServiceTypes();
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post(
    "/api/judicial-service-types",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            nameAr: z.string().trim().min(1),
            nameEn: z.string().trim().optional().nullable(),
            sortOrder: z.number().int().optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const created = await storage.createJudicialServiceType({
          nameAr: parsed.data.nameAr,
          nameEn: parsed.data.nameEn ?? null,
          sortOrder: parsed.data.sortOrder ?? 0,
          isActive: true,
        } as any);

        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/judicial-service-types/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            nameAr: z.string().trim().min(1).optional(),
            nameEn: z.string().trim().optional().nullable(),
            sortOrder: z.number().int().optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updated = await storage.updateJudicialServiceType(req.params.id, {
          ...(parsed.data.nameAr != null ? { nameAr: parsed.data.nameAr } : {}),
          ...(parsed.data.nameEn !== undefined ? { nameEn: parsed.data.nameEn } : {}),
          ...(parsed.data.sortOrder !== undefined ? { sortOrder: parsed.data.sortOrder ?? 0 } : {}),
        } as any);

        if (!updated) return res.status(404).json({ error: "Service type not found" });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/judicial-service-types/:id/toggle",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z.object({ isActive: z.boolean() }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updated = await storage.toggleJudicialServiceType(req.params.id, parsed.data.isActive);
        if (!updated) return res.status(404).json({ error: "Service type not found" });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.delete(
    "/api/judicial-service-types/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const result = await storage.deleteJudicialServiceType(req.params.id);
        if (!result.ok && result.reason === "not_found") {
          return res.status(404).json({ error: "Service type not found" });
        }
        if (!result.ok && result.reason === "linked") {
          return res.status(409).json({ error: "Cannot delete: service type is linked to existing services" });
        }
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // ========== JUDICIAL SERVICES ROUTES (STAGE 5) ==========

  const judicialServiceStatusSchema = z.enum(["new", "in_review", "accepted", "rejected"]);

  function canStaffAccessJudicialService(user: User, js: any): boolean {
    if (user.role === "admin" || user.role === "super_admin") return true;
    if (user.role === "lawyer") {
      return Boolean((js as any).assignedLawyerId && String((js as any).assignedLawyerId) === String(user.id));
    }
    return false;
  }

  async function notifyJudicialServiceParticipants(input: {
    judicialService: any;
    actorUserId: string;
    type: string;
    title: string;
    message: string;
  }) {
    const recipientIds = new Set<string>();

    if (input.judicialService?.assignedLawyerId) {
      recipientIds.add(String(input.judicialService.assignedLawyerId));
    }

    if (input.judicialService?.beneficiaryId) {
      const b = await storage.getBeneficiary(String(input.judicialService.beneficiaryId));
      const beneficiaryUserId = (b as any)?.userId ? String((b as any).userId) : null;
      if (beneficiaryUserId) recipientIds.add(beneficiaryUserId);
    }

    recipientIds.delete(String(input.actorUserId));

    await Promise.all(
      Array.from(recipientIds).map(async (userId) => {
        const u = await storage.getUser(String(userId));
        const url = u?.userType === "beneficiary" ? "/portal/judicial-services" : "/judicial-services";
        return storage.createNotification({
          userId,
          type: input.type,
          title: input.title,
          message: input.message,
          url,
          relatedEntityId: String(input.judicialService.id),
        } as any);
      }),
    );
  }

  // Beneficiary portal: list my judicial services
  app.get("/api/judicial-services/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const rows = await storage.getJudicialServicesByBeneficiary(beneficiary.id);
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Staff list + beneficiary list (single endpoint)
  app.get("/api/judicial-services", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) return res.json([]);
        const rows = await storage.getJudicialServicesByBeneficiary(beneficiary.id);
        return res.json(rows);
      }

      const isAllowedStaff = user.role === "admin" || user.role === "super_admin" || user.role === "lawyer";
      if (!isAllowedStaff) return res.status(403).json({ error: "Forbidden" });

      if (user.role === "lawyer") {
        const rows = await storage.getJudicialServicesByLawyer(user.id);
        return res.json(rows);
      }

      const rows = await storage.getAllJudicialServices();
      return res.json(rows);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create judicial service
  app.post("/api/judicial-services", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });

      const resolveTypeSnapshot = async (serviceTypeIdRaw: unknown) => {
        const serviceTypeId = typeof serviceTypeIdRaw === "string" && serviceTypeIdRaw.trim() ? serviceTypeIdRaw.trim() : null;
        if (!serviceTypeId) return null;
        const st = await storage.getJudicialServiceType(serviceTypeId);
        if (!st) throw new Error("Invalid service type");
        if (!(st as any).isActive) throw new Error("Service type is disabled");
        return {
          serviceTypeId: st.id,
          serviceTypeNameAr: (st as any).nameAr,
          serviceTypeNameEn: (st as any).nameEn ?? null,
        };
      };

      // Beneficiary creates a request
      if (user.userType === "beneficiary" || user.role === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) return res.status(404).json({ error: "Beneficiary profile not found" });

        const parsed = z
          .object({
            title: z.string().trim().min(1),
            description: z.string().trim().min(1),
            serviceTypeId: z.string().uuid().optional().nullable(),
            priority: z.enum(["low", "medium", "high", "urgent"]).optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

        const snapshot = await resolveTypeSnapshot(parsed.data.serviceTypeId);
        const serviceNumber = `JS-${Date.now()}`;

        const created = await storage.createJudicialService({
          serviceNumber,
          title: parsed.data.title,
          description: parsed.data.description,
          beneficiaryId: beneficiary.id,
          serviceTypeId: snapshot?.serviceTypeId ?? null,
          serviceTypeNameAr: snapshot?.serviceTypeNameAr ?? null,
          serviceTypeNameEn: snapshot?.serviceTypeNameEn ?? null,
          status: "new" as any,
          priority: (parsed.data.priority as any) ?? "medium",
          assignedLawyerId: null,
          createdByUserId: user.id,
          acceptedByUserId: null,
          acceptedAt: null,
          completedAt: null,
        } as any);

        // Notify admins
        const allUsers = await storage.getAllUsers();
        const adminIds = allUsers
          .filter((u) => u.userType === "staff" && (u.role === "admin" || u.role === "super_admin"))
          .map((u) => u.id)
          .filter((id) => String(id) !== String(user.id));

        await Promise.all(
          adminIds.map((adminId) =>
            storage.createNotification({
              userId: adminId,
              type: "JUDICIAL_SERVICE_NEW",
              title: "New judicial service request",
              message: `New request: ${created.title}`,
              url: "/judicial-services",
              relatedEntityId: String(created.id),
            } as any),
          ),
        );

        await createAudit(user.id, "create", "judicial_service", created.id, `Created judicial service: ${created.serviceNumber}`, req.ip);
        return res.status(201).json(created);
      }

      // Staff create (admin only)
      if (user.userType !== "staff" || !(user.role === "admin" || user.role === "super_admin")) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const parsed = z
        .object({
          beneficiaryId: z.string().trim().min(1),
          title: z.string().trim().min(1),
          description: z.string().optional().nullable(),
          serviceTypeId: z.string().uuid().optional().nullable(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional().nullable(),
        })
        .safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const beneficiary = await storage.getBeneficiary(parsed.data.beneficiaryId);
      if (!beneficiary) return res.status(400).json({ error: "Beneficiary not found" });

      const snapshot = await resolveTypeSnapshot(parsed.data.serviceTypeId);
      const serviceNumber = `JS-${Date.now()}`;

      const created = await storage.createJudicialService({
        serviceNumber,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        beneficiaryId: beneficiary.id,
        serviceTypeId: snapshot?.serviceTypeId ?? null,
        serviceTypeNameAr: snapshot?.serviceTypeNameAr ?? null,
        serviceTypeNameEn: snapshot?.serviceTypeNameEn ?? null,
        status: "accepted" as any,
        priority: (parsed.data.priority as any) ?? "medium",
        assignedLawyerId: null,
        createdByUserId: user.id,
        acceptedByUserId: user.id,
        acceptedAt: new Date(),
        completedAt: null,
      } as any);

      await notifyJudicialServiceParticipants({
        judicialService: created,
        actorUserId: user.id,
        type: "JUDICIAL_SERVICE_CREATED",
        title: "Judicial service created",
        message: `Service created: ${created.title}`,
      });

      await createAudit(user.id, "create", "judicial_service", created.id, `Created judicial service: ${created.serviceNumber}`, req.ip);
      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Get one
  app.get("/api/judicial-services/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });

      const js = await storage.getJudicialService(req.params.id);
      if (!js) return res.status(404).json({ error: "Judicial service not found" });

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary || String((js as any).beneficiaryId) !== String(beneficiary.id)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        return res.json(js);
      }

      const isAllowedStaff = user.role === "admin" || user.role === "super_admin" || user.role === "lawyer";
      if (!isAllowedStaff) return res.status(403).json({ error: "Forbidden" });
      if (!canStaffAccessJudicialService(user, js)) return res.status(403).json({ error: "Forbidden" });
      return res.json(js);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin: assign lawyer
  app.patch(
    "/api/judicial-services/:id/assign-lawyer",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const existing = await storage.getJudicialService(req.params.id);
        if (!existing) return res.status(404).json({ error: "Judicial service not found" });

        const parsed = z.object({ lawyerId: z.string().min(1) }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const lawyer = await storage.getUser(parsed.data.lawyerId);
        if (!lawyer || lawyer.userType !== "staff" || lawyer.role !== "lawyer") {
          return res.status(400).json({ error: "Invalid lawyer" });
        }

        const updated = await storage.updateJudicialService(existing.id, {
          assignedLawyerId: lawyer.id,
          status: "assigned" as any,
        } as any);

        await notifyJudicialServiceParticipants({
          judicialService: updated || existing,
          actorUserId: user.id,
          type: "JUDICIAL_SERVICE_ASSIGNED",
          title: "Judicial service assigned",
          message: `Assigned to lawyer`,
        });

        await createAudit(user.id, "assign", "judicial_service", existing.id, `Assigned lawyer ${lawyer.id}`, req.ip);
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Update status
  app.patch("/api/judicial-services/:id/status", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const existing = await storage.getJudicialService(req.params.id);
      if (!existing) return res.status(404).json({ error: "Judicial service not found" });

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

      // Simplified 4-state workflow: only admins can change status.
      const isAdmin = user.role === "admin" || user.role === "super_admin";
      if (!isAdmin) return res.status(403).json({ error: "Forbidden" });

      const ok = judicialServiceStatusSchema.safeParse(nextStatus);
      if (!ok.success) return res.status(400).json({ error: "Invalid status" });

      const updates: any = { status: nextStatus as any };
      if (nextStatus === "accepted") {
        updates.acceptedAt = new Date();
        updates.acceptedByUserId = user.id;
      }

      const updated = await storage.updateJudicialService(existing.id, updates);

      await notifyJudicialServiceParticipants({
        judicialService: updated || existing,
        actorUserId: user.id,
        type: "JUDICIAL_SERVICE_STATUS_CHANGED",
        title: "Judicial service status updated",
        message: `Status: ${nextStatus}`,
      });

      await createAudit(user.id, "update_status", "judicial_service", existing.id, `Status -> ${nextStatus}`, req.ip);
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Admin update fields
  app.patch(
    "/api/judicial-services/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const existing = await storage.getJudicialService(req.params.id);
        if (!existing) return res.status(404).json({ error: "Judicial service not found" });

        const parsed = z
          .object({
            title: z.string().trim().min(1).optional(),
            description: z.union([z.string().trim(), z.null()]).optional(),
            priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
            serviceTypeId: z.union([z.string().uuid(), z.null()]).optional(),
          })
          .safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updates: any = { ...parsed.data };
        if (updates.serviceTypeId !== undefined) {
          if (updates.serviceTypeId === null) {
            updates.serviceTypeId = null;
            updates.serviceTypeNameAr = null;
            updates.serviceTypeNameEn = null;
          } else {
            const st = await storage.getJudicialServiceType(String(updates.serviceTypeId));
            if (!st) return res.status(400).json({ error: "Invalid service type" });
            if (!(st as any).isActive) return res.status(400).json({ error: "Service type is disabled" });
            updates.serviceTypeNameAr = (st as any).nameAr;
            updates.serviceTypeNameEn = (st as any).nameEn ?? null;
          }
        }

        const updated = await storage.updateJudicialService(existing.id, updates);
        await createAudit(user.id, "update", "judicial_service", existing.id, `Updated judicial service: ${existing.serviceNumber}`, req.ip);
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Admin delete
  app.delete(
    "/api/judicial-services/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const ok = await storage.deleteJudicialService(req.params.id);
        if (!ok) return res.status(404).json({ error: "Judicial service not found" });
        await createAudit(user.id, "delete", "judicial_service", req.params.id, "Deleted judicial service", req.ip);
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Attachments list
  app.get("/api/judicial-services/:id/attachments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });
      const js = await storage.getJudicialService(req.params.id);
      if (!js) return res.status(404).json({ error: "Judicial service not found" });

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary || String((js as any).beneficiaryId) !== String(beneficiary.id)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const docs = await storage.getDocumentsByJudicialService(js.id);
        return res.json((docs as any[]).filter((d) => Boolean((d as any).isPublic)));
      }

      if (!canStaffAccessJudicialService(user, js)) return res.status(403).json({ error: "Forbidden" });
      const docs = await storage.getDocumentsByJudicialService(js.id);
      return res.json(docs);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Attachments add
  app.post("/api/judicial-services/:id/attachments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await storage.getUser(req.session.userId!);
      if (!user) return res.status(404).json({ error: "User not found" });
      const js = await storage.getJudicialService(req.params.id);
      if (!js) return res.status(404).json({ error: "Judicial service not found" });

      const parsed = z
        .object({
          isPublic: z.boolean().optional(),
          documents: z.array(uploadedFileMetadataSchema).min(1),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary || String((js as any).beneficiaryId) !== String(beneficiary.id)) {
          return res.status(403).json({ error: "Forbidden" });
        }
        const docs = await storage.attachDocumentsToJudicialService({
          uploadedBy: user.id,
          beneficiaryId: beneficiary.id,
          judicialServiceId: js.id,
          isPublic: true,
          documents: parsed.data.documents,
        });

        await notifyJudicialServiceParticipants({
          judicialService: js,
          actorUserId: user.id,
          type: "JUDICIAL_SERVICE_ATTACHMENT_ADDED",
          title: "Attachment added",
          message: `Attachment added to service: ${String((js as any).title || "")}`,
        });

        return res.status(201).json({ success: true, documents: docs });
      }

      if (!canStaffAccessJudicialService(user, js)) return res.status(403).json({ error: "Forbidden" });

      const beneficiaryIdForDoc = String((js as any).beneficiaryId);
      const isPublic = parsed.data.isPublic ?? true;
      const docs = await storage.attachDocumentsToJudicialService({
        uploadedBy: user.id,
        beneficiaryId: beneficiaryIdForDoc,
        judicialServiceId: js.id,
        isPublic,
        documents: parsed.data.documents,
      });

      await notifyJudicialServiceParticipants({
        judicialService: js,
        actorUserId: user.id,
        type: "JUDICIAL_SERVICE_ATTACHMENT_ADDED",
        title: "Attachment added",
        message: `Attachment added to service: ${String((js as any).title || "")}`,
      });

      return res.status(201).json({ success: true, documents: docs });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========== DOCUMENTS LIBRARY ROUTES (STAFF/ADMIN) ==========

  const libraryVisibilitySchema = z.enum(["internal", "case_team", "beneficiary"]);

  // Folders
  app.get(
    "/api/doc-folders",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const includeArchived = req.query.includeArchived === "1" || req.query.includeArchived === "true";
        const folders = await storage.listDocumentFolders({ includeArchived });
        return res.json(folders);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.post(
    "/api/doc-folders",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            name: z.string().trim().min(1),
            parentId: z.string().uuid().optional().nullable(),
            description: z.string().optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        if (parsed.data.parentId) {
          const parent = await storage.getDocumentFolder(parsed.data.parentId);
          if (!parent) return res.status(400).json({ error: "Invalid parent folder" });
        }

        const created = await storage.createDocumentFolder({
          name: parsed.data.name,
          parentId: parsed.data.parentId ?? null,
          description: parsed.data.description ?? null,
          isArchived: false,
        } as any);

        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/doc-folders/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            name: z.string().trim().min(1).optional(),
            parentId: z.string().uuid().optional().nullable(),
            description: z.string().optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        if (parsed.data.parentId) {
          if (parsed.data.parentId === req.params.id) {
            return res.status(400).json({ error: "Folder cannot be its own parent" });
          }
          const parent = await storage.getDocumentFolder(parsed.data.parentId);
          if (!parent) return res.status(400).json({ error: "Invalid parent folder" });
        }

        const updated = await storage.updateDocumentFolder(req.params.id, {
          ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
          ...(parsed.data.parentId !== undefined ? { parentId: parsed.data.parentId } : {}),
          ...(parsed.data.description !== undefined ? { description: parsed.data.description } : {}),
        } as any);

        if (!updated) return res.status(404).json({ error: "Folder not found" });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/doc-folders/:id/archive",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z.object({ isArchived: z.boolean() }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updated = await storage.toggleDocumentFolderArchive(req.params.id, parsed.data.isArchived);
        if (!updated) return res.status(404).json({ error: "Folder not found" });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.delete(
    "/api/doc-folders/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const result = await storage.deleteDocumentFolder(req.params.id);
        if (!result.ok && result.reason === "not_found") {
          return res.status(404).json({ error: "Folder not found" });
        }
        if (!result.ok && result.reason === "has_children") {
          return res.status(409).json({ error: "Cannot delete: folder has child folders" });
        }
        if (!result.ok && result.reason === "has_documents") {
          return res.status(409).json({ error: "Cannot delete: folder has documents" });
        }
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Library documents
  app.get(
    "/api/library-docs",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const q = typeof req.query.q === "string" ? req.query.q : undefined;
        const folderId = typeof req.query.folderId === "string" ? req.query.folderId : undefined;
        const beneficiaryId = typeof req.query.beneficiaryId === "string" ? req.query.beneficiaryId : undefined;
        const caseId = typeof req.query.caseId === "string" ? req.query.caseId : undefined;
        const visibility = typeof req.query.visibility === "string" ? req.query.visibility : undefined;
        const includeArchived = req.query.includeArchived === "1" || req.query.includeArchived === "true";
        const limit = typeof req.query.limit === "string" ? Number(req.query.limit) : undefined;

        const docs = await storage.listLibraryDocuments({
          q,
          folderId: folderId || null,
          beneficiaryId: beneficiaryId || null,
          caseId: caseId || null,
          visibility: visibility || null,
          includeArchived,
          limit,
        });

        return res.json(docs);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.get(
    "/api/library-docs/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const doc = await storage.getLibraryDocument(req.params.id);
        if (!doc) return res.status(404).json({ error: "Document not found" });
        return res.json(doc);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.post(
    "/api/library-docs",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            folderId: z.string().uuid().optional().nullable(),
            title: z.string().trim().min(1),
            docType: z.string().trim().optional().nullable(),
            description: z.string().optional().nullable(),
            documentDate: z.union([z.string().datetime(), z.null()]).optional(),
            tags: z.array(z.string().trim().min(1)).optional().nullable(),
            visibility: libraryVisibilitySchema.optional().default("internal"),
            beneficiaryId: z.string().trim().min(1).optional().nullable(),
            caseId: z.string().trim().min(1).optional().nullable(),
            file: uploadedFileMetadataSchema,
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const input = parsed.data;

        if (input.folderId) {
          const folder = await storage.getDocumentFolder(input.folderId);
          if (!folder) return res.status(400).json({ error: "Invalid folder" });
          if ((folder as any).isArchived) return res.status(400).json({ error: "Folder is archived" });
        }

        if (input.beneficiaryId) {
          const b = await storage.getBeneficiary(String(input.beneficiaryId));
          if (!b) return res.status(400).json({ error: "Invalid beneficiary" });
        }

        if (input.caseId) {
          const c = await storage.getCase(String(input.caseId));
          if (!c) return res.status(400).json({ error: "Invalid case" });
        }

        const actorId = (req.user as any)?.id;

        const created = await storage.createLibraryDocument({
          folderId: input.folderId ?? null,
          title: input.title,
          docType: input.docType ?? null,
          description: input.description ?? null,
          fileName: input.file.fileName,
          mimeType: input.file.mimeType,
          size: input.file.size,
          storageKey: input.file.storageKey,
          documentDate: input.documentDate ? new Date(input.documentDate) : null,
          tags: input.tags ?? null,
          visibility: input.visibility as any,
          beneficiaryId: input.beneficiaryId ?? null,
          caseId: input.caseId ?? null,
          isArchived: false,
          createdBy: actorId ?? null,
        } as any);

        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/library-docs/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            folderId: z.string().uuid().optional().nullable(),
            title: z.string().trim().min(1).optional(),
            docType: z.string().trim().optional().nullable(),
            description: z.string().optional().nullable(),
            documentDate: z.union([z.string().datetime(), z.null()]).optional(),
            tags: z.array(z.string().trim().min(1)).optional().nullable(),
            visibility: libraryVisibilitySchema.optional(),
            beneficiaryId: z.union([z.string().trim().min(1), z.null()]).optional(),
            caseId: z.union([z.string().trim().min(1), z.null()]).optional(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updates: any = { ...parsed.data };

        if (updates.folderId) {
          const folder = await storage.getDocumentFolder(updates.folderId);
          if (!folder) return res.status(400).json({ error: "Invalid folder" });
        }

        if (updates.beneficiaryId && updates.beneficiaryId !== null) {
          const b = await storage.getBeneficiary(String(updates.beneficiaryId));
          if (!b) return res.status(400).json({ error: "Invalid beneficiary" });
        }

        if (updates.caseId && updates.caseId !== null) {
          const c = await storage.getCase(String(updates.caseId));
          if (!c) return res.status(400).json({ error: "Invalid case" });
        }

        if (updates.documentDate !== undefined) {
          updates.documentDate = typeof updates.documentDate === "string" ? new Date(updates.documentDate) : null;
        }

        const updated = await storage.updateLibraryDocument(req.params.id, updates);
        if (!updated) return res.status(404).json({ error: "Document not found" });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.patch(
    "/api/library-docs/:id/archive",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z.object({ isArchived: z.boolean() }).safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }
        const updated = await storage.toggleLibraryDocumentArchive(req.params.id, parsed.data.isArchived);
        if (!updated) return res.status(404).json({ error: "Document not found" });
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.delete(
    "/api/library-docs/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const ok = await storage.deleteLibraryDocument(req.params.id);
        if (!ok) return res.status(404).json({ error: "Document not found" });
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

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

  // ========== STAFF BENEFICIARY CREATE (UNIFIED FORM) ==========
  // Creates BOTH:
  // - users row (beneficiary account)
  // - beneficiaries row (beneficiary profile)
  // - assigns default beneficiary rule
  // Transactional to avoid orphaned rows.
  app.post(
    "/api/staff/beneficiaries",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            fullName: z.string().trim().min(1),
            username: z.string().trim().min(1),
            email: z.string().trim().email(),
            password: z.string().min(8),
            confirmPassword: z.string().min(8),
            phone: z.string().trim().min(1),
            gender: z.enum(["male", "female"]).optional(),
            city: z.string().trim().min(1),
            preferredLanguage: z.enum(["ar", "en"]),
          })
          .superRefine((data, ctx) => {
            if (data.password !== data.confirmPassword) {
              ctx.addIssue({
                code: z.ZodIssueCode.custom,
                path: ["confirmPassword"],
                message: "Passwords do not match",
              });
            }
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const input = parsed.data;

        const existingEmail = await storage.getUserByEmail(input.email);
        if (existingEmail) {
          return res.status(409).json({ error: "Email already exists" });
        }

        const existingUsername = await storage.getUserByUsername(input.username);
        if (existingUsername) {
          return res.status(409).json({ error: "Username already exists" });
        }

        const hashedPassword = await bcrypt.hash(input.password, 10);
        const rule = await ensureBeneficiaryDefaultRule();
        const idNumber = `AUTO-${randomUUID()}`;

        const created = await storage.createBeneficiaryWithUserAndRule({
          user: {
            username: input.username,
            email: input.email,
            password: hashedPassword,
            fullName: input.fullName,
            role: "beneficiary",
            userType: "beneficiary",
            emailVerified: false,
            isActive: true,
          } as any,
          beneficiary: {
            fullName: input.fullName,
            idNumber,
            phone: input.phone,
            email: input.email,
            city: input.city,
            preferredLanguage: input.preferredLanguage,
            gender: input.gender,
            status: "pending",
          } as any,
          ruleId: rule.id,
        });

        await createAudit(req.session.userId!, "create", "beneficiary", created.beneficiary.id, `Created beneficiary (staff): ${created.beneficiary.fullName}`, req.ip);

        const { password: _pw, ...userWithoutPassword } = created.user as any;
        return res.status(201).json({ user: userWithoutPassword, beneficiary: created.beneficiary });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

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
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
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
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.get("/api/portal/my-cases", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const cases = await storage.getCasesByBeneficiary(req.beneficiary!.id);
      // Remove internal notes for beneficiary view
      const publicCases = cases.map(({ internalNotes, ...caseData }) => caseData);
      res.json(publicCases);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  // ========== STAGE 5: BENEFICIARY SELF ENDPOINTS ==========

  app.get("/api/beneficiary/me", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      res.json(req.beneficiary);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.patch("/api/beneficiary/me", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const beneficiary = req.beneficiary!;
      const body = (req.body || {}) as any;
      const updates: any = {};
      
      // Security: Enforce allowlist - Only non-legal identity fields
      // BLOCKED: fullName, nationalId, idNumber (legal identity)
      const allowed = [
        "phone",
        "email",
        "city",
        "address",
        "preferredLanguage",
        "nationality",
        "gender",
        "birthDate",
      ];
      
      // Check for attempted blocked field updates
      const blocked = ["fullName", "nationalId", "idNumber"];
      const attemptedBlocked = blocked.filter(key => key in body);
      if (attemptedBlocked.length > 0) {
        await createAudit(user.id, "security_violation", "beneficiary", beneficiary.id, `Attempted to update blocked fields: ${attemptedBlocked.join(", ")}`, req.ip);
        return res.status(403).json({ error: "Cannot update legal identity fields" });
      }
      
      for (const key of allowed) {
        if (key in body) updates[key] = body[key];
      }

      const updated = await storage.updateBeneficiary(beneficiary.id, updates);
      
      // Audit log for profile update
      await createAudit(user.id, "update", "beneficiary_profile", beneficiary.id, `Updated fields: ${Object.keys(updates).join(", ")}`, req.ip);
      res.json(updated);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.get("/api/cases/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const cases = await storage.getCasesByBeneficiary(req.beneficiary!.id);
      const publicCases = cases.map(({ internalNotes, ...caseData }) => caseData);
      res.json(publicCases);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  // Beneficiary: Get sessions for my cases
  app.get("/api/portal/my-sessions", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const cases = await storage.getCasesByBeneficiary(beneficiary.id);
      
      // Get sessions for all beneficiary's cases
      const sessionsPromises = cases.map((c) => storage.getSessionsByCase(c.id));
      const sessionsArrays = await Promise.all(sessionsPromises);
      const allSessions = sessionsArrays.flat();
      
      return res.json(allSessions);
    } catch (error: any) {
      return res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.get("/api/cases/my/:caseId/documents", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const beneficiary = req.beneficiary!;
      const caseData = await storage.getCase(req.params.caseId);
      if (!caseData) {
        return res.status(404).json({ error: "Resource not found" });
      }
      // Security: Data ownership validation
      if (caseData.beneficiaryId !== beneficiary.id) {
        await createAudit(user.id, "unauthorized_access_attempt", "case", req.params.caseId, "Attempted to access documents for unauthorized case", req.ip);
        return res.status(403).json({ error: "Access denied" });
      }

      const docs = await storage.getDocumentsByCaseForBeneficiary(beneficiary.id, caseData.id);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
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
        return res.status(400).json({ error: "Invalid request" });
      }

      const user = req.user!;
      const beneficiary = req.beneficiary!;

      const requestId = parsed.data.requestId ? String(parsed.data.requestId) : undefined;
      if (requestId) {
        const sr = await storage.getServiceRequest(requestId);
        if (!sr) {
          return res.status(404).json({ error: "Resource not found" });
        }
        // Data ownership validation
        if (sr.beneficiaryId !== beneficiary.id) {
          await createAudit(user.id, "unauthorized_access_attempt", "service_request", requestId, "Attempted to upload documents to unauthorized request", req.ip);
          return res.status(403).json({ error: "Access denied" });
        }

        const docs = await storage.attachDocumentsToServiceRequest({
          uploadedBy: user.id,
          beneficiaryId: beneficiary.id,
          requestId,
          documents: parsed.data.documents,
        });
        
        // Audit log for document upload
        await createAudit(user.id, "upload", "document", requestId, `Uploaded ${docs.length} document(s) to service request`, req.ip);
        return res.status(201).json({ success: true, documents: docs });
      }

      const docs = await storage.createDocumentsForBeneficiary({
        uploadedBy: user.id,
        beneficiaryId: beneficiary.id,
        documents: parsed.data.documents,
      });
      
      // Audit log for document upload
      await createAudit(user.id, "upload", "document", beneficiary.id, `Uploaded ${docs.length} document(s)`, req.ip);
      return res.status(201).json({ success: true, documents: docs });
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.get("/api/documents/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const docs = await storage.getDocumentsVisibleToBeneficiary(beneficiary.id);
      res.json(docs);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.get("/api/portal/my-intake-requests", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const requests = await storage.getIntakeRequestsByBeneficiary(req.beneficiary!.id);
      // Remove review notes for beneficiary view
      const publicRequests = requests.map(({ reviewNotes, ...request }) => request);
      res.json(publicRequests);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.post("/api/portal/intake-requests", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const beneficiary = req.beneficiary!;

      const parsed = z
        .object({
          // New: dynamic case type id
          caseTypeId: z.string().uuid().optional().nullable(),
          // Legacy fallback
          caseTypeLegacy: intakeLegacyCaseTypeSchema.optional().nullable(),
          description: z.string().trim().min(1),
          documents: z.array(z.string()).optional().default([]),
        })
        .superRefine((data, ctx) => {
          if (!data.caseTypeId && !data.caseTypeLegacy) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["caseTypeId"], message: "Case type is required" });
          }
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: "Invalid request" });
      }

      const input = parsed.data;

      // Validate dynamic id if present
      if (input.caseTypeId) {
        const ct = await storage.getCaseType(input.caseTypeId);
        if (!ct) {
          return res.status(400).json({ error: "Invalid case type" });
        }
        if (!ct.isActive) {
          return res.status(400).json({ error: "Case type is disabled" });
        }
      }

      const legacy = input.caseTypeLegacy ?? (input.caseTypeId ? "other" : null);

      const request = await storage.createIntakeRequest({
        beneficiaryId: beneficiary.id,
        caseType: legacy as any,
        caseTypeId: input.caseTypeId ?? null,
        description: input.description,
        documents: input.documents || [],
        status: "pending",
      } as any);

      // Audit log for intake request creation
      await createAudit(user.id, "create", "intake_request", request.id, `Created intake request`, req.ip);

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
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  app.get("/api/portal/dashboard-stats", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const stats = await storage.getBeneficiaryDashboardStats(req.beneficiary!.id);
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
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
      const parsed = z
        .object({
          beneficiaryId: z.string().trim().min(1),
          // New: dynamic case type id
          caseTypeId: z.string().uuid().optional().nullable(),
          // Legacy fallback
          caseTypeLegacy: intakeLegacyCaseTypeSchema.optional().nullable(),
          description: z.string().trim().min(1),
          status: z.enum(["pending", "approved", "rejected", "under_review"]).optional(),
          reviewedBy: z.string().optional().nullable(),
          reviewNotes: z.string().optional().nullable(),
          documents: z.array(z.string()).optional().default([]),
        })
        .superRefine((data, ctx) => {
          if (!data.caseTypeId && !data.caseTypeLegacy) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["caseTypeId"], message: "Case type is required" });
          }
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const input = parsed.data;

      if (input.caseTypeId) {
        const ct = await storage.getCaseType(input.caseTypeId);
        if (!ct) return res.status(400).json({ error: "Invalid case type" });
        if (!ct.isActive) return res.status(400).json({ error: "Case type is disabled" });
      }

      const legacy = input.caseTypeLegacy ?? (input.caseTypeId ? "other" : null);

      const request = await storage.createIntakeRequest({
        beneficiaryId: input.beneficiaryId,
        caseType: legacy as any,
        caseTypeId: input.caseTypeId ?? null,
        description: input.description,
        status: input.status ?? "pending",
        reviewedBy: input.reviewedBy ?? null,
        reviewNotes: input.reviewNotes ?? null,
        documents: input.documents || [],
      } as any);
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

      // Staff: admin/super_admin can see all; lawyers can see assigned only.
      const isAllowedStaff = user.role === "admin" || user.role === "lawyer" || user.role === "super_admin";
      if (!isAllowedStaff) return res.status(403).json({ error: "Forbidden" });

      if (user.role === "lawyer") {
        const cases = await storage.getCasesByLawyer(user.id);
        return res.json(cases);
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
      if (!isAllowedStaff) return res.status(403).json({ error: "Forbidden" });

      // Lawyers: only assigned cases
      if (!canLawyerAccessCase(user, caseData)) {
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
      if (!isAllowedStaff) return res.status(403).json({ error: "Forbidden" });

      if (!canLawyerAccessCase(user, caseData)) {
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
      if (!isAllowedStaff) return res.status(403).json({ error: "Forbidden" });

      if (!canLawyerAccessCase(user, caseData)) {
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

      const resolveCaseTypeSnapshot = async (caseTypeIdRaw: unknown) => {
        const caseTypeId = typeof caseTypeIdRaw === "string" && caseTypeIdRaw.trim() ? caseTypeIdRaw.trim() : null;
        if (!caseTypeId) return null;
        const ct = await storage.getCaseType(caseTypeId);
        if (!ct) throw new Error("Invalid case type");
        if (!ct.isActive) throw new Error("Case type is disabled");
        return {
          caseTypeId: ct.id,
          caseTypeNameAr: ct.nameAr,
          caseTypeNameEn: ct.nameEn ?? null,
        };
      };

      // Beneficiary self-create
      if (user.userType === "beneficiary" || user.role === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) {
          return res.status(404).json({ error: "Beneficiary profile not found" });
        }

        const parsed = z
          .object({
            caseNumber: z.string().trim().min(1),
            title: z.string().trim().min(1),
            description: z.string().optional().nullable(),
            caseType: z.string().optional().nullable(),
            caseTypeId: z.string().optional().nullable(),
            opponentName: z.string().optional().nullable(),
            opponentLawyer: z.string().optional().nullable(),
            opponentContact: z.string().optional().nullable(),
            priority: z.string().optional().nullable(),
          })
          .safeParse(req.body);

        if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

        const snapshot = await resolveCaseTypeSnapshot(parsed.data.caseTypeId);

        const created = await storage.createCase({
          caseNumber: parsed.data.caseNumber,
          title: parsed.data.title,
          beneficiaryId: beneficiary.id,
          // Keep legacy enum populated to avoid breaking existing DB constraints.
          caseType: ((parsed.data.caseType as any) || "civil") as any,
          caseTypeId: snapshot?.caseTypeId ?? null,
          caseTypeNameAr: snapshot?.caseTypeNameAr ?? null,
          caseTypeNameEn: snapshot?.caseTypeNameEn ?? null,
          description: parsed.data.description ?? "",
          opponentName: parsed.data.opponentName ?? null,
          opponentLawyer: parsed.data.opponentLawyer ?? null,
          opponentContact: parsed.data.opponentContact ?? null,
          status: "pending_review" as any,
          priority: (parsed.data.priority as any) ?? "medium",
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

      const parsed = z
        .object({
          caseNumber: z.string().trim().min(1),
          title: z.string().trim().min(1),
          beneficiaryId: z.string().trim().min(1),
          description: z.string().min(1),
          caseType: z.string().optional().nullable(),
          caseTypeId: z.string().optional().nullable(),
          opponentName: z.string().optional().nullable(),
          opponentLawyer: z.string().optional().nullable(),
          opponentContact: z.string().optional().nullable(),
          priority: z.string().optional().nullable(),
          internalNotes: z.string().optional().nullable(),
        })
        .safeParse(req.body);

      if (!parsed.success) return res.status(400).json({ error: fromZodError(parsed.error).message });

      const snapshot = await resolveCaseTypeSnapshot(parsed.data.caseTypeId);

      const created = await storage.createCase({
        caseNumber: parsed.data.caseNumber,
        title: parsed.data.title,
        beneficiaryId: parsed.data.beneficiaryId,
        caseType: ((parsed.data.caseType as any) || "civil") as any,
        caseTypeId: snapshot?.caseTypeId ?? null,
        caseTypeNameAr: snapshot?.caseTypeNameAr ?? null,
        caseTypeNameEn: snapshot?.caseTypeNameEn ?? null,
        description: parsed.data.description,
        opponentName: parsed.data.opponentName ?? null,
        opponentLawyer: parsed.data.opponentLawyer ?? null,
        opponentContact: parsed.data.opponentContact ?? null,
        status: "accepted_pending_assignment" as any,
        priority: (parsed.data.priority as any) ?? "medium",
        assignedLawyerId: null,
        acceptedByUserId: user.id,
        acceptedAt: new Date(),
        completedAt: null,
        internalNotes: parsed.data.internalNotes ?? null,
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
          eventType: "lawyer_assigned",
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
      } else if (user.role === "lawyer") {
        if (!canLawyerAccessCase(user, existing)) {
          return res.status(403).json({ error: "Forbidden" });
        }
      }

      const events = await storage.getCaseTimelineEventsByCase(existing.id);
      return res.json(events);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========== LAWYER PORTAL API (STAGE: lawyer self) ==========

  // Dashboard summary for the logged-in lawyer
  app.get("/api/lawyer/me/dashboard", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const cases = await storage.getCasesByLawyer(lawyer.id);

      const byStatus: Record<string, number> = {};
      for (const c of cases as any[]) {
        const s = String((c as any).status || "unknown");
        byStatus[s] = (byStatus[s] || 0) + 1;
      }

      const tasks = await storage.getTasksByAssignee(lawyer.id);
      const today = new Date();
      const startOfToday = new Date(today);
      startOfToday.setHours(0, 0, 0, 0);
      const endOfToday = new Date(today);
      endOfToday.setHours(23, 59, 59, 999);

      const dueToday = (tasks as any[]).filter((t) => {
        const due = (t as any).dueDate ? new Date((t as any).dueDate) : null;
        if (!due) return false;
        return due >= startOfToday && due <= endOfToday && String((t as any).status) !== "completed";
      });

      const notifications = await storage.getNotificationsByUser(lawyer.id);
      const recentNotifications = (notifications as any[]).slice(0, 10);

      // Optional: sessions this week (based on cases assigned to the lawyer)
      const caseIdSet = new Set((cases as any[]).map((c) => String((c as any).id)));
      const sessionsAll = await storage.getAllSessions();
      const next7 = new Date();
      next7.setDate(next7.getDate() + 7);
      const upcomingSessions = (sessionsAll as any[])
        .filter((s) => caseIdSet.has(String((s as any).caseId)))
        .filter((s) => {
          const d = new Date((s as any).gregorianDate);
          return d >= today && d <= next7;
        })
        .slice(0, 10);

      return res.json({
        features: featureFlags,
        counts: {
          totalCases: cases.length,
          byStatus,
          dueTodayTasks: dueToday.length,
          overdueCases: featureFlags.FEATURE_SLA ? 0 : undefined,
        },
        nearest: {
          sessions: upcomingSessions,
          tasks: dueToday.slice(0, 10),
        },
        notifications: recentNotifications,
      });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // List assigned cases with simple filters
  app.get("/api/lawyer/cases", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const all = await storage.getCasesByLawyer(lawyer.id);

      const status = typeof req.query.status === "string" ? req.query.status : undefined;
      const caseType = typeof req.query.type === "string" ? req.query.type : undefined;
      const priority = typeof req.query.priority === "string" ? req.query.priority : undefined;
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

      const from = typeof req.query.from === "string" ? new Date(req.query.from) : undefined;
      const to = typeof req.query.to === "string" ? new Date(req.query.to) : undefined;

      const filtered = (all as any[]).filter((c) => {
        if (status && String((c as any).status) !== status) return false;
        if (caseType && String((c as any).caseType) !== caseType) return false;
        if (priority && String((c as any).priority) !== priority) return false;
        if (q) {
          const hay = [c.caseNumber, c.title, c.description].filter(Boolean).join(" ").toLowerCase();
          if (!hay.includes(q)) return false;
        }
        const updatedAt = (c as any).updatedAt ? new Date((c as any).updatedAt) : null;
        if (from && updatedAt && updatedAt < from) return false;
        if (to && updatedAt && updatedAt > to) return false;
        return true;
      });

      return res.json(filtered);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/lawyer/cases/:id", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const caseData = await storage.getCase(req.params.id);
      if (!caseData) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, caseData)) return res.status(403).json({ error: "Forbidden" });
      return res.json(caseData);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Operational status update (lawyer only)
  app.patch("/api/lawyer/cases/:id/status", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const existing = await storage.getCase(req.params.id);
      if (!existing) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, existing)) return res.status(403).json({ error: "Forbidden" });

      const parsed = z
        .object({
          status: z.enum(["in_progress", "awaiting_documents", "awaiting_hearing", "completed"]),
          note: z.string().trim().max(1000).optional().nullable(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updates: any = { status: parsed.data.status as any };
      if (parsed.data.status === "completed") updates.completedAt = new Date();

      const updated = await storage.updateCase(existing.id, updates);

      // Log as timeline status_changed
      await storage.createCaseTimelineEvent({
        caseId: existing.id,
        eventType: "status_changed",
        fromStatus: existing.status as any,
        toStatus: parsed.data.status as any,
        note: parsed.data.note ?? null,
        actorUserId: lawyer.id,
      } as any);

      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/lawyer/cases/:id/timeline", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const existing = await storage.getCase(req.params.id);
      if (!existing) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, existing)) return res.status(403).json({ error: "Forbidden" });
      const events = await storage.getCaseTimelineEventsByCase(existing.id);
      return res.json(events);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/lawyer/cases/:id/documents", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const existing = await storage.getCase(req.params.id);
      if (!existing) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, existing)) return res.status(403).json({ error: "Forbidden" });
      const docs = await storage.getDocumentsByCase(existing.id);
      return res.json(docs);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/lawyer/cases/:id/documents", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const existing = await storage.getCase(req.params.id);
      if (!existing) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, existing)) return res.status(403).json({ error: "Forbidden" });

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

      const docs = await storage.createDocumentsForCase({
        uploadedBy: lawyer.id,
        beneficiaryId: existing.beneficiaryId,
        caseId: existing.id,
        isPublic: parsed.data.isPublic,
        documents: parsed.data.documents as any,
      });

      // Add a timeline note indicating a document upload
      await storage.createCaseTimelineEvent({
        caseId: existing.id,
        eventType: "status_changed",
        fromStatus: existing.status as any,
        toStatus: existing.status as any,
        note: `document_uploaded:${docs.length}`,
        actorUserId: lawyer.id,
      } as any);

      return res.status(201).json({ success: true, documents: docs });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Beneficiaries linked to this lawyer (by assigned cases)
  app.get("/api/lawyer/beneficiaries", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const cases = await storage.getCasesByLawyer(lawyer.id);
      const beneficiaryIds = Array.from(new Set((cases as any[]).map((c) => String((c as any).beneficiaryId))));

      const beneficiaries = await Promise.all(
        beneficiaryIds.map(async (id) => {
          const b = await storage.getBeneficiary(id);
          return b || null;
        }),
      );

      return res.json(beneficiaries.filter(Boolean));
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.get("/api/lawyer/beneficiaries/:id", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const b = await storage.getBeneficiary(req.params.id);
      if (!b) return res.status(404).json({ error: "Beneficiary not found" });

      const cases = await storage.getCasesByLawyer(lawyer.id);
      const hasRelation = (cases as any[]).some((c) => String((c as any).beneficiaryId) === String(b.id));
      if (!hasRelation) return res.status(403).json({ error: "Forbidden" });

      return res.json(b);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Consultations for this lawyer
  app.get("/api/lawyer/consultations", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const consultations = await storage.getConsultationsByLawyer(lawyer.id);
      return res.json(consultations);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.patch("/api/lawyer/consultations/:id", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const existing = await storage.getConsultation(req.params.id);
      if (!existing) return res.status(404).json({ error: "Consultation not found" });
      if (String((existing as any).lawyerId) !== String(lawyer.id)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const parsed = z
        .object({
          status: z.string().trim().min(1).optional(),
          scheduledDate: z.union([z.string(), z.null()]).optional(),
          notes: z.union([z.string(), z.null()]).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updates: any = { ...parsed.data };
      if (typeof updates.scheduledDate === "string") {
        updates.scheduledDate = updates.scheduledDate ? new Date(updates.scheduledDate) : null;
      }

      const updated = await storage.updateConsultation(existing.id, updates);
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Lawyer profile (basic: name only)
  app.patch("/api/lawyer/me", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const parsed = z
        .object({
          fullName: z.string().trim().min(1).optional(),
        })
        .strict()
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updated = await storage.updateUser(lawyer.id, parsed.data as any);
      if (!updated) return res.status(404).json({ error: "User not found" });
      const { password: _pw, ...userWithoutPassword } = updated as any;
      return res.json(userWithoutPassword);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Monthly report (basic aggregates)
  app.get("/api/lawyer/reports/monthly", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const month = typeof req.query.month === "string" ? req.query.month : "";
      const m = /^\d{4}-\d{2}$/.test(month) ? month : null;

      const cases = await storage.getCasesByLawyer(lawyer.id);
      const list = cases as any[];

      const filtered = m
        ? list.filter((c) => {
            const d = new Date((c as any).createdAt);
            const mm = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
            return mm === m;
          })
        : list;

      const completed = filtered.filter((c) => String((c as any).status) === "completed");
      const avgCompletionDays = completed.length
        ? completed
            .map((c) => {
              const start = new Date((c as any).createdAt).getTime();
              const end = (c as any).completedAt ? new Date((c as any).completedAt).getTime() : start;
              return Math.max(0, (end - start) / (1000 * 60 * 60 * 24));
            })
            .reduce((a, b) => a + b, 0) / completed.length
        : 0;

      return res.json({
        month: m,
        totals: {
          total: filtered.length,
          completed: completed.length,
          active: filtered.filter((c) => !["completed", "cancelled", "rejected", "closed", "closed_admin"].includes(String((c as any).status))).length,
          overdue: featureFlags.FEATURE_SLA ? 0 : undefined,
        },
        avgCompletionDays,
      });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Change password (any authenticated user)
  app.post("/api/auth/change-password", requireUser, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const parsed = z
        .object({
          currentPassword: z.string().min(1),
          newPassword: z.string().min(8),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const valid = await bcrypt.compare(parsed.data.currentPassword, user.password);
      if (!valid) {
        return res.status(400).json({ error: "Invalid current password" });
      }

      const hashed = await bcrypt.hash(parsed.data.newPassword, 10);
      await storage.updateUser(user.id, { password: hashed } as any);
      await createAudit(user.id, "change_password", "user", user.id, "User changed password", req.ip);
      return res.json({ success: true });
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
      const notifications = await storage.listMyNotifications(req.session.userId!);
      res.json(notifications);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Alias (client-friendly)
  app.get("/api/notifications/my", requireAuth, async (req, res) => {
    try {
      const notifications = await storage.listMyNotifications(req.session.userId!);
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
      const notification = await storage.markNotificationRead(req.session.userId!, req.params.id);
      if (!notification) return res.status(404).json({ error: "Notification not found" });
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

  // Admin-only: list lawyer users (lightweight; avoids fetching all users client-side)
  app.get(
    "/api/users/lawyers",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (_req: AuthRequest, res) => {
      try {
        const lawyers = await storage.getLawyerUsers();
        const withoutPasswords = (lawyers || []).map(({ password, ...u }) => u);
        return res.json(withoutPasswords);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Admin-only: create a lawyer user
  app.post(
    "/api/users",
    requireStaff,
    requireRole(["admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            fullName: z.string().trim().min(1),
            email: z.string().trim().email(),
            username: z.string().trim().min(1),
            password: z.string().min(8),
            isActive: z.boolean().optional().default(true),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const { fullName, email, username, password, isActive } = parsed.data;

        const existingUsername = await storage.getUserByUsername(username);
        if (existingUsername) {
          return res.status(409).json({ error: "Username already exists" });
        }

        const existingEmail = await storage.getUserByEmail(email);
        if (existingEmail) {
          return res.status(409).json({ error: "Email already exists" });
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const created = await storage.createUser({
          username,
          email,
          password: hashedPassword,
          fullName,
          userType: "staff",
          role: "lawyer",
          isActive,
          emailVerified: false,
        } as any);

        await createAudit(req.user!.id, "create", "user", created.id, `Created lawyer: ${created.fullName}`, req.ip);

        const { password: _pw, ...userWithoutPassword } = created as any;
        return res.status(201).json(userWithoutPassword);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Admin-only: update a lawyer user (name/active)
  app.patch(
    "/api/users/:id",
    requireStaff,
    requireRole(["admin"]),
    async (req: AuthRequest, res) => {
      try {
        const parsed = z
          .object({
            fullName: z.string().trim().min(1).optional(),
            isActive: z.boolean().optional(),
          })
          .strict()
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const target = await storage.getUser(req.params.id);
        if (!target) {
          return res.status(404).json({ error: "User not found" });
        }

        if (target.userType !== "staff" || target.role !== "lawyer") {
          return res.status(400).json({ error: "Only lawyer users can be updated here" });
        }

        const updated = await storage.updateUser(target.id, parsed.data as any);
        if (!updated) {
          return res.status(404).json({ error: "User not found" });
        }

        await createAudit(req.user!.id, "update", "user", updated.id, `Updated lawyer: ${updated.fullName}`, req.ip);

        const { password: _pw, ...userWithoutPassword } = updated as any;
        return res.json(userWithoutPassword);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

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

  const TASK_NOTIFICATION_TYPES = {
    ASSIGNED: "TASK_ASSIGNED",
    STATUS_CHANGED: "TASK_STATUS_CHANGED",
    ATTACHMENT_ADDED: "TASK_ATTACHMENT_ADDED",
  } as const;

  function canStaffAccessTask(user: User, task: any): boolean {
    if (user.role === "admin" || user.role === "super_admin") return true;
    if (user.role === "lawyer") {
      return Boolean(
        (task as any).lawyerId && String((task as any).lawyerId) === String(user.id)
          ? true
          : String((task as any).assignedTo) === String(user.id),
      );
    }
    return false;
  }

  async function notifyTaskParticipants(input: {
    task: any;
    actorUserId: string;
    type: string;
    title: string;
    message: string;
  }) {
    const url = "/portal/tasks";
    const recipientIds = new Set<string>();

    // Primary: assignedTo is the beneficiary userId (enforced at creation).
    if (input.task?.assignedTo) recipientIds.add(String(input.task.assignedTo));
    if (input.task?.lawyerId) recipientIds.add(String(input.task.lawyerId));

    // Don't notify the actor.
    recipientIds.delete(String(input.actorUserId));

    await Promise.all(
      Array.from(recipientIds).map((userId) =>
        storage.createNotification({
          userId,
          type: input.type,
          title: input.title,
          message: input.message,
          url,
          relatedEntityId: String(input.task.id),
        } as any),
      ),
    );
  }

  // Staff lists tasks
  // - admin/super_admin: all
  // - lawyer: only tasks linked to them
  app.get("/api/tasks", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      if (user.role === "admin" || user.role === "super_admin") {
        const tasks = await storage.listTasksForAdmin();
        return res.json(tasks);
      }
      if (user.role === "lawyer") {
        const tasks = await storage.listTasksForLawyer(user.id);
        return res.json(tasks);
      }
      return res.status(403).json({ error: "Forbidden" });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Beneficiary lists their own tasks
  app.get("/api/tasks/my", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const beneficiary = req.beneficiary!;
      const user = req.user!;
      const tasks = await storage.listTasksForBeneficiary(beneficiary.id, user.id);
      return res.json(tasks);
    } catch (error: any) {
      return res.status(500).json({ error: getSafeErrorMessage(error, "beneficiary") });
    }
  });

  // Task details for authorized users
  app.get("/api/tasks/:id", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const task = await storage.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) return res.status(403).json({ error: "Forbidden" });
        const ok =
          (task as any).beneficiaryId && String((task as any).beneficiaryId) === String(beneficiary.id)
            ? true
            : String((task as any).assignedTo) === String(user.id);
        if (!ok) return res.status(403).json({ error: "Forbidden" });
        return res.json(task);
      }

      if (!canStaffAccessTask(user, task)) return res.status(403).json({ error: "Forbidden" });
      return res.json(task);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Legacy staff helper routes (kept for compatibility)
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

  // Admin creates a task (assigned to beneficiary)
  app.post(
    "/api/tasks",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;

        const parsed = z
          .object({
            beneficiaryId: z.string().trim().min(1),
            title: z.string().trim().min(1),
            description: z.string().optional().nullable(),
            taskType: z.enum(["follow_up", "document_preparation", "court_appearance", "client_meeting", "research", "other"]),
            priority: z.enum(["low", "medium", "high", "urgent"]).optional().nullable(),
            status: z
              .enum(["pending", "in_progress", "follow_up", "awaiting_beneficiary", "under_review", "completed", "cancelled"])
              .optional()
              .nullable(),
            dueDate: z.union([z.string().datetime(), z.null()]).optional(),
            lawyerId: z.string().trim().min(1).optional().nullable(),
            caseId: z.string().trim().min(1).optional().nullable(),
            notifyBeneficiary: z.boolean().optional().default(true),
            showInPortal: z.boolean().optional().default(true),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const beneficiary = await storage.getBeneficiary(parsed.data.beneficiaryId);
        if (!beneficiary) return res.status(400).json({ error: "Beneficiary not found" });
        if (!(beneficiary as any).userId) {
          return res.status(400).json({ error: "Beneficiary has no linked user account" });
        }

        const assignedToUserId = String((beneficiary as any).userId);

        if (parsed.data.lawyerId) {
          const lawyer = await storage.getUser(parsed.data.lawyerId);
          if (!lawyer || lawyer.userType !== "staff" || lawyer.role !== "lawyer") {
            return res.status(400).json({ error: "Invalid lawyer" });
          }
        }

        if (parsed.data.caseId) {
          const caseData = await storage.getCase(parsed.data.caseId);
          if (!caseData) return res.status(400).json({ error: "Case not found" });
        }

        const status = (parsed.data.status ?? "pending") as any;
        const dueDate = typeof parsed.data.dueDate === "string" ? new Date(parsed.data.dueDate) : null;

        const created = await storage.createTask({
          title: parsed.data.title,
          description: parsed.data.description ?? null,
          taskType: parsed.data.taskType as any,
          beneficiaryId: beneficiary.id,
          showInPortal: parsed.data.showInPortal ?? true,
          lawyerId: parsed.data.lawyerId ?? null,
          caseId: parsed.data.caseId ?? null,
          assignedTo: assignedToUserId,
          assignedBy: user.id,
          status,
          priority: (parsed.data.priority as any) ?? "medium",
          dueDate: dueDate ? (dueDate as any) : null,
          completedAt: status === "completed" ? new Date() : null,
        } as any);

        if (parsed.data.notifyBeneficiary ?? true) {
          await notifyTaskParticipants({
            task: created,
            actorUserId: user.id,
            type: TASK_NOTIFICATION_TYPES.ASSIGNED,
            title: "Task assigned",
            message: `New task: ${created.title}`,
          });
        }

        await createAudit(user.id, "create", "task", created.id, `Created task: ${created.title}`, req.ip);
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Update task
  // - admin/super_admin: update fields
  // - lawyer: status-only
  app.patch("/api/tasks/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const existing = await storage.getTask(req.params.id);
      if (!existing) return res.status(404).json({ error: "Task not found" });

      const isAdmin = user.role === "admin" || user.role === "super_admin";
      const isLawyer = user.role === "lawyer";

      if (!isAdmin && !isLawyer) return res.status(403).json({ error: "Forbidden" });
      if (isLawyer && !canStaffAccessTask(user, existing)) return res.status(403).json({ error: "Forbidden" });

      if (isLawyer && !isAdmin) {
        const parsed = z
          .object({
            status: z.enum(["pending", "in_progress", "follow_up", "awaiting_beneficiary", "under_review", "completed", "cancelled"]),
            note: z.string().trim().max(1000).optional().nullable(),
          })
          .safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updates: any = {
          status: parsed.data.status as any,
        };
        if (parsed.data.status === "completed") updates.completedAt = new Date();

        const updated = await storage.updateTask(existing.id, updates);
        if (!updated) return res.status(404).json({ error: "Task not found" });

        await notifyTaskParticipants({
          task: updated,
          actorUserId: user.id,
          type: TASK_NOTIFICATION_TYPES.STATUS_CHANGED,
          title: "Task status updated",
          message: `Task "${updated.title}" is now ${String((updated as any).status)}`,
        });

        await createAudit(user.id, "update", "task", updated.id, `Updated task status: ${updated.title}`, req.ip);
        return res.json(updated);
      }

      // Admin update
      const parsed = z
        .object({
          beneficiaryId: z.string().trim().min(1).optional(),
          lawyerId: z.union([z.string().trim().min(1), z.null()]).optional(),
          caseId: z.union([z.string().trim().min(1), z.null()]).optional(),
          title: z.string().trim().min(1).optional(),
          description: z.union([z.string(), z.null()]).optional(),
          taskType: z.enum(["follow_up", "document_preparation", "court_appearance", "client_meeting", "research", "other"]).optional(),
          priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
          status: z.enum(["pending", "in_progress", "follow_up", "awaiting_beneficiary", "under_review", "completed", "cancelled"]).optional(),
          dueDate: z.union([z.string().datetime(), z.null()]).optional(),
        })
        .safeParse(req.body);
      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updates: any = { ...parsed.data };

      if (updates.dueDate !== undefined) {
        updates.dueDate = typeof updates.dueDate === "string" ? new Date(updates.dueDate) : null;
      }

      if (updates.status === "completed") updates.completedAt = new Date();

      // If beneficiary changes, also update assignedTo (must be a linked beneficiary user).
      if (updates.beneficiaryId) {
        const beneficiary = await storage.getBeneficiary(updates.beneficiaryId);
        if (!beneficiary) return res.status(400).json({ error: "Beneficiary not found" });
        if (!(beneficiary as any).userId) {
          return res.status(400).json({ error: "Beneficiary has no linked user account" });
        }
        updates.assignedTo = String((beneficiary as any).userId);
      }

      if (updates.lawyerId) {
        const lawyer = await storage.getUser(updates.lawyerId);
        if (!lawyer || lawyer.userType !== "staff" || lawyer.role !== "lawyer") {
          return res.status(400).json({ error: "Invalid lawyer" });
        }
      }
      if (updates.caseId) {
        const caseData = await storage.getCase(updates.caseId);
        if (!caseData) return res.status(400).json({ error: "Case not found" });
      }

      const updated = await storage.updateTask(existing.id, updates);
      if (!updated) return res.status(404).json({ error: "Task not found" });

      if (parsed.data.status && parsed.data.status !== (existing as any).status) {
        await notifyTaskParticipants({
          task: updated,
          actorUserId: user.id,
          type: TASK_NOTIFICATION_TYPES.STATUS_CHANGED,
          title: "Task status updated",
          message: `Task "${updated.title}" is now ${String((updated as any).status)}`,
        });
      }

      await createAudit(user.id, "update", "task", updated.id, `Updated task: ${updated.title}`, req.ip);
      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Delete task (admin only)
  app.delete(
    "/api/tasks/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const success = await storage.deleteTask(req.params.id);
        if (!success) {
          return res.status(404).json({ error: "Task not found" });
        }
        await createAudit(user.id, "delete", "task", req.params.id, "Deleted task", req.ip);
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Task attachments
  app.get("/api/tasks/:id/attachments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const task = await storage.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) return res.status(403).json({ error: "Forbidden" });
        const ok =
          (task as any).beneficiaryId && String((task as any).beneficiaryId) === String(beneficiary.id)
            ? true
            : String((task as any).assignedTo) === String(user.id);
        if (!ok) return res.status(403).json({ error: "Forbidden" });

        const docs = await storage.getDocumentsByTask(task.id);
        const publicDocs = (docs as any[]).filter((d) => Boolean((d as any).isPublic));
        return res.json(publicDocs);
      }

      if (!canStaffAccessTask(user, task)) return res.status(403).json({ error: "Forbidden" });
      const docs = await storage.getDocumentsByTask(task.id);
      return res.json(docs);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  app.post("/api/tasks/:id/attachments", requireAuth, async (req: AuthRequest, res) => {
    try {
      const user = await getCurrentUser(req);
      if (!user) return res.status(401).json({ error: "Unauthorized" });

      const task = await storage.getTask(req.params.id);
      if (!task) return res.status(404).json({ error: "Task not found" });

      const parsed = z
        .object({
          isPublic: z.boolean().optional(),
          documents: z.array(uploadedFileMetadataSchema).min(1),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      let beneficiaryIdForDoc: string | null = (task as any).beneficiaryId ? String((task as any).beneficiaryId) : null;
      if (!beneficiaryIdForDoc) {
        // Best-effort fallback: resolve beneficiary via assignedTo (beneficiary userId)
        const b = await storage.getBeneficiaryByUserId(String((task as any).assignedTo));
        if (b) beneficiaryIdForDoc = String((b as any).id);
      }

      if (!beneficiaryIdForDoc) {
        return res.status(400).json({ error: "Task has no beneficiary linked" });
      }

      if (user.userType === "beneficiary") {
        const beneficiary = await storage.getBeneficiaryByUserId(user.id);
        if (!beneficiary) return res.status(403).json({ error: "Forbidden" });
        const ok =
          (task as any).beneficiaryId && String((task as any).beneficiaryId) === String(beneficiary.id)
            ? true
            : String((task as any).assignedTo) === String(user.id);
        if (!ok) return res.status(403).json({ error: "Forbidden" });

        const docs = await storage.attachDocumentsToTask({
          uploadedBy: user.id,
          beneficiaryId: beneficiaryIdForDoc,
          taskId: task.id,
          isPublic: true,
          documents: parsed.data.documents,
        });

        await notifyTaskParticipants({
          task,
          actorUserId: user.id,
          type: TASK_NOTIFICATION_TYPES.ATTACHMENT_ADDED,
          title: "Task attachment added",
          message: `Attachment added to task: ${String((task as any).title || "")}`,
        });

        return res.status(201).json({ success: true, documents: docs });
      }

      if (!canStaffAccessTask(user, task)) return res.status(403).json({ error: "Forbidden" });

      const isPublic = parsed.data.isPublic ?? true;
      const docs = await storage.attachDocumentsToTask({
        uploadedBy: user.id,
        beneficiaryId: beneficiaryIdForDoc,
        taskId: task.id,
        isPublic,
        documents: parsed.data.documents,
      });

      await notifyTaskParticipants({
        task,
        actorUserId: user.id,
        type: TASK_NOTIFICATION_TYPES.ATTACHMENT_ADDED,
        title: "Task attachment added",
        message: `Attachment added to task: ${String((task as any).title || "")}`,
      });

      return res.status(201).json({ success: true, documents: docs });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
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
      const caseId = typeof req.query.caseId === "string" && req.query.caseId.trim() ? req.query.caseId.trim() : null;
      const sessions = caseId ? await storage.getSessionsByCase(caseId) : await storage.getAllSessions();
      res.json(sessions);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sessions/:id", requireStaff, async (req, res) => {
    try {
      const session = await storage.getSession(req.params.id);
      if (!session) {
        return res.status(404).json({ error: "Session not found" });
      }

      const attachments = await storage.getDocumentsBySession(session.id);
      
      // Fetch Zoom meeting if exists (additive only)
      const zoomMeeting = await storage.getZoomMeetingBySession(session.id);
      
      return res.json({ 
        ...session, 
        attachments,
        zoomMeeting: zoomMeeting || null,
      });
    } catch (error: any) {
      return res.status(500).json({ error: error.message });
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
      const user = req.user as User;

      const sessionTypeSchema = z.enum(["in_person", "remote", "hybrid"]);
      const statusSchema = z.enum(["upcoming", "postponed", "completed", "cancelled"]);

      const parsed = z
        .object({
          caseId: z.string().trim().min(1),
          dateGregorian: z.string().datetime(),
          time: z.string().trim().min(1),
          hijriDate: z.string().trim().optional().nullable(),
          sessionType: sessionTypeSchema.optional().nullable(),
          status: statusSchema.optional().nullable(),
          meetingUrl: z.string().trim().url().optional().nullable(),
          requirements: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
          isConfidential: z.boolean().optional().default(false),
          reminderMinutes: z.number().int().nonnegative().optional().nullable(),
          addToTimeline: z.boolean().optional().default(true),
          courtName: z.string().trim().min(1),
          city: z.string().trim().min(1),
          circuit: z.string().trim().optional().nullable(),
          attachments: z.array(uploadedFileMetadataSchema).optional().default([]),
        })
        .superRefine((data, ctx) => {
          if (data.sessionType === "remote" && !data.meetingUrl) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["meetingUrl"],
              message: "Meeting URL is required when session type is remote",
            });
          }
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const input = parsed.data;
      const caseData = await storage.getCase(input.caseId);
      if (!caseData) {
        return res.status(400).json({ error: "Case not found" });
      }

      const title = `${input.courtName} — ${new Date(input.dateGregorian).toLocaleDateString()} ${input.time}`;

      const created = await storage.createSession({
        caseId: input.caseId,
        title,
        sessionNumber: null,
        gregorianDate: new Date(input.dateGregorian),
        time: input.time,
        hijriDate: input.hijriDate ?? null,
        courtName: input.courtName,
        city: input.city,
        circuit: input.circuit ?? null,
        sessionType: input.sessionType ?? null,
        status: (input.status ?? "upcoming") as any,
        meetingUrl: input.meetingUrl ?? null,
        requirements: input.requirements ?? null,
        notes: input.notes ?? null,
        isConfidential: input.isConfidential ?? false,
        reminderMinutes: input.reminderMinutes ?? null,
        addToTimeline: input.addToTimeline ?? true,
        // Legacy/extra
        location: null,
        outcome: null,
        nextSessionDate: null,
      } as any);

      if (input.attachments?.length) {
        await storage.attachDocumentsToSession({
          uploadedBy: user.id,
          beneficiaryId: caseData.beneficiaryId,
          caseId: caseData.id,
          sessionId: created.id,
          documents: input.attachments,
        });
      }

      if (input.addToTimeline ?? true) {
        await storage.createCaseTimelineEvent({
          caseId: caseData.id,
          eventType: "session_added" as any,
          fromStatus: null,
          toStatus: null,
          note: JSON.stringify({
            sessionId: created.id,
            dateGregorian: input.dateGregorian,
            time: input.time,
            courtName: input.courtName,
            city: input.city,
            circuit: input.circuit ?? null,
            sessionType: input.sessionType ?? null,
            status: input.status ?? "upcoming",
            meetingUrl: input.meetingUrl ?? null,
          }),
          actorUserId: user.id,
        } as any);
      }

      await createAudit(user.id, "create", "session", created.id, `Created session: ${created.title}`, req.ip);

      // ===== Zoom Integration (Additive Only) =====
      // Auto-create Zoom meeting if enabled and session type is remote/hybrid
      if ((input.sessionType === "remote" || input.sessionType === "hybrid") && !input.meetingUrl) {
        try {
          const { createZoomMeeting, isZoomEnabled } = await import("./lib/zoomIntegration");
          
          if (isZoomEnabled()) {
            const zoomMeeting = await createZoomMeeting({
              topic: created.title,
              start_time: new Date(input.dateGregorian).toISOString(),
              duration: 60, // Default 60 minutes
              timezone: "Asia/Riyadh",
            });

            // Store Zoom meeting details
            await storage.createZoomMeeting({
              sessionId: created.id,
              meetingId: String(zoomMeeting.id),
              joinUrl: zoomMeeting.join_url,
              provider: "zoom",
            } as any);

            // Notify lawyer
            if (caseData.assignedLawyerId) {
              await storage.createNotification({
                userId: caseData.assignedLawyerId,
                type: "ZOOM_MEETING_CREATED",
                title: "Zoom meeting created",
                message: `Zoom meeting created for session: ${created.title}`,
                url: `/lawyer/sessions`,
                relatedEntityId: created.id,
              } as any);
            }

            // Notify beneficiary
            const beneficiary = await storage.getBeneficiary(caseData.beneficiaryId);
            if ((beneficiary as any)?.userId) {
              await storage.createNotification({
                userId: String((beneficiary as any).userId),
                type: "ZOOM_MEETING_CREATED",
                title: "Zoom meeting created",
                message: `Zoom meeting created for your session: ${created.title}`,
                url: `/portal/sessions`,
                relatedEntityId: created.id,
              } as any);
            }
          }
        } catch (zoomError: any) {
          // Log error but don't fail session creation
          console.error("[Zoom Integration] Failed to create meeting:", zoomError.message);
        }
      }

      return res.status(201).json(created);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.patch("/api/sessions/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;

      const sessionTypeSchema = z.enum(["in_person", "remote", "hybrid"]);
      const statusSchema = z.enum(["upcoming", "postponed", "completed", "cancelled"]);

      const parsed = z
        .object({
          dateGregorian: z.string().datetime().optional(),
          time: z.string().trim().min(1).optional(),
          hijriDate: z.string().trim().optional().nullable(),
          sessionType: sessionTypeSchema.optional().nullable(),
          status: statusSchema.optional().nullable(),
          meetingUrl: z.string().trim().url().optional().nullable(),
          requirements: z.string().optional().nullable(),
          notes: z.string().optional().nullable(),
          isConfidential: z.boolean().optional(),
          reminderMinutes: z.number().int().nonnegative().optional().nullable(),
          addToTimeline: z.boolean().optional(),
          courtName: z.string().trim().min(1).optional(),
          city: z.string().trim().min(1).optional(),
          circuit: z.string().trim().optional().nullable(),
        })
        .superRefine((data, ctx) => {
          if (data.sessionType === "remote" && data.meetingUrl === null) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: ["meetingUrl"],
              message: "Meeting URL is required when session type is remote",
            });
          }
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updates: any = { ...parsed.data };
      if (typeof updates.dateGregorian === "string") {
        updates.gregorianDate = new Date(updates.dateGregorian);
        delete updates.dateGregorian;
      }

      const session = await storage.updateSession(req.params.id, updates);
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

  // ========== POWERS OF ATTORNEY ROUTES (STAFF) ==========

  function canStaffAccessPowerOfAttorney(user: User, poa: any, caseData?: any): boolean {
    if (user.role === "admin" || user.role === "super_admin") return true;
    if (user.role !== "lawyer") return false;
    if (poa?.lawyerId && String(poa.lawyerId) === String(user.id)) return true;
    if (poa?.caseId && caseData) return canLawyerAccessCase(user, caseData);
    return false;
  }

  // List POAs (admin only)
  app.get(
    "/api/power-of-attorney",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const caseId = typeof req.query.caseId === "string" && req.query.caseId.trim() ? req.query.caseId.trim() : undefined;
        const beneficiaryId =
          typeof req.query.beneficiaryId === "string" && req.query.beneficiaryId.trim() ? req.query.beneficiaryId.trim() : undefined;
        const expiringDays = typeof req.query.expiringDays === "string" ? Number(req.query.expiringDays) : undefined;

        if (Number.isFinite(expiringDays) && expiringDays && expiringDays > 0) {
          const rows = await storage.getExpiringPowersOfAttorney({ days: Math.trunc(expiringDays) });
          const filtered = rows.filter((r: any) => {
            if (caseId && String(r.caseId || "") !== caseId) return false;
            if (beneficiaryId && String(r.beneficiaryId || "") !== beneficiaryId) return false;
            return true;
          });
          return res.json(filtered);
        }

        if (caseId) {
          const rows = await storage.getPowersOfAttorneyByCase(caseId);
          return res.json(rows);
        }
        if (beneficiaryId) {
          const rows = await storage.getPowersOfAttorneyByBeneficiary(beneficiaryId);
          return res.json(rows);
        }

        const rows = await storage.getAllPowersOfAttorney();
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Expiring soon (admin only)
  app.get(
    "/api/power-of-attorney/expiring",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const daysRaw = typeof req.query.days === "string" ? Number(req.query.days) : 30;
        const days = Number.isFinite(daysRaw) ? Math.max(1, Math.trunc(daysRaw)) : 30;
        const rows = await storage.getExpiringPowersOfAttorney({ days });
        return res.json(rows);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Get by id (admin any; lawyer only if related)
  app.get("/api/power-of-attorney/:id", requireStaff, async (req: AuthRequest, res) => {
    try {
      const user = req.user as User;
      const poa = await storage.getPowerOfAttorney(req.params.id);
      if (!poa) return res.status(404).json({ error: "Power of attorney not found" });

      const caseData = poa.caseId ? await storage.getCase(String(poa.caseId)) : undefined;
      if (!canStaffAccessPowerOfAttorney(user, poa, caseData)) {
        return res.status(403).json({ error: "Forbidden" });
      }

      const attachments = await storage.getDocumentsByPowerOfAttorney(poa.id);
      return res.json({ ...poa, attachments });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create POA (admin/lawyer)
  app.post(
    "/api/power-of-attorney",
    requireStaff,
    requireRole(["admin", "lawyer", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;

        const parsed = z
          .object({
            poaNumber: z.string().trim().min(1).optional().nullable(),
            beneficiaryId: z.string().trim().min(1),
            caseId: z.string().trim().optional().nullable(),
            lawyerId: z.string().trim().optional().nullable(),
            issueDate: z.string().datetime(),
            expiryDate: z.union([z.string().datetime(), z.null()]).optional(),
            scope: z.string().trim().min(1),
            restrictions: z.union([z.string(), z.null()]).optional(),
            notes: z.union([z.string(), z.null()]).optional(),
            isActive: z.boolean().optional(),
            attachments: z.array(uploadedFileMetadataSchema).optional().default([]),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const input = parsed.data;

        const beneficiary = await storage.getBeneficiary(input.beneficiaryId);
        if (!beneficiary) return res.status(400).json({ error: "Beneficiary not found" });

        const caseId = input.caseId ? String(input.caseId) : null;
        const caseData = caseId ? await storage.getCase(caseId) : undefined;
        if (caseId && !caseData) return res.status(400).json({ error: "Case not found" });

        if (user.role === "lawyer" && caseData && !canLawyerAccessCase(user, caseData)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const poaNumber = (input.poaNumber && input.poaNumber.trim()) || `POA-${Date.now()}`;

        const created = await storage.createPowerOfAttorney({
          poaNumber,
          beneficiaryId: beneficiary.id,
          caseId: caseId,
          lawyerId: input.lawyerId ? String(input.lawyerId) : null,
          issueDate: new Date(input.issueDate),
          expiryDate: input.expiryDate ? new Date(input.expiryDate) : null,
          scope: input.scope,
          restrictions: input.restrictions ? String(input.restrictions) : null,
          notes: input.notes ? String(input.notes) : null,
          isActive: input.isActive ?? true,
          documentUrl: null,
        } as any);

        if (input.attachments?.length) {
          await storage.attachDocumentsToPowerOfAttorney({
            uploadedBy: user.id,
            beneficiaryId: created.beneficiaryId,
            caseId: created.caseId,
            powerOfAttorneyId: created.id,
            documents: input.attachments,
          });
        }

        await createAudit(user.id, "create", "power_of_attorney", created.id, `Created POA: ${created.poaNumber}`, req.ip);
        return res.status(201).json(created);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Update POA (admin/lawyer with access)
  app.patch(
    "/api/power-of-attorney/:id",
    requireStaff,
    requireRole(["admin", "lawyer", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const existing = await storage.getPowerOfAttorney(req.params.id);
        if (!existing) return res.status(404).json({ error: "Power of attorney not found" });

        const caseData = existing.caseId ? await storage.getCase(String(existing.caseId)) : undefined;
        if (!canStaffAccessPowerOfAttorney(user, existing, caseData)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const parsed = z
          .object({
            caseId: z.union([z.string().trim(), z.null()]).optional(),
            lawyerId: z.union([z.string().trim(), z.null()]).optional(),
            issueDate: z.union([z.string().datetime(), z.null()]).optional(),
            expiryDate: z.union([z.string().datetime(), z.null()]).optional(),
            scope: z.string().trim().min(1).optional(),
            restrictions: z.union([z.string(), z.null()]).optional(),
            notes: z.union([z.string(), z.null()]).optional(),
            isActive: z.boolean().optional(),
          })
          .safeParse(req.body);

        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const updates: any = { ...parsed.data };
        if (typeof updates.issueDate === "string") updates.issueDate = new Date(updates.issueDate);
        if (typeof updates.expiryDate === "string") updates.expiryDate = new Date(updates.expiryDate);

        if (updates.caseId !== undefined) {
          const nextCaseId = updates.caseId === null ? null : String(updates.caseId);
          if (nextCaseId) {
            const nextCase = await storage.getCase(nextCaseId);
            if (!nextCase) return res.status(400).json({ error: "Case not found" });
            if (user.role === "lawyer" && !canLawyerAccessCase(user, nextCase)) {
              return res.status(403).json({ error: "Forbidden" });
            }
          }
          updates.caseId = nextCaseId;
        }

        const updated = await storage.updatePowerOfAttorney(existing.id, updates);
        if (!updated) return res.status(404).json({ error: "Power of attorney not found" });

        await createAudit(user.id, "update", "power_of_attorney", updated.id, `Updated POA: ${updated.poaNumber}`, req.ip);
        return res.json(updated);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Delete POA (admin only)
  app.delete(
    "/api/power-of-attorney/:id",
    requireStaff,
    requireRole(["admin", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const existing = await storage.getPowerOfAttorney(req.params.id);
        if (!existing) return res.status(404).json({ error: "Power of attorney not found" });

        const ok = await storage.deletePowerOfAttorney(existing.id);
        if (!ok) return res.status(404).json({ error: "Power of attorney not found" });

        await createAudit(user.id, "delete", "power_of_attorney", existing.id, `Deleted POA: ${existing.poaNumber}`, req.ip);
        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Attachments
  app.get(
    "/api/power-of-attorney/:id/attachments",
    requireStaff,
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const poa = await storage.getPowerOfAttorney(req.params.id);
        if (!poa) return res.status(404).json({ error: "Power of attorney not found" });

        const caseData = poa.caseId ? await storage.getCase(String(poa.caseId)) : undefined;
        if (!canStaffAccessPowerOfAttorney(user, poa, caseData)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const docs = await storage.getDocumentsByPowerOfAttorney(poa.id);
        return res.json(docs);
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  app.post(
    "/api/power-of-attorney/:id/attachments",
    requireStaff,
    requireRole(["admin", "lawyer", "super_admin"]),
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const poa = await storage.getPowerOfAttorney(req.params.id);
        if (!poa) return res.status(404).json({ error: "Power of attorney not found" });

        const caseData = poa.caseId ? await storage.getCase(String(poa.caseId)) : undefined;
        if (!canStaffAccessPowerOfAttorney(user, poa, caseData)) {
          return res.status(403).json({ error: "Forbidden" });
        }

        const parsed = z
          .object({ documents: z.array(uploadedFileMetadataSchema).min(1) })
          .safeParse(req.body);
        if (!parsed.success) {
          return res.status(400).json({ error: fromZodError(parsed.error).message });
        }

        const docs = await storage.attachDocumentsToPowerOfAttorney({
          uploadedBy: user.id,
          beneficiaryId: String(poa.beneficiaryId),
          caseId: poa.caseId ? String(poa.caseId) : null,
          powerOfAttorneyId: poa.id,
          documents: parsed.data.documents,
        });

        await createAudit(user.id, "attach_document", "power_of_attorney", poa.id, `Attached ${docs.length} document(s)`, req.ip);
        return res.status(201).json({ success: true, documents: docs });
      } catch (error: any) {
        return res.status(500).json({ error: getErrorMessage(error) });
      }
    },
  );

  // Printable view (HTML; browser can print to PDF)
  app.get(
    "/api/power-of-attorney/:id/print",
    requireStaff,
    async (req: AuthRequest, res) => {
      try {
        const user = req.user as User;
        const poa = await storage.getPowerOfAttorney(req.params.id);
        if (!poa) return res.status(404).send("Not found");

        const caseData = poa.caseId ? await storage.getCase(String(poa.caseId)) : undefined;
        if (!canStaffAccessPowerOfAttorney(user, poa, caseData)) {
          return res.status(403).send("Forbidden");
        }

        const beneficiary = await storage.getBeneficiary(String(poa.beneficiaryId));
        const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Power of Attorney ${String((poa as any).poaNumber || "")}</title>
    <style>
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; }
      h1 { font-size: 18px; margin: 0 0 12px; }
      .row { margin: 8px 0; }
      .label { color: #555; display: inline-block; min-width: 180px; }
      .value { font-weight: 500; }
      hr { margin: 16px 0; border: 0; border-top: 1px solid #ddd; }
    </style>
  </head>
  <body>
    <h1>Power of Attorney</h1>
    <div class="row"><span class="label">POA Number</span><span class="value">${String((poa as any).poaNumber || "-")}</span></div>
    <div class="row"><span class="label">Beneficiary</span><span class="value">${String((beneficiary as any)?.fullName || "-")}</span></div>
    <div class="row"><span class="label">Issue Date</span><span class="value">${(poa as any).issueDate ? new Date((poa as any).issueDate).toLocaleDateString() : "-"}</span></div>
    <div class="row"><span class="label">Expiry Date</span><span class="value">${(poa as any).expiryDate ? new Date((poa as any).expiryDate).toLocaleDateString() : "-"}</span></div>
    <div class="row"><span class="label">Status</span><span class="value">${(poa as any).isActive ? "Active" : "Inactive"}</span></div>
    <hr />
    <div class="row"><span class="label">Scope</span><span class="value">${String((poa as any).scope || "-")}</span></div>
    <div class="row"><span class="label">Restrictions</span><span class="value">${String((poa as any).restrictions || "-")}</span></div>
    <div class="row"><span class="label">Notes</span><span class="value">${String((poa as any).notes || "-")}</span></div>
  </body>
</html>`;

        res.setHeader("Content-Type", "text/html; charset=utf-8");
        return res.send(html);
      } catch (error: any) {
        return res.status(500).send("Error");
      }
    },
  );

  // ========== LAWYER CASE NOTES ROUTES (PHASE 6) ==========

  // List notes for a case (lawyer only, their own notes)
  app.get("/api/lawyer/cases/:caseId/notes", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const caseData = await storage.getCase(req.params.caseId);
      if (!caseData) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, caseData)) return res.status(403).json({ error: "Forbidden" });

      const notes = await storage.listLawyerCaseNotes(caseData.id, lawyer.id);
      return res.json(notes);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create note for a case (lawyer only)
  app.post("/api/lawyer/cases/:caseId/notes", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const caseData = await storage.getCase(req.params.caseId);
      if (!caseData) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, caseData)) return res.status(403).json({ error: "Forbidden" });

      const parsed = z
        .object({
          noteText: z.string().trim().min(1).max(5000),
          isPinned: z.boolean().optional().default(false),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const created = await storage.createLawyerCaseNote({
        caseId: caseData.id,
        lawyerId: lawyer.id,
        noteText: parsed.data.noteText,
        isPinned: parsed.data.isPinned,
      } as any);

      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Update note (lawyer only, their own notes)
  app.patch("/api/lawyer/notes/:noteId", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;

      const parsed = z
        .object({
          noteText: z.string().trim().min(1).max(5000).optional(),
          isPinned: z.boolean().optional(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const updated = await storage.updateLawyerCaseNote(req.params.noteId, lawyer.id, parsed.data as any);
      if (!updated) return res.status(404).json({ error: "Note not found" });

      return res.json(updated);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Delete note (lawyer only, their own notes)
  app.delete("/api/lawyer/notes/:noteId", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const ok = await storage.deleteLawyerCaseNote(req.params.noteId, lawyer.id);
      if (!ok) return res.status(404).json({ error: "Note not found" });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========== LAWYER SESSION REMINDERS ROUTES (PHASE 6) ==========

  // List reminders for lawyer
  app.get("/api/lawyer/reminders", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const reminders = await storage.listLawyerSessionReminders(lawyer.id);
      return res.json(reminders);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Create reminder for a session (lawyer only)
  app.post("/api/lawyer/sessions/:sessionId/reminders", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const session = await storage.getSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "Session not found" });

      // Verify lawyer has access to this session's case
      const caseData = await storage.getCase(String(session.caseId));
      if (!caseData) return res.status(404).json({ error: "Case not found" });
      if (!canLawyerAccessCase(lawyer, caseData)) return res.status(403).json({ error: "Forbidden" });

      const parsed = z
        .object({
          reminderTime: z.string().datetime(),
          note: z.string().trim().max(500).optional().nullable(),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      const created = await storage.createLawyerSessionReminder({
        sessionId: session.id,
        lawyerId: lawyer.id,
        reminderTime: new Date(parsed.data.reminderTime),
        note: parsed.data.note ?? null,
        isSent: false,
      } as any);

      return res.status(201).json(created);
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // Delete reminder (lawyer only, their own reminders)
  app.delete("/api/lawyer/reminders/:reminderId", requireLawyer, async (req: AuthRequest, res) => {
    try {
      const lawyer = req.user!;
      const ok = await storage.deleteLawyerSessionReminder(req.params.reminderId, lawyer.id);
      if (!ok) return res.status(404).json({ error: "Reminder not found" });
      return res.json({ success: true });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ========== SUPPORT TICKETS ROUTES (BENEFICIARY) ==========

  // Create support ticket (beneficiary portal)
  app.post("/api/support/tickets", requireBeneficiary, async (req: AuthRequest, res) => {
    try {
      const user = req.user!;
      const beneficiary = req.beneficiary!;

      const parsed = z
        .object({
          category: z.enum(["general", "case_inquiry", "document_request", "technical", "complaint", "other"]),
          subject: z.string().trim().min(1).max(200),
          message: z.string().trim().min(1).max(2000),
        })
        .safeParse(req.body);

      if (!parsed.success) {
        return res.status(400).json({ error: fromZodError(parsed.error).message });
      }

      // Create notification for admins about support request
      const admins = await storage.getAllUsers();
      const adminIds = admins
        .filter((u) => u.userType === "staff" && (u.role === "admin" || u.role === "super_admin"))
        .map((u) => u.id);

      const ticketId = `TICKET-${Date.now()}`;
      const notificationTitle = `Support Request: ${parsed.data.subject}`;
      const notificationMessage = `Category: ${parsed.data.category}\nFrom: ${beneficiary.fullName} (${beneficiary.email || beneficiary.phone})\n\n${parsed.data.message}`;

      // Create notifications for all admins
      await Promise.all(
        adminIds.map((adminId) =>
          storage.createNotification({
            userId: adminId,
            type: "support_request",
            title: notificationTitle,
            message: notificationMessage,
            url: "/support",
            relatedEntityId: ticketId,
          } as any),
        ),
      );

      // Create audit log
      await createAudit(
        user.id,
        "create",
        "support_ticket",
        ticketId,
        `Support ticket: ${parsed.data.category} - ${parsed.data.subject}`,
        req.ip,
      );

      return res.status(201).json({
        success: true,
        ticketId,
        message: "Support request submitted successfully",
      });
    } catch (error: any) {
      return res.status(500).json({ error: getErrorMessage(error) });
    }
  });

  // ====== API fallback ======
  // If an API route is missing/mistyped, return JSON (not the SPA shell).
  // This prevents clients from trying to JSON-parse HTML.
  app.use("/api", (req, res) => {
    if (res.headersSent) return;
    res.status(404).json({ error: "Not found" });
  });

  return httpServer;
}
