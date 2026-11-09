import {pool} from '@shared/database/db.js';
import { exit } from 'node:process';

export const initSeed = async () => {

    try {
        const result = (await pool.query('SELECT COUNT(*) as num_user FROM users;'));
        const numRow = result.rows[0].numUser;
        // console.log("numRow", numRow);
        if (numRow === 0) {
            await pool.query(`
                INSERT INTO users (account_id, full_name, password_hash, role)
                VALUES ('ADM001', 'First Admin', '123456', 'admin');
            `);
            console.log('Admin user seeded successfully.');
        }
    } catch (error) {
        console.error('Error during database seeding:', error);
        exit(1); // Exit the process with an error code
    }
}
