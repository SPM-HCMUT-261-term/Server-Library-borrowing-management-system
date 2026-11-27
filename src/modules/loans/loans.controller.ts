import type { Request, Response, NextFunction } from "express";
import z from "zod";

import { pool } from "@shared/database/db.js";
import {
  LoansRepositoryImpl,
  BorrowersRepositoryImpl,
  LoanCopiesRepositoryImpl,
  LoanHoldsRepositoryImpl
} from "./repositories/loans.repository.js";
import { LoansService } from "./loans.service.js";

const idParamsSchema = z.object({
  id: z.string().trim().min(1, "Loan id is required") // loan _id or borrowCode
});

const findStudentForCheckoutParamsSchema = z.object({
  accountId: z.string().trim().min(1, "Account id is required")
});

const checkCopyForCheckoutRequestSchema = z.object({
  params: z.object({
    copyCode: z.string().trim().min(1, "Copy code is required")
  }),
  query: z.object({
    studentAccountId: z.string().trim().min(1, "Student account id is required")
  })
});

const issueBooksBodySchema = z.object({
  studentAccountId: z.string().trim().min(1, "Student account id is required"),
  items: z
    .array(
      z.object({
        copyCode: z.string().trim().min(1, "Copy code is required"),
        dueDate: z.iso.date("Due date must be an ISO date (YYYY-MM-DD)")
      })
    )
    .min(1, "At least 1 copy is required")
    .max(5, "At most 5 copies can be issued at once")
  // the same copyCode twice in items is checked in the service (DUPLICATE_COPY_IN_BATCH)
});

const findActiveLoanByCopyParamsSchema = z.object({
  copyCode: z.string().trim().min(1, "Copy code is required")
});

const returnBookRequestSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Loan id is required")
  }),
  body: z.object({
    condition: z.enum(["Good", "Damaged", "Lost"]),
    conditionNote: z.string().trim().optional()
  })
});

const getLoanRecordsQuerySchema = z.object({
  tab: z.enum(["active", "returned"]).optional(),
  q: z.string().trim().optional(),
  status: z.enum(["all", "overdue", "due_soon", "on_loan"]).optional(),
  sortBy: z.enum(["dueDate", "borrowedAt", "returnedAt"]).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional()
});

const renewLoanParamsSchema = idParamsSchema;

type LoanError = Error & { code?: string; details?: unknown };

function handleLoanError(res: Response, error: unknown): void {
  const serviceError = error as LoanError;
  const errorResponses: Record<string, { status: number; message: string }> = {
    BAD_REQUEST: { status: 400, message: "Bad request" },
    STUDENT_NOT_FOUND: { status: 404, message: "Student account not found" },
    COPY_NOT_FOUND: { status: 404, message: "Physical copy not found" },
    DUPLICATE_COPY_IN_BATCH: { status: 400, message: "The same copy appears more than once in this checkout" },
    BORROWER_INELIGIBLE: { status: 403, message: "Student has overdue books or unpaid fines" },
    LOAN_LIMIT_EXCEEDED: { status: 403, message: "This checkout would exceed the student's loan limit" },
    COPY_NOT_AVAILABLE_FOR_STUDENT: {
      status: 409,
      message: "One or more copies are already borrowed, damaged, lost, or reserved for another student"
    },
    ACTIVE_LOAN_NOT_FOUND: { status: 404, message: "This copy does not have an active loan" },
    LOAN_NOT_FOUND: { status: 404, message: "Loan not found" },
    LOAN_ALREADY_RETURNED: {
      status: 409,
      message: "Only an active loan can be checked in. A copy already returned will not be returned again."
    },
    RENEWAL_NOT_ELIGIBLE: {
      status: 403,
      message: "This loan cannot be renewed: already renewed once, overdue, or the account is blocked"
    }
  };
  const mappedError = serviceError.code ? errorResponses[serviceError.code] : undefined;

  if (!mappedError) {
    console.error(error); // unexpected error: keep the stack trace in the server log
  }

  res.status(mappedError?.status ?? 500).json({
    success: false,
    error: {
      code: serviceError.code ?? "INTERNAL_SERVER_ERROR",
      message: mappedError?.message ?? "An unexpected error occurred",
      ...(mappedError && serviceError.details !== undefined ? { details: serviceError.details } : {})
    }
  });
}

// For the schemas above: respond 400 { success: false, error: { code: "VALIDATION_ERROR", message: "Invalid input", details } }
function handleValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details: Object.fromEntries(error.issues.map((issue) => [issue.path.join("."), issue.message]))
    }
  });
}

const loansService = new LoansService(
  new LoansRepositoryImpl(pool),
  new BorrowersRepositoryImpl(pool),
  new LoanCopiesRepositoryImpl(pool),
  new LoanHoldsRepositoryImpl(pool)
);


export async function requireStudent(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.session?.role === "student") {
        next();
    } else {
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN_ACCESS",
                message: "Access denied. Only students are allowed to access this resource."
            }
        });
    }
}

export async function requireStaff(req: Request, res: Response, next: NextFunction): Promise<void> {
    if (req.session?.role === "staff") {
        next();
    } else {
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN_ACCESS",
                message: "Access denied. Only staffs are allowed to access this resource."
            }
        });
    }
}


// GET /staff/students/:accountId (staff)
export async function findStudentForCheckout(req: Request, res: Response): Promise<void> {
  const parsed = findStudentForCheckoutParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    handleValidationError(res, parsed.error);
    return;
  }
  try {
    const data = await loansService.findStudentForCheckout(parsed.data.accountId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleLoanError(res, error);
  }
}

// GET /staff/copies/:copyCode/checkout-check?studentAccountId=... (staff)
export async function checkCopyForCheckout(req: Request, res: Response): Promise<void> {
  const parsed = checkCopyForCheckoutRequestSchema.safeParse({
    params: req.params,
    query: req.query
  });
  if (!parsed.success) {
    handleValidationError(res, parsed.error);
    return;
  }
  try {
    const data = await loansService.checkCopyForCheckout({
      copyCode: parsed.data.params.copyCode,
      studentAccountId: parsed.data.query.studentAccountId
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleLoanError(res, error);
  }
}

// POST /staff/loans/issue (staff)
export async function issueBooks(req: Request, res: Response): Promise<void> {
  const parsed = issueBooksBodySchema.safeParse(req.body);
  if (!parsed.success) {
    handleValidationError(res, parsed.error);
    return;
  }
  try {
    const result = await loansService.issueBooks(parsed.data);
    res.status(201).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    handleLoanError(res, error);
  }
}

// GET /staff/loans/active-by-copy/:copyCode (staff)
export async function findActiveLoanByCopy(req: Request, res: Response): Promise<void> {
  const parsed = findActiveLoanByCopyParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    handleValidationError(res, parsed.error);
    return;
  }
  try {
    const data = await loansService.findActiveLoanByCopy(parsed.data.copyCode);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleLoanError(res, error);
  }
}

// POST /staff/loans/:id/return (staff)
export async function returnBook(req: Request, res: Response): Promise<void> {
  const parsed = returnBookRequestSchema.safeParse({
    params: req.params,
    body: req.body
  });
  if (!parsed.success) {
    handleValidationError(res, parsed.error);
    return;
  }
  try {
    const result = await loansService.returnBook({
      id: parsed.data.params.id,
      condition: parsed.data.body.condition,
      conditionNote: parsed.data.body.conditionNote
    });
    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    handleLoanError(res, error);
  }
}

// GET /staff/loans (staff)
export async function getLoanRecords(req: Request, res: Response): Promise<void> {
  const parsed = getLoanRecordsQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    handleValidationError(res, parsed.error);
    return;
  }
  try {
    const data = await loansService.getLoanRecords(parsed.data);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleLoanError(res, error);
  }
}

// GET /me/borrowing (student)
export async function getMyBorrowing(req: Request, res: Response): Promise<void> {
  const studentId = req.session?._id;
  if (!studentId) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication is required" }
    });
    return;
  }
  try {
    const data = await loansService.getMyBorrowing(studentId);
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleLoanError(res, error);
  }
}

// POST /loans/:id/renew (student)
export async function renewLoan(req: Request, res: Response): Promise<void> {
  const parsed = renewLoanParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    handleValidationError(res, parsed.error);
    return;
  }
  const studentId = req.session?._id;
  if (!studentId) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHORIZED", message: "Authentication is required" }
    });
    return;
  }
  try {
    const result = await loansService.renewLoan({
      id: parsed.data.id,
      studentId
    });
    res.status(200).json({
      success: true,
      message: result.message,
      data: result.data
    });
  } catch (error) {
    handleLoanError(res, error);
  }
}