# Library Borrowing Management System

Backend service for the Westbridge School library borrowing management system.
This branch is a TypeScript and Express implementation of the authentication
and user-account administration foundation. The database schema also defines
the catalog, physical-copy, hold, loan, fine, and notification domain for
future modules.

## Current implementation

The server currently provides:

- Account login with `accountId`, password, and role validation.
- PostgreSQL-backed, session-cookie authentication.
- Authenticated profile lookup and logout.
- User listing, creation, update, password reset, and deletion handlers for
  administrator workflows.
- Zod request validation and structured JSON error responses.
- Argon2 password hashing and verification.
- Database initialization and seed execution at server startup.

The book-inventory module and the wider borrowing workflows are currently
scaffolded but are not mounted as HTTP routes. The current verification
middleware checks that a session is authenticated and has a valid role; it does
not yet restrict the administrator routes to administrator accounts.

## Technology stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Web framework:** Express 5
- **Database:** PostgreSQL
- **Database driver:** `pg`
- **Session store:** `express-session` with `connect-pg-simple`
- **Validation:** Zod
- **Password security:** Argon2
- **Email support:** Nodemailer
- **Development runner:** `tsx`
- **Testing:** Vitest

## Project structure

```text
src/
├── server.ts
├── app.ts
├── modules/
│   ├── auth/
│   │   ├── auth.controller.ts
│   │   ├── auth.dto.ts
│   │   ├── auth.entity.ts
│   │   ├── auth.routes.ts
│   │   ├── auth.service.ts
│   │   └── repositories/
│   ├── admin/
│   │   ├── admin.controller.ts
│   │   ├── admin.dto.ts
│   │   ├── admin.entity.ts
│   │   ├── admin.routes.ts
│   │   ├── admin.service.ts
│   │   └── repositories/
│   └── book-inventories/
│       ├── book-inventories.controller.ts
│       ├── book-inventories.dto.ts
│       ├── book-inventories.entity.ts
│       ├── book-inventories.routes.ts
│       ├── book-inventories.service.ts
│       └── repositories/
└── shared/
    ├── database/
    ├── middlewares/
    └── utils/
```

Controllers handle HTTP parsing and response formatting. Services contain
business logic, repositories isolate PostgreSQL access, and shared middleware
provides sessions and authentication checks.

## HTTP API

The current base URL is `/api/v1`. JSON requests must use
`Content-Type: application/json`.

### Authentication

| Method | Path | Access | Description |
|---|---|---|---|
| `POST` | `/api/v1/auth/login` | Public | Validate credentials and create a session. |
| `GET` | `/api/v1/auth/me` | Authenticated | Return the current user profile and borrowing statistics. |
| `POST` | `/api/v1/auth/logout` | Authenticated | Destroy the current session. |

Login request:

```json
{
  "accountId": "ADM001",
  "password": "your-password",
  "role": "admin"
}
```

The accepted roles are `student`, `staff`, and `admin`. Successful login
stores the user ID, account ID, name, and role in the server-side session.
Clients must retain and send the session cookie on subsequent requests.

### User administration

| Method | Path | Access | Description |
|---|---|---|---|
| `GET` | `/api/v1/admin/users` | Authenticated | List users with optional filters and pagination. |
| `POST` | `/api/v1/admin/users` | Authenticated | Create a user account. |
| `PUT` | `/api/v1/admin/users/:id` | Authenticated | Update a user's profile, role, year group, or status. |
| `POST` | `/api/v1/admin/users/:id/reset-password` | Authenticated | Reset a user’s password. |
| `DELETE` | `/api/v1/admin/users/:id` | Authenticated | Delete a user when borrowing history permits it. |

The user-list query supports `type_query`, `role`, `status`, `page`, and
`limit`. User roles are `student`, `staff`, and `admin`; user statuses are
`Active` and `Inactive`.

### Response format

Successful responses use:

```json
{
  "success": true,
  "data": {}
}
```

Some successful operations return a top-level `message` instead of, or in
addition to, `data`. Validation and service failures use:

```json
{
  "success": false,
  "error": {
    "code": "INVALID_INPUT",
    "message": "Invalid input",
    "details": {}
  }
}
```

## Database model

The PostgreSQL schema in `src/shared/database/schema.sql` defines:

- `users` for student, staff, and administrator accounts.
- `books` for title metadata.
- `physical_copies` for individual copies and their condition.
- `holds` for student reservations.
- `loans` for checkout and return history.
- `fines` for overdue, damaged, and lost-book charges.
- `notifications` for user alerts.
- `view_book_stock` for derived copy-availability totals.

The session middleware creates and uses the `user_sessions` table through
`connect-pg-simple`. Foreign keys, checks, indexes, and the stock view enforce
the database-level rules currently defined in the schema.

## Configuration

Set these environment variables before starting the server:

```text
SERVER_PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_USER=your_database_user
DB_PASSWORD=your_database_password
DB_NAME=your_database_name
SESSION_SECRET_KEY=replace_with_a_long_random_secret
```

Do not commit passwords, session secrets, or other credentials to the
repository.

## Installation and development

Install dependencies:

```bash
npm install
```

Start the development server with file watching:

```bash
npm run dev
```

Build the TypeScript project:

```bash
npm run build
```

Start the compiled server:

```bash
npm start
```

Run the test suite:

```bash
npm run test:run
```

## Setting up and running Vitest tests

The repository tests use Vitest and connect directly to PostgreSQL. Follow
these steps on a new development machine.

### 1. Install the Vitest VS Code extension

Open the **Extensions** view in VS Code, search for **Vitest**, and install the
Vitest extension. This adds run/debug controls, including a triangle button
next to `describe(...)` and each `it(...)` test.

### 2. Start PostgreSQL

Use either of these options:

#### Option A: PostgreSQL Docker image

Install Docker Desktop, then run these commands in PowerShell:

```powershell
docker pull postgres:bookworm
docker run --name library-postgres `
  -e POSTGRES_USER=postgres `
  -e POSTGRES_PASSWORD=postgres `
  -e POSTGRES_DB=library_db `
  -p 5432:5432 `
  -d postgres:bookworm
```

Apply the project schema:

```powershell
Get-Content .\src\shared\database\schema.sql |
  docker exec -i library-postgres psql -U postgres -d library_db
```

Install pgAdmin separately and create a server connection with:

```text
Host:     localhost
Port:     5432
Database: library_db
Username: postgres
Password: postgres
```

pgAdmin lets you inspect the tables and the changes made by repository tests.

#### Option B: PostgreSQL for Windows

Install PostgreSQL for Windows and select the bundled pgAdmin component during
installation. Create a database named `library_db`, then run
`src/shared/database/schema.sql` against it from pgAdmin's Query Tool.
Use the PostgreSQL username, password, host, port, and database name in the
test environment file below.

### 3. Configure the test database

Create `.env.test.local` in the repository root. Do not commit this file.
For the Docker setup above, use:

```text
DB_HOST=localhost
DB_PORT=5432
DB_USER=postgres
DB_PASSWORD=postgres
DB_NAME=library_db
SESSION_SECRET_KEY=local-test-secret
```

Vitest loads this file through `src/setup.ts`. The repository tests truncate
the application tables and insert their own seed data before each test, so use
a dedicated test database. Do not point the tests at a database containing
data that must be preserved.

Install dependencies if needed:

```bash
npm install
```

Run all tests from the terminal (optional):

```bash
npm run test:run
```

To keep Vitest running in watch mode (optional):

```bash
npm test
```

### 4. Run one test from VS Code

Open a test file under `src/`, for example
`src/modules/admin/repositories/admin.repository.test.ts`. Click the
triangle button at the beginning of a `describe(...)` or `it(...)` block to
run that suite or individual test. The result appears in the VS Code testing
panel and the terminal. The repository tests also print database-operation
results with `console.log`; inspect those values in the test output and use
pgAdmin to verify the corresponding database state.

<!-- ## API contract

[`API_Contract.md`](./.temp/API_Contract.md) describes the intended
28-endpoint API, including catalog, physical-copy, borrowing, hold, staff, and
admin workflows. The contract is broader than the routes currently mounted by
this branch; use the current route list above as the source of truth for the
running server. -->
