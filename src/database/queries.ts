/**
 * Every SQL statement in the app lives here.
 *
 * Always bind parameters with `?`. Never interpolate user input into a query
 * string — the `notes` field is free text and reaches the database on every
 * insert. See vault note `Security` -> "SQL Injection".
 */

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  Internship,
  LoginAttemptState,
  NewInternship,
  NewTimeRecord,
  NewUser,
  TimeRecord,
  TimeRecordFilter,
  User,
} from '@/types';

// ── users ────────────────────────────────────────────────────────────────

export const insertUser = async (db: SQLiteDatabase, u: NewUser): Promise<number> => {
  const result = await db.runAsync(
    `INSERT INTO users (full_name, email, password_hash, student_id, course, year_level, block)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    u.full_name,
    u.email,
    u.password_hash,
    u.student_id ?? null,
    u.course ?? null,
    u.year_level ?? null,
    u.block ?? null,
  );
  return result.lastInsertRowId;
};

export const getUserById = (db: SQLiteDatabase, id: number) =>
  db.getFirstAsync<User>('SELECT * FROM users WHERE id = ?', [id]);

export const getUserByEmail = (db: SQLiteDatabase, email: string) =>
  db.getFirstAsync<User>('SELECT * FROM users WHERE email = ?', [email]);

export const updateUserProfile = (
  db: SQLiteDatabase,
  id: number,
  fields: {
    full_name: string;
    student_id: string | null;
    course: string | null;
    year_level: string | null;
    block: string | null;
  },
) =>
  db.runAsync(
    `UPDATE users
        SET full_name = ?, student_id = ?, course = ?, year_level = ?, block = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
    fields.full_name,
    fields.student_id,
    fields.course,
    fields.year_level,
    fields.block,
    id,
  );

/** Used on login to upgrade a hash created with fewer KDF iterations. */
export const updateUserPasswordHash = (db: SQLiteDatabase, id: number, hash: string) =>
  db.runAsync('UPDATE users SET password_hash = ?, updated_at = datetime(now) WHERE id = ?', [
    hash,
    id,
  ]);

/**
 * Records which file holds the student's picture, or clears it with `null`.
 *
 * Separate from `updateUserProfile` on purpose. That call rewrites every profile
 * field from a form's values, so folding the avatar into it would mean a picture
 * change silently had to be threaded through the same React Hook Form that owns
 * the name — and a student removing their picture would then have to save the
 * whole form to make it stick. One column, one statement, one caller.
 */
export const updateUserAvatar = (db: SQLiteDatabase, id: number, path: string | null) =>
  db.runAsync('UPDATE users SET avatar_path = ?, updated_at = datetime(\'now\') WHERE id = ?', [
    path,
    id,
  ]);

export const deleteUser = (db: SQLiteDatabase, id: number) =>
  db.runAsync('DELETE FROM users WHERE id = ?', [id]);

// ── auth attempts ─────────────────────────────────────────────────────────

/**
 * The single counter row, created on first use.
 *
 * Seeding here rather than in the migration keeps one place responsible for the
 * row existing. The fallback is unreachable in practice —
 * `INSERT OR IGNORE` then `SELECT` on `id = 1` cannot miss — but the declared
 * return type has to be honest, and a student staring at "Incorrect email or
 * password" forever is a worse outcome than a silently fresh counter.
 */
export const getAuthAttemptState = async (db: SQLiteDatabase): Promise<LoginAttemptState> => {
  await db.runAsync('INSERT OR IGNORE INTO auth_attempts (id) VALUES (1)');

  const row = await db.getFirstAsync<LoginAttemptState>(
    'SELECT failed_count, last_failure_at, locked_until FROM auth_attempts WHERE id = 1',
  );

  return row ?? { failed_count: 0, last_failure_at: null, locked_until: null };
};

/**
 * Records one failure, and arms the lockout when `lockoutSeconds` is non-zero.
 *
 * The duration is an argument rather than computed here, because the backoff
 * curve lives in `utils/rateLimiter` and `database/` must not import from
 * `utils/` (vault note `Architecture` -> "Layering Rules"). Both values are
 * bound; nothing is interpolated.
 *
 * An upsert, not a bare `UPDATE`. An `UPDATE` against a missing row matches
 * zero rows and still reports success, so the counter would silently never move
 * and the feature would look like it worked while permitting unlimited attempts.
 * `WHERE ? > 0` also means a negative duration can never build a malformed
 * modifier string.
 */
export const recordFailedAttempt = (db: SQLiteDatabase, lockoutSeconds: number) =>
  db.runAsync(
    `INSERT INTO auth_attempts (id, failed_count, last_failure_at, locked_until)
       VALUES (1, 1,
               strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
               CASE WHEN ? > 0
                 THEN strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '+' || ? || ' seconds')
                 ELSE NULL END)
     ON CONFLICT(id) DO UPDATE SET
       failed_count    = auth_attempts.failed_count + 1,
       last_failure_at = excluded.last_failure_at,
       locked_until    = excluded.locked_until`,
    lockoutSeconds,
    lockoutSeconds,
  );

/** Resets the counter after a successful login. Total: works with no row present. */
export const clearAuthAttempts = (db: SQLiteDatabase) =>
  db.runAsync(
    `INSERT INTO auth_attempts (id, failed_count, last_failure_at, locked_until)
       VALUES (1, 0, NULL, NULL)
     ON CONFLICT(id) DO UPDATE SET
       failed_count = 0,
       last_failure_at = NULL,
       locked_until = NULL`,
  );

// ── internships ──────────────────────────────────────────────────────────

export const insertInternship = async (
  db: SQLiteDatabase,
  i: NewInternship,
): Promise<number> => {
  const result = await db.runAsync(
    `INSERT INTO internships (user_id, company_name, position, required_hours, start_date, end_date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    i.user_id,
    i.company_name,
    i.position,
    i.required_hours,
    i.start_date,
    i.end_date ?? null,
  );
  return result.lastInsertRowId;
};

export const getActiveInternship = (db: SQLiteDatabase, userId: number) =>
  db.getFirstAsync<Internship>(
    'SELECT * FROM internships WHERE user_id = ? AND is_active = 1 LIMIT 1',
    [userId],
  );

export const listInternships = (db: SQLiteDatabase, userId: number) =>
  db.getAllAsync<Internship>(
    'SELECT * FROM internships WHERE user_id = ? ORDER BY is_active DESC, start_date DESC',
    [userId],
  );

/** Archive previous placements so only one is ever active. */
export const archiveOtherInternships = (db: SQLiteDatabase, userId: number) =>
  db.runAsync('UPDATE internships SET is_active = 0 WHERE user_id = ?', [userId]);

export const updateInternship = (
  db: SQLiteDatabase,
  id: number,
  fields: {
    company_name: string;
    position: string;
    required_hours: number;
    start_date: string;
    end_date: string | null;
  },
) =>
  db.runAsync(
    `UPDATE internships
        SET company_name = ?, position = ?, required_hours = ?,
            start_date = ?, end_date = ?
      WHERE id = ?`,
    fields.company_name,
    fields.position,
    fields.required_hours,
    fields.start_date,
    fields.end_date,
    id,
  );

export const deleteInternship = (db: SQLiteDatabase, id: number) =>
  db.runAsync('DELETE FROM internships WHERE id = ?', [id]);

// ── time records ─────────────────────────────────────────────────────────

export const insertTimeRecord = async (
  db: SQLiteDatabase,
  r: NewTimeRecord,
): Promise<number> => {
  const result = await db.runAsync(
    `INSERT INTO time_records
       (internship_id, date, time_in, time_out,
        am_time_in, am_time_out, pm_time_in, pm_time_out,
        break_minutes, total_minutes, total_hours, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    r.internship_id,
    r.date,
    r.time_in,
    r.time_out,
    r.am_time_in,
    r.am_time_out,
    r.pm_time_in,
    r.pm_time_out,
    r.break_minutes,
    r.total_minutes,
    r.total_hours,
    r.notes ?? null,
  );
  return result.lastInsertRowId;
};

export const getTimeRecordById = (db: SQLiteDatabase, id: number) =>
  db.getFirstAsync<TimeRecord>('SELECT * FROM time_records WHERE id = ?', [id]);

export const listTimeRecords = (db: SQLiteDatabase, internshipId: number) =>
  db.getAllAsync<TimeRecord>(
    'SELECT * FROM time_records WHERE internship_id = ? ORDER BY date DESC, time_in DESC',
    [internshipId],
  );

/**
 * Escape a user-supplied substring so `LIKE` treats it literally.
 *
 * `%` and `_` are `LIKE` wildcards, so a student searching for "50%" or
 * "a_b" would otherwise match every record. `\` is declared as the escape
 * character by the `ESCAPE` clause below, so it has to be doubled first — and
 * doing it in this order is what stops the backslash we just added from being
 * escaped a second time.
 */
const escapeLikePattern = (raw: string): string => raw.replace(/[\\%_]/g, (ch) => `\\${ch}`);

/**
 * The records listing with optional bounds and a note search.
 *
 * Built by appending to a clause list rather than interpolating, so the only
 * thing that ever reaches SQL is a fixed string the caller cannot influence —
 * the values are always bound. The same ordering as `listTimeRecords` is
 * repeated here deliberately: two orderings would let a filtered list and the
 * unfiltered one disagree about which entry is newest.
 */
export const filterTimeRecords = (
  db: SQLiteDatabase,
  internshipId: number,
  filter: TimeRecordFilter,
) => {
  const clauses = ['internship_id = ?'];
  const params: (string | number)[] = [internshipId];

  if (filter.from) {
    clauses.push('date >= ?');
    params.push(filter.from);
  }

  if (filter.to) {
    clauses.push('date <= ?');
    params.push(filter.to);
  }

  if (filter.search) {
    // SQLite's LIKE is already case-insensitive for ASCII, which is what a
    // student expects. `notes IS NULL` rows drop out, which is correct: they
    // cannot contain the text being searched for.
    clauses.push("notes LIKE ? ESCAPE '\\'");
    params.push(`%${escapeLikePattern(filter.search)}%`);
  }

  return db.getAllAsync<TimeRecord>(
    `SELECT * FROM time_records WHERE ${clauses.join(' AND ')} ORDER BY date DESC, time_in DESC`,
    params,
  );
};

export const updateTimeRecord = (
  db: SQLiteDatabase,
  id: number,
  fields: {
    date: string;
    time_in: string;
    time_out: string;
    am_time_in: string | null;
    am_time_out: string | null;
    pm_time_in: string | null;
    pm_time_out: string | null;
    break_minutes: number;
    total_minutes: number;
    total_hours: number;
    notes: string | null;
  },
) =>
  db.runAsync(
    `UPDATE time_records
        SET date = ?, time_in = ?, time_out = ?,
            am_time_in = ?, am_time_out = ?, pm_time_in = ?, pm_time_out = ?,
            break_minutes = ?, total_minutes = ?, total_hours = ?, notes = ?
      WHERE id = ?`,
    fields.date,
    fields.time_in,
    fields.time_out,
    fields.am_time_in,
    fields.am_time_out,
    fields.pm_time_in,
    fields.pm_time_out,
    fields.break_minutes,
    fields.total_minutes,
    fields.total_hours,
    fields.notes,
    id,
  );

export const deleteTimeRecord = (db: SQLiteDatabase, id: number) =>
  db.runAsync('DELETE FROM time_records WHERE id = ?', [id]);

/**
 * Total worked minutes and day count for an internship.
 *
 * Sums `total_minutes`, never `total_hours` — summing decimals accumulates
 * float error and the printed total stops matching the on-screen total.
 */
export const getHoursTotals = (db: SQLiteDatabase, internshipId: number) =>
  db.getFirstAsync<{ total_minutes: number; day_count: number }>(
    `SELECT COALESCE(SUM(total_minutes), 0) AS total_minutes,
            COUNT(*)                        AS day_count
       FROM time_records
      WHERE internship_id = ?`,
    [internshipId],
  );

/** Minutes worked per day, newest first. */
export const getDailyTotals = (db: SQLiteDatabase, internshipId: number) =>
  db.getAllAsync<{ date: string; total_minutes: number }>(
    `SELECT date, SUM(total_minutes) AS total_minutes
       FROM time_records
      WHERE internship_id = ?
      GROUP BY date
      ORDER BY date DESC`,
    [internshipId],
  );

/**
 * **The TMC form's data source.** Every attendance record in one month.
 *
 * A statement of its own rather than a `filterTimeRecords` call, because this
 * query is the difference between a form full of rows and a blank one that
 * still looks valid — the failure is invisible, because a month with nothing
 * logged and a month that was queried wrongly print identically. Giving the
 * export its own statement means it cannot be broken by an edit to a filter
 * meant for a list screen, and it makes the bounds reviewable in one place:
 *
 *   from = `YYYY-MM-01`   (inclusive)
 *   to   = `YYYY-MM-<last day of that month>`   (inclusive)
 *
 * Both bounds are computed by `utils/dateFormatter` and passed in. The month
 * length is real calendar arithmetic — 30 for September, 31 for October, 29 for
 * a leap February — never a hardcoded 31, which is what would silently drop the
 * last day of every 30-day month. → [[PDF Export#Month Selection]]
 *
 * `date` is ISO text, so the comparison is lexicographic and no date parsing
 * happens in SQL. Ordering is `date ASC, time_in ASC`: ascending because a time
 * sheet is read top to bottom, and the template re-groups by day regardless.
 */
export const listMonthRecords = (
  db: SQLiteDatabase,
  internshipId: number,
  fromIso: string,
  toIso: string,
) =>
  db.getAllAsync<TimeRecord>(
    `SELECT * FROM time_records
      WHERE internship_id = ?
        AND date >= ?
        AND date <= ?
      ORDER BY date ASC, time_in ASC`,
    [internshipId, fromIso, toIso],
  );

/**
 * Every month in the placement that has at least one record, with its totals.
 *
 * Backs the export screen's "which months actually have data" list. That list
 * exists because of the exact bug this feature set fixes: a student whose
 * records are all in September, asking for October, got a blank sheet and no
 * indication that September was the month they wanted. The screen can now name
 * the months instead of leaving the student to step through the arrows.
 *
 * `substr(date, 1, 7)` on an ISO date yields `YYYY-MM` with no parsing, which
 * is why this can be a `GROUP BY` at all. `COUNT(DISTINCT date)` is the number
 * of *days*, not rows, so a split day counts once — matching the form, which
 * prints one numbered row per day.
 */
export const listMonthsWithRecords = (db: SQLiteDatabase, internshipId: number) =>
  db.getAllAsync<{ month: string; total_minutes: number; day_count: number }>(
    `SELECT substr(date, 1, 7)              AS month,
            COALESCE(SUM(total_minutes), 0) AS total_minutes,
            COUNT(DISTINCT date)            AS day_count
       FROM time_records
      WHERE internship_id = ?
      GROUP BY month
      ORDER BY month ASC`,
    [internshipId],
  );

/** Worked minutes and distinct days for one month, or zeros when it is empty. */
export const getMonthTotals = (db: SQLiteDatabase, internshipId: number, fromIso: string, toIso: string) =>
  db.getFirstAsync<{ total_minutes: number; day_count: number }>(
    `SELECT COALESCE(SUM(total_minutes), 0) AS total_minutes,
            COUNT(DISTINCT date)            AS day_count
       FROM time_records
      WHERE internship_id = ?
        AND date >= ?
        AND date <= ?`,
    [internshipId, fromIso, toIso],
  );
