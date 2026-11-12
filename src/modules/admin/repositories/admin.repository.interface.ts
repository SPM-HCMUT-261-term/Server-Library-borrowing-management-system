import type { AdminUserEntity, AdminUserWithStatsEntity } from "../admin.entity.js";
export interface AdminRepository {
    /* Query operations */
    getUsersWithStats(
        params: {
            q?: string;
            role?: "student" | "staff" | "admin";
            status?: "Active" | "Inactive";
            page?: number;
            limit?: number;
        }
    ): Promise<{usersWithStats: AdminUserWithStatsEntity[]; totalItem: number}>;
    // when receive QueryResult, perform mapping from QueryResult rows to Entity[] (AdminUserWithStatsEntity[]).

    getUserWithStatsById(id: string): Promise<AdminUserWithStatsEntity | null>;
    // when receive QueryResult, perform mapping from QueryResult to Entity (AdminUserWithStatsEntity). Returns null if user not found.

    getUserById(id: string): Promise<AdminUserEntity | null>; //returns null if user not found

    isUserHasLoanHistory(userId: string): Promise<boolean>; //returns true if user has loan history, else false

    /* CUD operations */
    createUserWithStats(params: {
        accountId: string;
        fullName: string;
        password: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
    }): Promise<AdminUserWithStatsEntity | null>; //null if accountId already exists. 
    //Will change in the future. Return AdminUserEntity if create success, else null. 
    // When receive QueryResult, perform mapping from QueryResult to Entity (AdminUserEntity).
    // After create and return AdminUserEntity, will call getUserWithStatsById to return AdminUserWithStatsEntity.

    updateUserWithStats(params: {
        id: string; //User _id or accountId
        fullName: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
        status: "Active" | "Inactive";
    }): Promise<AdminUserWithStatsEntity | null>; //null if user not found. 
    //Will change in the future. Return AdminUserEntity if update success, else null.
    // When receive QueryResult, perform mapping from QueryResult to Entity (AdminUserEntity).
    // After update and return AdminUserEntity, will call getUserWithStatsById to return AdminUserWithStatsEntity in Service.

    resetUserPassword(params: {
        id: string; //User _id or accountId
        newPassword: string
    }): Promise<boolean>; //true if success, false if user not found

    deleteUser(params: {
        id: string //User _id or accountId
    }): Promise<"not_found" | "has_loan_history" | "deleted">; 
    // Will change into boolean value. True if delete success, else false.
}
