import type {AdminRepository} from "./repositories/admin.repository.interface";
import type {AdminUserWithStatsDto} from './admin.dto';

class AdminService {
    constructor(private userRepository: AdminRepository) {}


    public getUsers(param: {
        type_query?: string;
        role?: "all" | "student" | "staff" | "admin";
        status?: "all" | "Active" | "Inactive";
        page?: number;
        limit?: number;
    }): Promise<AdminUserWithStatsDto[] | any> {
        // TODO
        // Call userRepository.getUsersWithStats with the provided parameters

        // Return the result

        return "placeholder"; // Replace with actual implementation

    }

    public createUser(params: {
        accoundId: string;
        fullName: string;
        password: string;
        role: "student" | "staff" | "admin";
        yearGroup?: string | null;
    }): Promise<AdminUserWithStatsDto | any> {
        // TODO
        // call userRepository.createUser with the provided parameters

        // If accountId already exists, return an error

        // If successful, return the created user with stats

        return "placeholder"; // Replace with actual implementation


    }

    public updateUser(params: {
        id: string; //User _id or accountId
        fullName: string;
        role: "student" | "staff" | "admin";
        yearGroup: string | null;
        status: "Active" | "Inactive";
    }): Promise<AdminUserWithStatsDto | any> {
        // TODO
        // Call userRepository.updateUserWithStats with the provided parameters

        // If user not found, throw an error

        // If successful, return the updated user with stats

        return "placeholder"; // Replace with actual implementation
    }

    public resetUserPassword(params: {
        id: string;
        newPassword: string;
    }): Promise<void> {
        // TODO
        // Call userRepository.resetUserPassword with the provided parameters

        // If user not found, throw an error

        // If successful, return true

        return Promise.resolve(); // Replace with actual implementation
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

        return Promise.resolve();

    }

}