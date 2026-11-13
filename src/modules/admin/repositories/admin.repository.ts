import type { Pool, PoolClient, QueryResultRow } from "pg";

import { AdminUserEntity, type AdminUserWithStatsEntity } from "../admin.entity.js";
import type { AdminRepository } from "./admin.repository.interface.js";

interface AdminUserStatsRow extends QueryResultRow {
    _id: string;
    accountId: string;
    fullName: string;
    role: string;
    status: string;
    yearGroup: string | null;
    activeLoansCount: number;
    maxLoansLimit: number;
    overdueLoansCount: number;
    unpaidFines: number | string;
    hasBorrowingHistory: boolean;
    createdAt: string;
    updatedAt: string;
}

const userStatsColumns = `
    u.id::text AS "_id",
    u.account_id AS "accountId",
    u.full_name AS "fullName",
    u.role AS "role",
    u.status AS "status",
    u.year_group AS "yearGroup",
    (
        SELECT COUNT(*)::int
        FROM loans AS l
        WHERE l.student_id = u.id
          AND l.status = 'Active'
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
        WHERE f.student_id = u.id
          AND f.status = 'Unpaid'
    ), 0)::float8 AS "unpaidFines",
    (
        EXISTS (SELECT 1 FROM loans AS l WHERE l.student_id = u.id)
        OR EXISTS (SELECT 1 FROM holds AS h WHERE h.student_id = u.id)
    ) AS "hasBorrowingHistory",
    u.created_at::text AS "createdAt",
    u.updated_at::text AS "updatedAt"
`;
import type { Pool, PoolClient, QueryResultRow } from "pg";

import { AdminUserEntity, type AdminUserWithStatsEntity } from "../admin.entity.js";
import type { AdminRepository } from "./admin.repository.interface.js";

interface AdminUserStatsRow extends QueryResultRow {
    _id: string;
    accountId: string;
    fullName: string;
    role: string;
    status: string;
    yearGroup: string | null;
    activeLoansCount: number;
    maxLoansLimit: number;
    overdueLoansCount: number;
    unpaidFines: number | string;
    hasBorrowingHistory: boolean;
    createdAt: string;
    updatedAt: string;
}

const userStatsColumns = `
    u.id::text AS "_id",
    u.account_id AS "accountId",
    u.full_name AS "fullName",
    u.role AS "role",
    u.status AS "status",
    u.year_group AS "yearGroup",
    (
        SELECT COUNT(*)::int
        FROM loans AS l
        WHERE l.student_id = u.id
          AND l.status = 'Active'
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
        WHERE f.student_id = u.id
          AND f.status = 'Unpaid'
    ), 0)::float8 AS "unpaidFines",
    (
        EXISTS (SELECT 1 FROM loans AS l WHERE l.student_id = u.id)
        OR EXISTS (SELECT 1 FROM holds AS h WHERE h.student_id = u.id)
    ) AS "hasBorrowingHistory",
    u.created_at::text AS "createdAt",
    u.updated_at::text AS "updatedAt"
`;

function initialsFromName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
}

function toUserWithStats(row: AdminUserStatsRow): AdminUserWithStatsEntity {
    return {
        ...row,
        initials: initialsFromName(row.fullName),
        activeLoansCount: Number(row.activeLoansCount),
        maxLoansLimit: Number(row.maxLoansLimit),
        overdueLoansCount: Number(row.overdueLoansCount),
        unpaidFines: Number(row.unpaidFines),
    };
}

function userIdCondition(): string {
    return "(u.account_id = $1 OR u.id::text = $1)";
}


function toUserWithStats(row: AdminUserStatsRow): AdminUserWithStatsEntity {
    return {
        id: row._id,
        accountId: row.accountId,
        fullName: row.fullName,
        role: row.role,
        status: row.status,
        yearGroup: row.yearGroup,
        hasBorrowingHistory: row.hasBorrowingHistory,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,

        initials: initialsFromName(row.fullName),
        activeLoansCount: Number(row.activeLoansCount),
        maxLoansLimit: Number(row.maxLoansLimit),
        overdueLoansCount: Number(row.overdueLoansCount),
        unpaidFines: Number(row.unpaidFines),
    };
}

function userIdCondition(): string {
    return "(u.account_id = $1 OR u.id::text = $1)";
}

export class AdminRepositoryImpl implements AdminRepository {
    constructor(private readonly pool: Pool) {}

    async getUsersWithStats(params: {
        q?: string;
        role?: "student" | "staff" | "admin";
        status?: "Active" | "Inactive";
        page?: number;
        limit?: number;
    }): Promise<{ usersWithStats: AdminUserWithStatsEntity[]; totalItem: number }> {
        const conditions: string[] = [];
        const values: unknown[] = [];

        if (params.q?.trim()) {
            values.push(`%${params.q.trim()}%`);
            conditions.push(
                `(u.account_id ILIKE $${values.length} OR u.full_name ILIKE $${values.length})`,
            );
        }
        if (params.role) {
            values.push(params.role);
            conditions.push(`u.role = $${values.length}`);
        }
        if (params.status) {
            values.push(params.status);
            conditions.push(`u.status = $${values.length}`);
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";
        const page = params.page ?? 1;
        const limit = params.limit ?? 10;
        const offset = (page - 1) * limit;

        const countValues = [...values];
        values.push(limit, offset);

        const [usersResult, countResult] = await Promise.all([
            this.pool.query<AdminUserStatsRow>(
                `
                    SELECT ${userStatsColumns}
                    FROM users AS u
                    ${whereClause}
                    ORDER BY u.account_id ASC, u.id ASC
                    LIMIT $${values.length - 1}
                    OFFSET $${values.length}
                `,
                values,
            ),
            this.pool.query<{ total: string } & QueryResultRow>(
                `
                    SELECT COUNT(*)::text AS total
                    FROM users AS u
                    ${whereClause}
                `,
                countValues,
            ),
        ]);

        return {
            usersWithStats: usersResult.rows.map(toUserWithStats),
            totalItem: Number(countResult.rows[0]?.total ?? 0),
        };
    }

    async getUserWithStatsById(id: string): Promise<AdminUserWithStatsEntity | null> {
        const result = await this.pool.query<AdminUserStatsRow>(
            `
                SELECT ${userStatsColumns}
                FROM users AS u
                WHERE ${userIdCondition()}
                LIMIT 1
            `,
            [id],
        );
        const row = result.rows[0];
        return row ? toUserWithStats(row) : null;
    }

    async getUserById(id: string): Promise<AdminUserEntity | null> {
        const result = await this.pool.query<{
            _id: string;
            accountId: string;
            fullName: string;
            role: string;
            status: string;
            yearGroup: string | null;
            activeLoansCount: number;
            maxLoansLimit: number;
        } & QueryResultRow>(
            `
                SELECT
                    u.id::text AS "_id",
                    u.account_id AS "accountId",
                    u.full_name AS "fullName",
                    u.role AS "role",
                    u.status AS "status",
                    u.year_group AS "yearGroup",
                    u.active_loans_count AS "activeLoansCount",
                    u.max_loans_limit AS "maxLoansLimit"
                FROM users AS u
                WHERE ${userIdCondition()}
                LIMIT 1
            `,
            [id],
        );
        const row = result.rows[0];
        return row ? new AdminUserEntity(
            row._id,
            row.accountId,
            row.fullName,
            initialsFromName(row.fullName),
            row.role,
            row.status,
            row.yearGroup,
            Number(row.activeLoansCount),
            Number(row.maxLoansLimit),
        ) : null;
    }

    async isUserHasLoanHistory(userId: string): Promise<boolean> {
        const result = await this.pool.query<{ hasHistory: boolean } & QueryResultRow>(
            `
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM users AS u
                        WHERE ${userIdCondition()}
                          AND (
                              EXISTS (SELECT 1 FROM loans AS l WHERE l.student_id = u.id)
                              OR EXISTS (SELECT 1 FROM holds AS h WHERE h.student_id = u.id)
                          )
                    ) AS "hasHistory"
            `,
            [userId],
        );
        return result.rows[0]?.hasHistory ?? false;
    }

    constructor(private readonly pool: Pool) {}

    async getUsersWithStats(params: {
        q?: string;
        role?: "student" | "staff" | "admin";
        status?: "Active" | "Inactive";
        page?: number;
        limit?: number;
    }): Promise<{ usersWithStats: AdminUserWithStatsEntity[]; totalItem: number }> {
        const conditions: string[] = [];
        const values: unknown[] = [];

        if (params.q?.trim()) {
            values.push(`%${params.q.trim()}%`);
            conditions.push(
                `(u.account_id ILIKE $${values.length} OR u.full_name ILIKE $${values.length})`,
            );
        }
        if (params.role) {
            values.push(params.role);
            conditions.push(`u.role = $${values.length}`);
        }
        if (params.status) {
            values.push(params.status);
            conditions.push(`u.status = $${values.length}`);
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";
        const page = params.page ?? 1;
        const limit = params.limit ?? 10;
        const offset = (page - 1) * limit;

        const countValues = [...values];
        values.push(limit, offset);

        const [usersResult, countResult] = await Promise.all([
            this.pool.query<AdminUserStatsRow>(
                `
                    SELECT ${userStatsColumns}
                    FROM users AS u
                    ${whereClause}
                    ORDER BY u.account_id ASC, u.id ASC
                    LIMIT $${values.length - 1}
                    OFFSET $${values.length}
                `,
                values,
            ),
            this.pool.query<{ total: string } & QueryResultRow>(
                `
                    SELECT COUNT(*)::text AS total
                    FROM users AS u
                    ${whereClause}
                `,
                countValues,
            ),
        ]);

        return {
            usersWithStats: usersResult.rows.map(toUserWithStats),
            totalItem: Number(countResult.rows[0]?.total ?? 0),
        };
    }

    async getUserWithStatsById(id: string): Promise<AdminUserWithStatsEntity | null> {
        const result = await this.pool.query<AdminUserStatsRow>(
            `
                SELECT ${userStatsColumns}
                FROM users AS u
                WHERE ${userIdCondition()}
                LIMIT 1
            `,
            [id],
        );
        const row = result.rows[0];
        return row ? toUserWithStats(row) : null;
    }

    async getUserById(id: string): Promise<AdminUserEntity | null> {
        const result = await this.pool.query<{
            _id: string;
            accountId: string;
            fullName: string;
            role: string;
            status: string;
            yearGroup: string | null;
            activeLoansCount: number;
            maxLoansLimit: number;
        } & QueryResultRow>(
            `
                SELECT
                    u.id::text AS "_id",
                    u.account_id AS "accountId",
                    u.full_name AS "fullName",
                    u.role AS "role",
                    u.status AS "status",
                    u.year_group AS "yearGroup",
                    u.active_loans_count AS "activeLoansCount",
                    u.max_loans_limit AS "maxLoansLimit"
                FROM users AS u
                WHERE ${userIdCondition()}
                LIMIT 1
            `,
            [id],
        );
        const row = result.rows[0];
        return row ? new AdminUserEntity(
            row._id,
            row.accountId,
            row.fullName,
            initialsFromName(row.fullName),
            row.role,
            row.status,
            row.yearGroup,
            Number(row.activeLoansCount),
            Number(row.maxLoansLimit),
        ) : null;
    }

    async isUserHasLoanHistory(userId: string): Promise<boolean> {
        const result = await this.pool.query<{ hasHistory: boolean } & QueryResultRow>(
            `
                SELECT
                    EXISTS (
                        SELECT 1
                        FROM users AS u
                        WHERE ${userIdCondition()}
                          AND (
                              EXISTS (SELECT 1 FROM loans AS l WHERE l.student_id = u.id)
                              OR EXISTS (SELECT 1 FROM holds AS h WHERE h.student_id = u.id)
                          )
                    ) AS "hasHistory"
            `,
            [userId],
        );
        return result.rows[0]?.hasHistory ?? false;
    }

    async createUserWithStats(params: {
        accountId: string;
        fullName: string;
        password: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
    }): Promise<AdminUserWithStatsEntity | null> {
        const result = await this.pool.query<AdminUserStatsRow>(
            `
                WITH inserted_user AS (
                    INSERT INTO users (account_id, full_name, password_hash, role, year_group)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (account_id) DO NOTHING
                    RETURNING id
                )
                SELECT ${userStatsColumns}
                FROM users AS u
                INNER JOIN inserted_user AS i ON i.id = u.id
            `,
            [
                params.accountId,
                params.fullName,
                params.password,
                params.role,
                params.yearGroup,
            ],
        );
        const row = result.rows[0];
        return row ? toUserWithStats(row) : null;
    }): Promise<AdminUserWithStatsEntity | null> {
        const result = await this.pool.query<AdminUserStatsRow>(
            `
                WITH inserted_user AS (
                    INSERT INTO users (account_id, full_name, password_hash, role, year_group)
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (account_id) DO NOTHING
                    RETURNING *
                )
                SELECT ${userStatsColumns}
                FROM inserted_user AS u
            `,
            [
                params.accountId,
                params.fullName,
                params.password,
                params.role,
                params.yearGroup,
            ],
        );
        const row = result.rows[0];
        return row ? toUserWithStats(row) : null;
    }

    async updateUserWithStats(params: {
        id: string;
        id: string;
        fullName: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
        status: "Active" | "Inactive";
    }): Promise<AdminUserWithStatsEntity | null> {
        const result = await this.pool.query<AdminUserStatsRow>(
            `
                WITH updated_user AS (
                    UPDATE users AS u
                    SET full_name = $2,
                        role = $3,
                        year_group = $4,
                        status = $5,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE ${userIdCondition()}
                    RETURNING u.id
                )
                SELECT ${userStatsColumns}
                FROM users AS u
                INNER JOIN updated_user AS updated ON updated.id = u.id
            `,
            [
    }): Promise<AdminUserWithStatsEntity | null> {
        const result = await this.pool.query<AdminUserStatsRow>(
            `
                WITH updated_user AS (
                    UPDATE users AS u
                    SET full_name = $2,
                        role = $3,
                        year_group = $4,
                        status = $5,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE ${userIdCondition()}
                    RETURNING *
                )
                SELECT ${userStatsColumns}
                FROM updated_user AS u
            `,
            [
                params.id,
                params.fullName,
                params.role,
                params.yearGroup,
                params.status,
            ],
        );
        const row = result.rows[0];
        return row ? toUserWithStats(row) : null;
                params.status,
            ],
        );
        const row = result.rows[0];
        return row ? toUserWithStats(row) : null;
    }

    async resetUserPassword(params: {
        id: string;
        newPassword: string;
    }): Promise<boolean> {
        const result = await this.pool.query(
            `
                UPDATE users AS u
                SET password_hash = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE ${userIdCondition()}
            `,
            [params.id, params.newPassword],
        );
        return (result.rowCount ?? 0) > 0;
        id: string;
        newPassword: string;
    }): Promise<boolean> {
        const result = await this.pool.query(
            `
                UPDATE users AS u
                SET password_hash = $2,
                    updated_at = CURRENT_TIMESTAMP
                WHERE ${userIdCondition()}
            `,
            [params.id, params.newPassword],
        );
        return (result.rowCount ?? 0) > 0;
    }

    async deleteUser(params: {
        id: string;
        id: string;
    }): Promise<"not_found" | "has_loan_history" | "deleted"> {
        const client: PoolClient = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const userResult = await client.query<{ id: number } & QueryResultRow>(
                `
                    SELECT u.id
                    FROM users AS u
                    WHERE ${userIdCondition()}
                    FOR UPDATE
                `,
                [params.id],
            );
            const user = userResult.rows[0];
            if (!user) {
                await client.query("COMMIT");
        const client: PoolClient = await this.pool.connect();
        try {
            await client.query("BEGIN");
            const userResult = await client.query<{ id: number } & QueryResultRow>(
                `
                    SELECT u.id
                    FROM users AS u
                    WHERE ${userIdCondition()}
                    FOR UPDATE
                `,
                [params.id],
            );
            const user = userResult.rows[0];
            if (!user) {
                await client.query("COMMIT");
                return "not_found";
            }

            const historyResult = await client.query<{ hasHistory: boolean } & QueryResultRow>(
                `
                    SELECT
                        EXISTS (SELECT 1 FROM loans AS l WHERE l.student_id = $1)
                        OR EXISTS (SELECT 1 FROM holds AS h WHERE h.student_id = $1)
                        AS "hasHistory"
                `,
                [user.id],
            );
            if (historyResult.rows[0]?.hasHistory) {
                await client.query("COMMIT");

            const historyResult = await client.query<{ hasHistory: boolean } & QueryResultRow>(
                `
                    SELECT
                        EXISTS (SELECT 1 FROM loans AS l WHERE l.student_id = $1)
                        OR EXISTS (SELECT 1 FROM holds AS h WHERE h.student_id = $1)
                        AS "hasHistory"
                `,
                [user.id],
            );
            if (historyResult.rows[0]?.hasHistory) {
                await client.query("COMMIT");
                return "has_loan_history";
            }

            await client.query("DELETE FROM users WHERE id = $1", [user.id]);
            await client.query("COMMIT");

            await client.query("DELETE FROM users WHERE id = $1", [user.id]);
            await client.query("COMMIT");
            return "deleted";
        } catch (error) {
            await client.query("ROLLBACK");
            await client.query("ROLLBACK");
            throw error;
        } finally {
            client.release();
        } finally {
            client.release();
        }
    }
}
