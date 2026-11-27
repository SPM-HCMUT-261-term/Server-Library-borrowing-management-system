import { beforeEach, describe, expect, it } from "vitest";

import { expectApiError, expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    BORROW_CODE,
    NEW_STUDENT,
    OTHER_STUDENT,
    SEED_LOAN,
    SEED_STUDENT,
    copyInCatalog,
    createStudent,
    issueBooks,
    placeHold
} from "../helpers/borrowing.js";
import { pathOf } from "../helpers/client.js";
import { expectDateNearToday, isoDateFromToday } from "../helpers/dates.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// POST /staff/loans/issue (contract 7.3), Staff only.
// Step 3 of "Loan a Book". Atomically checks the borrower, the copies, hold ownership and the
// 5-loan limit; creates one loan (BR-xxxx) per copy; marks the copies Borrowed; fulfils the
// student's holds on those copies. Body: { studentAccountId, items: [{ copyCode, dueDate }] (1..5) }.

const issueBody = (studentAccountId: string, copyCodes: string[], dueDate = isoDateFromToday(14)) => ({
    studentAccountId,
    items: copyCodes.map((copyCode) => ({ copyCode, dueDate }))
});

describe("POST /staff/loans/issue", () => {
    beforeEach(resetDatabase);

    describe("success", () => {
        it("[ISSUE-01] issues two copies and returns the receipt", async () => {
            await createStudent();
            const staff = await signInAs("staff");
            const dueDate = isoDateFromToday(14);

            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1, AVAILABLE_COPY.mangoStreet], dueDate))
                .expect(201);

            expect(res.body).toMatchObject({
                success: true,
                message: `2 books issued. Checkout confirmed for ${NEW_STUDENT.fullName} · ${NEW_STUDENT.accountId}`,
                data: {
                    issuedAt: expect.any(String),
                    borrowEntries: [
                        {
                            _id: expect.any(String),
                            borrowCode: expect.stringMatching(BORROW_CODE),
                            copyCode: AVAILABLE_COPY.midnight1,
                            book: {
                                _id: BOOK.midnightLibrary._id,
                                title: BOOK.midnightLibrary.title,
                                author: BOOK.midnightLibrary.author,
                                coverImageUrl: null
                            },
                            dueDate
                        },
                        {
                            _id: expect.any(String),
                            borrowCode: expect.stringMatching(BORROW_CODE),
                            copyCode: AVAILABLE_COPY.mangoStreet,
                            book: { _id: BOOK.mangoStreet._id, title: BOOK.mangoStreet.title },
                            dueDate
                        }
                    ],
                    fulfilledHolds: [],
                    borrowerSummary: {
                        studentId: expect.any(String),
                        accountId: NEW_STUDENT.accountId,
                        fullName: NEW_STUDENT.fullName,
                        yearGroup: NEW_STUDENT.yearGroup,
                        loansBefore: 0,
                        loansNow: 2,
                        maxLoansLimit: 5,
                        remainingLoanSpace: 3
                    }
                }
            });
            const [first, second] = res.body.data.borrowEntries;
            expect(first.borrowCode).not.toBe(second.borrowCode); // one loan per copy
            expectDateNearToday(first.borrowedAt, 0);
            expectDateNearToday(res.body.data.issuedAt, 0);
        });

        it("[ISSUE-02] the issued copies become Borrowed", async () => {
            await createStudent();
            const staff = await signInAs("staff");
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1, AVAILABLE_COPY.mangoStreet]);

            const midnight = await copyInCatalog(staff, BOOK.midnightLibrary._id, AVAILABLE_COPY.midnight1);
            const mango = await copyInCatalog(staff, BOOK.mangoStreet._id, AVAILABLE_COPY.mangoStreet);

            expect(midnight.state).toBe("Borrowed");
            expect(mango.state).toBe("Borrowed");
        });

        it("[ISSUE-03] five copies at once reach the limit exactly", async () => {
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff
                .post("/staff/loans/issue")
                .send(
                    issueBody(NEW_STUDENT.accountId, [
                        AVAILABLE_COPY.midnight1,
                        AVAILABLE_COPY.bookThiefOnly,
                        AVAILABLE_COPY.mangoStreet,
                        AVAILABLE_COPY.wrinkle1,
                        AVAILABLE_COPY.briefHistory
                    ])
                )
                .expect(201);

            expect(res.body.data.borrowEntries).toHaveLength(5);
            expect(res.body.data.borrowerSummary).toMatchObject({ loansBefore: 0, loansNow: 5, remainingLoanSpace: 0 });
        });
    });

    describe("holds", () => {
        it("[ISSUE-04] issuing the copy reserved for this student fulfils the hold", async () => {
            const student = await createStudent();
            const hold = await placeHold(student, BOOK.bookThief._id);
            const staff = await signInAs("staff");

            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(NEW_STUDENT.accountId, [AVAILABLE_COPY.bookThiefOnly]))
                .expect(201);

            expect(res.body.data.fulfilledHolds).toMatchObject([
                { holdCode: hold.holdCode, copyCode: AVAILABLE_COPY.bookThiefOnly, message: expect.any(String) }
            ]);
            const holds = await staff.get("/staff/holds");
            expect(holds.body.data.items).toEqual([]);
            const dashboard = await student.get("/me/borrowing");
            expect(dashboard.body.data.holdRequests).toEqual([]);
            expect(dashboard.body.data.currentLoans).toMatchObject([{ copyCode: AVAILABLE_COPY.bookThiefOnly }]);
        });

        it("[ISSUE-05] a copy reserved for another student is not available", async () => {
            const nora = await createStudent(NEW_STUDENT);
            await placeHold(nora, BOOK.bookThief._id);
            await createStudent(OTHER_STUDENT);
            const staff = await signInAs("staff");

            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(OTHER_STUDENT.accountId, [AVAILABLE_COPY.bookThiefOnly]));

            expectApiError(res, 409, "COPY_NOT_AVAILABLE_FOR_STUDENT");
        });
    });

    describe("copies that cannot be issued", () => {
        it("[ISSUE-06] a Borrowed copy rejects the whole batch (nothing is issued)", async () => {
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1, SEED_LOAN.amiraMidnight.copyCode]));

            expectApiError(res, 409, "COPY_NOT_AVAILABLE_FOR_STUDENT");
            const untouched = await copyInCatalog(staff, BOOK.midnightLibrary._id, AVAILABLE_COPY.midnight1);
            expect(untouched.state).toBe("Available");
        });

        it.each(["Damaged", "Lost"] as const)("[ISSUE-07] a %s copy is not available", async (state) => {
            await createStudent();
            const staff = await signInAs("staff");
            const marked = await staff.put(pathOf("/copies/:id", { id: AVAILABLE_COPY.midnight1 })).send({
                homeLocation: BOOK.midnightLibrary.shelf,
                state,
                condition: state
            });
            expect(marked.status, `setup: PUT /copies returned ${marked.status}: ${marked.text}`).toBe(200);

            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1]));

            expectApiError(res, 409, "COPY_NOT_AVAILABLE_FOR_STUDENT");
        });

        it("[ISSUE-08] the same copy twice in one batch", async () => {
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(NEW_STUDENT.accountId, [AVAILABLE_COPY.midnight1, AVAILABLE_COPY.midnight1]));

            expectApiError(res, 400, "DUPLICATE_COPY_IN_BATCH");
        });
    });

    describe("borrower", () => {
        it("[ISSUE-09] a student with overdue books is not eligible", async () => {
            const staff = await signInAs("staff");

            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(SEED_STUDENT.maya.accountId, [AVAILABLE_COPY.midnight1]));

            expectApiError(res, 403, "BORROWER_INELIGIBLE");
        });

        it("[ISSUE-10] more than 5 active loans in total is rejected (nothing is issued)", async () => {
            await createStudent();
            const staff = await signInAs("staff");
            await issueBooks(staff, NEW_STUDENT.accountId, [
                AVAILABLE_COPY.midnight1,
                AVAILABLE_COPY.bookThiefOnly,
                AVAILABLE_COPY.mangoStreet
            ]);

            // 3 active + 3 new = 6 > 5
            const res = await staff
                .post("/staff/loans/issue")
                .send(issueBody(NEW_STUDENT.accountId, [AVAILABLE_COPY.wrinkle1, AVAILABLE_COPY.briefHistory, AVAILABLE_COPY.wonder]));

            expectApiError(res, 403, "LOAN_LIMIT_EXCEEDED");
            const untouched = await copyInCatalog(staff, BOOK.wrinkleInTime._id, AVAILABLE_COPY.wrinkle1);
            expect(untouched.state).toBe("Available");
        });
    });

    describe("validation", () => {
        const dueDate = isoDateFromToday(14);
        const sixCopies = [
            AVAILABLE_COPY.midnight1,
            AVAILABLE_COPY.bookThiefOnly,
            AVAILABLE_COPY.mangoStreet,
            AVAILABLE_COPY.wrinkle1,
            AVAILABLE_COPY.briefHistory,
            AVAILABLE_COPY.wonder
        ];

        it.each([
            ["items is empty", { studentAccountId: NEW_STUDENT.accountId, items: [] }],
            ["items has more than 5 entries", issueBody(NEW_STUDENT.accountId, sixCopies, dueDate)],
            ["studentAccountId is missing", { items: [{ copyCode: AVAILABLE_COPY.midnight1, dueDate }] }],
            ["an item has no dueDate", { studentAccountId: NEW_STUDENT.accountId, items: [{ copyCode: AVAILABLE_COPY.midnight1 }] }],
            ["an item has no copyCode", { studentAccountId: NEW_STUDENT.accountId, items: [{ dueDate }] }]
        ])("[ISSUE-11] rejected when %s", async (_label, body) => {
            await createStudent();
            const staff = await signInAs("staff");

            const res = await staff.post("/staff/loans/issue").send(body);

            expectApiError(res, 400, "VALIDATION_ERROR");
        });
    });

    describe("access", () => {
        it.each(["student", "admin"] as const)("[ISSUE-12] %s is not allowed (staff only)", async (role) => {
            const user = await signInAs(role);

            const res = await user
                .post("/staff/loans/issue")
                .send(issueBody(SEED_STUDENT.maya.accountId, [AVAILABLE_COPY.midnight1]));

            expectForbidden(res);
        });

        it("[ISSUE-13] a guest is not signed in", async () => {
            const res = await guest()
                .post("/staff/loans/issue")
                .send(issueBody(SEED_STUDENT.maya.accountId, [AVAILABLE_COPY.midnight1]));

            expectUnauthorized(res);
        });
    });
});
