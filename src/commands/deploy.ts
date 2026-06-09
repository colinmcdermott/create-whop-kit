import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { readManifest } from "../scaffolding/manifest.js";
import { runDeployPipeline } from "../deploy/index.js";
import { resolveWhopEnvironment } from "../whop-env.js";
import { validateProjectName } from "../utils/checks.js";
import { basename } from "node:path";

export default defineCommand({
  meta: {
    name: "deploy",
    description: "Deploy your project to Vercel and connect to Whop",
  },
  args: {
    "whop-company-key": {
      type: "string",
      description: "Whop Company API key (skips interactive prompt)",
    },
    "skip-whop": {
      type: "boolean",
      description: "Deploy without Whop configuration",
      default: false,
    },
  },
  async run({ args }) {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit deploy "))}`);

    const manifest = readManifest(".");
    if (!manifest) {
      p.log.error("No .whop/config.json found. Are you in a whop-kit project?");
      process.exit(1);
    }

    // The directory name becomes the GitHub repo name and reaches shell
    // commands — apply the same charset validation as init, and ask for a
    // safe name when the directory name doesn't qualify.
    let projectName = basename(process.cwd());
    if (validateProjectName(projectName)) {
      const result = await p.text({
        message: "Repo/project name (directory name contains unsupported characters)",
        placeholder: "my-app",
        validate: (v) => validateProjectName(v ?? ""),
      });
      if (p.isCancel(result)) { p.cancel("Cancelled."); process.exit(0); }
      projectName = result;
    }

    const result = await runDeployPipeline({
      projectDir: ".",
      projectName,
      framework: manifest.framework,
      whopCompanyKey: args["whop-company-key"],
      environment: resolveWhopEnvironment(manifest.environment),
    });

    if (result) {
      let summary = `${pc.green("✓")} Live at ${pc.cyan(result.productionUrl)}\n`;
      if (result.whopAppId) summary += `${pc.green("✓")} Whop app: ${result.whopAppId}\n`;
      if (result.webhookSecret) summary += `${pc.green("✓")} Webhook configured\n`;
      p.note(summary, "Deployment complete");
    }

    p.outro("Done");
  },
});
