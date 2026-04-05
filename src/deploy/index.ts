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
} from "./github.js";
import {
  validateApiKey,
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
 * Run the full deploy pipeline:
 * 1. GitHub: create private repo + push
 * 2. Vercel: link project, connect to GitHub, set env vars, deploy
 * 3. Whop: create OAuth app + webhook using production URL
 */
export async function runDeployPipeline(
  options: DeployPipelineOptions,
): Promise<DeployResult | null> {
  const { projectDir, projectName, databaseUrl, framework } = options;

  // ══════════════════════════════════════════════════════════════════
  // PHASE 1: GitHub — create repo + push code
  // ══════════════════════════════════════════════════════════════════

  p.log.info(pc.bold("\n── GitHub ──────────────────────────────────────"));

  // Install gh if needed
  if (!isGhInstalled()) {
    const install = await p.confirm({
      message: "GitHub CLI (gh) not found. Install it?",
      initialValue: true,
    });
    if (p.isCancel(install) || !install) {
      p.log.warning("Skipping GitHub. Deploy will upload directly (no auto-deploy on push).");
    } else {
      await installGh();
    }
  }

  let githubRepoUrl: string | null = null;

  if (isGhInstalled()) {
    // Auth
    if (!isGhAuthenticated()) {
      const loginOk = await ghLogin();
      if (!loginOk) {
        p.log.warning("GitHub auth failed. Skipping GitHub repo creation.");
      }
    }

    if (isGhAuthenticated()) {
      // Create private repo and push
      githubRepoUrl = await createGitHubRepo(projectDir, projectName);
      if (githubRepoUrl) {
        p.log.success(`Code pushed to ${pc.cyan(githubRepoUrl)}`);
      } else {
        p.log.warning("Could not create GitHub repo. Continuing without it.");
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 2: Vercel — deploy + connect to GitHub
  // ══════════════════════════════════════════════════════════════════

  p.log.info(pc.bold("\n── Vercel ──────────────────────────────────────"));

  // Install / update Vercel CLI
  const vercelOk = await installOrUpdateVercel();
  if (!vercelOk) return null;

  // Auth
  if (!isVercelAuthenticated()) {
    const loginOk = await vercelLogin();
    if (!loginOk) {
      p.log.error("Vercel auth failed. Run " + pc.bold("whop-kit deploy") + " later.");
      return null;
    }
  }
  const vercelUser = getVercelUser();
  p.log.success(`Signed in${vercelUser ? ` as ${pc.bold(vercelUser)}` : ""}`);

  // Link project
  const linkOk = await vercelLink(projectDir);
  if (!linkOk) {
    p.log.warning("Could not link project.");
  }

  // Connect GitHub repo to Vercel (enables auto-deploy on push)
  if (githubRepoUrl) {
    const s = p.spinner();
    s.start("Connecting GitHub repo to Vercel (enables auto-deploy on push)...");
    const connectResult = exec(
      `vercel git connect ${githubRepoUrl}`,
      projectDir,
      30_000,
    );
    if (connectResult.success) {
      s.stop("GitHub connected — future pushes will auto-deploy");
    } else {
      s.stop("Could not auto-connect GitHub (connect manually in Vercel dashboard)");
    }
  }

  // Set DATABASE_URL
  if (databaseUrl) {
    const s = p.spinner();
    s.start("Setting DATABASE_URL on Vercel...");
    vercelEnvSet("DATABASE_URL", databaseUrl, "production", projectDir);
    vercelEnvSet("DATABASE_URL", databaseUrl, "preview", projectDir);
    vercelEnvSet("DATABASE_URL", databaseUrl, "development", projectDir);
    s.stop("DATABASE_URL configured");
  }

  // Deploy
  const productionUrl = await vercelDeploy(projectDir);
  if (!productionUrl) {
    p.log.error("Deployment failed. Try: " + pc.bold(`cd ${projectName} && vercel deploy --prod`));
    return null;
  }

  // ══════════════════════════════════════════════════════════════════
  // PHASE 3: Whop — create OAuth app + webhook
  // ══════════════════════════════════════════════════════════════════

  p.log.info(pc.bold("\n── Whop ────────────────────────────────────────"));

  const connectWhop = await p.confirm({
    message: "Connect to Whop? (creates OAuth app + webhooks automatically)",
    initialValue: true,
  });
  if (p.isCancel(connectWhop) || !connectWhop) {
    return { productionUrl };
  }

  // Guide user through API key creation
  p.note(
    [
      `${pc.bold("1.")} Go to the Whop Developer Dashboard`,
      `   ${pc.cyan("https://whop.com/dashboard/developer")}`,
      "",
      `${pc.bold("2.")} Click ${pc.bold('"Create"')} under "Company API Keys"`,
      "",
      `${pc.bold("3.")} Name it anything (e.g. "${projectName}")`,
      "",
      `${pc.bold("4.")} Select these permissions:`,
      `   ${pc.green("•")} developer:create_app`,
      `   ${pc.green("•")} developer:manage_api_key`,
      `   ${pc.green("•")} developer:manage_webhook`,
      "",
      `${pc.bold("5.")} Create the key and paste it below`,
    ].join("\n"),
    "Create a Company API Key",
  );

  openUrl("https://whop.com/dashboard/developer");

  let apiKey = options.whopCompanyKey ?? "";
  if (!apiKey) {
    const result = await p.text({
      message: "Paste your Company API key",
      placeholder: "paste the key here...",
      validate: (v) => (!v ? "API key is required" : undefined),
    });
    if (p.isCancel(result)) return { productionUrl };
    apiKey = result;
  }

  // Validate
  const s = p.spinner();
  s.start("Validating API key...");
  const keyValid = await validateApiKey(apiKey);
  if (!keyValid) {
    s.stop("Invalid API key");
    p.log.error("Check permissions: developer:create_app, developer:manage_api_key, developer:manage_webhook");
    return { productionUrl };
  }
  s.stop("API key valid");

  // Create OAuth app
  const callbackPath = "/api/auth/callback";
  const redirectUris = [
    `http://localhost:3000${callbackPath}`,
    `${productionUrl}${callbackPath}`,
  ];

  s.start("Creating Whop OAuth app...");
  const app = await createWhopApp(apiKey, projectName, redirectUris);
  if (!app) {
    s.stop("Failed to create app");
    p.log.error("Create manually at: " + pc.cyan("https://whop.com/dashboard/developer"));
    return { productionUrl };
  }
  s.stop(`OAuth app created: ${pc.bold(app.id)}`);

  // Create webhook
  const webhookUrl = `${productionUrl}/api/webhooks/whop`;
  s.start("Creating webhook endpoint...");
  const webhook = await createWhopWebhook(apiKey, webhookUrl, WEBHOOK_EVENTS);
  if (!webhook) {
    s.stop("Failed to create webhook");
    p.log.warning("Create manually in the Whop dashboard.");
  } else {
    s.stop("Webhook created");
  }

  // Push Whop env vars to Vercel
  const envVars: Record<string, string> = {};
  if (framework === "nextjs") {
    envVars["NEXT_PUBLIC_WHOP_APP_ID"] = app.id;
  } else {
    envVars["WHOP_APP_ID"] = app.id;
  }
  envVars["WHOP_API_KEY"] = app.client_secret;
  if (webhook?.secret) {
    envVars["WHOP_WEBHOOK_SECRET"] = webhook.secret;
  }

  s.start("Pushing Whop credentials to Vercel...");
  const { success, failed } = vercelEnvSetBatch(envVars, projectDir);
  if (failed.length > 0) {
    s.stop(`${success.length} pushed, ${failed.length} failed`);
  } else {
    s.stop("Credentials pushed to Vercel");
  }

  // Redeploy with all config
  s.start("Redeploying with full configuration...");
  const redeployResult = exec("vercel deploy --prod --yes", projectDir, 300_000);
  if (redeployResult.success) {
    s.stop("Redeployed successfully");
  } else {
    s.stop("Redeploy pending — will apply on next git push");
  }

  return {
    productionUrl,
    whopAppId: app.id,
    whopApiKey: app.client_secret,
    webhookSecret: webhook?.secret,
  };
}
