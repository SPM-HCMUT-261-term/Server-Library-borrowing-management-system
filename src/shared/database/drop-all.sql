-- Undo everything schema.sql creates, in reverse order.
-- Indexes and the SERIAL sequences (users_id_seq, books_id_seq, ...) are owned by
-- their tables, so DROP TABLE removes them too: after re-running schema.sql every id starts at 1.
BEGIN;
-- 1. View
DROP VIEW IF EXISTS view_book_stock CASCADE;
-- 2. Tables, most dependent first
DROP TABLE IF EXISTS fines CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS holds CASCADE;
DROP TABLE IF EXISTS physical_copies CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS users CASCADE;
-- 3. Extension
DROP EXTENSION IF EXISTS "uuid-ossp";
COMMIT;
