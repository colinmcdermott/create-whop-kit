import * as p from "@clack/prompts";
import pc from "picocolors";
import { setupPlans, planResultToEnvVars } from "../deploy/plans.js";
import { validateApiKey, getCompanyId } from "../deploy/whop-api.js";
import { appendEnvVar } from "./helpers.js";
import { readManifest } from "../scaffolding/manifest.js";
import { resolveWhopEnvironment } from "../whop-env.js";
import type { Feature } from "../commands/add.js";

export const plansFeature: Feature = {
  name: "Pricing Plans",
  description: "Create subscription plans on Whop (products + pricing)",
  configKey: "plans",

  async run(projectDir: string) {
    const manifest = readManifest(projectDir);
    // Sandbox projects must create plans on the sandbox API
    const environment = resolveWhopEnvironment(manifest?.environment);
    if (environment === "sandbox") {
      p.log.info(pc.yellow("Sandbox project — use a Company API key from sandbox.whop.com."));
    }

    // Need a Company API key
    const apiKeyResult = await p.text({
      message: "Your Whop Company API key",
      placeholder: "apik_...",
      validate: (v) => (!v ? "Required" : undefined),
    });
    if (p.isCancel(apiKeyResult)) return;
    const apiKey = apiKeyResult;

    const s = p.spinner();
    s.start("Validating...");
    const valid = await validateApiKey(apiKey, environment);
    if (!valid) {
      s.stop("Invalid API key");
      return;
    }
    s.stop("API key valid");

    const companyId = await getCompanyId(apiKey, environment);
    if (!companyId) return;

    const result = await setupPlans(apiKey, companyId, environment);
    if (!result) return;

    // Write plan IDs to .env.local (env var prefix depends on framework)
    const envVars = planResultToEnvVars(result, manifest?.framework ?? "nextjs");
    for (const [key, value] of Object.entries(envVars)) {
      appendEnvVar(projectDir, key, value);
    }

    p.log.success("Plan IDs written to .env.local");
    p.log.info(pc.dim("Push to Vercel with: vercel env pull && vercel deploy --prod"));
  },
};
