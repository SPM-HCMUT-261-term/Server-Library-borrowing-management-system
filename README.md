# Library Borrowing Management System

Backend service for the Westbridge School library borrowing management system,
written in TypeScript with Express 5 and PostgreSQL.

## Contents

1. [Features](#features)
2. [Technology stack](#technology-stack)
3. [Project structure](#project-structure)
4. [Getting started](#getting-started)
   - [Step 1: Install prerequisites](#step-1-install-prerequisites)
   - [Step 2: Install dependencies](#step-2-install-dependencies)
   - [Step 3: Create the environment files](#step-3-create-the-environment-files)
   - [Step 4: Start the databases](#step-4-start-the-databases)
   - [Step 5: Prepare the main database](#step-5-prepare-the-main-database)
   - [Step 6: Prepare the test database](#step-6-prepare-the-test-database)
   - [Step 7: Run the server](#step-7-run-the-server)
5. [Demo accounts](#demo-accounts)
6. [Testing](#testing)
7. [Database operations cheat sheet](#database-operations-cheat-sheet)
8. [HTTP API](#http-api)
9. [Database model](#database-model)
10. [Troubleshooting](#troubleshooting)
11. [Known limitations](#known-limitations)

---

## Features

- Login with `accountId`, password, and role, using PostgreSQL-backed
  session cookies.
- Current-user profile and logout.
- User administration (list, create, update, reset password, delete), restricted
  to administrators.
- Book catalog and physical-copy management (list, detail, featured, create,
  update, delete, add/update/delete copies), restricted by role.
- Student holds (place, cancel) and the staff list of holds.
- Loans: the student "My borrowing" dashboard and online renewal, and the staff
  counter (find student, check copy, issue books, find and return a loan, loan records).
- Zod request validation and a uniform JSON response envelope.
- A development-only endpoint that resets the database to the demo data.

Every endpoint is described in [doc/API_Contract.md](doc/API_Contract.md).

## Technology stack

| Area | Tool |
|---|---|
| Runtime / language | Node.js, TypeScript (ESM) |
| Web framework | Express 5 |
| Database | PostgreSQL 18 (Docker), driver `pg` |
| Sessions | `express-session` + `connect-pg-simple` |
| Validation | Zod |
| Dev runner | `tsx` |
| Tests | Vitest |
| Local databases | Docker Compose |

---

## Project structure

### Top level

```text
.
├── docker-compose.yml     Main DB (port 5432, persistent) + test DB (port 5433, in-memory)
├── .env.example           List of the environment variables
├── package.json           npm scripts
├── tsconfig.json          Compiles only src/ into dist/
├── vitest.config.ts       Config for the unit/repository tests in src/
├── doc/
│   └── API_Contract.md    Endpoint contract: request, response, business rules, error codes
├── .test/                 API tests: real HTTP calls (supertest) to a running server
│   ├── vitest.config.ts
│   ├── tsconfig.json
│   ├── helpers/           supertest agent, login/session, reset-db setup, assertions, date and borrowing helpers
│   ├── book-inventories/  One *.api.test.ts per endpoint, fixtures.ts, README (setup, run options, helpers)
│   ├── holds/             One *.api.test.ts per endpoint, README (cases, test data, contract gaps)
│   └── loans/             One *.api.test.ts per endpoint, README (cases, test data, contract gaps)
├── src/                   Application source (see below)
└── dist/                  Build output of `npm run build` (generated, not committed)
```

### Inside `src/`

```text
src/
├── server.ts              Entry point: builds the Express app, mounts routes, starts the server
├── app.ts                 Not used (fully commented out)
├── setup.test.ts          Loads .env.test.local for Vitest
│
├── modules/               One folder per feature
│   ├── auth/              Login, current user, logout
│   ├── admin/             User account administration
│   ├── book-inventories/  Books and physical copies
│   ├── holds/             Place and cancel holds, staff list of holds
│   ├── loans/             My borrowing, renew, checkout, return, records
│   └── dev-tools/         POST /dev/reset-db, X-Session-Cookie header (only when ENABLE_DB_RESET=true)
│
└── shared/
    ├── database/
    │   ├── db.ts          Shared pg connection pool
    │   ├── schema.sql     ① Creates tables, indexes and the stock view
    │   ├── init.sql       ② Inserts the demo data (run after schema.sql)
    │   ├── reset-data.sql Empties every app table
    │   ├── drop-all.sql   Drops every app table and the view
    │   └── init.seed.ts   At startup: creates admin ADM001 if `users` is empty
    ├── middlewares/
    │   ├── session.middleware.ts       express-session with the PostgreSQL session store
    │   └── verification.middleware.ts  "Is logged in" check, used in front of every router
    └── utils/
        ├── errors.util.ts              AppError class (used by verification.middleware.ts)
        └── password.util.ts            Password helpers (plain text for now)
```

### Inside one module

The feature modules (`auth`, `admin`, `book-inventories`, `holds`, `loans`)
share the same layers:

```text
src/modules/<name>/
├── <name>.routes.ts            URL → role guard → controller function
├── <name>.controller.ts        Role guards (requireStaff, ...), Zod validation, error code → HTTP status, JSON
├── <name>.service.ts           Business rules; throws errors with a `code`
├── <name>.entity.ts            Types the repository returns to the service
├── <name>.dto.ts               Request/response types (auth, admin, book-inventories only)
└── repositories/
    ├── <name>.repository.interface.ts
    ├── <name>.repository.ts            Raw parameterized SQL with pg
    ├── <name>.repository.test.ts       Repository tests (run against the test DB)
    └── <name>.repository.seed.test.ts  Seed data for those tests, no test cases (auth, admin only)
```

Exceptions to the names above:

- `holds` spells two files `respository`: `holds.respository.ts` and
  `holds.respository.test.ts`. `book-inventories` does the same for its test file,
  `book-inventories.respository.test.ts`.
- `loans` has one repository file holding four classes: `LoansRepositoryImpl`,
  `BorrowersRepositoryImpl`, `LoanCopiesRepositoryImpl`, `LoanHoldsRepositoryImpl`.
- `dev-tools` has no layers: only `dev-tools.routes.ts` and
  `dev-session-header.middleware.ts`.

A request goes in through the layers, and the response comes back the other way:

```text
Request
client ─(sends request)→ HTTP request → server.ts → routes → controller → service → repository → PostgreSQL

Response
client ←(receives response)─ HTTP response ←(JSON)─ controller ←(DTO)─ service ←(entity)─ repository ←(raw rows)─ PostgreSQL
```

| Step | Request (going in) | Response (coming back) |
|---|---|---|
| `server.ts` | CORS, JSON body parser, session, then `verificationMiddleware` (is the user logged in?); picks the router by URL prefix | |
| routes | Role guard (`requireStaff`, ...), then calls the controller function | |
| controller | Validates params, query and body with Zod, calls the service | Sends the JSON envelope `{ success, data }` with the HTTP status |
| service | Applies the business rules, calls the repository | Builds the response data (DTO) from the entities |
| repository | Runs parameterized SQL | Turns the raw `pg` rows into entities (`<name>.entity.ts`) |

The response does not pass back through routes: the controller sends it
directly with `res.status(...).json(...)`.

When a rule fails, the service throws an error with a `code` (for example
`HOLD_NOT_FOUND`). The controller maps that code to an HTTP status and sends
`{ success: false, error: { code, message } }` instead.

---

## Getting started

The project uses **two separate PostgreSQL databases**. Both are started by
Docker Compose and grouped under the Compose project `hcmut-261-spm-dbs`, which
is the group name Docker Desktop shows.

| | Main database | Test database |
|---|---|---|
| Compose service | `db` | `test-db` |
| Container name | `hcmut-261-spm-db-main` | `hcmut-261-spm-db-test` |
| Host port | `5432` | `5433` |
| User / password | `postgres` / `main` | `postgres` / `test` |
| Database name | `library-borrowing-system-hcmut-spm-261` | `test-library-borrowing-system-hcmut-spm-261` |
| Env file | `.env` | `.env.test.local` |
| Used by | `npm run dev`, `npm start` | `npm run dev:test`, `npm run test:run`, `npm run test:api` |
| Data storage | Docker volume `db-data`, **kept** | tmpfs (memory), **lost on every stop** |

### Step 1: Install prerequisites

- [Node.js](https://nodejs.org/) (a version that supports `--env-file`, 20.6 or newer)
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
- Optional: [pgAdmin](https://www.pgadmin.org/) to browse the databases, and
  the **Vitest** extension for VS Code to run tests from the editor

### Step 2: Install dependencies

```bash
npm install
```

### Step 3: Create the environment files

Create **two** files in the repository root. Both are in `.gitignore`, so never
commit them.

**`.env`**: for normal runs (`npm run dev`, `npm start`), points at the main database:

```dotenv
SERVER_PORT=3000

DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=main
DB_NAME=library-borrowing-system-hcmut-spm-261

SESSION_SECRET_KEY=replace-with-a-long-random-string

ENABLE_DB_RESET=false
```

**`.env.test.local`**: for testing (`npm run dev:test`, Vitest), points at the test database:

```dotenv
SERVER_PORT=3000

DB_HOST=localhost
DB_PORT=5433
DB_USER=postgres
DB_PASSWORD=test
DB_NAME=test-library-borrowing-system-hcmut-spm-261

SESSION_SECRET_KEY=replace-with-another-long-random-string

ENABLE_DB_RESET=true
```

| Variable | Meaning |
|---|---|
| `SERVER_PORT` | Port of the Express server. The API tests read it from `.env.test.local`. |
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | PostgreSQL connection. Must match `docker-compose.yml`. |
| `SESSION_SECRET_KEY` | Secret used to sign the session cookie. |
| `ENABLE_DB_RESET` | `true` mounts `POST /api/v1/dev/reset-db`, which **wipes and reseeds** the database. Keep it `false` in `.env`. |

Generate a random secret with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

> [!IMPORTANT]
> Keep **every value on one line**. Docker Compose also reads `.env`. A value
> split over several lines (for example a pasted key) makes every
> `docker compose` command fail with `unexpected character ... in variable name`.

### Step 4: Start the databases

```bash
docker compose up -d --wait            # both databases
# or only one of them:
docker compose up -d --wait db         # main
docker compose up -d --wait test-db    # test
```

`--wait` returns once PostgreSQL accepts connections. Check the state with
`docker compose ps`.

The containers **do not create the tables by themselves**. Follow Step 5 and
Step 6.

### Step 5: Prepare the main database

Run these **once**, the first time the main database starts (and again only
after you delete its volume). Run them **in this order**: `schema.sql` first,
then `init.sql`.

```bash
# ① create tables, indexes, view
docker compose exec db psql -U postgres -d library-borrowing-system-hcmut-spm-261 -v ON_ERROR_STOP=1 -f /sql/schema.sql

# ② insert demo data
docker compose exec db psql -U postgres -d library-borrowing-system-hcmut-spm-261 -v ON_ERROR_STOP=1 -f /sql/init.sql
```

These commands work the same in PowerShell, Git Bash, and macOS/Linux shells.
`docker-compose.yml` mounts `src/shared/database/` into each container at `/sql`.

> [!NOTE]
> Run `init.sql` **before** the first `npm run dev`. When the `users` table is
> empty, the server creates a fallback admin `ADM001` with password `123456`.
> `init.sql` then skips `ADM001` because it already exists, and you end up with
> a different admin password than the one listed in [Demo accounts](#demo-accounts).

The main database keeps its data across `docker compose stop`, `restart`,
`down`, and computer reboots. Only `docker compose down -v` deletes it.

> [!NOTE]
> The container creates the user `postgres` and the database
> `library-borrowing-system-hcmut-spm-261` only the first time its volume is
> created. If you started `db` before with another user or database name, run
> `docker compose down -v`, start it again, and repeat this step.

### Step 6: Prepare the test database

> [!WARNING]
> **Stopping the test database deletes ALL of its data.**
> `test-db` stores its files in memory (tmpfs). After any of these, the
> database is completely empty, **without tables**:
> `docker compose stop test-db`, `docker compose restart test-db`,
> `docker compose down`, restarting Docker Desktop, or rebooting your computer.
>
> **Every time you start `test-db` again, run `schema.sql` first, then
> `init.sql`:**

```bash
# ① create tables, indexes, view
docker compose exec test-db psql -U postgres -d test-library-borrowing-system-hcmut-spm-261 -v ON_ERROR_STOP=1 -f /sql/schema.sql

# ② insert demo data
docker compose exec test-db psql -U postgres -d test-library-borrowing-system-hcmut-spm-261 -v ON_ERROR_STOP=1 -f /sql/init.sql
```

Never point `.env.test.local` at the main database. The tests empty the
tables (see [Testing](#testing)).

### Step 7: Run the server

| Command | Env file | Database | What it does |
|---|---|---|---|
| `npm run dev` | `.env` | main | Development server with file watching |
| `npm run dev:test` | `.env.test.local` | test | Same, against the test DB, with `/dev/reset-db` enabled |
| `npm run build` | none | none | Compiles to `dist/` (`tsc` + `tsc-alias` + `tsc-esm-fix`) |
| `npm start` | `.env` | main | Runs the compiled `dist/server.js` |

The API is served at `http://localhost:3000/api/v1`. Log in with one of the
[demo accounts](#demo-accounts).

`.env` and `.env.test.local` both use port 3000, so you can run only one of
`npm run dev` and `npm run dev:test` at a time. To run both, give one file a
different `SERVER_PORT`.

---

## Demo accounts

`init.sql` creates these accounts. All of them use the password **`password123`**.

| Account ID | Name | Role | Status |
|---|---|---|---|
| `ADM001` | Arthur Pendelton | `admin` | Active |
| `STF001` | Eleanor Vance | `staff` | Active |
| `S10428` | Maya Chen | `student` | Active |
| `S10312` | Oliver Brown | `student` | Active |
| `S10216` | Amira Khan | `student` | Active |
| `S10999` | Liam Patel | `student` | Inactive |

The login body must include the matching role:

```json
{ "accountId": "ADM001", "password": "password123", "role": "admin" }
```

`init.sql` also inserts 10 books, 25 physical copies, and 5 loans. Passwords are
stored as plain text for local development only.

---

## Testing

All tests use the **test database** through `.env.test.local`. Start `test-db`
and run `schema.sql` on it first ([Step 6](#step-6-prepare-the-test-database)).

### Unit and repository tests (`src/**/*.test.ts`)

```bash
npm run test:run       # run once
npm test               # watch mode

# one file / one test
npx vitest run src/modules/admin/repositories/admin.repository.test.ts
npx vitest run src/modules/admin/repositories/admin.repository.test.ts -t "lists users"
```

These tests connect straight to PostgreSQL. In `beforeEach` they run
`TRUNCATE ... RESTART IDENTITY CASCADE` on the app tables and insert their own
seed data. They do not need a running server.

In VS Code, with the **Vitest** extension installed, open a test file and click
the ▶ button next to a `describe(...)` or `it(...)` to run it. Many repository
tests print their results with `console.log`, so read the output and check the
rows in pgAdmin.

### API tests (`.test/**/*.api.test.ts`)

These send real HTTP requests with supertest to a running server, so **start
the server in test mode first** and keep it running:

```bash
# terminal 1: server on the test DB (ENABLE_DB_RESET=true in .env.test.local)
npm run dev:test

# terminal 2, from the repository root
npm run test:api          # every module under .test/
npm run test:api:books    # only book-inventories
npm run test:api:holds    # only holds
npm run test:api:loans    # only loans
```

To run one test or a group of tests, work from inside `.test`: either
`cd .test` in terminal 2, or open the `.test` folder as its own VS Code
workspace so the Vitest extension shows the API tests.

Every API test calls `POST /api/v1/dev/reset-db`, which empties the tables and
reloads `init.sql`. Each module folder has its own README:

| README | What it covers |
|---|---|
| [.test/book-inventories/README.md](.test/book-inventories/README.md) | Full setup and run options, the shared helpers, how a supertest test is written, the book-inventories cases and known bugs |
| [.test/holds/README.md](.test/holds/README.md) | The hold cases (contract 6.2, 6.3, 7.7), their test data, and what the contract leaves open |
| [.test/loans/README.md](.test/loans/README.md) | The loan cases (contract 6.1, 6.4, 7.1–7.6), their test data, and what the contract leaves open |

### Browsing the data with pgAdmin

Register one server for each database:

| Field | Main database | Test database |
|---|---|---|
| Host | `localhost` | `localhost` |
| Port | `5432` | `5433` |
| Maintenance database | `library-borrowing-system-hcmut-spm-261` | `test-library-borrowing-system-hcmut-spm-261` |
| Username | `postgres` | `postgres` |
| Password | `main` | `test` |

---

## Database operations cheat sheet

Replace `<service> <user> <db>` with `db postgres library-borrowing-system-hcmut-spm-261`
(main) or `test-db postgres test-library-borrowing-system-hcmut-spm-261` (test).

| Goal | Command |
|---|---|
| Start / stop main DB (data kept) | `docker compose up -d --wait db` / `docker compose stop db` |
| Start / stop test DB (**stop wipes everything**) | `docker compose up -d --wait test-db` / `docker compose stop test-db` |
| Status / logs | `docker compose ps` / `docker compose logs -f test-db` |
| Open a SQL shell | `docker compose exec <service> psql -U <user> -d <db>` |
| Reload demo data, keep tables | run `/sql/reset-data.sql`, then `/sql/init.sql` |
| Rebuild tables from scratch | run `/sql/drop-all.sql`, then `/sql/schema.sql`, then `/sql/init.sql` |
| Reset over HTTP (needs `ENABLE_DB_RESET=true`) | `POST http://localhost:3000/api/v1/dev/reset-db` |
| Delete the main DB volume for good | `docker compose down -v`, then repeat [Step 5](#step-5-prepare-the-main-database) |

Run a script with:

```bash
docker compose exec <service> psql -U <user> -d <db> -v ON_ERROR_STOP=1 -f /sql/<file>.sql
```

`connect-pg-simple` creates the `user_sessions` table automatically. None of
the scripts touch it.

---

## HTTP API

Base URL: `/api/v1`. Send JSON with `Content-Type: application/json`, and keep
the `connect.sid` session cookie returned by login on later requests.

### Authentication

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/auth/login` | Public | Check credentials and role, create a session |
| `GET` | `/auth/me` | Logged in | Current user profile and borrowing statistics |
| `POST` | `/auth/logout` | Logged in | Destroy the session |

### User administration

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/admin/users` | Admin | List users. Query: `type_query`, `role`, `status`, `page`, `limit` |
| `POST` | `/admin/users` | Admin | Create a user |
| `PUT` | `/admin/users/:id` | Admin | Update profile, role, year group, or status |
| `POST` | `/admin/users/:id/reset-password` | Admin | Reset a password |
| `DELETE` | `/admin/users/:id` | Admin | Delete a user without loan history |

`:id` accepts either the account ID (`S10428`) or the numeric ID.

### Books and copies

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/books/featured` | Logged in | Featured books |
| `GET` | `/books` | Staff, student | Search and filter books |
| `GET` | `/books/:id` | Staff, student | Book detail |
| `POST` | `/books` | Staff | Create a book |
| `PUT` | `/books/:id` | Staff | Update a book |
| `DELETE` | `/books/:id` | Staff | Delete a book |
| `POST` | `/books/:bookId/copies` | Staff | Add a physical copy |
| `PUT` | `/copies/:id` | Staff | Update a copy (`:id` = numeric ID or copy code) |
| `DELETE` | `/copies/:id` | Staff | Delete a copy |

### Development only

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/dev/reset-db` | Public, only when `ENABLE_DB_RESET=true` | Truncate app tables and reload `init.sql` |

### Response format

```jsonc
// success
{ "success": true, "data": { /* ... */ } }         // sometimes also "message"

// failure
{
  "success": false,
  "error": { "code": "VALIDATION_ERROR", "message": "...", "details": { /* optional */ } }
}
```

Validation failures return HTTP 400 with code `VALIDATION_ERROR`. The auth
module returns `INVALID_INPUT` instead.

---

## Database model

`src/shared/database/schema.sql` defines:

| Object | Purpose |
|---|---|
| `users` | Student, staff, and admin accounts |
| `books` | Title metadata |
| `physical_copies` | Individual copies, their state and condition |
| `holds` | Student reservations |
| `loans` | Checkout and return history |
| `fines` | Overdue, damaged, and lost-book charges |
| `view_book_stock` | Derived total / available / borrowed copy counts per book |

`user_sessions` is created by `connect-pg-simple` for the session store.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `failed to read .env: unexpected character "+" in variable name` | A value in `.env` spans several lines. Put it on one line ([Step 3](#step-3-create-the-environment-files)). |
| `Bind for 0.0.0.0:5432 failed: port is already allocated` | Another PostgreSQL (a Windows install or an old container) uses the port. Stop it, or change the host port in `docker-compose.yml` **and** `DB_PORT` in the env file. |
| Port `5433` already allocated | An older hand-started test container is still running, e.g. `docker rm -f Lib-borrow-sys-test`. |
| Server exits with `Error during database seeding` / `relation "users" does not exist` | The schema was not applied to that database. Run `schema.sql` (Step 5 or Step 6). For the test DB this happens after every stop. |
| `relation "users" already exists` when running `schema.sql` | The schema is already there. Use the reset commands in the [cheat sheet](#database-operations-cheat-sheet). |
| Admin login fails with `password123` | The server created `ADM001` before `init.sql` ran. Use `123456`, or reload the data (`reset-data.sql`, then `init.sql`). |
| API tests stop with `ECONNREFUSED` or `/dev/reset-db is not mounted` | Start `npm run dev:test` with `ENABLE_DB_RESET=true` in `.env.test.local`. |

---

## Known limitations

- Passwords are stored and compared as plain text (local development only).
- Repository tests are exploratory and mostly log results instead of asserting.
