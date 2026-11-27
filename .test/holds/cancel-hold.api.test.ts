import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    NEW_STUDENT,
    OTHER_STUDENT,
    UNKNOWN_HOLD,
    copyInCatalog,
    createStudent,
    issueBooks,
    placeHold
} from "../helpers/borrowing.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// DELETE /holds/:id (contract 6.3), the student who owns the hold, or staff.
// :id is the hold _id or holdCode. The hold becomes Cancelled and the copy goes back to Available.
// A hold that is already Fulfilled or Cancelled cannot be cancelled.

describe("DELETE /holds/:id", () => {
    beforeEach(resetDatabase);

    describe("success", () => {
        it("[HOLD-CANCEL-01] the owner cancels by holdCode", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);

            const res = await student.delete(`/holds/${hold.holdCode}`).expect(200);

            expect(res.body).toMatchObject({
                success: true,
                message: `Hold ${hold.holdCode} has been cancelled and the copy is now available.`,
                data: { holdCode: hold.holdCode, status: "Cancelled", releasedCopyCode: AVAILABLE_COPY.bookThiefOnly }
            });
        });

        it("[HOLD-CANCEL-02] the owner cancels by _id", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);

            const res = await student.delete(`/holds/${hold._id}`).expect(200);

            expect(res.body.data).toMatchObject({ holdCode: hold.holdCode, status: "Cancelled" });
        });

        it("[HOLD-CANCEL-03] staff can cancel a student's hold", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            const staff = await signInAs("staff");

            const res = await staff.delete(`/holds/${hold.holdCode}`).expect(200);

            expect(res.body.data).toMatchObject({ holdCode: hold.holdCode, status: "Cancelled" });
        });
    });

    describe("effects", () => {
        it("[HOLD-CANCEL-04] the released copy is Available again", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await student.delete(`/holds/${hold.holdCode}`).expect(200);
            const staff = await signInAs("staff");

            const copy = await copyInCatalog(staff, BOOK.bookThief._id, AVAILABLE_COPY.bookThiefOnly);

            expect(copy.state).toBe("Available");
        });

        it("[HOLD-CANCEL-05] another student can then hold the released copy", async () => {
            const nora = await createStudent(NEW_STUDENT);
            const hold = await placeHold(nora, BOOK.bookThief._id);
            await nora.delete(`/holds/${hold.holdCode}`).expect(200);
            const kai = await createStudent(OTHER_STUDENT);

            const res = await kai.post("/holds").send({ bookId: BOOK.bookThief._id }).expect(201);

            expect(res.body.data.assignedCopy.copyCode).toBe(AVAILABLE_COPY.bookThiefOnly);
        });

        it("[HOLD-CANCEL-06] the same student can hold the title again after cancelling", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await student.delete(`/holds/${hold.holdCode}`).expect(200);

            const res = await student.post("/holds").send({ bookId: BOOK.bookThief._id }).expect(201);

            expect(res.body.data.holdCode).not.toBe(hold.holdCode);
        });
    });

    describe("not cancellable", () => {
        it("[HOLD-CANCEL-07] a hold that is already cancelled", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            await student.delete(`/holds/${hold.holdCode}`).expect(200);

            const res = await student.delete(`/holds/${hold.holdCode}`);

            expectApiError(res, 409, "HOLD_NOT_CANCELLABLE");
        });

        it("[HOLD-CANCEL-08] a hold that was fulfilled at the counter", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            const staff = await signInAs("staff");
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.bookThiefOnly]);

            const res = await student.delete(`/holds/${hold.holdCode}`);

            expectApiError(res, 409, "HOLD_NOT_CANCELLABLE");
        });

        it("[HOLD-CANCEL-09] an unknown hold", async () => {
            const staff = await signInAs("staff");

            const res = await staff.delete(`/holds/${UNKNOWN_HOLD}`);

            expectApiError(res, 404, "HOLD_NOT_FOUND");
        });
    });

    describe("access", () => {
        it("[HOLD-CANCEL-10] a student cannot cancel another student's hold", async () => {
            const nora = await createStudent(NEW_STUDENT);
            const hold = await placeHold(nora, BOOK.bookThief._id);
            const kai = await createStudent(OTHER_STUDENT);

            const res = await kai.delete(`/holds/${hold.holdCode}`);

            // The contract allows only the owner, but names no error code: 403 or 404 are both accepted.
            expect([403, 404]).toContain(res.status);
            expect(res.body.success).toBe(false);
            const staff = await signInAs("staff");
            const copy = await copyInCatalog(staff, BOOK.bookThief._id, AVAILABLE_COPY.bookThiefOnly);
            expect(copy.state).toBe("Reserved");
        });

        it("[HOLD-CANCEL-11] an admin is not allowed (owner or staff only)", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            const admin = await signInAs("admin");

            const res = await admin.delete(`/holds/${hold.holdCode}`);

            expectForbidden(res);
        });

        it("[HOLD-CANCEL-12] a guest is not signed in", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);

            const res = await guest().delete(`/holds/${hold.holdCode}`);

            expectUnauthorized(res);
        });
    });
});
