import Router from "express";

import { requireAdmin, getUsers, createUser, updateUser, resetUserPassword, deleteUser } from "./admin.controller.js";

const adminRouter = Router();


adminRouter.get("", requireAdmin, getUsers);
adminRouter.post("", requireAdmin, createUser);
adminRouter.put("/:id", requireAdmin, updateUser);
adminRouter.post("/:id/reset-password", requireAdmin, resetUserPassword);
adminRouter.delete("/:id", requireAdmin, deleteUser);


export { adminRouter };