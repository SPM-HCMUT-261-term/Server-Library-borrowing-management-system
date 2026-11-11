export type GetFeaturedBooksResultEntity = {
    _id: string,
    title: string,
    author: string,
    category: string,
    genre: string | null,
    coverImageUrl: string | null,
    shelfReference: string | null,
    stockSummary: {
        totalCopies: number,
        availableCopies: number,
        isAvailableNow: boolean,
    }
}



export type GetBooksResultEntity = {
    _id: string,
    title: string,
    author: string,
    isbn: string,
    category: string,
    genre: string | null,
    language: string,
    publisher: string | null,
    keywords: string[],
    coverImageUrl: string | null,
    shelfReference: string | null,
    stockSummary: {
        totalCopies: number,
        availableCopies: number,
        borrowedCopies: number,
        reservedCopies: number,
        isAvailableNow: boolean,
    }
}


export type BookEntity = {
    _id: string,
    title: string,
    author: string,
    isbn: string,
    category: string,
    genre: string | null,
    keywords: string[],
    publisher: string | null,
    publishedYear: number | null,
    language: string,
    format: string,
    pageCount: number | null,
    description: string | null,
    coverImageUrl: string | null,
    shelfReference: string | null,
    createdAt: string,
    updatedAt: string
}

// Which return by Create and Update Book Inventory API
export type BookeWithSummaryInfoEntity = {
    _id: string,
    title: string,
    author: string,
    isbn: string,
    category: string,
    genre: string | null,
    keywords: string[],
    publisher: string | null,
    publishedYear: number | null,
    language: string,
    format: string,
    pageCount: number | null,
    description: string | null,
    coverImageUrl: string | null,
    shelfReference: string | null,
    sectionName: string | null, //????
    stockSummary: {
        totalCopies: number,
        availableCopies: number,
        borrowedCopies: number,
        reservedCopies: number,
        damagedCopies: number,
        lostCopies: number,
        isAvailableNow: boolean,
    },
    createdAt: string,
    updatedAt: string
}



export type PhysicalCopyEntity = {
    _id: string,
    copyCode: string, // unique barcode across library, e.g., "WB-00421"
    bookId: string,
    homeLocation: string, // e.g., "FIC HAI · A3"
    state: "Available" | "Borrowed" | "Reserved" | "Damaged" | "Lost",
    condition: "Good" | "Damaged" | "Lost",
    notes: string | null, // e.g., "New paperback copy"
    createdAt: string,
    updatedAt: string
}

export type PhysicalWithLoanAndHoldStateEntity = PhysicalCopyEntity & {
    hasLoanHistory: boolean, // if true, copy deletion is disabled
    hasHoldHistory: boolean
}


export type AddCopyToBookStockSummaryEntity = {
    totalCopies: number,
    availableCopies: number,
    borrowedCopies: number,
}

export type UpdateCopyToBookStockSummaryEntity = {
    totalCopies: number,
    availableCopies: number,
    borrowedCopies: number,
    reservedCopies: number,
    damagedCopies: number,
    lostCopies: number,
}
