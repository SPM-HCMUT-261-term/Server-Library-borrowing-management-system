import type { Pool } from "pg";
import type { IAdminRepository } from "./admin.repository.interface.js";
import type { AdminUser, BorrowingStatistics } from "./admin.repository.interface.js";

const USER_COLUMNS = `
	id,
	account_id AS username,
	''::text AS email,
	full_name AS "fullName",
	role,
	status,
	created_at AS "createdAt"
`;

export class AdminRepository implements IAdminRepository {
	constructor(private readonly pool: Pool) {}

	async findAllUsers(): Promise<AdminUser[]> {
		const result = await this.pool.query<AdminUser>(
			`SELECT ${USER_COLUMNS} FROM users ORDER BY id`,
		);

		return result.rows;
	}

	async findUserById(userId: number): Promise<AdminUser | null> {
		const result = await this.pool.query<AdminUser>(
			`SELECT ${USER_COLUMNS} FROM users WHERE id = $1 LIMIT 1`,
			[userId],
		);

		return result.rows[0] ?? null;
	}

	async updateUserStatus(userId: number, status: string): Promise<AdminUser | null> {
		const result = await this.pool.query<AdminUser>(
			`UPDATE users
			SET status = $1
			WHERE id = $2
			RETURNING ${USER_COLUMNS}`,
			[status, userId],
		);

		return result.rows[0] ?? null;
	}

	async deleteUser(userId: number): Promise<boolean> {
		const result = await this.pool.query("DELETE FROM users WHERE id = $1", [userId]);

		return (result.rowCount ?? 0) > 0;
	}

	async getBorrowingStatistics(): Promise<BorrowingStatistics> {
		const result = await this.pool.query<BorrowingStatistics>(`
			SELECT
				COUNT(*)::integer AS "totalBorrowings",
				COUNT(*) FILTER (WHERE status = 'Active')::integer AS "currentlyBorrowed",
				COUNT(*) FILTER (WHERE status = 'Returned')::integer AS returned,
				COUNT(*) FILTER (
					WHERE status = 'Active' AND due_date < CURRENT_DATE
				)::integer AS overdue
			FROM borrow_records
		`);

		const statistics = result.rows[0];
		if (!statistics) {
			throw new Error("Borrowing statistics query returned no row");
		}

		return statistics;
	}
}
