/**
 * PDF generation and distribution.
 *
 * This is the only file that imports `expo-print` and `expo-sharing`. The HTML
 * itself lives in `utils/htmlTemplate.ts` and `utils/tmcFormTemplate.ts` as pure
 * functions, so a document can be rendered and inspected in a test or on the web
 * with no device.
 *
 * Two formats are produced from one service:
 *
 *  - `generateOjtRecordPdf` — the detailed log. Every record, break column,
 *    running total, progress line. This is the record the *student* reads.
 *  - `generateTmcFormPdf`   — the Trinidad Municipal College daily time record
 *    form, one month to a sheet, for hand-signing. This is the record the
 *    *school* reads. → [[Decisions#D-017 — Two PDF formats, not one replacement]]
 *
 * Note on filenames: `printToFileAsync` in SDK 57 has no `name` option, so the
 * generated file is named by the OS. `expo-file-system` can rename it before
 * sharing, but the share sheet title and the "Save to Files" path are what
 * users actually navigate by, so that is what the UI labels.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { File } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Internship, TimeRecord, User } from '@/types';
import * as queries from '@/database/queries';
import { summarize } from '@/utils/progressCalculator';
import { buildRecordHtml, type RecordPdfData } from '@/utils/htmlTemplate';
import { buildTmcFormHtml } from '@/utils/tmcFormTemplate';
import { endOfMonthIso, startOfMonthIso } from '@/utils/dateFormatter';

export interface GeneratedRecord {
  uri: string;
  numberOfPages: number;
  html: string;
}

/**
 * Build the HTML and render it to a PDF in the app cache directory.
 *
 * The cache is not durable — Android may clear it under storage pressure. The
 * caller must offer a share action; a generated PDF that was never shared away
 * is not a backup. See vault note `Security` -> "Data Loss".
 */
export const generateOjtRecordPdf = async (
  db: SQLiteDatabase,
  user: User,
  internship: Internship,
): Promise<GeneratedRecord> => {
  const [records, totals] = await Promise.all([
    queries.listTimeRecords(db, internship.id),
    queries.getHoursTotals(db, internship.id),
  ]);

  // The exact same function the Progress screen calls, so the printed total
  // cannot disagree with the on-screen total.
  const data: RecordPdfData = {
    user,
    internship,
    records: records as TimeRecord[],
    summary: summarize(
      internship.required_hours,
      totals?.total_minutes ?? 0,
      totals?.day_count ?? 0,
    ),
    generatedOn: new Date(),
  };

  const html = buildRecordHtml(data);
  const { uri, numberOfPages } = await Print.printToFileAsync({ html, base64: false });

  return { uri, numberOfPages, html };
};

/** Render straight to the system print dialog. AirPrint on iOS. */
export const printRecord = async (
  db: SQLiteDatabase,
  user: User,
  internship: Internship,
): Promise<void> => {
  const { html } = await generateOjtRecordPdf(db, user, internship);
  await Print.printAsync({ html });
};

// ── the TMC daily time record form ───────────────────────────────────────

/**
 * The school seal as a `data:` URI, or `null` if it could not be read.
 *
 * The bytes have to be inlined rather than referenced. iOS print HTML is
 * rendered by `WKWebView`, which will not load a `file://` asset URL — a
 * documented `expo-print` limitation — so `<img src="./tmc-logo.png">` silently
 * produces a broken image on iOS and a working one on Android. Base64 works
 * identically on both.
 *
 * Memoised at module scope because the asset never changes within a session,
 * and `downloadAsync` writes into the cache directory: re-reading it on every
 * export would mean a disk hit for a file that is already in memory. A rejected
 * promise is cached too, so a missing logo does not turn into a retry storm —
 * the fallback is the letterhead without a seal, which is a usable document.
 */
let logoPromise: Promise<string | null> | null = null;

const loadLogoDataUri = (): Promise<string | null> => {
  logoPromise ??= (async () => {
    try {
      // Relative, not `@/assets/...`: a `require()` of a binary asset is
      // resolved by Metro's asset registry, and a relative path is the form
      // that registry is documented against. The name matches the file on disk
      // exactly — Metro and the device filesystem are case-sensitive, so a
      // near-miss is a build error rather than a wrong image.
      const asset = Asset.fromModule(require('../assets/TMC_Logo.png'));
      await asset.downloadAsync();
      if (!asset.localUri) return null;
      return `data:image/png;base64,${new File(asset.localUri).base64Sync()}`;
    } catch {
      return null;
    }
  })();

  return logoPromise;
};

/**
 * The TMC daily time record form for one month.
 *
 * `monthIso` is any day inside the target month — `startOfMonthIso(todayIso())`
 * is the usual source. Bounds are inclusive at both ends, so the month is
 * closed on the same day it opens, and `filterTimeRecords` returns rows in
 * `date DESC, time_in DESC` order that `buildDayRows` re-sorts into day order.
 */
export const generateTmcFormPdf = async (
  db: SQLiteDatabase,
  user: User,
  internship: Internship,
  monthIso: string,
): Promise<GeneratedRecord> => {
  const [records, logoDataUri] = await Promise.all([
    queries.filterTimeRecords(db, internship.id, {
      from: startOfMonthIso(monthIso),
      to: endOfMonthIso(monthIso),
    }),
    loadLogoDataUri(),
  ]);

  const html = buildTmcFormHtml({
    user,
    internship,
    records: records as TimeRecord[],
    monthIso,
    logoDataUri,
    generatedOn: new Date(),
  });

  const { uri, numberOfPages } = await Print.printToFileAsync({ html, base64: false });

  return { uri, numberOfPages, html };
};

/** Straight to the system print dialog, for the school's own printer. */
export const printTmcForm = async (
  db: SQLiteDatabase,
  user: User,
  internship: Internship,
  monthIso: string,
): Promise<void> => {
  const { html } = await generateTmcFormPdf(db, user, internship, monthIso);
  await Print.printAsync({ html });
};

export const isSharingAvailable = (): Promise<boolean> => Sharing.isAvailableAsync();

/**
 * `dialogTitle` is Android/Web only and `UTI` is iOS only; passing both is
 * harmless and each platform ignores what it does not know.
 */
export const shareRecord = async (uri: string, title = 'Share OJT Time Record'): Promise<void> => {
  if (!(await Sharing.isAvailableAsync())) {
    throw new Error('Sharing is not available on this device. Use Save to Files instead.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: title,
  });
};
