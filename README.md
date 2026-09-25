# NEXORA Studio

Independent creative/motion tools website. NEXORA V1 and V2 remain untouched.

## Working tools
- **HTML Motion Lab**: isolated HTML/CSS/JS editor, four animation presets, preview ratios, standalone HTML export.
- **Image to Vector Mosaic**: process PNG/JPEG/WebP locally into SVG rectangle artwork; download SVG/PNG. Not smooth contour tracing or AI image-to-code.
- **Canvas Motion Video** (Step 2): a dedicated deterministic frame-rendered Canvas animation tool. Three built-in templates, responsive preview/timeline, 12/24/30 FPS, bounded 1–12s exports up to HD, real H.264 MP4 using MediaBunny/WebCodecs with progress/cancel. Silent video only.
- **Studio Pro**: optional full original third-party timeline editor with MPL-2.0 attribution, built separately from pinned revision. See docs/THIRD_PARTY.md.
- **AI Motion Generator** is still a roadmap item.

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
