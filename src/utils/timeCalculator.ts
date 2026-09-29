/**
 * Pure time arithmetic. No React, no expo-*, no database imports.
 *
 * These functions decide every number the app ever displays, so they are the
 * highest-value thing in the project to unit test. See vault note
 * `Architecture` -> "Decision 4".
 */

export const MINUTES_PER_DAY = 1440;
export const MINUTES_PER_HOUR = 60;

/** Longest break we will accept, in minutes (12 hours). */
export const MAX_BREAK_MINUTES = 720;

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export class TimeCalculationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TimeCalculationError';
  }
}

/**
 * Convert a 24-hour `HH:MM` string to minutes since midnight.
 * Returns `null` if the input is not a valid 24-hour time.
 */
export const timeToMinutes = (time: string): number | null => {
  const match = TIME_PATTERN.exec(time);
  if (!match) return null;
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
};

/** Convert minutes since midnight to a 24-hour `HH:MM` string. */
export const minutesToTime = (minutes: number): string => {
  const normalised = ((minutes % MINUTES_PER_DAY) + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  const h = Math.floor(normalised / MINUTES_PER_HOUR);
  const m = normalised % MINUTES_PER_HOUR;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
};

/**
 * Duration in minutes worked, after removing the unpaid break.
 *
 *   total = (minutes(out) - minutes(in) + 1440) mod 1440 - break
 *
 * The `+ 1440 % 1440` wrap makes overnight shifts work: 22:00 -> 06:00 is
 * 480 minutes, not -960.
 *
 * Throws rather than clamping, because a zero or negative result is almost
 * always a data-entry mistake and should never reach the database.
 */
export const computeTotalMinutes = (
  timeIn: string,
  timeOut: string,
  breakMinutes = 0,
): number => {
  const start = timeToMinutes(timeIn);
  const end = timeToMinutes(timeOut);

  if (start === null) throw new TimeCalculationError(`Invalid time in: "${timeIn}"`);
  if (end === null) throw new TimeCalculationError(`Invalid time out: "${timeOut}"`);

  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    throw new TimeCalculationError('Break must be zero or more minutes');
  }

  const worked = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;

  if (breakMinutes > worked) {
    throw new TimeCalculationError('Break cannot exceed the time worked');
  }

  const total = worked - breakMinutes;

  if (total <= 0) {
    throw new TimeCalculationError('Total hours must be greater than zero');
  }

  return total;
};

/** Round to 2 decimal places, avoiding the usual float artefacts. */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/** Integer minutes to decimal hours, rounded to 2dp. */
export const minutesToHours = (minutes: number): number => round2(minutes / MINUTES_PER_HOUR);

// ── the four attendance fields ─────────────────────────────────────────────

/**
 * The TMC form's four time cells, as one day's worth of input.
 *
 * The school asks for **four** times per day — AM in/out and PM in/out — and
 * this is the shape they arrive in. Nullable on all four because a half-day is
 * ordinary: someone who worked a morning shift has no PM session, and printing a
 * fabricated `1:00 PM` in that cell is how a signed form gets rejected.
 *
 * Storage stays 24-hour `HH:MM`. Nothing in this module knows about AM/PM.
 */
export interface DaySessions {
  am_in: string | null;
  am_out: string | null;
  pm_in: string | null;
  pm_out: string | null;
}

/** Every field of `DaySessions`, in form order. Used by the schema and the form. */
export const SESSION_KEYS = ['am_in', 'am_out', 'pm_in', 'pm_out'] as const satisfies readonly (keyof DaySessions)[];

export type SessionKey = (typeof SESSION_KEYS)[number];

/** An all-blank day, which is the starting state of the form. */
export const emptySessions = (): DaySessions => ({ am_in: null, am_out: null, pm_in: null, pm_out: null });

/** True when neither session has been filled in at all. */
export const hasNoSessions = (s: DaySessions): boolean =>
  !s.am_in && !s.am_out && !s.pm_in && !s.pm_out;

/**
 * Minutes for one session, or `0` when the session is absent.
 *
 * **Absent and half-filled are different states**, and conflating them is the
 * bug this split avoids. Absent means both fields are null and the session
 * simply did not happen. Half-filled means a time in with no time out, which is
 * never valid — it is a mistyped form, not a short shift — so it throws with a
 * message naming the session, instead of silently contributing 0 and quietly
 * under-reporting the student's hours.
 *
 * The `(out - in + 1440) % 1440` wrap is the same one `computeTotalMinutes` uses,
 * and it is what lets a PM session run past midnight: 20:00 → 04:00 is 480
 * minutes, not -960. A zero-length session (`in === out`) is rejected, because it
 * is either a typo or a day that was not worked.
 */
export const computeSessionMinutes = (
  timeIn: string | null,
  timeOut: string | null,
  label: 'AM' | 'PM',
): number => {
  if (timeIn === null && timeOut === null) return 0;

  if (timeIn === null || timeOut === null) {
    throw new TimeCalculationError(
      `${label} time in and time out must both be set, or both left empty`,
    );
  }

  const start = timeToMinutes(timeIn);
  const end = timeToMinutes(timeOut);

  if (start === null) throw new TimeCalculationError(`Invalid ${label} time in: "${timeIn}"`);
  if (end === null) throw new TimeCalculationError(`Invalid ${label} time out: "${timeOut}"`);

  const minutes = (end - start + MINUTES_PER_DAY) % MINUTES_PER_DAY;
  if (minutes === 0) {
    throw new TimeCalculationError(`${label} time out must not be the same as time in`);
  }

  return minutes;
};

/**
 * Minutes worked across both sessions, after removing the unpaid break.
 *
 *   total = (AM minutes + PM minutes) - break
 *
 * The break is deducted **once**, from the day, rather than from each session.
 * A student taking a 1-hour lunch at 12:00 is on break whether they resumed at
 * 12:30 (AM only) or at 13:00 after an afternoon session, and charging it twice
 * would silently inflate every split day.
 *
 * Throws rather than clamping, for the same reason `computeTotalMinutes` does: a
 * zero or negative day is a data-entry mistake, and it must never reach the
 * database as a real total.
 */
export const computeDayMinutes = (sessions: DaySessions, breakMinutes = 0): number => {
  const worked =
    computeSessionMinutes(sessions.am_in, sessions.am_out, 'AM') +
    computeSessionMinutes(sessions.pm_in, sessions.pm_out, 'PM');

  if (worked === 0) {
    throw new TimeCalculationError('Enter at least one session — AM or PM time in and time out');
  }

  if (!Number.isFinite(breakMinutes) || breakMinutes < 0) {
    throw new TimeCalculationError('Break must be zero or more minutes');
  }

  if (breakMinutes > worked) {
    throw new TimeCalculationError('Break cannot exceed the time worked');
  }

  const total = worked - breakMinutes;

  if (total <= 0) {
    throw new TimeCalculationError('Total hours must be greater than zero');
  }

  return total;
};

/**
 * The day's overall in/out, for the `time_in` / `time_out` columns.
 *
 * Those two columns are what the Records list and the detailed log show as a
 * single "8:00 AM – 5:00 PM" range, so they remain the day's span rather than
 * becoming a second, competing source of truth. They are **derived** here and
 * never accepted from a caller, exactly like the totals.
 *
 * `time_in` is the earliest session start. `time_out` is whichever session ends
 * *furthest after that start*, not the larger clock value — so a split day
 * 08:00–12:00 and 13:00–17:00 reads `08:00 – 17:00` and not `08:00 – 12:00`,
 * and a 20:00–04:00 night shift reads `20:00 – 04:00` rather than inverting.
 *
 * Returns `null` for both when the day has no sessions at all, which is the
 * caller's signal that the day is not yet loggable.
 */
export const daySpan = (sessions: DaySessions): { time_in: string | null; time_out: string | null } => {
  const starts: { start: number; in: string; out: string }[] = [];

  for (const [inKey, outKey, label] of [
    ['am_in', 'am_out', 'AM'],
    ['pm_in', 'pm_out', 'PM'],
  ] as const) {
    const timeIn = sessions[inKey];
    const timeOut = sessions[outKey];
    if (timeIn === null && timeOut === null) continue;

    // Reuses the session validator, so a half-filled pair throws here too rather
    // than producing a `null` out that would hide the mistake one layer up.
    computeSessionMinutes(timeIn, timeOut, label);

    const start = timeToMinutes(timeIn as string) as number;
    starts.push({ start, in: timeIn as string, out: timeOut as string });
  }

  if (starts.length === 0) return { time_in: null, time_out: null };

  const earliest = Math.min(...starts.map((s) => s.start));
  const dayIn = starts.find((s) => s.start === earliest) as (typeof starts)[number];

  // Elapsed from the day's start, so "furthest after 08:00" is a comparison of
  // durations rather than of clock times. `AM` before `PM` on a tie, which is
  // the order the columns appear in on the form.
  let best = dayIn;
  let bestElapsed = 0;
  for (const session of starts) {
    const elapsed = (timeToMinutes(session.out)! - earliest + MINUTES_PER_DAY) % MINUTES_PER_DAY;
    if (elapsed >= bestElapsed) {
      best = session;
      bestElapsed = elapsed;
    }
  }

  return { time_in: dayIn.in, time_out: best.out };
};
