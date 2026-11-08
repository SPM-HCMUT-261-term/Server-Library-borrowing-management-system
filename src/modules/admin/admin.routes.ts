import Router from "express";

import { getUsers, createUser, updateUser, resetUserPassword, deleteUser } from "./admin.controller";

const adminRouter = Router();


adminRouter.get("/", getUsers);
adminRouter.post("/", createUser);
adminRouter.put("/:id", updateUser);
adminRouter.post("/:id/reset-password", resetUserPassword);
adminRouter.delete("/:id", deleteUser);


export { adminRouter };