/**
 * Tests for the profile-picture geometry.
 *
 * → [[Avatar]]
 */

import { AVATAR_EDGE, centreSquareRect } from '@/utils/avatarImage';

describe('AVATAR_EDGE', () => {
  it('is more pixels than any display can show for a 64 dp avatar', () => {
    // 64 dp at the densest screen a phone ships (3x) is 192 physical pixels.
    // 512 is more than double that, so the stored file is never the limiting
    // factor in how sharp the circle looks.
    expect(AVATAR_EDGE).toBeGreaterThan(64 * 3);
  });

  it('is a whole number of pixels, because a native crop rect is integral', () => {
    expect(Number.isInteger(AVATAR_EDGE)).toBe(true);
  });
});

describe('centreSquareRect', () => {
  it('squares a landscape photo by cropping the sides, not the top and bottom', () => {
    // 4000x3000 resized to 512 *wide* becomes 512x384. The largest square in
    // that is 384x384, so the sides come off and the full height is kept. It is
    // the opposite of the intuitive reading, and getting it backwards crops the
    // student's face off the top and bottom instead.
    expect(centreSquareRect(4000, 3000)).toEqual({
      originX: 64,
      originY: 0,
      width: 384,
      height: 384,
    });
  });

  it('squares a portrait photo by cropping the top and bottom evenly', () => {
    // 3000x4000 resizes to 512x683, which is 171px taller than the edge. The
    // crop takes the middle 512 rows, so the face stays centred — originY is
    // 86, not 0. Clamping the scaled height to the edge before centring is the
    // bug this assertion exists to prevent, and it is invisible in a landscape
    // photo, so only a portrait case can catch it.
    expect(centreSquareRect(3000, 4000)).toEqual({
      originX: 0,
      originY: 86,
      width: 512,
      height: 512,
    });
  });

  it('needs no crop at all for a square source', () => {
    expect(centreSquareRect(1024, 1024)).toEqual({
      originX: 0,
      originY: 0,
      width: 512,
      height: 512,
    });
  });

  it('drops the surplus row to the bottom when the ratio does not divide evenly', () => {
    // 999x1000 resizes to 512x513 — one row taller than the edge. The square is
    // 512 and the leftover row goes below the crop, because `Math.round(0.5)`
    // rounds up, putting the lost row at the bottom. The bottom of a photograph
    // is where a face is not, so that is the right way round.
    const rect = centreSquareRect(999, 1000);
    expect(rect).not.toBeNull();
    expect(rect!.width).toBe(512);
    expect(rect!.height).toBe(512);
    expect(rect!.originY).toBe(1);
  });

  it('never produces a rect that runs off the resized image', () => {
    // Every ratio a camera or a screenshot can produce, checked against the
    // bounds the crop actually has to stay inside. A crop rectangle that
    // overhangs is not clamped by the native side — it produces an image smaller
    // than requested, or throws.
    const ratios = [
      [4000, 3000],
      [3000, 4000],
      [4032, 3024],
      [1920, 1080],
      [1080, 1920],
      [1000, 1000],
      [999, 1000],
      [1000, 999],
      [1600, 1200],
      [1200, 1600],
      [640, 480],
      [480, 640],
    ] as const;

    for (const [w, h] of ratios) {
      const rect = centreSquareRect(w, h);
      expect(rect).not.toBeNull();

      const scaledHeight = Math.round((h * AVATAR_EDGE) / w);
      expect(rect!.originX).toBeGreaterThanOrEqual(0);
      expect(rect!.originY).toBeGreaterThanOrEqual(0);
      expect(rect!.originX + rect!.width).toBeLessThanOrEqual(AVATAR_EDGE);
      expect(rect!.originY + rect!.height).toBeLessThanOrEqual(scaledHeight);
    }
  });

  it('always returns a square, whatever the source ratio', () => {
    for (const [w, h] of [
      [4000, 3000],
      [3000, 4000],
      [1000, 250],
      [250, 1000],
    ] as const) {
      const rect = centreSquareRect(w, h)!;
      expect(rect.width).toBe(rect.height);
    }
  });

  it('is measured against the resized image, not the source', () => {
    // The rect is an offset into a 512-wide image, so `originX` is bounded by
    // the edge and can never exceed it. `originY` is bounded by the *height*,
    // which for a 1:4 portrait is 2048 after resizing — so 768 is the correct
    // origin there, not a sign the numbers are in the wrong space.
    const rect = centreSquareRect(1000, 4000)!;
    const scaledHeight = Math.round((4000 * AVATAR_EDGE) / 1000);

    expect(scaledHeight).toBe(2048);
    expect(rect).toEqual({ originX: 0, originY: 768, width: 512, height: 512 });

    // A rect expressed in source coordinates instead would carry origins in the
    // thousands, which the native crop would reject or clamp.
    expect(rect.originX).toBeLessThan(AVATAR_EDGE);
    expect(rect.originY + rect.height).toBeLessThanOrEqual(scaledHeight);
  });

  it('refuses dimensions the picker may report as zero', () => {
    // expo-image-picker documents width/height as possibly 0 "when the system
    // did not provide the value". A rect from those is NaN, and the native side
    // does not reject NaN so much as quietly render nothing. A null tells the
    // caller to resize without cropping, which still saves a usable picture.
    expect(centreSquareRect(0, 0)).toBeNull();
    expect(centreSquareRect(0, 3000)).toBeNull();
    expect(centreSquareRect(4000, 0)).toBeNull();
  });

  it('refuses negative or non-finite dimensions', () => {
    expect(centreSquareRect(-1, 100)).toBeNull();
    expect(centreSquareRect(100, -1)).toBeNull();
    expect(centreSquareRect(Number.NaN, 100)).toBeNull();
    expect(centreSquareRect(100, Number.NaN)).toBeNull();
    expect(centreSquareRect(Number.POSITIVE_INFINITY, 100)).toBeNull();
  });

  it('refuses a non-positive edge rather than dividing by it', () => {
    expect(centreSquareRect(100, 100, 0)).toBeNull();
    expect(centreSquareRect(100, 100, -5)).toBeNull();
  });

  it('survives an extreme panorama without a zero-area crop', () => {
    // 20:1 resized to 512 wide is 512 x 26, and 1000:1 rounds to a height of 1.
    // A zero-area rect makes the native side produce nothing at all.
    const extreme = centreSquareRect(20_000, 1000);
    expect(extreme).not.toBeNull();
    expect(extreme!.width).toBeGreaterThan(0);
    expect(extreme!.height).toBeGreaterThan(0);

    const flat = centreSquareRect(1_000_000, 1);
    expect(flat).not.toBeNull();
    expect(flat!.height).toBeGreaterThan(0);
    expect(flat!.originY).toBeGreaterThanOrEqual(0);
  });

  it('never returns a one-pixel avatar for a real photo', () => {
    // The `Math.max(1, ...)` clamp exists for degenerate ratios only. If it ever
    // started applying to ordinary input, a student would get a 1x1 dot and no
    // error, so the normal cases are asserted to be far above the floor.
    for (const [w, h] of [
      [4000, 3000],
      [3000, 4000],
      [4032, 3024],
      [1920, 1080],
    ] as const) {
      expect(centreSquareRect(w, h)!.width).toBeGreaterThan(256);
    }
  });

  it('rounds every field, because a fractional origin is not honoured natively', () => {
    const rect = centreSquareRect(1000, 1333)!;
    for (const value of [rect.originX, rect.originY, rect.width, rect.height]) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it('scales with a custom edge, so the unit under test is not hardcoded', () => {
    // Guards against a rectangle that happens to be right only because it
    // matches the one value the tests happened to use. 4000x3000 at edge 200 is
    // 200x150, so the square is the full height and the sides come off.
    expect(centreSquareRect(4000, 3000, 200)).toEqual({
      originX: 25,
      originY: 0,
      width: 150,
      height: 150,
    });
  });

  it('centres a portrait photo rather than cropping it from the top', () => {
    // The whole point of the unclamped `scaledHeight`. A portrait photo is taller
    // than the edge after resizing, and a crop taken from the top instead of the
    // middle puts the student's face against the bottom of the circle — wrong in
    // a way that is only obvious once someone looks at their own avatar.
    for (const [w, h] of [
      [3000, 4000],
      [3024, 4032],
      [1080, 1920],
    ] as const) {
      const rect = centreSquareRect(w, h)!;
      const scaledHeight = Math.round((h * AVATAR_EDGE) / w);

      expect(scaledHeight).toBeGreaterThan(AVATAR_EDGE);
      expect(rect.originY).toBeGreaterThan(0);
      // Compared against the *rounded* ideal: the origin is an integral number
      // of pixels, so half a pixel of rounding is the best it can do.
      expect(rect.originY).toBe(Math.round((scaledHeight - AVATAR_EDGE) / 2));
    }
  });
});
