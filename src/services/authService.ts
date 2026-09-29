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

export interface RegisterInput {
  full_name: string;
  email: string;
  password: string;
  student_id?: string | null;
  course?: string | null;
  year_level?: string | null;
}

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
} as const;

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
  });
};

/** Returns the signed-in user, or throws `AUTH_ERRORS.invalidCredentials`. */
export const login = async (email: string, password: string): Promise<User> => {
  const db = await getDatabase();
  const user = await queries.getUserByEmail(db, normalizeEmail(email));

  // Hash even when the user is missing, so a wrong email and a wrong password
  // take the same amount of time.
  const stored = user?.password_hash ?? (await hashPassword('no-such-user'));
  const ok = await verifyPassword(password, stored);

  if (!user || !ok) throw new Error(AUTH_ERRORS.invalidCredentials);

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
  },
): Promise<void> => {
  const db = await getDatabase();
  await queries.updateUserProfile(db, id, {
    ...fields,
    full_name: fields.full_name.trim(),
    student_id: fields.student_id?.trim() || null,
    course: fields.course?.trim() || null,
    year_level: fields.year_level?.trim() || null,
  });
};

/** Cascades to internships and time records. Requires a confirmation step in the UI. */
export const deleteAccount = async (id: number): Promise<void> => {
  const db = await getDatabase();
  await queries.deleteUser(db, id);
};
