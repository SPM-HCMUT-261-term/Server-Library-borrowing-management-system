import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    HOLD_CODE,
    NEW_STUDENT,
    OTHER_STUDENT,
    SEED_STUDENT,
    copyInCatalog,
    createStudent,
    issueBooks,
    placeHold
} from "../helpers/borrowing.js";
import { expectDateNearToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// POST /holds (contract 6.2), Student only.
// Places a hold on an Available copy of a title: the copy becomes Reserved, a holdCode is
// generated and collectBy is the next day at 15:30. A hold is not a loan.
// Rules: no overdue books / unpaid fines; no active loan or hold on the same title;
// at least one Available copy.

const HOUR_MS = 3_600_000;

describe("POST /holds", () => {
    beforeEach(resetDatabase);

    describe("success", () => {
        it("[HOLD-CREATE-01] reserves an available copy and returns the hold confirmation", async () => {
            // The Book Thief has exactly one Available copy, so the assigned copy is known.
            const student = await createStudent();

            const res = await student.post("/holds").send({ bookId: BOOK.bookThief._id }).expect(201);

            expect(res.body.success).toBe(true);
            expect(res.body.data).toMatchObject({
                _id: expect.any(String),
                holdCode: expect.stringMatching(HOLD_CODE),
                status: "Ready",
                requestedAt: expect.any(String),
                collectBy: expect.any(String),
                book: {
                    _id: BOOK.bookThief._id,
                    title: BOOK.bookThief.title,
                    author: BOOK.bookThief.author,
                    format: BOOK.bookThief.format,
                    shelfReference: BOOK.bookThief.shelf,
                    coverImageUrl: null,
                    // after the reservation: 3 copies, 2 borrowed, the only available one now reserved
                    stockSummary: { totalCopies: 3, availableCopies: 0, borrowedCopies: 2, reservedCopies: 1 }
                },
                assignedCopy: {
                    _id: expect.any(String),
                    copyCode: AVAILABLE_COPY.bookThiefOnly,
                    homeLocation: BOOK.bookThief.shelf
                },
                studentLoanUsage: { activeLoansCount: 0, maxLoansLimit: 5 }
            });
        });

        it("[HOLD-CREATE-02] collectBy is the next day at 15:30", async () => {
            const student = await createStudent();

            const hold = await placeHold(student, BOOK.bookThief._id);

            const requestedAt = Date.parse(hold.requestedAt);
            const collectBy = Date.parse(hold.collectBy);
            expect(Number.isNaN(requestedAt)).toBe(false);
            expect(Number.isNaN(collectBy)).toBe(false);
            expect(collectBy).toBeGreaterThan(requestedAt);
            expect(collectBy - requestedAt).toBeLessThanOrEqual(48 * HOUR_MS);
            expectDateNearToday(hold.collectBy, 1);
            // 15:30 in any whole-hour time zone (UTC, UTC+7, ...) has 30 minutes.
            expect(new Date(collectBy).getUTCMinutes()).toBe(30);
        });

        it("[HOLD-CREATE-03] the assigned copy becomes Reserved in the catalog", async () => {
            const student = await createStudent();
            await placeHold(student, BOOK.bookThief._id);
            const staff = await signInAs("staff");

            const copy = await copyInCatalog(staff, BOOK.bookThief._id, AVAILABLE_COPY.bookThiefOnly);

            expect(copy.state).toBe("Reserved");
        });

        it("[HOLD-CREATE-04] a hold does not count as an active loan", async () => {
            const student = await createStudent();
            await placeHold(student, BOOK.bookThief._id);

            const me = await student.get("/auth/me").expect(200);

            expect(me.body.data.activeLoansCount).toBe(0);
        });

        it("[HOLD-CREATE-05] a student may hold several different titles", async () => {
            const student = await createStudent();
            await placeHold(student, BOOK.bookThief._id);

            const res = await student.post("/holds").send({ bookId: BOOK.mangoStreet._id }).expect(201);

            expect(res.body.data.assignedCopy.copyCode).toBe(AVAILABLE_COPY.mangoStreet);
        });
    });

    describe("availability", () => {
        it("[HOLD-CREATE-06] a title with no Available copy is rejected", async () => {
            // Every copy of The Hobbit is Borrowed.
            const student = await createStudent();

            const res = await student.post("/holds").send({ bookId: BOOK.hobbit._id });

            expectApiError(res, 400, "NO_AVAILABLE_COPIES");
        });

        it("[HOLD-CREATE-07] the last available copy, already reserved by another student, cannot be held", async () => {
            const nora = await createStudent(NEW_STUDENT);
            await placeHold(nora, BOOK.bookThief._id);
            const kai = await createStudent(OTHER_STUDENT);

            const res = await kai.post("/holds").send({ bookId: BOOK.bookThief._id });

            expectApiError(res, 400, "NO_AVAILABLE_COPIES");
        });
    });

    describe("duplicates", () => {
        it("[HOLD-CREATE-08] a second hold on the same title is a conflict", async () => {
            // The Midnight Library still has a second Available copy, so availability is not the reason.
            const student = await createStudent();
            await placeHold(student, BOOK.midnightLibrary._id);

            const res = await student.post("/holds").send({ bookId: BOOK.midnightLibrary._id });

            expectApiError(res, 409, "DUPLICATE_HOLD_OR_LOAN");
        });

        it("[HOLD-CREATE-09] a hold on a title the student is already borrowing is a conflict", async () => {
            const student = await createStudent();
            const staff = await signInAs("staff");
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1]);

            const res = await student.post("/holds").send({ bookId: BOOK.midnightLibrary._id });

            expectApiError(res, 409, "DUPLICATE_HOLD_OR_LOAN");
        });
    });

    describe("eligibility", () => {
        it("[HOLD-CREATE-10] a student with overdue books is blocked", async () => {
            // Maya's two seeded loans (due 2026-10-22 and 2026-10-26) are overdue.
            const maya = await signInAs("student", SEED_STUDENT.maya.accountId);

            const res = await maya.post("/holds").send({ bookId: BOOK.midnightLibrary._id });

            expectApiError(res, 403, "BORROWING_BLOCKED");
        });
    });

    describe("validation", () => {
        it("[HOLD-CREATE-11] bookId is required", async () => {
            const student = await createStudent();

            const res = await student.post("/holds").send({});

            expectApiError(res, 400, "VALIDATION_ERROR");
        });
    });

    describe("access", () => {
        it.each(["staff", "admin"] as const)("[HOLD-CREATE-12] %s is not allowed (student only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.post("/holds").send({ bookId: BOOK.bookThief._id });

            expectForbidden(res);
        });

        it("[HOLD-CREATE-13] a guest is not signed in", async () => {
            const res = await guest().post("/holds").send({ bookId: BOOK.bookThief._id });

            expectUnauthorized(res);
        });
    });
});
