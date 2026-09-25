# Architecture

Independent creative-tools application. This code never touches NEXORA V1 or V2.

- React + TypeScript + Vite shell, mobile-first at 360/390/412px.
- HTML Motion Lab: user code in sandboxed iframe WITHOUT allow-same-origin, plus restrictive CSP; HTML download supported. No video export yet.
- Image to Vector Mosaic: offline sampled pixel-to-SVG rectangles; not full tracing.
- Studio Pro: separate opt-in build from pinned upstream commit, served under /studio-pro/. Its source stays in ignored vendor/ with original LICENSE and NOTICE, and license files are copied to output. Review third-party code before production auth integration.
- Future work: real video encoding, professional tracing, AI generation via secure server backend, quota, user projects.

## Build gates

Ordinary npm run build only builds the NEXORA shell. A full Studio Pro build requires npm run studio:sync and npm run build:full. No deployment is enabled in this branch; connect hosting only after passing checks. Do not automatically redeploy NEXORA V1 or V2.

Never expose NEXORA login cookies, API keys, or VVIP state to unreviewed third-party code. For authenticated releases prefer hosting the optional upstream editor on an isolated origin or perform a full security audit first.
