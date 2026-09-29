/**
 * Pure progress arithmetic. No React, no expo-*, no database imports.
 *
 * The PDF service reuses `summarize()` so the printed total can never disagree
 * with the on-screen total. See vault note `Architecture` -> "Decision 4".
 */

import { round2 } from './timeCalculator';

export interface ProgressSummary {
  completed: number;
  required: number;
  remaining: number;
  /** Integer 0-100, capped. */
  percent: number;
  isComplete: boolean;
  dayCount: number;
}

/**
 * Derive the progress summary for one internship.
 *
 * - `remaining` clamps at 0: over-completing is not a negative balance.
 * - `percent` caps at 100: many students keep logging past the target, and a
 *   bar that reads 108% looks broken.
 * - `required > 0` is guarded because this division is the one place a zero
 *   could yield `Infinity` or `NaN`, and `NaN` renders as the literal string.
 */
export const summarize = (
  requiredHours: number,
  completedMinutes: number,
  dayCount = 0,
): ProgressSummary => {
  const completed = round2(completedMinutes / 60);
  const required = round2(requiredHours);
  const remaining = round2(Math.max(0, required - completed));

  const percent =
    required > 0 ? Math.min(100, Math.round((completed / required) * 100)) : 0;

  return {
    completed,
    required,
    remaining,
    percent,
    isComplete: required > 0 && completed >= required,
    dayCount,
  };
};

/** `291` -> `"291.00"`. Always two decimals so columns align in the PDF. */
export const formatHours = (hours: number): string => round2(hours).toFixed(2);

/** Break a duration into a human phrase, e.g. `60` -> `"1 hr"`, `90` -> `"1 hr 30 min"`. */
export const formatBreak = (breakMinutes: number): string => {
  if (breakMinutes <= 0) return '-';
  const h = Math.floor(breakMinutes / 60);
  const m = breakMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
};
