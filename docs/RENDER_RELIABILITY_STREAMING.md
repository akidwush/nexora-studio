# HTML / Canvas export: Stage A fidelity, Stage B streaming

This is first-party NEXORA Studio code. The separately hosted, patched upstream Studio Pro from PR #9 is **not** an authenticated multi-tenant execution platform. Its upstream project imports and unrelated rendering paths still require a separate audit.

## Stage A: reliability and fidelity

- The HTML export and Canvas preset encoder independently decode the produced H.264 MP4 at **first / midpoint / last** frame indices. The exact frame list is `[0, floor(N/2), N-1]`, deduplicated. Frame timestamps remain index/FPS rather than render wall-clock time.
- Raw HTML preview sampled from a separate isolated session is compared (RGBA, including alpha) with its matching captured export frame. Each of the three MP4 reference frames is composited against the configured *opaque* MP4 matte and compared with real decoded video pixels. MP4 is lossy and does **not** retain transparency. PNG downloads still preserve alpha.
- The sandbox explicitly awaits custom embedded `@font-face` data fonts and uses actual `FontFace.load()` plus `document.fonts.ready`. An undecodable font fails with an actionable message rather than silently falling back. Font byte input must be a *self-contained* `data:font/` or vetted `data:application/font...` URL; remote fonts are unsupported.
- Every embedded HTML `<img>` and SVG `<image>` must have a valid self-contained `data:image` URL and decode successfully before capture. Missing/invalid images fail deterministically and are documented. Ordinary remote media/audio, CSS URLs and iframe embeds remain unsupported. Arbitrary advanced CSS, external assets and physical Android fidelity are not claimed.
- The export UI shows per-frame mean RGB error and severe-pixel percentage, plus a local JSON diagnostics download on success or failure. By default, reports contain only settings, rendering stage, frame indices/metrics and bounded errors. Including HTML/CSS/SVG/JS is **opt-in** and may expose secrets: review before sharing. Nothing is uploaded.
- Real Chrome regression fixtures in `tests/html-render-matrix.browser.mjs` exercise transformations/keyframes/opacity, gradients/shadows/pseudo-elements, inline SVG, embedded font and PNG, malformed data fonts/images, and decoded-frame parity; `artifacts/html-render-fidelity-matrix.json` is retained as a downloadable CI artifact. In-browser font fixture bytes are read from the separately fetched pinned upstream during CI, not copied into published app assets.
- Diagnostics are **reproducible for supported deterministic sandbox APIs and specified browser environment**, not a guarantee of identical output on all GPUs/fonts/codecs. Missing source can prevent complete third-party reproduction.

## Stage B: backpressured file-backed export

- **Compatible download** (default): `BufferTarget` retains the original HTML + Canvas behavior and auto-download. It works without File System Access API or OPFS.
- **Streaming · save to device** (opt-in, if available): only offered in a secure context with `showSaveFilePicker`, `navigator.storage.getDirectory`, and writable streams. The save picker starts directly from the button click **before** any asynchronous rendering.
- `StreamTarget` writes MediaBunny output in bounded 1 MiB chunks through a `WritableStream` into a uniquely named **temporary OPFS file**. This respects the underlying writer's backpressure, avoiding a growing contiguous MP4 `ArrayBuffer`. It does *not* mean the whole renderer uses constant RAM (raster/canvas/frame decoding and H.264 buffering still consume memory).
- The chosen user file is **not modified** during encoding/verification. After all required frames pass decoded-video checks, `File.stream().pipeTo(destinationWritable)` copies the staged verified MP4 with browser stream backpressure. On error/cancel, cancel unfinished MediaBunny output, abort a failed destination copy if needed, and remove OPFS staging in `finally`. Never present an incomplete video as success. Power loss and browser crashes can interrupt cleanup; storage eviction and quota errors remain possible.
- Standard non-fragmented MP4 remains the default for compatibility; the OPFS-backed `StreamTarget` supports positional writes. Do not concatenate StreamTarget chunks or change to fragmented MP4 without testing seeking/player support.
- While OPFS staging avoids holding an entire MP4 in JavaScript memory, temporary storage and final chosen destination may briefly occupy roughly two copies of the output on disk. In low-storage mode, use compatible download or shorter clips. Browser limitations and file handle permissions are surfaced rather than bypassed.

## Running the checks

```sh
npm ci
npm test
npm run build
npm run studio:sync
npm run build:full
node scripts/verify-full-build.mjs
npx playwright install chromium chrome
node tests/html-fidelity.browser.mjs
node tests/html-render-matrix.browser.mjs
node tests/video.browser.mjs
```

Reproduce a reported mismatch by using its exact output size, frame rate, duration, matte, selected frame index and source only when the source was explicitly included. Negative image/font fixtures and expected error categories are committed in the browser-matrix test. Do not switch off CSP, give a sandbox `allow-same-origin`, or run user JavaScript in an authenticated editor to make a failing effect render.
