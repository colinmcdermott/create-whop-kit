import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { exec } from "../utils/exec.js";
import { readManifest } from "../scaffolding/manifest.js";
import { whopHosts, resolveWhopEnvironment } from "../whop-env.js";

function getDashboards(): Record<string, { name: string; url: string }> {
  // Sandbox projects open the sandbox dashboard (read from .whop/config.json)
  const environment = resolveWhopEnvironment(readManifest(".")?.environment);
  const whopWeb = whopHosts(environment).web;
  return {
    whop: {
      name: environment === "sandbox" ? "Whop Sandbox Developer Dashboard" : "Whop Developer Dashboard",
      url: `${whopWeb}/dashboard/developer`,
    },
    neon: { name: "Neon Console", url: "https://console.neon.tech" },
    supabase: { name: "Supabase Dashboard", url: "https://supabase.com/dashboard" },
    vercel: { name: "Vercel Dashboard", url: "https://vercel.com/dashboard" },
  };
}

function openUrl(url: string): void {
  const platform = process.platform;
  if (platform === "darwin") {
    exec(`open "${url}"`);
  } else if (platform === "win32") {
    // First quoted arg to `start` is the window title — pass "" so the URL
    // is treated as the target
    exec(`start "" "${url}"`);
  } else {
    // Try WSL first (wslview or cmd.exe), then xdg-open
    const wsl = exec(`wslview "${url}"`);
    if (!wsl.success) {
      const cmd = exec(`cmd.exe /c start "" "${url.replace(/&/g, "^&")}"`);
      if (!cmd.success) {
        exec(`xdg-open "${url}"`);
      }
    }
  }
}

export default defineCommand({
  meta: {
    name: "open",
    description: "Open a provider dashboard in your browser",
  },
  args: {
    target: {
      type: "positional",
      description: "Dashboard to open: whop, neon, supabase, vercel",
      required: false,
    },
  },
  async run({ args }) {
    const DASHBOARDS = getDashboards();
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
