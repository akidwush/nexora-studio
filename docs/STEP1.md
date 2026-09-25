# Step 1 — Editor integration & validation

## Scope
Step 1 focuses on a reliable creative workspace and a **real** Studio Pro upstream build, not on visual cloning.

1. NEXORA shell offers a responsive HTML Motion Lab with four local CSS motion presets, a sandboxed preview, and HTML download.
2. Local Image to Vector Mosaic offers generated SVG and PNG download. Pixel mosaic is not true Bézier/vector tracing.
3. A separately built, pinned Studio Pro editor supports its upstream timeline, HTML clips, and export features without copying its monolithic scripts into the NEXORA shell.
4. The `Step 1 - Build integrated editor` GitHub Actions workflow checks the full build, license/NOTICE, and the compiled `/studio-pro/` base and uploads a static artifact. This is **not** a production deployment.

## Integration instructions
To reproduce:
```sh
npm install
npm test
npm run studio:sync
npm run build:full
node scripts/verify-full-build.mjs
npm run preview
```
Open `http://localhost:4173/` and use the Studio Pro card, then review the editor at `/studio-pro/` in a browser.

## Required manual QA before deploying
- Desktop Chrome/Edge: create HTML clip; animate and scrub; export a 1080p MP4; play the resulting file; verify audio sync if audio was added.
- Desktop Firefox/Safari: check fallback or useful error messaging when WebCodecs codecs are unavailable.
- Android 360/390/412: NEXORA shell layout, editor controls, source uploads, SVG and PNG output.
- Verify no animation export claims are made for NEXORA's *own* HTML Motion Lab: it currently exports HTML only.
- Studio Pro upstream currently documents limitations with CSS animation frame seeking, backdrop-filter capture, and cross-origin images. Do not claim deterministic HTML clip rendering until separately validated.
- Third-party upstream hasn't undergone a full security audit. Keep NEXORA cookies, VVIP secrets, and provider credentials out of the upstream origin.

## Shipping policy
- **No automated deployment** to production in this stage.
- Host Studio Pro on a separate subdomain/origin *before* adding NEXORA auth or paid features.
- Keep MPL-2.0 LICENSE/NOTICE and covered-source availability obligations.
