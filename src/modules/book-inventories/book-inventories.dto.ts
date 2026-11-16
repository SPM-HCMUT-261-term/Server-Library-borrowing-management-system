import type { BookEntity, PhysicalCopyEntityWithActiveLoanAndHold, BookViewerContextEntity } from "./book-inventories.entity";
/*
4.3 getBookById: (GET) /books/:id
Access: Authenticated (student | staff)
Description: Returns complete details for a single book title, its derived stock counts, and its list of physical copies.
For Students (StudentView Page 3): Includes viewerContext (whether the student can borrow/request a hold and how many loans they have used) and masks borrower identities on loaned copies (displayLocation: "Currently with a reader").
For Staff (StaffView Page 8): Includes canDeleteTitle and full borrower/due-date details on each physical copy (Maya Chen · S10428, 29 Oct · BR-2112) plus hasLoanHistory per copy.
Request Params:
+ id: string (Book _id or isbn)
Response Data (200 OK):
+ success: boolean
+ data: bookDetail
Properties of bookDetail:
+ _id: string
+ title: string
+ author: string
+ isbn: string
+ category: string
+ genre: string | null
+ keywords: array of string
+ description: string | null
+ publisher: string | null
+ publishedYear: int | null
+ format: string (e.g., "Paperback")
+ language: string (e.g., "English")
+ pageCount: int | null (e.g., 304)
+ coverImageUrl: string | null
+ shelfReference: string | null (e.g., "FIC HAI · A3")
+ sectionName: string | null (e.g., "Fiction section · Main library")
+ stockSummary: Object
Properties of stockSummary:
+ totalCopies: int
+ availableCopies: int
+ borrowedCopies: int
+ reservedCopies: int
+ damagedCopies: int
+ lostCopies: int
+ canDeleteTitle: boolean (Staff helper: true only if totalCopies === 0 and title has no historical loans)
+ deleteDisabledReason: string | null (e.g., "Unavailable: this title has physical copies and loan history. Borrowed copies and historical loans cannot be deleted.")
+ copies: array of Object
Properties of Object:
+ _id: string
+ copyCode: string (e.g., "WB-00421")
+ homeLocation: string (e.g., "FIC HAI · A3")
+ state: string ("Available" | "Borrowed" | "Reserved" | "Damaged" | "Lost")
+ condition: string ("Good" | "Damaged" | "Lost")
+ displayLocation: string (Student view: "FIC HAI · A3" when available, or "Currently with a reader" when on loan)
+ activeLoan: Object | null (Populated for Staff role only when state === "Borrowed")
Properties of activeLoan:
+ borrowCode: string (e.g., "BR-2112")
+ studentName: string (e.g., "Maya Chen")
+ studentAccountId: string (e.g., "S10428")
+ dueDate: string (ISO date, e.g., "2026-10-29")
+ activeHold: Object | null (Populated for Staff role when state === "Reserved")
Properties of activeHold:
+ holdCode: string (e.g., "HLD-1042")
+ studentName: string
+ studentAccountId: string
+ collectBy: string
+ hasLoanHistory: boolean (Staff helper: if true, copy cannot be deleted)
+ viewerContext: Object | null (Populated for Student role)
Properties of viewerContext:
+ canBorrow: boolean
+ canRequestHold: boolean
+ blockReason: string | null
+ activeLoansCount: int (e.g., 2)
+ maxLoansLimit: int (e.g., 5)
+ existingHoldCode: string | null (if student already holds this title)
*/


class getBookByIdResponseDto {
    constructor(
        public bookDetail: BookEntity,
        public copies: PhysicalCopyEntityWithActiveLoanAndHold[],
        public viewerContext: BookViewerContextEntity | null,
        public role: "student" | "staff"
    ) {}
    public toResponseObject() {
        return {
            bookDetail: this.bookDetail,
            copies: this.copies.map(copy => {

            }),
            viewerContext: this.role === "student" ? this.viewerContext : null
        };
    }
}


/*
copy to markdown file for easier to read to know what attributes to keep in response sent client
| Attribute | Student | Staff |
| :--- | :--- | :--- |
| `stockSummary.isAvailableNow` | drop (not in the contract) | drop |
| `createdAt, updatedAt` | drop | drop |
| `bookId, notes, createdAt, updatedAt` | drop (not in the contract) | drop |
| `activeLoan` | drop entirely (the key must not exist) | keep only if `state === "Borrowed"`, else `null` |
| `activeHold` | drop entirely | keep only if `state === "Reserved"`, else `null` |
| `hasLoanHistory` | drop | keep |
| `viewerContext` | yes | no |
| `canDeleteTitle` | no | yes (`copies.length === 0`) |
| `deleteDisabledReason` | no | yes (`copies.some(c => c.hasLoanHistory)` picks the message text) |

*/