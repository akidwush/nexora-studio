# Step 4 — Prompt-to-Motion Generator

This step intentionally follows Step 2 on the **same branch studio-step2-video**, as requested. Step 3 is neither claimed nor silently merged.

## Two clearly distinguished modes

- **Local Draft (ready now):** deterministic rule-based generator maps user descriptions to one of three canvas templates, motion energy, copy and a curated color palette. No AI provider or external request is involved.
- **Generate with AI (opt-in):** a Vercel Function accepts a short prompt and calls the configured Gemini model. Server-side validation rejects invalid output and produces only a whitelisted JSON storyboard. The browser runs no AI-authored HTML, JavaScript or CSS. API keys never go to the browser.

Both outputs can be edited (text, template, energy and theme), previewed with exact timeline-seeking, exported as editable JSON or encoded into genuine silent H.264 MP4 using the existing browser-only media engine.

## Security: disabled by default

The live API returns ready=false until an operator configures ALL server-side environment variables:

- AI_PUBLIC_ENABLED=true
- VERCEL=1 (set by Vercel hosting)
- GEMINI_API_KEY
- GEMINI_MODEL (operator-selected supported model ID; verified against provider account)
- UPSTASH_REDIS_REST_URL (HTTPS *.upstash.io)
- UPSTASH_REDIS_REST_TOKEN
- AI_RATE_SALT (at least 24 characters of unpredictable secret material)

Before each paid call an atomic Redis SET NX EX 60 operation allows **at most one request per IP per minute**. It never falls back to unmetered calls if the limiter is unavailable; the operator enable flag is required as well. Restrictive same-origin request checks and bounded prompt and model response sizes provide additional gates. These measures do not replace sign-in authorization, quota/budget controls, provider analytics, bot protection, per-account abuse detection or account-wide spending limits. Keep AI_PUBLIC_ENABLED off on publicly available production builds until these are implemented. Never commit secrets or use VITE_ environment prefixes for backend secrets.

The frontend and local demos work without deploying a Vercel Function. Static preview bundles do not contain the function; a real Vercel deployment is needed for live Gemini requests. No production deployment is triggered from this branch.

The Vercel route uses the provider's standard generateContent method with application/json response MIME; an independent output validator is still mandatory.

## Limits

- AI creates an editable **motion design plan**, not AI-generated video footage or arbitrary HTML/CSS.
- MP4 exports contain no audio. 1–12 seconds; current Step 2 size/FPS boundaries apply.
- Studio Pro third-party vendor timeline remains independent; no user auth is shared with it.

## QA

Unit tests cover prompt bounds, structured palette and template validation, deterministic draft output, server fail-closed, same-origin guards, atomic limiter gates, mocked provider success, malformed JSON and provider error redaction.

Automated Chromium tests cover local draft and editing, JSON output, real scene MP4 encode/decode metadata, simulated actual Gemini endpoint success without a key, offline UX, mobile 360/390/412 overflow, API error and browser history; save a real MP4 plus screenshots in the workflow artifacts. Real model invocation is not claimed until deployment has a configured provider and a controlled authenticated test account.
