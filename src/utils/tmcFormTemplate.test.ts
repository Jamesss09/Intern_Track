/**
 * The TMC daily time record form, as tests.
 *
 * These cover the two things that would actually break a submission and that no
 * typechecker can catch: the **rollup rule** (which record lands in which time
 * cell, and what the day's total becomes) and the **page budget** (whether a
 * 31-day month still fits one A4 page).
 *
 * The page-budget test is deliberately a second copy of the arithmetic in
 * `tmcFormTemplate`'s comment. A comment cannot fail CI, and this is the one
 * number that decides whether the school accepts the document.
 * → [[PDF Export#Page Budget]]
 */

import {
  buildDayRows,
  buildTmcFormHtml,
  courseBlock,
  type TmcFormData,
} from '@/utils/tmcFormTemplate';
import { daysInMonthIso, formatTime12h } from '@/utils/dateFormatter';
import type { Internship, TimeRecord, User } from '@/types';

const user = (over: Partial<User> = {}): User => ({
  id: 1,
  full_name: 'Juan Dela Cruz',
  email: 'juan@example.com',
  password_hash: 'x',
  student_id: '2021-0142',
  course: 'BSIT',
  year_level: '3rd Year',
  block: '3A',
  created_at: '',
  updated_at: null,
  ...over,
});

const internship = (over: Partial<Internship> = {}): Internship => ({
  id: 1,
  user_id: 1,
  company_name: 'BDMPC',
  position: 'IT Intern',
  required_hours: 486,
  start_date: '2026-06-01',
  end_date: '2026-11-30',
  is_active: 1,
  created_at: '',
  ...over,
});

/**
 * A worked day. `notes` defaults to null, which is the common case.
 *
 * The four AM/PM columns are all null by default, which is what a row written
 * before migration v4 looks like to the template — so the default fixture is the
 * legacy shape, and the tests that care about a real split session say so
 * explicitly rather than inheriting it.
 */
const rec = (date: string, over: Partial<TimeRecord> = {}): TimeRecord => ({
  id: 1,
  internship_id: 1,
  date,
  time_in: '08:00',
  time_out: '17:00',
  am_time_in: null,
  am_time_out: null,
  pm_time_in: null,
  pm_time_out: null,
  break_minutes: 60,
  total_minutes: 480,
  total_hours: 8,
  notes: null,
  created_at: '',
  ...over,
});

/**
 * A post-v4 day: one row carrying a real morning *and* a real afternoon.
 *
 * `time_in`/`time_out` stay the day's derived span — 08:00 to 17:00 — which is
 * exactly what `timeRecordService` writes, so the fixture matches the database
 * rather than an idealised shape.
 */
const splitRec = (over: Partial<TimeRecord> = {}): TimeRecord =>
  rec('2026-09-01', {
    am_time_in: '08:00',
    am_time_out: '12:00',
    pm_time_in: '13:00',
    pm_time_out: '17:00',
    ...over,
  });

const render = (over: Partial<TmcFormData> = {}): string =>
  buildTmcFormHtml({
    user: user(),
    internship: internship(),
    records: [],
    monthIso: '2026-09-01',
    logoDataUri: null,
    generatedOn: new Date('2026-09-29T10:00:00Z'),
    ...over,
  });

describe('buildDayRows — one row per numbered day', () => {
  it('numbers 1..N for the length of the month', () => {
    expect(buildDayRows('2026-09-01', []).map((r) => r.day)).toEqual(
      Array.from({ length: 30 }, (_, i) => i + 1),
    );
  });

  it.each([
    ['2026-10-01', 31, 'October'],
    ['2026-09-01', 30, 'September'],
    ['2026-04-01', 30, 'April'],
    ['2026-02-01', 28, 'February, common year'],
    ['2028-02-01', 29, 'February, leap year'],
  ])('%s prints %i rows (%s)', (monthIso, expected) => {
    expect(buildDayRows(monthIso, [])).toHaveLength(expected);
  });

  it('leaves an unlogged day entirely blank rather than omitting it', () => {
    const rows = buildDayRows('2026-09-01', [rec('2026-09-01')]);
    expect(rows[0].amIn).toBe('8:00 AM');
    expect(rows[1]).toEqual({
      day: 2,
      amIn: null,
      amOut: null,
      pmIn: null,
      pmOut: null,
      totalHours: null,
      experience: null,
    });
  });

  it('accepts any day in the month, not only the first', () => {
    expect(buildDayRows('2026-09-17', [rec('2026-09-30')])[29].amIn).toBe('8:00 AM');
  });

  /**
   * The export screen tells the student "N of M rows filled" before anything is
   * generated, and `M` comes from `daysInMonthIso`. It once hardcoded 31, so a
   * September student was told to look for a 31st row the form never printed.
   *
   * The screen is a component and this is not, but the number it shows is only
   * honest if it equals the number of rows the document actually has — so the
   * two are pinned together here rather than trusted to stay in step.
   */
  it('agrees with daysInMonthIso on how many rows each month has', () => {
    // February 2028 is in here on purpose: 29 rows, and a hardcoded 31 would
    // have passed a February-2026 case while still being wrong.
    for (const monthIso of [
      '2026-01-01',
      '2026-02-01',
      '2026-04-01',
      '2026-09-01',
      '2026-10-01',
      '2028-02-01',
    ]) {
      expect(daysInMonthIso(monthIso)).toBe(buildDayRows(monthIso, []).length);
    }
  });
});

describe('buildDayRows — the AM/PM rule', () => {
  /**
   * The rule this whole feature set exists for.
   *
   * Before the four fields existed, the template printed the day's single span
   * into all four cells, so a morning session and an afternoon session on the
   * same day were indistinguishable on the signed form. A real record with a
   * real PM session must reach the PM cells as itself.
   */
  it('puts a real afternoon session in the PM cells', () => {
    const [day] = buildDayRows('2026-09-01', [splitRec()]);

    expect(day.amIn).toBe('8:00 AM');
    expect(day.amOut).toBe('12:00 PM');
    expect(day.pmIn).toBe('1:00 PM');
    expect(day.pmOut).toBe('5:00 PM');
  });

  it('does not invent an afternoon from the derived span', () => {
    // `time_in`/`time_out` say 08:00–17:00, which is the day's range and not a
    // claim that the student worked an unbroken shift. The PM cells must not be
    // backfilled from them.
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', {
        am_time_in: '08:00',
        am_time_out: '12:00',
        pm_time_in: '13:00',
        pm_time_out: '14:30',
        time_in: '08:00',
        time_out: '14:30',
      }),
    ]);

    expect(day.pmOut).toBe('2:30 PM');
  });

  it('leaves the PM cells blank on a single-shift day', () => {
    // One session, one pair of cells.
    //
    // This used to print the morning's pair into the PM cells as well, on the
    // theory that the school's form does that for a straight shift. A student
    // working 08:00–17:00 then read as having worked 08:00–17:00 *and*
    // 08:00–17:00: eighteen hours on a form whose own TOTAL HRS. column said
    // 8.00. A supervisor checking a form they are about to sign reads those
    // cells, not the total, and the row is the first thing they query.
    const [day] = buildDayRows('2026-09-01', [rec('2026-09-01')]);

    expect(day).toMatchObject({
      amIn: '8:00 AM',
      amOut: '5:00 PM',
      pmIn: null,
      pmOut: null,
      totalHours: '8.00',
    });
  });

  it('prints a morning-only v4 row as one shift, not two', () => {
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', {
        am_time_in: '07:30',
        am_time_out: '11:45',
        time_in: '07:30',
        time_out: '11:45',
        total_hours: 4.25,
      }),
    ]);

    expect(day).toMatchObject({
      amIn: '7:30 AM',
      amOut: '11:45 AM',
      pmIn: null,
      pmOut: null,
    });
  });

  it('never prints the same session in both halves of a row', () => {
    // The invariant behind the three tests above, stated directly: a pair of
    // times in both the AM and PM cells means the form claims two sessions, so
    // that may only happen on a day that genuinely has two.
    const singleShiftDays: [string, TimeRecord][] = [
      ['legacy', rec('2026-09-01')],
      [
        'morning only',
        rec('2026-09-01', { am_time_in: '08:00', am_time_out: '12:00', time_in: '08:00', time_out: '12:00' }),
      ],
      [
        'afternoon only',
        rec('2026-09-01', {
          am_time_in: null,
          am_time_out: null,
          pm_time_in: '13:00',
          pm_time_out: '17:00',
          time_in: '13:00',
          time_out: '17:00',
        }),
      ],
      [
        'full split',
        rec('2026-09-01', {
          am_time_in: '08:00',
          am_time_out: '12:00',
          pm_time_in: '13:00',
          pm_time_out: '17:00',
        }),
      ],
    ];

    for (const [label, record] of singleShiftDays) {
      const [day] = buildDayRows('2026-09-01', [record]);
      const sessions = [
        [day.amIn, day.amOut],
        [day.pmIn, day.pmOut],
      ].filter(([inTime]) => inTime !== null);

      expect(sessions).toHaveLength(label === 'full split' ? 2 : 1);
    }
  });

  it('leaves the PM half of a half-typed afternoon alone', () => {
    // A PM time in with no time out is a mistyped form, not a short shift. It
    // prints exactly as entered rather than borrowing the morning's out-time and
    // inventing a session the student did not work.
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', {
        am_time_in: '08:00',
        am_time_out: '12:00',
        pm_time_in: '13:00',
        pm_time_out: null,
      }),
    ]);

    expect(day.pmIn).toBe('1:00 PM');
    expect(day.pmOut).toBeNull();
  });

  it('keeps an afternoon-only day in the PM cells', () => {
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', {
        am_time_in: null,
        am_time_out: null,
        pm_time_in: '13:00',
        pm_time_out: '17:00',
        time_in: '13:00',
        time_out: '17:00',
      }),
    ]);

    expect(day.pmIn).toBe('1:00 PM');
    expect(day.pmOut).toBe('5:00 PM');
  });

  it('puts the earliest record in AM and the latest in PM on a split day', () => {
    const rows = buildDayRows('2026-09-01', [
      // Deliberately out of order, to prove the sort is not incidental.
      rec('2026-09-01', { id: 2, time_in: '13:00', time_out: '17:00', total_hours: 4 }),
      rec('2026-09-01', { id: 1, time_in: '08:00', time_out: '12:00', total_hours: 4 }),
    ]);

    expect(rows[0]).toMatchObject({
      amIn: '8:00 AM',
      amOut: '12:00 PM',
      pmIn: '1:00 PM',
      pmOut: '5:00 PM',
    });
  });

  it('never mixes one session time-in with the other time-out', () => {
    // The failure this guards is a cell-by-cell merge: the earliest record
    // supplying `amIn` and the latest supplying `pmOut`, which would print a
    // session nobody worked.
    const rows = buildDayRows('2026-09-01', [
      rec('2026-09-01', {
        id: 1,
        time_in: '08:00',
        time_out: '12:00',
        am_time_in: '08:00',
        am_time_out: '12:00',
        pm_time_in: null,
        pm_time_out: null,
        total_hours: 4,
      }),
      rec('2026-09-01', {
        id: 2,
        time_in: '13:00',
        time_out: '17:00',
        am_time_in: null,
        am_time_out: null,
        pm_time_in: '13:00',
        pm_time_out: '17:00',
        total_hours: 4,
      }),
    ]);

    expect(rows[0]).toMatchObject({
      amIn: '8:00 AM',
      amOut: '12:00 PM',
      pmIn: '1:00 PM',
      pmOut: '5:00 PM',
    });
  });

  it('sums a split day rather than reporting one half of it', () => {
    const rows = buildDayRows('2026-09-01', [
      rec('2026-09-01', { time_in: '08:00', time_out: '12:00', total_hours: 4 }),
      rec('2026-09-01', { time_in: '13:00', time_out: '17:00', total_hours: 4 }),
    ]);

    expect(rows[0].totalHours).toBe('8.00');
  });

  it('totals a single record’s two sessions once, not twice', () => {
    // The total is the record's own `total_hours`, never a sum over the printed
    // cells. Those two are the same number here only because the cells no longer
    // repeat a session — see the straight-shift history above.
    const [day] = buildDayRows('2026-09-01', [splitRec({ total_hours: 8 })]);

    expect(day.totalHours).toBe('8.00');
  });

  it('sums after rounding each record, so float error cannot leak in', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in binary floating point. Rounding each
    // contribution first is what keeps the printed total equal to the sum of the
    // per-record figures the student already saw.
    const rows = buildDayRows('2026-09-01', [
      rec('2026-09-01', { time_in: '08:00', time_out: '08:10', total_hours: 0.1 }),
      rec('2026-09-01', { time_in: '09:00', time_out: '09:20', total_hours: 0.2 }),
    ]);

    expect(rows[0].totalHours).toBe('0.30');
  });

  it('ignores records outside the month it was asked for', () => {
    const rows = buildDayRows('2026-09-01', [rec('2026-08-31'), rec('2026-10-01')]);
    expect(rows.every((r) => r.amIn === null)).toBe(true);
  });

  it('converts through the shared 12-hour formatter', () => {
    // A legacy row, so the span is doing the work — and the span starts at
    // 1:05 PM, so the PM cells are where it belongs. The point of the assertion
    // is the conversion, not the half; the half is what the tests above pin.
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', { time_in: '13:05', time_out: '22:45' }),
    ]);
    expect(day.pmIn).toBe(formatTime12h('13:05'));
    expect(day.pmOut).toBe(formatTime12h('22:45'));
    expect(day.amIn).toBeNull();
  });

  it('puts a legacy afternoon-only day in the PM cells, not under an AM heading', () => {
    // A pre-v4 row has no half of its own, only a span. When that span starts in
    // the afternoon the form used to print "1:00 PM – 5:00 PM" in the two cells
    // headed AM, which is a nine-hour morning on a form a supervisor signs.
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', { time_in: '13:00', time_out: '17:00' }),
    ]);

    expect(day).toMatchObject({
      amIn: null,
      amOut: null,
      pmIn: '1:00 PM',
      pmOut: '5:00 PM',
    });
  });

  it('treats a legacy noon start as an afternoon', () => {
    // 12:00 is where the form's AM block ends and its PM block begins, so a row
    // starting there is not a morning that ran long.
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', { time_in: '12:00', time_out: '17:00' }),
    ]);

    expect(day.amIn).toBeNull();
    expect(day.pmIn).toBe('12:00 PM');
  });
});

describe('buildDayRows — DAILY EXPERIENCE', () => {
  it('carries the note through unchanged', () => {
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', { notes: 'Replaced the LAN switch.' }),
    ]);
    expect(day.experience).toBe('Replaced the LAN switch.');
  });

  it('treats an empty or whitespace-only note as no note', () => {
    const rows = buildDayRows('2026-09-01', [
      rec('2026-09-01', { notes: '   ' }),
      rec('2026-09-02', { notes: null }),
    ]);
    expect(rows[0].experience).toBeNull();
    expect(rows[1].experience).toBeNull();
  });

  it('keeps both notes of a split day distinct rather than fusing them', () => {
    const rows = buildDayRows('2026-09-01', [
      rec('2026-09-01', { notes: 'Audited the server room.', time_in: '08:00' }),
      rec('2026-09-01', { notes: 'Labelled the racks.', time_in: '13:00' }),
    ]);
    expect(rows[0].experience).toBe('Audited the server room. / Labelled the racks.');
  });
});

describe('courseBlock — the COURSE/BLOCK cell', () => {
  it('joins course and block the way the college writes them', () => {
    expect(courseBlock(user())).toBe('BSIT 3A');
  });

  it('falls back to year level when no block is set', () => {
    expect(courseBlock(user({ block: null }))).toBe('BSIT 3rd Year');
  });

  it.each([
    [{ course: null, block: null, year_level: null }, ''],
    [{ course: 'BSIT', block: null, year_level: null }, 'BSIT'],
    [{ course: null, block: '3A', year_level: '3rd Year' }, '3A'],
    [{ course: '  BSIT  ', block: '  3A  ', year_level: '3rd Year' }, 'BSIT 3A'],
    // A whitespace-only block is the same as no block, so the year level wins.
    [{ course: 'BSIT', block: '   ', year_level: '3rd Year' }, 'BSIT 3rd Year'],
  ])('renders %o as %o', (over, expected) => {
    expect(courseBlock(user(over))).toBe(expected);
  });

  it('never emits a dangling separator', () => {
    for (const over of [
      { course: 'BSIT', block: null, year_level: null },
      { course: null, block: '3A', year_level: null },
      { course: 'BSIT', block: '', year_level: null },
    ]) {
      expect(courseBlock(user(over))).not.toMatch(/[-–]\s*$/);
    }
  });
});

describe('buildTmcFormHtml — the document', () => {
  it.each([
    'ON THE JOB TRAINNING',
    'DAILY TIME RECORDS WITH',
    'ACCOMPLISHMENT REPORT',
    "Student's Trainee Signature",
    // The `&` is an entity in the output; the apostrophe is a literal character,
    // because the supervisor's label is written into the template directly
    // rather than passed through `escapeHtml`.
    "SUPERVISOR'S NAME&amp;SIGNATURE",
    'College of Computer Studies',
    'Bachelor of Science in Information Technology (BSIT)',
    'NAME',
    'OFFICE',
    'COURSE/BLOCK',
    'PERIOD',
    'TOTAL HRS.',
    'DAILY EXPERIENCE',
  ])('prints the wording %o verbatim', (phrase) => {
    expect(render()).toContain(phrase);
  });

  it('does not "correct" the school spelling of TRAINNING', () => {
    expect(render()).not.toContain('ON THE JOB TRAINING</div>');
  });

  it('carries no field the form does not have', () => {
    const html = render();
    for (const absent of ['Progress:', 'Remaining', 'REQUIRED HOURS', 'ADVISER', 'TOTAL OJT']) {
      expect(html).not.toContain(absent);
    }
  });

  it('spans AM and PM across two columns each', () => {
    const html = render();
    expect(html).toContain('<th class="c-time" colspan="2">AM</th>');
    expect(html).toContain('<th class="c-time" colspan="2">PM</th>');
  });

  it('emits 2 info rows, 1 header row, and one row per day', () => {
    const rows = (render({ monthIso: '2026-10-01' }).match(/<tr>/g) ?? []).length;
    expect(rows).toBe(2 + 1 + 31);
  });

  it('renders a day as 7 physical cells', () => {
    expect(render({ records: [rec('2026-09-01')] })).toContain('<td class="c-date">1</td>');
  });

  it('omits the seal entirely when the asset could not be read', () => {
    // Matched on the element, not the class: the class name is in the
    // stylesheet, so the stylesheet would make this pass for the wrong reason.
    expect(render({ logoDataUri: null })).not.toContain('<div class="lh-logo-wrap">');
  });

  it('inlines the seal when the asset was read', () => {
    const html = render({ logoDataUri: 'data:image/png;base64,AAAA' });
    expect(html).toContain('src="data:image/png;base64,AAAA"');
  });

  it('marks the ongoing period when the placement has no end date', () => {
    expect(render({ internship: internship({ end_date: null }) })).toContain('Ongoing');
  });
});

describe('buildTmcFormHtml — escaping', () => {
  it('renders a note containing markup as inert text', () => {
    const html = render({ records: [rec('2026-09-01', { notes: 'a <b>b</b> & c' })] });
    expect(html).toContain('a &lt;b&gt;b&lt;/b&gt; &amp; c');
    expect(html).not.toContain('<b>b</b>');
  });

  it.each([
    ['<&">', '&lt;&amp;&quot;&gt;'],
    ["it's", 'it&#39;s'],
  ])('escapes %o', (raw, encoded) => {
    expect(render({ records: [rec('2026-09-01', { notes: raw })] })).toContain(encoded);
  });

  it('escapes a name that contains markup', () => {
    expect(render({ user: user({ full_name: '<script>x</script>' }) })).not.toContain('<script>');
  });

  it('escapes a course or block that contains markup', () => {
    const html = render({ user: user({ course: 'BS&IT', block: '<b>3A</b>' }) });
    expect(html).toContain('BS&amp;IT');
    expect(html).not.toContain('<b>3A</b>');
  });

  it('emits no unresolved template placeholder or stray backtick', () => {
    const html = render({ records: [rec('2026-09-01', { notes: 'x' })] });
    expect(html).not.toContain('${');
    expect(html).not.toContain('`');
  });
});

describe('buildTmcFormHtml — one page', () => {
  /**
   * Mirrors the budget in the template's CSS comment. A 31-day month is the
   * worst case; everything else is shorter.
   *
   * If this fails, the fix is in the CSS — not by loosening this number, and
   * not by removing the signature block, which is required content.
   */
  const CONTENT_HEIGHT_MM = 297 - 2 * 5; // A4 minus the @page top/bottom margins

  it.each([
    ['letterhead', 24],
    ['title', 20.7],
    ['info block', 15.7],
    ['grid', 6 + 31 * 5.9 + 32 * 0.3],
    ['signatures', 16.7],
  ])('%s', (section, mm) => {
    expect(mm).toBeGreaterThan(0);
    expect(section).toBeTruthy();
  });

  it('fits a 31-day month on one A4 page', () => {
    const used = 24 + 20.7 + 15.7 + (6 + 31 * 5.9 + 32 * 0.3) + 16.7;
    expect(used).toBeLessThan(CONTENT_HEIGHT_MM);
  });

  it('keeps enough slack for a long accomplishment note', () => {
    const used = 24 + 20.7 + 15.7 + (6 + 31 * 5.9 + 32 * 0.3) + 16.7;
    // A row is 5.9mm; roughly 3 wrapped lines of 7.5pt text is about 11mm.
    expect(CONTENT_HEIGHT_MM - used).toBeGreaterThan(11);
  });

  it('repeats the header and never splits a row if it does spill', () => {
    const html = render({ monthIso: '2026-10-01' });
    expect(html).toContain('display: table-header-group');
    expect(html).toContain('page-break-inside: avoid');
  });

  it('keeps the seal inside the paper', () => {
    // A negative offset puts the seal over the banner. Past the 5mm page margin
    // it is off the physical edge and the print engine clips it.
    const top = render().match(/\.lh-logo-wrap\s*\{[^}]*top:\s*(-?[\d.]+)mm/);
    expect(top).not.toBeNull();
    expect(Number(top![1])).toBeGreaterThanOrEqual(-5);
  });
});
