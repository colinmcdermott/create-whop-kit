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
 * Uses interactive mode so the user can see build progress and any errors.
 * Then reads the deployment URL from `vercel inspect`.
 */
export async function vercelDeploy(projectDir: string): Promise<string | null> {
  p.log.step("Vercel: deploying to production (this may take a few minutes)...");
  console.log("");

  // Use interactive so the user sees build logs and any prompts
  const ok = execInteractive("vercel deploy --prod --yes", projectDir);
  console.log("");

  if (!ok) {
    p.log.error("Vercel deployment failed. Check the output above for details.");
    return null;
  }

  // Get the production URL from vercel inspect or vercel ls
  const inspect = exec("vercel inspect --json", projectDir);
  if (inspect.success) {
    try {
      const data = JSON.parse(inspect.stdout);
      if (data.url) {
        const url = data.url.startsWith("https://") ? data.url : `https://${data.url}`;
        p.log.success(`Deployed to ${pc.cyan(url)}`);
        return url;
      }
    } catch { /* parse failed, try fallback */ }
  }

  // Fallback: get URL from `vercel ls`
  const ls = exec("vercel ls --json 2>/dev/null | head -1", projectDir);
  if (ls.success) {
    const urlMatch = ls.stdout.match(/https:\/\/[^\s"]+\.vercel\.app/);
    if (urlMatch) {
      p.log.success(`Deployed to ${pc.cyan(urlMatch[0])}`);
      return urlMatch[0];
    }
  }

  // Last fallback: ask the user
  p.log.warning("Could not determine deployment URL automatically.");
  const manual = await p.text({
    message: "Paste your Vercel deployment URL",
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
