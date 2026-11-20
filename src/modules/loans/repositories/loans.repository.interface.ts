import type {
    BorrowerWithStatsEntity,
    CheckoutCopyEntity,
    IssueLoansResultEntity,
    LoanRecordsResultEntity,
    LoanWithDetailEntity,
    ReadyHoldEntity,
    RenewLoanResultEntity,
    ReturnLoanResultEntity
} from "../loans.entity.js";

// One interface per table (same idea as BooksRepository / PhysicalCopiesRepository).
// Keep the name of columns in query result, then map to entity to return to service layer for easier to read code.
// Every SQL hint below was run against the project schema on PostgreSQL 16 (seed data, with bind parameters).
// "Today" in the hints is CURRENT_DATE, the same as admin.repository.ts, so overdue means the same thing everywhere.


export interface BorrowersRepository {
    // Read-only view of `users` for loan rules. Users themselves are written by the auth / admin modules.
    // Query methods
    getBorrowerWithStatsByAccountId(accountId: string): Promise<BorrowerWithStatsEntity | null>;
    // accountId is the school id, e.g. "S10428". Only role = 'student'. Null if not found.

    getBorrowerWithStatsById(userId: string): Promise<BorrowerWithStatsEntity | null>;
    // userId, not accountId. Same query, `WHERE u.id = $1::int`.

// sql hints from claude AI. initials is not selected: fill it with initialsFromName(fullName) in the repository.
/*
SELECT
  u.id::text                  AS "_id",
  u.account_id                AS "accountId",
  u.full_name                 AS "fullName",
  u.year_group                AS "yearGroup",
  u.status                    AS "status",
  (SELECT COUNT(*)::int FROM loans l
    WHERE l.student_id = u.id AND l.status = 'Active')                                   AS "activeLoansCount",
  u.max_loans_limit           AS "maxLoansLimit",
  (SELECT COUNT(*)::int FROM loans l
    WHERE l.student_id = u.id AND l.status = 'Active' AND l.due_date < CURRENT_DATE)     AS "overdueLoansCount",
  COALESCE((SELECT SUM(f.amount) FROM fines f
    WHERE f.student_id = u.id AND f.status = 'Unpaid'), 0)::float8                       AS "unpaidFines"
FROM users u
WHERE u.role = 'student' AND u.account_id = $1;
*/
}


export interface LoansRepository {
    // Query methods
    getLoanWithDetailByIdOrBorrowCode(idOrBorrowCode: string): Promise<LoanWithDetailEntity | null>;
    // idOrBorrowCode means it is either loan _id or borrowCode ("BR-2106"). Any status.

    getActiveLoanWithDetailByCopyCode(copyCode: string): Promise<LoanWithDetailEntity | null>;
    // Null if the copy does not exist or is not on loan.

    getCurrentLoansWithDetailByStudentId(studentId: string): Promise<LoanWithDetailEntity[]>;
    // userId, not accountId. Active loans, already sorted by due_date ASC (ORDER BY in SQL, not in the service).

    getReturnedLoansWithDetailByStudentId(studentId: string): Promise<LoanWithDetailEntity[]>;
    // userId, not accountId. Returned loans, already sorted by returned_at DESC.

    getLoanRecords(params: {
        tab: "active" | "returned";
        q?: string | undefined; // student name, accountId, copyCode, borrowCode, book title
        status?: "overdue" | "due_soon" | "on_loan" | undefined; // only for tab "active". undefined = all
        sortBy: "dueDate" | "borrowedAt" | "returnedAt";
        sortOrder: "asc" | "desc";
        page: number;
        limit: number;
    }): Promise<LoanRecordsResultEntity>;
    // Filtered, sorted and paginated in SQL. totalItem = rows before LIMIT (COUNT(*) OVER()).

// sql hints from claude AI. One SELECT shared by all the "WithDetail" methods, only the WHERE / ORDER BY change.
// borrowedAt is the date part; returnedAt stays a timestamp text. initials: fill with initialsFromName(borrowerFullName).
/*
SELECT
  l.id::text                  AS "_id",
  l.borrow_code               AS "borrowCode",
  l.status                    AS "status",
  l.borrowed_at::date::text   AS "borrowedAt",
  l.due_date::text            AS "dueDate",
  l.returned_at::text         AS "returnedAt",
  l.return_condition          AS "returnCondition",
  l.renewal_count             AS "renewalCount",
  b.id::text                  AS "bookId",
  b.title                     AS "bookTitle",
  b.author                    AS "bookAuthor",
  b.cover_image_url           AS "bookCoverImageUrl",
  pc.id::text                 AS "copyId",
  pc.copy_code                AS "copyCode",
  pc.condition                AS "copyCondition",
  pc.home_location            AS "copyHomeLocation",
  u.id::text                  AS "borrowerId",
  u.account_id                AS "borrowerAccountId",
  u.full_name                 AS "borrowerFullName",
  u.year_group                AS "borrowerYearGroup",
  (SELECT COUNT(*)::int FROM loans x
    WHERE x.student_id = u.id AND x.status = 'Active')  AS "borrowerActiveLoansCount",
  u.max_loans_limit           AS "borrowerMaxLoansLimit"
FROM loans l
JOIN physical_copies pc ON pc.id = l.copy_id
JOIN books b            ON b.id  = pc.book_id
JOIN users u            ON u.id  = l.student_id
-- by copy code (active):   WHERE pc.copy_code = $1 AND l.status = 'Active'
-- by id or borrowCode:     WHERE (l.borrow_code = $1 OR l.id::text = $1)
-- current loans of student: WHERE l.student_id = $1::int AND l.status = 'Active'   ORDER BY l.due_date ASC, l.id ASC
-- history of student:       WHERE l.student_id = $1::int AND l.status = 'Returned' ORDER BY l.returned_at DESC
*/

// sql hints for getLoanRecords: same SELECT as above plus COUNT(*) OVER()::int AS "totalItem".
// $1 tab, $2 q (NULL when empty), $3 status (NULL = all), $4 limit, $5 offset = (page - 1) * limit
/*
WHERE l.status = CASE WHEN $1::text = 'active' THEN 'Active' ELSE 'Returned' END
  AND ($2::text IS NULL
       OR l.borrow_code ILIKE '%' || $2 || '%' OR pc.copy_code ILIKE '%' || $2 || '%'
       OR u.account_id  ILIKE '%' || $2 || '%' OR u.full_name  ILIKE '%' || $2 || '%'
       OR b.title       ILIKE '%' || $2 || '%')
  AND ($3::text IS NULL
       OR ($3 = 'overdue'  AND l.due_date <  CURRENT_DATE)
       OR ($3 = 'due_soon' AND l.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 2)   -- the contract does not define "soon": 2 days is a guess
       OR ($3 = 'on_loan'  AND l.due_date >  CURRENT_DATE + 2))
ORDER BY l.due_date ASC, l.id ASC        -- column and direction come from a whitelist in code, never from user input
LIMIT $4::int OFFSET $5::int
*/

    // CUD methods
    issueLoans(params: {
        studentId: string; // userId, not accountId
        items: { copyCode: string; dueDate: string }[]; // dueDate: YYYY-MM-DD
    }): Promise<IssueLoansResultEntity | null>;
    // ONE transaction for the whole batch (all or nothing), so it is one method and not many small ones.
    // Return Entity if success, else null (a copy is no longer available when the rows are locked).

// sql hints from claude AI, in this order inside BEGIN ... COMMIT (ROLLBACK + return null if step 1 finds a blocked copy)
/*
-- 0. once: CREATE SEQUENCE borrow_code_seq START 2001;   (so two counters can never generate the same code)

-- 1. lock the copies and re-check them: every row must be 'Available', or 'Reserved' with holdStudentId = studentId
SELECT pc.copy_code AS "copyCode", pc.state AS "state", h.student_id AS "holdStudentId"
FROM physical_copies pc
LEFT JOIN holds h ON h.copy_id = pc.id AND h.status = 'Ready'
WHERE pc.copy_code = ANY($1::text[])
FOR UPDATE OF pc;

-- 2. one loan per copy
INSERT INTO loans (borrow_code, student_id, copy_id, due_date)
SELECT 'BR-' || nextval('borrow_code_seq'), $1::int, pc.id, i.due_date
FROM unnest($2::text[], $3::date[]) AS i(copy_code, due_date)
JOIN physical_copies pc ON pc.copy_code = i.copy_code
RETURNING id::text AS "_id", borrow_code AS "borrowCode", copy_id::text AS "copyId", due_date::text AS "dueDate";

-- 3. copies -> Borrowed
UPDATE physical_copies SET state = 'Borrowed', updated_at = now() WHERE copy_code = ANY($1::text[]);

-- 4. this student's Ready holds on those copies -> Fulfilled
UPDATE holds SET status = 'Fulfilled'
WHERE student_id = $1::int AND status = 'Ready'
  AND copy_id IN (SELECT id FROM physical_copies WHERE copy_code = ANY($2::text[]))
RETURNING hold_code AS "holdCode";

-- 5. optional, only if you keep users.active_loans_count in sync (getBorrowerWithStats counts from loans, it does not need it)
UPDATE users SET active_loans_count = active_loans_count + $2::int, updated_at = now()
WHERE id = $1::int RETURNING active_loans_count AS "loansNow";
*/

    returnLoan(params: {
        loanId: string; // loan _id, not borrowCode: the service already found the loan
        condition: "Good" | "Damaged" | "Lost";
        conditionNote?: string | undefined;
    }): Promise<ReturnLoanResultEntity | null>;
    // ONE transaction. Return Entity if success, else null (loan not Active any more).
    // NOTE: the `loans` table has no column for conditionNote. Add one (e.g. loans.return_note TEXT) or write it to physical_copies.notes.

// sql hints from claude AI, in this order inside BEGIN ... COMMIT
/*
-- 1. lock the active loan (no row => ROLLBACK and return null)
SELECT l.id AS "loanId", l.copy_id AS "copyId", l.student_id AS "studentId"
FROM loans l WHERE l.id = $1::int AND l.status = 'Active' FOR UPDATE;

-- 2. close the loan
UPDATE loans SET status = 'Returned', returned_at = now(), return_condition = $2::text
WHERE id = $1::int
RETURNING borrow_code AS "borrowCode", returned_at::text AS "returnedAt", return_condition AS "returnCondition";

-- 3. copy state follows the condition: Good -> Available, Damaged / Lost -> same word
UPDATE physical_copies
SET state = CASE WHEN $2::text = 'Good' THEN 'Available' ELSE $2::text END,
    condition = $2::text, updated_at = now()
WHERE id = $1::int
RETURNING copy_code AS "copyCode", state AS "newState", home_location AS "homeLocation";

-- 4. optional, same remark as in issueLoans
UPDATE users SET active_loans_count = GREATEST(active_loans_count - 1, 0), updated_at = now()
WHERE id = $1::int RETURNING active_loans_count AS "loansAfter";
*/

    renewLoan(params: {
        loanId: string; // loan _id
        extraDays: number;
    }): Promise<RenewLoanResultEntity | null>;
    // Return Entity if success, else null (not Active, or already renewed). One statement, so no transaction needed.

// sql hints from claude AI. The WHERE is the guard: a second renew matches 0 rows (renewal_count would otherwise break the CHECK)
/*
UPDATE loans
SET due_date = due_date + $2::int, renewal_count = renewal_count + 1
WHERE id = $1::int AND status = 'Active' AND renewal_count < 1
RETURNING id::text AS "_id", borrow_code AS "borrowCode",
          (due_date - $2::int)::text AS "previousDueDate", due_date::text AS "newDueDate",
          renewal_count AS "renewalCount";
*/
}


export interface LoanCopiesRepository {
    // Read-only view of `physical_copies` for the counter. Copies themselves are written by book-inventories.
    // Query methods
    getCopiesForCheckoutByCopyCodes(copyCodes: string[]): Promise<CheckoutCopyEntity[]>;
    // Rows come back only for codes that exist: the service compares with the requested codes to find COPY_NOT_FOUND.
    // One code => array of one. Sorted by copy_code.

// sql hints from claude AI
/*
SELECT
  pc.id::text AS "_id", pc.copy_code AS "copyCode", pc.state AS "state", pc.condition AS "condition",
  pc.home_location AS "homeLocation",
  b.id::text AS "bookId", b.title AS "bookTitle", b.author AS "bookAuthor", b.cover_image_url AS "bookCoverImageUrl",
  al.borrow_code AS "loanBorrowCode", al.student_name AS "loanStudentName",
  al.student_account_id AS "loanStudentAccountId", al.due_date AS "loanDueDate",
  ah.id AS "holdId", ah.hold_code AS "holdCode", ah.student_name AS "holdStudentName",
  ah.student_account_id AS "holdStudentAccountId", ah.collect_by AS "holdCollectBy"
FROM physical_copies pc
JOIN books b ON b.id = pc.book_id
LEFT JOIN LATERAL (
  SELECT l.borrow_code, u.full_name AS student_name, u.account_id AS student_account_id, l.due_date::text AS due_date
  FROM loans l JOIN users u ON u.id = l.student_id
  WHERE l.copy_id = pc.id AND l.status = 'Active'
  ORDER BY l.borrowed_at DESC LIMIT 1
) al ON TRUE
LEFT JOIN LATERAL (
  SELECT h.id::text AS id, h.hold_code, u.full_name AS student_name, u.account_id AS student_account_id,
         h.collect_by::text AS collect_by
  FROM holds h JOIN users u ON u.id = h.student_id
  WHERE h.copy_id = pc.id AND h.status = 'Ready'
  ORDER BY h.requested_at DESC LIMIT 1
) ah ON TRUE
WHERE pc.copy_code = ANY($1::text[])
ORDER BY pc.copy_code;
*/

// Add these index for better performance if needed
/*
CREATE INDEX idx_loans_copy_status ON loans(copy_id, status);
CREATE INDEX idx_holds_copy_status ON holds(copy_id, status);
*/
}


export interface LoanHoldsRepository {
    // Read-only view of `holds`. Holds are written by the holds module (and fulfilled inside LoansRepository.issueLoans).
    // Query methods
    getReadyHoldsByStudentId(studentId: string): Promise<ReadyHoldEntity[]>;
    // userId, not accountId. Status 'Ready' only, newest first.

    getBookIdsWithReadyHold(bookIds: string[]): Promise<string[]>;
    // The subset of bookIds that currently have a Ready hold (one query for all loans, no N+1). Used for canRenew.

// sql hints from claude AI
/*
-- getReadyHoldsByStudentId
SELECT h.id::text AS "_id", h.hold_code AS "holdCode", h.status AS "status",
       h.requested_at::text AS "requestedAt", h.collect_by::text AS "collectBy",
       b.id::text AS "bookId", b.title AS "bookTitle", b.author AS "bookAuthor", b.format AS "bookFormat",
       b.cover_image_url AS "bookCoverImageUrl",
       pc.id::text AS "copyId", pc.copy_code AS "copyCode", pc.home_location AS "copyHomeLocation"
FROM holds h
JOIN books b ON b.id = h.book_id
LEFT JOIN physical_copies pc ON pc.id = h.copy_id
WHERE h.student_id = $1::int AND h.status = 'Ready'
ORDER BY h.requested_at DESC;

-- getBookIdsWithReadyHold
SELECT DISTINCT h.book_id::text AS "bookId"
FROM holds h
WHERE h.status = 'Ready' AND h.book_id = ANY($1::int[]);
*/
}
