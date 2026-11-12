import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@shared/utils/errors.util.js';   


export const verificationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req?.session) {
    if (req.session.accountId 
        && req.session._id 
        && req.session.role 
        && (req.session.role === "admin"
        || req.session.role === "student"
        || req.session.role === "staff")
      ) {
      next();
    } else {
      const error = new AppError(false, {
        code: "UNAUTHORIZED",
        message: "Unauthorized access",
        details: { reason: "User is not authenticated" }
      });
      return res.status(401).json(error);
    }
  }
};