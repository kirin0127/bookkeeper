-- Bookkeeper: expenses only. Requires SQLite >= 3.37 (STRICT tables).
-- All *_at_ms fields are INTEGER milliseconds since 1970-01-01T00:00:00Z.

CREATE TABLE accounts (
    id INTEGER PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE sessions (
    token_hash TEXT PRIMARY KEY NOT NULL,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    created_at_ms INTEGER NOT NULL,
    expires_at_ms INTEGER NOT NULL
) STRICT;

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL
) STRICT;

CREATE TABLE import_batches (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    source TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    -- SHA-256 of the original file bytes.
    file_sha256 TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    imported_rows INTEGER NOT NULL,
    imported_at_ms INTEGER NOT NULL,
    UNIQUE (account_id, source, file_sha256)
) STRICT;

CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
    account_id INTEGER NOT NULL REFERENCES accounts(id),
    category_id INTEGER NOT NULL REFERENCES categories(id) ON DELETE RESTRICT,
    -- Whole TWD units: TWD 80 -> 80. No scaling to cents.
    amount INTEGER NOT NULL,
    currency TEXT NOT NULL,
    recorded_at_ms INTEGER NOT NULL,
    note TEXT NOT NULL,
    import_batch_id INTEGER REFERENCES import_batches(id) ON DELETE RESTRICT,
    -- 1-based logical CSV data record, excluding the header.
    -- A quoted multiline note still belongs to one logical record.
    source_row_number INTEGER,
    created_at_ms INTEGER NOT NULL,
    updated_at_ms INTEGER NOT NULL,
    UNIQUE (import_batch_id, source_row_number)
) STRICT;

CREATE INDEX idx_sessions_account ON sessions(account_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at_ms);
CREATE INDEX idx_expenses_account_recorded_at ON expenses(account_id, recorded_at_ms, id);
CREATE INDEX idx_expenses_account_category_date ON expenses(account_id, category_id, recorded_at_ms);

