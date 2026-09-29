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
    `INSERT INTO users (full_name, email, password_hash, student_id, course, year_level)
     VALUES (?, ?, ?, ?, ?, ?)`,
    u.full_name,
    u.email,
    u.password_hash,
    u.student_id ?? null,
    u.course ?? null,
    u.year_level ?? null,
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
  },
) =>
  db.runAsync(
    `UPDATE users
        SET full_name = ?, student_id = ?, course = ?, year_level = ?,
            updated_at = datetime('now')
      WHERE id = ?`,
    fields.full_name,
    fields.student_id,
    fields.course,
    fields.year_level,
    id,
  );

/** Used on login to upgrade a hash created with fewer KDF iterations. */
export const updateUserPasswordHash = (db: SQLiteDatabase, id: number, hash: string) =>
  db.runAsync('UPDATE users SET password_hash = ?, updated_at = datetime(now) WHERE id = ?', [
    hash,
    id,
  ]);

export const deleteUser = (db: SQLiteDatabase, id: number) =>
  db.runAsync('DELETE FROM users WHERE id = ?', [id]);

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
       (internship_id, date, time_in, time_out, break_minutes,
        total_minutes, total_hours, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    r.internship_id,
    r.date,
    r.time_in,
    r.time_out,
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
    break_minutes: number;
    total_minutes: number;
    total_hours: number;
    notes: string | null;
  },
) =>
  db.runAsync(
    `UPDATE time_records
        SET date = ?, time_in = ?, time_out = ?, break_minutes = ?,
            total_minutes = ?, total_hours = ?, notes = ?
      WHERE id = ?`,
    fields.date,
    fields.time_in,
    fields.time_out,
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
