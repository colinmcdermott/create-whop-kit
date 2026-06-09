import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive } from "../utils/exec.js";
import {
  ensureVercelInstalled,
  ensureVercelAuth,
  vercelLink,
  vercelDeploy,
  vercelEnvSetAll,
  vercelCmd,
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
  setOAuthPublicMode,
  createWhopWebhook,
} from "./whop-api.js";
import { setupPlans, planResultToEnvVars } from "./plans.js";
import { StepTracker } from "./tracker.js";
import type { DeployResult } from "./types.js";
import { whopHosts, whopEnvVarName, type WhopEnvironment } from "../whop-env.js";

const WEBHOOK_EVENTS = [
  "payment.succeeded",
  "payment.failed",
  "payment.pending",
  "payment.created",
  "membership.cancel_at_period_end_changed",
  "refund.created",
  "dispute.created",
];

interface DeployPipelineOptions {
  projectDir: string;
  projectName: string;
  databaseUrl?: string;
  framework: string;
  whopCompanyKey?: string;
  /** Whop environment — sandbox uses sandbox.whop.com / sandbox-api.whop.com */
  environment?: WhopEnvironment;
}

/**
 * Run the full deploy pipeline.
 */
export async function runDeployPipeline(
  options: DeployPipelineOptions,
): Promise<DeployResult | null> {
  const { projectDir, projectName, databaseUrl, framework } = options;
  const environment: WhopEnvironment = options.environment ?? "production";
  const whopWeb = whopHosts(environment).web;
  const tracker = new StepTracker();

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
        if (githubRepoUrl) {
          tracker.success("GitHub repo", githubRepoUrl);
        } else {
          tracker.failed("GitHub repo", "Run: gh repo create --private --source=. --push");
        }
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2: Vercel
  // ══════════════════════════════════════════════════════════════════

  if (useVercel) {
    p.log.info(pc.bold("\n── Vercel ──────────────────────────────────────"));

    // Install
    const vercelOk = await ensureVercelInstalled();
    if (!vercelOk) {
      tracker.failed("Vercel CLI", "Install: npm install -g vercel@latest");
      return githubRepoUrl ? { productionUrl: "", githubUrl: githubRepoUrl, tracker } : null;
    }

    // Auth — saved login if present, else interactive with retry
    const auth = await ensureVercelAuth();
    if (!auth.ok) {
      if (auth.skipped) {
        tracker.skipped("Vercel deploy");
        p.log.info(`Skipped Vercel. Re-run later with ${pc.bold("whop-kit deploy")}.`);
      } else {
        tracker.failed("Vercel auth", `Retry: cd ${projectName} && whop-kit deploy`);
      }
      return githubRepoUrl ? { productionUrl: "", githubUrl: githubRepoUrl, tracker } : null;
    }

    // Link
    await vercelLink(projectDir);

    // Connect GitHub repo (enables auto-deploy on push)
    if (githubRepoUrl) {
      const s = p.spinner();
      s.start("Connecting GitHub to Vercel (auto-deploy on push)...");
      const connectResult = exec(`${vercelCmd()} git connect "${githubRepoUrl}"`, projectDir, 30_000);
      if (connectResult.success) {
        s.stop("Connected — every git push will auto-deploy");
      } else {
        s.stop("Auto-connect failed (connect manually in Vercel dashboard → Git)");
      }
    }

    // Set DATABASE_URL across all three environments concurrently
    if (databaseUrl) {
      const s = p.spinner();
      s.start("Setting DATABASE_URL (production, preview, development)...");
      const ok = await vercelEnvSetAll("DATABASE_URL", databaseUrl, projectDir);
      s.stop(ok ? "DATABASE_URL set ✓" : "DATABASE_URL — some environments failed (set manually in Vercel)");
    }

    // Deploy
    productionUrl = await vercelDeploy(projectDir);
    if (productionUrl) {
      tracker.success("Vercel deploy", productionUrl);
    } else {
      tracker.failed("Vercel deploy", `Run: cd ${projectName} && vercel deploy --prod`);
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 3: Whop (only if we have a production URL)
  // ══════════════════════════════════════════════════════════════════

  if (productionUrl) {
    p.log.info(pc.bold("\n── Whop ────────────────────────────────────────"));

    const connectWhop = await p.confirm({
      message: `Connect to Whop${environment === "sandbox" ? " sandbox" : ""}? (creates app with OAuth + webhooks automatically)`,
      initialValue: true,
    });

    if (!p.isCancel(connectWhop) && connectWhop) {
      if (environment === "sandbox") {
        p.log.info(pc.yellow("Sandbox mode — use credentials from sandbox.whop.com, not production."));
      }
      // ── Step A: Get Company API key ──────────────────────────────
      p.note(
        [
          `${pc.bold("1.")} Go to ${pc.cyan(`${whopWeb}/dashboard/developer`)}`,
          `${pc.bold("2.")} Under "Company API Keys", click ${pc.bold('"Create"')}`,
          `${pc.bold("3.")} Name it (e.g. "${projectName}")`,
          `${pc.bold("4.")} Set "Inherit permissions from role" to ${pc.bold('"Owner"')}`,
          `${pc.bold("5.")} Click Create, copy the key, and paste it below`,
        ].join("\n"),
        "Whop Company API Key",
      );

      // User clicks the URL in the instructions above

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
            return { productionUrl, githubUrl: githubRepoUrl ?? undefined, tracker };
          }
          apiKey = result;
        }

        let s = p.spinner();
        s.start("Validating...");
        keyValid = await validateApiKey(apiKey, environment);
        if (keyValid) { s.stop("API key valid"); break; }
        s.stop("API key invalid");

        if (attempt < 2) {
          const retry = await p.confirm({ message: "Try a different key?", initialValue: true });
          if (p.isCancel(retry) || !retry) return { productionUrl, githubUrl: githubRepoUrl ?? undefined, tracker };
          apiKey = "";
        }
      }

      if (!keyValid) return { productionUrl, githubUrl: githubRepoUrl ?? undefined, tracker };

      // ── Step B: Get Company ID ───────────────────────────────────
      const companyId = await getCompanyId(apiKey, environment);
      if (!companyId) return { productionUrl, githubUrl: githubRepoUrl ?? undefined, tracker };

      // ── Step C: Create OAuth app ─────────────────────────────────
      // TanStack uses /auth/callback, Next.js and Astro use /api/auth/callback
      const callbackPath = framework === "tanstack" ? "/auth/callback" : "/api/auth/callback";
      const redirectUris = [
        `http://localhost:3000${callbackPath}`,
        `${productionUrl}${callbackPath}`,
      ];

      let s = p.spinner();
      s.start("Creating Whop OAuth app...");
      const app = await createWhopApp(apiKey, projectName, redirectUris, companyId, environment);
      if (!app) {
        s.stop("Failed to create app");
        p.log.error("Create manually in the Whop dashboard.");
        return { productionUrl, githubUrl: githubRepoUrl ?? undefined, tracker };
      }
      s.stop(`App created: ${pc.bold(app.id)}`);
      tracker.success("Whop app", app.id);

      // Echo the redirect URIs we registered. If OAuth fails later, the user
      // can sanity-check these against the URL they're actually loading.
      p.log.info(`OAuth redirect URIs registered:\n  ${redirectUris.map((u) => pc.cyan(u)).join("\n  ")}`);

      // ── Step D: Set OAuth to Public mode (automated) ─────────────
      s = p.spinner();
      s.start("Setting OAuth client type to public...");
      const oauthResult = await setOAuthPublicMode(apiKey, app.id, environment);
      const oauthUrl = `${whopWeb}/dashboard/${companyId}/developer/apps/${app.id}/oauth/`;
      if (oauthResult.ok) {
        s.stop("OAuth client type: public");
        tracker.success("OAuth Public mode");
      } else {
        s.stop("Could not set OAuth client type to public");
        p.log.warning(`Whop API rejected the request: ${pc.dim(oauthResult.error)}`);
        p.log.info(`Set it manually at: ${pc.cyan(oauthUrl)}`);
        tracker.failed("OAuth Public mode", `Set to Public at: ${oauthUrl}`);
      }

      const appUrl = `${whopWeb}/dashboard/${companyId}/developer/apps/${app.id}/`;

      // ── Step E: Get App credentials ──────────────────────────────
      p.note(
        [
          `Now copy your app's environment variables:`,
          "",
          `${pc.bold("1.")} Go to ${pc.cyan(appUrl)}`,
          `${pc.bold("2.")} Copy the environment variables shown`,
          `${pc.bold("3.")} Paste both lines below`,
        ].join("\n"),
        "Copy App Credentials",
      );

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
          tracker.success("App credentials");
        } else {
          // Maybe they just pasted the raw key
          const rawKey = envResult.trim();
          if (rawKey.startsWith("apik_")) {
            appApiKey = rawKey;
            p.log.success("API key received");
            tracker.success("App credentials");
          } else {
            tracker.failed("App credentials", `Copy from: ${appUrl}`);
          }
        }
      } else {
        tracker.failed("App credentials", `Copy from: ${appUrl}`);
      }

      // ── Step F: Create webhook ───────────────────────────────────
      s = p.spinner();
      s.start("Creating webhook...");
      const webhook = await createWhopWebhook(apiKey, `${productionUrl}/api/webhooks/whop`, WEBHOOK_EVENTS, companyId, environment);
      if (!webhook) {
        s.stop("Failed");
        tracker.failed("Webhook", "Create manually in Whop dashboard → Webhooks");
      } else if (!webhook.secret) {
        // Webhook exists but the API returned no signing secret — without it
        // the deployed app can't verify events, so don't report success.
        s.stop("Webhook created, but no secret returned");
        tracker.failed("Webhook secret", "Copy the secret from Whop dashboard → Webhooks and set WHOP_WEBHOOK_SECRET");
      } else {
        s.stop("Webhook created");
        tracker.success("Webhook");
      }

      // ── Step G: Set up pricing plans ────────────────────────────
      p.log.info(pc.bold("\n── Pricing Plans ───────────────────────────────"));

      const setupPlanChoice = await p.confirm({
        message: "Set up pricing plans now?",
        initialValue: true,
      });

      let planEnvVars: Record<string, string> = {};
      if (!p.isCancel(setupPlanChoice) && setupPlanChoice) {
        const planResult = await setupPlans(apiKey, companyId, environment);
        if (planResult) {
          planEnvVars = planResultToEnvVars(planResult, framework);
          p.log.success(`${planResult.tiers.length} paid tier(s) created${planResult.freePlanId ? " + free tier" : ""}`);
          tracker.success("Pricing plans", `${planResult.tiers.length} tier(s)`);
        } else {
          tracker.failed("Pricing plans", "Run: npx whop-kit add plans");
        }
      } else {
        tracker.skipped("Pricing plans");
      }

      // ── Step H: Push all env vars to Vercel ─────────────────────
      if (useVercel) {
        const envVars: Record<string, string> = {};

        // App credentials
        if (framework === "nextjs") {
          envVars["NEXT_PUBLIC_WHOP_APP_ID"] = appId;
        } else {
          envVars["WHOP_APP_ID"] = appId;
        }
        if (appApiKey) envVars["WHOP_API_KEY"] = appApiKey;
        if (webhook?.secret) envVars["WHOP_WEBHOOK_SECRET"] = webhook.secret;
        if (environment === "sandbox") {
          envVars[whopEnvVarName(framework)] = "sandbox";
        }
        // App URL — Next.js uses NEXT_PUBLIC_ prefix
        envVars[framework === "nextjs" ? "NEXT_PUBLIC_APP_URL" : "APP_URL"] = productionUrl;

        // Plan IDs
        Object.assign(envVars, planEnvVars);

        for (const [key, value] of Object.entries(envVars)) {
          if (!value) continue;
          const vs = p.spinner();
          vs.start(`Pushing ${key}...`);
          const ok = await vercelEnvSetAll(key, value, projectDir);
          vs.stop(ok ? `${key} ✓` : `${key} — failed (set manually in Vercel)`);
        }

        // Redeploy — show live build output
        p.log.step("Redeploying with full configuration...");
        console.log("");
        const redeployOk = execInteractive(`${vercelCmd()} deploy --prod --yes`, projectDir);
        console.log("");
        if (redeployOk) {
          p.log.success("Redeployed");
        } else {
          p.log.warning("Redeploy failed — will apply on next git push");
        }
      }

      return {
        productionUrl,
        githubUrl: githubRepoUrl ?? undefined,
        whopAppId: app.id,
        whopApiKey: appApiKey || undefined,
        webhookSecret: webhook?.secret,
        tracker,
      };
    }
  }

  return {
    productionUrl: productionUrl ?? "",
    githubUrl: githubRepoUrl ?? undefined,
    tracker,
  };
}
