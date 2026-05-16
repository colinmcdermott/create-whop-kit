import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive, execWithStdin, hasCommand } from "../utils/exec.js";

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

export function isVercelInstalled(): boolean {
  return hasCommand("vercel");
}

/**
 * Ensure the Vercel CLI is installed. If already installed, leave it alone —
 * the Vercel CLI prints its own update banner. Auto-upgrading on every run
 * is slow, noisy, and can EACCES on systems with restrictive global npm,
 * which can be mistaken for an auth failure on the next step.
 */
export async function ensureVercelInstalled(): Promise<boolean> {
  if (isVercelInstalled()) return true;

  const s = p.spinner();
  s.start("Installing Vercel CLI...");
  const result = exec("npm install -g vercel@latest", undefined, 120_000);
  if (result.success && isVercelInstalled()) {
    s.stop("Vercel CLI installed");
    return true;
  }

  s.stop("Failed to install Vercel CLI");
  p.log.error(`Install manually: ${pc.bold("npm install -g vercel@latest")}`);
  if (result.stderr) {
    p.log.info(pc.dim(result.stderr.split("\n").slice(0, 5).join("\n")));
  }
  return false;
}

// Kept for backwards compatibility — same behaviour as ensureVercelInstalled now.
export const installOrUpdateVercel = ensureVercelInstalled;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export function isVercelAuthenticated(): boolean {
  const result = exec("vercel whoami");
  return result.success && result.stdout.trim().length > 0;
}

export function getVercelUser(): string | null {
  const result = exec("vercel whoami");
  if (!result.success) return null;
  const out = result.stdout.trim();
  return out.length > 0 ? out : null;
}

/**
 * Run `vercel login` interactively. Returns { ok, stderr } so callers can
 * surface the real reason on failure instead of bailing silently.
 *
 * The Vercel CLI uses OAuth 2.0 Device Flow — it shows a verification code,
 * opens a browser, and waits for confirmation. We can't fully capture that
 * output without breaking the interactive UX, so we run it inherited and
 * then verify with `vercel whoami` afterward.
 */
export async function vercelLogin(): Promise<{ ok: boolean }> {
  const ok = execInteractive("vercel login");
  return { ok };
}

/**
 * Ensure we have a working Vercel auth state.
 *   1. If `vercel whoami` succeeds — saved auth.json or VERCEL_TOKEN env — use as-is.
 *   2. Otherwise run interactive `vercel login` (OAuth device flow), retry up to 3×.
 */
export async function ensureVercelAuth(): Promise<{ ok: boolean; skipped?: boolean }> {
  if (isVercelAuthenticated()) return { ok: true };

  p.note(
    [
      "A browser tab will open to sign you in to Vercel.",
      "Confirm the verification code shown in your terminal matches the one in the browser.",
      "",
      "If no browser opens, copy the URL the CLI prints into one manually.",
    ].join("\n"),
    "Vercel sign-in",
  );

  for (let attempt = 0; attempt < 3; attempt++) {
    console.log("");
    const { ok } = await vercelLogin();
    console.log("");

    if (ok && isVercelAuthenticated()) {
      const user = getVercelUser();
      p.log.success(`Signed in to Vercel${user ? ` as ${pc.bold(user)}` : ""}`);
      return { ok: true };
    }

    // Login process exited non-zero, or whoami still says no. Surface whatever
    // diagnostic info we can so the user isn't staring at a silent failure.
    p.log.warning("Vercel sign-in didn't complete.");
    const whoamiAfter = exec("vercel whoami");
    if (whoamiAfter.stderr) {
      p.log.info(pc.dim(`vercel whoami: ${whoamiAfter.stderr.split("\n")[0]}`));
    }

    if (attempt >= 2) break;

    const choice = await p.select({
      message: "What now?",
      options: [
        { value: "retry", label: "Try again" },
        { value: "skip", label: "Skip Vercel for now", hint: "you can run whop-kit deploy later" },
      ],
    });

    if (p.isCancel(choice) || choice === "skip") {
      return { ok: false, skipped: true };
    }
  }

  return { ok: false };
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
