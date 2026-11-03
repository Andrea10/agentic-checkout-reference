/**
 * The recording, as a test (T14).
 *
 * The casts and the SVG are built from what `tsx scripts/demo.ts` prints,
 * with timing made up from the text (D150), so their bytes are fixed. The
 * hashes below pin them: a change to the demo's output, to a delay or to the
 * cut moves a hash, and so does a file in `docs/` that was not regenerated.
 * After a deliberate change, run `npm run demo:record` and update the hash.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { beforeAll, describe, expect, it } from 'vitest';

import {
  FULL_CAST,
  HEIGHT,
  ROOT,
  RUN_THREE_CAST,
  RUN_THREE_SVG,
  WIDTH,
  build,
  captureDemo,
  readCast,
  sliceRunThree,
} from './record.js';

/** The SHA-256 of each file `npm run demo:record` writes. */
const PINNED: Record<string, string> = {
  [FULL_CAST]: '542f768484ea8bf8a8fe3661be48506a8a16861042b5e573cf983f873aba613c',
  [RUN_THREE_CAST]: 'd33d804ece910bf6869b8fa3158ca3acb4171eec0c81922465ba933363897271',
  [RUN_THREE_SVG]: 'b16539f03bedfc44c6808a97cedf9fe2734eccd98c757f093ec8bd7cf4372db4',
};

function sha256(text: string): string {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

let output = '';
let files = new Map<string, string>();

beforeAll(() => {
  output = captureDemo();
  files = build(output, 'all');
}, 60_000);

describe('the files demo:record writes', () => {
  it.each(Object.keys(PINNED))('%s has its pinned hash', (path) => {
    expect(sha256(files.get(path) ?? '')).toBe(PINNED[path]);
  });

  it.each(Object.keys(PINNED))('%s in the repository is the one built now', (path) => {
    expect(readFileSync(join(ROOT, path), 'utf8')).toBe(files.get(path));
  });

  it('are the same on a second capture of the demo', () => {
    expect(build(captureDemo(), 'all')).toEqual(files);
  }, 60_000);

  it('writes only run 3 for run3 and only the whole demo for full', () => {
    expect([...build(output, 'run3').keys()]).toEqual([RUN_THREE_CAST, RUN_THREE_SVG]);
    expect([...build(output, 'full').keys()]).toEqual([FULL_CAST]);
  });
});

describe('each cast is asciicast v2', () => {
  it.each([FULL_CAST, RUN_THREE_CAST])('%s has the header and events the format names', (path) => {
    const [header, ...events] = (files.get(path) ?? '').trimEnd().split('\n');

    expect(JSON.parse(header ?? '')).toEqual({ version: 2, width: WIDTH, height: HEIGHT });
    let last = 0;
    for (const event of events) {
      const parsed = JSON.parse(event) as unknown[];
      expect(parsed).toHaveLength(3);
      const [time, code, data] = parsed;
      expect(typeof time).toBe('number');
      expect(time as number).toBeGreaterThan(last);
      expect(code).toBe('o');
      expect(data as string).toMatch(/\r\n$/);
      last = time as number;
    }
  });

  it('prints the demo, line for line, and no line is wider than the terminal', () => {
    const { lines } = readCast(files.get(FULL_CAST) ?? '');

    expect(lines.map((line) => `${line.text}\n`).join('')).toBe(output);
    for (const line of lines) expect(line.text.length).toBeLessThanOrEqual(WIDTH);
  });
});

describe('the run 3 cast', () => {
  it('is cut from the same output, from its banner to the closing invariant', () => {
    const { lines } = readCast(files.get(RUN_THREE_CAST) ?? '');
    const text = lines.map((line) => line.text);

    expect(output).toContain(sliceRunThree(output));
    expect(text[1]).toBe(' RUN 3 — five attempts to spend past the mandate');
    expect(text.filter((line) => /^ATTEMPT \d OF 5 — /.test(line))).toHaveLength(5);
    expect(text).toContain('  5 attempts, 5 refused. Money moved by them: £0.00 (0 pence).');
    expect(text.join('\n')).not.toMatch(/RUN 1|RUN 2|WHAT TO READ NEXT/);
  });

  it('lasts about thirty seconds', () => {
    const { lines } = readCast(files.get(RUN_THREE_CAST) ?? '');
    const seconds = lines.at(-1)?.seconds ?? 0;

    expect(seconds).toBeGreaterThan(20);
    expect(seconds).toBeLessThan(40);
  });

  it('refuses an output whose run 3 banner has moved', () => {
    expect(() => sliceRunThree(output.replace(' RUN 3 — ', ' RUN THREE — '))).toThrow(/run 3/);
  });
});
