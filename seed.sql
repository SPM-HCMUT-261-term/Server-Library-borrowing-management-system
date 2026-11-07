-- Seed Users (P1)
INSERT INTO users (account_id, full_name, password_hash, role, year_group) VALUES
('ADM001', 'System Admin', 'hash_123', 'admin', NULL),
('STF001', 'Librarian Staff', 'hash_123', 'staff', NULL),
('S10428', 'Maya Chen', 'hash_123', 'student', 'Year 10');

-- Seed Book (P2 & P3)
INSERT INTO books (title, author, isbn, category, shelf_reference, keywords) VALUES
('The Midnight Library', 'Matt Haig', '9781786892737', 'Fiction', 'FIC HAI · A3',
 ARRAY['Fiction', 'Magic', 'Philosophy']);

-- Seed Copies (P2)
INSERT INTO physical_copies (copy_code, book_id, home_location, state) VALUES
('WB-00421', 1, 'FIC HAI · A3', 'Available'),
('WB-00422', 1, 'FIC HAI · A3', 'Available');