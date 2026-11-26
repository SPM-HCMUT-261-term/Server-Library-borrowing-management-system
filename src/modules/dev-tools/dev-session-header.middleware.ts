import type { NextFunction, Request, Response } from "express";

// Development helper for Postman web's Browser Agent.
// A browser never lets a script read Set-Cookie or set the Cookie header, so a test script
// cannot keep the express-session cookie there. This middleware carries the same cookie in a
// normal header instead:
//   - response: whenever express-session sets connect.sid, its "connect.sid=..." pair is copied
//     into X-Session-Cookie (and exposed through CORS so the script can read it);
//   - request: an X-Session-Cookie header replaces the Cookie header before express-session reads it.
// The value is the same signed cookie the server already hands out, so nothing new is trusted.
// server.ts mounts it only when ENABLE_DB_RESET=true, before sessionMiddleware.

const SESSION_HEADER = "X-Session-Cookie";
const SESSION_COOKIE_NAME = "connect.sid";

const devSessionHeaderMiddleware = (req: Request, res: Response, next: NextFunction): void => {
    const fromHeader = req.get(SESSION_HEADER);
    if (fromHeader) {
        req.headers.cookie = fromHeader;
    }

    res.setHeader("Access-Control-Expose-Headers", SESSION_HEADER);

    // express-session writes Set-Cookie with res.setHeader just before the headers are sent.
    const originalSetHeader = res.setHeader.bind(res);
    res.setHeader = function setHeaderWithSessionCopy(name: string, value: number | string | readonly string[]) {
        if (name.toLowerCase() === "set-cookie") {
            const cookies = Array.isArray(value) ? value : [String(value)];
            const pair = cookies
                .map((cookie) => String(cookie).split(";")[0]?.trim() ?? "")
                .find((cookie) => cookie.startsWith(`${SESSION_COOKIE_NAME}=`));
            if (pair) {
                originalSetHeader(SESSION_HEADER, pair);
            }
        }
        return originalSetHeader(name, value);
    } as Response["setHeader"];

    next();
};

export { devSessionHeaderMiddleware };
