import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { readManifest, addFeatureToManifest } from "../scaffolding/manifest.js";
import { emailFeature } from "../features/email.js";
import { analyticsFeature } from "../features/analytics.js";
import { webhookEventFeature } from "../features/webhook-event.js";

export interface Feature {
  name: string;
  description: string;
  configKey: string; // used in manifest features list
  run: (projectDir: string) => Promise<void>;
}

const FEATURES: Record<string, Feature> = {
  email: emailFeature,
  analytics: analyticsFeature,
  "webhook-event": webhookEventFeature,
};

export default defineCommand({
  meta: {
    name: "add",
    description: "Add a feature to your Whop project",
  },
  args: {
    feature: {
      type: "positional",
      description: `Feature to add: ${Object.keys(FEATURES).join(", ")}`,
      required: false,
    },
  },
  async run({ args }) {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit add "))} Add a feature`);

    // Check we're in a whop-kit project
    const manifest = readManifest(".");
    if (!manifest) {
      p.log.error(
        "No .whop/config.json found. Run this command from a project created with create-whop-kit.",
      );
      process.exit(1);
    }

    // Select feature
    let featureKey = args.feature;
    if (!featureKey) {
      const result = await p.select({
        message: "What would you like to add?",
        options: Object.entries(FEATURES).map(([value, f]) => {
          const installed = manifest.features.includes(f.configKey);
          return {
            value,
            label: installed ? `${f.name} ${pc.green("✓ configured")}` : f.name,
            hint: f.description,
          };
        }),
      });
      if (p.isCancel(result)) { p.cancel("Cancelled."); process.exit(0); }
      featureKey = result;
    }

    const feature = FEATURES[featureKey];
    if (!feature) {
      p.log.error(
        `Unknown feature "${featureKey}". Available: ${Object.keys(FEATURES).join(", ")}`,
      );
      process.exit(1);
    }

    // Check if already configured
    if (manifest.features.includes(feature.configKey)) {
      const proceed = await p.confirm({
        message: `${feature.name} is already configured. Reconfigure?`,
        initialValue: false,
      });
      if (p.isCancel(proceed) || !proceed) {
        p.cancel("Cancelled.");
        process.exit(0);
      }
    }

    await feature.run(".");

    addFeatureToManifest(".", feature.configKey);

    p.outro(`${pc.green("✓")} ${feature.name} configured`);
  },
});
