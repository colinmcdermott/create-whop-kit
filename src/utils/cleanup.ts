import { rmSync, existsSync } from "node:fs";

export function cleanupDir(dir: string): void {
  if (existsSync(dir)) {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}
