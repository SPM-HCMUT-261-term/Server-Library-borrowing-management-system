# Holds API tests

These are end-to-end tests for the hold endpoints. Every test sends real HTTP requests with supertest to the running main server, and Vitest checks the responses. They use the same layout as `.test/book-inventories/`: one file per endpoint, `beforeEach(resetDatabase)`, and test names that start with a case id.

A request is a supertest chain on a signed-in agent, for example:

```ts
const student = await createStudent();
const res = await student.post("/holds").send({ bookId: BOOK.bookThief._id }).expect(201);
expect(res.body.data.assignedCopy.copyCode).toBe(AVAILABLE_COPY.bookThiefOnly);
```

Success cases chain `.expect(<status>)`. Error cases pass the response to `expectApiError()`, `expectForbidden()` or `expectUnauthorized()`. The syntax is explained in [What one test does](../book-inventories/README.md#what-one-test-does).

> **Black-box tests.** These tests were written **only from `doc/API_Contract.md`** (sections 6.2, 6.3 and 7.7) and the `init.sql` seed data, without reading the holds module's code. They describe what the contract promises. Where the contract leaves something open, the test either accepts several answers or leaves it out (see [What the contract leaves open](#what-the-contract-leaves-open)).

## Run

The main server must be running against the test database (`npm run dev:test`, with `ENABLE_DB_RESET=true`). The full setup is in `.test/book-inventories/README.md`.

```powershell
npm run test:api:holds                                              # all holds tests
npx vitest run --config .test/vitest.config.ts holds/create-hold    # one file
npx vitest run --config .test/vitest.config.ts -t "HOLD-CANCEL-05"  # one test
```

## Files

| File | Endpoint | Contract | Access | Tests | Case ids |
|---|---|---|---|---:|---|
| `create-hold.api.test.ts` | `POST /holds` | 6.2 | Student | 14 | HOLD-CREATE-01 … 13 |
| `cancel-hold.api.test.ts` | `DELETE /holds/:id` | 6.3 | Owner student, Staff | 12 | HOLD-CANCEL-01 … 12 |
| `staff-holds.api.test.ts` | `GET /staff/holds` | 7.7 | Staff | 14 | STAFF-HOLDS-01 … 10 |
| **Total** | | | | **40** | |

The test counts include each row of an `it.each` table, for example the `staff` and `admin` rows of an access test.

## Test data

`init.sql` has **no holds**, and every seeded student has **overdue loans**, because the seed dates are in October 2026. A seeded student therefore cannot place a hold. The tests create their own eligible students through `POST /admin/users`. That uses the admin module, which is already implemented.

| Name in the tests | Account | Created by |
|---|---|---|
| `NEW_STUDENT` (Nora Tran) | S20001, Year 9 | `createStudent()` |
| `OTHER_STUDENT` (Kai Le) | S20002, Year 11 | `createStudent(OTHER_STUDENT)` |

Titles chosen so that the assigned copy is predictable:

| Title (book id) | Available copies in `init.sql` | Used for |
|---|---|---|
| The Book Thief (2) | **only WB-00101** | the assigned copy is known; a second hold finds no copy |
| The House on Mango Street (4) | only WB-00511 | a second, different hold |
| The Hobbit (3) | none | `NO_AVAILABLE_COPIES` |
| The Midnight Library (1) | WB-00421, WB-00422 | duplicate-hold checks where availability is not the reason |

All of these live in `.test/helpers/borrowing.ts`, shared with the loans tests.

## What each file checks

**`create-hold.api.test.ts`: `POST /holds`**
- **Success:**
  - the response has the hold confirmation (`holdCode` like `HLD-1234`, `status: "Ready"`, `book` with its stock summary, `assignedCopy`, `studentLoanUsage`);
  - `collectBy` is the next day at :30;
  - the copy becomes `Reserved`, which the test checks in `GET /books/:id`;
  - a hold does not change `activeLoansCount`, which the test checks in `GET /auth/me`;
  - one student may hold several different titles.
- **Errors:** `400 NO_AVAILABLE_COPIES` (no copy, or the last one already reserved), `409 DUPLICATE_HOLD_OR_LOAN` (same title already held or borrowed), `403 BORROWING_BLOCKED` (Maya, overdue), and `400 VALIDATION_ERROR` for a missing `bookId`.
- **Access:** staff and admin get 403, a guest gets 401.

**`cancel-hold.api.test.ts`: `DELETE /holds/:id`**
- **Success:** the owner cancels by `holdCode` or by `_id`, and staff can cancel any hold. The response has the contract message and `{ holdCode, status: "Cancelled", releasedCopyCode }`.
- **Effects:**
  - the copy is `Available` again;
  - another student can hold it;
  - the same student can hold the title again.
- **Errors:** `409 HOLD_NOT_CANCELLABLE` for a hold that is already cancelled or was fulfilled at the counter, and `404 HOLD_NOT_FOUND`.
- **Access:**
  - another student cannot cancel the hold, and the copy stays `Reserved`;
  - admin gets 403;
  - a guest gets 401.

**`staff-holds.api.test.ts`: `GET /staff/holds`**
- The list is empty at first.
- A new hold is listed with `isPastDeadline: false` and its student, book and copy.
- Cancelled and fulfilled holds are not listed.
- `q` finds a hold by holdCode, account id, student name, copy code or book title.
- `limit=1` splits two holds over two pages.
- Students and admins get 403, a guest gets 401.

## Call graph

How to read the trees:
- Each line is one call. The lines under it are the calls it makes, in order.
- After `#` comes `[where the code is]` and what the call does. Paths without `src/` are in `.test/`.
- `[server …]` is the HTTP request reaching the main server, with the file in `src/` that answers it.
- A helper is drawn in full once, in [Building blocks](#building-blocks). Later trees show it as one line.

### Before the tests

Once per run:

```text
npm run test:api:holds    # [package.json] vitest run --config .test/vitest.config.ts holds/
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

### Scenarios inside `it()`

Each tree shows one example test. The other tests of the same scenario call the same functions with other values.

#### 1. Place a hold

Used by HOLD-CREATE-01, 05.

```text
it("[HOLD-CREATE-01] reserves an available copy ...")     # [create-hold.api.test.ts]
├── createStudent()                                       # [helpers/borrowing.ts] Nora, S20001
├── student.post("/holds").send({ bookId }).expect(201)   # [supertest] fails the test on another status
│   └── POST /api/v1/holds                                # [server holds.routes.ts] creates the hold
└── expect(res.body.data).toMatchObject({...})            # [vitest] the hold confirmation
```

#### 2. Hold, then check what changed

Used by HOLD-CREATE-02…04, HOLD-CANCEL-04.

```text
it("[HOLD-CREATE-03] the assigned copy becomes Reserved ...")   # [create-hold.api.test.ts]
├── createStudent()                                             # [helpers/borrowing.ts]
├── placeHold(student, BOOK.bookThief._id)                      # [helpers/borrowing.ts] setup: reserves WB-00101
├── signInAs("staff")                                           # [helpers/session.ts]
├── copyInCatalog(staff, BOOK.bookThief._id, ...)               # [helpers/borrowing.ts] HOLD-CREATE-04 calls GET /auth/me instead
└── expect(copy.state).toBe("Reserved")                         # [vitest]
it("[HOLD-CREATE-02] collectBy is the next day at 15:30")       # [create-hold.api.test.ts]
├── createStudent()                                             # [helpers/borrowing.ts]
├── placeHold(student, BOOK.bookThief._id)                      # [helpers/borrowing.ts] returns requestedAt and collectBy
├── Date.parse(hold.collectBy)                                  # [JavaScript] timestamps to compare
├── expectDateNearToday(hold.collectBy, 1)                      # [helpers/dates.ts] about tomorrow, ±1 day
│   ├── isoDateFromToday(1)                                     # [helpers/dates.ts] tomorrow as YYYY-MM-DD
│   └── daysBetween(expected, date)                             # [helpers/dates.ts] must be at most 1
└── expect(new Date(collectBy).getUTCMinutes()).toBe(30)        # [vitest] :30 in any whole-hour time zone
```

#### 3. Cancel a hold

Used by HOLD-CANCEL-01…03, 05, 06.

```text
it("[HOLD-CANCEL-01] the owner cancels by holdCode")        # [cancel-hold.api.test.ts]
├── createStudent()                                         # [helpers/borrowing.ts]
├── placeHold(student, BOOK.bookThief._id)                  # [helpers/borrowing.ts] setup: the hold to cancel
├── student.delete(`/holds/${hold.holdCode}`).expect(200)   # [supertest] by _id in CANCEL-02, as staff in CANCEL-03
│   └── DELETE /api/v1/holds/:id                            # [server holds.routes.ts] cancels; the copy is Available again
└── expect(res.body).toMatchObject({...})                   # [vitest] message, holdCode, status, releasedCopyCode
```

#### 4. Hold fulfilled at the counter

Used by HOLD-CANCEL-08, STAFF-HOLDS-04.

```text
it("[HOLD-CANCEL-08] a hold that was fulfilled at the counter")   # [cancel-hold.api.test.ts]
├── createStudent()                                               # [helpers/borrowing.ts]
├── placeHold(student, BOOK.bookThief._id)                        # [helpers/borrowing.ts]
├── signInAs("staff")                                             # [helpers/session.ts]
├── issueBooks(staff, NEW_STUDENT.accountId, [...])               # [helpers/borrowing.ts] issuing the reserved copy fulfils the hold
├── student.delete(`/holds/${hold.holdCode}`)                     # [supertest] no .expect
│   └── DELETE /api/v1/holds/:id                                  # [server holds.routes.ts] answers 409
└── expectApiError(res, 409, "HOLD_NOT_CANCELLABLE")              # [helpers/assertions.ts] (see scenario 6)
```

#### 5. Staff list of holds

Used by STAFF-HOLDS-01…03, 05…08.

```text
it("[STAFF-HOLDS-05] finds a hold by %s")                # [staff-holds.api.test.ts] it.each: one test per search value
├── twoHolds()                                           # [staff-holds.api.test.ts] Nora holds The Book Thief, Kai The House on Mango Street
│   ├── createStudent(NEW_STUDENT)                       # [helpers/borrowing.ts]
│   ├── placeHold(nora, BOOK.bookThief._id)              # [helpers/borrowing.ts]
│   ├── createStudent(OTHER_STUDENT)                     # [helpers/borrowing.ts]
│   ├── placeHold(kai, BOOK.mangoStreet._id)             # [helpers/borrowing.ts]
│   └── signInAs("staff")                                # [helpers/session.ts]
├── staff.get("/staff/holds").query({ q }).expect(200)   # [supertest] .query({ limit, page }) in STAFF-HOLDS-08
│   └── GET /api/v1/staff/holds?q=...                    # [server holds.routes.ts] lists the active holds
├── holdCodesOf(res.body.data.items)                     # [staff-holds.api.test.ts] the holdCode of each item
└── expect(...).toEqual([kaiHold.holdCode])              # [vitest]
```

#### 6. Error response

Used by HOLD-CREATE-06…11, HOLD-CANCEL-07, 09.

```text
it("[HOLD-CREATE-06] a title with no Available copy is rejected")   # [create-hold.api.test.ts]
├── createStudent()                                                 # [helpers/borrowing.ts] signInAs("student", Maya) in HOLD-CREATE-10
├── student.post("/holds").send({ bookId: BOOK.hobbit._id })        # [supertest] no .expect: a 4xx does not fail by itself
│   └── POST /api/v1/holds                                          # [server holds.routes.ts] answers 400
└── expectApiError(res, 400, "NO_AVAILABLE_COPIES")                 # [helpers/assertions.ts] status and error envelope
    ├── expect(res.status).toBe(400)                                # [vitest]
    └── expect(res.body).toMatchObject({...})                       # [vitest] { success: false, error: { code } }
```

#### 7. Another student's hold

Used by HOLD-CANCEL-10.

```text
it("[HOLD-CANCEL-10] a student cannot cancel another student's hold")   # [cancel-hold.api.test.ts]
├── createStudent(NEW_STUDENT)                                          # [helpers/borrowing.ts] Nora
├── placeHold(nora, BOOK.bookThief._id)                                 # [helpers/borrowing.ts] Nora's hold
├── createStudent(OTHER_STUDENT)                                        # [helpers/borrowing.ts] Kai
├── kai.delete(`/holds/${hold.holdCode}`)                               # [supertest] no .expect
│   └── DELETE /api/v1/holds/:id                                        # [server holds.routes.ts] 403 or 404
├── expect([403, 404]).toContain(res.status)                            # [vitest] the contract names no error code
├── expect(res.body.success).toBe(false)                                # [vitest]
├── signInAs("staff")                                                   # [helpers/session.ts]
├── copyInCatalog(staff, BOOK.bookThief._id, ...)                       # [helpers/borrowing.ts]
└── expect(copy.state).toBe("Reserved")                                 # [vitest] the hold was not cancelled
```

#### 8. Wrong role (403) or no session (401)

Used by HOLD-CREATE-12, 13, HOLD-CANCEL-11, 12, STAFF-HOLDS-09, 10.

```text
it.each(["staff", "admin"])("[HOLD-CREATE-12] %s is not allowed")   # [create-hold.api.test.ts] one test per role
├── signInAs(role)                                                  # [helpers/session.ts]
├── user.post("/holds").send({ bookId })                            # [supertest] no .expect
│   └── POST /api/v1/holds                                          # [server holds.controller.ts role guard] answers 403
└── expectForbidden(res)                                            # [helpers/assertions.ts] 403 with success: false
    ├── expect(res.status).toBe(403)                                # [vitest]
    └── expect(res.body).toMatchObject({ success: false })          # [vitest]
it("[HOLD-CREATE-13] a guest is not signed in")                     # [create-hold.api.test.ts]
├── guest().post("/holds").send({ bookId })                         # [supertest] a request without a cookie
│   ├── guest()                                                     # [helpers/session.ts]
│   └── POST /api/v1/holds                                          # [server verification.middleware.ts] no session, 401
└── expectUnauthorized(res)                                         # [helpers/assertions.ts] checks the status only
    └── expect(res.status).toBe(401)                                # [vitest]
```

## What the contract leaves open

These are the places where the tests are deliberately loose:

| Situation | Contract | What the test does |
|---|---|---|
| Another student cancels my hold | "student owner \| staff", no error code | accepts **403 or 404** with `success: false`, and checks that the hold was not cancelled |
| Wrong role (403) | no error code | `expectForbidden()`: status 403 and `success: false` only |
| No session (401) | no error code | `expectUnauthorized()`: status only (the 401 body has a known envelope bug, see the book-inventories README) |
| Missing `bookId` | "required", no error listed | expects the project-wide `400 VALIDATION_ERROR` |
| Unknown `bookId` | not specified | not tested |
| `collectBy` time zone | "next day at 15:30" | checks it is after `requestedAt`, within 48 h, about tomorrow, and at minute 30 |
| Which copy a hold picks | "selects an available copy" | uses titles with a single available copy |
| `stockSummary` in the hold confirmation | fields listed, values not | expects the counts **after** the reservation (`availableCopies: 0`, `reservedCopies: 1`) |
| Empty list `totalPages` | not specified | not checked |

## Dates

The tests use the machine's clock. They assume today is after **2026-10-26**, so that every seeded active loan is overdue. Dates the server derives from "today" are compared with ±1 day, because the server may count days in UTC or in local time.
