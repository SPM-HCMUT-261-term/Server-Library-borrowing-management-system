import type {
    BorrowerWithStatsEntity,
    CheckoutCopyEntity,
    LoanWithDetailEntity
} from "./loans.entity.js";

// Pure rule functions of the loans module: plain data in, plain value out.
// No database, no repository, no `throw` here (the service throws), no response object here (the DTO builds it).
// The service calls a rule to decide "is it allowed?", the DTO calls the SAME rule to describe the state to the client.
// Every function is empty with return type `void`: replace `void` by the real return type when you implement it.
// Unit test every function with vitest (loans.rules.test.ts): that is where most bugs of this module will be.
//
// Dates are ISO date strings "YYYY-MM-DD" (DATE columns arrive as `::text`).
// Timestamps (returnedAt, collectBy, ...) are ISO strings: the repository converts them with toISOString().


// ---------------------------------------------------------------- constants (API contract section 1.4)

export const MAX_RENEWALS_PER_LOAN = 1;
export const DEFAULT_LOAN_DAYS = 14;
export const RENEWAL_EXTRA_DAYS = 7;
export const PICKUP_LOCATION = "Main library counter"; // no column in `holds`, so it is a constant
export const SCHOOL_TIME_ZONE = "Asia/Ho_Chi_Minh";
// The contract does not define "due soon". Pick a number with the FE dev.
// Keep it equal to the `CURRENT_DATE + 2` in the getLoanRecords SQL hint, otherwise the filter and the badge disagree.
export const DUE_SOON_DAYS = 2;


// ---------------------------------------------------------------- date helpers
// Move these to shared/utils when the holds module needs them (it needs addDays + "tomorrow 15:30").

export function getToday(now?: Date): void // will replace by return type: string (YYYY-MM-DD)
{
    // Today's date in SCHOOL_TIME_ZONE, NOT the server's timezone.
    //   new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(now ?? new Date())   -> "2026-11-18"
    // The service calls it ONCE per request and passes the string down to every rule / DTO ("today" is never recomputed).
    // The `now` argument exists only so tests can fake the clock.
}

export function daysBetween(fromIsoDate: string, toIsoDate: string): void // will replace by return type: number
{
    // Calendar days from `from` to `to`; negative when `to` is before `from`.
    // Parse both as UTC midnight so daylight saving / timezones cannot shift the result:
    //   Math.round((Date.parse(toIsoDate + "T00:00:00Z") - Date.parse(fromIsoDate + "T00:00:00Z")) / 86_400_000)
}

export function addDays(isoDate: string, days: number): void // will replace by return type: string (YYYY-MM-DD)
{
    // new Date(isoDate + "T00:00:00Z"), setUTCDate(getUTCDate() + days), then .toISOString().slice(0, 10)
}

export function formatDisplayDate(isoDate: string): void // will replace by return type: string, e.g. "16 Oct 2026"
{
    // new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })
    //   .format(new Date(isoDate + "T00:00:00Z"))
    // Only for the text of messages (blockingInfo.message). Fields stay ISO dates.
}


// ---------------------------------------------------------------- text helpers

export function pluralize(count: number, singular: string, plural?: string): void // will replace by return type: string
{
    // count === 1 ? singular : (plural ?? singular + "s")        pluralize(2, "book") -> "books", pluralize(1, "day") -> "day"
}

export function getFirstName(fullName: string): void // will replace by return type: string
{
    // First word of the trimmed fullName ("Maya Chen" -> "Maya"). Used in "Reserved for Maya".
    // OPEN DECISION with the FE dev: for Vietnamese names the first word is the family name. Pick first or last word, once.
}


// ---------------------------------------------------------------- loan timing
// Overdue is derived, never stored: status "Active" AND dueDate < today. A loan due today is NOT overdue. A Returned loan never is.

type LoanTimingInput = Pick<LoanWithDetailEntity, "status" | "dueDate">;

export function getDaysLeft(loan: LoanTimingInput, today: string): void // will replace by return type: number
{
    // daysBetween(today, loan.dueDate): positive = days remaining, 0 = due today, negative = days overdue
}

export function isLoanOverdue(loan: LoanTimingInput, today: string): void // will replace by return type: boolean
{
    // loan.status === "Active" && getDaysLeft(loan, today) < 0
}

export function getTimingBadge(loan: LoanTimingInput, today: string): void // will replace by return type: string
{
    // For findActiveLoanByCopy (return screen): overdue -> `Overdue · ${days} ${pluralize(days, "day")}` where days = -daysLeft,
    // otherwise "On time" (due today is still "On time").
}

export function getLoanStatusBadge(loan: LoanTimingInput, today: string): void // will replace by return type: string
{
    // For getLoanRecords rows, first match wins:
    //   status "Returned"        -> "Returned"
    //   overdue                  -> `Overdue · ${days} ${pluralize(days, "day")}`
    //   daysLeft === 1           -> "Due tomorrow"
    //   (optional) daysLeft === 0 -> "Due today"      the contract does not list it, ask the FE dev
    //   otherwise                -> "On loan"
}


// ---------------------------------------------------------------- borrower

type BorrowerCounters = Pick<
    BorrowerWithStatsEntity,
    "status" | "activeLoansCount" | "maxLoansLimit" | "overdueLoansCount" | "unpaidFines"
>;

export function getRemainingLoanSpace(borrower: BorrowerCounters): void // will replace by return type: number
{
    // Math.max(0, borrower.maxLoansLimit - borrower.activeLoansCount)
}

export function hasBorrowingBlock(borrower: BorrowerCounters): void // will replace by return type: boolean
{
    // A block that is NOT about the loan limit: overdueLoansCount > 0 || unpaidFines > 0 (|| status === "Inactive", suggested).
    // The service throws BORROWER_INELIGIBLE with this one, and LOAN_LIMIT_EXCEEDED separately, so they stay two rules.
}

export function canBorrow(borrower: BorrowerCounters): void // will replace by return type: boolean
{
    // !hasBorrowingBlock(borrower) && getRemainingLoanSpace(borrower) > 0
    // Feeds: eligibility.isEligible (staff checkout) and accountSummary.canBorrow (student dashboard).
}

export function getAccountStatusText(borrower: BorrowerCounters): void // will replace by return type: string
{
    // accountSummary.statusText on the student dashboard. First match wins:
    //   overdueLoansCount > 0               -> "You have overdue books"
    //   unpaidFines > 0                     -> "You have unpaid fines"
    //   remaining loan space === 0          -> "Loan limit reached"
    //   otherwise                           -> "You can borrow"
    // Wording is a suggestion (the contract only gives "You can borrow"). Agree the strings with the FE dev.
}

export function getCheckoutStatusBanner(borrower: BorrowerCounters): void // will replace by return type: string
{
    // eligibility.statusBanner at the counter. Join the parts with " · " and end with a sentence:
    //   overdue part:  overdueLoansCount === 0 ? "No overdue books" : `${n} overdue ${pluralize(n, "book")}`
    //   fines part:    unpaidFines === 0 ? "No unpaid fines" : `Unpaid fines: ${unpaidFines.toFixed(2)}`
    //   sentence:      canBorrow ? `You can select up to ${remaining} additional ${pluralize(remaining, "copy", "copies")}.`
    //                  : hasBorrowingBlock ? "Checkout is blocked." : "Loan limit reached."
    // Example: "No overdue books · No unpaid fines. You can select up to 3 additional copies."
}


// ---------------------------------------------------------------- renewal
// ONE function decides why a renewal is blocked. canRenew, renewalStatusText and the RENEWAL_NOT_ELIGIBLE error all come from it,
// so the Renew button, the text under it and the API can never disagree.

export type RenewalBlockReason =
    | "NOT_ACTIVE"
    | "ALREADY_RENEWED"
    | "LOAN_OVERDUE"
    | "ACCOUNT_BLOCKED"
    | "HOLD_ON_TITLE";

export function getRenewalBlockReason(
    loan: Pick<LoanWithDetailEntity, "status" | "dueDate" | "renewalCount"> & { book: { _id: string } },
    borrower: BorrowerCounters,
    today: string,
    bookIdsWithReadyHold: string[]
): void // will replace by return type: RenewalBlockReason | null (null = can renew)
{
    // Check in this order, return the first that applies:
    //   loan.status !== "Active"                              -> "NOT_ACTIVE"
    //   loan.renewalCount >= MAX_RENEWALS_PER_LOAN            -> "ALREADY_RENEWED"
    //   isLoanOverdue(loan, today)                            -> "LOAN_OVERDUE"
    //   hasBorrowingBlock(borrower)                           -> "ACCOUNT_BLOCKED"   (any other overdue loan, or unpaid fines)
    //   bookIdsWithReadyHold.includes(loan.book._id)          -> "HOLD_ON_TITLE"
    //   otherwise null
    // OPEN DECISION: the contract's dashboard rule leaves out ACCOUNT_BLOCKED while renewLoan rejects it. Use this one function
    // in BOTH places (recommended), otherwise the Renew button shows and the API answers 403.
}

export function canRenewLoan(reason: RenewalBlockReason | null): void // will replace by return type: boolean
{
    // reason === null
}

export function getRenewalStatusText(reason: RenewalBlockReason | null): void // will replace by return type: string
{
    // null                 -> "Renewal available · Not yet renewed · Nobody is waiting"   (the contract example)
    // "LOAN_OVERDUE"       -> "Renewal unavailable · Overdue"
    // "ALREADY_RENEWED"    -> "Renewal unavailable · Already renewed once"
    // "HOLD_ON_TITLE"      -> "Renewal unavailable · Another student is waiting"
    // "ACCOUNT_BLOCKED"    -> "Renewal unavailable · Account has overdue books or unpaid fines"
    // "NOT_ACTIVE"         -> "Renewal unavailable · Loan is closed"
    // Keep the strings in one object: const RENEWAL_TEXT: Record<RenewalBlockReason, string>
}


// ---------------------------------------------------------------- copy at the counter

export type CopyCheckoutDecision = {
    canAdd: boolean,
    availabilityBadge: string,
    associatedHold: { _id: string, holdCode: string, collectBy: string } | null,
    blockingInfo: {
        reasonCode: "ALREADY_BORROWED" | "RESERVED_FOR_OTHER" | "COPY_UNAVAILABLE",
        message: string,
        currentBorrowerName: string | null,
        currentBorrowerAccountId: string | null,
        currentDueDate: string | null
    } | null
}

export function evaluateCopyForStudent(copy: CheckoutCopyEntity, studentAccountId: string): void // will replace by return type: CopyCheckoutDecision
{
    // The ONE allowed / blocked decision. checkCopyForCheckout shows it, issueBooks enforces it.
    //   state "Available"
    //       -> canAdd true,  badge "Available",  associatedHold null,  blockingInfo null
    //   state "Reserved" and copy.activeHold?.studentAccountId === studentAccountId
    //       -> canAdd true,  badge `Reserved for ${getFirstName(copy.activeHold.studentName)}`,
    //          associatedHold { _id, holdCode, collectBy } from copy.activeHold, blockingInfo null
    //   state "Borrowed" (copy.activeLoan)
    //       -> canAdd false, badge "Already borrowed", reasonCode "ALREADY_BORROWED",
    //          currentBorrowerName / currentBorrowerAccountId / currentDueDate from copy.activeLoan,
    //          message `${copyCode} is already borrowed — not added. ${book.title} · ${name} (${accountId}), due ${formatDisplayDate(dueDate)}. Enter a different copy ID.`
    //   state "Reserved" for another student (or activeHold is null: inconsistent data, treat as COPY_UNAVAILABLE)
    //       -> canAdd false, badge "Reserved for another student", reasonCode "RESERVED_FOR_OTHER", current* fields null
    //   state "Damaged" / "Lost"
    //       -> canAdd false, badge "Damaged" / "Lost", reasonCode "COPY_UNAVAILABLE", current* fields null
    // Always set `message` when blocked; wording of badges/messages is yours, agree it with the FE dev.
}


// ---------------------------------------------------------------- misc text and pagination

export function getIssueMessage(count: number, fullName: string, accountId: string): void // will replace by return type: string
{
    // `${count} ${pluralize(count, "book")} issued. Checkout confirmed for ${fullName} · ${accountId}`
}

export function getFulfilledHoldMessage(copyCode: string, firstName: string): void // will replace by return type: string
{
    // `${copyCode} was reserved for ${firstName}. Collection is confirmed; this copy is no longer held.`
}

export function getTotalPages(totalItem: number, limit: number): void // will replace by return type: number
{
    // Math.ceil(totalItem / limit). Decide with the FE dev what 0 rows gives: 0 or 1 (suggested: 0).
}
