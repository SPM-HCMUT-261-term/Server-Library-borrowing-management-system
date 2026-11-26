import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectValidationError, titlesOf } from "../helpers/assertions.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";
import { BOOK_ID, ISBN } from "./fixtures.js";

// GET /books: catalog search and filters (q, category, genre, language, availableNow, stock),
// sorting (relevance by default, title, publishedYear) and pagination (page, limit = 6).
// Staff and students only.

describe("GET /books", () => {
    beforeEach(resetDatabase);

    describe("paging and default order", () => {
        it("[LIST-01] returns page 1 with 6 titles sorted by title", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books");

            expect(res.status).toBe(200);
            expect(res.body.success).toBe(true);
            expect(res.body.data.items).toHaveLength(6);
            expect(titlesOf(res.body.data.items).slice(0, 2)).toEqual(["A Brief History of Time", "A Wrinkle in Time"]);
            expect(res.body.data.pagination).toEqual({ totalItems: 10, currentPage: 1, totalPages: 2, limit: 6 });
        });

        it("[LIST-02] page 2 holds the last 4 titles", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { page: 2 } });

            expect(res.status).toBe(200);
            expect(titlesOf(res.body.data.items)).toEqual([
                "The Hobbit",
                "The House on Mango Street",
                "The Midnight Library",
                "Wonder"
            ]);
            expect(res.body.data.pagination).toEqual({ totalItems: 10, currentPage: 2, totalPages: 2, limit: 6 });
        });

        it("[LIST-23] page=0 is rejected", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { page: 0 } });

            expectValidationError(res, "page");
        });
    });

    describe("search (q)", () => {
        it("[LIST-03] finds a title by author and maps every item field (student)", async () => {
            const student = await signInAs("student");

            const res = await student.get("/books", { query: { q: "hawking" } });

            expect(res.status).toBe(200);
            expect(res.body).toMatchObject({
                success: true,
                data: {
                    items: [
                        {
                            _id: BOOK_ID.briefHistory,
                            title: "A Brief History of Time",
                            author: "Stephen Hawking",
                            isbn: "9780553380163",
                            category: "Non-fiction",
                            genre: "Science",
                            language: "English",
                            publisher: "Bantam Books",
                            keywords: ["Science", "Cosmology", "Universe", "Physics"],
                            coverImageUrl: null,
                            shelfReference: "SCI HAW · B2",
                            stockSummary: {
                                totalCopies: 2,
                                availableCopies: 1,
                                borrowedCopies: 1,
                                reservedCopies: 0,
                                isAvailableNow: true
                            }
                        }
                    ],
                    pagination: { totalItems: 1, currentPage: 1, totalPages: 1, limit: 6 }
                }
            });
        });

        it("[LIST-04] is case-insensitive on the title", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { q: "MIDNIGHT" } });

            expect(res.status).toBe(200);
            expect(titlesOf(res.body.data.items)).toEqual(["The Midnight Library"]);
            expect(res.body.data.pagination.totalItems).toBe(1);
        });

        it("[LIST-05] finds a title by ISBN", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { q: ISBN.hobbit } });

            expect(res.status).toBe(200);
            expect(res.body.data.items).toMatchObject([{ _id: BOOK_ID.hobbit, title: "The Hobbit" }]);
        });

        it("[LIST-06] finds a title by keyword", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { q: "dystopian" } });

            expect(res.status).toBe(200);
            expect(titlesOf(res.body.data.items)).toEqual(["The Giver"]);
        });

        it("[LIST-07] relevance order puts the title-prefix match first", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { q: "wo" } });

            expect(res.status).toBe(200);
            // Wonder matches by title prefix; The Book Thief only by its keywords
            // "World War II" / "Words & courage".
            expect(titlesOf(res.body.data.items)).toEqual(["Wonder", "The Book Thief"]);
        });

        it("[LIST-08] the same search sorted by title", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { q: "wo", sortBy: "title" } });

            expect(res.status).toBe(200);
            expect(titlesOf(res.body.data.items)).toEqual(["The Book Thief", "Wonder"]);
        });

        it("[LIST-09] no match gives an empty page with 0 total pages", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { q: "no such book" } });

            expect(res.status).toBe(200);
            expect(res.body).toEqual({
                success: true,
                data: { items: [], pagination: { totalItems: 0, currentPage: 1, totalPages: 0, limit: 6 } }
            });
        });
    });

    describe("filters", () => {
        it("[LIST-10] filters by one category", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { category: "Fiction" } });

            expect(res.status).toBe(200);
            expect(titlesOf(res.body.data.items)).toEqual([
                "A Wrinkle in Time",
                "The Book Thief",
                "The Giver",
                "The Hobbit",
                "The House on Mango Street",
                "The Midnight Library"
            ]);
            expect(res.body.data.items.every((book: { category: string }) => book.category === "Fiction")).toBe(true);
            expect(res.body.data.pagination).toMatchObject({ totalItems: 6, totalPages: 1 });
        });

        it("[LIST-11] filters by a comma-separated category list", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { category: "Poetry,Reference" } });

            expect(res.status).toBe(200);
            // The order of these two titles depends on the database collation.
            expect(res.body.data.items).toHaveLength(2);
            expect(res.body.data.items).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({ title: "Devotions: Selected Poems", category: "Poetry" }),
                    expect.objectContaining({ title: "Dế Mèn Phiêu Lưu Ký", category: "Reference" })
                ])
            );
            expect(res.body.data.pagination.totalItems).toBe(2);
        });

        it("[LIST-12] an unknown category is a validation error, not an empty list", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { category: "Fiction,Fantasy" } });

            expectValidationError(res, "category");
        });

        it("[LIST-13] filters by genre (a value with a space)", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { genre: "Science fiction" } });

            expect(res.status).toBe(200);
            expect(titlesOf(res.body.data.items)).toEqual(["A Wrinkle in Time", "The Giver"]);
        });

        it("[LIST-14] filters by language", async () => {
            const student = await signInAs("student");

            const res = await student.get("/books", { query: { language: "Vietnamese" } });

            expect(res.status).toBe(200);
            expect(res.body.data.items).toMatchObject([
                { _id: BOOK_ID.deMen, title: "Dế Mèn Phiêu Lưu Ký", language: "Vietnamese" }
            ]);
        });

        it("[LIST-15] availableNow=true keeps only titles with an Available copy", async () => {
            const student = await signInAs("student");

            const res = await student.get("/books", { query: { availableNow: "true", limit: 10 } });

            expect(res.status).toBe(200);
            expect(res.body.data.items).toHaveLength(8);
            for (const book of res.body.data.items) {
                expect(book.stockSummary.isAvailableNow).toBe(true);
            }
            expect(res.body.data.pagination.totalItems).toBe(8);
        });

        it("[LIST-16] availableNow=false is not a filter", async () => {
            const student = await signInAs("student");

            const res = await student.get("/books", { query: { availableNow: "false" } });

            expect(res.status).toBe(200);
            expect(res.body.data.pagination.totalItems).toBe(10);
        });

        it("[LIST-17] availableNow must be a boolean string", async () => {
            const student = await signInAs("student");

            const res = await student.get("/books", { query: { availableNow: "maybe" } });

            expectValidationError(res, "availableNow");
        });

        it("[LIST-18] stock=unavailable lists titles with no Available copy", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { stock: "unavailable" } });

            expect(res.status).toBe(200);
            expect(res.body.data.items).toMatchObject([
                { title: "The Giver", stockSummary: { availableCopies: 0, isAvailableNow: false } },
                { title: "The Hobbit", stockSummary: { availableCopies: 0, isAvailableNow: false } }
            ]);
            expect(res.body.data.pagination.totalItems).toBe(2);
        });

        it("[LIST-19] stock=available", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { stock: "available" } });

            expect(res.status).toBe(200);
            expect(res.body.data.pagination).toMatchObject({ totalItems: 8, totalPages: 2 });
        });

        it("[LIST-20] an unknown stock value is rejected", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { stock: "bogus" } });

            expectValidationError(res, "stock");
        });

        it("[LIST-22] filters combine with AND", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { category: "Fiction", stock: "unavailable" } });

            expect(res.status).toBe(200);
            expect(titlesOf(res.body.data.items)).toEqual(["The Giver", "The Hobbit"]);
        });
    });

    describe("sorting", () => {
        it("[LIST-21] sortBy=publishedYear is newest first", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/books", { query: { sortBy: "publishedYear", limit: 10 } });

            expect(res.status).toBe(200);
            // Published years: 2020, 2017, 2012, 2005, 1993, 1988, 1984, 1962, 1941, 1937.
            expect(titlesOf(res.body.data.items)).toEqual([
                "The Midnight Library",
                "Devotions: Selected Poems",
                "Wonder",
                "The Book Thief",
                "The Giver",
                "A Brief History of Time",
                "The House on Mango Street",
                "A Wrinkle in Time",
                "Dế Mèn Phiêu Lưu Ký",
                "The Hobbit"
            ]);
        });
    });

    describe("access", () => {
        it("[LIST-24] a guest gets 401 UNAUTHORIZED", async () => {
            const res = await guest().get("/books");

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe("UNAUTHORIZED");
        });

        // KNOWN BUG: verificationMiddleware sends the AppError object, which has no
        // `success: false`. Change it.fails to it once the envelope is fixed.
        it.fails("[LIST-24] the 401 body uses the error envelope with success: false", async () => {
            const res = await guest().get("/books");

            expectApiError(res, 401, "UNAUTHORIZED");
        });

        it("[LIST-25] an admin is not allowed", async () => {
            const admin = await signInAs("admin");

            const res = await admin.get("/books");

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
