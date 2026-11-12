import { pool } from "@shared/database/db.js";
import type { Pool } from "pg";

export const authSeedAccounts = {
    admin: "AUTHADM001",
    student: "AUTHSTU001",
    overdueStudent: "AUTHSTU002",
} as const;

export async function seedAuthRepositoryData(database: Pool = pool): Promise<void> {
    const client = await database.connect();
    try {
        await client.query("BEGIN");

        await client.query(`
            INSERT INTO users (account_id, full_name, password_hash, role, status, year_group)
            VALUES
                ('AUTHADM001', 'Auth Test Admin', 'auth-admin-password', 'admin', 'Active', NULL),
                ('AUTHSTU001', 'Auth Test Student', 'auth-student-password', 'student', 'Active', '2026'),
                ('AUTHSTU002', 'Auth Overdue Student', 'auth-overdue-password', 'student', 'Active', '2025')
        `);

        const studentResult = await client.query<{ id: number }>(
            "SELECT id FROM users WHERE account_id = $1",
            [authSeedAccounts.student],
        );
        const studentId = studentResult.rows[0]?.id;
        if (studentId === undefined) {
            throw new Error("Unable to resolve auth repository seed student");
        }
        const overdueStudentResult = await client.query<{ id: number }>(
            "SELECT id FROM users WHERE account_id = $1",
            [authSeedAccounts.overdueStudent],
        );
        const overdueStudentId = overdueStudentResult.rows[0]?.id;
        if (overdueStudentId === undefined) {
            throw new Error("Unable to resolve auth repository overdue student");
        }

        await client.query(`
            INSERT INTO books (title, author, isbn, category, genre)
            VALUES ('Auth Repository Fixture', 'Test Author', '9780000000002', 'Reference', 'Testing')
        `);

        const bookResult = await client.query<{ id: number }>(
            "SELECT id FROM books WHERE isbn = $1",
            ["9780000000002"],
        );
        const bookId = bookResult.rows[0]?.id;
        if (bookId === undefined) {
            throw new Error("Unable to resolve auth repository seed book");
        }

        await client.query(
            `
                INSERT INTO physical_copies (copy_code, book_id, home_location, state, condition)
                VALUES ('AUTH-TEST-COPY', $1, 'AUTH-TEST-SHELF', 'Borrowed', 'Good')
            `,
            [bookId],
        );

        const copyResult = await client.query<{ id: number }>(
            "SELECT id FROM physical_copies WHERE copy_code = $1",
            ["AUTH-TEST-COPY"],
        );
        const copyId = copyResult.rows[0]?.id;
        if (copyId === undefined) {
            throw new Error("Unable to resolve auth repository seed copy");
        }

        await client.query(
            `
                INSERT INTO loans (borrow_code, student_id, copy_id, status, due_date)
                VALUES ('AUTH-TEST-LOAN', $1, $2, 'Active', CURRENT_DATE - 7)
            `,
            [studentId, copyId],
        );

        const loanResult = await client.query<{ id: number }>(
            "SELECT id FROM loans WHERE borrow_code = $1",
            ["AUTH-TEST-LOAN"],
        );
        const loanId = loanResult.rows[0]?.id;
        if (loanId === undefined) {
            throw new Error("Unable to resolve auth repository seed loan");
        }

        await client.query(
            `
                INSERT INTO fines (loan_id, student_id, amount, reason, status)
                VALUES ($1, $2, 15.75, 'Overdue', 'Unpaid')
            `,
            [loanId, studentId],
        );
        await client.query(
            `
                INSERT INTO holds (hold_code, student_id, book_id, copy_id, status, collect_by)
                VALUES ('AUTH-TEST-HOLD', $1, $2, $3, 'Ready', CURRENT_TIMESTAMP + INTERVAL '7 days')
            `,
            [studentId, bookId, copyId],
        );

        for (let index = 1; index <= 4; index += 1) {
            const isbn = `97800000000${10 + index}`;
            const copyCode = `AUTH-OVERDUE-COPY-${index}`;
            const borrowCode = `AUTH-OVERDUE-LOAN-${index}`;

            await client.query(
                `
                    INSERT INTO books (title, author, isbn, category, genre)
                    VALUES ($1, 'Test Author', $2, 'Reference', 'Testing')
                `,
                [`Auth Overdue Fixture ${index}`, isbn],
            );
            const overdueBookResult = await client.query<{ id: number }>(
                "SELECT id FROM books WHERE isbn = $1",
                [isbn],
            );
            const overdueBookId = overdueBookResult.rows[0]?.id;
            if (overdueBookId === undefined) {
                throw new Error(`Unable to resolve auth overdue book ${index}`);
            }

            await client.query(
                `
                    INSERT INTO physical_copies (copy_code, book_id, home_location, state, condition)
                    VALUES ($1, $2, 'AUTH-OVERDUE-SHELF', 'Borrowed', 'Good')
                `,
                [copyCode, overdueBookId],
            );
            const overdueCopyResult = await client.query<{ id: number }>(
                "SELECT id FROM physical_copies WHERE copy_code = $1",
                [copyCode],
            );
            const overdueCopyId = overdueCopyResult.rows[0]?.id;
            if (overdueCopyId === undefined) {
                throw new Error(`Unable to resolve auth overdue copy ${index}`);
            }

            await client.query(
                `
                    INSERT INTO loans (borrow_code, student_id, copy_id, status, due_date)
                    VALUES ($1, $2, $3, 'Active', CURRENT_DATE - ($4::integer))
                `,
                [borrowCode, overdueStudentId, overdueCopyId, index + 1],
            );
            const overdueLoanResult = await client.query<{ id: number }>(
                "SELECT id FROM loans WHERE borrow_code = $1",
                [borrowCode],
            );
            const overdueLoanId = overdueLoanResult.rows[0]?.id;
            if (overdueLoanId === undefined) {
                throw new Error(`Unable to resolve auth overdue loan ${index}`);
            }

            await client.query(
                `
                    INSERT INTO fines (loan_id, student_id, amount, reason, status)
                    VALUES ($1, $2, $3, 'Overdue', 'Unpaid')
                `,
                [overdueLoanId, overdueStudentId, index * 10],
            );
        }

        await client.query("COMMIT");
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

if (process.argv[1]?.endsWith("auth.repository.seed.ts")) {
    await seedAuthRepositoryData(pool);
    await pool.end();
}