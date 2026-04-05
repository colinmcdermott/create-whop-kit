import * as p from "@clack/prompts";
import pc from "picocolors";
import type { Feature } from "../commands/add.js";

export const webhookEventFeature: Feature = {
  name: "Webhook Event",
  description: "Add a new webhook event handler",
  configKey: "webhook-event",

  async run() {
    const eventName = await p.text({
      message: "Event name",
      placeholder: "payment_succeeded",
      validate: (v) => (!v ? "Event name is required" : undefined),
    });
    if (p.isCancel(eventName)) { p.cancel("Cancelled."); process.exit(0); }

    const code = `
    ${eventName}: async (data) => {
      const userId = data.user_id as string | undefined;
      if (!userId) return;
      // TODO: Handle ${eventName}
      console.log(\`[Webhook] ${eventName} for \${userId}\`);
    },`;

    p.note(
      `Add this to the ${pc.bold("on")} object in your webhook route:\n\n${pc.cyan(code)}`,
      "Add to your webhook handler",
    );

    p.log.info(
      `File: ${pc.dim("app/api/webhooks/whop/route.ts")} (Next.js) or ${pc.dim("src/pages/api/webhooks/whop.ts")} (Astro)`,
    );
  },
};
