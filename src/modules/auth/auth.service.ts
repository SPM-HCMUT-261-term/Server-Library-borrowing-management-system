import type {AuthRepository} from "./repositories/auth.repository.interface";



class AuthService {
    constructor(private userRepository: AuthRepository) {}

    public async login(params: { 
        accountId: string; 
        password: string; 
        role: "student" | "staff" | "admin" 
    }): Promise<{
        accessToken: string;
        sessionToken: string;
        user: {
            _id: string,
            accountId: string,
            fullName: string,
            initials: string,
            role: "student" | "staff" | "admin",
            status: string,
            yearGroup: string | null,
            activeLoansCount: number,
            maxLoansLimit: number
        }
    } | any> {

        //TODO
        //find user by accountId

        // check role, throw error if role does not match

        // check status, throw error if status is not active

        // verify password, throw error if password does not match


        // generate access token and session token (not implement now bcz it's hard)


        return;
    }


    public async getMe(params: {
        userId: number;
    }): Promise<
        {
            id: string,
            accountId: string,
            fullName: string,
            initials: string,
            role: string,
            status: string,
            yearGroup: string | null,
            activeLoansCount: number,
            maxLoansLimit: number,
            overdueLoansCount: number,
            unpaidFines: number,
            hasBorrowingHistory: boolean,
            createdAt: string,
            updatedAt: string
        } 
    | any> {
        //TODO
        // Find user by id

        // Verify if user exists, throw error if not found

        // if status is not active, throw error

        // Return user with stats



    }
}
