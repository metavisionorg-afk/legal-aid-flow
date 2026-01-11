import "dotenv/config";
import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { createClient } from "redis";
import { RedisStore } from "connect-redis";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";
import { storage } from "./storage";

const app = express();
const httpServer = createServer(app);

// Railway runs behind a reverse proxy.
// Must be set before session middleware (and before reading req.ip/req.secure).
app.set("trust proxy", 1);

const isProd = process.env.NODE_ENV === "production";
const sessionDebug = process.env.SESSION_DEBUG === "1";
const corsOrigins = (process.env.CORS_ORIGINS || process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

const isCrossOrigin = corsOrigins.length > 0;
const sessionSecret =
  process.env.SESSION_SECRET ||
  (isProd ? undefined : "adala-legal-aid-secret-change-in-production");

if (!sessionSecret) {
  throw new Error("SESSION_SECRET is required when NODE_ENV=production");
}

// Session types
declare module "express-session" {
  interface SessionData {
    userId: string;
  }
}

declare module "http" {
  interface IncomingMessage {
    rawBody: unknown;
  }
}

app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  }),
);

app.use(express.urlencoded({ extended: false }));

// Optional CORS support (for deployments where the SPA and API are on different origins).
// When enabled, cookies require SameSite=None + Secure on the session cookie.
if (corsOrigins.length) {
  app.use((req, res, next) => {
    const origin = typeof req.headers.origin === "string" ? req.headers.origin : "";
    if (origin && corsOrigins.includes(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Credentials", "true");
      res.header(
        "Access-Control-Allow-Headers",
        req.headers["access-control-request-headers"]?.toString() || "Content-Type, Authorization",
      );
      res.header(
        "Access-Control-Allow-Methods",
        req.headers["access-control-request-method"]?.toString() || "GET,POST,PATCH,PUT,DELETE,OPTIONS",
      );
    }

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
    next();
  });
}

// Serve uploaded files (used by public registration uploads)
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

// Session middleware is initialized inside main() after Redis connects,
// and before any routes are registered.

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  const redisUrl = process.env.REDIS_URL || process.env.REDIS_PUBLIC_URL || "";
  let redisStore: RedisStore | undefined;

  if (!redisUrl) {
    if (isProd) {
      throw new Error("REDIS_URL (or REDIS_PUBLIC_URL) is required in production");
    }
    console.warn("[redis] REDIS_URL not set; using MemoryStore (development only)");
  } else {
    const redisClient = createClient({ url: redisUrl });
    redisClient.on("error", (err) => console.error("[redis] client error:", err));
    await redisClient.connect();
    redisStore = new RedisStore({ client: redisClient, prefix: "aidflow:sess:" });
  }

  app.use(
    session({
      store: redisStore,
      secret: sessionSecret,
      resave: false,
      saveUninitialized: false,
      // Trust upstream TLS termination when behind a reverse proxy.
      proxy: true,
      name: "connect.sid",
      cookie: {
        httpOnly: true,
        // Cross-origin XHR/fetch requires SameSite=None + Secure.
        sameSite: (isCrossOrigin ? "none" : "lax") as any,
        secure: Boolean(isProd || isCrossOrigin),
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
      },
    }),
  );

  app.get("/api/auth/me", async (req, res) => {
  // user من الجلسة (الموديل عندكم يعتمد userId في session)
  let user: any = null;

  try {
    if ((req as any).session?.userId) {
      // إذا عندك storage موجود هنا:
      const u = await storage.getUser((req as any).session.userId);
      if (u) {
        const { password: _pw, ...safe } = u as any;
        user = safe;
      }
    }
  } catch {
    user = null;
  }

  const payload: any = { ok: true, user };

  // Debug extras (اختياري) إذا SESSION_DEBUG=1
  if (sessionDebug) {
    payload.debug = {
      session: Boolean((req as any).session),
      sessionID: (req as any).sessionID ?? null,
      hasCookieHeader: Boolean(req.headers.cookie),
      cookieHeaderSample: req.headers.cookie ? req.headers.cookie.slice(0, 120) : null,
      protocol: req.protocol,
      secure: (req as any).secure,
      xForwardedProto: req.headers["x-forwarded-proto"] ?? null,
      origin: req.headers.origin ?? null,
      corsOrigins,
    };
  }

  return res.status(200).json(payload);
});

  await registerRoutes(httpServer, app);

  // Serve uploaded files (used by public registration)
  app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  // importantly only setup vite in development and after
  // setting up all the other routes so the catch-all route
  // doesn't interfere with the other routes
  if (process.env.NODE_ENV === "production") {
    serveStatic(app);
  } else {
    const { setupVite } = await import("./vite");
    await setupVite(httpServer, app);
  }

  // ALWAYS serve the app on the port specified in the environment variable PORT
  // Other ports are firewalled. Default to 5000 if not specified.
  // this serves both the API and the client.
  // It is the only port that is not firewalled.
  const port = parseInt(process.env.PORT || "5000", 10);

  const primaryListenOptions = {
    port,
    host: process.env.HOST || "0.0.0.0",
    reusePort: true,
  };

  const listenOnce = (options: { port: number; host: string; reusePort?: boolean }) =>
    new Promise<void>((resolve, reject) => {
      const onError = (error: any) => {
        httpServer.off("listening", onListening);
        reject(error);
      };

      const onListening = () => {
        httpServer.off("error", onError);
        resolve();
      };

      httpServer.once("error", onError);
      httpServer.once("listening", onListening);
      httpServer.listen(options);
    });

  try {
    await listenOnce(primaryListenOptions);
  } catch (error: any) {
    if (error?.code === "ENOTSUP") {
      log("listen() reusePort not supported; retrying without reusePort");
      try {
        await listenOnce({ port, host: primaryListenOptions.host });
      } catch (retryError: any) {
        if (retryError?.code === "ENOTSUP" && primaryListenOptions.host === "0.0.0.0") {
          log("listen() on 0.0.0.0 not supported; retrying on 127.0.0.1");
          await listenOnce({ port, host: "127.0.0.1" });
        } else {
          throw retryError;
        }
      }
    } else {
      throw error;
    }
  }

  log(`serving on port ${port}`);
})();
