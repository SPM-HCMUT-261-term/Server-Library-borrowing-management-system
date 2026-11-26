import { expect } from "vitest";

import type { ApiResponse } from "./api-client.js";

/** Checks the error envelope `{ success: false, error: { code } }` and the status code. */
export function expectApiError(response: ApiResponse, status: number, code: string): void {
    expect(response.status).toBe(status);
    expect(response.body).toMatchObject({ success: false, error: { code } });
}

/**
 * Checks a 400 VALIDATION_ERROR whose `error.details` has a message for `field`.
 * `field` is the exact key the controller uses, e.g. "limit", "author" or "keywords.1"
 * (passed as an array path, so a dot in the key is not read as nesting).
 */
export function expectValidationError(response: ApiResponse, field: string): void {
    expectApiError(response, 400, "VALIDATION_ERROR");
    expect(response.body.error.details).toHaveProperty([field], expect.any(String));
}

/** `items.map(item => item.title)`, for comparing the order of a list. */
export function titlesOf(items: { title: string }[]): string[] {
    return items.map((item) => item.title);
}
