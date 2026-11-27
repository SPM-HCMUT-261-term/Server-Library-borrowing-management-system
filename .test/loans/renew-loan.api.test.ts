import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    NEW_STUDENT,
    OTHER_STUDENT,
    SEED_LOAN,
    SEED_STUDENT,
    UNKNOWN_LOAN,
    createStudent,
    issueBooks
} from "../helpers/borrowing.js";
import type { Client } from "../helpers/client.js";
import { addDays, isoDateFromToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// POST /loans/:id/renew (contract 6.4), Student only.
// :id is the loan _id or borrowCode. Renews an Active loan of the signed-in student once,
// for +7 calendar days. Not allowed when already renewed, when the loan is overdue, or when the
// student has overdue loans or unpaid fines.

interface StudentWithLoan {
    student: Client;
    loan: { _id: string; borrowCode: string };
    dueDate: string;
}

/** A new student (Nora) with one loan on WB-00421, due in 14 days. */
async function newStudentWithLoan(): Promise<StudentWithLoan> {
    const student = await createStudent(NEW_STUDENT);
    const staff = await signInAs("staff");
    const dueDate = isoDateFromToday(14);
    const receipt = await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1], dueDate);
    return { student, loan: receipt.borrowEntries[0], dueDate };
}

describe("POST /loans/:id/renew", () => {
    beforeEach(resetDatabase);

    describe("success", () => {
        it("[RENEW-01] renews by borrowCode for 7 more days", async () => {
            const { student, loan, dueDate } = await newStudentWithLoan();

            const res = await student.post(`/loans/${loan.borrowCode}/renew`).expect(200);

            expect(res.body).toMatchObject({
                success: true,
                message: "Loan renewed for 7 days",
                data: {
                    _id: loan._id,
                    borrowCode: loan.borrowCode,
                    previousDueDate: dueDate,
                    newDueDate: addDays(dueDate, 7),
                    renewalCount: 1,
                    canRenew: false
                }
            });
            // 14 + 7 days from today (±1 for the server's time zone)
            expect(res.body.data.daysLeft).toBeGreaterThanOrEqual(20);
            expect(res.body.data.daysLeft).toBeLessThanOrEqual(22);
        });

        it("[RENEW-02] renews by _id", async () => {
            const { student, loan, dueDate } = await newStudentWithLoan();

            const res = await student.post(`/loans/${loan._id}/renew`).expect(200);

            expect(res.body.data).toMatchObject({ borrowCode: loan.borrowCode, newDueDate: addDays(dueDate, 7), renewalCount: 1 });
        });

        it("[RENEW-03] the dashboard shows the new due date and no further renewal", async () => {
            const { student, loan, dueDate } = await newStudentWithLoan();
            await student.post(`/loans/${loan.borrowCode}/renew`).expect(200);

            const res = await student.get("/me/borrowing").expect(200);

            expect(res.body.data.currentLoans).toMatchObject([
                { borrowCode: loan.borrowCode, dueDate: addDays(dueDate, 7), renewalCount: 1, canRenew: false }
            ]);
        });
    });

    describe("not eligible", () => {
        it("[RENEW-04] a loan can be renewed only once", async () => {
            const { student, loan } = await newStudentWithLoan();
            await student.post(`/loans/${loan.borrowCode}/renew`).expect(200);

            const res = await student.post(`/loans/${loan.borrowCode}/renew`);

            expectApiError(res, 403, "RENEWAL_NOT_ELIGIBLE");
        });

        it("[RENEW-05] an overdue loan cannot be renewed", async () => {
            // BR-2098 was due 2026-10-22.
            const maya = await signInAs("student", SEED_STUDENT.maya.accountId);

            const res = await maya.post(`/loans/${SEED_LOAN.mayaWonder.borrowCode}/renew`);

            expectApiError(res, 403, "RENEWAL_NOT_ELIGIBLE");
        });
    });

    describe("ownership and lookup", () => {
        it("[RENEW-06] a student cannot renew another student's loan", async () => {
            const { student: nora, loan, dueDate } = await newStudentWithLoan();
            const kai = await createStudent(OTHER_STUDENT);

            const res = await kai.post(`/loans/${loan.borrowCode}/renew`);

            // The contract requires the loan to belong to the student but names no error code:
            // 403 or 404 are both accepted. The loan must stay unchanged.
            expect([403, 404]).toContain(res.status);
            expect(res.body.success).toBe(false);
            const dashboard = await nora.get("/me/borrowing");
            expect(dashboard.body.data.currentLoans).toMatchObject([{ borrowCode: loan.borrowCode, dueDate, renewalCount: 0 }]);
        });

        it("[RENEW-07] an unknown loan", async () => {
            const student = await createStudent();

            const res = await student.post(`/loans/${UNKNOWN_LOAN}/renew`);

            expectApiError(res, 404, "LOAN_NOT_FOUND");
        });
    });

    describe("access", () => {
        it.each(["staff", "admin"] as const)("[RENEW-08] %s is not allowed (student only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.post(`/loans/${SEED_LOAN.mayaWonder.borrowCode}/renew`);

            expectForbidden(res);
        });

        it("[RENEW-09] a guest is not signed in", async () => {
            const res = await guest().post(`/loans/${SEED_LOAN.mayaWonder.borrowCode}/renew`);

            expectUnauthorized(res);
        });
    });
});
