/**
 * Domain types for InternTrack.
 *
 * Field names match the SQLite column names exactly (snake_case) so rows returned
 * by the database can be used directly without a mapping layer. See vault note
 * `Project Structure` -> `types/` for the rationale.
 */

/** A registered student. Lives only on the device that created the account. */
export interface User {
  id: number;
  full_name: string;
  /** Unique and case-insensitive (`COLLATE NOCASE` on the column). */
  email: string;
  /** Hashed. Plaintext passwords are never stored. */
  password_hash: string;
  student_id: string | null;
  course: string | null;
  year_level: string | null;
  /**
   * The registrar's section for the student, e.g. `"3A"`.
   *
   * Not the same string as `year_level`, and not derivable from it: "3rd Year"
   * is what the student says, "3A" is what the registrar says. The TMC form's
   * `COURSE/BLOCK` cell prints this, and the document is signed by a supervisor,
   * so the value is captured rather than guessed.
   */
  block: string | null;
  /** `datetime('now')`, UTC. */
  created_at: string;
  updated_at: string | null;
}

/** An OJT placement. A user has one *active* internship at a time. */
export interface Internship {
  id: number;
  user_id: number;
  company_name: string;
  position: string;
  /** Target hours, e.g. 486. `CHECK (required_hours > 0)`. */
  required_hours: number;
  /** ISO date `YYYY-MM-DD`. */
  start_date: string;
  /** ISO date `YYYY-MM-DD`, or null while the placement is ongoing. */
  end_date: string | null;
  /** 1 = current placement, 0 = archived. */
  is_active: 0 | 1;
  created_at: string;
}

/** One worked day. */
export interface TimeRecord {
  id: number;
  internship_id: number;
  /** ISO date `YYYY-MM-DD`. Sorts chronologically as a string. */
  date: string;
  /** 24-hour `HH:MM`. Never store 12-hour `'8:00 AM'`. */
  time_in: string;
  /** 24-hour `HH:MM`. */
  time_out: string;
  break_minutes: number;
  /**
   * Authoritative duration in integer minutes. All arithmetic happens here so
   * decimal-hour drift cannot accumulate. See vault note `Database`.
   */
  total_minutes: number;
  /**
   * Materialised `total_minutes / 60`, rounded to 2dp, for SQL aggregation.
   * Never read `SUM(total_hours)` for a user-facing total.
   */
  total_hours: number;
  notes: string | null;
  created_at: string;
}

/** Fields required to create a user. */
export interface NewUser {
  full_name: string;
  email: string;
  password_hash: string;
  student_id?: string | null;
  course?: string | null;
  year_level?: string | null;
  block?: string | null;
}

/** Fields required to create an internship. */
export interface NewInternship {
  user_id: number;
  company_name: string;
  position: string;
  required_hours: number;
  start_date: string;
  end_date?: string | null;
}

/** Fields required to create a time record. Durations are computed, not accepted. */
export interface NewTimeRecord {
  internship_id: number;
  date: string;
  time_in: string;
  time_out: string;
  break_minutes: number;
  total_minutes: number;
  total_hours: number;
  notes?: string | null;
}

/** Aggregated hours for an internship, derived from `SUM(total_minutes)`. */
export interface InternshipSummary {
  completed: number;
  required: number;
  remaining: number;
  /** Integer 0-100, capped. */
  percent: number;
  isComplete: boolean;
  dayCount: number;
}

/**
 * Narrows a records listing. Every field is optional and `null`-able, and an
 * empty filter must return the same rows as an unfiltered listing.
 *
 * Bounds are inclusive and stored in the same ISO `YYYY-MM-DD` form as
 * `time_records.date`, which compares correctly as a string — no date parsing
 * happens in SQL. → [[Open Questions|Q8]]
 */
export interface TimeRecordFilter {
  /** Inclusive lower bound, or null for no lower bound. */
  from?: string | null;
  /** Inclusive upper bound, or null for no upper bound. */
  to?: string | null;
  /** Case-insensitive substring matched against `notes`. Null or empty disables it. */
  search?: string | null;
}

/**
 * The failed-login counter. One row only (`CHECK (id = 1)`), so there is no `id`
 * to project and the row is addressed directly.
 *
 * Device-wide rather than per-account, deliberately. There is no server to
 * coordinate a counter across, and a lockout keyed on the email could be sidestepped
 * by typing a different one — which would not be a lockout.
 */
export interface LoginAttemptState {
  failed_count: number;
  /** ISO-8601 UTC with a `Z`. Cleared by a successful login. */
  last_failure_at: string | null;
  /**
   * ISO-8601 UTC with a `Z` — **not** SQLite's `datetime('now')` output, which
   * has no zone designator and is parsed by `Date` as local time. See
   * `utils/rateLimiter` -> `secondsUntil`.
   */
  locked_until: string | null;
}
