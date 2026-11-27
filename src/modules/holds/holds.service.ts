import type { HoldsRepository } from "./repositories/holds.repository.interface.js";

type ServiceError = Error & { code: string; details?: unknown };
function serviceError(code: string, message: string, details?: unknown): ServiceError {
    return Object.assign(new Error(message), { code, details });
}

// Business-rule constants (API contract section 1.4 / 6.2)
const PICKUP_LOCATION = "Main library counter";
const SCHOOL_TIME_ZONE = "Asia/Ho_Chi_Minh";
const HOLD_COLLECT_HOUR = 15; // collectBy = next day at 15:30 (school time)
const HOLD_COLLECT_MINUTE = 30;
const DEFAULT_PAGE_LIMIT = 10;
const MAX_PAGE_LIMIT = 100;

// Methods are intentionally empty (return type `void`) so the file compiles while the logic is TODO.
// When you implement one, change `void` to the real return type (e.g. Promise<HoldConfirmationDto>).
export class HoldsService {
    constructor(private readonly holdsRepository: HoldsRepository) { }

    /**
     * POST /holds  (student)
     * Response 201: holdConfirmation { _id, holdCode, status, requestedAt, collectBy,
     *   book{_id,title,author,format,shelfReference,coverImageUrl,stockSummary{total,available,borrowed,reserved}},
     *   assignedCopy{_id,copyCode,homeLocation}, studentLoanUsage{activeLoansCount,maxLoansLimit} }
     */
    public async createHold(params: {
        studentId: string; // from the session, not from the request body
        bookId: string;
    }) {
        // TODO
        const { studentId, bookId } = params;
        // 1. holdsRepository.getBookStock(bookId)                      -> null => throw BOOK_NOT_FOUND (404) [not in the contract, but needed]
        const stock = await this.holdsRepository.getBookStock(bookId);
        if (!stock) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
        // 2. holdsRepository.getStudentBorrowingStatus(studentId)      -> overdueLoansCount > 0 || unpaidFines > 0 => throw BORROWING_BLOCKED
        const studentStatus = await this.holdsRepository.getStudentBorrowingStatus(studentId);
        if (!studentStatus) {
            throw serviceError("BAD_REQUEST", "Student account not found");
        }
        if (studentStatus.overdueLoansCount > 0 || studentStatus.unpaidFines > 0) {
            throw serviceError("BORROWING_BLOCKED", "You have overdue books or unpaid fines");
        }
        // 3. holdsRepository.hasActiveLoanOrHoldForBook(...)           -> true => throw DUPLICATE_HOLD_OR_LOAN
        const hasDuplicate = await this.holdsRepository.hasActiveLoanOrHoldForBook({ studentId, bookId });
        if (hasDuplicate) {
            throw serviceError("DUPLICATE_HOLD_OR_LOAN", "You already hold or borrow a copy of this book");
        }
        // 4. stock.availableCopies === 0                               -> throw NO_AVAILABLE_COPIES 
        if (stock.availableCopies <= 0) {
            throw serviceError("NO_AVAILABLE_COPIES", "All physical copies of this book are currently unavailable");
        }
        // 5. collectBy = tomorrow at HOLD_COLLECT_HOUR:HOLD_COLLECT_MINUTE (Asia/Ho_Chi_Minh), as ISO timestamp
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: SCHOOL_TIME_ZONE }).format(new Date());
        const tomorrow = new Date(`${today}T00:00:00Z`);
        tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
        const tomorrowDateStr = tomorrow.toISOString().slice(0, 10);
        const hh = String(HOLD_COLLECT_HOUR).padStart(2, "0");
        const mm = String(HOLD_COLLECT_MINUTE).padStart(2, "0");
        const collectBy = new Date(`${tomorrowDateStr}T${hh}:${mm}:00+07:00`).toISOString();
        // 6. holdsRepository.createHold({ studentId, bookId, collectBy })  -> "no_available_copies" => NO_AVAILABLE_COPIES (race condition)
        const created = await this.holdsRepository.createHold({ studentId, bookId, collectBy });
        if (created === "no_available_copies") {
            throw serviceError("NO_AVAILABLE_COPIES", "All physical copies of this book are currently unavailable");
        }
        if (!created.copy) {
            throw new Error("Created hold is missing assigned physical copy");
        }
        // 7. holdsRepository.getBookStock(bookId) again for the handling stockSummary
        const updatedStock = (await this.holdsRepository.getBookStock(bookId)) ?? stock;
        // 8. Map entities (id -> _id) into holdConfirmation. A hold does NOT increment active_loans_count in users table.
        return {
            _id: created.id,
            holdCode: created.holdCode,
            status: created.status,
            requestedAt: new Date(created.requestedAt).toISOString(),
            collectBy: new Date(created.collectBy).toISOString(),
            book: {
                _id: created.book.id,
                title: created.book.title,
                author: created.book.author,
                format: created.book.format,
                shelfReference: created.book.shelfReference,
                coverImageUrl: created.book.coverImageUrl,
                stockSummary: {
                    totalCopies: updatedStock.totalCopies,
                    availableCopies: updatedStock.availableCopies,
                    borrowedCopies: updatedStock.borrowedCopies,
                    reservedCopies: updatedStock.reservedCopies
                }
            },
            assignedCopy: {
                _id: created.copy.id,
                copyCode: created.copy.copyCode,
                homeLocation: created.copy.homeLocation
            },
            studentLoanUsage: {
                activeLoansCount: studentStatus.activeLoansCount,
                maxLoansLimit: studentStatus.maxLoansLimit
            }
        };
    }

    /**
     * DELETE /holds/:id  (student owner | staff)
     * Response 200: message "Hold HLD-1042 has been cancelled and the copy is now available."
     *   data { holdCode, status: "Cancelled", releasedCopyCode }
     */
    public async cancelHold(params: {
        id: string; // hold _id or holdCode
        requesterId: string; // from the session
        requesterRole: "student" | "staff";
    }) {
        // TODO
        const { id, requesterId, requesterRole } = params;
        // 1. holdsRepository.findHoldById(id)                          -> null => throw HOLD_NOT_FOUND
        const hold = await this.holdsRepository.findHoldById(id);
        if (!hold) {
            throw serviceError("HOLD_NOT_FOUND", "Hold not found");
        }
        // 2. requesterRole === "student" && hold.student.id !== requesterId
        //                                                              -> throw HOLD_NOT_FOUND (don't reveal other students' holds)
        if (requesterRole === "student" && hold.student.id !== requesterId) {
            throw serviceError("HOLD_NOT_FOUND", "Hold not found");
        }
        // 3. hold.status !== "Ready"                                   -> throw HOLD_NOT_CANCELLABLE 
        if (hold.status !== "Ready") {
            throw serviceError("HOLD_NOT_CANCELLABLE", "Hold is already fulfilled or cancelled");
        }
        // 4. holdsRepository.cancelHold({ id })                        -> "not_found" => throw HOLD_NOT_FOUND, "not_cancellable" => throw HOLD_NOT_CANCELLABLE
        const cancelled = await this.holdsRepository.cancelHold({ id: hold.id });
        if (cancelled === "not_found") {
            throw serviceError("HOLD_NOT_FOUND", "Hold not found");
        }
        if (cancelled === "not_cancellable") {
            throw serviceError("HOLD_NOT_CANCELLABLE", "Hold is already fulfilled or cancelled");
        }
        // 5. Return { holdCode, status, releasedCopyCode } and build the message above in the controller or here
        return {
            holdCode: cancelled.holdCode,
            status: cancelled.status,
            releasedCopyCode: cancelled.releasedCopyCode
        };
    }

    /**
     * GET /staff/holds  (staff)
     * Response 200: data { items: HoldRecord[], pagination { totalItems, currentPage, totalPages, limit } }
     */
    public async getActiveHolds(params: {
        q?: string | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    }) {
        // TODO
        // 1. page = params.page ?? 1, limit = params.limit ?? 10 (invalid => throw BAD_REQUEST)
        const page = params.page ?? 1;
        const limit = Math.min(params.limit ?? DEFAULT_PAGE_LIMIT, MAX_PAGE_LIMIT);
        if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1) {
            throw serviceError("BAD_REQUEST", "Invalid pagination parameters");
        }
        // 2. holdsRepository.getActiveHolds({ q, page, limit })
        const q = params.q ? params.q : undefined;
        const { holds, totalItem } = await this.holdsRepository.getActiveHolds({ q, page, limit });
        // 3. For each hold add isPastDeadline = now > collectBy (do mapping in the service, not in the controller or kich the logic down to the repository)
        const nowMs = Date.now();
        const items = holds.map((hold) => {
            const collectByDate = new Date(hold.collectBy);
            return {
                _id: hold.id,
                holdCode: hold.holdCode,
                status: hold.status,
                requestedAt: new Date(hold.requestedAt).toISOString(),
                collectBy: collectByDate.toISOString(),
                isPastDeadline: nowMs > collectByDate.getTime(),
                student: {
                    _id: hold.student.id,
                    accountId: hold.student.accountId,
                    fullName: hold.student.fullName,
                    yearGroup: hold.student.yearGroup
                },
                book: {
                    _id: hold.book.id,
                    title: hold.book.title,
                    author: hold.book.author,
                    coverImageUrl: hold.book.coverImageUrl
                },
                copy: hold.copy
                    ? {
                        _id: hold.copy.id,
                        copyCode: hold.copy.copyCode,
                        homeLocation: hold.copy.homeLocation
                    }
                    : null
            };
        });
        // 4. Return { items, pagination: { totalItems, currentPage, totalPages: ceil(totalItem / limit), limit } }
        return {
            items,
            pagination: {
                totalItems: totalItem,
                currentPage: page,
                totalPages: Math.ceil(totalItem / limit),
                limit
            }
        };
    }
}