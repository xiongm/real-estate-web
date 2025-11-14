-- Adds per-field font metadata storage for text fields.
ALTER TABLE field
    ADD COLUMN IF NOT EXISTS font_family TEXT DEFAULT 'sans';
