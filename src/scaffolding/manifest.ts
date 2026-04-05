import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export interface Manifest {
  version: number;
  framework: string;
  appType: string;
  database: string;
  features: string[];
  templateVersion: string;
  createdAt: string;
}

const MANIFEST_DIR = ".whop";
const MANIFEST_FILE = "config.json";

export function getManifestPath(projectDir: string): string {
  return join(projectDir, MANIFEST_DIR, MANIFEST_FILE);
}

export function createManifest(
  projectDir: string,
  data: Omit<Manifest, "version" | "createdAt">,
): void {
  const dir = join(projectDir, MANIFEST_DIR);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }

  const manifest: Manifest = {
    version: 1,
    ...data,
    createdAt: new Date().toISOString(),
  };

  writeFileSync(getManifestPath(projectDir), JSON.stringify(manifest, null, 2) + "\n");
}

export function readManifest(projectDir: string): Manifest | null {
  const path = getManifestPath(projectDir);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, "utf-8"));
  } catch {
    return null;
  }
}

export function updateManifest(
  projectDir: string,
  updates: Partial<Manifest>,
): void {
  const manifest = readManifest(projectDir);
  if (!manifest) return;
  writeFileSync(
    getManifestPath(projectDir),
    JSON.stringify({ ...manifest, ...updates }, null, 2) + "\n",
  );
}

export function addFeatureToManifest(projectDir: string, feature: string): void {
  const manifest = readManifest(projectDir);
  if (!manifest) return;
  if (!manifest.features.includes(feature)) {
    manifest.features.push(feature);
  }
  writeFileSync(getManifestPath(projectDir), JSON.stringify(manifest, null, 2) + "\n");
}
