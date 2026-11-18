
import type { deleteBook } from "../book-inventories.controller";
import type { 
    GetFeaturedBooksResultEntity, 
    GetBooksResultEntity, 
    BookEntity, 
    BookeWithSummaryInfoEntity,
    PhysicalCopyEntity,
    PhysicalWithLoanAndHoldStateEntity,
    AddCopyToBookStockSummaryEntity,
    UpdateCopyToBookStockSummaryEntity,
    PhysicalCopyEntityWithActiveLoanAndHold,
    BookViewerContextEntity
}  from "../book-inventories.entity";

export interface BookMetadata {
    title: string;
    author: string;
    isbn: string;
    category: string;
    keywords?: string[] | undefined;
    publisher?: string | null | undefined;
    genre?: string | null | undefined;
    publishedYear?: number | null | undefined;
    language?: string | undefined;
    format?: string | undefined;
    pageCount?: number | null | undefined;
    description?: string | null | undefined;
    coverImageUrl?: string | null | undefined;
    shelfReference?: string | null | undefined;
}

export interface UpdateBookParams {
    title: string;
    author: string;
    isbn: string;
    category: string;
    publisher?: string | null | undefined;
    keywords?: string[] | undefined;
    genre?: string | null | undefined;
    publishedYear?: number | null | undefined;
    language?: string | undefined;
    format?: string | undefined;
    pageCount?: number | null | undefined;
    description?: string | null | undefined;
    coverImageUrl?: string | null | undefined;
    shelfReference?: string | null | undefined;
}

export interface GetBooksParams {
    q?: string;
    category?: string;
    genre?: string;
    language?: string;
    availableNow?: boolean;
    stock?: "all" | "available" | "unavailable";
    sortBy?: "relevance" | "title" | "publishedYear";
    page?: number;
    limit?: number;
}


export interface BooksRepository {
    // Keep the name of columns in query result, then map to entity to return to service layer for easier to read code.
    // Query methods
    getFeaturedBooks(limit: number): Promise<GetFeaturedBooksResultEntity[]>;

    getBooks(
        params: GetBooksParams
    ): Promise<{ books: GetBooksResultEntity[]; totalItems: number }>;

    getBookById(bookId: string): Promise<BookEntity | null>;

    getBooksWithSummaryInfoById(bookId: string): Promise<BookeWithSummaryInfoEntity | null>;

    getBooksWithSummaryInfoByIdOrIsbn(bookIdOrIsbn: string): Promise<BookeWithSummaryInfoEntity | null>;
    // bookIdOrIsbn means it is either bookId or isbn, if it is not found by bookId, then find by isbn.


    getBookByIsbn(isbn: string): Promise<BookEntity | null>;

    getBookViewerContext(
        userId: string, // userid, not accountId. No check if this is staff or student.
        bookId: string
    ): Promise<BookViewerContextEntity | null>;
// sql hints from claude AI for getBookViewerContext method:
/*
WITH facts AS (
  SELECT
    u.status,
    u.active_loans_count,
    u.max_loans_limit,
    EXISTS (
      SELECT 1 FROM loans l
      JOIN physical_copies pc ON pc.id = l.copy_id
      WHERE l.student_id = u.id AND pc.book_id = $2 AND l.status = 'Active'
    ) AS borrowing_this,
    (SELECT h.hold_code FROM holds h
      WHERE h.student_id = u.id AND h.book_id = $2 AND h.status = 'Ready'
      LIMIT 1) AS hold_code,
    (SELECT COUNT(*) FROM physical_copies pc
      WHERE pc.book_id = $2 AND pc.state = 'Available') AS available
  FROM users u
  WHERE u.id = $1
),
reasoned AS (
  SELECT *,
    CASE
      WHEN status = 'Inactive'                    THEN 'Your account is inactive'
      WHEN active_loans_count >= max_loans_limit  THEN 'You have reached your loan limit'
      WHEN borrowing_this                         THEN 'You are already borrowing this title'
    END AS block_reason
  FROM facts
)
SELECT
  (block_reason IS NULL AND available > 0)                          AS "canBorrow",
  (block_reason IS NULL AND available = 0 AND hold_code IS NULL)    AS "canRequestHold",
  block_reason                                                      AS "blockReason",
  active_loans_count                                                AS "activeLoansCount",
  max_loans_limit                                                   AS "maxLoansLimit",
  hold_code                                                         AS "existingHoldCode"
FROM reasoned;

*/
    // CUD methods
    createBook(params: BookMetadata): Promise<BookEntity | null>;
    // Return Entity if success, else null.


    updateBookById(bookId: string, params: UpdateBookParams): Promise<BookEntity | null>;
    // Return Entity if success, else null. 

    deleteBookById(bookId: string): Promise<BookEntity | null>;
    // Return Entity if success, else null.

}



export interface PhysicalCopiesRepository {
    // Query methods
    getPhysicalCopyWithLoanAndHoldStateById(copyId: string): Promise<PhysicalWithLoanAndHoldStateEntity | null>;
    getSummaryStockAfterAddCopyToBookStock(copyId: string): Promise<AddCopyToBookStockSummaryEntity | null>;
    getSummaryStockAfterUpdateCopyToBookStock(copyId: string): Promise<UpdateCopyToBookStockSummaryEntity | null>;

    getPyhsicalCopy(copyId: string | null, copyCode: string | null): Promise<PhysicalCopyEntity | null>;

    // getPhysicalCopiesByBookId(bookId: string): Promise<PhysicalCopyEntity[] | null>;

    getPhysicalCopiesByBookIdWithActiveLoanAndHold(bookId: string): Promise<PhysicalCopyEntityWithActiveLoanAndHold[] | null>;
// sql hints from claude AI
/*
SELECT
  pc.id::text                AS "_id",
  pc.copy_code               AS "copyCode",
  pc.book_id::text           AS "bookId",
  pc.home_location           AS "homeLocation",
  pc.state                   AS "state",
  pc.condition               AS "condition",
  pc.notes                   AS "notes",
  pc.created_at              AS "createdAt",
  pc.updated_at              AS "updatedAt",

  EXISTS (SELECT 1 FROM loans lh WHERE lh.copy_id = pc.id) AS "hasLoanHistory",

  al.borrow_code             AS "loanBorrowCode",
  al.student_name            AS "loanStudentName",
  al.student_account_id      AS "loanStudentAccountId",
  al.due_date                AS "loanDueDate",

  ah.hold_code               AS "holdCode",
  ah.student_name            AS "holdStudentName",
  ah.student_account_id      AS "holdStudentAccountId",
  ah.collect_by              AS "holdCollectBy"
FROM physical_copies pc
LEFT JOIN LATERAL (
  SELECT l.borrow_code,
         u.full_name                       AS student_name,
         u.account_id                      AS student_account_id,
         to_char(l.due_date, 'YYYY-MM-DD') AS due_date
  FROM loans l
  JOIN users u ON u.id = l.student_id
  WHERE l.copy_id = pc.id AND l.status = 'Active'
  ORDER BY l.borrowed_at DESC
  LIMIT 1
) al ON TRUE
LEFT JOIN LATERAL (
  SELECT h.hold_code,
         u.full_name   AS student_name,
         u.account_id  AS student_account_id,
         h.collect_by
  FROM holds h
  JOIN users u ON u.id = h.student_id
  WHERE h.copy_id = pc.id AND h.status = 'Ready'
  ORDER BY h.requested_at DESC
  LIMIT 1
) ah ON TRUE
WHERE pc.book_id = $1
ORDER BY pc.copy_code;
*/

// Add these index for better performance if needed
/*
CREATE INDEX idx_loans_copy_status ON loans(copy_id, status);
CREATE INDEX idx_holds_copy_status ON holds(copy_id, status);
*/



    // CUD methods
    addCopyToBookStock(params: {
        bookId: string;
        copyCode: string;
        homeLocation: string;
        initialState: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | undefined;
    }): Promise<PhysicalCopyEntity | null>;
    // Return Entity if success, else null.


    updatePhysicalCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
        homeLocation: string;
        state: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | null | undefined;
    }): Promise<PhysicalCopyEntity | null>;
    // Return Entity if success, else null.

    deletePhysicalCopyById(
        copyId: string | undefined,
        copyCode: string | undefined
    ): Promise<boolean>;
    // Return true if success, else false.
}

