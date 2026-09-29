/**
 * Base64 encoding, checked against a reference implementation.
 *
 * The expectations are `Buffer`'s, not hand-written strings, so this asserts
 * agreement with an independent encoder across every input length rather than
 * re-stating the same table the implementation was built from. A base64 bug
 * corrupts an image in a way that is invisible until someone prints it, and a
 * hand-written table would only catch the cases somebody thought of.
 *
 * `Buffer` is available because the suite runs in `testEnvironment: 'node'`.
 * The implementation deliberately does not use it — see `utils/base64.ts`.
 */

import { existsSync, readFileSync } from 'node:fs';
import { join, normalize } from 'node:path';

import { toBase64, toDataUri } from '@/utils/base64';
import { buildTmcFormHtml } from '@/utils/tmcFormTemplate';
import type { Internship, User } from '@/types';

const bytes = (...values: number[]) => new Uint8Array(values);

/** Every length 0-8, so all four padding cases and all three alignments. */
const EVERY_LENGTH_UP_TO_EIGHT = Array.from({ length: 9 }, (_, n) => n);

describe('toBase64', () => {
  it.each(EVERY_LENGTH_UP_TO_EIGHT)(
    'matches Buffer for a %i-byte input',
    (n) => {
      const input = Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) % 256);
      expect(toBase64(input)).toBe(Buffer.from(input).toString('base64'));
    },
  );

  it('matches Buffer for every byte value', () => {
    const input = Uint8Array.from({ length: 256 }, (_, i) => i);
    expect(toBase64(input)).toBe(Buffer.from(input).toString('base64'));
  });

  it.each([
    [[], ''],
    [[77], 'TQ=='],
    [[77, 97], 'TWE='],
    [[77, 97, 110], 'TWFu'],
    [[77, 97, 110, 105], 'TWFuaQ=='],
  ])('encodes %o as %o', (input, expected) => {
    expect(toBase64(bytes(...input))).toBe(expected);
  });

  it('encodes the PNG magic number, the first bytes of a real seal', () => {
    expect(toBase64(bytes(0x89, 0x50, 0x4e, 0x47))).toBe('iVBORw==');
  });

  it('encodes a 3-byte group with no padding at all', () => {
    expect(toBase64(bytes(0xff, 0xff, 0xff))).not.toContain('=');
  });

  it('pads to a multiple of 4, which is what an <img src> requires', () => {
    for (let n = 0; n <= 8; n += 1) {
      const input = Uint8Array.from({ length: n }, (_, i) => i);
      expect(toBase64(input).length % 4).toBe(0);
    }
  });

  it('emits only alphabet and padding characters', () => {
    const input = Uint8Array.from({ length: 300 }, (_, i) => (i * 91) % 256);
    expect(toBase64(input)).toMatch(/^[A-Za-z0-9+/]*={0,2}$/);
  });

  it('treats high bytes as unsigned rather than going negative', () => {
    // The classic bug: masking with 0xFF after a signed shift turns 0xFF into
    // 0, silently corrupting the image rather than throwing.
    expect(toBase64(bytes(0xff))).toBe(Buffer.from([0xff]).toString('base64'));
    expect(toBase64(bytes(0xff, 0xff, 0xff))).toBe(Buffer.from([0xff, 0xff, 0xff]).toString('base64'));
  });

  it('does not mutate its input', () => {
    const input = new Uint8Array([1, 2, 3, 4, 5]);
    const copy = new Uint8Array(input);
    toBase64(input);
    expect(input).toEqual(copy);
  });

  it('is safe on a zero-length input', () => {
    expect(toBase64(new Uint8Array(0))).toBe('');
  });

  it('handles input longer than one 24-bit group without dropping bytes', () => {
    // A short input alone would not catch an off-by-one in the loop stride.
    const input = Uint8Array.from({ length: 10_000 }, (_, i) => i % 256);
    expect(toBase64(input)).toBe(Buffer.from(input).toString('base64'));
  });
});

describe('toDataUri', () => {
  it('builds a padded data URI with the given MIME type', () => {
    expect(toDataUri('image/png', bytes(77, 97, 110))).toBe('data:image/png;base64,TWFu');
  });

  it('produces exactly what an <img src> needs', () => {
    const uri = toDataUri('image/png', Uint8Array.from({ length: 7 }, (_, i) => i));
    expect(uri.startsWith('data:image/png;base64,')).toBe(true);
    expect(uri.split(',')[1].length % 4).toBe(0);
  });
});

/*
 * The regression this module was written for.
 *
 * `loadLogoDataUri` used to call `new File(uri).base64Sync()`, which does not
 * exist on `expo-file-system`'s `File`. The `TypeError` was swallowed by a bare
 * `catch`, so every export silently printed with no seal and nothing failed. The
 * unit tests above cannot catch that — it lives in the service, behind two
 * native modules — so the asset is encoded here directly and checked end to end:
 * real bytes in, a decodable PNG data URI inside the rendered document out.
 *
 * What this cannot cover is the `Asset.fromModule` / `File.arrayBuffer()` pair,
 * which are the only native calls in the chain. Those are now two lines each
 * and no longer do any encoding.
 */
describe('the real TMC_Logo.png', () => {
  const path = join(__dirname, '..', '..', 'assets', 'TMC_Logo.png');
  const file = new Uint8Array(readFileSync(path));

  it('exists where pdfService requires it, with the exact case', () => {
    // Metro and the device filesystem are case-sensitive, so a near-miss in
    // `require('../assets/TMC_Logo.png')` is a build error, not a wrong image.
    expect(path.endsWith(join('assets', 'TMC_Logo.png'))).toBe(true);
    expect(file.byteLength).toBeGreaterThan(0);
  });

  it('is a real PNG', () => {
    expect([...file.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  });

  it('survives the base64 round trip byte for byte', () => {
    expect(Buffer.from(toBase64(file), 'base64')).toEqual(Buffer.from(file));
  });

  it('lands in the rendered document as a decodable image', () => {
    const user = {
      id: 1, full_name: 'Juan Dela Cruz', email: 'j@e.com', password_hash: 'x',
      student_id: '2021-0142', course: 'BSIT', year_level: '3rd Year', block: '3A',
      created_at: '', updated_at: null,
    } as User;
    const internship = {
      id: 1, user_id: 1, company_name: 'BDMPC', position: 'IT Intern',
      required_hours: 486, start_date: '2026-06-01', end_date: null,
      is_active: 1, created_at: '',
    } as Internship;

    const html = buildTmcFormHtml({
      user, internship, records: [], monthIso: '2026-09-01',
      logoDataUri: toDataUri('image/png', file),
      generatedOn: new Date('2026-09-29T10:00:00Z'),
    });

    const src = html.match(/<img src="(data:image\/png;base64,[^"]+)"/);
    expect(src).not.toBeNull();
    // Same bytes back out of the document — the print engine will receive the
    // seal the repo holds, not a corrupted or empty image.
    expect(Buffer.from(src![1].split(',')[1], 'base64')).toEqual(Buffer.from(file));
  });

  it('is small enough to inline on every export', () => {
    // Guards the downscale. The original was 906 KB, which put 1.2 MB of
    // base64 into every single export for an image printed 28 mm wide.
    expect(file.byteLength).toBeLessThan(250 * 1024);
  });

  /*
   * The second bug, and the reason the first one took so long to find.
   *
   * `require('../assets/TMC_Logo.png')` sat in `src/services/`, so it resolved
   * to `src/assets/` — a directory that does not exist. Metro reported
   * "Cannot find module", the fallback printed without the seal, and every other
   * test in this suite still passed: they reach the asset through a path built
   * from `__dirname` in `src/utils/`, two levels down, which happened to be
   * correct *there* and said nothing about the service.
   *
   * So the path is not re-derived here — it is read out of the source and
   * resolved exactly as Metro resolves it. That fails on a wrong depth, a
   * renamed file, and a changed case, which is the whole point.
   */
  it('is the file pdfService actually requires, resolved the way Metro resolves it', () => {
    const serviceDir = join(__dirname, '..', 'services');
    const source = readFileSync(join(serviceDir, 'pdfService.ts'), 'utf8');

    const required = source.match(/require\('([^']*TMC_Logo\.png)'\)/);
    expect(required).not.toBeNull();

    const resolved = normalize(join(serviceDir, required![1]));
    expect(existsSync(resolved)).toBe(true);
    expect(resolved).toBe(normalize(path));
  });
});
