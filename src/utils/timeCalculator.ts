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
