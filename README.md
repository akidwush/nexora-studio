# NEXORA Studio

Standalone creative-tools website; deliberately separate from NEXORA V1/V2.

## Step 1 capabilities
- Responsive React + TypeScript landing page and workspace.
- **HTML Motion Lab:** HTML/CSS/JS code editing, four reusable motion presets, iframe-sandboxed preview, aspect ratio controls, and standalone HTML export. No video export in this tool yet.
- **Image to Vector Mosaic:** converts uploaded PNG/JPEG/WebP offline to vector-cell SVG; export SVG or PNG. This is not contour tracing or AI image-to-code.
- **Studio Pro:** real original multi-track editor can be built and served separately under `/studio-pro/`. Upstream source is pinned, **not copied to this repo**, and its original MPL-2.0 notices are maintained.
- **AI Motion Generator:** future, not active.

## Development
Node.js 22+.

```sh
npm install
npm run dev
npm test
npm run build
```

## Optional *full editor* build
```sh
npm run studio:sync
npm run build:full
node scripts/verify-full-build.mjs
npm run preview
```

Full build artifact is validated automatically by `.github/workflows/full-studio.yml` on `studio-step1-editor` or on manual dispatch. This never deploys or modifies NEXORA V1/V2.

See [Step 1 QA & limitations](docs/STEP1.md), [architecture](docs/ARCHITECTURE.md) and [third-party licensing](docs/THIRD_PARTY.md). Do not put authentication on the same origin as the unreviewed upstream editor.
