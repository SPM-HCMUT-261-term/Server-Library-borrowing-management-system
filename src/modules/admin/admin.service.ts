import type { AdminRepository } from "./repositories/admin.repository.interface";
import type { AdminUserWithStatsDto } from "./admin.dto";

type ServiceError = Error & { code: string };
function serviceError(code: string, message: string): ServiceError {
    return Object.assign(new Error(message), { code });
}

export class AdminService {
    constructor(private userRepository: Partial<AdminRepository> | any) {}

    public getUsers(param: {
        type_query?: "accountId" | "fullName" | undefined;
        role?: "all" | "student" | "staff" | "admin" | undefined;
        status?: "all" | "Active" | "Inactive" | undefined;
        page?: number | undefined;
        limit?: number | undefined;
    }): Promise<AdminUserWithStatsDto[] | any> {
        // TODO
        // Call userRepository.getUsersWithStats with the provided parameters
        const page = param.page ?? 1;
        const limit = param.limit ?? 10;
        if (
            !Number.isInteger(page) ||
            page < 1 ||
            !Number.isInteger(limit) ||
            limit < 1
        ) {
            throw serviceError("BAD_REQUEST", "Invalid pagination parameters");
        }
        return this.userRepository
            .getUsersWithStats({
                type_query: param.type_query,
                role: param.role === "all" ? undefined : param.role,
                status: param.status,
                page,
                limit,
            })
            .then(
                ({
                    usersWithStats,
                    totalItem,
                }: {
                    usersWithStats: AdminUserWithStatsDto[];
                    totalItem: number;
                }) => ({
                    items: usersWithStats,
                    pagination: {
                        totalItems: totalItem,
                        currentPage: page,
                        totalPages: Math.ceil(totalItem / limit),
                        limit,
                    },
                }),
            );
        // Return the result
    }

    public createUser(params: {
        accountId: string;
        fullName: string;
        password: string;
        role: "student" | "staff" | "admin";
        yearGroup?: string | null | undefined;
    }): Promise<AdminUserWithStatsDto | any> {
        // TODO
        // call userRepository.createUser with the provided parameters
        // If accountId already exists, return an error
        // If successful, return the created user with stats
        return this.userRepository
            .createUserWithStats({
                accountId: params.accountId,
                fullName: params.fullName,
                password: params.password,
                role: params.role,
                yearGroup: params.yearGroup ?? null,
            })
            .then((created: AdminUserWithStatsDto | null) => {
                if (!created) {
                    throw serviceError(
                        "DUPLICATE_ACCOUNT_ID",
                        "Account ID already exists",
                    );
                }
                return created;
            });
    }

    public updateUser(params: {
        id: string; //User _id or accountId
        fullName: string;
        role: "student" | "staff" | "admin";
        yearGroup?: string | null | undefined;
        status: "Active" | "Inactive";
    }): Promise<AdminUserWithStatsDto | any> {
        // TODO
        // Call userRepository.updateUserWithStats with the provided parameters

        // If user not found, throw an error

        // If successful, return the updated user with stats
        return this.userRepository
            .updateUserWithStats({
                ...params,
                yearGroup: params.yearGroup ?? null,
            })
            .then((updated: AdminUserWithStatsDto | null) => {
                if (!updated) {
                    throw serviceError("USER_NOT_FOUND", "User not found");
                }
                return updated;
            });
    }

    public resetUserPassword(params: {
        id: string;
        newPassword: string;
    }): Promise<void> {
        // TODO
        // Call userRepository.resetUserPassword with the provided parameters

        // If user not found, throw an error

        // If successful, return true
        return this.userRepository
            .resetUserPassword(params)
            .then((success: boolean) => {
                if (!success) {
                    throw serviceError("USER_NOT_FOUND", "User not found");
                }
            });
    }

    /*
Request Params:
+ id: string (User _id or accountId)
*/
    public deleteUser(id: string): Promise<void> {
        // TODO
        // Call userRepository.deleteUser with the provided id

        // If user not found, throw an error

        // If user has loan history, throw an error

        return this.userRepository
            .deleteUser({ id })
            .then((result: "not_found" | "has_loan_history") => {
                if (result === "not_found") {
                    throw serviceError("USER_NOT_FOUND", "User not found");
                }
                if (result === "has_loan_history") {
                    throw serviceError(
                        "USER_HAS_LOAN_HISTORY",
                        "Cannot delete user with borrowing history",
                    );
                }
            });
    }
}
