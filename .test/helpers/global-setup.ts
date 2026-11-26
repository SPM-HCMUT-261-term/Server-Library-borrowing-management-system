import { API_CONFIG } from "./config.js";
import { resetDatabase } from "./session.js";

/**
 * Runs once before any test file. Checks that the main server is reachable and that the reset
 * route works, so a missing server gives one clear error instead of every test failing.
 */
export default async function setup(): Promise<void> {
    try {
        await resetDatabase();
    } catch (error) {
        const reason = error instanceof Error ? error.message : String(error);
        throw new Error(
            `API tests cannot start against ${API_CONFIG.baseUrl}\n  ${reason}\n` +
                "  Start the main server first: npm run dev:test (with ENABLE_DB_RESET=true in .env.test.local)."
        );
    }
    console.log(`API tests target ${API_CONFIG.baseUrl}`);
}
