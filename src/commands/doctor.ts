import { existsSync, readFileSync, accessSync, constants } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { readManifest } from "../scaffolding/manifest.js";
import { exec, hasCommand } from "../utils/exec.js";

type Status = "pass" | "warn" | "fail";

interface CheckResult {
  name: string;
  status: Status;
  detail?: string;
  fix?: string;
}

function check(name: string, status: Status, detail?: string, fix?: string): CheckResult {
  return { name, status, detail, fix };
}

// ---------------------------------------------------------------------------
// Individual checks
// ---------------------------------------------------------------------------

function checkNode(): CheckResult {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major >= 20) return check("Node.js", "pass", `v${process.versions.node}`);
  if (major >= 18) return check("Node.js", "warn", `v${process.versions.node}`, "Node 20 LTS recommended");
  return check("Node.js", "fail", `v${process.versions.node}`, "Upgrade to Node 20+: https://nodejs.org");
}

function checkGit(): CheckResult {
  if (!hasCommand("git")) return check("git", "fail", "not installed", "Install from https://git-scm.com");
  const v = exec("git --version").stdout.replace("git version ", "");
  return check("git", "pass", v);
}

function checkGh(): CheckResult {
  if (!hasCommand("gh")) return check("GitHub CLI", "warn", "not installed", "Needed for deploy: npm install -g gh");
  const auth = exec("gh auth status");
  if (!auth.success) return check("GitHub CLI", "warn", "not authenticated", "Run: gh auth login");
  // gh auth status writes the user to stderr; parse it.
  const userMatch = (auth.stderr || auth.stdout).match(/account ([\w-]+)/);
  return check("GitHub CLI", "pass", userMatch ? `signed in as ${userMatch[1]}` : "signed in");
}

function checkVercel(): CheckResult {
  // Match the runtime resolution from deploy/vercel.ts — a global install
  // that exists on PATH but EACCESes on execute is not "installed" for us.
  const globalOk = hasCommand("vercel") && exec("vercel --version").success;
  if (!globalOk) {
    // npx fallback would work but takes 30s+ to verify; just flag the state.
    return check(
      "Vercel CLI",
      "warn",
      "no working global install",
      "Will use npx fallback during deploy. To install globally: npm install -g vercel@latest",
    );
  }
  const who = exec("vercel whoami");
  if (!who.success || !who.stdout.trim()) {
    return check("Vercel CLI", "warn", "not signed in", "Sign in during deploy, or run: vercel login");
  }
  return check("Vercel CLI", "pass", `signed in as ${who.stdout.trim()}`);
}

function checkNpmPrefix(): CheckResult {
  // The WSL / restricted-prefix problem: `npm install -g` succeeds but the
  // resulting binaries can't be executed. Detect by checking write+execute
  // perms on the npm bin dir.
  const prefix = exec("npm config get prefix").stdout.trim();
  if (!prefix) return check("npm global prefix", "warn", "unknown", "Could not read npm config");
  const binDir = process.platform === "win32" ? prefix : join(prefix, "bin");
  if (!existsSync(binDir)) {
    return check("npm global prefix", "warn", `${binDir} does not exist yet`, "First `npm install -g` will create it");
  }
  try {
    accessSync(binDir, constants.W_OK | constants.X_OK);
    return check("npm global prefix", "pass", binDir);
  } catch {
    return check(
      "npm global prefix",
      "warn",
      `${binDir} not writable by you`,
      "Set a user-owned prefix: npm config set prefix ~/.npm-global  (then add ~/.npm-global/bin to PATH)",
    );
  }
}

async function checkNetwork(): Promise<CheckResult> {
  try {
    const ac = new AbortController();
    const timeout = setTimeout(() => ac.abort(), 5000);
    const res = await fetch("https://api.whop.com/api/v1/apps?per_page=1", {
      signal: ac.signal,
      headers: { "User-Agent": "whop-kit-doctor" },
    });
    clearTimeout(timeout);
    // 401 is the *expected* response without a key — confirms reachability.
    if (res.status === 401 || res.ok) return check("Whop API reachable", "pass", `HTTP ${res.status}`);
    return check("Whop API reachable", "warn", `HTTP ${res.status}`);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return check("Whop API reachable", "fail", msg, "Check your network / proxy / firewall");
  }
}

function checkManifest(): CheckResult | null {
  const manifest = readManifest(".");
  if (!manifest) return null;
  return check("Project manifest", "pass", `${manifest.framework} / ${manifest.appType} / ${manifest.database}`);
}

function checkEnvFile(): CheckResult | null {
  const manifest = readManifest(".");
  if (!manifest) return null;

  const envPath = join(".", ".env.local");
  if (!existsSync(envPath)) {
    return check(".env.local", "warn", "missing", "Created automatically by scaffold; copy from .env.example if missing");
  }

  const content = readFileSync(envPath, "utf-8");
  const required = [
    "DATABASE_URL",
    manifest.framework === "nextjs" ? "NEXT_PUBLIC_WHOP_APP_ID" : "WHOP_APP_ID",
    "WHOP_API_KEY",
    "WHOP_WEBHOOK_SECRET",
  ];
  const missing = required.filter((k) => !new RegExp(`^${k}=.+`, "m").test(content));
  if (missing.length === 0) return check(".env.local", "pass", "all required vars set");
  return check(
    ".env.local",
    "warn",
    `missing: ${missing.join(", ")}`,
    "Run `whop-kit deploy` to populate, or set them manually",
  );
}

// ---------------------------------------------------------------------------
// Renderer
// ---------------------------------------------------------------------------

function icon(status: Status): string {
  if (status === "pass") return pc.green("✓");
  if (status === "warn") return pc.yellow("⚠");
  return pc.red("✗");
}

function render(results: CheckResult[]): void {
  const nameW = Math.max(...results.map((r) => r.name.length));
  for (const r of results) {
    const detail = r.detail ? pc.dim(r.detail) : "";
    console.log(`  ${icon(r.status)} ${r.name.padEnd(nameW)}  ${detail}`);
    if (r.status !== "pass" && r.fix) {
      console.log(`    ${pc.dim("→ " + r.fix)}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export default defineCommand({
  meta: {
    name: "doctor",
    description: "Run preflight checks and show diagnostics",
  },
  async run() {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit doctor "))} Diagnostics`);

    const s = p.spinner();
    s.start("Running checks...");

    const results: CheckResult[] = [
      checkNode(),
      checkGit(),
      checkNpmPrefix(),
      checkGh(),
      checkVercel(),
      await checkNetwork(),
    ];

    const projectChecks = [checkManifest(), checkEnvFile()].filter(
      (r): r is CheckResult => r !== null,
    );

    s.stop("Checks complete");
    console.log("");

    console.log(`  ${pc.bold("Environment")}`);
    render(results);

    if (projectChecks.length > 0) {
      console.log("");
      console.log(`  ${pc.bold("Project")}`);
      render(projectChecks);
    }

    console.log("");

    const all = [...results, ...projectChecks];
    const fails = all.filter((r) => r.status === "fail").length;
    const warns = all.filter((r) => r.status === "warn").length;

    if (fails > 0) {
      p.outro(`${pc.red(`${fails} fail`)}, ${warns} warn — fix the ${pc.red("✗")} items above first.`);
      process.exit(1);
    }
    if (warns > 0) {
      p.outro(`${pc.green("All required checks pass")} — ${warns} warning(s) above are non-blocking.`);
    } else {
      p.outro(pc.green("All checks pass — you're good to go."));
    }
  },
});
