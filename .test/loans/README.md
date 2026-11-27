# Loans API tests

These are end-to-end tests for the borrowing endpoints: the student's dashboard and renewal, and the staff counter ("Loan a Book", "Return a Book", "Loan Records"). Every test sends real HTTP requests with supertest to the running main server, and Vitest checks the responses. They use the same layout as `.test/book-inventories/`: one file per endpoint, `beforeEach(resetDatabase)`, and test names that start with a case id.

A request is a supertest chain on a signed-in agent, for example:

```ts
const staff = await signInAs("staff");
const res = await staff.get("/staff/loans").query({ status: "overdue" }).expect(200);
expect(borrowCodesOf(res.body.data.items)).toEqual([...SEED_ACTIVE_LOANS_BY_DUE_DATE]);
```

Success cases chain `.expect(<status>)`. Error cases pass the response to `expectApiError()`, `expectForbidden()` or `expectUnauthorized()`. The syntax is explained in [What one test does](../book-inventories/README.md#what-one-test-does).

> **Black-box tests.** These tests were written **only from `doc/API_Contract.md`** (sections 6.1, 6.4 and 7.1–7.6) and the `init.sql` seed data, without reading the loans module's code. They describe what the contract promises. Where the contract leaves something open, the test either accepts several answers or leaves it out (see [What the contract leaves open](#what-the-contract-leaves-open)).

## Run

The main server must be running against the test database (`npm run dev:test`, with `ENABLE_DB_RESET=true`). The full setup is in `.test/book-inventories/README.md`.

```powershell
npm run test:api:loans                                              # all loans tests
npx vitest run --config .test/vitest.config.ts loans/issue-books    # one file
npx vitest run --config .test/vitest.config.ts -t "RETURN-07"       # one test
```

## Files

| File | Endpoint | Contract | Access | Tests | Case ids |
|---|---|---|---|---:|---|
| `my-borrowing.api.test.ts` | `GET /me/borrowing` | 6.1 | Student | 10 | MY-BORROWING-01 … 09 |
| `renew-loan.api.test.ts` | `POST /loans/:id/renew` | 6.4 | Student | 10 | RENEW-01 … 09 |
| `find-student.api.test.ts` | `GET /staff/students/:accountId` | 7.1 | Staff | 10 | FIND-STUDENT-01 … 09 |
| `checkout-check.api.test.ts` | `GET /staff/copies/:copyCode/checkout-check` | 7.2 | Staff | 11 | CHECKOUT-CHECK-01 … 09 |
| `issue-books.api.test.ts` | `POST /staff/loans/issue` | 7.3 | Staff | 19 | ISSUE-01 … 13 |
| `active-loan-by-copy.api.test.ts` | `GET /staff/loans/active-by-copy/:copyCode` | 7.4 | Staff | 9 | ACTIVE-LOAN-01 … 06 |
| `return-book.api.test.ts` | `POST /staff/loans/:id/return` | 7.5 | Staff | 15 | RETURN-01 … 12 |
| `loan-records.api.test.ts` | `GET /staff/loans` | 7.6 | Staff | 24 | LOAN-RECORDS-01 … 16 |
| **Total** | | | | **108** | |

The test counts include each row of an `it.each` table, so one case id can cover several tests. For example, ISSUE-11 runs five invalid bodies.

`GET /me/borrowing` is placed here rather than under holds because most of the page is loans. Its `holdRequests` part is still tested here (MY-BORROWING-07).

## Test data

All of it is in `.test/helpers/borrowing.ts`, shared with the holds tests.

**Seeded loans.** All the active ones are **overdue** against today's date:

| Loan | Student | Copy | Book (id) | Borrowed | Due | Status |
|---|---|---|---|---|---|---|
| BR-2081 | Oliver S10312 | WB-00318 | The Hobbit (3) | 2026-09-29 | 2026-10-13 | Active, overdue |
| BR-2090 | Amira S10216 | WB-00423 | The Midnight Library (1) | 2026-10-02 | 2026-10-16 | Active, overdue |
| BR-2098 | Maya S10428 | WB-00216 | Wonder (8) | 2026-10-08 | 2026-10-22 | Active, overdue |
| BR-2106 | Maya S10428 | WB-00632 | A Brief History of Time (7) | 2026-10-12 | 2026-10-26 | Active, overdue |
| BR-2040 | Maya S10428 | WB-00422 | The Midnight Library (1) | 2026-09-10 | 2026-09-24 | Returned 2026-09-22, Good |

What each kind of test uses:
- **Ineligible cases** (`BORROWER_INELIGIBLE`, `RENEWAL_NOT_ELIGIBLE` for an overdue loan, `isEligible: false`, `canBorrow: false`) use these seeded students.
- **Successful borrowing** uses students the tests create through `POST /admin/users` (admin module, already implemented):
  - `NEW_STUDENT`: Nora Tran, S20001;
  - `OTHER_STUDENT`: Kai Le, S20002.

  They have no loans, holds or fines. Their loans are made with `POST /staff/loans/issue`, normally due in 14 days.
- **Damaged and Lost copies** are made with `PUT /copies/:id` (book-inventories), because `init.sql` has none.

## What each file checks

**`my-borrowing.api.test.ts`: `GET /me/borrowing`**
- **Maya:** her `accountSummary` (2 of 5 loans, 2 overdue, `canBorrow: false`), `currentLoans` sorted by `dueDate` with `isOverdue: true` and a negative `daysLeft`, and `borrowingHistory` with BR-2040.
- **A new student:**
  - with nothing borrowed, every list is empty and `canBorrow` is true;
  - a new loan is not overdue, has `canRenew: true` and `newDueDatePreview = dueDate + 7`;
  - loans are sorted by due date;
  - a hold shows up in `holdRequests` with its pickup details and does not count as a loan.
- **Access:** staff and admin get 403, a guest gets 401.

**`renew-loan.api.test.ts`: `POST /loans/:id/renew`**
- **Success:**
  - renewing by `borrowCode` or by `_id` returns `previousDueDate`, `newDueDate = +7`, `renewalCount: 1` and `canRenew: false`;
  - the dashboard then shows the new due date.
- **Errors:**
  - `403 RENEWAL_NOT_ELIGIBLE` for a second renewal or an overdue loan;
  - another student's loan is rejected and left unchanged;
  - `404 LOAN_NOT_FOUND`.
- **Access:** staff and admin get 403, a guest gets 401.

**`find-student.api.test.ts`: `GET /staff/students/:accountId`**
- **Seeded students:** Maya and Oliver are not eligible, with their loan counts.
- **A new student:** is eligible, with `remainingLoanSpace: 5`; their hold appears in `activeHolds`; an issued loan is counted.
- **Errors:** `404 STUDENT_NOT_FOUND` for an unknown id, and for a staff account id.

**`checkout-check.api.test.ts`: `GET /staff/copies/:copyCode/checkout-check`**
- An `Available` copy can be added, with badge `"Available"` and `defaultDueDate` = today + 14.
- A copy reserved for **this** student can be added, with badge `"Reserved for Nora"` and `associatedHold`.
- **Blocked copies:**
  - a `Borrowed` copy gives `ALREADY_BORROWED`, with Amira's name, id and due date;
  - a copy reserved for **another** student gives `RESERVED_FOR_OTHER`;
  - a `Damaged` or `Lost` copy gives `COPY_UNAVAILABLE`.
- **Errors:** `404 COPY_NOT_FOUND`, and a missing `studentAccountId`.

**`issue-books.api.test.ts`: `POST /staff/loans/issue`**
- **Success:**
  - two copies produce the receipt: message, one `BR-xxxx` per copy, `borrowerSummary` 0 → 2;
  - the copies become `Borrowed`;
  - five copies reach the limit exactly.
- **Holds:**
  - issuing the student's reserved copy fulfils the hold, which then disappears from `GET /staff/holds` and from the dashboard;
  - a copy reserved for another student is refused with `409`.
- **Copy errors:**
  - a `Borrowed` copy in the batch gives `409 COPY_NOT_AVAILABLE_FOR_STUDENT`, and **nothing** in the batch is issued (atomic);
  - a `Damaged` or `Lost` copy also gives 409;
  - `400 DUPLICATE_COPY_IN_BATCH`.
- **Borrower errors:**
  - `403 BORROWER_INELIGIBLE` for Maya;
  - `403 LOAN_LIMIT_EXCEEDED` for 3 + 3 loans, and nothing is issued.
- **Validation:** empty `items`, 6 items, a missing `studentAccountId`, `dueDate` or `copyCode` all give 400.

**`active-loan-by-copy.api.test.ts`: `GET /staff/loans/active-by-copy/:copyCode`**
- **Overdue loan:** BR-2106 returns the full `loan`, `copy`, `book` and `borrower` (before 2 → after 1), with `timingBadge` "Overdue · N days", where N is checked against today's date.
- **On-time loan:** a new loan shows "On time".
- **404 `ACTIVE_LOAN_NOT_FOUND`** for:
  - a copy that was never borrowed;
  - a copy whose only loan was returned;
  - an unknown copy;
  - a copy returned a moment ago.

**`return-book.api.test.ts`: `POST /staff/loans/:id/return`**
- **Success:**
  - returning by `borrowCode` or by `_id` gives the contract message, `status: "Returned"`, borrower counts 2 → 1, and `returnedAt` today;
  - `conditionNote` is optional and then `null`.
- **Copy state:**
  - `Good` makes the copy `Available` and `Good`;
  - `Damaged` or `Lost` sets both the copy's state and its condition.
- **History:** the loan moves from `currentLoans` to the top of `borrowingHistory`.
- **Errors:**
  - `409 LOAN_ALREADY_RETURNED`, with the contract text, for a loan returned twice and for BR-2040;
  - `404 LOAN_NOT_FOUND`;
  - 400 for a missing or invalid `condition`.

**`loan-records.api.test.ts`: `GET /staff/loans`**
- **Tabs:**
  - the default is the active loans sorted by `dueDate` ascending, page size 6, with every item field;
  - `tab=returned` lists BR-2040;
  - a returned loan moves from the active tab to the returned tab.
- **`q`:** finds loans by student name, account id, copy code, borrow code or book title.
- **`status`:**
  - `overdue` lists only the seeded loans;
  - `due_soon` lists only a loan due tomorrow;
  - `on_loan` lists a loan due in 14 days and no overdue loan;
  - `all` lists all six.
- **Badges:** "Due …" and "On loan".
- **Sorting and paging:** `sortOrder=desc`, `sortBy=borrowedAt`, and `limit=3&page=2`.
- **Validation:** an unknown `tab`, `status`, `sortBy` or `sortOrder` gives 400.

## Call graph

How to read the trees:
- Each line is one call. The lines under it are the calls it makes, in order.
- After `#` comes `[where the code is]` and what the call does. Paths without `src/` are in `.test/`.
- `[server …]` is the HTTP request reaching the main server, with the file in `src/` that answers it.
- A helper is drawn in full once, in [Building blocks](#building-blocks). Later trees show it as one line.

### Before the tests

Once per run:

```text
npm run test:api:loans    # [package.json] vitest run --config .test/vitest.config.ts loans/
└── setup()               # [helpers/global-setup.ts] globalSetup, runs once before any test file
    └── resetDatabase()   # [helpers/session.ts] first reset; if it fails, one clear error stops the run
```

Before every `it()`:

```text
beforeEach(resetDatabase)                           # [*.api.test.ts] registered at the top of each describe()
└── resetDatabase()                                 # [helpers/session.ts] resets the data; throws unless the status is 200
    ├── newClient()                                 # [helpers/client.ts] a new supertest agent with no cookie
    │   ├── request.agent(API_CONFIG.baseUrl)       # [supertest] agent for http://localhost:<port>/api/v1
    │   ├── .set("Accept", "application/json")      # [supertest] default header of every request
    │   └── .timeout(API_CONFIG.requestTimeoutMs)   # [supertest] 10 s per request
    └── .post(API_CONFIG.resetPath)                 # [supertest] sends the reset request
        └── POST /api/v1/dev/reset-db               # [server dev-tools.routes.ts] TRUNCATE the app tables, run init.sql
```

### Building blocks

```text
signInAs(role, accountId?)                    # [helpers/session.ts] logs in, returns the signed-in agent
├── newClient()                               # [helpers/client.ts] a new agent (see beforeEach)
├── .post(API_CONFIG.loginPath).send({...})   # [supertest] { accountId, password123, role }; the agent keeps the cookie
│   └── POST /api/v1/auth/login               # [server auth.controller.ts login()] creates the session
└── setsSessionCookie(response)               # [helpers/session.ts] throws unless Set-Cookie has connect.sid
guest()                                       # [helpers/session.ts] an agent that never logs in
└── newClient()                               # [helpers/client.ts] a new agent (see beforeEach)
```

```text
createStudent(student = NEW_STUDENT)                       # [helpers/borrowing.ts] a new eligible student, returns its agent
├── signInAs("admin")                                      # [helpers/session.ts]
├── admin.post("/admin/users").send({...})                 # [supertest] accountId, fullName, password123, role, yearGroup
│   └── POST /api/v1/admin/users                           # [server admin.routes.ts] creates the account
├── expect([200, 201], message).toContain(res.status)      # [vitest] setup check
└── signInAs("student", student.accountId)                 # [helpers/session.ts] the agent it returns
placeHold(student, bookId)                                 # [helpers/borrowing.ts] places a hold, returns res.body.data
├── student.post("/holds").send({ bookId })                # [supertest]
│   └── POST /api/v1/holds                                 # [server holds.routes.ts] reserves an Available copy
└── expect(res.status, message).toBe(201)                  # [vitest] setup check
issueBooks(staff, studentAccountId, copyCodes, dueDate?)   # [helpers/borrowing.ts] issues loans, returns the receipt
├── isoDateFromToday(14)                                   # [helpers/dates.ts] default dueDate, when none is given
├── staff.post("/staff/loans/issue").send({...})           # [supertest] one item per copy code
│   └── POST /api/v1/staff/loans/issue                     # [server loans.routes.ts] creates the loans, fulfils holds
└── expect(res.status, message).toBe(201)                  # [vitest] setup check
copyInCatalog(staff, bookId, copyCode)                     # [helpers/borrowing.ts] one copy, as the staff book detail shows it
├── staff.get(`/books/${bookId}`)                          # [supertest]
│   └── GET /api/v1/books/:id                              # [server book-inventories.routes.ts] the book with its copies
├── expect(res.status, message).toBe(200)                  # [vitest] setup check
└── res.body.data.copies.find(...)                         # [JavaScript] the copy with that copyCode
```

```text
expectDateNearToday(actual, offsetDays)          # [helpers/dates.ts] a date the server derives from today, ±1 day
├── expect(actual).toEqual(expect.any(String))   # [vitest] must be a string
├── isoDateFromToday(offsetDays)                 # [helpers/dates.ts] today + offsetDays as YYYY-MM-DD
├── daysBetween(expected, date)                  # [helpers/dates.ts] whole days between the two dates
└── expect(...).toBeLessThanOrEqual(1)           # [vitest]
addDays(isoDate, days)                           # [helpers/dates.ts] calendar arithmetic, e.g. dueDate + 7
```

### Scenarios inside `it()`

Each tree shows one example test. The other tests of the same scenario call the same functions with other values.

#### 1. Read the seeded data

Used by MY-BORROWING-01…03, FIND-STUDENT-01, 02, LOAN-RECORDS-01…03, 05, 11…13.

```text
it("[MY-BORROWING-02] currentLoans are sorted by dueDate ...")   # [my-borrowing.api.test.ts]
├── signInAs("student", SEED_STUDENT.maya.accountId)             # [helpers/session.ts] Maya; signInAs("staff") in the staff files
├── maya.get("/me/borrowing").expect(200)                        # [supertest] fails the test on another status
│   └── GET /api/v1/me/borrowing                                 # [server loans.routes.ts] Maya's dashboard
├── expect(loans).toMatchObject([...])                           # [vitest] the two seeded loans, in dueDate order
└── daysBetween(isoDateFromToday(0), loan.dueDate)               # [helpers/dates.ts] the expected daysLeft (negative), ±1
    └── isoDateFromToday(0)                                      # [helpers/dates.ts] today
```

#### 2. New student with a loan

Used by MY-BORROWING-04…06, FIND-STUDENT-03, 05.

```text
it("[MY-BORROWING-05] a loan issued today ...")                # [my-borrowing.api.test.ts]
├── createStudent()                                            # [helpers/borrowing.ts] Nora, S20001
├── signInAs("staff")                                          # [helpers/session.ts]
├── isoDateFromToday(14)                                       # [helpers/dates.ts] the dueDate
├── issueBooks(staff, NEW_STUDENT.accountId, [...], dueDate)   # [helpers/borrowing.ts] setup: one loan on WB-00421
├── student.get("/me/borrowing").expect(200)                   # [supertest]
│   └── GET /api/v1/me/borrowing                               # [server loans.routes.ts] Nora's dashboard
├── addDays(dueDate, 7)                                        # [helpers/dates.ts] the expected newDueDatePreview
└── expectDateNearToday(loan.borrowedAt, 0)                    # [helpers/dates.ts] borrowed today
```

#### 3. New student with a hold

Used by MY-BORROWING-07, FIND-STUDENT-04, CHECKOUT-CHECK-02, 04, ISSUE-04, 05.

```text
it("[ISSUE-04] issuing the copy reserved for this student fulfils the hold")   # [issue-books.api.test.ts]
├── createStudent()                                                            # [helpers/borrowing.ts]
├── placeHold(student, BOOK.bookThief._id)                                     # [helpers/borrowing.ts] setup: WB-00101 becomes Reserved
├── signInAs("staff")                                                          # [helpers/session.ts]
├── issueBody(NEW_STUDENT.accountId, [...])                                    # [issue-books.api.test.ts] builds { studentAccountId, items }
│   └── isoDateFromToday(14)                                                   # [helpers/dates.ts] default dueDate
├── staff.post("/staff/loans/issue").send(body).expect(201)                    # [supertest]
│   └── POST /api/v1/staff/loans/issue                                         # [server loans.routes.ts] issues the copy, fulfils the hold
├── staff.get("/staff/holds")                                                  # [supertest]
│   └── GET /api/v1/staff/holds                                                # [server holds.routes.ts] the hold is no longer listed
└── student.get("/me/borrowing")                                               # [supertest]
    └── GET /api/v1/me/borrowing                                               # [server loans.routes.ts] the copy is now a current loan
```

#### 4. Issue books

Used by ISSUE-01…03.

```text
it("[ISSUE-01] issues two copies and returns the receipt")    # [issue-books.api.test.ts]
├── createStudent()                                           # [helpers/borrowing.ts]
├── signInAs("staff")                                         # [helpers/session.ts]
├── isoDateFromToday(14)                                      # [helpers/dates.ts] the dueDate
├── issueBody(NEW_STUDENT.accountId, [...], dueDate)          # [issue-books.api.test.ts] builds { studentAccountId, items }
├── staff.post("/staff/loans/issue").send(body).expect(201)   # [supertest]
│   └── POST /api/v1/staff/loans/issue                        # [server loans.routes.ts] creates one loan per copy
├── expect(res.body).toMatchObject({...})                     # [vitest] message, borrowEntries, borrowerSummary
└── expectDateNearToday(first.borrowedAt, 0)                  # [helpers/dates.ts] issued today
```

#### 5. Renew a loan

Used by RENEW-01…04, 06.

```text
it("[RENEW-01] renews by borrowCode for 7 more days")              # [renew-loan.api.test.ts]
├── newStudentWithLoan()                                           # [renew-loan.api.test.ts] Nora with one loan due in 14 days
│   ├── createStudent(NEW_STUDENT)                                 # [helpers/borrowing.ts]
│   ├── signInAs("staff")                                          # [helpers/session.ts]
│   ├── isoDateFromToday(14)                                       # [helpers/dates.ts]
│   └── issueBooks(staff, NEW_STUDENT.accountId, [...], dueDate)   # [helpers/borrowing.ts] WB-00421
├── student.post(`/loans/${loan.borrowCode}/renew`).expect(200)    # [supertest] by _id in RENEW-02
│   └── POST /api/v1/loans/:id/renew                               # [server loans.routes.ts] dueDate + 7, renewalCount 1
├── addDays(dueDate, 7)                                            # [helpers/dates.ts] the expected newDueDate
└── expect(res.body).toMatchObject({...})                          # [vitest]
```

#### 6. Look up a copy by its code

Used by CHECKOUT-CHECK-01, 03, ACTIVE-LOAN-01, 02.

```text
it("[CHECKOUT-CHECK-01] an Available copy can be added ...")   # [checkout-check.api.test.ts]
├── createStudent()                                            # [helpers/borrowing.ts]
├── signInAs("staff")                                          # [helpers/session.ts]
├── checkPath(AVAILABLE_COPY.midnight1)                        # [checkout-check.api.test.ts] lookupPath() in active-loan-by-copy
│   └── pathOf("/staff/copies/:copyCode/...", { copyCode })    # [helpers/client.ts] fills and URL-encodes :copyCode
├── staff.get(path).query({ studentAccountId }).expect(200)    # [supertest]
│   └── GET /api/v1/staff/copies/WB-00421/checkout-check       # [server loans.routes.ts] can this copy be issued?
├── expect(res.body).toMatchObject({...})                      # [vitest] copy, book, canAdd, availabilityBadge
└── expectDateNearToday(res.body.data.defaultDueDate, 14)      # [helpers/dates.ts] today + 14
```

#### 7. Mark a copy Damaged or Lost first

Used by CHECKOUT-CHECK-05, ISSUE-07.

```text
it.each(["Damaged", "Lost"])("[ISSUE-07] a %s copy is not available")   # [issue-books.api.test.ts] one test per state
├── createStudent()                                                     # [helpers/borrowing.ts]
├── signInAs("staff")                                                   # [helpers/session.ts]
├── pathOf("/copies/:id", { id: AVAILABLE_COPY.midnight1 })             # [helpers/client.ts] "/copies/WB-00421"
├── staff.put(path).send({ homeLocation, state, condition })            # [supertest] setup request
│   └── PUT /api/v1/copies/WB-00421                                     # [server book-inventories.routes.ts] marks the copy Damaged or Lost
├── expect(marked.status, message).toBe(200)                            # [vitest] setup check
├── issueBody(NEW_STUDENT.accountId, [...])                             # [issue-books.api.test.ts]
├── staff.post("/staff/loans/issue").send(body)                         # [supertest] no .expect
│   └── POST /api/v1/staff/loans/issue                                  # [server loans.routes.ts] answers 409
└── expectApiError(res, 409, "COPY_NOT_AVAILABLE_FOR_STUDENT")          # [helpers/assertions.ts] (see scenario 10)
```

#### 8. Return a loan

Used by RETURN-01…06, ACTIVE-LOAN-04, LOAN-RECORDS-04.

```text
it("[RETURN-04] Good: the copy is Available and Good again")   # [return-book.api.test.ts]
├── signInAs("staff")                                          # [helpers/session.ts]
├── returnPath(WONDER.borrowCode)                              # [return-book.api.test.ts] "/staff/loans/BR-2098/return"
│   └── pathOf("/staff/loans/:id/return", { id })              # [helpers/client.ts] fills and URL-encodes :id
├── staff.post(path).send({ condition: "Good" }).expect(200)   # [supertest]
│   └── POST /api/v1/staff/loans/BR-2098/return                # [server loans.routes.ts] closes the loan, frees the copy
├── copyInCatalog(staff, WONDER.book._id, WONDER.copyCode)     # [helpers/borrowing.ts] the copy after the return
└── expect(copy).toMatchObject({ state, condition })           # [vitest] Available and Good
```

#### 9. Loan records with new loans

Used by LOAN-RECORDS-06…10.

```text
it("[LOAN-RECORDS-07] status=due_soon includes a loan due tomorrow ...")   # [loan-records.api.test.ts]
├── signInAs("staff")                                                      # [helpers/session.ts]
├── twoNewLoans(staff)                                                     # [loan-records.api.test.ts] Nora: one loan due tomorrow, one in 14 days
│   ├── createStudent()                                                    # [helpers/borrowing.ts]
│   ├── isoDateFromToday(1)                                                # [helpers/dates.ts] tomorrow
│   ├── issueBooks(staff, NEW_STUDENT.accountId, [...], tomorrow)          # [helpers/borrowing.ts] WB-00421
│   ├── isoDateFromToday(14)                                               # [helpers/dates.ts] in 14 days
│   └── issueBooks(staff, NEW_STUDENT.accountId, [...], in14Days)          # [helpers/borrowing.ts] WB-00511
├── staff.get("/staff/loans").query({ status: "due_soon" }).expect(200)    # [supertest]
│   └── GET /api/v1/staff/loans?status=due_soon                            # [server loans.routes.ts] the Loan Records list
├── borrowCodesOf(res.body.data.items)                                     # [loan-records.api.test.ts] the borrowCode of each item
└── expect(...).toEqual([dueSoon])                                         # [vitest]
```

#### 10. Error response

Used by FIND-STUDENT-06, 07, CHECKOUT-CHECK-06, 07, ACTIVE-LOAN-03, RENEW-04, 05, 07, ISSUE-06, 08…11, RETURN-07…10, LOAN-RECORDS-14.

```text
it("[ISSUE-06] a Borrowed copy rejects the whole batch ...")     # [issue-books.api.test.ts]
├── createStudent()                                              # [helpers/borrowing.ts]
├── signInAs("staff")                                            # [helpers/session.ts]
├── issueBody(NEW_STUDENT.accountId, [...])                      # [issue-books.api.test.ts] WB-00421 and the Borrowed WB-00423
├── staff.post("/staff/loans/issue").send(body)                  # [supertest] no .expect: a 4xx does not fail by itself
│   └── POST /api/v1/staff/loans/issue                           # [server loans.routes.ts] answers 409, issues nothing
├── expectApiError(res, 409, "COPY_NOT_AVAILABLE_FOR_STUDENT")   # [helpers/assertions.ts] status and error envelope
│   ├── expect(res.status).toBe(409)                             # [vitest]
│   └── expect(res.body).toMatchObject({...})                    # [vitest] { success: false, error: { code } }
├── copyInCatalog(staff, BOOK.midnightLibrary._id, ...)          # [helpers/borrowing.ts] only in ISSUE-06 and ISSUE-10
└── expect(untouched.state).toBe("Available")                    # [vitest] nothing in the batch was issued
```

#### 11. Wrong role (403) or no session (401)

Used by MY-BORROWING-08, 09, RENEW-08, 09, FIND-STUDENT-08, 09, CHECKOUT-CHECK-08, 09, ISSUE-12, 13, ACTIVE-LOAN-05, 06, RETURN-11, 12, LOAN-RECORDS-15, 16.

```text
it.each(["student", "admin"])("[RETURN-11] %s is not allowed")   # [return-book.api.test.ts] one test per role
├── signInAs(role)                                               # [helpers/session.ts]
├── user.post(returnPath(...)).send({ condition: "Good" })       # [supertest] no .expect
│   └── POST /api/v1/staff/loans/BR-2098/return                  # [server loans.controller.ts role guard] answers 403
└── expectForbidden(res)                                         # [helpers/assertions.ts] 403 with success: false
    ├── expect(res.status).toBe(403)                             # [vitest]
    └── expect(res.body).toMatchObject({ success: false })       # [vitest]
it("[RETURN-12] a guest is not signed in")                       # [return-book.api.test.ts]
├── guest().post(returnPath(...)).send({ condition: "Good" })    # [supertest] a request without a cookie
│   ├── guest()                                                  # [helpers/session.ts]
│   └── POST /api/v1/staff/loans/BR-2098/return                  # [server verification.middleware.ts] no session, 401
└── expectUnauthorized(res)                                      # [helpers/assertions.ts] checks the status only
    └── expect(res.status).toBe(401)                             # [vitest]
```

## What the contract leaves open

| Situation | Contract | What the test does |
|---|---|---|
| Renewing another student's loan | "must belong to the authenticated student", no error code | accepts **403 or 404** with `success: false`, and checks that the loan was not renewed |
| Wrong role (403) / no session (401) | no error code | `expectForbidden()`: status 403 and `success: false`; `expectUnauthorized()`: status only |
| Missing or invalid query/body fields (`studentAccountId`, `items`, `condition`, `tab`, …) | "required" or a value list, no error listed | expects the project-wide `400 VALIDATION_ERROR` |
| Threshold of `due_soon` | not specified | uses a loan due **tomorrow** (due soon) and one due in **14 days** (not due soon) |
| Wording of `statusBadge` / `timingBadge` | examples only | exact for "On loan", "On time" and "Returned"; a pattern for "Overdue · N days" and "Due …" |
| `borrowedAt` format | "ISO date" | only the date prefix is checked, so a full timestamp also passes |
| `defaultDueDate`, `returnedAt`, `returningToday` | derived from "today" | compared with ±1 day for the server's time zone |
| Order of `borrowEntries` | not stated | expected in the same order as `items` |
| Renewing a returned loan, a student with an overdue loan renewing a non-overdue one, issuing to an unknown student | not specified, or not reachable through the API with this seed | not tested |

## Dates

The tests use the machine's clock. They assume today is after **2026-10-26**, so that every seeded active loan is overdue. New loans get due dates relative to today (`isoDateFromToday(14)`), and renewals are checked with exact calendar arithmetic (`addDays(dueDate, 7)`).
