import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive, execWithStdin, hasCommand } from "../utils/exec.js";

// ---------------------------------------------------------------------------
// Installation & updates
// ---------------------------------------------------------------------------

export function isVercelInstalled(): boolean {
  return hasCommand("vercel");
}

export async function installOrUpdateVercel(): Promise<boolean> {
  const s = p.spinner();

  if (isVercelInstalled()) {
    const versionResult = exec("vercel --version");
    const currentVersion = versionResult.stdout.replace(/[^0-9.]/g, "");

    s.start("Checking for Vercel CLI updates...");
    const updateResult = exec("npm install -g vercel@latest", undefined, 60_000);
    if (updateResult.success) {
      const newVersion = exec("vercel --version");
      const newVer = newVersion.stdout.replace(/[^0-9.]/g, "");
      if (newVer !== currentVersion) {
        s.stop(`Vercel CLI updated: ${currentVersion} → ${newVer}`);
      } else {
        s.stop(`Vercel CLI up to date (v${currentVersion})`);
      }
    } else {
      s.stop(`Vercel CLI v${currentVersion} (update check failed, continuing)`);
    }
    return true;
  }

  s.start("Installing Vercel CLI...");
  const result = exec("npm install -g vercel@latest");
  if (result.success) {
    s.stop("Vercel CLI installed");
    return true;
  }
  s.stop("Failed to install Vercel CLI");
  p.log.error(`Install manually: ${pc.bold("npm install -g vercel@latest")}`);
  return false;
}

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export function isVercelAuthenticated(): boolean {
  const result = exec("vercel whoami");
  return result.success;
}

export function getVercelUser(): string | null {
  const result = exec("vercel whoami");
  return result.success ? result.stdout.trim() : null;
}

export async function vercelLogin(): Promise<boolean> {
  p.log.info("You'll be redirected to Vercel to sign in (or create an account).");
  console.log("");
  const ok = execInteractive("vercel login");
  console.log("");
  return ok;
}

// ---------------------------------------------------------------------------
// Linking
// ---------------------------------------------------------------------------

export async function vercelLink(projectDir: string): Promise<boolean> {
  p.log.step("Vercel: linking project...");
  console.log("");
  const ok = execInteractive("vercel link --yes", projectDir);
  console.log("");
  return ok;
}

// ---------------------------------------------------------------------------
// Deploy
// ---------------------------------------------------------------------------

/**
 * Deploy to Vercel production. Returns the production URL.
 * Uses interactive mode so users see live build logs, then extracts URL.
 */
export async function vercelDeploy(projectDir: string): Promise<string | null> {
  p.log.step("Vercel: deploying to production...");
  console.log("");

  // Interactive deploy — user sees build logs in real time
  const ok = execInteractive("vercel deploy --prod --yes", projectDir);
  console.log("");

  if (!ok) {
    p.log.error("Vercel deployment failed. Check the build output above.");
    return null;
  }

  // Extract URL from .vercel/project.json — the most reliable method
  // Vercel always creates this file during link/deploy
  try {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const projectJson = JSON.parse(
      readFileSync(join(projectDir, ".vercel", "project.json"), "utf-8"),
    );
    if (projectJson.projectName) {
      const url = `https://${projectJson.projectName}.vercel.app`;
      p.log.success(`Deployed to ${pc.cyan(url)}`);
      return url;
    }
  } catch { /* no project.json */ }

  // Fallback: ask the user — the URL was shown in the build output above
  p.log.info("The deployment URL was shown in the build output above (after 'Aliased:')");
  const manual = await p.text({
    message: "Paste your Vercel production URL",
    placeholder: "https://your-app.vercel.app",
    validate: (v) => {
      if (!v?.startsWith("https://")) return "Must be a https:// URL";
    },
  });
  if (p.isCancel(manual)) return null;
  return manual;
}

// ---------------------------------------------------------------------------
// Environment variables
// ---------------------------------------------------------------------------

export function vercelEnvSet(
  key: string,
  value: string,
  environment: "production" | "preview" | "development" = "production",
  projectDir?: string,
): boolean {
  const result = execWithStdin(
    `vercel env add ${key} ${environment} --force`,
    value,
    projectDir,
  );
  return result.success;
}

export function vercelEnvSetBatch(
  vars: Record<string, string>,
  projectDir?: string,
): { success: string[]; failed: string[] } {
  const success: string[] = [];
  const failed: string[] = [];

  for (const [key, value] of Object.entries(vars)) {
    if (!value) continue;
    const ok = vercelEnvSet(key, value, "production", projectDir)
      && vercelEnvSet(key, value, "preview", projectDir)
      && vercelEnvSet(key, value, "development", projectDir);
    if (ok) success.push(key);
    else failed.push(key);
  }

  return { success, failed };
}
