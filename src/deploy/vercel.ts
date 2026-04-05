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
  p.log.step("Vercel: authenticating (opening browser)...");
  console.log("");
  const ok = execInteractive("vercel login");
  console.log("");
  return ok;
}

/**
 * Deploy to Vercel production. Returns the production URL.
 * Captures stdout to extract the URL. Uses 5 minute timeout for builds.
 */
export async function vercelDeploy(projectDir: string): Promise<string | null> {
  const s = p.spinner();
  s.start("Vercel: deploying to production (this may take a few minutes)...");

  // Use piped exec to capture the URL from stdout (5 min timeout for builds)
  const result = exec("vercel deploy --prod --yes", projectDir, 300_000);

  if (!result.success) {
    s.stop("Vercel deployment failed");
    // Show the error output
    const errorOutput = result.stderr || result.stdout;
    if (errorOutput) {
      p.log.error("Build output:");
      console.log(pc.dim(errorOutput.substring(0, 500)));
    }
    return null;
  }

  // Parse URL from stdout — vercel outputs multiple lines, URL contains .vercel.app
  const lines = result.stdout.split("\n");

  // Look for the aliased production URL first (e.g. "https://my-app.vercel.app")
  // Then fall back to any vercel.app URL
  let url = "";
  for (const line of lines) {
    const match = line.match(/https:\/\/[^\s\[\]]+\.vercel\.app/);
    if (match) {
      url = match[0];
      // Prefer shorter URLs (the alias, not the deployment hash URL)
      if (!url.includes("-git-") && url.split("-").length < 5) break;
    }
  }

  if (url) {
    s.stop(`Deployed to ${pc.cyan(url)}`);
    return url;
  }

  // Fallback: any https URL in the output
  for (const line of lines) {
    const match = line.match(/https:\/\/[^\s\[\]]+/);
    if (match) {
      url = match[0];
      s.stop(`Deployed to ${pc.cyan(url)}`);
      return url;
    }
  }

  s.stop("Deployed but could not extract URL");

  // Last resort: ask the user
  const manual = await p.text({
    message: "Paste your Vercel production URL (shown in the output above)",
    placeholder: "https://your-app.vercel.app",
    validate: (v) => {
      if (!v?.startsWith("https://")) return "Must be a https:// URL";
    },
  });
  if (p.isCancel(manual)) return null;
  return manual;
}

/**
 * Set an environment variable on the Vercel project.
 */
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
    const ok = vercelEnvSet(key, value, "production", projectDir)
      && vercelEnvSet(key, value, "preview", projectDir)
      && vercelEnvSet(key, value, "development", projectDir);
    if (ok) success.push(key);
    else failed.push(key);
  }

  return { success, failed };
}
