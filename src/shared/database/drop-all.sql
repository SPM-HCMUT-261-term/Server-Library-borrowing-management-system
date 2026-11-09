-- 1. Xóa View trước
DROP VIEW IF EXISTS view_book_stock CASCADE;
-- 2. Xóa các bảng theo thứ tự từ bảng phụ thuộc nhiều nhất đến bảng gốc, kết hợp CASCADE
DROP TABLE IF EXISTS fines CASCADE;
DROP TABLE IF EXISTS loans CASCADE;
DROP TABLE IF EXISTS holds CASCADE;
DROP TABLE IF EXISTS physical_copies CASCADE;
DROP TABLE IF EXISTS books CASCADE;
DROP TABLE IF EXISTS users CASCADE;