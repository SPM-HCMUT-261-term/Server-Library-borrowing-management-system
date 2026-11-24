// Entities = what the repository returns.
// - `id` is the database primary key as a string (the service maps it to `_id` in API responses).
// - Dates/timestamps are ISO strings (repository selects `::text`), same convention as admin.entity.ts.

export type HoldStatus = "Ready" | "Fulfilled" | "Cancelled" | "Expired";

export type HoldBookEntity = {
  id: string;
  title: string;
  author: string;
  format: string;
  shelfReference: string | null;
  coverImageUrl: string | null;
};

export type HoldCopyEntity = {
  id: string;
  copyCode: string;
  homeLocation: string;
};

export type HoldStudentEntity = {
  id: string;
  accountId: string;
  fullName: string;
  yearGroup: string | null;
};

/** One hold with its book, assigned copy and owner. Used by create / cancel / staff list / student dashboard. */
export type HoldDetailEntity = {
  id: string;
  holdCode: string;
  status: HoldStatus;
  requestedAt: string;
  collectBy: string;
  book: HoldBookEntity;
  copy: HoldCopyEntity | null; // holds.copy_id is nullable (ON DELETE SET NULL)
  student: HoldStudentEntity;
};

/** Counters needed to decide whether a student may place a hold. */
export type StudentBorrowingStatusEntity = {
  id: string;
  activeLoansCount: number;
  maxLoansLimit: number;
  overdueLoansCount: number;
  unpaidFines: number;
};

/** Derived stock for one title (view_book_stock). */
export type BookStockEntity = {
  bookId: string;
  totalCopies: number;
  availableCopies: number;
  borrowedCopies: number;
  reservedCopies: number;
};

export type CancelHoldResultEntity = {
  id: string;
  holdCode: string;
  status: "Cancelled";
  releasedCopyCode: string | null;
};
