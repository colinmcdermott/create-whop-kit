import * as p from "@clack/prompts";
import pc from "picocolors";
import { exec, hasCommand } from "../utils/exec.js";
import type { DbProvider, ProvisionResult } from "./types.js";

export const supabaseProvider: DbProvider = {
  name: "Supabase",
  description: "Open-source Firebase alternative with Postgres",

  isInstalled() {
    return hasCommand("supabase");
  },

  async install() {
    const s = p.spinner();

    // Try npx first (works everywhere)
    s.start("Checking Supabase CLI...");

    // Supabase doesn't support global npm install — use npx or brew
    if (hasCommand("brew")) {
      s.message("Installing via Homebrew...");
      const result = exec("brew install supabase/tap/supabase");
      if (result.success) {
        s.stop("Supabase CLI installed");
        return true;
      }
    }

    s.stop("Supabase CLI not found");
    p.log.info("Install the Supabase CLI:");
    p.log.info(pc.bold("  brew install supabase/tap/supabase"));
    p.log.info(pc.dim("  or use npx supabase <command>"));

    const useNpx = await p.confirm({
      message: "Continue with npx supabase? (slower but works without install)",
      initialValue: true,
    });
    if (p.isCancel(useNpx) || !useNpx) return false;

    return true; // Will use npx
  },

  async provision(projectName) {
    const cli = hasCommand("supabase") ? "supabase" : "npx supabase";

    // Check auth
    const projectsList = exec(`${cli} projects list`);
    if (!projectsList.success) {
      p.log.info("You need to authenticate with Supabase.");
      p.log.info(`Running ${pc.bold(`${cli} login`)} — this will open your browser.`);

      const authResult = exec(`${cli} login`);
      if (!authResult.success) {
        p.log.error("Supabase authentication failed. Try:");
        p.log.info(pc.bold(`  ${cli} login`));
        return null;
      }
    }

    // Get org ID
    const orgsResult = exec(`${cli} orgs list`);
    let orgId = "";

    if (orgsResult.success && orgsResult.stdout) {
      // Parse org list — format varies, try to extract first org ID
      const lines = orgsResult.stdout.split("\n").filter(l => l.trim());
      if (lines.length > 1) {
        // Multiple orgs — ask user
        const orgInput = await p.text({
          message: "Supabase Organization ID",
          placeholder: "Find in dashboard: supabase.com/dashboard",
          validate: (v) => (!v ? "Required" : undefined),
        });
        if (p.isCancel(orgInput)) return null;
        orgId = orgInput;
      }
    }

    // Generate a random password
    const password = Array.from(crypto.getRandomValues(new Uint8Array(16)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    const s = p.spinner();
    s.start(`Creating Supabase project "${projectName}"...`);

    const createCmd = orgId
      ? `${cli} projects create "${projectName}" --org-id "${orgId}" --db-password "${password}" --region us-east-1`
      : `${cli} projects create "${projectName}" --db-password "${password}" --region us-east-1`;

    const createResult = exec(createCmd);
    if (!createResult.success) {
      s.stop("Failed to create Supabase project");
      p.log.error("Create manually at: https://supabase.com/dashboard");
      return null;
    }

    s.stop("Supabase project created");

    // Supabase CLI can't retrieve the connection string — guide the user
    p.log.info("");
    p.log.info(pc.bold("Get your connection string:"));
    p.log.info("  1. Go to https://supabase.com/dashboard");
    p.log.info("  2. Select your new project");
    p.log.info('  3. Click "Connect" → "Session pooler"');
    p.log.info("  4. Copy the connection string");
    p.log.info("");

    const connString = await p.text({
      message: "Paste your Supabase connection string",
      placeholder: "postgresql://postgres.[ref]:[password]@...",
      validate: (v) => {
        if (!v) return "Required";
        if (!v.startsWith("postgres")) return "Must be a PostgreSQL connection string";
      },
    });
    if (p.isCancel(connString)) return null;

    return {
      connectionString: connString,
      provider: "supabase",
    } satisfies ProvisionResult;
  },
};
