/**
 * The geometry of a profile picture. → [[Avatar]]
 *
 * Pure arithmetic, and it lives in `utils/` rather than in `avatarService`
 * because that is the only layer this project tests — see `jest.config.js` for
 * why, and `Roadmap` -> "Phase 2 — Pure Utilities". The service does the native
 * work; this decides *what* the native work should be handed.
 *
 * The one non-obvious decision in here is that the rect is expressed in the
 * coordinates of the image **after** it has been resized, not before. The
 * manipulator chain is `resize` then `crop`, so a rect in source coordinates
 * would be scaled by the resize and land somewhere else entirely. Computing it
 * post-resize is what makes the two steps composable, and composing them is what
 * means the app decodes the full-size photo once instead of twice.
 */

/**
 * The stored edge length, in pixels.
 *
 * 512 is deliberate rather than "as big as the source". The avatar renders at
 * 64 dp, which is 192 physical pixels on a 3x screen, so 512 is already more
 * than twice the resolution anything can draw — and it is a flat ~40 KB of JPEG
 * however large the original was. Raising this costs storage for pixels nothing
 * displays; lowering it shows JPEG artefacts on a high-density screen.
 */
export const AVATAR_EDGE = 512;

/** JPEG quality for the stored copy. A photograph, not flat art, so 0.8 is plenty. */
export const AVATAR_COMPRESS = 0.8;

/** A crop rectangle, in the coordinate space of the image it is applied to. */
export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * The largest centred square of a `width` x `height` image, after it has been
 * resized so that `width` is `edge`.
 *
 * Returns `null` for dimensions that cannot be trusted. `expo-image-picker`
 * documents `width` and `height` as possibly `0` "when the system did not
 * provide the value", which happens with some Android content providers — and a
 * crop rect computed from them would be `NaN`, which the native side does not
 * reject so much as quietly produce a blank image from. A `null` here tells the
 * caller to resize and stop, which yields a correct image with whatever framing
 * the student chose in the picker's own editor. That is a much better outcome
 * than refusing the picture, or storing an invisible one.
 */
export const centreSquareRect = (
  sourceWidth: number,
  sourceHeight: number,
  edge: number = AVATAR_EDGE,
): CropRect | null => {
  // `Number.isFinite`, not just `> 0`. `Infinity` passes `> 0`, and then
  // `Infinity * 512 / Infinity` is `NaN`, which the clamp below quietly turns
  // into a 1x1 rect — a technically valid crop that throws away the whole
  // photograph. A dimension no camera reports is a dimension not to be trusted.
  if (!Number.isFinite(sourceWidth) || !Number.isFinite(sourceHeight)) return null;
  if (!Number.isFinite(edge)) return null;
  if (!(sourceWidth > 0) || !(sourceHeight > 0)) return null;
  if (!(edge > 0)) return null;

  // `resize({ width: edge })` preserves the aspect ratio, so the height that
  // resize produces is this — and it is the height the crop has to be measured
  // against, not the source height.
  //
  // This is deliberately **not** clamped to `edge`. A portrait photo resizes to
  // something taller than the edge, and the surplus is exactly what the crop is
  // for; clamping it away first would leave `(scaledHeight - side)` at zero and
  // crop the surplus off the *top* only, pushing the student's face to the
  // bottom edge of the circle. The clamp belongs on `side`, below.
  const scaledHeight = Math.round((sourceHeight * edge) / sourceWidth);

  // A very extreme panorama (1000:1) can round the scaled height to 0. `side`
  // is floored at 1 so the rect still has area — a zero-area crop makes the
  // native side produce nothing at all.
  const side = Math.max(1, Math.min(edge, scaledHeight));

  return {
    // Rounded, because the native rect is integral on Android and a fractional
    // origin is at best ignored and at worst rejected.
    originX: Math.round((edge - side) / 2),
    originY: Math.round((Math.max(1, scaledHeight) - side) / 2),
    width: side,
    height: side,
  };
};
