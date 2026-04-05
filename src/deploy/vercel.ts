import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive, execWithStdin, hasCommand } from "../utils/exec.js";

export function isVercelInstalled(): boolean {
  return hasCommand("vercel");
}

export async function installVercel(): Promise<boolean> {
  const s = p.spinner();
  s.start("Installing Vercel CLI...");
  const result = exec("npm install -g vercel");
  if (result.success) {
    s.stop("Vercel CLI installed");
    return true;
  }
  s.stop("Failed to install Vercel CLI");
  p.log.error(`Install manually: ${pc.bold("npm install -g vercel")}`);
  return false;
}

export function isVercelAuthenticated(): boolean {
  const result = exec("vercel whoami");
  return result.success;
}

export async function vercelLogin(): Promise<boolean> {
  p.log.info("Authenticating with Vercel. This will open your browser.");
  console.log("");
  const ok = execInteractive("vercel login");
  console.log("");
  return ok;
}

/**
 * Deploy to Vercel production. Returns the production URL.
 * stdout from `vercel deploy --prod` is the deployment URL.
 */
export async function vercelDeploy(projectDir: string): Promise<string | null> {
  const s = p.spinner();
  s.start("Deploying to Vercel...");

  // Deploy with --yes to skip prompts, --prod for production
  const result = exec("vercel deploy --prod --yes", projectDir);

  if (!result.success || !result.stdout) {
    s.stop("Deployment failed");
    return null;
  }

  // stdout is the deployment URL
  let url = result.stdout.trim();
  // Sometimes vercel outputs multiple lines, URL is the last one
  const lines = url.split("\n");
  url = lines[lines.length - 1].trim();

  // Ensure it looks like a URL
  if (!url.startsWith("https://")) {
    s.stop("Could not determine deployment URL");
    return null;
  }

  s.stop(`Deployed to ${pc.cyan(url)}`);
  return url;
}

/**
 * Set an environment variable on the Vercel project.
 * Pipes the value via stdin to avoid shell escaping issues.
 */
export function vercelEnvSet(
  key: string,
  value: string,
  environment: "production" | "preview" | "development" = "production",
  projectDir?: string,
): boolean {
  // Use --force to overwrite existing vars without prompting
  const result = execWithStdin(
    `vercel env add ${key} ${environment} --force`,
    value,
    projectDir,
  );
  return result.success;
}

/**
 * Push multiple env vars to Vercel.
 */
export function vercelEnvSetBatch(
  vars: Record<string, string>,
  projectDir?: string,
): { success: string[]; failed: string[] } {
  const success: string[] = [];
  const failed: string[] = [];

  for (const [key, value] of Object.entries(vars)) {
    if (!value) continue;
    // Set for all environments
    const ok = vercelEnvSet(key, value, "production", projectDir)
      && vercelEnvSet(key, value, "preview", projectDir)
      && vercelEnvSet(key, value, "development", projectDir);
    if (ok) success.push(key);
    else failed.push(key);
  }

  return { success, failed };
}
