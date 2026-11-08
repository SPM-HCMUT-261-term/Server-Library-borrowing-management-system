<<<<<<< HEAD
import { AuthUserEntity, AuthUserWithStatsEntity } from "../auth.entity";
export interface AuthRepository {
    findUserByAccountId(accountId: string): Promise<AuthUserEntity | null>;
    findUserWithStatsById(id: number): Promise<AuthUserWithStatsEntity | null>;
}
=======
export interface IAuthRepository {
	findUserByEmail(email: string): Promise<Record<string, unknown> | null>;
	findUserById(userId: number | string): Promise<Record<string, unknown> | null>;
	createUser(user: Record<string, unknown>): Promise<Record<string, unknown>>;
}
>>>>>>> origin/main
