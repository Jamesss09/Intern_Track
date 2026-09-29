/**
 * The PDF template. A pure function so it can be rendered in a test, on the web,
 * or in a Node script without a device.
 *
 * Two rules make this safe to put in front of a school:
 *  1. `summary` is passed in from `progressCalculator.summarize()` — the exact
 *     same function the dashboard uses. Nothing is recomputed here, so the
 *     printed total cannot disagree with the on-screen total.
 *  2. every dynamic value goes through `escapeHtml()`. The `notes` field is
 *     free text typed by the student; without escaping, a note containing `<b>`
 *     or `&` breaks the table or injects markup into the document.
 *
 * See vault note `PDF Export`.
 */

import type { Internship, TimeRecord, User } from '@/types';
import { formatDateLong, formatShortDate, formatTime12h } from './dateFormatter';
import { formatHours } from './progressCalculator';

export interface RecordPdfData {
  user: User;
  internship: Internship;
  records: TimeRecord[];
  summary: {
    completed: number;
    required: number;
    remaining: number;
    percent: number;
    dayCount: number;
  };
  generatedOn: Date;
}

export const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Fixed-width padding so the label/value block stays column-aligned. */
const pad = (value: string, width: number): string => value.padEnd(width, ' ');

export const buildRecordHtml = (data: RecordPdfData): string => {
  const { user, internship, records, summary, generatedOn } = data;

  // Oldest first reads more naturally in a signed document than newest first.
  const ordered = [...records].sort((a, b) =>
    a.date === b.date ? a.time_in.localeCompare(b.time_in) : a.date.localeCompare(b.date),
  );

  const rows = ordered
    .map(
      (r) => `
        <tr>
          <td>${escapeHtml(formatShortDate(r.date))}</td>
          <td>${escapeHtml(formatTime12h(r.time_in))}</td>
          <td>${escapeHtml(formatTime12h(r.time_out))}</td>
          <td class="right">${r.break_minutes} min</td>
          <td class="right">${formatHours(r.total_hours)}</td>
        </tr>`,
    )
    .join('');

  const subtitleParts = [user.course, user.student_id && `Student No. ${user.student_id}`]
    .filter((part): part is string => Boolean(part))
    .map(escapeHtml);

  const period = internship.end_date
    ? `${formatDateLong(internship.start_date)} &ndash; ${formatDateLong(internship.end_date)}`
    : `${formatDateLong(internship.start_date)} &ndash; Ongoing`;

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <style>
    @page { size: A4; margin: 16mm 14mm; }

    body {
      font-family: "Courier New", Courier, monospace;
      font-size: 11px;
      color: #000;
      margin: 0;
    }

    h1 {
      text-align: center;
      font-size: 16px;
      letter-spacing: 1px;
      margin: 0 0 4px;
    }

    .subtitle { text-align: center; font-size: 10px; margin-bottom: 18px; }

    .summary { margin-bottom: 18px; }
    .summary div { margin: 2px 0; }

    table { width: 100%; border-collapse: collapse; }

    /* Repeats the column labels on every printed page. */
    thead { display: table-header-group; }

    th, td { padding: 4px 6px; font-size: 11px; }
    th {
      border-top: 1px solid #000;
      border-bottom: 1px solid #000;
      text-align: left;
      font-weight: bold;
    }
    td { border-bottom: 1px solid #ddd; }
    .right { text-align: right; }

    /* Keeps the total on the same page as the last row. */
    tfoot { display: table-row-group; }
    tfoot td {
      border-top: 2px solid #000;
      border-bottom: 1px solid #000;
      font-weight: bold;
      padding-top: 6px;
    }

    /* Keeps a single row from being split across two pages. */
    tr { page-break-inside: avoid; }

    .progress { margin-top: 16px; font-weight: bold; }
    .generated { margin-top: 24px; font-size: 9px; color: #555; }

    .signatures {
      margin-top: 48px;
      display: flex;
      justify-content: space-between;
    }
    .signature-block { width: 42%; }
    .signature-line {
      border-top: 1px solid #000;
      padding-top: 4px;
      font-size: 9px;
      text-align: center;
    }
  </style>
</head>
<body>
  <h1>INTERNSHIP / OJT TIME RECORD</h1>
  <div class="subtitle">${subtitleParts.join(' &middot; ')}</div>

  <div class="summary">
    <div>${pad('Student Name:', 22)}${escapeHtml(user.full_name)}</div>
    <div>${pad('Company:', 22)}${escapeHtml(internship.company_name)}</div>
    <div>${pad('Position:', 22)}${escapeHtml(internship.position)}</div>
    <div>${pad('Placement Period:', 22)}${period}</div>
    <div>${pad('Required Hours:', 22)}${formatHours(summary.required)}</div>
    <div>${pad('Completed Hours:', 22)}${formatHours(summary.completed)}</div>
    <div>${pad('Remaining Hours:', 22)}${formatHours(summary.remaining)}</div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Time In</th>
        <th>Time Out</th>
        <th class="right">Break</th>
        <th class="right">Hours</th>
      </tr>
    </thead>
    <tbody>
      ${rows || '<tr><td colspan="5">No records logged yet.</td></tr>'}
    </tbody>
    <tfoot>
      <tr>
        <td colspan="4" class="right">TOTAL HOURS</td>
        <td class="right">${formatHours(summary.completed)}</td>
      </tr>
    </tfoot>
  </table>

  <div class="progress">
    Progress: ${formatHours(summary.completed)} of ${formatHours(summary.required)} hours
    (${summary.percent}%) &mdash; ${summary.dayCount} day(s) logged
  </div>

  <div class="generated">Generated on ${escapeHtml(formatDateLong(toIsoDate(generatedOn)))}</div>

  <div class="signatures">
    <div class="signature-block"><div class="signature-line">Student Signature</div></div>
    <div class="signature-block"><div class="signature-line">Supervisor Signature</div></div>
  </div>
</body>
</html>`;
};

/** Local calendar date as `YYYY-MM-DD`, so the PDF never shifts by a timezone. */
const toIsoDate = (date: Date): string => {
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${m}-${d}`;
};
