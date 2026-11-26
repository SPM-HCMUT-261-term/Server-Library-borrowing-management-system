import { beforeEach, describe, expect, it } from "vitest";

import type { ApiClient } from "../helpers/api-client.js";
import { expectApiError } from "../helpers/assertions.js";
import { resetDatabase, signInAs } from "../helpers/session.js";
import { BOOK_ID, NEW_BOOK, UNKNOWN_ID } from "./fixtures.js";

// DELETE /books/:id: staff delete a title. Allowed only when it has no copies and no loan history.

/** Creates NEW_BOOK (no copies) and returns its id. */
async function createBookWithoutCopies(staff: ApiClient): Promise<string> {
    const res = await staff.post("/books", NEW_BOOK);
    expect(res.status, `setup: POST /books returned ${res.status}: ${res.text}`).toBe(201);
    return res.body.data._id as string;
}

describe("DELETE /books/:id", () => {
    beforeEach(resetDatabase);

    it("[DELETE-BOOK-01] a title that still has copies cannot be deleted", async () => {
        const staff = await signInAs("staff");

        const res = await staff.delete(`/books/${BOOK_ID.midnightLibrary}`);

        expectApiError(res, 409, "BOOK_HAS_COPIES_OR_HISTORY");
    });

    it("[DELETE-BOOK-02] returns 404 for an unknown id", async () => {
        const staff = await signInAs("staff");

        const res = await staff.delete(`/books/${UNKNOWN_ID}`);

        expectApiError(res, 404, "BOOK_NOT_FOUND");
    });

    it("[DELETE-BOOK-03] deletes a new title with no copies", async () => {
        const staff = await signInAs("staff");
        const newBookId = await createBookWithoutCopies(staff);

        const res = await staff.delete(`/books/${newBookId}`);

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: "Book title deleted successfully" });
    });

    it("[DELETE-BOOK-04] the deleted title is gone", async () => {
        const staff = await signInAs("staff");
        const newBookId = await createBookWithoutCopies(staff);
        const deleted = await staff.delete(`/books/${newBookId}`);
        expect(deleted.status).toBe(200);

        const res = await staff.get(`/books/${newBookId}`);

        expectApiError(res, 404, "BOOK_NOT_FOUND");
    });

    describe("access", () => {
        it("[DELETE-BOOK-05] a student is not allowed", async () => {
            const student = await signInAs("student");

            const res = await student.delete(`/books/${BOOK_ID.midnightLibrary}`);

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
