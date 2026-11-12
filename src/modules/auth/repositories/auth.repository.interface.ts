import { AuthUserEntity, AuthUserWithStatsEntity } from "../auth.entity.js";
export interface AuthRepository {
    findUserByAccountId(accountId: string): Promise<AuthUserEntity | null>;
    // returns null if user not found
    // When receive QueryResult, perform mapping from QueryResult to Entity (AuthUserEntity).

    findUserWithStatsById(id: number): Promise<AuthUserWithStatsEntity | null>;
    // returns null if user not found
    // When receive QueryResult, perform mapping from QueryResult to Entity (AuthUserWithStatsEntity).
}


