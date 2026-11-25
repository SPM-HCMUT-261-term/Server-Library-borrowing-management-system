import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { HoldsRepositoryImpl } from "./holds.respository.js";

function createHoldDetailRow() {
    return {
        id: "77",
        holdCode: "HLD-0001",
        status: "Ready",
        requestedAt: new Date("2026-11-25T01:00:00.000Z"),
        collectBy: new Date("2026-11-26T08:30:00.000Z"),
        bookId: "4",
        bookTitle: "The Wild Robot",
        bookAuthor: "Peter Brown",
        bookFormat: "Paperback",
        bookShelfReference: "FIC BRO · A2",
        bookCoverImageUrl: null,
        copyId: "10",
        copyCode: "WB-00421",
        copyHomeLocation: "FIC BRO · A2",
        studentId: "2",
        studentAccountId: "S10428",
        studentFullName: "Maya Chen",
        studentYearGroup: "Year 10",
    };
}

function createRepository(query: ReturnType<typeof vi.fn>) {
    const client = {
        query,
        release: vi.fn(),
    };
    const pool = {
        connect: vi.fn().mockResolvedValue(client),
        query: vi.fn(),
    } as unknown as Pool;

    return { repository: new HoldsRepositoryImpl(pool), client };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("HoldsRepositoryImpl", () => {
    it("reserves an available copy and creates a hold in one transaction", async () => {
        const query = vi.fn()
            .mockResolvedValueOnce({ rows: [], rowCount: null })
            .mockResolvedValueOnce({ rows: [{ id: "4" }], rowCount: null })
            .mockResolvedValueOnce({
                rows: [{ id: "2", status: "Active" }],
                rowCount: null,
            })
            .mockResolvedValueOnce({
                rows: [{ overdueLoansCount: 0, unpaidFines: 0 }],
                rowCount: null,
            })
            .mockResolvedValueOnce({ rows: [{ hasDuplicate: false }], rowCount: null })
            .mockResolvedValueOnce({ rows: [{ id: "10" }], rowCount: null })
            .mockResolvedValueOnce({ rows: [], rowCount: null })
            .mockResolvedValueOnce({ rows: [{ holdCode: "HLD-0001" }], rowCount: null })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [{ id: "77" }], rowCount: null })
            .mockResolvedValueOnce({ rows: [createHoldDetailRow()], rowCount: null })
            .mockResolvedValueOnce({ rows: [], rowCount: null });
        const { repository, client } = createRepository(query);

        const result = await repository.createHold({
            studentId: "2",
            bookId: "4",
            collectBy: "2026-11-26T08:30:00.000Z",
        });

        expect(result).toMatchObject({
            id: "77",
            holdCode: "HLD-0001",
            status: "Ready",
            book: { id: "4", title: "The Wild Robot" },
            copy: { id: "10", copyCode: "WB-00421" },
            student: { id: "2", accountId: "S10428" },
        });
        expect(query.mock.calls[5]?.[0]).toContain("FOR UPDATE OF pc SKIP LOCKED");
        expect(query.mock.calls[8]?.[0]).toContain("state = 'Reserved'");
        expect(query.mock.calls[9]?.[0]).toContain("INSERT INTO holds");
        expect(query.mock.calls.some(([sql]) => String(sql).includes("active_loans_count ="))).toBe(false);
        expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("cancels a ready hold and releases its copy atomically", async () => {
        const query = vi.fn()
            .mockResolvedValueOnce({ rows: [], rowCount: null })
            .mockResolvedValueOnce({
                rows: [{
                    id: "77",
                    holdCode: "HLD-0001",
                    status: "Ready",
                    copyId: "10",
                    copyCode: "WB-00421",
                }],
                rowCount: null,
            })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: 1 })
            .mockResolvedValueOnce({ rows: [], rowCount: null });
        const { repository, client } = createRepository(query);

        const result = await repository.cancelHold({ id: "HLD-0001" });

        expect(result).toEqual({
            id: "77",
            holdCode: "HLD-0001",
            status: "Cancelled",
            releasedCopyCode: "WB-00421",
        });
        expect(query.mock.calls[2]?.[0]).toContain("state = 'Available'");
        expect(query.mock.calls[3]?.[0]).toContain("SET status = 'Cancelled'");
        expect(query.mock.calls.at(-1)?.[0]).toBe("COMMIT");
        expect(client.release).toHaveBeenCalledOnce();
    });
});
