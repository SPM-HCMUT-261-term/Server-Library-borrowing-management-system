# Book-inventories API tests

These are end-to-end tests for the 9 book-inventories endpoints. Each test sends **real HTTP requests** to the main server, which you start yourself, and checks the responses with Vitest.

They follow the same pattern as the repository tests in `src/modules/*/repositories/*.test.ts`:
- `describe` per endpoint;
- `beforeEach` resets the data;
- each `it` arranges, sends one request, and asserts with `expect(...)`.

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

If the server is not reachable, or the reset route is off, the run stops before any test with one message that says why. For example: `ECONNREFUSED (is the main server running? npm run dev:test)`, or `POST /dev/reset-db is not mounted: start the main server with ENABLE_DB_RESET=true`.

---

## Folder structure

```
.test/
├── vitest.config.ts
├── tsconfig.json
├── helpers/
│   ├── config.ts
│   ├── api-client.ts
│   ├── session.ts
│   ├── assertions.ts
│   └── global-setup.ts
└── book-inventories/
    ├── README.md
    ├── fixtures.ts
    └── *.api.test.ts   (9 files, one per endpoint)
```

### `.test/`: shared by every module

The files here are not specific to book-inventories. Later modules such as `.test/holds/` and `.test/loans/` reuse them.

| File | What it holds |
|---|---|
| `vitest.config.ts` | Vitest config for the API tests only. It runs `**/*.api.test.ts`, one file at a time, with 20 s timeouts and the global setup. |
| `tsconfig.json` | Type-checking for `.test/`. The root `tsconfig.json` excludes `.test`, so `npm run build` never compiles these files. |

### `.test/helpers/`: tools the tests import

| File | Exports | Purpose |
|---|---|---|
| `config.ts` | `API_CONFIG` | Base URL, reset and login paths, cookie name, request timeout. |
| `api-client.ts` | `ApiClient`, `pathOf()` | Sends requests with `fetch` and keeps the session cookie. `pathOf()` fills and URL-encodes `:params`. |
| `session.ts` | `resetDatabase()`, `signInAs()`, `guest()`, `ACCOUNT` | Resets the data, signs in or out, and lists the `init.sql` user accounts. |
| `assertions.ts` | `expectApiError()`, `expectValidationError()`, `titlesOf()` | Short checks for the error envelope and for title order. |
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
        const student = await signInAs("student");   // 2. POST /auth/login → keeps connect.sid

        const res = await student.get("/books", {    // 3. the request under test
            query: { q: "hawking" }
        });

        expect(res.status).toBe(200);                // 4. assertions on status and JSON body
        expect(res.body).toMatchObject({ ... });
    });
});
```

1. **Reset.** `beforeEach(resetDatabase)` gives every test the same `init.sql` data. `RESTART IDENTITY` makes ids predictable: books 1–10, copies 1–25. The numbers are in `fixtures.ts`.
2. **Sign in.** `signInAs(role, accountId?)` logs in and returns an `ApiClient` that sends the session cookie on every request. `guest()` returns a client with no cookie. Each client is its own session, so clients never share cookies and a guest needs no logout.
3. **Request.** `client.get / post / put / delete(path, body?, { query, headers })`. `res.body` is the parsed JSON, `res.text` the raw text, `res.status` the status code.
4. **Assert.**
   - `toMatchObject` checks only the listed fields; arrays must have the same length.
   - `toEqual` checks the exact value.
   - `not.toHaveProperty("x")` checks that a field is absent.
   - `expect.any(String)` accepts any string.
   - Helpers:
     - `expectApiError(res, 409, "DUPLICATE_ISBN")` checks the error envelope and status.
     - `expectValidationError(res, "author")` checks for a 400 with `error.details["author"]`. Keys are plain field names on every endpoint, with no `body.` or `params.` prefix.

Multi-step cases, which the Postman data wrote as `setup`, are now plain code inside the test. For example, `DELETE-BOOK-04` creates a book, deletes it, then expects the `GET` to return 404.

Files run one after another, never in parallel, because they all reset the same database.

## Call graph (temporary)

> Temporary section, for understanding the code. Delete it when it is no longer needed.

### What runs, in order

```
npm run test:api:books
└─ vitest run --config .test/vitest.config.ts book-inventories
   │
   ├─ 1. globalSetup: helpers/global-setup.ts → setup()                  once per run
   │     └─ resetDatabase()                                              helpers/session.ts
   │          └─ new ApiClient().post("/dev/reset-db")                   helpers/api-client.ts
   │               └─ request()                                          (see "Inside ApiClient.request" below)
   │     on error → throws "API tests cannot start against <url> ..." → the run stops
   │
   └─ 2. for each *.api.test.ts, one file at a time (fileParallelism: false)
         └─ describe("<METHOD> <path>")
              │
              ├─ beforeEach → resetDatabase()                            before every it()
              │                 └─ ApiClient.post("/dev/reset-db") → request()
              │
              └─ it("[ID] ...")
                   ├─ a. who sends the request
                   │     ├─ signInAs(role, accountId?)                   helpers/session.ts
                   │     │    ├─ new ApiClient()
                   │     │    ├─ client.post("/auth/login", { accountId, password, role }) → request()
                   │     │    └─ checks status 200 and client.sessionCookie, otherwise throws
                   │     └─ or guest() → new ApiClient()                 no cookie
                   │
                   ├─ b. optional preparation inside the test
                   │     e.g. createBookWithoutCopies(staff)             delete-book.api.test.ts
                   │          └─ staff.post("/books", NEW_BOOK) → request()
                   │
                   ├─ c. the request under test
                   │     client.get | post | put | delete(path, body?, { query })
                   │       └─ request()
                   │     path = `/books/${BOOK_ID.x}`, or pathOf("/copies/:id", { id })    helpers/api-client.ts
                   │
                   └─ d. assertions
                         ├─ expect(res.status) / expect(res.body)...      vitest
                         ├─ expectApiError(res, status, code)             helpers/assertions.ts
                         ├─ expectValidationError(res, field)
                         │    └─ expectApiError(res, 400, "VALIDATION_ERROR") + details[field]
                         └─ titlesOf(items)
```

### Inside `ApiClient.request()`

```
request(method, path, body?, { query, headers })
├─ new URL(baseUrl + path), add each query key        baseUrl = API_CONFIG.baseUrl (config.ts)
├─ headers: Accept, Cookie (if signed in), Content-Type (if body)
├─ fetch(url, { method, headers, body: JSON, signal: AbortSignal.timeout(10 s) })
│    └─ on network error / timeout → describeFetchError() → throw Error("<METHOD> <url> failed: ...")
├─ #rememberSessionCookie(response)                   keeps "connect.sid=..." from Set-Cookie
├─ response.text() → parseJson()                      undefined when empty or not JSON
└─ returns { status, headers, body, text }
```

### Which file imports which

```
vitest.config.ts ··· (by path) ··········> helpers/global-setup.ts

helpers/global-setup.ts ──> helpers/session.ts
                        └─> helpers/config.ts

helpers/session.ts ───────> helpers/api-client.ts ──> helpers/config.ts
                        └─> helpers/config.ts

helpers/assertions.ts ────> vitest (expect)
                        └─> helpers/api-client.ts (type ApiResponse only)

book-inventories/*.api.test.ts
  ├─> vitest (describe, it, beforeEach, expect)
  ├─> helpers/session.ts       resetDatabase, signInAs, guest, ACCOUNT
  ├─> helpers/assertions.ts    expectApiError, expectValidationError, titlesOf
  ├─> helpers/api-client.ts    pathOf (copy tests), type ApiClient (delete-book)
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
3. Put `init.sql` facts in `fixtures.ts` instead of repeating literal ids.
4. Use `pathOf("/copies/:id", { id })` when an id may contain characters that need URL-encoding.
5. If a test needs data that `init.sql` does not have, create it through the API inside the test, as `createBookWithoutCopies()` does in `delete-book.api.test.ts`. That keeps the test independent of other tests.
