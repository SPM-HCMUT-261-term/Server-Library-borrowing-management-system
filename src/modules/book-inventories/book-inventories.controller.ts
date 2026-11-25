import type { Request, Response } from "express";
import z from "zod";

import { pool } from "@shared/database/db.js";

import { BookInventoriesService } from "./book-inventories.service.js";
import {
  BooksRepositoryImpl,
  PhysicalCopiesRepositoryImpl
} from "./repositories/book-inventories.repository.js";

const bookCategorySchema = z.enum([
  "Fiction",
  "Non-fiction",
  "Poetry",
  "Graphic novels",
  "Reference"
]);

// Defaults the API contract (4.4) asks the backend to fill in when POST /books omits them.
const DEFAULT_BOOK_LANGUAGE = "English";
const DEFAULT_BOOK_FORMAT = "Paperback";
const DEFAULT_COVER_IMAGE_URL = "https://placehold.co/300x450?text=No+Cover";
const DEFAULT_BOOK_DESCRIPTION = "No description available for this title yet.";

// Comma-separated list of categories, e.g. "Fiction,Poetry". Every item must be a known category.
// The output stays a string because the repository splits it itself.
const categoryListQuerySchema = z
  .string()
  .trim()
  .superRefine((value, ctx) => {
    const invalidCategories = value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)
      .filter((item) => !bookCategorySchema.safeParse(item).success);
    if (invalidCategories.length > 0) {
      ctx.addIssue({
        code: "custom",
        message: `Invalid category: ${invalidCategories.join(", ")}. Allowed values: ${bookCategorySchema.options.join(", ")}`
      });
    }
  });

const getFeaturedBooksQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional()
});

const getBooksQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: categoryListQuerySchema.optional(),
  genre: z.string().trim().optional(),
  language: z.string().trim().optional(),
  // z.coerce.boolean() would turn "false" into true, so parse the string explicitly.
  availableNow: z.stringbool().optional(),
  stock: z.enum(["all", "available", "unavailable"]).optional(),
  sortBy: z.enum(["relevance", "title", "publishedYear"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

const getBookByIdParamsSchema = z.object({
  id: z.string().trim().min(1, "Book id is required")
});

// JSON bodies already carry real numbers, so no coerce: "", null, true, false are rejected.
const createBookBodySchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    author: z.string().trim().min(1, "Author is required"),
    isbn: z.string().trim().min(1, "ISBN is required"),
    category: bookCategorySchema,
    keywords: z.array(z.string().trim()).optional(),
    publisher: z.string().trim().optional(),
    genre: z.string().trim().optional(),
    publishedYear: z.number().int().positive().optional(),
    language: z.string().trim().default(DEFAULT_BOOK_LANGUAGE),
    format: z.string().trim().default(DEFAULT_BOOK_FORMAT),
    pageCount: z.number().int().positive().optional(),
    description: z.string().trim().default(DEFAULT_BOOK_DESCRIPTION),
    coverImageUrl: z.string().trim().default(DEFAULT_COVER_IMAGE_URL),
    shelfReference: z.string().trim().optional()
  })
  // genre defaults to the category, which needs the whole object, so it is filled in here.
  .transform((book) => ({ ...book, genre: book.genre ?? book.category }));

const updateBookRequestSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Book id is required")
  }),
  body: z.object({
    title: z.string().trim().min(1, "Title is required"),
    author: z.string().trim().min(1, "Author is required"),
    isbn: z.string().trim().min(1, "ISBN is required"),
    category: bookCategorySchema,
    publisher: z.string().trim().nullable().optional(),
    keywords: z.array(z.string().trim()).optional(),
    genre: z.string().trim().nullable().optional(),
    publishedYear: z.number().int().positive().nullable().optional(),
    language: z.string().trim().optional(),
    format: z.string().trim().optional(),
    pageCount: z.number().int().positive().nullable().optional(),
    description: z.string().trim().nullable().optional(),
    coverImageUrl: z.string().trim().nullable().optional(),
    shelfReference: z.string().trim().nullable().optional()
  })
});

const deleteBookParamsSchema = z.object({
  id: z.string().trim().min(1, "Book id is required")
});

const addCopyToBookRequestSchema = z.object({
  params: z.object({
    bookId: z.string().trim().min(1, "Book id is required")
  }),
  body: z.object({
    // Required for now: the repository has no helper to auto-generate the next "WB-xxxxx" code.
    copyCode: z.string().trim().min(1, "Copy code is required"),
    homeLocation: z.string().trim().min(1, "Home location is required"),
    initialState: z.enum(["Available", "Damaged", "Lost"]).default("Available"),
    condition: z.enum(["Good", "Damaged", "Lost"]).default("Good"),
    notes: z.string().trim().optional()
  })
});

const updateCopyRequestSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Copy id is required")
  }),
  body: z.object({
    homeLocation: z.string().trim().min(1, "Home location is required"),
    state: z.enum(["Available", "Damaged", "Lost"]),
    condition: z.enum(["Good", "Damaged", "Lost"]),
    notes: z.string().trim().nullable().optional()
  })
});

const deleteCopyParamsSchema = z.object({
  id: z.string().trim().min(1, "Copy id is required")
});

type BookInventoryError = Error & { code?: string };

function handleBookInventoryError(res: Response, error: unknown): void {
  const serviceError = error as BookInventoryError;
  const errorResponses: Record<string, { status: number; message: string }> = {
    BOOK_NOT_FOUND: { status: 404, message: "Book not found" },
    COPY_NOT_FOUND: { status: 404, message: "Physical copy not found" },
    DUPLICATE_ISBN: { status: 409, message: "A book with this ISBN already exists" },
    DUPLICATE_COPY_CODE: {
      status: 409,
      message: "Copy ID / barcode must be unique across the library"
    },
    BOOK_HAS_COPIES_OR_HISTORY: {
      status: 409,
      message: "This title has physical copies or loan history and cannot be deleted"
    },
    COPY_HAS_ACTIVE_LOAN_OR_HOLD: {
      status: 409,
      message: "Complete the return or cancel the hold before changing this copy"
    },
    COPY_HAS_LOAN_HISTORY: {
      status: 409,
      message: "This copy has loan history and cannot be deleted"
    }
  };
  const mappedError = serviceError.code ? errorResponses[serviceError.code] : undefined;

  res.status(mappedError?.status ?? 500).json({
    success: false,
    error: {
      code: serviceError.code ?? "INTERNAL_SERVER_ERROR",
      message: mappedError?.message ?? "An unexpected error occurred"
    }
  });
}

function validationDetails(error: z.ZodError): Record<string, string> {
  return Object.fromEntries(
    error.issues.map((issue) => [issue.path.join("."), issue.message])
  );
}

function sendValidationError(res: Response, error: z.ZodError): void {
  res.status(400).json({
    success: false,
    error: {
      code: "VALIDATION_ERROR",
      message: "Invalid input",
      details: validationDetails(error)
    }
  });
}

const bookInventoriesService = new BookInventoriesService(
  new BooksRepositoryImpl(pool),
  new PhysicalCopiesRepositoryImpl(pool)
);


export async function requireStaffAndStudent(req: Request, res: Response, next: () => void): Promise<void> {
    if (req.session?.role === "student" || req.session?.role == "staff") {
        next();
    } else {
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN_ACCESS",
                message: "Access denied. Only students are allowed to access this resource."
            }
        });
    }
}


export async function requireStaff(req: Request, res: Response, next: () => void): Promise<void> {
    if (req.session?.role === "staff") {
        next();
    } else {
        res.status(403).json({
            success: false,
            error: {
                code: "FORBIDDEN_ACCESS",
                message: "Access denied. Only staffs are allowed to access this resource."
            }
        });
    }
}

export async function getFeaturedBooks(req: Request, res: Response): Promise<void> {
  const parsed = getFeaturedBooksQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const data = await bookInventoriesService.getFeaturedBooks({
      limit: parsed.data.limit
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function getBooks(req: Request, res: Response): Promise<void> {
  const parsed = getBooksQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const data = await bookInventoriesService.getBooks({
      q: parsed.data.q,
      category: parsed.data.category,
      genre: parsed.data.genre,
      language: parsed.data.language,
      availableNow: parsed.data.availableNow,
      stock: parsed.data.stock,
      sortBy: parsed.data.sortBy,
      page: parsed.data.page,
      limit: parsed.data.limit
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function getBookById(req: Request, res: Response): Promise<void> {
  const parsed = getBookByIdParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const role: "staff" | "student" =
    req.session?.role === "staff" ? "staff" : "student";
  const studentId = role === "student" ? (req.session?._id ?? null) : null;

  try {
    const data = await bookInventoriesService.getBookById(
      parsed.data.id,
      role,
      studentId
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function createBook(req: Request, res: Response): Promise<void> {
  const parsed = createBookBodySchema.safeParse(req.body);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const data = await bookInventoriesService.createBook(parsed.data);
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function updateBook(req: Request, res: Response): Promise<void> {
  const parsed = updateBookRequestSchema.safeParse({
    params: req.params,
    body: req.body
  });
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const data = await bookInventoriesService.updateBookById(
      parsed.data.params.id,
      parsed.data.body
    );
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function deleteBook(req: Request, res: Response): Promise<void> {
  const parsed = deleteBookParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    await bookInventoriesService.deleteBookById(parsed.data.id);
    res.status(200).json({
      success: true,
      message: "Book title deleted successfully"
    });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function addCopyToBook(req: Request, res: Response): Promise<void> {
  const parsed = addCopyToBookRequestSchema.safeParse({
    params: req.params,
    body: req.body
  });
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  try {
    const data = await bookInventoriesService.addCopyToBook({
      bookId: parsed.data.params.bookId,
      copyCode: parsed.data.body.copyCode,
      homeLocation: parsed.data.body.homeLocation,
      initialState: parsed.data.body.initialState,
      condition: parsed.data.body.condition,
      notes: parsed.data.body.notes
    });
    res.status(201).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function updateCopy(req: Request, res: Response): Promise<void> {
  const parsed = updateCopyRequestSchema.safeParse({
    params: req.params,
    body: req.body
  });
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  // :id is either the copy _id (numeric) or the copyCode (e.g. "WB-00422")
  const id = parsed.data.params.id;
  const isNumericId = /^\d+$/.test(id);

  try {
    const data = await bookInventoriesService.updateCopy({
      copyId: isNumericId ? id : undefined,
      copyCode: isNumericId ? undefined : id,
      homeLocation: parsed.data.body.homeLocation,
      state: parsed.data.body.state,
      condition: parsed.data.body.condition,
      notes: parsed.data.body.notes
    });
    res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}

export async function deleteCopy(req: Request, res: Response): Promise<void> {
  const parsed = deleteCopyParamsSchema.safeParse(req.params);
  if (!parsed.success) {
    sendValidationError(res, parsed.error);
    return;
  }

  const id = parsed.data.id;
  const isNumericId = /^\d+$/.test(id);

  try {
    await bookInventoriesService.deleteCopy({
      copyId: isNumericId ? id : undefined,
      copyCode: isNumericId ? undefined : id
    });
    res.status(200).json({
      success: true,
      message: "Physical copy deleted successfully"
    });
  } catch (error) {
    handleBookInventoryError(res, error);
  }
}