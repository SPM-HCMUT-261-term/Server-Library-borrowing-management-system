import type { HoldsRepository } from "./repositories/holds.repository.interface.js";

type ServiceError = Error & { code: string; details?: unknown };
function serviceError(code: string, message: string, details?: unknown): ServiceError {
    return Object.assign(new Error(message), { code, details });
}

// Business-rule constants (API contract section 1.4 / 6.2)
const PICKUP_LOCATION = "Main library counter";
const HOLD_COLLECT_HOUR = 15; // collectBy = next day at 15:30 (school time)
const HOLD_COLLECT_MINUTE = 30;

// Methods are intentionally empty (return type `void`) so the file compiles while the logic is TODO.
// When you implement one, change `void` to the real return type (e.g. Promise<HoldConfirmationDto>).
export class HoldsService {
    constructor(private holdsRepository: HoldsRepository) {}

    /**
     * POST /holds  (student)
     * Response 201: holdConfirmation { _id, holdCode, status, requestedAt, collectBy,
     *   book{_id,title,author,format,shelfReference,coverImageUrl,stockSummary{total,available,borrowed,reserved}},
     *   assignedCopy{_id,copyCode,homeLocation}, studentLoanUsage{activeLoansCount,maxLoansLimit} }
     */
    public createHold(params: {
        studentId: string; // from the session, not from the request body
        bookId: string;
    }): void {
        // TODO
        // 1. holdsRepository.getBookStock(bookId)                      -> null => throw BOOK_NOT_FOUND (404) [not in the contract, but needed]
        // 2. holdsRepository.getStudentBorrowingStatus(studentId)      -> overdueLoansCount > 0 || unpaidFines > 0 => throw BORROWING_BLOCKED
        // 3. holdsRepository.hasActiveLoanOrHoldForBook(...)           -> true => throw DUPLICATE_HOLD_OR_LOAN
        // 4. stock.availableCopies === 0                               -> throw NO_AVAILABLE_COPIES 
        // 5. collectBy = tomorrow at HOLD_COLLECT_HOUR:HOLD_COLLECT_MINUTE (Asia/Ho_Chi_Minh), as ISO timestamp
        // 6. holdsRepository.createHold({ studentId, bookId, collectBy })  -> "no_available_copies" => NO_AVAILABLE_COPIES (race condition)
        // 7. holdsRepository.getBookStock(bookId) again for the handling stockSummary
        // 8. Map entities (id -> _id) into holdConfirmation. A hold does NOT increment active_loans_count in users table.
    }

    /**
     * DELETE /holds/:id  (student owner | staff)
     * Response 200: message "Hold HLD-1042 has been cancelled and the copy is now available."
     *   data { holdCode, status: "Cancelled", releasedCopyCode }
     */
    public cancelHold(params: {
        id: string; // hold _id or holdCode
        requesterId: string; // from the session
        requesterRole: "student" | "staff";
    }): void {
        // TODO
        // 1. holdsRepository.findHoldById(id)                          -> null => throw HOLD_NOT_FOUND
        // 2. requesterRole === "student" && hold.student.id !== requesterId
        //                                                              -> throw HOLD_NOT_FOUND (don't reveal other students' holds)
        // 3. hold.status !== "Ready"                                   -> throw HOLD_NOT_CANCELLABLE 
        // 4. holdsRepository.cancelHold({ id })                        -> "not_found" => throw HOLD_NOT_FOUND, "not_cancellable" => throw HOLD_NOT_CANCELLABLE
        // 5. Return { holdCode, status, releasedCopyCode } and build the message above in the controller or here
    }

    /**
     * GET /staff/holds  (staff)
     * Response 200: data { items: HoldRecord[], pagination { totalItems, currentPage, totalPages, limit } }
     */
    public getActiveHolds(params: {
        q?: string | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    }): void {
        // TODO
        // 1. page = params.page ?? 1, limit = params.limit ?? 10 (invalid => throw BAD_REQUEST)
        // 2. holdsRepository.getActiveHolds({ q, page, limit })
        // 3. For each hold add isPastDeadline = now > collectBy (do mapping in the service, not in the controller or kich the logic down to the repository)
        // 4. Return { items, pagination: { totalItems, currentPage, totalPages: ceil(totalItem / limit), limit } }
    }
}
