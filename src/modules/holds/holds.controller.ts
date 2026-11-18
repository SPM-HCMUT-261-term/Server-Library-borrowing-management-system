import type { Request, Response } from "express";
import z from "zod";



// TODO: wire these up once HoldsRepositoryImpl exists (same pattern as admin.controller.ts)
// import { pool } from "@shared/database/db.js";
// import { HoldsRepositoryImpl } from "./repositories/holds.repository.js";
// import { HoldsService } from "./holds.service.js";

// zod schemas for input request validation
const idSchema = z.string().trim().min(1, "id is required"); // hold _id or holdCode

const createHoldSchema = z.object({
  bookId: z.string().trim().min(1, "bookId is required")
});

const activeHoldsQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});


// handle service errors and validation errors
type ServiceError = Error & { code?: string; details?: unknown };

function validationDetails(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join("."), issue.message])
  );
}

function sendServiceError(res: Response, error: unknown): void {
  const serviceError = error as ServiceError;
  const responses: Record<string, { status: number; message: string }> = {
    BAD_REQUEST: { status: 400, message: "Bad request" },
    BOOK_NOT_FOUND: { status: 404, message: "Book not found" },
    NO_AVAILABLE_COPIES: { status: 400, message: "All physical copies of this book are currently unavailable" },
    BORROWING_BLOCKED: { status: 403, message: "You have overdue books or unpaid fines" },
    DUPLICATE_HOLD_OR_LOAN: { status: 409, message: "You already hold or borrow a copy of this book" },
    HOLD_NOT_FOUND: { status: 404, message: "Hold not found" },
    HOLD_NOT_CANCELLABLE: { status: 409, message: "Hold is already fulfilled or cancelled" }
  };
  const response = serviceError.code ? responses[serviceError.code] : undefined;

  if (!response) {
    console.error(error); // unexpected error: keep the stack trace in the server log
  }

  res.status(response?.status ?? 500).json({
    success: false,
    error: {
      code: serviceError.code ?? "INTERNAL_SERVER_ERROR",
      message: response?.message ?? "An unexpected error occurred",
      ...(response && serviceError.details !== undefined ? { details: serviceError.details } : {})
    }
  });
}

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details: validationDetails(error)
    }
  });
}

// const holdsService = new HoldsService(new HoldsRepositoryImpl(pool));


// controller handlers for holds routes (role checks live in holds.routes.ts)

// POST /holds (student)
export async function createHold(req: Request, res: Response): Promise<void> {
  const body = createHoldSchema.safeParse(req.body);
  if (!body.success) {
    sendValidationError(res, body.error);
    return;
  }

  try {
    // TODO: const data = await holdsService.createHold({ studentId, bookId: body.data.bookId }); // studentId from req.session._id
    // TODO: res.status(201).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error);
  }
}

// DELETE /holds/:id (student owner | staff)
export async function cancelHold(req: Request, res: Response): Promise<void> {
  const params = z.object({ id: idSchema }).safeParse(req.params);
  if (!params.success) {
    sendValidationError(res, params.error);
    return;
  }

  const requesterRole = req.session?.role as "student" | "staff";

  try {
    // TODO: const data = await holdsService.cancelHold({ id: params.data.id, requesterId, requesterRole });
    // TODO: res.status(200).json({
    //   success: true,
    //   message: `Hold ${data.holdCode} has been cancelled and the copy is now available.`,
    //   data
    // });
  } catch (error) {
    sendServiceError(res, error);
  }
}

// GET /staff/holds (staff)
export async function getActiveHolds(req: Request, res: Response): Promise<void> {
  const query = activeHoldsQuerySchema.safeParse(req.query);
  if (!query.success) {
    sendValidationError(res, query.error);
    return;
  }

  try {
    // TODO: const data = await holdsService.getActiveHolds({ q: query.data.q, page: query.data.page, limit: query.data.limit });
    // TODO: res.status(200).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error);
  }
}
