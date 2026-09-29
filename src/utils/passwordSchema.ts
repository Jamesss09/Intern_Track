/**
 * The password rule, in one place.
 *
 * Registration and change-password must agree exactly. A second hand-written
 * copy is how the two drift — and the drift is invisible until a student picks
 * a password that registers cleanly and is then rejected when they change it,
 * with nothing in the message to explain why. Both screens import this.
 *
 * A zod schema rather than a plain predicate, because the screens validate a
 * whole form at once and need per-field paths to attach messages to.
 */

import { z } from 'zod';

/**
 * 8+ characters with at least one letter and one number.
 *
 * Modest on purpose. This is a local-only app with no server, so the realistic
 * threat is someone unzipping the `.apk` and attacking the stored hash
 * offline — which length and PBKDF2 iterations defend against, not a sprawling
 * composition rule the user cannot remember. See `utils/passwordHasher`.
 */
export const passwordSchema = z
  .string()
  .min(8, 'Use at least 8 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/[0-9]/, 'Include at least one number');
