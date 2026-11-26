import { beforeEach, describe, expect, it } from "vitest";

import { pathOf } from "../helpers/api-client.js";
import { expectApiError } from "../helpers/assertions.js";
import { resetDatabase, signInAs } from "../helpers/session.js";
import { BOOK_ID, COPY, COPY_ID, UNKNOWN_COPY } from "./fixtures.js";

// DELETE /copies/:id: staff delete a physical copy, found by numeric id or barcode.
// Blocked when the copy has loan history or is in the Borrowed state.

const copyPath = (id: string): string => pathOf("/copies/:id", { id });

describe("DELETE /copies/:id", () => {
    beforeEach(resetDatabase);

    it("[DELETE-COPY-01] by barcode: deletes a copy with no history", async () => {
        const staff = await signInAs("staff");

        const res = await staff.delete(copyPath(COPY.midnightAvailable));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: "Physical copy deleted successfully" });
    });

    it("[DELETE-COPY-02] by numeric id", async () => {
        // Copy id 25 is WB-00951 (Dế Mèn Phiêu Lưu Ký), which has no loans.
        const staff = await signInAs("staff");

        const res = await staff.delete(copyPath(COPY_ID.deMenAvailable));

        expect(res.status).toBe(200);
        expect(res.body).toEqual({ success: true, message: "Physical copy deleted successfully" });
    });

    it("[DELETE-COPY-03] the book detail no longer lists the deleted copy", async () => {
        const staff = await signInAs("staff");
        const deleted = await staff.delete(copyPath(COPY.midnightAvailable));
        expect(deleted.status).toBe(200);

        const res = await staff.get(`/books/${BOOK_ID.midnightLibrary}`);

        expect(res.status).toBe(200);
        expect(res.body.data.stockSummary).toMatchObject({ totalCopies: 3, availableCopies: 1, borrowedCopies: 2 });
        expect(res.body.data.copies.map((copy: { copyCode: string }) => copy.copyCode)).toEqual([
            COPY.midnightReturnedLoan,
            COPY.midnightBorrowed,
            COPY.midnightBorrowedNoLoan
        ]);
    });

    it("[DELETE-COPY-04] a copy with a returned loan keeps its record", async () => {
        const staff = await signInAs("staff");

        const res = await staff.delete(copyPath(COPY.midnightReturnedLoan));

        expectApiError(res, 409, "COPY_HAS_LOAN_HISTORY");
    });

    it("[DELETE-COPY-05] a borrowed copy cannot be deleted", async () => {
        // WB-00424 has no loan row, but its state is Borrowed, which also blocks the delete.
        const staff = await signInAs("staff");

        const res = await staff.delete(copyPath(COPY.midnightBorrowedNoLoan));

        expectApiError(res, 409, "COPY_HAS_LOAN_HISTORY");
    });

    it("[DELETE-COPY-06] returns 404 for an unknown barcode", async () => {
        const staff = await signInAs("staff");

        const res = await staff.delete(copyPath(UNKNOWN_COPY));

        expectApiError(res, 404, "COPY_NOT_FOUND");
    });

    describe("access", () => {
        it("[DELETE-COPY-07] a student is not allowed", async () => {
            const student = await signInAs("student");

            const res = await student.delete(copyPath(COPY.midnightAvailable));

            expectApiError(res, 403, "FORBIDDEN_ACCESS");
        });
    });
});
