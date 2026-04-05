import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { readManifest } from "../scaffolding/manifest.js";

function parseEnvFile(projectDir: string): Record<string, string> {
  // Try .env.local first, then .env
  for (const name of [".env.local", ".env"]) {
    const path = join(projectDir, name);
    if (existsSync(path)) {
      const content = readFileSync(path, "utf-8");
      const vars: Record<string, string> = {};
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*)["']?$/);
        if (match) vars[match[1]] = match[2].replace(/["']$/, "");
      }
      return vars;
    }
  }
  return {};
}

function maskValue(value: string): string {
  if (value.length <= 8) return "****";
  return value.substring(0, 8) + "..." + "*".repeat(4);
}

export default defineCommand({
  meta: {
    name: "env",
    description: "View environment variables (masked by default)",
  },
  args: {
    reveal: {
      type: "boolean",
      description: "Show actual values instead of masked",
      default: false,
    },
  },
  async run({ args }) {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit env "))}`);

    const manifest = readManifest(".");
    if (!manifest) {
      p.log.error("No .whop/config.json found. Are you in a whop-kit project?");
      process.exit(1);
    }

    const vars = parseEnvFile(".");

    if (Object.keys(vars).length === 0) {
      p.log.warning("No environment variables found. Create .env.local with your configuration.");
      p.outro("");
      return;
    }

    if (args.reveal) {
      p.log.warning("Revealing secret values:");
      console.log("");
    }

    for (const [key, value] of Object.entries(vars)) {
      const displayValue = args.reveal ? pc.cyan(value) : pc.dim(maskValue(value));
      console.log(`  ${pc.bold(key.padEnd(40))} ${displayValue}`);
    }

    console.log("");
    if (!args.reveal) {
      p.log.info(`Use ${pc.bold("whop-kit env --reveal")} to show actual values`);
    }
    p.outro("");
  },
});
