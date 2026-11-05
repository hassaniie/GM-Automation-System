-- MG GA Andon · initial schema
-- Times: `t` is plant time in seconds from 00:00 on the configured base date (the engine's clock);
-- `at` is wall-clock time on the server.

-- people and access (URD req 30)
CREATE TABLE users (
  id            text PRIMARY KEY,
  emp_id        text NOT NULL,
  email         text NOT NULL,
  name          text NOT NULL,
  role          text NOT NULL CHECK (role IN ('admin', 'authorised', 'supervisor', 'maintenance', 'viewer')),
  active        boolean NOT NULL DEFAULT true,
  password_hash text,                       -- null for single-sign-on-only accounts
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_sign_in  timestamptz
);
CREATE UNIQUE INDEX users_emp_id_key ON users (lower(emp_id));
CREATE UNIQUE INDEX users_email_key ON users (lower(email));

CREATE TABLE displays (
  id          text PRIMARY KEY,
  name        text NOT NULL,
  line        text NOT NULL CHECK (line IN ('trim', 'chassis', 'final')),
  token_hash  text NOT NULL UNIQUE,         -- the link's token is shown once; only its hash is kept
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  last_seen   timestamptz,
  revoked_at  timestamptz
);

CREATE TABLE sessions (
  id_hash     text PRIMARY KEY,             -- SHA-256 of the cookie token
  kind        text NOT NULL CHECK (kind IN ('user', 'display')),
  user_id     text REFERENCES users (id) ON DELETE CASCADE,
  display_id  text REFERENCES displays (id) ON DELETE CASCADE,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL,
  last_seen   timestamptz NOT NULL DEFAULT now(),
  ip          text,
  user_agent  text,
  revoked_at  timestamptz,
  CHECK ((kind = 'user' AND user_id IS NOT NULL) OR (kind = 'display' AND display_id IS NOT NULL))
);
CREATE INDEX sessions_user_idx ON sessions (user_id) WHERE revoked_at IS NULL;

CREATE TABLE auth_log (
  id      bigserial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  who     text NOT NULL,
  action  text NOT NULL,
  detail  text NOT NULL DEFAULT '',
  ip      text
);
CREATE INDEX auth_log_at_idx ON auth_log (at);

-- changes to configuration and corrections (URD req 7, 10, 13, 15, 18)
CREATE TABLE audit (
  id      text PRIMARY KEY,
  t       integer NOT NULL,
  date    text,
  by      text NOT NULL,
  action  text NOT NULL,
  target  text NOT NULL,
  before  text,
  after   text,
  reason  text NOT NULL DEFAULT '',
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_at_idx ON audit (at);

-- plant events (from devices / simulator) and commands (from people)
CREATE TABLE events (
  id       bigserial PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  t        integer NOT NULL,
  kind     text NOT NULL CHECK (kind IN ('plant', 'command')),
  type     text NOT NULL,
  actor    text,
  ok       boolean,
  payload  jsonb NOT NULL
);
CREATE INDEX events_at_idx ON events (at);

-- production history (URD req 28–29)
CREATE TABLE vehicles (
  vin         text PRIMARY KEY,
  vehicle_id  text NOT NULL,
  variant     text,
  model       text,
  paint       text,
  state       text NOT NULL,
  entry_t     integer,
  line_off_t  integer,
  total_dur   integer,
  record      jsonb NOT NULL,                -- segments, offline / return history
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX vehicles_line_off_idx ON vehicles (line_off_t);

CREATE TABLE production (
  area       text NOT NULL,
  vin        text NOT NULL,
  t          integer NOT NULL,
  shift_key  text,
  returned   boolean NOT NULL DEFAULT false,
  PRIMARY KEY (area, vin, t)
);
CREATE INDEX production_shift_idx ON production (shift_key);

CREATE TABLE segments (
  vin        text NOT NULL,
  pos        text NOT NULL,
  t          integer NOT NULL,
  area       text NOT NULL,
  shift_key  text,
  cycle      integer,
  work       integer,
  wait       integer,
  target     integer,
  over       integer,
  PRIMARY KEY (vin, pos, t)
);
CREATE INDEX segments_shift_idx ON segments (shift_key);

CREATE TABLE offline_records (
  vin     text NOT NULL,
  t       integer NOT NULL,
  pos     text NOT NULL,
  area    text NOT NULL,
  reason  text,
  by      text,
  record  jsonb NOT NULL,
  PRIMARY KEY (vin, t)
);

CREATE TABLE calls (
  id            text PRIMARY KEY,
  pos           text NOT NULL,
  area          text NOT NULL,
  type          text NOT NULL,
  raised_t      integer NOT NULL,
  raised_by     text,
  responded_t   integer,
  responded_by  text,
  cleared_t     integer,
  cleared_by    text,
  shift_key     text,
  vin           text,
  record        jsonb NOT NULL
);
CREATE INDEX calls_shift_idx ON calls (shift_key);

CREATE TABLE shifts (
  key         text PRIMARY KEY,
  summary     jsonb,
  downtime    jsonb,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- current settings, and restart points (URD req 32)
CREATE TABLE config (
  id          integer PRIMARY KEY CHECK (id = 1),
  cfg         jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE checkpoints (
  id     bigserial PRIMARY KEY,
  at     timestamptz NOT NULL DEFAULT now(),
  t      integer NOT NULL,
  rev    integer NOT NULL,
  state  bytea NOT NULL                     -- node:v8 serialised engine state (shared references kept)
);
