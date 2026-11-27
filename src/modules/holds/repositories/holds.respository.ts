import type { Pool, QueryResultRow } from "pg";

import type {
    BookStockEntity,
    CancelHoldResultEntity,
    HoldDetailEntity,
    HoldStatus,
    StudentBorrowingStatusEntity,
} from "../holds.entity.js";
import type { HoldsRepository } from "./holds.repository.interface.js";

interface HoldRow extends QueryResultRow {
    id: string;
    holdCode: string;
    status: HoldStatus;
    requestedAt: Date | string;
    collectBy: Date | string;
    bookId: string;
    bookTitle: string;
    bookAuthor: string;
    bookFormat: string;
    bookShelfReference: string | null;
    bookCoverImageUrl: string | null;
    copyId: string | null;
    copyCode: string | null;
    copyHomeLocation: string | null;
    studentId: string;
    studentAccountId: string;
    studentFullName: string;
    studentYearGroup: string | null;
}

const holdDetailSelect = `
    h.id::text AS "id",
    h.hold_code AS "holdCode",
    h.status AS "status",
    h.requested_at AS "requestedAt",
    h.collect_by AS "collectBy",
    b.id::text AS "bookId",
    b.title AS "bookTitle",
    b.author AS "bookAuthor",
    b.format AS "bookFormat",
    b.shelf_reference AS "bookShelfReference",
    b.cover_image_url AS "bookCoverImageUrl",
    pc.id::text AS "copyId",
    pc.copy_code AS "copyCode",
    pc.home_location AS "copyHomeLocation",
    u.id::text AS "studentId",
    u.account_id AS "studentAccountId",
    u.full_name AS "studentFullName",
    u.year_group AS "studentYearGroup"
`;

const holdDetailFrom = `
    FROM holds AS h
    JOIN books AS b ON b.id = h.book_id
    JOIN users AS u ON u.id = h.student_id
    LEFT JOIN physical_copies AS pc ON pc.id = h.copy_id
`;

function toIsoString(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) {
        throw new TypeError("Database returned an invalid hold timestamp");
    }
    return date.toISOString();
}

function mapHold(row: HoldRow): HoldDetailEntity {
    return {
        id: row.id,
        holdCode: row.holdCode,
        status: row.status,
        requestedAt: toIsoString(row.requestedAt),
        collectBy: toIsoString(row.collectBy),
        book: {
            id: row.bookId,
            title: row.bookTitle,
            author: row.bookAuthor,
            format: row.bookFormat,
            shelfReference: row.bookShelfReference,
            coverImageUrl: row.bookCoverImageUrl,
        },
        copy: row.copyId && row.copyCode && row.copyHomeLocation
            ? {
                  id: row.copyId,
                  copyCode: row.copyCode,
                  homeLocation: row.copyHomeLocation,
              }
            : null,
        student: {
            id: row.studentId,
            accountId: row.studentAccountId,
            fullName: row.studentFullName,
            yearGroup: row.studentYearGroup,
        },
    };
}

export class HoldsRepositoryImpl implements HoldsRepository {
    constructor(private readonly pool: Pool) {}

    async getStudentBorrowingStatus(
        studentId: string,
    ): Promise<StudentBorrowingStatusEntity | null> {
        const result = await this.pool.query<
            QueryResultRow & {
                id: string;
                activeLoansCount: number | string;
                maxLoansLimit: number | string;
                overdueLoansCount: number | string;
                unpaidFines: number | string;
            }
        >(
            `
                SELECT
                    u.id::text AS "id",
                    (
                        SELECT COUNT(*)::int
                        FROM loans AS l
                        WHERE l.student_id = u.id AND l.status = 'Active'
                    ) AS "activeLoansCount",
                    u.max_loans_limit AS "maxLoansLimit",
                    (
                        SELECT COUNT(*)::int
                        FROM loans AS l
                        WHERE l.student_id = u.id
                          AND l.status = 'Active'
                          AND l.due_date < CURRENT_DATE
                    ) AS "overdueLoansCount",
                    COALESCE((
                        SELECT SUM(f.amount)
                        FROM fines AS f
                        WHERE f.student_id = u.id AND f.status = 'Unpaid'
                    ), 0)::float8 AS "unpaidFines"
                FROM users AS u
                WHERE u.id::text = $1 AND u.role = 'student'
                LIMIT 1
            `,
            [studentId],
        );
        const row = result.rows[0];
        return row
            ? {
                  id: row.id,
                  activeLoansCount: Number(row.activeLoansCount),
                  maxLoansLimit: Number(row.maxLoansLimit),
                  overdueLoansCount: Number(row.overdueLoansCount),
                  unpaidFines: Number(row.unpaidFines),
              }
            : null;
    }

    async getBookStock(bookId: string): Promise<BookStockEntity | null> {
        const result = await this.pool.query<
            QueryResultRow & {
                bookId: string;
                totalCopies: number | string;
                availableCopies: number | string;
                borrowedCopies: number | string;
                reservedCopies: number | string;
            }
        >(
            `
                SELECT
                    b.id::text AS "bookId",
                    COALESCE(s.total_copies, 0)::int AS "totalCopies",
                    COALESCE(s.available_copies, 0)::int AS "availableCopies",
                    COALESCE(s.borrowed_copies, 0)::int AS "borrowedCopies",
                    COALESCE(s.reserved_copies, 0)::int AS "reservedCopies"
                FROM books AS b
                LEFT JOIN view_book_stock AS s ON s.book_id = b.id
                WHERE b.id::text = $1
                LIMIT 1
            `,
            [bookId],
        );
        const row = result.rows[0];
        return row
            ? {
                  bookId: row.bookId,
                  totalCopies: Number(row.totalCopies),
                  availableCopies: Number(row.availableCopies),
                  borrowedCopies: Number(row.borrowedCopies),
                  reservedCopies: Number(row.reservedCopies),
              }
            : null;
    }

    async hasActiveLoanOrHoldForBook(params: {
        studentId: string;
        bookId: string;
    }): Promise<boolean> {
        const result = await this.pool.query<
            QueryResultRow & { hasActiveLoanOrHold: boolean }
        >(
            `
                SELECT (
                    EXISTS (
                        SELECT 1
                        FROM loans AS l
                        JOIN physical_copies AS pc ON pc.id = l.copy_id
                        WHERE l.student_id::text = $1
                          AND pc.book_id::text = $2
                          AND l.status = 'Active'
                    )
                    OR EXISTS (
                        SELECT 1
                        FROM holds AS h
                        WHERE h.student_id::text = $1
                          AND h.book_id::text = $2
                          AND h.status = 'Ready'
                    )
                ) AS "hasActiveLoanOrHold"
            `,
            [params.studentId, params.bookId],
        );
        return result.rows[0]?.hasActiveLoanOrHold ?? false;
    }

    async findHoldById(id: string): Promise<HoldDetailEntity | null> {
        const result = await this.pool.query<HoldRow>(
            `
                SELECT ${holdDetailSelect}
                ${holdDetailFrom}
                WHERE h.id::text = $1 OR h.hold_code = $1
                ORDER BY CASE WHEN h.id::text = $1 THEN 0 ELSE 1 END
                LIMIT 1
            `,
            [id],
        );
        const row = result.rows[0];
        return row ? mapHold(row) : null;
    }

    async getActiveHolds(params: {
        q?: string | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    }): Promise<{ holds: HoldDetailEntity[]; totalItem: number }> {
        const page = params.page ?? 1;
        const limit = params.limit ?? 10;
        if (!Number.isSafeInteger(page) || page < 1) {
            throw new RangeError("page must be a positive safe integer");
        }
        if (!Number.isSafeInteger(limit) || limit < 1) {
            throw new RangeError("limit must be a positive safe integer");
        }

        const values: unknown[] = [];
        let whereClause = "WHERE h.status = 'Ready'";
        if (params.q?.trim()) {
            values.push(`%${params.q.trim()}%`);
            const query = `$${values.length}`;
            whereClause += ` AND (
                h.hold_code ILIKE ${query}
                OR u.account_id ILIKE ${query}
                OR u.full_name ILIKE ${query}
                OR pc.copy_code ILIKE ${query}
                OR b.title ILIKE ${query}
            )`;
        }

        const countValues = [...values];
        values.push(limit, (page - 1) * limit);
        const limitPlaceholder = `$${values.length - 1}`;
        const offsetPlaceholder = `$${values.length}`;

        const [holdsResult, countResult] = await Promise.all([
            this.pool.query<HoldRow>(
                `
                    SELECT ${holdDetailSelect}
                    ${holdDetailFrom}
                    ${whereClause}
                    ORDER BY h.requested_at DESC, h.id DESC
                    LIMIT ${limitPlaceholder}
                    OFFSET ${offsetPlaceholder}
                `,
                values,
            ),
            this.pool.query<QueryResultRow & { totalItem: number | string }>(
                `
                    SELECT COUNT(*)::int AS "totalItem"
                    ${holdDetailFrom}
                    ${whereClause}
                `,
                countValues,
            ),
        ]);
        return {
            holds: holdsResult.rows.map(mapHold),
            totalItem: Number(countResult.rows[0]?.totalItem ?? 0),
        };
    }

    async createHold(params: {
        studentId: string;
        bookId: string;
        collectBy: string;
    }): Promise<HoldDetailEntity | "no_available_copies"> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");

            const bookResult = await client.query<QueryResultRow & { id: string }>(
                `
                    SELECT b.id::text AS "id"
                    FROM books AS b
                    WHERE b.id::text = $1
                    FOR SHARE
                `,
                [params.bookId],
            );
            if (!bookResult.rows[0]) {
                await client.query("COMMIT");
                return "no_available_copies";
            }

            const studentResult = await client.query<
                QueryResultRow & { id: string; status: string }
            >(
                `
                    SELECT u.id::text AS "id", u.status AS "status"
                    FROM users AS u
                    WHERE u.id::text = $1 AND u.role = 'student'
                    FOR UPDATE
                `,
                [params.studentId],
            );
            const student = studentResult.rows[0];
            if (!student) {
                throw Object.assign(new Error("Student not found"), {
                    code: "STUDENT_NOT_FOUND",
                });
            }

            const eligibilityResult = await client.query<
                QueryResultRow & { overdueLoansCount: number; unpaidFines: number }
            >(
                `
                    SELECT
                        (
                            SELECT COUNT(*)::int
                            FROM loans AS l
                            WHERE l.student_id = $1
                              AND l.status = 'Active'
                              AND l.due_date < CURRENT_DATE
                        ) AS "overdueLoansCount",
                        COALESCE((
                            SELECT SUM(f.amount)
                            FROM fines AS f
                            WHERE f.student_id = $1 AND f.status = 'Unpaid'
                        ), 0)::float8 AS "unpaidFines"
                `,
                [student.id],
            );
            const eligibility = eligibilityResult.rows[0];
            if (
                student.status !== "Active"
                || Number(eligibility?.overdueLoansCount ?? 0) > 0
                || Number(eligibility?.unpaidFines ?? 0) > 0
            ) {
                throw Object.assign(new Error("Student is blocked from borrowing"), {
                    code: "BORROWING_BLOCKED",
                });
            }

            const duplicateResult = await client.query<
                QueryResultRow & { hasDuplicate: boolean }
            >(
                `
                    SELECT (
                        EXISTS (
                            SELECT 1
                            FROM loans AS l
                            JOIN physical_copies AS pc ON pc.id = l.copy_id
                            WHERE l.student_id = $1
                              AND pc.book_id::text = $2
                              AND l.status = 'Active'
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM holds AS h
                            WHERE h.student_id = $1
                              AND h.book_id::text = $2
                              AND h.status = 'Ready'
                        )
                    ) AS "hasDuplicate"
                `,
                [student.id, params.bookId],
            );
            if (duplicateResult.rows[0]?.hasDuplicate) {
                throw Object.assign(new Error("Student already has an active loan or hold for this title"), {
                    code: "DUPLICATE_HOLD_OR_LOAN",
                });
            }

            const copyResult = await client.query<
                QueryResultRow & { id: string }
            >(
                `
                    SELECT pc.id::text AS "id"
                    FROM physical_copies AS pc
                    JOIN books AS b ON b.id = pc.book_id
                    WHERE b.id::text = $1 AND pc.state = 'Available'
                    ORDER BY pc.id
                    LIMIT 1
                    FOR UPDATE OF pc SKIP LOCKED
                `,
                [params.bookId],
            );
            const copy = copyResult.rows[0];
            if (!copy) {
                await client.query("COMMIT");
                return "no_available_copies";
            }

            await client.query("SELECT pg_advisory_xact_lock($1, $2)", [73112, 1]);
            const codeResult = await client.query<
                QueryResultRow & { holdCode: string }
            >(
                `
                    SELECT 'HLD-' || lpad(
                        (COALESCE(MAX((substring(hold_code FROM '^HLD-([0-9]+)$'))::bigint), 0) + 1)::text,
                        4,
                        '0'
                    ) AS "holdCode"
                    FROM holds
                `,
            );
            const holdCode = codeResult.rows[0]?.holdCode;
            if (!holdCode) {
                throw new Error("Unable to generate hold reference");
            }

            const updateCopyResult = await client.query(
                `
                    UPDATE physical_copies
                    SET state = 'Reserved', updated_at = CURRENT_TIMESTAMP
                    WHERE id = $1 AND state = 'Available'
                `,
                [copy.id],
            );
            if (updateCopyResult.rowCount !== 1) {
                await client.query("ROLLBACK");
                return "no_available_copies";
            }

            const insertResult = await client.query<
                QueryResultRow & { id: string }
            >(
                `
                    INSERT INTO holds (hold_code, student_id, book_id, copy_id, status, collect_by)
                    VALUES ($1, $2, $3, $4, 'Ready', $5)
                    RETURNING id::text AS "id"
                `,
                [holdCode, student.id, params.bookId, copy.id, params.collectBy],
            );
            const holdId = insertResult.rows[0]?.id;
            if (!holdId) {
                throw new Error("Hold insert did not return an ID");
            }

            const holdResult = await client.query<HoldRow>(
                `
                    SELECT ${holdDetailSelect}
                    ${holdDetailFrom}
                    WHERE h.id::text = $1
                `,
                [holdId],
            );
            const hold = holdResult.rows[0];
            if (!hold) {
                throw new Error("Created hold could not be loaded");
            }

            await client.query("COMMIT");
            return mapHold(hold);
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }

    async cancelHold(params: {
        id: string;
    }): Promise<CancelHoldResultEntity | "not_found" | "not_cancellable"> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const holdResult = await client.query<
                QueryResultRow & {
                    id: string;
                    holdCode: string;
                    status: HoldStatus;
                    copyId: string | null;
                    copyCode: string | null;
                }
            >(
                `
                    SELECT
                        h.id::text AS "id",
                        h.hold_code AS "holdCode",
                        h.status AS "status",
                        pc.id::text AS "copyId",
                        pc.copy_code AS "copyCode"
                    FROM holds AS h
                    LEFT JOIN physical_copies AS pc ON pc.id = h.copy_id
                    WHERE h.id::text = $1 OR h.hold_code = $1
                    ORDER BY CASE WHEN h.id::text = $1 THEN 0 ELSE 1 END
                    LIMIT 1
                    FOR UPDATE OF h
                `,
                [params.id],
            );
            const hold = holdResult.rows[0];
            if (!hold) {
                await client.query("COMMIT");
                return "not_found";
            }
            if (hold.status !== "Ready") {
                await client.query("COMMIT");
                return "not_cancellable";
            }

            if (hold.copyId !== null) {
                const copyResult = await client.query(
                    `
                        UPDATE physical_copies
                        SET state = 'Available', updated_at = CURRENT_TIMESTAMP
                        WHERE id::text = $1 AND state = 'Reserved'
                    `,
                    [hold.copyId],
                );
                if (copyResult.rowCount !== 1) {
                    throw Object.assign(
                        new Error("Reserved copy state is inconsistent with its active hold"),
                        { code: "HOLD_COPY_STATE_CONFLICT" },
                    );
                }
            }

            const updateHoldResult = await client.query(
                `
                    UPDATE holds
                    SET status = 'Cancelled'
                    WHERE id::text = $1 AND status = 'Ready'
                `,
                [hold.id],
            );
            if (updateHoldResult.rowCount !== 1) {
                throw Object.assign(new Error("Hold could not be cancelled"), {
                    code: "HOLD_STATE_CONFLICT",
                });
            }

            await client.query("COMMIT");
            return {
                id: hold.id,
                holdCode: hold.holdCode,
                status: "Cancelled",
                releasedCopyCode: hold.copyCode,
            };
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        }
    }
}