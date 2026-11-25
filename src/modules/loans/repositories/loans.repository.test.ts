import { afterEach, describe, expect, it, vi } from "vitest";
import type { Pool } from "pg";

import { LoansRepositoryImpl } from "./loans.repository.js";

function createRepository(query: ReturnType<typeof vi.fn>) {
    const client = {
        query,
        release: vi.fn(),
    };
    const pool = {
        connect: vi.fn().mockResolvedValue(client),
        query,
    } as unknown as Pool;
    return { repository: new LoansRepositoryImpl(pool), client };
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("LoansRepositoryImpl", () => {
    it("rolls back the entire checkout when a locked copy is unavailable", async () => {
        const query = vi.fn()
            .mockResolvedValueOnce({ rows: [], rowCount: null })
            .mockResolvedValueOnce({
                rows: [{ id: "12", status: "Active", maxLoansLimit: 5 }],
                rowCount: null,
            })
            .mockResolvedValueOnce({
                rows: [{ activeLoans: 1, overdueLoans: 0, unpaidFines: 0 }],
                rowCount: null,
            })
            .mockResolvedValueOnce({
                rows: [{ copyCode: "WB-00421", state: "Borrowed", holdStudentId: null }],
                rowCount: null,
            })
            .mockResolvedValueOnce({ rows: [], rowCount: null });
        const { repository, client } = createRepository(query);

        const result = await repository.issueLoans({
            studentId: "12",
            items: [{ copyCode: "WB-00421", dueDate: "2026-12-09" }],
        });

        expect(result).toBeNull();
        expect(query.mock.calls.at(-1)?.[0]).toBe("ROLLBACK");
        expect(query.mock.calls.some(([sql]) => String(sql).includes("INSERT INTO loans"))).toBe(false);
        expect(client.release).toHaveBeenCalledOnce();
    });

    it("filters and paginates loan records using bound search values", async () => {
        const query = vi.fn()
            .mockResolvedValueOnce({ rows: [], rowCount: null })
            .mockResolvedValueOnce({ rows: [{ totalItem: 7 }], rowCount: null });
        const { repository } = createRepository(query);

        const result = await repository.getLoanRecords({
            tab: "active",
            q: "Maya",
            status: "overdue",
            sortBy: "dueDate",
            sortOrder: "asc",
            page: 2,
            limit: 6,
        });

        expect(result).toEqual({ loans: [], totalItem: 7 });
        expect(query.mock.calls[0]?.[0]).toContain("l.due_date < CURRENT_DATE");
        expect(query.mock.calls[0]?.[0]).toContain("ORDER BY l.due_date ASC");
        expect(query.mock.calls[0]?.[1]).toEqual(["Active", "%Maya%", 6, 6]);
        expect(query.mock.calls[1]?.[1]).toEqual(["Active", "%Maya%"]);
    });
});
