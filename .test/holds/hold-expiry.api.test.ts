import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    NEW_STUDENT,
    OTHER_STUDENT,
    copyInCatalog,
    createStudent,
    issueBooks,
    placeHold
} from "../helpers/borrowing.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// Automatic hold expiry (FR-BORROW-02). NOT in doc/API_Contract.md: the contract (6.2 rule 5) says
// holds are only released by a cancel or a checkout. The project adds a 60 s server timer
// (src/shared/database/hold-expiry.ts) that turns a Ready hold past collectBy into Expired and puts
// its copy back to Available.
//
// The tests can't wait until tomorrow 15:30, so they call the dev-only route
//   POST /dev/expire-holds { asOf? }
// which runs the same expiry as if `asOf` were now. It needs ENABLE_DB_RESET=true, like reset-db.

/** POST /dev/expire-holds and checks that it returned 200. @returns { expiredCount, releasedCount } */
async function expireHolds(asOf?: Date): Promise<{ expiredCount: number; releasedCount: number }> {
    const res = await guest()
        .post("/dev/expire-holds")
        .send(asOf === undefined ? {} : { asOf: asOf.toISOString() });
    expect(res.status, `POST /dev/expire-holds returned ${res.status}: ${res.text}`).toBe(200);
    return res.body.data;
}

/** One second after the hold's deadline. */
const justAfter = (hold: { collectBy: string }): Date => new Date(Date.parse(hold.collectBy) + 1000);

describe("automatic hold expiry", () => {
    beforeEach(resetDatabase);

    describe("when it happens", () => {
        it("[HOLD-EXPIRY-01] a hold before its deadline is not expired", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);

            const result = await expireHolds();

            expect(result).toEqual({ expiredCount: 0, releasedCount: 0 });
            const staff = await signInAs("staff");
            const res = await staff.get("/staff/holds").expect(200);
            expect(res.body.data.items.map((item: { holdCode: string }) => item.holdCode)).toEqual([hold.holdCode]);
        });

        it("[HOLD-EXPIRY-02] exactly at the deadline the hold is still valid", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);

            const result = await expireHolds(new Date(hold.collectBy));

            expect(result.expiredCount).toBe(0);
        });

        it("[HOLD-EXPIRY-03] after the deadline the hold expires and its copy is released", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);

            const result = await expireHolds(justAfter(hold));

            expect(result).toEqual({ expiredCount: 1, releasedCount: 1 });
        });

        it("[HOLD-EXPIRY-04] a second run changes nothing", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await expireHolds(justAfter(hold));

            const result = await expireHolds(justAfter(hold));

            expect(result).toEqual({ expiredCount: 0, releasedCount: 0 });
        });
    });

    describe("effects", () => {
        it("[HOLD-EXPIRY-05] the copy is Available again", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await expireHolds(justAfter(hold));
            const staff = await signInAs("staff");

            const copy = await copyInCatalog(staff, BOOK.bookThief._id, AVAILABLE_COPY.bookThiefOnly);

            expect(copy.state).toBe("Available");
        });

        it("[HOLD-EXPIRY-06] the expired hold leaves the staff list of active holds", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await expireHolds(justAfter(hold));
            const staff = await signInAs("staff");

            const res = await staff.get("/staff/holds").expect(200);

            expect(res.body.data.items).toEqual([]);
        });

        it("[HOLD-EXPIRY-07] another student can hold the released copy", async () => {
            const nora = await createStudent(NEW_STUDENT);
            const hold = await placeHold(nora, BOOK.bookThief._id);
            await expireHolds(justAfter(hold));
            const kai = await createStudent(OTHER_STUDENT);

            const res = await kai.post("/holds").send({ bookId: BOOK.bookThief._id }).expect(201);

            expect(res.body.data.assignedCopy.copyCode).toBe(AVAILABLE_COPY.bookThiefOnly);
        });

        it("[HOLD-EXPIRY-08] the same student can hold the title again", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await expireHolds(justAfter(hold));

            const res = await student.post("/holds").send({ bookId: BOOK.bookThief._id }).expect(201);

            expect(res.body.data.holdCode).not.toBe(hold.holdCode);
        });

        it("[HOLD-EXPIRY-09] an expired hold cannot be cancelled", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await expireHolds(justAfter(hold));

            const res = await student.delete(`/holds/${hold.holdCode}`);

            expectApiError(res, 409, "HOLD_NOT_CANCELLABLE");
        });
    });

    describe("holds that are not Ready are left alone", () => {
        it("[HOLD-EXPIRY-10] a fulfilled hold does not expire and its copy stays Borrowed", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            const staff = await signInAs("staff");
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.bookThiefOnly]);

            const result = await expireHolds(justAfter(hold));

            expect(result.expiredCount).toBe(0);
            const copy = await copyInCatalog(staff, BOOK.bookThief._id, AVAILABLE_COPY.bookThiefOnly);
            expect(copy.state).toBe("Borrowed");
        });

        it("[HOLD-EXPIRY-11] a cancelled hold does not expire", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await student.delete(`/holds/${hold.holdCode}`).expect(200);

            const result = await expireHolds(justAfter(hold));

            expect(result.expiredCount).toBe(0);
        });
    });

    describe("dev route input", () => {
        it("[HOLD-EXPIRY-12] asOf that is not an ISO date-time is rejected", async () => {
            const res = await guest().post("/dev/expire-holds").send({ asOf: "tomorrow" });

            expectApiError(res, 400, "VALIDATION_ERROR");
        });
    });
});
