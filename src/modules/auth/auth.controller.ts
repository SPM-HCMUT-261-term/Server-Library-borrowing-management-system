import type { Request, Response } from "express";
import z from "zod";

import { AuthService } from "./auth.service";


const loginRequestSchema = z.object({
  accountId: z.string().trim().min(1, "accountId is required"),
  password: z.string().min(1, "password is required"),
  role: z.enum(["student", "staff", "admin"], {
    error: "role must be one of 'student', 'staff', or 'admin'"
  })
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
    INVALID_CREDENTIALS: { status: 401, message: "Invalid school account ID or password" },
    ROLE_MISMATCH: { status: 403, message: "Account does not have the selected role" },
    ACCOUNT_INACTIVE: { status: 403, message: "This account is inactive" },
    USER_NOT_FOUND: { status: 404, message: "User not found" }
  };
  const response = serviceError.code ? responses[serviceError.code] : undefined;

  if (!response) {
    res.status(500).json({
      success: false,
      error: { code: "INTERNAL_SERVER_ERROR", message: "An unexpected error occurred" }
    });
    return;
  }

  res.status(response.status).json({
    success: false,
    error: { code: serviceError.code, message: response.message }
  });
}

type AuthenticatedRequest = Request & {
  user?: { id?: number | string; _id?: number | string };
};


const authService: AuthService = new AuthService(null); 

export async function login(req: Request, res: Response): Promise<void> {
  const parsed = loginRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_INPUT",
        message: "Invalid input",
        details: validationDetails(parsed.error)
      }
    });
    return;
  }

  try {
    const data = await authService.login(parsed.data);
    req.session._id = data.user._id;
    req.session.accountId = data.user.accountId;
    req.session.fullName = data.user.fullName;
    req.session.role = data.user.role;
    res.status(200).json({ success: true, data: data });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export async function getMe(req: Request, res: Response): Promise<void> {
  const userId = parseInt(req.session._id as string);
  if (userId === undefined) {
    res.status(401).json({
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Authentication is required" }
    });
    return;
  }

  try {
    const user = await authService.getMe({ userId });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    sendServiceError(res, error);
  }
}

export async function logout(req: Request, res: Response): Promise<void> {
  let isDestroyed: boolean = true;
  req.session.destroy((err) => {
    if (err) {
      isDestroyed = false;
      res.status(500).json({
        success: false,
        error: { code: "INTERNAL_SERVER_ERROR", message: "Failed to destroy session" }
      });
      return;
    }
  });

  if (!isDestroyed) {
    return;
  }

  res.status(200).json({
    success: true,
    message: "Signed out successfully"
  });
}
