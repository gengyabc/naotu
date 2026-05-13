import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

export default defineConfig({
  resolve: {
    alias: {
      obsidian: fileURLToPath(new URL("./src/test/obsidian-stub.ts", import.meta.url)),
    },
  },
  test: {
    setupFiles: ["./src/test/setup.ts"],
  },
});
