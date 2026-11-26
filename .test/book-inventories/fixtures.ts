// Facts about src/shared/database/init.sql that the book-inventories API tests rely on.
// POST /dev/reset-db uses TRUNCATE ... RESTART IDENTITY, so the SERIAL ids below are the same
// after every reset (books and copies are numbered in insertion order).
//
//  id  title                        category        lang        year  copies (state)                              available
//  --  ---------------------------  --------------  ----------  ----  ------------------------------------------  ---------
//   1  The Midnight Library         Fiction         English     2020  421 Av, 422 Av, 423 Bor (BR-2090), 424 Bor  2 / 4
//   2  The Book Thief               Fiction         English     2005  101 Av, 102 Bor, 103 Bor                    1 / 3
//   3  The Hobbit                   Fiction         English     1937  318 Bor, 319 Bor, 320 Bor                   0 / 3
//   4  The House on Mango Street    Fiction         English     1984  511 Av, 512 Bor                             1 / 2
//   5  A Wrinkle in Time            Fiction         English     1962  701 Av, 702 Av, 703 Av, 704 Bor             3 / 4
//   6  The Giver                    Fiction         English     1993  801 Bor, 802 Bor                            0 / 2
//   7  A Brief History of Time      Non-fiction     English     1988  632 Bor, 633 Av                             1 / 2
//   8  Wonder                       Graphic novels  English     2012  216 Bor (Maya), 217 Av                      1 / 2
//   9  Devotions: Selected Poems    Poetry          English     2017  901 Av, 902 Av                              2 / 2
//  10  Dế Mèn Phiêu Lưu Ký          Reference       Vietnamese  1941  951 Av                                      1 / 1
//
//  Copy WB-00422 has only a returned loan (BR-2040). WB-00424 is Borrowed but has no loan row.
//  Copy ids run 1..25 in the order of the table above (WB-00421 = 1, ..., WB-00951 = 25).

export const BOOK_ID = {
    midnightLibrary: "1",
    bookThief: "2",
    hobbit: "3",
    mangoStreet: "4",
    wrinkleInTime: "5",
    giver: "6",
    briefHistory: "7",
    wonder: "8",
    devotions: "9",
    deMen: "10"
} as const;

export const ISBN = {
    midnightLibrary: "9781786892737",
    hobbit: "9780261103344"
} as const;

export const COPY = {
    midnightAvailable: "WB-00421", // id 1, no loan history
    midnightReturnedLoan: "WB-00422", // id 2, Available, one returned loan
    midnightBorrowed: "WB-00423", // id 3, active loan BR-2090 (Amira)
    midnightBorrowedNoLoan: "WB-00424", // id 4, Borrowed state without a loan row
    wonderBorrowed: "WB-00216",
    wonderAvailable: "WB-00217",
    deMenAvailable: "WB-00951" // id 25, no loans
} as const;

export const COPY_ID = {
    midnightAvailable: "1",
    deMenAvailable: "25"
} as const;

/** A title that is not in init.sql, for create/delete tests. */
export const NEW_BOOK = {
    title: "Temporary Title",
    author: "Test Author",
    isbn: "9780000000123",
    category: "Reference"
} as const;

/** Body that PUT /copies/:id accepts for WB-00421, before a test changes one field. */
export const AVAILABLE_COPY_BODY = {
    homeLocation: "FIC HAI · A3",
    state: "Available",
    condition: "Good"
} as const;

export const UNKNOWN_ID = "9999";
export const UNKNOWN_COPY = "WB-99999";
