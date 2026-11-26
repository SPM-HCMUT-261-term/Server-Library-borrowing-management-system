-- =============================================================================
-- Seed data for the BookBorrow schema (.temp/schema.sql)
-- Mirrors createInitialSeedDatabase() in src/mocks/db.ts.
--
-- Key-dependency notes
--   * All PKs are SERIAL, so no numeric ids are hard-coded. Every FK is resolved
--     with a scalar subquery on a natural UNIQUE key (account_id, isbn,
--     copy_code). If a referenced row is missing, the subquery yields NULL and
--     the NOT NULL FK column makes the INSERT fail loudly instead of silently
--     skipping the row.
--   * Insert order follows the FK graph:
--       users, books  ->  physical_copies  ->  loans  ->  holds / fines
--   * Every INSERT uses ON CONFLICT on its natural key, so re-running the script
--     is a no-op rather than an error.
--   * Mock-only / derived fields are not stored: initials, overdueLoansCount,
--     unpaidFines, hasBorrowingHistory, hasLoanHistory, sectionName,
--     stockSummary (see view_book_stock), nextHoldSeq, nextBorrowSeq,
--     featuredBookIds.
-- =============================================================================

SET client_encoding = 'UTF8';

BEGIN;

-- -----------------------------------------------------------------------------
-- 1. users  (no FK dependencies)
--    All demo accounts use password "password123", stored as PLAIN TEXT in
--    password_hash for local testing only. Replace with real hashes before
--    using this anywhere but a local dev database.
--    active_loans_count must equal the number of Active loans inserted below.
-- -----------------------------------------------------------------------------
INSERT INTO users (account_id, full_name, password_hash, role, status, year_group,
                   active_loans_count, max_loans_limit, created_at, updated_at)
VALUES
  ('S10428', 'Maya Chen',        'password123', 'student', 'Active',   'Year 10', 2, 5, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('S10312', 'Oliver Brown',     'password123', 'student', 'Active',   'Year 11', 1, 5, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('S10216', 'Amira Khan',       'password123', 'student', 'Active',   'Year 10', 1, 5, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('S10999', 'Liam Patel',       'password123', 'student', 'Inactive', 'Year 12', 0, 5, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('STF001', 'Eleanor Vance',    'password123', 'staff',   'Active',   NULL,      0, 5, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('ADM001', 'Arthur Pendelton', 'password123', 'admin',   'Active',   NULL,      0, 5, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z')
ON CONFLICT (account_id) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 2. books  (no FK dependencies)
-- -----------------------------------------------------------------------------
INSERT INTO books (title, author, isbn, category, genre, keywords, publisher, published_year,
                   language, format, page_count, description, cover_image_url, shelf_reference,
                   created_at, updated_at)
VALUES
  ('The Midnight Library', 'Matt Haig', '9781786892737', 'Fiction', 'Contemporary fiction',
   ARRAY['Choices & possibilities', 'Fantasy', 'Contemporary', 'fiction'],
   'Canongate Books', 2020, 'English', 'Paperback', 304,
   E'Between life and death is a library filled with books. Each one offers Nora Seed a chance to try a different life, undo a regret and discover what truly makes a life worth living.\n\nA thoughtful novel about second chances, the paths we take and the possibilities we leave behind.',
   NULL, 'FIC HAI · A3', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('The Book Thief', 'Markus Zusak', '9780375842207', 'Fiction', 'Historical fiction',
   ARRAY['History', 'World War II', 'Words & courage', 'fiction'],
   'Knopf Books', 2005, 'English', 'Paperback', 552,
   E'Set in 1939 Germany, Liesel Meminger fosters a deep love of books by rescuing stories from being lost and sharing them with her neighbors and the young man hidden in her basement.\n\nAn unforgettable story about the resilience of kindness and the quiet power of words.',
   NULL, 'FIC ZUS · A5', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('The Hobbit', 'J.R.R. Tolkien', '9780261103344', 'Fiction', 'Fantasy',
   ARRAY['Adventure', 'Middle-earth', 'Quest', 'fiction'],
   'HarperCollins', 1937, 'English', 'Paperback', 310,
   E'Bilbo Baggins enjoys a quiet, comfortable life in his hobbit-hole until the wizard Gandalf and a company of dwarves sweep him away on an epic journey to the Lonely Mountain.\n\nA timeless fantasy classic about unexpected bravery and discovery.',
   NULL, 'FIC TOL · A4', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('The House on Mango Street', 'Sandra Cisneros', '9780679734772', 'Fiction', 'Contemporary fiction',
   ARRAY['Coming of age', 'Community', 'Identity', 'fiction'],
   'Vintage Contemporaries', 1984, 'English', 'Paperback', 110,
   'Told through a series of vivid vignettes, Esperanza Cordero grows up in a lively Chicago neighborhood, observing the hopes, struggles and dreams of those around her while finding her own voice as a writer.',
   NULL, 'FIC CIS · A2', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('A Wrinkle in Time', 'Madeleine L''Engle', '9780312367541', 'Fiction', 'Science fiction',
   ARRAY['Space & time', 'Science', 'Family', 'fiction'],
   'Square Fish', 1962, 'English', 'Paperback', 256,
   'Meg Murry, her brilliant younger brother Charles Wallace, and their friend Calvin travel across space and dimensions through a tesseract to rescue Meg’s scientist father.',
   NULL, 'FIC LEN · A3', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('The Giver', 'Lois Lowry', '9780544336261', 'Fiction', 'Science fiction',
   ARRAY['Memory', 'Dystopian', 'Society', 'fiction'],
   'Clarion Books', 1993, 'English', 'Paperback', 240,
   'Twelve-year-old Jonas lives in a seemingly ideal, painless world until he is chosen to inherit the position of Receiver of Memory—the sole keeper of the community’s true past.',
   NULL, 'FIC LOW · A3', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('A Brief History of Time', 'Stephen Hawking', '9780553380163', 'Non-fiction', 'Science',
   ARRAY['Science', 'Cosmology', 'Universe', 'Physics'],
   'Bantam Books', 1988, 'English', 'Paperback', 212,
   'A landmark exploration of the universe—from the Big Bang to black holes, light cones and the nature of time—written for curious general readers.',
   NULL, 'SCI HAW · B2', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('Wonder', 'R.J. Palacio', '9780375869020', 'Graphic novels', 'Contemporary fiction',
   ARRAY['Kindness', 'Empathy', 'School life'],
   'Alfred A. Knopf', 2012, 'English', 'Paperback', 315,
   'August Pullman was born with a facial difference that prevented him from going to a mainstream school—until now, as he starts 5th grade at Beecher Prep.',
   NULL, 'FIC PAL · A2', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('Devotions: Selected Poems', 'Mary Oliver', '9780399563249', 'Poetry', NULL,
   ARRAY['Nature', 'Mindfulness', 'Verse'],
   'Penguin Press', 2017, 'English', 'Hardcover', 464,
   'A curated collection spanning five decades of Mary Oliver’s observations of the natural world, wonder, and quiet reflection.',
   NULL, 'POE OLI · C1', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  ('Dế Mèn Phiêu Lưu Ký', 'Tô Hoài', '9786042188241', 'Reference', 'Historical fiction',
   ARRAY['Vietnamese literature', 'Adventure', 'History'],
   'NXB Kim Đồng', 1941, 'Vietnamese', 'Paperback', 196,
   'A beloved Vietnamese literary classic chronicling the adventures and life lessons of a young cricket exploring the wider world.',
   NULL, 'VIE TOH · D1', '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z')
ON CONFLICT (isbn) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 3. physical_copies  (FK book_id -> books.id, resolved via isbn)
--    The mock's makeCopy() always uses condition 'Good' and notes NULL.
-- -----------------------------------------------------------------------------
INSERT INTO physical_copies (copy_code, book_id, home_location, state, condition, notes, created_at, updated_at)
VALUES
  -- The Midnight Library (4 copies: 2 Available, 2 Borrowed)
  ('WB-00421', (SELECT id FROM books WHERE isbn = '9781786892737'), 'FIC HAI · A3', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00422', (SELECT id FROM books WHERE isbn = '9781786892737'), 'FIC HAI · A3', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00423', (SELECT id FROM books WHERE isbn = '9781786892737'), 'FIC HAI · A3', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00424', (SELECT id FROM books WHERE isbn = '9781786892737'), 'FIC HAI · A3', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- The Book Thief (3 copies: 1 Available, 2 Borrowed)
  ('WB-00101', (SELECT id FROM books WHERE isbn = '9780375842207'), 'FIC ZUS · A5', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00102', (SELECT id FROM books WHERE isbn = '9780375842207'), 'FIC ZUS · A5', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00103', (SELECT id FROM books WHERE isbn = '9780375842207'), 'FIC ZUS · A5', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- The Hobbit (3 copies: 0 Available, 3 Borrowed)
  ('WB-00318', (SELECT id FROM books WHERE isbn = '9780261103344'), 'FIC TOL · A4', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00319', (SELECT id FROM books WHERE isbn = '9780261103344'), 'FIC TOL · A4', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00320', (SELECT id FROM books WHERE isbn = '9780261103344'), 'FIC TOL · A4', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- The House on Mango Street (2 copies: 1 Available, 1 Borrowed)
  ('WB-00511', (SELECT id FROM books WHERE isbn = '9780679734772'), 'FIC CIS · A2', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00512', (SELECT id FROM books WHERE isbn = '9780679734772'), 'FIC CIS · A2', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- A Wrinkle in Time (4 copies: 3 Available, 1 Borrowed)
  ('WB-00701', (SELECT id FROM books WHERE isbn = '9780312367541'), 'FIC LEN · A3', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00702', (SELECT id FROM books WHERE isbn = '9780312367541'), 'FIC LEN · A3', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00703', (SELECT id FROM books WHERE isbn = '9780312367541'), 'FIC LEN · A3', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00704', (SELECT id FROM books WHERE isbn = '9780312367541'), 'FIC LEN · A3', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- The Giver (2 copies: 0 Available, 2 Borrowed)
  ('WB-00801', (SELECT id FROM books WHERE isbn = '9780544336261'), 'FIC LOW · A3', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00802', (SELECT id FROM books WHERE isbn = '9780544336261'), 'FIC LOW · A3', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- A Brief History of Time (2 copies: 1 Borrowed by Maya, 1 Available)
  ('WB-00632', (SELECT id FROM books WHERE isbn = '9780553380163'), 'SCI HAW · B2', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00633', (SELECT id FROM books WHERE isbn = '9780553380163'), 'SCI HAW · B2', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- Wonder (2 copies: 1 Borrowed by Maya, 1 Available)
  ('WB-00216', (SELECT id FROM books WHERE isbn = '9780375869020'), 'FIC PAL · A2', 'Borrowed',  'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00217', (SELECT id FROM books WHERE isbn = '9780375869020'), 'FIC PAL · A2', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- Devotions (Poetry)
  ('WB-00901', (SELECT id FROM books WHERE isbn = '9780399563249'), 'POE OLI · C1', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),
  ('WB-00902', (SELECT id FROM books WHERE isbn = '9780399563249'), 'POE OLI · C1', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z'),

  -- Dế Mèn Phiêu Lưu Ký (Vietnamese / Reference)
  ('WB-00951', (SELECT id FROM books WHERE isbn = '9786042188241'), 'VIE TOH · D1', 'Available', 'Good', NULL, '2026-09-01T08:00:00Z', '2026-10-15T08:00:00Z')
ON CONFLICT (copy_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 4. loans  (FK student_id -> users.id via account_id,
--            FK copy_id    -> physical_copies.id via copy_code)
--    The schema has no loans.book_id; the book is reached through the copy.
--    Each copy on an Active loan has state 'Borrowed'.
-- -----------------------------------------------------------------------------
INSERT INTO loans (borrow_code, student_id, copy_id, status, borrowed_at, due_date,
                   returned_at, return_condition, renewal_count, created_at)
VALUES
  -- Maya Chen: Wonder (WB-00216)
  ('BR-2098',
   (SELECT id FROM users WHERE account_id = 'S10428'),
   (SELECT id FROM physical_copies WHERE copy_code = 'WB-00216'),
   'Active', '2026-10-08T00:00:00Z', '2026-10-22', NULL, NULL, 0, '2026-10-08T00:00:00Z'),

  -- Maya Chen: A Brief History of Time (WB-00632)
  ('BR-2106',
   (SELECT id FROM users WHERE account_id = 'S10428'),
   (SELECT id FROM physical_copies WHERE copy_code = 'WB-00632'),
   'Active', '2026-10-12T00:00:00Z', '2026-10-26', NULL, NULL, 0, '2026-10-12T00:00:00Z'),

  -- Oliver Brown: The Hobbit (WB-00318), overdue relative to DEMO_TODAY 2026-10-15
  ('BR-2081',
   (SELECT id FROM users WHERE account_id = 'S10312'),
   (SELECT id FROM physical_copies WHERE copy_code = 'WB-00318'),
   'Active', '2026-09-29T00:00:00Z', '2026-10-13', NULL, NULL, 0, '2026-09-29T00:00:00Z'),

  -- Amira Khan: The Midnight Library (WB-00423)
  ('BR-2090',
   (SELECT id FROM users WHERE account_id = 'S10216'),
   (SELECT id FROM physical_copies WHERE copy_code = 'WB-00423'),
   'Active', '2026-10-02T00:00:00Z', '2026-10-16', NULL, NULL, 0, '2026-10-02T00:00:00Z'),

  -- Maya Chen: historical RETURNED loan on The Midnight Library (WB-00422).
  -- Not counted in active_loans_count; WB-00422 stays 'Available'.
  -- The mock's conditionNote ('Returned in good condition') has no column in
  -- the loans table, so it is not stored.
  ('BR-2040',
   (SELECT id FROM users WHERE account_id = 'S10428'),
   (SELECT id FROM physical_copies WHERE copy_code = 'WB-00422'),
   'Returned', '2026-09-10T00:00:00Z', '2026-09-24', '2026-09-22T14:15:00Z', 'Good', 0, '2026-09-10T00:00:00Z')
ON CONFLICT (borrow_code) DO NOTHING;

-- -----------------------------------------------------------------------------
-- 5. holds  - the mock seed starts with no holds (first created is HLD-1042).
-- 6. fines  - the mock seed has unpaidFines = 0 for every user, so no rows.
-- -----------------------------------------------------------------------------

COMMIT;

-- -----------------------------------------------------------------------------
-- Optional sanity checks (run manually after seeding)
-- -----------------------------------------------------------------------------
-- Stock per book (should match computeStockSummary in the mock):
--   SELECT title, total_copies, available_copies, borrowed_copies FROM view_book_stock ORDER BY title;
--
-- active_loans_count must equal the real count of Active loans (expect 0 rows):
--   SELECT u.account_id, u.active_loans_count, COUNT(l.id) AS actual
--   FROM users u LEFT JOIN loans l ON l.student_id = u.id AND l.status = 'Active'
--   GROUP BY u.id HAVING u.active_loans_count <> COUNT(l.id);
--
-- Every Active loan points at a 'Borrowed' copy (expect 0 rows):
--   SELECT l.borrow_code, pc.copy_code, pc.state
--   FROM loans l JOIN physical_copies pc ON pc.id = l.copy_id
--   WHERE l.status = 'Active' AND pc.state <> 'Borrowed';
