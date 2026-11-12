import { pool } from "@shared/database/db.js";
import type { Pool } from "pg";

export const adminSeedAccounts = {
    admin: "ADM001",
    studentWithoutHistory: "STU001",
    studentWithHistory: "STU002",
    inactiveStaff: "STF001",
} as const;

export async function seedAdminRepositoryData(database: Pool = pool): Promise<void> {
    const client = await database.connect();
    try {
        await client.query("BEGIN");

        await client.query(`
            INSERT INTO users (account_id, full_name, password_hash, role, status, year_group)
            VALUES
                ('ADM001', 'First Admin', 'seed-admin-password', 'admin', 'Active', NULL),
                ('STU001', 'Student Without History', 'seed-student-password', 'student', 'Active', '2026'),
                ('STU002', 'Student With History', 'seed-student-password', 'student', 'Active', '2025'),
                ('STF001', 'Inactive Staff', 'seed-staff-password', 'staff', 'Inactive', NULL)
            ON CONFLICT (account_id) DO NOTHING
        `);

        await client.query(`
            INSERT INTO books (title, author, isbn, category, genre)
            VALUES ('Admin Repository Fixture', 'Test Author', '9780000000001', 'Reference', 'Testing')
            ON CONFLICT (isbn) DO NOTHING
        `);

        const bookResult = await client.query<{ id: number }>(
            "SELECT id FROM books WHERE isbn = $1",
            ["9780000000001"],
        );
        const studentResult = await client.query<{ id: number }>(
            "SELECT id FROM users WHERE account_id = $1",
            [adminSeedAccounts.studentWithHistory],
        );

        const bookId = bookResult.rows[0]?.id;
        const studentId = studentResult.rows[0]?.id;
        if (bookId === undefined || studentId === undefined) {
            throw new Error("Unable to resolve admin repository seed records");
        }

        await client.query(
            `
                INSERT INTO physical_copies (copy_code, book_id, home_location, state, condition)
                VALUES ($1, $2, 'TEST-SHELF', 'Borrowed', 'Good')
                ON CONFLICT (copy_code) DO NOTHING
            `,
            ["ADMIN-TEST-COPY", bookId],
        );

        const copyResult = await client.query<{ id: number }>(
            "SELECT id FROM physical_copies WHERE copy_code = $1",
            ["ADMIN-TEST-COPY"],
        );
        const copyId = copyResult.rows[0]?.id;
        if (copyId === undefined) {
            throw new Error("Unable to resolve admin repository seed copy");
        }

        await client.query(
            `
                INSERT INTO loans (borrow_code, student_id, copy_id, status, due_date)
                VALUES ($1, $2, $3, 'Active', CURRENT_DATE - 7)
                ON CONFLICT (borrow_code) DO NOTHING
            `,
            ["ADMIN-TEST-LOAN", studentId, copyId],
        );

        const loanResult = await client.query<{ id: number }>(
            "SELECT id FROM loans WHERE borrow_code = $1",
            ["ADMIN-TEST-LOAN"],
        );
        const loanId = loanResult.rows[0]?.id;
        if (loanId === undefined) {
            throw new Error("Unable to resolve admin repository seed loan");
        }

        await client.query(
            `
                INSERT INTO holds (hold_code, student_id, book_id, copy_id, status, collect_by)
                VALUES ($1, $2, $3, $4, 'Ready', CURRENT_TIMESTAMP + INTERVAL '7 days')
                ON CONFLICT (hold_code) DO NOTHING
            `,
            ["ADMIN-TEST-HOLD", studentId, bookId, copyId],
        );
        await client.query(
            `
                DELETE FROM fines
                WHERE loan_id = $1
                  AND student_id = $2
                  AND amount = 25.50
                  AND reason = 'Overdue'
                  AND status = 'Unpaid'
            `,
            [loanId, studentId],
        );
        await client.query(
            `
                INSERT INTO fines (loan_id, student_id, amount, reason, status)
                VALUES ($1, $2, 25.50, 'Overdue', 'Unpaid')
            `,
            [loanId, studentId],
        );

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

if (process.argv[1]?.endsWith("admin.repository.seed.ts")) {
    await seedAdminRepositoryData(pool);
    await pool.end();
}