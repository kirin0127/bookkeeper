-- Bookkeeper: expenses only. Requires SQLite >= 3.37 (STRICT tables).
-- All *_at_ms fields are INTEGER milliseconds since 1970-01-01T00:00:00Z.

CREATE TABLE categories (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL,
    is_active INTEGER NOT NULL
) STRICT;

CREATE TABLE import_batches (
    id INTEGER PRIMARY KEY,
    source TEXT NOT NULL,
    original_filename TEXT NOT NULL,
    -- SHA-256 of the original file bytes.
    file_sha256 TEXT NOT NULL,
    total_rows INTEGER NOT NULL,
    imported_rows INTEGER NOT NULL,
    imported_at_ms INTEGER NOT NULL,
    UNIQUE (source, file_sha256)
) STRICT;

CREATE TABLE expenses (
    id INTEGER PRIMARY KEY,
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

CREATE INDEX idx_expenses_recorded_at ON expenses(recorded_at_ms, id);
CREATE INDEX idx_expenses_category_date ON expenses(category_id, recorded_at_ms);

