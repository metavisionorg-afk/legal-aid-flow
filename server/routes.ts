import type { Express } from "express";
import { type Server } from "http";
import { storage } from "./storage";
import { insertUserSchema, insertBeneficiarySchema, insertIntakeRequestSchema, insertCaseSchema, insertHearingSchema } from "@shared/schema";
import { fromZodError } from "zod-validation-error";
import bcrypt from "bcrypt";

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

  // ========== AUTH ROUTES ==========
  
  app.post("/api/auth/register", async (req, res) => {
    try {
      const result = insertUserSchema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: fromZodError(result.error).message });
      }

      const { username, email, password, fullName, role } = result.data;
      
      // Check if user exists
      const existingUser = await storage.getUserByUsername(username);
      if (existingUser) {
        return res.status(400).json({ error: "Username already exists" });
      }

      const existingEmail = await storage.getUserByEmail(email);
      if (existingEmail) {
        return res.status(400).json({ error: "Email already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await storage.createUser({
        username,
        email,
        password: hashedPassword,
        fullName,
        role: role || "viewer",
      });

      // Don't send password back
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

      // Set session
      req.session.userId = user.id;

      // Create audit log
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

  // ========== BENEFICIARIES ROUTES ==========

  app.get("/api/beneficiaries", requireAuth, async (req, res) => {
    try {
      const beneficiaries = await storage.getAllBeneficiaries();
      res.json(beneficiaries);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/beneficiaries/:id", requireAuth, async (req, res) => {
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

  app.post("/api/beneficiaries", requireAuth, async (req, res) => {
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

  app.patch("/api/beneficiaries/:id", requireAuth, async (req, res) => {
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

  app.delete("/api/beneficiaries/:id", requireAuth, async (req, res) => {
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

  // ========== INTAKE REQUESTS ROUTES ==========

  app.get("/api/intake-requests", requireAuth, async (req, res) => {
    try {
      const requests = await storage.getAllIntakeRequests();
      res.json(requests);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/intake-requests/:id", requireAuth, async (req, res) => {
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

  app.post("/api/intake-requests", requireAuth, async (req, res) => {
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

  app.patch("/api/intake-requests/:id", requireAuth, async (req, res) => {
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

  app.get("/api/cases", requireAuth, async (req, res) => {
    try {
      const cases = await storage.getAllCases();
      res.json(cases);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/cases/:id", requireAuth, async (req, res) => {
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

  app.post("/api/cases", requireAuth, async (req, res) => {
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

  app.patch("/api/cases/:id", requireAuth, async (req, res) => {
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

  app.delete("/api/cases/:id", requireAuth, async (req, res) => {
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

  // ========== HEARINGS ROUTES ==========

  app.get("/api/hearings", requireAuth, async (req, res) => {
    try {
      const hearings = await storage.getAllHearings();
      res.json(hearings);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/hearings/:id", requireAuth, async (req, res) => {
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

  app.post("/api/hearings", requireAuth, async (req, res) => {
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

  app.patch("/api/hearings/:id", requireAuth, async (req, res) => {
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

  app.delete("/api/hearings/:id", requireAuth, async (req, res) => {
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

  // ========== DASHBOARD & REPORTS ROUTES ==========

  app.get("/api/dashboard/stats", requireAuth, async (req, res) => {
    try {
      const stats = await storage.getDashboardStats();
      res.json(stats);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/audit-logs", requireAuth, async (req, res) => {
    try {
      const limit = req.query.limit ? parseInt(req.query.limit as string) : 50;
      const logs = await storage.getAuditLogs(limit);
      res.json(logs);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/users", requireAuth, async (req, res) => {
    try {
      const users = await storage.getAllUsers();
      const usersWithoutPasswords = users.map(({ password, ...user }) => user);
      res.json(usersWithoutPasswords);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  return httpServer;
}
