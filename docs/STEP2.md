# Step 2 — Native Canvas MP4 Engine

A new Canvas Motion Video tool renders deterministic built-in motion presets. Freeform untrusted HTML/JavaScript from HTML Motion Lab is **not** fed into this encoder.

Features: three self-contained canvas animations; 16:9 HD, 9:16 HD, 1:1 HD, and compact 16:9; 12/24/30 FPS; durations 1–12 seconds; frame-indexed timeline scrubbing; H.264 MP4 via MediaBunny CanvasSource/WebCodecs; bounded frame count; live progress; cancellation.

Each frame depends only on the requested time and preset. No arbitrary JS execution or provider keys. All frames render locally, without uploads. Browser lacking H.264 support receives a useful error.

Scope: This is a **new native Canvas Motion Video tool**. Existing HTML Motion Lab still exports HTML only and its CSS preview isn't frame-deterministic. Full Studio Pro remains pinned and separately bundled (MPL-2.0 attribution preserved). Audio, full HTML-to-video parity, AI, user-auth, and production deployment are out of scope.

Gate: Browser E2E must encode a real 1-second 640x360 MP4; inspect its container/track, measured duration/dimensions, and verify that output plays and can be seeked. Also check cancellation and mobile 360/390/412 without overflow. Real hardware and browser-specific QA remain before production.
