import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError } from "../helpers/assertions.js";
import { ACCOUNT, resetDatabase, signInAs } from "../helpers/session.js";
import { BOOK_ID, ISBN, UNKNOWN_ID } from "./fixtures.js";

// GET /books/:id: one title by numeric id or ISBN.
// Staff see per-copy loan details and the delete guard; students see viewerContext instead.

describe("GET /books/:id", () => {
    beforeEach(resetDatabase);

    describe("as staff", () => {
        it("[DETAIL-01] returns stock, the delete guard and per-copy loan details", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(`/books/${BOOK_ID.midnightLibrary}`);

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                _id: BOOK_ID.midnightLibrary,
                title: "The Midnight Library",
                author: "Matt Haig",
                isbn: ISBN.midnightLibrary,
                category: "Fiction",
                genre: "Contemporary fiction",
                keywords: ["Choices & possibilities", "Fantasy", "Contemporary", "fiction"],
                description: expect.any(String),
                publisher: "Canongate Books",
                publishedYear: 2020,
                format: "Paperback",
                language: "English",
                pageCount: 304,
                coverImageUrl: null,
                shelfReference: "FIC HAI · A3",
                stockSummary: {
                    totalCopies: 4,
                    availableCopies: 2,
                    borrowedCopies: 2,
                    reservedCopies: 0,
                    damagedCopies: 0,
                    lostCopies: 0
                },
                canDeleteTitle: false,
                deleteDisabledReason:
                    "Unavailable: this title has physical copies and loan history. Borrowed copies and historical loans cannot be deleted.",
                copies: [
                    {
                        _id: "1",
                        copyCode: "WB-00421",
                        homeLocation: "FIC HAI · A3",
                        state: "Available",
                        condition: "Good",
                        displayLocation: "FIC HAI · A3",
                        activeLoan: null,
                        activeHold: null,
                        hasLoanHistory: false
                    },
                    // Only the returned loan BR-2040.
                    { copyCode: "WB-00422", state: "Available", activeLoan: null, hasLoanHistory: true },
                    {
                        copyCode: "WB-00423",
                        state: "Borrowed",
                        displayLocation: "Currently with a reader",
                        activeLoan: {
                            borrowCode: "BR-2090",
                            studentName: "Amira Khan",
                            studentAccountId: ACCOUNT.amira,
                            dueDate: "2026-10-16"
                        },
                        activeHold: null,
                        hasLoanHistory: true
                    },
                    // Borrowed in init.sql but there is no loan row, so activeLoan is null.
                    { copyCode: "WB-00424", state: "Borrowed", activeLoan: null, hasLoanHistory: false }
                ]
            });
            expect(res.body.data).not.toHaveProperty("viewerContext");
        });

        it("[DETAIL-02] accepts an ISBN as the id", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(`/books/${ISBN.midnightLibrary}`);

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                success: true,
                data: { _id: BOOK_ID.midnightLibrary, title: "The Midnight Library" }
            });
        });

        it("[DETAIL-07] returns 404 for an unknown id", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(`/books/${UNKNOWN_ID}`);

            expectApiError(res, 404, "BOOK_NOT_FOUND");
            expect(res.body.error.message).toBe("Book not found");
        });
    });

    describe("as a student (viewerContext)", () => {
        it("[DETAIL-03] already borrowing this title: cannot borrow, borrower details hidden", async () => {
            // Maya (S10428) borrows Wonder through BR-2098.
            const maya = await signInAs("student", ACCOUNT.maya);

            const res = await maya.get(`/books/${BOOK_ID.wonder}`);

            expect(res.status).toBe(200);
            const book = res.body.data;
            expect(book.title).toBe("Wonder");
            expect(book).not.toHaveProperty("canDeleteTitle");
            expect(book).not.toHaveProperty("deleteDisabledReason");
            expect(book.viewerContext).toEqual({
                canBorrow: false,
                canRequestHold: false,
                blockReason: "You are already borrowing this title",
                activeLoansCount: 2,
                maxLoansLimit: 5,
                existingHoldCode: null
            });
            expect(book.copies).toMatchObject([
                { copyCode: "WB-00216", state: "Borrowed", displayLocation: "Currently with a reader" },
                { copyCode: "WB-00217", state: "Available", displayLocation: "FIC PAL · A2" }
            ]);
            expect(book.copies[0]).not.toHaveProperty("activeLoan");
            expect(book.copies[0]).not.toHaveProperty("hasLoanHistory");
            expect(book.copies[1]).not.toHaveProperty("activeLoan");
        });

        it("[DETAIL-04] no copy available: a hold can be requested", async () => {
            const maya = await signInAs("student", ACCOUNT.maya);

            const res = await maya.get(`/books/${BOOK_ID.hobbit}`);

            expect(res.status).toBe(200);
            expect(res.body.data).toMatchObject({ title: "The Hobbit", stockSummary: { availableCopies: 0 } });
            expect(res.body.data.viewerContext).toEqual({
                canBorrow: false,
                canRequestHold: true,
                blockReason: null,
                activeLoansCount: 2,
                maxLoansLimit: 5,
                existingHoldCode: null
            });
        });

        it("[DETAIL-05] an available copy: the student can borrow", async () => {
            // Oliver (S10312) has one active loan (BR-2081, The Hobbit).
            // The viewer context does not check overdue loans.
            const oliver = await signInAs("student", ACCOUNT.oliver);

            const res = await oliver.get(`/books/${BOOK_ID.midnightLibrary}`);

            expect(res.status).toBe(200);
            expect(res.body.data.viewerContext).toEqual({
                canBorrow: true,
                canRequestHold: false,
                blockReason: null,
                activeLoansCount: 1,
                maxLoansLimit: 5,
                existingHoldCode: null
            });
        });

        it("[DETAIL-06] already borrowing, for a different student", async () => {
            const oliver = await signInAs("student", ACCOUNT.oliver);

            const res = await oliver.get(`/books/${BOOK_ID.hobbit}`);

            expect(res.status).toBe(200);
            expect(res.body.data.viewerContext).toMatchObject({
                canBorrow: false,
                canRequestHold: false,
                blockReason: "You are already borrowing this title"
            });
        });
    });

    describe("access", () => {
        it("[DETAIL-08] an admin is not allowed", async () => {
            const admin = await signInAs("admin");

            const res = await admin.get(`/books/${BOOK_ID.midnightLibrary}`);

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
