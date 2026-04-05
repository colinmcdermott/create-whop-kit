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

export function hasCommand(cmd: string): boolean {
  return exec(`which ${cmd}`).success;
}

export function detectPackageManager(): "pnpm" | "yarn" | "bun" | "npm" {
  if (hasCommand("pnpm")) return "pnpm";
  if (hasCommand("yarn")) return "yarn";
  if (hasCommand("bun")) return "bun";
  return "npm";
}
