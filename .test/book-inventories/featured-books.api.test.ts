import { beforeEach, describe, expect, it } from "vitest";

import { expectValidationError, titlesOf } from "../helpers/assertions.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";
import { BOOK_ID } from "./fixtures.js";

// GET /books/featured: featured titles for the home page, newest first then by title,
// with a 3-field stock summary and an optional ?limit (default 4).

describe("GET /books/featured", () => {
    beforeEach(resetDatabase);

    it("[FEAT-01] returns 4 titles by default, newest first then by title, with a 3-field stock summary", async () => {
        const student = await signInAs("student");

        const res = await student.get("/books/featured").expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveLength(4);
        // Items 3 and 4 (Dế Mèn Phiêu Lưu Ký / Devotions) depend on the database collation,
        // so only the first two are pinned.
        expect(titlesOf(res.body.data).slice(0, 2)).toEqual(["A Brief History of Time", "A Wrinkle in Time"]);
        expect(res.body.data[0]).toMatchObject({
            _id: BOOK_ID.briefHistory,
            title: "A Brief History of Time",
            author: "Stephen Hawking",
            category: "Non-fiction",
            genre: "Science",
            coverImageUrl: null,
            shelfReference: "SCI HAW · B2",
            stockSummary: { totalCopies: 2, availableCopies: 1, isAvailableNow: true }
        });
        expect(res.body.data[0]).not.toHaveProperty("isbn");
    });

    it("[FEAT-02] limit=2 returns exactly two titles", async () => {
        const student = await signInAs("student");

        const res = await student.get("/books/featured").query({ limit: 2 }).expect(200);

        expect(res.body.success).toBe(true);
        expect(titlesOf(res.body.data)).toEqual(["A Brief History of Time", "A Wrinkle in Time"]);
    });

    it("[FEAT-03] a title with no available copy reports isAvailableNow false", async () => {
        const staff = await signInAs("staff");

        const res = await staff.get("/books/featured").query({ limit: 10 }).expect(200);

        expect(res.body.data).toHaveLength(10);
        const hobbit = res.body.data.find((book: { title: string }) => book.title === "The Hobbit");
        expect(hobbit?.stockSummary).toEqual({ totalCopies: 3, availableCopies: 0, isAvailableNow: false });
    });

    it("[FEAT-04] limit=0 is rejected", async () => {
        const student = await signInAs("student");

        const res = await student.get("/books/featured").query({ limit: 0 });

        expectValidationError(res, "limit");
        expect(res.body.error.message).toBe("Invalid input");
    });

    it("[FEAT-05] a non-numeric limit is rejected", async () => {
        const student = await signInAs("student");

        const res = await student.get("/books/featured").query({ limit: "abc" });

        expectValidationError(res, "limit");
    });

    // KNOWN BUG: the contract (4.1) says Public, but server.ts mounts the whole /books router
    // behind verificationMiddleware, so a guest gets 401. Change it.fails to it once fixed.
    it.fails("[FEAT-06] is public: a guest gets 200", async () => {
        const res = await guest().get("/books/featured").expect(200);

        expect(res.body.data).toHaveLength(4);
    });
});
