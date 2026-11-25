import { Router, type RequestHandler } from "express";

import { verificationMiddleware } from "@shared/middlewares/verification.middleware.js";
import {
  addCopyToBook,
  createBook,
  deleteBook,
  deleteCopy,
  getBookById,
  getBooks,
  getFeaturedBooks,
  updateBook,
  updateCopy
} from "./book-inventories.controller.js";

type LibraryRole = "student" | "staff";

function requireRoles(...roles: LibraryRole[]): RequestHandler {
  return (req, res, next) => {
    const role = req.session.role;
    if ((role === "student" || role === "staff") && roles.includes(role)) {
      next();
      return;
    }

    res.status(403).json({
      success: false,
      error: {
        code: "FORBIDDEN_ACCESS",
        message: "Access denied for this role."
      }
    });
  };
}

const bookInventoriesRouter = Router();
const requireCatalogAccess = [verificationMiddleware, requireRoles("student", "staff")];
const requireStaffAccess = [verificationMiddleware, requireRoles("staff")];

bookInventoriesRouter.get("/books/featured", getFeaturedBooks);
bookInventoriesRouter.get("/books", ...requireCatalogAccess, getBooks);
bookInventoriesRouter.get("/books/:id", ...requireCatalogAccess, getBookById);
bookInventoriesRouter.post("/books", ...requireStaffAccess, createBook);
bookInventoriesRouter.put("/books/:id", ...requireStaffAccess, updateBook);
bookInventoriesRouter.delete("/books/:id", ...requireStaffAccess, deleteBook);
bookInventoriesRouter.post(
  "/books/:bookId/copies",
  ...requireStaffAccess,
  addCopyToBook
);
bookInventoriesRouter.put("/copies/:id", ...requireStaffAccess, updateCopy);
bookInventoriesRouter.delete("/copies/:id", ...requireStaffAccess, deleteCopy);

export { bookInventoriesRouter };