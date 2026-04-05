import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec } from "../utils/exec.js";
import {
  installOrUpdateVercel,
  isVercelAuthenticated,
  getVercelUser,
  vercelLogin,
  vercelLink,
  vercelDeploy,
  vercelEnvSet,
  vercelEnvSetBatch,
} from "./vercel.js";
import {
  isGhInstalled,
  isGhAuthenticated,
  installGh,
  ghLogin,
  createGitHubRepo,
  getGitHubOrgs,
} from "./github.js";
import {
  validateApiKey,
  getCompanyId,
  createWhopApp,
  createWhopWebhook,
} from "./whop-api.js";
import type { DeployResult } from "./types.js";

const WEBHOOK_EVENTS = [
  "membership.activated",
  "membership.deactivated",
  "membership.cancel_at_period_end_changed",
  "payment.succeeded",
  "payment.failed",
  "refund.created",
];

interface DeployPipelineOptions {
  projectDir: string;
  projectName: string;
  databaseUrl?: string;
  framework: string;
  whopCompanyKey?: string;
}

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") exec(`open "${url}"`);
  else if (platform === "win32") exec(`start "" "${url}"`);
  else exec(`xdg-open "${url}"`);
}

/**
 * Run the full deploy pipeline.
 */
export async function runDeployPipeline(
  options: DeployPipelineOptions,
): Promise<DeployResult | null> {
  const { projectDir, projectName, databaseUrl, framework } = options;

  // ══════════════════════════════════════════════════════════════════
  // STEP 0: Ask how they want to set up
  // ══════════════════════════════════════════════════════════════════

  const setupMode = await p.select({
    message: "How would you like to deploy?",
    options: [
      {
        value: "github-vercel",
        label: "GitHub + Vercel (recommended)",
        hint: "Private repo, auto-deploy on every push",
      },
      {
        value: "github-only",
        label: "GitHub only",
        hint: "Push code to GitHub, deploy later",
      },
      {
        value: "vercel-only",
        label: "Vercel only",
        hint: "Deploy without GitHub (no auto-deploy on push)",
      },
    ],
  });
  if (p.isCancel(setupMode)) return null;

  const useGithub = setupMode === "github-vercel" || setupMode === "github-only";
  const useVercel = setupMode === "github-vercel" || setupMode === "vercel-only";

  let githubRepoUrl: string | null = null;
  let productionUrl: string | null = null;

  // ══════════════════════════════════════════════════════════════════
  // PHASE 1: GitHub
  // ══════════════════════════════════════════════════════════════════

  if (useGithub) {
    p.log.info(pc.bold("\n── GitHub ──────────────────────────────────────"));

    // Install gh if needed
    if (!isGhInstalled()) {
      p.log.info("The GitHub CLI (gh) is needed to create your repo.");
      const installed = await installGh();
      if (!installed) {
        p.log.warning("Skipping GitHub — install gh manually: https://cli.github.com");
      }
    }

    if (isGhInstalled()) {
      // Auth
      if (!isGhAuthenticated()) {
        const loginOk = await ghLogin();
        if (!loginOk) {
          p.log.warning("GitHub auth failed. Skipping repo creation.");
        }
      }

      if (isGhAuthenticated()) {
        // Ask which GitHub account/org to use
        const orgs = getGitHubOrgs();
        let repoFullName = projectName;

        if (orgs.length > 0) {
          const orgChoice = await p.select({
            message: "Which GitHub account?",
            options: [
              { value: "", label: "Personal account", hint: "your personal GitHub" },
              ...orgs.map((org) => ({
                value: org,
                label: org,
                hint: "organization",
              })),
            ],
          });
          if (!p.isCancel(orgChoice) && orgChoice) {
            repoFullName = `${orgChoice}/${projectName}`;
          }
        }

        githubRepoUrl = await createGitHubRepo(projectDir, repoFullName);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2: Vercel
  // ══════════════════════════════════════════════════════════════════

  if (useVercel) {
    p.log.info(pc.bold("\n── Vercel ──────────────────────────────────────"));

    // Install / update
    const vercelOk = await installOrUpdateVercel();
    if (!vercelOk) {
      p.log.error("Could not set up Vercel CLI.");
      return githubRepoUrl ? { productionUrl: "", githubUrl: githubRepoUrl } : null;
    }

    // Auth
    if (!isVercelAuthenticated()) {
      const loginOk = await vercelLogin();
      if (!loginOk) {
        p.log.error("Vercel auth failed. Run " + pc.bold("whop-kit deploy") + " later.");
        return githubRepoUrl ? { productionUrl: "", githubUrl: githubRepoUrl } : null;
      }
    }
    const vercelUser = getVercelUser();
    p.log.success(`Signed in${vercelUser ? ` as ${pc.bold(vercelUser)}` : ""}`);

    // Link
    await vercelLink(projectDir);

    // Connect GitHub repo (enables auto-deploy on push)
    if (githubRepoUrl) {
      const s = p.spinner();
      s.start("Connecting GitHub to Vercel (auto-deploy on push)...");
      const connectResult = exec(`vercel git connect ${githubRepoUrl}`, projectDir, 30_000);
      if (connectResult.success) {
        s.stop("Connected — every git push will auto-deploy");
      } else {
        s.stop("Auto-connect failed (connect manually in Vercel dashboard → Git)");
      }
    }

    // Set DATABASE_URL — one spinner per environment so user sees progress
    if (databaseUrl) {
      let s = p.spinner();
      s.start("Setting DATABASE_URL → production...");
      vercelEnvSet("DATABASE_URL", databaseUrl, "production", projectDir);
      s.stop("DATABASE_URL → production ✓");

      s = p.spinner();
      s.start("Setting DATABASE_URL → preview...");
      vercelEnvSet("DATABASE_URL", databaseUrl, "preview", projectDir);
      s.stop("DATABASE_URL → preview ✓");

      s = p.spinner();
      s.start("Setting DATABASE_URL → development...");
      vercelEnvSet("DATABASE_URL", databaseUrl, "development", projectDir);
      s.stop("DATABASE_URL → development ✓");
    }

    // Deploy
    productionUrl = await vercelDeploy(projectDir);
    if (!productionUrl) {
      p.log.error("Deploy failed. Try: " + pc.bold(`cd ${projectName} && vercel deploy --prod`));
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 3: Whop (only if we have a production URL)
  // ══════════════════════════════════════════════════════════════════

  if (productionUrl) {
    p.log.info(pc.bold("\n── Whop ────────────────────────────────────────"));

    const connectWhop = await p.confirm({
      message: "Connect to Whop? (creates OAuth app + webhooks automatically)",
      initialValue: true,
    });

    if (!p.isCancel(connectWhop) && connectWhop) {
      // ── Step A: Get Company API key ──────────────────────────────
      p.note(
        [
          `${pc.bold("1.")} Go to ${pc.cyan("https://whop.com/dashboard/developer")}`,
          `${pc.bold("2.")} Under "Company API Keys", click ${pc.bold('"Create"')}`,
          `${pc.bold("3.")} Name it (e.g. "${projectName}")`,
          `${pc.bold("4.")} Set "Inherit permissions from role" to ${pc.bold('"Owner"')}`,
          `${pc.bold("5.")} Click Create, copy the key, and paste it below`,
        ].join("\n"),
        "Whop Company API Key",
      );

      openUrl("https://whop.com/dashboard/developer");

      let apiKey = options.whopCompanyKey ?? "";
      let keyValid = false;

      for (let attempt = 0; attempt < 3; attempt++) {
        if (!apiKey) {
          const result = await p.text({
            message: attempt === 0
              ? "Paste your Company API key"
              : "Paste a new Company API key",
            placeholder: "apik_...",
            validate: (v) => (!v ? "Required" : undefined),
          });
          if (p.isCancel(result)) {
            return { productionUrl, githubUrl: githubRepoUrl ?? undefined };
          }
          apiKey = result;
        }

        let s = p.spinner();
        s.start("Validating...");
        keyValid = await validateApiKey(apiKey);
        if (keyValid) { s.stop("API key valid"); break; }
        s.stop("API key invalid");

        if (attempt < 2) {
          const retry = await p.confirm({ message: "Try a different key?", initialValue: true });
          if (p.isCancel(retry) || !retry) return { productionUrl, githubUrl: githubRepoUrl ?? undefined };
          apiKey = "";
        }
      }

      if (!keyValid) return { productionUrl, githubUrl: githubRepoUrl ?? undefined };

      // ── Step B: Get Company ID ───────────────────────────────────
      const companyId = await getCompanyId(apiKey);
      if (!companyId) return { productionUrl, githubUrl: githubRepoUrl ?? undefined };

      // ── Step C: Create OAuth app ─────────────────────────────────
      const redirectUris = [
        "http://localhost:3000/api/auth/callback",
        `${productionUrl}/api/auth/callback`,
      ];

      let s = p.spinner();
      s.start("Creating Whop OAuth app...");
      const app = await createWhopApp(apiKey, projectName, redirectUris, companyId);
      if (!app) {
        s.stop("Failed to create app");
        p.log.error("Create manually in the Whop dashboard.");
        return { productionUrl, githubUrl: githubRepoUrl ?? undefined };
      }
      s.stop(`OAuth app created: ${pc.bold(app.id)}`);

      // ── Step D: Get App API key from user ────────────────────────
      // The create API doesn't return the app's API key — user must copy it from dashboard
      p.note(
        [
          `Your app was created! Now copy its credentials:`,
          "",
          `${pc.bold("1.")} Go to ${pc.cyan("https://whop.com/dashboard/developer")}`,
          `${pc.bold("2.")} Click on your new app "${projectName}"`,
          `${pc.bold("3.")} Copy the environment variables shown on the app page`,
          `${pc.bold("4.")} Paste the whole block below (both lines)`,
        ].join("\n"),
        "App Credentials",
      );

      openUrl("https://whop.com/dashboard/developer");

      let appApiKey = "";
      let appId = app.id;
      const envResult = await p.text({
        message: "Paste the environment variables from your app page",
        placeholder: "WHOP_API_KEY=apik_... NEXT_PUBLIC_WHOP_APP_ID=app_...",
        validate: (v) => {
          if (!v) return "Required — copy from your app's details page";
          if (!v.includes("WHOP_API_KEY=") && !v.includes("apik_")) {
            return "Should contain WHOP_API_KEY=apik_... (copy both lines from the app page)";
          }
        },
      });

      if (!p.isCancel(envResult) && envResult) {
        // Parse WHOP_API_KEY and NEXT_PUBLIC_WHOP_APP_ID from pasted text
        const apiKeyMatch = envResult.match(/WHOP_API_KEY=(apik_[^\s]+)/);
        if (apiKeyMatch) appApiKey = apiKeyMatch[1];

        const appIdMatch = envResult.match(/NEXT_PUBLIC_WHOP_APP_ID=(app_[^\s]+)/);
        if (appIdMatch) appId = appIdMatch[1];

        if (appApiKey) {
          p.log.success(`Parsed: WHOP_API_KEY and APP_ID ${pc.dim(appId)}`);
        } else {
          // Maybe they just pasted the raw key
          const rawKey = envResult.trim();
          if (rawKey.startsWith("apik_")) {
            appApiKey = rawKey;
            p.log.success("API key received");
          }
        }
      }

      // ── Step E: Create webhook ───────────────────────────────────
      s = p.spinner();
      s.start("Creating webhook...");
      const webhook = await createWhopWebhook(apiKey, `${productionUrl}/api/webhooks/whop`, WEBHOOK_EVENTS, companyId);
      if (!webhook) {
        s.stop("Failed (create manually in Whop dashboard)");
      } else {
        s.stop("Webhook created");
      }

      // ── Step F: Push env vars to Vercel ──────────────────────────
      if (useVercel) {
        const envVars: Record<string, string> = {};
        if (framework === "nextjs") {
          envVars["NEXT_PUBLIC_WHOP_APP_ID"] = app.id;
        } else {
          envVars["WHOP_APP_ID"] = app.id;
        }
        if (appApiKey) envVars["WHOP_API_KEY"] = appApiKey;
        if (webhook?.secret) envVars["WHOP_WEBHOOK_SECRET"] = webhook.secret;

        for (const [key, value] of Object.entries(envVars)) {
          if (!value) continue;
          const vs = p.spinner();
          vs.start(`Pushing ${key}...`);
          vercelEnvSet(key, value, "production", projectDir);
          vercelEnvSet(key, value, "preview", projectDir);
          vercelEnvSet(key, value, "development", projectDir);
          vs.stop(`${key} ✓`);
        }

        // Redeploy
        s = p.spinner();
        s.start("Redeploying with full configuration...");
        const redeploy = exec("vercel deploy --prod --yes", projectDir, 300_000);
        s.stop(redeploy.success ? "Redeployed" : "Redeploy pending — will apply on next git push");
      }

      return {
        productionUrl,
        githubUrl: githubRepoUrl ?? undefined,
        whopAppId: app.id,
        whopApiKey: appApiKey || undefined,
        webhookSecret: webhook?.secret,
      };
    }
  }

  return {
    productionUrl: productionUrl ?? "",
    githubUrl: githubRepoUrl ?? undefined,
  };
}
