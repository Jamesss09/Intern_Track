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
import { computeTotalMinutes, minutesToHours, TimeCalculationError } from '@/utils/timeCalculator';
import { summarize } from '@/utils/progressCalculator';
import { assertRecordableDate } from '@/utils/dateRestriction';

export interface RecordInput {
  internship_id: number;
  date: string;
  time_in: string;
  time_out: string;
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

const resolveDurations = (input: {
  time_in: string;
  time_out: string;
  break_minutes: number;
}): { total_minutes: number; total_hours: number } => {
  const totalMinutes = computeTotalMinutes(input.time_in, input.time_out, input.break_minutes);
  return { total_minutes: totalMinutes, total_hours: minutesToHours(totalMinutes) };
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
    time_in: input.time_in,
    time_out: input.time_out,
    break_minutes: input.break_minutes,
    ...durations,
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
    time_in: input.time_in,
    time_out: input.time_out,
    break_minutes: input.break_minutes,
    ...durations,
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
