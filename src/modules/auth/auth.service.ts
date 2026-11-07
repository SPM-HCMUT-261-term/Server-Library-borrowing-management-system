import pkg from 'pg';
const { Pool } = pkg;
import { AuthRepository } from './repositories/auth.repository.js';

const pool = new Pool({
  user: 'library_admin',
  host: 'localhost',
  database: 'library_db',
  password: 'library_password123',
  port: 5433,
});

export class AuthService {
  private authRepo: AuthRepository;

  constructor() {
    this.authRepo = new AuthRepository(pool);
  }

  async login(credentials: any) {
    const { account_id, password } = credentials;

    // Gọi đúng tên method findUserByEmail sẵn có trong Repository
    const user = await this.authRepo.findUserByEmail(account_id);

    if (!user || user.password_hash !== password) {
      throw new Error('Tài khoản hoặc mật khẩu không chính xác');
    }

    return {
      message: 'Đăng nhập thành công',
      user: {
        id: user.id,
        account_id: user.account_id,
        full_name: user.full_name,
        role: user.role,
      },
    };
  }
}

export default AuthService;