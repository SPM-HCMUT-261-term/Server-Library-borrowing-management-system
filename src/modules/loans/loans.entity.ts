// Entities = what the repository layer returns to the service layer.
// - Keep the SQL column aliases ("_id", "borrowCode", ...) and map them to these types in the repository.
// - Dates / timestamps are strings (SQL `::text`).
// - Derived fields (isOverdue, daysLeft, canRenew, badges, ...) are NOT here: loans.dto.ts computes them.

export type LoanStatus = "Active" | "Returned";
export type CopyState = "Available" | "Borrowed" | "Reserved" | "Damaged" | "Lost";
export type CopyCondition = "Good" | "Damaged" | "Lost";


// ---------------------------------------------------------------- borrower (users + counters)

// Which return by BorrowersRepository.getBorrowerWithStatsByAccountId / getBorrowerWithStatsById
export type BorrowerWithStatsEntity = {
    _id: string,
    accountId: string,
    fullName: string,
    initials: string, // not selected in SQL: the repository fills it with initialsFromName(fullName)
    yearGroup: string | null,
    status: "Active" | "Inactive",
    activeLoansCount: number,
    maxLoansLimit: number,
    overdueLoansCount: number,
    unpaidFines: number
}


// ---------------------------------------------------------------- loan with book / copy / borrower

export type LoanBookInfoEntity = {
    _id: string,
    title: string,
    author: string,
    coverImageUrl: string | null
}

export type LoanCopyInfoEntity = {
    _id: string,
    copyCode: string,
    condition: CopyCondition,
    homeLocation: string
}

export type LoanBorrowerInfoEntity = {
    _id: string,
    accountId: string,
    fullName: string,
    initials: string,
    yearGroup: string | null,
    activeLoansCount: number,
    maxLoansLimit: number
}

// Which return by getLoanWithDetailByIdOrBorrowCode, getActiveLoanWithDetailByCopyCode,
// getCurrentLoansWithDetailByStudentId, getReturnedLoansWithDetailByStudentId and getLoanRecords
export type LoanWithDetailEntity = {
    _id: string,
    borrowCode: string,
    status: LoanStatus,
    borrowedAt: string, // ISO date
    dueDate: string, // ISO date
    returnedAt: string | null, // null while Active
    returnCondition: CopyCondition | null, // null while Active
    renewalCount: number,
    book: LoanBookInfoEntity,
    copy: LoanCopyInfoEntity,
    borrower: LoanBorrowerInfoEntity
}

// Which return by LoansRepository.getLoanRecords
export type LoanRecordsResultEntity = {
    loans: LoanWithDetailEntity[],
    totalItem: number
}


// ---------------------------------------------------------------- checkout (copy lookup at the counter)

export type CheckoutActiveLoanEntity = {
    borrowCode: string,
    studentName: string,
    studentAccountId: string,
    dueDate: string
}

export type CheckoutActiveHoldEntity = {
    _id: string,
    holdCode: string,
    studentName: string,
    studentAccountId: string,
    collectBy: string
}

// Which return by LoanCopiesRepository.getCopiesForCheckoutByCopyCodes
export type CheckoutCopyEntity = {
    _id: string,
    copyCode: string,
    state: CopyState,
    condition: CopyCondition,
    homeLocation: string,
    book: LoanBookInfoEntity,
    activeLoan: CheckoutActiveLoanEntity | null, // set when state === "Borrowed"
    activeHold: CheckoutActiveHoldEntity | null // set when state === "Reserved"
}


// ---------------------------------------------------------------- ready holds (owned by the holds module, read here)

// Which return by LoanHoldsRepository.getReadyHoldsByStudentId
export type ReadyHoldEntity = {
    _id: string,
    holdCode: string,
    status: "Ready",
    requestedAt: string,
    collectBy: string,
    book: {
        _id: string,
        title: string,
        author: string,
        format: string,
        coverImageUrl: string | null
    },
    copy: {
        _id: string,
        copyCode: string,
        homeLocation: string
    } | null // holds.copy_id is nullable (ON DELETE SET NULL)
}


// ---------------------------------------------------------------- write results

export type IssuedLoanEntity = {
    _id: string,
    borrowCode: string,
    copyId: string,
    copyCode: string,
    book: LoanBookInfoEntity,
    borrowedAt: string,
    dueDate: string
}

export type FulfilledHoldEntity = {
    holdCode: string,
    copyCode: string
}

// Which return by LoansRepository.issueLoans
export type IssueLoansResultEntity = {
    issuedAt: string,
    borrowEntries: IssuedLoanEntity[],
    fulfilledHolds: FulfilledHoldEntity[],
    loansBefore: number,
    loansNow: number
}

// Which return by LoansRepository.returnLoan
export type ReturnLoanResultEntity = {
    _id: string,
    borrowCode: string,
    status: "Returned",
    borrowerAccountId: string,
    borrowerFullName: string,
    loansBefore: number,
    loansAfter: number,
    borrowedAt: string,
    dueDate: string,
    returnedAt: string,
    returnCondition: CopyCondition,
    conditionNote: string | null,
    copyCode: string,
    copyNewState: "Available" | "Damaged" | "Lost",
    copyHomeLocation: string
}

// Which return by LoansRepository.renewLoan
export type RenewLoanResultEntity = {
    _id: string,
    borrowCode: string,
    previousDueDate: string,
    newDueDate: string,
    renewalCount: number
}
