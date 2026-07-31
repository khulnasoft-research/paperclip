import type { Express, RequestHandler } from "express";

let cachedApp: Express | null = null;
let initPromise: Promise<Express> | null = null;

async function initApp(): Promise<Express> {
  if (cachedApp) return cachedApp;
  if (!initPromise) {
    initPromise = (async () => {
      const { createDb, inspectMigrations, applyPendingMigrations, reconcilePendingMigrationHistory } =
        await import("@paperclipai/db");
      const { createApp } = await import("../server/src/app.js");
      const { loadConfig } = await import("../server/src/config.js");
      const { createStorageServiceFromConfig } = await import("../server/src/storage/index.js");

      const config = loadConfig();
      const databaseUrl: string | undefined = config.databaseUrl;
      if (!databaseUrl) {
        throw new Error(
          "DATABASE_URL env var required. Set to an external Postgres (Neon, Supabase, etc.)."
        );
      }

      const migrationUrl = config.databaseMigrationUrl ?? databaseUrl;
      let state = await inspectMigrations(migrationUrl);
      if (state.status === "needsMigrations" && state.reason === "pending-migrations") {
        const repair = await reconcilePendingMigrationHistory(migrationUrl);
        if (repair.repairedMigrations.length > 0) {
          state = await inspectMigrations(migrationUrl);
        }
      }
      if (state.status === "needsMigrations") {
        await applyPendingMigrations(migrationUrl);
      }

      const db = createDb(databaseUrl);
      const pluginMigrationDb = config.databaseMigrationUrl
        ? createDb(config.databaseMigrationUrl)
        : db;

      let betterAuthHandler: RequestHandler | undefined;
      let resolveSession: ((req: Express.Request) => Promise<any>) | undefined;
      let authReady = false;

      if (config.deploymentMode === "authenticated") {
        const {
          createBetterAuthHandler,
          createBetterAuthInstance,
          deriveAuthTrustedOrigins,
          resolveBetterAuthSession,
        } = await import("../server/src/auth/better-auth.js");
        const listenPort = Number(process.env.PORT) || 3000;
        const derivedOrigins = deriveAuthTrustedOrigins(config, { listenPort });
        const envOrigins = (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
          .split(",").map((s) => s.trim()).filter(Boolean);
        const effectiveOrigins = [...new Set([...derivedOrigins, ...envOrigins])];
        const auth = createBetterAuthInstance(db as any, config, effectiveOrigins);
        betterAuthHandler = createBetterAuthHandler(auth);
        resolveSession = (req) => resolveBetterAuthSession(auth, req);
        authReady = true;
      }

      if (config.deploymentMode === "local_trusted") {
        authReady = true;
      }

      const storageService = createStorageServiceFromConfig(config);
      const serverPort = Number(process.env.PORT) || 3000;

      const app = await createApp(db as any, {
        uiMode: "none",
        serverPort,
        storageService,
        deploymentMode: config.deploymentMode,
        deploymentExposure: config.deploymentExposure,
        allowedHostnames: config.allowedHostnames,
        bindHost: config.host,
        authReady,
        companyDeletionEnabled: config.companyDeletionEnabled,
        pluginMigrationDb: pluginMigrationDb as any,
        betterAuthHandler,
        resolveSession,
        instanceId: process.env.PAPERCLIP_INSTANCE_ID || "vercel",
        hostVersion: process.env.PAPERCLIP_HOST_VERSION || "0.0.0",
        managedPluginAutoInstall: null,
      });

      cachedApp = app;
      return app;
    })();
  }
  return initPromise;
}

export default async function handler(req: any, res: any) {
  try {
    const app = await initApp();
    app(req, res);
  } catch (err: any) {
    if (!res.headersSent) {
      res.status(500).json({
        error: "Paperclip API initialization failed",
        message: err.message,
        hint: "Set DATABASE_URL to an external Postgres, use PAPERCLIP_DEPLOYMENT_MODE=authenticated, and configure PAPERCLIP_STORAGE_PROVIDER=s3 with AWS credentials for production.",
      });
    }
  }
}
