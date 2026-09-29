/**
 * The current-day rule and the calendar grid it drives.
 *
 * Both are pure date logic, which is the only kind of thing this suite covers
 * (`jest.config.js` -> `testEnvironment: 'node'`). The rule is enforced in three
 * places — the calendar, the form schema and the service — and all three call
 * into `dateRestriction`, so this file is what makes the three provably agree
 * rather than three copies of the same idea.
 *
 * Dates are built relative to `todayIso()` rather than hardcoded, because the
 * rule is defined in terms of *now*. Hardcoding `2026-09-29` would leave the
 * suite passing in 2027 while asserting something that is no longer true.
 */

import {
  DateRestrictionError,
  RESTRICTION_HINT,
  assertRecordableDate,
  isRealIsoDate,
  isRecordableDate,
  isToday,
  restrictionMessage,
} from '@/utils/dateRestriction';
import { buildMonthCells, daysInMonthIso, endOfMonthIso, parseIsoDate, startOfMonthIso, todayIso } from '@/utils/dateFormatter';

const TODAY = todayIso();
const shift = (days: number) => buildIso(TODAY, days);

/** Local-date arithmetic, mirroring what `dateFormatter.shiftIso` does. */
function buildIso(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const probe = new Date(y, m - 1, d + days);
  return `${probe.getFullYear()}-${String(probe.getMonth() + 1).padStart(2, '0')}-${String(probe.getDate()).padStart(2, '0')}`;
}

const YESTERDAY = shift(-1);
const TOMORROW = shift(1);
const LAST_YEAR = shift(-400);

describe('isRealIsoDate', () => {
  // Every row carries a third element even though the title and the callback
  // only use two. `it.each` types the table as one tuple type, so a single
  // 2-tuple row makes the whole table `[string, boolean] | [string, boolean,
  // string]`, which no two-parameter callback satisfies. Jest itself is happy
  // either way — this is purely a TypeScript complaint.
  it.each([
    ['2026-02-28', true, 'ordinary February'],
    ['2028-02-29', true, 'leap year'],
    ['2027-02-29', false, 'not a leap year'],
    // `new Date(2026, 1, 30)` rolls forward to 2 March, so a format check alone
    // would accept a date that does not exist.
    ['2026-02-30', false, 'would silently roll into March'],
    ['2026-04-31', false, 'April has 30 days'],
    ['2026-13-01', false, 'month 13'],
    ['2026-00-10', false, 'month 0'],
    ['2026-09-00', false, 'day 0'],
    ['2026-9-1', false, 'not zero-padded'],
    ['26-09-01', false, 'two-digit year'],
    ['', false, 'empty'],
    ['not-a-date', false, 'free text'],
  ])('%s -> %s', (iso, expected, _label) => {
    expect(isRealIsoDate(iso as string)).toBe(expected);
  });
});

describe('isToday', () => {
  it('accepts today', () => {
    expect(isToday(TODAY)).toBe(true);
  });

  it.each([
    ['yesterday', YESTERDAY],
    ['tomorrow', TOMORROW],
  ])('rejects %s', (_label, iso) => {
    expect(isToday(iso)).toBe(false);
  });

  it('rejects a malformed date rather than throwing', () => {
    expect(isToday('nonsense')).toBe(false);
  });
});

describe('isRecordableDate - creating a new record', () => {
  it('allows today', () => {
    expect(isRecordableDate(TODAY)).toBe(true);
  });

  it.each([
    ['yesterday', YESTERDAY],
    ['tomorrow', TOMORROW],
    ['last year', LAST_YEAR],
  ])('refuses %s', (_label, iso) => {
    expect(isRecordableDate(iso)).toBe(false);
  });

  it('refuses a well-formed but impossible date', () => {
    expect(isRecordableDate('2026-02-30')).toBe(false);
  });

  /**
   * The bypass this rule exists to stop: writing a fresh row dated in the past.
   */
  it('refuses a brand-new record dated yesterday', () => {
    expect(isRecordableDate(YESTERDAY)).toBe(false);
  });
});

describe('isRecordableDate - updating an existing record', () => {
  /**
   * The edit exemption is what stops the rule from becoming data loss: a typo in
   * a day logged last week has to stay correctable. It grants no new ability to
   * back-date, because the date cannot be moved off the one already stored.
   */
  it('allows keeping the date the record already has', () => {
    expect(isRecordableDate(LAST_YEAR, LAST_YEAR)).toBe(true);
    expect(isRecordableDate(YESTERDAY, YESTERDAY)).toBe(true);
  });

  it('allows writing today regardless of what is stored', () => {
    expect(isRecordableDate(TODAY, LAST_YEAR)).toBe(true);
  });

  it.each([
    ['another past day', YESTERDAY, LAST_YEAR],
    ['the future', TOMORROW, YESTERDAY],
  ])('refuses moving to %s', (_label, target, stored) => {
    expect(isRecordableDate(target, stored)).toBe(false);
  });

  it('does not treat a null existing date as permission to back-date', () => {
    expect(isRecordableDate(YESTERDAY, null)).toBe(false);
  });
});

describe('assertRecordableDate', () => {
  it('does not throw for a permitted date', () => {
    expect(() => assertRecordableDate(TODAY)).not.toThrow();
  });

  it('does not throw for a permitted edit', () => {
    expect(() => assertRecordableDate(LAST_YEAR, LAST_YEAR)).not.toThrow();
  });

  it('throws DateRestrictionError carrying a code', () => {
    expect(() => assertRecordableDate(YESTERDAY)).toThrow(DateRestrictionError);
    try {
      assertRecordableDate(YESTERDAY);
    } catch (error) {
      expect((error as DateRestrictionError).code).toBe('DATE_RESTRICTED');
    }
  });
});

describe('messages', () => {
  it('tells a future date it has not happened yet', () => {
    expect(restrictionMessage(TOMORROW)).toBe('That date has not happened yet.');
  });

  it('tells a past date only today is allowed', () => {
    expect(restrictionMessage(YESTERDAY)).toBe("Only today's date can be recorded.");
  });

  it('gives a future date a different message from a past one', () => {
    // Same rule, but "only today" is a confusing answer to someone who typed a
    // date that has not occurred.
    expect(restrictionMessage(TOMORROW)).not.toBe(restrictionMessage(YESTERDAY));
  });

  it('exposes a non-empty hint for the field and the sheet', () => {
    expect(RESTRICTION_HINT.length).toBeGreaterThan(0);
  });
});

describe('buildMonthCells', () => {
  const cells = buildMonthCells(TODAY);
  const days = cells.filter((c): c is string => c !== null);

  it('contains every day of the month exactly once', () => {
    expect(days).toHaveLength(daysInMonthIso(TODAY));
    expect(new Set(days).size).toBe(days.length);
  });

  it('runs from the 1st to the last day of the month', () => {
    expect(days[0]).toBe(startOfMonthIso(TODAY));
    expect(days[days.length - 1]).toBe(endOfMonthIso(TODAY));
  });

  it('emits only nulls or real ISO dates', () => {
    expect(cells.every((c) => c === null || isRealIsoDate(c))).toBe(true);
  });

  it('pads the front so the 1st lands under the right Monday-first column', () => {
    const leading = cells.indexOf(days[0]);
    // `parseIsoDate`, not `new Date(iso)`: the latter is parsed as UTC midnight
    // and so reports the previous weekday in any negative UTC offset, which
    // would make this assertion pass in Manila and fail in New York.
    const expected = (parseIsoDate(days[0]).getDay() + 6) % 7;
    expect(leading).toBe(expected);
    expect(cells.slice(0, leading).every((c) => c === null)).toBe(true);
  });

  it('never bleeds into the neighbouring month', () => {
    const prefix = TODAY.slice(0, 7);
    expect(days.every((d) => d.startsWith(prefix))).toBe(true);
  });

  it.each([
    ['2026-02-01', 6, 28, 'a 1st falling on a Sunday - the worst case'],
    ['2026-06-01', 0, 30, 'a 1st falling on a Monday'],
    ['2028-02-01', 1, 29, 'leap February starting on a Tuesday'],
  ])('%s -> %i leading nulls, %i days (%s)', (iso, leading, total, _label) => {
    const built = buildMonthCells(iso as string);
    expect(built.slice(0, leading as number).every((c) => c === null)).toBe(true);
    expect(built.filter(Boolean)).toHaveLength(total as number);
  });

  it('leaves exactly one selectable day, and it is today', () => {
    // The property the whole component rests on: a month of days, one of which
    // is pressable.
    const selectable = days.filter((d) => isRecordableDate(d));
    expect(selectable).toEqual([TODAY]);
  });
});
