import type {
    BooksRepository,
    PhysicalCopiesRepository,
} from "./repositories/book-inventories.repository.interface";

import { GetBookByIdResponseDto } from "./book-inventories.dto.js";
type ServiceError = Error & { code: string; details?: unknown };
function serviceError(
    code: string,
    message: string,
    details?: unknown,
): ServiceError {
    return Object.assign(new Error(message), { code, details });
}
const DEFAULT_FEATURED_LIMIT = 4;
const DEFAULT_CATALOG_LIMIT = 6;
const MAX_PAGE_LIMIT = 100;

class BookInventoriesService {
    constructor(
        private readonly booksRepository: BooksRepository,
        private readonly physicalCopiesRepository: PhysicalCopiesRepository,
    ) {}

    public async getFeaturedBooks(params: { limit?: number | undefined }) {
        // will replace by return type
        // call this.booksRepository.getFeaturedBooks(...) to return to controller layer
        const limit = Math.min(
            params.limit ?? DEFAULT_FEATURED_LIMIT,
            MAX_PAGE_LIMIT,
        );
        return this.booksRepository.getFeaturedBooks(limit);
    }

    public async getBooks(params: {
        q?: string | undefined;
        category?: string | undefined;
        genre?: string | undefined;
        language?: string | undefined;
        availableNow?: boolean | undefined;
        stock?: "all" | "available" | "unavailable" | undefined;
        sortBy?: "relevance" | "title" | "publishedYear" | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    }) {
        // will replace by return type
        // call this.booksRepository.getBooks(...) to return to controller layer
        const page = params.page ?? 1;
        const limit = Math.min(
            params.limit ?? DEFAULT_CATALOG_LIMIT,
            MAX_PAGE_LIMIT,
        );
        const stock = params.stock ?? "all";
        const sortBy = params.sortBy ?? "relevance";
        const q = params.q ? params.q : undefined;
        const { books, totalItem } = await this.booksRepository.getBooks(
            q,
            params.category,
            params.genre,
            params.language,
            params.availableNow,
            stock,
            sortBy,
            page,
            limit,
        );
        return {
            items: books,
            pagination: {
                totalItems: totalItem,
                currentPage: page,
                totalPages: Math.ceil(totalItem / limit),
                limit,
            },
        };
    }

    public async getBookById(
        id: string,
        role: "staff" | "student",
        studentId: string | null, // userId, not accountId. Null if role is staff
    ) {
        // not implemented currently bcz of the complexity query
        // call this.booksRepository.getBooksWithSummaryInfoByIdOrIsbn(...)
        const book =
            await this.booksRepository.getBooksWithSummaryInfoByIdOrIsbn(id);
        // If null, throw error Book not found
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
        // else call this.physicalCopiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(...)
        //      from the bookId from getBooksWithSummaryInfoByIdOrIsbn call
        //
        const [copiesResult, viewerContext] = await Promise.all([
            this.physicalCopiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(
                book._id,
            ),
            role === "student" && studentId
                ? this.booksRepository.getBookViewerContext(studentId, book._id)
                : Promise.resolve(null),
        ]);
        // pass to getBookByIdResponseDto constructor and call toResponse to filter out the fields (need implemenent getBookByIdResponseDto)
        const dto = new GetBookByIdResponseDto(
            book,
            copiesResult ?? [],
            viewerContext,
            role,
        );
        return dto.toResponseObject();
    }

    public async createBook(params: {
        title: string;
        author: string;
        isbn: string;
        category: string;
        keywords?: string[] | undefined;
        publisher?: string | undefined;
        genre?: string | undefined;
        publishedYear?: number | undefined;
        language?: string | undefined;
        format?: string | undefined;
        pageCount?: number | undefined;
        description?: string | undefined;
        coverImageUrl?: string | undefined;
        shelfReference?: string | undefined;
    }) {
        // will replace by return type
        // call this.booksRepository.getBookByIsbn(...), if exist, throw error
        const existing = await this.booksRepository.getBookByIsbn(params.isbn);
        if (existing) {
            throw serviceError(
                "DUPLICATE_ISBN",
                "A book with this ISBN already exists",
            );
        }
        // call this.booksRepository.createBook(...) and return BookEntity
        const created = await this.booksRepository.createBook({
            ...params,
            keywords: params.keywords ?? [],
            genre: params.genre ?? params.category,
            language: params.language ?? "English",
            format: params.format ?? "Paperback",
        });
        if (!created) {
            throw serviceError(
                "DUPLICATE_ISBN",
                "A book with this ISBN already exists",
            );
        }
        // call this.booksRepository.getBooksWithSummaryInfoById(...) to return BookeWithSummaryInfoEntity. BookId gets from BookEntity
        const summary = await this.booksRepository.getBooksWithSummaryInfoById(
            created._id,
        );
        if (!summary) {
            throw serviceError(
                "BOOK_NOT_FOUND",
                "Book not found after creation",
            );
        }
        return summary;
    }

    public async updateBookById(params: {
        bookId: string;
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
    }) {
        // will replace by return type
        // call this.booksRepository.getBookByIsbn(...), if exist, throw error
        const existingBook = await this.booksRepository.getBookById(
            params.bookId,
        );
        if (!existingBook) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
        const existingByIsbn = await this.booksRepository.getBookByIsbn(
            params.isbn,
        );
        if (existingByIsbn && existingByIsbn._id !== existingBook._id) {
            throw serviceError(
                "DUPLICATE_ISBN",
                "A book with this ISBN already exists",
            );
        }
        // call this.booksRepository.updateBookById(...) and return BookEntity
        const updated = await this.booksRepository.updateBookById(
            existingBook._id,
        );
        if (!updated) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
        // call this.booksRepository.getBooksWithSummaryInfoById(...) to return BookeWithSummaryInfoEntity. BookId gets from BookEntity
        const summary = await this.booksRepository.getBooksWithSummaryInfoById(
            updated._id,
        );
        if (!summary) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
        return summary;
    }

    public async deleteBookById(bookId: string): Promise<void> {
        // will replace by return type
        // call this.booksRepository.getBooksWithSummaryInfoById(...)
        const book =
            await this.booksRepository.getBooksWithSummaryInfoById(bookId);
        // If null, throw error Book not found
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
        // If not null, check if totalPhysicalCopies > 0 or totalLoanHistory > 0, throw error Book has physical copies or loan history and cannot be deleted
        const copies =
            (await this.physicalCopiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(
                book._id,
            )) ?? [];
        if (book.stockSummary.totalCopies > 0 || copies.length > 0) {
            throw serviceError(
                "BOOK_HAS_COPIES_OR_HISTORY",
                "This title has physical copies or loan history and cannot be deleted",
            );
        }
        // call this.booksRepository.deleteBookById(...) and return BookEntity
        const deleted = await this.booksRepository.deleteBookById(book._id);
        // If delete method return null, throw error
        if (!deleted) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
    }

    // Becare full bookId and copyId are different, bookId is for book entity, copyId is for physical copy entity

    public async addCopyToBook(params: {
        bookId: string;
        copyCode: string;
        homeLocation: string;
        initialState: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | undefined;
    }) {
        // will replace by return type
        // call this.bookRepository.getBookById(...), if not exist, throw error
        const book = await this.booksRepository.getBookById(params.bookId);
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
        // call this.physicalCopiesRepository.getPyhsicalCopy(...) with copyId null and copyCode, if exist, throw error
        const existingCopy =
            await this.physicalCopiesRepository.getPyhsicalCopy(
                null,
                params.copyCode,
            );
        if (existingCopy) {
            throw serviceError(
                "DUPLICATE_COPY_CODE",
                "Copy ID / barcode must be unique across the library",
            );
        }
        // call this.physicalCopiesRepository.addCopyToBookStock(...) and return PhysicalCopyEntity
        const createdCopy =
            await this.physicalCopiesRepository.addCopyToBookStock({
                ...params,
                bookId: book._id,
            });
        if (!createdCopy) {
            throw serviceError(
                "DUPLICATE_COPY_CODE",
                "Copy ID / barcode must be unique across the library",
            );
        }
        // call this.physicalCopiesRepository.getSummaryStockAfterAddCopyToBookStock(...) to return AddCopyToBookStockSummaryEntity. CopyId gets from PhysicalCopyEntity
        const updatedStockSummary =
            await this.physicalCopiesRepository.getSummaryStockAfterAddCopyToBookStock(
                createdCopy._id,
            );
        return {
            copy: {
                ...createdCopy,
                hasLoanHistory: false,
            },
            updatedStockSummary,
        };
    }

    public async updateCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
        homeLocation: string;
        state: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string;
    }) {
        // call this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(...),
        let targetCopyId = params.copyId;
        if (!targetCopyId) {
            if (!params.copyCode) {
                throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
            }
            const found = await this.physicalCopiesRepository.getPyhsicalCopy(
                null,
                params.copyCode,
            );
            if (!found) {
                throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
            }
            targetCopyId = found._id;
        }
        const copyWithState =
            await this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(
                targetCopyId,
            );
        //    if not exist, throw error
        if (!copyWithState) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }
        //    if exist and has active loan or hold, throw error
        if (
            copyWithState.state === "Borrowed" ||
            copyWithState.state === "Reserved"
        ) {
            throw serviceError(
                "COPY_HAS_ACTIVE_LOAN_OR_HOLD",
                "Complete the return or cancel the hold before changing this copy",
            );
        }
        // call this.physicalCopiesRepository.updatePhysicalCopy(...) and return PhysicalCopyEntity
        const updatedCopy =
            await this.physicalCopiesRepository.updatePhysicalCopy({
                copyId: copyWithState._id,
                copyCode: copyWithState.copyCode,
                homeLocation: params.homeLocation,
                state: params.state,
                condition: params.condition,
                notes: params.notes,
            });
        if (!updatedCopy) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }
        // call this.physicalCopiesRepository.getSummaryStockAfterUpdateCopyToBookStock(...) to return UpdateCopyToBookStockSummaryEntity. CopyId gets from PhysicalCopyEntity
        const updatedStockSummary =
            await this.physicalCopiesRepository.getSummaryStockAfterUpdateCopyToBookStock(
                updatedCopy._id,
            );
        return {
            copy: {
                ...updatedCopy,
                hasLoanHistory: copyWithState.hasLoanHistory,
            },
            updatedStockSummary,
        };
    }

    public async deleteCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
    }): Promise<void> {
        // call this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(...),
        let targetCopyId = params.copyId;
        if (!targetCopyId) {
            if (!params.copyCode) {
                throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
            }
            const found = await this.physicalCopiesRepository.getPyhsicalCopy(
                null,
                params.copyCode,
            );
            if (!found) {
                throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
            }
            targetCopyId = found._id;
        }
        const copyWithState =
            await this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(
                targetCopyId,
            );
        //    if not exist, throw error
        if (!copyWithState) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }
        //    if exist and has loan history, throw error
        if (
            copyWithState.state === "Borrowed" ||
            copyWithState.state === "Reserved" ||
            copyWithState.hasLoanHistory ||
            copyWithState.hasHoldHistory
        ) {
            throw serviceError(
                "COPY_HAS_LOAN_HISTORY",
                "This copy has loan history and cannot be deleted",
            );
        }
        // call this.physicalCopiesRepository.deletePhysicalCopyById(...) and return boolean
        const deleted =
            await this.physicalCopiesRepository.deletePhysicalCopyById(
                copyWithState._id,
                copyWithState.copyCode,
            );
        // If delete method return false, throw error
        if (!deleted) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }
    }
}
