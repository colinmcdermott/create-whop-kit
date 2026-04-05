import { resolve, basename } from "node:path";
import { existsSync } from "node:fs";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { FRAMEWORKS, APP_TYPES, getTemplate } from "../templates.js";
import { DB_PROVIDERS } from "../providers/index.js";
import { checkNodeVersion, checkGit, validateDatabaseUrl, validateWhopAppId } from "../utils/checks.js";
import { detectPackageManager, exec } from "../utils/exec.js";
import { cleanupDir } from "../utils/cleanup.js";
import { cloneTemplate, updatePackageName, initGit } from "../scaffolding/clone.js";
import { writeEnvFile } from "../scaffolding/env-file.js";
import { createManifest } from "../scaffolding/manifest.js";

function isCancelled(value: unknown): value is symbol {
  return p.isCancel(value);
}

export default defineCommand({
  meta: {
    name: "create-whop-kit",
    version: "0.2.0",
    description: "Scaffold a new Whop-powered app with whop-kit",
  },
  args: {
    name: {
      type: "positional",
      description: "Project name",
      required: false,
    },
    framework: {
      type: "string",
      description: "Framework: nextjs, astro",
    },
    type: {
      type: "string",
      description: "App type: saas",
      default: "saas",
    },
    db: {
      type: "string",
      description: "Database: neon, supabase, local, later",
    },
    "db-url": {
      type: "string",
      description: "Database connection URL",
    },
    "app-id": {
      type: "string",
      description: "Whop App ID",
    },
    "api-key": {
      type: "string",
      description: "Whop API Key",
    },
    "webhook-secret": {
      type: "string",
      description: "Whop webhook secret",
    },
    yes: {
      type: "boolean",
      alias: "y",
      description: "Skip optional prompts, use defaults",
      default: false,
    },
    "dry-run": {
      type: "boolean",
      description: "Show what would be created without doing it",
      default: false,
    },
    verbose: {
      type: "boolean",
      description: "Show detailed output",
      default: false,
    },
  },
  async run({ args }) {
    // Pre-flight checks
    checkNodeVersion(18);
    checkGit();

    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" create-whop-kit "))} Create a Whop-powered app`);

    const isNonInteractive = !!(args.framework && args.db);

    // ── Project name ──────────────────────────────────────────────────
    let projectName = args.name;
    if (!projectName) {
      const result = await p.text({
        message: "Project name",
        placeholder: "my-whop-app",
        validate: (v) => {
          if (!v) return "Project name is required";
          if (existsSync(resolve(v))) return `Directory "${v}" already exists`;
        },
      });
      if (isCancelled(result)) { p.cancel("Cancelled."); process.exit(0); }
      projectName = result;
    } else if (existsSync(resolve(projectName))) {
      p.log.error(`Directory "${projectName}" already exists`);
      process.exit(1);
    }

    // ── App type ──────────────────────────────────────────────────────
    let appType = args.type;
    if (!isNonInteractive && !args.yes) {
      const result = await p.select({
        message: "What are you building?",
        options: Object.entries(APP_TYPES).map(([value, t]) => ({
          value,
          label: t.available ? t.name : `${t.name} ${pc.dim("(coming soon)")}`,
          hint: t.description,
          disabled: !t.available,
        })),
      });
      if (isCancelled(result)) { p.cancel("Cancelled."); process.exit(0); }
      appType = result;
    }

    // ── Framework ─────────────────────────────────────────────────────
    let framework = args.framework;
    if (!framework) {
      const result = await p.select({
        message: "Which framework?",
        options: Object.entries(FRAMEWORKS).map(([value, f]) => ({
          value,
          label: f.available ? f.name : `${f.name} ${pc.dim("(coming soon)")}`,
          hint: f.description,
          disabled: !f.available,
        })),
      });
      if (isCancelled(result)) { p.cancel("Cancelled."); process.exit(0); }
      framework = result;
    }

    const template = getTemplate(appType, framework);
    if (!template || !template.available) {
      p.log.error(`No template available for ${appType} + ${framework}. Try a different combination.`);
      process.exit(1);
    }

    // ── Database ──────────────────────────────────────────────────────
    let database = args.db;
    if (!database) {
      const result = await p.select({
        message: "Which database?",
        options: [
          { value: "neon", label: "Neon", hint: "Serverless Postgres — auto-provisioned (recommended)" },
          { value: "prisma-postgres", label: "Prisma Postgres", hint: "Instant database — no account needed" },
          { value: "supabase", label: "Supabase", hint: "Open-source Firebase alternative" },
          { value: "manual", label: "I have a connection string", hint: "Paste an existing PostgreSQL URL" },
          { value: "later", label: "Configure later", hint: "Skip database setup for now" },
        ],
      });
      if (isCancelled(result)) { p.cancel("Cancelled."); process.exit(0); }
      database = result;
    }

    // ── Database provisioning ─────────────────────────────────────────
    let dbUrl = args["db-url"] ?? "";
    let dbNote = "";

    if (database !== "later" && database !== "manual" && !dbUrl) {
      // Auto-provision via provider
      const provider = DB_PROVIDERS[database];
      if (provider) {
        // Install CLI if needed
        if (!provider.isInstalled()) {
          const install = await p.confirm({
            message: `${provider.name} CLI not found. Install it now?`,
            initialValue: true,
          });
          if (isCancelled(install) || !install) {
            p.log.warning("Skipping database provisioning. You can configure it later.");
            database = "later";
          } else {
            const installed = await provider.install();
            if (!installed) {
              p.log.warning("Skipping database provisioning.");
              database = "later";
            }
          }
        }

        // Provision database
        if (database !== "later") {
          const result = await provider.provision(projectName);
          if (result) {
            dbUrl = result.connectionString;
            if (result.note) dbNote = result.note;
            p.log.success(`${pc.bold(provider.name)} database ready`);
          } else {
            p.log.warning("Database provisioning skipped. Configure manually later.");
          }
        }
      }
    } else if (database === "manual" && !dbUrl) {
      // Manual URL entry
      const result = await p.text({
        message: "Database URL",
        placeholder: "postgresql://user:pass@host:5432/dbname",
        validate: (v) => {
          if (!v) return "Required (choose 'Configure later' to skip)";
          return validateDatabaseUrl(v);
        },
      });
      if (isCancelled(result)) { p.cancel("Cancelled."); process.exit(0); }
      dbUrl = result;
    }

    // ── Whop credentials ──────────────────────────────────────────────
    let appId = args["app-id"] ?? "";
    let apiKey = args["api-key"] ?? "";
    let webhookSecret = args["webhook-secret"] ?? "";

    if (!isNonInteractive && !args.yes) {
      const setupWhop = await p.confirm({
        message: "Configure Whop credentials now? (you can do this later via the setup wizard)",
        initialValue: false,
      });

      if (!isCancelled(setupWhop) && setupWhop) {
        if (!appId) {
          const result = await p.text({
            message: "Whop App ID",
            placeholder: "app_xxxxxxxxx",
            validate: (v) => v ? validateWhopAppId(v) : undefined,
          });
          if (!isCancelled(result)) appId = result ?? "";
        }

        if (!apiKey) {
          const result = await p.text({
            message: "Whop API Key",
            placeholder: "apik_xxxxxxxxx (optional, press Enter to skip)",
          });
          if (!isCancelled(result)) apiKey = result ?? "";
        }

        if (!webhookSecret) {
          const result = await p.text({
            message: "Whop Webhook Secret",
            placeholder: "optional, press Enter to skip",
          });
          if (!isCancelled(result)) webhookSecret = result ?? "";
        }
      }
    }

    // ── Dry run ───────────────────────────────────────────────────────
    if (args["dry-run"]) {
      p.log.info(pc.dim("Dry run — showing what would be created:\n"));
      console.log(`  ${pc.bold("Project:")}     ${projectName}`);
      console.log(`  ${pc.bold("Framework:")}   ${template.name}`);
      console.log(`  ${pc.bold("App type:")}    ${APP_TYPES[appType]?.name ?? appType}`);
      console.log(`  ${pc.bold("Database:")}    ${database}`);
      console.log(`  ${pc.bold("Template:")}    github.com/${template.repo}`);
      if (dbUrl) console.log(`  ${pc.bold("DB URL:")}      ${dbUrl.substring(0, 30)}...`);
      if (appId) console.log(`  ${pc.bold("Whop App:")}    ${appId}`);
      console.log("");
      p.outro("No files were created.");
      return;
    }

    // ── Scaffold ──────────────────────────────────────────────────────
    const projectDir = resolve(projectName);

    const s = p.spinner();
    s.start(`Cloning ${template.name} template...`);

    const cloned = cloneTemplate(template.repo, projectDir);
    if (!cloned) {
      s.stop("Failed to clone template");
      p.log.error(`Could not clone github.com/${template.repo}. Check your internet connection.`);
      cleanupDir(projectDir);
      process.exit(1);
    }

    updatePackageName(projectDir, projectName);
    s.stop(`${template.name} template cloned`);

    // ── Environment variables ─────────────────────────────────────────
    const envVars: Record<string, string | undefined> = {};
    if (dbUrl) envVars["DATABASE_URL"] = dbUrl;

    // Framework-specific env var names
    if (framework === "nextjs") {
      if (appId) envVars["NEXT_PUBLIC_WHOP_APP_ID"] = appId;
    } else {
      if (appId) envVars["WHOP_APP_ID"] = appId;
    }
    if (apiKey) envVars["WHOP_API_KEY"] = apiKey;
    if (webhookSecret) envVars["WHOP_WEBHOOK_SECRET"] = webhookSecret;

    if (Object.keys(envVars).length > 0) {
      s.start("Configuring environment...");
      writeEnvFile(projectDir, envVars);
      s.stop("Environment configured");
    }

    // ── Manifest ──────────────────────────────────────────────────────
    createManifest(projectDir, {
      framework,
      appType,
      database,
      features: [],
      templateVersion: "0.2.0",
    });

    // ── Install dependencies ──────────────────────────────────────────
    const pm = detectPackageManager();
    s.start(`Installing dependencies with ${pm}...`);
    const installResult = exec(`${pm} install`, projectDir);
    if (!installResult.success) {
      s.stop(`${pm} install failed`);
      p.log.warning("Dependency installation failed. Run it manually after setup.");
    } else {
      s.stop("Dependencies installed");
    }

    // ── Git init ──────────────────────────────────────────────────────
    initGit(projectDir);

    // ── Summary ───────────────────────────────────────────────────────
    const configured: string[] = [];
    const missing: string[] = [];

    if (dbUrl) configured.push("Database");
    else missing.push("Database URL");

    if (appId) configured.push("Whop App ID");
    else missing.push("Whop App ID");

    if (apiKey) configured.push("Whop API Key");
    else missing.push("Whop API Key");

    if (webhookSecret) configured.push("Webhook Secret");
    else missing.push("Webhook Secret");

    let summary = "";
    if (configured.length > 0) {
      summary += `${pc.green("✓")} ${configured.join(", ")}\n`;
    }
    if (missing.length > 0) {
      summary += `${pc.yellow("○")} Missing: ${missing.join(", ")}\n`;
      summary += `  ${pc.dim("Configure via the setup wizard or .env.local")}\n`;
    }
    if (dbNote) {
      summary += `${pc.yellow("!")} ${dbNote}\n`;
    }
    summary += `\n`;
    summary += `  ${pc.bold("cd")} ${basename(projectName)}\n`;
    if (dbUrl) {
      summary += `  ${pc.bold(`${pm} run db:push`)}\n`;
    }
    summary += `  ${pc.bold(`${pm} run dev`)}`;

    p.note(summary, "Your app is ready");

    p.outro(`${pc.green("Happy building!")} ${pc.dim("— whop-kit")}`);
  },
});
