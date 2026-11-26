import type { Pool, QueryResultRow } from "pg";

import type {
    AddCopyToBookStockSummaryEntity,
    BookEntity,
    BookeWithSummaryInfoEntity,
    BookStockSummaryEntity,
    BookViewerContextEntity,
    GetBooksResultEntity,
    GetFeaturedBooksResultEntity,
    PhysicalCopyEntity,
    PhysicalCopyEntityWithActiveLoanAndHold,
    PhysicalWithLoanAndHoldStateEntity,
    UpdateCopyToBookStockSummaryEntity,
} from "../book-inventories.entity.js";
import type {
    BookMetadata,
    GetBooksParams,
    BooksRepository,
    PhysicalCopiesRepository,
    UpdateBookParams,
} from "./book-inventories.repository.interface.js";

interface BookRow extends QueryResultRow {
    _id: string;
    title: string;
    author: string;
    isbn: string;
    category: string;
    genre: string | null;
    keywords: string[] | null;
    publisher: string | null;
    publishedYear: number | null;
    language: string;
    format: string;
    pageCount: number | null;
    description: string | null;
    coverImageUrl: string | null;
    shelfReference: string | null;
    createdAt: string;
    updatedAt: string;
}

interface BookStockRow extends BookRow {
    totalCopies: number | string;
    availableCopies: number | string;
    borrowedCopies: number | string;
    reservedCopies: number | string;
    damagedCopies: number | string;
    lostCopies: number | string;
}

interface PhysicalCopyRow extends QueryResultRow {
    _id: string;
    copyCode: string;
    bookId: string;
    homeLocation: string;
    state: PhysicalCopyEntity["state"];
    condition: PhysicalCopyEntity["condition"];
    notes: string | null;
    createdAt: string;
    updatedAt: string;
}

const bookColumns = `
    b.id::text AS "_id",
    b.title AS "title",
    b.author AS "author",
    b.isbn AS "isbn",
    b.category AS "category",
    b.genre AS "genre",
    COALESCE(b.keywords, ARRAY[]::text[]) AS "keywords",
    b.publisher AS "publisher",
    b.published_year AS "publishedYear",
    b.language AS "language",
    b.format AS "format",
    b.page_count AS "pageCount",
    b.description AS "description",
    b.cover_image_url AS "coverImageUrl",
    b.shelf_reference AS "shelfReference",
    b.created_at::text AS "createdAt",
    b.updated_at::text AS "updatedAt"
`;

const bookStockColumns = `
    COALESCE(s.total_copies, 0)::int AS "totalCopies",
    COALESCE(s.available_copies, 0)::int AS "availableCopies",
    COALESCE(s.borrowed_copies, 0)::int AS "borrowedCopies",
    COALESCE(s.reserved_copies, 0)::int AS "reservedCopies",
    COALESCE(s.damaged_copies, 0)::int AS "damagedCopies",
    COALESCE(s.lost_copies, 0)::int AS "lostCopies"
`;

const bookWithStockFrom = `
    FROM books AS b
    LEFT JOIN view_book_stock AS s ON s.book_id = b.id
`;

const physicalCopyColumns = `
    pc.id::text AS "_id",
    pc.copy_code AS "copyCode",
    pc.book_id::text AS "bookId",
    pc.home_location AS "homeLocation",
    pc.state AS "state",
    pc.condition AS "condition",
    pc.notes AS "notes",
    pc.created_at::text AS "createdAt",
    pc.updated_at::text AS "updatedAt"
`;

function mapBook(row: BookRow): BookEntity {
    return {
        _id: row._id,
        title: row.title,
        author: row.author,
        isbn: row.isbn,
        category: row.category,
        genre: row.genre,
        keywords: row.keywords ?? [],
        publisher: row.publisher,
        publishedYear: row.publishedYear,
        language: row.language,
        format: row.format,
        pageCount: row.pageCount,
        description: row.description,
        coverImageUrl: row.coverImageUrl,
        shelfReference: row.shelfReference,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function mapStockSummary(row: BookStockRow): BookStockSummaryEntity {
    return {
        totalCopies: Number(row.totalCopies),
        availableCopies: Number(row.availableCopies),
        borrowedCopies: Number(row.borrowedCopies),
        reservedCopies: Number(row.reservedCopies),
        damagedCopies: Number(row.damagedCopies),
        lostCopies: Number(row.lostCopies),
    };
}

function mapBookWithSummary(row: BookStockRow): BookeWithSummaryInfoEntity {
    const book = mapBook(row);
    const stockSummary = mapStockSummary(row);
    return {
        ...book,
        stockSummary: {
            ...stockSummary,
            isAvailableNow: stockSummary.availableCopies > 0,
        },
    };
}

function mapPhysicalCopy(row: PhysicalCopyRow): PhysicalCopyEntity {
    return {
        _id: row._id,
        copyCode: row.copyCode,
        bookId: row.bookId,
        homeLocation: row.homeLocation,
        state: row.state,
        condition: row.condition,
        notes: row.notes,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function parseListFilter(value: string | undefined): string[] {
    return value
        ?.split(",")
        .map((item) => item.trim())
        .filter(Boolean) ?? [];
}

function assertPositiveInteger(value: number, name: string): void {
    if (!Number.isSafeInteger(value) || value < 1) {
        throw new RangeError(`${name} must be a positive safe integer`);
    }
}

export class BooksRepositoryImpl implements BooksRepository {
    constructor(private readonly pool: Pool) {}

    async getFeaturedBooks(limit: number): Promise<GetFeaturedBooksResultEntity[]> {
        assertPositiveInteger(limit, "limit");
        const result = await this.pool.query<
            QueryResultRow & {
                _id: string;
                title: string;
                author: string;
                category: string;
                genre: string | null;
                coverImageUrl: string | null;
                shelfReference: string | null;
                totalCopies: number | string;
                availableCopies: number | string;
            }
        >(
            `
                SELECT
                    b.id::text AS "_id",
                    b.title AS "title",
                    b.author AS "author",
                    b.category AS "category",
                    b.genre AS "genre",
                    b.cover_image_url AS "coverImageUrl",
                    b.shelf_reference AS "shelfReference",
                    COALESCE(s.total_copies, 0)::int AS "totalCopies",
                    COALESCE(s.available_copies, 0)::int AS "availableCopies"
                ${bookWithStockFrom}
                ORDER BY b.updated_at DESC, b.title ASC, b.id ASC
                LIMIT $1
            `,
            [limit],
        );

        return result.rows.map((row) => {
            const availableCopies = Number(row.availableCopies);
            return {
                _id: row._id,
                title: row.title,
                author: row.author,
                category: row.category,
                genre: row.genre,
                coverImageUrl: row.coverImageUrl,
                shelfReference: row.shelfReference,
                stockSummary: {
                    totalCopies: Number(row.totalCopies),
                    availableCopies,
                    isAvailableNow: availableCopies > 0,
                },
            };
        });
    }

    async getBooks(
        params: GetBooksParams,
    ): Promise<{ books: GetBooksResultEntity[]; totalItems: number }> {
        const {
            q: type_query,
            category: category_query,
            genre: genre_query,
            language: language_query,
            availableNow: availableNow_query,
            stock: stock_query,
            sortBy: sortBy_query,
            page: page_query,
            limit: limit_query,
        } = params;
        const page = page_query ?? 1;
        const limit = limit_query ?? 6;
        assertPositiveInteger(page, "page");
        assertPositiveInteger(limit, "limit");

        const values: unknown[] = [];
        const conditions: string[] = [];
        const addValue = (value: unknown): string => {
            values.push(value);
            return `$${values.length}`;
        };

        const query = type_query?.trim();
        let queryPlaceholder: string | undefined;
        if (query) {
            queryPlaceholder = addValue(`%${query}%`);
            conditions.push(`(
                b.title ILIKE ${queryPlaceholder}
                OR b.author ILIKE ${queryPlaceholder}
                OR b.isbn ILIKE ${queryPlaceholder}
                OR b.category ILIKE ${queryPlaceholder}
                OR array_to_string(COALESCE(b.keywords, ARRAY[]::text[]), ' ') ILIKE ${queryPlaceholder}
            )`);
        }

        const categories = parseListFilter(category_query);
        if (categories.length > 0) {
            conditions.push(`b.category = ANY(${addValue(categories)}::text[])`);
        }

        const genres = parseListFilter(genre_query);
        if (genres.length > 0) {
            conditions.push(`b.genre = ANY(${addValue(genres)}::text[])`);
        }

        if (language_query?.trim()) {
            conditions.push(`b.language = ${addValue(language_query.trim())}`);
        }
        if (availableNow_query === true) {
            conditions.push("COALESCE(s.available_copies, 0) > 0");
        }
        if (stock_query === "available") {
            conditions.push("COALESCE(s.available_copies, 0) > 0");
        } else if (stock_query === "unavailable") {
            conditions.push("COALESCE(s.available_copies, 0) = 0");
        } else if (stock_query !== undefined && stock_query !== "all") {
            throw new RangeError("stock must be all, available, or unavailable");
        }

        const whereClause = conditions.length > 0
            ? `WHERE ${conditions.join(" AND ")}`
            : "";
        const countValues = [...values];
        const offsetPlaceholder = addValue((page - 1) * limit);
        const limitPlaceholder = addValue(limit);

        const sortBy = sortBy_query ?? "relevance";
        let orderBy: string;
        if (sortBy === "title") {
            orderBy = "b.title ASC, b.id ASC";
        } else if (sortBy === "publishedYear") {
            orderBy = "b.published_year DESC NULLS LAST, b.title ASC, b.id ASC";
        } else if (sortBy === "relevance") {
            if (queryPlaceholder) {
                const prefixPlaceholder = addValue(`${query}%`);
                orderBy = `CASE
                    WHEN b.title ILIKE ${prefixPlaceholder} THEN 0
                    WHEN b.author ILIKE ${prefixPlaceholder} THEN 1
                    WHEN b.isbn ILIKE ${prefixPlaceholder} THEN 2
                    ELSE 3
                END, b.title ASC, b.id ASC`;
            } else {
                orderBy = "b.title ASC, b.id ASC";
            }
        } else {
            throw new RangeError("sortBy must be relevance, title, or publishedYear");
        }

        const [booksResult, countResult] = await Promise.all([
            this.pool.query<
                QueryResultRow & {
                    _id: string;
                    title: string;
                    author: string;
                    isbn: string;
                    category: string;
                    genre: string | null;
                    language: string;
                    publisher: string | null;
                    keywords: string[] | null;
                    coverImageUrl: string | null;
                    shelfReference: string | null;
                    totalCopies: number | string;
                    availableCopies: number | string;
                    borrowedCopies: number | string;
                    reservedCopies: number | string;
                }
            >(
                `
                    SELECT
                        b.id::text AS "_id",
                        b.title AS "title",
                        b.author AS "author",
                        b.isbn AS "isbn",
                        b.category AS "category",
                        b.genre AS "genre",
                        b.language AS "language",
                        b.publisher AS "publisher",
                        COALESCE(b.keywords, ARRAY[]::text[]) AS "keywords",
                        b.cover_image_url AS "coverImageUrl",
                        b.shelf_reference AS "shelfReference",
                        COALESCE(s.total_copies, 0)::int AS "totalCopies",
                        COALESCE(s.available_copies, 0)::int AS "availableCopies",
                        COALESCE(s.borrowed_copies, 0)::int AS "borrowedCopies",
                        COALESCE(s.reserved_copies, 0)::int AS "reservedCopies"
                    ${bookWithStockFrom}
                    ${whereClause}
                    ORDER BY ${orderBy}
                    OFFSET ${offsetPlaceholder}
                    LIMIT ${limitPlaceholder}
                `,
                values,
            ),
            this.pool.query<QueryResultRow & { totalItems: number | string }>(
                `
                    SELECT COUNT(*)::int AS "totalItems"
                    ${bookWithStockFrom}
                    ${whereClause}
                `,
                countValues,
            ),
        ]);

        return {
            books: booksResult.rows.map((row) => {
                const availableCopies = Number(row.availableCopies);
                return {
                    _id: row._id,
                    title: row.title,
                    author: row.author,
                    isbn: row.isbn,
                    category: row.category,
                    genre: row.genre,
                    language: row.language,
                    publisher: row.publisher,
                    keywords: row.keywords ?? [],
                    coverImageUrl: row.coverImageUrl,
                    shelfReference: row.shelfReference,
                    stockSummary: {
                        totalCopies: Number(row.totalCopies),
                        availableCopies,
                        borrowedCopies: Number(row.borrowedCopies),
                        reservedCopies: Number(row.reservedCopies),
                        isAvailableNow: availableCopies > 0,
                    },
                };
            }),
            totalItems: Number(countResult.rows[0]?.totalItems ?? 0),
        };
    }

    async getBookById(bookId: string): Promise<BookEntity | null> {
        const result = await this.pool.query<BookRow>(
            `
                SELECT ${bookColumns}
                FROM books AS b
                WHERE b.id::text = $1
                LIMIT 1
            `,
            [bookId],
        );
        const row = result.rows[0];
        return row ? mapBook(row) : null;
    }

    async getBooksWithSummaryInfoById(
        bookId: string,
    ): Promise<BookeWithSummaryInfoEntity | null> {
        const result = await this.pool.query<BookStockRow>(
            `
                SELECT ${bookColumns}, ${bookStockColumns}
                ${bookWithStockFrom}
                WHERE b.id::text = $1
                LIMIT 1
            `,
            [bookId],
        );
        const row = result.rows[0];
        return row ? mapBookWithSummary(row) : null;
    }

    async getBooksWithSummaryInfoByIdOrIsbn(
        bookIdOrIsbn: string,
    ): Promise<BookeWithSummaryInfoEntity | null> {
        const result = await this.pool.query<BookStockRow>(
            `
                SELECT ${bookColumns}, ${bookStockColumns}
                ${bookWithStockFrom}
                WHERE b.id::text = $1 OR b.isbn = $1
                ORDER BY CASE WHEN b.id::text = $1 THEN 0 ELSE 1 END
                LIMIT 1
            `,
            [bookIdOrIsbn],
        );
        const row = result.rows[0];
        return row ? mapBookWithSummary(row) : null;
    }

    async getBookByIsbn(isbn: string): Promise<BookEntity | null> {
        const result = await this.pool.query<BookRow>(
            `
                SELECT ${bookColumns}
                FROM books AS b
                WHERE b.isbn = $1
                LIMIT 1
            `,
            [isbn],
        );
        const row = result.rows[0];
        return row ? mapBook(row) : null;
    }

    async getBookViewerContext(
        userId: string,
        bookId: string,
    ): Promise<BookViewerContextEntity | null> {
        const result = await this.pool.query<
            QueryResultRow & {
                canBorrow: boolean;
                canRequestHold: boolean;
                blockReason: string | null;
                activeLoansCount: number | string;
                maxLoansLimit: number;
                existingHoldCode: string | null;
            }
        >(
            `
                WITH viewer_facts AS (
                    SELECT
                        u.status,
                        u.max_loans_limit AS "maxLoansLimit",
                        (
                            SELECT COUNT(*)::int
                            FROM loans AS l
                            WHERE l.student_id = u.id AND l.status = 'Active'
                        ) AS "activeLoansCount",
                        EXISTS (
                            SELECT 1
                            FROM loans AS l
                            JOIN physical_copies AS pc ON pc.id = l.copy_id
                            WHERE l.student_id = u.id
                              AND pc.book_id = b.id
                              AND l.status = 'Active'
                        ) AS "alreadyBorrowingTitle",
                        (
                            SELECT h.hold_code
                            FROM holds AS h
                            WHERE h.student_id = u.id
                              AND h.book_id = b.id
                              AND h.status = 'Ready'
                            ORDER BY h.requested_at DESC
                            LIMIT 1
                        ) AS "existingHoldCode",
                        (
                            SELECT COUNT(*)::int
                            FROM physical_copies AS pc
                            WHERE pc.book_id = b.id AND pc.state = 'Available'
                        ) AS "availableCopies"
                    FROM users AS u
                    JOIN books AS b ON b.id::text = $2
                    WHERE u.id::text = $1
                ),
                evaluated AS (
                    SELECT *,
                        CASE
                            WHEN status <> 'Active' THEN 'Your account is inactive'
                            WHEN "activeLoansCount" >= "maxLoansLimit" THEN 'You have reached your loan limit'
                            WHEN "alreadyBorrowingTitle" THEN 'You are already borrowing this title'
                            ELSE NULL
                        END AS "blockReason"
                    FROM viewer_facts
                )
                SELECT
                    ("blockReason" IS NULL AND "availableCopies" > 0) AS "canBorrow",
                    ("blockReason" IS NULL AND "availableCopies" = 0
                        AND "existingHoldCode" IS NULL) AS "canRequestHold",
                    "blockReason",
                    "activeLoansCount",
                    "maxLoansLimit",
                    "existingHoldCode"
                FROM evaluated
            `,
            [userId, bookId],
        );
        const row = result.rows[0];
        return row
            ? {
                  canBorrow: row.canBorrow,
                  canRequestHold: row.canRequestHold,
                  blockReason: row.blockReason,
                  activeLoansCount: Number(row.activeLoansCount),
                  maxLoansLimit: Number(row.maxLoansLimit),
                  existingHoldCode: row.existingHoldCode,
              }
            : null;
    }

    async createBook(params: BookMetadata): Promise<BookEntity | null> {
        const result = await this.pool.query<BookRow>(
            `
                INSERT INTO books (
                    title, author, isbn, category, keywords, publisher, genre,
                    published_year, language, format, page_count, description,
                    cover_image_url, shelf_reference
                )
                VALUES (
                    $1, $2, $3, $4, $5::text[], $6, $7, $8, $9, $10,
                    $11, $12, $13, $14
                )
                ON CONFLICT (isbn) DO NOTHING
                RETURNING
                    id::text AS "_id",
                    title AS "title",
                    author AS "author",
                    isbn AS "isbn",
                    category AS "category",
                    genre AS "genre",
                    COALESCE(keywords, ARRAY[]::text[]) AS "keywords",
                    publisher AS "publisher",
                    published_year AS "publishedYear",
                    language AS "language",
                    format AS "format",
                    page_count AS "pageCount",
                    description AS "description",
                    cover_image_url AS "coverImageUrl",
                    shelf_reference AS "shelfReference",
                    created_at::text AS "createdAt",
                    updated_at::text AS "updatedAt"
            `,
            // Optional fields that were not sent are stored as NULL.
            // Contract defaults (language, format, genre, ...) are applied by the controller's Zod schema.
            [
                params.title,
                params.author,
                params.isbn,
                params.category,
                params.keywords ?? null,
                params.publisher ?? null,
                params.genre ?? null,
                params.publishedYear ?? null,
                params.language ?? null,
                params.format ?? null,
                params.pageCount ?? null,
                params.description ?? null,
                params.coverImageUrl ?? null,
                params.shelfReference ?? null,
            ],
        );
        const row = result.rows[0];
        return row ? mapBook(row) : null;
    }

    async updateBookById(
        bookId: string,
        params: UpdateBookParams,
    ): Promise<BookEntity | null> {
        const values: unknown[] = [
            bookId,
            params.title,
            params.author,
            params.isbn,
            params.category,
        ];
        const setClauses = [
            "title = $2",
            "author = $3",
            "isbn = $4",
            "category = $5",
        ];

        // Optional fields: undefined = not sent, keep the current value.
        // null is a real value and is written to the column.
        const optionalColumns: [column: string, value: unknown][] = [
            ["keywords", params.keywords],
            ["publisher", params.publisher],
            ["genre", params.genre],
            ["published_year", params.publishedYear],
            ["language", params.language],
            ["format", params.format],
            ["page_count", params.pageCount],
            ["description", params.description],
            ["cover_image_url", params.coverImageUrl],
            ["shelf_reference", params.shelfReference],
        ];
        for (const [column, value] of optionalColumns) {
            if (value === undefined) continue;
            values.push(value);
            setClauses.push(`${column} = $${values.length}`);
        }
        setClauses.push("updated_at = CURRENT_TIMESTAMP");

        const result = await this.pool.query<BookRow>(
            `
                UPDATE books AS b
                SET ${setClauses.join(",\n                    ")}
                WHERE b.id::text = $1
                  AND NOT EXISTS (
                      SELECT 1
                      FROM books AS duplicate
                      WHERE duplicate.isbn = $4 AND duplicate.id <> b.id
                  )
                RETURNING
                    b.id::text AS "_id",
                    b.title AS "title",
                    b.author AS "author",
                    b.isbn AS "isbn",
                    b.category AS "category",
                    b.genre AS "genre",
                    COALESCE(b.keywords, ARRAY[]::text[]) AS "keywords",
                    b.publisher AS "publisher",
                    b.published_year AS "publishedYear",
                    b.language AS "language",
                    b.format AS "format",
                    b.page_count AS "pageCount",
                    b.description AS "description",
                    b.cover_image_url AS "coverImageUrl",
                    b.shelf_reference AS "shelfReference",
                    b.created_at::text AS "createdAt",
                    b.updated_at::text AS "updatedAt"
            `,
            values,
        );
        const row = result.rows[0];
        return row ? mapBook(row) : null;
    }

    async deleteBookById(bookId: string): Promise<BookEntity | null> {
        const result = await this.pool.query<BookRow>(
            `
                DELETE FROM books AS b
                WHERE b.id::text = $1
                  AND NOT EXISTS (
                      SELECT 1
                      FROM physical_copies AS pc
                      WHERE pc.book_id = b.id
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM loans AS l
                      JOIN physical_copies AS pc ON pc.id = l.copy_id
                      WHERE pc.book_id = b.id
                  )
                RETURNING
                    b.id::text AS "_id",
                    b.title AS "title",
                    b.author AS "author",
                    b.isbn AS "isbn",
                    b.category AS "category",
                    b.genre AS "genre",
                    COALESCE(b.keywords, ARRAY[]::text[]) AS "keywords",
                    b.publisher AS "publisher",
                    b.published_year AS "publishedYear",
                    b.language AS "language",
                    b.format AS "format",
                    b.page_count AS "pageCount",
                    b.description AS "description",
                    b.cover_image_url AS "coverImageUrl",
                    b.shelf_reference AS "shelfReference",
                    b.created_at::text AS "createdAt",
                    b.updated_at::text AS "updatedAt"
            `,
            [bookId],
        );
        const row = result.rows[0];
        return row ? mapBook(row) : null;
    }
}

export class PhysicalCopiesRepositoryImpl implements PhysicalCopiesRepository {
    constructor(private readonly pool: Pool) {}

    async getPhysicalCopyWithLoanAndHoldStateById(
        copyId: string,
    ): Promise<PhysicalWithLoanAndHoldStateEntity | null> {
        const result = await this.pool.query<
            PhysicalCopyRow & { hasLoanHistory: boolean; hasHoldHistory: boolean }
        >(
            `
                SELECT
                    ${physicalCopyColumns},
                    EXISTS (
                        SELECT 1 FROM loans AS l WHERE l.copy_id = pc.id
                    ) AS "hasLoanHistory",
                    EXISTS (
                        SELECT 1 FROM holds AS h WHERE h.copy_id = pc.id
                    ) AS "hasHoldHistory"
                FROM physical_copies AS pc
                WHERE pc.id::text = $1 OR pc.copy_code = $1
                ORDER BY CASE WHEN pc.id::text = $1 THEN 0 ELSE 1 END
                LIMIT 1
            `,
            [copyId],
        );
        const row = result.rows[0];
        return row
            ? {
                  ...mapPhysicalCopy(row),
                  hasLoanHistory: row.hasLoanHistory,
                  hasHoldHistory: row.hasHoldHistory,
              }
            : null;
    }

    async getSummaryStockAfterAddCopyToBookStock(
        copyId: string,
    ): Promise<AddCopyToBookStockSummaryEntity | null> {
        const result = await this.getStockSummaryForCopy(copyId);
        if (!result) return null;
        return {
            totalCopies: result.totalCopies,
            availableCopies: result.availableCopies,
            borrowedCopies: result.borrowedCopies,
        };
    }

    async getSummaryStockAfterUpdateCopyToBookStock(
        copyId: string,
    ): Promise<UpdateCopyToBookStockSummaryEntity | null> {
        return this.getStockSummaryForCopy(copyId);
    }

    private async getStockSummaryForCopy(
        copyId: string,
    ): Promise<BookStockSummaryEntity | null> {
        const result = await this.pool.query<
            QueryResultRow & {
                totalCopies: number | string;
                availableCopies: number | string;
                borrowedCopies: number | string;
                reservedCopies: number | string;
                damagedCopies: number | string;
                lostCopies: number | string;
            }
        >(
            `
                SELECT
                    s.total_copies AS "totalCopies",
                    s.available_copies AS "availableCopies",
                    s.borrowed_copies AS "borrowedCopies",
                    s.reserved_copies AS "reservedCopies",
                    s.damaged_copies AS "damagedCopies",
                    s.lost_copies AS "lostCopies"
                FROM physical_copies AS pc
                JOIN view_book_stock AS s ON s.book_id = pc.book_id
                WHERE pc.id::text = $1
                LIMIT 1
            `,
            [copyId],
        );
        const row = result.rows[0];
        return row
            ? {
                  totalCopies: Number(row.totalCopies),
                  availableCopies: Number(row.availableCopies),
                  borrowedCopies: Number(row.borrowedCopies),
                  reservedCopies: Number(row.reservedCopies),
                  damagedCopies: Number(row.damagedCopies),
                  lostCopies: Number(row.lostCopies),
              }
            : null;
    }

    async getPyhsicalCopy(
        copyId: string | null,
        copyCode: string | null,
    ): Promise<PhysicalCopyEntity | null> {
        if (copyId === null && copyCode === null) return null;
        const result = await this.pool.query<PhysicalCopyRow>(
            `
                SELECT ${physicalCopyColumns}
                FROM physical_copies AS pc
                WHERE ($1::text IS NOT NULL AND pc.id::text = $1)
                   OR ($2::text IS NOT NULL AND pc.copy_code = $2)
                ORDER BY CASE WHEN pc.id::text = $1 THEN 0 ELSE 1 END
                LIMIT 1
            `,
            [copyId, copyCode],
        );
        const row = result.rows[0];
        return row ? mapPhysicalCopy(row) : null;
    }

    async getPhysicalCopiesByBookIdWithActiveLoanAndHold(
        bookId: string,
    ): Promise<PhysicalCopyEntityWithActiveLoanAndHold[] | null> {
        const result = await this.pool.query<
            PhysicalCopyRow & {
                hasLoanHistory: boolean;
                loanBorrowCode: string | null;
                loanStudentName: string | null;
                loanStudentAccountId: string | null;
                loanDueDate: string | null;
                holdCode: string | null;
                holdStudentName: string | null;
                holdStudentAccountId: string | null;
                holdCollectBy: string | null;
            }
        >(
            `
                SELECT
                    ${physicalCopyColumns},
                    EXISTS (
                        SELECT 1 FROM loans AS history WHERE history.copy_id = pc.id
                    ) AS "hasLoanHistory",
                    active_loan.borrow_code AS "loanBorrowCode",
                    active_loan.full_name AS "loanStudentName",
                    active_loan.account_id AS "loanStudentAccountId",
                    active_loan.due_date AS "loanDueDate",
                    active_hold.hold_code AS "holdCode",
                    active_hold.full_name AS "holdStudentName",
                    active_hold.account_id AS "holdStudentAccountId",
                    active_hold.collect_by AS "holdCollectBy"
                FROM physical_copies AS pc
                LEFT JOIN LATERAL (
                    SELECT
                        l.borrow_code,
                        u.full_name,
                        u.account_id,
                        to_char(l.due_date, 'YYYY-MM-DD') AS due_date
                    FROM loans AS l
                    JOIN users AS u ON u.id = l.student_id
                    WHERE l.copy_id = pc.id AND l.status = 'Active'
                    ORDER BY l.borrowed_at DESC
                    LIMIT 1
                ) AS active_loan ON TRUE
                LEFT JOIN LATERAL (
                    SELECT
                        h.hold_code,
                        u.full_name,
                        u.account_id,
                        to_char(h.collect_by, 'YYYY-MM-DD') AS collect_by
                    FROM holds AS h
                    JOIN users AS u ON u.id = h.student_id
                    WHERE h.copy_id = pc.id AND h.status = 'Ready'
                    ORDER BY h.requested_at DESC
                    LIMIT 1
                ) AS active_hold ON TRUE
                WHERE pc.book_id::text = $1
                ORDER BY pc.copy_code ASC
            `,
            [bookId],
        );

        return result.rows.map((row) => ({
            ...mapPhysicalCopy(row),
            activeLoan: row.loanBorrowCode
                ? {
                      borrowCode: row.loanBorrowCode,
                      studentName: row.loanStudentName!,
                      studentAccountId: row.loanStudentAccountId!,
                      dueDate: row.loanDueDate!,
                  }
                : null,
            activeHold: row.holdCode
                ? {
                      holdCode: row.holdCode,
                      studentName: row.holdStudentName!,
                      studentAccountId: row.holdStudentAccountId!,
                      collectBy: row.holdCollectBy!,
                  }
                : null,
            hasLoanHistory: row.hasLoanHistory,
        }));
    }

    async addCopyToBookStock(params: {
        bookId: string;
        copyCode: string;
        homeLocation: string;
        initialState: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | undefined;
    }): Promise<PhysicalCopyEntity | null> {
        const result = await this.pool.query<PhysicalCopyRow>(
            `
                INSERT INTO physical_copies (
                    copy_code, book_id, home_location, state, condition, notes
                )
                SELECT $2, b.id, $3, $4, $5, $6
                FROM books AS b
                WHERE b.id::text = $1
                ON CONFLICT (copy_code) DO NOTHING
                RETURNING
                    id::text AS "_id",
                    copy_code AS "copyCode",
                    book_id::text AS "bookId",
                    home_location AS "homeLocation",
                    state AS "state",
                    condition AS "condition",
                    notes AS "notes",
                    created_at::text AS "createdAt",
                    updated_at::text AS "updatedAt"
            `,
            [
                params.bookId,
                params.copyCode,
                params.homeLocation,
                params.initialState,
                params.condition,
                params.notes ?? null,
            ],
        );
        const row = result.rows[0];
        return row ? mapPhysicalCopy(row) : null;
    }

    async updatePhysicalCopy(params: {
        copyId: string | undefined;
        copyCode: string | undefined;
        homeLocation: string;
        state: "Available" | "Damaged" | "Lost";
        condition: "Good" | "Damaged" | "Lost";
        notes?: string | null | undefined;
    }): Promise<PhysicalCopyEntity | null> {
        if (params.copyId === undefined && params.copyCode === undefined) {
            return null;
        }
        const values: unknown[] = [
            params.copyId ?? null,
            params.copyCode ?? null,
            params.homeLocation,
            params.state,
            params.condition,
        ];
        const setClauses = ["home_location = $3", "state = $4", "condition = $5"];

        // undefined = not sent, keep the current notes. null clears them.
        if (params.notes !== undefined) {
            values.push(params.notes);
            setClauses.push(`notes = $${values.length}`);
        }
        setClauses.push("updated_at = CURRENT_TIMESTAMP");

        const result = await this.pool.query<PhysicalCopyRow>(
            `
                UPDATE physical_copies AS pc
                SET ${setClauses.join(",\n                    ")}
                WHERE (
                    ($1::text IS NOT NULL AND pc.id::text = $1)
                    OR ($2::text IS NOT NULL AND pc.copy_code = $2)
                )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM loans AS l
                      WHERE l.copy_id = pc.id AND l.status = 'Active'
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM holds AS h
                      WHERE h.copy_id = pc.id AND h.status = 'Ready'
                  )
                RETURNING
                    pc.id::text AS "_id",
                    pc.copy_code AS "copyCode",
                    pc.book_id::text AS "bookId",
                    pc.home_location AS "homeLocation",
                    pc.state AS "state",
                    pc.condition AS "condition",
                    pc.notes AS "notes",
                    pc.created_at::text AS "createdAt",
                    pc.updated_at::text AS "updatedAt"
            `,
            values,
        );
        const row = result.rows[0];
        return row ? mapPhysicalCopy(row) : null;
    }

    async deletePhysicalCopyById(
        copyId: string | undefined,
        copyCode: string | undefined,
    ): Promise<boolean> {
        if (copyId === undefined && copyCode === undefined) return false;
        const result = await this.pool.query(
            `
                DELETE FROM physical_copies AS pc
                WHERE (
                    ($1::text IS NOT NULL AND pc.id::text = $1)
                    OR ($2::text IS NOT NULL AND pc.copy_code = $2)
                )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM loans AS l
                      WHERE l.copy_id = pc.id
                  )
                  AND NOT EXISTS (
                      SELECT 1
                      FROM holds AS h
                      WHERE h.copy_id = pc.id AND h.status = 'Ready'
                  )
                RETURNING pc.id
            `,
            [copyId ?? null, copyCode ?? null],
        );
        return (result.rowCount ?? 0) > 0;
    }
}