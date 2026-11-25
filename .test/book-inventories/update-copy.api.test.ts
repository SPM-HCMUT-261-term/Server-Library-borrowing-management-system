import { beforeEach, describe, expect, it } from "vitest";

import { pathOf } from "../helpers/api-client.js";
import { expectApiError, expectValidationError } from "../helpers/assertions.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";
import { AVAILABLE_COPY_BODY, BOOK_ID, COPY, COPY_ID, UNKNOWN_COPY } from "./fixtures.js";

// PUT /copies/:id: staff edit a physical copy, found by numeric id or barcode.
// An omitted `notes` keeps the stored value; null clears it. A copy on loan is locked.

const copyPath = (id: string): string => pathOf("/copies/:id", { id });

describe("PUT /copies/:id", () => {
    beforeEach(resetDatabase);

    it("[UPDATE-COPY-01] by barcode: marks an available copy damaged", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(copyPath(COPY.midnightAvailable), {
            homeLocation: "REPAIR-SHELF",
            state: "Damaged",
            condition: "Damaged",
            notes: "Cover torn"
        });

        expect(res.status).toBe(200);
        expect(res.body.success).toBe(true);
        expect(res.body.data.copy).toMatchObject({
            _id: COPY_ID.midnightAvailable,
            copyCode: COPY.midnightAvailable,
            bookId: BOOK_ID.midnightLibrary,
            homeLocation: "REPAIR-SHELF",
            state: "Damaged",
            condition: "Damaged",
            notes: "Cover torn",
            hasLoanHistory: false
        });
        expect(res.body.data.updatedStockSummary).toMatchObject({
            totalCopies: 4,
            availableCopies: 1,
            borrowedCopies: 2,
            reservedCopies: 0,
            damagedCopies: 1,
            lostCopies: 0
        });
    });

    it("[UPDATE-COPY-02] by numeric id", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(copyPath(COPY_ID.midnightAvailable), {
            homeLocation: "FIC HAI · A3",
            state: "Lost",
            condition: "Lost"
        });

        expect(res.status).toBe(200);
        expect(res.body.data).toMatchObject({
            copy: { copyCode: COPY.midnightAvailable, state: "Lost" },
            updatedStockSummary: { availableCopies: 1, lostCopies: 1 }
        });
    });

    it("[UPDATE-COPY-03] a copy with only a returned loan can be edited", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(copyPath(COPY.midnightReturnedLoan), {
            homeLocation: "FIC HAI · A3",
            state: "Lost",
            condition: "Lost"
        });

        expect(res.status).toBe(200);
        expect(res.body.data.copy).toMatchObject({
            copyCode: COPY.midnightReturnedLoan,
            state: "Lost",
            hasLoanHistory: true
        });
    });

    describe("notes (undefined vs null)", () => {
        it("[UPDATE-COPY-04] an omitted notes field keeps the stored note", async () => {
            // Checks the undefined-vs-null fix in updatePhysicalCopy.
            const staff = await signInAs("staff");
            const setup = await staff.put(copyPath(COPY.midnightAvailable), { ...AVAILABLE_COPY_BODY, notes: "Temporary note" });
            expect(setup.status).toBe(200);

            const res = await staff.put(copyPath(COPY.midnightAvailable), {
                ...AVAILABLE_COPY_BODY,
                homeLocation: "FIC HAI · A4"
            });

            expect(res.status).toBe(200);
            expect(res.body.data.copy).toMatchObject({ homeLocation: "FIC HAI · A4", notes: "Temporary note" });
        });

        it("[UPDATE-COPY-05] notes: null clears the stored note", async () => {
            const staff = await signInAs("staff");
            const setup = await staff.put(copyPath(COPY.midnightAvailable), { ...AVAILABLE_COPY_BODY, notes: "Temporary note" });
            expect(setup.status).toBe(200);

            const res = await staff.put(copyPath(COPY.midnightAvailable), { ...AVAILABLE_COPY_BODY, notes: null });

            expect(res.status).toBe(200);
            expect(res.body.data.copy.notes).toBeNull();
        });
    });

    it("[UPDATE-COPY-06] a borrowed copy cannot be changed", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(copyPath(COPY.midnightBorrowed), {
            homeLocation: "FIC HAI · A3",
            state: "Damaged",
            condition: "Damaged"
        });

        expectApiError(res, 409, "COPY_HAS_ACTIVE_LOAN_OR_HOLD");
    });

    it("[UPDATE-COPY-07] returns 404 for an unknown barcode", async () => {
        const staff = await signInAs("staff");

        const res = await staff.put(copyPath(UNKNOWN_COPY), { homeLocation: "ANY", state: "Available", condition: "Good" });

        expectApiError(res, 404, "COPY_NOT_FOUND");
        expect(res.body.error.message).toBe("Physical copy not found");
    });

    describe("validation", () => {
        it("[UPDATE-COPY-08] Borrowed cannot be set by hand", async () => {
            const staff = await signInAs("staff");

            const res = await staff.put(copyPath(COPY.midnightAvailable), { ...AVAILABLE_COPY_BODY, state: "Borrowed" });

            expectValidationError(res, "body.state");
        });
    });

    describe("access", () => {
        it("[UPDATE-COPY-09] a guest gets 401 UNAUTHORIZED", async () => {
            const res = await guest().put(copyPath(COPY.midnightAvailable), AVAILABLE_COPY_BODY);

            expect(res.status).toBe(401);
            expect(res.body.error.code).toBe("UNAUTHORIZED");
        });

        // KNOWN BUG: same as LIST-24, the 401 body has no `success: false`.
        it.fails("[UPDATE-COPY-09] the 401 body uses the error envelope with success: false", async () => {
            const res = await guest().put(copyPath(COPY.midnightAvailable), AVAILABLE_COPY_BODY);

            expectApiError(res, 401, "UNAUTHORIZED");
        });

        it("[UPDATE-COPY-10] a student is not allowed", async () => {
            const student = await signInAs("student");

            const res = await student.put(copyPath(COPY.midnightAvailable), AVAILABLE_COPY_BODY);

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
