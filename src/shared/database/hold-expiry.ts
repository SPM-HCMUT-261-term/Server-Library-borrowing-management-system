import type { Pool, PoolClient, QueryResultRow } from "pg";

// Automatic hold expiry (FR-BORROW-02).
//
// A hold that is still Ready after its collect_by deadline becomes Expired, and its copy goes back
// from Reserved to Available. A copy that staff changed in the meantime (Damaged, Lost) keeps its state.
//
// Callers:
//   1. startHoldExpiryJob() in server.ts runs it on a timer: this is what makes expiry automatic.
//   2. createHold (holds repository) and issueLoans (loans repository) run it with their own client,
//      right after BEGIN, so a copy freed a second ago can be taken in the same transaction.
//   3. POST /dev/expire-holds (dev-tools) runs it with `asOf` so API tests can move time forward.
//
// It is one SQL statement, so it is atomic on its own and also joins the caller's transaction when it
// gets a client. Rows that another transaction has locked are skipped (SKIP LOCKED), never waited for:
// the sweep can't deadlock with a checkout or a cancel, and a skipped hold is expired on the next run.

export interface HoldExpiryResult {
    expiredCount: number; //  holds changed from Ready to Expired
    releasedCount: number; // copies changed from Reserved to Available
}

const EXPIRE_OVERDUE_HOLDS_SQL = `
    WITH due AS (
        SELECT h.id, h.copy_id
        FROM holds h
        WHERE h.status = 'Ready' AND h.collect_by < COALESCE($1::timestamptz, NOW())
        FOR UPDATE OF h SKIP LOCKED
    ),
    locked_copies AS (
        SELECT pc.id
        FROM physical_copies pc
        WHERE pc.id IN (SELECT d.copy_id FROM due d WHERE d.copy_id IS NOT NULL)
        FOR UPDATE OF pc SKIP LOCKED
    ),
    expired AS (
        UPDATE holds h
        SET status = 'Expired'
        FROM due d
        WHERE h.id = d.id
          AND h.status = 'Ready'
          AND (d.copy_id IS NULL OR d.copy_id IN (SELECT lc.id FROM locked_copies lc))
        RETURNING h.copy_id
    ),
    released AS (
        UPDATE physical_copies pc
        SET state = 'Available', updated_at = CURRENT_TIMESTAMP
        WHERE pc.id IN (SELECT e.copy_id FROM expired e WHERE e.copy_id IS NOT NULL)
          AND pc.state = 'Reserved'
        RETURNING pc.id
    )
    SELECT
        (SELECT COUNT(*) FROM expired)::int  AS "expiredCount",
        (SELECT COUNT(*) FROM released)::int AS "releasedCount"
`;

/**
 * Expires every Ready hold whose collect_by is before `asOf` (default: the database's NOW()).
 * @param db    the pool (standalone run) or a client inside an open transaction
 * @param asOf  for tests only: treat this instant as "now"
 */
export async function expireOverdueHolds(
    db: Pool | PoolClient,
    asOf?: Date | undefined,
): Promise<HoldExpiryResult> {
    const result = await (db as PoolClient).query<QueryResultRow & HoldExpiryResult>(
        EXPIRE_OVERDUE_HOLDS_SQL,
        [asOf ?? null],
    );
    return {
        expiredCount: Number(result.rows[0]?.expiredCount ?? 0),
        releasedCount: Number(result.rows[0]?.releasedCount ?? 0),
    };
}

const DEFAULT_INTERVAL_MS = 60_000;

/**
 * Runs expireOverdueHolds once now (catch-up after downtime) and then every `intervalMs`.
 * A run that is still going when the next tick comes makes that tick skip.
 * @returns a function that stops the timer
 */
export function startHoldExpiryJob(pool: Pool, intervalMs: number = DEFAULT_INTERVAL_MS): () => void {
    let running = false;

    const run = async (): Promise<void> => {
        if (running) return;
        running = true;
        try {
            const { expiredCount, releasedCount } = await expireOverdueHolds(pool);
            if (expiredCount > 0) {
                console.log(`[hold-expiry] expired ${expiredCount} hold(s), released ${releasedCount} copy(ies)`);
            }
        } catch (error) {
            console.error("[hold-expiry] run failed:", error);
        } finally {
            running = false;
        }
    };

    void run();
    const timer = setInterval(() => void run(), intervalMs);
    timer.unref(); // the timer alone does not keep the process alive
    return () => clearInterval(timer);
}
