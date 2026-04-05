import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { readManifest } from "../scaffolding/manifest.js";

interface EnvCheck {
  key: string;
  label: string;
  required: boolean;
}

const ENV_CHECKS: EnvCheck[] = [
  { key: "DATABASE_URL", label: "Database", required: true },
  { key: "NEXT_PUBLIC_WHOP_APP_ID", label: "Whop App ID", required: true },
  { key: "WHOP_API_KEY", label: "Whop API Key", required: true },
  { key: "WHOP_WEBHOOK_SECRET", label: "Webhook Secret", required: true },
  { key: "EMAIL_PROVIDER", label: "Email Provider", required: false },
  { key: "EMAIL_API_KEY", label: "Email API Key", required: false },
  { key: "ANALYTICS_PROVIDER", label: "Analytics Provider", required: false },
  { key: "ANALYTICS_ID", label: "Analytics ID", required: false },
];

function readEnvFile(projectDir: string): Record<string, string> {
  const envPath = join(projectDir, ".env.local");
  if (!existsSync(envPath)) return {};

  const content = readFileSync(envPath, "utf-8");
  const vars: Record<string, string> = {};

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const match = trimmed.match(/^([A-Z_][A-Z0-9_]*)=["']?(.*)["']?$/);
    if (match) {
      vars[match[1]] = match[2].replace(/["']$/, "");
    }
  }

  return vars;
}

export default defineCommand({
  meta: {
    name: "status",
    description: "Show your project's configuration status",
  },
  async run() {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit status "))} Project health`);

    const manifest = readManifest(".");
    if (!manifest) {
      p.log.error(
        "No .whop/config.json found. Are you in a project created with create-whop-kit?",
      );
      process.exit(1);
    }

    const envVars = readEnvFile(".");

    // Also check for Astro-style env vars
    if (!envVars["NEXT_PUBLIC_WHOP_APP_ID"] && envVars["WHOP_APP_ID"]) {
      envVars["NEXT_PUBLIC_WHOP_APP_ID"] = envVars["WHOP_APP_ID"];
    }

    // Project info
    console.log(`  ${pc.bold("Framework:")}  ${manifest.framework}`);
    console.log(`  ${pc.bold("App type:")}   ${manifest.appType}`);
    console.log(`  ${pc.bold("Database:")}   ${manifest.database}`);
    console.log(`  ${pc.bold("Created:")}    ${new Date(manifest.createdAt).toLocaleDateString()}`);
    console.log("");

    // Configuration status
    console.log(`  ${pc.bold("Configuration:")}`);
    let allRequired = true;

    for (const check of ENV_CHECKS) {
      const value = envVars[check.key];
      const isSet = !!value;

      if (check.required && !isSet) allRequired = false;

      const icon = isSet
        ? pc.green("✓")
        : check.required
          ? pc.red("✗")
          : pc.yellow("○");

      const maskedValue = isSet
        ? pc.dim(value.substring(0, 8) + "...")
        : check.required
          ? pc.red("not set")
          : pc.dim("not set (optional)");

      console.log(`    ${icon} ${check.label.padEnd(20)} ${maskedValue}`);
    }

    console.log("");

    // Features
    if (manifest.features.length > 0) {
      console.log(`  ${pc.bold("Features:")} ${manifest.features.join(", ")}`);
    }

    // Overall status
    if (allRequired) {
      p.outro(pc.green("All required configuration is set. Ready to run!"));
    } else {
      p.outro(
        `${pc.yellow("Some required config is missing.")} Run ${pc.bold("whop-kit add")} or edit ${pc.dim(".env.local")}`,
      );
    }
  },
});
