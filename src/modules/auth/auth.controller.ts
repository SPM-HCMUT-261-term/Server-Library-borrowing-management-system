import type { Request, Response } from "express";
import z from "zod";

const loginRequestSchema = z.object({
  accountId: z.string().min(1),
  password: z.string().min(6),
  role: z.enum(["student", "staff", "admin"])
})

function login(req: Request, res: Response): void {
    const { accountId, password, role } = req.body;

    const validationResult = loginRequestSchema.safeParse({
        accountId,
        password,
        role
    });

    // Find kinds of invalid roles


    if (!validationResult.success) {
        res.status(400).json({
            success: false,
            error: {
                code: "INVALID_INPUT",
                message: "Invalid input"
            }
        });
        return;
    }

    // Proceed with login logic
    // TODO
    return;
}



function getMe(req: Request, res: Response): void {
  // TODO
}

function logout(req: Request, res: Response): void {
  // TODO
}