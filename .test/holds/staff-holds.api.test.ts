import { beforeEach, describe, expect, it } from "vitest";

import { expectForbidden, expectUnauthorized } from "../helpers/assertions.js";
import {
    AVAILABLE_COPY,
    BOOK,
    HOLD_CODE,
    NEW_STUDENT,
    OTHER_STUDENT,
    createStudent,
    issueBooks,
    placeHold
} from "../helpers/borrowing.js";
import type { Client } from "../helpers/client.js";
import { guest, resetDatabase, signInAs } from "../helpers/session.js";

// GET /staff/holds (contract 7.7), Staff only.
// Lists ACTIVE (Ready) holds so staff can release uncollected ones.
// Query: q (holdCode, studentAccountId, student name, copyCode, book title), page (1), limit (10).
// init.sql has no holds.

/** Nora holds The Book Thief (WB-00101); Kai holds The House on Mango Street (WB-00511). */
async function twoHolds(): Promise<{ noraHold: any; kaiHold: any; staff: Client }> {
    const nora = await createStudent(NEW_STUDENT);
    const noraHold = await placeHold(nora, BOOK.bookThief._id);
    const kai = await createStudent(OTHER_STUDENT);
    const kaiHold = await placeHold(kai, BOOK.mangoStreet._id);
    const staff = await signInAs("staff");
    return { noraHold, kaiHold, staff };
}

const holdCodesOf = (items: { holdCode: string }[]): string[] => items.map((item) => item.holdCode);

describe("GET /staff/holds", () => {
    beforeEach(resetDatabase);

    it("[STAFF-HOLDS-01] is empty when nobody holds a copy", async () => {
        const staff = await signInAs("staff");

        const res = await staff.get("/staff/holds").expect(200);

        expect(res.body.success).toBe(true);
        expect(res.body.data.items).toEqual([]);
        expect(res.body.data.pagination).toMatchObject({ totalItems: 0, currentPage: 1, limit: 10 });
    });

    it("[STAFF-HOLDS-02] lists a new hold with its student, book and copy", async () => {
        const student = await createStudent();
        const hold = await placeHold(student, BOOK.bookThief._id);
        const staff = await signInAs("staff");

        const res = await staff.get("/staff/holds").expect(200);

        expect(res.body.data.items).toMatchObject([
            {
                _id: hold._id,
                holdCode: expect.stringMatching(HOLD_CODE),
                status: "Ready",
                requestedAt: expect.any(String),
                collectBy: expect.any(String),
                isPastDeadline: false,
                student: {
                    _id: expect.any(String),
                    accountId: NEW_STUDENT.accountId,
                    fullName: NEW_STUDENT.fullName,
                    yearGroup: NEW_STUDENT.yearGroup
                },
                book: {
                    _id: BOOK.bookThief._id,
                    title: BOOK.bookThief.title,
                    author: BOOK.bookThief.author,
                    coverImageUrl: null
                },
                copy: {
                    _id: expect.any(String),
                    copyCode: AVAILABLE_COPY.bookThiefOnly,
                    homeLocation: BOOK.bookThief.shelf
                }
            }
        ]);
        expect(res.body.data.items[0].holdCode).toBe(hold.holdCode);
        expect(res.body.data.pagination).toMatchObject({ totalItems: 1, currentPage: 1, totalPages: 1, limit: 10 });
    });

    describe("only active holds", () => {
        it("[STAFF-HOLDS-03] a cancelled hold is not listed", async () => {
            const { noraHold, kaiHold, staff } = await twoHolds();
            await staff.delete(`/holds/${noraHold.holdCode}`).expect(200);

            const res = await staff.get("/staff/holds").expect(200);

            expect(holdCodesOf(res.body.data.items)).toEqual([kaiHold.holdCode]);
        });

        it("[STAFF-HOLDS-04] a hold fulfilled at the counter is not listed", async () => {
            const { kaiHold, staff } = await twoHolds();
            await issueBooks(staff, NEW_STUDENT.accountId, [AVAILABLE_COPY.bookThiefOnly]);

            const res = await staff.get("/staff/holds").expect(200);

            expect(holdCodesOf(res.body.data.items)).toEqual([kaiHold.holdCode]);
        });
    });

    describe("search (q)", () => {
        it.each([
            ["the student's account id", OTHER_STUDENT.accountId],
            ["the student's name (case-insensitive)", "kai"],
            ["the copy code", AVAILABLE_COPY.mangoStreet],
            ["the book title (case-insensitive)", "mango"]
        ])("[STAFF-HOLDS-05] finds a hold by %s", async (_label, q) => {
            const { kaiHold, staff } = await twoHolds();

            const res = await staff.get("/staff/holds").query({ q }).expect(200);

            expect(holdCodesOf(res.body.data.items)).toEqual([kaiHold.holdCode]);
        });

        it("[STAFF-HOLDS-06] finds a hold by its holdCode", async () => {
            const { noraHold, staff } = await twoHolds();

            const res = await staff.get("/staff/holds").query({ q: noraHold.holdCode }).expect(200);

            expect(holdCodesOf(res.body.data.items)).toEqual([noraHold.holdCode]);
        });

        it("[STAFF-HOLDS-07] no match gives an empty page", async () => {
            const { staff } = await twoHolds();

            const res = await staff.get("/staff/holds").query({ q: "no such hold" }).expect(200);

            expect(res.body.data.items).toEqual([]);
            expect(res.body.data.pagination.totalItems).toBe(0);
        });
    });

    describe("pagination", () => {
        it("[STAFF-HOLDS-08] limit=1 splits two holds over two pages", async () => {
            const { noraHold, kaiHold, staff } = await twoHolds();

            const page1 = await staff.get("/staff/holds").query({ limit: 1, page: 1 }).expect(200);
            const page2 = await staff.get("/staff/holds").query({ limit: 1, page: 2 }).expect(200);

            expect(page1.body.data.items).toHaveLength(1);
            expect(page2.body.data.items).toHaveLength(1);
            expect(page1.body.data.pagination).toMatchObject({ totalItems: 2, currentPage: 1, totalPages: 2, limit: 1 });
            expect(page2.body.data.pagination).toMatchObject({ totalItems: 2, currentPage: 2, totalPages: 2, limit: 1 });
            expect([...holdCodesOf(page1.body.data.items), ...holdCodesOf(page2.body.data.items)].sort()).toEqual(
                [noraHold.holdCode, kaiHold.holdCode].sort()
            );
        });
    });

    describe("access", () => {
        it.each(["student", "admin"] as const)("[STAFF-HOLDS-09] %s is not allowed (staff only)", async (role) => {
            const user = await signInAs(role);

            const res = await user.get("/staff/holds");

            expectForbidden(res);
        });

        it("[STAFF-HOLDS-10] a guest is not signed in", async () => {
            const res = await guest().get("/staff/holds");

            expectUnauthorized(res);
        });
    });
});
