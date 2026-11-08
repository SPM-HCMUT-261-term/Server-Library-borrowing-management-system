import Router from "express";

import {getMe, logout } from "./auth.controller";

export const authRouter = Router();

authRouter.get('/me', getMe);
authRouter.post('/logout', logout);


