import type { Request, Response, NextFunction } from 'express';
import { AppError } from '@shared/utils/errors';   


export const verificationMiddleware = (req: Request, res: Response, next: NextFunction) => {
  if (req?.session) {
    if (req.session.accountId 
        && req.session._id 
        && req.session.role 
        && req.session.role in ["admin", "student", "staff"]) {
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