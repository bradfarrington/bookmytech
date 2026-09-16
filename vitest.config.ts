import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Minimal Vitest setup for the pure unit tests (pricing engine maths). The
// "@/*" alias mirrors tsconfig so test imports match app code.
export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts", "app/**/*.test.ts", "emails/**/*.test.ts"],
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./", import.meta.url)),
      // `import "server-only"` is a build-time guard: Next aliases it to a
      // no-op on the server and to a module that throws in a client bundle.
      // Vitest has no such alias, so importing any lib/ module that declares
      // the guard fails with "Cannot find module 'server-only'" — which had
      // quietly put most of lib/ out of reach of unit tests. Point it at the
      // same empty module Next uses on the server.
      "server-only": fileURLToPath(
        new URL("./node_modules/next/dist/compiled/server-only/empty.js", import.meta.url),
      ),
    },
  },
});
