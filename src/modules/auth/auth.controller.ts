import { Router } from 'express';
import { AuthService } from './auth.service.js';

const router = Router();
const authService = new AuthService();

router.post('/login', async (req: any, res: any) => {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (error: any) {
    res.status(400).json({ message: error.message });
  }
});

export default router;