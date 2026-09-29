/**
 * Date and time formatting. Pure functions, cached `Intl` formatters.
 *
 * Storage format is always ISO `YYYY-MM-DD` and 24-hour `HH:MM`; this module is
 * the only place that converts to display strings.
 */

const longDate = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

const shortDate = new Intl.DateTimeFormat('en-US', {
  day: 'numeric',
  month: 'short',
});

const time12h = new Intl.DateTimeFormat('en-US', {
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
});

const monthOnly = new Intl.DateTimeFormat('en-US', { month: 'short' });

/**
 * Parse `YYYY-MM-DD` as a local date.
 *
 * `new Date('2026-09-28')` is parsed as UTC midnight, which renders as the
 * previous day in any negative UTC offset. Splitting the parts and using
 * `new Date(y, m - 1, d)` keeps the calendar day correct everywhere.
 *
 * **A missing day means the 1st.** `YYYY-MM` is a real key in this app — it is
 * what `substr(date, 1, 7)` returns, so it is how the database names a month —
 * and a `YYYY-MM-DD` function has to accept it. Without the default,
 * `new Date(2026, 8, undefined)` is an Invalid Date, and an Invalid Date does
 * not throw: it propagates as `NaN` into `daysInMonthIso` (row count), into the
 * `from`/`to` bounds of the month query (no rows match), and into the month
 * filter in `buildDayRows` (every record rejected, since `x === NaN` is false).
 * The result is a fully rendered form with an empty table — a blank document
 * that looks like a successful print. Defaulting the day turns that whole class
 * of silent failure into the obvious reading: the first of the month.
 */
export const parseIsoDate = (iso: string): Date => {
  const [y, m, d = 1] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/** `2026-09-28` -> `"28 September 2026"`. */
export const formatDateLong = (iso: string): string => longDate.format(parseIsoDate(iso));

/** `2026-09-28` -> `"Sep"`. For the day-number block on a records row. */
export const formatMonthAbbrev = (iso: string): string => monthOnly.format(parseIsoDate(iso));

/** `2026-09-28` -> `"28"`. For the day-number block on a records row. */
export const formatDayOfMonth = (iso: string): string => String(parseIsoDate(iso).getDate());

/** `2026-09-28` -> `"Sep 28"`. */
export const formatShortDate = (iso: string): string => shortDate.format(parseIsoDate(iso));

/** `2026-09-28` -> `"Mon 28 Sept 2026"`. */
export const formatDateWithWeekday = (iso: string): string => {
  const date = parseIsoDate(iso);
  const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'short' }).format(date);
  return `${weekday} ${formatDateLong(iso)}`;
};

/** `08:00` -> `"8:00 AM"`. */
export const formatTime12h = (time24: string): string => {
  const [h, m] = time24.split(':').map(Number);
  return time12h.format(new Date(2000, 0, 1, h, m));
};

/** `08:00` -> `"8:00 AM – 5:00 PM"`. */
export const formatTimeRange = (timeIn: string, timeOut: string): string =>
  `${formatTime12h(timeIn)} – ${formatTime12h(timeOut)}`;

/**
 * A wall-clock time split into the parts a 12-hour picker shows.
 *
 * `hour` is 1–12 and `meridiem` is separate, because that is the only way a
 * picker can offer a clock face without a 24-hour list. Storage stays 24-hour:
 * these two functions are the entire conversion, and they are inverses.
 */
export interface TimeParts {
  /** 1–12. Never 0 and never 13. */
  hour: number;
  /** 0–59. */
  minute: number;
  meridiem: 'AM' | 'PM';
}

/** Midnight and noon are the two values with no intuitive hour, so they are pinned. */
export const HOUR_LABELS: readonly number[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];

/** Every minute of an hour. A 5-minute step is tempting and wrong here. */
export const MINUTE_LABELS: readonly number[] = Array.from({ length: 60 }, (_, i) => i);

/**
 * `HH:MM` -> the parts a 12-hour picker shows.
 *
 * `00:00` becomes 12:00 AM and `12:00` becomes 12:00 PM, which is the one place
 * an hour arithmetic bug is invisible on the form but obvious on the picker: a
 * midnight shift picking "12 AM" must not turn into noon. Modulo 12 gets both
 * right without a special case, because `0 % 12 === 12` and `12 % 12 === 0`, and
 * the `0 → 12` fixup below then maps that `0` back to `12`.
 */
export const timeToParts = (time24: string): TimeParts => {
  const [h, m] = time24.split(':').map(Number);
  const hour24 = Number.isFinite(h) ? h : 0;
  const minute = Number.isFinite(m) ? m : 0;

  return {
    hour: hour24 % 12 === 0 ? 12 : hour24 % 12,
    minute,
    meridiem: hour24 < 12 ? 'AM' : 'PM',
  };
};

/**
 * The inverse of `timeToParts`. Always returns a zero-padded `HH:MM`.
 *
 * `hour % 12` does all the work, and the meridiem only ever adds twelve. It has
 * to be `% 12` on the raw hour rather than on `hour - 1`: the two agree at 12
 * and disagree everywhere else, and `((hour - 1) % 12) + 12` — the shape this
 * used to have — maps 8 AM to **07:00**. That is not a display artefact; it is
 * the value written to the database, so a student picking 8 AM logged 7 AM and
 * the college verified a number the app had never shown them.
 *
 * Midnight and noon are the pair that decides whether the formula is right:
 * `12 % 12 === 0`, so 12 AM is `00` and 12 PM is `00 + 12 === 12`.
 */
export const partsToTime24 = ({ hour, minute, meridiem }: TimeParts): string => {
  const h = hour % 12 === 0 ? 0 : hour % 12;
  const h24 = meridiem === 'PM' ? h + 12 : h;

  return `${String(h24).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** Today's date as `YYYY-MM-DD` in the device's local timezone. */
export const todayIso = (): string => {
  const now = new Date();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${m}-${d}`;
};

/** Current 24-hour `HH:MM` in the device's local timezone. */
export const nowTime24 = (): string => {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
};

const toIso = (d: Date): string => {
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
};

/**
 * `2026-09-28` moved by `days`, as `YYYY-MM-DD` in local time.
 *
 * Goes through `parseIsoDate` rather than `new Date(iso)`, so the day does not
 * slip backwards in a negative UTC offset. `setDate` handles month and year
 * rollover, so this is also how the month and year boundaries are crossed.
 */
export const shiftIso = (iso: string, days: number): string => {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + days);
  return toIso(d);
};

/** First day of the month containing `iso`, e.g. `2026-09-01`. */
export const startOfMonthIso = (iso: string): string => {
  const d = parseIsoDate(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-01`;
};

/** First day of the year containing `iso`, e.g. `2026-01-01`. */
export const startOfYearIso = (iso: string): string => `${parseIsoDate(iso).getFullYear()}-01-01`;

/**
 * Number of days in the month containing `iso`, e.g. 30 for September, 31 for
 * October.
 *
 * Day 0 of the *following* month is the last day of this one, which is why this
 * uses `getMonth() + 1` and day `0` rather than hardcoding lengths.
 *
 * The TMC daily time record prints **one numbered row per real day**, not a
 * fixed 31, so this is the number of rows a sheet will have and the denominator
 * for "N of M rows filled". An earlier version of that screen hardcoded 31 and
 * told September students to look for a 31st row that was never printed.
 */
export const daysInMonthIso = (iso: string): number => {
  const d = parseIsoDate(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

/** Last day of the month containing `iso`, e.g. `2026-09-30`. */
export const endOfMonthIso = (iso: string): string => {
  const d = parseIsoDate(iso);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${String(daysInMonthIso(iso)).padStart(2, '0')}`;
};

/**
 * First day of the month `months` away from the one containing `iso`.
 *
 * `setMonth` rather than arithmetic on the string, so the year rolls over on
 * its own: `shiftMonthIso('2026-12-01', 1)` is `2027-01-01`. Callers pass a
 * first-of-month (see `startOfMonthIso`), which is why the day-of-month
 * rollover that `setMonth` would otherwise cause for the 29th–31st cannot
 * happen — a month start is never past the 7th.
 */
export const shiftMonthIso = (iso: string, months: number): string => {
  const d = parseIsoDate(iso);
  d.setDate(1);
  d.setMonth(d.getMonth() + months);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${d.getFullYear()}-${m}-01`;
};

/** `2026-09-01` -> `"September 2026"`. The heading on a monthly form. */
export const monthLabel = (iso: string): string =>
  new Intl.DateTimeFormat('en-GB', { month: 'long', year: 'numeric' }).format(parseIsoDate(iso));

/**
 * The days of the month containing `iso`, as a Monday-first grid.
 *
 * Leading `null`s pad the grid so the 1st lands under the right weekday, and
 * the array is deliberately *not* padded out to whole weeks — `CalendarPicker`
 * renders it with `flexWrap`, so a short last row is one line, and padding it
 * with empty cells would add a phantom row's worth of height to every month.
 *
 * Monday-first to match the `en-GB` formatting used everywhere else in the app.
 * `getDay()` is 0 = Sunday, so the +6 shift is what makes Monday column 0.
 */
export const buildMonthCells = (iso: string): (string | null)[] => {
  const monthStart = startOfMonthIso(iso);
  const first = parseIsoDate(monthStart);
  const leading = (first.getDay() + 6) % 7;
  const total = daysInMonthIso(monthStart);

  const year = first.getFullYear();
  const month = String(first.getMonth() + 1).padStart(2, '0');

  return [
    ...Array.from({ length: leading }, () => null),
    ...Array.from({ length: total }, (_, i) => `${year}-${month}-${String(i + 1).padStart(2, '0')}`),
  ];
};
