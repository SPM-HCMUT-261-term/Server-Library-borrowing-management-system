export interface IAuthRepository {
	findUserByEmail(email: string): Promise<Record<string, unknown> | null>;
	findUserById(userId: number | string): Promise<Record<string, unknown> | null>;
	createUser(user: Record<string, unknown>): Promise<Record<string, unknown>>;
}
