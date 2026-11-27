# Book-inventories API tests

These are end-to-end tests for the 9 book-inventories endpoints. Each test sends **real HTTP requests** with [supertest](https://github.com/ladjs/supertest) to the main server, which you start yourself. Vitest runs the tests and checks the JSON bodies.

They follow the same pattern as the repository tests in `src/modules/*/repositories/*.test.ts`:
- `describe` per endpoint;
- `beforeEach` resets the data;
- each `it` arranges, sends one request with supertest, and asserts with `.expect(status)` and `expect(...)`.

The cases are the ones in `.temp/.temp-test-data/book-inventories.test/book-inventories.test.json`, rewritten as TypeScript. Each test name starts with the original case id (for example `[LIST-03]`), so you can match the Vitest output with the Postman runs.

---

## Before you run

> [!IMPORTANT]
> **The server must already be running in test mode (`npm run dev:test`) before you run any test.**
> The tests do not start the server. They only send HTTP requests to it.

Run these commands from the **repository root**. The main [README](../../README.md) explains each step in more detail.

1. **Start the test database** (Compose service `test-db`, container `hcmut-261-spm-db-test`, port 5433):
   ```bash
   docker compose up -d --wait test-db
   ```
2. **Create the tables and load the data.** Run `schema.sql` first, then `init.sql`:
   ```bash
   docker compose exec test-db psql -U postgres -d test-library-borrowing-system-hcmut-spm-261 -v ON_ERROR_STOP=1 -f /sql/schema.sql
   docker compose exec test-db psql -U postgres -d test-library-borrowing-system-hcmut-spm-261 -v ON_ERROR_STOP=1 -f /sql/init.sql
   ```
   > [!WARNING]
   > `test-db` keeps its data in memory. **Stopping or restarting it deletes all tables and rows.** Run both scripts again every time you start it.
3. **Check `.env.test.local`.** It needs:
   ```dotenv
   SERVER_PORT=3000
   DB_HOST=localhost
   DB_PORT=5433
   DB_USER=postgres
   DB_PASSWORD=test
   DB_NAME=test-library-borrowing-system-hcmut-spm-261
   SESSION_SECRET_KEY=any-single-line-secret
   ENABLE_DB_RESET=true
   ```
4. **Start the server in test mode** in its own terminal, and leave it running:
   ```bash
   npm run dev:test
   ```
   It is ready when the log shows these lines:
   ```text
   ENABLE_DB_RESET is on: POST /api/v1/dev/reset-db can wipe the database.
   Connected to database test-library-borrowing-system-hcmut-spm-261 in localhost:5433
   Server is running on port 3000
   ```
   If the server was started with `npm run dev` instead, stop it and use `npm run dev:test`. `npm run dev` uses `.env` and the main database, where `/dev/reset-db` is off, so every test fails.

The tests call `http://localhost:<SERVER_PORT>/api/v1`. They read `SERVER_PORT` from `.env.test.local`, and use 3000 if it is not set. To point them somewhere else, set `API_BASE_URL`:
```powershell
$env:API_BASE_URL = "http://localhost:3001/api/v1"; npm run test:api:books
```

> **Warning:** every test calls `POST /api/v1/dev/reset-db`, which empties the app tables and reloads `init.sql`. Never point these tests at a server whose data you want to keep.

## Run

Use a **second terminal**, or the VS Code test panel, while the server from step 4 is running. There are three ways to run the tests.

### Option A: from the repository root (whole suites)

```bash
npm run test:api:books    # all book-inventories API tests
npm run test:api          # every module under .test/
```

### Option B: `cd .test` in a terminal (one test or a group)

Inside `.test`, Vitest finds `.test/vitest.config.ts` by itself, so you don't need the `--config` flag. `npx` finds Vitest in the root `node_modules`.

```bash
cd .test
```

| Run | Command |
|---|---|
| Every API test | `npx vitest run` |
| One module (folder) | `npx vitest run book-inventories` |
| One file (one endpoint) | `npx vitest run list-books` |
| Several files | `npx vitest run create-book update-book delete-book` |
| One test, by case id | `npx vitest run -t "LIST-03"` |
| A group of cases (`-t` is a regex) | `npx vitest run -t "LIST-"` or `npx vitest run -t "LIST-0[1-5]"` |
| One case in one file (faster) | `npx vitest run list-books -t "LIST-03"` |
| Watch mode (re-runs on save) | `npx vitest book-inventories` |

A file filter matches part of the file path, so `list-books` runs `list-books.api.test.ts`. `-t` matches the full test name, which includes the `describe` text (for example `GET /books [LIST-03] ...`). Filter by case id rather than by path: `-t "GET /books"` also matches `GET /books/featured` and `GET /books/:id`.

Run `cd ..` to go back to the repository root before you use the npm scripts again.

### Option C: open `.test` as its own VS Code workspace (▶ buttons)

1. Run `npm install` once in the repository root. The `.test` workspace uses the root `node_modules`.
2. In VS Code, choose **File → New Window**, then **File → Open Folder…**, and select the `.test` folder. You can also run `code .test` from the repository root.
3. Install the **Vitest** extension if you don't have it. In this window it uses `.test/vitest.config.ts` and lists the `*.api.test.ts` files in the **Testing** panel.
4. Open a test file and click ▶ next to a `describe(...)` to run one endpoint, or next to an `it(...)` to run one case. You can also run a whole folder or file from the **Testing** panel.

Keep the server running in the **other** window, the one opened at the repository root, started with `npm run dev:test`.

---

`npm test` and `npm run test:run` still run only the unit and repository tests in `src/`, so they don't need a running server.

If the server is not reachable, or the reset route is off, the run stops before any test with one message that says why. For example:
```text
API tests cannot start against http://localhost:3000/api/v1
  ECONNREFUSED: Connection refused
  Start the main server first: npm run dev:test (with ENABLE_DB_RESET=true in .env.test.local).
```
or `POST /dev/reset-db is not mounted: start the main server with ENABLE_DB_RESET=true`.

---

## Folder structure

```
.test/
├── vitest.config.ts
├── tsconfig.json
├── helpers/
│   ├── config.ts
│   ├── client.ts
│   ├── session.ts
│   ├── assertions.ts
│   ├── dates.ts
│   ├── borrowing.ts
│   └── global-setup.ts
├── book-inventories/
│   ├── README.md
│   ├── fixtures.ts
│   └── *.api.test.ts   (9 files, one per endpoint)
├── holds/              (see holds/README.md)
└── loans/              (see loans/README.md)
```

### `.test/`: shared by every module

The files here are not specific to book-inventories. `.test/holds/` and `.test/loans/` use them too.

| File | What it holds |
|---|---|
| `vitest.config.ts` | Vitest config for the API tests only. It runs `**/*.api.test.ts`, one file at a time, with 20 s timeouts and the global setup. |
| `tsconfig.json` | Type-checking for `.test/` (`npx tsc -p .test`). The root `tsconfig.json` excludes `.test`, so `npm run build` never compiles these files. |

### `.test/helpers/`: tools the tests import

| File | Exports | Purpose |
|---|---|---|
| `config.ts` | `API_CONFIG` | Base URL, reset and login paths, cookie name, request timeout. |
| `client.ts` | `Client`, `newClient()`, `pathOf()` | `newClient()` creates a supertest agent (`request.agent(baseUrl)`) that keeps the session cookie, sends `Accept: application/json` and times out after 10 s. `pathOf()` fills and URL-encodes `:params`. |
| `session.ts` | `resetDatabase()`, `signInAs()`, `guest()`, `ACCOUNT` | Resets the data, signs in (returns a signed-in agent) or gives a guest agent, and lists the `init.sql` user accounts. |
| `assertions.ts` | `expectApiError()`, `expectValidationError()`, `expectForbidden()`, `expectUnauthorized()`, `titlesOf()` | Short checks on a supertest `Response`: the error envelope, wrong-role and no-session responses, and title order. |
| `dates.ts` | `isoDateFromToday()`, `addDays()`, `daysBetween()`, `expectDateNearToday()` | Calendar-date helpers for due dates; `expectDateNearToday()` allows ±1 day for the server's time zone. |
| `borrowing.ts` | `SEED_LOAN`, `SEED_STUDENT`, `BOOK`, `AVAILABLE_COPY`, `NEW_STUDENT`, `createStudent()`, `issueBooks()`, `placeHold()`, `copyInCatalog()` | Used by holds and loans: `init.sql` loan facts and helpers that build a borrowing state through the API. |
| `global-setup.ts` | (default export) | Runs once before every test: checks that the server and the reset route work. |

### `.test/book-inventories/`: this module

| File | What it holds |
|---|---|
| `README.md` | This file. |
| `fixtures.ts` | `init.sql` facts: `BOOK_ID`, `ISBN`, `COPY`, `COPY_ID`, and request bodies used by several tests. |

### Test files: one per endpoint

| File | Endpoint | Tests | Case ids |
|---|---|---:|---|
| `featured-books.api.test.ts` | `GET /books/featured` | 6 | FEAT-01 … 06 |
| `list-books.api.test.ts` | `GET /books` | 26 | LIST-01 … 25 |
| `book-detail.api.test.ts` | `GET /books/:id` | 8 | DETAIL-01 … 08 |
| `create-book.api.test.ts` | `POST /books` | 7 | CREATE-01 … 07 |
| `update-book.api.test.ts` | `PUT /books/:id` | 8 | UPDATE-01 … 08 |
| `delete-book.api.test.ts` | `DELETE /books/:id` | 5 | DELETE-BOOK-01 … 05 |
| `add-copy.api.test.ts` | `POST /books/:bookId/copies` | 8 | ADD-COPY-01 … 08 |
| `update-copy.api.test.ts` | `PUT /copies/:id` | 11 | UPDATE-COPY-01 … 10 |
| `delete-copy.api.test.ts` | `DELETE /copies/:id` | 7 | DELETE-COPY-01 … 07 |
| **Total** | | **86** | 84 cases |

LIST-24 and UPDATE-COPY-09 each have two tests: one for the status code and one for the known bug (see [Known bugs](#known-bugs-itfails)). That is why there are 86 tests for 84 cases.

---

## What one test does

```ts
describe("GET /books", () => {
    beforeEach(resetDatabase);                       // 1. POST /dev/reset-db → init.sql data

    it("[LIST-03] finds a title by author ...", async () => {
        const student = await signInAs("student");   // 2. POST /auth/login → agent keeps connect.sid

        const res = await student                    // 3. the request under test (supertest)
            .get("/books")
            .query({ q: "hawking" })
            .expect(200);                            //    supertest checks the status

        expect(res.body).toMatchObject({ ... });     // 4. Vitest checks the JSON body
    });
});
```

1. **Reset.** `beforeEach(resetDatabase)` gives every test the same `init.sql` data. `RESTART IDENTITY` makes ids predictable: books 1–10, copies 1–25. The numbers are in `fixtures.ts`.
2. **Sign in.** `signInAs(role, accountId?)` logs in and returns a supertest **agent** that sends the session cookie on every later request. `guest()` returns an agent with no cookie. Each agent is its own session, so agents never share cookies and a guest needs no logout.
3. **Request.** The supertest chain:

   | Step | Syntax |
   |---|---|
   | Method and path (relative to `/api/v1`) | `agent.get(path)`, `.post(path)`, `.put(path)`, `.delete(path)` |
   | Query string | `.query({ page: 2, q: "wo" })` |
   | JSON body | `.send({ title: "..." })` |
   | Expected status | `.expect(200)`: the request fails, and so does the test, when the status differs |

   `await` the chain to get the response: `res.status` is the status code, `res.body` the parsed JSON, `res.text` the raw text. supertest does **not** fail on a 4xx or 5xx status by itself. Only `.expect(...)` and network errors make it fail.
4. **Assert.**
   - A success case chains `.expect(<status>)`, then checks the body with Vitest's `expect(res.body)`.
   - An error case does not chain `.expect(...)`. It passes the response to a helper, which checks the status and the error envelope together:
     - `expectApiError(res, 409, "DUPLICATE_ISBN")` checks the error envelope and status.
     - `expectValidationError(res, "author")` checks for a 400 with `error.details["author"]`. Keys are plain field names on every endpoint, with no `body.` or `params.` prefix.
   - `toMatchObject` checks only the listed fields; arrays must have the same length.
   - `toEqual` checks the exact value.
   - `not.toHaveProperty("x")` checks that a field is absent.
   - `expect.any(String)` accepts any string.

Multi-step cases, which the Postman data wrote as `setup`, are now plain code inside the test. For example, `DELETE-BOOK-04` creates a book, deletes it (`.expect(200)`), then expects the `GET` to return 404.

Files run one after another, never in parallel, because they all reset the same database.

## Call graph

How to read the trees:
- Each line is one call. The lines under it are the calls it makes, in order.
- After `#` comes `[where the code is]` and what the call does. Paths without `src/` are in `.test/`.
- `[server …]` is the HTTP request reaching the main server, with the file in `src/` that answers it.
- A helper is drawn in full once, in [Building blocks](#building-blocks). Later trees show it as one line.

### Before the tests

Once per run:

```text
npm run test:api:books    # [package.json] vitest run --config .test/vitest.config.ts book-inventories
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

### Scenarios inside `it()`

Each tree shows one example test. The other tests of the same scenario call the same functions with other values.

#### 1. Read a list or a detail

Used by FEAT-01…03, LIST-01…11, 13…16, 18, 19, 21, 22, DETAIL-01…06.

```text
it("[LIST-02] page 2 holds the last 4 titles")           # [list-books.api.test.ts]
├── signInAs("staff")                                    # [helpers/session.ts] "student" in some cases
├── staff.get("/books").query({ page: 2 }).expect(200)   # [supertest] fails the test on another status
│   └── GET /api/v1/books?page=2                         # [server book-inventories.routes.ts] searches the catalog
├── titlesOf(res.body.data.items)                        # [helpers/assertions.ts] the titles, to check their order
└── expect(...).toEqual(...)                             # [vitest] titles and pagination
```

#### 2. Create, update or delete

Used by CREATE-01, 02, UPDATE-01…03, ADD-COPY-01…03, UPDATE-COPY-01…03, DELETE-COPY-01, 02.

```text
it("[UPDATE-COPY-01] by barcode: marks an available copy damaged")   # [update-copy.api.test.ts]
├── signInAs("staff")                                                # [helpers/session.ts]
├── copyPath(COPY.midnightAvailable)                                 # [update-copy.api.test.ts] "/copies/WB-00421"
│   └── pathOf("/copies/:id", { id })                                # [helpers/client.ts] fills and URL-encodes :id
├── staff.put(path).send({...}).expect(200)                          # [supertest] JSON body; a create uses .post(...).expect(201)
│   └── PUT /api/v1/copies/WB-00421                                  # [server book-inventories.routes.ts] updates the copy
└── expect(res.body.data.copy).toMatchObject({...})                  # [vitest] saved fields and stock summary
```

#### 3. Several requests in one test

Used by DELETE-BOOK-03, 04, DELETE-COPY-03, UPDATE-COPY-04, 05.

```text
it("[DELETE-BOOK-04] the deleted title is gone")   # [delete-book.api.test.ts]
├── signInAs("staff")                              # [helpers/session.ts]
├── createBookWithoutCopies(staff)                 # [delete-book.api.test.ts] creates NEW_BOOK, returns its _id
│   ├── staff.post("/books").send(NEW_BOOK)        # [supertest] setup request
│   │   └── POST /api/v1/books                     # [server book-inventories.routes.ts] creates the title
│   └── expect(res.status, message).toBe(201)      # [vitest] setup check; the message shows the body
├── staff.delete(`/books/${id}`).expect(200)       # [supertest] setup request
│   └── DELETE /api/v1/books/:id                   # [server book-inventories.routes.ts] deletes the title
├── staff.get(`/books/${id}`)                      # [supertest] the request under test, no .expect
│   └── GET /api/v1/books/:id                      # [server book-inventories.routes.ts] answers 404
└── expectApiError(res, 404, "BOOK_NOT_FOUND")     # [helpers/assertions.ts] (see scenario 4)
```

#### 4. Error response (403, 404, 409)

Used by CREATE-03, 07, UPDATE-04, 05, 08, DELETE-BOOK-01, 02, 05, ADD-COPY-04, 05, 08, UPDATE-COPY-06, 07, 10, DELETE-COPY-04…07, DETAIL-07, 08, LIST-25.

```text
it("[CREATE-03] a duplicate ISBN is a conflict")   # [create-book.api.test.ts]
├── signInAs("staff")                              # [helpers/session.ts] "admin" or "student" in a 403 case
├── staff.post("/books").send({...})               # [supertest] no .expect: a 4xx does not fail by itself
│   └── POST /api/v1/books                         # [server book-inventories.routes.ts] answers 409 (403 from the role guard)
├── expectApiError(res, 409, "DUPLICATE_ISBN")     # [helpers/assertions.ts] status and error envelope
│   ├── expect(res.status).toBe(409)               # [vitest]
│   └── expect(res.body).toMatchObject({...})      # [vitest] { success: false, error: { code } }
└── expect(res.body.error.message).toBe(...)       # [vitest] exact message, only in some cases
```

#### 5. Validation error (400)

Used by FEAT-04, 05, LIST-12, 17, 20, 23, CREATE-04…06, UPDATE-06, 07, ADD-COPY-06, 07, UPDATE-COPY-08.

```text
it("[CREATE-04] a blank title is rejected")                      # [create-book.api.test.ts]
├── signInAs("staff")                                            # [helpers/session.ts]
├── staff.post("/books").send({ ...WILD_ROBOT, title: "   " })   # [supertest] an invalid body (or .query() for GET)
│   └── POST /api/v1/books                                       # [server book-inventories.controller.ts] the Zod check fails, 400
└── expectValidationError(res, "title")                          # [helpers/assertions.ts] 400 with a message for that field
    ├── expectApiError(res, 400, "VALIDATION_ERROR")             # [helpers/assertions.ts] (see scenario 4)
    └── expect(details).toHaveProperty(["title"])                # [vitest] error.details.title is a string
```

#### 6. No session (401)

Used by LIST-24, UPDATE-COPY-09, FEAT-06.

```text
it("[LIST-24] a guest gets 401 UNAUTHORIZED")                    # [list-books.api.test.ts]
├── guest().get("/books").expect(401)                            # [supertest] a request without a cookie
│   ├── guest()                                                  # [helpers/session.ts]
│   └── GET /api/v1/books                                        # [server verification.middleware.ts] no session, 401
└── expect(res.body.error.code).toBe("UNAUTHORIZED")             # [vitest]
it.fails("[LIST-24] the 401 body uses the error envelope ...")   # [list-books.api.test.ts] known bug, see below
├── guest().get("/books")                                        # [supertest] the same request, no .expect
│   ├── guest()                                                  # [helpers/session.ts]
│   └── GET /api/v1/books                                        # [server verification.middleware.ts] the 401 body has no success: false
└── expectApiError(res, 401, "UNAUTHORIZED")                     # [helpers/assertions.ts] fails today, as it.fails expects
```

### Which file imports which

```
vitest.config.ts ··· (by path) ··········> helpers/global-setup.ts

helpers/global-setup.ts ──> helpers/session.ts
                        └─> helpers/config.ts

helpers/session.ts ───────> helpers/client.ts ──> supertest
                        │                     └─> helpers/config.ts
                        └─> helpers/config.ts

helpers/assertions.ts ────> vitest (expect)
                        └─> supertest (type Response only)

book-inventories/*.api.test.ts
  ├─> vitest (describe, it, beforeEach, expect)
  ├─> helpers/session.ts       resetDatabase, signInAs, guest, ACCOUNT
  ├─> helpers/assertions.ts    expectApiError, expectValidationError, titlesOf
  ├─> helpers/client.ts        pathOf (copy tests), type Client (delete-book)
  └─> book-inventories/fixtures.ts   BOOK_ID, ISBN, COPY, COPY_ID, NEW_BOOK, ...
```

`config.ts` reads `SERVER_PORT` from `.env.test.local` when it is first imported. Any module that imports it gets the same `API_CONFIG.baseUrl`.

## Known bugs (`it.fails`)

Three checks fail today because of real bugs, so they are written with `it.fails`. Vitest reports them as passing while they still fail. Once a bug is fixed, Vitest reports the test as failing, which reminds you to change `it.fails` back to `it`.

| Test | Bug |
|---|---|
| `[FEAT-06]` a guest gets 200 | The contract says `/books/featured` is public, but `server.ts` puts the whole `/books` router behind `verificationMiddleware`, so a guest gets 401. |
| `[LIST-24]` 401 body has `success: false` | `verificationMiddleware` sends the `AppError` object, which has no `success` field. |
| `[UPDATE-COPY-09]` 401 body has `success: false` | Same cause as LIST-24. |

The status-code half of LIST-24 and UPDATE-COPY-09 is a normal `it`. It passes today, so a change in the status code would still be caught.

## Adding a test

1. Pick the file for the endpoint, or create `<name>.api.test.ts` for a new one, with `beforeEach(resetDatabase)`.
2. Name the test `"[ID] what it checks"`.
3. Get an agent with `signInAs(role)` or `guest()`, then build the request with supertest: `.get/.post/.put/.delete(path)`, `.query({...})`, `.send({...})`, and `.expect(status)` for a success case.
4. Put `init.sql` facts in `fixtures.ts` instead of repeating literal ids.
5. Use `pathOf("/copies/:id", { id })` when an id may contain characters that need URL-encoding.
6. If a test needs data that `init.sql` does not have, create it through the API inside the test, as `createBookWithoutCopies()` does in `delete-book.api.test.ts`. That keeps the test independent of other tests.
