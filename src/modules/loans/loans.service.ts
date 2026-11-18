import type {
    BorrowersRepository,
    LoanCopiesRepository,
    LoanHoldsRepository,
    LoansRepository
} from "./repositories/loans.repository.interface.js";

// import { ... } from "./loans.rules.js" and "./loans.dto.js" when you implement the bodies. The notes below name the function to call.

type ServiceError = Error & { code: string; details?: unknown };
function serviceError(code: string, message: string, details?: unknown): ServiceError {
    return Object.assign(new Error(message), { code, details });
}

// WHAT THIS FILE DOES (and does not do)
//   - Service  = orchestration: call repositories, call rules, THROW errors, build the DTO. Order of the checks lives here.
//   - Rules    (loans.rules.ts) = pure "is it allowed?" / "what is the text?" functions. No repository, no throw.
//   - DTO      (loans.dto.ts)   = describe the state to the client (derived fields, renames, trimming). Never throws.
//   - Repository = SQL only (filter, sort, paginate, join, transaction). Dates and timestamps arrive here as ISO strings.
//
// Rules of thumb for every method below
//   1. `const today = getToday();` ONCE at the top (when the method needs a date) and pass the same string to every rule / DTO.
//   2. The service throws only business errors with serviceError(CODE). The controller maps CODE -> HTTP status (handleLoanError).
//   3. userId / studentId (users.id) and accountId ("S10428") are different. loanId and borrowCode ("BR-2106") too.
//   4. A write method that returns null means "somebody changed the row between my check and the transaction": throw the same
//      business error as the check before it, do not return null to the controller.
//   5. Endpoints with a `message` return `{ message, data }`: the message comes from dto.getMessage(), the body from dto.toResponseObject().
//      The controller sends them as { success: true, message, data }. Others return the object, the controller sends { success: true, data }.

class LoansService {
    constructor(
        private readonly loansRepository: LoansRepository,
        private readonly borrowersRepository: BorrowersRepository,
        private readonly loanCopiesRepository: LoanCopiesRepository,
        private readonly loanHoldsRepository: LoanHoldsRepository
    ) {}

    // ------------------------------------------------------------------ staff: checkout

    public findStudentForCheckout(_accountId: string): void // will replace by return type: studentCheckoutProfile
    {
        // 1. const borrower = await this.borrowersRepository.getBorrowerWithStatsByAccountId(accountId)
        //    null -> throw serviceError("STUDENT_NOT_FOUND", ...)
        // 2. const readyHolds = await this.loanHoldsRepository.getReadyHoldsByStudentId(borrower._id)   (the _id, not the accountId)
        // 3. return new FindStudentForCheckoutResponseDto(borrower, readyHolds).toResponseObject()
        //
        // Do NOT throw when the student is not eligible (overdue, fines, limit reached): answer 200 with isEligible = false.
        // The DTO calls canBorrow / getRemainingLoanSpace / getCheckoutStatusBanner from loans.rules.ts.
    }

    public checkCopyForCheckout(_params: {
        copyCode: string;
        studentAccountId: string;
    }): void // will replace by return type: copyCheckoutCheck
    {
        // 1. const today = getToday()
        // 2. const copies = await this.loanCopiesRepository.getCopiesForCheckoutByCopyCodes([copyCode])
        //    copies[0] undefined -> throw serviceError("COPY_NOT_FOUND", ...)
        // 3. (optional) the student does not have to exist here: the check only compares accountId strings.
        //    If you want a 404 for a typo in studentAccountId, call this.borrowersRepository.getBorrowerWithStatsByAccountId and throw STUDENT_NOT_FOUND.
        // 4. return new CheckCopyForCheckoutResponseDto(copies[0], studentAccountId, today).toResponseObject()
        //
        // A blocked copy is still 200 (canAdd = false + blockingInfo). Only a missing copy is an error.
        // The DTO calls evaluateCopyForStudent() from loans.rules.ts: do not re-implement the decision here.
    }

    public issueBooks(_params: {
        studentAccountId: string;
        items: { copyCode: string; dueDate: string }[];
    }): void // will replace by return type: { message, data: issueTransactionReceipt }
    {
        // Check in this order, throw at the first failure (the order is part of the contract):
        // 1. const today = getToday()
        // 2. const copyCodes = items.map(i => i.copyCode)
        //    new Set(copyCodes).size !== copyCodes.length -> throw serviceError("DUPLICATE_COPY_IN_BATCH", ..., { duplicated codes })
        // 3. (optional, open decision) any item.dueDate < today -> throw serviceError("BAD_REQUEST", "Due date cannot be in the past")
        // 4. const borrower = await this.borrowersRepository.getBorrowerWithStatsByAccountId(studentAccountId)
        //    null -> throw STUDENT_NOT_FOUND
        // 5. hasBorrowingBlock(borrower) -> throw BORROWER_INELIGIBLE   (overdue loans / unpaid fines / inactive account)
        // 6. items.length > getRemainingLoanSpace(borrower) -> throw LOAN_LIMIT_EXCEEDED
        //      (same as activeLoansCount + items.length > maxLoansLimit. Keep it separate from step 5 so the client gets two codes.)
        // 7. const copies = await this.loanCopiesRepository.getCopiesForCheckoutByCopyCodes(copyCodes)
        //      a requested code that is not in `copies`                     -> throw COPY_NOT_FOUND (details: missing codes)
        //      evaluateCopyForStudent(copy, studentAccountId).canAdd false  -> collect the code, then ONE throw
        //                                                                      COPY_NOT_AVAILABLE_FOR_STUDENT (details: blocked codes + reasonCode)
        //    This is the same rule the counter screen showed (checkCopyForCheckout), so the two endpoints cannot disagree.
        // 8. const receipt = await this.loansRepository.issueLoans({ studentId: borrower._id, items })
        //    null -> throw COPY_NOT_AVAILABLE_FOR_STUDENT (a copy was taken between step 7 and the transaction)
        // 9. const dto = new IssueBooksResponseDto(receipt, borrower)
        //    return { message: dto.getMessage(), data: dto.toResponseObject() }
        //
        // Never loop over items calling a repository method per copy: issueLoans is ONE transaction (all or nothing).
    }

    // ------------------------------------------------------------------ staff: return

    public findActiveLoanByCopy(_copyCode: string): void // will replace by return type: activeLoanLookup
    {
        // 1. const today = getToday()
        // 2. const loan = await this.loansRepository.getActiveLoanWithDetailByCopyCode(copyCode)
        //    null -> throw serviceError("ACTIVE_LOAN_NOT_FOUND", ...)   (copy does not exist, or is not on loan: same answer)
        // 3. return new FindActiveLoanByCopyResponseDto(loan, today).toResponseObject()
        //
        // An overdue loan is NOT an error here: the DTO only shows it in isOverdue / timingBadge.
    }

    public returnBook(_params: {
        id: string; // loan _id or borrowCode
        condition: "Good" | "Damaged" | "Lost";
        conditionNote?: string | undefined;
    }): void // will replace by return type: { message, data: returnDetail }
    {
        // 1. const loan = await this.loansRepository.getLoanWithDetailByIdOrBorrowCode(id)
        //    null -> throw LOAN_NOT_FOUND
        // 2. loan.status !== "Active" -> throw LOAN_ALREADY_RETURNED
        // 3. const result = await this.loansRepository.returnLoan({ loanId: loan._id, condition, conditionNote })
        //      use loan._id, NOT the `id` argument (it may be a borrowCode). Pass conditionNote only when it is defined (exactOptionalPropertyTypes).
        //    null -> throw LOAN_ALREADY_RETURNED (returned between step 2 and the transaction)
        // 4. const dto = new ReturnBookResponseDto(result)
        //    return { message: dto.getMessage(), data: dto.toResponseObject() }
        //
        // An overdue return is allowed. No fine is created or settled here (there is no fines endpoint yet).
        // The copy's new state (Good -> Available, Damaged / Lost stay) is decided by the repository inside the transaction.
    }

    // ------------------------------------------------------------------ staff: records

    public getLoanRecords(_params: {
        tab?: "active" | "returned" | undefined;
        q?: string | undefined;
        status?: "all" | "overdue" | "due_soon" | "on_loan" | undefined;
        sortBy?: "dueDate" | "borrowedAt" | "returnedAt" | undefined;
        sortOrder?: "asc" | "desc" | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    }): void // will replace by return type: loanRecordsPage
    {
        // 1. const today = getToday()
        // 2. Defaults: tab "active", sortBy "dueDate", sortOrder "asc", page 1, limit 6.
        // 3. Conflicting filters (the contract is silent: pick one and note it):
        //      tab "returned"  -> ignore `status` (pass undefined): overdue / due_soon / on_loan only exist for active loans
        //      tab "active"    -> sortBy "returnedAt" makes no sense: fall back to "dueDate"
        //      status "all"    -> pass undefined to the repository
        //      q               -> pass undefined when it is empty after trim
        // 4. const records = await this.loansRepository.getLoanRecords({ tab, q, status, sortBy, sortOrder, page, limit })
        //      (all repository params are filled: the repository does NOT apply defaults)
        // 5. return new GetLoanRecordsResponseDto(records, page, limit, today).toResponseObject()
        //
        // Filtering, sorting and paging are SQL (repository). Never .filter() / .sort() / .slice() the result here.
        // The `due_soon` window (DUE_SOON_DAYS) is used by the SQL filter and by getLoanStatusBadge: keep them equal.
    }

    // ------------------------------------------------------------------ student

    public getMyBorrowing(_studentId: string): void // will replace by return type: myBorrowingDashboard. userId from the session, not accountId
    {
        // 1. const today = getToday()
        // 2. const borrower = await this.borrowersRepository.getBorrowerWithStatsById(studentId)
        //    null -> throw STUDENT_NOT_FOUND   (a valid session whose user was deleted)
        // 3. These three do not depend on each other: run them together
        //      const [currentLoans, readyHolds, borrowingHistory] = await Promise.all([
        //          this.loansRepository.getCurrentLoansWithDetailByStudentId(studentId),     // already ORDER BY due_date ASC
        //          this.loanHoldsRepository.getReadyHoldsByStudentId(studentId),
        //          this.loansRepository.getReturnedLoansWithDetailByStudentId(studentId)     // already ORDER BY returned_at DESC
        //      ])
        // 4. This one needs step 3 (the book ids of the current loans), so it runs after:
        //      const bookIdsWithReadyHold = await this.loanHoldsRepository.getBookIdsWithReadyHold(currentLoans.map(l => l.book._id))
        //      (one query for ALL loans, never one query per loan. Skip the call when currentLoans is empty.)
        // 5. return new GetMyBorrowingResponseDto(borrower, currentLoans, bookIdsWithReadyHold, readyHolds, borrowingHistory, today)
        //        .toResponseObject()
        //
        // canRenew / renewalStatusText / newDueDatePreview are computed in the DTO from getRenewalBlockReason() (loans.rules.ts):
        // the SAME function renewLoan uses below, so the Renew button and the API never disagree.
    }

    public renewLoan(_params: {
        id: string; // loan _id or borrowCode
        studentId: string; // userId from the session
    }): void // will replace by return type: { message, data: renewResult }
    {
        // 1. const today = getToday()
        // 2. const loan = await this.loansRepository.getLoanWithDetailByIdOrBorrowCode(id)
        //    null, or loan.borrower._id !== studentId -> throw LOAN_NOT_FOUND   (never reveal another student's loan with a 403)
        // 3. const borrower = await this.borrowersRepository.getBorrowerWithStatsById(studentId)
        //    null -> throw STUDENT_NOT_FOUND
        // 4. const bookIdsWithReadyHold = await this.loanHoldsRepository.getBookIdsWithReadyHold([loan.book._id])
        // 5. const reason = getRenewalBlockReason(loan, borrower, today, bookIdsWithReadyHold)
        //    reason !== null -> throw serviceError("RENEWAL_NOT_ELIGIBLE", ..., { reason })
        //      `reason` in details tells the client WHY (ALREADY_RENEWED / LOAN_OVERDUE / ACCOUNT_BLOCKED / HOLD_ON_TITLE / NOT_ACTIVE).
        // 6. const result = await this.loansRepository.renewLoan({ loanId: loan._id, extraDays: RENEWAL_EXTRA_DAYS })
        //    null -> throw RENEWAL_NOT_ELIGIBLE (renewed or returned between step 5 and the update)
        // 7. const dto = new RenewLoanResponseDto(result, today)
        //    return { message: dto.getMessage(), data: dto.toResponseObject() }
        //
        // OPEN DECISION: a Ready hold on the title blocks renewal in the dashboard (the Renew button is off). Using
        // getRenewalBlockReason here too makes renewLoan reject it as well (recommended, otherwise the API allows what the UI hides).
    }
}

export { LoansService };
