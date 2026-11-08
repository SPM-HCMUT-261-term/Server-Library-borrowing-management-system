# Library Borrowing Management System

Backend service for a school library borrowing management system. The project is
implemented with TypeScript and Express and is currently focused on
authentication, session management, administrator account management, and the
database foundation for books and borrowing workflows.

## Project status

This branch contains the authentication and administrator features. The
database schema already models the wider borrowing domain, while book
inventory, borrowing, fines, and notifications are prepared for future
implementation.

Implemented or wired at the HTTP layer:

- User login with account ID, password, and role validation.
- Session-based authentication using PostgreSQL-backed sessions.
- Authenticated user profile lookup and logout.
- Administrator user listing, creation, update, password reset, and deletion
  endpoints.
- Request validation with Zod and structured JSON error responses.
- Password hashing and verification with Argon2.

The service and repository layers still contain TODOs and placeholders in
several areas. In particular, authentication and administrator services expect
repository implementations to be connected, and access-token generation is not
implemented yet.

## Technology stack

- **Runtime:** Node.js
- **Language:** TypeScript
- **Web framework:** Express 5
- **Database:** PostgreSQL
- **Database driver:** `pg`
- **Session store:** `express-session` with `connect-pg-simple`
- **Validation:** Zod
- **Password security:** Argon2
- **Development runner:** `tsx`

## Architecture

The source is organized by feature:

```text
src/
├── app.ts
├── server.ts
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
│       ├── book-inventories.routes.ts
│       ├── book-inventories.service.ts
│       └── repositories/
└── shared/
    ├── database/
    ├── middlewares/
    └── utils/
```

Controllers validate HTTP input and format responses. Services contain
business logic, repositories isolate database access, and shared middleware
provides sessions and authentication checks.

## HTTP API

The server reads the port from `PORT` and defaults to `3000`.

### Public endpoint

| Method | Path | Description |
|---|---|---|
| `POST` | `/login` | Validate credentials and create an authenticated session. |

Example request:

```json
{
  "accountId": "ADM001",
  "password": "your-password",
  "role": "admin"
}
```

### Authenticated user endpoints

These routes are mounted under `/auth` and require a valid session.

| Method | Path | Description |
|---|---|---|
| `GET` | `/auth/me` | Return the current user's profile and borrowing statistics. |
| `POST` | `/auth/logout` | Destroy the current session. |

### Administrator endpoints

These routes are mounted under `/admin` and require a valid authenticated
session. Administrator-role authorization should be completed as part of the
remaining access-control work.

| Method | Path | Description |
|---|---|---|
| `GET` | `/admin` | List users with optional filters and pagination. |
| `POST` | `/admin` | Create a user account. |
| `PUT` | `/admin/:id` | Update a user's profile, role, year group, or status. |
| `POST` | `/admin/:id/reset-password` | Reset a user's password. |
| `DELETE` | `/admin/:id` | Delete a user when borrowing history permits it. |

Successful responses generally use the following envelope:

```json
{
  "success": true,
  "data": {}
}
```

Validation and service failures use a structured `error` object containing a
machine-readable `code` and a human-readable `message`.

## Database model

The PostgreSQL schema in `src/shared/database/schema.sql` defines:

- `users` for student, staff, and administrator accounts.
- `books` for title-level metadata.
- `physical_copies` for individual library copies.
- `holds` for student reservations.
- `borrow_records` for checkout and return history.
- `fines` for overdue, damaged, and lost-book charges.
- `notifications` for user alerts.

Database constraints and partial unique indexes prevent conflicting active loans
or ready holds for the same physical copy. The session middleware creates and
uses a PostgreSQL `user_sessions` table.

## Configuration

Set the following environment variables before starting the server:

```text
PORT=3000
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

<!-- ## Related documentation

- [`.bin/API_Contract.md`](./.bin/API_Contract.md) contains the broader
  planned API contract for catalog, copy, borrowing, staff, and admin
  workflows.
- [`src/shared/database/schema.sql`](./src/shared/database/schema.sql) contains
  the PostgreSQL schema and data-integrity constraints. -->
