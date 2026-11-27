import { Router } from "express";

import {
  requireStudent,
  requireStaff,
  requireStudentOrStaff,
  createHold,
  cancelHold,
  getActiveHolds
} from "./holds.controller.js";

// mount at /api/v1/holds
const holdsRouter = Router();
holdsRouter.post("", requireStudent, createHold); // 6.2 createHold
holdsRouter.delete("/:id", requireStudentOrStaff, cancelHold); // 6.3 cancelHold

// mount at /api/v1/staff/holds
const staffHoldsRouter = Router();
staffHoldsRouter.get("", requireStaff, getActiveHolds); // 7.7 getActiveHolds

export { holdsRouter, staffHoldsRouter };
