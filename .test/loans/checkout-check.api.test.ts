import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    NEW_STUDENT,
    OTHER_STUDENT,
    SEED_LOAN,
    SEED_STUDENT,
    UNKNOWN_COPY,
    createStudent,
    placeHold
} from "../helpers/borrowing.js";
import { pathOf } from "../helpers/client.js";
import { expectDateNearToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// GET /staff/copies/:copyCode/checkout-check?studentAccountId= (contract 7.2), Staff only.
// Step 2 of "Loan a Book": can this copy be issued to this student?
//   Available                         → canAdd, badge "Available"
//   Reserved for THIS student         → canAdd, badge "Reserved for <first name>", associatedHold
//   Borrowed                          → blocked, ALREADY_BORROWED with the current borrower
//   Reserved for ANOTHER student      → blocked, RESERVED_FOR_OTHER
//   Damaged / Lost                    → blocked, COPY_UNAVAILABLE

const checkPath = (copyCode: string): string => pathOf("/staff/copies/:copyCode/checkout-check", { copyCode });

describe("GET /staff/copies/:copyCode/checkout-check", () => {
    beforeEach(resetDatabase);

    describe("allowed", () => {
        it("[CHECKOUT-CHECK-01] an Available copy can be added, due in 14 days by default", async () => {
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff
                .get(checkPath(AVAILABLE_COPY.midnight1))
                .query({ studentAccountId: NEW_STUDENT.accountId })
                .expect(200);

            expect(res.body).toMatchObject({
                success: true,
                data: {
                    copy: {
                        _id: expect.any(String),
                        copyCode: AVAILABLE_COPY.midnight1,
                        state: "Available",
                        condition: "Good",
                        homeLocation: BOOK.midnightLibrary.shelf
                    },
                    book: {
                        _id: BOOK.midnightLibrary._id,
                        title: BOOK.midnightLibrary.title,
                        author: BOOK.midnightLibrary.author,
                        coverImageUrl: null
                    },
                    canAdd: true,
                    availabilityBadge: "Available",
                    associatedHold: null,
                    blockingInfo: null
                }
            });
            expectDateNearToday(res.body.data.defaultDueDate, 14);
        });

        it("[CHECKOUT-CHECK-02] a copy reserved for this student can be added and carries the hold", async () => {
            const student = await createStudent(NEW_STUDENT);
            const hold = await placeHold(student, BOOK.bookThief._id);
            const staff = await signInAs("staff");

            const res = await staff
                .get(checkPath(AVAILABLE_COPY.bookThiefOnly))
                .query({ studentAccountId: NEW_STUDENT.accountId })
                .expect(200);

            expect(res.body.data).toMatchObject({
                copy: { copyCode: AVAILABLE_COPY.bookThiefOnly, state: "Reserved" },
                canAdd: true,
                availabilityBadge: `Reserved for ${NEW_STUDENT.firstName}`,
                associatedHold: { _id: hold._id, holdCode: hold.holdCode, collectBy: expect.any(String) },
                blockingInfo: null
            });
        });
    });

    describe("blocked", () => {
        it("[CHECKOUT-CHECK-03] a Borrowed copy names its current borrower and due date", async () => {
            // WB-00423 is on loan BR-2090 to Amira Khan, due 2026-10-16.
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff
                .get(checkPath(SEED_LOAN.amiraMidnight.copyCode))
                .query({ studentAccountId: NEW_STUDENT.accountId })
                .expect(200);

            expect(res.body.data).toMatchObject({
                copy: { copyCode: SEED_LOAN.amiraMidnight.copyCode, state: "Borrowed" },
                book: { _id: BOOK.midnightLibrary._id, title: BOOK.midnightLibrary.title },
                canAdd: false,
                availabilityBadge: "Already borrowed",
                associatedHold: null,
                blockingInfo: {
                    reasonCode: "ALREADY_BORROWED",
                    message: expect.stringContaining(SEED_LOAN.amiraMidnight.copyCode),
                    currentBorrowerName: SEED_STUDENT.amira.fullName,
                    currentBorrowerAccountId: SEED_STUDENT.amira.accountId,
                    currentDueDate: SEED_LOAN.amiraMidnight.dueDate
                }
            });
        });

        it("[CHECKOUT-CHECK-04] a copy reserved for another student is blocked", async () => {
            const nora = await createStudent(NEW_STUDENT);
            await placeHold(nora, BOOK.bookThief._id);
            await createStudent(OTHER_STUDENT);
            const staff = await signInAs("staff");

            const res = await staff
                .get(checkPath(AVAILABLE_COPY.bookThiefOnly))
                .query({ studentAccountId: OTHER_STUDENT.accountId })
                .expect(200);

            expect(res.body.data).toMatchObject({
                copy: { state: "Reserved" },
                canAdd: false,
                associatedHold: null,
                blockingInfo: { reasonCode: "RESERVED_FOR_OTHER", message: expect.any(String) }
            });
        });

        it.each(["Damaged", "Lost"] as const)("[CHECKOUT-CHECK-05] a %s copy is unavailable", async (state) => {
            await createStudent();
            const staff = await signInAs("staff");
            const marked = await staff.put(pathOf("/copies/:id", { id: AVAILABLE_COPY.midnight1 })).send({
                homeLocation: BOOK.midnightLibrary.shelf,
                state,
                condition: state
            });
            expect(marked.status, `setup: PUT /copies returned ${marked.status}: ${marked.text}`).toBe(200);

            const res = await staff
                .get(checkPath(AVAILABLE_COPY.midnight1))
                .query({ studentAccountId: NEW_STUDENT.accountId })
                .expect(200);

            expect(res.body.data).toMatchObject({
                copy: { copyCode: AVAILABLE_COPY.midnight1, state },
                canAdd: false,
                associatedHold: null,
                blockingInfo: {
                    reasonCode: "COPY_UNAVAILABLE",
                    message: expect.any(String),
                    currentBorrowerName: null,
                    currentBorrowerAccountId: null,
                    currentDueDate: null
                }
            });
        });
    });

    describe("errors", () => {
        it("[CHECKOUT-CHECK-06] an unknown copy", async () => {
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff.get(checkPath(UNKNOWN_COPY)).query({ studentAccountId: NEW_STUDENT.accountId });

            expectApiError(res, 404, "COPY_NOT_FOUND");
        });

        it("[CHECKOUT-CHECK-07] studentAccountId is required", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(checkPath(AVAILABLE_COPY.midnight1));

            expectApiError(res, 400, "VALIDATION_ERROR");
        });
    });

    describe("access", () => {
        it.each(["student", "admin"] as const)("[CHECKOUT-CHECK-08] %s is not allowed (staff only)", async (role) => {
            const user = await signInAs(role);

            const res = await user
                .get(checkPath(AVAILABLE_COPY.midnight1))
                .query({ studentAccountId: SEED_STUDENT.maya.accountId });

            expectForbidden(res);
        });

        it("[CHECKOUT-CHECK-09] a guest is not signed in", async () => {
            const res = await guest()
                .get(checkPath(AVAILABLE_COPY.midnight1))
                .query({ studentAccountId: SEED_STUDENT.maya.accountId });

            expectUnauthorized(res);
        });
    });
});
