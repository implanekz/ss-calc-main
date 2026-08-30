-- Migration 006: Persist the SSA statement date on earnings records.
-- created_at is when the user uploaded; statement_date is when SSA generated
-- the file. They can be years apart. Nullable: a hand-typed PIA has no vintage.

ALTER TABLE earnings_records
  ADD COLUMN IF NOT EXISTS statement_date DATE;
