import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectValidationError } from "../helpers/assertions.js";
import { resetDatabase, signInAs } from "../helpers/session.js";
import { BOOK_ID, ISBN, UNKNOWN_ID } from "./fixtures.js";

// PUT /books/:id: staff edit a title. title, author, isbn and category are required;
// an omitted optional field keeps its stored value, and null clears a nullable field.

/** The required fields of The Midnight Library (book 1), as stored in init.sql. */
const MIDNIGHT_REQUIRED = {
    title: "The Midnight Library",
    author: "Matt Haig",
    isbn: ISBN.midnightLibrary,
    category: "Fiction"
} as const;

describe("PUT /books/:id", () => {
    beforeEach(resetDatabase);

    it("[UPDATE-01] omitted optional fields keep their stored value", async () => {
        // Checks the undefined-vs-null fix: a missing field must not be cleared.
        const staff = await signInAs("staff");

        const res = await staff.put(`/books/${BOOK_ID.midnightLibrary}`, {
            ...MIDNIGHT_REQUIRED,
            title: "The Midnight Library (2nd ed.)"
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
            _id: BOOK_ID.midnightLibrary,
            title: "The Midnight Library (2nd ed.)",
            isbn: ISBN.midnightLibrary,
            publisher: "Canongate Books",
            genre: "Contemporary fiction",
            keywords: ["Choices & possibilities", "Fantasy", "Contemporary", "fiction"],
            publishedYear: 2020,
            pageCount: 304,
            shelfReference: "FIC HAI · A3",
            stockSummary: { totalCopies: 4, availableCopies: 2 }
        });
    });

    it("[UPDATE-02] null clears a nullable field", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(`/books/${BOOK_ID.midnightLibrary}`, {
            ...MIDNIGHT_REQUIRED,
            publisher: null,
            genre: null
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ publisher: null, genre: null, pageCount: 304 });
    });

    it("[UPDATE-03] accepts a new unique ISBN", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(`/books/${BOOK_ID.midnightLibrary}`, {
            ...MIDNIGHT_REQUIRED,
            isbn: "9780525559474"
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({ _id: BOOK_ID.midnightLibrary, isbn: "9780525559474" });
    });

    it("[UPDATE-04] the ISBN of another book is a conflict", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(`/books/${BOOK_ID.bookThief}`, {
            title: "The Book Thief",
            author: "Markus Zusak",
            isbn: ISBN.midnightLibrary,
            category: "Fiction"
        });

        expectApiError(res, 409, "DUPLICATE_ISBN");
    });

    it("[UPDATE-05] returns 404 for an unknown id", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(`/books/${UNKNOWN_ID}`, {
            title: "Ghost",
            author: "Nobody",
            isbn: "9780000000099",
            category: "Fiction"
        });

        expectApiError(res, 404, "BOOK_NOT_FOUND");
    });

    describe("validation", () => {
        it("[UPDATE-06] a blank author is rejected", async () => {
            const staff = await signInAs("staff");

            const res = await staff.put(`/books/${BOOK_ID.midnightLibrary}`, { ...MIDNIGHT_REQUIRED, author: "" });

            expectValidationError(res, "author");
            expect(res.body.error.details["author"]).toBe("Author is required");
        });

        it("[UPDATE-07] pageCount as a string is rejected", async () => {
            const staff = await signInAs("staff");

            const res = await staff.put(`/books/${BOOK_ID.midnightLibrary}`, { ...MIDNIGHT_REQUIRED, pageCount: "300" });

            expectValidationError(res, "pageCount");
        });
    });

    describe("access", () => {
        it("[UPDATE-08] a student is not allowed", async () => {
            const student = await signInAs("student");

            const res = await student.put(`/books/${BOOK_ID.midnightLibrary}`, { ...MIDNIGHT_REQUIRED, title: "Hacked" });

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
