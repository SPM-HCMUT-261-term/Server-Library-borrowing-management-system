# Repository test cases: holds, loans and book-inventories modules

This document describes every test case in the three repository test files:

- Holds: [holds.respository.test.ts](../src/modules/holds/repositories/holds.respository.test.ts) tests `HoldsRepositoryImpl`. API contract 6.2, 6.3, 7.7.
- Loans: [loans.repository.test.ts](../src/modules/loans/repositories/loans.repository.test.ts) tests `BorrowersRepositoryImpl`, `LoansRepositoryImpl`, `LoanCopiesRepositoryImpl` and `LoanHoldsRepositoryImpl`. API contract 6.1, 6.4, 7.1 – 7.6.
- Book-inventories: [book-inventories.respository.test.ts](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts) tests `BooksRepositoryImpl` and `PhysicalCopiesRepositoryImpl`. API contract 4.1 – 4.6, 5.1 – 5.3.

The seed data (users, books, copies, loans, holds, fines and their ids) is listed in [Initial_result_repo_test.md](Initial_result_repo_test.md): section 3 for book-inventories, sections 4 and 5 for holds and loans.

> Open this file in the Markdown preview (`Ctrl+Shift+V` in VS Code). The Input and Expected cells use `<pre>` blocks, which only render as formatted objects in the preview.

## How the tests run

| Step | What happens |
| :--- | :--- |
| `beforeEach` | `TRUNCATE ... RESTART IDENTITY CASCADE` on all app tables, then the module's seed function. Every test starts from the same data and the same ids. |
| `afterEach` | Truncates again. |
| Setup inside a test | Some tests change one row first. This is shown as `// setup` in the **Input** cell. |

Command:

```bash
npx vitest run src/modules/holds src/modules/loans src/modules/book-inventories
```

## Notation

| Notation | Meaning |
| :--- | :--- |
| Input cell | The call the test makes, written as TypeScript. Several calls are listed in the order the test makes them. |
| Expected cell | The value each call returns, in the same order as the calls. |
| `{ // partial` | The test uses `toMatchObject`: only the fields shown are checked. Without `// partial`, the test uses `toEqual`, so the object must match exactly. |
| `// After` | What the test reads back from the database after the call(s). |
| `today ± n` | The database `CURRENT_DATE ± n`, read back from the database by the `dbDate(n)` helper. |
| `"3"` | Ids are passed and returned as strings (`id::text`). The number is the seed id. |
| `any string` | The test only checks that the value is a string. |
| `same instant as …` | Timestamp checked with the `sameInstant()` helper. PostgreSQL compares the two values, so the text format the repository returns does not matter. |
| `HLD-\d+` / `BR-\d+` | A generated code is only checked by its format and that it is new, because a sequence is not reset by `TRUNCATE`. |
| `titles: [...]` | Book lists are compared by `books.map(b => b.title)`, in order (book-inventories). |
| `rejects RangeError` | The call throws a `RangeError` before any SQL runs (an invalid parameter, not a "not found"). |

## Contents

- [1. Holds module](#1-holds-module)
  - [getStudentBorrowingStatus](#11-getstudentborrowingstatus) · [getBookStock](#12-getbookstock) · [hasActiveLoanOrHoldForBook](#13-hasactiveloanorholdforbook) · [findHoldById](#14-findholdbyid) · [getActiveHolds](#15-getactiveholds) · [createHold](#16-createhold) · [cancelHold](#17-cancelhold)
- [2. Loans module](#2-loans-module)
  - BorrowersRepository: [getBorrowerWithStatsByAccountId](#21-getborrowerwithstatsbyaccountid) · [getBorrowerWithStatsById](#22-getborrowerwithstatsbyid)
  - LoansRepository: [getLoanWithDetailByIdOrBorrowCode](#23-getloanwithdetailbyidorborrowcode) · [getActiveLoanWithDetailByCopyCode](#24-getactiveloanwithdetailbycopycode) · [getCurrentLoansWithDetailByStudentId](#25-getcurrentloanswithdetailbystudentid) · [getReturnedLoansWithDetailByStudentId](#26-getreturnedloanswithdetailbystudentid) · [getLoanRecords](#27-getloanrecords) · [issueLoans](#28-issueloans) · [returnLoan](#29-returnloan) · [renewLoan](#210-renewloan)
  - LoanCopiesRepository: [getCopiesForCheckoutByCopyCodes](#211-getcopiesforcheckoutbycopycodes)
  - LoanHoldsRepository: [getReadyHoldsByStudentId](#212-getreadyholdsbystudentid) · [getBookIdsWithReadyHold](#213-getbookidswithreadyhold)
- [3. Book-inventories module](#3-book-inventories-module)
  - BooksRepository: [getFeaturedBooks](#31-getfeaturedbooks) · [getBooks](#32-getbooks) · [getBookById](#33-getbookbyid) · [getBooksWithSummaryInfoById](#34-getbookswithsummaryinfobyid) · [getBooksWithSummaryInfoByIdOrIsbn](#35-getbookswithsummaryinfobyidorisbn) · [getBookByIsbn](#36-getbookbyisbn) · [getBookViewerContext](#37-getbookviewercontext) · [createBook](#38-createbook) · [updateBookById](#39-updatebookbyid) · [deleteBookById](#310-deletebookbyid)
  - PhysicalCopiesRepository: [getPhysicalCopyWithLoanAndHoldStateById](#311-getphysicalcopywithloanandholdstatebyid) · [getPyhsicalCopy](#312-getpyhsicalcopy) · [getPhysicalCopiesByBookIdWithActiveLoanAndHold](#313-getphysicalcopiesbybookidwithactiveloanandhold) · [addCopyToBookStock](#314-addcopytobookstock) · [getSummaryStockAfterAddCopyToBookStock](#315-getsummarystockafteraddcopytobookstock) · [getSummaryStockAfterUpdateCopyToBookStock](#316-getsummarystockafterupdatecopytobookstock) · [updatePhysicalCopy](#317-updatephysicalcopy) · [deletePhysicalCopyById](#318-deletephysicalcopybyid)
- [4. Test count](#4-test-count)

---

## 1. Holds module

Seed ids used below. Users: Maya `1` (STU001), Amira `2` (STU002), Fines Student `3` (STU003), Fresh `4` (STU004), Staff `5`.
Books: Midnight Library `1`, Wonder `2`, Brief History `3`, Persepolis `4`, Truyện Kiều `5`.
Holds: HLD-0900 `1` (Cancelled), HLD-0901 `2` (Fulfilled), HLD-1001 `3` (Ready), HLD-1002 `4` (Ready).

### 1.1 getStudentBorrowingStatus

Used by `POST /holds` to apply rule 1: no overdue books and no unpaid fines.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Student in good standing](../src/modules/holds/repositories/holds.respository.test.ts#L323) | <pre>getStudentBorrowingStatus("1")  // Maya</pre> | <pre>{<br>  id: "1",<br>  activeLoansCount: 1,  // Ready hold HLD-1001 is not a loan<br>  maxLoansLimit: 5,<br>  overdueLoansCount: 0,<br>  unpaidFines: 0<br>}</pre> |
| 2 | [Overdue loan is counted](../src/modules/holds/repositories/holds.respository.test.ts#L336) | <pre>getStudentBorrowingStatus("2")  // Amira</pre> | <pre>{ // partial<br>  activeLoansCount: 1,<br>  overdueLoansCount: 1,  // BR-1001, due today − 3<br>  unpaidFines: 0<br>}</pre> |
| 3 | [Only unpaid fines are summed](../src/modules/holds/repositories/holds.respository.test.ts#L343) | <pre>getStudentBorrowingStatus("3")  // Fines Student</pre> | <pre>{ // partial<br>  activeLoansCount: 0,<br>  overdueLoansCount: 0,<br>  unpaidFines: 3.75  // a number: 2.50 + 1.25, Paid 10.00 ignored<br>}</pre> |
| 4 | [Returned loans are ignored](../src/modules/holds/repositories/holds.respository.test.ts#L351) | <pre>getStudentBorrowingStatus("1")  // Maya</pre> | <pre>result.activeLoansCount === 1  // BR-1000 (Returned) not counted</pre> |
| 5 | [Unknown student](../src/modules/holds/repositories/holds.respository.test.ts#L358) | <pre>getStudentBorrowingStatus("999999")</pre> | <pre>null</pre> |

### 1.2 getBookStock

Gives the `stockSummary` of the hold confirmation, and checks rule 3 (at least one Available copy).

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Derived stock as numbers](../src/modules/holds/repositories/holds.respository.test.ts#L367) | <pre>getBookStock("2")  // Wonder</pre> | <pre>{<br>  bookId: "2",<br>  totalCopies: 3,<br>  availableCopies: 1,<br>  borrowedCopies: 1,<br>  reservedCopies: 1<br>}</pre> |
| 2 | [Reserved counted apart from available](../src/modules/holds/repositories/holds.respository.test.ts#L380) | <pre>getBookStock("1")  // Midnight</pre> | <pre>{<br>  bookId: "1",<br>  totalCopies: 3,<br>  availableCopies: 2,<br>  borrowedCopies: 0,<br>  reservedCopies: 1<br>}</pre> |
| 3 | [Lost-only title and title without copies](../src/modules/holds/repositories/holds.respository.test.ts#L392) | <pre>getBookStock("4")  // Persepolis<br>getBookStock("5")  // Truyện Kiều</pre> | <pre>// Persepolis<br>{<br>  bookId: "4",<br>  totalCopies: 1,<br>  availableCopies: 0,<br>  borrowedCopies: 0,<br>  reservedCopies: 0<br>}<br>// Truyện Kiều: all zero, not null<br>{<br>  bookId: "5",<br>  totalCopies: 0,<br>  availableCopies: 0,<br>  borrowedCopies: 0,<br>  reservedCopies: 0<br>}</pre> |
| 4 | [Unknown book](../src/modules/holds/repositories/holds.respository.test.ts#L414) | <pre>getBookStock("999999")</pre> | <pre>null</pre> |

### 1.3 hasActiveLoanOrHoldForBook

Rule 2 of `POST /holds`: the student must not already have an Active loan or a Ready hold on the same title.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Ready hold on the title](../src/modules/holds/repositories/holds.respository.test.ts#L423) | <pre>hasActiveLoanOrHoldForBook({<br>  studentId: "1",  // Maya<br>  bookId: "1"      // Midnight<br>})</pre> | <pre>true  // HLD-1001</pre> |
| 2 | [Active loan on the title, overdue or not](../src/modules/holds/repositories/holds.respository.test.ts#L432) | <pre>hasActiveLoanOrHoldForBook({<br>  studentId: "1",  // Maya<br>  bookId: "3"      // Brief History<br>})<br>hasActiveLoanOrHoldForBook({<br>  studentId: "2",  // Amira<br>  bookId: "2"      // Wonder<br>})</pre> | <pre>true  // BR-1002<br>true  // BR-1001 (overdue)</pre> |
| 3 | [Only a returned loan](../src/modules/holds/repositories/holds.respository.test.ts#L446) | <pre>hasActiveLoanOrHoldForBook({<br>  studentId: "1",  // Maya<br>  bookId: "2"      // Wonder<br>})</pre> | <pre>false  // BR-1000 is Returned</pre> |
| 4 | [Only a cancelled hold](../src/modules/holds/repositories/holds.respository.test.ts#L455) | <pre>hasActiveLoanOrHoldForBook({<br>  studentId: "4",  // Fresh<br>  bookId: "1"      // Midnight<br>})</pre> | <pre>false  // HLD-0900 is Cancelled</pre> |
| 5 | [Other students' rows are ignored](../src/modules/holds/repositories/holds.respository.test.ts#L464) | <pre>hasActiveLoanOrHoldForBook({<br>  studentId: "3",  // Fines Student<br>  bookId: "2"      // Wonder<br>})</pre> | <pre>false  // Amira borrows Wonder and Fresh holds it,<br>       // but this student has nothing on it</pre> |
| 6 | [Unknown book](../src/modules/holds/repositories/holds.respository.test.ts#L474) | <pre>hasActiveLoanOrHoldForBook({<br>  studentId: "1",<br>  bookId: "999999"<br>})</pre> | <pre>false</pre> |

### 1.4 findHoldById

`DELETE /holds/:id` looks up the hold by `_id` or `holdCode`, in any status.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [By hold code, with book, copy and student](../src/modules/holds/repositories/holds.respository.test.ts#L485) | <pre>findHoldById("HLD-1001")</pre> | <pre>{<br>  id: "3",<br>  holdCode: "HLD-1001",<br>  status: "Ready",<br>  requestedAt: any string,  // same instant as 2026-11-01T09:00:00Z<br>  collectBy: any string,    // same instant as 2026-11-02T08:30:00Z<br>  book: {<br>    id: "1",<br>    title: "The Midnight Library",<br>    author: "Matt Haig",<br>    format: "Paperback",<br>    shelfReference: "FIC HAI · A3",<br>    coverImageUrl: null<br>  },<br>  copy: {<br>    id: "3",<br>    copyCode: "WB-00423",<br>    homeLocation: "FIC HAI · A3"<br>  },<br>  student: {<br>    id: "1",<br>    accountId: "STU001",<br>    fullName: "Maya Chen",<br>    yearGroup: "Year 10"<br>  }<br>}</pre> |
| 2 | [By database id](../src/modules/holds/repositories/holds.respository.test.ts#L519) | <pre>findHoldById("3")</pre> | <pre>// equal to findHoldById("HLD-1001") (case 1)</pre> |
| 3 | [Any status is returned](../src/modules/holds/repositories/holds.respository.test.ts#L527) | <pre>findHoldById("HLD-0900")<br>findHoldById("HLD-0901")</pre> | <pre>{ // partial<br>  holdCode: "HLD-0900",<br>  status: "Cancelled"<br>}<br>{ // partial<br>  holdCode: "HLD-0901",<br>  status: "Fulfilled"<br>}<br>// the service needs these to answer HOLD_NOT_CANCELLABLE</pre> |
| 4 | [Copy deleted](../src/modules/holds/repositories/holds.respository.test.ts#L536) | <pre>// setup<br>UPDATE holds SET copy_id = NULL<br>  WHERE hold_code = 'HLD-1002';<br><br>findHoldById("HLD-1002")</pre> | <pre>{ // partial<br>  holdCode: "HLD-1002",<br>  copy: null,<br>  book: { title: "Wonder" }<br>}</pre> |
| 5 | [Unknown hold](../src/modules/holds/repositories/holds.respository.test.ts#L546) | <pre>findHoldById("HLD-9999")<br>findHoldById("999999")</pre> | <pre>null<br>null</pre> |

### 1.5 getActiveHolds

`GET /staff/holds`: Ready holds only, newest request first. The test reads `holds.map(h => h.holdCode)` as "codes" below.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Only Ready holds, newest first](../src/modules/holds/repositories/holds.respository.test.ts#L553) | <pre>getActiveHolds({})</pre> | <pre>codes: ["HLD-1002", "HLD-1001"]<br>totalItem: 2</pre> |
| 2 | [Item mapping](../src/modules/holds/repositories/holds.respository.test.ts#L561) | <pre>getActiveHolds({ q: "HLD-1002" })</pre> | <pre>{<br>  holds: [<br>    {<br>      id: "4",<br>      holdCode: "HLD-1002",<br>      status: "Ready",<br>      requestedAt: any string,<br>      collectBy: any string,<br>      book: {<br>        id: "2",<br>        title: "Wonder",<br>        author: "R.J. Palacio",<br>        format: "Paperback",<br>        shelfReference: "FIC PAL · A2",<br>        coverImageUrl: null<br>      },<br>      copy: {<br>        id: "6",<br>        copyCode: "WB-00218",<br>        homeLocation: "FIC PAL · A2"<br>      },<br>      student: {<br>        id: "4",<br>        accountId: "STU004",<br>        fullName: "Fresh Student",<br>        yearGroup: "Year 10"<br>      }<br>    }<br>  ],<br>  totalItem: 1<br>}</pre> |
| 3 | [Search, case-insensitive](../src/modules/holds/repositories/holds.respository.test.ts#L595) | <pre>getActiveHolds({ q: "hld-1001" })      // hold code<br>getActiveHolds({ q: "stu004" })        // account id<br>getActiveHolds({ q: "MAYA" })          // student name<br>getActiveHolds({ q: "wb-00218" })      // copy code<br>getActiveHolds({ q: "midnight" })      // book title<br>getActiveHolds({ q: "no such hold" })</pre> | <pre>codes: ["HLD-1001"]<br>codes: ["HLD-1002"]<br>codes: ["HLD-1001"]<br>codes: ["HLD-1002"]<br>codes: ["HLD-1001"]<br>{ holds: [], totalItem: 0 }</pre> |
| 4 | [Non-Ready holds never appear](../src/modules/holds/repositories/holds.respository.test.ts#L621) | <pre>getActiveHolds({ q: "HLD-0900" })  // Cancelled<br>getActiveHolds({ q: "HLD-0901" })  // Fulfilled</pre> | <pre>{ holds: [], totalItem: 0 }<br>{ holds: [], totalItem: 0 }</pre> |
| 5 | [Empty search = no filter](../src/modules/holds/repositories/holds.respository.test.ts#L629) | <pre>getActiveHolds({ q: "" })</pre> | <pre>totalItem: 2</pre> |
| 6 | [Pagination](../src/modules/holds/repositories/holds.respository.test.ts#L635) | <pre>getActiveHolds({ page: 1, limit: 1 })<br>getActiveHolds({ page: 2, limit: 1 })<br>getActiveHolds({ page: 3, limit: 1 })</pre> | <pre>codes: ["HLD-1002"], totalItem: 2<br>codes: ["HLD-1001"], totalItem: 2<br>codes: []  // totalItem not checked: with COUNT(*) OVER()<br>           // an empty page has no row to carry it</pre> |

### 1.6 createHold

`POST /holds`, all in one transaction: lock an Available copy, set it to Reserved, generate a `holdCode`, insert a Ready hold.
Every case passes `collectBy: "2026-12-01T08:30:00.000Z"`; it is left out of the Input cells below.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Reserves a copy and creates a Ready hold](../src/modules/holds/repositories/holds.respository.test.ts#L657) | <pre>createHold({<br>  studentId: "4",  // Fresh<br>  bookId: "1",     // Midnight<br>  collectBy: "2026-12-01T08:30:00.000Z"<br>})</pre> | <pre>{ // partial<br>  holdCode: matches HLD-\d+,  // not HLD-0900/0901/1001/1002<br>  status: "Ready",<br>  requestedAt: any string,<br>  collectBy: any string,  // same instant as 2026-12-01T08:30:00Z<br>  book: {<br>    id: "1",<br>    title: "The Midnight Library",<br>    author: "Matt Haig",<br>    format: "Paperback",<br>    shelfReference: "FIC HAI · A3",<br>    coverImageUrl: null<br>  },<br>  copy: {<br>    copyCode: "WB-00421" or "WB-00422",<br>    homeLocation: "FIC HAI · A3"<br>  },<br>  student: {<br>    id: "4",<br>    accountId: "STU004",<br>    fullName: "Fresh Student",<br>    yearGroup: "Year 10"<br>  }<br>}<br>// After<br>assigned copy state: "Reserved"<br>findHoldById(holdCode): equal to the result</pre> |
| 2 | [Stock is updated](../src/modules/holds/repositories/holds.respository.test.ts#L699) | <pre>createHold({<br>  studentId: "4",  // Fresh<br>  bookId: "1"      // Midnight<br>})</pre> | <pre>// After: getBookStock("1")<br>{ // partial<br>  totalCopies: 3,<br>  availableCopies: 1,<br>  reservedCopies: 2<br>}</pre> |
| 3 | [Loan count is not changed](../src/modules/holds/repositories/holds.respository.test.ts#L711) | <pre>createHold({<br>  studentId: "4",  // Fresh<br>  bookId: "1"      // Midnight<br>})</pre> | <pre>// After (rule 6: a hold is not a loan)<br>getStudentBorrowingStatus("4").activeLoansCount: 0<br>users.active_loans_count (id 4): 0</pre> |
| 4 | [New code and new copy each time](../src/modules/holds/repositories/holds.respository.test.ts#L728) | <pre>createHold({ studentId: "4", bookId: "1" })  // Fresh<br>createHold({ studentId: "3", bookId: "1" })  // Fines Student<br>createHold({ studentId: "2", bookId: "1" })  // Amira</pre> | <pre>// 1st and 2nd<br>two holds, codes match HLD-\d+ and are different<br>copies (sorted): ["WB-00421", "WB-00422"]<br>// 3rd: no Available copy left<br>"no_available_copies"</pre> |
| 5 | [No Available copy](../src/modules/holds/repositories/holds.respository.test.ts#L761) | <pre>createHold({ studentId: "4", bookId: "3" })  // Brief History: all Borrowed<br>createHold({ studentId: "4", bookId: "4" })  // Persepolis: Lost only<br>createHold({ studentId: "4", bookId: "5" })  // Truyện Kiều: no copies</pre> | <pre>"no_available_copies"<br>"no_available_copies"<br>"no_available_copies"<br>// After<br>number of hold rows: unchanged<br>WB-00700 state: "Lost"</pre> |
| 6 | [Unknown book](../src/modules/holds/repositories/holds.respository.test.ts#L790) | <pre>createHold({ studentId: "4", bookId: "999999" })</pre> | <pre>"no_available_copies"</pre> |
| 7 | [Race for the last copy](../src/modules/holds/repositories/holds.respository.test.ts#L800) | <pre>// at the same time; Wonder has 1 Available copy (WB-00217)<br>Promise.all([<br>  createHold({ studentId: "1", bookId: "2" }),  // Maya<br>  createHold({ studentId: "3", bookId: "2" })   // Fines Student<br>])</pre> | <pre>one result is a hold with copy.copyCode "WB-00217"<br>the other is "no_available_copies"<br>// After<br>Ready holds on WB-00217: exactly 1<br>// needs row locking (FOR UPDATE SKIP LOCKED)</pre> |

### 1.7 cancelHold

`DELETE /holds/:id`, in one transaction: hold → Cancelled, copy → Available.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Cancel by hold code](../src/modules/holds/repositories/holds.respository.test.ts#L831) | <pre>cancelHold({ id: "HLD-1001" })</pre> | <pre>{<br>  id: "3",<br>  holdCode: "HLD-1001",<br>  status: "Cancelled",<br>  releasedCopyCode: "WB-00423"<br>}<br>// After<br>HLD-1001 status: "Cancelled"<br>WB-00423 state: "Available"<br>getBookStock("1"): { availableCopies: 3, reservedCopies: 0 }</pre> |
| 2 | [Cancel by database id](../src/modules/holds/repositories/holds.respository.test.ts#L849) | <pre>cancelHold({ id: "4" })  // HLD-1002</pre> | <pre>{ // partial<br>  holdCode: "HLD-1002",<br>  status: "Cancelled",<br>  releasedCopyCode: "WB-00218"<br>}<br>// After<br>WB-00218 state: "Available"</pre> |
| 3 | [Other holds are not touched](../src/modules/holds/repositories/holds.respository.test.ts#L857) | <pre>cancelHold({ id: "HLD-1001" })</pre> | <pre>// After<br>HLD-1002 status: "Ready"<br>WB-00218 state: "Reserved"</pre> |
| 4 | [Cancelling twice](../src/modules/holds/repositories/holds.respository.test.ts#L864) | <pre>cancelHold({ id: "HLD-1001" })<br>cancelHold({ id: "HLD-1001" })</pre> | <pre>// 1st: cancelled (not checked here)<br>"not_cancellable"  // 2nd</pre> |
| 5 | [Cancelled, Fulfilled and Expired holds](../src/modules/holds/repositories/holds.respository.test.ts#L873) | <pre>cancelHold({ id: "HLD-0900" })  // Cancelled<br>cancelHold({ id: "HLD-0901" })  // Fulfilled<br><br>// setup<br>UPDATE holds SET status = 'Expired'<br>  WHERE hold_code = 'HLD-1002';<br><br>cancelHold({ id: "HLD-1002" })  // Expired</pre> | <pre>"not_cancellable"<br>"not_cancellable"<br>"not_cancellable"<br>// After<br>WB-00421 state: "Available"<br>HLD-0901 status: "Fulfilled"<br>WB-00632 state: "Borrowed"  // a fulfilled hold's copy is on loan:<br>                            // it must NOT be released<br>HLD-1002 status: "Expired"</pre> |
| 6 | [Hold whose copy was deleted](../src/modules/holds/repositories/holds.respository.test.ts#L891) | <pre>// setup<br>UPDATE holds SET copy_id = NULL<br>  WHERE hold_code = 'HLD-1001';<br><br>cancelHold({ id: "HLD-1001" })</pre> | <pre>{<br>  id: "3",<br>  holdCode: "HLD-1001",<br>  status: "Cancelled",<br>  releasedCopyCode: null<br>}<br>// After<br>HLD-1001 status: "Cancelled"</pre> |
| 7 | [Unknown hold](../src/modules/holds/repositories/holds.respository.test.ts#L906) | <pre>cancelHold({ id: "HLD-9999" })<br>cancelHold({ id: "999999" })</pre> | <pre>"not_found"<br>"not_found"</pre> |

---

## 2. Loans module

Seed ids used below. Users: Maya `1` (STU001), Amira `2` (STU002), Fines Student `3` (STU003), Inactive `4` (STU004), Fresh `5` (STU005), Staff `6` (STF001).
Books: Midnight `1`, Wonder `2`, Brief History `3`, Persepolis `4`, Dictionary `5`.
Loans: BR-1000 `1` (Returned), BR-1001 `2` (Active, due today − 2), BR-1002 `3` (Active, due today + 10, renewed once), BR-1004 `4` (Active, due today + 1), BR-1005 `5` (Returned).
Holds: HLD-0900 `1` (Cancelled), HLD-0901 `2` (Fulfilled), HLD-1001 `3`, HLD-1002 `4`, HLD-1003 `5` (all three Ready).

### 2.1 getBorrowerWithStatsByAccountId

`GET /staff/students/:accountId` and `POST /staff/loans/issue`: the borrower and their counters, looked up by school account id.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Profile with counters](../src/modules/loans/repositories/loans.repository.test.ts#L378) | <pre>getBorrowerWithStatsByAccountId("STU001")</pre> | <pre>{<br>  _id: "1",<br>  accountId: "STU001",<br>  fullName: "Maya Chen",<br>  initials: "MC",<br>  yearGroup: "Year 10",<br>  status: "Active",<br>  activeLoansCount: 2,  // returned loans and Ready holds not counted<br>  maxLoansLimit: 5,<br>  overdueLoansCount: 0,<br>  unpaidFines: 0<br>}</pre> |
| 2 | [Overdue counted](../src/modules/loans/repositories/loans.repository.test.ts#L396) | <pre>getBorrowerWithStatsByAccountId("STU002")</pre> | <pre>{ // partial<br>  initials: "AK",<br>  activeLoansCount: 1,<br>  overdueLoansCount: 1,  // BR-1001<br>  unpaidFines: 0<br>}</pre> |
| 3 | [Only unpaid fines summed](../src/modules/loans/repositories/loans.repository.test.ts#L403) | <pre>getBorrowerWithStatsByAccountId("STU003")</pre> | <pre>{ // partial<br>  activeLoansCount: 0,<br>  overdueLoansCount: 0,<br>  unpaidFines: 3.75  // a number<br>}</pre> |
| 4 | [Inactive student still returned](../src/modules/loans/repositories/loans.repository.test.ts#L411) | <pre>getBorrowerWithStatsByAccountId("STU004")</pre> | <pre>{ // partial<br>  accountId: "STU004",<br>  status: "Inactive"<br>}<br>// the service needs the row to explain why checkout is blocked</pre> |
| 5 | [Not a student, or wrong key](../src/modules/loans/repositories/loans.repository.test.ts#L417) | <pre>getBorrowerWithStatsByAccountId("STF001")  // staff<br>getBorrowerWithStatsByAccountId("S99999")  // unknown<br>getBorrowerWithStatsByAccountId("1")       // numeric id, not an account id</pre> | <pre>null<br>null<br>null</pre> |

### 2.2 getBorrowerWithStatsById

`GET /me/borrowing` and `POST /loans/:id/renew`: the borrower, looked up by the session user id.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Same as the account id lookup](../src/modules/loans/repositories/loans.repository.test.ts#L425) | <pre>getBorrowerWithStatsById("1")</pre> | <pre>// equal to getBorrowerWithStatsByAccountId("STU001")</pre> |
| 2 | [Staff or unknown id](../src/modules/loans/repositories/loans.repository.test.ts#L433) | <pre>getBorrowerWithStatsById("6")       // staff<br>getBorrowerWithStatsById("999999")</pre> | <pre>null<br>null</pre> |

### 2.3 getLoanWithDetailByIdOrBorrowCode

`POST /staff/loans/:id/return` and `POST /loans/:id/renew`: a loan by `_id` or `borrowCode`, in any status.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Active loan with full detail](../src/modules/loans/repositories/loans.repository.test.ts#L445) | <pre>getLoanWithDetailByIdOrBorrowCode("BR-1004")</pre> | <pre>{<br>  _id: "4",<br>  borrowCode: "BR-1004",<br>  status: "Active",<br>  borrowedAt: today − 13,<br>  dueDate: today + 1,<br>  returnedAt: null,<br>  returnCondition: null,<br>  renewalCount: 0,<br>  book: {<br>    _id: "2",<br>    title: "Wonder",<br>    author: "R.J. Palacio",<br>    coverImageUrl: null<br>  },<br>  copy: {<br>    _id: "5",<br>    copyCode: "WB-00216",<br>    condition: "Good",<br>    homeLocation: "FIC PAL · A2"<br>  },<br>  borrower: {<br>    _id: "1",<br>    accountId: "STU001",<br>    fullName: "Maya Chen",<br>    initials: "MC",<br>    yearGroup: "Year 10",<br>    activeLoansCount: 2,<br>    maxLoansLimit: 5<br>  }<br>}</pre> |
| 2 | [By database id](../src/modules/loans/repositories/loans.repository.test.ts#L482) | <pre>getLoanWithDetailByIdOrBorrowCode("4")</pre> | <pre>// equal to the result of case 1</pre> |
| 3 | [Returned loan](../src/modules/loans/repositories/loans.repository.test.ts#L489) | <pre>getLoanWithDetailByIdOrBorrowCode("BR-1000")</pre> | <pre>{ // partial<br>  borrowCode: "BR-1000",<br>  status: "Returned",<br>  borrowedAt: "2026-10-01",<br>  dueDate: "2026-10-15",<br>  returnedAt: any string,  // same instant as 2026-10-14T10:00:00Z<br>  returnCondition: "Good",<br>  copy: { copyCode: "WB-00421" }<br>}</pre> |
| 4 | [Unknown loan](../src/modules/loans/repositories/loans.repository.test.ts#L504) | <pre>getLoanWithDetailByIdOrBorrowCode("BR-9999")<br>getLoanWithDetailByIdOrBorrowCode("999999")</pre> | <pre>null<br>null</pre> |

### 2.4 getActiveLoanWithDetailByCopyCode

`GET /staff/loans/active-by-copy/:copyCode`: step 1 of "Return a Book".

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Active loan of a borrowed copy](../src/modules/loans/repositories/loans.repository.test.ts#L511) | <pre>getActiveLoanWithDetailByCopyCode("WB-00632")</pre> | <pre>{ // partial<br>  _id: "3",<br>  borrowCode: "BR-1002",<br>  status: "Active",<br>  dueDate: today + 10,<br>  renewalCount: 1,<br>  book: {<br>    title: "A Brief History of Time",<br>    author: "Stephen Hawking"<br>  },<br>  copy: {<br>    copyCode: "WB-00632",<br>    condition: "Good",<br>    homeLocation: "SCI HAW · B2"<br>  },<br>  borrower: {<br>    accountId: "STU001",<br>    activeLoansCount: 2<br>  }<br>}</pre> |
| 2 | [Overdue loan is returned too](../src/modules/loans/repositories/loans.repository.test.ts#L527) | <pre>getActiveLoanWithDetailByCopyCode("WB-00422")</pre> | <pre>{ // partial<br>  borrowCode: "BR-1001",<br>  dueDate: today − 2<br>}</pre> |
| 3 | [No active loan](../src/modules/loans/repositories/loans.repository.test.ts#L533) | <pre>getActiveLoanWithDetailByCopyCode("WB-00421")  // returned loan only<br>getActiveLoanWithDetailByCopyCode("WB-00217")  // never borrowed<br>getActiveLoanWithDetailByCopyCode("WB-99999")  // unknown</pre> | <pre>null<br>null<br>null</pre> |

### 2.5 getCurrentLoansWithDetailByStudentId

`GET /me/borrowing`, the `currentLoans` section. "codes" = `loans.map(l => l.borrowCode)`.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Active loans, earliest due first](../src/modules/loans/repositories/loans.repository.test.ts#L541) | <pre>getCurrentLoansWithDetailByStudentId("1")  // Maya</pre> | <pre>codes: ["BR-1004", "BR-1002"]<br>every status: "Active"<br>[0]: { // partial<br>  dueDate: today + 1,<br>  book: { title: "Wonder" }<br>}</pre> |
| 2 | [No active loans](../src/modules/loans/repositories/loans.repository.test.ts#L550) | <pre>getCurrentLoansWithDetailByStudentId("5")  // Fresh<br>getCurrentLoansWithDetailByStudentId("999999")</pre> | <pre>[]<br>[]</pre> |

### 2.6 getReturnedLoansWithDetailByStudentId

`GET /me/borrowing`, the `borrowingHistory` section.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Returned loans, latest return first](../src/modules/loans/repositories/loans.repository.test.ts#L557) | <pre>getReturnedLoansWithDetailByStudentId("1")  // Maya</pre> | <pre>codes: ["BR-1005", "BR-1000"]<br>every status: "Returned"<br>[0]: { // partial<br>  borrowedAt: "2026-10-05",<br>  dueDate: "2026-10-19",<br>  returnedAt: any string,<br>  returnCondition: "Good",<br>  book: { title: "Oxford English Dictionary" },<br>  copy: { copyCode: "WB-00800" }<br>}</pre> |
| 2 | [No returned loans](../src/modules/loans/repositories/loans.repository.test.ts#L573) | <pre>getReturnedLoansWithDetailByStudentId("2")  // Amira</pre> | <pre>[]</pre> |

### 2.7 getLoanRecords

`GET /staff/loans`. Every case starts from these base parameters, and the Input cell shows only what changes:

```ts
const base = { tab: "active", sortBy: "dueDate", sortOrder: "asc", page: 1, limit: 10 };
```

Active loans in the seed: BR-1001 (due today − 2, borrowed today − 16), BR-1004 (due today + 1, borrowed today − 13), BR-1002 (due today + 10, borrowed today − 30).
"codes" = `loans.map(l => l.borrowCode)`.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Active loans sorted by due date](../src/modules/loans/repositories/loans.repository.test.ts#L587) | <pre>getLoanRecords(base)</pre> | <pre>codes: ["BR-1001", "BR-1004", "BR-1002"]<br>totalItem: 3<br>loans[0]: { // partial<br>  _id: "2",<br>  status: "Active",<br>  book: {<br>    _id: "1",<br>    title: "The Midnight Library"<br>  },<br>  copy: {<br>    _id: "2",<br>    copyCode: "WB-00422"<br>  },<br>  borrower: {<br>    _id: "2",<br>    accountId: "STU002",<br>    fullName: "Amira Khan"<br>  }<br>}</pre> |
| 2 | [Descending order, and sort by borrowed date](../src/modules/loans/repositories/loans.repository.test.ts#L602) | <pre>getLoanRecords({ ...base, sortOrder: "desc" })<br>getLoanRecords({ ...base, sortBy: "borrowedAt" })</pre> | <pre>codes: ["BR-1002", "BR-1004", "BR-1001"]<br>codes: ["BR-1002", "BR-1001", "BR-1004"]</pre> |
| 3 | [Returned tab](../src/modules/loans/repositories/loans.repository.test.ts#L612) | <pre>getLoanRecords({<br>  ...base,<br>  tab: "returned",<br>  sortBy: "returnedAt",<br>  sortOrder: "desc"<br>})<br>getLoanRecords({<br>  ...base,<br>  tab: "returned",<br>  sortBy: "returnedAt",<br>  sortOrder: "asc"<br>})</pre> | <pre>codes: ["BR-1005", "BR-1000"]<br>totalItem: 2<br>every status: "Returned"<br><br>codes: ["BR-1000", "BR-1005"]</pre> |
| 4 | [Status filter](../src/modules/loans/repositories/loans.repository.test.ts#L633) | <pre>getLoanRecords({ ...base, status: "overdue" })<br>getLoanRecords({ ...base, status: "due_soon" })<br>getLoanRecords({ ...base, status: "on_loan" })</pre> | <pre>codes: ["BR-1001"], totalItem: 1<br>codes: ["BR-1004"]  // due today + 1: "due soon" for a<br>                     // window of 1 or 2 days<br>codes: ["BR-1002"]</pre> |
| 5 | [Search, case-insensitive](../src/modules/loans/repositories/loans.repository.test.ts#L646) | <pre>getLoanRecords({ ...base, q: "br-1004" })       // borrow code<br>getLoanRecords({ ...base, q: "wb-00632" })      // copy code<br>getLoanRecords({ ...base, q: "stu001" })        // account id<br>getLoanRecords({ ...base, q: "AMIRA" })         // student name<br>getLoanRecords({ ...base, q: "midnight" })      // book title<br>getLoanRecords({ ...base, q: "no such loan" })</pre> | <pre>codes: ["BR-1004"]<br>codes: ["BR-1002"]<br>codes: ["BR-1004", "BR-1002"], totalItem: 2<br>codes: ["BR-1001"]<br>codes: ["BR-1001"]<br>{ loans: [], totalItem: 0 }</pre> |
| 6 | [Search stays inside the tab](../src/modules/loans/repositories/loans.repository.test.ts#L668) | <pre>getLoanRecords({<br>  ...base,<br>  tab: "returned",<br>  sortBy: "returnedAt",<br>  q: "midnight"<br>})</pre> | <pre>codes: ["BR-1000"]<br>// the active BR-1001 is also Midnight, but is not returned</pre> |
| 7 | [Search AND status](../src/modules/loans/repositories/loans.repository.test.ts#L679) | <pre>getLoanRecords({<br>  ...base,<br>  q: "STU001",<br>  status: "due_soon"<br>})</pre> | <pre>codes: ["BR-1004"]<br>totalItem: 1</pre> |
| 8 | [Pagination](../src/modules/loans/repositories/loans.repository.test.ts#L686) | <pre>getLoanRecords({ ...base, page: 1, limit: 2 })<br>getLoanRecords({ ...base, page: 2, limit: 2 })<br>getLoanRecords({ ...base, page: 3, limit: 2 })</pre> | <pre>codes: ["BR-1001", "BR-1004"], totalItem: 3<br>codes: ["BR-1002"], totalItem: 3<br>codes: []  // totalItem not checked (see 1.5 #6)</pre> |

### 2.8 issueLoans

`POST /staff/loans/issue`. One transaction for the whole batch: all copies are issued, or none are.
Every item uses `dueDate = today + 14`, written `due` below.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Available copy + own reserved copy](../src/modules/loans/repositories/loans.repository.test.ts#L707) | <pre>issueLoans({<br>  studentId: "5",  // Fresh<br>  items: [<br>    { copyCode: "WB-00217", dueDate: due },  // Available<br>    { copyCode: "WB-00218", dueDate: due }   // Reserved for Fresh<br>  ]<br>})</pre> | <pre>{<br>  issuedAt: any string,<br>  loansBefore: 0,<br>  loansNow: 2,<br>  fulfilledHolds: [<br>    { holdCode: "HLD-1002", copyCode: "WB-00218" }<br>  ],<br>  borrowEntries: [  // sorted by copyCode before the check<br>    {<br>      _id: any string,<br>      borrowCode: matches BR-\d+,<br>      copyId: "6",<br>      copyCode: "WB-00217",<br>      book: {<br>        _id: "2",<br>        title: "Wonder",<br>        author: "R.J. Palacio",<br>        coverImageUrl: null<br>      },<br>      borrowedAt: today,<br>      dueDate: due<br>    },<br>    {<br>      ...same shape,<br>      copyId: "7",<br>      copyCode: "WB-00218"<br>    }<br>  ]<br>}<br>// the two borrow codes are different, neither is "BR-1000"<br>// After<br>WB-00217 state: "Borrowed"<br>WB-00218 state: "Borrowed"<br>HLD-1002 status: "Fulfilled"<br>current loans of "5": copies ["WB-00217", "WB-00218"]<br>getBorrowerWithStatsById("5").activeLoansCount: 2</pre> |
| 2 | [loansBefore / loansNow include existing loans](../src/modules/loans/repositories/loans.repository.test.ts#L763) | <pre>issueLoans({<br>  studentId: "1",  // Maya<br>  items: [<br>    { copyCode: "WB-00423", dueDate: due }  // her own HLD-1001<br>  ]<br>})</pre> | <pre>{ // partial<br>  loansBefore: 2,<br>  loansNow: 3,<br>  fulfilledHolds: [<br>    { holdCode: "HLD-1001", copyCode: "WB-00423" }<br>  ]<br>}<br>// After<br>HLD-1003 status: "Ready"  // her hold on another title</pre> |
| 3 | [No hold fulfilled when the copy is not reserved for the student](../src/modules/loans/repositories/loans.repository.test.ts#L780) | <pre>issueLoans({<br>  studentId: "1",  // Maya<br>  items: [<br>    { copyCode: "WB-00217", dueDate: due }<br>  ]<br>})</pre> | <pre>fulfilledHolds: []<br>// After<br>HLD-1001 status: "Ready"<br>HLD-1003 status: "Ready"</pre> |
| 4 | [All or nothing](../src/modules/loans/repositories/loans.repository.test.ts#L793) | <pre>issueLoans({<br>  studentId: "5",  // Fresh<br>  items: [<br>    { copyCode: "WB-00800", dueDate: due },  // Available<br>    { copyCode: "WB-00632", dueDate: due }   // Borrowed<br>  ]<br>})</pre> | <pre>null<br>// After<br>number of loan rows: unchanged<br>WB-00800 state: "Available"<br>current loans of "5": []</pre> |
| 5 | [Copy reserved for another student](../src/modules/loans/repositories/loans.repository.test.ts#L811) | <pre>issueLoans({<br>  studentId: "5",  // Fresh<br>  items: [<br>    { copyCode: "WB-00423", dueDate: due }  // Maya's HLD-1001<br>  ]<br>})</pre> | <pre>null<br>// After<br>HLD-1001 status: "Ready"<br>WB-00423 state: "Reserved"</pre> |
| 6 | [Damaged and lost copies](../src/modules/loans/repositories/loans.repository.test.ts#L822) | <pre>issueLoans({<br>  studentId: "5",<br>  items: [{ copyCode: "WB-00424", dueDate: due }]  // Damaged<br>})<br>issueLoans({<br>  studentId: "5",<br>  items: [{ copyCode: "WB-00700", dueDate: due }]  // Lost<br>})</pre> | <pre>null<br>null<br>// After<br>WB-00424 state: "Damaged"<br>WB-00700 state: "Lost"</pre> |
| 7 | [Unknown copy code](../src/modules/loans/repositories/loans.repository.test.ts#L839) | <pre>issueLoans({<br>  studentId: "5",<br>  items: [<br>    { copyCode: "WB-00217", dueDate: due },<br>    { copyCode: "WB-99999", dueDate: due }   // does not exist<br>  ]<br>})</pre> | <pre>null  // not a partial issue of WB-00217<br>// After<br>number of loan rows: unchanged<br>WB-00217 state: "Available"</pre> |
| 8 | [Race for the same copy](../src/modules/loans/repositories/loans.repository.test.ts#L855) | <pre>// at the same time<br>Promise.all([<br>  issueLoans({<br>    studentId: "5",  // Fresh<br>    items: [{ copyCode: "WB-00800", dueDate: due }]<br>  }),<br>  issueLoans({<br>    studentId: "3",  // Fines Student<br>    items: [{ copyCode: "WB-00800", dueDate: due }]<br>  })<br>])</pre> | <pre>one result object, one null<br>// After<br>Active loans on WB-00800: exactly 1<br>// needs SELECT ... FOR UPDATE on the copies</pre> |

### 2.9 returnLoan

`POST /staff/loans/:id/return`. One transaction: loan → Returned, copy state follows the condition (Good → Available, Damaged → Damaged, Lost → Lost).

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Good condition](../src/modules/loans/repositories/loans.repository.test.ts#L882) | <pre>returnLoan({<br>  loanId: "4",  // BR-1004<br>  condition: "Good",<br>  conditionNote: "No new damage"<br>})</pre> | <pre>{<br>  _id: "4",<br>  borrowCode: "BR-1004",<br>  status: "Returned",<br>  borrowerAccountId: "STU001",<br>  borrowerFullName: "Maya Chen",<br>  loansBefore: 2,<br>  loansAfter: 1,<br>  borrowedAt: today − 13,<br>  dueDate: today + 1,<br>  returnedAt: any string,<br>  returnCondition: "Good",<br>  conditionNote: "No new damage",<br>  copyCode: "WB-00216",<br>  copyNewState: "Available",<br>  copyHomeLocation: "FIC PAL · A2"<br>}<br>// After<br>BR-1004: { status: "Returned", returnCondition: "Good",<br>           returnedAt: any string }  // kept, not deleted<br>WB-00216: { state: "Available", condition: "Good" }<br>getActiveLoanWithDetailByCopyCode("WB-00216"): null<br>getBorrowerWithStatsById("1").activeLoansCount: 1</pre> |
| 2 | [Only the loan's own copy changes](../src/modules/loans/repositories/loans.repository.test.ts#L920) | <pre>returnLoan({<br>  loanId: "4",  // BR-1004<br>  condition: "Good"<br>})</pre> | <pre>// After<br>WB-00424 state: "Damaged"<br>WB-00632 state: "Borrowed"<br>WB-00422 state: "Borrowed"<br>// catches the WHERE id = $1 (loan id used as copy id)<br>// mistake in the interface hint</pre> |
| 3 | [Damaged, no note](../src/modules/loans/repositories/loans.repository.test.ts#L929) | <pre>returnLoan({<br>  loanId: "3",  // BR-1002<br>  condition: "Damaged"<br>})</pre> | <pre>{ // partial<br>  borrowCode: "BR-1002",<br>  returnCondition: "Damaged",<br>  conditionNote: null,<br>  copyCode: "WB-00632",<br>  copyNewState: "Damaged"<br>}<br>// After<br>WB-00632: { state: "Damaged", condition: "Damaged" }</pre> |
| 4 | [Lost, overdue loan](../src/modules/loans/repositories/loans.repository.test.ts#L946) | <pre>returnLoan({<br>  loanId: "2",  // BR-1001, overdue<br>  condition: "Lost"<br>})</pre> | <pre>{ // partial<br>  borrowCode: "BR-1001",<br>  borrowerAccountId: "STU002",<br>  loansBefore: 1,<br>  loansAfter: 0,<br>  returnCondition: "Lost",<br>  copyNewState: "Lost"<br>}<br>// After<br>WB-00422: { state: "Lost", condition: "Lost" }<br>// an overdue return is allowed</pre> |
| 5 | [Second return](../src/modules/loans/repositories/loans.repository.test.ts#L964) | <pre>returnLoan({ loanId: "4", condition: "Good" })<br>returnLoan({ loanId: "4", condition: "Lost" })</pre> | <pre>// 1st: returned (not checked here)<br>null  // 2nd<br>// After<br>WB-00216: { state: "Available", condition: "Good" }<br>BR-1004 returnCondition: "Good"</pre> |
| 6 | [Already returned or unknown](../src/modules/loans/repositories/loans.repository.test.ts#L975) | <pre>returnLoan({ loanId: "1", condition: "Damaged" })  // BR-1000<br>returnLoan({ loanId: "999999", condition: "Good" })</pre> | <pre>null<br>null<br>// After<br>WB-00421 state: "Available"</pre> |

### 2.10 renewLoan

`POST /loans/:id/renew`. One `UPDATE`; its `WHERE` (`status = 'Active' AND renewal_count < 1`) is the guard.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [First renewal](../src/modules/loans/repositories/loans.repository.test.ts#L986) | <pre>renewLoan({<br>  loanId: "4",  // BR-1004<br>  extraDays: 7<br>})</pre> | <pre>{<br>  _id: "4",<br>  borrowCode: "BR-1004",<br>  previousDueDate: today + 1,<br>  newDueDate: today + 8,<br>  renewalCount: 1<br>}<br>// After<br>BR-1004: { dueDate: today + 8, renewalCount: 1 }</pre> |
| 2 | [Second renewal](../src/modules/loans/repositories/loans.repository.test.ts#L1002) | <pre>renewLoan({ loanId: "4", extraDays: 7 })<br>renewLoan({ loanId: "4", extraDays: 7 })</pre> | <pre>// 1st: renewed (not checked here)<br>null  // 2nd<br>// After<br>BR-1004: { dueDate: today + 8, renewalCount: 1 }</pre> |
| 3 | [Already renewed in the seed](../src/modules/loans/repositories/loans.repository.test.ts#L1012) | <pre>renewLoan({<br>  loanId: "3",  // BR-1002, renewal_count = 1<br>  extraDays: 7<br>})</pre> | <pre>null<br>// After<br>BR-1002 dueDate: today + 10</pre> |
| 4 | [Returned or unknown loan](../src/modules/loans/repositories/loans.repository.test.ts#L1020) | <pre>renewLoan({ loanId: "1", extraDays: 7 })  // BR-1000, Returned<br>renewLoan({ loanId: "999999", extraDays: 7 })</pre> | <pre>null<br>null<br>// After<br>BR-1000: { dueDate: "2026-10-15", renewalCount: 0 }</pre> |

### 2.11 getCopiesForCheckoutByCopyCodes

`GET /staff/copies/:copyCode/checkout-check` (one code) and `POST /staff/loans/issue` (several codes).

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Available copy](../src/modules/loans/repositories/loans.repository.test.ts#L1035) | <pre>getCopiesForCheckoutByCopyCodes(["WB-00217"])</pre> | <pre>[<br>  {<br>    _id: "6",<br>    copyCode: "WB-00217",<br>    state: "Available",<br>    condition: "Good",<br>    homeLocation: "FIC PAL · A2",<br>    book: {<br>      _id: "2",<br>      title: "Wonder",<br>      author: "R.J. Palacio",<br>      coverImageUrl: null<br>    },<br>    activeLoan: null,<br>    activeHold: null<br>  }<br>]</pre> |
| 2 | [Borrowed copy](../src/modules/loans/repositories/loans.repository.test.ts#L1053) | <pre>getCopiesForCheckoutByCopyCodes(["WB-00422"])</pre> | <pre>[0]: { // partial<br>  copyCode: "WB-00422",<br>  state: "Borrowed",<br>  activeLoan: {<br>    borrowCode: "BR-1001",<br>    studentName: "Amira Khan",<br>    studentAccountId: "STU002",<br>    dueDate: today − 2<br>  },<br>  activeHold: null<br>}</pre> |
| 3 | [Reserved copy](../src/modules/loans/repositories/loans.repository.test.ts#L1070) | <pre>getCopiesForCheckoutByCopyCodes(["WB-00423"])</pre> | <pre>[0]: { // partial<br>  copyCode: "WB-00423",<br>  state: "Reserved",<br>  activeLoan: null,<br>  activeHold: {<br>    _id: "3",<br>    holdCode: "HLD-1001",<br>    studentName: "Maya Chen",<br>    studentAccountId: "STU001",<br>    collectBy: any string  // same instant as 2026-11-02T08:30:00Z<br>  }<br>}</pre> |
| 4 | [History is ignored](../src/modules/loans/repositories/loans.repository.test.ts#L1089) | <pre>getCopiesForCheckoutByCopyCodes([<br>  "WB-00421",  // returned loan only<br>  "WB-00800",  // returned loan + Cancelled hold<br>  "WB-00632"   // Fulfilled hold + active loan<br>])</pre> | <pre>// by copy code, partial<br>"WB-00421": { activeLoan: null, activeHold: null }<br>"WB-00800": { activeLoan: null, activeHold: null }<br>"WB-00632": {<br>  activeLoan: { borrowCode: "BR-1002" },<br>  activeHold: null<br>}</pre> |
| 5 | [Only existing codes, sorted](../src/modules/loans/repositories/loans.repository.test.ts#L1102) | <pre>getCopiesForCheckoutByCopyCodes([<br>  "WB-00800",<br>  "WB-99999",  // unknown<br>  "WB-00217",<br>  "WB-00424"<br>])</pre> | <pre>codes: ["WB-00217", "WB-00424", "WB-00800"]<br>// the unknown code is left out, so the service<br>// can report COPY_NOT_FOUND<br>"WB-00424": { // partial<br>  state: "Damaged",<br>  condition: "Damaged"<br>}</pre> |
| 6 | [Empty input or only unknown codes](../src/modules/loans/repositories/loans.repository.test.ts#L1122) | <pre>getCopiesForCheckoutByCopyCodes([])<br>getCopiesForCheckoutByCopyCodes(["WB-99999"])</pre> | <pre>[]<br>[]</pre> |

### 2.12 getReadyHoldsByStudentId

`GET /me/borrowing` (`holdRequests`) and `GET /staff/students/:accountId` (`activeHolds`).

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Ready holds only, newest first](../src/modules/loans/repositories/loans.repository.test.ts#L1134) | <pre>getReadyHoldsByStudentId("1")  // Maya</pre> | <pre>codes: ["HLD-1003", "HLD-1001"]<br>// HLD-0900 (Cancelled) and HLD-0901 (Fulfilled) left out<br>[1]: {<br>  _id: "3",<br>  holdCode: "HLD-1001",<br>  status: "Ready",<br>  requestedAt: any string,  // same instant as 2026-11-01T09:00:00Z<br>  collectBy: any string,<br>  book: {<br>    _id: "1",<br>    title: "The Midnight Library",<br>    author: "Matt Haig",<br>    format: "Paperback",<br>    coverImageUrl: null<br>  },<br>  copy: {<br>    _id: "3",<br>    copyCode: "WB-00423",<br>    homeLocation: "FIC HAI · A3"<br>  }<br>}</pre> |
| 2 | [Copy deleted](../src/modules/loans/repositories/loans.repository.test.ts#L1161) | <pre>// setup<br>UPDATE holds SET copy_id = NULL<br>  WHERE hold_code = 'HLD-1002';<br><br>getReadyHoldsByStudentId("5")  // Fresh</pre> | <pre>length: 1<br>[0]: { // partial<br>  holdCode: "HLD-1002",<br>  copy: null,<br>  book: { title: "Wonder" }<br>}</pre> |
| 3 | [No Ready holds](../src/modules/loans/repositories/loans.repository.test.ts#L1170) | <pre>getReadyHoldsByStudentId("2")  // Amira<br>getReadyHoldsByStudentId("999999")</pre> | <pre>[]<br>[]</pre> |

### 2.13 getBookIdsWithReadyHold

`GET /me/borrowing` and `POST /loans/:id/renew`: a loan cannot be renewed when another student is waiting for the title.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Subset with a Ready hold](../src/modules/loans/repositories/loans.repository.test.ts#L1177) | <pre>getBookIdsWithReadyHold([<br>  "1",  // Midnight: HLD-1001 Ready<br>  "2",  // Wonder: HLD-1002 Ready<br>  "3",  // Brief History: only a Fulfilled hold<br>  "4"   // Persepolis: no hold<br>])</pre> | <pre>["1", "2"]  // any order</pre> |
| 2 | [Only given books, each once](../src/modules/loans/repositories/loans.repository.test.ts#L1191) | <pre>getBookIdsWithReadyHold(["5", "5"])  // Dictionary twice</pre> | <pre>["5"]</pre> |
| 3 | [Nothing to return](../src/modules/loans/repositories/loans.repository.test.ts#L1200) | <pre>getBookIdsWithReadyHold(["3"])<br>getBookIdsWithReadyHold([])</pre> | <pre>[]<br>[]</pre> |

---

## 3. Book-inventories module

Seed ids used below. Users: Maya `1` (STU001), Amira `2` (STU002), Inactive `3` (STU003), Limit Reached `4` (STU004, `max_loans_limit` 1), Fresh `5` (STU005), Staff `6` (STF001).
Books, by `updated_at` newest first: Midnight Library `1`, Wonder `2`, Brief History `3`, Persepolis `4`, Oxford English Dictionary `5`, Truyện Kiều `6` (no copies, no publisher, no published year).
Copies: WB-00421 `1` (Midnight, Available), WB-00422 `2` (Midnight, Borrowed), WB-00423 `3` (Midnight, Reserved), WB-00424 `4` (Midnight, Damaged), WB-00216 `5` (Wonder, Borrowed), WB-00217 `6` (Wonder, Available), WB-00632 `7` (Brief History, Borrowed), WB-00700 `8` (Persepolis, Lost), WB-00800 `9` (Dictionary, Available).
Loans: BR-1000 (WB-00421, Amira, Returned) · BR-1001 (WB-00422, Amira, Active, due 2026-12-01) · BR-1002 (WB-00632, Maya, Active, due 2026-12-05) · BR-1003 (WB-00216, Limit Reached, Active, due 2026-12-03).
Holds: HLD-1001 (WB-00423, Maya, Ready, `collect_by` 2026-12-02 12:00 UTC).

All dates here are fixed values, not relative to today.

### 3.1 getFeaturedBooks

`GET /books/featured`: the most recently updated titles, with a 3-field stock summary.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Newest first, with a stock summary](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L356) | <pre>getFeaturedBooks(3)</pre> | <pre>titles: [<br>  "The Midnight Library",<br>  "Wonder",<br>  "A Brief History of Time"<br>]<br>[0]: {<br>  _id: "1",<br>  title: "The Midnight Library",<br>  author: "Matt Haig",<br>  category: "Fiction",<br>  genre: "Contemporary fiction",<br>  coverImageUrl: null,<br>  shelfReference: "FIC HAI · A3",<br>  stockSummary: {<br>    totalCopies: 4,<br>    availableCopies: 1,<br>    isAvailableNow: true<br>  }<br>}</pre> |
| 2 | [Limit larger than the catalog](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L377) | <pre>getFeaturedBooks(10)</pre> | <pre>length: 6<br>[5]: { // partial<br>  title: "Truyện Kiều",  // a title without copies is kept<br>  stockSummary: {<br>    totalCopies: 0,<br>    availableCopies: 0,<br>    isAvailableNow: false<br>  }<br>}</pre> |
| 3 | [Non-positive limit](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L388) | <pre>getFeaturedBooks(0)</pre> | <pre>rejects RangeError</pre> |

### 3.2 getBooks

`GET /books`: search, filters, sorting and pagination. The default sort is by title. Titles that start with "T" sort as `"The Midnight Library"` < `"Truyện Kiều"` in the test database's collation.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [No filter: every title, by title](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L395) | <pre>getBooks({})</pre> | <pre>totalItems: 6<br>titles: [<br>  "A Brief History of Time",<br>  "Oxford English Dictionary",<br>  "Persepolis",<br>  "The Midnight Library",<br>  "Truyện Kiều",<br>  "Wonder"<br>]</pre> |
| 2 | [Item mapping](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L410) | <pre>getBooks({ q: "midnight" })</pre> | <pre>books: [<br>  {<br>    _id: "1",<br>    title: "The Midnight Library",<br>    author: "Matt Haig",<br>    isbn: "9781786892737",<br>    category: "Fiction",<br>    genre: "Contemporary fiction",<br>    language: "English",<br>    publisher: "Canongate Books",<br>    keywords: [<br>      "Choices & possibilities",<br>      "Fantasy",<br>      "Contemporary"<br>    ],<br>    coverImageUrl: null,<br>    shelfReference: "FIC HAI · A3",<br>    stockSummary: {<br>      totalCopies: 4,<br>      availableCopies: 1,<br>      borrowedCopies: 1,<br>      reservedCopies: 1,<br>      isAvailableNow: true<br>    }<br>  }<br>]</pre> |
| 3 | [Search, case-insensitive](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L438) | <pre>getBooks({ q: "MIDNIGHT" })      // title<br>getBooks({ q: "hawking" })       // author<br>getBooks({ q: "199640" })        // part of an isbn<br>getBooks({ q: "poetry" })        // category<br>getBooks({ q: "cosmology" })     // keyword<br>getBooks({ q: "no such book" })</pre> | <pre>titles: ["The Midnight Library"]<br>titles: ["A Brief History of Time"]<br>titles: ["Oxford English Dictionary"]<br>titles: ["Truyện Kiều"]<br>titles: ["A Brief History of Time"]<br>{ books: [], totalItems: 0 }</pre> |
| 4 | [Blank search = no filter](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L464) | <pre>getBooks({ q: "   " })</pre> | <pre>totalItems: 6</pre> |
| 5 | [Relevance vs. title order](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L471) | <pre>getBooks({ q: "w", sortBy: "relevance" })<br>getBooks({ q: "w", sortBy: "title" })</pre> | <pre>titles: ["Wonder", "A Brief History of Time"]<br>// Wonder matches by title prefix,<br>// Brief History only by its author "Hawking"<br>titles: ["A Brief History of Time", "Wonder"]</pre> |
| 6 | [Category, single and list](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L482) | <pre>getBooks({ category: "Fiction" })<br>getBooks({ category: "Fiction , Poetry" })</pre> | <pre>titles: ["The Midnight Library", "Wonder"]<br>totalItems: 2<br>titles: [<br>  "The Midnight Library",<br>  "Truyện Kiều",<br>  "Wonder"<br>]  // spaces around the comma are ignored</pre> |
| 7 | [Genre, single and list](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L497) | <pre>getBooks({ genre: "Science" })<br>getBooks({<br>  genre: "Contemporary fiction,Realistic fiction"<br>})</pre> | <pre>titles: ["A Brief History of Time"]<br>titles: ["The Midnight Library", "Wonder"]</pre> |
| 8 | [Language](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L509) | <pre>getBooks({ language: "Vietnamese" })<br>getBooks({ language: "English" })</pre> | <pre>titles: ["Truyện Kiều"]<br>totalItems: 5, titles do not contain "Truyện Kiều"</pre> |
| 9 | [availableNow](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L520) | <pre>getBooks({ availableNow: true })<br>getBooks({ availableNow: false })</pre> | <pre>titles: [<br>  "Oxford English Dictionary",<br>  "The Midnight Library",<br>  "Wonder"<br>]<br>totalItems: 3<br>totalItems: 6  // false is not a filter</pre> |
| 10 | [Stock filter](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L536) | <pre>getBooks({ stock: "available" })<br>getBooks({ stock: "unavailable" })<br>getBooks({ stock: "all" })</pre> | <pre>titles: [<br>  "Oxford English Dictionary",<br>  "The Midnight Library",<br>  "Wonder"<br>]<br>titles: [<br>  "A Brief History of Time",  // only Borrowed<br>  "Persepolis",               // only Lost<br>  "Truyện Kiều"               // no copies<br>]<br>totalItems: 6</pre> |
| 11 | [Published year, newest first, unknown last](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L558) | <pre>getBooks({ sortBy: "publishedYear" })</pre> | <pre>titles: [<br>  "The Midnight Library",       // 2020<br>  "Wonder",                     // 2012<br>  "Oxford English Dictionary",  // 2010<br>  "Persepolis",                 // 2003<br>  "A Brief History of Time",    // 1988<br>  "Truyện Kiều"                 // NULL<br>]</pre> |
| 12 | [Pagination](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L571) | <pre>getBooks({ page: 1, limit: 2 })<br>getBooks({ page: 3, limit: 2 })<br>getBooks({ page: 4, limit: 2 })</pre> | <pre>titles: ["A Brief History of Time",<br>         "Oxford English Dictionary"]<br>totalItems: 6<br>titles: ["Truyện Kiều", "Wonder"]<br>totalItems: 6<br>titles: []<br>totalItems: 6  // still reported on an empty page</pre> |
| 13 | [Filters combine with AND](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L588) | <pre>getBooks({<br>  category: "Fiction",<br>  availableNow: true<br>})<br>getBooks({<br>  category: "Fiction",<br>  stock: "unavailable"<br>})</pre> | <pre>titles: ["The Midnight Library", "Wonder"]<br>{ books: [], totalItems: 0 }</pre> |
| 14 | [Invalid parameters](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L604) | <pre>getBooks({ page: 0 })<br>getBooks({ limit: 0 })<br>getBooks({ stock: "bogus" })<br>getBooks({ sortBy: "bogus" })</pre> | <pre>rejects RangeError<br>rejects RangeError<br>rejects RangeError<br>rejects RangeError</pre> |

### 3.3 getBookById

Book metadata by numeric id only, without the stock summary.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Full metadata](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L614) | <pre>getBookById("1")</pre> | <pre>{ // partial<br>  _id: "1",<br>  title: "The Midnight Library",<br>  author: "Matt Haig",<br>  isbn: "9781786892737",<br>  category: "Fiction",<br>  genre: "Contemporary fiction",<br>  keywords: [<br>    "Choices & possibilities",<br>    "Fantasy",<br>    "Contemporary"<br>  ],<br>  publisher: "Canongate Books",<br>  publishedYear: 2020,<br>  language: "English",<br>  format: "Paperback",<br>  pageCount: null,<br>  description: null,<br>  coverImageUrl: null,<br>  shelfReference: "FIC HAI · A3"<br>}<br>createdAt: any string<br>updatedAt: any string</pre> |
| 2 | [Unknown id; an isbn is not an id](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L639) | <pre>getBookById("999999")<br>getBookById("9781786892737")  // Midnight's isbn</pre> | <pre>null<br>null</pre> |

### 3.4 getBooksWithSummaryInfoById

Book metadata plus the full stock summary (6 counters + `isAvailableNow`), by numeric id.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Stock derived from the copies](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L651) | <pre>getBooksWithSummaryInfoById("1")</pre> | <pre>{ // partial<br>  _id: "1",<br>  title: "The Midnight Library",<br>  stockSummary: {<br>    totalCopies: 4,<br>    availableCopies: 1,<br>    borrowedCopies: 1,<br>    reservedCopies: 1,<br>    damagedCopies: 1,<br>    lostCopies: 0,<br>    isAvailableNow: true<br>  }<br>}</pre> |
| 2 | [No copies, and a lost copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L670) | <pre>getBooksWithSummaryInfoById("6")  // Truyện Kiều<br>getBooksWithSummaryInfoById("4")  // Persepolis</pre> | <pre>stockSummary: {  // all zero, not null<br>  totalCopies: 0,<br>  availableCopies: 0,<br>  borrowedCopies: 0,<br>  reservedCopies: 0,<br>  damagedCopies: 0,<br>  lostCopies: 0,<br>  isAvailableNow: false<br>}<br>stockSummary: {<br>  totalCopies: 1,<br>  availableCopies: 0,<br>  borrowedCopies: 0,<br>  reservedCopies: 0,<br>  damagedCopies: 0,<br>  lostCopies: 1,<br>  isAvailableNow: false<br>}</pre> |
| 3 | [Unknown id](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L700) | <pre>getBooksWithSummaryInfoById("999999")</pre> | <pre>null</pre> |

### 3.5 getBooksWithSummaryInfoByIdOrIsbn

`GET /books/:id`: `:id` may be the numeric id or the isbn.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [By id or by isbn](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L709) | <pre>getBooksWithSummaryInfoByIdOrIsbn("2")<br>getBooksWithSummaryInfoByIdOrIsbn("9780375869020")</pre> | <pre>{ // partial<br>  title: "Wonder",<br>  stockSummary: {<br>    totalCopies: 2,<br>    availableCopies: 1<br>  }<br>}<br>{ // partial<br>  _id: "2",<br>  title: "Wonder"<br>}</pre> |
| 2 | [The id wins over an isbn that looks like it](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L719) | <pre>// setup<br>INSERT INTO books (title, author, isbn, category)<br>VALUES ('Isbn Looks Like An Id', 'Tester',<br>        '2', 'Fiction');<br><br>getBooksWithSummaryInfoByIdOrIsbn("2")</pre> | <pre>title: "Wonder"  // id 2, not the book whose isbn is "2"</pre> |
| 3 | [Neither id nor isbn](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L734) | <pre>getBooksWithSummaryInfoByIdOrIsbn("0000000000000")</pre> | <pre>null</pre> |

### 3.6 getBookByIsbn

The duplicate-isbn check of `POST /books` and `PUT /books/:id`.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Metadata, no stock summary](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L743) | <pre>getBookByIsbn("9780375714832")  // Persepolis</pre> | <pre>{ // partial<br>  _id: "4",<br>  title: "Persepolis",<br>  isbn: "9780375714832"<br>}<br>// no stockSummary property</pre> |
| 2 | [Unknown isbn](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L755) | <pre>getBookByIsbn("0000000000000")</pre> | <pre>null</pre> |

### 3.7 getBookViewerContext

`GET /books/:id` for a student: the `viewerContext` block. Arguments are `(userId, bookId)`.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Can borrow: an Available copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L764) | <pre>getBookViewerContext(<br>  "5",  // Fresh<br>  "1"   // Midnight: WB-00421 Available<br>)</pre> | <pre>{<br>  canBorrow: true,<br>  canRequestHold: false,<br>  blockReason: null,<br>  activeLoansCount: 0,<br>  maxLoansLimit: 5,<br>  existingHoldCode: null<br>}</pre> |
| 2 | [Can hold: no Available copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L781) | <pre>getBookViewerContext(<br>  "5",  // Fresh<br>  "3"   // Brief History: only Borrowed<br>)</pre> | <pre>{<br>  canBorrow: false,<br>  canRequestHold: true,<br>  blockReason: null,<br>  activeLoansCount: 0,<br>  maxLoansLimit: 5,<br>  existingHoldCode: null<br>}</pre> |
| 3 | [Existing hold code and loan count](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L798) | <pre>getBookViewerContext(<br>  "1",  // Maya: HLD-1001 on Midnight,<br>        // loan BR-1002 on another title<br>  "1"   // Midnight<br>)</pre> | <pre>{<br>  canBorrow: true,<br>  canRequestHold: false,<br>  blockReason: null,<br>  activeLoansCount: 1,<br>  maxLoansLimit: 5,<br>  existingHoldCode: "HLD-1001"<br>}</pre> |
| 4 | [Already borrowing the title](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L815) | <pre>getBookViewerContext(<br>  "1",  // Maya<br>  "3"   // Brief History: her BR-1002<br>)</pre> | <pre>{ // partial<br>  canBorrow: false,<br>  canRequestHold: false,<br>  blockReason: "You are already borrowing this title",<br>  activeLoansCount: 1<br>}</pre> |
| 5 | [Inactive account](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L830) | <pre>getBookViewerContext(<br>  "3",  // Inactive<br>  "1"   // Midnight<br>)</pre> | <pre>{ // partial<br>  canBorrow: false,<br>  canRequestHold: false,<br>  blockReason: "Your account is inactive"<br>}</pre> |
| 6 | [Loan limit reached](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L844) | <pre>getBookViewerContext(<br>  "4",  // Limit Reached: 1 / 1<br>  "1"   // Midnight<br>)</pre> | <pre>{ // partial<br>  canBorrow: false,<br>  canRequestHold: false,<br>  blockReason: "You have reached your loan limit",<br>  activeLoansCount: 1,<br>  maxLoansLimit: 1<br>}</pre> |
| 7 | [Unknown user or book](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L860) | <pre>getBookViewerContext("999999", "1")<br>getBookViewerContext("5", "999999")</pre> | <pre>null<br>null</pre> |

### 3.8 createBook

`POST /books`. The repository writes NULL for every optional field that is `undefined`; the contract defaults (language, format, description, cover, genre = category) are added earlier by the Zod schema, not here.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Every field, persisted](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L878) | <pre>createBook({<br>  title: "The Wild Robot",<br>  author: "Peter Brown",<br>  isbn: "9781848127272",<br>  category: "Fiction",<br>  keywords: ["Robots", "nature", "friendship"],<br>  publisher: "Piccadilly Press",<br>  genre: "Science fiction",<br>  publishedYear: 2016,<br>  language: "English",<br>  format: "Hardcover",<br>  pageCount: 288,<br>  description: "A robot learns to survive<br>                on a remote island.",<br>  coverImageUrl: "https://example.com/wild-robot.jpg",<br>  shelfReference: "FIC BRO · A4"<br>})</pre> | <pre>{ // partial<br>  ...every field of the input, same values<br>}<br>// After<br>getBookById(created._id): equal to the result<br>getBooks({}).totalItems: 7</pre> |
| 2 | [Omitted optional fields are NULL](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L923) | <pre>createBook({<br>  title: "Minimal Book",<br>  author: "Minimal Author",<br>  isbn: "9780000000002",<br>  category: "Reference"<br>})</pre> | <pre>{ // partial<br>  title: "Minimal Book",<br>  keywords: [],<br>  publisher: null,<br>  genre: null,<br>  publishedYear: null,<br>  language: null,  // no COALESCE default in the repository<br>  format: null,<br>  pageCount: null,<br>  description: null,<br>  coverImageUrl: null,<br>  shelfReference: null<br>}</pre> |
| 3 | [Duplicate isbn](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L947) | <pre>createBook({<br>  title: "Duplicate Isbn Book",<br>  author: "Someone",<br>  isbn: "9781786892737",  // Midnight's<br>  category: "Fiction"<br>})</pre> | <pre>null<br>// After<br>getBooks({}).totalItems: 6<br>getBookByIsbn("9781786892737").title:<br>  "The Midnight Library"</pre> |

### 3.9 updateBookById

`PUT /books/:id`. Required fields are always written; an optional field is written only when it is not `undefined` (see `CLAUDE.local.md`, UPDATE rule).

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Every field, createdAt kept](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L967) | <pre>updateBookById("1", {<br>  title: "The Midnight Library (Updated)",<br>  author: "Matt Haig",<br>  isbn: "9781786892737",  // its own isbn:<br>                          // not a duplicate<br>  category: "Fiction",<br>  keywords: ["Regret", "Parallel lives"],<br>  publisher: "Canongate",<br>  genre: "Fantasy",<br>  publishedYear: 2021,<br>  language: "English",<br>  format: "Hardcover",<br>  pageCount: 304,<br>  description: "Between life and death<br>                there is a library.",<br>  coverImageUrl: "https://example.com/midnight.jpg",<br>  shelfReference: "FIC HAI · A4"<br>})</pre> | <pre>{ // partial<br>  _id: "1",<br>  title: "The Midnight Library (Updated)",<br>  keywords: ["Regret", "Parallel lives"],<br>  publisher: "Canongate",<br>  genre: "Fantasy",<br>  publishedYear: 2021,<br>  format: "Hardcover",<br>  pageCount: 304,<br>  description: "Between life and death<br>                there is a library.",<br>  coverImageUrl: "https://example.com/midnight.jpg",<br>  shelfReference: "FIC HAI · A4"<br>}<br>createdAt: same as before the update<br>updatedAt: different from before<br>// After<br>getBookById("1"): equal to the result</pre> |
| 2 | [Omitted optional fields keep their value](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1010) | <pre>updateBookById("1", {<br>  title: "The Midnight Library",<br>  author: "Matt Haig",<br>  isbn: "9781786892737",<br>  category: "Fiction"<br>})  // no optional field</pre> | <pre>{ // partial: the seed values are kept<br>  keywords: [<br>    "Choices & possibilities",<br>    "Fantasy",<br>    "Contemporary"<br>  ],<br>  publisher: "Canongate Books",<br>  genre: "Contemporary fiction",<br>  publishedYear: 2020,<br>  language: "English",<br>  format: "Paperback",<br>  pageCount: null,<br>  description: null,<br>  coverImageUrl: null,<br>  shelfReference: "FIC HAI · A3"<br>}</pre> |
| 3 | [Isbn of another book](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1039) | <pre>updateBookById("2", {  // Wonder<br>  title: "Wonder (Renamed)",<br>  author: "R.J. Palacio",<br>  isbn: "9781786892737",  // Midnight's<br>  category: "Fiction"<br>})</pre> | <pre>null<br>// After<br>getBookById("2"): { // partial<br>  title: "Wonder",<br>  isbn: "9780375869020"<br>}</pre> |
| 4 | [Unknown id](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1057) | <pre>updateBookById("999999", {<br>  title: "Ghost",<br>  author: "Nobody",<br>  isbn: "9780000000099",<br>  category: "Fiction"<br>})</pre> | <pre>null</pre> |

### 3.10 deleteBookById

`DELETE /books/:id`: only a title with no physical copies can be deleted.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Title without copies](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1071) | <pre>deleteBookById("6")  // Truyện Kiều</pre> | <pre>{ // partial: the deleted book<br>  _id: "6",<br>  title: "Truyện Kiều"<br>}<br>// After<br>getBookById("6"): null<br>getBooks({}).totalItems: 5</pre> |
| 2 | [Title with copies](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1087) | <pre>deleteBookById("1")  // Midnight: copies + loan history<br>deleteBookById("4")  // Persepolis: one Lost copy only</pre> | <pre>null<br>null<br>// After<br>getBookById("1").title: "The Midnight Library"</pre> |
| 3 | [Unknown id](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1100) | <pre>deleteBookById("999999")</pre> | <pre>null</pre> |

### 3.11 getPhysicalCopyWithLoanAndHoldStateById

One copy by numeric id or copy code, with `hasLoanHistory` and `hasHoldHistory` (used by `PUT /copies/:id` and `DELETE /copies/:id`).

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [By copy code, with loan history](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1114) | <pre>getPhysicalCopyWithLoanAndHoldStateById("WB-00421")</pre> | <pre>{ // partial<br>  _id: "1",<br>  copyCode: "WB-00421",<br>  bookId: "1",<br>  homeLocation: "FIC HAI · A3",<br>  state: "Available",<br>  condition: "Good",<br>  notes: null,<br>  hasLoanHistory: true,  // returned loan BR-1000<br>  hasHoldHistory: false<br>}</pre> |
| 2 | [By database id](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1131) | <pre>getPhysicalCopyWithLoanAndHoldStateById("2")</pre> | <pre>{ // partial<br>  copyCode: "WB-00422",<br>  state: "Borrowed",<br>  hasLoanHistory: true<br>}</pre> |
| 3 | [Hold history apart from loan history](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1144) | <pre>getPhysicalCopyWithLoanAndHoldStateById("WB-00423")<br>getPhysicalCopyWithLoanAndHoldStateById("WB-00217")</pre> | <pre>{ // partial<br>  state: "Reserved",<br>  hasLoanHistory: false,<br>  hasHoldHistory: true   // HLD-1001<br>}<br>{ // partial<br>  state: "Available",<br>  hasLoanHistory: false,<br>  hasHoldHistory: false<br>}</pre> |
| 4 | [Unknown copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1154) | <pre>getPhysicalCopyWithLoanAndHoldStateById("WB-99999")</pre> | <pre>null</pre> |

### 3.12 getPyhsicalCopy

The plain copy row. Arguments are `(copyId, copyCode)`; either may be `null`.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [By copy code or by id](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1163) | <pre>getPyhsicalCopy(null, "WB-00217")<br>getPyhsicalCopy("6", null)</pre> | <pre>{ // partial<br>  _id: "6",<br>  copyCode: "WB-00217",<br>  bookId: "2",<br>  state: "Available"<br>}<br>// equal to the result by copy code</pre> |
| 2 | [The id wins over a different code](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1178) | <pre>getPyhsicalCopy("1", "WB-00422")</pre> | <pre>copyCode: "WB-00421"  // copy 1, not WB-00422</pre> |
| 3 | [Nothing given or no match](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1188) | <pre>getPyhsicalCopy(null, null)<br>getPyhsicalCopy(null, "WB-99999")</pre> | <pre>null<br>null</pre> |

### 3.13 getPhysicalCopiesByBookIdWithActiveLoanAndHold

`GET /books/:id` (staff view): the `copies` list with each copy's active loan and Ready hold.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Every copy, by copy code](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1200) | <pre>getPhysicalCopiesByBookIdWithActiveLoanAndHold("1")</pre> | <pre>copy codes: ["WB-00421", "WB-00422",<br>             "WB-00423", "WB-00424"]<br>[0]: { // partial, Available<br>  _id: "1",<br>  bookId: "1",<br>  state: "Available",<br>  activeLoan: null,<br>  activeHold: null,<br>  hasLoanHistory: true  // BR-1000 returned<br>}<br>[1]: { // partial, Borrowed<br>  state: "Borrowed",<br>  activeLoan: {<br>    borrowCode: "BR-1001",<br>    studentName: "Amira Khan",<br>    studentAccountId: "STU002",<br>    dueDate: "2026-12-01"<br>  },<br>  activeHold: null,<br>  hasLoanHistory: true<br>}<br>[2]: { // partial, Reserved<br>  state: "Reserved",<br>  activeLoan: null,<br>  activeHold: {<br>    holdCode: "HLD-1001",<br>    studentName: "Maya Chen",<br>    studentAccountId: "STU001",<br>    collectBy: "2026-12-02"  // a date, not a timestamp<br>  },<br>  hasLoanHistory: false<br>}<br>[3]: { // partial, Damaged<br>  state: "Damaged",<br>  condition: "Damaged",<br>  activeLoan: null,<br>  activeHold: null,<br>  hasLoanHistory: false<br>}</pre> |
| 2 | [No copies, or unknown title](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1254) | <pre>getPhysicalCopiesByBookIdWithActiveLoanAndHold("6")<br>getPhysicalCopiesByBookIdWithActiveLoanAndHold("999999")</pre> | <pre>[]<br>[]</pre> |

The seed puts `collect_by` at 12:00 UTC so that the date in case 1 is the same in every database time zone from UTC−12 to UTC+11.

### 3.14 addCopyToBookStock

`POST /books/:bookId/copies`.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [New copy, stock updated](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1268) | <pre>addCopyToBookStock({<br>  bookId: "2",  // Wonder<br>  copyCode: "WB-00218",<br>  homeLocation: "FIC PAL · A2",<br>  initialState: "Available",<br>  condition: "Good",<br>  notes: "New paperback copy"<br>})</pre> | <pre>{ // partial<br>  copyCode: "WB-00218",<br>  bookId: "2",<br>  homeLocation: "FIC PAL · A2",<br>  state: "Available",<br>  condition: "Good",<br>  notes: "New paperback copy"<br>}<br>// After: getBooksWithSummaryInfoById("2")<br>stockSummary: { // partial<br>  totalCopies: 3,<br>  availableCopies: 2,<br>  borrowedCopies: 1<br>}</pre> |
| 2 | [No note, damaged initial state](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1293) | <pre>addCopyToBookStock({<br>  bookId: "5",  // Dictionary<br>  copyCode: "WB-00801",<br>  homeLocation: "REF OXF · D1",<br>  initialState: "Damaged",<br>  condition: "Damaged"<br>})  // notes left out</pre> | <pre>{ // partial<br>  copyCode: "WB-00801",<br>  state: "Damaged",<br>  condition: "Damaged",<br>  notes: null<br>}</pre> |
| 3 | [Duplicate copy code](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1311) | <pre>addCopyToBookStock({<br>  bookId: "2",<br>  copyCode: "WB-00421",  // already used by Midnight<br>  homeLocation: "FIC PAL · A2",<br>  initialState: "Available",<br>  condition: "Good"<br>})</pre> | <pre>null<br>// After<br>Wonder totalCopies: 2</pre> |
| 4 | [Unknown book](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1327) | <pre>addCopyToBookStock({<br>  bookId: "999999",<br>  copyCode: "WB-12345",<br>  homeLocation: "FIC XXX · A1",<br>  initialState: "Available",<br>  condition: "Good"<br>})</pre> | <pre>null</pre> |

### 3.15 getSummaryStockAfterAddCopyToBookStock

The `updatedStockSummary` of `POST /books/:bookId/copies`: three counters of the copy's title, looked up by copy id.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Counters of the copy's title](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1342) | <pre>getSummaryStockAfterAddCopyToBookStock("1")  // a Midnight copy</pre> | <pre>{<br>  totalCopies: 4,<br>  availableCopies: 1,<br>  borrowedCopies: 1<br>}</pre> |
| 2 | [Includes a copy just added](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1351) | <pre>// setup<br>const created = addCopyToBookStock({<br>  bookId: "2",<br>  copyCode: "WB-00218",<br>  homeLocation: "FIC PAL · A2",<br>  initialState: "Available",<br>  condition: "Good"<br>})<br><br>getSummaryStockAfterAddCopyToBookStock(created._id)</pre> | <pre>{<br>  totalCopies: 3,<br>  availableCopies: 2,<br>  borrowedCopies: 1<br>}</pre> |
| 3 | [Unknown copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1366) | <pre>getSummaryStockAfterAddCopyToBookStock("999999")</pre> | <pre>null</pre> |

### 3.16 getSummaryStockAfterUpdateCopyToBookStock

The `updatedStockSummary` of `PUT /copies/:id`: six counters of the copy's title.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Every counter](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1375) | <pre>getSummaryStockAfterUpdateCopyToBookStock("1")</pre> | <pre>{<br>  totalCopies: 4,<br>  availableCopies: 1,<br>  borrowedCopies: 1,<br>  reservedCopies: 1,<br>  damagedCopies: 1,<br>  lostCopies: 0<br>}</pre> |
| 2 | [Unknown copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1391) | <pre>getSummaryStockAfterUpdateCopyToBookStock("999999")</pre> | <pre>null</pre> |

### 3.17 updatePhysicalCopy

`PUT /copies/:id`. The copy is found by `copyId` or `copyCode`. `notes` is written only when it is not `undefined`. A copy with an active loan or a Ready hold is not changed.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [Every field, by id, stock updated](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1400) | <pre>updatePhysicalCopy({<br>  copyId: "6",  // WB-00217, Wonder<br>  copyCode: undefined,<br>  homeLocation: "REPAIR-SHELF",<br>  state: "Damaged",<br>  condition: "Damaged",<br>  notes: "Cover torn"<br>})</pre> | <pre>{ // partial<br>  _id: "6",<br>  copyCode: "WB-00217",<br>  homeLocation: "REPAIR-SHELF",<br>  state: "Damaged",<br>  condition: "Damaged",<br>  notes: "Cover torn"<br>}<br>createdAt: same as before<br>updatedAt: different from before<br>// After: getSummaryStockAfterUpdateCopyToBookStock("6")<br>{<br>  totalCopies: 2,<br>  availableCopies: 0,<br>  borrowedCopies: 1,<br>  reservedCopies: 0,<br>  damagedCopies: 1,<br>  lostCopies: 0<br>}</pre> |
| 2 | [By copy code; an omitted note is kept](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1438) | <pre>// setup<br>updatePhysicalCopy({<br>  copyId: undefined,<br>  copyCode: "WB-00217",<br>  homeLocation: "FIC PAL · A2",<br>  state: "Available",<br>  condition: "Good",<br>  notes: "Temporary note"<br>})<br><br>updatePhysicalCopy({<br>  copyId: undefined,<br>  copyCode: "WB-00217",<br>  homeLocation: "FIC PAL · A3",<br>  state: "Available",<br>  condition: "Good"<br>})  // notes left out</pre> | <pre>{ // partial<br>  copyCode: "WB-00217",<br>  homeLocation: "FIC PAL · A3",<br>  notes: "Temporary note"  // kept<br>}</pre> |
| 3 | [Copy with only returned loans](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1464) | <pre>updatePhysicalCopy({<br>  copyId: "1",  // WB-00421: BR-1000 returned<br>  copyCode: undefined,<br>  homeLocation: "FIC HAI · A3",<br>  state: "Lost",<br>  condition: "Lost",<br>  notes: "Lost after the last return"<br>})</pre> | <pre>{ // partial<br>  copyCode: "WB-00421",<br>  state: "Lost",<br>  condition: "Lost"<br>}</pre> |
| 4 | [Borrowed or reserved copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1478) | <pre>updatePhysicalCopy({<br>  copyId: "2",  // WB-00422, BR-1001 active<br>  copyCode: undefined,<br>  homeLocation: "FIC HAI · A3",<br>  state: "Damaged",<br>  condition: "Damaged"<br>})<br>updatePhysicalCopy({<br>  copyId: undefined,<br>  copyCode: "WB-00423",  // HLD-1001 Ready<br>  homeLocation: "FIC HAI · A3",<br>  state: "Lost",<br>  condition: "Lost"<br>})</pre> | <pre>null<br>null<br>// After<br>WB-00422 state: "Borrowed"<br>WB-00423 state: "Reserved"</pre> |
| 5 | [No identifier, or unknown copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1505) | <pre>updatePhysicalCopy({<br>  copyId: undefined,<br>  copyCode: undefined,<br>  homeLocation: "ANY",<br>  state: "Available",<br>  condition: "Good"<br>})<br>updatePhysicalCopy({<br>  copyId: undefined,<br>  copyCode: "WB-99999",<br>  homeLocation: "ANY",<br>  state: "Available",<br>  condition: "Good"<br>})</pre> | <pre>null<br>null</pre> |

### 3.18 deletePhysicalCopyById

`DELETE /copies/:id`. Arguments are `(copyId, copyCode)`; either may be `undefined`. Returns `true` when the row was deleted.

| # | Test case | Input | Expected |
| :-: | :--- | :--- | :--- |
| 1 | [By copy code, stock lowered](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1529) | <pre>deletePhysicalCopyById(undefined, "WB-00217")</pre> | <pre>true<br>// After<br>getPyhsicalCopy(null, "WB-00217"): null<br>Wonder stockSummary: { // partial<br>  totalCopies: 1,<br>  availableCopies: 0,<br>  borrowedCopies: 1<br>}</pre> |
| 2 | [By database id](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1542) | <pre>deletePhysicalCopyById("9", undefined)  // WB-00800</pre> | <pre>true<br>// After<br>getPyhsicalCopy(null, "WB-00800"): null</pre> |
| 3 | [Loan history, returned or active](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1555) | <pre>deletePhysicalCopyById(undefined, "WB-00421")  // BR-1000 returned<br>deletePhysicalCopyById("2", undefined)         // BR-1001 active</pre> | <pre>false<br>false<br>// After<br>WB-00421 still exists</pre> |
| 4 | [Ready hold](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1571) | <pre>deletePhysicalCopyById(undefined, "WB-00423")  // HLD-1001</pre> | <pre>false<br>// After<br>WB-00423 state: "Reserved"</pre> |
| 5 | [Only a cancelled hold](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1581) | <pre>// setup<br>INSERT INTO holds (hold_code, student_id, book_id,<br>                   copy_id, status, collect_by)<br>VALUES ('HLD-CANCELLED', 5, 2, 6, 'Cancelled',<br>        '2026-12-02T12:00:00Z');<br><br>deletePhysicalCopyById(undefined, "WB-00217")</pre> | <pre>true<br>// After<br>HLD-CANCELLED row: { copy_id: null }<br>// the hold is kept, its copy reference is cleared</pre> |
| 6 | [No identifier, or unknown copy](../src/modules/book-inventories/repositories/book-inventories.respository.test.ts#L1602) | <pre>deletePhysicalCopyById(undefined, undefined)<br>deletePhysicalCopyById(undefined, "WB-99999")</pre> | <pre>false<br>false</pre> |

---

## 4. Test count

| Module | Repository / method | Test cases |
| :--- | :--- | :-: |
| Holds | getStudentBorrowingStatus | 5 |
| Holds | getBookStock | 4 |
| Holds | hasActiveLoanOrHoldForBook | 6 |
| Holds | findHoldById | 5 |
| Holds | getActiveHolds | 6 |
| Holds | createHold | 7 |
| Holds | cancelHold | 7 |
| **Holds** | **total** | **40** |
| Loans | BorrowersRepository (2 methods) | 7 |
| Loans | LoansRepository: queries (5 methods) | 19 |
| Loans | LoansRepository: issueLoans | 8 |
| Loans | LoansRepository: returnLoan | 6 |
| Loans | LoansRepository: renewLoan | 4 |
| Loans | LoanCopiesRepository | 6 |
| Loans | LoanHoldsRepository (2 methods) | 6 |
| **Loans** | **total** | **56** |
| Book-inventories | BooksRepository: getFeaturedBooks, getBooks | 17 |
| Book-inventories | BooksRepository: lookups (getBookById, getBooksWithSummaryInfoById, getBooksWithSummaryInfoByIdOrIsbn, getBookByIsbn) | 10 |
| Book-inventories | BooksRepository: getBookViewerContext | 7 |
| Book-inventories | BooksRepository: createBook, updateBookById, deleteBookById | 10 |
| Book-inventories | PhysicalCopiesRepository: queries (5 methods) | 14 |
| Book-inventories | PhysicalCopiesRepository: addCopyToBookStock | 4 |
| Book-inventories | PhysicalCopiesRepository: updatePhysicalCopy | 5 |
| Book-inventories | PhysicalCopiesRepository: deletePhysicalCopyById | 6 |
| **Book-inventories** | **total** | **73** |
| **All three** | **total** | **169** |
