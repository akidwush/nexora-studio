# Security audit: pinned Studio Pro monolith and project ingress

**Scope:** NEXORA Studio only, `simplearyan/studio-pro` pinned at
`a3d145faeca9b08ab53bb994bb64accb2c356b89`. This is a source audit and a
**quarantine patch**, not an authorization to accept projects from the public.
NEXORA V1 and V2 are not modified. The older sandboxed modular HTML renderer and
first-party NEXORA HTML Motion editor still exist independently.

## Reproducible inspected upstream inventory

The upstream recursive Git tree was reviewed, including the 2.65 MB monolithic
`index.html`, HTML clip and HTML-in-Canvas modules, preloaders, Vite/PWA
configuration, the client WebCodecs worker and the separately located
automation/demo assets. These locations refer to the **pinned original** source
and deliberately remain stable. They are a source-path audit, not evidence
that every possible browser execution path is safe.

| Surface / original source | Finding | Enforced disposition |
| --- | --- | --- |
| `index.html:6911-7010`, `:8211-8283`, `:26947-26988` | Four dynamic iframe creators and multiple direct `contentDocument`/window reads; HTML, JS and external font URLs written into the editor-origin frame for regular clips, export and WAAPI overlay | All four constructors force opaque `sandbox="allow-scripts"`; monolithic HTML/WAAPI draw, clip creation, inline editor/pre-render and seek are **disabled**. Do not try to restore DOM reads through `allow-same-origin`. |
| `index.html:7152-7288` | HIC renderer executes `clip.js` via privileged `new Function` and assigns `clip.html` to an editor-owned sandbox DIV using `innerHTML` | Old HIC clip drawing/creation and direct script compiler disabled; separately patched modular HIC routes still render through the audited opaque iframe. |
| `index.html:26844-26916`, `:27504-27662` | Standalone HTML/HIC editor previews used non-isolated `srcdoc`, dynamic script compilation and iframe window seeking | Both modal iframes are opaque; unsafe old previews/editors disabled, HIC generated dynamic compiler deleted. |
| `index.html:33625-33709` | `.spcomp` import and `.js/.mjs` composition import; JS ran via `new Function` in main editor window with access to `window.StudioPro` and `window.State` | Both loaders fail closed **before** any FileReader, script execution, or project creation; compiler removed. |
| `index.html:35294-35320`, `:34252-34258` | Shared JSON project import used by picker AND drag-and-drop; checked only `app` and `version` | Shared import function gated, including drag-drop; no public imported project persisted or executed. |
| `index.html:15793-15813`, `:34736-34759` | External preset and template JSON parsed with minimal shape checks and then rendered in rich HTML by gallery/sidebar code | Both external import functions gated. An `input.accept` attribute is **not** a content security check. |
| `index.html:33788-33867`, `:33935-34021` | Persisted localStorage projects also feed `applyProject`; old projects may contain HTML/HIC clips or URLs | Validator on every `applyProject` before state mutation (220 clips/32 tracks/2 MiB JSON max, reject prototype keys, HTML/HIC/WAAPI and known active/remote clip sources); project registry IDs are restricted before they enter inline attributes, and project gallery only accepts bounded base64 PNG/JPEG/WebP thumbnails. If an old on-device project is blocked during startup, a fresh safe workspace opens while the original project JSON remains stored for manual export. This is intentionally coarse and NOT a public JSON validator. |
| `index.html:27985-28225`, `:18079-18105`, `:23119-23135`, `:35628-35654` | Client media import, audio library, subtitles and reimport/folder assets | Front-door MIME and size checks **plus a bounded 16-byte file-signature check before decoding** are enforced on the audited primary media picker, audio library and project media reimport. Current caps: 20 MiB image (PNG/JPEG/WebP/GIF), 90 MiB audio, 250 MiB video, and up to 1 MiB subtitles; SVG is not accepted as a direct image. Signature checks are only an initial rejection filter, not complete file parsing or proof that compressed content is safe. Secondary source replacement, per-clip SFX, named/batch Markdown audio, audio-library replacement and reimport now perform the same pre-decode magic/size checks through mandatory second-pass patch. Media batch is capped at 20 and replacement/audio folders at 64; browser codecs still need resource exhaustion and decompression stress testing. |
| `src/html-in-canvas/preload.js:24-101`; `index.html:7220-7245` | Privileged fetch of external images and fonts followed by HTML serialization | Old direct HIC paths gated; editor-site `connect-src 'self'` blocks external browser fetch, third-party font preconnect removed. Do not re-enable without a resource proxy and strict allowlist. |
| `index.html:34405-34560` | Third-party AI API keys were read and written in plaintext `localStorage` on the unsafe editor origin | Key panel and save are gated and former AI credential reads/writes removed; never supply dashboard keys/cookies to the dedicated editor origin. Existing stale localStorage keys on old installations cannot be retroactively retrieved or erased reliably by a source patch; migrate manually only after separate security review. |
| `vite.config.js`, `index.html:96` | PWA runtime cache held CDN JS and Google Fonts; vendor test/demo pages were copied as raw HTML and CDN Lucide was executable | Separate editor builds no PWA/workbox or copied raw demo HTML; existing SW registrations unregistered opportunistically, Lucide shipped as bundled local vendor JS; restrictive editor meta CSP inserted as defense-in-depth. Delete old service worker caches at hosting migration and add **actual HTTP response headers**. |
| `automation/html-static/api.js`, `docs/html-in-canvas/*.html`, `_archive/*` | Additional upstream executable demos and automation helpers, not part of the modern editor's Vite entrypoint | Do not copy these into the separately published editor; test compiled artifact for missing raw demos and service worker. Audit any future exposure of these files independently. |

**Additional legacy-storage containment:** old `custom_presets` and `studioPro_designTemplates` JSON is deliberately **not rehydrated or modified**; built-in presets/templates remain available, while the custom-preset/template save UI is temporarily blocked. Old custom font records are filtered by restricted CSS-safe family name and bounded base64 data-font URI, and the primary font picker checks size/name and initial font magic bytes before reading. Unsafe font records remain in storage for offline recovery but never reach privileged `<style>` elements. Previously generated custom presets/templates must wait for typed-schema migration.

## Architectural policy

- Keep the existing NEXORA dashboard on its own trusted origin. Host patched
  Studio Pro on a **different registrable site**, never a `/studio-pro`
  subfolder or a sibling subdomain that shares dashboard session cookies.
- The public editor never receives dashboard API secrets, VVIP tokens,
  credentialed API CORS, or dashboard auth redirects. No programmatic upload or
  cross-project server permissions are permitted by this patch.
- Run the mandatory fixed-SHA monolith patch *after* the original mandatory
  three-module isolation patch. Fail the build if the pinned raw file's SHA,
  any important code anchor, or any expected safety check changes.
- The new static scan outputs `artifacts/studio-pro-security-audit.json`. A
  malicious JSON/script/import Chromium test outputs
  `artifacts/studio-pro-public-ingress-chromium.json`; all prior
  sandbox, mobile and export tests remain in the full Actions workflow.
- External public importing is **disabled without an environment override**:
  any explicit `NEXORA_PUBLIC_STUDIO_IMPORTS=1` or
  `VITE_STUDIO_PRO_PUBLIC_IMPORTS=1` aborts the build. A future public-import
  implementation needs a *separate reviewed feature* and new tests.

## Outstanding public-release blockers

1. **Typed data validation:** replace all untrusted project, template, preset,
   subtitles and scene/model imports with separate versioned deep schemas,
   canonical allowed keys, maximum aggregate decoded bytes and finite numeric
   constraints; never merge arbitrary project objects into trusted state.
2. **Rich HTML sinks:** audit and rewrite the monolith's many `innerHTML`,
   `insertAdjacentHTML`, inline event-handler and dynamic CSS/URL templates.
   Escape UI text/attributes and enforce a specific rendering policy, not one
   global sanitizer. Source-sink enumeration alone is not a completed XSS audit.
3. **Legacy parity:** if old HTML/HIC/WAAPI authoring must return, replace each
   monolithic preview, pre-render, seek, overlay and export path with an
   authenticated-*free*, message-only opaque iframe; verify timeline and pixel
   fidelity. Simply reversing the gates is an unsafe regression.
4. **Assets:** MIME and short magic bytes alone are spoofable. Extend signature checks to *all* secondary pickers, then add full decoder validation, bounded dimension/decompression/audio decode, blob URL lifecycle cleanup and folder quota tests.
5. **Dependencies and demos:** triage current pinned upstream npm audit
   advisories; do not automatically update the upstream SHA without rerunning
   downstream patch, licensing and regression tests. Never publish raw
   `automation/`, `docs/` test renderers or `_archive/` assets.
6. **Dependency evidence:** CI generates a bounded report, `artifacts/studio-pro-upstream-dependencies.json`, from a FULL `npm audit` of the pinned upstream lock. High/critical/unavailable status remains a public-release blocker; the report does not auto-upgrade third-party dependencies or pretend the quarantine build cleared advisories.
7. **Hosted proof:** verify DNS/TLS, real header CSP (with no unsafe eval and
   tested compatibility), strict frame-ancestors, host-only cookies, no
   credentialed CORS, redirect allowlist and old PWA cache/SW invalidation.
8. **Resource exhaustion:** a sandboxed iframe can still consume excessive CPU,
   memory or disk. Use robust process isolation plus quotas and timeouts before
   letting one user's untrusted project run near another user's data.

## Reproduce

```sh
npm ci
npm test
npm run studio:sync
npm run build:full
node scripts/verify-full-build.mjs
node scripts/verify-studio-public-ingress.mjs
npx playwright install chromium chrome
node tests/studio-pro-isolation.browser.mjs
node tests/studio-pro-ingress.browser.mjs
```

The status after these tests is `QUARANTINE_PASS`, **never**
`PUBLIC_IMPORT_READY`. The preserved MPL-2.0 upstream LICENSE and NOTICE must
stay with the separate editor build.
