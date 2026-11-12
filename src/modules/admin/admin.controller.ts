import type { Request, Response } from "express";
import z from "zod";


import { pool } from '@shared/database/db.js';
// import { AdminRepository } from "./repositories/admin.repository.interface";


import { AdminRepositoryImpl } from "./repositories/admin.repository.js";
import { AdminService } from "./admin.service.js";


const roleSchema = z.enum(["student", "staff", "admin"]);
const idSchema = z.string().trim().min(1, "id is required");

const usersQuerySchema = z.object({
  q: z.string().optional(),
  role: z.enum(["all", "student", "staff", "admin"]).optional(),
  status: z.enum(["all", "Active", "Inactive"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

const createUserSchema = z.object({
  accountId: z.string().trim().min(1, "accountId is required"),
  fullName: z.string().trim().min(1, "fullName is required").
    regex(/^[a-zA-ZÀ-ỹ\s]+$/, "fullName must only contain letters and spaces in English and Vietnamese"),
  password: z.string().min(1, "password is required"),
  role: roleSchema,
  yearGroup: z.string().trim().nullable().optional()
});

const updateUserSchema = z.object({
  fullName: z.string().trim().min(1, "fullName is required"),
  role: roleSchema,
  yearGroup: z.string().trim().nullable().optional(),
  status: z.enum(["Active", "Inactive"])
});

const resetPasswordSchema = z.object({
  newPassword: z.string().min(1, "newPassword is required")
});

type ServiceError = Error & { code?: string };

function validationDetails(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path, issue.message])
  );
}

function sendServiceError(res: Response, error: unknown): void {
  const serviceError = error as ServiceError;
  const responses: Record<string, { status: number; message: string }> = {
    BAD_REQUEST: { status: 400, message: "Bad request" },
    DUPLICATE_ACCOUNT_ID: { status: 409, message: "An account with this accountId already exists" },
    USER_NOT_FOUND: { status: 404, message: "User not found" },
    USER_HAS_LOAN_HISTORY: {
      status: 409,
      message: "Cannot delete an account with borrowing or hold history. Deactivate the account instead."
    }
  };
  const response = serviceError.code ? responses[serviceError.code] : undefined;

  res.status(response?.status ?? 500).json({
    success: false,
    error: {
      code: serviceError.code ?? "INTERNAL_SERVER_ERROR",
      message: response?.message ?? "An unexpected error occurred"
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

let adminRepository: AdminRepositoryImpl = new AdminRepositoryImpl(pool);
const adminService = new AdminService(adminRepository);



export async function getUsers(req: Request, res: Response): Promise<void> {
  const parsed = usersQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const data = await adminService.getUsers(parsed.data);
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export async function createUser(req: Request, res: Response): Promise<void> {
  const parsed = createUserSchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const data = await adminService.createUser({
      ...parsed.data
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export async function updateUser(req: Request, res: Response): Promise<void> {
  const params = z.object({ id: idSchema }).safeParse(req.params);
  const body = updateUserSchema.safeParse(req.body);
  if (!params.success) {
    sendValidationError(res, params.error);
    return;
  }
  if (!body?.success) {
    sendValidationError(res, body.error);
    return;
  }

  try {
    const data = await adminService.updateUser({
      id: params.data.id,
      ...body.data
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export async function resetUserPassword(req: Request, res: Response): Promise<void> {
  const params = z.object({ id: idSchema }).safeParse(req.params);
  const body = resetPasswordSchema.safeParse(req.body);
  if (!params.success) {
    sendValidationError(res, params.error);
    return;
  }
  if (!body.success) {
    sendValidationError(res, body.error);
    return;
  }

  try {
    await adminService.resetUserPassword({
      id: params.data.id,
      newPassword: body.data.newPassword
    });
    res.status(200).json({
      success: true,
      message: `Password reset successfully for account ${params.data.id}.`
    });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export async function deleteUser(req: Request, res: Response): Promise<void> {
  const params = z.object({ id: idSchema }).safeParse(req.params);
  if (!params.success) {
    sendValidationError(res, params.error);
    return;
  }

  try {
    await adminService.deleteUser(params.data.id);
    res.status(200).json({
      success: true,
      message: "User account deleted successfully."
    });
  } catch (error) {
    sendServiceError(res, error);
  }
}
