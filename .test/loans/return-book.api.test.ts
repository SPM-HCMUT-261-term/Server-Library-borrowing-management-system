import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import { SEED_LOAN, SEED_STUDENT, UNKNOWN_LOAN, copyInCatalog } from "../helpers/borrowing.js";
import { pathOf } from "../helpers/client.js";
import { expectDateNearToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// POST /staff/loans/:id/return (contract 7.5), Staff only.
// :id is the loan _id or borrowCode. Body: { condition: "Good" | "Damaged" | "Lost", conditionNote? }.
// Closes the loan into returned history (the record is kept), decrements the student's active
// loans, and sets the copy: Good → Available/Good; Damaged or Lost → state and condition Damaged/Lost.

const WONDER = SEED_LOAN.mayaWonder; // BR-2098, Maya, WB-00216, due 2026-10-22
const returnPath = (id: string): string => pathOf("/staff/loans/:id/return", { id });

describe("POST /staff/loans/:id/return", () => {
    beforeEach(resetDatabase);

    describe("success", () => {
        it("[RETURN-01] returns a loan by borrowCode and reports the borrower's counts", async () => {
            const staff = await signInAs("staff");

            const res = await staff
                .post(returnPath(WONDER.borrowCode))
                .send({ condition: "Good", conditionNote: "No new damage" })
                .expect(200);

            expect(res.body).toMatchObject({
                success: true,
                message: "Book return confirmed and saved in returned history.",
                data: {
                    _id: expect.any(String),
                    borrowCode: WONDER.borrowCode,
                    status: "Returned",
                    borrower: {
                        accountId: SEED_STUDENT.maya.accountId,
                        fullName: SEED_STUDENT.maya.fullName,
                        loansBefore: 2,
                        loansAfter: 1
                    },
                    dueDate: WONDER.dueDate,
                    returnedAt: expect.any(String),
                    returnCondition: "Good",
                    conditionNote: "No new damage",
                    copy: { copyCode: WONDER.copyCode, newState: "Available", homeLocation: WONDER.book.shelf }
                }
            });
            expect(res.body.data.borrowedAt).toMatch(new RegExp(`^${WONDER.borrowedAt}`));
            expectDateNearToday(res.body.data.returnedAt, 0);
        });

        it("[RETURN-02] returns a loan by _id", async () => {
            const staff = await signInAs("staff");
            const lookup = await staff.get(pathOf("/staff/loans/active-by-copy/:copyCode", { copyCode: WONDER.copyCode }));
            expect(lookup.status, `setup: active-by-copy returned ${lookup.status}: ${lookup.text}`).toBe(200);

            const res = await staff.post(returnPath(lookup.body.data.loan._id)).send({ condition: "Good" }).expect(200);

            expect(res.body.data).toMatchObject({ borrowCode: WONDER.borrowCode, status: "Returned" });
        });

        it("[RETURN-03] conditionNote is optional and then null", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post(returnPath(WONDER.borrowCode)).send({ condition: "Good" }).expect(200);

            expect(res.body.data.conditionNote).toBeNull();
        });
    });

    describe("copy state after the return", () => {
        it("[RETURN-04] Good: the copy is Available and Good again", async () => {
            const staff = await signInAs("staff");
            await staff.post(returnPath(WONDER.borrowCode)).send({ condition: "Good" }).expect(200);

            const copy = await copyInCatalog(staff, WONDER.book._id, WONDER.copyCode);

            expect(copy).toMatchObject({ state: "Available", condition: "Good" });
        });

        it.each(["Damaged", "Lost"] as const)("[RETURN-05] %s: the copy's state and condition both become %s", async (condition) => {
            const staff = await signInAs("staff");

            const res = await staff.post(returnPath(WONDER.borrowCode)).send({ condition }).expect(200);

            expect(res.body.data).toMatchObject({ returnCondition: condition, copy: { newState: condition } });
            const copy = await copyInCatalog(staff, WONDER.book._id, WONDER.copyCode);
            expect(copy).toMatchObject({ state: condition, condition });
        });
    });

    describe("history", () => {
        it("[RETURN-06] the loan moves from current loans to the student's borrowing history", async () => {
            const staff = await signInAs("staff");
            await staff.post(returnPath(WONDER.borrowCode)).send({ condition: "Good" }).expect(200);
            const maya = await signInAs("student", SEED_STUDENT.maya.accountId);

            const res = await maya.get("/me/borrowing").expect(200);

            expect(res.body.data.accountSummary.activeLoansCount).toBe(1);
            expect(res.body.data.currentLoans.map((loan: { borrowCode: string }) => loan.borrowCode)).toEqual([
                SEED_LOAN.mayaBriefHistory.borrowCode
            ]);
            // sorted by returnedAt, newest first: today's return, then BR-2040 (2026-09-22)
            expect(res.body.data.borrowingHistory).toMatchObject([
                { borrowCode: WONDER.borrowCode, returnCondition: "Good" },
                { borrowCode: SEED_LOAN.mayaReturned.borrowCode }
            ]);
        });
    });

    describe("errors", () => {
        it("[RETURN-07] a loan returned a moment ago cannot be returned again", async () => {
            const staff = await signInAs("staff");
            await staff.post(returnPath(WONDER.borrowCode)).send({ condition: "Good" }).expect(200);

            const res = await staff.post(returnPath(WONDER.borrowCode)).send({ condition: "Good" });

            expectApiError(res, 409, "LOAN_ALREADY_RETURNED");
            expect(res.body.error.message).toBe(
                "Only an active loan can be checked in. A copy already returned will not be returned again."
            );
        });

        it("[RETURN-08] a seeded returned loan (BR-2040) cannot be returned", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post(returnPath(SEED_LOAN.mayaReturned.borrowCode)).send({ condition: "Good" });

            expectApiError(res, 409, "LOAN_ALREADY_RETURNED");
        });

        it("[RETURN-09] an unknown loan", async () => {
            const staff = await signInAs("staff");

            const res = await staff.post(returnPath(UNKNOWN_LOAN)).send({ condition: "Good" });

            expectApiError(res, 404, "LOAN_NOT_FOUND");
        });

        it.each([
            ["condition is missing", {}],
            ["condition is not Good / Damaged / Lost", { condition: "Broken" }]
        ])("[RETURN-10] rejected when %s", async (_label, body) => {
            const staff = await signInAs("staff");

            const res = await staff.post(returnPath(WONDER.borrowCode)).send(body);

            expectApiError(res, 400, "VALIDATION_ERROR");
        });
    });

    describe("access", () => {
        it.each(["student", "admin"] as const)("[RETURN-11] %s is not allowed (staff only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.post(returnPath(WONDER.borrowCode)).send({ condition: "Good" });

            expectForbidden(res);
        });

        it("[RETURN-12] a guest is not signed in", async () => {
            const res = await guest().post(returnPath(WONDER.borrowCode)).send({ condition: "Good" });

            expectUnauthorized(res);
        });
    });
});
