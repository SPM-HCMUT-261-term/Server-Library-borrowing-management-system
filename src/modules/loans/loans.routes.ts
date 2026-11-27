import { Router } from "express";

import {
  requireStaff,
  requireStudent,
  findStudentForCheckout,
  checkCopyForCheckout,
  issueBooks,
  findActiveLoanByCopy,
  returnBook,
  getLoanRecords,
  getMyBorrowing,
  renewLoan
} from "./loans.controller.js";

// mount at /api/v1/staff
const staffLoansRouter = Router();
staffLoansRouter.get("/students/:accountId", requireStaff, findStudentForCheckout); // 7.1
staffLoansRouter.get("/copies/:copyCode/checkout-check", requireStaff, checkCopyForCheckout); // 7.2
staffLoansRouter.post("/loans/issue", requireStaff, issueBooks); // 7.3
staffLoansRouter.get("/loans/active-by-copy/:copyCode", requireStaff, findActiveLoanByCopy); // 7.4
staffLoansRouter.post("/loans/:id/return", requireStaff, returnBook); // 7.5
staffLoansRouter.get("/loans", requireStaff, getLoanRecords); // 7.6

// mount at /api/v1/loans
const studentLoansRouter = Router();
studentLoansRouter.post("/:id/renew", requireStudent, renewLoan); // 6.4

// mount at /api/v1/me
const meRouter = Router();
meRouter.get("/borrowing", requireStudent, getMyBorrowing); // 6.1

export { staffLoansRouter, studentLoansRouter, meRouter };
