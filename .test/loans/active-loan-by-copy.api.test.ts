import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    NEW_STUDENT,
    SEED_LOAN,
    SEED_STUDENT,
    UNKNOWN_COPY,
    createStudent,
    issueBooks
} from "../helpers/borrowing.js";
import { pathOf } from "../helpers/client.js";
import { daysBetween, expectDateNearToday, isoDateFromToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// GET /staff/loans/active-by-copy/:copyCode (contract 7.4), Staff only.
// Step 1 of "Return a Book": the ACTIVE loan of a copy, with its book and borrower.
// A copy without an active loan (never borrowed, or already returned) gives 404.

const lookupPath = (copyCode: string): string => pathOf("/staff/loans/active-by-copy/:copyCode", { copyCode });

describe("GET /staff/loans/active-by-copy/:copyCode", () => {
    beforeEach(resetDatabase);

    it("[ACTIVE-LOAN-01] an overdue loan: loan, copy, book and borrower details", async () => {
        // WB-00632 is on loan BR-2106 to Maya, due 2026-10-26 (overdue).
        const loan = SEED_LOAN.mayaBriefHistory;
        const staff = await signInAs("staff");

        const res = await staff.get(lookupPath(loan.copyCode)).expect(200);

        expect(res.body).toMatchObject({
            success: true,
            data: {
                loan: {
                    _id: expect.any(String),
                    borrowCode: loan.borrowCode,
                    dueDate: loan.dueDate,
                    returningToday: expect.any(String),
                    isOverdue: true,
                    timingBadge: expect.stringMatching(/^Overdue · \d+ days?$/)
                },
                copy: {
                    _id: expect.any(String),
                    copyCode: loan.copyCode,
                    currentCondition: "Good",
                    homeLocation: loan.book.shelf
                },
                book: { _id: loan.book._id, title: loan.book.title, author: loan.book.author, coverImageUrl: null },
                borrower: {
                    _id: expect.any(String),
                    accountId: SEED_STUDENT.maya.accountId,
                    fullName: SEED_STUDENT.maya.fullName,
                    initials: SEED_STUDENT.maya.initials,
                    yearGroup: SEED_STUDENT.maya.yearGroup,
                    activeLoansBeforeReturn: 2,
                    activeLoansAfterReturn: 1,
                    maxLoansLimit: 5
                }
            }
        });
        const data = res.body.data;
        expect(data.loan.borrowedAt).toMatch(new RegExp(`^${loan.borrowedAt}`));
        expectDateNearToday(data.loan.returningToday, 0);
        // "Overdue · N days" where N = today - dueDate (±1 for the server's time zone)
        const overdueDays = Number(/(\d+)/.exec(data.loan.timingBadge)?.[1]);
        expect(Math.abs(overdueDays - daysBetween(loan.dueDate, isoDateFromToday(0)))).toBeLessThanOrEqual(1);
    });

    it("[ACTIVE-LOAN-02] a loan that is not due yet is On time", async () => {
        await createStudent();
        const staff = await signInAs("staff");
        const receipt = await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1]);

        const res = await staff.get(lookupPath(AVAILABLE_COPY.midnight1)).expect(200);

        expect(res.body.data).toMatchObject({
            loan: { borrowCode: receipt.borrowEntries[0].borrowCode, isOverdue: false, timingBadge: "On time" },
            copy: { copyCode: AVAILABLE_COPY.midnight1, currentCondition: "Good", homeLocation: BOOK.midnightLibrary.shelf },
            book: { _id: BOOK.midnightLibrary._id },
            borrower: {
                accountId: NEW_STUDENT.accountId,
                fullName: NEW_STUDENT.fullName,
                initials: NEW_STUDENT.initials,
                activeLoansBeforeReturn: 1,
                activeLoansAfterReturn: 0
            }
        });
    });

    describe("no active loan", () => {
        it.each([
            ["an Available copy that was never borrowed", AVAILABLE_COPY.midnight1],
            ["a copy whose only loan was returned (BR-2040)", SEED_LOAN.mayaReturned.copyCode],
            ["an unknown copy", UNKNOWN_COPY]
        ])("[ACTIVE-LOAN-03] %s", async (_label, copyCode) => {
            const staff = await signInAs("staff");

            const res = await staff.get(lookupPath(copyCode));

            expectApiError(res, 404, "ACTIVE_LOAN_NOT_FOUND");
        });

        it("[ACTIVE-LOAN-04] a copy just returned", async () => {
            const staff = await signInAs("staff");
            const returned = await staff
                .post(`/staff/loans/${SEED_LOAN.mayaWonder.borrowCode}/return`)
                .send({ condition: "Good" });
            expect(returned.status, `setup: return returned ${returned.status}: ${returned.text}`).toBe(200);

            const res = await staff.get(lookupPath(SEED_LOAN.mayaWonder.copyCode));

            expectApiError(res, 404, "ACTIVE_LOAN_NOT_FOUND");
        });
    });

    describe("access", () => {
        it.each(["student", "admin"] as const)("[ACTIVE-LOAN-05] %s is not allowed (staff only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.get(lookupPath(SEED_LOAN.mayaBriefHistory.copyCode));

            expectForbidden(res);
        });

        it("[ACTIVE-LOAN-06] a guest is not signed in", async () => {
            const res = await guest().get(lookupPath(SEED_LOAN.mayaBriefHistory.copyCode));

            expectUnauthorized(res);
        });
    });
});
