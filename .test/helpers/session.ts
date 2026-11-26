import { ApiClient } from "./api-client.js";
import { API_CONFIG } from "./config.js";

export type Role = "student" | "staff" | "admin";

/** Demo accounts of src/shared/database/init.sql. All use DEFAULT_PASSWORD. */
export const ACCOUNT = {
    maya: "S10428", //   student, 2 active loans (incl. Wonder)
    oliver: "S10312", // student, 1 active loan (The Hobbit)
    amira: "S10216", //  student, 1 active loan (The Midnight Library, BR-2090)
    liam: "S10999", //   student, Inactive
    staff: "STF001", //  Eleanor Vance
    admin: "ADM001" //   Arthur Pendelton
} as const;

export const DEFAULT_PASSWORD = "password123";

const DEFAULT_ACCOUNT: Record<Role, string> = {
    student: ACCOUNT.maya,
    staff: ACCOUNT.staff,
    admin: ACCOUNT.admin
};

/**
 * POST /dev/reset-db: empties the app tables and reloads init.sql.
 * Use as `beforeEach(resetDatabase)` so every test starts from the same data.
 * user_sessions is not touched, but each test signs in again anyway.
 */
export async function resetDatabase(): Promise<void> {
    const response = await new ApiClient().post(API_CONFIG.resetPath);
    if (response.status === 404) {
        throw new Error("POST /dev/reset-db is not mounted: start the main server with ENABLE_DB_RESET=true");
    }
    if (response.status !== 200) {
        throw new Error(`POST /dev/reset-db returned ${response.status} (is schema.sql loaded?): ${response.text}`);
    }
}

/** A client with no session cookie. */
export function guest(): ApiClient {
    return new ApiClient();
}

/**
 * Signs in and returns a client that carries the new session cookie.
 * @param role       login role
 * @param accountId  defaults to S10428 (student), STF001 (staff) or ADM001 (admin)
 * @throws Error when the login does not return 200 or sets no cookie
 */
export async function signInAs(
    role: Role,
    accountId: string = DEFAULT_ACCOUNT[role],
    password: string = DEFAULT_PASSWORD
): Promise<ApiClient> {
    const client = new ApiClient();
    const response = await client.post(API_CONFIG.loginPath, { accountId, password, role });
    if (response.status !== 200) {
        throw new Error(`Login as ${role} ${accountId} returned ${response.status}: ${response.text}`);
    }
    if (!client.sessionCookie) {
        throw new Error(`Login as ${role} ${accountId} succeeded but set no ${API_CONFIG.sessionCookieName} cookie`);
    }
    return client;
}
