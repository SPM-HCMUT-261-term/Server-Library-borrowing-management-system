import type { AuthRepository } from "./repositories/auth.repository.interface";
import { scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

type ServiceError = Error & { code: string };
function serviceError(code: string, message: string): ServiceError {
    return Object.assign(new Error(message), { code });
}

async function verifyPassword(
    password: string,
    hash: unknown,
): Promise<boolean> {
    if (typeof hash !== "string") return false;
    const parts = hash.split(":");
    if (
        parts.length !== 3 ||
        parts[0] !== "scrypt" ||
        !parts[1] ||
        !/^(?:[a-f0-9]{2})+$/i.test(parts[2] ?? "")
    )
        return false;
    const expected = Buffer.from(parts[2]!, "hex");
    const calculated = (await promisify(scryptCallback)(
        password,
        parts[1],
        expected.length,
    )) as Buffer;
    return timingSafeEqual(expected, calculated);
}

export class AuthService {
    constructor(private userRepository: AuthRepository | any) {}

    public async login(params: {
        accountId: string;
        password: string;
        role: "student" | "staff" | "admin";
    }): Promise<
        | {
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
        | any
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
        const credential = user as typeof user & { passwordHash?: string };
        if (!(await verifyPassword(params.password, credential.passwordHash))) {
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
