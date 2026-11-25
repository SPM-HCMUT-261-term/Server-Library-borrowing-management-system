import express, { type Express, type Request, type Response, type NextFunction } from 'express';
import { name } from 'nodemailer/lib/package-info.js';
import morgan from 'morgan';
import cors from 'cors';

import { sessionMiddleware } from '@shared/middlewares/session.middleware.js';
import { verificationMiddleware } from '@shared/middlewares/verification.middleware.js';

import { authRouter } from '@modules/auth/auth.routes.js';
import { login } from '@modules/auth/auth.controller.js';

import { adminRouter } from '@modules/admin/admin.routes.js';

import { bookRouter, physicalCopiesRouter } from '@modules/book-inventories/book-inventories.routes';
import { devToolsRouter } from '@modules/dev-tools/dev-tools.routes.js';
import { devSessionHeaderMiddleware } from '@modules/dev-tools/dev-session-header.middleware.js';





import {initSeed} from '@shared/database/init.seed.js';
import { core } from 'node_modules/zod/index.cjs';






const PORT: number | undefined = parseInt(process.env.SERVER_PORT as string) || 3000;
const server: Express = express();


server.use(cors())

// Development only (same switch as the reset route): lets Postman web's Browser Agent keep a
// session through the X-Session-Cookie header. Must run before sessionMiddleware.
if (process.env.ENABLE_DB_RESET === 'true') {
  server.use(devSessionHeaderMiddleware);
}

server.use(express.json());

server.use(morgan('dev'));

server.use(sessionMiddleware)

server.post('/api/v1/auth/login', login);

server.use('/api/v1/auth', verificationMiddleware, authRouter);

server.use('/api/v1/admin/users', verificationMiddleware, adminRouter);

// 4.1 - 5.1
server.use('/api/v1/books', verificationMiddleware, bookRouter);

// 5.2, 5.35.
server.use('/api/v1/copies', verificationMiddleware, physicalCopiesRouter);

// Development only: POST /api/v1/dev/reset-db empties and reseeds the database, with no login.
// Opt in with ENABLE_DB_RESET=true in .env; leave it unset anywhere else.
if (process.env.ENABLE_DB_RESET === 'true') {
  server.use('/api/v1/dev', devToolsRouter);
  console.warn('ENABLE_DB_RESET is on: POST /api/v1/dev/reset-db can wipe the database.');
}




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