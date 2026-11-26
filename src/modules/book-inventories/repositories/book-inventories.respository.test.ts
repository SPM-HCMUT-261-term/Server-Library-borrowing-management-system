import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PoolClient } from "pg";

import { pool } from "@shared/database/db.js";
import {
    BooksRepositoryImpl,
    PhysicalCopiesRepositoryImpl,
} from "./book-inventories.repository.js";
import type {
    BooksRepository,
    PhysicalCopiesRepository,
} from "./book-inventories.repository.interface.js";

const booksRepository: BooksRepository = new BooksRepositoryImpl(pool);
const copiesRepository: PhysicalCopiesRepository = new PhysicalCopiesRepositoryImpl(pool);

// ---------------------------------------------------------------------------
// Fixture (seed) data
//
// Books (listed in updated_at order, newest first):
//
//  title                       category        genre                lang        year  copies
//  --------------------------- --------------- -------------------- ----------- ----- -------------------------------------------
//  The Midnight Library        Fiction         Contemporary fiction English      2020  421 Available, 422 Borrowed, 423 Reserved, 424 Damaged
//  Wonder                      Fiction         Realistic fiction    English      2012  216 Borrowed, 217 Available
//  A Brief History of Time     Non-fiction     Science              English      1988  632 Borrowed
//  Persepolis                  Graphic novels  Memoir               English      2003  700 Lost
//  Oxford English Dictionary   Reference       Dictionary           English      2010  800 Available
//  Truyện Kiều                 Poetry          Epic poem            Vietnamese   NULL  (no copies)
//
// Loans : BR-1000 (421, Amira, Returned) · BR-1001 (422, Amira, Active) · BR-1002 (632, Maya, Active)
//         BR-1003 (216, STU004, Active)
// Holds : HLD-1001 (423, Maya, Ready)
// ---------------------------------------------------------------------------

const ISBN = {
    midnight: "9781786892737",
    wonder: "9780375869020",
    briefHistory: "9780553380163",
    persepolis: "9780375714832",
    dictionary: "9780199640942",
    truyenKieu: "9786041000001",
} as const;

const COPY = {
    midnightAvailable: "WB-00421",
    midnightBorrowed: "WB-00422",
    midnightReserved: "WB-00423",
    midnightDamaged: "WB-00424",
    wonderBorrowed: "WB-00216",
    wonderAvailable: "WB-00217",
    briefBorrowed: "WB-00632",
    persepolisLost: "WB-00700",
    dictionaryAvailable: "WB-00800",
} as const;

const ACCOUNT = {
    maya: "STU001",
    amira: "STU002",
    inactive: "STU003",
    limitReached: "STU004",
    fresh: "STU005",
    staff: "STF001",
} as const;

interface SeedBook {
    title: string;
    author: string;
    isbn: string;
    category: string;
    genre: string | null;
    keywords: string[];
    publisher: string | null;
    publishedYear: number | null;
    language: string;
    shelfReference: string | null;
    updatedAt: string; // explicit so getFeaturedBooks ordering is deterministic
}

async function insertId(client: PoolClient, sql: string, values: unknown[]): Promise<number> {
    const result = await client.query<{ id: number }>(sql, values);
    const id = result.rows[0]?.id;
    if (id === undefined) {
        throw new Error("Book inventories seed insert did not return an id");
    }
    return id;
}

function insertUser(
    client: PoolClient,
    accountId: string,
    fullName: string,
    role: "student" | "staff",
    status: "Active" | "Inactive",
    maxLoansLimit: number,
): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO users (account_id, full_name, password_hash, role, status, year_group, max_loans_limit)
            VALUES ($1, $2, 'seed-password', $3, $4, $5, $6)
            RETURNING id
        `,
        [accountId, fullName, role, status, role === "student" ? "Year 10" : null, maxLoansLimit],
    );
}

function insertBook(client: PoolClient, book: SeedBook): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO books (
                title, author, isbn, category, genre, keywords, publisher,
                published_year, language, shelf_reference, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6::text[], $7, $8, $9, $10, $11)
            RETURNING id
        `,
        [
            book.title,
            book.author,
            book.isbn,
            book.category,
            book.genre,
            book.keywords,
            book.publisher,
            book.publishedYear,
            book.language,
            book.shelfReference,
            book.updatedAt,
        ],
    );
}

function insertCopy(
    client: PoolClient,
    copyCode: string,
    bookId: number,
    homeLocation: string,
    state: string,
    condition: string,
): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO physical_copies (copy_code, book_id, home_location, state, condition)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `,
        [copyCode, bookId, homeLocation, state, condition],
    );
}

function insertLoan(
    client: PoolClient,
    borrowCode: string,
    studentId: number,
    copyId: number,
    status: "Active" | "Returned",
    dueDate: string,
): Promise<number> {
    const isReturned = status === "Returned";
    return insertId(
        client,
        `
            INSERT INTO loans (
                borrow_code, student_id, copy_id, status, borrowed_at,
                due_date, returned_at, return_condition
            )
            VALUES ($1, $2, $3, $4, '2026-10-01T09:00:00Z', $5, $6, $7)
            RETURNING id
        `,
        [
            borrowCode,
            studentId,
            copyId,
            status,
            dueDate,
            isReturned ? "2026-10-14T09:00:00Z" : null,
            isReturned ? "Good" : null,
        ],
    );
}

async function seedBookInventoriesData() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const userIds = {
            maya: await insertUser(client, ACCOUNT.maya, "Maya Chen", "student", "Active", 5),
            amira: await insertUser(client, ACCOUNT.amira, "Amira Khan", "student", "Active", 5),
            inactive: await insertUser(client, ACCOUNT.inactive, "Inactive Student", "student", "Inactive", 5),
            limitReached: await insertUser(client, ACCOUNT.limitReached, "Limit Reached Student", "student", "Active", 1),
            fresh: await insertUser(client, ACCOUNT.fresh, "Fresh Student", "student", "Active", 5),
            staff: await insertUser(client, ACCOUNT.staff, "Library Staff", "staff", "Active", 5),
        };

        const bookIds = {
            midnight: await insertBook(client, {
                title: "The Midnight Library",
                author: "Matt Haig",
                isbn: ISBN.midnight,
                category: "Fiction",
                genre: "Contemporary fiction",
                keywords: ["Choices & possibilities", "Fantasy", "Contemporary"],
                publisher: "Canongate Books",
                publishedYear: 2020,
                language: "English",
                shelfReference: "FIC HAI · A3",
                updatedAt: "2026-10-06T00:00:00Z",
            }),
            wonder: await insertBook(client, {
                title: "Wonder",
                author: "R.J. Palacio",
                isbn: ISBN.wonder,
                category: "Fiction",
                genre: "Realistic fiction",
                keywords: ["Kindness", "School"],
                publisher: "Knopf",
                publishedYear: 2012,
                language: "English",
                shelfReference: "FIC PAL · A2",
                updatedAt: "2026-10-05T00:00:00Z",
            }),
            briefHistory: await insertBook(client, {
                title: "A Brief History of Time",
                author: "Stephen Hawking",
                isbn: ISBN.briefHistory,
                category: "Non-fiction",
                genre: "Science",
                keywords: ["Cosmology", "Physics"],
                publisher: "Bantam Books",
                publishedYear: 1988,
                language: "English",
                shelfReference: "SCI HAW · B2",
                updatedAt: "2026-10-04T00:00:00Z",
            }),
            persepolis: await insertBook(client, {
                title: "Persepolis",
                author: "Marjane Satrapi",
                isbn: ISBN.persepolis,
                category: "Graphic novels",
                genre: "Memoir",
                keywords: ["Iran", "Memoir"],
                publisher: "Pantheon",
                publishedYear: 2003,
                language: "English",
                shelfReference: "GRA SAT · C1",
                updatedAt: "2026-10-03T00:00:00Z",
            }),
            dictionary: await insertBook(client, {
                title: "Oxford English Dictionary",
                author: "Oxford University Press",
                isbn: ISBN.dictionary,
                category: "Reference",
                genre: "Dictionary",
                keywords: ["English", "Language"],
                publisher: "Oxford University Press",
                publishedYear: 2010,
                language: "English",
                shelfReference: "REF OXF · D1",
                updatedAt: "2026-10-02T00:00:00Z",
            }),
            truyenKieu: await insertBook(client, {
                title: "Truyện Kiều",
                author: "Nguyễn Du",
                isbn: ISBN.truyenKieu,
                category: "Poetry",
                genre: "Epic poem",
                keywords: ["Vietnamese literature"],
                publisher: null,
                publishedYear: null, // NULL on purpose: sortBy=publishedYear must put it last
                language: "Vietnamese",
                shelfReference: null,
                updatedAt: "2026-10-01T00:00:00Z",
            }),
        };

        const copyIds = {
            midnightAvailable: await insertCopy(client, COPY.midnightAvailable, bookIds.midnight, "FIC HAI · A3", "Available", "Good"),
            midnightBorrowed: await insertCopy(client, COPY.midnightBorrowed, bookIds.midnight, "FIC HAI · A3", "Borrowed", "Good"),
            midnightReserved: await insertCopy(client, COPY.midnightReserved, bookIds.midnight, "FIC HAI · A3", "Reserved", "Good"),
            midnightDamaged: await insertCopy(client, COPY.midnightDamaged, bookIds.midnight, "FIC HAI · A3", "Damaged", "Damaged"),
            wonderBorrowed: await insertCopy(client, COPY.wonderBorrowed, bookIds.wonder, "FIC PAL · A2", "Borrowed", "Good"),
            wonderAvailable: await insertCopy(client, COPY.wonderAvailable, bookIds.wonder, "FIC PAL · A2", "Available", "Good"),
            briefBorrowed: await insertCopy(client, COPY.briefBorrowed, bookIds.briefHistory, "SCI HAW · B2", "Borrowed", "Good"),
            persepolisLost: await insertCopy(client, COPY.persepolisLost, bookIds.persepolis, "GRA SAT · C1", "Lost", "Lost"),
            dictionaryAvailable: await insertCopy(client, COPY.dictionaryAvailable, bookIds.dictionary, "REF OXF · D1", "Available", "Good"),
        };

        await insertLoan(client, "BR-1000", userIds.amira, copyIds.midnightAvailable, "Returned", "2026-10-15");
        await insertLoan(client, "BR-1001", userIds.amira, copyIds.midnightBorrowed, "Active", "2026-12-01");
        await insertLoan(client, "BR-1002", userIds.maya, copyIds.briefBorrowed, "Active", "2026-12-05");
        await insertLoan(client, "BR-1003", userIds.limitReached, copyIds.wonderBorrowed, "Active", "2026-12-03");

        // collect_by is 12:00 UTC so to_char(..., 'YYYY-MM-DD') gives the same calendar
        // day for any database time zone between UTC-12 and UTC+11.
        await client.query(
            `
                INSERT INTO holds (hold_code, student_id, book_id, copy_id, status, collect_by)
                VALUES ('HLD-1001', $1, $2, $3, 'Ready', '2026-12-02T12:00:00Z')
            `,
            [userIds.maya, bookIds.midnight, copyIds.midnightReserved],
        );

        await client.query("COMMIT");
        return { userIds, bookIds, copyIds };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

type Fixture = Awaited<ReturnType<typeof seedBookInventoriesData>>;

async function truncateAllTables(): Promise<void> {
    await pool.query(`
        TRUNCATE TABLE
            fines,
            loans,
            holds,
            physical_copies,
            books,
            users
        RESTART IDENTITY CASCADE
    `);
}

const titlesOf = (books: { title: string }[]): string[] => books.map((book) => book.title);

let fixture: Fixture;

describe("BookInventories repositories", () => {
    beforeEach(async () => {
        await truncateAllTables();
        fixture = await seedBookInventoriesData();
    });

    afterEach(async () => {
        await truncateAllTables();
    });

    // afterAll(async () => {
    //     await pool.end();
    // });

    // =======================================================================
    // BooksRepository
    // =======================================================================
    describe("BooksRepository", () => {
        describe("getFeaturedBooks", () => {
            it("returns the most recently updated titles first, with a stock summary", async () => {
                const result = await booksRepository.getFeaturedBooks(3);

                expect(titlesOf(result)).toEqual([
                    "The Midnight Library",
                    "Wonder",
                    "A Brief History of Time",
                ]);
                expect(result[0]).toEqual({
                    _id: String(fixture.bookIds.midnight),
                    title: "The Midnight Library",
                    author: "Matt Haig",
                    category: "Fiction",
                    genre: "Contemporary fiction",
                    coverImageUrl: null,
                    shelfReference: "FIC HAI · A3",
                    stockSummary: { totalCopies: 4, availableCopies: 1, isAvailableNow: true },
                });
                // console.log("getFeaturedBooks(3):", result);
            });

            it("returns every title when the limit is larger than the catalog and keeps titles without copies", async () => {
                const result = await booksRepository.getFeaturedBooks(10);

                expect(result).toHaveLength(6);
                expect(result[5]).toMatchObject({
                    title: "Truyện Kiều",
                    stockSummary: { totalCopies: 0, availableCopies: 0, isAvailableNow: false },
                });
                // console.log("getFeaturedBooks(10):", result);
            });

            it("rejects a non-positive limit", async () => {
                await expect(booksRepository.getFeaturedBooks(0)).rejects.toThrow(RangeError);
                // console.log("getFeaturedBooks(0) rejected with RangeError");
            });
        });

        describe("getBooks", () => {
            it("returns every title sorted by title when no filter is given", async () => {
                const result = await booksRepository.getBooks({});

                expect(result.totalItems).toBe(6);
                expect(titlesOf(result.books)).toEqual([
                    "A Brief History of Time",
                    "Oxford English Dictionary",
                    "Persepolis",
                    "The Midnight Library",
                    "Truyện Kiều",
                    "Wonder",
                ]);
                // console.log("getBooks({}):", result);
            });

            it("maps each item with its stock summary", async () => {
                const result = await booksRepository.getBooks({ q: "midnight" });

                expect(result.books).toEqual([
                    {
                        _id: String(fixture.bookIds.midnight),
                        title: "The Midnight Library",
                        author: "Matt Haig",
                        isbn: ISBN.midnight,
                        category: "Fiction",
                        genre: "Contemporary fiction",
                        language: "English",
                        publisher: "Canongate Books",
                        keywords: ["Choices & possibilities", "Fantasy", "Contemporary"],
                        coverImageUrl: null,
                        shelfReference: "FIC HAI · A3",
                        stockSummary: {
                            totalCopies: 4,
                            availableCopies: 1,
                            borrowedCopies: 1,
                            reservedCopies: 1,
                            isAvailableNow: true,
                        },
                    },
                ]);
                // console.log("getBooks({ q: 'midnight' }):", result);
            });

            it("searches title, author, isbn, category and keywords case-insensitively", async () => {
                const byTitle = await booksRepository.getBooks({ q: "MIDNIGHT" });
                expect(titlesOf(byTitle.books)).toEqual(["The Midnight Library"]);
                // console.log("q title:", byTitle);

                const byAuthor = await booksRepository.getBooks({ q: "hawking" });
                expect(titlesOf(byAuthor.books)).toEqual(["A Brief History of Time"]);
                // console.log("q author:", byAuthor);

                const byIsbn = await booksRepository.getBooks({ q: "199640" });
                expect(titlesOf(byIsbn.books)).toEqual(["Oxford English Dictionary"]);
                // console.log("q isbn:", byIsbn);

                const byCategory = await booksRepository.getBooks({ q: "poetry" });
                expect(titlesOf(byCategory.books)).toEqual(["Truyện Kiều"]);
                // console.log("q category:", byCategory);

                const byKeyword = await booksRepository.getBooks({ q: "cosmology" });
                expect(titlesOf(byKeyword.books)).toEqual(["A Brief History of Time"]);
                // console.log("q keyword:", byKeyword);

                const noMatch = await booksRepository.getBooks({ q: "no such book" });
                expect(noMatch).toEqual({ books: [], totalItems: 0 });
                // console.log("q no match:", noMatch);
            });

            it("ignores a blank search query", async () => {
                const result = await booksRepository.getBooks({ q: "   " });

                expect(result.totalItems).toBe(6);
                // console.log("getBooks({ q: '   ' }):", result);
            });

            it("ranks title-prefix matches first in relevance order and sorts alphabetically with sortBy=title", async () => {
                // "w" matches Wonder by title prefix and A Brief History of Time only by the author "Hawking".
                const relevance = await booksRepository.getBooks({ q: "w", sortBy: "relevance" });
                expect(titlesOf(relevance.books)).toEqual(["Wonder", "A Brief History of Time"]);
                // console.log("relevance:", relevance);

                const byTitle = await booksRepository.getBooks({ q: "w", sortBy: "title" });
                expect(titlesOf(byTitle.books)).toEqual(["A Brief History of Time", "Wonder"]);
                // console.log("title:", byTitle);
            });

            it("filters by category (single value and comma-separated list)", async () => {
                const fiction = await booksRepository.getBooks({ category: "Fiction" });
                expect(titlesOf(fiction.books)).toEqual(["The Midnight Library", "Wonder"]);
                expect(fiction.totalItems).toBe(2);
                // console.log("category Fiction:", fiction);

                const fictionAndPoetry = await booksRepository.getBooks({ category: "Fiction , Poetry" });
                expect(titlesOf(fictionAndPoetry.books)).toEqual([
                    "The Midnight Library",
                    "Truyện Kiều",
                    "Wonder",
                ]);
                // console.log("category Fiction , Poetry:", fictionAndPoetry);
            });

            it("filters by genre (single value and comma-separated list)", async () => {
                const science = await booksRepository.getBooks({ genre: "Science" });
                expect(titlesOf(science.books)).toEqual(["A Brief History of Time"]);
                // console.log("genre Science:", science);

                const fictionGenres = await booksRepository.getBooks({
                    genre: "Contemporary fiction,Realistic fiction",
                });
                expect(titlesOf(fictionGenres.books)).toEqual(["The Midnight Library", "Wonder"]);
                // console.log("genre list:", fictionGenres);
            });

            it("filters by language", async () => {
                const vietnamese = await booksRepository.getBooks({ language: "Vietnamese" });
                expect(titlesOf(vietnamese.books)).toEqual(["Truyện Kiều"]);
                // console.log("language Vietnamese:", vietnamese);

                const english = await booksRepository.getBooks({ language: "English" });
                expect(english.totalItems).toBe(5);
                expect(titlesOf(english.books)).not.toContain("Truyện Kiều");
                // console.log("language English:", english);
            });

            it("filters titles that can be borrowed now with availableNow", async () => {
                const availableNow = await booksRepository.getBooks({ availableNow: true });
                expect(titlesOf(availableNow.books)).toEqual([
                    "Oxford English Dictionary",
                    "The Midnight Library",
                    "Wonder",
                ]);
                expect(availableNow.totalItems).toBe(3);
                // console.log("availableNow true:", availableNow);

                // availableNow=false is not a filter, only `true` restricts the list
                const notRestricted = await booksRepository.getBooks({ availableNow: false });
                expect(notRestricted.totalItems).toBe(6);
                // console.log("availableNow false:", notRestricted);
            });

            it("filters by stock availability", async () => {
                const available = await booksRepository.getBooks({ stock: "available" });
                expect(titlesOf(available.books)).toEqual([
                    "Oxford English Dictionary",
                    "The Midnight Library",
                    "Wonder",
                ]);
                // console.log("stock available:", available);

                const unavailable = await booksRepository.getBooks({ stock: "unavailable" });
                expect(titlesOf(unavailable.books)).toEqual([
                    "A Brief History of Time",
                    "Persepolis",
                    "Truyện Kiều",
                ]);
                // console.log("stock unavailable:", unavailable);

                const all = await booksRepository.getBooks({ stock: "all" });
                expect(all.totalItems).toBe(6);
                // console.log("stock all:", all);
            });

            it("sorts by published year (newest first, unknown year last)", async () => {
                const byYear = await booksRepository.getBooks({ sortBy: "publishedYear" });
                expect(titlesOf(byYear.books)).toEqual([
                    "The Midnight Library",
                    "Wonder",
                    "Oxford English Dictionary",
                    "Persepolis",
                    "A Brief History of Time",
                    "Truyện Kiều",
                ]);
                // console.log("sortBy publishedYear:", byYear);
            });

            it("paginates and reports the total number of matching titles", async () => {
                const firstPage = await booksRepository.getBooks({ page: 1, limit: 2 });
                expect(titlesOf(firstPage.books)).toEqual(["A Brief History of Time", "Oxford English Dictionary"]);
                expect(firstPage.totalItems).toBe(6);
                // console.log("page 1:", firstPage);

                const lastPage = await booksRepository.getBooks({ page: 3, limit: 2 });
                expect(titlesOf(lastPage.books)).toEqual(["Truyện Kiều", "Wonder"]);
                expect(lastPage.totalItems).toBe(6);
                // console.log("page 3:", lastPage);

                const beyondLastPage = await booksRepository.getBooks({ page: 4, limit: 2 });
                expect(beyondLastPage.books).toEqual([]);
                expect(beyondLastPage.totalItems).toBe(6);
                // console.log("page 4:", beyondLastPage);
            });

            it("combines filters with AND", async () => {
                const fictionAvailable = await booksRepository.getBooks({
                    category: "Fiction",
                    availableNow: true,
                });
                expect(titlesOf(fictionAvailable.books)).toEqual(["The Midnight Library", "Wonder"]);
                // console.log("Fiction + availableNow:", fictionAvailable);

                const fictionUnavailable = await booksRepository.getBooks({
                    category: "Fiction",
                    stock: "unavailable",
                });
                expect(fictionUnavailable).toEqual({ books: [], totalItems: 0 });
                // console.log("Fiction + unavailable:", fictionUnavailable);
            });

            it("rejects invalid paging, stock and sort values", async () => {
                await expect(booksRepository.getBooks({ page: 0 })).rejects.toThrow(RangeError);
                await expect(booksRepository.getBooks({ limit: 0 })).rejects.toThrow(RangeError);
                await expect(booksRepository.getBooks({ stock: "bogus" as never })).rejects.toThrow(RangeError);
                await expect(booksRepository.getBooks({ sortBy: "bogus" as never })).rejects.toThrow(RangeError);
                // console.log("getBooks invalid params rejected with RangeError");
            });
        });

        describe("getBookById", () => {
            it("returns the full book metadata for an existing id", async () => {
                const result = await booksRepository.getBookById(String(fixture.bookIds.midnight));

                expect(result).toMatchObject({
                    _id: String(fixture.bookIds.midnight),
                    title: "The Midnight Library",
                    author: "Matt Haig",
                    isbn: ISBN.midnight,
                    category: "Fiction",
                    genre: "Contemporary fiction",
                    keywords: ["Choices & possibilities", "Fantasy", "Contemporary"],
                    publisher: "Canongate Books",
                    publishedYear: 2020,
                    language: "English",
                    format: "Paperback",
                    pageCount: null,
                    description: null,
                    coverImageUrl: null,
                    shelfReference: "FIC HAI · A3",
                });
                expect(result?.createdAt).toEqual(expect.any(String));
                expect(result?.updatedAt).toEqual(expect.any(String));
                // console.log("getBookById:", result);
            });

            it("returns null for an unknown id and does not accept an isbn", async () => {
                const missing = await booksRepository.getBookById("999999");
                expect(missing).toBeNull();
                // console.log("getBookById missing:", missing);

                const byIsbn = await booksRepository.getBookById(ISBN.midnight);
                expect(byIsbn).toBeNull();
                // console.log("getBookById by isbn:", byIsbn);
            });
        });

        describe("getBooksWithSummaryInfoById", () => {
            it("returns the book with the stock summary derived from its copies", async () => {
                const result = await booksRepository.getBooksWithSummaryInfoById(String(fixture.bookIds.midnight));

                expect(result).toMatchObject({
                    _id: String(fixture.bookIds.midnight),
                    title: "The Midnight Library",
                    stockSummary: {
                        totalCopies: 4,
                        availableCopies: 1,
                        borrowedCopies: 1,
                        reservedCopies: 1,
                        damagedCopies: 1,
                        lostCopies: 0,
                        isAvailableNow: true,
                    },
                });
                // console.log("getBooksWithSummaryInfoById:", result);
            });

            it("returns an all-zero summary for a title without copies and counts lost copies", async () => {
                const withoutCopies = await booksRepository.getBooksWithSummaryInfoById(
                    String(fixture.bookIds.truyenKieu),
                );
                expect(withoutCopies?.stockSummary).toEqual({
                    totalCopies: 0,
                    availableCopies: 0,
                    borrowedCopies: 0,
                    reservedCopies: 0,
                    damagedCopies: 0,
                    lostCopies: 0,
                    isAvailableNow: false,
                });
                // console.log("summary without copies:", withoutCopies);

                const withLostCopy = await booksRepository.getBooksWithSummaryInfoById(
                    String(fixture.bookIds.persepolis),
                );
                expect(withLostCopy?.stockSummary).toEqual({
                    totalCopies: 1,
                    availableCopies: 0,
                    borrowedCopies: 0,
                    reservedCopies: 0,
                    damagedCopies: 0,
                    lostCopies: 1,
                    isAvailableNow: false,
                });
                // console.log("summary with lost copy:", withLostCopy);
            });

            it("returns null for an unknown id", async () => {
                const missing = await booksRepository.getBooksWithSummaryInfoById("999999");

                expect(missing).toBeNull();
                // console.log("getBooksWithSummaryInfoById missing:", missing);
            });
        });

        describe("getBooksWithSummaryInfoByIdOrIsbn", () => {
            it("finds a book by id or by isbn", async () => {
                const byId = await booksRepository.getBooksWithSummaryInfoByIdOrIsbn(String(fixture.bookIds.wonder));
                expect(byId).toMatchObject({ title: "Wonder", stockSummary: { totalCopies: 2, availableCopies: 1 } });
                // console.log("by id:", byId);

                const byIsbn = await booksRepository.getBooksWithSummaryInfoByIdOrIsbn(ISBN.wonder);
                expect(byIsbn).toMatchObject({ _id: String(fixture.bookIds.wonder), title: "Wonder" });
                // console.log("by isbn:", byIsbn);
            });

            it("prefers the id match when another book's isbn looks like that id", async () => {
                await pool.query(
                    `
                        INSERT INTO books (title, author, isbn, category)
                        VALUES ('Isbn Looks Like An Id', 'Tester', $1, 'Fiction')
                    `,
                    [String(fixture.bookIds.wonder)],
                );

                const result = await booksRepository.getBooksWithSummaryInfoByIdOrIsbn(String(fixture.bookIds.wonder));

                expect(result?.title).toBe("Wonder");
                // console.log("id wins over isbn:", result);
            });

            it("returns null when neither id nor isbn matches", async () => {
                const missing = await booksRepository.getBooksWithSummaryInfoByIdOrIsbn("0000000000000");

                expect(missing).toBeNull();
                // console.log("getBooksWithSummaryInfoByIdOrIsbn missing:", missing);
            });
        });

        describe("getBookByIsbn", () => {
            it("returns the book metadata (without stock summary) for an isbn", async () => {
                const result = await booksRepository.getBookByIsbn(ISBN.persepolis);

                expect(result).toMatchObject({
                    _id: String(fixture.bookIds.persepolis),
                    title: "Persepolis",
                    isbn: ISBN.persepolis,
                });
                expect(result).not.toHaveProperty("stockSummary");
                // console.log("getBookByIsbn:", result);
            });

            it("returns null for an unknown isbn", async () => {
                const missing = await booksRepository.getBookByIsbn("0000000000000");

                expect(missing).toBeNull();
                // console.log("getBookByIsbn missing:", missing);
            });
        });

        describe("getBookViewerContext", () => {
            it("allows a student without loans to borrow a title that has an available copy", async () => {
                const result = await booksRepository.getBookViewerContext(
                    String(fixture.userIds.fresh),
                    String(fixture.bookIds.midnight),
                );

                expect(result).toEqual({
                    canBorrow: true,
                    canRequestHold: false,
                    blockReason: null,
                    activeLoansCount: 0,
                    maxLoansLimit: 5,
                    existingHoldCode: null,
                });
                // console.log("viewer context (available copy):", result);
            });

            it("allows a hold request when no copy is available", async () => {
                const result = await booksRepository.getBookViewerContext(
                    String(fixture.userIds.fresh),
                    String(fixture.bookIds.briefHistory),
                );

                expect(result).toEqual({
                    canBorrow: false,
                    canRequestHold: true,
                    blockReason: null,
                    activeLoansCount: 0,
                    maxLoansLimit: 5,
                    existingHoldCode: null,
                });
                // console.log("viewer context (no copy available):", result);
            });

            it("returns the existing hold code and the current loan count", async () => {
                const result = await booksRepository.getBookViewerContext(
                    String(fixture.userIds.maya),
                    String(fixture.bookIds.midnight),
                );

                expect(result).toEqual({
                    canBorrow: true,
                    canRequestHold: false,
                    blockReason: null,
                    activeLoansCount: 1,
                    maxLoansLimit: 5,
                    existingHoldCode: "HLD-1001",
                });
                // console.log("viewer context (existing hold):", result);
            });

            it("blocks a student who is already borrowing the title", async () => {
                const result = await booksRepository.getBookViewerContext(
                    String(fixture.userIds.maya),
                    String(fixture.bookIds.briefHistory),
                );

                expect(result).toMatchObject({
                    canBorrow: false,
                    canRequestHold: false,
                    blockReason: "You are already borrowing this title",
                    activeLoansCount: 1,
                });
                // console.log("viewer context (already borrowing):", result);
            });

            it("blocks an inactive account", async () => {
                const result = await booksRepository.getBookViewerContext(
                    String(fixture.userIds.inactive),
                    String(fixture.bookIds.midnight),
                );

                expect(result).toMatchObject({
                    canBorrow: false,
                    canRequestHold: false,
                    blockReason: "Your account is inactive",
                });
                // console.log("viewer context (inactive account):", result);
            });

            it("blocks a student who reached the loan limit", async () => {
                const result = await booksRepository.getBookViewerContext(
                    String(fixture.userIds.limitReached),
                    String(fixture.bookIds.midnight),
                );

                expect(result).toMatchObject({
                    canBorrow: false,
                    canRequestHold: false,
                    blockReason: "You have reached your loan limit",
                    activeLoansCount: 1,
                    maxLoansLimit: 1,
                });
                // console.log("viewer context (loan limit):", result);
            });

            it("returns null for an unknown user or an unknown book", async () => {
                const unknownUser = await booksRepository.getBookViewerContext(
                    "999999",
                    String(fixture.bookIds.midnight),
                );
                expect(unknownUser).toBeNull();
                // console.log("viewer context unknown user:", unknownUser);

                const unknownBook = await booksRepository.getBookViewerContext(
                    String(fixture.userIds.fresh),
                    "999999",
                );
                expect(unknownBook).toBeNull();
                // console.log("viewer context unknown book:", unknownBook);
            });
        });

        describe("createBook", () => {
            it("creates a book with every metadata field and persists it", async () => {
                const created = await booksRepository.createBook({
                    title: "The Wild Robot",
                    author: "Peter Brown",
                    isbn: "9781848127272",
                    category: "Fiction",
                    keywords: ["Robots", "nature", "friendship"],
                    publisher: "Piccadilly Press",
                    genre: "Science fiction",
                    publishedYear: 2016,
                    language: "English",
                    format: "Hardcover",
                    pageCount: 288,
                    description: "A robot learns to survive on a remote island.",
                    coverImageUrl: "https://example.com/wild-robot.jpg",
                    shelfReference: "FIC BRO · A4",
                });

                expect(created).toMatchObject({
                    title: "The Wild Robot",
                    author: "Peter Brown",
                    isbn: "9781848127272",
                    category: "Fiction",
                    keywords: ["Robots", "nature", "friendship"],
                    publisher: "Piccadilly Press",
                    genre: "Science fiction",
                    publishedYear: 2016,
                    language: "English",
                    format: "Hardcover",
                    pageCount: 288,
                    description: "A robot learns to survive on a remote island.",
                    coverImageUrl: "https://example.com/wild-robot.jpg",
                    shelfReference: "FIC BRO · A4",
                });
                // console.log("createBook:", created);

                const persisted = await booksRepository.getBookById(created?._id ?? "");
                expect(persisted).toEqual(created);
                // console.log("createBook persisted:", persisted);

                const catalog = await booksRepository.getBooks({});
                expect(catalog.totalItems).toBe(7);
                // console.log("createBook catalog:", catalog);
            });

            it("stores NULL for omitted optional fields", async () => {
                const created = await booksRepository.createBook({
                    title: "Minimal Book",
                    author: "Minimal Author",
                    isbn: "9780000000002",
                    category: "Reference",
                });

                expect(created).toMatchObject({
                    title: "Minimal Book",
                    keywords: [],
                    publisher: null,
                    genre: null,
                    publishedYear: null,
                    language: null,
                    format: null,
                    pageCount: null,
                    description: null,
                    coverImageUrl: null,
                    shelfReference: null,
                });
                // console.log("createBook minimal:", created);
            });

            it("returns null for a duplicate isbn and does not add a row", async () => {
                const duplicate = await booksRepository.createBook({
                    title: "Duplicate Isbn Book",
                    author: "Someone",
                    isbn: ISBN.midnight,
                    category: "Fiction",
                });

                expect(duplicate).toBeNull();
                // console.log("createBook duplicate:", duplicate);

                const catalog = await booksRepository.getBooks({});
                expect(catalog.totalItems).toBe(6);
                const original = await booksRepository.getBookByIsbn(ISBN.midnight);
                expect(original?.title).toBe("The Midnight Library");
                // console.log("createBook duplicate catalog:", catalog);
            });
        });

        describe("updateBookById", () => {
            it("updates the metadata, keeps createdAt and refreshes updatedAt", async () => {
                const bookId = String(fixture.bookIds.midnight);
                const before = await booksRepository.getBookById(bookId);

                const updated = await booksRepository.updateBookById(bookId, {
                    title: "The Midnight Library (Updated)",
                    author: "Matt Haig",
                    isbn: ISBN.midnight, // keeping its own isbn must not count as a duplicate
                    category: "Fiction",
                    keywords: ["Regret", "Parallel lives"],
                    publisher: "Canongate",
                    genre: "Fantasy",
                    publishedYear: 2021,
                    language: "English",
                    format: "Hardcover",
                    pageCount: 304,
                    description: "Between life and death there is a library.",
                    coverImageUrl: "https://example.com/midnight.jpg",
                    shelfReference: "FIC HAI · A4",
                });

                expect(updated).toMatchObject({
                    _id: bookId,
                    title: "The Midnight Library (Updated)",
                    keywords: ["Regret", "Parallel lives"],
                    publisher: "Canongate",
                    genre: "Fantasy",
                    publishedYear: 2021,
                    format: "Hardcover",
                    pageCount: 304,
                    description: "Between life and death there is a library.",
                    coverImageUrl: "https://example.com/midnight.jpg",
                    shelfReference: "FIC HAI · A4",
                });
                expect(updated?.createdAt).toBe(before?.createdAt);
                expect(updated?.updatedAt).not.toBe(before?.updatedAt);
                // console.log("updateBookById:", updated);

                const persisted = await booksRepository.getBookById(bookId);
                expect(persisted).toEqual(updated);
                // console.log("updateBookById persisted:", persisted);
            });

            it("keeps the current value of omitted optional fields", async () => {
                const bookId = String(fixture.bookIds.midnight);

                const updated = await booksRepository.updateBookById(bookId, {
                    title: "The Midnight Library",
                    author: "Matt Haig",
                    isbn: ISBN.midnight,
                    category: "Fiction",
                });

                expect(updated).toMatchObject({
                    keywords: [
                        "Choices & possibilities",
                        "Fantasy",
                        "Contemporary",
                    ],
                    publisher: "Canongate Books",
                    genre: "Contemporary fiction",
                    publishedYear: 2020,
                    language: "English",
                    format: "Paperback",
                    pageCount: null,
                    description: null,
                    coverImageUrl: null,
                    shelfReference: "FIC HAI · A3",
                });
                // console.log("updateBookById minimal:", updated);
            });

            it("returns null when the isbn belongs to another book and leaves the book unchanged", async () => {
                const wonderId = String(fixture.bookIds.wonder);

                const result = await booksRepository.updateBookById(wonderId, {
                    title: "Wonder (Renamed)",
                    author: "R.J. Palacio",
                    isbn: ISBN.midnight,
                    category: "Fiction",
                });

                expect(result).toBeNull();
                // console.log("updateBookById duplicate isbn:", result);

                const unchanged = await booksRepository.getBookById(wonderId);
                expect(unchanged).toMatchObject({ title: "Wonder", isbn: ISBN.wonder });
                // console.log("updateBookById unchanged:", unchanged);
            });

            it("returns null for an unknown id", async () => {
                const result = await booksRepository.updateBookById("999999", {
                    title: "Ghost",
                    author: "Nobody",
                    isbn: "9780000000099",
                    category: "Fiction",
                });

                expect(result).toBeNull();
                // console.log("updateBookById missing:", result);
            });
        });

        describe("deleteBookById", () => {
            it("deletes a title that has no copies and returns the deleted book", async () => {
                const deleted = await booksRepository.deleteBookById(String(fixture.bookIds.truyenKieu));

                expect(deleted).toMatchObject({
                    _id: String(fixture.bookIds.truyenKieu),
                    title: "Truyện Kiều",
                });
                // console.log("deleteBookById:", deleted);

                const afterDelete = await booksRepository.getBookById(String(fixture.bookIds.truyenKieu));
                expect(afterDelete).toBeNull();
                const catalog = await booksRepository.getBooks({});
                expect(catalog.totalItems).toBe(5);
                // console.log("deleteBookById catalog:", catalog);
            });

            it("refuses to delete a title that still has physical copies", async () => {
                const withLoanHistory = await booksRepository.deleteBookById(String(fixture.bookIds.midnight));
                expect(withLoanHistory).toBeNull();
                // console.log("deleteBookById with loan history:", withLoanHistory);

                const withLostCopyOnly = await booksRepository.deleteBookById(String(fixture.bookIds.persepolis));
                expect(withLostCopyOnly).toBeNull();
                // console.log("deleteBookById with lost copy:", withLostCopyOnly);

                const stillThere = await booksRepository.getBookById(String(fixture.bookIds.midnight));
                expect(stillThere?.title).toBe("The Midnight Library");
            });

            it("returns null for an unknown id", async () => {
                const missing = await booksRepository.deleteBookById("999999");

                expect(missing).toBeNull();
                // console.log("deleteBookById missing:", missing);
            });
        });
    });

    // =======================================================================
    // PhysicalCopiesRepository
    // =======================================================================
    describe("PhysicalCopiesRepository", () => {
        describe("getPhysicalCopyWithLoanAndHoldStateById", () => {
            it("finds a copy by copy code and reports loan history", async () => {
                const result = await copiesRepository.getPhysicalCopyWithLoanAndHoldStateById(COPY.midnightAvailable);

                expect(result).toMatchObject({
                    _id: String(fixture.copyIds.midnightAvailable),
                    copyCode: "WB-00421",
                    bookId: String(fixture.bookIds.midnight),
                    homeLocation: "FIC HAI · A3",
                    state: "Available",
                    condition: "Good",
                    notes: null,
                    hasLoanHistory: true, // returned loan BR-1000
                    hasHoldHistory: false,
                });
                // console.log("by copy code:", result);
            });

            it("finds a copy by its database id", async () => {
                const result = await copiesRepository.getPhysicalCopyWithLoanAndHoldStateById(
                    String(fixture.copyIds.midnightBorrowed),
                );

                expect(result).toMatchObject({
                    copyCode: "WB-00422",
                    state: "Borrowed",
                    hasLoanHistory: true,
                });
                // console.log("by id:", result);
            });

            it("reports hold history separately from loan history", async () => {
                const reserved = await copiesRepository.getPhysicalCopyWithLoanAndHoldStateById(COPY.midnightReserved);
                expect(reserved).toMatchObject({ state: "Reserved", hasLoanHistory: false, hasHoldHistory: true });
                // console.log("reserved copy:", reserved);

                const untouched = await copiesRepository.getPhysicalCopyWithLoanAndHoldStateById(COPY.wonderAvailable);
                expect(untouched).toMatchObject({ state: "Available", hasLoanHistory: false, hasHoldHistory: false });
                // console.log("untouched copy:", untouched);
            });

            it("returns null for an unknown copy", async () => {
                const missing = await copiesRepository.getPhysicalCopyWithLoanAndHoldStateById("WB-99999");

                expect(missing).toBeNull();
                // console.log("getPhysicalCopyWithLoanAndHoldStateById missing:", missing);
            });
        });

        describe("getPyhsicalCopy", () => {
            it("finds a copy by copy code or by id", async () => {
                const byCode = await copiesRepository.getPyhsicalCopy(null, COPY.wonderAvailable);
                expect(byCode).toMatchObject({
                    _id: String(fixture.copyIds.wonderAvailable),
                    copyCode: "WB-00217",
                    bookId: String(fixture.bookIds.wonder),
                    state: "Available",
                });
                // console.log("by code:", byCode);

                const byId = await copiesRepository.getPyhsicalCopy(String(fixture.copyIds.wonderAvailable), null);
                expect(byId).toEqual(byCode);
                // console.log("by id:", byId);
            });

            it("prefers the id when both an id and a different copy code are given", async () => {
                const result = await copiesRepository.getPyhsicalCopy(
                    String(fixture.copyIds.midnightAvailable),
                    COPY.midnightBorrowed,
                );

                expect(result?.copyCode).toBe("WB-00421");
                // console.log("id wins over code:", result);
            });

            it("returns null when nothing is given or nothing matches", async () => {
                const nothing = await copiesRepository.getPyhsicalCopy(null, null);
                expect(nothing).toBeNull();
                // console.log("no id and no code:", nothing);

                const unknown = await copiesRepository.getPyhsicalCopy(null, "WB-99999");
                expect(unknown).toBeNull();
                // console.log("unknown code:", unknown);
            });
        });

        describe("getPhysicalCopiesByBookIdWithActiveLoanAndHold", () => {
            it("lists every copy of a title ordered by copy code with active loan and hold details", async () => {
                const result = await copiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(
                    String(fixture.bookIds.midnight),
                );

                expect(result?.map((copy) => copy.copyCode)).toEqual(["WB-00421", "WB-00422", "WB-00423", "WB-00424"]);

                // Available copy with only a returned loan: no active loan, but it has loan history
                expect(result?.[0]).toMatchObject({
                    _id: String(fixture.copyIds.midnightAvailable),
                    bookId: String(fixture.bookIds.midnight),
                    state: "Available",
                    activeLoan: null,
                    activeHold: null,
                    hasLoanHistory: true,
                });

                // Borrowed copy
                expect(result?.[1]).toMatchObject({
                    state: "Borrowed",
                    activeLoan: {
                        borrowCode: "BR-1001",
                        studentName: "Amira Khan",
                        studentAccountId: "STU002",
                        dueDate: "2026-12-01",
                    },
                    activeHold: null,
                    hasLoanHistory: true,
                });

                // Reserved copy
                expect(result?.[2]).toMatchObject({
                    state: "Reserved",
                    activeLoan: null,
                    activeHold: {
                        holdCode: "HLD-1001",
                        studentName: "Maya Chen",
                        studentAccountId: "STU001",
                        collectBy: "2026-12-02",
                    },
                    hasLoanHistory: false,
                });

                // Damaged copy
                expect(result?.[3]).toMatchObject({
                    state: "Damaged",
                    condition: "Damaged",
                    activeLoan: null,
                    activeHold: null,
                    hasLoanHistory: false,
                });
                // console.log("getPhysicalCopiesByBookIdWithActiveLoanAndHold:", result);
            });

            it("returns an empty list for a title without copies or an unknown title", async () => {
                const withoutCopies = await copiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(
                    String(fixture.bookIds.truyenKieu),
                );
                expect(withoutCopies).toEqual([]);
                // console.log("title without copies:", withoutCopies);

                const unknownBook = await copiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold("999999");
                expect(unknownBook).toEqual([]);
                // console.log("unknown title:", unknownBook);
            });
        });

        describe("addCopyToBookStock", () => {
            it("adds a copy to a title and updates the derived stock", async () => {
                const created = await copiesRepository.addCopyToBookStock({
                    bookId: String(fixture.bookIds.wonder),
                    copyCode: "WB-00218",
                    homeLocation: "FIC PAL · A2",
                    initialState: "Available",
                    condition: "Good",
                    notes: "New paperback copy",
                });

                expect(created).toMatchObject({
                    copyCode: "WB-00218",
                    bookId: String(fixture.bookIds.wonder),
                    homeLocation: "FIC PAL · A2",
                    state: "Available",
                    condition: "Good",
                    notes: "New paperback copy",
                });
                // console.log("addCopyToBookStock:", created);

                const stock = await booksRepository.getBooksWithSummaryInfoById(String(fixture.bookIds.wonder));
                expect(stock?.stockSummary).toMatchObject({ totalCopies: 3, availableCopies: 2, borrowedCopies: 1 });
                // console.log("addCopyToBookStock stock:", stock);
            });

            it("stores a null note when none is given and accepts a damaged initial state", async () => {
                const created = await copiesRepository.addCopyToBookStock({
                    bookId: String(fixture.bookIds.dictionary),
                    copyCode: "WB-00801",
                    homeLocation: "REF OXF · D1",
                    initialState: "Damaged",
                    condition: "Damaged",
                });

                expect(created).toMatchObject({
                    copyCode: "WB-00801",
                    state: "Damaged",
                    condition: "Damaged",
                    notes: null,
                });
                // console.log("addCopyToBookStock damaged:", created);
            });

            it("returns null for a duplicate copy code and does not add a row", async () => {
                const duplicate = await copiesRepository.addCopyToBookStock({
                    bookId: String(fixture.bookIds.wonder),
                    copyCode: COPY.midnightAvailable,
                    homeLocation: "FIC PAL · A2",
                    initialState: "Available",
                    condition: "Good",
                });

                expect(duplicate).toBeNull();
                // console.log("addCopyToBookStock duplicate:", duplicate);

                const stock = await booksRepository.getBooksWithSummaryInfoById(String(fixture.bookIds.wonder));
                expect(stock?.stockSummary.totalCopies).toBe(2);
            });

            it("returns null when the book does not exist", async () => {
                const result = await copiesRepository.addCopyToBookStock({
                    bookId: "999999",
                    copyCode: "WB-12345",
                    homeLocation: "FIC XXX · A1",
                    initialState: "Available",
                    condition: "Good",
                });

                expect(result).toBeNull();
                // console.log("addCopyToBookStock unknown book:", result);
            });
        });

        describe("getSummaryStockAfterAddCopyToBookStock", () => {
            it("returns total, available and borrowed counts of the copy's title", async () => {
                const result = await copiesRepository.getSummaryStockAfterAddCopyToBookStock(
                    String(fixture.copyIds.midnightAvailable),
                );

                expect(result).toEqual({ totalCopies: 4, availableCopies: 1, borrowedCopies: 1 });
                // console.log("getSummaryStockAfterAddCopyToBookStock:", result);
            });

            it("reflects a copy that was just added", async () => {
                const created = await copiesRepository.addCopyToBookStock({
                    bookId: String(fixture.bookIds.wonder),
                    copyCode: "WB-00218",
                    homeLocation: "FIC PAL · A2",
                    initialState: "Available",
                    condition: "Good",
                });

                const result = await copiesRepository.getSummaryStockAfterAddCopyToBookStock(created?._id ?? "");

                expect(result).toEqual({ totalCopies: 3, availableCopies: 2, borrowedCopies: 1 });
                // console.log("summary after add:", result);
            });

            it("returns null for an unknown copy", async () => {
                const missing = await copiesRepository.getSummaryStockAfterAddCopyToBookStock("999999");

                expect(missing).toBeNull();
                // console.log("getSummaryStockAfterAddCopyToBookStock missing:", missing);
            });
        });

        describe("getSummaryStockAfterUpdateCopyToBookStock", () => {
            it("returns every stock counter of the copy's title", async () => {
                const result = await copiesRepository.getSummaryStockAfterUpdateCopyToBookStock(
                    String(fixture.copyIds.midnightAvailable),
                );

                expect(result).toEqual({
                    totalCopies: 4,
                    availableCopies: 1,
                    borrowedCopies: 1,
                    reservedCopies: 1,
                    damagedCopies: 1,
                    lostCopies: 0,
                });
                // console.log("getSummaryStockAfterUpdateCopyToBookStock:", result);
            });

            it("returns null for an unknown copy", async () => {
                const missing = await copiesRepository.getSummaryStockAfterUpdateCopyToBookStock("999999");

                expect(missing).toBeNull();
                // console.log("getSummaryStockAfterUpdateCopyToBookStock missing:", missing);
            });
        });

        describe("updatePhysicalCopy", () => {
            it("updates location, state, condition and notes by copy id and updates the derived stock", async () => {
                const before = await copiesRepository.getPyhsicalCopy(null, COPY.wonderAvailable);

                const updated = await copiesRepository.updatePhysicalCopy({
                    copyId: String(fixture.copyIds.wonderAvailable),
                    copyCode: undefined,
                    homeLocation: "REPAIR-SHELF",
                    state: "Damaged",
                    condition: "Damaged",
                    notes: "Cover torn",
                });

                expect(updated).toMatchObject({
                    _id: String(fixture.copyIds.wonderAvailable),
                    copyCode: "WB-00217",
                    homeLocation: "REPAIR-SHELF",
                    state: "Damaged",
                    condition: "Damaged",
                    notes: "Cover torn",
                });
                expect(updated?.createdAt).toBe(before?.createdAt);
                expect(updated?.updatedAt).not.toBe(before?.updatedAt);
                // console.log("updatePhysicalCopy:", updated);

                const summary = await copiesRepository.getSummaryStockAfterUpdateCopyToBookStock(
                    String(fixture.copyIds.wonderAvailable),
                );
                expect(summary).toEqual({
                    totalCopies: 2,
                    availableCopies: 0,
                    borrowedCopies: 1,
                    reservedCopies: 0,
                    damagedCopies: 1,
                    lostCopies: 0,
                });
                // console.log("updatePhysicalCopy summary:", summary);
            });

            it("updates a copy found by copy code and keeps the note when none is given", async () => {
                await copiesRepository.updatePhysicalCopy({
                    copyId: undefined,
                    copyCode: COPY.wonderAvailable,
                    homeLocation: "FIC PAL · A2",
                    state: "Available",
                    condition: "Good",
                    notes: "Temporary note",
                });

                const updated = await copiesRepository.updatePhysicalCopy({
                    copyId: undefined,
                    copyCode: COPY.wonderAvailable,
                    homeLocation: "FIC PAL · A3",
                    state: "Available",
                    condition: "Good",
                });

                expect(updated).toMatchObject({
                    copyCode: "WB-00217",
                    homeLocation: "FIC PAL · A3",
                    notes: "Temporary note",
                });
                // console.log("updatePhysicalCopy by code:", updated);
            });

            it("allows editing a copy that only has returned loans", async () => {
                const updated = await copiesRepository.updatePhysicalCopy({
                    copyId: String(fixture.copyIds.midnightAvailable),
                    copyCode: undefined,
                    homeLocation: "FIC HAI · A3",
                    state: "Lost",
                    condition: "Lost",
                    notes: "Lost after the last return",
                });

                expect(updated).toMatchObject({ copyCode: "WB-00421", state: "Lost", condition: "Lost" });
                // console.log("updatePhysicalCopy returned-loan copy:", updated);
            });

            it("returns null for a borrowed copy and for a reserved copy, leaving them unchanged", async () => {
                const borrowed = await copiesRepository.updatePhysicalCopy({
                    copyId: String(fixture.copyIds.midnightBorrowed),
                    copyCode: undefined,
                    homeLocation: "FIC HAI · A3",
                    state: "Damaged",
                    condition: "Damaged",
                });
                expect(borrowed).toBeNull();
                // console.log("updatePhysicalCopy borrowed:", borrowed);

                const reserved = await copiesRepository.updatePhysicalCopy({
                    copyId: undefined,
                    copyCode: COPY.midnightReserved,
                    homeLocation: "FIC HAI · A3",
                    state: "Lost",
                    condition: "Lost",
                });
                expect(reserved).toBeNull();
                // console.log("updatePhysicalCopy reserved:", reserved);

                const borrowedAfter = await copiesRepository.getPyhsicalCopy(null, COPY.midnightBorrowed);
                expect(borrowedAfter?.state).toBe("Borrowed");
                const reservedAfter = await copiesRepository.getPyhsicalCopy(null, COPY.midnightReserved);
                expect(reservedAfter?.state).toBe("Reserved");
            });

            it("returns null when no identifier is given or the copy does not exist", async () => {
                const noIdentifier = await copiesRepository.updatePhysicalCopy({
                    copyId: undefined,
                    copyCode: undefined,
                    homeLocation: "ANY",
                    state: "Available",
                    condition: "Good",
                });
                expect(noIdentifier).toBeNull();
                // console.log("updatePhysicalCopy no identifier:", noIdentifier);

                const unknown = await copiesRepository.updatePhysicalCopy({
                    copyId: undefined,
                    copyCode: "WB-99999",
                    homeLocation: "ANY",
                    state: "Available",
                    condition: "Good",
                });
                expect(unknown).toBeNull();
                // console.log("updatePhysicalCopy unknown:", unknown);
            });
        });

        describe("deletePhysicalCopyById", () => {
            it("deletes a copy without history by copy code and lowers the stock", async () => {
                const deleted = await copiesRepository.deletePhysicalCopyById(undefined, COPY.wonderAvailable);

                expect(deleted).toBe(true);
                // console.log("deletePhysicalCopyById by code:", deleted);

                const afterDelete = await copiesRepository.getPyhsicalCopy(null, COPY.wonderAvailable);
                expect(afterDelete).toBeNull();
                const stock = await booksRepository.getBooksWithSummaryInfoById(String(fixture.bookIds.wonder));
                expect(stock?.stockSummary).toMatchObject({ totalCopies: 1, availableCopies: 0, borrowedCopies: 1 });
                // console.log("deletePhysicalCopyById stock:", stock);
            });

            it("deletes a copy without history by id", async () => {
                const deleted = await copiesRepository.deletePhysicalCopyById(
                    String(fixture.copyIds.dictionaryAvailable),
                    undefined,
                );

                expect(deleted).toBe(true);
                // console.log("deletePhysicalCopyById by id:", deleted);

                const afterDelete = await copiesRepository.getPyhsicalCopy(null, COPY.dictionaryAvailable);
                expect(afterDelete).toBeNull();
            });

            it("refuses to delete copies that have loan history (returned or active)", async () => {
                const returnedLoan = await copiesRepository.deletePhysicalCopyById(undefined, COPY.midnightAvailable);
                expect(returnedLoan).toBe(false);
                // console.log("deletePhysicalCopyById returned loan:", returnedLoan);

                const activeLoan = await copiesRepository.deletePhysicalCopyById(
                    String(fixture.copyIds.midnightBorrowed),
                    undefined,
                );
                expect(activeLoan).toBe(false);
                // console.log("deletePhysicalCopyById active loan:", activeLoan);

                const stillThere = await copiesRepository.getPyhsicalCopy(null, COPY.midnightAvailable);
                expect(stillThere?.copyCode).toBe("WB-00421");
            });

            it("refuses to delete a copy that has a ready hold", async () => {
                const deleted = await copiesRepository.deletePhysicalCopyById(undefined, COPY.midnightReserved);

                expect(deleted).toBe(false);
                // console.log("deletePhysicalCopyById ready hold:", deleted);

                const stillThere = await copiesRepository.getPyhsicalCopy(null, COPY.midnightReserved);
                expect(stillThere?.state).toBe("Reserved");
            });

            it("deletes a copy whose only hold is cancelled and keeps the hold row without a copy", async () => {
                await pool.query(
                    `
                        INSERT INTO holds (hold_code, student_id, book_id, copy_id, status, collect_by)
                        VALUES ('HLD-CANCELLED', $1, $2, $3, 'Cancelled', '2026-12-02T12:00:00Z')
                    `,
                    [fixture.userIds.fresh, fixture.bookIds.wonder, fixture.copyIds.wonderAvailable],
                );

                const deleted = await copiesRepository.deletePhysicalCopyById(undefined, COPY.wonderAvailable);

                expect(deleted).toBe(true);
                // console.log("deletePhysicalCopyById cancelled hold:", deleted);

                const hold = await pool.query<{ copy_id: number | null }>(
                    "SELECT copy_id FROM holds WHERE hold_code = 'HLD-CANCELLED'",
                );
                expect(hold.rows).toEqual([{ copy_id: null }]);
                // console.log("cancelled hold row:", hold.rows);
            });

            it("returns false when no identifier is given or the copy does not exist", async () => {
                const noIdentifier = await copiesRepository.deletePhysicalCopyById(undefined, undefined);
                expect(noIdentifier).toBe(false);
                // console.log("deletePhysicalCopyById no identifier:", noIdentifier);

                const unknown = await copiesRepository.deletePhysicalCopyById(undefined, "WB-99999");
                expect(unknown).toBe(false);
                // console.log("deletePhysicalCopyById unknown:", unknown);
            });
        });
    });
});