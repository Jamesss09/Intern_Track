/**
 * Time record use cases.
 *
 * The duration is always computed here, never accepted from the caller. If a
 * screen could pass its own `total_hours`, the on-screen total and the printed
 * total would eventually disagree. See vault note `Database` -> "The Time
 * Calculation Rule".
 */

import type { InternshipSummary, TimeRecord, TimeRecordFilter } from '@/types';
import { getDatabase } from '@/database/database';
import * as queries from '@/database/queries';
import {
  computeDayMinutes,
  daySpan,
  minutesToHours,
  timeToMinutes,
  TimeCalculationError,
  type DaySessions,
} from '@/utils/timeCalculator';
import { summarize } from '@/utils/progressCalculator';
import { assertRecordableDate } from '@/utils/dateRestriction';
import { endOfMonthIso, startOfMonthIso } from '@/utils/dateFormatter';

export interface RecordInput extends DaySessions {
  internship_id: number;
  date: string;
  break_minutes: number;
  notes?: string | null;
}

/** Parse a `HH:MM` or numeric `H:MM` / `8:30` / `830` from a text input. */
export const parseTimeInput = (raw: string): string | null => {
  const trimmed = raw.trim();
  const match = /^(\d{1,2})[:.]?(\d{2})?$/.exec(trimmed);
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = match[2] ? Number(match[2]) : 0;

  if (hours > 23 || minutes > 59) return null;

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

/** Parse a break of `60`, `1h`, `1h30`, `1:30` into minutes. */
export const parseBreakInput = (raw: string): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) return 0;
  if (/^\d+$/.test(trimmed)) return Number(trimmed);

  const match = /^(\d+)\s*(?:h|hr|hrs|hour|hours)?\s*(?:(\d+)\s*(?:m|min|mins|minute|minutes)?)?$/i.exec(
    trimmed,
  );
  if (!match) return null;

  const hours = match[1] ? Number(match[1]) : 0;
  const minutes = match[2] ? Number(match[2]) : 0;
  if (minutes > 59) return null;

  return hours * 60 + minutes;
};

/**
 * Turn a day's four times into everything the row stores.
 *
 * The `time_in`/`time_out` span and both totals are all **derived here**, never
 * accepted from the caller. If a screen could pass its own `total_hours`, the
 * on-screen total, the printed total and the SQL aggregate would eventually
 * disagree — and the printed one is the number a college verifies. See vault
 * note `Database` -> "The Time Calculation Rule".
 *
 * `computeDayMinutes` runs first so a half-filled session or an over-long break
 * throws with its own message, before `daySpan` gets a chance to return a null
 * out that would hide the mistake one layer up.
 */
const resolveDurations = (input: DaySessions & { break_minutes: number }) => {
  const totalMinutes = computeDayMinutes(input, input.break_minutes);
  const span = daySpan(input);

  // Unreachable: `computeDayMinutes` rejects a day with no sessions, and
  // `daySpan` returns nulls only for exactly that case. Narrowed rather than
  // defaulted so a future change cannot write the literal "null" into the row.
  if (span.time_in === null || span.time_out === null) {
    throw new TimeCalculationError('Enter at least one session — AM or PM time in and time out');
  }

  return {
    time_in: span.time_in,
    time_out: span.time_out,
    total_minutes: totalMinutes,
    total_hours: minutesToHours(totalMinutes),
  };
};

/**
 * Add a day.
 *
 * `assertRecordableDate` runs **before** the duration is computed and before the
 * database is opened. This is the authoritative enforcement of the current-day
 * rule: the screen already refuses to submit another date, and the form schema
 * already rejects it, but a check that lives only in the UI is a suggestion.
 * Anything reaching this function — a screen, a future caller, a stray
 * `setValue` — is checked here.
 */
export const createRecord = async (input: RecordInput): Promise<number> => {
  assertRecordableDate(input.date);

  const db = await getDatabase();
  const durations = resolveDurations(input);

  return queries.insertTimeRecord(db, {
    internship_id: input.internship_id,
    date: input.date,
    ...durations,
    am_time_in: input.am_in,
    am_time_out: input.am_out,
    pm_time_in: input.pm_in,
    pm_time_out: input.pm_out,
    break_minutes: input.break_minutes,
    notes: input.notes?.trim() || null,
  });
};

/**
 * Correct a day that is already recorded.
 *
 * The stored date is read first, both because the current-day rule needs it — an
 * update may keep the date it already has, but may not move to another — and
 * because a `UPDATE` matching zero rows reports success, so an unknown id would
 * otherwise fail silently and the user would watch their edit evaporate.
 */
export const updateRecord = async (id: number, input: Omit<RecordInput, 'internship_id'>) => {
  const db = await getDatabase();
  const existing = await queries.getTimeRecordById(db, id);
  if (!existing) throw new Error('That day is no longer in the log.');

  assertRecordableDate(input.date, existing.date);

  const durations = resolveDurations(input);

  await queries.updateTimeRecord(db, id, {
    date: input.date,
    ...durations,
    am_time_in: input.am_in,
    am_time_out: input.am_out,
    pm_time_in: input.pm_in,
    pm_time_out: input.pm_out,
    break_minutes: input.break_minutes,
    notes: input.notes?.trim() || null,
  });
};

export const getRecordById = async (id: number): Promise<TimeRecord | null> => {
  const db = await getDatabase();
  return queries.getTimeRecordById(db, id);
};

export const deleteRecord = async (id: number): Promise<void> => {
  const db = await getDatabase();
  await queries.deleteTimeRecord(db, id);
};

export const listByInternship = async (internshipId: number): Promise<TimeRecord[]> => {
  const db = await getDatabase();
  return queries.listTimeRecords(db, internshipId);
};

/**
 * The filtered records listing behind the Records tab's filter sheet.
 *
 * An empty filter is the same query as `listByInternship`, so there is no
 * separate "unfiltered" code path for the screen to get wrong.
 */
export const listFiltered = async (
  internshipId: number,
  filter: TimeRecordFilter,
): Promise<TimeRecord[]> => {
  const db = await getDatabase();
  return queries.filterTimeRecords(db, internshipId, filter);
};

export interface DailyTotal {
  date: string;
  total_minutes: number;
  total_hours: number;
}

export const getDailyTotals = async (internshipId: number): Promise<DailyTotal[]> => {
  const db = await getDatabase();
  const rows = await queries.getDailyTotals(db, internshipId);
  return rows.map((row) => ({
    date: row.date,
    total_minutes: row.total_minutes,
    total_hours: minutesToHours(row.total_minutes),
  }));
};

/** What the placement has logged, per month, so the export screen can offer the right one. */
export interface MonthSummary {
  /** `YYYY-MM`. */
  month: string;
  total_minutes: number;
  total_hours: number;
  day_count: number;
}

/**
 * The months that have records, oldest first.
 *
 * Backed by a `GROUP BY` over `substr(date, 1, 7)`, so it is a single query
 * rather than N — the export screen calls it on every month change.
 */
export const listMonthsWithRecords = async (internshipId: number): Promise<MonthSummary[]> => {
  const db = await getDatabase();
  const rows = await queries.listMonthsWithRecords(db, internshipId);

  return rows.map((row) => ({
    month: row.month,
    total_minutes: row.total_minutes,
    total_hours: minutesToHours(row.total_minutes),
    day_count: row.day_count,
  }));
};

/**
 * One month's attendance records and their total, in a single call.
 *
 * The TMC export takes **this** and nothing else, so the document is built from
 * one query with one set of bounds. A month with no records is a legitimate
 * answer — a student back-filling a placement is allowed to print a blank
 * sheet — so this does not throw; it returns an empty list and a zero total, and
 * the screen is what decides whether that is worth warning about.
 */
export const getMonthAttendance = async (
  internshipId: number,
  monthIso: string,
): Promise<{ records: TimeRecord[]; total_minutes: number; total_hours: number; day_count: number }> => {
  const db = await getDatabase();
  const from = startOfMonthIso(monthIso);
  const to = endOfMonthIso(monthIso);

  const records = await queries.listMonthRecords(db, internshipId, from, to);
  const totals = await queries.getMonthTotals(db, internshipId, from, to);

  return {
    records,
    total_minutes: totals?.total_minutes ?? 0,
    total_hours: minutesToHours(totals?.total_minutes ?? 0),
    day_count: totals?.day_count ?? 0,
  };
};

/** True when a stored `HH:MM` is usable, for validating a partial form. */
export const isValidTime = (value: string | null | undefined): value is string =>
  typeof value === 'string' && timeToMinutes(value) !== null;

/**
 * The single source of truth for "how far along am I".
 *
 * Sums integer minutes and converts once, so 33 days of 8 h 50 min land on
 * exactly 291.00 rather than 290.99999999999994.
 */
export const getSummary = async (internshipId: number, requiredHours: number): Promise<InternshipSummary> => {
  const db = await getDatabase();
  const totals = await queries.getHoursTotals(db, internshipId);

  return summarize(requiredHours, totals?.total_minutes ?? 0, totals?.day_count ?? 0);
};

export { TimeCalculationError };