import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive, execWithStdin, hasCommand } from "../utils/exec.js";

// ---------------------------------------------------------------------------
// Command resolution
// ---------------------------------------------------------------------------
//
// On WSL and other systems with restrictive global npm prefixes,
// `npm install -g vercel` either fails outright or installs a binary
// that can't execute (EACCES). To avoid pushing users to debug their npm
// setup mid-onboarding, we resolve `vercel` once at the start of the
// pipeline: prefer a working global install, otherwise fall back to
// `npx -y vercel@latest` which runs from a user-owned cache.
//
// All command-running helpers below route through `vercelCmd()`.

let _vercelCmd: string | null = null;
let _vercelUsingNpx = false;

function detectGlobalVercel(): boolean {
  if (!hasCommand("vercel")) return false;
  // Existence on PATH isn't enough — confirm it actually runs.
  return exec("vercel --version").success;
}

export function vercelCmd(): string {
  if (_vercelCmd) return _vercelCmd;
  _vercelCmd = detectGlobalVercel() ? "vercel" : "npx -y vercel@latest";
  _vercelUsingNpx = _vercelCmd.startsWith("npx");
  return _vercelCmd;
}

export function vercelUsingNpx(): boolean {
  vercelCmd();
  return _vercelUsingNpx;
}

// ---------------------------------------------------------------------------
// Installation
// ---------------------------------------------------------------------------

export function isVercelInstalled(): boolean {
  return detectGlobalVercel();
}

/**
 * Ensure we have *some* way to run Vercel. Order:
 *   1. Working global `vercel` — use it as-is (the CLI prints its own update banner).
 *   2. Try `npm install -g vercel@latest` once for users who don't have it.
 *   3. Fall back to `npx -y vercel@latest` so we always have a runnable path,
 *      even on systems where global npm is broken.
 */
export async function ensureVercelInstalled(): Promise<boolean> {
  if (detectGlobalVercel()) {
    _vercelCmd = "vercel";
    _vercelUsingNpx = false;
    return true;
  }

  const s = p.spinner();
  s.start("Installing Vercel CLI...");
  const result = exec("npm install -g vercel@latest", undefined, 120_000);
  if (result.success && detectGlobalVercel()) {
    s.stop("Vercel CLI installed");
    _vercelCmd = "vercel";
    _vercelUsingNpx = false;
    return true;
  }

  // Global install failed or produced a non-runnable binary (EACCES on WSL etc).
  // Fall back to npx — runs from a user-owned cache, no global perms needed.
  s.stop("Global install unavailable — using npx fallback");
  if (result.stderr) {
    p.log.info(pc.dim(result.stderr.split("\n").slice(0, 3).join("\n")));
  }
  p.log.info(
    `Using ${pc.bold("npx vercel@latest")} (first call is slower, no global install needed).`,
  );
  _vercelCmd = "npx -y vercel@latest";
  _vercelUsingNpx = true;

  // Verify the npx path actually resolves something runnable.
  const verify = exec(`${_vercelCmd} --version`, undefined, 180_000);
  if (!verify.success) {
    p.log.error("Could not run Vercel via npx either.");
    if (verify.stderr) p.log.info(pc.dim(verify.stderr.split("\n").slice(0, 5).join("\n")));
    return false;
  }
  return true;
}

// Kept for backwards compatibility.
export const installOrUpdateVercel = ensureVercelInstalled;

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------

export function isVercelAuthenticated(): boolean {
  const result = exec(`${vercelCmd()} whoami`);
  return result.success && result.stdout.trim().length > 0;
}

export function getVercelUser(): string | null {
  const result = exec(`${vercelCmd()} whoami`);
  if (!result.success) return null;
  const out = result.stdout.trim();
  return out.length > 0 ? out : null;
}

/**
 * Run `vercel login` interactively. The Vercel CLI uses OAuth 2.0 Device Flow —
 * shows a verification code, opens a browser, waits for confirmation. We run it
 * with inherited stdio and verify with `whoami` afterwards (exit 0 doesn't
 * always mean the device flow actually completed).
 */
export async function vercelLogin(): Promise<{ ok: boolean }> {
  const ok = execInteractive(`${vercelCmd()} login`);
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

    p.log.warning("Vercel sign-in didn't complete.");
    const whoamiAfter = exec(`${vercelCmd()} whoami`);
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
  const ok = execInteractive(`${vercelCmd()} link --yes`, projectDir);
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

  const ok = execInteractive(`${vercelCmd()} deploy --prod --yes`, projectDir);
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
    `${vercelCmd()} env add ${key} ${environment} --force`,
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
