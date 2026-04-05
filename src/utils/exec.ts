import { execSync } from "node:child_process";

export interface ExecResult {
  stdout: string;
  stderr: string;
  success: boolean;
}

export function exec(cmd: string, cwd?: string, timeoutMs = 120_000): ExecResult {
  try {
    const stdout = execSync(cmd, {
      cwd,
      stdio: "pipe",
      encoding: "utf-8",
      timeout: timeoutMs,
    }).trim();
    return { stdout, stderr: "", success: true };
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string; stdout?: Buffer | string };
    return {
      stdout: e.stdout?.toString?.().trim() ?? "",
      stderr: e.stderr?.toString?.().trim() ?? "",
      success: false,
    };
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

/**
 * Run a command and pipe input to stdin.
 * Used for `vercel env add` which reads the value from stdin.
 */
export function execWithStdin(cmd: string, input: string, cwd?: string): ExecResult {
  try {
    const stdout = execSync(cmd, {
      cwd,
      input,
      stdio: ["pipe", "pipe", "pipe"],
      encoding: "utf-8",
      timeout: 120_000,
    }).trim();
    return { stdout, stderr: "", success: true };
  } catch (err: unknown) {
    const e = err as { stderr?: Buffer | string };
    return { stdout: "", stderr: e.stderr?.toString?.().trim() ?? "", success: false };
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
