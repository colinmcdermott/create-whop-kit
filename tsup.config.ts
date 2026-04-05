import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/cli-create.ts", "src/cli-kit.ts"],
  format: ["esm"],
  target: "node18",
  clean: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
