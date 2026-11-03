# RECORDING — the demo as a terminal recording

`npm run demo:record` writes three files, all generated and all committed:

| File | What it is |
| --- | --- |
| [demo.cast](demo.cast) | the whole demo, all three runs, as an asciicast v2 file (about 81 seconds) |
| [demo-run3.cast](demo-run3.cast) | run 3 only: its banner, the mandate, the five refused attempts and the closing invariant (about 27 seconds) |
| [demo-run3.svg](demo-run3.svg) | `demo-run3.cast` rendered as an animated SVG; the README shows this one |

A `.cast` file is text: one JSON header line, then one JSON array per printed
line, `[time, "o", data]`, as the
[asciicast v2 format](https://docs.asciinema.org/manual/asciicast/v2/)
defines. GitHub does not play `.cast` files in a README, so the SVG is there for
the page; the casts are there for any asciicast player, and for review.

## How the files are made

`scripts/record.ts` runs `tsx scripts/demo.ts` (the demo itself, not
`npm run demo`, which adds npm's own header lines that vary with the npm
version) and turns what it printed into the files above:

- **Timing is made up, not recorded** (D150). Each line comes 0.3 s after the
  one before it, with an extra 2 s before each run's banner and before the
  closing "WHAT TO READ NEXT". No clock is read, so the files depend on the
  demo's text alone. The demo's text is byte-identical across invocations on
  one machine, so the files are too.
- **Run 3 is cut, not run apart** (D152). The same captured output is sliced
  from the rule above run 3's banner to the rule above "WHAT TO READ NEXT".
  `scripts/demo.ts` is unchanged; if its banners move, the cut fails loudly
  rather than silently recording something else.
- **The SVG is drawn by the same script** (D151), with no dependency: one line
  of text per printed line, each hidden until its time in the cast. A viewer
  that does not run SVG animations, or that asks for reduced motion, shows
  every line at once.
- **The rail is always the stub.** Every `ACR_` variable is dropped from the
  demo's environment, so `ACR_RAIL=stripe` in your shell does not change the
  recording.

`scripts/record.test.ts` pins the SHA-256 of all three files, checks that the
files in `docs/` are the ones the current code builds, and checks the casts
against the format's header and event shape.

## Regenerate them

```bash
npm run demo:record              # all three files
npm run demo:record -- full      # docs/demo.cast only
npm run demo:record -- run3      # docs/demo-run3.cast and docs/demo-run3.svg only
```

A change to the demo's output, to a delay or to the cut changes the hashes, and
`npm test` fails until `PINNED` in `scripts/record.test.ts` is updated to the
new files. That is deliberate: the recording cannot drift from the demo
unnoticed.

## Render them another way

The SVG in this repository needs nothing installed. To make a GIF instead, use
[agg](https://github.com/asciinema/agg), asciinema's GIF generator (GPL-3.0, a
Rust binary, not a dependency of this repository). Its README says it reads
asciicast v1, v2 and v3 and shows the command shape `agg demo.cast demo.gif`:

```bash
agg docs/demo-run3.cast demo-run3.gif
agg docs/demo.cast demo.gif
```

agg has not been run against these files here. Its options (themes, font size,
idle-time limiting, which could shorten the 2 s pauses) are in
[its docs](https://docs.asciinema.org/manual/agg/).

## What the recording does not show

- **A real payment.** The recording is of the default rail, the stub, which
  moves no money. The Stripe test-mode rail (`ACR_RAIL=stripe`) is tested only
  against a mocked Stripe client: no live Stripe call has been made from this
  repository, so there is nothing to record.
- **A real terminal session.** Nobody typed this. The output is the demo's own,
  byte for byte, but the timing is synthetic: the pauses say nothing about how
  long anything took.
- **The `npm run` header lines**, and the command line itself. The casts start
  at the demo's first printed line.
- **The stdio transport.** The demo runs the merchant in-process (its "HOW THIS
  DEMO IS WIRED" block says so); `scripts/stdio-smoke.test.ts` covers stdio.
