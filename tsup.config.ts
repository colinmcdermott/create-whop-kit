import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli-create.ts", "src/cli-kit.ts"],
  format: ["esm"],
  target: "node20",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
