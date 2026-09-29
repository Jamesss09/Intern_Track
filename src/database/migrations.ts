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
];

export const LATEST_VERSION = MIGRATIONS.reduce(
  (max, m) => Math.max(max, m.version),
  0,
);
