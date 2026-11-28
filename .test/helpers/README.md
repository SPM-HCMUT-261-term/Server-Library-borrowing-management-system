# `.test/helpers/`: file dependencies

This folder holds the code that the API tests share. This page answers two questions:

1. Inside `helpers/`, which file imports which?
2. Outside `helpers/`, which test file uses which helper, and which exports does it use?

It was built from the `import` lines of every `.ts` file under `.test/`. Update it when an import changes.

## 1. Inside `helpers/`

### Dependency graph

An arrow `A ──► B` means "A imports B". A dotted arrow `┄┄►` is a type-only import (`import type`), which disappears at runtime.

```
 global-setup.ts                     borrowing.ts
   │       │                          │      │      ┊
   │       └──────────► session.ts ◄──┘      │      ┊ type Client
   │                     │       │           ▼      ┊
   │                     │       │       dates.ts   ┊
   │                     │       ▼                  ┊
   │                     │    client.ts ◄┄┄┄┄┄┄┄┄┄┄┄┘
   │                     │       │
   ▼                     ▼       ▼
 ┌──────────────────────────────────┐
 │            config.ts             │
 └──────────────────────────────────┘

 assertions.ts          (imports nothing from helpers/)
```

There are no cycles. Read the graph bottom-up: `config.ts` knows nothing about the other files, and `global-setup.ts` and `borrowing.ts` sit on top.

### Per file

| Level | File | Imports from `helpers/` | Other imports | Exports |
| :-: | :--- | :--- | :--- | :--- |
| 0 | `config.ts` | none | `node:fs`, `node:path`, `node:url` | `API_CONFIG` |
| 0 | `dates.ts` | none | `vitest` (`expect`) | `isoDateFromToday`, `addDays`, `daysBetween`, `expectDateNearToday` |
| 0 | `assertions.ts` | none | `vitest` (`expect`), `supertest` (type `Response`) | `expectApiError`, `expectValidationError`, `expectForbidden`, `expectUnauthorized`, `titlesOf` |
| 1 | `client.ts` | `config.ts` → `API_CONFIG` | `supertest` (`request`, type `Agent`) | type `Client`, `newClient`, `pathOf` |
| 2 | `session.ts` | `client.ts` → `newClient`, type `Client`<br>`config.ts` → `API_CONFIG` | `supertest` (type `Response`) | type `Role`, `ACCOUNT`, `DEFAULT_PASSWORD`, `resetDatabase`, `guest`, `signInAs` |
| 3 | `global-setup.ts` | `session.ts` → `resetDatabase`<br>`config.ts` → `API_CONFIG` | none | `default` (the setup function) |
| 3 | `borrowing.ts` | `session.ts` → `signInAs`, `DEFAULT_PASSWORD`<br>`dates.ts` → `isoDateFromToday`<br>`client.ts` → type `Client` | `vitest` (`expect`) | types `SeedStudent`, `NewStudent`; `SEED_STUDENT`, `NEW_STUDENT`, `OTHER_STUDENT`, `BOOK`, `AVAILABLE_COPY`, `SEED_LOAN`, `SEED_ACTIVE_LOANS_BY_DUE_DATE`, `UNKNOWN_HOLD`, `UNKNOWN_LOAN`, `UNKNOWN_COPY`, `UNKNOWN_STUDENT`, `HOLD_CODE`, `BORROW_CODE`, `createStudent`, `issueBooks`, `placeHold`, `copyInCatalog` |

"Level" is the length of the longest import chain below the file. A file only imports files on a lower level.

### What each file is for

| File | Role |
| :--- | :--- |
| `config.ts` | The one place that knows the server address: `API_CONFIG.baseUrl` (from `API_BASE_URL`, or `SERVER_PORT` in `.env.test.local`, or 3000), the reset and login paths, the cookie name and the request timeout. |
| `client.ts` | Wraps supertest. `newClient()` returns a `request.agent(baseUrl)`, which is one browser-like session that keeps the `connect.sid` cookie. `pathOf()` fills `:params` and URL-encodes them. |
| `session.ts` | Session helpers built on `client.ts`: `resetDatabase()` (`POST /dev/reset-db`), `guest()` (an agent with no cookie), `signInAs(role, accountId?)` (logs in and returns the agent). `ACCOUNT` lists the `init.sql` accounts. |
| `assertions.ts` | Short `expect` checks for the error envelope: `expectApiError`, `expectValidationError`, `expectForbidden` (403), `expectUnauthorized` (401). `titlesOf` lists titles for order checks. |
| `dates.ts` | Calendar-date helpers for due dates. `expectDateNearToday` allows ±1 day for the server's time zone. |
| `borrowing.ts` | Holds and loans only: `init.sql` facts (students, books, available copies, seeded loans) and helpers that build a state through the API (`createStudent` via the admin module, `issueBooks`, `placeHold`, `copyInCatalog`). |
| `global-setup.ts` | Runs once before any test file. It calls `resetDatabase()`; if that fails, it stops the whole run with one clear message. |

### Rules that keep this graph working

- **Keep `config.ts`, `dates.ts` and `assertions.ts` free of imports from `helpers/`.** Anything can then import them without a cycle.
- **`global-setup.ts` must only reach files that don't call `expect()`.** It runs once in Vitest's main process, outside any test. Today its chain is `session.ts` → `client.ts` → `config.ts`, and none of those import `vitest`. Don't make it import `assertions.ts`, `dates.ts` or `borrowing.ts`.
- **`borrowing.ts` is the only helper that sends requests other than login and reset** (`/admin/users`, `/staff/loans/issue`, `/holds`, `/books/:id`). It calls `expect()` on its own setup requests, so a setup step that fails shows a clear message in the test that used it.
- **Helpers never import test files** (`*.api.test.ts`) or module fixtures (`book-inventories/fixtures.ts`).

## 2. Outside `helpers/`

### Who loads what

| Outside file | Uses | How |
| :--- | :--- | :--- |
| `.test/vitest.config.ts` | `global-setup.ts` | by path, `globalSetup: ["./helpers/global-setup.ts"]` (not an `import`) |
| `.test/tsconfig.json` | every `helpers/*.ts` | type-checking only (`include: ["./**/*.ts"]`) |
| `book-inventories/fixtures.ts` | nothing | it has its own `init.sql` facts and imports no helper |
| every `*.api.test.ts` | see below | `import … from "../helpers/<file>.js"` |

### Summary: helper files per test folder

| Test folder | `session.ts` | `assertions.ts` | `client.ts` | `dates.ts` | `borrowing.ts` |
| :--- | :-: | :-: | :-: | :-: | :-: |
| `book-inventories/` (9 files) | 9 | 9 | 3 | – | – |
| `holds/` (4 files) | 4 | 4 | 1 | 1 | 4 |
| `loans/` (8 files) | 8 | 8 | 6 | 7 | 8 |

The numbers are how many files in that folder import the helper. `config.ts` and `global-setup.ts` are never imported by a test file.

### Per export

The file names below drop the `.api.test.ts` suffix. **bi** = `book-inventories/`, **holds** = `holds/`, **loans** = `loans/`.

#### `session.ts`

| Export | Used by |
| :--- | :--- |
| `resetDatabase` | every test file (`beforeEach(resetDatabase)`), and `global-setup.ts` |
| `signInAs` | every test file, and `borrowing.ts` |
| `guest` | bi: `featured-books`, `list-books`, `update-copy` · holds: all 4 · loans: all 8 |
| `ACCOUNT` | bi: `book-detail` · loans: `find-student` |
| `DEFAULT_PASSWORD` | only `borrowing.ts` (the password of the students it creates) |
| type `Role` | not imported anywhere (used in `signInAs`'s signature) |

#### `assertions.ts`

| Export | Used by |
| :--- | :--- |
| `expectApiError` | bi: all except `featured-books` · holds: `cancel-hold`, `create-hold`, `hold-expiry` · loans: all except `my-borrowing` |
| `expectValidationError` | bi: `add-copy`, `create-book`, `featured-books`, `list-books`, `update-book`, `update-copy` |
| `expectForbidden` | holds: `cancel-hold`, `create-hold`, `staff-holds` · loans: all 8 |
| `expectUnauthorized` | holds: `cancel-hold`, `create-hold`, `staff-holds` · loans: all 8 |
| `titlesOf` | bi: `featured-books`, `list-books` |

The book-inventories tests check 401 and 403 with `expectApiError`, because their codes are known (`UNAUTHORIZED`, `FORBIDDEN_ACCESS`). The holds and loans tests use `expectForbidden` / `expectUnauthorized`, because the contract gives no code for those cases.

#### `client.ts`

| Export | Used by |
| :--- | :--- |
| `pathOf` | bi: `delete-copy`, `update-copy` · loans: `active-loan-by-copy`, `checkout-check`, `issue-books`, `return-book` |
| type `Client` | bi: `delete-book` · holds: `staff-holds` · loans: `loan-records`, `renew-loan` (the type of a helper's parameter), and `session.ts`, `borrowing.ts` |
| `newClient` | only `session.ts`; tests get agents from `signInAs()` / `guest()` instead |

#### `dates.ts`

| Export | Used by |
| :--- | :--- |
| `isoDateFromToday` | loans: `active-loan-by-copy`, `issue-books`, `loan-records`, `my-borrowing`, `renew-loan`, and `borrowing.ts` (default due date of `issueBooks`) |
| `addDays` | loans: `my-borrowing`, `renew-loan` |
| `daysBetween` | loans: `active-loan-by-copy`, `my-borrowing` |
| `expectDateNearToday` | holds: `create-hold` · loans: `active-loan-by-copy`, `checkout-check`, `issue-books`, `my-borrowing`, `return-book` |

#### `borrowing.ts`

Only the holds and loans tests import it.

| Export | Used by |
| :--- | :--- |
| `createStudent` | holds: all 4 · loans: all except `return-book` |
| `issueBooks` | holds: all 4 · loans: `active-loan-by-copy`, `find-student`, `issue-books`, `loan-records`, `my-borrowing`, `renew-loan` |
| `placeHold` | holds: all 4 · loans: `checkout-check`, `find-student`, `issue-books`, `my-borrowing` |
| `copyInCatalog` | holds: `cancel-hold`, `create-hold`, `hold-expiry` · loans: `issue-books`, `return-book` |
| `NEW_STUDENT` | holds: all 4 · loans: all except `return-book` |
| `OTHER_STUDENT` | holds: all 4 · loans: `checkout-check`, `issue-books`, `renew-loan` |
| `SEED_STUDENT` | holds: `create-hold` · loans: all 8 |
| `BOOK` | holds: all 4 · loans: `active-loan-by-copy`, `checkout-check`, `find-student`, `issue-books`, `my-borrowing` |
| `AVAILABLE_COPY` | holds: all 4 · loans: all except `return-book` |
| `SEED_LOAN` | loans: all except `find-student` |
| `SEED_ACTIVE_LOANS_BY_DUE_DATE` | loans: `loan-records` |
| `UNKNOWN_HOLD` | holds: `cancel-hold` |
| `UNKNOWN_LOAN` | loans: `renew-loan`, `return-book` |
| `UNKNOWN_COPY` | loans: `active-loan-by-copy`, `checkout-check` |
| `UNKNOWN_STUDENT` | loans: `find-student` |
| `HOLD_CODE` | holds: `create-hold`, `staff-holds` · loans: `find-student`, `my-borrowing` |
| `BORROW_CODE` | loans: `issue-books`, `my-borrowing` |
| types `SeedStudent`, `NewStudent` | not imported outside `borrowing.ts` |

### Exports no test imports

These exports are only used inside `helpers/`. They are exported so another helper can use them, not because tests need them:

| Export | Used inside `helpers/` by |
| :--- | :--- |
| `API_CONFIG` (`config.ts`) | `client.ts`, `session.ts`, `global-setup.ts` |
| `newClient` (`client.ts`) | `session.ts` |
| `DEFAULT_PASSWORD` (`session.ts`) | `borrowing.ts` |
| type `Role` (`session.ts`) | `session.ts` itself |
| types `SeedStudent`, `NewStudent` (`borrowing.ts`) | `borrowing.ts` itself |

## 3. Adding a helper

1. Put it in the lowest level it can live on. A pure function with no request goes in a level-0 file, or a new file that imports nothing from `helpers/`.
2. If it sends requests, build it on `signInAs()` / `guest()` from `session.ts`, as `borrowing.ts` does, rather than calling `newClient()` directly.
3. If it is used by only one module's tests, put it in that module's folder (like `book-inventories/fixtures.ts`), not here.
4. Update the graph and tables on this page.
