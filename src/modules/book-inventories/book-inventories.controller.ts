import type { Request, Response } from "express";
import z from "zod";

import { pool } from "@shared/database/db.js";
import {
    BooksRepositoryImpl,
    PhysicalCopiesRepositoryImpl,
} from "./repositories/book-inventories.repository.js";
import type { BookInventoriesService } from "./book-inventories.service.js";

const getFeaturedBooksQuerySchema = z.object({
    limit: z.coerce.number().int().positive().max(100).optional(),
});

const getBooksQuerySchema = z.object({
    q: z.string().trim().optional(),
    category: z.string().trim().optional(),
    genre: z.string().trim().optional(),
    language: z.string().trim().optional(),
    availableNow: z
        .enum(["true", "false"])
        .transform((val) => val === "true")
        .optional(),
    stock: z.enum(["all", "available", "unavailable"]).optional(),
    sortBy: z.enum(["relevance", "title", "publishedYear"]).optional(),
    page: z.coerce.number().int().positive().optional(),
    limit: z.coerce.number().int().positive().max(100).optional(),
});

const getBookByIdParamsSchema = z.object({
    id: z.string().trim().min(1, "Book id is required"),
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
        "Reference",
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
    shelfReference: z.string().trim().optional(),
});

const updateBookRequestSchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, "Book id is required"),
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
            "Reference",
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
        shelfReference: z.string().trim().nullable().optional(),
    }),
});

const deleteBookParamsSchema = z.object({
    id: z.string().trim().min(1, "Book id is required"),
});

const addCopyToBookRequestSchema = z.object({
    params: z.object({
        bookId: z.string().trim().min(1, "Book id is required"),
    }),
    body: z.object({
        copyCode: z.string().trim().min(1).optional(),
        homeLocation: z.string().trim().min(1, "Home location is required"),
        initialState: z
            .enum(["Available", "Damaged", "Lost"])
            .default("Available"),
        condition: z.enum(["Good", "Damaged", "Lost"]).default("Good"),
        notes: z.string().trim().optional(),
    }),
});

const updateCopyRequestSchema = z.object({
    params: z.object({
        id: z.string().trim().min(1, "Copy id is required"),
    }),
    body: z.object({
        homeLocation: z.string().trim().min(1, "Home location is required"),
        state: z.enum(["Available", "Damaged", "Lost"]),
        condition: z.enum(["Good", "Damaged", "Lost"]),
        notes: z.string().trim().nullable().optional(),
    }),
});

const deleteCopyParamsSchema = z.object({
    id: z.string().trim().min(1, "Copy id is required"),
});

type BookInventoryError = Error & { code?: string; details?: unknown };

function handleValidationError(res: Response, error: z.ZodError): void {
    res.status(400).json({
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "Invalid input",
            details: Object.fromEntries(
                error.issues.map((issue) => [
                    issue.path.join("."),
                    issue.message,
                ]),
            ),
        },
    });
}

function handleBookInventoryError(res: Response, error: unknown): void {
    const serviceError = error as BookInventoryError;
    const errorResponses: Record<string, { status: number; message: string }> =
        {
            BAD_REQUEST: { status: 400, message: "Bad request" },
            BOOK_NOT_FOUND: { status: 404, message: "Book not found" },
            COPY_NOT_FOUND: { status: 404, message: "Physical copy not found" },
            DUPLICATE_ISBN: {
                status: 409,
                message: "A book with this ISBN already exists",
            },
            DUPLICATE_COPY_CODE: {
                status: 409,
                message: "Copy ID / barcode must be unique across the library",
            },
            BOOK_HAS_COPIES_OR_HISTORY: {
                status: 409,
                message:
                    "This title has physical copies or loan history and cannot be deleted",
            },
            COPY_HAS_ACTIVE_LOAN_OR_HOLD: {
                status: 409,
                message:
                    "Complete the return or cancel the hold before changing this copy",
            },
            COPY_HAS_LOAN_HISTORY: {
                status: 409,
                message: "This copy has loan history and cannot be deleted",
            },
        };
    const mappedError = serviceError.code
        ? errorResponses[serviceError.code]
        : undefined;

    if (!mappedError) {
        console.error(error);
    }

    res.status(mappedError?.status ?? 500).json({
        success: false,
        error: {
            code: serviceError.code ?? "INTERNAL_SERVER_ERROR",
            message: mappedError?.message ?? "An unexpected error occurred",
            ...(mappedError && serviceError.details !== undefined
                ? { details: serviceError.details }
                : {}),
        },
    });
}

// Phân tách param :id thành { copyId, copyCode } đúng chữ ký của Service
function splitCopyIdentifier(id: string): {
    copyId: string | undefined;
    copyCode: string | undefined;
} {
    const isNumericId = /^\d+$/.test(id);
    return {
        copyId: isNumericId ? id : undefined,
        copyCode: isNumericId ? undefined : id,
    };
}

// TODO: Gán `new BookInventoriesService(new BooksRepositoryImpl(pool), new PhysicalCopiesRepositoryImpl(pool))` khi có RepositoryImpl
let bookInventoriesService!: BookInventoriesService;

// GET /books/featured (Public)
export async function getFeaturedBooks(
    req: Request,
    res: Response,
): Promise<void> {
    const parsed = getFeaturedBooksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    try {
        const data = await bookInventoriesService.getFeaturedBooks({
            limit: parsed.data.limit,
        });
        res.status(200).json({ success: true, data });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// GET /books (Student | Staff)
export async function getBooks(req: Request, res: Response): Promise<void> {
    const parsed = getBooksQuerySchema.safeParse(req.query);
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    try {
        const data = await bookInventoriesService.getBooks(parsed.data);
        res.status(200).json({ success: true, data });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// GET /books/:id (Student | Staff)
export async function getBookById(req: Request, res: Response): Promise<void> {
    const parsed = getBookByIdParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    const role = req.session?.role;
    if (role !== "student" && role !== "staff") {
        res.status(401).json({
            success: false,
            error: {
                code: "UNAUTHORIZED",
                message: "Authentication is required",
            },
        });
        return;
    }
    const studentId = role === "student" ? (req.session?._id ?? null) : null;

    try {
        const data = await bookInventoriesService.getBookById(
            parsed.data.id,
            role,
            studentId,
        );
        res.status(200).json({ success: true, data });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// POST /books (Staff)
export async function createBook(req: Request, res: Response): Promise<void> {
    const parsed = createBookBodySchema.safeParse(req.body);
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    try {
        const data = await bookInventoriesService.createBook(parsed.data);
        res.status(201).json({ success: true, data });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// PUT /books/:id (Staff)
export async function updateBook(req: Request, res: Response): Promise<void> {
    const parsed = updateBookRequestSchema.safeParse({
        params: req.params,
        body: req.body,
    });
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    try {
        const data = await bookInventoriesService.updateBookById({
            bookId: parsed.data.params.id,
            ...parsed.data.body,
        });
        res.status(200).json({ success: true, data });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// DELETE /books/:id (Staff)
export async function deleteBook(req: Request, res: Response): Promise<void> {
    const parsed = deleteBookParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    try {
        await bookInventoriesService.deleteBookById(parsed.data.id);
        res.status(200).json({
            success: true,
            message: "Book title deleted successfully",
        });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// POST /books/:bookId/copies (Staff)
export async function addCopyToBook(
    req: Request,
    res: Response,
): Promise<void> {
    const parsed = addCopyToBookRequestSchema.safeParse({
        params: req.params,
        body: req.body,
    });
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    try {
        const data = await bookInventoriesService.addCopyToBook({
            bookId: parsed.data.params.bookId,
            copyCode: parsed.data.body.copyCode ?? "",
            homeLocation: parsed.data.body.homeLocation,
            initialState: parsed.data.body.initialState,
            condition: parsed.data.body.condition,
            notes: parsed.data.body.notes,
        });
        res.status(201).json({ success: true, data });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// PUT /copies/:id (Staff)
export async function updateCopy(req: Request, res: Response): Promise<void> {
    const parsed = updateCopyRequestSchema.safeParse({
        params: req.params,
        body: req.body,
    });
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    const { copyId, copyCode } = splitCopyIdentifier(parsed.data.params.id);

    try {
        const data = await bookInventoriesService.updateCopy({
            copyId,
            copyCode,
            homeLocation: parsed.data.body.homeLocation,
            state: parsed.data.body.state,
            condition: parsed.data.body.condition,
            notes: parsed.data.body.notes ?? undefined,
        });
        res.status(200).json({ success: true, data });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}

// DELETE /copies/:id (Staff)
export async function deleteCopy(req: Request, res: Response): Promise<void> {
    const parsed = deleteCopyParamsSchema.safeParse(req.params);
    if (!parsed.success) {
        handleValidationError(res, parsed.error);
        return;
    }

    const { copyId, copyCode } = splitCopyIdentifier(parsed.data.id);

    try {
        await bookInventoriesService.deleteCopy({ copyId, copyCode });
        res.status(200).json({
            success: true,
            message: "Physical copy deleted successfully",
        });
    } catch (error) {
        handleBookInventoryError(res, error);
    }
}
