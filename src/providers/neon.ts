import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, hasCommand } from "../utils/exec.js";
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

    // Check auth
    const whoami = exec(`${cli} me`);
    if (!whoami.success) {
      p.log.info("You need to authenticate with Neon.");
      p.log.info(`Running ${pc.bold(`${cli} auth`)} — this will open your browser.`);

      const authResult = exec(`${cli} auth`);
      if (!authResult.success) {
        p.log.error("Neon authentication failed. Try running manually:");
        p.log.info(pc.bold(`  ${cli} auth`));
        return null;
      }
    }

    // Create project
    const s = p.spinner();
    s.start(`Creating Neon project "${projectName}"...`);

    const createResult = exec(
      `${cli} projects create --name "${projectName}" --set-context --output json`,
    );

    if (!createResult.success) {
      s.stop("Failed to create Neon project");
      p.log.error("Try creating manually at https://console.neon.tech");
      return null;
    }

    s.stop("Neon project created");

    // Get connection string
    s.start("Getting connection string...");
    const connResult = exec(`${cli} connection-string --prisma`);

    if (!connResult.success) {
      s.stop("Could not retrieve connection string");
      p.log.error("Get it from: https://console.neon.tech");
      return null;
    }

    s.stop("Connection string retrieved");

    return {
      connectionString: connResult.stdout,
      provider: "neon",
    } satisfies ProvisionResult;
  },
};
