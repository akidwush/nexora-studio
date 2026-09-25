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
