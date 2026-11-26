import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

/**
 * Reads SERVER_PORT from .env.test.local (the file `npm run dev:test` uses), so the tests call
 * the same port the main server listens on. Only this one value is read from the file.
 */
function serverPortFromTestEnv(): string | undefined {
    const file = path.join(PROJECT_ROOT, ".env.test.local");
    if (!existsSync(file)) return undefined;
    const match = /^\s*SERVER_PORT\s*=\s*["']?(\d+)["']?\s*$/m.exec(readFileSync(file, "utf8"));
    return match?.[1];
}

const port = process.env.SERVER_PORT ?? serverPortFromTestEnv() ?? "3000";

export const API_CONFIG = {
    /** Override with API_BASE_URL, e.g. `$env:API_BASE_URL = "http://localhost:3001/api/v1"`. */
    baseUrl: (process.env.API_BASE_URL ?? `http://localhost:${port}/api/v1`).replace(/\/+$/, ""),
    resetPath: "/dev/reset-db",
    loginPath: "/auth/login",
    sessionCookieName: "connect.sid",
    requestTimeoutMs: 10_000
} as const;
