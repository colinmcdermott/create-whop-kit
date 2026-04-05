import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive, hasCommand } from "../utils/exec.js";

export function isGhInstalled(): boolean {
  return hasCommand("gh");
}

export function isGhAuthenticated(): boolean {
  const result = exec("gh auth status");
  return result.success;
}

export async function installGh(): Promise<boolean> {
  const s = p.spinner();
  s.start("Installing GitHub CLI...");

  // Try npm first (works everywhere)
  const result = exec("npm install -g gh", undefined, 60_000);
  if (result.success && hasCommand("gh")) {
    s.stop("GitHub CLI installed");
    return true;
  }

  s.stop("Could not auto-install GitHub CLI");
  p.log.info("Install manually:");
  p.log.info(pc.bold("  https://cli.github.com"));
  return false;
}

export async function ghLogin(): Promise<boolean> {
  p.log.info("You'll be redirected to GitHub to sign in.");
  console.log("");
  const ok = execInteractive("gh auth login --web");
  console.log("");
  return ok;
}

/**
 * Create a private GitHub repo from the current project directory and push.
 * Returns the repo URL (e.g. "https://github.com/user/my-app").
 */
export async function createGitHubRepo(
  projectDir: string,
  projectName: string,
): Promise<string | null> {
  const s = p.spinner();
  s.start("Creating private GitHub repository...");

  const result = exec(
    `gh repo create ${projectName} --private --source=. --push`,
    projectDir,
    60_000,
  );

  if (!result.success) {
    // Might fail if repo already exists — try just pushing
    s.stop("Could not create repo");
    const stderr = result.stderr || result.stdout;
    if (stderr.includes("already exists")) {
      p.log.warning(`Repository "${projectName}" already exists on GitHub.`);
      // Try to set remote and push
      exec(`git remote add origin https://github.com/$(gh api user --jq .login)/${projectName}.git`, projectDir);
      const pushResult = exec("git push -u origin main", projectDir, 30_000);
      if (pushResult.success) {
        const remote = exec("gh repo view --json url --jq .url", projectDir);
        return remote.success ? remote.stdout.trim() : null;
      }
    }
    return null;
  }

  // Get the repo URL
  const repoUrl = exec("gh repo view --json url --jq .url", projectDir);
  if (repoUrl.success) {
    s.stop(`GitHub repo created: ${pc.cyan(repoUrl.stdout.trim())}`);
    return repoUrl.stdout.trim();
  }

  s.stop("GitHub repo created");
  return `https://github.com/${projectName}`;
}

/**
 * Get the GitHub repo URL for the current project.
 */
export function getGitHubRepoUrl(projectDir: string): string | null {
  const result = exec("gh repo view --json url --jq .url", projectDir);
  return result.success ? result.stdout.trim() : null;
}
