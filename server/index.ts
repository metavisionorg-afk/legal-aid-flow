import express, { type Request, Response, NextFunction } from "express";
import session from "express-session";
import { registerRoutes } from "./routes";
import { serveStatic } from "./static";
import { createServer } from "http";
import path from "path";

const app = express();
const httpServer = createServer(app);

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

// Serve uploaded files (used by public registration uploads)
app.use("/uploads", express.static(path.resolve(process.cwd(), "uploads")));

// Session middleware
app.use(
  session({
    secret: process.env.SESSION_SECRET || "adala-legal-aid-secret-change-in-production",
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7, // 1 week
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
    },
  })
);

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
