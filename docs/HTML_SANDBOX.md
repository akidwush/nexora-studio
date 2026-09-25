# HTML Motion Lab — Step 1 sandbox execution

The NEXORA first-party editor previews self-contained **HTML, CSS, inline SVG and JavaScript**. A dedicated SVG tab can be edited independently from HTML.

## Boundaries
- Each Run creates a *fresh* `srcDoc` iframe with `sandbox="allow-scripts"` and **no** `allow-same-origin`. It has an opaque origin and cannot access parent DOM, login cookies or app localStorage.
- Restrictive in-document CSP forbids common external fetch/XHR/WebSockets, scripts/fonts/images, subframes, workers, form submissions, base URI and plugins. Self-contained inline HTML/CSS/SVG/JS and embedded data/blob images are supported.
- Diagnostics pass by `postMessage` with checked event.source and per-run identifier. This is *display-only, untrusted text*; the iframe can spoof its own diagnostic messages and receives no privileged action channel.
- Run and Stop create/destroy iframe instances. Source-size limits reject overly large inputs.

## Limitations
This iframe is an origin/DOM isolation boundary, **not** a fully hardened hostile-code VM. Browser CSP does not block every navigation-based network channel and cannot cap synchronous JavaScript CPU consumption. For public shared projects, isolate preview on a separate origin, enforce additional navigation/egress controls and operational resource limits before accepting untrusted files.

Exported standalone HTML loses the iframe sandbox when opened on its own, although a restrictive CSP remains; open only trusted exports.

This step **does not** implement deterministic capture or HTML-to-MP4. Existing Canvas-to-MP4 and separately built third-party Studio Pro remain unchanged.

## Step 2: controlled frame clock (same studio-step2-video branch)
- Optional controlled mode injects a self-contained virtual clock **before** user HTML/JS. Live mode remains unchanged.
- Frames use exact `index * 1000 / fps` timestamps, not cumulative native animation frames or wall-clock timers. Supports 12, 24, 30 and 60 FPS (at most 720 frames).
- The sandbox replaces Date/Date.now, performance.now (where writable), Math.random seeded sequence, requestAnimationFrame, and local setTimeout/setInterval for deterministic sequential replay. CSS Animations/Transitions and WAAPI are paused and seeked using the Web Animations API; SVG SMIL via `setCurrentTime()` where the browser supports it.
- The parent requests sequential frame N only after N-1 acknowledges a post-paint stable state. Backwards seek reloads the sandbox and replays all steps from frame zero to rebuild mutable JS state. An exact-frame slider and step controls expose timestamps and status.
- This is **best-effort for supported in-frame APIs**, not a general deterministic JavaScript VM. Crypto randomness, externally synchronized resources, HTML audio/video playback, network/navigation side channels, and intentionally hostile CPU loops are not controlled. The iframe can forge its own frame acknowledgements, so preview messages must never be considered trusted video proof.
- No arbitrary HTML→MP4 encoding is claimed in this step. A future renderer can use the sequential frame-ready handshake for capture after separate visual and codec verification.

## Step 3: controlled HTML → MP4 capture
A separate fresh opaque-origin renderer reproduces each HTML/CSS/SVG/JS frame under the existing virtual timeline. After every exact frame seek, the sandbox creates a computed-style HTML/SVG foreignObject snapshot, rasterizes it to local PNG and transfers the bytes back to the parent (no privileged commands). The parent validates sequential frame IDs/timestamps, decodes the PNG and submits it to MediaBunny CanvasSource at `index / fps` seconds. This preserves encoded frame cadence independently of wall-clock rendering speed. Restricts export to 1–3 seconds; 24/30fps HD or 24/30/60fps 640×360.

This is an intentionally limited first implementation, NOT pixel-perfect universal webpage capture. Requires self-contained HTML/CSS/inline SVG/JavaScript. No external images/fonts, video/audio/iframes, unrestricted CPU, cross-origin assets, 3D/complex filters or guaranteed full browser compositing fidelity. A hostile user script in the frame can forge exported bytes: the app treats them only as untrusted images and bounds/verifies PNG size and dimensions; do not equate this with a secure multi-tenant code executor. HTML snapshots may differ from live CSS pseudo/layout effects; report failures rather than silently claiming parity. Browser codec support is detected before export. No provider secrets, no server uploads, and no production deployment configured by this change.
