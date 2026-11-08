import {pool} from '@shared/database/db';

export const initSeed = async () => {

    try {
        const numRow = (await pool.query('SELECT COUNT(*) FROM users;')).rowCount;
        if (numRow === 0) {
            await pool.query(`
                INSERT INTO users (account_id, full_name, password_hash, role)
                VALUES ('ADM001', 'First Admin', 'hashed_password_here', 'admin');
            `);
            console.log('Admin user seeded successfully.');
        }
    } catch (error) {
        console.error('Error during database seeding:', error);
    }
}
