# 0006 Publish a Bundled ESM Build

Date: 2026-05-14

## Status

Proposed — not yet implemented.

## Context

Cold-start `register-startup.import.p95` is dominated by Node's
`--experimental-strip-types` parsing of ~150 .ts files in src/. Sprint
2 lazy-loading reduced top-level import cost from 655 ms to 531 ms but
the parse cost still dominates because Pi loads pi-crew via jiti. A
single bundled `dist/index.mjs` (esbuild target node22, ESM, source-map
preserved, peer deps externalized) would skip per-file parse + module
resolution and is the next big lever.

## Decision (proposed)

Adopt a dual-ship layout for one release cycle:

- `index.ts` → keeps current behaviour (Pi via jiti).
- `dist/index.mjs` → published under `package.json#exports["."]` with
  appropriate `default` / `import` keys; tree-shaken; peers external.
- `pi.extensions[]` updated to `[ "./dist/index.mjs" ]` only after a
  smoke test pass on Linux + macOS + Windows.

If smoke fails on any OS, dual-ship is kept indefinitely and the
extension key falls back to `./index.ts`.

## Alternatives considered

1. Pre-compile to .js (tsc) — same run-time hit because Pi still loads
   many files; only saves the strip-types step.
2. SWC bundle — faster than esbuild but adds another tool. esbuild is
   already in the npm ecosystem and well-tested for Node ESM.
3. Status quo — keeps p95 ≈ 530 ms which is fine for non-interactive
   use but visible on first widget paint.

## Consequences

Positive:
- Cold-start `register-startup.import.p95` projected to drop to ~150–
  250 ms on the same hardware.
- Source-map preserved so error stacks still point at .ts lines.

Tradeoffs / risks:
- Pi extension loader behaviour with bundled ESM is unverified across
  versions. Dual-ship lets us roll back if any OS breaks.
- Bundle invalidates lazy-import boundaries at file granularity; we'll
  rely on `import()` calls at code-level boundaries instead.
- `npm pack --dry-run` size grows by one extra file; offset by deleting
  unused .ts in publish step. Net wire size lower because fewer files.

## Next steps

1. Prototype on `perf/bundle-prototype` branch; measure delta with
   `npm run profile:startup`.
2. Add `scripts/build-bundle.mjs`.
3. Run `npm run smoke:release` on all 3 OS images.
4. Update `package.json#exports`, `pi.extensions[]`, `files[]`.
5. Land ADR as "Accepted" only after dual-ship soak.
