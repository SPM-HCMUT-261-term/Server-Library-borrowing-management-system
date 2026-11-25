import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { PoolClient } from "pg";

import { pool } from "@shared/database/db.js";
import type { IssueLoansResultEntity } from "../loans.entity.js";
import {
    BorrowersRepositoryImpl,
    LoanCopiesRepositoryImpl,
    LoanHoldsRepositoryImpl,
    LoansRepositoryImpl,
} from "./loans.repository.js";
import type {
    BorrowersRepository,
    LoanCopiesRepository,
    LoanHoldsRepository,
    LoansRepository,
} from "./loans.repository.interface.js";

const borrowersRepository: BorrowersRepository = new BorrowersRepositoryImpl(pool);
const loansRepository: LoansRepository = new LoansRepositoryImpl(pool);
const loanCopiesRepository: LoanCopiesRepository = new LoanCopiesRepositoryImpl(pool);
const loanHoldsRepository: LoanHoldsRepository = new LoanHoldsRepositoryImpl(pool);

// ---------------------------------------------------------------------------
// Fixture (seed) data
//
// Endpoints covered by these repositories (API contract 6.1, 6.4, 7.1 - 7.6):
//   GET /me/borrowing · POST /loans/:id/renew
//   GET /staff/students/:accountId · GET /staff/copies/:copyCode/checkout-check · POST /staff/loans/issue
//   GET /staff/loans/active-by-copy/:copyCode · POST /staff/loans/:id/return · GET /staff/loans
//
// Books and copies:
//
//  title                      copies
//  -------------------------- ----------------------------------------------------------------------------
//  The Midnight Library       421 Available, 422 Borrowed (BR-1001), 423 Reserved (HLD-1001), 424 Damaged
//  Wonder                     216 Borrowed (BR-1004), 217 Available, 218 Reserved (HLD-1002)
//  A Brief History of Time    632 Borrowed (BR-1002)
//  Persepolis                 700 Lost
//  Oxford English Dictionary  800 Available, 801 Reserved (HLD-1003)
//
// Users : Maya (STU001) 2 active loans · Amira (STU002) 1 overdue loan · Fines Student (STU003) 3.75 unpaid
//         Inactive Student (STU004, Inactive) · Fresh (STU005) nothing · Staff (STF001)
//
// Loans (dates relative to the database CURRENT_DATE, written "today ± n"):
//  code     student copy status    borrowed       due          renewals  returned
//  BR-1000  Maya    421  Returned  2026-10-01     2026-10-15   0         2026-10-14 (Good)
//  BR-1001  Amira   422  Active    today - 16     today - 2    0         overdue
//  BR-1002  Maya    632  Active    today - 30     today + 10   1         already renewed
//  BR-1004  Maya    216  Active    today - 13     today + 1    0         due soon
//  BR-1005  Maya    800  Returned  2026-10-05     2026-10-19   0         2026-10-20 (Good)
//
// Holds : HLD-0900 (800, Maya, Cancelled) · HLD-0901 (632, Maya, Fulfilled)
//         HLD-1001 (423, Maya, Ready, requested 1 Nov) · HLD-1002 (218, Fresh, Ready, requested 3 Nov)
//         HLD-1003 (801, Maya, Ready, requested 5 Nov)
//
// Generated borrow codes are only checked by shape ("BR-<digits>"): a sequence is not reset by TRUNCATE.
// ---------------------------------------------------------------------------

const ACCOUNT = {
    maya: "STU001",
    amira: "STU002",
    fines: "STU003",
    inactive: "STU004",
    fresh: "STU005",
    staff: "STF001",
} as const;

const COPY = {
    midnightAvailable: "WB-00421",
    midnightBorrowed: "WB-00422",
    midnightReserved: "WB-00423",
    midnightDamaged: "WB-00424",
    wonderBorrowed: "WB-00216",
    wonderAvailable: "WB-00217",
    wonderReserved: "WB-00218",
    briefBorrowed: "WB-00632",
    persepolisLost: "WB-00700",
    dictionaryAvailable: "WB-00800",
    dictionaryReserved: "WB-00801",
} as const;

const LOCATION = {
    midnight: "FIC HAI · A3",
    wonder: "FIC PAL · A2",
    brief: "SCI HAW · B2",
    persepolis: "GRA SAT · C1",
    dictionary: "REF OXF · D1",
} as const;

const BORROW_CODE_PATTERN = /^BR-\d+$/;

async function insertId(client: PoolClient, sql: string, values: unknown[]): Promise<number> {
    const result = await client.query<{ id: number }>(sql, values);
    const id = result.rows[0]?.id;
    if (id === undefined) {
        throw new Error("Loans seed insert did not return an id");
    }
    return id;
}

function insertUser(
    client: PoolClient,
    accountId: string,
    fullName: string,
    role: "student" | "staff",
    status: "Active" | "Inactive",
    activeLoansCount: number,
): Promise<number> {
    // active_loans_count is kept equal to the real number of Active loans,
    // so an implementation may count from `loans` or keep the column in sync.
    return insertId(
        client,
        `
            INSERT INTO users (account_id, full_name, password_hash, role, status, year_group, active_loans_count, max_loans_limit)
            VALUES ($1, $2, 'seed-password', $3, $4, $5, $6, 5)
            RETURNING id
        `,
        [accountId, fullName, role, status, role === "student" ? "Year 10" : null, activeLoansCount],
    );
}

function insertBook(client: PoolClient, title: string, author: string, isbn: string, category: string): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO books (title, author, isbn, category)
            VALUES ($1, $2, $3, $4)
            RETURNING id
        `,
        [title, author, isbn, category],
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
    borrowedDaysAgo: number,
    dueInDays: number,
    renewalCount: number,
): Promise<number> {
    // date + time gives a timestamp in the session time zone, so borrowed_at::date is that same date back
    return insertId(
        client,
        `
            INSERT INTO loans (borrow_code, student_id, copy_id, status, borrowed_at, due_date, renewal_count)
            VALUES ($1, $2, $3, 'Active', (CURRENT_DATE - $4::int) + TIME '09:00', CURRENT_DATE + $5::int, $6)
            RETURNING id
        `,
        [borrowCode, studentId, copyId, borrowedDaysAgo, dueInDays, renewalCount],
    );
}

function insertReturnedLoan(
    client: PoolClient,
    borrowCode: string,
    studentId: number,
    copyId: number,
    borrowedOn: string,
    dueDate: string,
    returnedAt: string,
): Promise<number> {
    return insertId(
        client,
        `
            INSERT INTO loans (borrow_code, student_id, copy_id, status, borrowed_at, due_date, returned_at, return_condition)
            VALUES ($1, $2, $3, 'Returned', $4::date + TIME '09:00', $5, $6, 'Good')
            RETURNING id
        `,
        [borrowCode, studentId, copyId, borrowedOn, dueDate, returnedAt],
    );
}

function insertHold(
    client: PoolClient,
    holdCode: string,
    studentId: number,
    bookId: number,
    copyId: number,
    status: "Ready" | "Fulfilled" | "Cancelled",
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

async function seedLoansData() {
    const client = await pool.connect();
    try {
        await client.query("BEGIN");

        const userIds = {
            maya: await insertUser(client, ACCOUNT.maya, "Maya Chen", "student", "Active", 2),
            amira: await insertUser(client, ACCOUNT.amira, "Amira Khan", "student", "Active", 1),
            fines: await insertUser(client, ACCOUNT.fines, "Fines Student", "student", "Active", 0),
            inactive: await insertUser(client, ACCOUNT.inactive, "Inactive Student", "student", "Inactive", 0),
            fresh: await insertUser(client, ACCOUNT.fresh, "Fresh Student", "student", "Active", 0),
            staff: await insertUser(client, ACCOUNT.staff, "Library Staff", "staff", "Active", 0),
        };

        const bookIds = {
            midnight: await insertBook(client, "The Midnight Library", "Matt Haig", "9781786892737", "Fiction"),
            wonder: await insertBook(client, "Wonder", "R.J. Palacio", "9780375869020", "Fiction"),
            briefHistory: await insertBook(client, "A Brief History of Time", "Stephen Hawking", "9780553380163", "Non-fiction"),
            persepolis: await insertBook(client, "Persepolis", "Marjane Satrapi", "9780375714832", "Graphic novels"),
            dictionary: await insertBook(client, "Oxford English Dictionary", "Oxford University Press", "9780199640942", "Reference"),
        };

        const copyIds = {
            midnightAvailable: await insertCopy(client, COPY.midnightAvailable, bookIds.midnight, LOCATION.midnight, "Available", "Good"),
            midnightBorrowed: await insertCopy(client, COPY.midnightBorrowed, bookIds.midnight, LOCATION.midnight, "Borrowed", "Good"),
            midnightReserved: await insertCopy(client, COPY.midnightReserved, bookIds.midnight, LOCATION.midnight, "Reserved", "Good"),
            midnightDamaged: await insertCopy(client, COPY.midnightDamaged, bookIds.midnight, LOCATION.midnight, "Damaged", "Damaged"),
            wonderBorrowed: await insertCopy(client, COPY.wonderBorrowed, bookIds.wonder, LOCATION.wonder, "Borrowed", "Good"),
            wonderAvailable: await insertCopy(client, COPY.wonderAvailable, bookIds.wonder, LOCATION.wonder, "Available", "Good"),
            wonderReserved: await insertCopy(client, COPY.wonderReserved, bookIds.wonder, LOCATION.wonder, "Reserved", "Good"),
            briefBorrowed: await insertCopy(client, COPY.briefBorrowed, bookIds.briefHistory, LOCATION.brief, "Borrowed", "Good"),
            persepolisLost: await insertCopy(client, COPY.persepolisLost, bookIds.persepolis, LOCATION.persepolis, "Lost", "Lost"),
            dictionaryAvailable: await insertCopy(client, COPY.dictionaryAvailable, bookIds.dictionary, LOCATION.dictionary, "Available", "Good"),
            dictionaryReserved: await insertCopy(client, COPY.dictionaryReserved, bookIds.dictionary, LOCATION.dictionary, "Reserved", "Good"),
        };

        const loanIds = {
            br1000: await insertReturnedLoan(client, "BR-1000", userIds.maya, copyIds.midnightAvailable,
                "2026-10-01", "2026-10-15", "2026-10-14T10:00:00Z"),
            br1001: await insertActiveLoan(client, "BR-1001", userIds.amira, copyIds.midnightBorrowed, 16, -2, 0),
            br1002: await insertActiveLoan(client, "BR-1002", userIds.maya, copyIds.briefBorrowed, 30, 10, 1),
            br1004: await insertActiveLoan(client, "BR-1004", userIds.maya, copyIds.wonderBorrowed, 13, 1, 0),
            br1005: await insertReturnedLoan(client, "BR-1005", userIds.maya, copyIds.dictionaryAvailable,
                "2026-10-05", "2026-10-19", "2026-10-20T10:00:00Z"),
        };

        const holdIds = {
            hld0900: await insertHold(client, "HLD-0900", userIds.maya, bookIds.dictionary, copyIds.dictionaryAvailable,
                "Cancelled", "2026-10-21T09:00:00Z", "2026-10-22T08:30:00Z"),
            hld0901: await insertHold(client, "HLD-0901", userIds.maya, bookIds.briefHistory, copyIds.briefBorrowed,
                "Fulfilled", "2026-10-25T09:00:00Z", "2026-10-26T08:30:00Z"),
            hld1001: await insertHold(client, "HLD-1001", userIds.maya, bookIds.midnight, copyIds.midnightReserved,
                "Ready", "2026-11-01T09:00:00Z", "2026-11-02T08:30:00Z"),
            hld1002: await insertHold(client, "HLD-1002", userIds.fresh, bookIds.wonder, copyIds.wonderReserved,
                "Ready", "2026-11-03T09:00:00Z", "2026-11-04T08:30:00Z"),
            hld1003: await insertHold(client, "HLD-1003", userIds.maya, bookIds.dictionary, copyIds.dictionaryReserved,
                "Ready", "2026-11-05T09:00:00Z", "2026-11-06T08:30:00Z"),
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

type Fixture = Awaited<ReturnType<typeof seedLoansData>>;

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

/** CURRENT_DATE + offsetDays as "YYYY-MM-DD", read from the database so it matches CURRENT_DATE in the repository SQL. */
async function dbDate(offsetDays: number): Promise<string> {
    const result = await pool.query<{ day: string }>("SELECT (CURRENT_DATE + $1::int)::text AS day", [offsetDays]);
    const day = result.rows[0]?.day;
    if (day === undefined) {
        throw new Error("dbDate query returned no row");
    }
    return day;
}

/** Compares two timestamps in PostgreSQL, so the text format the repository returns does not matter. */
async function sameInstant(a: string, b: string): Promise<boolean> {
    const result = await pool.query<{ same: boolean }>("SELECT $1::timestamptz = $2::timestamptz AS same", [a, b]);
    return result.rows[0]?.same ?? false;
}

async function copyRowOf(copyCode: string): Promise<{ state: string; condition: string } | undefined> {
    const result = await pool.query<{ state: string; condition: string }>(
        "SELECT state, condition FROM physical_copies WHERE copy_code = $1",
        [copyCode],
    );
    return result.rows[0];
}

async function holdStatusOf(holdCode: string): Promise<string | undefined> {
    const result = await pool.query<{ status: string }>("SELECT status FROM holds WHERE hold_code = $1", [holdCode]);
    return result.rows[0]?.status;
}

async function countLoans(): Promise<number> {
    const result = await pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM loans");
    return result.rows[0]?.count ?? -1;
}

function expectIssued(result: IssueLoansResultEntity | null): IssueLoansResultEntity {
    if (result === null) {
        throw new Error("Expected issueLoans to issue the loans, got null");
    }
    return result;
}

const borrowCodesOf = (loans: { borrowCode: string }[]): string[] => loans.map((loan) => loan.borrowCode);
const holdCodesOf = (holds: { holdCode: string }[]): string[] => holds.map((hold) => hold.holdCode);

let fixture: Fixture;

describe("Loans repositories", () => {
    beforeEach(async () => {
        await truncateAllTables();
        fixture = await seedLoansData();
    });

    afterEach(async () => {
        await truncateAllTables();
    });

    // afterAll(async () => {
    //     await pool.end();
    // });

    // =======================================================================
    // BorrowersRepository
    // =======================================================================
    describe("BorrowersRepository", () => {
        describe("getBorrowerWithStatsByAccountId", () => {
            it("returns the student profile with loan, overdue and fine counters", async () => {
                const result = await borrowersRepository.getBorrowerWithStatsByAccountId(ACCOUNT.maya);

                expect(result).toEqual({
                    _id: String(fixture.userIds.maya),
                    accountId: ACCOUNT.maya,
                    fullName: "Maya Chen",
                    initials: "MC",
                    yearGroup: "Year 10",
                    status: "Active",
                    activeLoansCount: 2, // returned loans and Ready holds do not count
                    maxLoansLimit: 5,
                    overdueLoansCount: 0,
                    unpaidFines: 0,
                });
                // console.log("getBorrowerWithStatsByAccountId(maya):", result);
            });

            it("counts active loans past their due date as overdue", async () => {
                const result = await borrowersRepository.getBorrowerWithStatsByAccountId(ACCOUNT.amira);

                expect(result).toMatchObject({ initials: "AK", activeLoansCount: 1, overdueLoansCount: 1, unpaidFines: 0 });
                // console.log("getBorrowerWithStatsByAccountId(amira):", result);
            });

            it("sums only unpaid fines and returns them as a number", async () => {
                const result = await borrowersRepository.getBorrowerWithStatsByAccountId(ACCOUNT.fines);

                expect(result).toMatchObject({ activeLoansCount: 0, overdueLoansCount: 0, unpaidFines: 3.75 });
                expect(typeof result?.unpaidFines).toBe("number");
                // console.log("getBorrowerWithStatsByAccountId(fines):", result);
            });

            it("still returns an inactive student so the service can explain why checkout is blocked", async () => {
                const result = await borrowersRepository.getBorrowerWithStatsByAccountId(ACCOUNT.inactive);

                expect(result).toMatchObject({ accountId: ACCOUNT.inactive, status: "Inactive" });
            });

            it("returns null for a staff account, an unknown account, or a numeric user id", async () => {
                expect(await borrowersRepository.getBorrowerWithStatsByAccountId(ACCOUNT.staff)).toBeNull();
                expect(await borrowersRepository.getBorrowerWithStatsByAccountId("S99999")).toBeNull();
                expect(await borrowersRepository.getBorrowerWithStatsByAccountId(String(fixture.userIds.maya))).toBeNull();
            });
        });

        describe("getBorrowerWithStatsById", () => {
            it("returns the same borrower as the account id lookup", async () => {
                const byId = await borrowersRepository.getBorrowerWithStatsById(String(fixture.userIds.maya));
                const byAccountId = await borrowersRepository.getBorrowerWithStatsByAccountId(ACCOUNT.maya);

                expect(byId).toEqual(byAccountId);
                // console.log("getBorrowerWithStatsById(maya):", byId);
            });

            it("returns null for a staff user id or an unknown user id", async () => {
                expect(await borrowersRepository.getBorrowerWithStatsById(String(fixture.userIds.staff))).toBeNull();
                expect(await borrowersRepository.getBorrowerWithStatsById("999999")).toBeNull();
            });
        });
    });

    // =======================================================================
    // LoansRepository: queries
    // =======================================================================
    describe("LoansRepository", () => {
        describe("getLoanWithDetailByIdOrBorrowCode", () => {
            it("finds an active loan by borrow code with its book, copy and borrower", async () => {
                const result = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1004");

                expect(result).toEqual({
                    _id: String(fixture.loanIds.br1004),
                    borrowCode: "BR-1004",
                    status: "Active",
                    borrowedAt: await dbDate(-13),
                    dueDate: await dbDate(1),
                    returnedAt: null,
                    returnCondition: null,
                    renewalCount: 0,
                    book: {
                        _id: String(fixture.bookIds.wonder),
                        title: "Wonder",
                        author: "R.J. Palacio",
                        coverImageUrl: null,
                    },
                    copy: {
                        _id: String(fixture.copyIds.wonderBorrowed),
                        copyCode: COPY.wonderBorrowed,
                        condition: "Good",
                        homeLocation: LOCATION.wonder,
                    },
                    borrower: {
                        _id: String(fixture.userIds.maya),
                        accountId: ACCOUNT.maya,
                        fullName: "Maya Chen",
                        initials: "MC",
                        yearGroup: "Year 10",
                        activeLoansCount: 2,
                        maxLoansLimit: 5,
                    },
                });
                // console.log("getLoanWithDetailByIdOrBorrowCode(BR-1004):", result);
            });

            it("finds the same loan by its database id", async () => {
                const byCode = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1004");
                const byId = await loansRepository.getLoanWithDetailByIdOrBorrowCode(String(fixture.loanIds.br1004));

                expect(byId).toEqual(byCode);
            });

            it("returns a returned loan with its return time and condition", async () => {
                const result = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1000");

                expect(result).toMatchObject({
                    borrowCode: "BR-1000",
                    status: "Returned",
                    borrowedAt: "2026-10-01",
                    dueDate: "2026-10-15",
                    returnCondition: "Good",
                    copy: { copyCode: COPY.midnightAvailable },
                });
                expect(await sameInstant(result?.returnedAt ?? "", "2026-10-14T10:00:00Z")).toBe(true);
                // console.log("getLoanWithDetailByIdOrBorrowCode(BR-1000):", result);
            });

            it("returns null for an unknown borrow code or id", async () => {
                expect(await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-9999")).toBeNull();
                expect(await loansRepository.getLoanWithDetailByIdOrBorrowCode("999999")).toBeNull();
            });
        });

        describe("getActiveLoanWithDetailByCopyCode", () => {
            it("returns the active loan of a borrowed copy", async () => {
                const result = await loansRepository.getActiveLoanWithDetailByCopyCode(COPY.briefBorrowed);

                expect(result).toMatchObject({
                    _id: String(fixture.loanIds.br1002),
                    borrowCode: "BR-1002",
                    status: "Active",
                    dueDate: await dbDate(10),
                    renewalCount: 1,
                    book: { title: "A Brief History of Time", author: "Stephen Hawking" },
                    copy: { copyCode: COPY.briefBorrowed, condition: "Good", homeLocation: LOCATION.brief },
                    borrower: { accountId: ACCOUNT.maya, activeLoansCount: 2 },
                });
                // console.log("getActiveLoanWithDetailByCopyCode(WB-00632):", result);
            });

            it("returns an overdue active loan too", async () => {
                const result = await loansRepository.getActiveLoanWithDetailByCopyCode(COPY.midnightBorrowed);

                expect(result).toMatchObject({ borrowCode: "BR-1001", dueDate: await dbDate(-2) });
            });

            it("returns null when the copy only has returned loans, was never borrowed, or does not exist", async () => {
                expect(await loansRepository.getActiveLoanWithDetailByCopyCode(COPY.midnightAvailable)).toBeNull();
                expect(await loansRepository.getActiveLoanWithDetailByCopyCode(COPY.wonderAvailable)).toBeNull();
                expect(await loansRepository.getActiveLoanWithDetailByCopyCode("WB-99999")).toBeNull();
            });
        });

        describe("getCurrentLoansWithDetailByStudentId", () => {
            it("lists only the student's active loans, earliest due date first", async () => {
                const result = await loansRepository.getCurrentLoansWithDetailByStudentId(String(fixture.userIds.maya));

                expect(borrowCodesOf(result)).toEqual(["BR-1004", "BR-1002"]);
                expect(result.every((loan) => loan.status === "Active")).toBe(true);
                expect(result[0]).toMatchObject({ dueDate: await dbDate(1), book: { title: "Wonder" } });
                // console.log("getCurrentLoansWithDetailByStudentId(maya):", result);
            });

            it("returns an empty list for a student without active loans", async () => {
                expect(await loansRepository.getCurrentLoansWithDetailByStudentId(String(fixture.userIds.fresh))).toEqual([]);
                expect(await loansRepository.getCurrentLoansWithDetailByStudentId("999999")).toEqual([]);
            });
        });

        describe("getReturnedLoansWithDetailByStudentId", () => {
            it("lists only the student's returned loans, latest return first", async () => {
                const result = await loansRepository.getReturnedLoansWithDetailByStudentId(String(fixture.userIds.maya));

                expect(borrowCodesOf(result)).toEqual(["BR-1005", "BR-1000"]);
                expect(result.every((loan) => loan.status === "Returned")).toBe(true);
                expect(result[0]).toMatchObject({
                    borrowedAt: "2026-10-05",
                    dueDate: "2026-10-19",
                    returnCondition: "Good",
                    book: { title: "Oxford English Dictionary" },
                    copy: { copyCode: COPY.dictionaryAvailable },
                });
                expect(result[0]?.returnedAt).toEqual(expect.any(String));
                // console.log("getReturnedLoansWithDetailByStudentId(maya):", result);
            });

            it("returns an empty list for a student without returned loans", async () => {
                expect(await loansRepository.getReturnedLoansWithDetailByStudentId(String(fixture.userIds.amira))).toEqual([]);
            });
        });

        describe("getLoanRecords", () => {
            const activeDefaults = {
                tab: "active",
                sortBy: "dueDate",
                sortOrder: "asc",
                page: 1,
                limit: 10,
            } as const;

            it("lists active loans sorted by due date with the total count", async () => {
                const result = await loansRepository.getLoanRecords(activeDefaults);

                expect(borrowCodesOf(result.loans)).toEqual(["BR-1001", "BR-1004", "BR-1002"]);
                expect(result.totalItem).toBe(3);
                expect(result.loans[0]).toMatchObject({
                    _id: String(fixture.loanIds.br1001),
                    status: "Active",
                    book: { _id: String(fixture.bookIds.midnight), title: "The Midnight Library" },
                    copy: { _id: String(fixture.copyIds.midnightBorrowed), copyCode: COPY.midnightBorrowed },
                    borrower: { _id: String(fixture.userIds.amira), accountId: ACCOUNT.amira, fullName: "Amira Khan" },
                });
                // console.log("getLoanRecords(active):", result);
            });

            it("sorts descending and by borrowed date", async () => {
                const dueDesc = await loansRepository.getLoanRecords({ ...activeDefaults, sortOrder: "desc" });
                expect(borrowCodesOf(dueDesc.loans)).toEqual(["BR-1002", "BR-1004", "BR-1001"]);
                // console.log("dueDate desc:", dueDesc);

                const borrowedAsc = await loansRepository.getLoanRecords({ ...activeDefaults, sortBy: "borrowedAt" });
                expect(borrowCodesOf(borrowedAsc.loans)).toEqual(["BR-1002", "BR-1001", "BR-1004"]);
                // console.log("borrowedAt asc:", borrowedAsc);
            });

            it("lists returned loans on the returned tab, sorted by return time", async () => {
                const latestFirst = await loansRepository.getLoanRecords({
                    ...activeDefaults,
                    tab: "returned",
                    sortBy: "returnedAt",
                    sortOrder: "desc",
                });
                expect(borrowCodesOf(latestFirst.loans)).toEqual(["BR-1005", "BR-1000"]);
                expect(latestFirst.totalItem).toBe(2);
                expect(latestFirst.loans.every((loan) => loan.status === "Returned")).toBe(true);
                // console.log("returned desc:", latestFirst);

                const oldestFirst = await loansRepository.getLoanRecords({
                    ...activeDefaults,
                    tab: "returned",
                    sortBy: "returnedAt",
                    sortOrder: "asc",
                });
                expect(borrowCodesOf(oldestFirst.loans)).toEqual(["BR-1000", "BR-1005"]);
            });

            it("filters active loans by status: overdue, due soon, on loan", async () => {
                const overdue = await loansRepository.getLoanRecords({ ...activeDefaults, status: "overdue" });
                expect(borrowCodesOf(overdue.loans)).toEqual(["BR-1001"]);
                expect(overdue.totalItem).toBe(1);

                const dueSoon = await loansRepository.getLoanRecords({ ...activeDefaults, status: "due_soon" });
                expect(borrowCodesOf(dueSoon.loans)).toEqual(["BR-1004"]);

                const onLoan = await loansRepository.getLoanRecords({ ...activeDefaults, status: "on_loan" });
                expect(borrowCodesOf(onLoan.loans)).toEqual(["BR-1002"]);
                // console.log("status filters:", overdue, dueSoon, onLoan);
            });

            it("searches borrow code, copy code, student account id and name, and book title case-insensitively", async () => {
                const byBorrowCode = await loansRepository.getLoanRecords({ ...activeDefaults, q: "br-1004" });
                expect(borrowCodesOf(byBorrowCode.loans)).toEqual(["BR-1004"]);

                const byCopyCode = await loansRepository.getLoanRecords({ ...activeDefaults, q: "wb-00632" });
                expect(borrowCodesOf(byCopyCode.loans)).toEqual(["BR-1002"]);

                const byAccountId = await loansRepository.getLoanRecords({ ...activeDefaults, q: "stu001" });
                expect(borrowCodesOf(byAccountId.loans)).toEqual(["BR-1004", "BR-1002"]);
                expect(byAccountId.totalItem).toBe(2);

                const byStudentName = await loansRepository.getLoanRecords({ ...activeDefaults, q: "AMIRA" });
                expect(borrowCodesOf(byStudentName.loans)).toEqual(["BR-1001"]);

                const byTitle = await loansRepository.getLoanRecords({ ...activeDefaults, q: "midnight" });
                expect(borrowCodesOf(byTitle.loans)).toEqual(["BR-1001"]);

                const noMatch = await loansRepository.getLoanRecords({ ...activeDefaults, q: "no such loan" });
                expect(noMatch).toEqual({ loans: [], totalItem: 0 });
                // console.log("q searches:", byBorrowCode, byCopyCode, byAccountId, byStudentName, byTitle, noMatch);
            });

            it("searches only inside the selected tab", async () => {
                const returnedMidnight = await loansRepository.getLoanRecords({
                    ...activeDefaults,
                    tab: "returned",
                    sortBy: "returnedAt",
                    q: "midnight",
                });

                expect(borrowCodesOf(returnedMidnight.loans)).toEqual(["BR-1000"]);
            });

            it("combines search and status with AND", async () => {
                const result = await loansRepository.getLoanRecords({ ...activeDefaults, q: "STU001", status: "due_soon" });

                expect(borrowCodesOf(result.loans)).toEqual(["BR-1004"]);
                expect(result.totalItem).toBe(1);
            });

            it("paginates and reports the total number of matching loans", async () => {
                const firstPage = await loansRepository.getLoanRecords({ ...activeDefaults, page: 1, limit: 2 });
                expect(borrowCodesOf(firstPage.loans)).toEqual(["BR-1001", "BR-1004"]);
                expect(firstPage.totalItem).toBe(3);
                // console.log("page 1:", firstPage);

                const secondPage = await loansRepository.getLoanRecords({ ...activeDefaults, page: 2, limit: 2 });
                expect(borrowCodesOf(secondPage.loans)).toEqual(["BR-1002"]);
                expect(secondPage.totalItem).toBe(3);
                // console.log("page 2:", secondPage);

                const beyondLastPage = await loansRepository.getLoanRecords({ ...activeDefaults, page: 3, limit: 2 });
                expect(beyondLastPage.loans).toEqual([]);
                // totalItem is not checked here: with COUNT(*) OVER() an empty page has no row to carry it
            });
        });

        // ===================================================================
        // LoansRepository: writes
        // ===================================================================
        describe("issueLoans", () => {
            it("issues an available copy and the student's own reserved copy in one batch", async () => {
                const dueDate = await dbDate(14);

                const result = expectIssued(
                    await loansRepository.issueLoans({
                        studentId: String(fixture.userIds.fresh),
                        items: [
                            { copyCode: COPY.wonderAvailable, dueDate },
                            { copyCode: COPY.wonderReserved, dueDate },
                        ],
                    }),
                );

                expect(result.issuedAt).toEqual(expect.any(String));
                expect(result.loansBefore).toBe(0);
                expect(result.loansNow).toBe(2);
                expect(result.fulfilledHolds).toEqual([{ holdCode: "HLD-1002", copyCode: COPY.wonderReserved }]);

                const entries = [...result.borrowEntries].sort((a, b) => a.copyCode.localeCompare(b.copyCode));
                expect(entries).toEqual([
                    {
                        _id: expect.any(String),
                        borrowCode: expect.stringMatching(BORROW_CODE_PATTERN),
                        copyId: String(fixture.copyIds.wonderAvailable),
                        copyCode: COPY.wonderAvailable,
                        book: { _id: String(fixture.bookIds.wonder), title: "Wonder", author: "R.J. Palacio", coverImageUrl: null },
                        borrowedAt: await dbDate(0),
                        dueDate,
                    },
                    {
                        _id: expect.any(String),
                        borrowCode: expect.stringMatching(BORROW_CODE_PATTERN),
                        copyId: String(fixture.copyIds.wonderReserved),
                        copyCode: COPY.wonderReserved,
                        book: { _id: String(fixture.bookIds.wonder), title: "Wonder", author: "R.J. Palacio", coverImageUrl: null },
                        borrowedAt: await dbDate(0),
                        dueDate,
                    },
                ]);
                expect(new Set(borrowCodesOf(entries)).size).toBe(2);
                expect(borrowCodesOf(entries)).not.toContain("BR-1000");
                // console.log("issueLoans:", result);

                // copies are Borrowed and the hold is Fulfilled
                expect((await copyRowOf(COPY.wonderAvailable))?.state).toBe("Borrowed");
                expect((await copyRowOf(COPY.wonderReserved))?.state).toBe("Borrowed");
                expect(await holdStatusOf("HLD-1002")).toBe("Fulfilled");

                // the new loans are readable as active loans of the student
                const current = await loansRepository.getCurrentLoansWithDetailByStudentId(String(fixture.userIds.fresh));
                expect(current.map((loan) => loan.copy.copyCode).sort()).toEqual([COPY.wonderAvailable, COPY.wonderReserved]);

                const borrower = await borrowersRepository.getBorrowerWithStatsById(String(fixture.userIds.fresh));
                expect(borrower?.activeLoansCount).toBe(2);
            });

            it("counts the loans the student already had in loansBefore / loansNow", async () => {
                const result = expectIssued(
                    await loansRepository.issueLoans({
                        studentId: String(fixture.userIds.maya),
                        items: [{ copyCode: COPY.midnightReserved, dueDate: await dbDate(14) }],
                    }),
                );

                expect(result.loansBefore).toBe(2);
                expect(result.loansNow).toBe(3);
                expect(result.fulfilledHolds).toEqual([{ holdCode: "HLD-1001", copyCode: COPY.midnightReserved }]);
                // console.log("issueLoans(maya, own hold):", result);

                // Maya's hold on another title is not touched
                expect(await holdStatusOf("HLD-1003")).toBe("Ready");
            });

            it("fulfils no hold when the issued copies are not reserved for the student", async () => {
                const result = expectIssued(
                    await loansRepository.issueLoans({
                        studentId: String(fixture.userIds.maya),
                        items: [{ copyCode: COPY.wonderAvailable, dueDate: await dbDate(14) }],
                    }),
                );

                expect(result.fulfilledHolds).toEqual([]);
                expect(await holdStatusOf("HLD-1001")).toBe("Ready");
                expect(await holdStatusOf("HLD-1003")).toBe("Ready");
            });

            it("is all or nothing: one borrowed copy in the batch rejects the whole batch", async () => {
                const before = await countLoans();

                const result = await loansRepository.issueLoans({
                    studentId: String(fixture.userIds.fresh),
                    items: [
                        { copyCode: COPY.dictionaryAvailable, dueDate: await dbDate(14) },
                        { copyCode: COPY.briefBorrowed, dueDate: await dbDate(14) },
                    ],
                });

                expect(result).toBeNull();
                expect(await countLoans()).toBe(before);
                expect((await copyRowOf(COPY.dictionaryAvailable))?.state).toBe("Available");
                expect(await loansRepository.getCurrentLoansWithDetailByStudentId(String(fixture.userIds.fresh))).toEqual([]);
                // console.log("issueLoans mixed batch:", result);
            });

            it("returns null for a copy reserved for another student and keeps that hold", async () => {
                const result = await loansRepository.issueLoans({
                    studentId: String(fixture.userIds.fresh),
                    items: [{ copyCode: COPY.midnightReserved, dueDate: await dbDate(14) }],
                });

                expect(result).toBeNull();
                expect(await holdStatusOf("HLD-1001")).toBe("Ready");
                expect((await copyRowOf(COPY.midnightReserved))?.state).toBe("Reserved");
            });

            it("returns null for damaged and lost copies", async () => {
                const damaged = await loansRepository.issueLoans({
                    studentId: String(fixture.userIds.fresh),
                    items: [{ copyCode: COPY.midnightDamaged, dueDate: await dbDate(14) }],
                });
                expect(damaged).toBeNull();

                const lost = await loansRepository.issueLoans({
                    studentId: String(fixture.userIds.fresh),
                    items: [{ copyCode: COPY.persepolisLost, dueDate: await dbDate(14) }],
                });
                expect(lost).toBeNull();

                expect((await copyRowOf(COPY.midnightDamaged))?.state).toBe("Damaged");
                expect((await copyRowOf(COPY.persepolisLost))?.state).toBe("Lost");
            });

            it("returns null when a copy code does not exist instead of issuing the rest", async () => {
                const before = await countLoans();

                const result = await loansRepository.issueLoans({
                    studentId: String(fixture.userIds.fresh),
                    items: [
                        { copyCode: COPY.wonderAvailable, dueDate: await dbDate(14) },
                        { copyCode: "WB-99999", dueDate: await dbDate(14) },
                    ],
                });

                expect(result).toBeNull();
                expect(await countLoans()).toBe(before);
                expect((await copyRowOf(COPY.wonderAvailable))?.state).toBe("Available");
            });

            it("issues a copy only once when two checkouts race for it", async () => {
                const dueDate = await dbDate(14);

                const results = await Promise.all([
                    loansRepository.issueLoans({
                        studentId: String(fixture.userIds.fresh),
                        items: [{ copyCode: COPY.dictionaryAvailable, dueDate }],
                    }),
                    loansRepository.issueLoans({
                        studentId: String(fixture.userIds.fines),
                        items: [{ copyCode: COPY.dictionaryAvailable, dueDate }],
                    }),
                ]);

                expect(results.filter((result) => result !== null)).toHaveLength(1);
                expect(results.filter((result) => result === null)).toHaveLength(1);
                // console.log("issueLoans race:", results);

                const activeOnCopy = await pool.query<{ count: number }>(
                    "SELECT COUNT(*)::int AS count FROM loans WHERE copy_id = $1 AND status = 'Active'",
                    [fixture.copyIds.dictionaryAvailable],
                );
                expect(activeOnCopy.rows[0]?.count).toBe(1);
            });
        });

        describe("returnLoan", () => {
            it("closes an active loan returned in good condition and makes the copy available", async () => {
                const result = await loansRepository.returnLoan({
                    loanId: String(fixture.loanIds.br1004),
                    condition: "Good",
                    conditionNote: "No new damage",
                });

                expect(result).toEqual({
                    _id: String(fixture.loanIds.br1004),
                    borrowCode: "BR-1004",
                    status: "Returned",
                    borrowerAccountId: ACCOUNT.maya,
                    borrowerFullName: "Maya Chen",
                    loansBefore: 2,
                    loansAfter: 1,
                    borrowedAt: await dbDate(-13),
                    dueDate: await dbDate(1),
                    returnedAt: expect.any(String),
                    returnCondition: "Good",
                    conditionNote: "No new damage",
                    copyCode: COPY.wonderBorrowed,
                    copyNewState: "Available",
                    copyHomeLocation: LOCATION.wonder,
                });
                // console.log("returnLoan(BR-1004, Good):", result);

                // the loan is kept in history, not deleted
                const loan = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1004");
                expect(loan).toMatchObject({ status: "Returned", returnCondition: "Good" });
                expect(loan?.returnedAt).toEqual(expect.any(String));

                expect(await copyRowOf(COPY.wonderBorrowed)).toEqual({ state: "Available", condition: "Good" });
                expect(await loansRepository.getActiveLoanWithDetailByCopyCode(COPY.wonderBorrowed)).toBeNull();

                const borrower = await borrowersRepository.getBorrowerWithStatsById(String(fixture.userIds.maya));
                expect(borrower?.activeLoansCount).toBe(1);
            });

            it("only changes the copy of the returned loan", async () => {
                await loansRepository.returnLoan({ loanId: String(fixture.loanIds.br1004), condition: "Good" });

                // the other copies keep their state
                expect((await copyRowOf(COPY.midnightDamaged))?.state).toBe("Damaged");
                expect((await copyRowOf(COPY.briefBorrowed))?.state).toBe("Borrowed");
                expect((await copyRowOf(COPY.midnightBorrowed))?.state).toBe("Borrowed");
            });

            it("marks the copy Damaged when it comes back damaged, with no note", async () => {
                const result = await loansRepository.returnLoan({
                    loanId: String(fixture.loanIds.br1002),
                    condition: "Damaged",
                });

                expect(result).toMatchObject({
                    borrowCode: "BR-1002",
                    returnCondition: "Damaged",
                    conditionNote: null,
                    copyCode: COPY.briefBorrowed,
                    copyNewState: "Damaged",
                });
                expect(await copyRowOf(COPY.briefBorrowed)).toEqual({ state: "Damaged", condition: "Damaged" });
                // console.log("returnLoan(BR-1002, Damaged):", result);
            });

            it("marks the copy Lost and allows an overdue return", async () => {
                const result = await loansRepository.returnLoan({
                    loanId: String(fixture.loanIds.br1001),
                    condition: "Lost",
                });

                expect(result).toMatchObject({
                    borrowCode: "BR-1001",
                    borrowerAccountId: ACCOUNT.amira,
                    loansBefore: 1,
                    loansAfter: 0,
                    returnCondition: "Lost",
                    copyNewState: "Lost",
                });
                expect(await copyRowOf(COPY.midnightBorrowed)).toEqual({ state: "Lost", condition: "Lost" });
                // console.log("returnLoan(BR-1001, Lost):", result);
            });

            it("returns null the second time and leaves the copy as the first return set it", async () => {
                await loansRepository.returnLoan({ loanId: String(fixture.loanIds.br1004), condition: "Good" });

                const again = await loansRepository.returnLoan({ loanId: String(fixture.loanIds.br1004), condition: "Lost" });

                expect(again).toBeNull();
                expect(await copyRowOf(COPY.wonderBorrowed)).toEqual({ state: "Available", condition: "Good" });
                const loan = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1004");
                expect(loan?.returnCondition).toBe("Good");
            });

            it("returns null for a loan that was already returned or does not exist", async () => {
                const returned = await loansRepository.returnLoan({ loanId: String(fixture.loanIds.br1000), condition: "Damaged" });
                expect(returned).toBeNull();
                expect((await copyRowOf(COPY.midnightAvailable))?.state).toBe("Available");

                const unknown = await loansRepository.returnLoan({ loanId: "999999", condition: "Good" });
                expect(unknown).toBeNull();
            });
        });

        describe("renewLoan", () => {
            it("extends the due date once and increments the renewal count", async () => {
                const result = await loansRepository.renewLoan({ loanId: String(fixture.loanIds.br1004), extraDays: 7 });

                expect(result).toEqual({
                    _id: String(fixture.loanIds.br1004),
                    borrowCode: "BR-1004",
                    previousDueDate: await dbDate(1),
                    newDueDate: await dbDate(8),
                    renewalCount: 1,
                });
                // console.log("renewLoan(BR-1004):", result);

                const persisted = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1004");
                expect(persisted).toMatchObject({ dueDate: await dbDate(8), renewalCount: 1 });
            });

            it("returns null for a second renewal and keeps the renewed due date", async () => {
                await loansRepository.renewLoan({ loanId: String(fixture.loanIds.br1004), extraDays: 7 });

                const again = await loansRepository.renewLoan({ loanId: String(fixture.loanIds.br1004), extraDays: 7 });

                expect(again).toBeNull();
                const persisted = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1004");
                expect(persisted).toMatchObject({ dueDate: await dbDate(8), renewalCount: 1 });
            });

            it("returns null for a loan that was already renewed in the seed data", async () => {
                const result = await loansRepository.renewLoan({ loanId: String(fixture.loanIds.br1002), extraDays: 7 });

                expect(result).toBeNull();
                const persisted = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1002");
                expect(persisted?.dueDate).toBe(await dbDate(10));
            });

            it("returns null for a returned loan or an unknown loan", async () => {
                expect(await loansRepository.renewLoan({ loanId: String(fixture.loanIds.br1000), extraDays: 7 })).toBeNull();
                expect(await loansRepository.renewLoan({ loanId: "999999", extraDays: 7 })).toBeNull();

                const returned = await loansRepository.getLoanWithDetailByIdOrBorrowCode("BR-1000");
                expect(returned).toMatchObject({ dueDate: "2026-10-15", renewalCount: 0 });
            });
        });
    });

    // =======================================================================
    // LoanCopiesRepository
    // =======================================================================
    describe("LoanCopiesRepository", () => {
        describe("getCopiesForCheckoutByCopyCodes", () => {
            it("returns an available copy with its book and no active loan or hold", async () => {
                const result = await loanCopiesRepository.getCopiesForCheckoutByCopyCodes([COPY.wonderAvailable]);

                expect(result).toEqual([
                    {
                        _id: String(fixture.copyIds.wonderAvailable),
                        copyCode: COPY.wonderAvailable,
                        state: "Available",
                        condition: "Good",
                        homeLocation: LOCATION.wonder,
                        book: { _id: String(fixture.bookIds.wonder), title: "Wonder", author: "R.J. Palacio", coverImageUrl: null },
                        activeLoan: null,
                        activeHold: null,
                    },
                ]);
                // console.log("getCopiesForCheckoutByCopyCodes(available):", result);
            });

            it("returns the active loan of a borrowed copy", async () => {
                const [copy] = await loanCopiesRepository.getCopiesForCheckoutByCopyCodes([COPY.midnightBorrowed]);

                expect(copy).toMatchObject({
                    copyCode: COPY.midnightBorrowed,
                    state: "Borrowed",
                    activeLoan: {
                        borrowCode: "BR-1001",
                        studentName: "Amira Khan",
                        studentAccountId: ACCOUNT.amira,
                        dueDate: await dbDate(-2),
                    },
                    activeHold: null,
                });
                // console.log("getCopiesForCheckoutByCopyCodes(borrowed):", copy);
            });

            it("returns the Ready hold of a reserved copy", async () => {
                const [copy] = await loanCopiesRepository.getCopiesForCheckoutByCopyCodes([COPY.midnightReserved]);

                expect(copy).toMatchObject({
                    copyCode: COPY.midnightReserved,
                    state: "Reserved",
                    activeLoan: null,
                    activeHold: {
                        _id: String(fixture.holdIds.hld1001),
                        holdCode: "HLD-1001",
                        studentName: "Maya Chen",
                        studentAccountId: ACCOUNT.maya,
                        collectBy: expect.any(String),
                    },
                });
                expect(await sameInstant(copy?.activeHold?.collectBy ?? "", "2026-11-02T08:30:00Z")).toBe(true);
                // console.log("getCopiesForCheckoutByCopyCodes(reserved):", copy);
            });

            it("ignores returned loans and cancelled or fulfilled holds", async () => {
                const result = await loanCopiesRepository.getCopiesForCheckoutByCopyCodes([
                    COPY.midnightAvailable, // returned loan BR-1000 only
                    COPY.dictionaryAvailable, // returned loan BR-1005 and cancelled hold HLD-0900
                    COPY.briefBorrowed, // fulfilled hold HLD-0901 and active loan BR-1002
                ]);

                const byCode = Object.fromEntries(result.map((copy) => [copy.copyCode, copy]));
                expect(byCode[COPY.midnightAvailable]).toMatchObject({ activeLoan: null, activeHold: null });
                expect(byCode[COPY.dictionaryAvailable]).toMatchObject({ activeLoan: null, activeHold: null });
                expect(byCode[COPY.briefBorrowed]).toMatchObject({ activeLoan: { borrowCode: "BR-1002" }, activeHold: null });
            });

            it("returns only the codes that exist, sorted by copy code", async () => {
                const result = await loanCopiesRepository.getCopiesForCheckoutByCopyCodes([
                    COPY.dictionaryAvailable,
                    "WB-99999",
                    COPY.wonderAvailable,
                    COPY.midnightDamaged,
                ]);

                expect(result.map((copy) => copy.copyCode)).toEqual([
                    COPY.wonderAvailable,
                    COPY.midnightDamaged,
                    COPY.dictionaryAvailable,
                ]);
                expect(result.find((copy) => copy.copyCode === COPY.midnightDamaged)).toMatchObject({
                    state: "Damaged",
                    condition: "Damaged",
                });
                // console.log("getCopiesForCheckoutByCopyCodes(several):", result);
            });

            it("returns an empty list for no codes or only unknown codes", async () => {
                expect(await loanCopiesRepository.getCopiesForCheckoutByCopyCodes([])).toEqual([]);
                expect(await loanCopiesRepository.getCopiesForCheckoutByCopyCodes(["WB-99999"])).toEqual([]);
            });
        });
    });

    // =======================================================================
    // LoanHoldsRepository
    // =======================================================================
    describe("LoanHoldsRepository", () => {
        describe("getReadyHoldsByStudentId", () => {
            it("lists only the student's Ready holds, newest first, with book and copy", async () => {
                const result = await loanHoldsRepository.getReadyHoldsByStudentId(String(fixture.userIds.maya));

                expect(holdCodesOf(result)).toEqual(["HLD-1003", "HLD-1001"]);
                expect(result[1]).toEqual({
                    _id: String(fixture.holdIds.hld1001),
                    holdCode: "HLD-1001",
                    status: "Ready",
                    requestedAt: expect.any(String),
                    collectBy: expect.any(String),
                    book: {
                        _id: String(fixture.bookIds.midnight),
                        title: "The Midnight Library",
                        author: "Matt Haig",
                        format: "Paperback",
                        coverImageUrl: null,
                    },
                    copy: {
                        _id: String(fixture.copyIds.midnightReserved),
                        copyCode: COPY.midnightReserved,
                        homeLocation: LOCATION.midnight,
                    },
                });
                expect(await sameInstant(result[1]?.requestedAt ?? "", "2026-11-01T09:00:00Z")).toBe(true);
                // console.log("getReadyHoldsByStudentId(maya):", result);
            });

            it("returns copy null when the assigned copy was deleted", async () => {
                await pool.query("UPDATE holds SET copy_id = NULL WHERE hold_code = 'HLD-1002'");

                const result = await loanHoldsRepository.getReadyHoldsByStudentId(String(fixture.userIds.fresh));

                expect(result).toHaveLength(1);
                expect(result[0]).toMatchObject({ holdCode: "HLD-1002", copy: null, book: { title: "Wonder" } });
            });

            it("returns an empty list for a student without Ready holds", async () => {
                expect(await loanHoldsRepository.getReadyHoldsByStudentId(String(fixture.userIds.amira))).toEqual([]);
                expect(await loanHoldsRepository.getReadyHoldsByStudentId("999999")).toEqual([]);
            });
        });

        describe("getBookIdsWithReadyHold", () => {
            it("returns the subset of the given books that have a Ready hold", async () => {
                const result = await loanHoldsRepository.getBookIdsWithReadyHold([
                    String(fixture.bookIds.midnight),
                    String(fixture.bookIds.wonder),
                    String(fixture.bookIds.briefHistory), // only a Fulfilled hold
                    String(fixture.bookIds.persepolis), // no hold
                ]);

                expect([...result].sort()).toEqual(
                    [String(fixture.bookIds.midnight), String(fixture.bookIds.wonder)].sort(),
                );
                // console.log("getBookIdsWithReadyHold:", result);
            });

            it("only looks at the books it is given and returns each book once", async () => {
                const result = await loanHoldsRepository.getBookIdsWithReadyHold([
                    String(fixture.bookIds.dictionary),
                    String(fixture.bookIds.dictionary),
                ]);

                expect(result).toEqual([String(fixture.bookIds.dictionary)]);
            });

            it("returns an empty list when no given book has a Ready hold or no book is given", async () => {
                expect(await loanHoldsRepository.getBookIdsWithReadyHold([String(fixture.bookIds.briefHistory)])).toEqual([]);
                expect(await loanHoldsRepository.getBookIdsWithReadyHold([])).toEqual([]);
            });
        });
    });
});
