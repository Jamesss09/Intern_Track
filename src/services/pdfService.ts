/**
 * PDF generation and distribution.
 *
 * This is the only file that imports `expo-print` and `expo-sharing`. The HTML
 * itself lives in `utils/htmlTemplate.ts` as a pure function, so the document
 * can be rendered and inspected in a test or on the web with no device.
 *
 * Note on filenames: `printToFileAsync` in SDK 57 has no `name` option, so the
 * generated file is named by the OS. `expo-file-system` can rename it before
 * sharing, but the share sheet title and the "Save to Files" path are what
 * users actually navigate by, so that is what the UI labels.
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Internship, TimeRecord, User } from '@/types';
import * as queries from '@/database/queries';
import { summarize } from '@/utils/progressCalculator';
import { buildRecordHtml, type RecordPdfData } from '@/utils/htmlTemplate';

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
