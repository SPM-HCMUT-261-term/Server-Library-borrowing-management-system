import { expect } from "vitest";

import type { Client } from "./client.js";
import { isoDateFromToday } from "./dates.js";
import { DEFAULT_PASSWORD, signInAs } from "./session.js";

// Shared by the holds and loans API tests: init.sql facts about students, books, copies and
// loans, plus small helpers that build a borrowing state through the public API.
//
// IMPORTANT: init.sql dates every Active loan in October 2026. Measured against the real clock,
// all four Active loans are OVERDUE, so Maya, Oliver and Amira are not eligible to hold, renew or
// borrow. Tests that need an eligible student create a new one with createStudent().
//
//  loan     student         copy      book (id)                      borrowed     due          status
//  -------  --------------  --------  -----------------------------  -----------  -----------  ------------------
//  BR-2081  Oliver S10312   WB-00318  The Hobbit (3)                 2026-09-29   2026-10-13   Active (overdue)
//  BR-2090  Amira  S10216   WB-00423  The Midnight Library (1)       2026-10-02   2026-10-16   Active (overdue)
//  BR-2098  Maya   S10428   WB-00216  Wonder (8)                     2026-10-08   2026-10-22   Active (overdue)
//  BR-2106  Maya   S10428   WB-00632  A Brief History of Time (7)    2026-10-12   2026-10-26   Active (overdue)
//  BR-2040  Maya   S10428   WB-00422  The Midnight Library (1)       2026-09-10   2026-09-24   Returned 2026-09-22, Good
//
//  No holds and no fines are seeded.

export interface SeedStudent {
    accountId: string;
    fullName: string;
    initials: string;
    yearGroup: string;
}

export const SEED_STUDENT = {
    maya: { accountId: "S10428", fullName: "Maya Chen", initials: "MC", yearGroup: "Year 10" },
    oliver: { accountId: "S10312", fullName: "Oliver Brown", initials: "OB", yearGroup: "Year 11" },
    amira: { accountId: "S10216", fullName: "Amira Khan", initials: "AK", yearGroup: "Year 10" }
} as const satisfies Record<string, SeedStudent>;

export interface NewStudent extends SeedStudent {
    /** Used in "Reserved for <firstName>". */
    firstName: string;
}

/** Students the tests create through POST /admin/users: no loans, no holds, no fines. */
export const NEW_STUDENT: NewStudent = {
    accountId: "S20001",
    fullName: "Nora Tran",
    firstName: "Nora",
    initials: "NT",
    yearGroup: "Year 9"
};

export const OTHER_STUDENT: NewStudent = {
    accountId: "S20002",
    fullName: "Kai Le",
    firstName: "Kai",
    initials: "KL",
    yearGroup: "Year 11"
};

/** Titles used by the tests (book `_id` from init.sql, SERIAL order). */
export const BOOK = {
    midnightLibrary: { _id: "1", title: "The Midnight Library", author: "Matt Haig", shelf: "FIC HAI · A3", format: "Paperback" },
    bookThief: { _id: "2", title: "The Book Thief", author: "Markus Zusak", shelf: "FIC ZUS · A5", format: "Paperback" },
    hobbit: { _id: "3", title: "The Hobbit", author: "J.R.R. Tolkien", shelf: "FIC TOL · A4", format: "Paperback" },
    mangoStreet: { _id: "4", title: "The House on Mango Street", author: "Sandra Cisneros", shelf: "FIC CIS · A2", format: "Paperback" },
    wrinkleInTime: { _id: "5", title: "A Wrinkle in Time", author: "Madeleine L'Engle", shelf: "FIC LEN · A3", format: "Paperback" },
    briefHistory: { _id: "7", title: "A Brief History of Time", author: "Stephen Hawking", shelf: "SCI HAW · B2", format: "Paperback" },
    wonder: { _id: "8", title: "Wonder", author: "R.J. Palacio", shelf: "FIC PAL · A2", format: "Paperback" }
} as const;

/**
 * Copies that are Available in init.sql (each copy's home location is its book's shelf).
 * The Book Thief has exactly ONE available copy (WB-00101), and The Hobbit has none,
 * which makes the hold tests deterministic.
 */
export const AVAILABLE_COPY = {
    midnight1: "WB-00421",
    bookThiefOnly: "WB-00101",
    mangoStreet: "WB-00511",
    wrinkle1: "WB-00701",
    briefHistory: "WB-00633",
    wonder: "WB-00217"
} as const;

/** init.sql loans. Every Active one is overdue against today's date (see the header). */
export const SEED_LOAN = {
    oliverHobbit: { borrowCode: "BR-2081", copyCode: "WB-00318", book: BOOK.hobbit, borrowedAt: "2026-09-29", dueDate: "2026-10-13" },
    amiraMidnight: { borrowCode: "BR-2090", copyCode: "WB-00423", book: BOOK.midnightLibrary, borrowedAt: "2026-10-02", dueDate: "2026-10-16" },
    mayaWonder: { borrowCode: "BR-2098", copyCode: "WB-00216", book: BOOK.wonder, borrowedAt: "2026-10-08", dueDate: "2026-10-22" },
    mayaBriefHistory: { borrowCode: "BR-2106", copyCode: "WB-00632", book: BOOK.briefHistory, borrowedAt: "2026-10-12", dueDate: "2026-10-26" },
    mayaReturned: {
        borrowCode: "BR-2040",
        copyCode: "WB-00422",
        book: BOOK.midnightLibrary,
        borrowedAt: "2026-09-10",
        dueDate: "2026-09-24",
        returnedAt: "2026-09-22",
        returnCondition: "Good"
    }
} as const;

/** Active seed loans in dueDate order (the default order of GET /staff/loans). */
export const SEED_ACTIVE_LOANS_BY_DUE_DATE = ["BR-2081", "BR-2090", "BR-2098", "BR-2106"] as const;

export const UNKNOWN_HOLD = "HLD-9999";
export const UNKNOWN_LOAN = "BR-9999";
export const UNKNOWN_COPY = "WB-99999";
export const UNKNOWN_STUDENT = "S99999";

export const HOLD_CODE = /^HLD-\d+$/;
export const BORROW_CODE = /^BR-\d+$/;

/**
 * Creates a student through POST /admin/users (admin module), then signs in as that student.
 * The new account has no loans, holds or fines, so it is eligible for everything.
 */
export async function createStudent(student: NewStudent = NEW_STUDENT): Promise<Client> {
    const admin = await signInAs("admin");
    const res = await admin.post("/admin/users").send({
        accountId: student.accountId,
        fullName: student.fullName,
        password: DEFAULT_PASSWORD,
        role: "student",
        yearGroup: student.yearGroup
    });
    expect([200, 201], `setup: POST /admin/users returned ${res.status}: ${res.text}`).toContain(res.status);
    return signInAs("student", student.accountId);
}

/**
 * POST /staff/loans/issue and checks that it returned 201.
 * @returns the response `data` (issueTransactionReceipt)
 */
export async function issueBooks(
    staff: Client,
    studentAccountId: string,
    copyCodes: string[],
    dueDate: string = isoDateFromToday(14)
): Promise<any> {
    const res = await staff.post("/staff/loans/issue").send({
        studentAccountId,
        items: copyCodes.map((copyCode) => ({ copyCode, dueDate }))
    });
    expect(res.status, `setup: POST /staff/loans/issue returned ${res.status}: ${res.text}`).toBe(201);
    return res.body.data;
}

/**
 * POST /holds as `student` and checks that it returned 201.
 * @returns the response `data` (holdConfirmation)
 */
export async function placeHold(student: Client, bookId: string): Promise<any> {
    const res = await student.post("/holds").send({ bookId });
    expect(res.status, `setup: POST /holds returned ${res.status}: ${res.text}`).toBe(201);
    return res.body.data;
}

/** Finds one copy in the staff view of GET /books/:id (book-inventories module). */
export async function copyInCatalog(staff: Client, bookId: string, copyCode: string): Promise<any> {
    const res = await staff.get(`/books/${bookId}`);
    expect(res.status, `GET /books/${bookId} returned ${res.status}: ${res.text}`).toBe(200);
    return res.body.data.copies.find((copy: { copyCode: string }) => copy.copyCode === copyCode);
}
