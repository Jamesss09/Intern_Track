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
 */
export const parseIsoDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
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
 * uses `getMonth() + 1` and day `0` rather than hardcoding lengths — the TMC
 * daily time record always prints 31 numbered rows, so the template needs to
 * know which of them belong to a real day.
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
