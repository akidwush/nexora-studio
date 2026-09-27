# Cinematic 10-second HTML/WebGL fidelity (experimental)

This engine takes **one complete HTML file** containing inline CSS, inline JavaScript,
inline shaders, and embedded assets. The exact capture path runs in an opaque
`sandbox="allow-scripts"` iframe with a virtual timeline, rasterizes every
requested frame, encodes locally to H.264 MP4, and verifies the actual decoded
video against the matching captured source. This is NOT a generic website
recorder or an assertion of 100% fidelity for every HTML animation.

## Safe quality profiles

| Profile | Duration | Resolution | Rate | Save mode | Encoded target |
| --- | --- | --- | --- | --- | --- |
| Standard short | 1-3s | 640x360 | 24/30/60 FPS | Download / Streaming | 3 Mbps |
| Compact cinematic | 8/10s | 640x360 | 24/30/60 FPS | Download / Streaming | 5 Mbps |
| Desktop 720p cinematic (opt-in) | 10s only | 1280x720 | 24/30 FPS | Local OPFS streaming **required** | 9 Mbps |
| Standard short HD | 1-3s | up to 1280x720 / 720x1280 | 24/30 FPS | Download / Streaming | 7 Mbps |

Existing 5-second compact exports retain the previous bitrate/checkpoint
contract. Desktop HD/10s is exposed only when the browser supports a secure
local file picker + OPFS, reports at least **8 GB** device memory, and has a fine
pointer. This is a conservative **UI prefilter, not a memory guarantee**:
hardware, GPU/driver limits, thermal throttling and browser codecs can still
reject an individual project. HD/10s requires a real chosen destination in the
backend too; the in-memory path rejects it. Switching off Streaming
automatically returns to the safe 3-second HD limit.

## How matching export is measured

- Same original document and renderer in preview and export, separate isolated
  deterministic sessions. A user-selected raw preview frame must pass the
  existing tight RGBA comparison before the encoder finishes.
- The first rendered WebGL frame is painted on the encoder canvas before the
  output starts (avoids known black-first-frame initialization).
- All timeline frames are captured at index-derived timestamps. For **10s at
  30 FPS**, exactly **300 frames** are encoded. For durations above 8s, **seven
  checkpoints** at `[0,50,100,150,200,250,299]` are independently checked
  against decoded MP4; 8-second exports use five; 5s or shorter use three.
  There is **no threshold weakening** to claim success.
- Preview and output comparisons use H.264 decoded pixels, not MP4 metadata or
  a single static screenshot. All samples must pass **before** the user's
  streaming destination is written. Other frames are encoded but cannot be
  guaranteed solely by sampling.
- The 10-second compact and 720p cinematic quality modes raise bitrate for
  detailed shaders/gradients; they are target bitrates, not lossless exports.

## Reproducible black-hole reference

`fixtures/black-hole-10s.html` is a self-contained Canvas2D black hole plus a
CSS-animated HUD and inline JavaScript (no outside URLs or private data).
`tests/cinematic-black-hole.browser.mjs` submits that **whole HTML file**
through the built Studio UI; exports 10s/30FPS via real Canvas2D rendering,
WebCodecs H.264, and OPFS; requires all seven in-browser MP4 parity checkpoints;
uses independent FFprobe to check exact duration, 300 frames and AVC Baseline;
and independently decodes the output canvas ring pixels through FFmpeg to reject an
animated overlay on top of a **frozen WebGL shader**. It also checks the
desktop-eligible opt-in 720p preview is 1280x720 instead of upscaled 360p, and
switching storage to normal download disables the high-risk long HD plan.

```sh
npm ci
npm run build
npx playwright install chromium chrome
node tests/cinematic-black-hole.browser.mjs # requires ffprobe and ffmpeg
```

**Release gate:** dedicated 10s CI and the existing full video/security suites
must pass, followed by playback inspection on the target physical Android
device; do not infer universal Android compatibility from headless Chrome.

## Honest boundaries

No unrestricted external CDN/scripts, arbitrary import maps, audio track
synchronization, WebGPU, worker-driven/offscreen canvas, DOM-privileged embeds,
hidden cross-origin resources or automatic conversion of unrelated HTML
engines. The recognized pinned Three.js r172 graph remains allowed, but
requires CDN access. Arbitrary shaders, excessive geometry and JS loops may
exhaust the browser/GPU; the opaque frame protects origin access but does not
supply a hard CPU quota. The engine reports unsupported input instead of
silently changing user code or exporting a misleading frozen video.

H.264 does not preserve transparency, so select a matte matching the desired
video background; transparent reference PNG stays separate. Uploading several
external linked CSS/JS files is **not** the same as uploading one self-contained
HTML file: embed those files before submitting the HTML document.

## Separate WebGL2 stress diagnostic

`fixtures/black-hole-webgl2-diagnostic.html` retains the more demanding
native shader example for further renderer engineering. The 10s Canvas2D
black-hole regression does **not** establish fidelity for this shader. Its
current independent headless Chromium runs showed intermittent GPU readback
(visible color on one iframe but black in the next) and a false-positive
blank shader despite preview-to-MP4 parity. This diagnostic is intentionally
not promoted to a supported universal-WebGL claim or silently substituted
for a user's real shader source. The existing standalone WebGL and pinned
Three r172 shorter browser regressions remain separate release gates.
