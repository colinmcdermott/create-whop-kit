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
 *
 * Uses a two-step approach: create repo first (without --push), then push
 * separately. This avoids the GitHub propagation delay that causes
 * `--push` to fail with "Repository not found" even though the repo exists.
 */
export async function createGitHubRepo(
  projectDir: string,
  projectName: string,
): Promise<string | null> {
  let s = p.spinner();
  s.start("Creating private GitHub repository...");

  // Step 1: Create the repo (without pushing — avoids propagation delay issues)
  const createResult = exec(
    `gh repo create ${projectName} --private --source=.`,
    projectDir,
    60_000,
  );

  if (!createResult.success) {
    const stderr = createResult.stderr || createResult.stdout;
    if (stderr.includes("already exists")) {
      s.stop(`Repository "${projectName}" already exists`);
      // Set remote if not already set
      exec(`git remote add origin https://github.com/$(gh api user --jq .login)/${projectName}.git`, projectDir);
    } else {
      s.stop("Could not create GitHub repo");
      if (stderr) p.log.error(pc.dim(stderr.substring(0, 200)));
      return null;
    }
  } else {
    s.stop("GitHub repo created");
  }

  // Step 2: Push code (retry once if GitHub hasn't propagated yet)
  s = p.spinner();
  s.start("Pushing code to GitHub...");

  let pushOk = exec("git push -u origin main", projectDir, 30_000).success;
  if (!pushOk) {
    // GitHub can take a moment to propagate — wait 3 seconds and retry
    s.stop("Push failed, retrying...");
    await new Promise((r) => setTimeout(r, 3000));
    s = p.spinner();
    s.start("Retrying push...");
    pushOk = exec("git push -u origin main", projectDir, 30_000).success;
  }

  if (!pushOk) {
    s.stop("Could not push (push manually with: git push -u origin main)");
  } else {
    s.stop("Code pushed to GitHub");
  }

  // Get the repo URL
  const repoUrl = exec("gh repo view --json url --jq .url", projectDir);
  if (repoUrl.success && repoUrl.stdout.trim()) {
    return repoUrl.stdout.trim();
  }

  return `https://github.com/${projectName}`;
}

/**
 * Get the GitHub repo URL for the current project.
 */
export function getGitHubRepoUrl(projectDir: string): string | null {
  const result = exec("gh repo view --json url --jq .url", projectDir);
  return result.success ? result.stdout.trim() : null;
}

/**
 * Get the list of GitHub orgs the user belongs to.
 */
export function getGitHubOrgs(): string[] {
  const result = exec("gh api user/orgs --jq '.[].login'");
  if (!result.success || !result.stdout.trim()) return [];
  return result.stdout.trim().split("\n").filter(Boolean);
}
