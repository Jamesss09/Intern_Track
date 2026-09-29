/**
 * PDF generation and distribution.
 *
 * This is the only file that imports `expo-print`, `expo-sharing` and
 * `expo-file-system`. The HTML itself lives in `utils/htmlTemplate.ts` and
 * `utils/tmcFormTemplate.ts` as pure functions, so a document can be rendered and
 * inspected in a test or on the web with no device.
 *
 * Two formats are produced from one service:
 *
 *  - `generateOjtRecordPdf` — the detailed log. Every record, break column,
 *    running total, progress line. This is the record the *student* reads.
 *  - `generateTmcFormPdf`   — the Trinidad Municipal College daily time record
 *    form, one month to a sheet, for hand-signing. This is the record the
 *    *school* reads. → [[Decisions#D-017 — Two PDF formats, not one replacement]]
 *
 * Three ways out, because a device has three different ways to get a file off
 * it and the old UI only reached one of them: `savePdf` (a real, durable file),
 * `shareRecord` (the system sheet) and `printRecord` / `printTmcForm` (the
 * system print dialog, AirPrint included). See "Where the file goes" below.
 *
 * Note on filenames: `printToFileAsync` in SDK 57 has no `name` option, so the
 * generated file is named by the OS. `savePdf` is where a real name gets applied,
 * by copying the cache file out under one.
 */

import { Platform } from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Asset } from 'expo-asset';
import { Directory, File, Paths } from 'expo-file-system';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { Internship, TimeRecord, User } from '@/types';
import { toDataUri } from '@/utils/base64';
import * as queries from '@/database/queries';
import { summarize } from '@/utils/progressCalculator';
import { buildRecordHtml, type RecordPdfData } from '@/utils/htmlTemplate';
import { buildTmcFormHtml } from '@/utils/tmcFormTemplate';
import { endOfMonthIso, monthLabel, startOfMonthIso } from '@/utils/dateFormatter';

export interface GeneratedRecord {
  uri: string;
  numberOfPages: number;
  html: string;
  /**
   * How many attendance records went into the document.
   *
   * Carried on the result rather than left to the screen to re-query, so the
   * number the student is shown and the number the file was built from cannot
   * come from two different reads. A TMC form built from 0 records while the
   * placement holds 40 is the bug this feature set exists to prevent, and it
   * must be visible rather than silent. → [[PDF Export#The blank form bug]]
   */
  recordCount: number;
  /** Worked minutes represented by the document, summed from integer minutes. */
  totalMinutes: number;
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

  return {
    uri,
    numberOfPages,
    html,
    recordCount: records.length,
    totalMinutes: totals?.total_minutes ?? 0,
  };
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
      // that registry is documented against.
      //
      // The depth is `../../`, not `../`. This file is at `src/services/`, so
      // `../assets/` means `src/assets/` — which does not exist — while the
      // assets folder is at the *project root*. Metro reported
      // "Cannot find module '../assets/TMC_Logo.png'" and the fallback
      // swallowed it into a seal-less form. Count the directories.
      //
      // The name matches the file on disk exactly — Metro and the device
      // filesystem are case-sensitive, so `TMC_Logo.png` and `tmc-logo.png` are
      // two different assets there even though a Windows checkout shows only
      // one. Getting the case wrong is a build error, not a wrong image.
      const asset = Asset.fromModule(require('../../assets/TMC_Logo.png'));
      await asset.downloadAsync();
      if (!asset.localUri) throw new Error('asset resolved without a localUri');

      // `arrayBuffer()` then encode, rather than a base64 method on `File`.
      // There isn't one: the class exposes `text()`, `bytes()` and
      // `arrayBuffer()`, and a `base64Sync()` call throws `TypeError` — which
      // this `catch` turned into a silently seal-less form. → [[PDF Export#The School Logo]]
      const bytes = new Uint8Array(await new File(asset.localUri).arrayBuffer());
      return toDataUri('image/png', bytes);
    } catch (error) {
      // Still degrades rather than failing the export: a form without a seal is
      // a usable document, and a student's month of hours should not be
      // unreachable because of a missing image.
      //
      // But not silently. The previous version of this caught and returned
      // nothing, which is exactly how a non-existent `base64Sync()` shipped as
      // a broken image nobody noticed until it was printed.
      if (__DEV__) {
        console.warn('[pdf] Could not inline the TMC logo; printing without it.', error);
      }
      return null;
    }
  })();

  return logoPromise;
};

/**
 * Raised when the TMC form was built from a month that holds no attendance, but
 * the placement as a whole does hold some.
 *
 * A distinct type rather than a generic `Error` because the screen's response is
 * specific and better than a generic failure: it names the months that *do* have
 * records and offers to switch to one. That is the difference between the
 * original bug — a blank sheet, no explanation, a document that looks perfectly
 * valid to hand in — and a form that cannot be produced by mistake.
 *
 * A genuinely empty placement never raises this. Printing a blank sheet for a
 * month with nothing in it is a legitimate thing to want, so it is not an error.
 */
export class TmcMonthEmptyError extends Error {
  readonly code = 'TMC_MONTH_EMPTY' as const;
  /** `YYYY-MM` values that do have records, oldest first. Empty when there are none at all. */
  readonly monthsWithRecords: string[];

  constructor(monthIso: string, monthsWithRecords: string[]) {
    super(
      monthsWithRecords.length === 0
        ? `No attendance has been logged yet, so ${monthLabel(monthIso)} prints as a blank sheet.`
        : `No attendance was logged in ${monthLabel(monthIso)}. Your records are in ${monthsWithRecords
            .map((m) => monthLabel(`${m}-01`))
            .join(', ')}.`,
    );
    this.name = 'TmcMonthEmptyError';
    this.monthsWithRecords = monthsWithRecords;
  }
}

/**
 * The TMC daily time record form for one month.
 *
 * `monthIso` is any day inside the target month — `startOfMonthIso(todayIso())`
 * is the usual source.
 *
 * **This is where the blank-form bug lived, and the fix is three separate
 * things rather than one:**
 *
 *  1. The records come from `queries.listMonthRecords`, a statement written for
 *     exactly this purpose with inclusive `from`/`to` bounds derived from the
 *     real month length. It used to be a `filterTimeRecords` call sharing a
 *     clause list with the Records screen's filter sheet — a month that lost its
 *     lower or upper bound to an edit over there would quietly return every row,
 *     or none, and print a form that looked identical either way.
 *  2. The four AM/PM times are read per record rather than fabricated by copying
 *     one pair into both halves, so a real morning session and a real afternoon
 *     session reach their own cells.
 *  3. The result carries `recordCount` and `totalMinutes`, and a month that comes
 *     back empty while the placement holds records raises
 *     `TmcMonthEmptyError` instead of quietly printing a blank sheet.
 *
 * That third point is the one that matters most. A blank TMC form is
 * indistinguishable from a correct blank TMC form — same letterhead, same 31
 * numbered rows, same signature lines — so the failure was invisible to everyone
 * including the student. It is now impossible to reach by accident.
 */
export const generateTmcFormPdf = async (
  db: SQLiteDatabase,
  user: User,
  internship: Internship,
  monthIso: string,
): Promise<GeneratedRecord> => {
  const from = startOfMonthIso(monthIso);
  const to = endOfMonthIso(monthIso);

  const [records, months, totals] = await Promise.all([
    queries.listMonthRecords(db, internship.id, from, to),
    queries.listMonthsWithRecords(db, internship.id),
    queries.getMonthTotals(db, internship.id, from, to),
  ]);

  // Guarded before the template is ever rendered, so a blank sheet cannot be
  // produced by a mismatched month. See the class comment for why this has to be
  // a throw rather than a warning the screen may ignore.
  if (records.length === 0 && months.length > 0) {
    throw new TmcMonthEmptyError(monthIso, months.map((m) => m.month));
  }

  const logoDataUri = await loadLogoDataUri();

  const html = buildTmcFormHtml({
    user,
    internship,
    records: records as TimeRecord[],
    monthIso,
    logoDataUri,
    generatedOn: new Date(),
  });

  const { uri, numberOfPages } = await Print.printToFileAsync({ html, base64: false });

  return {
    uri,
    numberOfPages,
    html,
    recordCount: records.length,
    totalMinutes: totals?.total_minutes ?? 0,
  };
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
    throw new Error('Sharing is not available on this device. Use Save File instead.');
  }

  await Sharing.shareAsync(uri, {
    mimeType: 'application/pdf',
    UTI: 'com.adobe.pdf',
    dialogTitle: title,
  });
};

// ── where the file goes ───────────────────────────────────────────────────

/**
 * Subfolder of the document directory that saved exports land in on iOS.
 *
 * `Paths.document`, **not** `Paths.cache`. The cache is documented as
 * disposable — Android clears it under storage pressure — and a cleared cache
 * takes the PDF with it. An export the student was told they'd "saved" has to
 * survive a reboot, or the save was a lie.
 *
 * `Paths.document` is also the directory the Files app can see, once
 * `expo-file-system`'s `enableFileSharing` config plugin is on
 * (`UIFileSharingEnabled` in `app.json`). → [[PDF Export#Where the file goes]]
 */
const exportDirectory = (): Directory => new Directory(Paths.document, 'exports');

/** Every export is a PDF. A SAF destination has to be told so explicitly. */
const PDF_MIME = 'application/pdf';

export interface SavedFile {
  /** The durable copy, for anyone who needs the path. */
  uri: string;
  /** What the file is called on disk, extension included. */
  name: string;
  /** Where it went, in words a student can act on. */
  location: string;
}

/**
 * Outcome of a save. `cancelled` is a decision the student made, not a
 * failure, and the screen must not dress it up as one.
 */
export type SaveResult = { status: 'saved'; file: SavedFile } | { status: 'cancelled' };

/**
 * Did the student back out of the system folder picker?
 *
 * The native picker rejects with `PickerCancelledException`, which
 * `expo-modules-core` converts to a `CodedError` whose code is inferred from
 * the class name — `ERR_PICKER_CANCELLED`. The message is matched too, because
 * this is the one rejection that must never surface as "Could not save".
 */
const isPickerCancelled = (error: unknown): boolean => {
  const code = (error as { code?: unknown } | null | undefined)?.code;
  if (typeof code === 'string' && code.toUpperCase().includes('CANCEL')) return true;
  const message = error instanceof Error ? error.message : String(error ?? '');
  return /cancell?ed/i.test(message);
};

/**
 * Strip a filename down to something every filesystem accepts.
 *
 * `TMC Daily Time Record — September 2026.pdf` is fine in a share-sheet title and
 * rejected by some Android volumes: an em dash is legal, a slash is not, and a
 * name that differs only by case can collide on a FAT-formatted SD card. ASCII
 * letters, digits and dashes is the intersection every platform agrees on.
 */
const safeFileName = (raw: string): string => {
  const cleaned = raw
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  return cleaned.length > 0 ? cleaned : 'OJT-Record';
};

/**
 * Delete a file of the same name already sitting in a directory.
 *
 * Without this, saving September twice leaves the student with
 * `TMC-…-September-2026 (1).pdf` next to the original, and in a hand-signing
 * workflow an ambiguous pair is worse than one cleanly replaced file. The
 * listing is best-effort: a folder we cannot enumerate should still accept the
 * save rather than block it.
 */
const removeSibling = (directory: Directory, name: string): void => {
  try {
    for (const entry of directory.list()) {
      if (entry instanceof File && entry.name === name) entry.delete();
    }
  } catch {
    // No read access to the listing, or the provider refused it. Save anyway.
  }
};

/**
 * Copy a generated PDF out of the cache and give it a real name.
 *
 * `printToFileAsync` writes to the cache under an OS-assigned UUID, and SDK 57
 * has no `name` option to change that — the share sheet's `dialogTitle` is the
 * only naming the old flow had. So the bytes are copied out under a name the
 * student wrote, and the file they keep six weeks later is one they recognise.
 *
 * **Where it goes is platform-specific, because "the document directory" means
 * two different things.**
 *
 * On iOS, `Paths.document` is the app's `Documents` folder, which the Files app
 * browses directly once `enableFileSharing` is set in `app.json`. Copying there
 * is a real, persistent save with no extra permission and no extra tap.
 *
 * On Android, `Paths.document` is **app-private storage**. A copy there is
 * invisible: no file manager lists it, no share target can reach it, and the
 * student who saved it cannot find it again. So Android asks the student to pick
 * a real folder — Downloads, Drive, anywhere they can see — and writes into that.
 * This also sidesteps the `'FileSystemFile.copy' has been rejected` failure the
 * private path produced: `FileSystemPath.copy` validates read access on the
 * destination *before* copying, and a path inside the private container fails
 * that check in several ways a real SAF `content://` grant does not.
 *
 * The copy is *not* a move. `printTmcForm` and the screen both still hold the
 * cache `uri`, and moving it out from under them would break the follow-up
 * Share. A PDF is a few hundred KB; the duplicate is cheaper than the bug.
 */
export const savePdf = async (uri: string, desiredName: string): Promise<SaveResult> => {
  const name = `${safeFileName(desiredName)}.pdf`;
  const source = new File(uri);

  if (!source.exists || source.size === 0) {
    throw new Error(
      'The PDF is no longer on this device. Press Create PDF again, then Save.',
    );
  }

  if (Platform.OS === 'android') {
    let picked: Directory | null;
    try {
      picked = await Directory.pickDirectoryAsync();
    } catch (error) {
      if (isPickerCancelled(error)) return { status: 'cancelled' };
      throw error;
    }

    removeSibling(picked, name);
    // `createFile` is the only way to name a document inside a SAF tree. The
    // alternative, copying *into* the directory, would name the file after the
    // cache UUID and the student would be left with a random filename.
    const destination = picked.createFile(name, PDF_MIME);
    try {
      await source.copy(destination, { overwrite: true });
    } catch (error) {
      // Don't leave a zero-byte PDF sitting in the student's folder.
      try {
        destination.delete();
      } catch {
        /* the copy already failed; the provider's file is not ours to fix */
      }
      throw error;
    }

    return {
      status: 'saved',
      file: { uri: destination.uri, name, location: `In ${picked.name}` },
    };
  }

  const directory = exportDirectory();
  directory.create({ intermediates: true, idempotent: true });

  const destination = new File(directory, name);
  // Created before the copy, for the same reason Android avoids the private
  // path: `copy` checks read access on a destination that does not exist yet,
  // and that check is the fragile step. An existing file is a file.
  destination.create({ intermediates: true, overwrite: true });
  await source.copy(destination, { overwrite: true });

  return {
    status: 'saved',
    file: {
      uri: destination.uri,
      name,
      location: 'In the Files app, under On My iPhone › InternTrack › exports',
    },
  };
};

/** Filename stem for a TMC sheet, e.g. `TMC-Daily-Time-Record-September-2026`. */
export const tmcFileName = (monthIso: string): string =>
  `TMC Daily Time Record — ${monthLabel(monthIso)}`;

/** Filename stem for the detailed log. */
export const logFileName = (): string => 'OJT Detailed Time Record';
