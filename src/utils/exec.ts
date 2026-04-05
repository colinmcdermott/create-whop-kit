import { execSync } from "node:child_process";

export interface ExecResult {
  stdout: string;
  success: boolean;
}

export function exec(cmd: string, cwd?: string): ExecResult {
  try {
    const stdout = execSync(cmd, {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
      timeout: 120_000,
    }).trim();
    return { stdout, success: true };
  } catch {
    return { stdout: "", success: false };
  }
}

/**
 * Run a command with stdio: "inherit" so the user can interact with it
 * (e.g. Neon org selection, Supabase login browser flow).
 */
export function execInteractive(cmd: string, cwd?: string): boolean {
  try {
    execSync(cmd, { cwd, stdio: "inherit", timeout: 300_000 });
    return true;
  } catch {
    return false;
  }
}

export function hasCommand(cmd: string): boolean {
  return exec(`which ${cmd}`).success;
}

export function detectPackageManager(): "pnpm" | "yarn" | "bun" | "npm" {
  if (hasCommand("pnpm")) return "pnpm";
  if (hasCommand("yarn")) return "yarn";
  if (hasCommand("bun")) return "bun";
  return "npm";
}
