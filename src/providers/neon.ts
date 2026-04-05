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

    // ── Auth ──────────────────────────────────────────────────────
    p.log.step("Neon: checking authentication...");
    const whoami = exec(`${cli} me --output json`);
    if (!whoami.success) {
      p.log.info("Opening browser for Neon authentication...");
      console.log("");
      const authOk = execInteractive(`${cli} auth`);
      if (!authOk) {
        p.log.error("Authentication failed. Run manually: " + pc.bold(`${cli} auth`));
        return null;
      }
      console.log("");
    }

    // ── Create project (interactive for org selection) ────────────
    p.log.step(`Neon: creating project "${projectName}"...`);
    console.log("");
    const createOk = execInteractive(
      `${cli} projects create --name "${projectName}" --set-context`,
    );
    console.log("");

    if (!createOk) {
      p.log.error("Failed to create project. Try: https://console.neon.tech");
      return null;
    }

    // ── Get connection string ─────────────────────────────────────
    // The --set-context flag means the project is now the default.
    // Give Neon a moment for the endpoint to be ready, then query.
    p.log.step("Neon: getting connection string...");

    let connString = "";

    // Try multiple approaches with 30s timeout (endpoints can take a few seconds)
    for (const flags of ["--prisma", ""]) {
      if (connString) break;
      const result = exec(`${cli} connection-string ${flags}`.trim(), undefined, 30_000);
      if (result.success && result.stdout.startsWith("postgres")) {
        connString = result.stdout.trim();
      }
    }

    // Fallback: ask user to paste (the create output already showed the URI)
    if (!connString) {
      p.log.warning("Could not retrieve connection string automatically.");
      p.log.info("The connection URI was shown in the table above.");

      const manual = await p.text({
        message: "Paste the connection string from the output above",
        placeholder: "postgresql://...",
        validate: (v) => {
          if (!v?.startsWith("postgres")) return "Must start with postgresql://";
        },
      });
      if (p.isCancel(manual)) return null;
      connString = manual;
    }

    return {
      connectionString: connString,
      provider: "neon",
    } satisfies ProvisionResult;
  },
};
