/**
 * Rounding, the four attendance fields, and the invariant the TMC form's
 * `TOTAL HRS.` rests on.
 *
 * The TMC template sums each record's `total_hours` **after** rounding it, so
 * the printed total equals the sum of the per-record figures the student
 * already saw on their record card. If this file ever stops rounding the way
 * the card does, that agreement silently breaks and the college verifies a
 * number the app never showed. → [[PDF Export#Reuse the same calculations]]
 */

import {
  computeDayMinutes,
  computeSessionMinutes,
  computeTotalMinutes,
  daySpan,
  emptySessions,
  hasNoSessions,
  minutesToHours,
  minutesToTime,
  round2,
  timeToMinutes,
  TimeCalculationError,
  type DaySessions,
} from '@/utils/timeCalculator';

const day = (over: Partial<DaySessions> = {}): DaySessions => ({ ...emptySessions(), ...over });

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

describe('emptySessions / hasNoSessions', () => {
  it('starts blank in both halves', () => {
    expect(hasNoSessions(emptySessions())).toBe(true);
  });

  it.each([
    ['am_in', day({ am_in: '08:00' })],
    ['am_out', day({ am_out: '12:00' })],
    ['pm_in', day({ pm_in: '13:00' })],
    ['pm_out', day({ pm_out: '17:00' })],
  ])('a single %s is enough to say the day was worked', (_field, sessions) => {
    // Only the *pair* is invalid. A half-filled session is a mistake, but it is
    // still evidence that the student meant to work, and silently calling the
    // whole day empty would swap one error for another.
    expect(hasNoSessions(sessions)).toBe(false);
  });

  it('does not treat a whitespace string as a session', () => {
    expect(hasNoSessions(day({ am_in: '', pm_out: '' }))).toBe(true);
  });
});

describe('computeSessionMinutes', () => {
  it.each([
    ['08:00', '12:00', 240],
    ['13:00', '17:00', 240],
    ['08:07', '08:59', 52],
    ['11:59', '12:00', 1],
  ])('%s -> %s is %i minutes', (from, to, expected) => {
    expect(computeSessionMinutes(from, to, 'AM')).toBe(expected);
  });

  it('treats a wholly absent session as zero minutes', () => {
    // Absent, not invalid: an afternoon-only shift has no morning, and zero is
    // the contribution that says so without inventing one.
    expect(computeSessionMinutes(null, null, 'AM')).toBe(0);
    expect(computeSessionMinutes(null, null, 'PM')).toBe(0);
  });

  it('wraps a session that crosses midnight', () => {
    // 20:00 to 04:00 is 480 minutes, not -960. A night shift is a real shift and
    // a negative one would be rejected as a zero-length day.
    expect(computeSessionMinutes('20:00', '04:00', 'PM')).toBe(480);
  });

  it.each([
    ['a time in with no time out', '08:00', null],
    ['a time out with no time in', null, '12:00'],
  ])('rejects %s', (_label, from, to) => {
    expect(() => computeSessionMinutes(from, to, 'AM')).toThrow(TimeCalculationError);
  });

  it('names the session in the rejection, so the form can show it under the right pair', () => {
    // The add-record schema routes the message to `am_out` or `pm_out` by this
    // exact prefix. Changing the wording silently moves the error to the break
    // field.
    expect(() => computeSessionMinutes('13:00', null, 'PM')).toThrow(/^PM time in and time out/);
    expect(() => computeSessionMinutes('08:00', null, 'AM')).toThrow(/^AM time in and time out/);
  });

  it('rejects a zero-length session', () => {
    // Either a typo or a day that was not worked; both must not reach the
    // database as a real session.
    expect(() => computeSessionMinutes('09:00', '09:00', 'AM')).toThrow(/must not be the same/);
  });

  it.each(['24:00', '8:00', '08:60', 'nonsense'])('rejects the malformed time %o', (bad) => {
    expect(() => computeSessionMinutes(bad, '12:00', 'AM')).toThrow(TimeCalculationError);
    expect(() => computeSessionMinutes('08:00', bad, 'AM')).toThrow(TimeCalculationError);
  });
});

describe('computeDayMinutes', () => {
  it('adds both sessions and takes the break once', () => {
    // The point of the whole split: 4h + 4h - a 1h lunch is 7 hours of work, and
    // the break is deducted from the *day* rather than from each half. Charging
    // it twice is what would have turned every split day into an 8-hour day.
    const sessions = day({ am_in: '08:00', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' });
    expect(computeDayMinutes(sessions, 60)).toBe(420);
  });

  it('is unaffected by where the break is charged', () => {
    // Resuming at 12:30 with no afternoon session and resuming at 13:00 with one
    // describe the same four-hour morning and the same lunch. Both come to 240.
    // A rule that charged the break per session would make the second of the two
    // come out an hour short.
    const morningOnly = day({ am_in: '08:00', am_out: '12:30' });
    const split = day({ am_in: '08:00', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' });
    expect(computeDayMinutes(morningOnly, 30)).toBe(240);
    expect(computeDayMinutes(split, 60)).toBe(420);
  });

  it.each([
    ['AM only', day({ am_in: '08:00', am_out: '12:00' })],
    ['PM only', day({ pm_in: '13:00', pm_out: '17:00' })],
  ])('works from the %s session alone', (_label, sessions) => {
    expect(computeDayMinutes(sessions, 0)).toBe(240);
  });

  it('allows an overnight PM session to stand on its own', () => {
    expect(computeDayMinutes(day({ pm_in: '20:00', pm_out: '04:00' }), 30)).toBe(450);
  });

  it('rejects a day with neither session', () => {
    expect(() => computeDayMinutes(emptySessions(), 0)).toThrow(/at least one session/);
  });

  it('rejects a break longer than the time worked', () => {
    const sessions = day({ am_in: '08:00', am_out: '12:00' });
    expect(() => computeDayMinutes(sessions, 241)).toThrow(/cannot exceed/);
  });

  it('rejects a negative break', () => {
    const sessions = day({ am_in: '08:00', am_out: '12:00' });
    expect(() => computeDayMinutes(sessions, -30)).toThrow(/zero or more/);
  });

  it('rejects a day that the break reduces to nothing', () => {
    // Silently storing 0 hours would show a "worked" day on the TMC form with no
    // hours against it.
    const sessions = day({ am_in: '08:00', am_out: '09:00' });
    expect(() => computeDayMinutes(sessions, 60)).toThrow(/greater than zero/);
  });

  it('propagates a half-filled session rather than scoring it zero', () => {
    expect(() => computeDayMinutes(day({ am_in: '08:00' }), 0)).toThrow(TimeCalculationError);
  });
});

describe('daySpan', () => {
  it('reports the earliest in and the furthest out of the day', () => {
    const sessions = day({ am_in: '08:00', am_out: '12:00', pm_in: '13:00', pm_out: '17:00' });
    expect(daySpan(sessions)).toEqual({ time_in: '08:00', time_out: '17:00' });
  });

  it('returns nulls for a day with no sessions at all', () => {
    // The signal that the day is not yet loggable; `resolveDurations` turns it
    // into a message rather than writing the literal "null" into the row.
    expect(daySpan(emptySessions())).toEqual({ time_in: null, time_out: null });
  });

  it('keeps the later clock value from becoming the day’s start', () => {
    // 13:00 is numerically larger than 08:00 but is not when the day began.
    const sessions = day({ pm_in: '13:00', pm_out: '17:00', am_in: '08:00', am_out: '12:00' });
    expect(daySpan(sessions).time_in).toBe('08:00');
  });

  it('measures "furthest out" as elapsed time, not clock order', () => {
    // An overnight session's 04:00 is the smaller number and the *later* end.
    // Comparing raw clock values would truncate the day at midnight and hand the
    // form a `time_out` before its `time_in`.
    expect(daySpan(day({ pm_in: '20:00', pm_out: '04:00' }))).toEqual({
      time_in: '20:00',
      time_out: '04:00',
    });
  });

  it('prefers AM on a tie, so the columns read in the order the form prints them', () => {
    expect(daySpan(day({ am_in: '09:00', am_out: '17:00', pm_in: '09:00', pm_out: '17:00' }))).toEqual({
      time_in: '09:00',
      time_out: '17:00',
    });
  });

  it('ignores an absent half entirely', () => {
    expect(daySpan(day({ pm_in: '13:00', pm_out: '17:00' }))).toEqual({
      time_in: '13:00',
      time_out: '17:00',
    });
  });

  it('propagates a half-filled pair rather than returning a partial span', () => {
    // A `null` out here would hide the mistake one layer up, where the caller
    // would read it as "the day is simply not finished yet".
    expect(() => daySpan(day({ am_in: '08:00', am_out: null }))).toThrow(TimeCalculationError);
  });

  it('agrees with the session minutes for a straight shift', () => {
    const sessions = day({ am_in: '08:00', am_out: '17:00' });
    const span = daySpan(sessions);
    expect(computeSessionMinutes(span.time_in, span.time_out, 'AM')).toBe(540);
  });
});
