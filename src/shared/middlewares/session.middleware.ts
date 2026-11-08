import session from "express-session";
import connectPgSimple from "connect-pg-simple";

import { pool } from "@shared/database/db";

declare module 'express-session' {
    interface SessionData {
        _id: string;
        accountId: string;
        fullName: string;
        role: "admin" | "student" | "staff";

    }
}

const PgSessionStore = connectPgSimple(session);

export const sessionMiddleware = session({
  store: new PgSessionStore({
    pool: pool,
    tableName: 'user_sessions',
    pruneSessionInterval: 60 * 2, // every 2 minutes
    createTableIfMissing: true,
    errorLog: (error) => {
      console.error('Session store error:', error);
    }
  }),
  secret: process.env.SESSION_SECRET_KEY as string,
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    maxAge: 24 * 60 * 60 * 1000 // 24h
  }
});


export default sessionMiddleware;