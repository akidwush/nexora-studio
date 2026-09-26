# One-file HTML + WebGL → real H.264 MP4 (experimental)

## Why the supplied second HTML failed before

The user's sample is **not** merely an HTML fragment: it includes
`<!doctype html>`, a document-level stylesheet, an importmap, ESM Three.js
modules, an instanced procedural L-system tree, custom vertex/fragment GLSL
shaders, a WebGL renderer and an endless requestAnimationFrame animation.
Pasting that into the old standalone **HTML tab** lost its document head and
importmap, and the old no-network CSP could not load the modules. Recording a
single visual preview screenshot would not produce a video.

This stage introduces a **separate complete-document source mode** while
retaining the working four-tab editor. Upload/paste the whole file; do not
separate its HTML, CSS or script. Pasting complete `<!doctype html>... </html>`
into the existing HTML tab automatically switches into Full HTML Document
Mode without rewriting the original editable source.

## Three.js bare `three` import-map compatibility

The original adapter recognized the user's `"./three"` CodePen map,
but rejected a common `"three"` bare-module import-map entry
(e.g. `"three": "https://esm.sh/three@0.172.0?bundle"`),
producing the reported `Unsupported module mapping: three` **before**
a browser could attempt WebGL rendering.

The adapter now accepts the **known pinned Three.js r172** core, WebGL/TSL
and addon aliases declared via matching CodePen, esm.sh, jsDelivr or unpkg
patterns. Approved aliases are all rewritten to the **same exact pinned**
jsDelivr r172 graph before any module is loaded; the incoming URLs are
never fetched directly by the normalized import map. Other versions,
arbitrary hosts, new script packages, unsafe protocols and unexpected
CDN parameters remain blocked. This fixes an import-map compatibility
class, not every HTML file, GPU problem or remote CDN outage.

The original standalone uploaded L-system file had only `"./three"`
aliases. A different pasted or modified source with a bare `"three"`
mapping triggers the newly supported path *only* if its mapped URL is
one of the recognized r172 forms. The full HTML used on device may
still require inspection if it contains another library version.

## Supported capture path

1. Parse and validate one complete bounded HTML file with DOMParser (inert
   parent-side parsing). Original head/body, inline styles, importmap and
   module script source are kept in order. Prohibit frames, plugins, remote
   ordinary scripts/resources and unknown importmaps.
2. For the user's **specific Three.js 0.172.0 importmap only**, map all core,
   WebGLRenderer and addon imports to the same explicit pinned
   `https://cdn.jsdelivr.net/npm/three@0.172.0/` dependency graph. Remove
   the obsolete redundant CodePen TSL global script. No other external modules
   are authorized; internet is required for these pinned modules. The
   importmap rewrite is **an intentional compatibility operation** rather
   than a guarantee of universal CodePen support.
3. Run the resulting page **only** in an isolated
   `sandbox="allow-scripts"` iframe without same-origin privileges. Inject
   WebGL `preserveDrawingBuffer: true` compatibility **before** the user's
   scripts, with DPR 1 to bound mobile GPU readback. Install existing
   deterministic RAF/Date/performance/CSS clock and PNG capture in that same
   frame. Unsupported external image/font/network access remains blocked.
4. At frame N, advance deterministic time to `N * 1000 / FPS`; user RAF
   callbacks re-render shader uniforms and geometry rotation. Rasterize the
   **actual WebGL canvas bitmap**, together with the HTML background/layout,
   inside the existing computed-style snapshot (not a one-off poster).
5. Preserve all existing transparent-PNG reference capture, matte-composited
   H.264 MediaBunny encoding, explicit preview-raw RGBA comparison,
   first/mid/last decoded-frame parity checks, cancel, and optionally
   OPFS→StreamTarget→verified file streaming.

## Supported range and limitations

- Inline self-contained HTML/CSS/JS and WebGL without external assets; the
  single *document* mode additionally allows only the pinned Three r172
  module graph used in the sample. This does **not** authorize general
  websites, npm installations, arbitrary importmaps, network fetch, remote
  CSS/images/fonts or iframe-based documents.
- Exactly supported H.264 outputs: 24/30 FPS up to 720p for 1–3 seconds;
  60 FPS only at 640×360. Full-document mode adds 5/8/10-second durations
  **only** at 640×360. Users can concatenate verified segments later; this
  change does not promise unrestricted-duration exports.
- The uploaded example uses **14 L-system expansion iterations**,
  programmatically merging a large number of new CylinderGeometries and
  rerunning the entire tree at every canvas click. Browser GPU memory and
  initialization latency can be significant, particularly on Android.
  Start an experimental export with iterations ~6–8 if 14 is too heavy;
  the source is never silently altered by the engine.
- WebGL2/GLSL/CORS/codec support varies by browser. Lost GPU context,
  failed module downloads, slow render times and module loader errors must
  stop export rather than produce a blank frame represented as a success.
  WebGPU/worker/offscreen canvas, user audio/video timeline synchronization,
  arbitrary dynamic imports and external renderers remain out of scope.
- Opaque iframe is DOM/cookie separation, not a hostile-code resource quota:
  a tight JS loop or massive 3D geometry can still freeze the tab. No
  public untrusted multi-tenant project ingestion is approved by this patch.
- Pinned Three remote code is third-party code executing on an opaque
  origin with no privileged parent bridge; never pass NEXORA auth to it.
  The CDN can be unavailable. Review actual hosting CSP/egress before release.
- Silent H.264 MP4 does not preserve alpha, so choose an opaque background.
  `Match export preview` uses the same renderer and must be inspected.

## Browser regression

```sh
npm ci
npm test
npm run build
npx playwright install chromium chrome
node tests/full-document.browser.mjs
```

The Chrome integration test loads a self-contained one-file WebGL2 document,
exports a **real** 30 FPS MP4 with three-frame decoded verification, and
compares first/later decoded pixels to prove an actual animated canvas
rather than a static screenshot. It then loads a small Three r172
ShaderMaterial scene through the same original CodePen-style importmap
(specifically core, WebGLRenderer, BufferGeometryUtils and OrbitControls),
requires a real PNG export-matching preview and decoded video, and verifies
mobile editor widths 360/390/412. This test is mandatory in the PR's
full browser workflow: if CDN or Three fails, the build is **not** claimed to
support the supplied document yet. It does not test original
`iterations: 14` performance on a physical phone.
