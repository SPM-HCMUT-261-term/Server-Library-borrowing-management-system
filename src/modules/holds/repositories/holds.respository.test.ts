import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PoolClient } from "pg";

import { pool } from "@shared/database/db.js";
import type { CancelHoldResultEntity, HoldDetailEntity } from "../holds.entity.js";
import { HoldsRepositoryImpl } from "./holds.respository.js";
import type { HoldsRepository } from "./holds.repository.interface.js";

const holdsRepository: HoldsRepository = new HoldsRepositoryImpl(pool);

// ---------------------------------------------------------------------------
// Fixture (seed) data
//
// Endpoints covered by this repository (API contract 6.2, 6.3, 7.7):
//   POST /holds · DELETE /holds/:id · GET /staff/holds
//
// Books and copies:
//
//  title                    copies
//  ------------------------ ---------------------------------------------------------------
//  The Midnight Library     421 Available, 422 Available, 423 Reserved (HLD-1001)
//  Wonder                   216 Borrowed (BR-1001, overdue), 217 Available, 218 Reserved (HLD-1002)
//  A Brief History of Time  632 Borrowed (BR-1002)
//  Persepolis               700 Lost
//  Truyện Kiều              (no copies)
//
// Users : Maya (STU001) 1 active loan · Amira (STU002) 1 overdue loan
//         Fines Student (STU003) 3.75 unpaid (+ 10.00 paid) · Fresh (STU004) nothing · Staff (STF001)
// Loans : BR-1000 (217, Maya, Returned) · BR-1001 (216, Amira, Active, due today - 3)
//         BR-1002 (632, Maya, Active, due today + 10)
// Holds : HLD-0900 (421, Fresh, Cancelled)  · HLD-0901 (632, Maya, Fulfilled)
//         HLD-1001 (423, Maya, Ready, requested 1 Nov) · HLD-1002 (218, Fresh, Ready, requested 3 Nov)
//
// Due dates are relative to the database CURRENT_DATE so "overdue" never goes stale.
// Generated hold codes are only checked by shape ("HLD-<digits>"): a sequence is not reset by TRUNCATE.
// ---------------------------------------------------------------------------

const ACCOUNT = {
    maya: "STU001",
    amira: "STU002",
    fines: "STU003",
    fresh: "STU004",
    staff: "STF001",
} as const;

const COPY = {
    midnightAvailableA: "WB-00421",
    midnightAvailableB: "WB-00422",
    midnightReserved: "WB-00423",
    wonderBorrowed: "WB-00216",
    wonderAvailable: "WB-00217",
    wonderReserved: "WB-00218",
    briefBorrowed: "WB-00632",
    persepolisLost: "WB-00700",
} as const;

const HOLD_CODE_PATTERN = /^HLD-\d+$/;

async function insertId(client: PoolClient, sql: string, values: unknown[]): Promise<number> {
    const result = await client.query<{ id: number }>(sql, values);
    const id = result.rows[0]?.id;
    if (id === undefined) {
        throw new Error("Holds seed insert did not return an id");
    }
    return id;
}

function insertUser(
    client: PoolClient,
    accountId: string,
    fullName: string,
    role: "student" | "staff",
    activeLoansCount: number,
): Promise<number> {
    // active_loans_count is kept equal to the real number of Active loans,
    // so an implementation may count from `loans` or read the column.
    return insertId(
        client,
        `
            INSERT INTO users (account_id, full_name, password_hash, role, status, year_group, active_loans_count, max_loans_limit)
            VALUES ($1, $2, 'seed-password', $3, 'Active', $4, $5, 5)
            RETURNING id
        `,
        [accountId, fullName, role, role === "student" ? "Year 10" : null, activeLoansCount],
    );
}

function insertBook(
    client: PoolClient,
    title: string,
    author: string,
    isbn: string,
    category: string,
    shelfReference: string | null,
): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO books (title, author, isbn, category, shelf_reference)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
        `,
        [title, author, isbn, category, shelfReference],
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

function insertActiveLoan(
    client: PoolClient,
    borrowCode: string,
    studentId: number,
    copyId: number,
    dueInDays: number,
): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO loans (borrow_code, student_id, copy_id, status, borrowed_at, due_date)
            VALUES ($1, $2, $3, 'Active', (CURRENT_DATE + $4::int - 14) + TIME '09:00', CURRENT_DATE + $4::int)
            RETURNING id
        `,
        [borrowCode, studentId, copyId, dueInDays],
    );
}

function insertReturnedLoan(client: PoolClient, borrowCode: string, studentId: number, copyId: number): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO loans (borrow_code, student_id, copy_id, status, borrowed_at, due_date, returned_at, return_condition)
            VALUES ($1, $2, $3, 'Returned', '2026-10-01T09:00:00Z', '2026-10-15', '2026-10-14T09:00:00Z', 'Good')
            RETURNING id
        `,
        [borrowCode, studentId, copyId],
    );
}

function insertHold(
    client: PoolClient,
    holdCode: string,
    studentId: number,
    bookId: number,
    copyId: number,
    status: "Ready" | "Fulfilled" | "Cancelled" | "Expired",
    requestedAt: string,
    collectBy: string,
): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO holds (hold_code, student_id, book_id, copy_id, status, requested_at, collect_by)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            RETURNING id
        `,
        [holdCode, studentId, bookId, copyId, status, requestedAt, collectBy],
    );
}

async function seedHoldsData() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const userIds = {
            maya: await insertUser(client, ACCOUNT.maya, "Maya Chen", "student", 1),
            amira: await insertUser(client, ACCOUNT.amira, "Amira Khan", "student", 1),
            fines: await insertUser(client, ACCOUNT.fines, "Fines Student", "student", 0),
            fresh: await insertUser(client, ACCOUNT.fresh, "Fresh Student", "student", 0),
            staff: await insertUser(client, ACCOUNT.staff, "Library Staff", "staff", 0),
        };

        const bookIds = {
            midnight: await insertBook(client, "The Midnight Library", "Matt Haig", "9781786892737", "Fiction", "FIC HAI · A3"),
            wonder: await insertBook(client, "Wonder", "R.J. Palacio", "9780375869020", "Fiction", "FIC PAL · A2"),
            briefHistory: await insertBook(client, "A Brief History of Time", "Stephen Hawking", "9780553380163", "Non-fiction", "SCI HAW · B2"),
            persepolis: await insertBook(client, "Persepolis", "Marjane Satrapi", "9780375714832", "Graphic novels", "GRA SAT · C1"),
            truyenKieu: await insertBook(client, "Truyện Kiều", "Nguyễn Du", "9786041000001", "Poetry", null),
        };

        const copyIds = {
            midnightAvailableA: await insertCopy(client, COPY.midnightAvailableA, bookIds.midnight, "FIC HAI · A3", "Available", "Good"),
            midnightAvailableB: await insertCopy(client, COPY.midnightAvailableB, bookIds.midnight, "FIC HAI · A3", "Available", "Good"),
            midnightReserved: await insertCopy(client, COPY.midnightReserved, bookIds.midnight, "FIC HAI · A3", "Reserved", "Good"),
            wonderBorrowed: await insertCopy(client, COPY.wonderBorrowed, bookIds.wonder, "FIC PAL · A2", "Borrowed", "Good"),
            wonderAvailable: await insertCopy(client, COPY.wonderAvailable, bookIds.wonder, "FIC PAL · A2", "Available", "Good"),
            wonderReserved: await insertCopy(client, COPY.wonderReserved, bookIds.wonder, "FIC PAL · A2", "Reserved", "Good"),
            briefBorrowed: await insertCopy(client, COPY.briefBorrowed, bookIds.briefHistory, "SCI HAW · B2", "Borrowed", "Good"),
            persepolisLost: await insertCopy(client, COPY.persepolisLost, bookIds.persepolis, "GRA SAT · C1", "Lost", "Lost"),
        };

        const loanIds = {
            br1000: await insertReturnedLoan(client, "BR-1000", userIds.maya, copyIds.wonderAvailable),
            br1001: await insertActiveLoan(client, "BR-1001", userIds.amira, copyIds.wonderBorrowed, -3),
            br1002: await insertActiveLoan(client, "BR-1002", userIds.maya, copyIds.briefBorrowed, 10),
        };

        const holdIds = {
            hld0900: await insertHold(client, "HLD-0900", userIds.fresh, bookIds.midnight, copyIds.midnightAvailableA,
                "Cancelled", "2026-10-20T09:00:00Z", "2026-10-21T08:30:00Z"),
            hld0901: await insertHold(client, "HLD-0901", userIds.maya, bookIds.briefHistory, copyIds.briefBorrowed,
                "Fulfilled", "2026-10-25T09:00:00Z", "2026-10-26T08:30:00Z"),
            hld1001: await insertHold(client, "HLD-1001", userIds.maya, bookIds.midnight, copyIds.midnightReserved,
                "Ready", "2026-11-01T09:00:00Z", "2026-11-02T08:30:00Z"),
            hld1002: await insertHold(client, "HLD-1002", userIds.fresh, bookIds.wonder, copyIds.wonderReserved,
                "Ready", "2026-11-03T09:00:00Z", "2026-11-04T08:30:00Z"),
        };

        await client.query(
            `
                INSERT INTO fines (student_id, amount, reason, status, paid_at)
                VALUES ($1, 2.50, 'Overdue', 'Unpaid', NULL),
                       ($1, 1.25, 'Damaged', 'Unpaid', NULL),
                       ($1, 10.00, 'Lost', 'Paid', '2026-10-30T09:00:00Z')
            `,
            [userIds.fines],
        );

        await client.query("COMMIT");
        return { userIds, bookIds, copyIds, loanIds, holdIds };
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

type Fixture = Awaited<ReturnType<typeof seedHoldsData>>;

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

// --------------------------------------------------------------------------- helpers

/** Compares two timestamps in PostgreSQL, so the text format the repository returns does not matter. */
async function sameInstant(a: string, b: string): Promise<boolean> {
    const result = await pool.query<{ same: boolean }>("SELECT $1::timestamptz = $2::timestamptz AS same", [a, b]);
    return result.rows[0]?.same ?? false;
}

async function copyStateOf(copyCode: string): Promise<string | undefined> {
    const result = await pool.query<{ state: string }>("SELECT state FROM physical_copies WHERE copy_code = $1", [copyCode]);
    return result.rows[0]?.state;
}

async function holdStatusOf(holdCode: string): Promise<string | undefined> {
    const result = await pool.query<{ status: string }>("SELECT status FROM holds WHERE hold_code = $1", [holdCode]);
    return result.rows[0]?.status;
}

async function countHolds(): Promise<number> {
    const result = await pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM holds");
    return result.rows[0]?.count ?? -1;
}

function expectCreatedHold(result: HoldDetailEntity | "no_available_copies"): HoldDetailEntity {
    if (result === "no_available_copies") {
        throw new Error("Expected createHold to create a hold, got no_available_copies");
    }
    return result;
}

function expectCancelled(result: CancelHoldResultEntity | "not_found" | "not_cancellable"): CancelHoldResultEntity {
    if (typeof result === "string") {
        throw new Error(`Expected cancelHold to cancel the hold, got ${result}`);
    }
    return result;
}

const holdCodesOf = (holds: { holdCode: string }[]): string[] => holds.map((hold) => hold.holdCode);

const COLLECT_BY = "2026-12-01T08:30:00.000Z"; // 15:30 in Asia/Ho_Chi_Minh, computed by the service in real code

let fixture: Fixture;

describe("Holds repository", () => {
    beforeEach(async () => {
        await truncateAllTables();
        fixture = await seedHoldsData();
    });

    afterEach(async () => {
        await truncateAllTables();
    });

    // afterAll(async () => {
    //     await pool.end();
    // });

    // =======================================================================
    // Query operations
    // =======================================================================
    describe("getStudentBorrowingStatus", () => {
        it("returns the loan, overdue and fine counters of a student in good standing", async () => {
            const result = await holdsRepository.getStudentBorrowingStatus(String(fixture.userIds.maya));

            expect(result).toEqual({
                id: String(fixture.userIds.maya),
                activeLoansCount: 1, // the Ready hold HLD-1001 does not count as a loan
                maxLoansLimit: 5,
                overdueLoansCount: 0,
                unpaidFines: 0,
            });
            // console.log("getStudentBorrowingStatus(maya):", result);
        });

        it("counts active loans whose due date has passed as overdue", async () => {
            const result = await holdsRepository.getStudentBorrowingStatus(String(fixture.userIds.amira));

            expect(result).toMatchObject({ activeLoansCount: 1, overdueLoansCount: 1, unpaidFines: 0 });
            // console.log("getStudentBorrowingStatus(amira):", result);
        });

        it("sums only unpaid fines and returns them as a number", async () => {
            const result = await holdsRepository.getStudentBorrowingStatus(String(fixture.userIds.fines));

            expect(result).toMatchObject({ activeLoansCount: 0, overdueLoansCount: 0, unpaidFines: 3.75 });
            expect(typeof result?.unpaidFines).toBe("number");
            // console.log("getStudentBorrowingStatus(fines):", result);
        });

        it("ignores returned loans", async () => {
            // Maya also has the returned loan BR-1000; only BR-1002 is active
            const result = await holdsRepository.getStudentBorrowingStatus(String(fixture.userIds.maya));

            expect(result?.activeLoansCount).toBe(1);
        });

        it("returns null for an unknown student", async () => {
            const missing = await holdsRepository.getStudentBorrowingStatus("999999");

            expect(missing).toBeNull();
            // console.log("getStudentBorrowingStatus missing:", missing);
        });
    });

    describe("getBookStock", () => {
        it("returns the derived stock of a title as numbers", async () => {
            const result = await holdsRepository.getBookStock(String(fixture.bookIds.wonder));

            expect(result).toEqual({
                bookId: String(fixture.bookIds.wonder),
                totalCopies: 3,
                availableCopies: 1,
                borrowedCopies: 1,
                reservedCopies: 1,
            });
            // console.log("getBookStock(wonder):", result);
        });

        it("counts reserved copies separately from available ones", async () => {
            const result = await holdsRepository.getBookStock(String(fixture.bookIds.midnight));

            expect(result).toEqual({
                bookId: String(fixture.bookIds.midnight),
                totalCopies: 3,
                availableCopies: 2,
                borrowedCopies: 0,
                reservedCopies: 1,
            });
        });

        it("returns zero available copies for a title with only lost copies or no copies", async () => {
            const lostOnly = await holdsRepository.getBookStock(String(fixture.bookIds.persepolis));
            expect(lostOnly).toEqual({
                bookId: String(fixture.bookIds.persepolis),
                totalCopies: 1,
                availableCopies: 0,
                borrowedCopies: 0,
                reservedCopies: 0,
            });
            // console.log("getBookStock(persepolis):", lostOnly);

            const noCopies = await holdsRepository.getBookStock(String(fixture.bookIds.truyenKieu));
            expect(noCopies).toEqual({
                bookId: String(fixture.bookIds.truyenKieu),
                totalCopies: 0,
                availableCopies: 0,
                borrowedCopies: 0,
                reservedCopies: 0,
            });
            // console.log("getBookStock(truyenKieu):", noCopies);
        });

        it("returns null for an unknown book", async () => {
            const missing = await holdsRepository.getBookStock("999999");

            expect(missing).toBeNull();
            // console.log("getBookStock missing:", missing);
        });
    });

    describe("hasActiveLoanOrHoldForBook", () => {
        it("is true when the student has a Ready hold on a copy of the title", async () => {
            const result = await holdsRepository.hasActiveLoanOrHoldForBook({
                studentId: String(fixture.userIds.maya),
                bookId: String(fixture.bookIds.midnight),
            });

            expect(result).toBe(true);
        });

        it("is true when the student has an Active loan on a copy of the title (overdue or not)", async () => {
            const onLoan = await holdsRepository.hasActiveLoanOrHoldForBook({
                studentId: String(fixture.userIds.maya),
                bookId: String(fixture.bookIds.briefHistory),
            });
            expect(onLoan).toBe(true);

            const overdue = await holdsRepository.hasActiveLoanOrHoldForBook({
                studentId: String(fixture.userIds.amira),
                bookId: String(fixture.bookIds.wonder),
            });
            expect(overdue).toBe(true);
        });

        it("is false when the student only has a returned loan on the title", async () => {
            const result = await holdsRepository.hasActiveLoanOrHoldForBook({
                studentId: String(fixture.userIds.maya),
                bookId: String(fixture.bookIds.wonder),
            });

            expect(result).toBe(false);
        });

        it("is false when the student only has a cancelled hold on the title", async () => {
            const result = await holdsRepository.hasActiveLoanOrHoldForBook({
                studentId: String(fixture.userIds.fresh),
                bookId: String(fixture.bookIds.midnight),
            });

            expect(result).toBe(false);
        });

        it("does not look at other students' loans and holds", async () => {
            // Amira borrows Wonder and Fresh holds Wonder, but Fines Student has nothing on it
            const result = await holdsRepository.hasActiveLoanOrHoldForBook({
                studentId: String(fixture.userIds.fines),
                bookId: String(fixture.bookIds.wonder),
            });

            expect(result).toBe(false);
        });

        it("is false for an unknown book", async () => {
            const result = await holdsRepository.hasActiveLoanOrHoldForBook({
                studentId: String(fixture.userIds.maya),
                bookId: "999999",
            });

            expect(result).toBe(false);
        });
    });

    describe("findHoldById", () => {
        it("finds a hold by hold code with its book, copy and student", async () => {
            const result = await holdsRepository.findHoldById("HLD-1001");

            expect(result).toEqual({
                id: String(fixture.holdIds.hld1001),
                holdCode: "HLD-1001",
                status: "Ready",
                requestedAt: expect.any(String),
                collectBy: expect.any(String),
                book: {
                    id: String(fixture.bookIds.midnight),
                    title: "The Midnight Library",
                    author: "Matt Haig",
                    format: "Paperback",
                    shelfReference: "FIC HAI · A3",
                    coverImageUrl: null,
                },
                copy: {
                    id: String(fixture.copyIds.midnightReserved),
                    copyCode: COPY.midnightReserved,
                    homeLocation: "FIC HAI · A3",
                },
                student: {
                    id: String(fixture.userIds.maya),
                    accountId: ACCOUNT.maya,
                    fullName: "Maya Chen",
                    yearGroup: "Year 10",
                },
            });
            expect(await sameInstant(result?.requestedAt ?? "", "2026-11-01T09:00:00Z")).toBe(true);
            expect(await sameInstant(result?.collectBy ?? "", "2026-11-02T08:30:00Z")).toBe(true);
            // console.log("findHoldById(HLD-1001):", result);
        });

        it("finds the same hold by its database id", async () => {
            const byCode = await holdsRepository.findHoldById("HLD-1001");
            const byId = await holdsRepository.findHoldById(String(fixture.holdIds.hld1001));

            expect(byId).toEqual(byCode);
            // console.log("findHoldById(id):", byId);
        });

        it("returns holds in any status so the service can refuse to cancel them", async () => {
            const cancelled = await holdsRepository.findHoldById("HLD-0900");
            expect(cancelled).toMatchObject({ holdCode: "HLD-0900", status: "Cancelled" });

            const fulfilled = await holdsRepository.findHoldById("HLD-0901");
            expect(fulfilled).toMatchObject({ holdCode: "HLD-0901", status: "Fulfilled" });
            // console.log("findHoldById non-Ready:", cancelled, fulfilled);
        });

        it("returns copy null when the assigned copy was deleted", async () => {
            await pool.query("UPDATE holds SET copy_id = NULL WHERE hold_code = 'HLD-1002'");

            const result = await holdsRepository.findHoldById("HLD-1002");

            expect(result).toMatchObject({ holdCode: "HLD-1002", copy: null });
            expect(result?.book.title).toBe("Wonder");
            // console.log("findHoldById without copy:", result);
        });

        it("returns null for an unknown hold code or id", async () => {
            expect(await holdsRepository.findHoldById("HLD-9999")).toBeNull();
            expect(await holdsRepository.findHoldById("999999")).toBeNull();
        });
    });

    describe("getActiveHolds", () => {
        it("lists only Ready holds, newest request first, with the total count", async () => {
            const result = await holdsRepository.getActiveHolds({});

            expect(holdCodesOf(result.holds)).toEqual(["HLD-1002", "HLD-1001"]);
            expect(result.totalItem).toBe(2);
            // console.log("getActiveHolds({}):", result);
        });

        it("maps each item with its student, book and copy", async () => {
            const result = await holdsRepository.getActiveHolds({ q: "HLD-1002" });

            expect(result.holds).toEqual([
                {
                    id: String(fixture.holdIds.hld1002),
                    holdCode: "HLD-1002",
                    status: "Ready",
                    requestedAt: expect.any(String),
                    collectBy: expect.any(String),
                    book: {
                        id: String(fixture.bookIds.wonder),
                        title: "Wonder",
                        author: "R.J. Palacio",
                        format: "Paperback",
                        shelfReference: "FIC PAL · A2",
                        coverImageUrl: null,
                    },
                    copy: {
                        id: String(fixture.copyIds.wonderReserved),
                        copyCode: COPY.wonderReserved,
                        homeLocation: "FIC PAL · A2",
                    },
                    student: {
                        id: String(fixture.userIds.fresh),
                        accountId: ACCOUNT.fresh,
                        fullName: "Fresh Student",
                        yearGroup: "Year 10",
                    },
                },
            ]);
            expect(result.totalItem).toBe(1);
        });

        it("searches hold code, student account id and name, copy code and book title case-insensitively", async () => {
            const byHoldCode = await holdsRepository.getActiveHolds({ q: "hld-1001" });
            expect(holdCodesOf(byHoldCode.holds)).toEqual(["HLD-1001"]);
            // console.log("q hold code:", byHoldCode);

            const byAccountId = await holdsRepository.getActiveHolds({ q: "stu004" });
            expect(holdCodesOf(byAccountId.holds)).toEqual(["HLD-1002"]);
            // console.log("q account id:", byAccountId);

            const byStudentName = await holdsRepository.getActiveHolds({ q: "MAYA" });
            expect(holdCodesOf(byStudentName.holds)).toEqual(["HLD-1001"]);
            // console.log("q student name:", byStudentName);

            const byCopyCode = await holdsRepository.getActiveHolds({ q: "wb-00218" });
            expect(holdCodesOf(byCopyCode.holds)).toEqual(["HLD-1002"]);
            // console.log("q copy code:", byCopyCode);

            const byBookTitle = await holdsRepository.getActiveHolds({ q: "midnight" });
            expect(holdCodesOf(byBookTitle.holds)).toEqual(["HLD-1001"]);
            // console.log("q book title:", byBookTitle);

            const noMatch = await holdsRepository.getActiveHolds({ q: "no such hold" });
            expect(noMatch).toEqual({ holds: [], totalItem: 0 });
            // console.log("q no match:", noMatch);
        });

        it("does not return non-Ready holds even when the search matches them", async () => {
            const cancelled = await holdsRepository.getActiveHolds({ q: "HLD-0900" });
            expect(cancelled).toEqual({ holds: [], totalItem: 0 });

            const fulfilled = await holdsRepository.getActiveHolds({ q: "HLD-0901" });
            expect(fulfilled).toEqual({ holds: [], totalItem: 0 });
        });

        it("treats an empty search as no filter", async () => {
            const result = await holdsRepository.getActiveHolds({ q: "" });

            expect(result.totalItem).toBe(2);
        });

        it("paginates and reports the total number of matching holds", async () => {
            const firstPage = await holdsRepository.getActiveHolds({ page: 1, limit: 1 });
            expect(holdCodesOf(firstPage.holds)).toEqual(["HLD-1002"]);
            expect(firstPage.totalItem).toBe(2);
            // console.log("page 1:", firstPage);

            const secondPage = await holdsRepository.getActiveHolds({ page: 2, limit: 1 });
            expect(holdCodesOf(secondPage.holds)).toEqual(["HLD-1001"]);
            expect(secondPage.totalItem).toBe(2);
            // console.log("page 2:", secondPage);

            const beyondLastPage = await holdsRepository.getActiveHolds({ page: 3, limit: 1 });
            expect(beyondLastPage.holds).toEqual([]);
            // totalItem is not checked here: with COUNT(*) OVER() an empty page has no row to carry it
            // console.log("page 3:", beyondLastPage);
        });
    });

    // =======================================================================
    // CUD operations
    // =======================================================================
    describe("createHold", () => {
        it("reserves an available copy and creates a Ready hold", async () => {
            const result = expectCreatedHold(
                await holdsRepository.createHold({
                    studentId: String(fixture.userIds.fresh),
                    bookId: String(fixture.bookIds.midnight),
                    collectBy: COLLECT_BY,
                }),
            );

            expect(result).toMatchObject({
                status: "Ready",
                book: {
                    id: String(fixture.bookIds.midnight),
                    title: "The Midnight Library",
                    author: "Matt Haig",
                    format: "Paperback",
                    shelfReference: "FIC HAI · A3",
                    coverImageUrl: null,
                },
                student: {
                    id: String(fixture.userIds.fresh),
                    accountId: ACCOUNT.fresh,
                    fullName: "Fresh Student",
                    yearGroup: "Year 10",
                },
            });
            expect(result.holdCode).toMatch(HOLD_CODE_PATTERN);
            expect(["HLD-0900", "HLD-0901", "HLD-1001", "HLD-1002"]).not.toContain(result.holdCode);
            expect([COPY.midnightAvailableA, COPY.midnightAvailableB]).toContain(result.copy?.copyCode);
            expect(result.copy?.homeLocation).toBe("FIC HAI · A3");
            expect(await sameInstant(result.collectBy, COLLECT_BY)).toBe(true);
            expect(result.requestedAt).toEqual(expect.any(String));
            // console.log("createHold:", result);

            // the assigned copy is now Reserved
            expect(await copyStateOf(result.copy?.copyCode ?? "")).toBe("Reserved");

            // the hold is persisted as returned
            const persisted = await holdsRepository.findHoldById(result.holdCode);
            expect(persisted).toEqual(result);
        });

        it("updates the derived stock of the title", async () => {
            await holdsRepository.createHold({
                studentId: String(fixture.userIds.fresh),
                bookId: String(fixture.bookIds.midnight),
                collectBy: COLLECT_BY,
            });

            const stock = await holdsRepository.getBookStock(String(fixture.bookIds.midnight));
            expect(stock).toMatchObject({ totalCopies: 3, availableCopies: 1, reservedCopies: 2 });
            // console.log("createHold stock:", stock);
        });

        it("does not change the student's active loan count", async () => {
            await holdsRepository.createHold({
                studentId: String(fixture.userIds.fresh),
                bookId: String(fixture.bookIds.midnight),
                collectBy: COLLECT_BY,
            });

            const status = await holdsRepository.getStudentBorrowingStatus(String(fixture.userIds.fresh));
            expect(status?.activeLoansCount).toBe(0);

            const column = await pool.query<{ active_loans_count: number }>(
                "SELECT active_loans_count FROM users WHERE id = $1",
                [fixture.userIds.fresh],
            );
            expect(column.rows[0]?.active_loans_count).toBe(0);
        });

        it("generates a different hold code and assigns a different copy for each hold", async () => {
            const first = expectCreatedHold(
                await holdsRepository.createHold({
                    studentId: String(fixture.userIds.fresh),
                    bookId: String(fixture.bookIds.midnight),
                    collectBy: COLLECT_BY,
                }),
            );
            const second = expectCreatedHold(
                await holdsRepository.createHold({
                    studentId: String(fixture.userIds.fines),
                    bookId: String(fixture.bookIds.midnight),
                    collectBy: COLLECT_BY,
                }),
            );

            expect(second.holdCode).toMatch(HOLD_CODE_PATTERN);
            expect(second.holdCode).not.toBe(first.holdCode);
            expect([first.copy?.copyCode, second.copy?.copyCode].sort()).toEqual([
                COPY.midnightAvailableA,
                COPY.midnightAvailableB,
            ]);
            // console.log("createHold twice:", first, second);

            // no Available copy is left
            const third = await holdsRepository.createHold({
                studentId: String(fixture.userIds.amira),
                bookId: String(fixture.bookIds.midnight),
                collectBy: COLLECT_BY,
            });
            expect(third).toBe("no_available_copies");
        });

        it("returns no_available_copies when every copy is borrowed, lost, or there are no copies, and inserts nothing", async () => {
            const before = await countHolds();

            const allBorrowed = await holdsRepository.createHold({
                studentId: String(fixture.userIds.fresh),
                bookId: String(fixture.bookIds.briefHistory),
                collectBy: COLLECT_BY,
            });
            expect(allBorrowed).toBe("no_available_copies");

            const lostOnly = await holdsRepository.createHold({
                studentId: String(fixture.userIds.fresh),
                bookId: String(fixture.bookIds.persepolis),
                collectBy: COLLECT_BY,
            });
            expect(lostOnly).toBe("no_available_copies");

            const noCopies = await holdsRepository.createHold({
                studentId: String(fixture.userIds.fresh),
                bookId: String(fixture.bookIds.truyenKieu),
                collectBy: COLLECT_BY,
            });
            expect(noCopies).toBe("no_available_copies");
            // console.log("createHold unavailable:", allBorrowed, lostOnly, noCopies);

            expect(await countHolds()).toBe(before);
            expect(await copyStateOf(COPY.persepolisLost)).toBe("Lost");
        });

        it("returns no_available_copies for an unknown book", async () => {
            const result = await holdsRepository.createHold({
                studentId: String(fixture.userIds.fresh),
                bookId: "999999",
                collectBy: COLLECT_BY,
            });

            expect(result).toBe("no_available_copies");
        });

        it("never reserves the same copy twice when two holds race for the last available copy", async () => {
            // Wonder has exactly one Available copy (WB-00217)
            const results = await Promise.all([
                holdsRepository.createHold({
                    studentId: String(fixture.userIds.maya),
                    bookId: String(fixture.bookIds.wonder),
                    collectBy: COLLECT_BY,
                }),
                holdsRepository.createHold({
                    studentId: String(fixture.userIds.fines),
                    bookId: String(fixture.bookIds.wonder),
                    collectBy: COLLECT_BY,
                }),
            ]);

            const created = results.filter((result) => result !== "no_available_copies");
            const refused = results.filter((result) => result === "no_available_copies");
            expect(created).toHaveLength(1);
            expect(refused).toHaveLength(1);
            expect(expectCreatedHold(created[0] ?? "no_available_copies").copy?.copyCode).toBe(COPY.wonderAvailable);
            // console.log("createHold race:", results);

            const readyOnCopy = await pool.query<{ count: number }>(
                "SELECT COUNT(*)::int AS count FROM holds WHERE copy_id = $1 AND status = 'Ready'",
                [fixture.copyIds.wonderAvailable],
            );
            expect(readyOnCopy.rows[0]?.count).toBe(1);
        });
    });

    describe("cancelHold", () => {
        it("cancels a Ready hold by hold code and releases its copy", async () => {
            const result = await holdsRepository.cancelHold({ id: "HLD-1001" });

            expect(result).toEqual({
                id: String(fixture.holdIds.hld1001),
                holdCode: "HLD-1001",
                status: "Cancelled",
                releasedCopyCode: COPY.midnightReserved,
            });
            // console.log("cancelHold(HLD-1001):", result);

            expect(await holdStatusOf("HLD-1001")).toBe("Cancelled");
            expect(await copyStateOf(COPY.midnightReserved)).toBe("Available");

            const stock = await holdsRepository.getBookStock(String(fixture.bookIds.midnight));
            expect(stock).toMatchObject({ availableCopies: 3, reservedCopies: 0 });
        });

        it("cancels a Ready hold by its database id", async () => {
            const result = expectCancelled(await holdsRepository.cancelHold({ id: String(fixture.holdIds.hld1002) }));

            expect(result).toMatchObject({ holdCode: "HLD-1002", status: "Cancelled", releasedCopyCode: COPY.wonderReserved });
            expect(await copyStateOf(COPY.wonderReserved)).toBe("Available");
            // console.log("cancelHold(id):", result);
        });

        it("does not touch the student's other holds", async () => {
            await holdsRepository.cancelHold({ id: "HLD-1001" });

            expect(await holdStatusOf("HLD-1002")).toBe("Ready");
            expect(await copyStateOf(COPY.wonderReserved)).toBe("Reserved");
        });

        it("returns not_cancellable for a hold that was already cancelled", async () => {
            await holdsRepository.cancelHold({ id: "HLD-1001" });

            const again = await holdsRepository.cancelHold({ id: "HLD-1001" });

            expect(again).toBe("not_cancellable");
            // console.log("cancelHold twice:", again);
        });

        it("returns not_cancellable for Cancelled, Fulfilled and Expired holds and leaves their copies alone", async () => {
            const cancelled = await holdsRepository.cancelHold({ id: "HLD-0900" });
            expect(cancelled).toBe("not_cancellable");
            expect(await copyStateOf(COPY.midnightAvailableA)).toBe("Available");

            // the copy of a fulfilled hold is on loan: it must NOT become Available
            const fulfilled = await holdsRepository.cancelHold({ id: "HLD-0901" });
            expect(fulfilled).toBe("not_cancellable");
            expect(await holdStatusOf("HLD-0901")).toBe("Fulfilled");
            expect(await copyStateOf(COPY.briefBorrowed)).toBe("Borrowed");

            await pool.query("UPDATE holds SET status = 'Expired' WHERE hold_code = 'HLD-1002'");
            const expired = await holdsRepository.cancelHold({ id: "HLD-1002" });
            expect(expired).toBe("not_cancellable");
            expect(await holdStatusOf("HLD-1002")).toBe("Expired");
            // console.log("cancelHold non-Ready:", cancelled, fulfilled, expired);
        });

        it("cancels a hold whose copy was deleted and reports no released copy", async () => {
            await pool.query("UPDATE holds SET copy_id = NULL WHERE hold_code = 'HLD-1001'");

            const result = await holdsRepository.cancelHold({ id: "HLD-1001" });

            expect(result).toEqual({
                id: String(fixture.holdIds.hld1001),
                holdCode: "HLD-1001",
                status: "Cancelled",
                releasedCopyCode: null,
            });
            expect(await holdStatusOf("HLD-1001")).toBe("Cancelled");
            // console.log("cancelHold without copy:", result);
        });

        it("returns not_found for an unknown hold code or id", async () => {
            expect(await holdsRepository.cancelHold({ id: "HLD-9999" })).toBe("not_found");
            expect(await holdsRepository.cancelHold({ id: "999999" })).toBe("not_found");
        });
    });
});
