import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Append or update an env var in .env.local.
 * If the key exists, update it. If not, append it.
 */
export function appendEnvVar(projectDir: string, key: string, value: string): void {
  const envPath = join(projectDir, ".env.local");

  if (!existsSync(envPath)) {
    writeFileSync(envPath, `${key}="${value}"\n`);
    return;
  }

  let content = readFileSync(envPath, "utf-8");
  const pattern = new RegExp(`^(#\\s*)?${key}=.*$`, "m");

  if (pattern.test(content)) {
    content = content.replace(pattern, `${key}="${value}"`);
  } else {
    content = content.trimEnd() + `\n${key}="${value}"\n`;
  }

  writeFileSync(envPath, content);
}
