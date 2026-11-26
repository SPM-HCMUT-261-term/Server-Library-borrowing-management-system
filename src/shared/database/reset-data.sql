-- Delete all rows but keep the schema, and restart every SERIAL id at 1.
-- RESTART IDENTITY resets the sequences owned by these tables' columns.
-- On next startup, initSeed() re-creates admin ADM001 because users is empty.
TRUNCATE TABLE fines, loans, holds, physical_copies, books, users RESTART IDENTITY CASCADE;
