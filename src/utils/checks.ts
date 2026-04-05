import * as p from "@clack/prompts";
import pc from "picocolors";
import { hasCommand } from "./exec.js";

export function checkNodeVersion(minimum = 18): void {
  const major = parseInt(process.versions.node.split(".")[0], 10);
  if (major < minimum) {
    p.log.error(
      `Node.js ${pc.bold(`v${minimum}+`)} is required. You have ${pc.bold(`v${process.versions.node}`)}.`,
    );
    process.exit(1);
  }
}

export function checkGit(): void {
  if (!hasCommand("git")) {
    p.log.error(
      `${pc.bold("git")} is required but not found. Install it from ${pc.cyan("https://git-scm.com")}`,
    );
    process.exit(1);
  }
}

export function validateDatabaseUrl(url: string): string | undefined {
  if (!url.startsWith("postgres://") && !url.startsWith("postgresql://")) {
    return "Must be a PostgreSQL connection string (starts with postgres:// or postgresql://)";
  }
  return undefined;
}

export function validateWhopAppId(id: string): string | undefined {
  if (id && !id.startsWith("app_")) {
    return 'Whop App IDs start with "app_"';
  }
  return undefined;
}
