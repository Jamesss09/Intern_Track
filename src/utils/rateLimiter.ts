/**
 * Failed-login backoff. Pure — no React, no `expo-*`, no database — so it
 * unit-tests without a simulator alongside the other `utils/`. See vault note
 * `Architecture` -> "Decision 4".
 */

/** Consecutive failures tolerated before the first lockout. */
export const MAX_ATTEMPTS = 5;
export const BASE_LOCKOUT_SECONDS = 30;
export const MAX_LOCKOUT_SECONDS = 300;

export interface LockoutState {
  locked: boolean;
  retryAfterSeconds: number;
}

/**
 * Seconds left on an existing lockout. Zero when there is none.
 *
 * `new Date(iso)` is safe here **only** because `locked_until` is written as
 * ISO-8601 with an explicit `Z` (`strftime('%Y-%m-%dT%H:%M:%SZ', ...)`).
 *
 * This is worth stating loudly, because SQLite's more common
 * `datetime('now')` produces `"2026-09-29 12:00:00"` — a space-separated string
 * with no zone designator, which `Date` parses as **local** time, not UTC. The
 * stored value means 12:00 UTC; on a device at UTC+8 it would be read back as
 * 04:00 UTC, an 8-hour error that silently inverts the whole feature. Measured
 * across zones, a 30-second lockout comes out as -28770 s in Asia/Manila (so it
 * never engages at all) and 14430 s in America/New_York (a 4-hour lockout). Any
 * query that writes these columns must keep the `Z` format.
 *
 * A value that fails to parse counts as expired rather than as locked: a corrupt
 * row must not be able to brick sign-in on a device with no server to ask.
 */
export const secondsUntil = (lockedUntil: string | null, now: Date): number => {
  if (!lockedUntil) return 0;

  const expiry = new Date(lockedUntil);
  if (Number.isNaN(expiry.getTime())) return 0;

  return Math.max(0, Math.ceil((expiry.getTime() - now.getTime()) / 1000));
};

/**
 * Whether the counter at `failedCount` failures is locked, and for how long.
 *
 * Two callers, two questions, and they need different answers:
 *  - "is this user locked *right now*?" — `secondsUntil(lockedUntil, now)`.
 *  - "if they fail *again*, do they get locked?" — this function.
 *
 * Keeping both in one signature is the trap: at 5+ failures with an expired
 * lockout this returns `locked: true`, which read as a pre-check would reject a
 * legitimate retry before it had failed. So an unexpired lockout is returned
 * as-is, and a fresh one is issued only when the previous one has run out.
 *
 * The curve doubles per extra failure and then clamps:
 * 5 → 30 s, 6 → 60, 7 → 120, 8 → 240, 9+ → 300.
 */
export const computeLockout = (
  failedCount: number,
  lockedUntil: string | null,
  now: Date,
): LockoutState => {
  if (failedCount < MAX_ATTEMPTS) return { locked: false, retryAfterSeconds: 0 };

  const remaining = secondsUntil(lockedUntil, now);
  if (remaining > 0) return { locked: true, retryAfterSeconds: remaining };

  const over = failedCount - MAX_ATTEMPTS;
  return {
    locked: true,
    retryAfterSeconds: Math.min(BASE_LOCKOUT_SECONDS * 2 ** over, MAX_LOCKOUT_SECONDS),
  };
};

// ── registration ──────────────────────────────────────────────────────────

export const MAX_REGISTRATION_ATTEMPTS = 5;
export const REGISTRATION_WINDOW_SECONDS = 3600;

/**
 * Registration gets a flat window rather than a doubling curve: five mistyped
 * email addresses is a student who cannot remember what they signed up with,
 * not someone probing for accounts. Escalating would lock them out of their
 * own sign-up for minutes over a typo.
 *
 * **Not yet called.** `auth_attempts` holds a single counter row with no column
 * distinguishing login from registration, so wiring this up means either a
 * second row or a scope column — and neither is in migration v2. Sharing one
 * counter is not an option: five bad password attempts would then block
 * registration too. See the migration's header comment.
 *
 * `attemptCount` and `lastFailureAt` are therefore registration's own, and are
 * not the fields `getAuthAttemptState` currently returns.
 */
export const computeRegistrationLockout = (
  attemptCount: number,
  lastFailureAt: string | null,
  now: Date,
): LockoutState => {
  if (attemptCount < MAX_REGISTRATION_ATTEMPTS) return { locked: false, retryAfterSeconds: 0 };
  if (!lastFailureAt) return { locked: true, retryAfterSeconds: REGISTRATION_WINDOW_SECONDS };

  const windowEnd = new Date(lastFailureAt).getTime() + REGISTRATION_WINDOW_SECONDS * 1000;
  if (Number.isNaN(windowEnd)) return { locked: false, retryAfterSeconds: 0 };

  return { locked: true, retryAfterSeconds: Math.max(0, Math.ceil((windowEnd - now.getTime()) / 1000)) };
};
