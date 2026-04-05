import { existsSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { join, basename } from "node:path";
import { exec } from "../utils/exec.js";

export function cloneTemplate(repo: string, projectDir: string): boolean {
  const result = exec(
    `git clone --depth 1 https://github.com/${repo}.git "${projectDir}"`,
  );

  if (!result.success || !existsSync(projectDir)) {
    return false;
  }

  // Remove .git so it's a fresh project
  const gitDir = join(projectDir, ".git");
  if (existsSync(gitDir)) {
    rmSync(gitDir, { recursive: true, force: true });
  }

  return true;
}

export function updatePackageName(projectDir: string, name: string): void {
  const pkgPath = join(projectDir, "package.json");
  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
    pkg.name = basename(name);
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  }
}

export function initGit(projectDir: string): void {
  exec("git init", projectDir);
  exec("git branch -m main", projectDir);
  exec("git add -A", projectDir);
  exec('git commit -m "initial: scaffolded with create-whop-kit"', projectDir);
}
