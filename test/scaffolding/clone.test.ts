import { strict as assert } from "node:assert";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { cloneTemplate } from "../../src/scaffolding/clone.js";

test("cloneTemplate passes the project directory as a literal argument", () => {
  const root = mkdtempSync(join(tmpdir(), "create-whop-kit-clone-"));
  const binDir = join(root, "bin");
  const capturedArgsPath = join(root, "args.json");
  const sentinelPath = join(root, "sentinel");
  const projectDir = join(root, "project-$(touch $SENTINEL)");
  const originalPath = process.env.PATH;
  const originalSentinel = process.env.SENTINEL;

  try {
    mkdirSync(binDir);
    const gitPath = join(binDir, "git");
    writeFileSync(
      gitPath,
      `#!/usr/bin/env node
const { mkdirSync, writeFileSync } = require("node:fs");
const args = process.argv.slice(2);
writeFileSync(process.env.CAPTURED_ARGS, JSON.stringify(args));
mkdirSync(args.at(-1), { recursive: true });
`,
      { mode: 0o755 },
    );
    chmodSync(gitPath, 0o755);
    process.env.PATH = `${binDir}:${originalPath ?? ""}`;
    process.env.CAPTURED_ARGS = capturedArgsPath;
    process.env.SENTINEL = sentinelPath;

    assert.equal(cloneTemplate("whopio/template", projectDir), true);
    assert.equal(existsSync(sentinelPath), false);
    assert.deepEqual(JSON.parse(readFileSync(capturedArgsPath, "utf8")), [
      "clone",
      "--depth",
      "1",
      "https://github.com/whopio/template.git",
      projectDir,
    ]);
  } finally {
    process.env.PATH = originalPath;
    if (originalSentinel === undefined) delete process.env.SENTINEL;
    else process.env.SENTINEL = originalSentinel;
    delete process.env.CAPTURED_ARGS;
    rmSync(root, { recursive: true, force: true });
  }
});
