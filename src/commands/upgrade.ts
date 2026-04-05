import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { exec, detectPackageManager } from "../utils/exec.js";
import { readManifest } from "../scaffolding/manifest.js";

export default defineCommand({
  meta: {
    name: "upgrade",
    description: "Update whop-kit to the latest version in your project",
  },
  async run() {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit upgrade "))}`);

    const manifest = readManifest(".");
    if (!manifest) {
      p.log.error("No .whop/config.json found. Are you in a whop-kit project?");
      process.exit(1);
    }

    const pm = detectPackageManager();
    const s = p.spinner();

    s.start("Checking for updates...");
    const latest = exec("npm view whop-kit version");
    s.stop(latest.success ? `Latest: whop-kit@${latest.stdout}` : "Could not check latest version");

    s.start(`Upgrading whop-kit with ${pm}...`);
    const cmd = pm === "npm"
      ? "npm install whop-kit@latest"
      : pm === "yarn"
        ? "yarn add whop-kit@latest"
        : pm === "bun"
          ? "bun add whop-kit@latest"
          : "pnpm add whop-kit@latest";

    const result = exec(cmd);
    if (result.success) {
      s.stop(pc.green("whop-kit upgraded"));
    } else {
      s.stop(pc.red("Upgrade failed"));
      p.log.error("Try running manually: " + pc.bold(cmd));
    }

    p.outro("Done");
  },
});
