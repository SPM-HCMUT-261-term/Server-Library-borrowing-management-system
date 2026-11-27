import { beforeEach, describe, expect, it } from "vitest";

import { expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    BORROW_CODE,
    HOLD_CODE,
    NEW_STUDENT,
    SEED_LOAN,
    SEED_STUDENT,
    createStudent,
    issueBooks,
    placeHold
} from "../helpers/borrowing.js";
import { addDays, daysBetween, expectDateNearToday, isoDateFromToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// GET /me/borrowing (contract 6.1), Student only.
// The "My borrowing" page: accountSummary, currentLoans (sorted by dueDate ascending),
// holdRequests, and borrowingHistory (returned loans, sorted by returnedAt descending).

describe("GET /me/borrowing", () => {
    beforeEach(resetDatabase);

    describe("a seeded student with overdue loans (Maya)", () => {
        it("[MY-BORROWING-01] accountSummary: 2 active loans, both overdue, so she cannot borrow", async () => {
            const maya = await signInAs("student", SEED_STUDENT.maya.accountId);

            const res = await maya.get("/me/borrowing").expect(200);

            expect(res.body.success).toBe(true);
            expect(res.body.data.accountSummary).toMatchObject({
                canBorrow: false,
                statusText: expect.any(String),
                activeLoansCount: 2,
                maxLoansLimit: 5,
                remainingLoanSpace: 3,
                overdueBooksCount: 2,
                unpaidFines: 0
            });
        });

        it("[MY-BORROWING-02] currentLoans are sorted by dueDate and flagged overdue", async () => {
            const maya = await signInAs("student", SEED_STUDENT.maya.accountId);

            const res = await maya.get("/me/borrowing").expect(200);

            const loans = res.body.data.currentLoans;
            const expected = [SEED_LOAN.mayaWonder, SEED_LOAN.mayaBriefHistory];
            expect(loans).toMatchObject(
                expected.map((loan) => ({
                    _id: expect.any(String),
                    borrowCode: loan.borrowCode,
                    copyCode: loan.copyCode,
                    book: { _id: loan.book._id, title: loan.book.title, author: loan.book.author, coverImageUrl: null },
                    dueDate: loan.dueDate,
                    isOverdue: true,
                    renewalCount: 0,
                    canRenew: false,
                    renewalStatusText: expect.any(String)
                }))
            );
            expected.forEach((loan, index) => {
                expect(loans[index].borrowedAt).toMatch(new RegExp(`^${loan.borrowedAt}`));
                // daysLeft is negative when overdue: dueDate - today (±1 for the server's time zone)
                expect(loans[index].daysLeft).toBeLessThan(0);
                expect(Math.abs(loans[index].daysLeft - daysBetween(isoDateFromToday(0), loan.dueDate))).toBeLessThanOrEqual(1);
            });
        });

        it("[MY-BORROWING-03] borrowingHistory lists the returned loan; there are no holds", async () => {
            const maya = await signInAs("student", SEED_STUDENT.maya.accountId);

            const res = await maya.get("/me/borrowing").expect(200);

            const returned = SEED_LOAN.mayaReturned;
            expect(res.body.data.holdRequests).toEqual([]);
            expect(res.body.data.borrowingHistory).toMatchObject([
                {
                    _id: expect.any(String),
                    borrowCode: returned.borrowCode,
                    copyCode: returned.copyCode,
                    book: { _id: returned.book._id, title: returned.book.title, author: returned.book.author, coverImageUrl: null },
                    dueDate: returned.dueDate,
                    returnCondition: returned.returnCondition
                }
            ]);
            const history = res.body.data.borrowingHistory[0];
            expect(history.borrowedAt).toMatch(new RegExp(`^${returned.borrowedAt}`));
            expect(history.returnedAt).toMatch(new RegExp(`^${returned.returnedAt}`));
        });
    });

    describe("a new student", () => {
        it("[MY-BORROWING-04] with nothing borrowed: can borrow, every list is empty", async () => {
            const student = await createStudent();

            const res = await student.get("/me/borrowing").expect(200);

            expect(res.body.data).toMatchObject({
                accountSummary: {
                    canBorrow: true,
                    statusText: expect.any(String),
                    activeLoansCount: 0,
                    maxLoansLimit: 5,
                    remainingLoanSpace: 5,
                    overdueBooksCount: 0,
                    unpaidFines: 0
                },
                currentLoans: [],
                holdRequests: [],
                borrowingHistory: []
            });
        });

        it("[MY-BORROWING-05] a loan issued today: not overdue, renewable, with a new-due-date preview", async () => {
            const student = await createStudent();
            const staff = await signInAs("staff");
            const dueDate = isoDateFromToday(14);
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1], dueDate);

            const res = await student.get("/me/borrowing").expect(200);

            expect(res.body.data.accountSummary).toMatchObject({ activeLoansCount: 1, remainingLoanSpace: 4, overdueBooksCount: 0 });
            expect(res.body.data.currentLoans).toMatchObject([
                {
                    borrowCode: expect.stringMatching(BORROW_CODE),
                    copyCode: AVAILABLE_COPY.midnight1,
                    book: { _id: BOOK.midnightLibrary._id, title: BOOK.midnightLibrary.title },
                    dueDate,
                    isOverdue: false,
                    renewalCount: 0,
                    canRenew: true,
                    newDueDatePreview: addDays(dueDate, 7)
                }
            ]);
            const loan = res.body.data.currentLoans[0];
            expectDateNearToday(loan.borrowedAt, 0);
            expect(loan.daysLeft).toBeGreaterThanOrEqual(13);
            expect(loan.daysLeft).toBeLessThanOrEqual(15);
        });

        it("[MY-BORROWING-06] currentLoans are sorted by dueDate ascending", async () => {
            const student = await createStudent();
            const staff = await signInAs("staff");
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.mangoStreet], isoDateFromToday(10));
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1], isoDateFromToday(5));

            const res = await student.get("/me/borrowing").expect(200);

            expect(res.body.data.currentLoans.map((loan: { copyCode: string }) => loan.copyCode)).toEqual([
                AVAILABLE_COPY.midnight1,
                AVAILABLE_COPY.mangoStreet
            ]);
        });

        it("[MY-BORROWING-07] a hold appears in holdRequests with its pickup details", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);

            const res = await student.get("/me/borrowing").expect(200);

            expect(res.body.data.holdRequests).toMatchObject([
                {
                    _id: hold._id,
                    holdCode: expect.stringMatching(HOLD_CODE),
                    status: "Ready",
                    requestedAt: expect.any(String),
                    collectBy: expect.any(String),
                    pickupLocation: expect.any(String),
                    book: {
                        _id: BOOK.bookThief._id,
                        title: BOOK.bookThief.title,
                        author: BOOK.bookThief.author,
                        format: BOOK.bookThief.format,
                        coverImageUrl: null
                    },
                    copy: { _id: expect.any(String), copyCode: AVAILABLE_COPY.bookThiefOnly, homeLocation: BOOK.bookThief.shelf }
                }
            ]);
            // A hold is not a loan.
            expect(res.body.data.accountSummary.activeLoansCount).toBe(0);
            expect(res.body.data.currentLoans).toEqual([]);
        });
    });

    describe("access", () => {
        it.each(["staff", "admin"] as const)("[MY-BORROWING-08] %s is not allowed (student only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.get("/me/borrowing");

            expectForbidden(res);
        });

        it("[MY-BORROWING-09] a guest is not signed in", async () => {
            const res = await guest().get("/me/borrowing");

            expectUnauthorized(res);
        });
    });
});
