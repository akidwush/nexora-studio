# Studio Pro security boundary / deployment playbook

## Identified source sinks and fix
Pinned upstream: simplearyan/studio-pro at a3d145faeca9b08ab53bb994bb64accb2c356b89.
The third-party HTML clip renderer created a default-permission iframe and wrote
HTML/CSS/JS to its same-origin document. The HTML clip editor also injected
user preview into editor DOM with innerHTML, and HTML-in-Canvas ran user code
with new Function in the editor's main window.

The mandatory downstream patch in scripts/harden-upstream.mjs patches these
THREE audited surfaces. User code now arrives through postMessage into a fresh
sandbox="allow-scripts" iframe WITHOUT allow-same-origin, then returns only
bounded PNG bytes; the editor never accesses the sandbox's DOM, document
or Window globals. The host checks iframe source, per-session ID, frame request
ID, PNG signature, encoded payload size, decoded dimensions and request timeout.
User code shares the sandbox with its own capture helper and can forge its
sandbox result: therefore treat every returned pixel as UNTRUSTED content,
never a proof of safe execution or authorization.

The preview frame uses the same isolated mechanism. The PNG bridge does NOT
allow the untrusted iframe to choose callback names, issue editor commands,
receive auth tokens, or transfer arbitrary project/DOM data from the editor.

Security and compatibility limitations:
- This hardens the inspected modules. It is **NOT** a comprehensive audit of
  the upstream monolithic index.html, project importers, media URL handlers,
  PWA caches, extensions or dependencies. No public multi-tenant project
  ingestion or authenticated VVIP integration until those are fully reviewed.
- Remote assets, cross-origin fonts and external resources in HTML clips may
  not render. Use self-contained markup, local CSS and data-URI images/fonts.
  The editor may still have other trusted media workflows outside HTML clips.
- The iframe sandbox limits parent access, NOT CPU/memory consumption or all
  possible external navigation/egress. Limit clip size, dimensions and time.
  Server-side multi-tenant untrusted execution needs process/browser isolation
  beyond this client-side boundary.

## New quarantine of the previously unreviewed monolith

The expanded audit in [STUDIO_PRO_SECURITY_AUDIT.md](STUDIO_PRO_SECURITY_AUDIT.md) found additional monolithic HTML/WAAPI direct iframe DOM access, privileged HIC script compilation, arbitrary composition-script loading, JSON/template/preset imports, externally fetched assets, plaintext localStorage AI API keys, and additional demo/PWA entrypoints. A **mandatory, exact-Git-blob-locked** second patch (`scripts/harden-upstream-ingress.mjs`) now disables unreviewed monolithic HTML/HIC/WAAPI editor and import entrypoints while preserving the separately patched modular HTML renderer and first-party NEXORA HTML Motion. It restricts selected local assets, removes privileged compilers and AI key storage, and builds a static-only separate editor artifact. The security result is QUARANTINE, **NOT permission to accept untrusted public projects**. See the new report and browser test. Public-facing multi-tenant execution remains blocked until all release gates pass.

## Artifacts and hosting: enforce distinct sites

`npm run build` creates `dist/` (dashboard only).
`npm run studio:sync && npm run studio:build` creates
`dist-studio-pro/` (patched upstream editor only), including LICENSE/NOTICE.
`npm run build:full` generates both independent folders for CI but NEVER
mixes their files. No automatic deployment has been configured here.

Create TWO independent hosting projects using this SAME repo:

1. Dashboard: build command `npm run build`, output directory `dist`.
   Optional environment variable at BUILD TIME:
   `VITE_STUDIO_PRO_URL=https://YOUR-ISOLATED-EDITOR-SITE/`.
   If omitted, invalid, non-HTTPS, or matching the dashboard origin, the
   optional editor link stays disabled. No relative /studio-pro/ fallback.
2. Dedicated editor: build command
   `npm run studio:sync && npm run studio:build`, output
   `dist-studio-pro`. Attach a domain on a DIFFERENT **registrable site**
   (not merely a subdomain sharing eTLD+1 with dashboard) and no dashboard
   auth, API, storage keys, trusted CORS, or shared cookies.

For Vercel, create distinct projects and set their Build Command and
Output Directory as above (not a monorepo rewrite into one Vercel deployment).
Do not use a proxy rewrite /studio-pro/* on the main domain. Use host-only,
secure, HTTP-only auth cookies on the dashboard (prefer __Host- prefix,
Path=/, no Domain attribute). Deny Access-Control-Allow-Credentials from the
editor site on any authenticated API. Deny editor origins in auth redirects.
Do not enable user-data integration with the editor until separately reviewed.

For public editor deployment, also consider response headers:
`Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`,
a tested restrictive frame-ancestors policy, HSTS (once TLS is verified),
and an editor-specific CSP that still permits the editor's vetted features.
The in-frame CSP is enforced by the isolated HTML renderer itself. Test your
hosting environment: static build alone DOES NOT create the DNS/TLS boundary.

## Release tests
- Unit checks verify external URL fails closed, disallow unsafe iframe flags,
  and verify the build does not copy an editor into the dashboard.
- `scripts/verify-full-build.mjs` fails if editor bytes appear in dist/ or
  if upstream assets compile for /studio-pro/ instead of dedicated root /.
- Chromium browser smoke must serve dashboard and editor from different
  local origins; project-code isolation browser tests should prove sandboxed
  HTML/JS executes but cannot read/modify the editor or dashboard parent.
- Security review and real hosted origin/cookie/CORS verification still gate
  any public untrusted-project release.
