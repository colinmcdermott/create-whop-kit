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
    // Check if update is available
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
  p.log.info(pc.dim("This is needed to deploy your app."));
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
 * Captures stdout to extract the URL. Uses 5 minute timeout for builds.
 */
export async function vercelDeploy(projectDir: string): Promise<string | null> {
  const s = p.spinner();
  s.start("Vercel: deploying to production (this may take a few minutes)...");

  const result = exec("vercel deploy --prod --yes", projectDir, 300_000);

  if (!result.success) {
    s.stop("Vercel deployment failed");
    const errorOutput = result.stderr || result.stdout;
    if (errorOutput) {
      p.log.error("Build output:");
      // Show last 600 chars of error (most relevant part)
      const trimmed = errorOutput.length > 600
        ? "..." + errorOutput.slice(-600)
        : errorOutput;
      console.log(pc.dim(trimmed));
    }
    return null;
  }

  // Parse URL from stdout
  const lines = result.stdout.split("\n");
  let url = "";

  // Look for aliased URL (e.g. "Aliased: https://my-app.vercel.app")
  for (const line of lines) {
    if (line.includes("Aliased:") || line.includes("Production:")) {
      const match = line.match(/https:\/\/[^\s\[\]]+/);
      if (match) {
        url = match[0];
        // The Aliased URL is the clean one — prefer it
        if (line.includes("Aliased:")) break;
      }
    }
  }

  // Fallback: any vercel.app URL, preferring shorter ones
  if (!url) {
    const urls: string[] = [];
    for (const line of lines) {
      const match = line.match(/https:\/\/[^\s\[\]]+\.vercel\.app/);
      if (match) urls.push(match[0]);
    }
    // Sort by length — shortest is usually the alias
    if (urls.length > 0) {
      urls.sort((a, b) => a.length - b.length);
      url = urls[0];
    }
  }

  if (url) {
    s.stop(`Deployed to ${pc.cyan(url)}`);
    return url;
  }

  // Fallback: any https URL
  for (const line of lines) {
    const match = line.match(/https:\/\/[^\s\[\]]+/);
    if (match && !match[0].includes("github.com") && !match[0].includes("vercel.com/")) {
      s.stop(`Deployed to ${pc.cyan(match[0])}`);
      return match[0];
    }
  }

  s.stop("Deployed but could not extract URL");

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
