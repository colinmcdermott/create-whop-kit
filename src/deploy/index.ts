import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive } from "../utils/exec.js";
import {
  isVercelInstalled,
  installVercel,
  isVercelAuthenticated,
  vercelLogin,
  vercelDeploy,
  vercelEnvSet,
  vercelEnvSetBatch,
} from "./vercel.js";
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
  whopCompanyKey?: string; // for non-interactive mode
}

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") exec(`open "${url}"`);
  else if (platform === "win32") exec(`start "" "${url}"`);
  else exec(`xdg-open "${url}"`);
}

/**
 * Run the full deploy pipeline:
 * 1. Vercel auth + deploy → get production URL
 * 2. Whop API key → create app + webhook → get all credentials
 * 3. Push env vars to Vercel → redeploy
 */
export async function runDeployPipeline(
  options: DeployPipelineOptions,
): Promise<DeployResult | null> {
  const { projectDir, projectName, databaseUrl, framework } = options;

  // ── Step 1: Vercel CLI ──────────────────────────────────────────
  if (!isVercelInstalled()) {
    const install = await p.confirm({
      message: "Vercel CLI not found. Install it now?",
      initialValue: true,
    });
    if (p.isCancel(install) || !install) return null;

    const ok = await installVercel();
    if (!ok) return null;
  }

  // ── Step 2: Vercel auth ─────────────────────────────────────────
  if (!isVercelAuthenticated()) {
    const ok = await vercelLogin();
    if (!ok) {
      p.log.error("Vercel authentication failed. Deploy later with: " + pc.bold("whop-kit deploy"));
      return null;
    }
  }
  p.log.success("Vercel authenticated");

  // ── Step 3: Link project to Vercel ──────────────────────────────
  // Must link before setting env vars, otherwise vars aren't associated
  p.log.step("Vercel: linking project...");
  console.log("");
  const linkOk = execInteractive(`vercel link --yes`, projectDir);
  console.log("");
  if (!linkOk) {
    // First deploy also creates the link, so try deploying directly
    p.log.warning("Could not link project. Will try deploying directly.");
  }

  // ── Step 4: Push DATABASE_URL ──────────────────────────────────
  if (databaseUrl) {
    const s = p.spinner();
    s.start("Vercel: setting DATABASE_URL...");
    vercelEnvSet("DATABASE_URL", databaseUrl, "production", projectDir);
    vercelEnvSet("DATABASE_URL", databaseUrl, "preview", projectDir);
    vercelEnvSet("DATABASE_URL", databaseUrl, "development", projectDir);
    s.stop("DATABASE_URL set on Vercel");
  }

  // ── Step 5: Deploy ─────────────────────────────────────────────
  const productionUrl = await vercelDeploy(projectDir);
  if (!productionUrl) {
    p.log.error("Vercel deployment failed. Try deploying manually:");
    p.log.info(pc.bold(`  cd ${projectName} && vercel deploy --prod`));
    return null;
  }

  // ── Step 4: Whop Company API key ────────────────────────────────
  const connectWhop = await p.confirm({
    message: "Connect to Whop? (creates OAuth app + webhooks automatically)",
    initialValue: true,
  });
  if (p.isCancel(connectWhop) || !connectWhop) {
    return { productionUrl };
  }

  // Guide user through getting a Company API key
  p.log.info("");
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

  // Open the dashboard
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

  // ── Step 5: Validate key ────────────────────────────────────────
  const s = p.spinner();
  s.start("Validating API key...");
  const keyValid = await validateApiKey(apiKey);
  if (!keyValid) {
    s.stop("Invalid API key");
    p.log.error("The key was rejected. Check that it has the required permissions:");
    p.log.info("  developer:create_app, developer:manage_api_key, developer:manage_webhook");
    p.log.info(`  Dashboard: ${pc.cyan("https://whop.com/dashboard/developer")}`);
    return { productionUrl };
  }
  s.stop("API key valid");

  // ── Step 6: Create Whop OAuth app ───────────────────────────────
  const callbackPath = framework === "astro"
    ? "/api/auth/callback"
    : "/api/auth/callback";

  const redirectUris = [
    `http://localhost:3000${callbackPath}`,
    `${productionUrl}${callbackPath}`,
  ];

  s.start("Creating Whop OAuth app...");
  const app = await createWhopApp(apiKey, projectName, redirectUris);
  if (!app) {
    s.stop("Failed to create Whop app");
    p.log.error("Create it manually in the Whop dashboard.");
    return { productionUrl };
  }
  s.stop(`Whop app created: ${pc.bold(app.id)}`);

  // ── Step 7: Create webhook ──────────────────────────────────────
  const webhookUrl = `${productionUrl}/api/webhooks/whop`;
  s.start("Creating webhook endpoint...");
  const webhook = await createWhopWebhook(apiKey, webhookUrl, WEBHOOK_EVENTS);
  if (!webhook) {
    s.stop("Failed to create webhook");
    p.log.warning("Create it manually in the Whop dashboard.");
    // Continue — app is still configured
  } else {
    s.stop("Webhook endpoint created");
  }

  // ── Step 8: Push env vars to Vercel + update local ──────────────
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

  s.start("Pushing credentials to Vercel...");
  const { success, failed } = vercelEnvSetBatch(envVars, projectDir);
  if (failed.length > 0) {
    s.stop(`Pushed ${success.length} vars, ${failed.length} failed`);
    p.log.warning(`Failed to push: ${failed.join(", ")}. Add them manually in Vercel dashboard.`);
  } else {
    s.stop(`${success.length} environment variables pushed`);
  }

  // ── Step 9: Redeploy with full config ───────────────────────────
  p.log.step("Vercel: redeploying with full configuration...");
  console.log("");
  const redeployOk = execInteractive("vercel deploy --prod --yes", projectDir);
  console.log("");
  if (redeployOk) {
    p.log.success("Redeployed with full configuration");
  } else {
    p.log.warning("Redeploy failed — env vars will apply on next deploy/push");
  }

  return {
    productionUrl,
    whopAppId: app.id,
    whopApiKey: app.client_secret,
    webhookSecret: webhook?.secret,
  };
}
