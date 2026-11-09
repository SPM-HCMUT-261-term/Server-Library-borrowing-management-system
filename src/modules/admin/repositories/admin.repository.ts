import { type AdminRepository } from "./admin.repository.interface.js";
import type { AdminUserWithStatsEntity } from "../admin.entity.js";
import PG, { Pool } from "pg";


function initialsFromName(fullName: string): string {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "";
    return `${parts[0]?.[0] ?? ""}${parts.length > 1 ? (parts.at(-1)?.[0] ?? "") : ""}`.toUpperCase();
}


export class AdminRepositoryImpl implements AdminRepository {
    constructor(private pool: Pool) {}
    /* Query operations */
    async getUsersWithStats(
        params: {
            type_query?: "accountId" | "fullName";
            role?: "student" | "staff" | "admin" | "all";
            status?: "Active" | "Inactive" | "all";
            page?: number;
            limit?: number;
        }
    ): Promise<{usersWithStats: AdminUserWithStatsEntity[]; totalItem: number}> {
        try {
            let query = `
                select 
                    u.id::text as "_id",
                    u.account_id as "accountId",
                    u.full_name as "fullName",
                    u.role as role,
                    u.status as status,
                    u.year_group as "yearGroup",
                    u.active_loans_count as "activeLoansCount",
                    u.max_loans_limit as "maxLoansLimit",
                    (
                        select count(l.id) 
                        from loans l 
                        where l.student_id = u.id 
                             and l.status = 'Active'
                             and l.due_date < CURRENT_DATE
                    ) as "overdueLoansCount",
                    (
                        select count(f.id)
                        from fines f
                        where f.student_id = u.id
                              and f.paid_at is null
                    ) as "unpaidFinesCount",
                    (
                        select h.id
                        from holds h
                        where h.student_id = u.id
                        limit 1
                    ) as "hasBorrowingHistory",
                    u.created_at::text as "createdAt",
                    u.updated_at::text as "updatedAt"
                from users u
            `
            let paramsArray: any[] = [];
            let whereStmt: string = '';
            let conditionsStmt: string[] = [];
            let countParams: number = 1;
            let orderByStmt: string = '';
            let limitStmt: string = '';
            let limitNum: number = params.limit? params.limit : 10;

            if (params.type_query) {
                if (params.type_query === 'accountId') {
                    orderByStmt = 'order by "accountId"'
                }
                if (params.type_query === 'fullName') {
                    orderByStmt = 'order by "fullName"'
                }
            }
            if (params.role) {
                if (params.role == 'student') {
                    conditionsStmt.push(`u.role = $${countParams++}`);
                    paramsArray.push('student')
                } else if (params.role == 'staff') {
                    conditionsStmt.push(`u.role = $${countParams++}`);
                    paramsArray.push('staff')
                }
                else if (params.role == 'admin') {
                    conditionsStmt.push(`u.role = $${countParams++}`);
                    paramsArray.push('admin')
                }
            }
            if (params.status) {
                if (params.status == 'Active') {
                    conditionsStmt.push(`u.status = $${countParams++}`);
                    paramsArray.push('Active')
                } else if (params.status == 'Inactive') {
                    conditionsStmt.push(`u.status = $${countParams++}`);
                    paramsArray.push('Inactive')
                }
            }
            if (params.page) {
                limitNum *= params.page
            }

            whereStmt += conditionsStmt? 'where ' + conditionsStmt.join(' and ') : '';
            paramsArray.push(limitNum)
            limitStmt = `limit $${countParams++}`

            query += whereStmt + orderByStmt + limitStmt

            const result = (await this.pool.query(query, paramsArray)) as PG.QueryResult<AdminUserWithStatsEntity>;
            result.rows.forEach((row) => {
                row.initials = initialsFromName(row.fullName);
                row.hasBorrowingHistory = row.hasBorrowingHistory ? true : false;
            });
            return {usersWithStats: result.rows, totalItem: result.rowCount as number};
        } catch (error) {
            console.error('Error occurred while fetching users with stats.');
            throw error;
        }
    }

    /* CUD operations */
    async createUserWithStats(params: {
        accountId: string;
        fullName: string;
        password: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
    }): Promise<AdminUserWithStatsEntity | null> //null if accountId already exists 
    {
        try {
            let query = `
            with existing_user as (
                insert into users (account_id, full_name, password_hash, role, year_group)
                values ($1, $2, $3, $4, $5)
                returning *
            )
            select 
                   u.id::text as "_id",
                    u.account_id as "accountId",
                    u.full_name as "fullName",
                    u.role as "role",
                    u.status as "status",
                    u.year_group as "yearGroup",
                    u.active_loans_count as "activeLoansCount",
                    u.max_loans_limit as "maxLoansLimit",
                    (
                        select count(l.id) 
                        from loans l 
                        where l.student_id = u.id 
                             and l.status = 'Active'
                             and l.due_date < CURRENT_DATE
                    ) as "overdueLoansCount",
                    (
                        select count(f.id)
                        from fines f
                        where f.student_id = u.id
                              and f.paid_at is null
                    ) as "unpaidFinesCount",
                    (
                        select h.id
                        from holds h
                        where h.student_id = u.id
                        limit 1
                    ) as "hasBorrowingHistory",
                    u.created_at::text as "createdAt",
                    u.updated_at::text as "updatedAt"
            from existing_user u;
            `
            const result = (await this.pool.query(query, [
                params.accountId, 
                params.fullName, 
                params.password, 
                params.role, 
                params.yearGroup
            ])) as PG.QueryResult<AdminUserWithStatsEntity>;
            result.rows.forEach((row) => {
                row.initials = initialsFromName(row.fullName);
                row.hasBorrowingHistory = row.hasBorrowingHistory ? true : false;
            });
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error occurred while creating user with stats.');
            throw error;
        }
    }

    async updateUserWithStats(params: {
        id: string; //User _id or accountId
        fullName: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
        status: "Active" | "Inactive";
    }): Promise<AdminUserWithStatsEntity | null> //null if user not found
    {
        try {
            let query = `
                with updated_user as (
                    update users
                    set full_name = $2, role = $3, year_group = $4, status = $5
                    where account_id = $1 OR ($1 ~ '^[0-9]+$' AND id = $1::integer)
                    returning *
                )
                select 
                   u.id::text as "_id",
                    u.account_id as "accountId",
                    u.full_name as "fullName",
                    u.role as "role",
                    u.status as "status",
                    u.year_group as "yearGroup",
                    u.active_loans_count as "activeLoansCount",
                    u.max_loans_limit as "maxLoansLimit",
                    (
                        select count(l.id) 
                        from loans l 
                        where l.student_id = u.id 
                             and l.status = 'Active'
                             and l.due_date < CURRENT_DATE
                    ) as "overdueLoansCount",
                    (
                        select count(f.id)
                        from fines f
                        where f.student_id = u.id
                              and f.paid_at is null
                    ) as "unpaidFinesCount",
                    (
                        select h.id
                        from holds h
                        where h.student_id = u.id
                        limit 1
                    ) as "hasBorrowingHistory",
                    u.created_at::text as "createdAt",
                    u.updated_at::text as "updatedAt"
                from updated_user u;
            `
            const result = (await this.pool.query(query, [
                params.id,
                params.fullName,
                params.role,
                params.yearGroup,
                params.status
            ])) as PG.QueryResult<AdminUserWithStatsEntity>;
            result.rows.forEach((row) => {
                row.initials = initialsFromName(row.fullName);
                row.hasBorrowingHistory = row.hasBorrowingHistory ? true : false;
            });
            return result.rows[0] || null;
        } catch (error) {
            console.error('Error occurred while updating user with stats.');
            throw error;
        }
    }

    async resetUserPassword(params: {
        id: string; //User _id or accountId
        newPassword: string
    }): Promise<boolean> //true if success, false if user not found
    {
        try {
            let query = `
                update users
                set password_hash = $2
                where account_id = $1 OR ($1 ~ '^[0-9]+$' AND id = $1::integer)
                returning *
            `
            const result = (await this.pool.query(query, [
                params.id,
                params.newPassword
            ])) as PG.QueryResult<AdminUserWithStatsEntity>;
            return result.rowCount? result.rowCount > 0 : false;
        } catch (error) {
            console.error('Error occurred while resetting user password.');
            throw error;
        }
    }

    async deleteUser(params: {
        id: string //User _id or accountId
    }): Promise<"not_found" | "has_loan_history" | "deleted"> {
        try {
            // Check if user exists
            const checkUserQuery = `
                select id from users where account_id = $1 OR ($1 ~ '^[0-9]+$' AND id = $1::integer)
            `;
            const checkUserResult = await this.pool.query(checkUserQuery, [params.id]) as PG.QueryResult<{ id: number }>;
            if (checkUserResult.rowCount === 0) {
                return "not_found";
            }
            // Check if user has loan history
            const checkLoanHistoryQuery = `
                select id from loans where student_id = $1
            `;
            const checkLoanHistoryResult = await this.pool.query(checkLoanHistoryQuery, [params.id]) as PG.QueryResult<{ id: number }>;
            if (checkLoanHistoryResult.rowCount as number > 0) {
                return "has_loan_history";
            }
            // Delete the user
            const deleteUserQuery = `
                delete from users where account_id = $1 OR ($1 ~ '^[0-9]+$' AND id = $1::integer)
            `;
            await this.pool.query(deleteUserQuery, [params.id]);
            return "deleted";
        } catch (error) {
            console.error('Error occurred while deleting user.');
            throw error;
        }
    }
}





