import { spawn } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, basename } from "node:path";
import * as p from "@clack/prompts";
import pc from "picocolors";
import { defineCommand } from "citty";
import { readManifest } from "../scaffolding/manifest.js";
import { whopHosts, resolveWhopEnvironment } from "../whop-env.js";
import { detectPackageManager } from "../utils/exec.js";
import { startTunnel } from "../utils/tunnel.js";

function detectDevScript(projectDir: string): { script: string; port: number } {
  const pkgPath = join(projectDir, "package.json");
  let script = "dev";
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.scripts?.dev) script = "dev";
      else if (pkg.scripts?.start) script = "start";
    } catch { /* fall through to default */ }
  }
  return { script, port: 3000 };
}

// All scaffolded templates expose the webhook at /api/webhooks/whop
// (TanStack and Astro routes both land at the same URL path).
const WEBHOOK_PATH = "/api/webhooks/whop";

export default defineCommand({
  meta: {
    name: "dev",
    description: "Run the local dev server with a public webhook tunnel",
  },
  args: {
    port: {
      type: "string",
      description: "Local port to tunnel (default: 3000)",
    },
  },
  async run({ args }) {
    console.log("");
    p.intro(`${pc.bgCyan(pc.black(" whop-kit dev "))} dev server + webhook tunnel`);

    const manifest = readManifest(".");
    if (!manifest) {
      p.log.error("No .whop/config.json found. Are you in a whop-kit project?");
      process.exit(1);
    }

    const detected = detectDevScript(".");
    const port = args.port ? parseInt(args.port, 10) : detected.port;
    if (Number.isNaN(port) || port < 1 || port > 65535) {
      p.log.error(`Invalid port: ${args.port}`);
      process.exit(1);
    }

    const pm = detectPackageManager();
    const devCmd = pm;
    const devArgs = ["run", detected.script];

    // ── Start tunnel first so its URL is ready when the server boots ────
    const s = p.spinner();
    s.start("Starting public tunnel...");
    let tunnel;
    try {
      tunnel = await startTunnel({ port });
    } catch (err) {
      s.stop("Tunnel failed to start");
      p.log.error(err instanceof Error ? err.message : String(err));
      p.log.info(
        `Install ngrok (${pc.cyan("https://ngrok.com/download")}) for faster startup, ` +
        `or ensure your network allows npx to download cloudflared.`,
      );
      process.exit(1);
    }
    s.stop(`Tunnel ready (${tunnel.provider})`);

    const fullWebhookUrl = `${tunnel.url}${WEBHOOK_PATH}`;
    const whopWeb = whopHosts(resolveWhopEnvironment(manifest.environment)).web;

    p.note(
      [
        `${pc.bold("Public URL")}     ${pc.cyan(tunnel.url)}`,
        `${pc.bold("Webhook URL")}    ${pc.cyan(fullWebhookUrl)}`,
        "",
        `Paste the webhook URL into your Whop dashboard so events hit your laptop:`,
        `  ${pc.dim(`${whopWeb}/dashboard/developer → your app → Webhooks → URL`)}`,
        "",
        `${pc.dim("This URL only lives while this command is running.")}`,
      ].join("\n"),
      "Tunnel",
    );

    // ── Spawn dev server ─────────────────────────────────────────────────
    p.log.step(`Starting ${pc.bold(`${devCmd} ${devArgs.join(" ")}`)} on port ${port}...`);
    console.log("");

    // PORT env so Next/Astro/TanStack respect it when present.
    const child = spawn(devCmd, devArgs, {
      cwd: ".",
      stdio: "inherit",
      env: { ...process.env, PORT: String(port) },
    });

    // ── Cleanup on signal or child exit ──────────────────────────────────
    let cleaningUp = false;
    const cleanup = (code = 0) => {
      if (cleaningUp) return;
      cleaningUp = true;
      tunnel.stop();
      if (!child.killed) child.kill("SIGTERM");
      // Give children a beat to flush; then exit.
      setTimeout(() => process.exit(code), 250);
    };

    process.on("SIGINT", () => {
      console.log("");
      p.log.info("Shutting down dev server and tunnel...");
      cleanup(0);
    });
    process.on("SIGTERM", () => cleanup(0));

    child.on("exit", (code) => {
      p.log.info(`Dev server exited${code != null ? ` (code ${code})` : ""}`);
      cleanup(code ?? 0);
    });

    child.on("error", (err) => {
      p.log.error(`Failed to start dev server: ${err.message}`);
      cleanup(1);
    });
  },
});
