import { Router } from "express";

import { requireStaff, requireStudent } from "@shared/middlewares/require-role.middleware.js";
import {
  findStudentForCheckout,
  checkCopyForCheckout,
  issueBooks,
  findActiveLoanByCopy,
  returnBook,
  getLoanRecords,
  getMyBorrowing,
  renewLoan
} from "./loans.controller.js";

// mount at /staff
const staffLoansRouter = Router();
staffLoansRouter.get("/students/:accountId", requireStaff, findStudentForCheckout);
staffLoansRouter.get("/copies/:copyCode/checkout-check", requireStaff, checkCopyForCheckout);
staffLoansRouter.post("/loans/issue", requireStaff, issueBooks);
staffLoansRouter.get("/loans/active-by-copy/:copyCode", requireStaff, findActiveLoanByCopy);
staffLoansRouter.post("/loans/:id/return", requireStaff, returnBook);
staffLoansRouter.get("/loans", requireStaff, getLoanRecords);

// mount at /loans
const studentLoansRouter = Router();
studentLoansRouter.post("/:id/renew", requireStudent, renewLoan);

// mount at /me
const meRouter = Router();
meRouter.get("/borrowing", requireStudent, getMyBorrowing);

export { staffLoansRouter, studentLoansRouter, meRouter };
