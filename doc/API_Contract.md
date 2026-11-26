# School Library Book Borrowing System: API Contract

**Project:** Library Book Borrowing System (*BookBorrow*)  
**Course:** CO3011 — Software Project Management  
**Base URL:** `/api/v1`  
**Content-Type:** `application/json`

---

## Table of Contents
- [Quick Endpoint Summary (TL;DR)](#quick-endpoint-summary-tldr)
- [1. API Conventions & Standards](#1-api-conventions--standards)
  - [1.1 Authentication & Role Authorization](#11-authentication--role-authorization)
  - [1.2 Hybrid Identifier Strategy](#12-hybrid-identifier-strategy)
  - [1.3 Standard Response Envelope](#13-standard-response-envelope)
  - [1.4 Domain Enums & Business Rule Constants](#14-domain-enums--business-rule-constants)
- [2. Core Data Models Reference](#2-core-data-models-reference)
  - [2.1 `User` Object](#21-user-object)
  - [2.2 `Book` (Title Metadata & Derived Stock) Object](#22-book-title-metadata--derived-stock-object)
  - [2.3 `PhysicalCopy` Object](#23-physicalcopy-object)
- [3. Route Group 1: Auth Route (`/auth`)](#3-route-group-1-auth-route-auth)
  - [3.1 `login`: `(POST) /auth/login`](#31-login-post-authlogin)
  - [3.2 `getMe`: `(GET) /auth/me`](#32-getme-get-authme)
  - [3.3 `logout`: `(POST) /auth/logout`](#33-logout-post-authlogout)
- [4. Route Group 2: Book & Catalog Route (`/books`)](#4-route-group-2-book--catalog-route-books)
  - [4.1 `getFeaturedBooks`: `(GET) /books/featured`](#41-getfeaturedbooks-get-booksfeatured)
  - [4.2 `getBooks`: `(GET) /books`](#42-getbooks-get-books)
  - [4.3 `getBookById`: `(GET) /books/:id`](#43-getbookbyid-get-booksid)
  - [4.4 `createBook`: `(POST) /books`](#44-createbook-post-books)
  - [4.5 `updateBook`: `(PUT) /books/:id`](#45-updatebook-put-booksid)
  - [4.6 `deleteBook`: `(DELETE) /books/:id`](#46-deletebook-delete-booksid)
- [5. Route Group 3: Physical Copy Route (`/copies`)](#5-route-group-3-physical-copy-route-copies)
  - [5.1 `addCopyToBook`: `(POST) /books/:bookId/copies`](#51-addcopytobook-post-booksbookidcopies)
  - [5.2 `updateCopy`: `(PUT) /copies/:id`](#52-updatecopy-put-copiesid)
  - [5.3 `deleteCopy`: `(DELETE) /copies/:id`](#53-deletecopy-delete-copiesid)
- [6. Route Group 4: Student Borrowing, Hold & Renewal Route (`/me`, `/holds`, `/loans`)](#6-route-group-4-student-borrowing-hold--renewal-route-me-holds-loans)
  - [6.1 `getMyBorrowing`: `(GET) /me/borrowing`](#61-getmyborrowing-get-meborrowing)
  - [6.2 `createHold`: `(POST) /holds`](#62-createhold-post-holds)
  - [6.3 `cancelHold`: `(DELETE) /holds/:id`](#63-cancelhold-delete-holdsid)
  - [6.4 `renewLoan`: `(POST) /loans/:id/renew`](#64-renewloan-post-loansidrenew)
- [7. Route Group 5: Staff Counter & Loan Management Route (`/staff`)](#7-route-group-5-staff-counter--loan-management-route-staff)
  - [7.1 `findStudentForCheckout`: `(GET) /staff/students/:accountId`](#71-findstudentforcheckout-get-staffstudentsaccountid)
  - [7.2 `checkCopyForCheckout`: `(GET) /staff/copies/:copyCode/checkout-check`](#72-checkcopyforcheckout-get-staffcopiescopycodecheckout-check)
  - [7.3 `issueBooks`: `(POST) /staff/loans/issue`](#73-issuebooks-post-staffloansissue)
  - [7.4 `findActiveLoanByCopy`: `(GET) /staff/loans/active-by-copy/:copyCode`](#74-findactiveloanbycopy-get-staffloansactive-by-copycopycode)
  - [7.5 `returnBook`: `(POST) /staff/loans/:id/return`](#75-returnbook-post-staffloansidreturn)
  - [7.6 `getLoanRecords`: `(GET) /staff/loans`](#76-getloanrecords-get-staffloans)
  - [7.7 `getActiveHolds`: `(GET) /staff/holds`](#77-getactiveholds-get-staffholds)
- [8. Route Group 6: Admin Account Management Route (`/admin/users`)](#8-route-group-6-admin-account-management-route-adminusers)
  - [8.1 `getUsers`: `(GET) /admin/users`](#81-getusers-get-adminusers)
  - [8.2 `createUser`: `(POST) /admin/users`](#82-createuser-post-adminusers)
  - [8.3 `updateUser`: `(PUT) /admin/users/:id`](#83-updateuser-put-adminusersid)
  - [8.4 `resetUserPassword`: `(POST) /admin/users/:id/reset-password`](#84-resetuserpassword-post-adminusersidreset-password)
  - [8.5 `deleteUser`: `(DELETE) /admin/users/:id`](#85-deleteuser-delete-adminusersid)
- [9. UI Screen-to-Endpoint Traceability Matrix](#9-ui-screen-to-endpoint-traceability-matrix)

---

## Quick Endpoint Summary (TL;DR)

This table summarizes all **28 endpoints** across the **6 route groups** for quick reference:

| # | Route Group | Endpoint Name | Method & Path | Access | Request Input (Params / Query / Body) | Response `data` Summary |
| :-: | :--- | :--- | :--- | :---: | :--- | :--- |
| **1** | **Auth** | [`login`](#31-login-post-authlogin) | `POST /auth/login` | Public | **Body:** `{ accountId, password, role }` | `{ user }` *(sets session cookie)* |
| **2** | **Auth** | [`getMe`](#32-getme-get-authme) | `GET /auth/me` | All Roles | *None (Session Cookie)* | `User` profile & active loan counts |
| **3** | **Auth** | [`logout`](#33-logout-post-authlogout) | `POST /auth/logout` | All Roles | *None (Session Cookie)* | Confirmation message |
| **4** | **Books** | [`getFeaturedBooks`](#41-getfeaturedbooks-get-booksfeatured) | `GET /books/featured` | Public | **Query:** `?limit=4` | Array of featured `Book` cards with `stockSummary` |
| **5** | **Books** | [`getBooks`](#42-getbooks-get-books) | `GET /books` | Student / Staff | **Query:** `?q=&category=&genre=&language=&availableNow=&stock=&sortBy=&page=&limit=` | `{ items: Book[], pagination }` |
| **6** | **Books** | [`getBookById`](#43-getbookbyid-get-booksid) | `GET /books/:id` | Student / Staff | **Param:** `:id` (`_id` or `isbn`) | Full `Book` metadata, `stockSummary`, `copies[]`, `viewerContext` |
| **7** | **Books** | [`createBook`](#44-createbook-post-books) | `POST /books` | Staff | **Body:** `{ title*, author*, isbn*, category*, keywords?, publisher?, ... }` | Newly created `Book` (starts with `0` copies) |
| **8** | **Books** | [`updateBook`](#45-updatebook-put-booksid) | `PUT /books/:id` | Staff | **Param:** `:id` · **Body:** `{ title*, author*, isbn*, category*, ... }` | Updated `Book` object |
| **9** | **Books** | [`deleteBook`](#46-deletebook-delete-booksid) | `DELETE /books/:id` | Staff | **Param:** `:id` | Confirmation (`409` if copies or loan history exist) |
| **10** | **Copies** | [`addCopyToBook`](#51-addcopytobook-post-booksbookidcopies) | `POST /books/:bookId/copies` | Staff | **Param:** `:bookId` · **Body:** `{ copyCode*, homeLocation*, initialState*, condition*, notes? }` | `{ copy, updatedStockSummary }` |
| **11** | **Copies** | [`updateCopy`](#52-updatecopy-put-copiesid) | `PUT /copies/:id` | Staff | **Param:** `:id` · **Body:** `{ homeLocation*, state*, condition*, notes? }` | `{ copy, updatedStockSummary }` |
| **12** | **Copies** | [`deleteCopy`](#53-deletecopy-delete-copiesid) | `DELETE /copies/:id` | Staff | **Param:** `:id` (`_id` or `copyCode`) | Confirmation (`409` if copy has loan history) |
| **13** | **Student** | [`getMyBorrowing`](#61-getmyborrowing-get-meborrowing) | `GET /me/borrowing` | Student | *None (Session Cookie)* | `{ accountSummary, currentLoans[], holdRequests[], borrowingHistory[] }` |
| **14** | **Student** | [`createHold`](#62-createhold-post-holds) | `POST /holds` | Student | **Body:** `{ bookId }` | `holdConfirmation` (`holdCode`, `collectBy`, `assignedCopy`, `book`) |
| **15** | **Student / Staff** | [`cancelHold`](#63-cancelhold-delete-holdsid) | `DELETE /holds/:id` | Student / Staff | **Param:** `:id` (`_id` or `holdCode`) | `{ holdCode, status: "Cancelled", releasedCopyCode }` |
| **16** | **Student** | [`renewLoan`](#64-renewloan-post-loansidrenew) | `POST /loans/:id/renew` | Student | **Param:** `:id` (`_id` or `borrowCode`) | `{ borrowCode, previousDueDate, newDueDate (+7d), renewalCount: 1 }` |
| **17** | **Staff** | [`findStudentForCheckout`](#71-findstudentforcheckout-get-staffstudentsaccountid) | `GET /staff/students/:accountId` | Staff | **Param:** `:accountId` (e.g. `S10428`) | `{ student, eligibility, activeHolds[] }` |
| **18** | **Staff** | [`checkCopyForCheckout`](#72-checkcopyforcheckout-get-staffcopiescopycodecheckout-check) | `GET /staff/copies/:copyCode/checkout-check` | Staff | **Param:** `:copyCode` · **Query:** `?studentAccountId=S10428` | `{ copy, book, canAdd, availabilityBadge, defaultDueDate, associatedHold, blockingInfo }` |
| **19** | **Staff** | [`issueBooks`](#73-issuebooks-post-staffloansissue) | `POST /staff/loans/issue` | Staff | **Body:** `{ studentAccountId, items: [{ copyCode, dueDate }] }` | `{ issuedAt, borrowEntries[], fulfilledHolds[], borrowerSummary }` |
| **20** | **Staff** | [`findActiveLoanByCopy`](#74-findactiveloanbycopy-get-staffloansactive-by-copycopycode) | `GET /staff/loans/active-by-copy/:copyCode` | Staff | **Param:** `:copyCode` (e.g. `WB-00632`) | `{ loan, copy, book, borrower }` |
| **21** | **Staff** | [`returnBook`](#75-returnbook-post-staffloansidreturn) | `POST /staff/loans/:id/return` | Staff | **Param:** `:id` · **Body:** `{ condition, conditionNote? }` | `returnDetail` (`borrowCode`, `borrower`, `returnedAt`, `copy.newState`) |
| **22** | **Staff** | [`getLoanRecords`](#76-getloanrecords-get-staffloans) | `GET /staff/loans` | Staff | **Query:** `?tab=active\|returned&q=&status=&sortBy=&page=&limit=` | `{ items: LoanRecord[], pagination }` |
| **23** | **Staff** | [`getActiveHolds`](#77-getactiveholds-get-staffholds) | `GET /staff/holds` | Staff | **Query:** `?q=&page=&limit=` | `{ items: HoldRecord[], pagination }` (for releasing uncollected holds) |
| **24** | **Admin** | [`getUsers`](#81-getusers-get-adminusers) | `GET /admin/users` | Admin | **Query:** `?q=&role=&status=&page=&limit=` | `{ items: User[], pagination }` |
| **25** | **Admin** | [`createUser`](#82-createuser-post-adminusers) | `POST /admin/users` | Admin | **Body:** `{ accountId*, fullName*, password*, role*, yearGroup? }` | Newly created `User` object |
| **26** | **Admin** | [`updateUser`](#83-updateuser-put-adminusersid) | `PUT /admin/users/:id` | Admin | **Param:** `:id` · **Body:** `{ fullName*, role*, yearGroup?, status* }` | Updated `User` object |
| **27** | **Admin** | [`resetUserPassword`](#84-resetuserpassword-post-adminusersidreset-password) | `POST /admin/users/:id/reset-password` | Admin | **Param:** `:id` · **Body:** `{ newPassword* }` | Confirmation message |
| **28** | **Admin** | [`deleteUser`](#85-deleteuser-delete-adminusersid) | `DELETE /admin/users/:id` | Admin | **Param:** `:id` (`_id` or `accountId`) | Confirmation (`409` if user has loans/holds/history) |

---

## 1. API Conventions & Standards

### 1.1 Authentication & Role Authorization
Protected endpoints use HTTP-only session cookies issued by `POST /auth/login` (`Set-Cookie`) and sent automatically by the client (`credentials: 'include'`):
```http
Cookie: connect.sid=<sessionId>
```
Each endpoint specifies its access level:
- **Public**: Accessible without authentication (e.g., Guest landing page, login).
- **Authenticated (`student` | `staff` | `admin`)**: Any valid signed-in school account.
- **Student Only (`student`)**: Self-service student actions (holds, online renewals, personal borrowing dashboard).
- **Staff Only (`staff`)**: Counter operations (batch book issue, book returns, title & physical copy inventory management, loan & hold records).
- **Admin Only (`admin`)**: School account & permission management (create, modify, activate/deactivate, reset password, and delete user accounts).

### 1.2 Hybrid Identifier Strategy
Every persistent resource exposes both:
- `_id: string` — Internal database primary key (e.g., MongoDB ObjectId `"671a9b2c8f1b2c0015a4e901"`).
- A human-readable domain code used on school ID cards, book barcodes, and counter receipts:
  - **User / Account Code (`accountId`)**: e.g., `"S10428"` (Student), `"STF012"` (Staff) — *pre-seeded / school-issued*.
  - **Physical Copy Barcode (`copyCode`)**: e.g., `"WB-00421"` — *entered by Staff in the Add Copy modal (or auto-generated sequentially by the backend if omitted)*.
  - **Hold Reference (`holdCode`)**: e.g., `"HLD-1042"` — *auto-generated sequentially by the backend when a hold is created*.
  - **Borrow Entry Reference (`borrowCode`)**: e.g., `"BR-2112"` — *auto-generated sequentially by the backend per copy when books are issued*.

Counter lookup endpoints accept the human-readable code directly (`:accountId`, `:copyCode`), while standard entity routes (`:id`) accept either `_id` or the human-readable code.

### 1.3 Standard Response Envelope
All responses follow a consistent envelope structure based on `format.jpg`:

**Success Response (`200 OK` / `201 Created`):**
- `success`: `boolean` (`true`)
- `message`: `string` *(optional human-readable status message)*
- `data`: `Object | Array` *(endpoint-specific payload defined below)*

**Error Response (`400` / `401` / `403` / `404` / `409` / `500`):**
- `success`: `boolean` (`false`)
- `error`: `Object`
  - Properties of `error`:
    - `code`: `string` *(machine-readable error code, e.g., `"ROLE_MISMATCH"`, `"COPY_ALREADY_BORROWED"`, `"LOAN_LIMIT_EXCEEDED"`)*
    - `message`: `string` *(user-facing message matching the UI banner)*
    - `details`: `Object` *(optional context, e.g., current borrower or blocking loan info)*

### 1.4 Domain Enums & Business Rule Constants

| Enum / Constant | Allowed Values / Default | Description |
| :--- | :--- | :--- |
| `UserRole` | `"student"` \| `"staff"` \| `"admin"` | Assigned by the school; verified against the selected role at sign-in |
| `UserStatus` | `"Active"` \| `"Inactive"` | Account status managed by Admin (`Inactive` accounts cannot sign in) |
| `BookCategory` | `"Fiction"` \| `"Non-fiction"` \| `"Poetry"` \| `"Graphic novels"` \| `"Reference"` | Primary catalog category filter |
| `BookLanguage` | `"English"` \| `"Vietnamese"` | Language filter in the book catalog |
| `CopyState` | `"Available"` \| `"Borrowed"` \| `"Reserved"` \| `"Damaged"` \| `"Lost"` | Derived from active loans/holds or staff condition flags |
| `CopyCondition` | `"Good"` \| `"Damaged"` \| `"Lost"` | Physical wear state recorded in inventory and at check-in |
| `HoldStatus` | `"Ready"` \| `"Fulfilled"` \| `"Cancelled"` \| `"Expired"` | Lifecycle state of a student hold request |
| `LoanStatus` | `"Active"` \| `"Returned"` | Lifecycle state of a borrow entry (`BR-xxxx`) |
| `MAX_LOANS_PER_STUDENT` | `5` | Maximum concurrent active loans per student |
| `DEFAULT_LOAN_DAYS` | `14` | Default loan period from checkout date |
| `RENEWAL_EXTRA_DAYS` | `7` | Extra days added on a student's online renewal |
| `MAX_RENEWALS_PER_LOAN` | `1` | Each loan can be renewed online at most once |

---

## 2. Core Data Models Reference

### 2.1 `User` Object
- `_id`: `string`
- `accountId`: `string` *(e.g., `"S10428"`, `"STF001"`, `"ADM001"`)*
- `fullName`: `string` *(e.g., `"Maya Chen"`)*
- `initials`: `string` *(e.g., `"MC"`)*
- `role`: `string` (`"student"` | `"staff"` | `"admin"`)
- `status`: `string` (`"Active"` | `"Inactive"`, default `"Active"`)
- `yearGroup`: `string | null` *(e.g., `"Year 10"` for students; `null` for staff/admin)*
- `activeLoansCount`: `int` *(e.g., `2`)*
- `maxLoansLimit`: `int` *(default `5`)*
- `overdueLoansCount`: `int` *(e.g., `0`)*
- `unpaidFines`: `float` *(read-only, default `0.00`)*
- `hasBorrowingHistory`: `boolean` *(if `true`, account deletion is disabled; Admin can set `status: "Inactive"` instead)*
- `createdAt`: `string` *(ISO 8601 timestamp)*
- `updatedAt`: `string` *(ISO 8601 timestamp)*

### 2.2 `Book` (Title Metadata & Derived Stock) Object
- `_id`: `string`
- `title`: `string` *(e.g., `"The Midnight Library"`)*
- `author`: `string` *(e.g., `"Matt Haig"`)*
- `isbn`: `string` *(e.g., `"9781786892737"`)*
- `category`: `string` *(e.g., `"Fiction"`)*
- `genre`: `string | null` *(e.g., `"Contemporary fiction"`, `"Fantasy"`)*
- `keywords`: `array of string` *(e.g., `["Choices & possibilities", "Fantasy", "Contemporary"]`)*
- `publisher`: `string | null` *(e.g., `"Canongate Books"`)*
- `publishedYear`: `int | null` *(e.g., `2020`)*
- `language`: `string` *(default `"English"`)*
- `format`: `string` *(default `"Paperback"`)*
- `pageCount`: `int | null` *(e.g., `304`)*
- `description`: `string | null` *(book synopsis shown under "About this book")*
- `coverImageUrl`: `string | null`
- `shelfReference`: `string | null` *(e.g., `"FIC HAI · A3"`)*
- `sectionName`: `string | null` *(e.g., `"Fiction section · Main library"`)*
- `stockSummary`: `Object` *(derived automatically from physical copy states; never edited directly)*
  - Properties of `stockSummary`:
    - `totalCopies`: `int` *(e.g., `4`)*
    - `availableCopies`: `int` *(e.g., `2`)*
    - `borrowedCopies`: `int` *(e.g., `2`)*
    - `reservedCopies`: `int` *(e.g., `0`)*
    - `damagedCopies`: `int` *(e.g., `0`)*
    - `lostCopies`: `int` *(e.g., `0`)*
    - `isAvailableNow`: `boolean` (`availableCopies > 0`)
- `createdAt`: `string`
- `updatedAt`: `string`

### 2.3 `PhysicalCopy` Object
- `_id`: `string`
- `copyCode`: `string` *(unique barcode across library, e.g., `"WB-00421"`)*
- `bookId`: `string`
- `homeLocation`: `string` *(e.g., `"FIC HAI · A3"`)*
- `state`: `string` (`"Available"` | `"Borrowed"` | `"Reserved"` | `"Damaged"` | `"Lost"`)
- `condition`: `string` (`"Good"` | `"Damaged"` | `"Lost"`)
- `notes`: `string | null` *(e.g., `"New paperback copy"`)*
- `hasLoanHistory`: `boolean` *(if `true`, copy deletion is disabled)*
- `createdAt`: `string`
- `updatedAt`: `string`

---

## 3. Route Group 1: Auth Route (`/auth`)
*Supports: `GuestView.pdf` Pages 2–3 (Role selection & School account sign-in)*

### 3.1 `login`: `(POST) /auth/login`
- **Access:** Public
- **Description:** Signs a user in using their school-issued `accountId`, `password`, and selected `role`. Verifies that the account is `"Active"` and holds the selected role (*"Your account must have the Student/Staff/Admin role assigned by the school"*).
- **Request Body:**
  - `+ accountId`: `string` *(required, e.g., `"S10428"`)*
  - `+ password`: `string` *(required)*
  - `+ role`: `string` *(required, `"student"` | `"staff"` | `"admin"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `authSession`
    - **Properties of `authSession`:**
      - `+ user`: `Object`
        - **Properties of `user`:**
          - `+ _id`: `string`
          - `+ accountId`: `string` *(e.g., `"S10428"`)*
          - `+ fullName`: `string` *(e.g., `"Maya Chen"`)*
          - `+ initials`: `string` *(e.g., `"MC"`)*
          - `+ role`: `string` (`"student"` | `"staff"` | `"admin"`)
          - `+ status`: `string` (`"Active"`)
          - `+ yearGroup`: `string | null` *(e.g., `"Year 10"`)*
          - `+ activeLoansCount`: `int`
          - `+ maxLoansLimit`: `int`
- **Error Cases:**
  - `400 Bad Request` (`INVALID_INPUT`): Missing `accountId`, `password`, or `role`.
  - `401 Unauthorized` (`INVALID_CREDENTIALS`): Invalid school account ID or password.
  - `403 Forbidden` (`ROLE_MISMATCH` | `ACCOUNT_INACTIVE`): Account does not have the selected `role` assigned or has been deactivated by Admin.

---

### 3.2 `getMe`: `(GET) /auth/me`
- **Access:** Authenticated (`student` | `staff` | `admin`)
- **Description:** Returns the profile and current borrowing counters of the logged-in user (populates the top navigation bar chip, e.g., `MC | Maya Chen | Year 10 · S10428` or `Staff workspace` / `Admin workspace`).
- **Request Params / Query:** None
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `user` *(see Section 2.1 `User` Object)*

---

### 3.3 `logout`: `(POST) /auth/logout`
- **Access:** Authenticated (`student` | `staff` | `admin`)
- **Description:** Logs out the current user session.
- **Request Body:** None
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"Signed out successfully"`)

---

## 4. Route Group 2: Book & Catalog Route (`/books`)
*Supports: `GuestView.pdf` Page 1, `StudentView.pdf` Pages 1–3, `StaffView.pdf` Pages 6–8*

### 4.1 `getFeaturedBooks`: `(GET) /books/featured`
- **Access:** Public
- **Description:** Fetches the curated books displayed under *"A few stories from our shelves"* on the Guest Landing Page (`GuestView` Page 1) and Student Home Page (`StudentView` Page 1).
- **Request Query:**
  - `+ limit`: `int` *(optional, default `4`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `array of Object`
    - **Properties of `Object`:**
      - `+ _id`: `string`
      - `+ title`: `string` *(e.g., `"The Midnight Library"`)*
      - `+ author`: `string` *(e.g., `"Matt Haig"`)*
      - `+ category`: `string` *(e.g., `"Fiction"`)*
      - `+ genre`: `string` *(e.g., `"Contemporary fiction"`)*
      - `+ coverImageUrl`: `string | null`
      - `+ shelfReference`: `string` *(e.g., `"FIC HAI · A3"`)*
      - `+ stockSummary`: `Object`
        - **Properties of `stockSummary`:**
          - `+ totalCopies`: `int`
          - `+ availableCopies`: `int`
          - `+ isAvailableNow`: `boolean`

---

### 4.2 `getBooks`: `(GET) /books`
- **Access:** Authenticated (`student` | `staff`)
- **Description:** Searches, filters, sorts, and paginates the book catalog for both the Student Catalog (`StudentView` Page 2) and Staff Title Inventory (`StaffView` Page 6).
- **Request Query:**
  - `+ q`: `string` *(optional — searches across `title`, `author`, `isbn`, `keywords`, and `category`)*
  - `+ category`: `string` *(optional — comma-separated or single value: `"Fiction"`, `"Non-fiction"`, `"Poetry"`, `"Graphic novels"`, `"Reference"`)*
  - `+ genre`: `string` *(optional — comma-separated or single value: `"Fantasy"`, `"Historical fiction"`, `"Science fiction"`, `"Contemporary fiction"`, etc.)*
  - `+ language`: `string` *(optional — `"English"`, `"Vietnamese"`)*
  - `+ availableNow`: `boolean` *(optional — Student filter: if `true`, only returns books with `availableCopies > 0`)*
  - `+ stock`: `string` *(optional — Staff inventory filter: `"all"` | `"available"` | `"unavailable"`, default `"all"`)*
  - `+ sortBy`: `string` *(optional — `"relevance"` | `"title"` | `"publishedYear"`, default `"relevance"`)*
  - `+ page`: `int` *(optional, default `1`)*
  - `+ limit`: `int` *(optional, default `6`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `catalogResult`
    - **Properties of `catalogResult`:**
      - `+ items`: `array of Object`
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ title`: `string`
          - `+ author`: `string`
          - `+ isbn`: `string`
          - `+ category`: `string`
          - `+ genre`: `string | null`
          - `+ language`: `string`
          - `+ publisher`: `string | null`
          - `+ keywords`: `array of string`
          - `+ coverImageUrl`: `string | null`
          - `+ shelfReference`: `string | null` *(e.g., `"FIC HAI · A3"`)*
          - `+ stockSummary`: `Object`
            - **Properties of `stockSummary`:**
              - `+ totalCopies`: `int` *(e.g., `4`)*
              - `+ availableCopies`: `int` *(e.g., `2`)*
              - `+ borrowedCopies`: `int` *(e.g., `2`)*
              - `+ reservedCopies`: `int` *(e.g., `0`)*
              - `+ isAvailableNow`: `boolean`
      - `+ pagination`: `Object`
        - **Properties of `pagination`:**
          - `+ totalItems`: `int` *(e.g., `6`)*
          - `+ currentPage`: `int` *(e.g., `1`)*
          - `+ totalPages`: `int` *(e.g., `1`)*
          - `+ limit`: `int` *(e.g., `6`)*

---

### 4.3 `getBookById`: `(GET) /books/:id`
- **Access:** Authenticated (`student` | `staff`)
- **Description:** Returns complete details for a single book title, its derived stock counts, and its list of physical copies.
  - For **Students** (`StudentView` Page 3): Includes `viewerContext` (whether the student can borrow/request a hold and how many loans they have used) and masks borrower identities on loaned copies (`displayLocation: "Currently with a reader"`).
  - For **Staff** (`StaffView` Page 8): Includes `canDeleteTitle` and full borrower/due-date details on each physical copy (`Maya Chen · S10428`, `29 Oct · BR-2112`) plus `hasLoanHistory` per copy.
- **Request Params:**
  - `+ id`: `string` *(Book `_id` or `isbn`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `bookDetail`
    - **Properties of `bookDetail`:**
      - `+ _id`: `string`
      - `+ title`: `string`
      - `+ author`: `string`
      - `+ isbn`: `string`
      - `+ category`: `string`
      - `+ genre`: `string | null`
      - `+ keywords`: `array of string`
      - `+ description`: `string | null`
      - `+ publisher`: `string | null`
      - `+ publishedYear`: `int | null`
      - `+ format`: `string` *(e.g., `"Paperback"`)*
      - `+ language`: `string` *(e.g., `"English"`)*
      - `+ pageCount`: `int | null` *(e.g., `304`)*
      - `+ coverImageUrl`: `string | null`
      - `+ shelfReference`: `string | null` *(e.g., `"FIC HAI · A3"`)*
      - `+ sectionName`: `string | null` *(e.g., `"Fiction section · Main library"`)*
      - `+ stockSummary`: `Object`
        - **Properties of `stockSummary`:**
          - `+ totalCopies`: `int`
          - `+ availableCopies`: `int`
          - `+ borrowedCopies`: `int`
          - `+ reservedCopies`: `int`
          - `+ damagedCopies`: `int`
          - `+ lostCopies`: `int`
      - `+ canDeleteTitle`: `boolean` *(Staff helper: `true` only if `totalCopies === 0` and title has no historical loans)*
      - `+ deleteDisabledReason`: `string | null` *(e.g., `"Unavailable: this title has physical copies and loan history. Borrowed copies and historical loans cannot be deleted."`)*
      - `+ copies`: `array of Object`
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ copyCode`: `string` *(e.g., `"WB-00421"`)*
          - `+ homeLocation`: `string` *(e.g., `"FIC HAI · A3"`)*
          - `+ state`: `string` (`"Available"` | `"Borrowed"` | `"Reserved"` | `"Damaged"` | `"Lost"`)
          - `+ condition`: `string` (`"Good"` | `"Damaged"` | `"Lost"`)
          - `+ displayLocation`: `string` *(Student view: `"FIC HAI · A3"` when available, or `"Currently with a reader"` when on loan)*
          - `+ activeLoan`: `Object | null` *(Populated for Staff role only when `state === "Borrowed"`)*
            - **Properties of `activeLoan`:**
              - `+ borrowCode`: `string` *(e.g., `"BR-2112"`)*
              - `+ studentName`: `string` *(e.g., `"Maya Chen"`)*
              - `+ studentAccountId`: `string` *(e.g., `"S10428"`)*
              - `+ dueDate`: `string` *(ISO date, e.g., `"2026-10-29"`)*
          - `+ activeHold`: `Object | null` *(Populated for Staff role when `state === "Reserved"`)*
            - **Properties of `activeHold`:**
              - `+ holdCode`: `string` *(e.g., `"HLD-1042"`)*
              - `+ studentName`: `string`
              - `+ studentAccountId`: `string`
              - `+ collectBy`: `string`
          - `+ hasLoanHistory`: `boolean` *(Staff helper: if `true`, copy cannot be deleted)*
      - `+ viewerContext`: `Object | null` *(Populated for Student role)*
        - **Properties of `viewerContext`:**
          - `+ canBorrow`: `boolean`
          - `+ canRequestHold`: `boolean`
          - `+ blockReason`: `string | null`
          - `+ activeLoansCount`: `int` *(e.g., `2`)*
          - `+ maxLoansLimit`: `int` *(e.g., `5`)*
          - `+ existingHoldCode`: `string | null` *(if student already holds this title)*
- **Error Cases:**
  - `404 Not Found` (`BOOK_NOT_FOUND`): No book matches `:id`.

---

### 4.4 `createBook`: `(POST) /books`
- **Access:** Staff Only (`staff`)
- **Description:** Creates a new book title in the catalog (`StaffView` Page 7 *"Add a book"* modal). A new title starts with `0` physical copies; physical copies are added afterward.
  - **Backend Defaults Note:** Because the Staff *"Add a book"* modal only collects `title`, `author`, `isbn`, `category`, `keywords`, and `publisher`, the backend automatically populates sensible defaults for any omitted Student View display fields (`language: "English"`, `format: "Paperback"`, `genre: category`, default cover placeholder URL, and a fallback description) so newly created books render cleanly in the Student Catalog and Book Detail page.
- **Request Body:**
  - `+ title`: `string` *(required, e.g., `"The Wild Robot"`)*
  - `+ author`: `string` *(required, e.g., `"Peter Brown"`)*
  - `+ isbn`: `string` *(required, unique, e.g., `"9781848127272"`)*
  - `+ category`: `string` *(required, `"Fiction"` | `"Non-fiction"` | `"Poetry"` | `"Graphic novels"` | `"Reference"`)*
  - `+ keywords`: `array of string` *(optional, e.g., `["Robots", "nature", "friendship"]`)*
  - `+ publisher`: `string` *(optional, e.g., `"Piccadilly Press"`)*
  - `+ genre`: `string` *(optional)*
  - `+ publishedYear`: `int` *(optional)*
  - `+ language`: `string` *(optional, default `"English"`)*
  - `+ format`: `string` *(optional, default `"Paperback"`)*
  - `+ pageCount`: `int` *(optional)*
  - `+ description`: `string` *(optional)*
  - `+ coverImageUrl`: `string` *(optional)*
  - `+ shelfReference`: `string` *(optional)*
- **Response Data (`201 Created`):**
  - `+ success`: `boolean`
  - `+ data`: `book` *(see Section 2.2 `Book` Object, with `stockSummary.totalCopies = 0`)*
- **Error Cases:**
  - `400 Bad Request` (`VALIDATION_ERROR`): Missing required fields (`title`, `author`, `isbn`, `category`).
  - `409 Conflict` (`DUPLICATE_ISBN`): A book title with this `isbn` already exists.

---

### 4.5 `updateBook`: `(PUT) /books/:id`
- **Access:** Staff Only (`staff`)
- **Description:** Updates shared book metadata (`StaffView` Page 8 *"Save title changes"*). Changes apply to the title record without altering historical loan records.
- **Request Params:**
  - `+ id`: `string` *(Book `_id`)*
- **Request Body:**
  - `+ title`: `string` *(required)*
  - `+ author`: `string` *(required)*
  - `+ isbn`: `string` *(required)*
  - `+ category`: `string` *(required)*
  - `+ publisher`: `string | null` *(optional)*
  - `+ keywords`: `array of string` *(optional)*
  - `+ genre`: `string | null` *(optional)*
  - `+ publishedYear`: `int | null` *(optional)*
  - `+ language`: `string` *(optional)*
  - `+ format`: `string` *(optional)*
  - `+ pageCount`: `int | null` *(optional)*
  - `+ description`: `string | null` *(optional)*
  - `+ coverImageUrl`: `string | null` *(optional)*
  - `+ shelfReference`: `string | null` *(optional)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `book` *(updated `Book` Object)*
- **Error Cases:**
  - `404 Not Found` (`BOOK_NOT_FOUND`)
  - `409 Conflict` (`DUPLICATE_ISBN`)

---

### 4.6 `deleteBook`: `(DELETE) /books/:id`
- **Access:** Staff Only (`staff`)
- **Description:** Deletes a book title (`StaffView` Page 8 *"Delete title"*). Only allowed if the title has `0` physical copies and `0` historical loans.
- **Request Params:**
  - `+ id`: `string` *(Book `_id`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"Book title deleted successfully"`)
- **Error Cases:**
  - `404 Not Found` (`BOOK_NOT_FOUND`)
  - `409 Conflict` (`BOOK_HAS_COPIES_OR_HISTORY`): `"Unavailable: this title has physical copies and loan history. Borrowed copies and historical loans cannot be deleted."`

---

## 5. Route Group 3: Physical Copy Route (`/copies`)
*Supports: `StaffView.pdf` Pages 8–10 (Add, Edit, and Delete Physical Copies)*

### 5.1 `addCopyToBook`: `(POST) /books/:bookId/copies`
- **Access:** Staff Only (`staff`)
- **Description:** Adds a new physical copy with a unique barcode to an existing book title (`StaffView` Page 9 *"Add a physical copy"* modal). Automatically recalculates the book's derived stock.
- **Request Params:**
  - `+ bookId`: `string` *(Book `_id`)*
- **Request Body:**
  - `+ copyCode`: `string` *(required in Staff UI form, unique across library, e.g., `"WB-00425"`; if omitted, backend auto-generates next sequential `"WB-xxxx"` code)*
  - `+ homeLocation`: `string` *(required, e.g., `"FIC HAI · A3"`)*
  - `+ initialState`: `string` *(required, `"Available"` | `"Damaged"` | `"Lost"`, default `"Available"`)*
  - `+ condition`: `string` *(required, `"Good"` | `"Damaged"` | `"Lost"`, default `"Good"`)*
  - `+ notes`: `string` *(optional, e.g., `"New paperback copy"`)*
- **Response Data (`201 Created`):**
  - `+ success`: `boolean`
  - `+ data`: `Object`
    - **Properties of `Object`:**
      - `+ copy`: `PhysicalCopy` *(see Section 2.3)*
      - `+ updatedStockSummary`: `Object`
        - **Properties of `updatedStockSummary`:**
          - `+ totalCopies`: `int` *(e.g., `5`)*
          - `+ availableCopies`: `int` *(e.g., `2`)*
          - `+ borrowedCopies`: `int` *(e.g., `3`)*
- **Error Cases:**
  - `404 Not Found` (`BOOK_NOT_FOUND`)
  - `409 Conflict` (`DUPLICATE_COPY_CODE`): `"Copy ID / barcode must be unique across the library."`

---

### 5.2 `updateCopy`: `(PUT) /copies/:id`
- **Access:** Staff Only (`staff`)
- **Description:** Edits an existing physical copy's shelf location, state, condition, or notes (`StaffView` Page 10 *"Edit copy · WB-00422"* modal).
  - **Business Rule:** `Borrowed` and `Reserved` states are controlled strictly by loan and hold records. A currently borrowed copy cannot have its state manually changed until its return is completed at the counter.
- **Request Params:**
  - `+ id`: `string` *(Copy `_id` or `copyCode` e.g., `"WB-00422"`)*
- **Request Body:**
  - `+ homeLocation`: `string` *(required, e.g., `"FIC HAI · A3"`)*
  - `+ state`: `string` *(required, `"Available"` | `"Damaged"` | `"Lost"`)*
  - `+ condition`: `string` *(required, `"Good"` | `"Damaged"` | `"Lost"`)*
  - `+ notes`: `string | null` *(optional)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `Object`
    - **Properties of `Object`:**
      - `+ copy`: `PhysicalCopy`
      - `+ updatedStockSummary`: `Object`
        - **Properties of `updatedStockSummary`:**
          - `+ totalCopies`: `int`
          - `+ availableCopies`: `int`
          - `+ borrowedCopies`: `int`
          - `+ reservedCopies`: `int`
          - `+ damagedCopies`: `int`
          - `+ lostCopies`: `int`
- **Error Cases:**
  - `404 Not Found` (`COPY_NOT_FOUND`)
  - `409 Conflict` (`COPY_HAS_ACTIVE_LOAN_OR_HOLD`): `"Complete the return or cancel the hold before changing a borrowed/reserved copy's state."`

---

### 5.3 `deleteCopy`: `(DELETE) /copies/:id`
- **Access:** Staff Only (`staff`)
- **Description:** Deletes a physical copy record (`StaffView` Page 10 *"Delete copy"*). Disabled if the copy is currently borrowed/reserved or has any historical loan records.
- **Request Params:**
  - `+ id`: `string` *(Copy `_id` or `copyCode`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"Physical copy deleted successfully"`)
- **Error Cases:**
  - `404 Not Found` (`COPY_NOT_FOUND`)
  - `409 Conflict` (`COPY_HAS_LOAN_HISTORY`): `"Deletion disabled: this copy has loan history. Use Damaged or Lost to make a copy unavailable; keep its records."`

---

## 6. Route Group 4: Student Borrowing, Hold & Renewal Route (`/me`, `/holds`, `/loans`)
*Supports: `StudentView.pdf` Pages 3–5 (Request Hold, Hold Confirmation, My Borrowing Dashboard, Online Renewal)*

### 6.1 `getMyBorrowing`: `(GET) /me/borrowing`
- **Access:** Student Only (`student`)
- **Description:** Retrieves all sections required for the Student *"My borrowing"* page (`StudentView` Page 5): account eligibility summary, current active loans (with online renewal eligibility), active hold requests, and returned borrowing history.
- **Request Params / Query:** None *(student identified via session cookie)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `myBorrowingDashboard`
    - **Properties of `myBorrowingDashboard`:**
      - `+ accountSummary`: `Object`
        - **Properties of `accountSummary`:**
          - `+ canBorrow`: `boolean` *(e.g., `true`)*
          - `+ statusText`: `string` *(e.g., `"You can borrow"`)*
          - `+ activeLoansCount`: `int` *(e.g., `2`)*
          - `+ maxLoansLimit`: `int` *(e.g., `5`)*
          - `+ remainingLoanSpace`: `int` *(e.g., `3`)*
          - `+ overdueBooksCount`: `int` *(e.g., `0`)*
          - `+ unpaidFines`: `float` *(e.g., `0.00`)*
      - `+ currentLoans`: `array of Object` *(sorted by `dueDate` ascending)*
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ borrowCode`: `string` *(e.g., `"BR-2098"`)*
          - `+ copyCode`: `string` *(e.g., `"WB-00216"`)*
          - `+ book`: `Object`
            - **Properties of `book`:**
              - `+ _id`: `string`
              - `+ title`: `string` *(e.g., `"Wonder"`)*
              - `+ author`: `string` *(e.g., `"R.J. Palacio"`)*
              - `+ coverImageUrl`: `string | null`
          - `+ borrowedAt`: `string` *(ISO date, e.g., `"2026-10-08"`)*
          - `+ dueDate`: `string` *(ISO date, e.g., `"2026-10-22"`)*
          - `+ daysLeft`: `int` *(e.g., `7`; negative if overdue)*
          - `+ isOverdue`: `boolean`
          - `+ renewalCount`: `int` *(e.g., `0` or `1`)*
          - `+ canRenew`: `boolean` *(`true` if `renewalCount === 0`, not overdue, and no active hold/reservation blocks the title)*
          - `+ renewalStatusText`: `string` *(e.g., `"Renewal available · Not yet renewed · Nobody is waiting"`)*
          - `+ newDueDatePreview`: `string | null` *(e.g., `"2026-10-29"`, i.e., `dueDate + 7 days`)*
      - `+ holdRequests`: `array of Object`
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ holdCode`: `string` *(e.g., `"HLD-1042"`)*
          - `+ status`: `string` (`"Ready"`)
          - `+ requestedAt`: `string` *(e.g., `"2026-10-15T09:30:00Z"`)*
          - `+ collectBy`: `string` *(e.g., `"2026-10-16T15:30:00Z"`)*
          - `+ pickupLocation`: `string` *(e.g., `"Main library counter"`)*
          - `+ book`: `Object`
            - **Properties of `book`:**
              - `+ _id`: `string`
              - `+ title`: `string` *(e.g., `"The Midnight Library"`)*
              - `+ author`: `string` *(e.g., `"Matt Haig"`)*
              - `+ format`: `string` *(e.g., `"Paperback"`)*
              - `+ coverImageUrl`: `string | null`
          - `+ copy`: `Object`
            - **Properties of `copy`:**
              - `+ _id`: `string`
              - `+ copyCode`: `string` *(e.g., `"WB-00421"`)*
              - `+ homeLocation`: `string` *(e.g., `"FIC HAI · A3"`)*
      - `+ borrowingHistory`: `array of Object` *(past returned loans, sorted by `returnedAt` descending)*
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ borrowCode`: `string`
          - `+ copyCode`: `string`
          - `+ book`: `Object` (`_id`, `title`, `author`, `coverImageUrl`)
          - `+ borrowedAt`: `string`
          - `+ dueDate`: `string`
          - `+ returnedAt`: `string`
          - `+ returnCondition`: `string` (`"Good"` | `"Damaged"` | `"Lost"`)

---

### 6.2 `createHold`: `(POST) /holds`
- **Access:** Student Only (`student`)
- **Description:** Places a hold on an available physical copy of a book (`StudentView` Page 3 *"Request to hold"* → Page 4 *"Hold Request Successful"*).
  - **Business Rules:**
    1. Student must have no overdue books and no unpaid fines.
    2. Student cannot already have an active loan or active hold for the same book title.
    3. At least 1 physical copy of the book must have `state === "Available"`.
    4. Selects an available copy (e.g., `WB-00421`), changes its `state` to `"Reserved"`, auto-generates `holdCode` (e.g., `"HLD-1042"`), and sets `collectBy` to the next day at `15:30` (`3:30 pm`).
    5. **No Background Cron Required:** `collectBy` is stored and displayed for the pickup deadline, and holds are only released when cancelled (`DELETE /holds/:id`) or fulfilled at counter checkout (`POST /staff/loans/issue`).
    6. A hold does **not** increment `activeLoansCount` until staff confirm collection at the counter.
- **Request Body:**
  - `+ bookId`: `string` *(required, Book `_id`)*
- **Response Data (`201 Created`):**
  - `+ success`: `boolean`
  - `+ data`: `holdConfirmation`
    - **Properties of `holdConfirmation`:**
      - `+ _id`: `string`
      - `+ holdCode`: `string` *(e.g., `"HLD-1042"`)*
      - `+ status`: `string` (`"Ready"`)
      - `+ requestedAt`: `string` *(e.g., `"2026-10-15T10:15:00Z"`)*
      - `+ collectBy`: `string` *(e.g., `"2026-10-16T15:30:00Z"`)*
      - `+ book`: `Object`
        - **Properties of `book`:**
          - `+ _id`: `string`
          - `+ title`: `string` *(e.g., `"The Midnight Library"`)*
          - `+ author`: `string` *(e.g., `"Matt Haig"`)*
          - `+ format`: `string` *(e.g., `"Paperback"`)*
          - `+ shelfReference`: `string` *(e.g., `"FIC HAI · A3"`)*
          - `+ coverImageUrl`: `string | null`
          - `+ stockSummary`: `Object` (`totalCopies`, `availableCopies`, `borrowedCopies`, `reservedCopies`)
      - `+ assignedCopy`: `Object`
        - **Properties of `assignedCopy`:**
          - `+ _id`: `string`
          - `+ copyCode`: `string` *(e.g., `"WB-00421"`)*
          - `+ homeLocation`: `string` *(e.g., `"FIC HAI · A3"`)*
      - `+ studentLoanUsage`: `Object`
        - **Properties of `studentLoanUsage`:**
          - `+ activeLoansCount`: `int` *(e.g., `2`)*
          - `+ maxLoansLimit`: `int` *(e.g., `5`)*
- **Error Cases:**
  - `400 Bad Request` (`NO_AVAILABLE_COPIES`): All physical copies are currently unavailable.
  - `403 Forbidden` (`BORROWING_BLOCKED`): Student has overdue books or unpaid fines.
  - `409 Conflict` (`DUPLICATE_HOLD_OR_LOAN`): Student already holds or borrows a copy of this book.

---

### 6.3 `cancelHold`: `(DELETE) /holds/:id`
- **Access:** Authenticated (`student` owner | `staff`)
- **Description:** Cancels an active hold request (`StudentView` Pages 4 & 5 *"Cancel this hold"*, or used by Staff to release uncollected holds). Transitions the hold status to `"Cancelled"` and releases the assigned physical copy back to `state = "Available"`.
- **Request Params:**
  - `+ id`: `string` *(Hold `_id` or `holdCode` e.g., `"HLD-1042"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"Hold HLD-1042 has been cancelled and the copy is now available."`)
  - `+ data`: `Object`
    - **Properties of `Object`:**
      - `+ holdCode`: `string`
      - `+ status`: `string` (`"Cancelled"`)
      - `+ releasedCopyCode`: `string` *(e.g., `"WB-00421"`)*
- **Error Cases:**
  - `404 Not Found` (`HOLD_NOT_FOUND`)
  - `409 Conflict` (`HOLD_NOT_CANCELLABLE`): Hold is already fulfilled or cancelled.

---

### 6.4 `renewLoan`: `(POST) /loans/:id/renew`
- **Access:** Student Only (`student`)
- **Description:** Renews an active loan online once for `7` extra days (`StudentView` Page 5 *"Renew for 7 days"*).
  - **Business Rules:**
    1. Loan must belong to the authenticated student and have `status === "Active"`.
    2. `renewalCount` must be `0` (maximum 1 online renewal per loan).
    3. Student must have no overdue loans or unpaid fines.
    4. Increments `renewalCount` to `1` and extends `dueDate` by `+7` calendar days.
- **Request Params:**
  - `+ id`: `string` *(Loan `_id` or `borrowCode` e.g., `"BR-2098"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"Loan renewed for 7 days"`)
  - `+ data`: `Object`
    - **Properties of `Object`:**
      - `+ _id`: `string`
      - `+ borrowCode`: `string` *(e.g., `"BR-2098"`)*
      - `+ previousDueDate`: `string` *(e.g., `"2026-10-22"`)*
      - `+ newDueDate`: `string` *(e.g., `"2026-10-29"`)*
      - `+ daysLeft`: `int` *(e.g., `14`)*
      - `+ renewalCount`: `int` (`1`)
      - `+ canRenew`: `boolean` (`false`)
- **Error Cases:**
  - `403 Forbidden` (`RENEWAL_NOT_ELIGIBLE`): Already renewed once, loan is overdue, or student account is blocked.
  - `404 Not Found` (`LOAN_NOT_FOUND`)

---

## 7. Route Group 5: Staff Counter & Loan Management Route (`/staff`)
*Supports: `StaffView.pdf` Pages 2–5 (Issue Books, Return a Book) & Page 11 (Loan Records / History)*

### 7.1 `findStudentForCheckout`: `(GET) /staff/students/:accountId`
- **Access:** Staff Only (`staff`)
- **Description:** Step 1 of *"Loan a Book"* (`StaffView` Page 2 *"Find student"*). Looks up a student by their school card ID (`S10428`) and returns their profile, current active loan usage (`2 / 5`), remaining quota (`3`), eligibility status, and any active holds ready for pickup.
- **Request Params:**
  - `+ accountId`: `string` *(Student's school account ID, e.g., `"S10428"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `studentCheckoutProfile`
    - **Properties of `studentCheckoutProfile`:**
      - `+ student`: `Object`
        - **Properties of `student`:**
          - `+ _id`: `string`
          - `+ accountId`: `string` *(e.g., `"S10428"`)*
          - `+ fullName`: `string` *(e.g., `"Maya Chen"`)*
          - `+ initials`: `string` *(e.g., `"MC"`)*
          - `+ yearGroup`: `string` *(e.g., `"Year 10"`)*
      - `+ eligibility`: `Object`
        - **Properties of `eligibility`:**
          - `+ isEligible`: `boolean` *(e.g., `true`)*
          - `+ activeLoansCount`: `int` *(e.g., `2`)*
          - `+ maxLoansLimit`: `int` *(e.g., `5`)*
          - `+ remainingLoanSpace`: `int` *(e.g., `3`)*
          - `+ overdueBooksCount`: `int` *(e.g., `0`)*
          - `+ unpaidFines`: `float` *(e.g., `0.00`)*
          - `+ statusBanner`: `string` *(e.g., `"No overdue books · No unpaid fines. You can select up to 3 additional copies."`)*
      - `+ activeHolds`: `array of Object` *(holds belonging to this student that can be fulfilled at checkout)*
        - **Properties of `Object`:**
          - `+ holdCode`: `string` *(e.g., `"HLD-1042"`)*
          - `+ copyCode`: `string` *(e.g., `"WB-00421"`)*
          - `+ bookTitle`: `string` *(e.g., `"The Midnight Library"`)*
          - `+ collectBy`: `string`
- **Error Cases:**
  - `404 Not Found` (`STUDENT_NOT_FOUND`): No student account matches `:accountId`.

---

### 7.2 `checkCopyForCheckout`: `(GET) /staff/copies/:copyCode/checkout-check`
- **Access:** Staff Only (`staff`)
- **Description:** Step 2 of *"Loan a Book"* (`StaffView` Page 2 *"Add physical copies → Find copy"*). Checks whether a specific physical copy barcode (`WB-00423`, `WB-00421`, `WB-00511`) can be issued to the selected student.
  - **UI Interaction Note:** The frontend must require Staff to load a valid student via `findStudentForCheckout` (Step 1) before enabling *"Find copy"* (Step 2), and must clear or re-validate the selected copy list if Staff switches to a different student.
  - **Business Rules:**
    - `Available` copies → **Allowed** (`availabilityBadge: "Available"`).
    - `Reserved` copy held by **this** student (`studentAccountId`) → **Allowed** (`availabilityBadge: "Reserved for Maya"`, attaches `holdCode: "HLD-1042"`).
    - `Borrowed` copy, `Reserved` copy held by **another** student, `Damaged`, or `Lost` → **Blocked** (`canAdd: false`), returning the exact reason (including current borrower name, student ID, and due date if already borrowed).
- **Request Params:**
  - `+ copyCode`: `string` *(Unique copy barcode, e.g., `"WB-00423"` or `"WB-00421"`)*
- **Request Query:**
  - `+ studentAccountId`: `string` *(required, e.g., `"S10428"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `copyCheckoutCheck`
    - **Properties of `copyCheckoutCheck`:**
      - `+ copy`: `Object`
        - **Properties of `copy`:**
          - `+ _id`: `string`
          - `+ copyCode`: `string` *(e.g., `"WB-00421"` or `"WB-00423"`)*
          - `+ state`: `string` (`"Available"` | `"Borrowed"` | `"Reserved"` | `"Damaged"` | `"Lost"`)
          - `+ condition`: `string`
          - `+ homeLocation`: `string`
      - `+ book`: `Object`
        - **Properties of `book`:**
          - `+ _id`: `string`
          - `+ title`: `string` *(e.g., `"The Midnight Library"`)*
          - `+ author`: `string` *(e.g., `"Matt Haig"`)*
          - `+ coverImageUrl`: `string | null`
      - `+ canAdd`: `boolean` *(`true` for `WB-00421` and `WB-00511`; `false` for `WB-00423`)*
      - `+ availabilityBadge`: `string` *(e.g., `"Available"`, `"Reserved for Maya"`, or `"Already borrowed"`)*
      - `+ defaultDueDate`: `string` *(ISO date `today + 14 days`, e.g., `"2026-10-29"`)*
      - `+ associatedHold`: `Object | null` *(populated if copy is reserved for `studentAccountId`)*
        - **Properties of `associatedHold`:**
          - `+ _id`: `string`
          - `+ holdCode`: `string` *(e.g., `"HLD-1042"`)*
          - `+ collectBy`: `string` *(e.g., `"2026-10-16T15:30:00Z"`)*
      - `+ blockingInfo`: `Object | null` *(populated when `canAdd === false`)*
        - **Properties of `blockingInfo`:**
          - `+ reasonCode`: `string` (`"ALREADY_BORROWED"` | `"RESERVED_FOR_OTHER"` | `"COPY_UNAVAILABLE"`)
          - `+ message`: `string` *(e.g., `"WB-00423 is already borrowed — not added. The Midnight Library · Amira Khan (S10216), due 16 Oct 2026. Enter a different copy ID."`)*
          - `+ currentBorrowerName`: `string | null` *(e.g., `"Amira Khan"`)*
          - `+ currentBorrowerAccountId`: `string | null` *(e.g., `"S10216"`)*
          - `+ currentDueDate`: `string | null` *(e.g., `"2026-10-16"`)*
- **Error Cases:**
  - `404 Not Found` (`COPY_NOT_FOUND`): No physical copy matches `:copyCode`.

---

### 7.3 `issueBooks`: `(POST) /staff/loans/issue`
- **Access:** Staff Only (`staff`)
- **Description:** Step 3 of *"Loan a Book"* (`StaffView` Pages 3–4 *"Confirm issue of N books"* / *"Issue N books"*). Atomically validates borrower eligibility, copy states, hold ownership, and the 5-loan limit; creates one separate `Loan` entry per copy (`BR-2112`, `BR-2113`); transitions all issued copies to `state = "Borrowed"`; and marks any matching student holds (`HLD-1042`) as `"Fulfilled"`.
- **Request Body:**
  - `+ studentAccountId`: `string` *(required, e.g., `"S10428"`)*
  - `+ items`: `array of Object` *(required, 1 to 5 items)*
    - **Properties of `Object`:**
      - `+ copyCode`: `string` *(required, e.g., `"WB-00421"`)*
      - `+ dueDate`: `string` *(required, ISO date e.g., `"2026-10-29"`)*
- **Response Data (`201 Created`):**
  - `+ success`: `boolean`
  - `+ message`: `string` *(e.g., `"2 books issued. Checkout confirmed for Maya Chen · S10428"`)*
  - `+ data`: `issueTransactionReceipt`
    - **Properties of `issueTransactionReceipt`:**
      - `+ issuedAt`: `string` *(ISO timestamp, e.g., `"2026-10-15T11:11:00Z"`)*
      - `+ borrowEntries`: `array of Object`
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ borrowCode`: `string` *(e.g., `"BR-2112"`, `"BR-2113"`)*
          - `+ copyCode`: `string` *(e.g., `"WB-00421"`, `"WB-00511"`)*
          - `+ book`: `Object` (`_id`, `title`, `author`, `coverImageUrl`)
          - `+ borrowedAt`: `string` *(e.g., `"2026-10-15"`)*
          - `+ dueDate`: `string` *(e.g., `"2026-10-29"`)*
      - `+ fulfilledHolds`: `array of Object`
        - **Properties of `Object`:**
          - `+ holdCode`: `string` *(e.g., `"HLD-1042"`)*
          - `+ copyCode`: `string` *(e.g., `"WB-00421"`)*
          - `+ message`: `string` *(e.g., `"WB-00421 was reserved for Maya. Collection is confirmed; this copy is no longer held."`)*
      - `+ borrowerSummary`: `Object`
        - **Properties of `borrowerSummary`:**
          - `+ studentId`: `string`
          - `+ accountId`: `string` *(e.g., `"S10428"`)*
          - `+ fullName`: `string` *(e.g., `"Maya Chen"`)*
          - `+ yearGroup`: `string` *(e.g., `"Year 10"`)*
          - `+ loansBefore`: `int` *(e.g., `2`)*
          - `+ loansNow`: `int` *(e.g., `4`)*
          - `+ maxLoansLimit`: `int` *(e.g., `5`)*
          - `+ remainingLoanSpace`: `int` *(e.g., `1`)*
- **Error Cases:**
  - `400 Bad Request` (`DUPLICATE_COPY_IN_BATCH`): Duplicate `copyCode` in `items`.
  - `403 Forbidden` (`BORROWER_INELIGIBLE` | `LOAN_LIMIT_EXCEEDED`): Student has overdue books, unpaid fines, or `activeLoansCount + items.length > 5`.
  - `409 Conflict` (`COPY_NOT_AVAILABLE_FOR_STUDENT`): One or more copies are already borrowed, damaged, lost, or reserved for another student.

---

### 7.4 `findActiveLoanByCopy`: `(GET) /staff/loans/active-by-copy/:copyCode`
- **Access:** Staff Only (`staff`)
- **Description:** Step 1 of *"Return a Book"* (`StaffView` Page 5 *"Find the copy → Find loan"*). Looks up the active loan associated with a physical copy barcode (`WB-00632`) so staff can inspect the book and confirm its return.
  - **Business Rule:** *"Only an active loan can be checked in. A copy already returned will not be returned again."*
- **Request Params:**
  - `+ copyCode`: `string` *(Physical copy barcode, e.g., `"WB-00632"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `activeLoanLookup`
    - **Properties of `activeLoanLookup`:**
      - `+ loan`: `Object`
        - **Properties of `loan`:**
          - `+ _id`: `string`
          - `+ borrowCode`: `string` *(e.g., `"BR-2106"`)*
          - `+ borrowedAt`: `string` *(e.g., `"2026-10-12"`)*
          - `+ dueDate`: `string` *(e.g., `"2026-10-26"`)*
          - `+ returningToday`: `string` *(e.g., `"2026-10-15"`)*
          - `+ isOverdue`: `boolean` *(e.g., `false`)*
          - `+ timingBadge`: `string` *(e.g., `"On time"` or `"Overdue · 2 days"`)*
      - `+ copy`: `Object`
        - **Properties of `copy`:**
          - `+ _id`: `string`
          - `+ copyCode`: `string` *(e.g., `"WB-00632"`)*
          - `+ currentCondition`: `string` *(e.g., `"Good"`)*
          - `+ homeLocation`: `string` *(e.g., `"SCI HAW · B2"`)*
      - `+ book`: `Object`
        - **Properties of `book`:**
          - `+ _id`: `string`
          - `+ title`: `string` *(e.g., `"A Brief History of Time"`)*
          - `+ author`: `string` *(e.g., `"Stephen Hawking"`)*
          - `+ coverImageUrl`: `string | null`
      - `+ borrower`: `Object`
        - **Properties of `borrower`:**
          - `+ _id`: `string`
          - `+ accountId`: `string` *(e.g., `"S10428"`)*
          - `+ fullName`: `string` *(e.g., `"Maya Chen"`)*
          - `+ initials`: `string` *(e.g., `"MC"`)*
          - `+ yearGroup`: `string` *(e.g., `"Year 10"`)*
          - `+ activeLoansBeforeReturn`: `int` *(e.g., `3`)*
          - `+ activeLoansAfterReturn`: `int` *(e.g., `2`)*
          - `+ maxLoansLimit`: `int` *(e.g., `5`)*
- **Error Cases:**
  - `404 Not Found` (`ACTIVE_LOAN_NOT_FOUND`): Copy does not exist or does not currently have an active loan.

---

### 7.5 `returnBook`: `(POST) /staff/loans/:id/return`
- **Access:** Staff Only (`staff`)
- **Description:** Step 2 of *"Return a Book"* (`StaffView` Page 5 *"Confirm return"*). Records the physical copy's return condition, closes the active loan into returned history (without deleting the loan record), decrements the student's active loan count, and updates the physical copy's state:
  - If `condition === "Good"` → Copy `state` becomes `"Available"` and `condition` is `"Good"`.
  - If `condition === "Damaged"` or `"Lost"` → Copy `state` and `condition` become `"Damaged"` or `"Lost"`, keeping the copy unavailable for borrowing (*"This does not create or settle a fine"*).
- **Request Params:**
  - `+ id`: `string` *(Loan `_id` or `borrowCode` e.g., `"BR-2106"`)*
- **Request Body:**
  - `+ condition`: `string` *(required, `"Good"` | `"Damaged"` | `"Lost"`)*
  - `+ conditionNote`: `string` *(optional, e.g., `"No new damage"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"Book return confirmed and saved in returned history."`)
  - `+ data`: `returnDetail`
    - **Properties of `returnDetail`:**
      - `+ _id`: `string`
      - `+ borrowCode`: `string` *(e.g., `"BR-2098"` or `"BR-2106"`)*
      - `+ status`: `string` (`"Returned"`)
      - `+ borrower`: `Object`
        - **Properties of `borrower`:**
          - `+ accountId`: `string` *(e.g., `"S10428"`)*
          - `+ fullName`: `string` *(e.g., `"Maya Chen"`)*
          - `+ loansBefore`: `int` *(e.g., `4`)*
          - `+ loansAfter`: `int` *(e.g., `3`)*
      - `+ borrowedAt`: `string` *(e.g., `"2026-10-08"`)*
      - `+ dueDate`: `string` *(e.g., `"2026-10-22"`)*
      - `+ returnedAt`: `string` *(ISO timestamp, e.g., `"2026-10-15T11:20:00Z"`)*
      - `+ returnCondition`: `string` (`"Good"` | `"Damaged"` | `"Lost"`)
      - `+ conditionNote`: `string | null`
      - `+ copy`: `Object`
        - **Properties of `copy`:**
          - `+ copyCode`: `string` *(e.g., `"WB-00216"`)*
          - `+ newState`: `string` (`"Available"` | `"Damaged"` | `"Lost"`)
          - `+ homeLocation`: `string` *(e.g., `"FIC PAL · A2"`)*
- **Error Cases:**
  - `404 Not Found` (`LOAN_NOT_FOUND`)
  - `409 Conflict` (`LOAN_ALREADY_RETURNED`): `"Only an active loan can be checked in. A copy already returned will not be returned again."`

---

### 7.6 `getLoanRecords`: `(GET) /staff/loans`
- **Access:** Staff Only (`staff`)
- **Description:** Lists, searches, filters, and paginates all library loan records for the *"Loan Records"* screen (`StaffView` Page 11: *"Active loans"* and *"Returned history"* tabs).
- **Request Query:**
  - `+ tab`: `string` *(optional — `"active"` | `"returned"`, default `"active"`)*
  - `+ q`: `string` *(optional — searches by student name, `studentAccountId`, `copyCode`, `borrowCode`, or book `title`)*
  - `+ status`: `string` *(optional — filter for active loans: `"all"` | `"overdue"` | `"due_soon"` | `"on_loan"`, default `"all"`)*
  - `+ sortBy`: `string` *(optional — `"dueDate"` | `"borrowedAt"` | `"returnedAt"`, default `"dueDate"`)*
  - `+ sortOrder`: `string` *(optional — `"asc"` | `"desc"`, default `"asc"`)*
  - `+ page`: `int` *(optional, default `1`)*
  - `+ limit`: `int` *(optional, default `6`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `loanRecordsPage`
    - **Properties of `loanRecordsPage`:**
      - `+ items`: `array of Object`
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ borrowCode`: `string` *(e.g., `"BR-2081"`)*
          - `+ status`: `string` (`"Active"` | `"Returned"`)
          - `+ book`: `Object`
            - **Properties of `book`:**
              - `+ _id`: `string`
              - `+ title`: `string` *(e.g., `"The Hobbit"`)*
              - `+ author`: `string` *(e.g., `"J.R.R. Tolkien"`)*
              - `+ coverImageUrl`: `string | null`
          - `+ copy`: `Object`
            - **Properties of `copy`:**
              - `+ _id`: `string`
              - `+ copyCode`: `string` *(e.g., `"WB-00318"`)*
          - `+ borrower`: `Object`
            - **Properties of `borrower`:**
              - `+ _id`: `string`
              - `+ fullName`: `string` *(e.g., `"Oliver Brown"`)*
              - `+ accountId`: `string` *(e.g., `"S10312"`)*
          - `+ borrowedAt`: `string` *(e.g., `"2026-09-29"`)*
          - `+ dueDate`: `string` *(e.g., `"2026-10-13"`)*
          - `+ returnedAt`: `string | null` *(populated when `status === "Returned"`)*
          - `+ returnCondition`: `string | null`
          - `+ isOverdue`: `boolean`
          - `+ statusBadge`: `string` *(e.g., `"Overdue · 2 days"`, `"Due tomorrow"`, `"On loan"`, or `"Returned"`)*
      - `+ pagination`: `Object`
        - **Properties of `pagination`:**
          - `+ totalItems`: `int` *(e.g., `13`)*
          - `+ currentPage`: `int` *(e.g., `1`)*
          - `+ totalPages`: `int` *(e.g., `3`)*
          - `+ limit`: `int` *(e.g., `6`)*

---

### 7.7 `getActiveHolds`: `(GET) /staff/holds`
- **Access:** Staff Only (`staff`)
- **Description:** Lists active student holds so Staff can see reserved copies waiting at the counter and release any uncollected holds past their `collectBy` deadline via `DELETE /holds/:id`.
- **Request Query:**
  - `+ q`: `string` *(optional — searches by `holdCode`, `studentAccountId`, student name, `copyCode`, or book title)*
  - `+ page`: `int` *(optional, default `1`)*
  - `+ limit`: `int` *(optional, default `10`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `activeHoldsPage`
    - **Properties of `activeHoldsPage`:**
      - `+ items`: `array of Object`
        - **Properties of `Object`:**
          - `+ _id`: `string`
          - `+ holdCode`: `string` *(e.g., `"HLD-1042"`)*
          - `+ status`: `string` (`"Ready"`)
          - `+ requestedAt`: `string`
          - `+ collectBy`: `string`
          - `+ isPastDeadline`: `boolean` *(`true` if `currentTime > collectBy`)*
          - `+ student`: `Object` (`_id`, `accountId`, `fullName`, `yearGroup`)
          - `+ book`: `Object` (`_id`, `title`, `author`, `coverImageUrl`)
          - `+ copy`: `Object` (`_id`, `copyCode`, `homeLocation`)
      - `+ pagination`: `Object` (`totalItems`, `currentPage`, `totalPages`, `limit`)

---

## 8. Route Group 6: Admin Account Management Route (`/admin/users`)
*Supports: Admin Workspace (referenced in `GuestView.pdf` Pages 2–3: "Manage accounts, permissions and library oversight" & "Accounts are issued by the school")*

### 8.1 `getUsers`: `(GET) /admin/users`
- **Access:** Admin Only (`admin`)
- **Description:** Lists, searches, filters, and paginates all school-issued accounts (`student`, `staff`, `admin`).
- **Request Query:**
  - `+ q`: `string` *(optional — searches by `accountId` or `fullName`)*
  - `+ role`: `string` *(optional — `"all"` | `"student"` | `"staff"` | `"admin"`, default `"all"`)*
  - `+ status`: `string` *(optional — `"all"` | `"Active"` | `"Inactive"`, default `"all"`)*
  - `+ page`: `int` *(optional, default `1`)*
  - `+ limit`: `int` *(optional, default `10`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `usersPage`
    - **Properties of `usersPage`:**
      - `+ items`: `array of Object` *(see Section 2.1 `User` Object)*
      - `+ pagination`: `Object` (`totalItems`, `currentPage`, `totalPages`, `limit`)

---

### 8.2 `createUser`: `(POST) /admin/users`
- **Access:** Admin Only (`admin`)
- **Description:** Issues a new school account (`student`, `staff`, or `admin`) with an initial password. Automatically derives `initials` from `fullName`.
- **Request Body:**
  - `+ accountId`: `string` *(required, unique school account ID, e.g., `"S10520"` or `"STF002"`)*
  - `+ fullName`: `string` *(required, e.g., `"Lucas Nguyen"`)*
  - `+ password`: `string` *(required, initial password)*
  - `+ role`: `string` *(required, `"student"` | `"staff"` | `"admin"`)*
  - `+ yearGroup`: `string | null` *(optional, e.g., `"Year 10"` for students)*
- **Response Data (`201 Created`):**
  - `+ success`: `boolean`
  - `+ data`: `user` *(newly created `User` Object with `status: "Active"`)*
- **Error Cases:**
  - `400 Bad Request` (`VALIDATION_ERROR`): Missing required fields.
  - `409 Conflict` (`DUPLICATE_ACCOUNT_ID`): An account with this `accountId` already exists.

---

### 8.3 `updateUser`: `(PUT) /admin/users/:id`
- **Access:** Admin Only (`admin`)
- **Description:** Modifies an existing account's profile details, assigned role, year group, or active status (`"Active"` | `"Inactive"`).
- **Request Params:**
  - `+ id`: `string` *(User `_id` or `accountId` e.g., `"S10428"`)*
- **Request Body:**
  - `+ fullName`: `string` *(required)*
  - `+ role`: `string` *(required, `"student"` | `"staff"` | `"admin"`)*
  - `+ yearGroup`: `string | null` *(optional)*
  - `+ status`: `string` *(required, `"Active"` | `"Inactive"`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ data`: `user` *(updated `User` Object)*
- **Error Cases:**
  - `404 Not Found` (`USER_NOT_FOUND`)

---

### 8.4 `resetUserPassword`: `(POST) /admin/users/:id/reset-password`
- **Access:** Admin Only (`admin`)
- **Description:** Resets a user's forgotten password (*"Need an account or a password reset? Accounts are issued by the school"*).
- **Request Params:**
  - `+ id`: `string` *(User `_id` or `accountId`)*
- **Request Body:**
  - `+ newPassword`: `string` *(required)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"Password reset successfully for account S10428."`)
- **Error Cases:**
  - `404 Not Found` (`USER_NOT_FOUND`)

---

### 8.5 `deleteUser`: `(DELETE) /admin/users/:id`
- **Access:** Admin Only (`admin`)
- **Description:** Deletes a user account. Consistent with the deletion safeguard on Books and Copies, deletion is blocked if the user has active loans, active holds, or historical loan records (Admin should set `status: "Inactive"` via `PUT /admin/users/:id` instead).
- **Request Params:**
  - `+ id`: `string` *(User `_id` or `accountId`)*
- **Response Data (`200 OK`):**
  - `+ success`: `boolean`
  - `+ message`: `string` (`"User account deleted successfully."`)
- **Error Cases:**
  - `404 Not Found` (`USER_NOT_FOUND`)
  - `409 Conflict` (`USER_HAS_LOAN_HISTORY`): `"Cannot delete an account with borrowing or hold history. Deactivate the account (status: Inactive) instead."`

---

## 9. UI Screen-to-Endpoint Traceability Matrix

| Figma File & Page | UI Screen / Modal | Primary Endpoints Used |
| :--- | :--- | :--- |
| `GuestView.pdf` — Page 1 | Guest Home ("A few stories from our shelves") | `GET /books/featured` |
| `GuestView.pdf` — Pages 2–3 | Role Selection (`student` / `staff` / `admin`) & Sign In | `POST /auth/login`, `GET /auth/me` |
| `StudentView.pdf` — Page 1 | Student Home (Search bar & Featured books) | `GET /auth/me`, `GET /books/featured`, `GET /books` |
| `StudentView.pdf` — Page 2 | The Book Catalog (Search, Category/Genre/Language filters) | `GET /books` |
| `StudentView.pdf` — Page 3 | Book Detail & Copies Table ("Request to hold") | `GET /books/:id`, `POST /holds` |
| `StudentView.pdf` — Page 4 | Hold Request Successful (`HLD-1042`) | `POST /holds`, `DELETE /holds/:id` |
| `StudentView.pdf` — Page 5 | My Borrowing (Current Loans, Renew, Holds, History) | `GET /me/borrowing`, `POST /loans/:id/renew`, `DELETE /holds/:id` |
| `StaffView.pdf` — Page 1 | Staff Home | `GET /auth/me` |
| `StaffView.pdf` — Pages 2–3 | Loan a Book (Find Student, Check Copies, Confirm Modal) | `GET /staff/students/:accountId`, `GET /staff/copies/:copyCode/checkout-check`, `POST /staff/loans/issue` |
| `StaffView.pdf` — Page 4 | 2 Books Issued Receipt (`BR-2112`, `BR-2113`) | `POST /staff/loans/issue` |
| `StaffView.pdf` — Page 5 | Return a Book (Find Loan by Copy, Condition & Confirm) | `GET /staff/loans/active-by-copy/:copyCode`, `POST /staff/loans/:id/return` |
| `StaffView.pdf` — Page 6 | Manage Books — Title Inventory | `GET /books` |
| `StaffView.pdf` — Page 7 | Add a Book Modal | `POST /books` |
| `StaffView.pdf` — Page 8 | Edit Book Metadata & Physical Copies List | `GET /books/:id`, `PUT /books/:id`, `DELETE /books/:id` |
| `StaffView.pdf` — Page 9 | Add a Physical Copy Modal | `POST /books/:bookId/copies` |
| `StaffView.pdf` — Page 10 | Edit / Delete Physical Copy Modal | `PUT /copies/:id`, `DELETE /copies/:id` |
| `StaffView.pdf` — Page 11 | Loan Records & Counter Hold Management | `GET /staff/loans`, `GET /staff/holds`, `DELETE /holds/:id` |
| *Admin View (Non-Figma)* | Admin Account & Password Management | `GET /admin/users`, `POST /admin/users`, `PUT /admin/users/:id`, `POST /admin/users/:id/reset-password`, `DELETE /admin/users/:id` |