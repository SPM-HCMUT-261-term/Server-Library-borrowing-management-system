import type { Request, Response } from "express";
import z from "zod";

import { BookInventoriesService } from "./book-inventories.service.js";

const getFeaturedBooksQuerySchema = z.object({
  limit: z.coerce.number().int().positive().optional()
});

const getBooksQuerySchema = z.object({
  q: z.string().trim().optional(),
  category: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  language: z.string().trim().optional(),
  availableNow: z.coerce.boolean().optional(),
  stock: z.enum(["all", "available", "unavailable"]).optional(),
  sortBy: z.enum(["relevance", "title", "publishedYear"]).optional(),
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().optional()
});

const getBookByIdParamsSchema = z.object({
  id: z.string().trim().min(1, "Book id is required")
});

const createBookBodySchema = z.object({
  title: z.string().trim().min(1, "Title is required"),
  author: z.string().trim().min(1, "Author is required"),
  isbn: z.string().trim().min(1, "ISBN is required"),
  category: z.enum([
    "Fiction",
    "Non-fiction",
    "Poetry",
    "Graphic novels",
    "Reference"
  ]),
  keywords: z.array(z.string().trim()).optional(),
  publisher: z.string().trim().optional(),
  genre: z.string().trim().optional(),
  publishedYear: z.coerce.number().int().optional(),
  language: z.string().trim().optional(),
  format: z.string().trim().optional(),
  pageCount: z.coerce.number().int().optional(),
  description: z.string().trim().optional(),
  coverImageUrl: z.string().trim().optional(),
  shelfReference: z.string().trim().optional()
});

const updateBookRequestSchema = z.object({
  params: z.object({
    id: z.string().trim().min(1, "Book id is required")
  }),
  body: z.object({
    title: z.string().trim().min(1, "Title is required"),
    author: z.string().trim().min(1, "Author is required"),
    isbn: z.string().trim().min(1, "ISBN is required"),
    category: z.enum([
      "Fiction",
      "Non-fiction",
      "Poetry",
      "Graphic novels",
      "Reference"
    ]),
    publisher: z.string().trim().nullable().optional(),
    keywords: z.array(z.string().trim()).optional(),
    genre: z.string().trim().nullable().optional(),
    publishedYear: z.coerce.number().int().nullable().optional(),
    language: z.string().trim().optional(),
    format: z.string().trim().optional(),
    pageCount: z.coerce.number().int().nullable().optional(),
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
    copyCode: z.string().trim().min(1).optional(),
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

let booksRepository: any = null;
let physicalCopiesRepository: any = null;
const bookInventoriesService = new BookInventoriesService(
  booksRepository,
  physicalCopiesRepository
);

export function getFeaturedBooks(_req: Request, _res: Response): void {
  const parsed = getFeaturedBooksQuerySchema.safeParse(_req.query);
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  try {
    const data = bookInventoriesService.getFeaturedBooks({
      limit: parsed.data.limit
    });
    _res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function getBooks(_req: Request, _res: Response): void {
  const parsed = getBooksQuerySchema.safeParse(_req.query);
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  try {
    const data = bookInventoriesService.getBooks({
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
    _res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function getBookById(_req: Request, _res: Response): void {
  const parsed = getBookByIdParamsSchema.safeParse(_req.params);
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  const role: "staff" | "student" =
    _req.session?.role === "staff" ? "staff" : "student";
  const studentId = role === "student" ? (_req.session?._id ?? null) : null;

  try {
    const data = bookInventoriesService.getBookById(
      parsed.data.id,
      role,
      studentId
    );
    _res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function createBook(_req: Request, _res: Response): void {
  const parsed = createBookBodySchema.safeParse(_req.body);
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  try {
    const data = bookInventoriesService.createBook(parsed.data);
    _res.status(201).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function updateBook(_req: Request, _res: Response): void {
  const parsed = updateBookRequestSchema.safeParse({
    params: _req.params,
    body: _req.body
  });
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  try {
    const data = bookInventoriesService.updateBookById(
      parsed.data.params.id,
      parsed.data.body
    );
    _res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function deleteBook(_req: Request, _res: Response): void {
  const parsed = deleteBookParamsSchema.safeParse(_req.params);
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  try {
    bookInventoriesService.deleteBookById(parsed.data.id);
    _res.status(200).json({
      success: true,
      message: "Book title deleted successfully"
    });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function addCopyToBook(_req: Request, _res: Response): void {
  const parsed = addCopyToBookRequestSchema.safeParse({
    params: _req.params,
    body: _req.body
  });
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  try {
    const data = bookInventoriesService.addCopyToBook({
      bookId: parsed.data.params.bookId,
      copyCode: parsed.data.body.copyCode ?? "",
      homeLocation: parsed.data.body.homeLocation,
      initialState: parsed.data.body.initialState,
      condition: parsed.data.body.condition,
      notes: parsed.data.body.notes
    });
    _res.status(201).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function updateCopy(_req: Request, _res: Response): void {
  const parsed = updateCopyRequestSchema.safeParse({
    params: _req.params,
    body: _req.body
  });
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  const id = parsed.data.params.id;
  const isNumericId = /^\d+$/.test(id);

  try {
    const data = bookInventoriesService.updateCopy({
      copyId: isNumericId ? id : undefined,
      copyCode: isNumericId ? undefined : id,
      homeLocation: parsed.data.body.homeLocation,
      state: parsed.data.body.state,
      condition: parsed.data.body.condition,
      notes: parsed.data.body.notes ?? undefined
    });
    _res.status(200).json({ success: true, data });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}

export function deleteCopy(_req: Request, _res: Response): void {
  const parsed = deleteCopyParamsSchema.safeParse(_req.params);
  if (!parsed.success) {
    sendValidationError(_res, parsed.error);
    return;
  }

  const id = parsed.data.id;
  const isNumericId = /^\d+$/.test(id);

  try {
    bookInventoriesService.deleteCopy({
      copyId: isNumericId ? id : undefined,
      copyCode: isNumericId ? undefined : id
    });
    _res.status(200).json({
      success: true,
      message: "Physical copy deleted successfully"
    });
  } catch (error) {
    handleBookInventoryError(_res, error);
  }
}