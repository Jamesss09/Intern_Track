/**
 * Name formatting. Pure functions.
 *
 * Separate from `dateFormatter` on purpose: that module's header says it is the
 * only place that converts stored values to *display strings for dates*, and a
 * first name is not one. Folding it in would make the file's stated contract
 * false and put an unrelated concern under the name that describes it.
 */

/**
 * `"James Carl B Enquig"` -> `"James"`.
 *
 * Used for the dashboard greeting, where the full name already appears one line
 * below in the identity card and repeating all four names makes a greeting that
 * wraps on a 320 dp screen.
 *
 * Splits on `\s+` rather than a literal space so a name padded or line-wrapped
 * with multiple spaces — which a phone keyboard and a paste buffer both invite —
 * still yields a clean first token instead of an empty string.
 *
 * The `?? ''` is not decoration: `"".trim().split(/\s+/)` returns `['']`, so
 * the result is always a string and this only documents that no caller has to
 * guard against `undefined` for a name typed into a free-text field.
 */
export const firstNameOf = (fullName: string): string => fullName.trim().split(/\s+/)[0] ?? '';
