CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- user
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(20) UNIQUE NOT NULL,
    -- Mã tk
    full_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    -- Mk mã hóa
    role VARCHAR(20) NOT NULL CHECK (role IN ('student', 'staff', 'admin')),
    -- P1.1
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Inactive')),
    -- P1.4
    year_group VARCHAR(20),
    active_loans_count INT DEFAULT 0 CHECK (active_loans_count >= 0),
    max_loans_limit INT DEFAULT 5,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- metadata
CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    -- Tên sách
    author VARCHAR(255) NOT NULL,
    -- Tác giả
    isbn VARCHAR(20) UNIQUE NOT NULL,
    -- Mã ISBN
    category VARCHAR(50) NOT NULL CHECK (
        category IN (
            'Fiction',
            'Non-fiction',
            'Poetry',
            'Graphic novels',
            'Reference'
        )
    ),
    genre VARCHAR(100),
    -- Thể loại 
    keywords TEXT [],
    -- Mảng từ khóa Searching
    publisher VARCHAR(150),
    -- Nhà xuất bản
    published_year INT,
    -- Năm xuất bản
    language VARCHAR(30) DEFAULT 'English',
    -- Ngôn ngữ
    format VARCHAR(30) DEFAULT 'Paperback',
    -- Định dạng 
    page_count INT,
    -- Số trang
    description TEXT,
    -- Mô tả nội dung
    cover_image_url TEXT,
    -- URL ảnh bìa
    shelf_reference VARCHAR(50),
    -- P3.2
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- bảng physical
CREATE TABLE physical_copies (
    id SERIAL PRIMARY KEY,
    copy_code VARCHAR(30) UNIQUE NOT NULL,
    -- P2.2
    book_id INT NOT NULL REFERENCES books(id) ON DELETE RESTRICT,
    home_location VARCHAR(100) NOT NULL,
    -- Vị trí kệ gốc
    state VARCHAR(20) NOT NULL DEFAULT 'Available' CHECK (
        state IN (
            'Available',
            'Borrowed',
            'Reserved',
            'Damaged',
            'Lost'
        )
    ),
    condition VARCHAR(20) NOT NULL DEFAULT 'Good' CHECK (condition IN ('Good', 'Damaged', 'Lost')),
    -- P5.3 Damaged/Lost
    notes TEXT,
    -- tình trạng sách
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- đặt chỗ
CREATE TABLE holds (
    id SERIAL PRIMARY KEY,
    hold_code VARCHAR(30) UNIQUE NOT NULL,
    -- Mã giữ chỗ:
    student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    book_id INT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
    copy_id INT REFERENCES physical_copies(id) ON DELETE
    SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'Ready' CHECK (
            status IN ('Ready', 'Fulfilled', 'Cancelled', 'Expired')
        ),
        requested_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        collect_by TIMESTAMP WITH TIME ZONE NOT NULL -- Hạn lấy sách
);
-- mươn , trả sách
CREATE TABLE loans (
    id SERIAL PRIMARY KEY,
    borrow_code VARCHAR(30) UNIQUE NOT NULL,
    -- P4.3 
    student_id INT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    copy_id INT NOT NULL REFERENCES physical_copies(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active' CHECK (status IN ('Active', 'Returned')),
    borrowed_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    due_date DATE NOT NULL,
    -- Hạn trả sách
    returned_at TIMESTAMP WITH TIME ZONE,
    -- Ngày thực tế trả sách
    return_condition VARCHAR(20) CHECK (return_condition IN ('Good', 'Damaged', 'Lost')),
    renewal_count INT DEFAULT 0 CHECK (renewal_count <= 1),
    -- P4.2 (Max 1 lần)
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
-- tiền phạt
CREATE TABLE fines (
    id SERIAL PRIMARY KEY,
    loan_id INT REFERENCES loans(id) ON DELETE
    SET NULL,
        student_id INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
        -- P5.2
        reason VARCHAR(50) NOT NULL CHECK (reason IN ('Overdue', 'Damaged', 'Lost')),
        -- P5.2 & P5.3
        status VARCHAR(20) NOT NULL DEFAULT 'Unpaid' CHECK (status IN ('Unpaid', 'Paid')),
        -- P5.5 
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        paid_at TIMESTAMP WITH TIME ZONE
);
-- tối ưu
CREATE INDEX idx_users_account_id ON users(account_id);
CREATE INDEX idx_books_isbn ON books(isbn);
CREATE INDEX idx_copies_copy_code ON physical_copies(copy_code);
CREATE INDEX idx_loans_student_status ON loans(student_id, status);
CREATE INDEX idx_holds_status ON holds(status);
--p2.3 tự động
CREATE VIEW view_book_stock AS
SELECT b.id AS book_id,
    b.title,
    b.isbn,
    COUNT(pc.id) AS total_copies,
    COUNT(
        CASE
            WHEN pc.state = 'Available' THEN 1
        END
    ) AS available_copies,
    COUNT(
        CASE
            WHEN pc.state = 'Borrowed' THEN 1
        END
    ) AS borrowed_copies,
    COUNT(
        CASE
            WHEN pc.state = 'Reserved' THEN 1
        END
    ) AS reserved_copies,
    COUNT(
        CASE
            WHEN pc.state = 'Damaged' THEN 1
        END
    ) AS damaged_copies,
    COUNT(
        CASE
            WHEN pc.state = 'Lost' THEN 1
        END
    ) AS lost_copies
FROM books b
    LEFT JOIN physical_copies pc ON b.id = pc.book_id
GROUP BY b.id;