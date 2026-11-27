import type {
    BorrowersRepository,
    LoanCopiesRepository,
    LoanHoldsRepository,
    LoansRepository
} from "./repositories/loans.repository.interface.js";

type ServiceError = Error & { code: string; details?: unknown };
function serviceError(code: string, message: string, details?: unknown): ServiceError {
    return Object.assign(new Error(message), { code, details });
}

// Business-rule constants (API contract section 1.4)
const DEFAULT_LOAN_DAYS = 14;
const RENEWAL_EXTRA_DAYS = 7;
const MAX_RENEWALS_PER_LOAN = 1;
const PICKUP_LOCATION = "Main library counter"; // no column in `holds`, so it is a constant
const SCHOOL_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DEFAULT_PAGE_LIMIT = 6;
const MAX_PAGE_LIMIT = 100;
const RETURN_MESSAGE = "Book return confirmed and saved in returned history.";

type RenewalBlockReason = "NOT_ACTIVE" | "ALREADY_RENEWED" | "LOAN_OVERDUE" | "ACCOUNT_BLOCKED" | "HOLD_ON_TITLE";
const RENEWAL_AVAILABLE_TEXT = "Renewal available · Not yet renewed · Nobody is waiting";
const RENEWAL_BLOCKED_TEXT: Record<RenewalBlockReason, string> = {
    NOT_ACTIVE: "Renewal unavailable · Loan is closed",
    ALREADY_RENEWED: "Renewal unavailable · Already renewed once",
    LOAN_OVERDUE: "Renewal unavailable · Overdue",
    ACCOUNT_BLOCKED: "Renewal unavailable · Account has overdue books or unpaid fines",
    HOLD_ON_TITLE: "Renewal unavailable · Another student is waiting"
};

// How to read each method
//   The `//` lines are the guide: steps, FILTERED OUT, INFERRED.
//   The `/* */` block is the hint code of the whole method body. It is pure code, copy it into the method.
//   Each method is independent: nothing is shared, a small helper is written inside the method that needs it.
//   When you copy a block: make the method `async`, and use the parameter names without the `_`.
//
// FILTERED OUT   fields of the entity that are NOT in the object of the response (grouped by the response key)
// INFERRED       fields of the response that are not copied as they are: computed, renamed (<-) or constant
//
// Old interface reminders
//   - `today` is the date in the school timezone. The old SQL uses CURRENT_DATE, so run once:
//       ALTER DATABASE <your_db> SET timezone TO 'Asia/Ho_Chi_Minh';
//   - The old SQL returns timestamps as text ("2026-11-20 16:10:00+07"). new Date(text).toISOString() reads it, that is how
//     the blocks make an ISO timestamp.

class LoansService {
    constructor(
        private readonly loansRepository: LoansRepository,
        private readonly borrowersRepository: BorrowersRepository,
        private readonly loanCopiesRepository: LoanCopiesRepository,
        private readonly loanHoldsRepository: LoanHoldsRepository
    ) { }

    // ------------------------------------------------------------------ staff: checkout

    public async findStudentForCheckout(accountId: string) // will replace by return type
    {
        // 1. get the borrower by accountId, none -> STUDENT_NOT_FOUND
        // 2. get the ready holds with borrower._id (the _id, not the accountId)
        // 3. a student who cannot borrow is still a 200 answer (isEligible false), do not throw
        //
        // FILTERED OUT
        //   student:       status, activeLoansCount, maxLoansLimit, overdueLoansCount, unpaidFines
        //   activeHolds[]: _id, status, requestedAt, book._id, book.author, book.format, book.coverImageUrl, copy._id, copy.homeLocation
        //
        // INFERRED
        //   eligibility.isEligible          false when inactive, overdueLoansCount > 0, unpaidFines > 0 or no loan space left
        //   eligibility.remainingLoanSpace  maxLoansLimit - activeLoansCount, not below 0
        //   eligibility.overdueBooksCount   <- overdueLoansCount
        //   eligibility.statusBanner        overdue part + fines part ("Account is inactive" first when inactive) + one closing sentence
        //   activeHolds[].copyCode          <- copy.copyCode, null when copy is null
        //   activeHolds[].bookTitle         <- book.title
        //   activeHolds[].collectBy         timestamp text -> ISO
        const borrower = await this.borrowersRepository.getBorrowerWithStatsByAccountId(accountId);
        if (!borrower) throw serviceError("STUDENT_NOT_FOUND", "Student account not found");
        const holds = await this.loanHoldsRepository.getReadyHoldsByStudentId(borrower._id);

        const remainingLoanSpace = Math.max(0, borrower.maxLoansLimit - borrower.activeLoansCount);
        const hasBlock = borrower.status !== "Active" || borrower.overdueLoansCount > 0 || borrower.unpaidFines > 0;
        const isEligible = !hasBlock && remainingLoanSpace > 0;

        const overdue = borrower.overdueLoansCount;
        const parts = [
            overdue === 0 ? "No overdue books" : `${overdue} overdue ${overdue === 1 ? "book" : "books"}`,
            borrower.unpaidFines === 0 ? "No unpaid fines" : `Unpaid fines: ${borrower.unpaidFines.toFixed(2)}`
        ];
        if (borrower.status !== "Active") parts.unshift("Account is inactive");
        let ending = "Loan limit reached.";
        if (isEligible) ending = `You can select up to ${remainingLoanSpace} additional ${remainingLoanSpace === 1 ? "copy" : "copies"}.`;
        else if (hasBlock) ending = "Checkout is blocked.";

        return {
            student: {
                _id: borrower._id,
                accountId: borrower.accountId,
                fullName: borrower.fullName,
                initials: borrower.initials,
                yearGroup: borrower.yearGroup
            },
            eligibility: {
                isEligible,
                activeLoansCount: borrower.activeLoansCount,
                maxLoansLimit: borrower.maxLoansLimit,
                remainingLoanSpace,
                overdueBooksCount: overdue,
                unpaidFines: borrower.unpaidFines,
                statusBanner: `${parts.join(" · ")}. ${ending}`
            },
            activeHolds: holds.map((hold) => ({
                holdCode: hold.holdCode,
                copyCode: hold.copy ? hold.copy.copyCode : null,
                bookTitle: hold.book.title,
                collectBy: new Date(hold.collectBy).toISOString()
            }))
        };
    }

    public async checkCopyForCheckout(params: {
        copyCode: string;
        studentAccountId: string;
    })// will replace by return type
    {
        // 1. get the copy by copyCode, none -> COPY_NOT_FOUND
        // 2. a blocked copy is still a 200 answer (canAdd false + blockingInfo), only a missing copy is an error
        // 3. the rule by copy state (issueBooks uses the same rule, keep the two in sync):
        //      Available                                       canAdd, "Available"
        //      Reserved and the hold owner is this student     canAdd, "Reserved for <first name>", associatedHold
        //      Reserved for another student                    blocked, RESERVED_FOR_OTHER
        //      Borrowed                                        blocked, ALREADY_BORROWED (even when this student is the borrower)
        //      Damaged, Lost, or Reserved / Borrowed with no hold / loan row (bad data)   blocked, COPY_UNAVAILABLE
        //
        // FILTERED OUT
        //   copy:  activeLoan, activeHold, book
        //
        // INFERRED
        //   canAdd, availabilityBadge   from the rule above
        //   associatedHold              only when reserved for this student, hold.collectBy timestamp text -> ISO
        //   blockingInfo                only when canAdd is false: reasonCode, message, and currentBorrower* / currentDueDate
        //                               (filled only for ALREADY_BORROWED, from activeLoan, else null)
        //   defaultDueDate              today + DEFAULT_LOAN_DAYS, returned even when the copy is blocked
        const { copyCode, studentAccountId } = params;
        const [copy] = await this.loanCopiesRepository.getCopiesForCheckoutByCopyCodes([copyCode]);
        if (!copy) throw serviceError("COPY_NOT_FOUND", "Physical copy not found");

        const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date());
        const due = new Date(`${today}T00:00:00Z`);
        due.setUTCDate(due.getUTCDate() + DEFAULT_LOAN_DAYS);
        const defaultDueDate = due.toISOString().slice(0, 10);

        const hold = copy.activeHold;
        const loan = copy.activeLoan;
        let canAdd = false;
        let availabilityBadge: string = copy.state;
        let associatedHold: { _id: string; holdCode: string; collectBy: string } | null = null;
        let blockingInfo: {
            reasonCode: "ALREADY_BORROWED" | "RESERVED_FOR_OTHER" | "COPY_UNAVAILABLE";
            message: string;
            currentBorrowerName: string | null;
            currentBorrowerAccountId: string | null;
            currentDueDate: string | null;
        } | null = null;

        if (copy.state === "Available") {
            canAdd = true;
            availabilityBadge = "Available";
        } else if (copy.state === "Reserved" && hold && hold.studentAccountId === studentAccountId) {
            canAdd = true;
            availabilityBadge = `Reserved for ${hold.studentName.trim().split(/\s+/)[0]}`;
            associatedHold = { _id: hold._id, holdCode: hold.holdCode, collectBy: new Date(hold.collectBy).toISOString() };
        } else if (copy.state === "Reserved" && hold) {
            availabilityBadge = "Reserved for another student";
            blockingInfo = {
                reasonCode: "RESERVED_FOR_OTHER",
                message: `${copy.copyCode} is reserved for another student — not added. ${copy.book.title}. Enter a different copy ID.`,
                currentBorrowerName: null,
                currentBorrowerAccountId: null,
                currentDueDate: null
            };
        } else if (copy.state === "Borrowed" && loan) {
            const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
            const dueText = `${Number(loan.dueDate.slice(8, 10))} ${months[Number(loan.dueDate.slice(5, 7)) - 1]} ${loan.dueDate.slice(0, 4)}`;
            availabilityBadge = "Already borrowed";
            blockingInfo = {
                reasonCode: "ALREADY_BORROWED",
                message: `${copy.copyCode} is already borrowed — not added. ${copy.book.title} · ${loan.studentName} (${loan.studentAccountId}), due ${dueText}. Enter a different copy ID.`,
                currentBorrowerName: loan.studentName,
                currentBorrowerAccountId: loan.studentAccountId,
                currentDueDate: loan.dueDate
            };
        } else {
            availabilityBadge = copy.state === "Damaged" || copy.state === "Lost" ? copy.state : "Unavailable";
            blockingInfo = {
                reasonCode: "COPY_UNAVAILABLE",
                message: `${copy.copyCode} is not available — not added. Enter a different copy ID.`,
                currentBorrowerName: null,
                currentBorrowerAccountId: null,
                currentDueDate: null
            };
        }

        return {
            copy: {
                _id: copy._id,
                copyCode: copy.copyCode,
                state: copy.state,
                condition: copy.condition,
                homeLocation: copy.homeLocation
            },
            book: copy.book,
            canAdd,
            availabilityBadge,
            defaultDueDate,
            associatedHold,
            blockingInfo
        };
    }

    public async issueBooks(params: {
        studentAccountId: string;
        items: { copyCode: string; dueDate: string }[];
    }) // will replace by return type
    {
        // Check in this order, throw at the first failure:
        //   1. the same copyCode twice in items                         DUPLICATE_COPY_IN_BATCH
        //   2. borrower not found                                       STUDENT_NOT_FOUND
        //   3. borrower inactive, has overdue loans or unpaid fines     BORROWER_INELIGIBLE
        //   4. items.length is more than the remaining loan space       LOAN_LIMIT_EXCEEDED
        //   5. a requested code is not found                            COPY_NOT_FOUND
        //   6. a copy is not Available and not Reserved for this student COPY_NOT_AVAILABLE_FOR_STUDENT (same rule as checkCopyForCheckout)
        //   7. issueLoans returns null (a copy was taken in between)    COPY_NOT_AVAILABLE_FOR_STUDENT
        // Optional, the contract is silent: an item.dueDate before today -> BAD_REQUEST. Decide with the FE dev.
        // issueLoans is ONE transaction for all items, never call it once per copy.
        //
        // FILTERED OUT
        //   borrowEntries[]:  copyId
        //   borrowerSummary:  initials, status, activeLoansCount, overdueLoansCount, unpaidFines
        //
        // INFERRED
        //   message                              "<n> book(s) issued. Checkout confirmed for <fullName> · <accountId>", n = borrowEntries.length
        //                                        (accountId, NOT the numeric users.id)
        //   issuedAt                             timestamp text -> ISO
        //   fulfilledHolds[].message             uses the borrower's first name. The list comes from the repository, NOT from items
        //   borrowerSummary.studentId            <- borrower._id
        //   borrowerSummary.loansBefore / loansNow  <- receipt
        //   borrowerSummary.remainingLoanSpace   maxLoansLimit - loansNow, not below 0
        const { studentAccountId, items } = params;
        const copyCodes = items.map((item) => item.copyCode);
        if (new Set(copyCodes).size !== copyCodes.length) {
            throw serviceError("DUPLICATE_COPY_IN_BATCH", "The same copy appears more than once in this checkout");
        }

        const borrower = await this.borrowersRepository.getBorrowerWithStatsByAccountId(studentAccountId);
        if (!borrower) throw serviceError("STUDENT_NOT_FOUND", "Student account not found");
        const hasBlock = borrower.status !== "Active" || borrower.overdueLoansCount > 0 || borrower.unpaidFines > 0;
        if (hasBlock) throw serviceError("BORROWER_INELIGIBLE", "Student has overdue books, unpaid fines or an inactive account");
        if (items.length > Math.max(0, borrower.maxLoansLimit - borrower.activeLoansCount)) {
            throw serviceError("LOAN_LIMIT_EXCEEDED", "This checkout would exceed the student's loan limit");
        }

        const copies = await this.loanCopiesRepository.getCopiesForCheckoutByCopyCodes(copyCodes);
        const foundCodes = new Set(copies.map((copy) => copy.copyCode));
        const missingCodes = copyCodes.filter((code) => !foundCodes.has(code));
        if (missingCodes.length > 0) throw serviceError("COPY_NOT_FOUND", "Physical copy not found", { copyCodes: missingCodes });
        const blockedCopies = copies.filter(
            (copy) => !(copy.state === "Available" || (copy.state === "Reserved" && copy.activeHold?.studentAccountId === studentAccountId))
        );
        if (blockedCopies.length > 0) {
            throw serviceError("COPY_NOT_AVAILABLE_FOR_STUDENT", "Some copies cannot be issued to this student", {
                copies: blockedCopies.map((copy) => ({ copyCode: copy.copyCode, state: copy.state }))
            });
        }

        const receipt = await this.loansRepository.issueLoans({ studentId: borrower._id, items });
        if (!receipt) throw serviceError("COPY_NOT_AVAILABLE_FOR_STUDENT", "A copy was taken while this checkout was being saved");

        const count = receipt.borrowEntries.length;
        const firstName = borrower.fullName.trim().split(/\s+/)[0];
        return {
            message: `${count} ${count === 1 ? "book" : "books"} issued. Checkout confirmed for ${borrower.fullName} · ${borrower.accountId}`,
            data: {
                issuedAt: new Date(receipt.issuedAt).toISOString(),
                borrowEntries: receipt.borrowEntries.map((entry) => ({
                    _id: entry._id,
                    borrowCode: entry.borrowCode,
                    copyCode: entry.copyCode,
                    book: entry.book,
                    borrowedAt: entry.borrowedAt,
                    dueDate: entry.dueDate
                })),
                fulfilledHolds: receipt.fulfilledHolds.map((hold) => ({
                    holdCode: hold.holdCode,
                    copyCode: hold.copyCode,
                    message: `${hold.copyCode} was reserved for ${firstName}. Collection is confirmed; this copy is no longer held.`
                })),
                borrowerSummary: {
                    studentId: borrower._id,
                    accountId: borrower.accountId,
                    fullName: borrower.fullName,
                    yearGroup: borrower.yearGroup,
                    loansBefore: receipt.loansBefore,
                    loansNow: receipt.loansNow,
                    maxLoansLimit: borrower.maxLoansLimit,
                    remainingLoanSpace: Math.max(0, borrower.maxLoansLimit - receipt.loansNow)
                }
            }
        };
    }

    // ------------------------------------------------------------------ staff: return

    public async findActiveLoanByCopy(copyCode: string)// will replace by return type
    {
        // 1. get the active loan by copyCode, none -> ACTIVE_LOAN_NOT_FOUND (the copy does not exist or is not on loan: same answer)
        // 2. an overdue loan is NOT an error here, it only shows in isOverdue / timingBadge
        // 3. compare DATES (dueDate with today), not timestamps. Due today is "On time", overdue means dueDate < today
        //
        // FILTERED OUT
        //   loan:      status, returnedAt, returnCondition, renewalCount
        //   copy:      condition
        //   borrower:  activeLoansCount
        //
        // INFERRED
        //   loan.returningToday                     today
        //   loan.isOverdue                          dueDate < today
        //   loan.timingBadge                        overdue: "Overdue · <n> day(s)", n = today - dueDate; else "On time"
        //   copy.currentCondition                   <- copy.condition
        //   borrower.activeLoansBeforeReturn        <- borrower.activeLoansCount
        //   borrower.activeLoansAfterReturn         activeLoansCount - 1, not below 0
        const loan = await this.loansRepository.getActiveLoanWithDetailByCopyCode(copyCode);
        if (!loan) throw serviceError("ACTIVE_LOAN_NOT_FOUND", "This copy does not have an active loan");

        const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date());
        const daysLeft = Math.round((Date.parse(`${loan.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
        const isOverdue = daysLeft < 0;
        const overdueDays = -daysLeft;

        return {
            loan: {
                _id: loan._id,
                borrowCode: loan.borrowCode,
                borrowedAt: loan.borrowedAt,
                dueDate: loan.dueDate,
                returningToday: today,
                isOverdue,
                timingBadge: isOverdue ? `Overdue · ${overdueDays} ${overdueDays === 1 ? "day" : "days"}` : "On time"
            },
            copy: {
                _id: loan.copy._id,
                copyCode: loan.copy.copyCode,
                currentCondition: loan.copy.condition,
                homeLocation: loan.copy.homeLocation
            },
            book: loan.book,
            borrower: {
                _id: loan.borrower._id,
                accountId: loan.borrower.accountId,
                fullName: loan.borrower.fullName,
                initials: loan.borrower.initials,
                yearGroup: loan.borrower.yearGroup,
                activeLoansBeforeReturn: loan.borrower.activeLoansCount,
                activeLoansAfterReturn: Math.max(0, loan.borrower.activeLoansCount - 1),
                maxLoansLimit: loan.borrower.maxLoansLimit
            }
        };
    }

    public async returnBook(params: {
        id: string; // loan _id or borrowCode
        condition: "Good" | "Damaged" | "Lost";
        conditionNote?: string | undefined;
    }) // will replace by return type
    {
        // 1. get the loan by id or borrowCode, none -> LOAN_NOT_FOUND
        // 2. loan.status is "Returned" -> LOAN_ALREADY_RETURNED
        // 3. returnLoan with loan._id (NOT the `id` argument, it may be a borrowCode), null -> LOAN_ALREADY_RETURNED
        // 4. an overdue return is allowed. No fine is created or settled here
        //
        // FILTERED OUT
        //   nothing: the result entity is the response
        //
        // INFERRED
        //   message                  constant RETURN_MESSAGE
        //   borrower.accountId       <- borrowerAccountId
        //   borrower.fullName        <- borrowerFullName
        //   borrower.loansBefore / loansAfter   <- loansBefore / loansAfter
        //   copy.copyCode            <- copyCode
        //   copy.newState            <- copyNewState
        //   copy.homeLocation        <- copyHomeLocation
        //   returnedAt               timestamp text -> ISO
        const { id, condition, conditionNote } = params;
        const loan = await this.loansRepository.getLoanWithDetailByIdOrBorrowCode(id);
        if (!loan) throw serviceError("LOAN_NOT_FOUND", "Loan not found");
        if (loan.status === "Returned") throw serviceError("LOAN_ALREADY_RETURNED", "This loan was already returned");

        const result = await this.loansRepository.returnLoan({ loanId: loan._id, condition, conditionNote });
        if (!result) throw serviceError("LOAN_ALREADY_RETURNED", "This loan was already returned");

        return {
            message: RETURN_MESSAGE,
            data: {
                _id: result._id,
                borrowCode: result.borrowCode,
                status: result.status,
                borrower: {
                    accountId: result.borrowerAccountId,
                    fullName: result.borrowerFullName,
                    loansBefore: result.loansBefore,
                    loansAfter: result.loansAfter
                },
                borrowedAt: result.borrowedAt,
                dueDate: result.dueDate,
                returnedAt: new Date(result.returnedAt).toISOString(),
                returnCondition: result.returnCondition,
                conditionNote: result.conditionNote,
                copy: {
                    copyCode: result.copyCode,
                    newState: result.copyNewState,
                    homeLocation: result.copyHomeLocation
                }
            }
        };
    }

    // ------------------------------------------------------------------ staff: records

    public async getLoanRecords(params: {
        tab?: "active" | "returned" | undefined;
        q?: string | undefined;
        status?: "all" | "overdue" | "due_soon" | "on_loan" | undefined;
        sortBy?: "dueDate" | "borrowedAt" | "returnedAt" | undefined;
        sortOrder?: "asc" | "desc" | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    })// will replace by return type
    {
        // 1. defaults: tab "active", sortBy "dueDate", sortOrder "asc", page 1, limit DEFAULT_PAGE_LIMIT (never above MAX_PAGE_LIMIT)
        // 2. conflicts: status is only for the active tab, status "all" and an empty q are passed as undefined,
        //    sortBy "returnedAt" on the active tab falls back to "dueDate"
        // 3. the repository applies NO defaults, pass every field. Filter, sort and paging are SQL, never .filter() / .sort() here
        // 4. add .max(100) to `limit` in getLoanRecordsQuerySchema (controller), MAX_PAGE_LIMIT is the second guard
        //
        // FILTERED OUT
        //   items[]:           renewalCount
        //   items[].copy:      condition, homeLocation
        //   items[].borrower:  initials, yearGroup, activeLoansCount, maxLoansLimit
        //
        // INFERRED
        //   items[].isOverdue       status "Active" and dueDate < today (a Returned loan is never overdue)
        //   items[].statusBadge     first match wins: "Returned", "Overdue · <n> day(s)", "Due tomorrow", "On loan"
        //   items[].returnedAt      timestamp text -> ISO, null stays null
        //   pagination.totalItems   <- totalItem
        //   pagination.currentPage  page
        //   pagination.totalPages   ceil(totalItem / limit), 0 rows gives 0 (ask the FE dev if it must be 1)
        // Open: a loan due today shows "On loan" (add "Due today" if the FE dev wants it).
        // Open: the old SQL `due_soon` is today..today+2 but the badge only says "Due tomorrow": change the SQL `+ 2` to `+ 1`.
        const tab = params.tab ?? "active";
        const page = params.page ?? 1;
        const limit = Math.min(params.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
        const sortOrder = params.sortOrder ?? "asc";
        const q = params.q ? params.q : undefined;
        const status = tab === "active" && params.status && params.status !== "all" ? params.status : undefined;
        const sortBy = tab === "active" && params.sortBy === "returnedAt" ? "dueDate" : (params.sortBy ?? "dueDate");

        const records = await this.loansRepository.getLoanRecords({ tab, q, status, sortBy, sortOrder, page, limit });

        const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date());
        const items = records.loans.map((loan) => {
            const daysLeft = Math.round((Date.parse(`${loan.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
            const isOverdue = loan.status === "Active" && daysLeft < 0;
            let statusBadge = "On loan";
            if (loan.status === "Returned") statusBadge = "Returned";
            else if (isOverdue) statusBadge = `Overdue · ${-daysLeft} ${-daysLeft === 1 ? "day" : "days"}`;
            else if (daysLeft === 1) statusBadge = "Due tomorrow";

            return {
                _id: loan._id,
                borrowCode: loan.borrowCode,
                status: loan.status,
                book: loan.book,
                copy: { _id: loan.copy._id, copyCode: loan.copy.copyCode },
                borrower: { _id: loan.borrower._id, fullName: loan.borrower.fullName, accountId: loan.borrower.accountId },
                borrowedAt: loan.borrowedAt,
                dueDate: loan.dueDate,
                returnedAt: loan.returnedAt === null ? null : new Date(loan.returnedAt).toISOString(),
                returnCondition: loan.returnCondition,
                isOverdue,
                statusBadge
            };
        });

        return {
            items,
            pagination: {
                totalItems: records.totalItem,
                currentPage: page,
                totalPages: Math.ceil(records.totalItem / limit),
                limit
            }
        };
    }

    // ------------------------------------------------------------------ student

    public async getMyBorrowing(studentId: string)// userId from the session, not accountId
    {
        // 1. get the borrower by id, none -> STUDENT_NOT_FOUND
        // 2. these three do not depend on each other, run them together with Promise.all:
        //    current loans (already due_date ASC), ready holds, returned loans (already returned_at DESC)
        // 3. then the book ids with a ready hold, for ALL current loans in one call (skip the call when there is no loan)
        // 4. canRenew, renewalStatusText and newDueDatePreview all come from ONE `reason` per loan, so they never disagree.
        //    renewLoan uses the same reason order: keep the two in sync.
        //      reason order: not Active, renewed once already, loan overdue, account blocked, a hold on the title
        //
        // FILTERED OUT
        //   accountSummary:     _id, accountId, fullName, initials, yearGroup, status
        //   currentLoans[]:     status, returnedAt, returnCondition, borrower, copy._id, copy.condition, copy.homeLocation
        //   borrowingHistory[]: status, renewalCount, borrower, copy._id, copy.condition, copy.homeLocation
        //
        // INFERRED
        //   accountSummary.canBorrow            active account, no overdue, no unpaid fines, loan space left
        //   accountSummary.statusText           first match wins: inactive, overdue, unpaid fines, limit reached, "You can borrow"
        //   accountSummary.remainingLoanSpace   maxLoansLimit - activeLoansCount, not below 0
        //   accountSummary.overdueBooksCount    <- overdueLoansCount
        //   currentLoans[].copyCode             <- copy.copyCode
        //   currentLoans[].daysLeft             dueDate - today
        //   currentLoans[].isOverdue            daysLeft < 0
        //   currentLoans[].canRenew             reason is null
        //   currentLoans[].renewalStatusText    RENEWAL_AVAILABLE_TEXT, or RENEWAL_BLOCKED_TEXT[reason]
        //   currentLoans[].newDueDatePreview    canRenew ? dueDate + RENEWAL_EXTRA_DAYS : null
        //   holdRequests[].pickupLocation       constant PICKUP_LOCATION
        //   holdRequests[].requestedAt / collectBy   timestamp text -> ISO
        //   borrowingHistory[].copyCode         <- copy.copyCode
        //   borrowingHistory[].returnedAt       timestamp text -> ISO
        const borrower = await this.borrowersRepository.getBorrowerWithStatsById(studentId);
        if (!borrower) throw serviceError("STUDENT_NOT_FOUND", "Student account not found");

        const [currentLoans, readyHolds, borrowingHistory] = await Promise.all([
            this.loansRepository.getCurrentLoansWithDetailByStudentId(studentId),
            this.loanHoldsRepository.getReadyHoldsByStudentId(studentId),
            this.loansRepository.getReturnedLoansWithDetailByStudentId(studentId)
        ]);
        const bookIdsWithReadyHold =
            currentLoans.length === 0
                ? []
                : await this.loanHoldsRepository.getBookIdsWithReadyHold(currentLoans.map((loan) => loan.book._id));

        const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date());
        const remainingLoanSpace = Math.max(0, borrower.maxLoansLimit - borrower.activeLoansCount);
        const accountHasBlock = borrower.status !== "Active" || borrower.overdueLoansCount > 0 || borrower.unpaidFines > 0;

        let statusText = "You can borrow";
        if (borrower.status !== "Active") statusText = "Your account is inactive";
        else if (borrower.overdueLoansCount > 0) statusText = "You have overdue books";
        else if (borrower.unpaidFines > 0) statusText = "You have unpaid fines";
        else if (remainingLoanSpace === 0) statusText = "Loan limit reached";

        return {
            accountSummary: {
                canBorrow: !accountHasBlock && remainingLoanSpace > 0,
                statusText,
                activeLoansCount: borrower.activeLoansCount,
                maxLoansLimit: borrower.maxLoansLimit,
                remainingLoanSpace,
                overdueBooksCount: borrower.overdueLoansCount,
                unpaidFines: borrower.unpaidFines
            },
            currentLoans: currentLoans.map((loan) => {
                const daysLeft = Math.round((Date.parse(`${loan.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
                let reason: RenewalBlockReason | null = null;
                if (loan.status !== "Active") reason = "NOT_ACTIVE";
                else if (loan.renewalCount >= MAX_RENEWALS_PER_LOAN) reason = "ALREADY_RENEWED";
                else if (daysLeft < 0) reason = "LOAN_OVERDUE";
                else if (accountHasBlock) reason = "ACCOUNT_BLOCKED";
                else if (bookIdsWithReadyHold.includes(loan.book._id)) reason = "HOLD_ON_TITLE";

                const preview = new Date(`${loan.dueDate}T00:00:00Z`);
                preview.setUTCDate(preview.getUTCDate() + RENEWAL_EXTRA_DAYS);

                return {
                    _id: loan._id,
                    borrowCode: loan.borrowCode,
                    copyCode: loan.copy.copyCode,
                    book: loan.book,
                    borrowedAt: loan.borrowedAt,
                    dueDate: loan.dueDate,
                    daysLeft,
                    isOverdue: daysLeft < 0,
                    renewalCount: loan.renewalCount,
                    canRenew: reason === null,
                    renewalStatusText: reason === null ? RENEWAL_AVAILABLE_TEXT : RENEWAL_BLOCKED_TEXT[reason],
                    newDueDatePreview: reason === null ? preview.toISOString().slice(0, 10) : null
                };
            }),
            holdRequests: readyHolds.map((hold) => ({
                _id: hold._id,
                holdCode: hold.holdCode,
                status: hold.status,
                requestedAt: new Date(hold.requestedAt).toISOString(),
                collectBy: new Date(hold.collectBy).toISOString(),
                pickupLocation: PICKUP_LOCATION,
                book: hold.book,
                copy: hold.copy
            })),
            borrowingHistory: borrowingHistory.map((loan) => ({
                _id: loan._id,
                borrowCode: loan.borrowCode,
                copyCode: loan.copy.copyCode,
                book: loan.book,
                borrowedAt: loan.borrowedAt,
                dueDate: loan.dueDate,
                returnedAt: loan.returnedAt === null ? null : new Date(loan.returnedAt).toISOString(),
                returnCondition: loan.returnCondition
            }))
        };
    }

    public async renewLoan(params: {
        id: string; // loan _id or borrowCode
        studentId: string; // userId from the session
    }) // will replace by return type
    {
        // 1. get the loan by id or borrowCode. None, or loan.borrower._id !== studentId -> LOAN_NOT_FOUND
        //    (never answer 403 for another student's loan, that would reveal it exists)
        // 2. get the borrower by studentId (none -> STUDENT_NOT_FOUND), and the book ids with a ready hold for this one book
        // 3. find the `reason` (same order as getMyBorrowing: keep the two in sync):
        //    not Active, renewed once already, loan overdue, account blocked, a hold on the title.
        //    The hold check is added because the dashboard hides the Renew button then: the API must refuse too.
        //    Not null -> RENEWAL_NOT_ELIGIBLE, put the reason in details
        // 4. renewLoan with loan._id and RENEWAL_EXTRA_DAYS, null -> RENEWAL_NOT_ELIGIBLE (renewed or returned in between)
        //
        // FILTERED OUT
        //   nothing: the result entity is the response
        //
        // INFERRED
        //   message     "Loan renewed for <RENEWAL_EXTRA_DAYS> days"
        //   daysLeft    newDueDate - today
        //   canRenew    false, the one allowed renewal is used (do not compute the reason again)
        const { id, studentId } = params;
        const loan = await this.loansRepository.getLoanWithDetailByIdOrBorrowCode(id);
        if (!loan || loan.borrower._id !== studentId) throw serviceError("LOAN_NOT_FOUND", "Loan not found");

        const borrower = await this.borrowersRepository.getBorrowerWithStatsById(studentId);
        if (!borrower) throw serviceError("STUDENT_NOT_FOUND", "Student account not found");
        const bookIdsWithReadyHold = await this.loanHoldsRepository.getBookIdsWithReadyHold([loan.book._id]);

        const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date());
        const daysLeftBefore = Math.round((Date.parse(`${loan.dueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
        const accountHasBlock = borrower.status !== "Active" || borrower.overdueLoansCount > 0 || borrower.unpaidFines > 0;
        let reason: RenewalBlockReason | null = null;
        if (loan.status !== "Active") reason = "NOT_ACTIVE";
        else if (loan.renewalCount >= MAX_RENEWALS_PER_LOAN) reason = "ALREADY_RENEWED";
        else if (daysLeftBefore < 0) reason = "LOAN_OVERDUE";
        else if (accountHasBlock) reason = "ACCOUNT_BLOCKED";
        else if (bookIdsWithReadyHold.includes(loan.book._id)) reason = "HOLD_ON_TITLE";
        if (reason !== null) throw serviceError("RENEWAL_NOT_ELIGIBLE", RENEWAL_BLOCKED_TEXT[reason], { reason });

        const result = await this.loansRepository.renewLoan({ loanId: loan._id, extraDays: RENEWAL_EXTRA_DAYS });
        if (!result) throw serviceError("RENEWAL_NOT_ELIGIBLE", "This loan was renewed or returned in the meantime");

        return {
            message: `Loan renewed for ${RENEWAL_EXTRA_DAYS} days`,
            data: {
                _id: result._id,
                borrowCode: result.borrowCode,
                previousDueDate: result.previousDueDate,
                newDueDate: result.newDueDate,
                daysLeft: Math.round((Date.parse(`${result.newDueDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000),
                renewalCount: result.renewalCount,
                canRenew: false
            }
        };
    }
}

export { LoansService };