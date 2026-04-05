import * as p from "@clack/prompts";
import { appendEnvVar } from "./helpers.js";
import { writeFeatureSkill } from "../scaffolding/skills.js";
import type { Feature } from "../commands/add.js";

export const emailFeature: Feature = {
  name: "Email",
  description: "Transactional email via Resend or SendGrid",
  configKey: "email",

  async run(projectDir: string) {
    const provider = await p.select({
      message: "Email provider",
      options: [
        { value: "resend", label: "Resend", hint: "Modern email API" },
        { value: "sendgrid", label: "SendGrid", hint: "Established platform" },
      ],
    });
    if (p.isCancel(provider)) { p.cancel("Cancelled."); process.exit(0); }

    const apiKey = await p.text({
      message: `${provider === "resend" ? "Resend" : "SendGrid"} API key`,
      placeholder: provider === "resend" ? "re_xxxxxxxxx" : "SG.xxxxxxxxx",
      validate: (v) => (!v ? "API key is required" : undefined),
    });
    if (p.isCancel(apiKey)) { p.cancel("Cancelled."); process.exit(0); }

    const fromAddress = await p.text({
      message: "From email address",
      placeholder: "noreply@yourdomain.com",
    });
    if (p.isCancel(fromAddress)) { p.cancel("Cancelled."); process.exit(0); }

    appendEnvVar(projectDir, "EMAIL_PROVIDER", provider);
    appendEnvVar(projectDir, "EMAIL_API_KEY", apiKey);
    if (fromAddress) {
      appendEnvVar(projectDir, "EMAIL_FROM_ADDRESS", fromAddress);
    }

    writeFeatureSkill(projectDir, "email", provider);
  },
};
