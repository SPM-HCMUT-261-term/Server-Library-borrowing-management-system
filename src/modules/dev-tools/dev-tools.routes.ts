import { readFile } from "node:fs/promises";
import path from "node:path";

import { Router, type Request, type Response } from "express";

import { pool } from "@shared/database/db.js";

// Development helper: empties the app tables and reloads the demo data from init.sql,
// so every Postman test can start from the same database state.
// server.ts mounts this router only when ENABLE_DB_RESET=true. Never enable it in production.
// user_sessions is not truncated, so a logged-in Postman cookie keeps working
// (users get the same ids back because of RESTART IDENTITY).

// Resolved from the project root (where `npm run dev` / `npm start` run), because
// `tsc` does not copy .sql files into dist/.
const INIT_SQL_PATH = path.resolve(process.cwd(), "src/shared/database/init.sql");

const TRUNCATE_SQL =
    "TRUNCATE TABLE fines, loans, holds, physical_copies, books, users RESTART IDENTITY CASCADE;";

type TableCounts = {
    users: number;
    books: number;
    physicalCopies: number;
    loans: number;
    holds: number;
    fines: number;
};

const devToolsRouter = Router();

// POST /api/v1/dev/reset-db
devToolsRouter.post("/reset-db", async (_req: Request, res: Response): Promise<void> => {
    const client = await pool.connect();
    try {
        // Read the file first: if it is missing, nothing has been deleted yet.
        const initSql = await readFile(INIT_SQL_PATH, "utf8");

        await client.query(TRUNCATE_SQL);

        // init.sql holds several statements and its own BEGIN / COMMIT.
        // pg runs a multi-statement string in one call as long as it has no $1 parameters.
        await client.query(initSql);

        const counts = await client.query<TableCounts>(`
            SELECT
                (SELECT COUNT(*)::int FROM users)           AS "users",
                (SELECT COUNT(*)::int FROM books)           AS "books",
                (SELECT COUNT(*)::int FROM physical_copies) AS "physicalCopies",
                (SELECT COUNT(*)::int FROM loans)           AS "loans",
                (SELECT COUNT(*)::int FROM holds)           AS "holds",
                (SELECT COUNT(*)::int FROM fines)           AS "fines"
        `);

        res.status(200).json({
            success: true,
            message: "Database reset and reseeded from init.sql",
            data: counts.rows[0]
        });
    } catch (error) {
        // If init.sql failed after its BEGIN, the connection is inside an aborted transaction:
        // roll it back so the client goes back to the pool clean. Harmless when there is none.
        await client.query("ROLLBACK").catch(() => undefined);
        console.error("Database reset failed:", error);

        res.status(500).json({
            success: false,
            error: {
                code: "DB_RESET_FAILED",
                message: error instanceof Error ? error.message : "Database reset failed"
            }
        });
    } finally {
        client.release();
    }
});

export { devToolsRouter };
