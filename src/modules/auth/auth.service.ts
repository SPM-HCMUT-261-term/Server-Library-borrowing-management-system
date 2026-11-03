import type {AuthRepository} from "./repositories/auth.repository.interface";

class AuthService {
    constructor(private userRepository: AuthRepository) {}

}