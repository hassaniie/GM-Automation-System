-- MG GA Andon · reports from the database (URD req 28–29)

-- offline records: the shift and the return time as columns, for reports
ALTER TABLE offline_records ADD COLUMN shift_key text, ADD COLUMN returned_t integer;
UPDATE offline_records SET shift_key = record->>'shiftKey', returned_t = (record->>'returnedT')::numeric::integer;
CREATE INDEX offline_records_shift_idx ON offline_records (shift_key);

-- the report made at the end of every shift, as Excel and PDF
CREATE TABLE saved_reports (
  id          bigserial PRIMARY KEY,
  shift_key   text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('xlsx', 'pdf')),
  file        bytea NOT NULL,
  bytes       integer NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (shift_key, kind)
);
