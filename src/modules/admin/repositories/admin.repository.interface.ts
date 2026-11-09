import type { AdminUserWithStatsEntity } from "../admin.entity.js";
export interface AdminRepository {
    /* Query operations */
    getUsersWithStats(
        params: {
            type_query?: "accountId" | "fullName";
            role?: "student" | "staff" | "admin";
            status?: "Active" | "Inactive" | "all";
            page?: number;
            limit?: number;
        }
    ): Promise<{usersWithStats: AdminUserWithStatsEntity[]; totalItem: number}>;

    /* CUD operations */
    createUserWithStats(params: {
        accountId: string;
        fullName: string;
        password: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
    }): Promise<AdminUserWithStatsEntity | null>; //null if accountId already exists

    updateUserWithStats(params: {
        id: string; //User _id or accountId
        fullName: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
        status: "Active" | "Inactive";
    }): Promise<AdminUserWithStatsEntity | null>; //null if user not found

    resetUserPassword(params: {
        id: string; //User _id or accountId
        newPassword: string
    }): Promise<boolean>; //true if success, false if user not found

    deleteUser(params: {
        id: string //User _id or accountId
    }): Promise<"not_found" | "has_loan_history" | "deleted">; 
}
