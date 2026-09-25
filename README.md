# NEXORA Studio

Standalone premium creative-tools website. Mobile-first React + TypeScript + Vite, independent from NEXORA V1/V2.

## In this foundation

- HTML Motion Lab: edit HTML/CSS/JS, isolated preview, aspect ratio controls, export standalone HTML.
- Image to Vector Mosaic: convert uploaded PNG/JPEG/WebP locally into vector-cell SVG. This is not contour tracing.
- Optional pinned Studio Pro original editor, licensed MPL-2.0, built in its own directory if explicitly imported.
- AI motion generator is planned, not yet active.

## Commands

Node 22+ required.

    npm install
    npm run dev
    npm test
    npm run build

For optional upstream Studio Pro build:

    npm run studio:sync
    npm run build:full

This serves upstream editor from dist/studio-pro/ for static hosting. Do not share authentication state with unreviewed upstream components. See docs/ARCHITECTURE.md and docs/THIRD_PARTY.md. No production deployment is configured.
