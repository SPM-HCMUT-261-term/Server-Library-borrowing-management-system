
CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    account_id VARCHAR(20) NOT NULL UNIQUE,
    full_name VARCHAR(100) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL
        CHECK (role IN ('student', 'staff', 'admin')),
    status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active', 'Suspended', 'Locked')),
    is_borrowing_restricted BOOLEAN NOT NULL DEFAULT FALSE,
    year_group VARCHAR(20),
    active_loans_count INTEGER NOT NULL DEFAULT 0
        CHECK (active_loans_count >= 0),
    max_loans_limit INTEGER NOT NULL DEFAULT 5
        CHECK (max_loans_limit > 0),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE books (
    id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    author VARCHAR(255) NOT NULL,
    isbn VARCHAR(20) NOT NULL UNIQUE,
    category VARCHAR(50) NOT NULL
        CHECK (category IN ('Fiction', 'Non-fiction', 'Poetry', 'Graphic novels')),
    genre VARCHAR(100),
    keywords TEXT[] NOT NULL DEFAULT '{}',
    publisher VARCHAR(150),
    published_year INTEGER,
    language VARCHAR(30) NOT NULL DEFAULT 'Vietnamese',
    format VARCHAR(30) NOT NULL DEFAULT 'Paperback',
    page_count INTEGER CHECK (page_count IS NULL OR page_count > 0),
    description TEXT,
    cover_image_url TEXT,
    shelf_reference VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE physical_copies (
    id SERIAL PRIMARY KEY,
    copy_code VARCHAR(30) NOT NULL UNIQUE,
    book_id INTEGER NOT NULL
        REFERENCES books(id) ON DELETE RESTRICT,
    home_location VARCHAR(100) NOT NULL,
    state VARCHAR(20) NOT NULL DEFAULT 'Available'
        CHECK (state IN ('Available', 'Borrowed', 'Reserved', 'Damaged', 'Lost')),
    condition VARCHAR(20) NOT NULL DEFAULT 'Good'
        CHECK (condition IN ('Good', 'Damaged', 'Lost')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (id, book_id)
);

CREATE TABLE holds (
    id SERIAL PRIMARY KEY,
    hold_code VARCHAR(30) NOT NULL UNIQUE,
    student_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    book_id INTEGER NOT NULL
        REFERENCES books(id) ON DELETE RESTRICT,
    copy_id INTEGER NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'Ready'
        CHECK (status IN ('Ready', 'Fulfilled', 'Cancelled', 'Expired')),
    requested_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    collect_by TIMESTAMP WITH TIME ZONE NOT NULL,
    pickup_location VARCHAR(150) NOT NULL DEFAULT 'Main library counter',
    fulfilled_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (copy_id, book_id)
        REFERENCES physical_copies(id, book_id) ON DELETE RESTRICT,
    UNIQUE (id, student_id, copy_id),
    CHECK ((status = 'Fulfilled') = (fulfilled_at IS NOT NULL))
);

CREATE TABLE borrow_records (
    id SERIAL PRIMARY KEY,
    borrow_code VARCHAR(30) NOT NULL UNIQUE,
    student_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    copy_id INTEGER NOT NULL
        REFERENCES physical_copies(id) ON DELETE RESTRICT,
    hold_id INTEGER UNIQUE,
    created_by_staff_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    returned_to_staff_id INTEGER
        REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'Active'
        CHECK (status IN ('Active', 'Returned')),
    borrowed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    due_date DATE NOT NULL DEFAULT (CURRENT_DATE + 14),
    returned_at TIMESTAMP WITH TIME ZONE,
    return_condition VARCHAR(20)
        CHECK (return_condition IN ('Good', 'Damaged', 'Lost')),
    renewal_count INTEGER NOT NULL DEFAULT 0
        CHECK (renewal_count BETWEEN 0 AND 1),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (hold_id, student_id, copy_id)
        REFERENCES holds(id, student_id, copy_id) ON DELETE RESTRICT,
    CHECK (
        (status = 'Active'
            AND returned_at IS NULL
            AND returned_to_staff_id IS NULL
            AND return_condition IS NULL)
        OR
        (status = 'Returned'
            AND returned_at IS NOT NULL
            AND returned_to_staff_id IS NOT NULL
            AND return_condition IS NOT NULL)
    )
);

CREATE TABLE fines (
    id SERIAL PRIMARY KEY,
    loan_id INTEGER
        REFERENCES borrow_records(id) ON DELETE SET NULL,
    student_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE RESTRICT,
    amount NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    reason VARCHAR(50) NOT NULL
        CHECK (reason IN ('Overdue', 'Damaged', 'Lost')),
    status VARCHAR(20) NOT NULL DEFAULT 'Unpaid'
        CHECK (status IN ('Unpaid', 'Paid', 'Waived')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP WITH TIME ZONE,
    resolved_by INTEGER
        REFERENCES users(id) ON DELETE RESTRICT,
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (
        (status = 'Unpaid' AND resolved_at IS NULL AND resolved_by IS NULL)
        OR
        (status IN ('Paid', 'Waived')
            AND resolved_at IS NOT NULL
            AND resolved_by IS NOT NULL)
    )
);

CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    message TEXT NOT NULL,
    type VARCHAR(30) NOT NULL
        CHECK (type IN (
            'Due_Soon', 'Overdue', 'Fine_Created',
            'Account_Restricted', 'General'
        )),
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- A physical copy can have at most one current loan or ready hold.
CREATE UNIQUE INDEX uq_borrow_records_active_copy
    ON borrow_records(copy_id)
    WHERE status = 'Active';
CREATE UNIQUE INDEX uq_holds_ready_copy
    ON holds(copy_id)
    WHERE status = 'Ready';
CREATE UNIQUE INDEX uq_holds_ready_student_book
    ON holds(student_id, book_id)
    WHERE status = 'Ready';

CREATE INDEX idx_users_role_status ON users(role, status);
CREATE INDEX idx_books_title_author ON books(title, author);
CREATE INDEX idx_copies_book_state ON physical_copies(book_id, state);
CREATE INDEX idx_borrow_records_student_status
    ON borrow_records(student_id, status);
CREATE INDEX idx_borrow_records_due_date
    ON borrow_records(due_date)
    WHERE status = 'Active';
CREATE INDEX idx_holds_student_status ON holds(student_id, status);
CREATE INDEX idx_fines_student_status ON fines(student_id, status);
CREATE INDEX idx_notifications_user_read ON notifications(user_id, is_read);

CREATE VIEW view_book_stock AS
SELECT
    b.id AS book_id,
    b.title,
    b.isbn,
    b.shelf_reference,
    COUNT(pc.id) AS total_copies,
    COUNT(pc.id) FILTER (WHERE pc.state = 'Available') AS available_copies,
    COUNT(pc.id) FILTER (WHERE pc.state = 'Borrowed') AS borrowed_copies,
    COUNT(pc.id) FILTER (WHERE pc.state = 'Reserved') AS reserved_copies,
    COUNT(pc.id) FILTER (WHERE pc.state = 'Damaged') AS damaged_copies,
    COUNT(pc.id) FILTER (WHERE pc.state = 'Lost') AS lost_copies
FROM books AS b
LEFT JOIN physical_copies AS pc ON pc.book_id = b.id
GROUP BY b.id, b.title, b.isbn, b.shelf_reference;


CREATE FUNCTION refresh_borrowing_restrictions()
RETURNS VOID
LANGUAGE SQL
AS $$
    UPDATE users AS u
    SET is_borrowing_restricted =
        EXISTS (
            SELECT 1
            FROM borrow_records AS br
            WHERE br.student_id = u.id
              AND br.status = 'Active'
              AND br.due_date < CURRENT_DATE
        )
        OR EXISTS (
            SELECT 1
            FROM fines AS f
            WHERE f.student_id = u.id
              AND f.status = 'Unpaid'
        )
    WHERE u.role = 'student';
$$;

CREATE FUNCTION set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_books_updated_at
    BEFORE UPDATE ON books
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_physical_copies_updated_at
    BEFORE UPDATE ON physical_copies
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_holds_updated_at
    BEFORE UPDATE ON holds
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_borrow_records_updated_at
    BEFORE UPDATE ON borrow_records
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER trg_fines_updated_at
    BEFORE UPDATE ON fines
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();


CREATE VIEW loans AS
SELECT * FROM borrow_records;