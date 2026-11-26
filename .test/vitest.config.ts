import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// API tests: every test sends real HTTP requests to the main server, which must already be
// running (npm run dev:test, with ENABLE_DB_RESET=true). Run them with
//   npm run test:api                 every module under .test/
//   npm run test:api:books           only .test/book-inventories
// The unit/repository tests in src/ keep using the root vitest.config.ts (npm test).
export default defineConfig({
    test: {
        root: fileURLToPath(new URL(".", import.meta.url)), // the .test folder
        include: ["**/*.api.test.ts"],
        environment: "node",
        globalSetup: ["./helpers/global-setup.ts"],

        // Every test resets the one shared database, so files must never run in parallel.
        fileParallelism: false,
        sequence: { concurrent: false },

        testTimeout: 20_000,
        hookTimeout: 20_000
    }
});
