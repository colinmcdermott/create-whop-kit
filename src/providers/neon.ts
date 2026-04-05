import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, execInteractive, hasCommand } from "../utils/exec.js";
import type { DbProvider, ProvisionResult } from "./types.js";

export const neonProvider: DbProvider = {
  name: "Neon",
  description: "Serverless Postgres — free tier, scales to zero",

  isInstalled() {
    return hasCommand("neonctl") || hasCommand("neon");
  },

  async install() {
    const s = p.spinner();
    s.start("Installing neonctl...");
    const result = exec("npm install -g neonctl");
    if (result.success) {
      s.stop("neonctl installed");
      return true;
    }
    s.stop("Failed to install neonctl");
    p.log.error(`Install manually: ${pc.bold("npm install -g neonctl")}`);
    return false;
  },

  async provision(projectName) {
    const cli = hasCommand("neonctl") ? "neonctl" : "neon";

    // Check auth — use piped exec to test silently
    const whoami = exec(`${cli} me --output json`);
    if (!whoami.success) {
      p.log.info("You need to authenticate with Neon. This will open your browser.");
      console.log(""); // spacing before neonctl output

      // Use interactive so the browser auth flow works
      const authOk = execInteractive(`${cli} auth`);
      if (!authOk) {
        p.log.error("Neon authentication failed. Try running manually:");
        p.log.info(pc.bold(`  ${cli} auth`));
        return null;
      }
      console.log(""); // spacing after
    }

    // Create project — use interactive so org selection prompt works
    p.log.info(`Creating Neon project "${projectName}"...`);
    console.log(""); // spacing before neonctl output

    const createOk = execInteractive(
      `${cli} projects create --name "${projectName}" --set-context`,
    );

    if (!createOk) {
      p.log.error("Failed to create Neon project. Try manually at https://console.neon.tech");
      return null;
    }

    console.log(""); // spacing after
    p.log.success("Neon project created");

    // Get connection string — --set-context means the project is now the default
    // Try with --prisma flag for Prisma-compatible format
    let connString = "";

    // Method 1: use the context that --set-context just set
    const connResult = exec(`${cli} connection-string --prisma --output json`);
    if (connResult.success) {
      // Output might be JSON or raw string
      try {
        const parsed = JSON.parse(connResult.stdout);
        connString = parsed.connection_string || parsed.connectionString || connResult.stdout;
      } catch {
        // Raw string output
        connString = connResult.stdout.trim();
      }
    }

    // Method 2: if that failed, try without --output json
    if (!connString) {
      const fallback = exec(`${cli} connection-string --prisma`);
      if (fallback.success && fallback.stdout.startsWith("postgres")) {
        connString = fallback.stdout.trim();
      }
    }

    // Method 3: try without --prisma
    if (!connString) {
      const raw = exec(`${cli} connection-string`);
      if (raw.success && raw.stdout.startsWith("postgres")) {
        connString = raw.stdout.trim();
      }
    }

    // Method 4: interactive fallback — let the user see the output and paste
    if (!connString) {
      p.log.warning("Could not extract connection string automatically.");
      console.log("");
      execInteractive(`${cli} connection-string`);
      console.log("");

      const manual = await p.text({
        message: "Paste the connection string shown above",
        placeholder: "postgresql://...",
        validate: (v) => {
          if (!v?.startsWith("postgres")) return "Must be a PostgreSQL connection string";
        },
      });
      if (p.isCancel(manual)) return null;
      connString = manual;
    }

    if (!connString) {
      p.log.error("Could not get connection string. Get it from: https://console.neon.tech");
      return null;
    }

    return {
      connectionString: connString,
      provider: "neon",
    } satisfies ProvisionResult;
  },
};
