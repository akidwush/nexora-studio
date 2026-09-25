# NEXORA Studio

Independent creative/motion tools website. NEXORA V1 and V2 remain untouched.

## Working tools
- **HTML Motion Lab**: HTML/CSS/**SVG**/JavaScript editor with opaque-origin sandbox, optional deterministic frame timeline (12/24/30/60 FPS; frame seek/rewind via replay), strict CSP, display-only console, Run/Stop, four motion presets, and standalone HTML export. HTML-to-MP4 **now has a bounded native capture pipeline**: sequential sandbox-controlled computed DOM snapshots are rasterized into PNG frames and encoded as local H.264 MP4 at exact frame-index timestamps (24/30 FPS up to HD; 60 FPS at 640×360, maximum 3 seconds). Not all browser CSS/media features are supported; see HTML capture documentation. The sandbox is for previews, not arbitrary hostile-code execution. See [HTML sandbox boundaries](docs/HTML_SANDBOX.md).
- **Image to Vector Mosaic**: process PNG/JPEG/WebP locally into SVG rectangle artwork; download SVG/PNG. Not smooth contour tracing or AI image-to-code.
- **Canvas Motion Video** (Step 2): a dedicated deterministic frame-rendered Canvas animation tool. Three built-in templates, responsive preview/timeline, 12/24/30 FPS, bounded 1–12s exports up to HD, real H.264 MP4 using MediaBunny/WebCodecs with progress/cancel. Silent video only.
- **Studio Pro**: optional full original third-party timeline editor with MPL-2.0 attribution, built separately from pinned revision. See docs/THIRD_PARTY.md.
- **AI Motion Generator (Step 4)**: working local prompt-to-storyboard drafts and editable preview; real Gemini-powered scene generation via a fail-closed optional Vercel API with strict server rate limits and key isolation. Exports validated scene JSON or genuine browser-rendered silent MP4. See docs/STEP4.md.

## Development
Requires Node 22+.

    npm install
    npm run dev
    npm test
    npm run build

## Full original Studio Pro integration

    npm run studio:sync
    npm run build:full
    node scripts/verify-full-build.mjs
    npx playwright install chromium
    npm run test:browser
    node tests/video.browser.mjs

CI builds and browser-tests these separately. No production deploy is configured. Do not co-host unreviewed upstream code with real NEXORA auth sessions.

Read docs/STEP1.md, docs/STEP2.md, docs/ARCHITECTURE.md and docs/THIRD_PARTY.md.

## Security hardening
Default development binds **only to 127.0.0.1**; Vite is pinned to patched 7.3.6. The committed lockfile is required by CI (`npm ci`) with a high/critical npm audit gate. See [SECURITY.md](SECURITY.md). Do not use an internet-facing development server. Studio Pro and Gemini have separate security gates and are not production-authorized by this dependency patch.

## Export-to-preview fidelity
The HTML MP4 exporter now has an **export-accurate preview** computed by the same opaque-origin DOM snapshot routine used per frame during H.264 encoding. It supports explicitly chosen MP4 matte backgrounds, raw transparent PNG frame downloads, deterministic CSS/WAAPI/SVG/keyframe/JS clock replay, self-contained system typography and data-embedded `@font-face` rules. A selected preview frame is independently recaptured and compared pixel-for-pixel **including alpha** during export. After encoding, Chrome can decode and compare the selected video frame within a bounded tolerance for H.264 compression; if the parity check fails, no completed download is presented. Live interactive iframe at different viewport sizes is not guaranteed pixel-identical: use the export-matching preview for fidelity inspection.
