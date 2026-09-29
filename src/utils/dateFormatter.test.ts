/**
 * The month helpers the TMC form's row count and month stepper depend on.
 *
 * Month arithmetic is where off-by-one bugs hide, and almost all of them only
 * show up in a February or at a year boundary — neither of which anyone tests
 * by hand. → [[PDF Export#Month Selection]]
 */

import {
  HOUR_LABELS,
  MINUTE_LABELS,
  daysInMonthIso,
  endOfMonthIso,
  formatDateLong,
  monthLabel,
  partsToTime24,
  shiftMonthIso,
  startOfMonthIso,
  timeToParts,
  todayIso,
} from '@/utils/dateFormatter';

describe('daysInMonthIso', () => {
  it.each([
    ['2026-01-01', 31, 'January'],
    ['2026-02-01', 28, 'February 2026, not a leap year'],
    ['2028-02-01', 29, 'February 2028, leap'],
    ['2026-04-01', 30, 'April'],
    ['2026-09-30', 30, 'a day at the end of the month, not the first'],
    ['2026-12-31', 31, 'December'],
  ])('%s -> %i (%s)', (iso, expected) => {
    expect(daysInMonthIso(iso)).toBe(expected);
  });

  it('rejects a 1900 non-leap year, which the naive rule gets wrong', () => {
    // Divisible by 100 but not 400, so not a leap year. The `% 4 === 0` check
    // alone would call this 29.
    expect(daysInMonthIso('1900-02-01')).toBe(28);
  });

  it('accepts a 2000 leap year, which the naive rule also gets wrong', () => {
    // Divisible by 400, so a leap year.
    expect(daysInMonthIso('2000-02-01')).toBe(29);
  });
});

describe('endOfMonthIso', () => {
  it.each([
    ['2026-09-01', '2026-09-30'],
    ['2026-09-15', '2026-09-30'],
    ['2026-02-10', '2026-02-28'],
    ['2028-02-10', '2028-02-29'],
    ['2026-12-05', '2026-12-31'],
    ['2026-01-31', '2026-01-31'],
  ])('%s -> %s', (iso, expected) => {
    expect(endOfMonthIso(iso)).toBe(expected);
  });

  it('is always after startOfMonthIso of the same day', () => {
    for (const iso of ['2026-01-01', '2026-02-14', '2028-02-14', '2026-11-30']) {
      expect(endOfMonthIso(iso) > startOfMonthIso(iso)).toBe(true);
    }
  });
});

/**
 * `YYYY-MM` is a real key in this app, not a malformed date.
 *
 * `listMonthsWithRecords` groups with `substr(date, 1, 7)`, so the database hands
 * every month over in this shape. These tests exist because the alternative was
 * silent: an un-defaulted `d` made `new Date(y, m - 1, undefined)`, an Invalid
 * Date does not throw, and `NaN` then spread into the row count, the query
 * bounds and the month filter in `buildDayRows`. The visible result was a fully
 * rendered TMC form with an empty table — indistinguishable from a correct blank
 * form, which is the exact failure `TmcMonthEmptyError` exists to prevent.
 */
describe('a YYYY-MM key means the first of that month', () => {
  it.each([
    ['daysInMonthIso', () => daysInMonthIso('2026-09'), 30],
    ['daysInMonthIso (leap February)', () => daysInMonthIso('2028-02'), 29],
    ['startOfMonthIso', () => startOfMonthIso('2026-09'), '2026-09-01'],
    ['startOfMonthIso (December)', () => startOfMonthIso('2026-12'), '2026-12-01'],
    ['endOfMonthIso', () => endOfMonthIso('2026-09'), '2026-09-30'],
    ['endOfMonthIso (January)', () => endOfMonthIso('2026-01'), '2026-01-31'],
    ['monthLabel', () => monthLabel('2026-09'), 'September 2026'],
  ])('%s accepts a short key', (_name, call, expected) => {
    expect(call()).toBe(expected);
  });

  it('agrees with the same month given as YYYY-MM-DD', () => {
    for (const short of ['2026-01', '2026-02', '2028-02', '2026-09', '2026-12']) {
      const long = `${short}-01`;
      expect(daysInMonthIso(short)).toBe(daysInMonthIso(long));
      expect(startOfMonthIso(short)).toBe(startOfMonthIso(long));
      expect(endOfMonthIso(short)).toBe(endOfMonthIso(long));
      expect(monthLabel(short)).toBe(monthLabel(long));
    }
  });

  it('is a fixed point: normalising a short key does not change it', () => {
    expect(startOfMonthIso('2026-09')).toBe('2026-09-01');
    expect(startOfMonthIso(startOfMonthIso('2026-09'))).toBe('2026-09-01');
  });

  /**
   * The two shapes are not interchangeable in a string comparison, and the
   * difference is a prefix, which is exactly the case that slips through a
   * range check. Every guard on the export screen is a `>=`/`<=` on these
   * strings, and this is the direction that admits the wrong shape.
   */
  it('sorts before its own long form, so a range check admits it', () => {
    expect('2026-09' <= '2026-09-01').toBe(true);
    expect('2026-09' >= '2026-09-01').toBe(false);
  });
});

describe('shiftMonthIso', () => {
  it('steps forwards and backwards one month', () => {
    expect(shiftMonthIso('2026-09-01', 1)).toBe('2026-10-01');
    expect(shiftMonthIso('2026-09-01', -1)).toBe('2026-08-01');
  });

  it('rolls the year over in both directions', () => {
    expect(shiftMonthIso('2026-12-01', 1)).toBe('2027-01-01');
    expect(shiftMonthIso('2026-01-01', -1)).toBe('2025-12-01');
  });

  it('accepts a multi-month step', () => {
    expect(shiftMonthIso('2026-09-01', 4)).toBe('2027-01-01');
    expect(shiftMonthIso('2026-09-01', -9)).toBe('2025-12-01');
  });

  it('normalises a mid-month input to the first of the target month', () => {
    // The stepper only ever stores a first-of-month, but a leap-year day-31
    // input is the one case where `setMonth` would silently overflow, and
    // normalising first means it cannot.
    expect(shiftMonthIso('2026-01-31', 1)).toBe('2026-02-01');
    expect(shiftMonthIso('2026-03-31', -1)).toBe('2026-02-01');
  });

  it('lands on day 1 whatever the input day was', () => {
    for (let day = 1; day <= 28; day += 1) {
      expect(shiftMonthIso(`2026-09-${String(day).padStart(2, '0')}`, 1)).toBe('2026-10-01');
    }
  });

  it('is its own inverse across a year boundary', () => {
    const fwd = shiftMonthIso('2026-12-01', 1);
    expect(shiftMonthIso(fwd, -1)).toBe('2026-12-01');
  });

  it('returns the same month for a zero step', () => {
    expect(shiftMonthIso('2026-09-01', 0)).toBe('2026-09-01');
  });
});

describe('monthLabel', () => {
  it('formats as month name and year', () => {
    expect(monthLabel('2026-09-01')).toBe('September 2026');
    expect(monthLabel('2026-01-15')).toBe('January 2026');
    expect(monthLabel('2026-12-31')).toBe('December 2026');
  });

  it('is the same for every day of a month', () => {
    const labels = ['2026-09-01', '2026-09-15', '2026-09-30'].map(monthLabel);
    expect(new Set(labels).size).toBe(1);
  });
});

describe('formatDateLong', () => {
  it('is used for the PERIOD cell, so it must not drift', () => {
    expect(formatDateLong('2026-06-01')).toMatch(/2026/);
  });
});

describe('todayIso', () => {
  it('is a well-formed ISO date', () => {
    expect(todayIso()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('falls inside the current month', () => {
    const today = todayIso();
    expect(today >= startOfMonthIso(today)).toBe(true);
    expect(today <= endOfMonthIso(today)).toBe(true);
  });
});

describe('HOUR_LABELS / MINUTE_LABELS — what the picker can offer', () => {
  it('offers 1 to 12, never 0 and never 13', () => {
    // A clock face has no hour 0 and no hour 13, and a list containing either is
    // a picker the student can put the app into an invalid state from.
    expect(HOUR_LABELS).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it('offers every minute of the hour, one at a time', () => {
    // Deliberately not a 5-minute step. A supervisor's sign-off is not
    // approximate, and a picker that cannot produce 08:07 forces the student onto
    // another screen to record what they actually worked.
    expect(MINUTE_LABELS).toHaveLength(60);
    expect(MINUTE_LABELS[0]).toBe(0);
    expect(MINUTE_LABELS[59]).toBe(59);
    expect(MINUTE_LABELS.every((m, i) => m === i)).toBe(true);
  });
});

describe('timeToParts / partsToTime24 — the picker’s storage conversion', () => {
  it.each([
    ['00:00', { hour: 12, minute: 0, meridiem: 'AM' }, 'midnight'],
    ['00:07', { hour: 12, minute: 7, meridiem: 'AM' }, 'just after midnight'],
    ['09:30', { hour: 9, minute: 30, meridiem: 'AM' }, 'a morning'],
    ['11:59', { hour: 11, minute: 59, meridiem: 'AM' }, 'the last minute before noon'],
    ['12:00', { hour: 12, minute: 0, meridiem: 'PM' }, 'noon'],
    ['13:05', { hour: 1, minute: 5, meridiem: 'PM' }, 'an early afternoon'],
    ['17:45', { hour: 5, minute: 45, meridiem: 'PM' }, 'a late afternoon'],
    ['23:59', { hour: 11, minute: 59, meridiem: 'PM' }, 'the last minute of the day'],
  ])('%s is %o (%s) on a 12-hour clock', (time24, parts) => {
    expect(timeToParts(time24)).toEqual(parts);
  });

  it.each([
    ['00:00', '12 AM'],
    ['12:00', '12 PM'],
    ['23:59', '11:59 PM'],
    ['08:00', '8:00 AM'],
    ['13:00', '1:00 PM'],
  ])('round-trips %s without losing the midnight/noon distinction', (time24) => {
    // The bug these two functions exist to prevent: `00:00` becoming `12:00`, so
    // a midnight shift silently turning into a lunch break.
    expect(partsToTime24(timeToParts(time24))).toBe(time24);
  });

  it('round-trips every minute of the day', () => {
    for (let h = 0; h < 24; h++) {
      for (const m of [0, 1, 30, 59]) {
        const time24 = `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        expect(partsToTime24(timeToParts(time24))).toBe(time24);
      }
    }
  });

  it('is the only place the two representations meet', () => {
    // Storage is 24-hour everywhere else — the database, `computeSessionMinutes`,
    // the printed form. If these ever drifted, the value the student picked would
    // not be the value that got stored.
    for (let h = 0; h < 24; h++) {
      const time24 = `${String(h).padStart(2, '0')}:00`;
      expect(timeToParts(partsToTime24(timeToParts(time24)))).toEqual(timeToParts(time24));
    }
  });

  it('zero-pads the hour it returns', () => {
    // Storage is `HH:MM`. An unpadded `8:00` fails `TIME_PATTERN` in the
    // calculator and is rejected as an invalid time the student did not type.
    expect(partsToTime24({ hour: 8, minute: 0, meridiem: 'AM' })).toBe('08:00');
    expect(partsToTime24({ hour: 12, minute: 5, meridiem: 'PM' })).toBe('12:05');
  });

  it('falls back to midnight for input it cannot parse rather than throwing', () => {
    // The picker seeds its draft from this, and a thrown error inside a render
    // would take the whole form down over a value the student can change.
    expect(timeToParts('nonsense')).toEqual({ hour: 12, minute: 0, meridiem: 'AM' });
    expect(timeToParts('')).toEqual({ hour: 12, minute: 0, meridiem: 'AM' });
  });
});
