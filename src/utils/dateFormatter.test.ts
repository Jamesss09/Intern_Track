/**
 * The month helpers the TMC form's row count and month stepper depend on.
 *
 * Month arithmetic is where off-by-one bugs hide, and almost all of them only
 * show up in a February or at a year boundary — neither of which anyone tests
 * by hand. → [[PDF Export#Month Selection]]
 */

import {
  daysInMonthIso,
  endOfMonthIso,
  formatDateLong,
  monthLabel,
  shiftMonthIso,
  startOfMonthIso,
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
