/**
 * The current-day rule: a time record may only be **written** for today.
 *
 * This is deliberately the only place that knows the rule. The form schema, the
 * calendar and the service all call in here, so a screen can never be the sole
 * enforcement point — the service is the authority, and it does not trust the
 * screen (see `assertRecordableDate`).
 *
 * ## Why the comparison is string equality, not `Date` arithmetic
 *
 * Both sides are validated `YYYY-MM-DD` before they reach these functions, and
 * that format sorts correctly as a string: `2026-09-30` < `2026-10-01` because
 * it is compared digit by digit in year-month-day order. So no `Date` is
 * constructed, no timezone is involved, and the whole rule is immune to the
 * class of bug that broke the rate limiter — where a stored "now" was parsed as
 * local time and shifted the result by the UTC offset. See
 * `Security.md` -> "The timestamp trap".
 *
 * `todayIso()` builds its result from the *local* getters (`getFullYear`,
 * `getMonth`, `getDate`) precisely so that "today" means the user's today. A
 * UTC-derived today would be yesterday for a user east of Greenwich during their
 * working hours.
 */

import { todayIso } from '@/utils/dateFormatter';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `YYYY-MM-DD` that names a day which actually exists.
 *
 * The round-trip through `Date` is the only way to reject `2026-02-30`, which
 * `Date` would otherwise silently roll forward to 2 March.
 */
export const isRealIsoDate = (iso: string): boolean => {
  if (!ISO_DATE.test(iso)) return false;
  const [y, m, d] = iso.split('-').map(Number);
  const probe = new Date(y, m - 1, d);
  return probe.getFullYear() === y && probe.getMonth() === m - 1 && probe.getDate() === d;
};

/** Is this ISO date the user's current local day? */
export const isToday = (iso: string): boolean => isRealIsoDate(iso) && iso === todayIso();

/**
 * May a record be written with this date?
 *
 * `existingDate` is the date the record **already** has, and is supplied only
 * when updating. It is what separates "adding attendance" from "correcting a
 * typo":
 *
 *  - creating — the date must be today. Nothing else is reachable.
 *  - updating — the date must be today *or unchanged from what is stored*.
 *
 * The second clause is what makes this survivable as a rule. A strict
 * today-only check on updates would mean a mistyped `08:00` on a day logged last
 * week could never be corrected, and the only remaining "fix" would be deleting
 * the record and its hours. It cannot be used to fabricate anything, because it
 * cannot move a record to a day it was not already on — so it grants no new
 * ability to back-date, it only refuses to lock data that is already written.
 */
export const isRecordableDate = (iso: string, existingDate?: string | null): boolean => {
  if (!isRealIsoDate(iso)) return false;
  if (isToday(iso)) return true;
  return existingDate != null && iso === existingDate;
};

/**
 * The sentence shown under the field and carried by the thrown error.
 *
 * A future date gets its own wording: "only today" is a true but unhelpful
 * answer to someone who has reached past tomorrow, and the distinct message
 * tells them the day simply has not happened yet rather than that they did
 * something wrong.
 */
export const restrictionMessage = (iso: string): string => {
  const today = todayIso();
  if (isRealIsoDate(iso) && iso > today) return 'That date has not happened yet.';
  return "Only today's date can be recorded.";
};

/** Shown on the date field and in the calendar sheet. */
export const RESTRICTION_HINT = 'You can only add hours for the current day.';

export class DateRestrictionError extends Error {
  readonly code = 'DATE_RESTRICTED' as const;

  constructor(date: string) {
    super(restrictionMessage(date));
    this.name = 'DateRestrictionError';
  }
}

/**
 * The authoritative check. Called by the service on every write.
 *
 * Throws rather than returning a boolean so that a caller cannot forget to act
 * on the result — `if (!isRecordableDate(d)) return;` reads as handled whether
 * or not the author remembered what "handled" meant.
 */
export const assertRecordableDate = (iso: string, existingDate?: string | null): void => {
  if (isRecordableDate(iso, existingDate)) return;
  throw new DateRestrictionError(iso);
};

/**
 * ## Why this is not enforced by a SQLite `CHECK` constraint
 *
 * The obvious "one more layer" is `CHECK (date = date('now'))` on
 * `time_records`. Do not add it.
 *
 * `date('now')` in SQLite is **UTC**. This module's "today" is the user's
 * **local** day, and for a user east of Greenwich those two disagree for part of
 * every day. In UTC+8 the window runs from 00:00 to 08:00 local: a student
 * logging their morning hits `date = '2026-09-28'` against
 * `date('now') = '2026-09-29'`, and the insert is rejected by the database for
 * eight hours a day — on the feature meant to make their life easier.
 *
 * That is the same UTC-vs-local failure as the rate limiter's timestamp trap
 * (`Security.md` -> "The timestamp trap"), where it silently disabled the
 * feature rather than blocking it. A constraint that is wrong for half the
 * planet is worse than no constraint, so the rule lives in one place in
 * TypeScript, and this comment is here to stop it being re-added.
 *
 * What that costs: a caller reaching `queries.insertTimeRecord` directly would
 * not be checked. Nothing does — the only writer in the app is
 * `timeRecordService` — and if that changes, the fix is to route the call
 * through the service, not to compare against UTC here.
 */
