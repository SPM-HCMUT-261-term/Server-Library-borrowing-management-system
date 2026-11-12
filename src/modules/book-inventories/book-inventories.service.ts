import type { BooksRepository, PhysicalCopiesRepository } from "./repositories/book-inventories.repository.interface";


class BookInventoriesService {
    constructor(
      private readonly booksRepository: BooksRepository,
      private readonly physicalCopiesRepository: PhysicalCopiesRepository
    ) {}

    public getFeaturedBooks(_params: {
        limit?: number;
    }): void // will replace by return type
    {
        // call this.booksRepository.getFeaturedBooks(...) to return to controller layer
        return;
    }

    public getBooks(_params: {
        q?: string;
        category?: string;
        genre?: string;
        language?: string;
        availableNow?: boolean;
        stock?: "all" | "available" | "unavailable";
        sortBy?: "relevance" | "title" | "publishedYear";
        page?: number;
        limit?: number;
    }): void // will replace by return type
    {
      // call this.booksRepository.getBooks(...) to return to controller layer
    }

    public getBookById(_id: string): void // not implemented currently bcz of the complexity query
    {

    }

    public createBook(_params: {
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
    }): void // will replace by return type
    {
      // call this.booksRepository.getBookByIsbn(...), if exist, throw error
      // call this.booksRepository.createBook(...) and return BookEntity
      // call this.booksRepository.getBooksWithSummaryInfoById(...) to return BookeWithSummaryInfoEntity. BookId gets from BookEntity
    }

    public updateBookById(_bookId: string): void // will replace by return type
    {
      // call this.booksRepository.getBookByIsbn(...), if exist, throw error
      // call this.booksRepository.updateBookById(...) and return BookEntity
      // call this.booksRepository.getBooksWithSummaryInfoById(...) to return BookeWithSummaryInfoEntity. BookId gets from BookEntity  
    }


    public deleteBookById(_bookId: string): void // will replace by return type
    {
      // call this.booksRepository.getBooksWithSummaryInfoById(...)
      // If null, throw error Book not found
      // If not null, check if totalPhysicalCopies > 0 or totalLoanHistory > 0, throw error Book has physical copies or loan history and cannot be deleted
      // call this.booksRepository.deleteBookById(...) and return BookEntity
      // If delete method return null, throw error
    }

    // Becare full bookId and copyId are different, bookId is for book entity, copyId is for physical copy entity

    public addCopyToBook(_params: {
        bookId: string;
        copyCode: string;
        homeLocation: string;
        initialState: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | undefined;
    }): void // will replace by return type
    {
      // call this.bookRepository.getBookById(...), if not exist, throw error
      // call this.physicalCopiesRepository.getPyhsicalCopy(...) with copyId null and copyCode, if exist, throw error
      // call this.physicalCopiesRepository.addCopyToBookStock(...) and return PhysicalCopyEntity
      // call this.physicalCopiesRepository.getSummaryStockAfterAddCopyToBookStock(...) to return AddCopyToBookStockSummaryEntity. CopyId gets from PhysicalCopyEntity
    }

    public updateCopy(_params: {
        copyId: string | undefined;
        copyCode: string | undefined;
        homeLocation: string;
        state: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | undefined;
    }): void // will replace by return type
    {
      // call this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(...), 
      //    if not exist, throw error
      //    if exist and has active loan or hold, throw error
      // call this.physicalCopiesRepository.updatePhysicalCopy(...) and return PhysicalCopyEntity
      // call this.physicalCopiesRepository.getSummaryStockAfterUpdateCopyToBookStock(...) to return UpdateCopyToBookStockSummaryEntity. CopyId gets from PhysicalCopyEntity
    }

    public deleteCopy(_params: {
        copyId: string | undefined;
        copyCode: string | undefined;  
    }): void // will replace by return type
    {
      // call this.physicalCopiesRepository.getPhysicalCopyWithLoanAndHoldStateById(...), 
      //    if not exist, throw error
      //    if exist and has loan history, throw error
      // call this.physicalCopiesRepository.deletePhysicalCopyById(...) and return boolean
      // If delete method return false, throw error
    }    
}

