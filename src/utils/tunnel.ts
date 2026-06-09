import { spawn, type ChildProcess } from "node:child_process";
import { hasCommand } from "./exec.js";

export type TunnelProvider = "ngrok" | "cloudflared";

export interface Tunnel {
  provider: TunnelProvider;
  url: string;
  child: ChildProcess;
  /** Kill the tunnel process. Safe to call multiple times. */
  stop: () => void;
}

interface StartOptions {
  port: number;
  /** Max time to wait for the public URL to appear in tunnel output. */
  urlTimeoutMs?: number;
  /** Called for each chunk of tunnel output (for live diagnostics). */
  onLog?: (line: string) => void;
}

// Public URL regex — match a /^https:\/\/[^\s]+/ in tunnel output.
// ngrok prints lines like:  "url=https://abcd-12-34-56-78.ngrok-free.app"
// cloudflared prints:       "https://random-words.trycloudflare.com"
const URL_RE = /https:\/\/[A-Za-z0-9.-]+\.(?:ngrok-free\.app|ngrok\.app|ngrok\.io|trycloudflare\.com)/;

function pickProvider(): { provider: TunnelProvider; cmd: string; args: (port: number) => string[] } {
  if (hasCommand("ngrok")) {
    return {
      provider: "ngrok",
      cmd: "ngrok",
      args: (port) => ["http", `${port}`, "--log=stdout", "--log-format=logfmt"],
    };
  }
  // cloudflared via npx — downloads the binary on first run, no account needed.
  // Pinned to an exact version: this is a community wrapper package executed
  // with full user privileges, so never auto-run whatever @latest becomes.
  return {
    provider: "cloudflared",
    cmd: "npx",
    args: (port) => ["-y", "cloudflared@0.7.1", "tunnel", "--url", `http://localhost:${port}`],
  };
}

/**
 * Start a public HTTPS tunnel to localhost:<port> and resolve once the
 * public URL has been observed in the tunnel's output.
 */
export async function startTunnel(opts: StartOptions): Promise<Tunnel> {
  const timeout = opts.urlTimeoutMs ?? 30_000;
  const { provider, cmd, args } = pickProvider();
  const child = spawn(cmd, args(opts.port), { stdio: ["ignore", "pipe", "pipe"] });

  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    if (!child.killed) child.kill("SIGTERM");
  };

  return new Promise<Tunnel>((resolve, reject) => {
    const timer = setTimeout(() => {
      stop();
      reject(new Error(`Tunnel (${provider}) did not produce a public URL within ${timeout}ms`));
    }, timeout);

    let resolved = false;
    const onChunk = (buf: Buffer) => {
      const text = buf.toString();
      if (opts.onLog) {
        for (const line of text.split("\n")) {
          if (line.trim()) opts.onLog(line);
        }
      }
      if (resolved) return;
      const match = text.match(URL_RE);
      if (match) {
        resolved = true;
        clearTimeout(timer);
        resolve({ provider, url: match[0], child, stop });
      }
    };

    child.stdout?.on("data", onChunk);
    child.stderr?.on("data", onChunk);

    child.once("error", (err) => {
      if (resolved) return;
      clearTimeout(timer);
      reject(err);
    });

    child.once("exit", (code) => {
      if (resolved) return;
      clearTimeout(timer);
      reject(new Error(`Tunnel (${provider}) exited with code ${code} before producing a URL`));
    });
  });
}
