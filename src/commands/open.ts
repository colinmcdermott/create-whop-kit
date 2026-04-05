import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { exec } from "../utils/exec.js";

const DASHBOARDS: Record<string, { name: string; url: string }> = {
  whop: { name: "Whop Developer Dashboard", url: "https://whop.com/dashboard/developer" },
  neon: { name: "Neon Console", url: "https://console.neon.tech" },
  supabase: { name: "Supabase Dashboard", url: "https://supabase.com/dashboard" },
  vercel: { name: "Vercel Dashboard", url: "https://vercel.com/dashboard" },
};

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") exec(`open "${url}"`);
  else if (platform === "win32") exec(`start "${url}"`);
  else exec(`xdg-open "${url}"`);
}

export default defineCommand({
  meta: {
    name: "open",
    description: "Open a provider dashboard in your browser",
  },
  args: {
    target: {
      type: "positional",
      description: `Dashboard to open: ${Object.keys(DASHBOARDS).join(", ")}`,
      required: false,
    },
  },
  async run({ args }) {
    let target = args.target;

    if (!target) {
      const result = await p.select({
        message: "Which dashboard?",
        options: Object.entries(DASHBOARDS).map(([value, d]) => ({
          value,
          label: d.name,
          hint: d.url,
        })),
      });
      if (p.isCancel(result)) { p.cancel("Cancelled."); process.exit(0); }
      target = result;
    }

    const dashboard = DASHBOARDS[target];
    if (!dashboard) {
      p.log.error(`Unknown dashboard "${target}". Options: ${Object.keys(DASHBOARDS).join(", ")}`);
      process.exit(1);
    }

    openUrl(dashboard.url);
    console.log(`\n  Opening ${pc.bold(dashboard.name)} → ${pc.cyan(dashboard.url)}\n`);
  },
});
