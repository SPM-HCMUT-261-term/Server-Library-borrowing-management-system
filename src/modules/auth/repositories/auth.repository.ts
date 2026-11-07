import type { Pool } from "pg";
import type { IAuthRepository } from "./auth.repository.interface.js";

export class AuthRepository implements IAuthRepository {
	constructor(private readonly pool: Pool) {}

	async findUserByEmail(email: string): Promise<Record<string, unknown> | null> {
		const result = await this.pool.query<Record<string, unknown>>(
			"SELECT * FROM users WHERE account_id = $1 LIMIT 1",
			[email],
		);

		return result.rows[0] ?? null;
	}

	async findUserById(userId: number | string): Promise<Record<string, unknown> | null> {
		const id = Number(userId);
		if (!Number.isSafeInteger(id) || id < 1) {
			return null;
		}

		const result = await this.pool.query<Record<string, unknown>>(
			"SELECT * FROM users WHERE id = $1 LIMIT 1",
			[id],
		);

		return result.rows[0] ?? null;
	}

	async createUser(user: Record<string, unknown>): Promise<Record<string, unknown>> {
		const accountId = user.account_id ?? user.accountId;
		const fullName = user.full_name ?? user.fullName;
		const passwordHash = user.password_hash ?? user.passwordHash;
		const role = user.role;

		if (
			typeof accountId !== "string" ||
			typeof fullName !== "string" ||
			typeof passwordHash !== "string" ||
			typeof role !== "string"
		) {
			throw new TypeError("account_id, full_name, password_hash, and role are required");
		}

		const result = await this.pool.query<Record<string, unknown>>(
			`INSERT INTO users (
				account_id,
				full_name,
				password_hash,
				role,
				status,
				is_borrowing_restricted,
				year_group,
				active_loans_count,
				max_loans_limit
			) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
			RETURNING *`,
			[
				accountId,
				fullName,
				passwordHash,
				role,
				user.status ?? "Active",
				user.is_borrowing_restricted ?? user.isBorrowingRestricted ?? false,
				user.year_group ?? user.yearGroup ?? null,
				user.active_loans_count ?? user.activeLoansCount ?? 0,
				user.max_loans_limit ?? user.maxLoansLimit ?? 5,
			],
		);

		const createdUser = result.rows[0];
		if (!createdUser) {
			throw new Error("User insert did not return a row");
		}

		return createdUser;
	}
}
