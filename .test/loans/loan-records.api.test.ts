import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    NEW_STUDENT,
    SEED_ACTIVE_LOANS_BY_DUE_DATE,
    SEED_LOAN,
    SEED_STUDENT,
    createStudent,
    issueBooks
} from "../helpers/borrowing.js";
import type { Client } from "../helpers/client.js";
import { isoDateFromToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// GET /staff/loans (contract 7.6), Staff only. The "Loan Records" screen.
// Query: tab (active | returned, default active), q (student name, account id, copyCode,
// borrowCode, book title), status (all | overdue | due_soon | on_loan, default all),
// sortBy (dueDate | borrowedAt | returnedAt, default dueDate), sortOrder (asc | desc, default asc),
// page (1), limit (6).
// Seed: 4 Active loans, all overdue (see helpers/borrowing.ts), and 1 Returned loan (BR-2040).

const borrowCodesOf = (items: { borrowCode: string }[]): string[] => items.map((item) => item.borrowCode);

/** A new student with two loans: one due tomorrow (due soon) and one due in 14 days (on loan). */
async function twoNewLoans(staff: Client): Promise<{ dueSoon: string; onLoan: string }> {
    await createStudent();
    const soon = await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1], isoDateFromToday(1));
    const later = await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.mangoStreet], isoDateFromToday(14));
    return { dueSoon: soon.borrowEntries[0].borrowCode, onLoan: later.borrowEntries[0].borrowCode };
}

describe("GET /staff/loans", () => {
    beforeEach(resetDatabase);

    describe("tabs", () => {
        it("[LOAN-RECORDS-01] default: active loans sorted by dueDate ascending, page size 6", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").expect(200);

            expect(res.body.success).toBe(true);
            expect(borrowCodesOf(res.body.data.items)).toEqual([...SEED_ACTIVE_LOANS_BY_DUE_DATE]);
            expect(res.body.data.pagination).toEqual({ totalItems: 4, currentPage: 1, totalPages: 1, limit: 6 });
        });

        it("[LOAN-RECORDS-02] each item carries the book, copy and borrower", async () => {
            const loan = SEED_LOAN.oliverHobbit; // BR-2081, the earliest due date
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").expect(200);

            const first = res.body.data.items[0];
            expect(first).toMatchObject({
                _id: expect.any(String),
                borrowCode: loan.borrowCode,
                status: "Active",
                book: { _id: loan.book._id, title: loan.book.title, author: loan.book.author, coverImageUrl: null },
                copy: { _id: expect.any(String), copyCode: loan.copyCode },
                borrower: { _id: expect.any(String), fullName: SEED_STUDENT.oliver.fullName, accountId: SEED_STUDENT.oliver.accountId },
                dueDate: loan.dueDate,
                returnedAt: null,
                returnCondition: null,
                isOverdue: true,
                statusBadge: expect.stringMatching(/^Overdue · \d+ days?$/)
            });
            expect(first.borrowedAt).toMatch(new RegExp(`^${loan.borrowedAt}`));
        });

        it("[LOAN-RECORDS-03] tab=returned lists the returned loan", async () => {
            const returned = SEED_LOAN.mayaReturned;
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").query({ tab: "returned" }).expect(200);

            expect(res.body.data.items).toMatchObject([
                {
                    borrowCode: returned.borrowCode,
                    status: "Returned",
                    copy: { copyCode: returned.copyCode },
                    borrower: { accountId: SEED_STUDENT.maya.accountId },
                    dueDate: returned.dueDate,
                    returnCondition: returned.returnCondition,
                    statusBadge: "Returned"
                }
            ]);
            expect(res.body.data.items[0].returnedAt).toMatch(new RegExp(`^${returned.returnedAt}`));
            expect(res.body.data.pagination.totalItems).toBe(1);
        });

        it("[LOAN-RECORDS-04] a returned loan moves from the active tab to the returned tab", async () => {
            const staff = await signInAs("staff");
            await staff
                .post(`/staff/loans/${SEED_LOAN.mayaWonder.borrowCode}/return`)
                .send({ condition: "Good" })
                .expect(200);

            const active = await staff.get("/staff/loans");
            const history = await staff.get("/staff/loans").query({ tab: "returned" });

            expect(borrowCodesOf(active.body.data.items)).not.toContain(SEED_LOAN.mayaWonder.borrowCode);
            expect(borrowCodesOf(history.body.data.items)).toContain(SEED_LOAN.mayaWonder.borrowCode);
            expect(history.body.data.pagination.totalItems).toBe(2);
        });
    });

    describe("search (q)", () => {
        it.each([
            ["student name (case-insensitive)", "maya", [SEED_LOAN.mayaWonder.borrowCode, SEED_LOAN.mayaBriefHistory.borrowCode]],
            ["student account id", SEED_STUDENT.oliver.accountId, [SEED_LOAN.oliverHobbit.borrowCode]],
            ["copy code", SEED_LOAN.amiraMidnight.copyCode, [SEED_LOAN.amiraMidnight.borrowCode]],
            ["borrow code", SEED_LOAN.mayaBriefHistory.borrowCode, [SEED_LOAN.mayaBriefHistory.borrowCode]],
            ["book title (case-insensitive)", "hobbit", [SEED_LOAN.oliverHobbit.borrowCode]]
        ])("[LOAN-RECORDS-05] by %s", async (_label, q, expected) => {
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").query({ q }).expect(200);

            expect(borrowCodesOf(res.body.data.items)).toEqual(expected);
        });
    });

    describe("status filter and badges", () => {
        it("[LOAN-RECORDS-06] status=overdue keeps only overdue loans", async () => {
            const staff = await signInAs("staff");
            const { dueSoon, onLoan } = await twoNewLoans(staff);

            const res = await staff.get("/staff/loans").query({ status: "overdue" }).expect(200);

            expect(borrowCodesOf(res.body.data.items)).toEqual([...SEED_ACTIVE_LOANS_BY_DUE_DATE]);
            expect(borrowCodesOf(res.body.data.items)).not.toContain(dueSoon);
            expect(borrowCodesOf(res.body.data.items)).not.toContain(onLoan);
        });

        it("[LOAN-RECORDS-07] status=due_soon includes a loan due tomorrow, not overdue or later ones", async () => {
            const staff = await signInAs("staff");
            const { dueSoon, onLoan } = await twoNewLoans(staff);

            const res = await staff.get("/staff/loans").query({ status: "due_soon" }).expect(200);

            expect(borrowCodesOf(res.body.data.items)).toEqual([dueSoon]);
            expect(borrowCodesOf(res.body.data.items)).not.toContain(onLoan);
        });

        it("[LOAN-RECORDS-08] status=on_loan includes a loan due in 14 days and no overdue loan", async () => {
            const staff = await signInAs("staff");
            const { onLoan } = await twoNewLoans(staff);

            const res = await staff.get("/staff/loans").query({ status: "on_loan" }).expect(200);

            const codes = borrowCodesOf(res.body.data.items);
            expect(codes).toContain(onLoan);
            for (const overdue of SEED_ACTIVE_LOANS_BY_DUE_DATE) expect(codes).not.toContain(overdue);
        });

        it("[LOAN-RECORDS-09] status=all (the default) lists every active loan", async () => {
            const staff = await signInAs("staff");
            await twoNewLoans(staff);

            const res = await staff.get("/staff/loans").query({ status: "all" }).expect(200);

            expect(res.body.data.pagination.totalItems).toBe(6);
        });

        it("[LOAN-RECORDS-10] statusBadge: Due … for a loan due tomorrow, On loan for a later one", async () => {
            const staff = await signInAs("staff");
            const { dueSoon, onLoan } = await twoNewLoans(staff);

            const res = await staff.get("/staff/loans").query({ limit: 10 }).expect(200);

            const byCode = new Map(res.body.data.items.map((item: { borrowCode: string }) => [item.borrowCode, item]));
            expect(byCode.get(dueSoon)).toMatchObject({ isOverdue: false, statusBadge: expect.stringMatching(/^Due /) });
            expect(byCode.get(onLoan)).toMatchObject({ isOverdue: false, statusBadge: "On loan" });
        });
    });

    describe("sorting and paging", () => {
        it("[LOAN-RECORDS-11] sortOrder=desc reverses the dueDate order", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").query({ sortBy: "dueDate", sortOrder: "desc" }).expect(200);

            expect(borrowCodesOf(res.body.data.items)).toEqual([...SEED_ACTIVE_LOANS_BY_DUE_DATE].reverse());
        });

        it("[LOAN-RECORDS-12] sortBy=borrowedAt, newest first", async () => {
            // borrowed: BR-2106 10-12, BR-2098 10-08, BR-2090 10-02, BR-2081 09-29
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").query({ sortBy: "borrowedAt", sortOrder: "desc" }).expect(200);

            expect(borrowCodesOf(res.body.data.items)).toEqual(["BR-2106", "BR-2098", "BR-2090", "BR-2081"]);
        });

        it("[LOAN-RECORDS-13] limit=3, page=2 holds the last active loan", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").query({ limit: 3, page: 2 }).expect(200);

            expect(borrowCodesOf(res.body.data.items)).toEqual([SEED_LOAN.mayaBriefHistory.borrowCode]);
            expect(res.body.data.pagination).toEqual({ totalItems: 4, currentPage: 2, totalPages: 2, limit: 3 });
        });
    });

    describe("validation", () => {
        it.each([
            ["tab", { tab: "archived" }],
            ["status", { status: "late" }],
            ["sortBy", { sortBy: "title" }],
            ["sortOrder", { sortOrder: "up" }]
        ])("[LOAN-RECORDS-14] an unknown %s value is rejected", async (_label, query) => {
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/loans").query(query);

            expectApiError(res, 400, "VALIDATION_ERROR");
        });
    });

    describe("access", () => {
        it.each(["student", "admin"] as const)("[LOAN-RECORDS-15] %s is not allowed (staff only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.get("/staff/loans");

            expectForbidden(res);
        });

        it("[LOAN-RECORDS-16] a guest is not signed in", async () => {
            const res = await guest().get("/staff/loans");

            expectUnauthorized(res);
        });
    });
});
