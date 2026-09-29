/**
 * The student's profile picture: pick it, shrink it, keep it, take it away.
 *
 * → [[Avatar]]
 *
 * ## Why the picked file is never the file we keep
 *
 * Both `expo-image-picker` and `expo-image-manipulator` write their output to
 * the **cache** directory, and the docs are blunt about that: it is "a place to
 * store files that can be deleted by the system when the device runs low on
 * storage". Storing that path would give a student a photo that disappears when
 * Android reclaims space under pressure, with a database row still insisting it
 * is there. So the picked URI is an *input*: it is read once, and what is kept
 * is a copy under `Paths.document`, which is "safe from being deleted by the
 * system".
 *
 * `Paths.document` is also the only durable directory that is certain to be
 * readable. On Android it resolves to `context.filesDir`
 * (`AppDirectoriesService.persistentFilesDirectory`), and that is one of the two
 * paths `FilePermissionService` allowlists — the same allowlist that made Save
 * File fail for paths outside the app. Nothing here depends on that being true
 * for `expo-image-picker`'s own output, because that file is read in the same
 * tick it was created, while the durable copy is ours.
 *
 * ## Why the database holds a name and not a path
 *
 * iOS does not promise the app's container path is stable across launches, and
 * it is certainly not stable across installs, so a stored absolute path is a
 * value that can quietly stop meaning anything. The column holds a bare file
 * name and `resolveAvatarUri` rebuilds the absolute path on every read.
 *
 * ## Why the image is cropped and shrunk before it is stored
 *
 * A phone camera produces roughly 4000x3000. That is about 6 MB of JPEG and,
 * once decoded, **48 MB of bitmap** — to be drawn inside a 64 px circle. Storing
 * and then decoding the original is how a profile picture becomes the reason an
 * app is killed for memory on a cheap Android.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as queries from '@/database/queries';
import { getDatabase } from '@/database/database';
import { AVATAR_COMPRESS, AVATAR_EDGE, centreSquareRect } from '@/utils/avatarImage';

/**
 * The name is derived from the user id, not timestamped.
 *
 * Two reasons, both about not leaking files. A timestamped name would leave the
 * previous picture on disk every time the student changed it, forever — an
 * unbounded pile of their face that nothing ever cleans up. A fixed name means
 * there is at most one avatar per account, and replacing it is an overwrite
 * rather than an accumulation. It also makes removal total: the name is known
 * from the id alone, so no directory listing and no half-deleted state.
 */
const avatarFileName = (userId: number): string => `avatar-${userId}.jpg`;

/** The one directory that holds every avatar. Created on demand. */
const avatarDirectory = (): Directory => new Directory(Paths.document, 'avatars');

/**
 * Turn a stored name into something `<Image>` can load, or `null` if it is gone.
 *
 * Returning `null` for a missing file rather than a URI that 404s is the whole
 * point. The database is not the filesystem and the two can disagree: a restore
 * from a backup, a partially-completed delete, an OS that reclaimed a directory.
 * In every one of those cases the honest answer is "there is no picture" and the
 * student sees their initials, which is exactly what they saw before they ever
 * picked one.
 */
export const resolveAvatarUri = (name: string | null | undefined): string | null => {
  if (!name) return null;
  try {
    const file = new File(avatarDirectory(), name);
    return file.exists ? file.uri : null;
  } catch {
    // A malformed name in the column is not worth an error dialog. Treat it as
    // "no picture", which is the state the screen already knows how to draw.
    return null;
  }
};

/**
 * Square off, shrink, and re-encode a picked photo. Returns a cache URI.
 *
 * The crop is done here rather than trusted to the picker's own editor. On iOS
 * `allowsEditing` is documented to always produce a square, but on Android it
 * presents a crop UI that the user can leave without choosing a crop at all —
 * and a stored landscape photo shown in a circle crops the student's face out of
 * frame with no way to predict which part goes. A centred square is the one
 * framing that is right before anyone has seen the result.
 *
 * The rect comes from `centreSquareRect`, which is pure and tested, and the crop
 * is chained after the resize so the whole thing is one `renderAsync` pass. The
 * alternative — render, read the real dimensions back off the `ImageRef`, crop
 * again — works but decodes the full-size bitmap twice.
 */
const prepareSquare = async (
  sourceUri: string,
  sourceWidth: number,
  sourceHeight: number,
): Promise<string> => {
  const context = ImageManipulator.manipulate(sourceUri).resize({ width: AVATAR_EDGE });

  const rect = centreSquareRect(sourceWidth, sourceHeight);
  if (rect) context.crop(rect);

  const rendered = await context.renderAsync();
  try {
    const saved = await rendered.saveAsync({
      compress: AVATAR_COMPRESS,
      format: SaveFormat.JPEG,
    });
    return saved.uri;
  } finally {
    // `ImageRef` holds a native bitmap (a `Drawable` on Android), and
    // `SharedObject.release()` exists for exactly this. Skipping it leaks native
    // memory that the JS collector cannot see, and this app is expected to stay
    // open for a whole internship.
    rendered.release();
  }
};

/**
 * Move a prepared image into durable storage and return the name to store.
 *
 * Only touches the filesystem. The caller writes the name to the database, and
 * does so *after* this resolves — see `saveAvatar`.
 */
const storePrepared = async (preparedUri: string, userId: number): Promise<string> => {
  const directory = avatarDirectory();
  directory.create({ intermediates: true, idempotent: true });

  const name = avatarFileName(userId);
  await new File(preparedUri).copy(new File(directory, name), { overwrite: true });
  return name;
};

/**
 * A picker result, folded down to the one thing this service needs from it.
 *
 * Returns `null` for a cancel, and `null` for a result with no assets — the
 * shape `expo-image-picker` uses for both "the student backed out" and "the
 * activity was destroyed before the pick finished". Neither is an error worth
 * interrupting the student over.
 */
type PickedImage = { uri: string; width: number; height: number } | null;

const firstImage = (result: ImagePicker.ImagePickerResult): PickedImage => {
  if (result.canceled) return null;
  const asset = result.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, width: asset.width, height: asset.height };
};

/** Options shared by the library and the camera. */
const PICK_OPTIONS: ImagePicker.ImagePickerOptions = {
  mediaTypes: ['images'],
  allowsEditing: true,
  // The editor is a convenience, not the mechanism — `prepareSquare` is what
  // guarantees the framing. Asking for a square here too just means the crop UI
  // starts from the right shape.
  aspect: [1, 1],
  // No compression at the picker. The image is about to be resized to 512 px and
  // re-encoded as JPEG, and compressing a 6 MB file only to throw most of it away
  // is where double-encoding artefacts come from.
  quality: 1,
};

/** True while the result belongs to a camera or library that has not been used. */
const hasAsset = (result: ImagePicker.ImagePickerResult): boolean =>
  !result.canceled && result.assets.length > 0;

/**
 * `getPendingResultAsync` is the one picker call with a **wider** return type.
 *
 * Everything else here is `ImagePickerResult` — a `canceled` flag and an
 * `assets` array. This one can also come back as an `ImagePickerErrorResult`,
 * which has a `code` and a `message` and neither of those, and which is exactly
 * what an activity that was killed mid-pick tends to produce. Narrowing on
 * `canceled` is what tells the two apart: a real result always carries it.
 */
const asResult = (
  pending: ImagePicker.ImagePickerResult | ImagePicker.ImagePickerErrorResult | null,
): ImagePicker.ImagePickerResult | null => {
  if (!pending) return null;
  return 'canceled' in pending ? pending : null;
};

/**
 * Ask the student to choose a picture, and store whatever they choose.
 *
 * Returns the stored file name, or `null` if they cancelled. A `null` return is
 * not a failure and the screen must leave the existing picture alone — "cancel"
 * and "there is now no photo" are different things and conflating them is how a
 * student loses a picture they never meant to touch.
 */
export const chooseAvatar = async (userId: number): Promise<string | null> => {
  const result = await ImagePicker.launchImageLibraryAsync(PICK_OPTIONS);
  return commit(result, userId);
};

/**
 * Take a picture with the camera and store it.
 *
 * The camera needs a permission; the library does not — the picker hands back a
 * copy inside the app's own sandbox. Asking for a media-library permission the
 * student has no reason to grant is how a permission prompt teaches people to
 * tap Deny on the ones that matter.
 */
export const captureAvatar = async (userId: number): Promise<string | null> => {
  const permission = await ImagePicker.requestCameraPermissionsAsync();
  if (!permission.granted) {
    throw new Error(
      'InternTrack needs camera access to take a photo. You can still choose one from your pictures.',
    );
  }

  const result = await ImagePicker.launchCameraAsync(PICK_OPTIONS);
  return commit(result, userId);
};

/**
 * Store a pick, then record it. The order is the design.
 *
 * The file is written **first** and the database second, deliberately. If the
 * write fails the student keeps the picture they already had and one unused
 * file is left under a name the next pick will overwrite — harmless. The other
 * order would leave the database pointing at a file that was never written,
 * which shows as a blank space where the photo should be with no way for the
 * student to tell that from "the app lost it".
 */
const saveAvatar = async (userId: number, result: ImagePicker.ImagePickerResult): Promise<string | null> => {
  const picked = firstImage(result);
  if (!picked) return null;

  const prepared = await prepareSquare(picked.uri, picked.width, picked.height);
  const name = await storePrepared(prepared, userId);

  const db = await getDatabase();
  await queries.updateUserAvatar(db, userId, name);
  return name;
};

/** Pick, shrink, store, record. The one path every entry point funnels through. */
const commit = async (result: ImagePicker.ImagePickerResult, userId: number): Promise<string | null> =>
  saveAvatar(userId, result);

/**
 * Delete the picture and clear the reference to it.
 *
 * File first, database second, for the same reason `saveAvatar` is the other way
 * round: the failure modes should both land on "no picture", which the screen
 * already draws correctly. Clearing the row first and then failing to delete
 * would leave an orphaned file that nothing points at and nothing removes.
 */
export const removeAvatar = async (userId: number, name: string | null): Promise<void> => {
  if (name) {
    try {
      const file = new File(avatarDirectory(), name);
      if (file.exists) file.delete();
    } catch {
      // A picture that cannot be deleted is a storage problem, not a reason to
      // refuse the removal. The row is cleared either way, so the student is no
      // longer showing it.
    }
  }

  const db = await getDatabase();
  await queries.updateUserAvatar(db, userId, null);
};

/**
 * Claim a pick that outlived the app that started it.
 *
 * `expo-image-picker` documents that on Android the system "sometimes kills the
 * MainActivity after the ImagePicker finishes", taking the pending result with
 * it — and that `getPendingResultAsync` is how to get it back. The alternative
 * is the worst possible bug report for this feature: "I picked a photo, the app
 * closed, and it forgot."
 *
 * This is called when the Profile screen mounts rather than at app launch
 * because the result has to be filed against a *user id*, and there is no signed
 * in user during the splash. A pick interrupted by a kill therefore lands when
 * the student next opens Profile. Slightly late, and it beats losing it.
 *
 * Returns the stored name, or `null` when there was nothing pending — which is
 * the normal case, every time, on every launch that was not interrupted.
 *
 * An `ImagePickerErrorResult` is also `null`, and deliberately not surfaced.
 * This runs on mount, unasked, for a pick the student did not start in this
 * session; an error dialog about a previous run's interrupted pick would be
 * baffling, and the picker's own UI already reports anything the student can
 * actually do something about. Nothing is lost — the student re-picks.
 */
export const recoverInterruptedPick = async (userId: number): Promise<string | null> => {
  const result = asResult(await ImagePicker.getPendingResultAsync());
  if (!result) return null;

  if (!hasAsset(result)) return null;

  const saved = await commit(result, userId);
  return saved;
};
