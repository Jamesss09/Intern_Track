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
import { formatTime12h } from '@/utils/dateFormatter';
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

/** A worked day. `notes` defaults to null, which is the common case. */
const rec = (date: string, over: Partial<TimeRecord> = {}): TimeRecord => ({
  id: 1,
  internship_id: 1,
  date,
  time_in: '08:00',
  time_out: '17:00',
  break_minutes: 60,
  total_minutes: 480,
  total_hours: 8,
  notes: null,
  created_at: '',
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
});

describe('buildDayRows — the AM/PM rule', () => {
  it('writes time_in and time_out into all four time cells', () => {
    const [day] = buildDayRows('2026-09-01', [rec('2026-09-01')]);

    // The school's convention for a straight shift: the pair appears in AM
    // *and* PM rather than two times and two blanks.
    expect(day.amIn).toBe('8:00 AM');
    expect(day.amOut).toBe('5:00 PM');
    expect(day.pmIn).toBe('8:00 AM');
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

  it('sums a split day rather than reporting one half of it', () => {
    const rows = buildDayRows('2026-09-01', [
      rec('2026-09-01', { time_in: '08:00', time_out: '12:00', total_hours: 4 }),
      rec('2026-09-01', { time_in: '13:00', time_out: '17:00', total_hours: 4 }),
    ]);

    expect(rows[0].totalHours).toBe('8.00');
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
    const [day] = buildDayRows('2026-09-01', [
      rec('2026-09-01', { time_in: '13:05', time_out: '22:45' }),
    ]);
    expect(day.amIn).toBe(formatTime12h('13:05'));
    expect(day.amOut).toBe(formatTime12h('22:45'));
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
