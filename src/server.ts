import express, { type Express, type Request, type Response, type NextFunction } from 'express';


import { sessionMiddleware } from '@shared/middlewares/session.middleware';
import { verificationMiddleware } from '@shared/middlewares/verification.middleware';

import { authRouter } from '@modules/auth/auth.routes';
import { login } from '@modules/auth/auth.controller';

import { adminRouter } from '@modules/admin/admin.routes';
import { name } from 'nodemailer/lib/package-info.js';







const PORT: number | undefined = parseInt(process.env.PORT as string) || 3000;
const server: Express = express();

server.use(express.json());

server.post('/login', login);

server.use(sessionMiddleware)

server.use('/auth', verificationMiddleware, authRouter);
server.use('/admin', verificationMiddleware, adminRouter);


server.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error({
    name: err.name,
    message: err.message,
    stack: err.stack,
    details: err
  });
  res.status(500).json({ error: 'Internal Server Error' });
})


server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});