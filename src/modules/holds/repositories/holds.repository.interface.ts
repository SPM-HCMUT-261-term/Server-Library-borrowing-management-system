import type {
  BookStockEntity,
  CancelHoldResultEntity,
  HoldDetailEntity,
  StudentBorrowingStatusEntity
} from "../holds.entity.js";

export interface HoldsRepository {
  /* Query operations */

  /** Overdue / fines / loan-limit counters of a student. null if the student does not exist. */
  getStudentBorrowingStatus(studentId: string): Promise<StudentBorrowingStatusEntity | null>;

  /** Derived stock of a title. null if the book does not exist. */
  getBookStock(bookId: string): Promise<BookStockEntity | null>;

  /** true if the student already has an Active loan or a Ready hold for any copy of this title. */
  hasActiveLoanOrHoldForBook(params: {
    studentId: string;
    bookId: string;
  }): Promise<boolean>;

  /** Find Hold by _id or holdCode (e.g. "HLD-1042"). null if not found. */
  findHoldById(id: string): Promise<HoldDetailEntity | null>;

  /** Staff list of Ready holds, newest first. */
  getActiveHolds(params: {
    q?: string | undefined; // holdCode, student accountId / name, copyCode, book title
    page?: number | undefined;
    limit?: number | undefined;
  }): Promise<{ holds: HoldDetailEntity[]; totalItem: number }>;

  /* CUD operations */

  /**
   * One DB transaction:
   *  1. pick one Available copy of the book (lock it, e.g. FOR UPDATE SKIP LOCKED)
   *  2. set that copy's state = 'Reserved'
   *  3. generate the next sequential holdCode ("HLD-xxxx")
   *  4. insert the hold with status 'Ready'
   * Does NOT touch users.active_loans_count.
   */
  createHold(params: {
    studentId: string;
    bookId: string;
    collectBy: string; // ISO timestamp, computed by the service
  }): Promise<HoldDetailEntity | "no_available_copies">;

  /**
   * One DB transaction: hold.status = 'Cancelled' and the assigned copy back to 'Available'.
   * "not_cancellable" if the hold is already Fulfilled / Cancelled / Expired.
   */
  cancelHold(params: {
    id: string; // hold _id or holdCode
  }): Promise<CancelHoldResultEntity | "not_found" | "not_cancellable">;
}
