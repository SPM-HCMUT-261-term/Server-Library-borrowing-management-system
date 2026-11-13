import type { Pool, QueryResultRow } from "pg";

import { AuthUserEntity, AuthUserWithStatsEntity } from "../auth.entity.js";
import type { AuthRepository } from "./auth.repository.interface.js";

interface AuthUserRow extends QueryResultRow {
    id: string;
    accountId: string;
    fullName: string;
    passwordHash: string;
    role: string;
    status: string;
    yearGroup: string | null;
    activeLoansCount: number;
    maxLoansLimit: number;
}

interface AuthUserWithStatsRow extends QueryResultRow {
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
    createdAt: Date | string;
    updatedAt: Date | string;
}

function initialsFromName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
}

function toIsoString(value: Date | string): string {
    return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export class AuthRepositoryImpl implements AuthRepository {
    constructor(private readonly pool: Pool) {}

    async findUserByAccountId(accountId: string): Promise<AuthUserEntity | null> {
        const result = await this.pool.query<AuthUserRow>(
            `
                SELECT
                    u.id::text AS "id",
                    u.account_id AS "accountId",
                    u.full_name AS "fullName",
                    u.password_hash AS "passwordHash",
                    u.role AS "role",
                    u.status AS "status",
                    u.year_group AS "yearGroup",
                    u.active_loans_count AS "activeLoansCount",
                    u.max_loans_limit AS "maxLoansLimit"
                FROM users AS u
                WHERE u.account_id = $1
                LIMIT 1
            `,
            [accountId],
        );
        const row = result.rows[0];
        if (!row) return null;

        return new AuthUserEntity(
            row.id,
            row.accountId,
            row.fullName,
            row.passwordHash,
            initialsFromName(row.fullName),
            row.role,
            row.status,
            row.yearGroup,
            Number(row.activeLoansCount),
            Number(row.maxLoansLimit),
        );
    }

    async findUserWithStatsById(
        id: number,
    ): Promise<AuthUserWithStatsEntity | null> {
        const result = await this.pool.query<AuthUserWithStatsRow>(
            `
                SELECT
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
                        EXISTS (
                            SELECT 1
                            FROM loans AS l
                            WHERE l.student_id = u.id
                        )
                        OR EXISTS (
                            SELECT 1
                            FROM holds AS h
                            WHERE h.student_id = u.id
                        )
                    ) AS "hasBorrowingHistory",
                    u.created_at AS "createdAt",
                    u.updated_at AS "updatedAt"
                FROM users AS u
                WHERE u.id = $1
                LIMIT 1
            `,
            [id],
        );

        const row = result.rows[0];
        if (!row) return null;

        return new AuthUserWithStatsEntity(
            row._id,
            row.accountId,
            row.fullName,
            initialsFromName(row.fullName),
            row.role,
            row.status,
            row.yearGroup,
            Number(row.activeLoansCount),
            Number(row.maxLoansLimit),
            Number(row.overdueLoansCount),
            Number(row.unpaidFines),
            row.hasBorrowingHistory,
            toIsoString(row.createdAt),
            toIsoString(row.updatedAt),
        );
    }
}