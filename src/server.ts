import express, { type Express, type Request, type Response, type NextFunction } from 'express';


import { sessionMiddleware } from '@shared/middlewares/session.middleware.js';
import { verificationMiddleware } from '@shared/middlewares/verification.middleware.js';

import { authRouter } from '@modules/auth/auth.routes.js';
import { login } from '@modules/auth/auth.controller.js';

import { adminRouter } from '@modules/admin/admin.routes.js';
import { name } from 'nodemailer/lib/package-info.js';


import {initSeed} from '@shared/database/init.seed.js';






const PORT: number | undefined = parseInt(process.env.SERVER_PORT as string) || 3000;
const server: Express = express();


server.use(express.json());



server.use(sessionMiddleware)

server.post('/api/v1/auth/login', login);

server.use('/api/v1/auth', verificationMiddleware, authRouter);
server.use('/api/v1/admin/users', verificationMiddleware, adminRouter);


server.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error({
    name: err.name,
    message: err.message,
    stack: err.stack,
    details: err
  });
  res.status(500).json({ error: 'Internal Server Error' });
})

server.use('/', (req: Request, res: Response) => {
  res.status(404).json({ error: 'Path not found' });
});

const startServer = async () => {
  try {
    console.log('Running database seeding...');
    await initSeed();
    
    server.listen(PORT, () => {
      console.log(`Server is running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to initialize server:', error);
    process.exit(1);
  }
};

startServer();