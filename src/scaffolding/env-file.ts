import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export interface EnvValues {
  DATABASE_URL?: string;
  NEXT_PUBLIC_WHOP_APP_ID?: string;
  WHOP_APP_ID?: string; // Astro uses this (no NEXT_PUBLIC prefix)
  WHOP_API_KEY?: string;
  WHOP_WEBHOOK_SECRET?: string;
  NEXT_PUBLIC_APP_URL?: string;
  [key: string]: string | undefined;
}

/**
 * Read the template's .env.example and fill in user-provided values.
 * If no .env.example exists, generates a minimal .env.local from the values.
 */
export function writeEnvFile(projectDir: string, values: EnvValues): void {
  const examplePath = join(projectDir, ".env.example");
  const envPath = join(projectDir, ".env.local");

  // Filter out empty/undefined values
  const filled = Object.fromEntries(
    Object.entries(values).filter(([, v]) => v),
  ) as Record<string, string>;

  if (existsSync(examplePath)) {
    // Read .env.example and replace placeholder values
    let content = readFileSync(examplePath, "utf-8");

    for (const [key, value] of Object.entries(filled)) {
      // Match: KEY="placeholder" or KEY=placeholder or # KEY="placeholder"
      const pattern = new RegExp(
        `^(#\\s*)?${escapeRegex(key)}=.*$`,
        "m",
      );
      if (pattern.test(content)) {
        content = content.replace(pattern, `${key}="${value}"`);
      }
    }

    writeFileSync(envPath, content);
  } else {
    // No .env.example — write a minimal .env.local
    const lines = Object.entries(filled).map(
      ([key, value]) => `${key}="${value}"`,
    );
    writeFileSync(envPath, lines.join("\n") + "\n");
  }
}

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
