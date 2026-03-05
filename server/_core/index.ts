import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  // OAuth callback under /api/oauth/callback
  registerOAuthRoutes(app);

  // ─── Rate Limiting on auth endpoints ────────────────────────────────
  const { createRateLimiter } = await import("./rateLimit");

  const loginLimiter = createRateLimiter({
    name: "login",
    maxRequests: 10,
    windowMs: 60_000, // 10 req/min
    message: "Previše pokušaja prijave. Pokušajte ponovo za minutu.",
  });

  const registerLimiter = createRateLimiter({
    name: "register",
    maxRequests: 5,
    windowMs: 60_000, // 5 req/min
    message: "Previše pokušaja registracije. Pokušajte ponovo za minutu.",
  });

  const forgotPasswordLimiter = createRateLimiter({
    name: "forgotPassword",
    maxRequests: 3,
    windowMs: 60_000, // 3 req/min
    message: "Previše zahtjeva za reset lozinke. Pokušajte ponovo za minutu.",
  });

  // Apply rate limiters to specific tRPC procedure paths
  app.use("/api/trpc/auth.login", loginLimiter);
  app.use("/api/trpc/auth.register", registerLimiter);
  app.use("/api/trpc/auth.forgotPassword", forgotPasswordLimiter);

  // Rate limit Google OAuth (reuse login limiter)
  app.use("/auth/google", loginLimiter);

  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    // Phase 2: Start background services
    import("../services/notifications").then(m => m.startNotificationCron()).catch(console.error);
  });
}

startServer().catch(console.error);
