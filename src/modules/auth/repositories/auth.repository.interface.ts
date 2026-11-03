import { AuthUserEntity, AuthUserWithStatsEntity } from "../auth.entity";
export interface AuthRepository {
    findUserByAccountId(accountId: string): Promise<AuthUserEntity | null>;
    findUserWithStatsById(id: number): Promise<AuthUserWithStatsEntity | null>;
}