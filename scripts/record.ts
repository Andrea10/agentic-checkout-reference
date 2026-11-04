/**
 * The demo, as a terminal recording (T14).
 *
 * `npm run demo:record` runs `tsx scripts/demo.ts` — the demo itself, not the
 * `npm run demo` wrapper, whose header lines vary with the npm version — and
 * writes what it printed as asciicast v2 files:
 *
 * - `docs/demo.cast`, the whole output;
 * - `docs/demo-run3.cast`, run 3 only: its banner, the five attempts and the
 *   closing invariant, cut from the same output;
 * - `docs/demo-run3.svg`, run 3 rendered as an animated SVG, so a README on
 *   GitHub can show it (GitHub plays neither a `.cast` nor asciinema's player).
 *
 * The timing is made up from the text, never read off a clock: a fixed delay
 * per line and a fixed pause before each run's banner (D150). The demo's own
 * output is byte-identical across invocations, so the files are too, and
 * `scripts/record.test.ts` pins their hashes.
 *
 * An argument picks what is written: `all` (the default), `full` or `run3`.
 *
 * asciicast v2: https://docs.asciinema.org/manual/asciicast/v2/ — a header
 * line `{"version": 2, "width": .., "height": ..}`, then one JSON array per
 * line, `[time, "o", data]`, with the time in seconds from the start.
 */

import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/** The repository root, one level above this file. */
export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Where each file goes, relative to the root. */
export const FULL_CAST = 'docs/demo.cast';
export const RUN_THREE_CAST = 'docs/demo-run3.cast';
export const RUN_THREE_SVG = 'docs/demo-run3.svg';

/** The delay before each line is printed, in milliseconds. */
export const LINE_DELAY_MS = 300;

/** The extra pause before each run's banner (and the closing one), in ms. */
export const BOUNDARY_PAUSE_MS = 2000;

/** The terminal the casts describe. The widest demo line is 164 columns. */
export const WIDTH = 166;
export const HEIGHT = 40;

/** The rule the demo prints above and below a banner. */
const SECTION_RULE = '-'.repeat(74);
const TITLE_RULE = '='.repeat(74);

/**
 * The environment the demo runs in: `env` without its `ACR_` variables, so the
 * recording is always of the default stub rail, whatever the shell has set.
 */
export function childEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const kept: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(env)) {
    if (!name.startsWith('ACR_')) kept[name] = value;
  }
  return kept;
}

/** Runs `tsx scripts/demo.ts` and hands back what it printed. */
export function captureDemo(): string {
  const result = spawnSync(join(ROOT, 'node_modules', '.bin', 'tsx'), ['scripts/demo.ts'], {
    cwd: ROOT,
    env: childEnv(process.env),
    encoding: 'utf8',
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0 || result.stderr !== '') {
    throw new Error(`demo exited ${String(result.status)}: ${result.stderr}`);
  }
  return result.stdout;
}

/** The output as lines, without the newline that ends the last one. */
function linesOf(text: string): string[] {
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}

/** True when line `i` is the rule that opens a run's banner or the closing one. */
function opensBoundary(lines: readonly string[], i: number): boolean {
  const next = lines[i + 1] ?? '';
  return (
    (lines[i] === SECTION_RULE && next.startsWith(' RUN ')) ||
    (lines[i] === TITLE_RULE && next === ' WHAT TO READ NEXT')
  );
}

/**
 * Run 3 alone: from the rule above its banner up to, not including, the
 * rule above "WHAT TO READ NEXT". The demo's text is not changed to make
 * this possible; the cut is found by its banners, and fails loudly if they
 * move.
 */
export function sliceRunThree(text: string): string {
  const lines = linesOf(text);
  const banner = lines.findIndex((line) => line.startsWith(' RUN 3 — '));
  const closing = lines.indexOf(' WHAT TO READ NEXT');
  if (banner < 1 || lines[banner - 1] !== SECTION_RULE) {
    throw new Error("run 3's banner was not found in the demo's output");
  }
  if (closing <= banner || lines[closing - 1] !== TITLE_RULE) {
    throw new Error('the closing banner was not found after run 3');
  }
  return lines.slice(banner - 1, closing - 1).map((line) => `${line}\n`).join('');
}

/** The demo's text as an asciicast v2 file, one output event per line. */
export function toCast(text: string): string {
  const lines = linesOf(text);
  const header = JSON.stringify({ version: 2, width: WIDTH, height: HEIGHT });
  const events: string[] = [];
  let ms = 0;
  lines.forEach((line, i) => {
    ms += LINE_DELAY_MS + (opensBoundary(lines, i) ? BOUNDARY_PAUSE_MS : 0);
    // Integer milliseconds over 1000 prints the shortest decimal, the same
    // on every run.
    events.push(JSON.stringify([ms / 1000, 'o', `${line}\r\n`]));
  });
  return [header, ...events].map((line) => `${line}\n`).join('');
}

/** One line of a cast as it is printed: the time and the text, newline cut. */
interface CastLine {
  readonly seconds: number;
  readonly text: string;
}

/** Reads back the events `toCast` writes. Other casts are not its business. */
export function readCast(cast: string): { width: number; lines: CastLine[] } {
  const [header, ...events] = linesOf(cast);
  const { width } = JSON.parse(header ?? '{}') as { width: number };
  const lines = events.map((event) => {
    const [seconds, , data] = JSON.parse(event) as [number, 'o', string];
    return { seconds, text: data.replace(/\r\n$/, '') };
  });
  return { width, lines };
}

/** Escapes text for an SVG text node. */
function xml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * A cast as an animated SVG: each line appears at its event's time, and
 * stays (D151).
 *
 * Each line is hidden by an animation that lasts until its time and then
 * ends, so a viewer that does not animate shows every line at once, and so
 * does one that asks for reduced motion. `textLength` holds each line to
 * its column count, whichever monospace font the viewer has.
 */
export function toSvg(cast: string): string {
  const { width, lines } = readCast(cast);
  const font = 14;
  const column = 8.4;
  const row = 18;
  const pad = 16;
  const svgWidth = Math.round(pad * 2 + width * column);
  const svgHeight = pad * 2 + lines.length * row;
  const texts = lines
    .map((line, i) => {
      if (line.text === '') return '';
      const y = pad + (i + 1) * row - 5;
      const length = (line.text.length * column).toFixed(1);
      return (
        `<text x="${pad}" y="${y}" textLength="${length}" lengthAdjust="spacingAndGlyphs"` +
        ` style="animation-duration:${line.seconds}s">${xml(line.text)}</text>`
      );
    })
    .filter((text) => text !== '');
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${svgHeight}" viewBox="0 0 ${svgWidth} ${svgHeight}">`,
    '<style>',
    `text{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Liberation Mono",monospace;font-size:${font}px;fill:#d0d7de;white-space:pre;animation-name:wait;animation-timing-function:step-end}`,
    '@keyframes wait{from,to{opacity:0}}',
    '@media (prefers-reduced-motion:reduce){text{animation:none}}',
    '</style>',
    `<rect width="${svgWidth}" height="${svgHeight}" rx="6" fill="#0d1117"/>`,
    ...texts,
    '</svg>',
    '',
  ].join('\n');
}

/** What each argument writes. */
export type Target = 'all' | 'full' | 'run3';

/** Builds the files `target` names from the demo's text, path to contents. */
export function build(text: string, target: Target): Map<string, string> {
  const files = new Map<string, string>();
  if (target !== 'run3') files.set(FULL_CAST, toCast(text));
  if (target !== 'full') {
    const cast = toCast(sliceRunThree(text));
    files.set(RUN_THREE_CAST, cast);
    files.set(RUN_THREE_SVG, toSvg(cast));
  }
  return files;
}

/** True when this file is the process's entry point rather than an import. */
function isRunDirectly(): boolean {
  const entry = process.argv[1];
  return entry !== undefined && fileURLToPath(import.meta.url) === entry;
}

if (isRunDirectly()) {
  const target = process.argv[2] ?? 'all';
  if (target !== 'all' && target !== 'full' && target !== 'run3') {
    process.stderr.write(`demo:record: unknown target ${target}; use all, full or run3\n`);
    process.exit(1);
  }
  for (const [path, contents] of build(captureDemo(), target)) {
    writeFileSync(join(ROOT, path), contents);
    process.stdout.write(`wrote ${path}\n`);
  }
}
