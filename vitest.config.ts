import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// Isolated Vitest config for pure-logic unit + regression tests. It does not
// touch the app's Vite/TanStack build; it only resolves the `@/` alias so tests
// can import project modules.
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
});
