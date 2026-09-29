/**
 * Rounding, and the invariant the TMC form's `TOTAL HRS.` rests on.
 *
 * The TMC template sums each record's `total_hours` **after** rounding it, so
 * the printed total equals the sum of the per-record figures the student
 * already saw on their record card. If this file ever stops rounding the way
 * the card does, that agreement silently breaks and the college verifies a
 * number the app never showed. → [[PDF Export#Reuse the same calculations]]
 */

import {
  computeTotalMinutes,
  minutesToHours,
  minutesToTime,
  round2,
  timeToMinutes,
} from '@/utils/timeCalculator';

describe('round2', () => {
  it.each([
    [0, 0],
    [8, 8],
    [7.5, 7.5],
    [7.505, 7.51],
    [7.504, 7.5],
    [0.1 + 0.2, 0.3],
    // Pinned deliberately. `1.005` is stored as 1.00499999999999989..., so
    // `x * 100` lands on 100.49999 and rounds down to 1. This is the known
    // limit of `Math.round(x * 100) / 100`, not a bug, and the reason the
    // template rounds the *sum* again rather than trusting the parts.
    [1.005, 1],
  ])('round2(%p) is %p, not the raw float', (input, expected) => {
    expect(round2(input)).toBe(expected);
    // The whole point: the rounded value is what every downstream sum sees.
    expect(Object.is(round2(input), expected)).toBe(true);
  });

  it('is idempotent', () => {
    for (const v of [0.1, 0.2, 1.005, 8.125, 33.3333]) {
      expect(round2(round2(v))).toBe(round2(v));
    }
  });

  it('recovers an exact total only because the sum is rounded too', () => {
    // 0.1 x 10 accumulates to 0.9999999999999999. Rounding each *part* does not
    // help on its own — it is the accumulator that drifts. This is exactly the
    // expression `buildDayRows` uses, and the reason for the outer `round2`:
    //
    //   round2(records.reduce((sum, r) => sum + round2(r.total_hours), 0))
    //
    // Removing the outer call would print 0.9999999999999999 on a signed form.
    const parts = Array.from({ length: 10 }, () => 0.1);
    const naive = parts.reduce((a, b) => a + b, 0);
    const roundedPartsOnly = parts.reduce((a, b) => a + round2(b), 0);
    const asTheTemplateComputesIt = round2(roundedPartsOnly);

    expect(naive).not.toBe(1);
    expect(roundedPartsOnly).not.toBe(1);
    expect(asTheTemplateComputesIt).toBe(1);
  });
});

describe('timeToMinutes / minutesToTime', () => {
  it('round-trips a 24-hour time', () => {
    for (const t of ['00:00', '08:00', '12:30', '17:00', '23:59']) {
      expect(minutesToTime(timeToMinutes(t)!)).toBe(t);
    }
  });

  it.each(['24:00', '8:00', '08:60', 'ab:cd', '', '99:99'])('rejects %o', (bad) => {
    expect(timeToMinutes(bad)).toBeNull();
  });
});

describe('computeTotalMinutes', () => {
  it('subtracts the break from the span', () => {
    expect(computeTotalMinutes('08:00', '17:00', 60)).toBe(480);
  });

  it('handles a night shift that crosses midnight', () => {
    // The reason `timeToMinutes` is not just a subtraction: 22:00 to 06:00 is
    // negative on a naive difference.
    expect(computeTotalMinutes('22:00', '06:00', 30)).toBe(450);
  });

  it('keeps `total_hours` equal to the minutes it came from', () => {
    // The two are stored separately on purpose; this is the relationship the
    // printed total relies on.
    const minutes = computeTotalMinutes('08:00', '17:00', 60);
    expect(minutesToHours(minutes)).toBe(round2(minutes / 60));
  });
});
