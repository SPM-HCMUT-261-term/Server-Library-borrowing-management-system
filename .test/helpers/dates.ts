import { expect } from "vitest";

// Calendar-date helpers for the loan and hold tests. Dates are "YYYY-MM-DD" strings.

const DAY_MS = 86_400_000;

const pad = (value: number): string => String(value).padStart(2, "0");

/** Today's date on this machine, shifted by `days` (e.g. 14 → the default loan due date). */
export function isoDateFromToday(days = 0): string {
    const date = new Date();
    date.setDate(date.getDate() + days);
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Pure calendar arithmetic: addDays("2026-10-22", 7) === "2026-10-29". */
export function addDays(isoDate: string, days: number): string {
    const time = Date.parse(`${isoDate.slice(0, 10)}T00:00:00Z`) + days * DAY_MS;
    return new Date(time).toISOString().slice(0, 10);
}

/** Whole calendar days from `fromIso` to `toIso` (negative when `toIso` is earlier). */
export function daysBetween(fromIso: string, toIso: string): number {
    const from = Date.parse(`${fromIso.slice(0, 10)}T00:00:00Z`);
    const to = Date.parse(`${toIso.slice(0, 10)}T00:00:00Z`);
    return Math.round((to - from) / DAY_MS);
}

/**
 * Checks a date that the server derives from "today" (e.g. defaultDueDate = today + 14).
 * The server may count today in UTC or in local time, so the expected date ±1 day is accepted.
 * Accepts a date ("2026-10-29") or a timestamp ("2026-10-29T08:00:00Z"); only the date part is compared.
 */
export function expectDateNearToday(actual: unknown, offsetDays: number): void {
    expect(actual).toEqual(expect.any(String));
    const date = String(actual).slice(0, 10);
    const expected = isoDateFromToday(offsetDays);
    expect(Math.abs(daysBetween(expected, date)), `${date} should be about ${expected}`).toBeLessThanOrEqual(1);
}
