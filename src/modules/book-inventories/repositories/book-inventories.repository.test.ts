import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { Pool } from "pg";

import {
    BooksRepositoryImpl,
    PhysicalCopiesRepositoryImpl,
} from "./book-inventories.repository.js";

const pool = new Pool();
const query = vi.spyOn(pool, "query");
const booksRepository = new BooksRepositoryImpl(pool);
const physicalCopiesRepository = new PhysicalCopiesRepositoryImpl(pool);

afterEach(() => {
    query.mockReset();
});

afterAll(async () => {
    await pool.end();
});

describe("BooksRepositoryImpl", () => {
    it("filters and paginates catalog results with a separate total count", async () => {
        query
            .mockResolvedValueOnce({
                rows: [
                    {
                        _id: "12",
                        title: "Dune",
                        author: "Frank Herbert",
                        isbn: "9780441172719",
                        category: "Fiction",
                        genre: "Science fiction",
                        language: "English",
                        publisher: null,
                        keywords: null,
                        coverImageUrl: null,
                        shelfReference: "SCI HER · B2",
                        totalCopies: "2",
                        availableCopies: "1",
                        borrowedCopies: "1",
                        reservedCopies: "0",
                    },
                ],
            } as never)
            .mockResolvedValueOnce({
                rows: [{ totalItems: "3" }],
            } as never);

        const result = await booksRepository.getBooks({
            q: "Dune",
            category: "Fiction, Poetry",
            availableNow: true,
            stock: "available",
            sortBy: "relevance",
            page: 2,
            limit: 4,
        });

        expect(result).toEqual({
            books: [
                {
                    _id: "12",
                    title: "Dune",
                    author: "Frank Herbert",
                    isbn: "9780441172719",
                    category: "Fiction",
                    genre: "Science fiction",
                    language: "English",
                    publisher: null,
                    keywords: [],
                    coverImageUrl: null,
                    shelfReference: "SCI HER · B2",
                    stockSummary: {
                        totalCopies: 2,
                        availableCopies: 1,
                        borrowedCopies: 1,
                        reservedCopies: 0,
                        isAvailableNow: true,
                    },
                },
            ],
            totalItems: 3,
        });
        expect(query).toHaveBeenCalledTimes(2);
        expect(query.mock.calls[0]?.[0]).toContain("b.title ILIKE");
        expect(query.mock.calls[0]?.[1]).toEqual([
            "%Dune%",
            ["Fiction", "Poetry"],
            4,
            4,
            "Dune%",
        ]);
        expect(query.mock.calls[1]?.[1]).toEqual([
            "%Dune%",
            ["Fiction", "Poetry"],
        ]);
    });

    it("returns null when the inserted ISBN already exists", async () => {
        query.mockResolvedValueOnce({ rows: [] } as never);

        const result = await booksRepository.createBook({
            title: "Existing title",
            author: "Test author",
            isbn: "9780000000000",
            category: "Fiction",
        });

        expect(result).toBeNull();
        expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (isbn) DO NOTHING");
    });

    it("passes all update-book request fields to the repository query", async () => {
        query.mockResolvedValueOnce({
            rows: [
                {
                    _id: "12",
                    title: "Updated title",
                    author: "Updated author",
                    isbn: "9780000000001",
                    category: "Fiction",
                    genre: null,
                    keywords: ["adventure"],
                    publisher: null,
                    publishedYear: null,
                    language: "English",
                    format: "Paperback",
                    pageCount: null,
                    description: null,
                    coverImageUrl: null,
                    shelfReference: null,
                    createdAt: "2026-11-18 00:00:00+00",
                    updatedAt: "2026-11-18 00:00:00+00",
                },
            ],
        } as never);

        const result = await booksRepository.updateBookById("12", {
            title: "Updated title",
            author: "Updated author",
            isbn: "9780000000001",
            category: "Fiction",
            publisher: null,
            keywords: ["adventure"],
            genre: null,
            publishedYear: null,
            language: "English",
            format: "Paperback",
            pageCount: null,
            description: null,
            coverImageUrl: null,
            shelfReference: null,
        });

        expect(result).toMatchObject({
            _id: "12",
            title: "Updated title",
            isbn: "9780000000001",
        });
        expect(query.mock.calls[0]?.[1]).toEqual([
            "12",
            "Updated title",
            "Updated author",
            "9780000000001",
            "Fiction",
            ["adventure"],
            null,
            null,
            null,
            "English",
            "Paperback",
            null,
            null,
            null,
            null,
        ]);
    });
});

describe("PhysicalCopiesRepositoryImpl", () => {
    it("returns a copy and its history flags by barcode", async () => {
        query.mockResolvedValueOnce({
            rows: [
                {
                    _id: "7",
                    copyCode: "WB-00421",
                    bookId: "12",
                    homeLocation: "FIC HAI · A3",
                    state: "Available",
                    condition: "Good",
                    notes: null,
                    createdAt: "2026-11-18 00:00:00+00",
                    updatedAt: "2026-11-18 00:00:00+00",
                    hasLoanHistory: false,
                    hasHoldHistory: false,
                },
            ],
        } as never);

        const result =
            await physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(
                "WB-00421",
            );

        expect(result).toMatchObject({
            _id: "7",
            copyCode: "WB-00421",
            bookId: "12",
            hasLoanHistory: false,
            hasHoldHistory: false,
        });
        expect(query.mock.calls[0]?.[0]).toContain("pc.copy_code = $1");
    });
});
