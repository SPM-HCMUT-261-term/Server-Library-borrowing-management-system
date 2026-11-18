import type {
    BorrowerWithStatsEntity,
    CheckoutCopyEntity,
    IssueLoansResultEntity,
    LoanRecordsResultEntity,
    LoanWithDetailEntity,
    ReadyHoldEntity,
    RenewLoanResultEntity,
    ReturnLoanResultEntity
} from "./loans.entity.js";

// A DTO takes the entities returned by the repository layer and builds the object sent to the client.
// Derived fields (isOverdue, daysLeft, canRenew, badges, ...) are computed here by CALLING the functions of loans.rules.ts.
// The DTO never throws, never calls a repository, never calls getToday(): `today` is passed in by the service.
//
// What a DTO does                                         What a DTO does NOT do
//   - rename   (overdueLoansCount -> overdueBooksCount)     - decide an error (the service throws)
//   - trim     (copy { _id, copyCode } only)                - write SQL / filter / sort / paginate
//   - derive   (daysLeft, isOverdue, badges, canRenew)      - re-implement a rule (call loans.rules.ts)
//   - add constants (pickupLocation)
//
// Every method is empty: replace `void` by the real return type when you implement it.
// Entity `_id` stays `_id` in the response. Dates stay ISO strings; only message text uses formatDisplayDate().
// Import from "./loans.rules.js" only the functions the body really calls (the notes name them).


/*
GET /staff/students/:accountId  ->  studentCheckoutProfile
{
  student:     { _id, accountId, fullName, initials, yearGroup },
  eligibility: { isEligible, activeLoansCount, maxLoansLimit, remainingLoanSpace, overdueBooksCount, unpaidFines, statusBanner },
  activeHolds: [{ holdCode, copyCode, bookTitle, collectBy }]
}
*/
export class FindStudentForCheckoutResponseDto {
    constructor(
        public student: BorrowerWithStatsEntity,
        public activeHolds: ReadyHoldEntity[]
    ) {}
    public toResponseObject(): void // will replace by return type
    {
        // 1. student      : copy _id, accountId, fullName, initials, yearGroup from this.student
        // 2. eligibility  :
        //      isEligible         = canBorrow(this.student)                     (rules)
        //      activeLoansCount, maxLoansLimit, unpaidFines : copy
        //      remainingLoanSpace = getRemainingLoanSpace(this.student)         (rules)
        //      overdueBooksCount  = this.student.overdueLoansCount              (RENAME)
        //      statusBanner       = getCheckoutStatusBanner(this.student)       (rules)
        // 3. activeHolds  : this.activeHolds.map -> { holdCode, copyCode: hold.copy?.copyCode ?? null, bookTitle: hold.book.title, collectBy }
        //      hold.copy is nullable (holds.copy_id ON DELETE SET NULL): either skip such a hold or return copyCode null (agree with FE).
    }
}


/*
GET /staff/copies/:copyCode/checkout-check?studentAccountId=...  ->  copyCheckoutCheck
{ copy: { _id, copyCode, state, condition, homeLocation }, book: { _id, title, author, coverImageUrl },
  canAdd, availabilityBadge, defaultDueDate, associatedHold: { _id, holdCode, collectBy } | null,
  blockingInfo: { reasonCode, message, currentBorrowerName, currentBorrowerAccountId, currentDueDate } | null }
*/
export class CheckCopyForCheckoutResponseDto {
    constructor(
        public copy: CheckoutCopyEntity,
        public studentAccountId: string,
        public today: string
    ) {}
    public toResponseObject(): void // will replace by return type
    {
        // 1. const decision = evaluateCopyForStudent(this.copy, this.studentAccountId)       (rules) <- the ONLY place that decides
        // 2. copy   : { _id, copyCode, state, condition, homeLocation } from this.copy
        //    book   : this.copy.book
        // 3. canAdd            = decision.canAdd
        //    availabilityBadge = decision.availabilityBadge
        //    associatedHold    = decision.associatedHold
        //    blockingInfo      = decision.blockingInfo
        // 4. defaultDueDate    = addDays(this.today, DEFAULT_LOAN_DAYS)                       (rules)   always, even when blocked
    }
}


/*
POST /staff/loans/issue  ->  message + issueTransactionReceipt
{ issuedAt, borrowEntries: [{ _id, borrowCode, copyCode, book, borrowedAt, dueDate }],
  fulfilledHolds: [{ holdCode, copyCode, message }],
  borrowerSummary: { studentId, accountId, fullName, yearGroup, loansBefore, loansNow, maxLoansLimit, remainingLoanSpace } }
*/
export class IssueBooksResponseDto {
    constructor(
        public receipt: IssueLoansResultEntity,
        public borrower: BorrowerWithStatsEntity
    ) {}
    public getMessage(): void // will replace by return type: string
    {
        // getIssueMessage(this.receipt.borrowEntries.length, this.borrower.fullName, this.borrower.accountId)      (rules)
        // The service puts it next to `data`: { message, data }.
    }
    public toResponseObject(): void // will replace by return type
    {
        // 1. issuedAt        : this.receipt.issuedAt (ISO timestamp)
        // 2. borrowEntries   : this.receipt.borrowEntries.map -> { _id, borrowCode, copyCode, book, borrowedAt, dueDate }
        //      borrowedAt is already the date part (the repository did it). Do not slice a string here.
        // 3. fulfilledHolds  : this.receipt.fulfilledHolds.map -> { holdCode, copyCode,
        //                        message: getFulfilledHoldMessage(hold.copyCode, getFirstName(this.borrower.fullName)) }     (rules)
        // 4. borrowerSummary : { studentId: this.borrower._id, accountId, fullName, yearGroup,
        //                        loansBefore: this.receipt.loansBefore, loansNow: this.receipt.loansNow, maxLoansLimit,
        //                        remainingLoanSpace: max(0, maxLoansLimit - loansNow) }
        //      this.borrower was read BEFORE the transaction, so take the counters from the receipt, not from this.borrower.
    }
}


/*
GET /staff/loans/active-by-copy/:copyCode  ->  activeLoanLookup
{ loan:     { _id, borrowCode, borrowedAt, dueDate, returningToday, isOverdue, timingBadge },
  copy:     { _id, copyCode, currentCondition, homeLocation },
  book:     { _id, title, author, coverImageUrl },
  borrower: { _id, accountId, fullName, initials, yearGroup, activeLoansBeforeReturn, activeLoansAfterReturn, maxLoansLimit } }
*/
export class FindActiveLoanByCopyResponseDto {
    constructor(
        public loan: LoanWithDetailEntity,
        public today: string
    ) {}
    public toResponseObject(): void // will replace by return type
    {
        // 1. loan     : { _id, borrowCode, borrowedAt, dueDate } copied;
        //               returningToday = this.today;
        //               isOverdue      = isLoanOverdue(this.loan, this.today)        (rules)
        //               timingBadge    = getTimingBadge(this.loan, this.today)       (rules)
        // 2. copy     : { _id, copyCode, homeLocation } copied;  currentCondition = this.loan.copy.condition   (RENAME)
        // 3. book     : this.loan.book
        // 4. borrower : { _id, accountId, fullName, initials, yearGroup, maxLoansLimit } copied;
        //               activeLoansBeforeReturn = this.loan.borrower.activeLoansCount
        //               activeLoansAfterReturn  = max(0, activeLoansBeforeReturn - 1)
    }
}


/*
POST /staff/loans/:id/return  ->  message + returnDetail
{ _id, borrowCode, status, borrower: { accountId, fullName, loansBefore, loansAfter }, borrowedAt, dueDate,
  returnedAt, returnCondition, conditionNote, copy: { copyCode, newState, homeLocation } }
*/
export class ReturnBookResponseDto {
    constructor(
        public result: ReturnLoanResultEntity
    ) {}
    public getMessage(): void // will replace by return type: string
    {
        // constant "Book return confirmed and saved in returned history."   (keep it in one MESSAGES object, or in loans.rules.ts)
    }
    public toResponseObject(): void // will replace by return type
    {
        // Almost a pure map of this.result; nothing to compute.
        // 1. { _id, borrowCode, status, borrowedAt, dueDate, returnedAt, returnCondition, conditionNote } copied
        // 2. borrower : { accountId: result.borrowerAccountId, fullName: result.borrowerFullName, loansBefore, loansAfter }
        // 3. copy     : { copyCode: result.copyCode, newState: result.copyNewState, homeLocation: result.copyHomeLocation }
        //      conditionNote is null when the client did not send one.
    }
}


/*
GET /staff/loans  ->  loanRecordsPage
{ items: [{ _id, borrowCode, status, book, copy: { _id, copyCode }, borrower: { _id, fullName, accountId },
            borrowedAt, dueDate, returnedAt, returnCondition, isOverdue, statusBadge }],
  pagination: { totalItems, currentPage, totalPages, limit } }
*/
export class GetLoanRecordsResponseDto {
    constructor(
        public records: LoanRecordsResultEntity,
        public page: number,
        public limit: number,
        public today: string
    ) {}
    public toResponseObject(): void // will replace by return type
    {
        // 1. items      : this.records.loans.map(loan => ({
        //                    _id, borrowCode, status, book: loan.book, borrowedAt, dueDate, returnedAt, returnCondition   copied,
        //                    copy:     { _id: loan.copy._id, copyCode: loan.copy.copyCode },                     (TRIM: drop condition / homeLocation)
        //                    borrower: { _id: loan.borrower._id, fullName: loan.borrower.fullName, accountId: loan.borrower.accountId },
        //                    isOverdue:   isLoanOverdue(loan, this.today),                                         (rules)
        //                    statusBadge: getLoanStatusBadge(loan, this.today)                                     (rules)
        //                 }))
        //      The order of the rows is the SQL ORDER BY: never sort here.
        // 2. pagination : { totalItems: this.records.totalItem, currentPage: this.page,
        //                   totalPages: getTotalPages(this.records.totalItem, this.limit), limit: this.limit }       (rules)
    }
}


/*
GET /me/borrowing  ->  myBorrowingDashboard
{ accountSummary: { canBorrow, statusText, activeLoansCount, maxLoansLimit, remainingLoanSpace, overdueBooksCount, unpaidFines },
  currentLoans:   [{ _id, borrowCode, copyCode, book, borrowedAt, dueDate, daysLeft, isOverdue, renewalCount, canRenew,
                     renewalStatusText, newDueDatePreview }],
  holdRequests:   [{ _id, holdCode, status, requestedAt, collectBy, pickupLocation, book, copy }],
  borrowingHistory: [{ _id, borrowCode, copyCode, book, borrowedAt, dueDate, returnedAt, returnCondition }] }
*/
export class GetMyBorrowingResponseDto {
    constructor(
        public borrower: BorrowerWithStatsEntity,
        public currentLoans: LoanWithDetailEntity[],
        public bookIdsWithReadyHold: string[],
        public readyHolds: ReadyHoldEntity[],
        public borrowingHistory: LoanWithDetailEntity[],
        public today: string
    ) {}
    public toResponseObject(): void // will replace by return type
    {
        // 1. accountSummary :
        //      canBorrow          = canBorrow(this.borrower)                         (rules)
        //      statusText         = getAccountStatusText(this.borrower)              (rules)
        //      remainingLoanSpace = getRemainingLoanSpace(this.borrower)             (rules)
        //      overdueBooksCount  = this.borrower.overdueLoansCount                  (RENAME)
        //      activeLoansCount, maxLoansLimit, unpaidFines : copy
        // 2. currentLoans : this.currentLoans.map(loan => {
        //      const reason = getRenewalBlockReason(loan, this.borrower, this.today, this.bookIdsWithReadyHold)   (rules)  ONE call per loan,
        //                     then canRenew, renewalStatusText and newDueDatePreview all come from this single `reason`.
        //      return {
        //        _id, borrowCode, book, borrowedAt, dueDate, renewalCount   copied,
        //        copyCode:          loan.copy.copyCode,                                  (FLATTEN)
        //        daysLeft:          getDaysLeft(loan, this.today),                       (rules)
        //        isOverdue:         isLoanOverdue(loan, this.today),                     (rules)
        //        canRenew:          canRenewLoan(reason),                                (rules)
        //        renewalStatusText: getRenewalStatusText(reason),                        (rules)
        //        newDueDatePreview: canRenewLoan(reason) ? addDays(loan.dueDate, RENEWAL_EXTRA_DAYS) : null   (rules)
        //      }
        //    })
        //    Keep the array order: it is already due_date ASC from SQL.
        // 3. holdRequests : this.readyHolds.map(h => ({ _id, holdCode, status, requestedAt, collectBy, book, copy   copied,
        //                      pickupLocation: PICKUP_LOCATION }))                      (constant, no column in `holds`; copy can be null)
        // 4. borrowingHistory : this.borrowingHistory.map(loan => ({ _id, borrowCode, copyCode: loan.copy.copyCode, book,
        //                      borrowedAt, dueDate, returnedAt, returnCondition }))    (map only; already returned_at DESC)
    }
}


/*
POST /loans/:id/renew  ->  message + data
{ _id, borrowCode, previousDueDate, newDueDate, daysLeft, renewalCount: 1, canRenew: false }
*/
export class RenewLoanResponseDto {
    constructor(
        public result: RenewLoanResultEntity,
        public today: string
    ) {}
    public getMessage(): void // will replace by return type: string
    {
        // `Loan renewed for ${RENEWAL_EXTRA_DAYS} days`    (rules constant, so the text follows the number)
    }
    public toResponseObject(): void // will replace by return type
    {
        // 1. { _id, borrowCode, previousDueDate, newDueDate, renewalCount } copied from this.result
        // 2. daysLeft = daysBetween(this.today, this.result.newDueDate)                (rules)
        // 3. canRenew = false   (the one allowed renewal is used: MAX_RENEWALS_PER_LOAN = 1)
        //      Do not re-run getRenewalBlockReason: the loan was just renewed, its answer is always "ALREADY_RENEWED".
    }
}


/*
Where each response field comes from (copy to a markdown file for easier reading)

| Field | Comes from |
| :--- | :--- |
| `_id`, `borrowCode`, `status`, `borrowedAt`, `dueDate`, `returnedAt`, `returnCondition`, `renewalCount` | entity, unchanged |
| `overdueBooksCount`, `currentCondition`, `copyCode` (in holds / loans lists) | entity, renamed or flattened |
| `daysLeft`, `isOverdue`, `timingBadge`, `statusBadge` | DTO -> rules: `getDaysLeft`, `isLoanOverdue`, `getTimingBadge`, `getLoanStatusBadge` |
| `canRenew`, `renewalStatusText`, `newDueDatePreview` | DTO -> rules: ONE `getRenewalBlockReason` then `canRenewLoan`, `getRenewalStatusText`, `addDays` |
| `remainingLoanSpace`, `isEligible`, `canBorrow`, `statusText`, `statusBanner` | DTO -> rules: `getRemainingLoanSpace`, `canBorrow`, `getAccountStatusText`, `getCheckoutStatusBanner` |
| `canAdd`, `availabilityBadge`, `blockingInfo`, `associatedHold` | DTO -> rules: `evaluateCopyForStudent` |
| `defaultDueDate` | DTO -> rules: `addDays(today, DEFAULT_LOAN_DAYS)` |
| `message` (issue / return / renew) | DTO `getMessage()` -> rules: `getIssueMessage`, constant, `RENEWAL_EXTRA_DAYS` |
| `fulfilledHolds[].message` | DTO -> rules: `getFulfilledHoldMessage` + `getFirstName` |
| `pagination.totalPages` | DTO -> rules: `getTotalPages` |
| `pickupLocation` | rules constant `PICKUP_LOCATION` |
| `loansBefore`, `loansNow`, `loansAfter`, `copy.newState` | repository (inside the transaction), the DTO only reports them |
*/
