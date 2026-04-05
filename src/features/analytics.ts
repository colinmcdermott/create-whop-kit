import * as p from "@clack/prompts";
import { appendEnvVar } from "./helpers.js";
import type { Feature } from "../commands/add.js";

export const analyticsFeature: Feature = {
  name: "Analytics",
  description: "Product analytics via PostHog, Google Analytics, or Plausible",
  configKey: "analytics",

  async run(projectDir: string) {
    const provider = await p.select({
      message: "Analytics provider",
      options: [
        { value: "posthog", label: "PostHog", hint: "Open-source product analytics" },
        { value: "google", label: "Google Analytics", hint: "GA4" },
        { value: "plausible", label: "Plausible", hint: "Privacy-friendly analytics" },
      ],
    });
    if (p.isCancel(provider)) { p.cancel("Cancelled."); process.exit(0); }

    const placeholders: Record<string, string> = {
      posthog: "phc_xxxxxxxxx",
      google: "G-XXXXXXXXXX",
      plausible: "yourdomain.com",
    };

    const id = await p.text({
      message: `${provider === "google" ? "Measurement" : provider === "posthog" ? "Project API" : "Site"} ID`,
      placeholder: placeholders[provider] ?? "",
      validate: (v) => (!v ? "ID is required" : undefined),
    });
    if (p.isCancel(id)) { p.cancel("Cancelled."); process.exit(0); }

    appendEnvVar(projectDir, "ANALYTICS_PROVIDER", provider);
    appendEnvVar(projectDir, "ANALYTICS_ID", id);
  },
};
