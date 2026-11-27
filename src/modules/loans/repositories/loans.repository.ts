import type { Pool, PoolClient, QueryResultRow } from "pg";

import type {
    BorrowerWithStatsEntity,
    CheckoutCopyEntity,
    IssueLoansResultEntity,
    LoanRecordsResultEntity,
    LoanWithDetailEntity,
    ReadyHoldEntity,
    RenewLoanResultEntity,
    ReturnLoanResultEntity,
} from "../loans.entity.js";
import type {
    BorrowersRepository,
    LoanCopiesRepository,
    LoanHoldsRepository,
    LoansRepository,
} from "./loans.repository.interface.js";

interface BorrowerRow extends QueryResultRow {
    _id: string;
    accountId: string;
    fullName: string;
    yearGroup: string | null;
    status: "Active" | "Inactive";
    activeLoansCount: number | string;
    maxLoansLimit: number | string;
    overdueLoansCount: number | string;
    unpaidFines: number | string;
}

interface LoanRow extends QueryResultRow {
    _id: string;
    borrowCode: string;
    status: "Active" | "Returned";
    borrowedAt: string;
    dueDate: string;
    returnedAt: string | null;
    returnCondition: "Good" | "Damaged" | "Lost" | null;
    renewalCount: number | string;
    bookId: string;
    bookTitle: string;
    bookAuthor: string;
    bookCoverImageUrl: string | null;
    copyId: string;
    copyCode: string;
    copyCondition: "Good" | "Damaged" | "Lost";
    copyHomeLocation: string;
    borrowerId: string;
    borrowerAccountId: string;
    borrowerFullName: string;
    borrowerYearGroup: string | null;
    borrowerActiveLoansCount: number | string;
    borrowerMaxLoansLimit: number | string;
}

const borrowerStatsSelect = `
    u.id::text AS "_id",
    u.account_id AS "accountId",
    u.full_name AS "fullName",
    u.year_group AS "yearGroup",
    u.status AS "status",
    (SELECT COUNT(*)::int FROM loans l
     WHERE l.student_id = u.id AND l.status = 'Active') AS "activeLoansCount",
    u.max_loans_limit AS "maxLoansLimit",
    (SELECT COUNT(*)::int FROM loans l
     WHERE l.student_id = u.id AND l.status = 'Active' AND l.due_date < CURRENT_DATE) AS "overdueLoansCount",
    COALESCE((SELECT SUM(f.amount) FROM fines f
     WHERE f.student_id = u.id AND f.status = 'Unpaid'), 0)::float8 AS "unpaidFines"
`;

const loanDetailSelect = `
    l.id::text AS "_id",
    l.borrow_code AS "borrowCode",
    l.status AS "status",
    l.borrowed_at::date::text AS "borrowedAt",
    l.due_date::text AS "dueDate",
    l.returned_at::text AS "returnedAt",
    l.return_condition AS "returnCondition",
    l.renewal_count AS "renewalCount",
    b.id::text AS "bookId",
    b.title AS "bookTitle",
    b.author AS "bookAuthor",
    b.cover_image_url AS "bookCoverImageUrl",
    pc.id::text AS "copyId",
    pc.copy_code AS "copyCode",
    pc.condition AS "copyCondition",
    pc.home_location AS "copyHomeLocation",
    u.id::text AS "borrowerId",
    u.account_id AS "borrowerAccountId",
    u.full_name AS "borrowerFullName",
    u.year_group AS "borrowerYearGroup",
    (SELECT COUNT(*)::int FROM loans x
     WHERE x.student_id = u.id AND x.status = 'Active') AS "borrowerActiveLoansCount",
    u.max_loans_limit AS "borrowerMaxLoansLimit"
`;

const loanDetailFrom = `
    FROM loans l
    JOIN physical_copies pc ON pc.id = l.copy_id
    JOIN books b ON b.id = pc.book_id
    JOIN users u ON u.id = l.student_id
`;

function initialsFromName(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? parts[parts.length - 1]?.[0] ?? "" : ""}`.toUpperCase();
}

function mapBorrower(row: BorrowerRow): BorrowerWithStatsEntity {
    return {
        _id: row._id,
        accountId: row.accountId,
        fullName: row.fullName,
        initials: initialsFromName(row.fullName),
        yearGroup: row.yearGroup,
        status: row.status,
        activeLoansCount: Number(row.activeLoansCount),
        maxLoansLimit: Number(row.maxLoansLimit),
        overdueLoansCount: Number(row.overdueLoansCount),
        unpaidFines: Number(row.unpaidFines),
    };
}

function mapLoan(row: LoanRow): LoanWithDetailEntity {
    return {
        _id: row._id,
        borrowCode: row.borrowCode,
        status: row.status,
        borrowedAt: row.borrowedAt,
        dueDate: row.dueDate,
        returnedAt: row.returnedAt,
        returnCondition: row.returnCondition,
        renewalCount: Number(row.renewalCount),
        book: {
            _id: row.bookId,
            title: row.bookTitle,
            author: row.bookAuthor,
            coverImageUrl: row.bookCoverImageUrl,
        },
        copy: {
            _id: row.copyId,
            copyCode: row.copyCode,
            condition: row.copyCondition,
            homeLocation: row.copyHomeLocation,
        },
        borrower: {
            _id: row.borrowerId,
            accountId: row.borrowerAccountId,
            fullName: row.borrowerFullName,
            initials: initialsFromName(row.borrowerFullName),
            yearGroup: row.borrowerYearGroup,
            activeLoansCount: Number(row.borrowerActiveLoansCount),
            maxLoansLimit: Number(row.borrowerMaxLoansLimit),
        },
    };
}

async function rollback(client: PoolClient): Promise<void> {
    await client.query("ROLLBACK");
}

export class BorrowersRepositoryImpl implements BorrowersRepository {
    constructor(private readonly pool: Pool) {}

    async getBorrowerWithStatsByAccountId(
        accountId: string,
    ): Promise<BorrowerWithStatsEntity | null> {
        const result = await this.pool.query<BorrowerRow>(
            `SELECT ${borrowerStatsSelect}
             FROM users u
             WHERE u.role = 'student' AND u.account_id = $1
             LIMIT 1`,
            [accountId],
        );
        return result.rows[0] ? mapBorrower(result.rows[0]) : null;
    }

    async getBorrowerWithStatsById(userId: string): Promise<BorrowerWithStatsEntity | null> {
        const result = await this.pool.query<BorrowerRow>(
            `SELECT ${borrowerStatsSelect}
             FROM users u
             WHERE u.role = 'student' AND u.id::text = $1
             LIMIT 1`,
            [userId],
        );
        return result.rows[0] ? mapBorrower(result.rows[0]) : null;
    }
}

export class LoansRepositoryImpl implements LoansRepository {
    constructor(private readonly pool: Pool) {}

    async getLoanWithDetailByIdOrBorrowCode(
        idOrBorrowCode: string,
    ): Promise<LoanWithDetailEntity | null> {
        const result = await this.pool.query<LoanRow>(
            `SELECT ${loanDetailSelect}
             ${loanDetailFrom}
             WHERE l.id::text = $1 OR l.borrow_code = $1
             ORDER BY CASE WHEN l.id::text = $1 THEN 0 ELSE 1 END
             LIMIT 1`,
            [idOrBorrowCode],
        );
        return result.rows[0] ? mapLoan(result.rows[0]) : null;
    }

    async getActiveLoanWithDetailByCopyCode(
        copyCode: string,
    ): Promise<LoanWithDetailEntity | null> {
        const result = await this.pool.query<LoanRow>(
            `SELECT ${loanDetailSelect}
             ${loanDetailFrom}
             WHERE pc.copy_code = $1 AND l.status = 'Active'
             ORDER BY l.borrowed_at DESC, l.id DESC
             LIMIT 1`,
            [copyCode],
        );
        return result.rows[0] ? mapLoan(result.rows[0]) : null;
    }

    async getCurrentLoansWithDetailByStudentId(studentId: string): Promise<LoanWithDetailEntity[]> {
        const result = await this.pool.query<LoanRow>(
            `SELECT ${loanDetailSelect}
             ${loanDetailFrom}
             WHERE l.student_id::text = $1 AND l.status = 'Active'
             ORDER BY l.due_date ASC, l.id ASC`,
            [studentId],
        );
        return result.rows.map(mapLoan);
    }

    async getReturnedLoansWithDetailByStudentId(studentId: string): Promise<LoanWithDetailEntity[]> {
        const result = await this.pool.query<LoanRow>(
            `SELECT ${loanDetailSelect}
             ${loanDetailFrom}
             WHERE l.student_id::text = $1 AND l.status = 'Returned'
             ORDER BY l.returned_at DESC, l.id DESC`,
            [studentId],
        );
        return result.rows.map(mapLoan);
    }

    async getLoanRecords(params: {
        tab: "active" | "returned";
        q?: string | undefined;
        status?: "overdue" | "due_soon" | "on_loan" | undefined;
        sortBy: "dueDate" | "borrowedAt" | "returnedAt";
        sortOrder: "asc" | "desc";
        page: number;
        limit: number;
    }): Promise<LoanRecordsResultEntity> {
        if (!Number.isSafeInteger(params.page) || params.page < 1) {
            throw new RangeError("page must be a positive safe integer");
        }
        if (!Number.isSafeInteger(params.limit) || params.limit < 1) {
            throw new RangeError("limit must be a positive safe integer");
        }
        const conditions = ["l.status = $1"];
        const countValues: unknown[] = [params.tab === "active" ? "Active" : "Returned"];
        if (params.q?.trim()) {
            countValues.push(`%${params.q.trim()}%`);
            const q = `$${countValues.length}`;
            conditions.push(`(
                l.borrow_code ILIKE ${q} OR pc.copy_code ILIKE ${q}
                OR u.account_id ILIKE ${q} OR u.full_name ILIKE ${q} OR b.title ILIKE ${q}
            )`);
        }
        if (params.tab === "active" && params.status) {
            if (params.status === "overdue") conditions.push("l.due_date < CURRENT_DATE");
            else if (params.status === "due_soon") {
                conditions.push("l.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + 1");
            } else conditions.push("l.due_date > CURRENT_DATE + 1");
        }
        const where = `WHERE ${conditions.join(" AND ")}`;
        const sortColumns = {
            dueDate: "l.due_date",
            borrowedAt: "l.borrowed_at",
            returnedAt: "l.returned_at",
        } as const;
        const sortColumn = params.tab === "active" && params.sortBy === "returnedAt"
            ? sortColumns.dueDate
            : sortColumns[params.sortBy];
        const direction = params.sortOrder === "desc" ? "DESC" : "ASC";
        const queryValues = [...countValues, params.limit, (params.page - 1) * params.limit];
        const [loans, count] = await Promise.all([
            this.pool.query<LoanRow>(
                `SELECT ${loanDetailSelect}
                 ${loanDetailFrom}
                 ${where}
                 ORDER BY ${sortColumn} ${direction} NULLS LAST, l.id ${direction}
                 LIMIT $${queryValues.length - 1} OFFSET $${queryValues.length}`,
                queryValues,
            ),
            this.pool.query<QueryResultRow & { totalItem: number | string }>(
                `SELECT COUNT(*)::int AS "totalItem"
                 ${loanDetailFrom}
                 ${where}`,
                countValues,
            ),
        ]);
        return {
            loans: loans.rows.map(mapLoan),
            totalItem: Number(count.rows[0]?.totalItem ?? 0),
        };
    }

    async issueLoans(params: {
        studentId: string;
        items: { copyCode: string; dueDate: string }[];
    }): Promise<IssueLoansResultEntity | null> {
        if (params.items.length === 0) throw new RangeError("At least one copy is required");
        const copyCodes = params.items.map((item) => item.copyCode);
        if (new Set(copyCodes).size !== copyCodes.length) {
            throw Object.assign(new Error("Duplicate copy in checkout batch"), {
                code: "DUPLICATE_COPY_IN_BATCH",
            });
        }

        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const borrowerResult = await client.query<
                QueryResultRow & { id: string; status: "Active" | "Inactive"; maxLoansLimit: number | string }
            >(
                `SELECT u.id::text AS "id", u.status AS "status",
                        u.max_loans_limit AS "maxLoansLimit"
                 FROM users u
                 WHERE u.id::text = $1 AND u.role = 'student'
                 FOR UPDATE`,
                [params.studentId],
            );
            const borrower = borrowerResult.rows[0];
            if (!borrower) {
                throw Object.assign(new Error("Student account not found"), { code: "STUDENT_NOT_FOUND" });
            }

            const statsResult = await client.query<
                QueryResultRow & { activeLoans: number | string; overdueLoans: number | string; unpaidFines: number | string }
            >(
                `SELECT
                    (SELECT COUNT(*)::int FROM loans l
                     WHERE l.student_id = $1 AND l.status = 'Active') AS "activeLoans",
                    (SELECT COUNT(*)::int FROM loans l
                     WHERE l.student_id = $1 AND l.status = 'Active'
                       AND l.due_date < CURRENT_DATE) AS "overdueLoans",
                    COALESCE((SELECT SUM(f.amount) FROM fines f
                     WHERE f.student_id = $1 AND f.status = 'Unpaid'), 0)::float8 AS "unpaidFines"`,
                [borrower.id],
            );
            const stats = statsResult.rows[0];
            const loansBefore = Number(stats?.activeLoans ?? 0);
            if (
                borrower.status !== "Active"
                || Number(stats?.overdueLoans ?? 0) > 0
                || Number(stats?.unpaidFines ?? 0) > 0
            ) {
                throw Object.assign(new Error("Student is not eligible for checkout"), {
                    code: "BORROWER_INELIGIBLE",
                });
            }
            if (loansBefore + params.items.length > Number(borrower.maxLoansLimit)) {
                throw Object.assign(new Error("Checkout exceeds the student's loan limit"), {
                    code: "LOAN_LIMIT_EXCEEDED",
                });
            }

            const copiesResult = await client.query<
                QueryResultRow & { copyCode: string; state: string; holdStudentId: string | null }
            >(
                `SELECT pc.copy_code AS "copyCode", pc.state AS "state",
                        ready_hold.student_id::text AS "holdStudentId"
                 FROM physical_copies pc
                 LEFT JOIN LATERAL (
                     SELECT h.student_id
                     FROM holds h
                     WHERE h.copy_id = pc.id AND h.status = 'Ready'
                     ORDER BY h.requested_at DESC, h.id DESC
                     LIMIT 1
                 ) ready_hold ON TRUE
                 WHERE pc.copy_code = ANY($1::text[])
                 ORDER BY pc.id
                 FOR UPDATE OF pc`,
                [copyCodes],
            );
            const byCode = new Map(copiesResult.rows.map((row) => [row.copyCode, row]));
            const lockedCopies = copyCodes.map((code) => byCode.get(code));
            const unavailable = lockedCopies.some((copy) =>
                !copy || (copy.state !== "Available"
                    && !(copy.state === "Reserved" && copy.holdStudentId === borrower.id)),
            );
            if (unavailable) {
                await rollback(client);
                return null;
            }

            await client.query("SELECT pg_advisory_xact_lock($1, $2)", [73113, 1]);
            const latestResult = await client.query<QueryResultRow & { latestCode: string | null }>(
                `SELECT MAX(substring(borrow_code FROM '^BR-([0-9]+)$')::numeric)::text AS "latestCode"
                 FROM loans`,
            );
            const latestCode = BigInt(latestResult.rows[0]?.latestCode ?? "2000");
            const loanIds: string[] = [];
            for (let index = 0; index < params.items.length; index += 1) {
                const item = params.items[index]!;
                const borrowCode = `BR-${String(latestCode + BigInt(index + 1)).padStart(4, "0")}`;
                const inserted = await client.query<QueryResultRow & { id: string }>(
                    `INSERT INTO loans (borrow_code, student_id, copy_id, due_date)
                     SELECT $1, $2, pc.id, $4::date
                     FROM physical_copies pc
                     WHERE pc.copy_code = $3
                     RETURNING id::text AS "id"`,
                    [borrowCode, borrower.id, item.copyCode, item.dueDate],
                );
                if (!inserted.rows[0]) throw new Error(`Failed to insert loan for ${item.copyCode}`);
                loanIds.push(inserted.rows[0].id);
            }

            const copiesUpdated = await client.query(
                `UPDATE physical_copies
                 SET state = 'Borrowed', updated_at = CURRENT_TIMESTAMP
                 WHERE copy_code = ANY($1::text[])`,
                [copyCodes],
            );
            if (copiesUpdated.rowCount !== copyCodes.length) {
                throw new Error("Not all checked-out copies were updated");
            }
            const fulfilled = await client.query<
                QueryResultRow & { holdCode: string; copyCode: string }
            >(
                `UPDATE holds h
                 SET status = 'Fulfilled'
                 FROM physical_copies pc
                 WHERE h.copy_id = pc.id AND h.student_id::text = $1
                   AND h.status = 'Ready' AND pc.copy_code = ANY($2::text[])
                 RETURNING h.hold_code AS "holdCode", pc.copy_code AS "copyCode"`,
                [borrower.id, copyCodes],
            );
            const entries = await client.query<
                QueryResultRow & {
                    _id: string; borrowCode: string; copyId: string; copyCode: string;
                    bookId: string; bookTitle: string; bookAuthor: string;
                    bookCoverImageUrl: string | null; borrowedAt: string; dueDate: string;
                }
            >(
                `SELECT l.id::text AS "_id", l.borrow_code AS "borrowCode",
                        pc.id::text AS "copyId", pc.copy_code AS "copyCode",
                        b.id::text AS "bookId", b.title AS "bookTitle", b.author AS "bookAuthor",
                        b.cover_image_url AS "bookCoverImageUrl",
                        l.borrowed_at::date::text AS "borrowedAt", l.due_date::text AS "dueDate"
                 FROM loans l
                 JOIN physical_copies pc ON pc.id = l.copy_id
                 JOIN books b ON b.id = pc.book_id
                 WHERE l.id::text = ANY($1::text[])
                 ORDER BY array_position($1::text[], l.id::text)`,
                [loanIds],
            );
            const issuedAt = await client.query<QueryResultRow & { issuedAt: string }>(
                "SELECT CURRENT_TIMESTAMP::text AS \"issuedAt\"",
            );
            const loansNow = loansBefore + entries.rows.length;
            await client.query(
                `UPDATE users SET active_loans_count = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1`,
                [borrower.id, loansNow],
            );
            await client.query("COMMIT");

            return {
                issuedAt: issuedAt.rows[0]!.issuedAt,
                borrowEntries: entries.rows.map((row) => ({
                    _id: row._id,
                    borrowCode: row.borrowCode,
                    copyId: row.copyId,
                    copyCode: row.copyCode,
                    book: {
                        _id: row.bookId,
                        title: row.bookTitle,
                        author: row.bookAuthor,
                        coverImageUrl: row.bookCoverImageUrl,
                    },
                    borrowedAt: row.borrowedAt,
                    dueDate: row.dueDate,
                })),
                fulfilledHolds: fulfilled.rows.map((row) => ({
                    holdCode: row.holdCode,
                    copyCode: row.copyCode,
                })),
                loansBefore,
                loansNow,
            };
        } catch (error) {
            await rollback(client);
            throw error;
        } finally {
            client.release();
        }
    }

    async returnLoan(params: {
        loanId: string;
        condition: "Good" | "Damaged" | "Lost";
        conditionNote?: string | undefined;
    }): Promise<ReturnLoanResultEntity | null> {
        const client = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const selected = await client.query<
                QueryResultRow & {
                    id: string; studentId: string; borrowerAccountId: string;
                    borrowerFullName: string; borrowedAt: string; dueDate: string; copyId: string;
                }
            >(
                `SELECT l.id::text AS "id", l.student_id::text AS "studentId",
                        u.account_id AS "borrowerAccountId", u.full_name AS "borrowerFullName",
                        l.borrowed_at::date::text AS "borrowedAt", l.due_date::text AS "dueDate",
                        pc.id::text AS "copyId"
                 FROM loans l
                 JOIN users u ON u.id = l.student_id
                 JOIN physical_copies pc ON pc.id = l.copy_id
                 WHERE l.id::text = $1 AND l.status = 'Active'
                 FOR UPDATE OF l, u, pc`,
                [params.loanId],
            );
            const loan = selected.rows[0];
            if (!loan) {
                await rollback(client);
                return null;
            }
            const count = await client.query<QueryResultRow & { loansBefore: number | string }>(
                `SELECT COUNT(*)::int AS "loansBefore"
                 FROM loans WHERE student_id::text = $1 AND status = 'Active'`,
                [loan.studentId],
            );
            const loansBefore = Number(count.rows[0]?.loansBefore ?? 0);
            const updated = await client.query<
                QueryResultRow & {
                    borrowCode: string; returnedAt: string;
                    returnCondition: "Good" | "Damaged" | "Lost"; conditionNote: string | null;
                }
            >(
                `UPDATE loans
                 SET status = 'Returned', returned_at = CURRENT_TIMESTAMP,
                     return_condition = $2, return_condition_note = $3
                 WHERE id::text = $1 AND status = 'Active'
                 RETURNING borrow_code AS "borrowCode", returned_at::text AS "returnedAt",
                           return_condition AS "returnCondition",
                           return_condition_note AS "conditionNote"`,
                [loan.id, params.condition, params.conditionNote ?? null],
            );
            const returned = updated.rows[0];
            if (!returned) {
                await rollback(client);
                return null;
            }
            const copyNewState = params.condition === "Good" ? "Available" : params.condition;
            const copyResult = await client.query<
                QueryResultRow & { copyCode: string; homeLocation: string }
            >(
                `UPDATE physical_copies
                 SET state = $2, condition = $3, updated_at = CURRENT_TIMESTAMP
                 WHERE id::text = $1
                 RETURNING copy_code AS "copyCode", home_location AS "homeLocation"`,
                [loan.copyId, copyNewState, params.condition],
            );
            const copy = copyResult.rows[0];
            if (!copy) throw new Error("Returned copy could not be updated");

            const loansAfter = Math.max(0, loansBefore - 1);
            await client.query(
                `UPDATE users SET active_loans_count = $2, updated_at = CURRENT_TIMESTAMP WHERE id::text = $1`,
                [loan.studentId, loansAfter],
            );
            await client.query("COMMIT");
            return {
                _id: loan.id,
                borrowCode: returned.borrowCode,
                status: "Returned",
                borrowerAccountId: loan.borrowerAccountId,
                borrowerFullName: loan.borrowerFullName,
                loansBefore,
                loansAfter,
                borrowedAt: loan.borrowedAt,
                dueDate: loan.dueDate,
                returnedAt: returned.returnedAt,
                returnCondition: returned.returnCondition,
                conditionNote: returned.conditionNote,
                copyCode: copy.copyCode,
                copyNewState,
                copyHomeLocation: copy.homeLocation,
            };
        } catch (error) {
            await rollback(client);
            throw error;
        } finally {
            client.release();
        }
    }

    async renewLoan(params: { loanId: string; extraDays: number }): Promise<RenewLoanResultEntity | null> {
        if (!Number.isSafeInteger(params.extraDays) || params.extraDays < 1) {
            throw new RangeError("extraDays must be a positive safe integer");
        }
        const result = await this.pool.query<
            QueryResultRow & {
                _id: string; borrowCode: string; previousDueDate: string;
                newDueDate: string; renewalCount: number;
            }
        >(
            `UPDATE loans
             SET due_date = due_date + $2::int, renewal_count = renewal_count + 1
             WHERE id::text = $1 AND status = 'Active' AND renewal_count < 1
             RETURNING id::text AS "_id", borrow_code AS "borrowCode",
                       (due_date - $2::int)::text AS "previousDueDate",
                       due_date::text AS "newDueDate", renewal_count AS "renewalCount"`,
            [params.loanId, params.extraDays],
        );
        const row = result.rows[0];
        return row
            ? {
                  _id: row._id,
                  borrowCode: row.borrowCode,
                  previousDueDate: row.previousDueDate,
                  newDueDate: row.newDueDate,
                  renewalCount: row.renewalCount,
              }
            : null;
    }
}

export class LoanCopiesRepositoryImpl implements LoanCopiesRepository {
    constructor(private readonly pool: Pool) {}

    async getCopiesForCheckoutByCopyCodes(copyCodes: string[]): Promise<CheckoutCopyEntity[]> {
        if (copyCodes.length === 0) return [];
        const result = await this.pool.query<
            QueryResultRow & {
                _id: string; copyCode: string; state: CheckoutCopyEntity["state"];
                condition: CheckoutCopyEntity["condition"]; homeLocation: string;
                bookId: string; bookTitle: string; bookAuthor: string;
                bookCoverImageUrl: string | null;
                loanBorrowCode: string | null; loanStudentName: string | null;
                loanStudentAccountId: string | null; loanDueDate: string | null;
                holdId: string | null; holdCode: string | null; holdStudentName: string | null;
                holdStudentAccountId: string | null; holdCollectBy: string | null;
            }
        >(
            `SELECT
                pc.id::text AS "_id", pc.copy_code AS "copyCode", pc.state AS "state",
                pc.condition AS "condition", pc.home_location AS "homeLocation",
                b.id::text AS "bookId", b.title AS "bookTitle", b.author AS "bookAuthor",
                b.cover_image_url AS "bookCoverImageUrl",
                active_loan.borrow_code AS "loanBorrowCode",
                active_loan.student_name AS "loanStudentName",
                active_loan.student_account_id AS "loanStudentAccountId",
                active_loan.due_date AS "loanDueDate",
                active_hold.id AS "holdId", active_hold.hold_code AS "holdCode",
                active_hold.student_name AS "holdStudentName",
                active_hold.student_account_id AS "holdStudentAccountId",
                active_hold.collect_by AS "holdCollectBy"
             FROM physical_copies pc
             JOIN books b ON b.id = pc.book_id
             LEFT JOIN LATERAL (
                 SELECT l.borrow_code, u.full_name AS student_name,
                        u.account_id AS student_account_id, l.due_date::text AS due_date
                 FROM loans l JOIN users u ON u.id = l.student_id
                 WHERE l.copy_id = pc.id AND l.status = 'Active'
                 ORDER BY l.borrowed_at DESC, l.id DESC LIMIT 1
             ) active_loan ON TRUE
             LEFT JOIN LATERAL (
                 SELECT h.id::text AS id, h.hold_code, u.full_name AS student_name,
                        u.account_id AS student_account_id, h.collect_by::text AS collect_by
                 FROM holds h JOIN users u ON u.id = h.student_id
                 WHERE h.copy_id = pc.id AND h.status = 'Ready'
                 ORDER BY h.requested_at DESC, h.id DESC LIMIT 1
             ) active_hold ON TRUE
             WHERE pc.copy_code = ANY($1::text[])
             ORDER BY pc.copy_code`,
            [copyCodes],
        );
        return result.rows.map((row) => ({
            _id: row._id,
            copyCode: row.copyCode,
            state: row.state,
            condition: row.condition,
            homeLocation: row.homeLocation,
            book: {
                _id: row.bookId,
                title: row.bookTitle,
                author: row.bookAuthor,
                coverImageUrl: row.bookCoverImageUrl,
            },
            activeLoan: row.loanBorrowCode
                ? {
                      borrowCode: row.loanBorrowCode,
                      studentName: row.loanStudentName!,
                      studentAccountId: row.loanStudentAccountId!,
                      dueDate: row.loanDueDate!,
                  }
                : null,
            activeHold: row.holdId
                ? {
                      _id: row.holdId,
                      holdCode: row.holdCode!,
                      studentName: row.holdStudentName!,
                      studentAccountId: row.holdStudentAccountId!,
                      collectBy: row.holdCollectBy!,
                  }
                : null,
        }));
    }
}

export class LoanHoldsRepositoryImpl implements LoanHoldsRepository {
    constructor(private readonly pool: Pool) {}

    async getReadyHoldsByStudentId(studentId: string): Promise<ReadyHoldEntity[]> {
        const result = await this.pool.query<
            QueryResultRow & {
                _id: string; holdCode: string; status: "Ready"; requestedAt: string;
                collectBy: string; bookId: string; bookTitle: string; bookAuthor: string;
                bookFormat: string; bookCoverImageUrl: string | null;
                copyId: string | null; copyCode: string | null; copyHomeLocation: string | null;
            }
        >(
            `SELECT
                h.id::text AS "_id", h.hold_code AS "holdCode", h.status AS "status",
                h.requested_at::text AS "requestedAt", h.collect_by::text AS "collectBy",
                b.id::text AS "bookId", b.title AS "bookTitle", b.author AS "bookAuthor",
                b.format AS "bookFormat", b.cover_image_url AS "bookCoverImageUrl",
                pc.id::text AS "copyId", pc.copy_code AS "copyCode",
                pc.home_location AS "copyHomeLocation"
             FROM holds h
             JOIN books b ON b.id = h.book_id
             LEFT JOIN physical_copies pc ON pc.id = h.copy_id
             WHERE h.student_id::text = $1 AND h.status = 'Ready'
             ORDER BY h.requested_at DESC, h.id DESC`,
            [studentId],
        );
        return result.rows.map((row) => ({
            _id: row._id,
            holdCode: row.holdCode,
            status: row.status,
            requestedAt: row.requestedAt,
            collectBy: row.collectBy,
            book: {
                _id: row.bookId,
                title: row.bookTitle,
                author: row.bookAuthor,
                format: row.bookFormat,
                coverImageUrl: row.bookCoverImageUrl,
            },
            copy: row.copyId && row.copyCode && row.copyHomeLocation
                ? { _id: row.copyId, copyCode: row.copyCode, homeLocation: row.copyHomeLocation }
                : null,
        }));
    }

    async getBookIdsWithReadyHold(bookIds: string[]): Promise<string[]> {
        if (bookIds.length === 0) return [];
        const result = await this.pool.query<QueryResultRow & { bookId: string }>(
            `SELECT DISTINCT h.book_id::text AS "bookId"
             FROM holds h
             WHERE h.status = 'Ready' AND h.book_id::text = ANY($1::text[])`,
            [bookIds],
        );
        return result.rows.map((row) => row.bookId);
    }
}