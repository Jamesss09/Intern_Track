/**
 * Account use cases.
 *
 * Screens never touch `database/` or `utils/passwordHasher` directly; they call
 * these functions. See vault note `Project Structure` -> "`services/` — Use cases".
 */

import type { User } from '@/types';
import { getDatabase } from '@/database/database';
import * as queries from '@/database/queries';
import { hashPassword, needsRehash, verifyPassword } from '@/utils/passwordHasher';
import { computeLockout, secondsUntil } from '@/utils/rateLimiter';

export interface RegisterInput {
  full_name: string;
  email: string;
  password: string;
  student_id?: string | null;
  course?: string | null;
  year_level?: string | null;
  block?: string | null;
}

/**
 * Split out so the login screen can put the fixed half in a live region and the
 * ticking half outside it. A countdown inside `accessibilityLiveRegion` is
 * re-announced every second, which for a five-minute lockout means a screen
 * reader that will not stop talking.
 */
const TOO_MANY_HEAD = 'Too many attempts.';

/**
 * Deliberately vague. Telling a caller "that email is already registered" is a
 * free account-enumeration oracle, and it costs nothing to avoid here.
 */
export const AUTH_ERRORS = {
  emailTaken: 'An account with that email already exists.',
  invalidCredentials: 'Incorrect email or password.',
  notFound: 'Account not found.',
  /**
   * Used for change-password, and thrown for **both** a wrong current password
   * and a missing user row.
   *
   * Two paths, one message, on purpose: a distinct "account not found" would
   * tell an attacker the row is gone. `invalidCredentials` is deliberately not
   * reused here — it names the email, which is exactly what someone already
   * signed in does not need to be told — but the non-enumeration property it
   * protects is the same one, so the same rule applies.
   */
  currentPasswordWrong: 'That is not your current password.',
  samePassword: 'Your new password must be different from the current one.',
  /**
   * A function, not a string, because the wait is the message. A student told
   * only "too many attempts" has no idea whether to come back in half a minute
   * or tomorrow, and guessing wrong means more failed attempts.
   */
  tooManyAttemptsHead: TOO_MANY_HEAD,
  tooManyAttempts: (seconds: number) =>
    `${TOO_MANY_HEAD} Try again in ${Math.max(1, Math.ceil(seconds))}s.`,
} as const;

/**
 * Thrown instead of `invalidCredentials` once a lockout is armed.
 *
 * Carries `retryAfterSeconds` so the login screen can run a live countdown
 * instead of parsing the number back out of the sentence above — a countdown
 * that is a fixed 30 s while the text says "28s" is worse than no countdown.
 * `AppContext`'s `message()` reads `.message`, so the alert still fills from
 * context with no second error channel.
 */
export class TooManyAttemptsError extends Error {
  readonly retryAfterSeconds: number;

  constructor(retryAfterSeconds: number) {
    super(AUTH_ERRORS.tooManyAttempts(retryAfterSeconds));
    this.name = 'TooManyAttemptsError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const register = async (input: RegisterInput): Promise<number> => {
  const db = await getDatabase();
  const email = normalizeEmail(input.email);

  const existing = await queries.getUserByEmail(db, email);
  if (existing) throw new Error(AUTH_ERRORS.emailTaken);

  return queries.insertUser(db, {
    full_name: input.full_name.trim(),
    email,
    password_hash: await hashPassword(input.password),
    student_id: input.student_id?.trim() || null,
    course: input.course?.trim() || null,
    year_level: input.year_level?.trim() || null,
    block: input.block?.trim().toUpperCase() || null,
  });
};

/** Returns the signed-in user, or throws `AUTH_ERRORS.invalidCredentials`. */
export const login = async (email: string, password: string): Promise<User> => {
  const db = await getDatabase();

  // Checked before the hash, deliberately. `verifyPassword` is 10,000 PBKDF2
  // iterations of real wall-clock time, and making an already-locked user sit
  // through it before being told to stop is a denial of service we would be
  // handing to anyone holding the phone.
  const attempts = await queries.getAuthAttemptState(db);
  const lockedFor = secondsUntil(attempts.locked_until, new Date());
  if (lockedFor > 0) throw new TooManyAttemptsError(lockedFor);

  const user = await queries.getUserByEmail(db, normalizeEmail(email));

  // Hash even when the user is missing, so a wrong email and a wrong password
  // take the same amount of time.
  const stored = user?.password_hash ?? (await hashPassword('no-such-user'));
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) {
    // `attempts` is still accurate: nothing has written to the counter since it
    // was read, and JS ran to completion in between.
    const next = computeLockout(attempts.failed_count + 1, attempts.locked_until, new Date());

    await queries.recordFailedAttempt(db, next.retryAfterSeconds);
    if (next.locked) throw new TooManyAttemptsError(next.retryAfterSeconds);

    throw new Error(AUTH_ERRORS.invalidCredentials);
  }

  // A correct password ends the streak, so the next slip starts from zero rather
  // than inheriting a count the student has already recovered from.
  await queries.clearAuthAttempts(db);

  // Opportunistically upgrade hashes created with a lower iteration count.
  if (needsRehash(user.password_hash)) {
    await queries
      .updateUserPasswordHash(db, user.id, await hashPassword(password))
      .catch(() => undefined);
  }

  return user;
};

export const getUserById = async (id: number): Promise<User | null> => {
  const db = await getDatabase();
  return queries.getUserById(db, id);
};

/**
 * Changes the signed-in user's password, after re-verifying the current one.
 *
 * There is no session token to revoke and no other device to sign out — the
 * account lives in one local database — so verifying the current password *is*
 * the entire authorisation check. Skipping it would let anyone who picks up an
 * unlocked phone lock the owner out of their own hours.
 *
 * The new hash is always built at the current iteration count, so a password
 * last set under weaker settings is silently upgraded by changing it.
 */
export const changePassword = async (
  userId: number,
  currentPassword: string,
  newPassword: string,
): Promise<void> => {
  const db = await getDatabase();
  const user = await queries.getUserById(db, userId);

  // Hash a decoy when the row is missing, so a deleted account costs the same
  // wall-clock time as a wrong password and cannot be told apart by timing.
  const stored = user?.password_hash ?? (await hashPassword('no-such-user'));
  const currentIsValid = await verifyPassword(currentPassword, stored);

  // One message for both. See `AUTH_ERRORS.currentPasswordWrong`.
  if (!user || !currentIsValid) throw new Error(AUTH_ERRORS.currentPasswordWrong);

  // Reusing the current password is legal but pointless, and silently accepting
  // it leaves the user believing they strengthened something they did not.
  if (await verifyPassword(newPassword, stored)) throw new Error(AUTH_ERRORS.samePassword);

  await queries.updateUserPasswordHash(db, user.id, await hashPassword(newPassword));
};

export const updateProfile = async (
  id: number,
  fields: {
    full_name: string;
    student_id: string | null;
    course: string | null;
    year_level: string | null;
    block: string | null;
  },
): Promise<void> => {
  const db = await getDatabase();
  await queries.updateUserProfile(db, id, {
    ...fields,
    full_name: fields.full_name.trim(),
    student_id: fields.student_id?.trim() || null,
    course: fields.course?.trim() || null,
    year_level: fields.year_level?.trim() || null,
    block: fields.block?.trim().toUpperCase() || null,
  });
};

/** Cascades to internships and time records. Requires a confirmation step in the UI. */
export const deleteAccount = async (id: number): Promise<void> => {
  const db = await getDatabase();
  await queries.deleteUser(db, id);
};
