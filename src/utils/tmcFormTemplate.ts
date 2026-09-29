/**
 * The Trinidad Municipal College daily time record form, as a pure function.
 *
 * This is the school's own document, not a redesign of it. Three rules make it
 * safe to hand to a college:
 *
 *  1. **Wording is verbatim, typos included.** The form reads `ON THE JOB
 *     TRAINNING` and `Student's Trainee Signature`. A printed form that
 *     "corrects" the school's title is not the school's form, and the first
 *     question at submission is whether this is the right document. Spelling is
 *     not a bug here. → [[Decisions#D-016 — Reproduce the TMC form verbatim, including its typos]]
 *
 *  2. **The structure is the form's, not the app's.** The real sheet has no
 *     grand-total row, no progress bar, and no adviser field, so this template
 *     has none either. The month's hours and percentage live on the export
 *     *screen*, where the student checks them before printing, rather than
 *     printed onto a document the school will hand back.
 *
 *  3. **Everything dynamic goes through `escapeHtml()`.** `notes` is free text
 *     typed by the student, and it lands in the widest cell on the page.
 *
 * `buildDayRows` is exported separately because it holds the one genuinely
 * ambiguous decision — how a day with a single `time_in`/`time_out` pair fills
 * four AM/PM time cells — and that decision should be reviewable and testable
 * without rendering a page. → [[PDF Export]]
 */

import type { Internship, TimeRecord, User } from '@/types';
import { escapeHtml } from './htmlTemplate';
import { daysInMonthIso, formatDateLong, formatTimeNoMeridiem, parseIsoDate } from './dateFormatter';
import { formatHours } from './progressCalculator';
import { round2 } from './timeCalculator';

/** The college's banner blue, and the darker wedge that angles in from the left. */
const BRAND = '#1F3C88';
const BRAND_DARK = '#152C66';
const BRAND_LIGHT = '#2E56B3';

/** Grey fill on the table header row. The form prints its own header in grey. */
const HEADER_FILL = '#D9D9D9';

export interface TmcFormData {
  user: User;
  internship: Internship;
  /**
   * Every record in the month being printed, in any order.
   *
   * Fetched by `queries.listMonthRecords` with inclusive bounds, so this is the
   * attendance that exists — not a filtered or re-derived subset. An empty array
   * is a legitimate input: a month with nothing logged prints as a blank sheet,
   * which is what a form is for.
   */
  records: TimeRecord[];
  /** Any day inside the target month. Rows are numbered 1 to the month's length. */
  monthIso: string;
  /**
   * The school seal, already base64-inlined. `null` renders the letterhead
   * without it rather than failing the export — a student without a logo still
   * needs a form, and a broken-image icon in a document going to a college is
   * worse than a missing one. iOS `WKWebView` cannot load a `file://` asset in
   * print HTML, so the bytes have to travel inside the document.
   */
  logoDataUri: string | null;
  generatedOn: Date;
}

/** One printed row: day number plus the four time cells, total and experience. */
export interface TmcDayRow {
  day: number;
  amIn: string | null;
  amOut: string | null;
  pmIn: string | null;
  pmOut: string | null;
  totalHours: string | null;
  experience: string | null;
}

/** One record's four cells, already resolved to 12-hour display strings. */
interface SessionCells {
  amIn: string | null;
  amOut: string | null;
  pmIn: string | null;
  pmOut: string | null;
}

/**
 * A record's four time cells, straight from the columns it was saved with.
 *
 * No cross-half borrowing happens here. Every decision about where a time is
 * allowed to appear belongs to the half that actually contains it, and the only
 * place that can see how many sessions the day really has is `buildDayRows`.
 */
const ownCells = (record: TimeRecord): SessionCells => {
  const show = (t: string | null): string | null => (t ? formatTimeNoMeridiem(t) : null);
  return {
    amIn: show(record.am_time_in),
    amOut: show(record.am_time_out),
    pmIn: show(record.pm_time_in),
    pmOut: show(record.pm_time_out),
  };
};

/**
 * A row written before migration v4, with none of the four columns filled.
 *
 * `time_in`/`time_out` are that row's only record of what was worked, so they
 * stand in for its morning. A row the v4 backfill already reached is *not* in
 * this category — the backfill copies the same two values into the AM columns —
 * but it arrives at the same place either way, which is the point: both pre-v4
 * shapes print as a morning, never as two.
 */
const isLegacyRow = (record: TimeRecord): boolean =>
  record.am_time_in === null &&
  record.am_time_out === null &&
  record.pm_time_in === null &&
  record.pm_time_out === null;

/** One half of the printed row: a time in, a time out, or neither. */
interface HalfCells {
  in: string | null;
  out: string | null;
}

/**
 * Which half of the row a legacy row's single span belongs in.
 *
 * A pre-v4 row carries no half information at all — only the day's start and
 * end — so its own clock values have to decide. A shift starting at or after
 * noon is an afternoon one, and printing it in the AM cells puts "1:00" under a
 * heading that says AM, where the supervisor reads it as morning. `12:00` counts
 * as afternoon, because that is where the form's AM block ends and its PM block
 * begins.
 *
 * `null` for a row that is not legacy: it already knows its own halves, and
 * guessing them would override real data.
 */
const legacyHalf = (record: TimeRecord): 'am' | 'pm' | null => {
  if (!isLegacyRow(record)) return null;

  const hour = Number.parseInt(record.time_in.slice(0, 2), 10);
  if (Number.isNaN(hour)) return 'am';
  return hour >= 12 ? 'pm' : 'am';
};

/**
 * A record's cells for one half.
 *
 * `substitute` decides whether a legacy row's day span may stand in for the
 * cells it does not have. It is the whole of the migration story:
 *
 *  - **true** in the half `legacyHalf` picks, which is the only place a pre-v4
 *    row's attendance can honestly go. A month of legacy days must print rather
 *    than come out blank, and each of those days prints as one shift.
 *  - **true** in the PM half **on a split day**, where a second record really is
 *    a second session and its span is that session.
 *  - **false** otherwise. An afternoon-only shift has no morning, and borrowing
 *    the span would print "1:00 – 5:00" in the AM cells — a four-hour morning
 *    nobody worked. A single-session day has no afternoon, and repeating the
 *    morning across both halves made one shift read as two, which contradicts the
 *    row's own `TOTAL HRS.` and is the first thing a supervisor would query on a
 *    form they are being asked to sign.
 *
 * Either way the pair is kept together: a time in with no time out is a mistyped
 * form, not a short shift, so a half-recorded afternoon prints exactly as
 * entered rather than borrowing the morning's out-time.
 */
const halfOf = (record: TimeRecord, half: 'am' | 'pm', substitute: boolean): HalfCells => {
  const cells = ownCells(record);
  const own: HalfCells =
    half === 'am'
      ? { in: cells.amIn, out: cells.amOut }
      : { in: cells.pmIn, out: cells.pmOut };

  if (own.in !== null || own.out !== null) return own;
  if (!substitute || !isLegacyRow(record)) return own;

  return {
    in: record.time_in ? formatTimeNoMeridiem(record.time_in) : null,
    out: record.time_out ? formatTimeNoMeridiem(record.time_out) : null,
  };
};

/**
 * Roll a month's records up into 1..N printed rows.
 *
 * **The AM/PM rule.** Each record carries its own four times, so a morning
 * session and an afternoon session on the same day are separate, real data and
 * land in their own cells. Two cases, one per day:
 *
 *  - **One record** — the normal case after migration v4. Its AM times go to the
 *    AM cells and its PM times to the PM cells, with the straight-shift
 *    convention covering a day that only has a morning. A split shift is the
 *    first thing this code has ever been able to represent honestly.
 *  - **Two records on one date** — a split day still permitted by the unique
 *    index on `(internship_id, date, time_in)`. The earliest record fills AM and
 *    the latest fills PM. `sorted[0]` and `sorted[last]` are the same element
 *    when there is one record, so this degrades to the case above for free.
 *
 * `total_hours` is summed, not taken from one row, because it is the day's hours
 * and a split day has two contributions. It is summed **after** rounding each row
 * to 2dp, matching what the student sees on the record card, so the printed
 * number cannot drift from the on-screen one by float error.
 */
export const buildDayRows = (monthIso: string, records: TimeRecord[]): TmcDayRow[] => {
  const target = parseIsoDate(monthIso);
  const targetMonth = target.getFullYear() * 12 + target.getMonth();

  const byDay = new Map<number, TimeRecord[]>();

  for (const r of records) {
    const d = parseIsoDate(r.date);

    /*
     * Keyed on the whole month, not just the day of the month.
     *
     * `generateTmcFormPdf` pre-filters with `listMonthRecords`, so in practice
     * nothing out of range ever arrives. But this function is exported, and
     * keying on the day alone means a stray 1 October record would land on
     * 1 September — a silently wrong cell on a document a supervisor signs,
     * rather than an obviously missing one. Belt and braces, because the
     * failure mode is a wrong number and the caller cannot see it.
     */
    if (d.getFullYear() * 12 + d.getMonth() !== targetMonth) continue;

    const day = d.getDate();
    const bucket = byDay.get(day);
    if (bucket) bucket.push(r);
    else byDay.set(day, [r]);
  }

  // `time_in` is a zero-padded `HH:MM`, so a plain string sort is chronological.
  const total = daysInMonthIso(monthIso);

  return Array.from({ length: total }, (_, index) => {
    const day = index + 1;
    const dayRecords = byDay.get(day);

    if (!dayRecords || dayRecords.length === 0) {
      return { day, amIn: null, amOut: null, pmIn: null, pmOut: null, totalHours: null, experience: null };
    }

    const sorted = [...dayRecords].sort((a, b) => a.time_in.localeCompare(b.time_in));
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // A legacy row's span goes in the half its own clock points at, so a
    // pre-v4 afternoon does not print under an AM heading.
    const morning = halfOf(first, 'am', legacyHalf(first) === 'am');

    /**
     * The afternoon, from the latest record on the day.
     *
     * On a **split day** — two records for one date, still permitted by the
     * unique index on `(internship_id, date, time_in)` — the second record is a
     * second session, so it is printed in the PM half and its span may stand in.
     *
     * On a **single-record day** only that record's own PM columns are used, so a
     * day with no afternoon prints as two blank cells rather than a second copy
     * of the morning.
     */
    const afternoon = halfOf(last, 'pm', sorted.length > 1 || legacyHalf(last) === 'pm');

    // Only the morning session's note describes the day. A second note is
    // still shown rather than dropped — concatenating would run the two
    // together into a sentence that was never written.
    const experience =
      sorted
        .map((r) => r.notes)
        .filter((n): n is string => Boolean(n && n.trim()))
        .join(' / ') || null;

    return {
      day,
      amIn: morning.in,
      amOut: morning.out,
      // Straight out of the latest record, never merged cell-by-cell with the
      // morning's. Merging is how an afternoon session on one record and a
      // second record on the same day would produce a time in from one and a time
      // out from the other — a session that was never worked.
      pmIn: afternoon.in,
      pmOut: afternoon.out,
      totalHours: formatHours(
        round2(
          sorted.reduce((sum, r) => sum + round2(r.total_hours), 0),
        ),
      ),
      experience,
    };
  });
};

/**
 * The form's single `COURSE/BLOCK` cell.
 *
 * The college fills that one cell with both halves — `BSIT 3A` — so the
 * registrar's block is preferred over the year level. `year_level` is the
 * fallback, not a second line: the cell is one line wide, and a student who
 * left the block blank should still get something the supervisor can read
 * rather than a blank cell on a signed document.
 *
 * Always at most two parts, never a dangling separator: a half that trims to
 * empty is dropped rather than joined.
 */
export const courseBlock = (user: User): string => {
  const clean = (v: string | null | undefined): string => (v ?? '').trim();

  const course = clean(user.course);
  const block = clean(user.block);
  const year = clean(user.year_level);

  // The registrar's block wins when it is set. It is what the college reads,
  // and it is the half of the cell the field is named after.
  if (course && block) return `${course} ${block}`;

  // Otherwise the year level stands in, rather than printing the course alone.
  // A signed form reading just "BSIT" has lost the half the reader needs, and
  // this is also the path every account created before the `block` column
  // existed takes — so it is the backwards-compatible behaviour, not a
  // second-class one.
  const second = block || year;
  if (course && second) return `${course} ${second}`;

  // Last resort: whichever half was filled, or nothing at all. Returning `''`
  // renders a blank cell the supervisor can write in by hand, which is what an
  // empty form is for.
  return course || second;
};

const period = (internship: Internship): string =>
  internship.end_date
    ? `${formatDateLong(internship.start_date)} - ${formatDateLong(internship.end_date)}`
    : `${formatDateLong(internship.start_date)} - Ongoing`;

const dayRowHtml = (row: TmcDayRow): string => `
          <tr>
            <td class="c-date">${row.day}</td>
            <td class="c-time">${row.amIn ? escapeHtml(row.amIn) : ''}</td>
            <td class="c-time">${row.amOut ? escapeHtml(row.amOut) : ''}</td>
            <td class="c-time">${row.pmIn ? escapeHtml(row.pmIn) : ''}</td>
            <td class="c-time">${row.pmOut ? escapeHtml(row.pmOut) : ''}</td>
            <td class="c-total">${row.totalHours ? escapeHtml(row.totalHours) : ''}</td>
            <td class="c-exp">${row.experience ? escapeHtml(row.experience) : ''}</td>
          </tr>`;

export const buildTmcFormHtml = (data: TmcFormData): string => {
  const { user, internship, records, monthIso, logoDataUri } = data;

  const rows = buildDayRows(monthIso, records).map(dayRowHtml).join('');

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    /*
      A4 portrait, 5 mm top/bottom margins, and a height budget that keeps the
      whole sheet on one page. A 31-day month is the worst case:

        letterhead 24 + title 20.7 + info 15.7 + (6 + 31 x 5.9 + 9.6) grid
        + signatures 16.7  =  275.6 mm   against 297 - 10 = 287 mm available.

      That leaves ~11 mm of slack, which is what absorbs a long accomplishment
      note. The height on a td is a minimum, not a fixed height, so a note
      grows its row instead of being clipped — and
      thead { display: table-header-group } repeats the column labels if a
      paragraph-long note does push the last days onto a second page.
    */
    @page { size: A4; margin: 5mm 6mm; }

    * { box-sizing: border-box; }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 8pt;
      color: #000;
      margin: 0;
      padding: 0;
    }

    /* ── letterhead ───────────────────────────────────────────────────── */

    .letterhead {
      position: relative;
      height: 24mm;
      background: linear-gradient(100deg, ${BRAND_DARK} 0%, ${BRAND} 55%, ${BRAND_LIGHT} 100%);
      overflow: visible;
      color: #fff;
    }

    /* The angled blue sections on the left of the real letterhead. Two wedges
       of different depths rather than one, because a single diagonal reads as
       a rendering artefact where two read as a deliberate design. */
    .wedge {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 14mm;
    }
    .wedge-a {
      left: 0;
      background: ${BRAND_LIGHT};
      clip-path: polygon(0 0, 100% 0, 40% 100%, 0 100%);
    }
    .wedge-b {
      left: 9mm;
      background: ${BRAND_DARK};
      clip-path: polygon(0 0, 55% 0, 0 100%);
      opacity: 0.55;
    }

    .lh-text {
      position: relative;
      padding: 5mm 0 0 26mm;
    }
    .lh-college {
      font-size: 12.5pt;
      font-weight: bold;
      letter-spacing: 0.3px;
    }
    .lh-program {
      font-size: 8.5pt;
      font-weight: bold;
      letter-spacing: 0.2px;
      margin-top: 1.2mm;
    }

    /*
      The seal sits at the top-right, half over the banner. The white disc is
      not decoration: a circular school logo with a white rim is invisible
      against the page where it overhangs, and half of it does overhang.

      The -3 mm top offset is deliberate and load-bearing. The page margin is
      5 mm, so anything above about -5 mm is past the physical edge of the
      paper and gets clipped by the print engine — the -3 mm overlap reads as
      "tucked under the header" and still keeps the whole seal on the sheet.
    */
    .lh-logo-wrap {
      position: absolute;
      right: 3mm;
      top: -3mm;
      width: 28mm;
      height: 28mm;
      border-radius: 50%;
      background: #fff;
      border: 0.6mm solid ${BRAND};
      overflow: hidden;
    }
    .lh-logo-wrap img {
      width: 100%;
      height: 100%;
      object-fit: contain;
    }

    /* ── title ────────────────────────────────────────────────────────── */

    .doc-title { text-align: center; margin: 3mm 0 2.5mm; }
    .doc-title .line1,
    .doc-title .line2 {
      font-size: 12pt;
      font-weight: bold;
      letter-spacing: 0.4px;
      line-height: 1.25;
    }
    .doc-title .line3 {
      font-size: 9pt;
      font-weight: bold;
      letter-spacing: 0.3px;
      margin-top: 0.8mm;
    }

    /* ── tables ───────────────────────────────────────────────────────── */

    table { width: 100%; border-collapse: collapse; table-layout: fixed; }

    .info { margin-bottom: 2.5mm; }
    .info th,
    .info td {
      border: 0.4mm solid #000;
      padding: 1.2mm 2mm;
      height: 6mm;
      font-size: 8.5pt;
    }
    .info th {
      text-align: left;
      font-weight: bold;
      width: 17%;
    }

    /* The five printed columns. AM and PM each span two of the seven physical
       columns, which is how the form's four time boxes are produced.

       These must total exactly 100, counting c-time four times over: 6 plus
       4x8 plus 10 plus 52. They previously came to 102.6, and an over-subscribed
       percentage row is not a near miss. The browser resolves it by letting the
       widest content steal width from its siblings, so the time cells came out
       narrower than the number asked for and a seven-character time wrapped onto
       a second line. A wrapped time breaks the 5.9mm row height below, and that
       row height is what keeps a 31-day month on one page. */
    .c-date  { width: 6%; }
    .c-time  { width: 8%; }
    .c-total { width: 10%; }
    .c-exp   { width: 52%; }

    .grid th,
    .grid td {
      border: 0.3mm solid #000;
      padding: 0.6mm 1mm;
    }
    .grid thead { display: table-header-group; }
    .grid tr { page-break-inside: avoid; }

    .grid th {
      background: ${HEADER_FILL};
      font-size: 8pt;
      font-weight: bold;
      text-align: center;
      text-transform: uppercase;
      height: 6mm;
    }
    .grid th.c-exp { text-align: left; padding-left: 2mm; }

    .grid tbody td {
      height: 5.9mm;
      font-size: 7.5pt;
      vertical-align: top;
    }
    .grid .c-date,
    .grid .c-total,
    .grid .c-time { text-align: center; }
    .grid .c-time { white-space: nowrap; }
    /* A time is at most five characters, the longest being 12:00 at midnight or
       noon, so a cell can never need two lines. Saying so explicitly makes that
       a guarantee rather than an expectation: a wrapped cell would silently push
       the row past 5.9mm and spill the month onto a second page, which is the
       one thing this form is not allowed to do. */
    .grid .c-date { font-weight: bold; }
    .grid .c-exp { text-align: left; line-height: 1.25; }

    /* ── signatures ───────────────────────────────────────────────────── */

    .signatures {
      display: flex;
      justify-content: space-between;
      margin-top: 8mm;
    }
    .sig { width: 45%; }
    .sig-label { font-size: 8pt; font-weight: bold; text-align: center; }
    .sig-right .sig-line { margin-bottom: 1.5mm; }

    /*
      The student's block reads label-then-rule on one line; the supervisor's
      is rule-above-label. That asymmetry is the form's, not a styling slip.
      A flex row with a growing rule is what draws "__________" out to the
      margin without a run of underscores that never lines up.
    */
    .sig-left { display: flex; align-items: flex-end; gap: 2mm; }
    .sig-left .sig-text { white-space: nowrap; font-size: 8pt; font-weight: bold; }
    .rule {
      flex: 1;
      border-bottom: 0.3mm solid #000;
      height: 4mm;
    }
  </style>
</head>
<body>
  <div class="letterhead">
    <div class="wedge wedge-a"></div>
    <div class="wedge wedge-b"></div>
    <div class="lh-text">
      <div class="lh-college">College of Computer Studies</div>
      <div class="lh-program">Bachelor of Science in Information Technology (BSIT)</div>
    </div>
    ${
      logoDataUri
        ? `<div class="lh-logo-wrap"><img src="${logoDataUri}" alt="Trinidad Municipal College logo" /></div>`
        : ''
    }
  </div>

  <div class="doc-title">
    <div class="line1">DAILY TIME RECORDS WITH</div>
    <div class="line2">ACCOMPLISHMENT REPORT</div>
    <div class="line3">ON THE JOB TRAINNING</div>
  </div>

  <table class="info">
    <tr>
      <th>NAME</th>
      <td>${escapeHtml(user.full_name)}</td>
      <th>OFFICE</th>
      <td>${escapeHtml(internship.company_name)}</td>
    </tr>
    <tr>
      <th>COURSE/BLOCK</th>
      <td>${escapeHtml(courseBlock(user))}</td>
      <th>PERIOD</th>
      <td>${escapeHtml(period(internship))}</td>
    </tr>
  </table>

  <table class="grid">
    <thead>
      <tr>
        <th class="c-date">DATE</th>
        <th class="c-time" colspan="2">AM</th>
        <th class="c-time" colspan="2">PM</th>
        <th class="c-total">TOTAL HRS.</th>
        <th class="c-exp">DAILY EXPERIENCE</th>
      </tr>
    </thead>
    <tbody>${rows}
    </tbody>
  </table>

  <div class="signatures">
    <div class="sig sig-left">
      <span class="sig-text">Student's Trainee Signature</span>
      <span class="rule"></span>
    </div>
    <div class="sig sig-right">
      <div class="rule"></div>
      <div class="sig-label">SUPERVISOR'S NAME&amp;SIGNATURE</div>
    </div>
  </div>
</body>
</html>`;
};
