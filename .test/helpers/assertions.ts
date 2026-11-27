import type { Response } from "supertest";
import { expect } from "vitest";

/** Checks the error envelope `{ success: false, error: { code } }` and the status code. */
export function expectApiError(response: Response, status: number, code: string): void {
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ success: false, error: { code } });
}

/**
 * Checks a 400 VALIDATION_ERROR whose `error.details` has a message for `field`.
 * `field` is the exact key the controller uses, e.g. "limit", "author" or "keywords.1"
 * (passed as an array path, so a dot in the key is not read as nesting).
 */
export function expectValidationError(response: Response, field: string): void {
    expectApiError(response, 400, "VALIDATION_ERROR");
    expect(response.body.error.details).toHaveProperty([field], expect.any(String));
}

/**
 * 403 for a signed-in user whose role may not call the endpoint.
 * The contract gives no error code for this case, so only the status and the envelope are checked.
 */
export function expectForbidden(response: Response): void {
    expect(response.status).toBe(403);
    expect(response.body).toMatchObject({ success: false });
}

/**
 * 401 for a request without a session.
 * Only the status is checked: the 401 body of verificationMiddleware has no `success: false`
 * yet (known bug, see .test/book-inventories/README.md).
 */
export function expectUnauthorized(response: Response): void {
    expect(response.status).toBe(401);
}

/** `items.map(item => item.title)`, for comparing the order of a list. */
export function titlesOf(items: { title: string }[]): string[] {
    return items.map((item) => item.title);
}
