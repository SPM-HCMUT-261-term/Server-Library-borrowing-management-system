import type {AdminRepository} from "./repositories/admin.repository.interface";

class AdminService {
    constructor(private userRepository: AdminRepository) {}

}