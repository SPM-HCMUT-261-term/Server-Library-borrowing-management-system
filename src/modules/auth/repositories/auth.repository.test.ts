import { afterAll, beforeEach, describe, it } from "vitest";

import { pool } from "@shared/database/db.js";
import { AuthRepositoryImpl } from "./auth.repository.js";
import type { AuthRepository } from "./auth.repository.interface.js";
import { authSeedAccounts, seedAuthRepositoryData } from "./auth.repository.seed.js";

const repository: AuthRepository = new AuthRepositoryImpl(pool);

describe("AuthRepository", () => {
    beforeEach(async () => {
        await pool.query(`
            TRUNCATE TABLE
                fines,
                loans,
                holds,
                physical_copies,
                books,
                users
            RESTART IDENTITY CASCADE
        `);
        await seedAuthRepositoryData();
    });

    afterAll(async () => {
        await pool.end();
    });

    it("prints the user found by account id", async () => {
        const result = await repository.findUserByAccountId(authSeedAccounts.student);
        console.log("findUserByAccountId:", result);
    });

    it("prints the user with statistics found by user id", async () => {
        const user = await repository.findUserByAccountId(authSeedAccounts.student);
        if (!user) {
            throw new Error("Auth seed student was not found");
        }

        const result = await repository.findUserWithStatsById(Number(user._id));
        console.log("findUserWithStatsById:", result);
    });

    it("prints statistics for a user with more than three overdue loans and multiple unpaid fines", async () => {
        const user = await repository.findUserByAccountId(authSeedAccounts.overdueStudent);
        if (!user) {
            throw new Error("Auth overdue student was not found");
        }

        const result = await repository.findUserWithStatsById(Number(user._id));
        console.log("findUserWithStatsById overdue student:", result);
    });
});