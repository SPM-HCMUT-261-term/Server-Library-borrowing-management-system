import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectValidationError } from "../helpers/assertions.js";
import { resetDatabase, signInAs } from "../helpers/session.js";
import { BOOK_ID, COPY, UNKNOWN_ID } from "./fixtures.js";

// POST /books/:bookId/copies: staff add a physical copy. The barcode (copyCode) must be unique
// across the library; the response carries the copy and the recalculated stock summary.

describe("POST /books/:bookId/copies", () => {
    beforeEach(resetDatabase);

    it("[ADD-COPY-01] adds a new barcode and recalculates the stock", async () => {
        const staff = await signInAs("staff");

        const res = await staff
            .post(`/books/${BOOK_ID.midnightLibrary}/copies`)
            .send({
                copyCode: "WB-00425",
                homeLocation: "FIC HAI · A3",
                initialState: "Available",
                condition: "Good",
                notes: "New paperback copy"
            })
            .expect(201);

        expect(res.body.success).toBe(true);
        expect(res.body.data.copy).toMatchObject({
            _id: expect.any(String),
            copyCode: "WB-00425",
            bookId: BOOK_ID.midnightLibrary,
            homeLocation: "FIC HAI · A3",
            state: "Available",
            condition: "Good",
            notes: "New paperback copy",
            hasLoanHistory: false,
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
        });
        expect(res.body.data.updatedStockSummary).toMatchObject({ totalCopies: 5, availableCopies: 3, borrowedCopies: 2 });
    });

    it("[ADD-COPY-02] initialState and condition default to Available / Good, notes to null", async () => {
        const staff = await signInAs("staff");

        const res = await staff
            .post(`/books/${BOOK_ID.devotions}/copies`)
            .send({ copyCode: "WB-00903", homeLocation: "POE OLI · C1" })
            .expect(201);

        expect(res.body.data).toMatchObject({
            copy: { copyCode: "WB-00903", bookId: BOOK_ID.devotions, state: "Available", condition: "Good", notes: null },
            updatedStockSummary: { totalCopies: 3, availableCopies: 3, borrowedCopies: 0 }
        });
    });

    it("[ADD-COPY-03] a damaged copy does not add to the available count", async () => {
        const staff = await signInAs("staff");

        const res = await staff
            .post(`/books/${BOOK_ID.midnightLibrary}/copies`)
            .send({
                copyCode: "WB-00426",
                homeLocation: "FIC HAI · A3",
                initialState: "Damaged",
                condition: "Damaged"
            })
            .expect(201);

        expect(res.body.data).toMatchObject({
            copy: { state: "Damaged", condition: "Damaged" },
            updatedStockSummary: { totalCopies: 5, availableCopies: 2, borrowedCopies: 2 }
        });
    });

    it("[ADD-COPY-04] a barcode used anywhere in the library is a conflict", async () => {
        const staff = await signInAs("staff");

        const res = await staff.post(`/books/${BOOK_ID.bookThief}/copies`).send({
            copyCode: COPY.midnightAvailable,
            homeLocation: "FIC ZUS · A5"
        });

        expectApiError(res, 409, "DUPLICATE_COPY_CODE");
        expect(res.body.error.message).toBe("Copy ID / barcode must be unique across the library");
    });

    it("[ADD-COPY-05] returns 404 for an unknown book", async () => {
        const staff = await signInAs("staff");

        const res = await staff.post(`/books/${UNKNOWN_ID}/copies`).send({ copyCode: "WB-12345", homeLocation: "FIC XXX · A1" });

        expectApiError(res, 404, "BOOK_NOT_FOUND");
    });

    describe("validation", () => {
        it("[ADD-COPY-06] homeLocation is required", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post(`/books/${BOOK_ID.midnightLibrary}/copies`).send({ copyCode: "WB-00427" });

            expectValidationError(res, "homeLocation");
        });

        it("[ADD-COPY-07] Borrowed is not an allowed initial state", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post(`/books/${BOOK_ID.midnightLibrary}/copies`).send({
                copyCode: "WB-00427",
                homeLocation: "FIC HAI · A3",
                initialState: "Borrowed"
            });

            expectValidationError(res, "initialState");
        });
    });

    describe("access", () => {
        it("[ADD-COPY-08] a student is not allowed", async () => {
            const student = await signInAs("student");

            const res = await student.post(`/books/${BOOK_ID.midnightLibrary}/copies`).send({
                copyCode: "WB-00425",
                homeLocation: "FIC HAI · A3"
            });

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
