import type { AuthRepository } from "./repositories/auth.repository.interface.js";
import { promisify } from "node:util";

import { verifyPassword } from "@shared/utils/password.util.js";

type ServiceError = Error & { code: string };
function serviceError(code: string, message: string): ServiceError {
    return Object.assign(new Error(message), { code });
}



export class AuthService {
    constructor(private userRepository: AuthRepository) {}

    public async login(params: {
        accountId: string;
        password: string;
        role: "student" | "staff" | "admin";
    }): Promise<
        {
              accessToken: string;
              sessionToken: string;
              user: {
                  _id: string;
                  accountId: string;
                  fullName: string;
                  initials: string;
                  role: "student" | "staff" | "admin";
                  status: string;
                  yearGroup: string | null;
                  activeLoansCount: number;
                  maxLoansLimit: number;
              };
          }
    > {
        //TODO
        //find user by accountId

        // check role, throw error if role does not match

        // check status, throw error if status is not active

        // verify password, throw error if password does not match

        // generate access token and session token (not implement now bcz it's hard)

        if (!params.accountId?.trim() || !params.password) {
            throw serviceError(
                "INVALID_CREDENTIALS",
                "Invalid account ID or password",
            );
        }
        const user = await this.userRepository.findUserByAccountId(
            params.accountId.trim(),
        );
        if (!user)
            throw serviceError(
                "INVALID_CREDENTIALS",
                "Invalid account ID or password",
            );

        // Check role and status
        if (user.role !== params.role)
            throw serviceError("ROLE_MISMATCH", "Role does not match");
        if (user.status !== "Active")
            throw serviceError("ACCOUNT_INACTIVE", "Account is inactive");

        // Verify password; AuthUserEntity currently lacks passwordHash.
        // Repository must expose a hash to enable successful authentication.
        if (!(await verifyPassword(user.password_hash, params.password))) {
            throw serviceError(
                "INVALID_CREDENTIALS",
                "Invalid account ID or password",
            );
        }

        // generate access token and session token (not implement now bcz it's hard)
        return {
            accessToken: "",
            sessionToken: "",
            user: {
                _id: user._id,
                accountId: user.accountId,
                fullName: user.fullName,
                initials: user.initials,
                role: user.role as "student" | "staff" | "admin",
                status: user.status,
                yearGroup: user.yearGroup,
                activeLoansCount: user.activeLoansCount,
                maxLoansLimit: user.maxLoansLimit,
            },
        };
    }

    public async getMe(params: { userId: number }): Promise<
        | {
              id: string;
              accountId: string;
              fullName: string;
              initials: string;
              role: string;
              status: string;
              yearGroup: string | null;
              activeLoansCount: number;
              maxLoansLimit: number;
              overdueLoansCount: number;
              unpaidFines: number;
              hasBorrowingHistory: boolean;
              createdAt: string;
              updatedAt: string;
          }
        | any
    > {
        //TODO
        // Find user by id
        // Verify if user exists, throw error if not found
        // if status is not active, throw error
        // Return user with stats
        const user = await this.userRepository.findUserWithStatsById(
            params.userId,
        );
        if (!user) throw serviceError("USER_NOT_FOUND", "User not found");

        // Check status and return user with stats
        if (user.status !== "Active")
            throw serviceError("ACCOUNT_INACTIVE", "Account is inactive");
        return user;
    }
}
