import type {
    BooksRepository,
    GetBooksParams,
    PhysicalCopiesRepository
} from "./repositories/book-inventories.repository.interface.js";
import type {
    BookeWithSummaryInfoEntity,
    PhysicalCopyEntity
} from "./book-inventories.entity.js";

type ServiceError = Error & { code: string };
function serviceError(code: string, message: string): ServiceError {
    return Object.assign(new Error(message), { code });
}

const DEFAULT_FEATURED_LIMIT = 4;
const DEFAULT_PAGE = 1;
const DEFAULT_LIST_LIMIT = 6;

// ---------------------------------------------------------------------------
// Result types: plain objects returned straight to the controller.
// They only contain the fields the API contract exposes (entity-only fields such
// as bookId / createdAt / updatedAt / isAvailableNow are filtered out where the
// contract does not list them).
// ---------------------------------------------------------------------------

type CopyState = "Available" | "Borrowed" | "Reserved" | "Damaged" | "Lost";
type CopyCondition = "Good" | "Damaged" | "Lost";

type PaginationResult = {
    totalItems: number;
    currentPage: number;
    totalPages: number;
    limit: number;
};

// 4.1 GET /books/featured
export type FeaturedBookResult = {
    _id: string;
    title: string;
    author: string;
    category: string;
    genre: string | null;
    coverImageUrl: string | null;
    shelfReference: string | null;
    stockSummary: {
        totalCopies: number;
        availableCopies: number;
        isAvailableNow: boolean;
    };
};

// 4.2 GET /books
export type BookListItemResult = {
    _id: string;
    title: string;
    author: string;
    isbn: string;
    category: string;
    genre: string | null;
    language: string;
    publisher: string | null;
    keywords: string[];
    coverImageUrl: string | null;
    shelfReference: string | null;
    stockSummary: {
        totalCopies: number;
        availableCopies: number;
        borrowedCopies: number;
        reservedCopies: number;
        isAvailableNow: boolean;
    };
};

export type BookListResult = {
    items: BookListItemResult[];
    pagination: PaginationResult;
};

// 4.3 GET /books/:id
type BookDetailBaseResult = {
    _id: string;
    title: string;
    author: string;
    isbn: string;
    category: string;
    genre: string | null;
    keywords: string[];
    description: string | null;
    publisher: string | null;
    publishedYear: number | null;
    format: string;
    language: string;
    pageCount: number | null;
    coverImageUrl: string | null;
    shelfReference: string | null;
    stockSummary: {
        totalCopies: number;
        availableCopies: number;
        borrowedCopies: number;
        reservedCopies: number;
        damagedCopies: number;
        lostCopies: number;
    };
};

type CopyDisplayResult = {
    _id: string;
    copyCode: string;
    homeLocation: string;
    state: CopyState;
    condition: CopyCondition;
    displayLocation: string;
};

export type StudentBookDetailResult = BookDetailBaseResult & {
    copies: CopyDisplayResult[];
    viewerContext: {
        canBorrow: boolean;
        canRequestHold: boolean;
        blockReason: string | null;
        activeLoansCount: number;
        maxLoansLimit: number;
        existingHoldCode: string | null;
    } | null;
};

export type StaffBookDetailResult = BookDetailBaseResult & {
    canDeleteTitle: boolean;
    deleteDisabledReason: string | null;
    copies: (CopyDisplayResult & {
        activeLoan: {
            borrowCode: string;
            studentName: string;
            studentAccountId: string;
            dueDate: string;
        } | null;
        activeHold: {
            holdCode: string;
            studentName: string;
            studentAccountId: string;
            collectBy: string;
        } | null;
        hasLoanHistory: boolean;
    })[];
};

export type BookDetailResult = StudentBookDetailResult | StaffBookDetailResult;

// 4.4 POST /books, 4.5 PUT /books/:id  (Section 2.2 Book object)
export type BookWithStockResult = {
    _id: string;
    title: string;
    author: string;
    isbn: string;
    category: string;
    genre: string | null;
    keywords: string[];
    publisher: string | null;
    publishedYear: number | null;
    language: string;
    format: string;
    pageCount: number | null;
    description: string | null;
    coverImageUrl: string | null;
    shelfReference: string | null;
    stockSummary: {
        totalCopies: number;
        availableCopies: number;
        borrowedCopies: number;
        reservedCopies: number;
        damagedCopies: number;
        lostCopies: number;
        isAvailableNow: boolean;
    };
    createdAt: string;
    updatedAt: string;
};

// 5.1 / 5.2 (Section 2.3 PhysicalCopy object)
export type PhysicalCopyResult = {
    _id: string;
    copyCode: string;
    bookId: string;
    homeLocation: string;
    state: CopyState;
    condition: CopyCondition;
    notes: string | null;
    hasLoanHistory: boolean;
    createdAt: string;
    updatedAt: string;
};

export type AddCopyResult = {
    copy: PhysicalCopyResult;
    updatedStockSummary: {
        totalCopies: number;
        availableCopies: number;
        borrowedCopies: number;
    };
};

export type UpdateCopyResult = {
    copy: PhysicalCopyResult;
    updatedStockSummary: {
        totalCopies: number;
        availableCopies: number;
        borrowedCopies: number;
        reservedCopies: number;
        damagedCopies: number;
        lostCopies: number;
    };
};

// ---------------------------------------------------------------------------
// Mapping helpers (filter entity fields down to what the contract exposes)
// ---------------------------------------------------------------------------

function toBookWithStockResult(book: BookeWithSummaryInfoEntity): BookWithStockResult {
    return {
        _id: book._id,
        title: book.title,
        author: book.author,
        isbn: book.isbn,
        category: book.category,
        genre: book.genre,
        keywords: book.keywords,
        publisher: book.publisher,
        publishedYear: book.publishedYear,
        language: book.language,
        format: book.format,
        pageCount: book.pageCount,
        description: book.description,
        coverImageUrl: book.coverImageUrl,
        shelfReference: book.shelfReference,
        stockSummary: {
            totalCopies: book.stockSummary.totalCopies,
            availableCopies: book.stockSummary.availableCopies,
            borrowedCopies: book.stockSummary.borrowedCopies,
            reservedCopies: book.stockSummary.reservedCopies,
            damagedCopies: book.stockSummary.damagedCopies,
            lostCopies: book.stockSummary.lostCopies,
            isAvailableNow: book.stockSummary.isAvailableNow
        },
        createdAt: book.createdAt,
        updatedAt: book.updatedAt
    };
}

function toPhysicalCopyResult(
    copy: PhysicalCopyEntity,
    hasLoanHistory: boolean
): PhysicalCopyResult {
    return {
        _id: copy._id,
        copyCode: copy.copyCode,
        bookId: copy.bookId,
        homeLocation: copy.homeLocation,
        state: copy.state,
        condition: copy.condition,
        notes: copy.notes,
        hasLoanHistory,
        createdAt: copy.createdAt,
        updatedAt: copy.updatedAt
    };
}

function copyDisplayLocation(state: CopyState, homeLocation: string): string {
    if (state === "Borrowed") return "Currently with a reader";
    if (state === "Reserved") return "Reserved at library counter";
    return homeLocation;
}

export class BookInventoriesService {
    constructor(
        private readonly booksRepository: BooksRepository,
        private readonly physicalCopiesRepository: PhysicalCopiesRepository
    ) { }

    public async getFeaturedBooks(params: {
        limit?: number | undefined;
    }): Promise<FeaturedBookResult[]> {
        const books = await this.booksRepository.getFeaturedBooks(
            params.limit ?? DEFAULT_FEATURED_LIMIT
        );

        return books.map((book) => ({
            _id: book._id,
            title: book.title,
            author: book.author,
            category: book.category,
            genre: book.genre,
            coverImageUrl: book.coverImageUrl,
            shelfReference: book.shelfReference,
            stockSummary: {
                totalCopies: book.stockSummary.totalCopies,
                availableCopies: book.stockSummary.availableCopies,
                isAvailableNow: book.stockSummary.isAvailableNow
            }
        }));
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
    }): Promise<BookListResult> {
        const page = params.page ?? DEFAULT_PAGE;
        const limit = params.limit ?? DEFAULT_LIST_LIMIT;

        // GetBooksParams uses plain optional props (exactOptionalPropertyTypes),
        // so undefined values are left out instead of being passed explicitly.
        const repositoryParams: GetBooksParams = {
            page,
            limit,
            ...(params.q !== undefined ? { q: params.q } : {}),
            ...(params.category !== undefined ? { category: params.category } : {}),
            ...(params.genre !== undefined ? { genre: params.genre } : {}),
            ...(params.language !== undefined ? { language: params.language } : {}),
            ...(params.availableNow !== undefined ? { availableNow: params.availableNow } : {}),
            ...(params.stock !== undefined ? { stock: params.stock } : {}),
            ...(params.sortBy !== undefined ? { sortBy: params.sortBy } : {})
        };

        const { books, totalItems } = await this.booksRepository.getBooks(repositoryParams);

        return {
            items: books.map((book) => ({
                _id: book._id,
                title: book.title,
                author: book.author,
                isbn: book.isbn,
                category: book.category,
                genre: book.genre,
                language: book.language,
                publisher: book.publisher,
                keywords: book.keywords,
                coverImageUrl: book.coverImageUrl,
                shelfReference: book.shelfReference,
                stockSummary: {
                    totalCopies: book.stockSummary.totalCopies,
                    availableCopies: book.stockSummary.availableCopies,
                    borrowedCopies: book.stockSummary.borrowedCopies,
                    reservedCopies: book.stockSummary.reservedCopies,
                    isAvailableNow: book.stockSummary.isAvailableNow
                }
            })),
            pagination: {
                totalItems,
                currentPage: page,
                totalPages: Math.ceil(totalItems / limit),
                limit
            }
        };
    }

    public async getBookById(
        id: string,
        role: "staff" | "student",
        studentId: string | null // userId, not accountId. Null if role is staff
    ): Promise<BookDetailResult> {
        const book = await this.booksRepository.getBooksWithSummaryInfoByIdOrIsbn(id);
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        const rawCopies =
            (await this.physicalCopiesRepository.getPhysicalCopiesByBookIdWithActiveLoanAndHold(
                book._id
            )) ?? [];

        // Common fields. createdAt / updatedAt / stockSummary.isAvailableNow are dropped.
        const detail: BookDetailBaseResult = {
            _id: book._id,
            title: book.title,
            author: book.author,
            isbn: book.isbn,
            category: book.category,
            genre: book.genre,
            keywords: book.keywords,
            description: book.description,
            publisher: book.publisher,
            publishedYear: book.publishedYear,
            format: book.format,
            language: book.language,
            pageCount: book.pageCount,
            coverImageUrl: book.coverImageUrl,
            shelfReference: book.shelfReference,
            stockSummary: {
                totalCopies: book.stockSummary.totalCopies,
                availableCopies: book.stockSummary.availableCopies,
                borrowedCopies: book.stockSummary.borrowedCopies,
                reservedCopies: book.stockSummary.reservedCopies,
                damagedCopies: book.stockSummary.damagedCopies,
                lostCopies: book.stockSummary.lostCopies
            }
        };

        if (role === "student") {
            const viewerContext = studentId
                ? await this.booksRepository.getBookViewerContext(studentId, book._id)
                : null;

            // Student view: no borrower/hold details, no bookId/notes/timestamps.
            return {
                ...detail,
                copies: rawCopies.map((copy) => ({
                    _id: copy._id,
                    copyCode: copy.copyCode,
                    homeLocation: copy.homeLocation,
                    state: copy.state,
                    condition: copy.condition,
                    displayLocation: copyDisplayLocation(copy.state, copy.homeLocation)
                })),
                viewerContext: viewerContext
                    ? {
                        canBorrow: viewerContext.canBorrow,
                        canRequestHold: viewerContext.canRequestHold,
                        blockReason: viewerContext.blockReason,
                        activeLoansCount: viewerContext.activeLoansCount,
                        maxLoansLimit: viewerContext.maxLoansLimit,
                        existingHoldCode: viewerContext.existingHoldCode
                    }
                    : null
            };
        }

        const canDeleteTitle = rawCopies.length === 0;
        const titleHasLoanHistory = rawCopies.some((copy) => copy.hasLoanHistory);
        const deleteDisabledReason = canDeleteTitle
            ? null
            : titleHasLoanHistory
                ? "Unavailable: this title has physical copies and loan history. Borrowed copies and historical loans cannot be deleted."
                : "Unavailable: this title has physical copies and cannot be deleted.";

        // Staff view: borrower/hold details only when the copy is actually borrowed/reserved.
        return {
            ...detail,
            canDeleteTitle,
            deleteDisabledReason,
            copies: rawCopies.map((copy) => ({
                _id: copy._id,
                copyCode: copy.copyCode,
                homeLocation: copy.homeLocation,
                state: copy.state,
                condition: copy.condition,
                displayLocation: copyDisplayLocation(copy.state, copy.homeLocation),
                activeLoan:
                    copy.state === "Borrowed" && copy.activeLoan
                        ? {
                            borrowCode: copy.activeLoan.borrowCode,
                            studentName: copy.activeLoan.studentName,
                            studentAccountId: copy.activeLoan.studentAccountId,
                            dueDate: copy.activeLoan.dueDate
                        }
                        : null,
                activeHold:
                    copy.state === "Reserved" && copy.activeHold
                        ? {
                            holdCode: copy.activeHold.holdCode,
                            studentName: copy.activeHold.studentName,
                            studentAccountId: copy.activeHold.studentAccountId,
                            collectBy: copy.activeHold.collectBy
                        }
                        : null,
                hasLoanHistory: copy.hasLoanHistory
            }))
        };
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
    }): Promise<BookWithStockResult> {
        const existingBook = await this.booksRepository.getBookByIsbn(params.isbn);
        if (existingBook) {
            throw serviceError("DUPLICATE_ISBN", "A book with this ISBN already exists");
        }

        const createdBook = await this.booksRepository.createBook(params);
        if (!createdBook) {
            // The INSERT uses ON CONFLICT (isbn) DO NOTHING, so null means another
            // request created the same ISBN between our check and the insert.
            throw serviceError("DUPLICATE_ISBN", "A book with this ISBN already exists");
        }

        const bookWithSummary = await this.booksRepository.getBooksWithSummaryInfoById(createdBook._id);
        if (!bookWithSummary) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        return toBookWithStockResult(bookWithSummary);
    }

    public async updateBookById(
        bookId: string,
        params: {
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
    ): Promise<BookWithStockResult> {
        const existingBook = await this.booksRepository.getBookByIsbn(params.isbn);
        if (existingBook && existingBook._id !== bookId) {
            throw serviceError("DUPLICATE_ISBN", "A book with this ISBN already exists");
        }

        const updatedBook = await this.booksRepository.updateBookById(bookId, params);
        if (!updatedBook) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        const bookWithSummary = await this.booksRepository.getBooksWithSummaryInfoById(updatedBook._id);
        if (!bookWithSummary) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        return toBookWithStockResult(bookWithSummary);
    }

    public async deleteBookById(bookId: string): Promise<void> {
        const book = await this.booksRepository.getBooksWithSummaryInfoById(bookId);
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        // A title with no copies cannot have loan history (copies with loans can never
        // be deleted), and deleteBookById's SQL re-checks both conditions atomically.
        if (book.stockSummary.totalCopies > 0) {
            throw serviceError(
                "BOOK_HAS_COPIES_OR_HISTORY",
                "This title has physical copies or loan history and cannot be deleted"
            );
        }

        const deletedBook = await this.booksRepository.deleteBookById(bookId);
        if (!deletedBook) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }
    }

    // Be careful: bookId and copyId are different. bookId is for the book entity, copyId is for the physical copy entity.

    public async addCopyToBook(params: {
        bookId: string;
        copyCode: string;
        homeLocation: string;
        initialState: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | undefined;
    }): Promise<AddCopyResult> {
        const book = await this.booksRepository.getBookById(params.bookId);
        if (!book) {
            throw serviceError("BOOK_NOT_FOUND", "Book not found");
        }

        const existingCopy = await this.physicalCopiesRepository.getPyhsicalCopy(null, params.copyCode);
        if (existingCopy) {
            throw serviceError(
                "DUPLICATE_COPY_CODE",
                "Copy ID / barcode must be unique across the library"
            );
        }

        const createdCopy = await this.physicalCopiesRepository.addCopyToBookStock(params);
        if (!createdCopy) {
            throw serviceError("INTERNAL_SERVER_ERROR", "Failed to add physical copy");
        }

        const stockSummary =
            await this.physicalCopiesRepository.getSummaryStockAfterAddCopyToBookStock(
                createdCopy._id
            );
        if (!stockSummary) {
            throw serviceError("INTERNAL_SERVER_ERROR", "Failed to get updated stock summary");
        }

        return {
            // A copy that was just created cannot have any loan history yet.
            copy: toPhysicalCopyResult(createdCopy, false),
            updatedStockSummary: {
                totalCopies: stockSummary.totalCopies,
                availableCopies: stockSummary.availableCopies,
                borrowedCopies: stockSummary.borrowedCopies
            }
        };
    }

    public async updateCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
        homeLocation: string;
        state: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | null | undefined;
    }): Promise<UpdateCopyResult> {
        const targetId = params.copyId ?? params.copyCode ?? "";
        const existingCopy =
            await this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(targetId);
        if (!existingCopy) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }

        if (existingCopy.state === "Borrowed" || existingCopy.state === "Reserved") {
            throw serviceError(
                "COPY_HAS_ACTIVE_LOAN_OR_HOLD",
                "Complete the return or cancel the hold before changing this copy"
            );
        }

        const updatedCopy = await this.physicalCopiesRepository.updatePhysicalCopy({
            copyId: existingCopy._id,
            copyCode: existingCopy.copyCode,
            homeLocation: params.homeLocation,
            state: params.state,
            condition: params.condition,
            notes: params.notes
        });
        if (!updatedCopy) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }

        const stockSummary =
            await this.physicalCopiesRepository.getSummaryStockAfterUpdateCopyToBookStock(
                updatedCopy._id
            );
        if (!stockSummary) {
            throw serviceError("INTERNAL_SERVER_ERROR", "Failed to get updated stock summary");
        }

        return {
            copy: toPhysicalCopyResult(updatedCopy, existingCopy.hasLoanHistory),
            updatedStockSummary: {
                totalCopies: stockSummary.totalCopies,
                availableCopies: stockSummary.availableCopies,
                borrowedCopies: stockSummary.borrowedCopies,
                reservedCopies: stockSummary.reservedCopies,
                damagedCopies: stockSummary.damagedCopies,
                lostCopies: stockSummary.lostCopies
            }
        };
    }

    public async deleteCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
    }): Promise<void> {
        const targetId = params.copyId ?? params.copyCode ?? "";
        const existingCopy =
            await this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(targetId);
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

        const deleted = await this.physicalCopiesRepository.deletePhysicalCopyById(
            existingCopy._id,
            existingCopy.copyCode
        );
        if (!deleted) {
            throw serviceError("COPY_NOT_FOUND", "Physical copy not found");
        }
    }
}