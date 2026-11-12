
import type { deleteBook } from "../book-inventories.controller";
import type { 
    GetFeaturedBooksResultEntity, 
    GetBooksResultEntity, 
    BookEntity, 
    BookeWithSummaryInfoEntity,
    PhysicalCopyEntity,
    PhysicalWithLoanAndHoldStateEntity,
    AddCopyToBookStockSummaryEntity,
    UpdateCopyToBookStockSummaryEntity
}  from "../book-inventories.entity";


export interface BooksRepository {
    // Keep the name of columns in query result, then map to entity to return to service layer for easier to read code.
    // Query methods
    getFeaturedBooks(limit: number): Promise<GetFeaturedBooksResultEntity[]>;

    getBooks(
        type_query?: string | undefined,
        category_query?: string | undefined,
        genre_query?: string | undefined,
        language_query?: string | undefined,
        availableNow_query?: boolean | undefined,
        stock_query?: string | undefined,
        sortBy_query?: string | undefined,
        page_query?: number | undefined,
        limit_query?: number | undefined
    ): Promise<GetBooksResultEntity[]>;

    getBookById(bookId: string): Promise<BookEntity | null>;

    getBooksWithSummaryInfoById(bookId: string): Promise<BookeWithSummaryInfoEntity | null>;

    getBookByIsbn(isbn: string): Promise<BookEntity | null>;

    // CUD methods
    createBook(params: {
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
    }): Promise<BookEntity | null>;
    // Return Entity if success, else null.


    updateBookById(bookId: string): Promise<BookEntity | null>;
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
        notes?: string | undefined;
    }): Promise<PhysicalCopyEntity | null>;
    // Return Entity if success, else null.

    deletePhysicalCopyById(
        copyId: string | undefined,
        copyCode: string | undefined
    ): Promise<boolean>;
    // Return true if success, else false.
}

