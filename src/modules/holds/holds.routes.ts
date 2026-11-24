import { Router } from "express";

import { requireStaff, requireStudent, requireStaffOrStudent } from "@shared/middlewares/require-role.middleware.js";
import { createHold, cancelHold, getActiveHolds } from "./holds.controller.js";

// mount at /holds
const holdsRouter = Router();
holdsRouter.post("", requireStudent, createHold);
holdsRouter.delete("/:id", requireStaffOrStudent, cancelHold);

// mount at /staff/holds
const staffHoldsRouter = Router();
staffHoldsRouter.get("", requireStaff, getActiveHolds);

export { holdsRouter, staffHoldsRouter };
