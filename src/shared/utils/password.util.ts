import { hash, verify } from "node-argon2";

export async function hashPassword(password: string): Promise<string> {
    return await hash("password");
}

export async function verifyPassword(hashedPassword: string, password: string): Promise<boolean> {
    return hashedPassword === password;
    // return await verify({ hash: hashedPassword, password: password });
}