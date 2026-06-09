import * as p from "@clack/prompts";
import pc from "picocolors";
import { hasCommand } from "./exec.js";

export function checkNodeVersion(minimum = 20): void {
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

// Project names end up in shell commands (git, gh, provider CLIs) and
// package.json — restrict to a safe charset rather than relying on quoting.
const PROJECT_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

export function validateProjectName(name: string): string | undefined {
  if (!name) return "Project name is required";
  if (!PROJECT_NAME_RE.test(name)) {
    return "Use only letters, numbers, dots, dashes, and underscores (must start with a letter or number)";
  }
  if (name.length > 100) return "Project name is too long";
  return undefined;
}
