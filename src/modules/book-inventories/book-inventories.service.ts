import type { BooksRepository, PhysicalCopiesRepository } from "./repositories/book-inventories.repository.interface.js";
import type {
    GetFeaturedBooksResultEntity,
    GetBooksResultEntity,
    BookEntity,
    BookeWithSummaryInfoEntity,
    PhysicalCopyEntity,
    AddCopyToBookStockSummaryEntity,
    UpdateCopyToBookStockSummaryEntity
} from "./book-inventories.entity.js";

type ServiceError = Error & { code: string };
function serviceError(code: string, message: string): ServiceError {
    return Object.assign(new Error(message), { code });
}

export class BookInventoriesService {
    constructor(
        private readonly booksRepository: BooksRepository,
        private readonly physicalCopiesRepository: PhysicalCopiesRepository
    ) { }

    public getFeaturedBooks(params: {
        limit?: number;
    }): Promise<GetFeaturedBooksResultEntity[]> {
        // call this.booksRepository.getFeaturedBooks(...) to return to controller layer
        const limit = params.limit ?? 4;
        return this.booksRepository.getFeaturedBooks(limit);
    }

    public getBooks(params: {
        q?: string;
        category?: string;
        genre?: string;
        language?: string;
        availableNow?: boolean;
        stock?: "all" | "available" | "unavailable";
        sortBy?: "relevance" | "title" | "publishedYear";
        page?: number;
        limit?: number;
    }): Promise<GetBooksResultEntity[]> {
        // call this.booksRepository.getBooks(...) to return to controller layer
        return this.booksRepository.getBooks(
            params.q,
            params.category,
            params.genre,
            params.language,
            params.availableNow,
            params.stock,
            params.sortBy,
            params.page,
            params.limit
        );
    }


    public getBookById(
        id: string,
        role: "staff" | "student",
        studentId: string | null  // userId, not accountId. Null if role is staff
    ): Promise<Record<string, unknown>> {
        // call this.booksRepository.getBooksWithSummaryInfoByIdOrIsbn(...)
        // If null, throw error Book not found
        // else call this.physicalCopiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(...)
        //      from the bookId from getBooksWithSummaryInfoByIdOrIsbn call
        // 
        // pass to getBookByIdResponseDto constructor and call toResponse to filter out the fields (need implemenent getBookByIdResponseDto)
        const book = this.booksRepository.getBooksWithSummaryInfoByIdOrIsbn(id);
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        const rawCopies =
            (this.physicalCopiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(
                book._id
            )) ?? [];

        const viewerContext =
            role === "student" && studentId
                ? this.booksRepository.getBookViewerContext(studentId, book._id)
                : null;

        const {
            createdAt: _createdAt,
            updatedAt: _updatedAt,
            stockSummary: { isAvailableNow: _isAvailableNow, ...stockSummary },
            ...bookFields
        } = book;

        const copies = rawCopies.map((copy) => {
            const displayLocation =
                copy.state === "Borrowed"
                    ? "Currently with a reader"
                    : copy.state === "Reserved"
                        ? "Reserved at library counter"
                        : copy.homeLocation;

            const baseCopy = {
                _id: copy._id,
                copyCode: copy.copyCode,
                homeLocation: copy.homeLocation,
                state: copy.state,
                condition: copy.condition,
                displayLocation
            };

            if (role === "student") {
                return baseCopy;
            }

            return {
                ...baseCopy,
                activeLoan: copy.state === "Borrowed" ? copy.activeLoan : null,
                activeHold: copy.state === "Reserved" ? copy.activeHold : null,
                hasLoanHistory: copy.hasLoanHistory
            };
        });

        if (role === "student") {
            return {
                ...bookFields,
                stockSummary,
                copies,
                viewerContext
            };
        }

        const canDeleteTitle = rawCopies.length === 0;
        const hasLoanHistory = rawCopies.some((c) => c.hasLoanHistory);
        const deleteDisabledReason = canDeleteTitle
            ? null
            : hasLoanHistory
                ? "Unavailable: this title has physical copies and loan history. Borrowed copies and historical loans cannot be deleted."
                : "Unavailable: this title has physical copies and cannot be deleted.";

        return {
            ...bookFields,
            stockSummary,
            canDeleteTitle,
            deleteDisabledReason,
            copies
        };
    }

    public createBook(params: {
        title: string;
        author: string;
        isbn: string;
        category: string;
        keywords?: string[];
        publisher?: string;
        genre?: string;
        publishedYear?: number;
        language?: string;
        format?: string;
        pageCount?: number;
        description?: string;
        coverImageUrl?: string;
        shelfReference?: string;
    }): Promise<BookeWithSummaryInfoEntity> {
        // call this.booksRepository.getBookByIsbn(...), if exist, throw error
        // call this.booksRepository.createBook(...) and return BookEntity
        // call this.booksRepository.getBooksWithSummaryInfoById(...) to return BookeWithSummaryInfoEntity. BookId gets from BookEntity
        const existingBook = this.booksRepository.getBookByIsbn(params.isbn);
        if (existingBook) {
            throw serviceError("DUPLICATE_ISBN", "A book with this ISBN already exists");
        }

        const createdBook = this.booksRepository.createBook(params);
        if (!createdBook) {
            throw serviceError("INTERNAL_SERVER_ERROR", "Failed to create book");
        }

        const bookWithSummary = this.booksRepository.getBooksWithSummaryInfoById(createdBook._id);
        if (!bookWithSummary) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        return bookWithSummary;
    }

    public updateBookById(
        bookId: string,
        params: {
            title: string;
            author: string;
            isbn: string;
            category: string;
            publisher?: string | null;
            keywords?: string[];
            genre?: string | null;
            publishedYear?: number | null;
            language?: string;
            format?: string;
            pageCount?: number | null;
            description?: string | null;
            coverImageUrl?: string | null;
            shelfReference?: string | null;
        }
    ): Promise<BookeWithSummaryInfoEntity> {
        // call this.booksRepository.getBookByIsbn(...), if exist, throw error
        // call this.booksRepository.updateBookById(...) and return BookEntity
        // call this.booksRepository.getBooksWithSummaryInfoById(...) to return BookeWithSummaryInfoEntity. BookId gets from BookEntity  
        const existingBook = this.booksRepository.getBookByIsbn(params.isbn);
        if (existingBook && existingBook._id !== bookId) {
            throw serviceError("DUPLICATE_ISBN", "A book with this ISBN already exists");
        }

        const updatedBook = (
            this.booksRepository.updateBookById as (
                id: string,
                data?: typeof params
            ) => Promise<BookEntity | null>
        )(bookId, params);
        if (!updatedBook) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        const bookWithSummary = this.booksRepository.getBooksWithSummaryInfoById(updatedBook._id);
        if (!bookWithSummary) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        return bookWithSummary;
    }


    public deleteBookById(bookId: string): Promise<BookEntity> {
        // call this.booksRepository.getBooksWithSummaryInfoById(...)
        // If null, throw error Book not found
        // If not null, check if totalPhysicalCopies > 0 or totalLoanHistory > 0, throw error Book has physical copies or loan history and cannot be deleted
        // call this.booksRepository.deleteBookById(...) and return BookEntity
        // If delete method return null, throw error
        const book = this.booksRepository.getBooksWithSummaryInfoById(bookId);
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        const totalPhysicalCopies =
            (book as { totalPhysicalCopies?: number }).totalPhysicalCopies ??
            book.stockSummary.totalCopies;
        const totalLoanHistory =
            (book as { totalLoanHistory?: number }).totalLoanHistory ?? 0;

        if (totalPhysicalCopies > 0 || totalLoanHistory > 0) {
            throw serviceError(
                "BOOK_HAS_COPIES_OR_HISTORY",
                "This title has physical copies or loan history and cannot be deleted"
            );
        }

        const deletedBook = this.booksRepository.deleteBookById(bookId);
        if (!deletedBook) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        return deletedBook;
    }

    // Becare full bookId and copyId are different, bookId is for book entity, copyId is for physical copy entity

    public addCopyToBook(params: {
        bookId: string;
        copyCode: string;
        homeLocation: string;
        initialState: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | undefined;
    }): Promise<{
        copy: PhysicalCopyEntity;
        updatedStockSummary: AddCopyToBookStockSummaryEntity;
    }> {
        // call this.bookRepository.getBookById(...), if not exist, throw error
        // call this.physicalCopiesRepository.getPyhsicalCopy(...) with copyId null and copyCode, if exist, throw error
        // call this.physicalCopiesRepository.addCopyToBookStock(...) and return PhysicalCopyEntity
        // call this.physicalCopiesRepository.getSummaryStockAfterAddCopyToBookStock(...) to return AddCopyToBookStockSummaryEntity. CopyId gets from PhysicalCopyEntity
        const book = this.booksRepository.getBookById(params.bookId);
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        const existingCopy = this.physicalCopiesRepository.getPyhsicalCopy(null, params.copyCode);
        if (existingCopy) {
            throw serviceError(
                "DUPLICATE_COPY_CODE",
                "Copy ID / barcode must be unique across the library"
            );
        }

        const createdCopy = this.physicalCopiesRepository.addCopyToBookStock(params);
        if (!createdCopy) {
            throw serviceError("INTERNAL_SERVER_ERROR", "Failed to add physical copy");
        }

        const updatedStockSummary =
            this.physicalCopiesRepository.getSummaryStockAfterAddCopyToBookStock(
                createdCopy._id
            );
        if (!updatedStockSummary) {
            throw serviceError("INTERNAL_SERVER_ERROR", "Failed to get updated stock summary");
        }

        return {
            copy: createdCopy,
            updatedStockSummary
        };
    }

    public updateCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
        homeLocation: string;
        state: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string;
    }): Promise<{
        copy: PhysicalCopyEntity;
        updatedStockSummary: UpdateCopyToBookStockSummaryEntity;
    }> {
        // call this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(...), 
        //    if not exist, throw error
        //    if exist and has active loan or hold, throw error
        // call this.physicalCopiesRepository.updatePhysicalCopy(...) and return PhysicalCopyEntity
        // call this.physicalCopiesRepository.getSummaryStockAfterUpdateCopyToBookStock(...) to return UpdateCopyToBookStockSummaryEntity. CopyId gets from PhysicalCopyEntity
        const targetId = params.copyId ?? params.copyCode ?? "";
        const existingCopy =
            this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(targetId);
        if (!existingCopy) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }

        if (existingCopy.state === "Borrowed" || existingCopy.state === "Reserved") {
            throw serviceError(
                "COPY_HAS_ACTIVE_LOAN_OR_HOLD",
                "Complete the return or cancel the hold before changing this copy"
            );
        }

        const updatedCopy = this.physicalCopiesRepository.updatePhysicalCopy({
            ...params,
            copyId: params.copyId ?? existingCopy._id,
            copyCode: params.copyCode ?? existingCopy.copyCode
        });
        if (!updatedCopy) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }

        const updatedStockSummary =
            this.physicalCopiesRepository.getSummaryStockAfterUpdateCopyToBookStock(
                updatedCopy._id
            );
        if (!updatedStockSummary) {
            throw serviceError("INTERNAL_SERVER_ERROR", "Failed to get updated stock summary");
        }

        return {
            copy: updatedCopy,
            updatedStockSummary
        };
    }

    public deleteCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
    }): Promise<boolean> {
        // call this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(...), 
        //    if not exist, throw error
        //    if exist and has loan history, throw error
        // call this.physicalCopiesRepository.deletePhysicalCopyById(...) and return boolean
        // If delete method return false, throw error
        const targetId = params.copyId ?? params.copyCode ?? "";
        const existingCopy =
            this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(targetId);
        if (!existingCopy) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }

        if (
            existingCopy.hasLoanHistory ||
            existingCopy.hasHoldHistory ||
            existingCopy.state === "Borrowed" ||
            existingCopy.state === "Reserved"
        ) {
            throw serviceError(
                "COPY_HAS_LOAN_HISTORY",
                "This copy has loan history and cannot be deleted"
            );
        }

        const deleted = this.physicalCopiesRepository.deletePhysicalCopyById(
            params.copyId ?? existingCopy._id,
            params.copyCode ?? existingCopy.copyCode
        );
        if (!deleted) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }

        return deleted;
    }
}
