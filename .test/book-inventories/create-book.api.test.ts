import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectValidationError } from "../helpers/assertions.js";
import { resetDatabase, signInAs } from "../helpers/session.js";
import { ISBN } from "./fixtures.js";

// POST /books: staff create a title. The contract defaults (language, format, description,
// coverImageUrl, and genre = category) are filled in by the backend.

const WILD_ROBOT = {
    title: "The Wild Robot",
    author: "Peter Brown",
    isbn: "9781848127272",
    category: "Fiction"
} as const;

describe("POST /books", () => {
    beforeEach(resetDatabase);

    it("[CREATE-01] with only the Staff modal fields, the backend fills the defaults", async () => {
        const staff = await signInAs("staff");

        const res = await staff.post("/books", {
            ...WILD_ROBOT,
            keywords: ["Robots", "nature", "friendship"],
            publisher: "Piccadilly Press"
        });

        expect(res.status).toBe(201);
        expect(res.body.success).toBe(true);
        expect(res.body.data).toMatchObject({
            _id: expect.any(String),
            title: "The Wild Robot",
            author: "Peter Brown",
            isbn: "9781848127272",
            category: "Fiction",
            genre: "Fiction", // genre defaults to the category (contract 4.4)
            keywords: ["Robots", "nature", "friendship"],
            publisher: "Piccadilly Press",
            publishedYear: null,
            language: "English",
            format: "Paperback",
            pageCount: null,
            description: "No description available for this title yet.",
            coverImageUrl: "https://placehold.co/300x450?text=No+Cover",
            shelfReference: null,
            stockSummary: {
                totalCopies: 0,
                availableCopies: 0,
                borrowedCopies: 0,
                reservedCopies: 0,
                damagedCopies: 0,
                lostCopies: 0,
                isAvailableNow: false
            },
            createdAt: expect.any(String),
            updatedAt: expect.any(String)
        });
    });

    it("[CREATE-02] stores every optional field as sent", async () => {
        const staff = await signInAs("staff");

        const res = await staff.post("/books", {
            title: "The Wild Robot Escapes",
            author: "Peter Brown",
            isbn: "9780316382045",
            category: "Fiction",
            keywords: ["Robots"],
            publisher: "Little, Brown",
            genre: "Science fiction",
            publishedYear: 2018,
            language: "English",
            format: "Hardcover",
            pageCount: 288,
            description: "Roz the robot sets out to find her island again.",
            coverImageUrl: "https://example.com/wild-robot-escapes.jpg",
            shelfReference: "FIC BRO · A4"
        });

        expect(res.status).toBe(201);
        expect(res.body.data).toMatchObject({
            genre: "Science fiction",
            publishedYear: 2018,
            format: "Hardcover",
            pageCount: 288,
            description: "Roz the robot sets out to find her island again.",
            coverImageUrl: "https://example.com/wild-robot-escapes.jpg",
            shelfReference: "FIC BRO · A4"
        });
    });

    it("[CREATE-03] a duplicate ISBN is a conflict", async () => {
        const staff = await signInAs("staff");

        const res = await staff.post("/books", {
            title: "Copycat",
            author: "Someone",
            isbn: ISBN.midnightLibrary,
            category: "Fiction"
        });

        expectApiError(res, 409, "DUPLICATE_ISBN");
        expect(res.body.error.message).toBe("A book with this ISBN already exists");
    });

    describe("validation", () => {
        it("[CREATE-04] a blank title is rejected", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post("/books", { ...WILD_ROBOT, title: "   " });

            expectValidationError(res, "title");
            expect(res.body.error.details.title).toBe("Title is required");
        });

        it("[CREATE-05] category must be one of the five catalog categories", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post("/books", { ...WILD_ROBOT, category: "Fantasy" });

            expectValidationError(res, "category");
        });

        it("[CREATE-06] publishedYear as a string is rejected (no coercion in JSON bodies)", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post("/books", { ...WILD_ROBOT, publishedYear: "2016" });

            expectValidationError(res, "publishedYear");
        });
    });

    describe("access", () => {
        it("[CREATE-07] a student is not allowed", async () => {
            const student = await signInAs("student");

            const res = await student.post("/books", WILD_ROBOT);

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
