# Universal 8-second video export

NEXORA Studio exposes one simple contract across HTML Motion Lab (four tabs),
complete HTML/WebGL, Canvas Motion Video and AI Motion Generator:

- duration: exactly **8 seconds**;
- default cadence: **30 FPS / 240 encoded frames**;
- mobile-safe default: **640×360**;
- format: silent H.264 Baseline MP4 with Fast Start;
- processing: local browser rendering, with no server video upload.

Legacy durations remain accepted by bounded validators so earlier regression
tests are not destroyed, but they are hidden from the normal product UI.

## Device policy

The UI never silently changes duration, FPS, resolution or renderer. Compact
640×360 output uses the compatible in-memory path. Eight-second HD is offered
only when the browser supports a secure local picker and OPFS, reports at least
8 GB memory, and behaves like a desktop fine-pointer device. Otherwise the UI
explains the limitation and offers 640×360. This is a conservative prefilter,
not proof that every GPU-heavy project will render.

## Quality and memory safeguards

- Every timestamp comes from `frameIndex / fps`, never rendering wall time.
- Eight-second output verifies five distributed decoded frames:
  `[0, 60, 120, 180, 239]` at 30 FPS.
- The source preview and decoded H.264 pixels keep the existing bounded fidelity
  thresholds; failures never publish a staged streaming file.
- OPFS streaming remains local, uses backpressure and deletes its temporary
  staging entry after completion or cancellation.
- A source/settings change aborts work and invalidates stale preview/video data.
- WebGL loss, an empty/black renderer, unsupported codec or mismatched frame
  order stops the export instead of producing a false success.

## Reproducible proof

`fixtures/black-hole-8s.html` is a self-contained Canvas2D black-hole animation
with inline CSS and JavaScript. `tests/universal-8s.browser.mjs` submits the
whole document through the production UI and requires:

- a genuine 240-frame, 8-second 640×360 H.264 MP4;
- five source-to-decoded fidelity checkpoints;
- independent FFprobe duration, frame count, dimensions and pixel format;
- independent FFmpeg samples proving the black-hole canvas moves at the start,
  midpoint and final frame;
- H.264 Baseline, level ≤ 3.1 and Fast Start;
- no horizontal overflow at Android widths 360, 390 and 412 pixels;
- HD streaming to fail closed without shortening the video when normal download
  is selected.

```sh
npm ci
npm run build
npx playwright install chromium chrome
node tests/universal-8s.browser.mjs # requires ffprobe and ffmpeg
```

Headless Chrome is not proof of every physical Android decoder. Release still
requires playback and memory testing on representative mid-range phones.

## Honest boundaries

MP4 has no alpha or audio in this pipeline. Clicks, taps and other interactive
input are not recorded automatically; transitions must be scheduled
deterministically in source code. Full HTML remains limited to embedded assets
and the recognized pinned Three.js r172 graph. Arbitrary CDNs, WebGPU, workers,
offscreen canvas, remote pages and unrestricted website recording are not
supported. The separate native WebGL2 stress diagnostic remains experimental
and is not evidence that every shader-heavy project works on Android.
