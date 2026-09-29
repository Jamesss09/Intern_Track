/**
 * Base64, so an asset can be inlined into a document.
 *
 * This exists because the obvious three ways to get a base64 string out of a
 * file on a device all fail or are unreliable:
 *
 *  - `expo-file-system`'s `File` has **no** `base64()` or `base64Sync()`. It
 *    exposes `text()`, `bytes()` and `arrayBuffer()`. Calling `base64Sync()`
 *    throws `TypeError: not a function`.
 *  - `readAsStringAsync(uri, { encoding: EncodingType.Base64 })` on the package
 *    main entry is deprecated and **throws at runtime**; only the
 *    `expo-file-system/legacy` entry point still works, and new code should not
 *    be built on the escape hatch.
 *  - A global `btoa` is a browser API. Hermes does not promise one.
 *
 * So: read bytes, encode here. It is a dozen lines, has no dependencies, and is
 * unit-testable — which matters more than usual, because the failure it replaces
 * was swallowed by a `catch` and shipped as a document with a silently missing
 * seal. → [[PDF Export#The School Logo]]
 *
 * → [[Architecture#Decision 4: Business rules in utils, not in components]]
 */

/** Standard alphabet, including the `+/` tail. URL-safe variants are not wanted. */
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Encodes bytes as standard, padded base64.
 *
 * Padded (`=`) rather than unpadded, because this is only ever consumed by an
 * `<img src="data:...">`, which requires the padded form.
 *
 * @param bytes Raw file contents. Not mutated.
 */
export const toBase64 = (bytes: Uint8Array): string => {
  const { length } = bytes;
  let out = '';

  // Three bytes -> four characters. The final group is short whenever the input
  // is not a multiple of 3, and the missing characters become `=`.
  for (let i = 0; i < length; i += 3) {
    const hasB1 = i + 1 < length;
    const hasB2 = i + 2 < length;

    // Assemble one 24-bit group. The absent bytes read as 0 and are then
    // discarded by the padding below, so no masking of the first byte is needed.
    const b0 = bytes[i];
    const b1 = hasB1 ? bytes[i + 1] : 0;
    const b2 = hasB2 ? bytes[i + 2] : 0;
    const group = (b0 << 16) | (b1 << 8) | b2;

    out += ALPHABET[(group >> 18) & 63];
    out += ALPHABET[(group >> 12) & 63];
    out += hasB1 ? ALPHABET[(group >> 6) & 63] : '=';
    out += hasB2 ? ALPHABET[group & 63] : '=';
  }

  return out;
};

/**
 * A `data:` URI for an image, ready to drop into an `<img src>`.
 *
 * @param mimeType e.g. `'image/png'`. Passed through, not sniffed — the caller
 *   knows what it read.
 */
export const toDataUri = (mimeType: string, bytes: Uint8Array): string =>
  `data:${mimeType};base64,${toBase64(bytes)}`;
