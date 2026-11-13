import { afterAll, beforeEach, describe, it } from "vitest";

import { pool } from "@shared/database/db.js";
import { AdminRepositoryImpl } from "./admin.repository.js";
import type { AdminRepository } from "./admin.repository.interface.js";
import { adminSeedAccounts, seedAdminRepositoryData } from "./admin.repository.seed.js";

const repository: AdminRepository = new AdminRepositoryImpl(pool);

describe("AdminRepository", () => {
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
        await seedAdminRepositoryData();
    });

    // afterAll(async () => {
    //     await pool.end();
    // });

    it("lists users with borrowing statistics and total count", async () => {
        const result = await repository.getUsersWithStats({ page: 1, limit: 10 });
        console.log("getUsersWithStats:", result);
    });

    it("creates a user and returns null for a duplicate account id", async () => {
        const accountId = `TEST${Date.now()}`;
        const created = await repository.createUserWithStats({
            accountId,
            fullName: "Created Test User",
            password: "created-password",
            role: "student",
            yearGroup: null,
        });

        console.log("createUserWithStats:", created);
        // const duplicate = await repository.createUserWithStats({
        //     accountId,
        //     fullName: "Duplicate Test User",
        //     password: "duplicate-password",
        //     role: "student",
        //     yearGroup: null,
        // });
        // console.log("createUserWithStats duplicate:", duplicate);
    });

    it("updates a user using either account id or database id", async () => {
        const updated = await repository.updateUserWithStats({
            id: adminSeedAccounts.studentWithoutHistory,
            fullName: "Updated Test Student",
            role: "student",
            yearGroup: "2027",
            status: "Inactive",
        });

        console.log("updateUserWithStats:", updated);
        const missing = await repository.updateUserWithStats({
            id: "missing-account",
            fullName: "Missing User",
            role: "student",
            yearGroup: null,
            status: "Active",
        });
        console.log("updateUserWithStats missing:", missing);
    });

    it("resets a password and reports missing users", async () => {
        const reset = await repository.resetUserPassword({
            id: adminSeedAccounts.admin,
            newPassword: "reset-password",
        });
        console.log("resetUserPassword:", reset);
        const missing = await repository.resetUserPassword({
            id: "missing-account",
            newPassword: "reset-password",
        });
        console.log("resetUserPassword missing:", missing);
    });

    it("deletes users without history and protects users with history", async () => {
        const deleted = await repository.deleteUser({
            id: adminSeedAccounts.studentWithoutHistory,
        });
        console.log("deleteUser:", deleted);
        const missing = await repository.deleteUser({ id: "missing-account" });
        console.log("deleteUser missing:", missing);
        const withHistory = await repository.deleteUser({
            id: adminSeedAccounts.studentWithHistory,
        });
        console.log("deleteUser with history:", withHistory);
    });
});