/**
 * Ordered, versioned schema migrations.
 *
 * Rules (see vault note `Database` -> "Connection & Migrations"):
 *  - Never edit a migration that has shipped. Add a new one with the next version.
 *  - `PRAGMA user_version` is SQLite's built-in schema-version slot, so no
 *    migrations table is needed.
 *  - Each migration runs inside an exclusive transaction, so a failure part-way
 *    leaves the version number unchanged and is retried on next launch rather
 *    than half-applied.
 */

export interface Migration {
  version: number;
  up: string;
}

export const MIGRATIONS: Migration[] = [
  {
    version: 1,
    up: `
      CREATE TABLE IF NOT EXISTS users (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        full_name     TEXT    NOT NULL,
        email         TEXT    NOT NULL COLLATE NOCASE,
        password_hash TEXT    NOT NULL,
        student_id    TEXT,
        course        TEXT,
        year_level    TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at    TEXT
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users (email);

      CREATE TABLE IF NOT EXISTS internships (
        id             INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id        INTEGER NOT NULL,
        company_name   TEXT    NOT NULL,
        position       TEXT    NOT NULL,
        required_hours REAL    NOT NULL DEFAULT 0 CHECK (required_hours > 0),
        start_date     TEXT    NOT NULL,
        end_date       TEXT,
        is_active      INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
        created_at     TEXT    NOT NULL DEFAULT (datetime('now')),

        FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_internships_user   ON internships (user_id);
      CREATE INDEX IF NOT EXISTS idx_internships_active ON internships (user_id, is_active);

      CREATE TABLE IF NOT EXISTS time_records (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        internship_id INTEGER NOT NULL,
        date          TEXT    NOT NULL,
        time_in       TEXT    NOT NULL,
        time_out      TEXT    NOT NULL,
        break_minutes INTEGER NOT NULL DEFAULT 0 CHECK (break_minutes >= 0),
        total_minutes INTEGER NOT NULL CHECK (total_minutes > 0),
        total_hours   REAL    NOT NULL CHECK (total_hours > 0),
        notes         TEXT,
        created_at    TEXT    NOT NULL DEFAULT (datetime('now')),

        FOREIGN KEY (internship_id) REFERENCES internships (id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_time_records_internship
        ON time_records (internship_id, date DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_time_records_no_duplicate
        ON time_records (internship_id, date, time_in);
    `,
  },

  // v2 adds the failed-login counter. Timestamps here are ISO-8601 with a `Z`,
  // NOT the `datetime('now')` used by every other table — those columns are read
  // by `new Date()` in `utils/rateLimiter`, and `datetime()`'s space-separated
  // output is parsed as local time, which is an 8-hour error in Manila. See
  // `secondsUntil`.
  //
  // `CHECK (id = 1)` pins this to a single row: there is exactly one
  // device-wide counter, so a second row is a write error rather than a silently
  // competing counter. The row itself is created on first use by
  // `getAuthAttemptState`, not here, so there is exactly one seeding point.
  {
    version: 2,
    up: `
      CREATE TABLE IF NOT EXISTS auth_attempts (
        id              INTEGER PRIMARY KEY CHECK (id = 1),
        failed_count    INTEGER NOT NULL DEFAULT 0,
        last_failure_at TEXT,
        locked_until    TEXT
      );
    `,
  },

  // v3 adds `block` — the section a student is formally enrolled in, e.g. "3A".
  //
  // A separate column rather than a wider `year_level`, because the two are not
  // the same string and a student who gets one wrong is not wrong on the other.
  // `year_level` is what the student calls it ("3rd Year"); `block` is what the
  // registrar calls it ("3A"). The TMC form's single `COURSE/BLOCK` cell needs
  // the second one, and it prints on a document a supervisor signs, so it is
  // asked for explicitly instead of being inferred.
  //
  // `ALTER TABLE ... ADD COLUMN` cannot take a non-constant DEFAULT and does not
  // rewrite the table, so this is cheap and cannot lose an existing row. It is
  // nullable, so every account created before this migration reads `null` and
  // the form falls back to `year_level` rather than printing a blank cell.
  {
    version: 3,
    up: `
      ALTER TABLE users ADD COLUMN block TEXT;
    `,
  },
];

export const LATEST_VERSION = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  0,
);
