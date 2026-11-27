import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    HOLD_CODE,
    NEW_STUDENT,
    SEED_STUDENT,
    UNKNOWN_STUDENT,
    createStudent,
    issueBooks,
    placeHold
} from "../helpers/borrowing.js";
import { ACCOUNT, guest, resetDatabase, signInAs } from "../helpers/session.js";

// GET /staff/students/:accountId (contract 7.1), Staff only.
// Step 1 of "Loan a Book": the student's profile, loan usage, eligibility and the holds that can
// be collected at checkout.

describe("GET /staff/students/:accountId", () => {
    beforeEach(resetDatabase);

    describe("seeded students (all have overdue loans)", () => {
        it("[FIND-STUDENT-01] Maya: profile, 2 of 5 loans, not eligible because both are overdue", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(`/staff/students/${SEED_STUDENT.maya.accountId}`).expect(200);

            expect(res.body).toMatchObject({
                success: true,
                data: {
                    student: {
                        _id: expect.any(String),
                        accountId: SEED_STUDENT.maya.accountId,
                        fullName: SEED_STUDENT.maya.fullName,
                        initials: SEED_STUDENT.maya.initials,
                        yearGroup: SEED_STUDENT.maya.yearGroup
                    },
                    eligibility: {
                        isEligible: false,
                        activeLoansCount: 2,
                        maxLoansLimit: 5,
                        remainingLoanSpace: 3,
                        overdueBooksCount: 2,
                        unpaidFines: 0,
                        statusBanner: expect.any(String)
                    },
                    activeHolds: []
                }
            });
        });

        it("[FIND-STUDENT-02] Oliver: one overdue loan", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(`/staff/students/${SEED_STUDENT.oliver.accountId}`).expect(200);

            expect(res.body.data.student).toMatchObject({ fullName: SEED_STUDENT.oliver.fullName, initials: SEED_STUDENT.oliver.initials });
            expect(res.body.data.eligibility).toMatchObject({
                isEligible: false,
                activeLoansCount: 1,
                remainingLoanSpace: 4,
                overdueBooksCount: 1
            });
        });
    });

    describe("a new student", () => {
        it("[FIND-STUDENT-03] with no loans: eligible, 5 loans left", async () => {
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff.get(`/staff/students/${NEW_STUDENT.accountId}`).expect(200);

            expect(res.body.data).toMatchObject({
                student: {
                    accountId: NEW_STUDENT.accountId,
                    fullName: NEW_STUDENT.fullName,
                    initials: NEW_STUDENT.initials,
                    yearGroup: NEW_STUDENT.yearGroup
                },
                eligibility: {
                    isEligible: true,
                    activeLoansCount: 0,
                    maxLoansLimit: 5,
                    remainingLoanSpace: 5,
                    overdueBooksCount: 0,
                    unpaidFines: 0,
                    statusBanner: expect.any(String)
                },
                activeHolds: []
            });
        });

        it("[FIND-STUDENT-04] a hold ready for pickup is listed in activeHolds", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            const staff = await signInAs("staff");

            const res = await staff.get(`/staff/students/${NEW_STUDENT.accountId}`).expect(200);

            expect(res.body.data.activeHolds).toMatchObject([
                {
                    holdCode: expect.stringMatching(HOLD_CODE),
                    copyCode: AVAILABLE_COPY.bookThiefOnly,
                    bookTitle: BOOK.bookThief.title,
                    collectBy: expect.any(String)
                }
            ]);
            expect(res.body.data.activeHolds[0].holdCode).toBe(hold.holdCode);
        });

        it("[FIND-STUDENT-05] an issued loan is counted", async () => {
            await createStudent();
            const staff = await signInAs("staff");
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1]);

            const res = await staff.get(`/staff/students/${NEW_STUDENT.accountId}`).expect(200);

            expect(res.body.data.eligibility).toMatchObject({ isEligible: true, activeLoansCount: 1, remainingLoanSpace: 4 });
        });
    });

    describe("not found", () => {
        it("[FIND-STUDENT-06] an unknown account id", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(`/staff/students/${UNKNOWN_STUDENT}`);

            expectApiError(res, 404, "STUDENT_NOT_FOUND");
        });

        it("[FIND-STUDENT-07] a staff account is not a student", async () => {
            const staff = await signInAs("staff");

            const res = await staff.get(`/staff/students/${ACCOUNT.staff}`);

            expectApiError(res, 404, "STUDENT_NOT_FOUND");
        });
    });

    describe("access", () => {
        it.each(["student", "admin"] as const)("[FIND-STUDENT-08] %s is not allowed (staff only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.get(`/staff/students/${SEED_STUDENT.maya.accountId}`);

            expectForbidden(res);
        });

        it("[FIND-STUDENT-09] a guest is not signed in", async () => {
            const res = await guest().get(`/staff/students/${SEED_STUDENT.maya.accountId}`);

            expectUnauthorized(res);
        });
    });
});
