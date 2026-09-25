# NEXORA Studio security operating rules

## Development server
The default `npm run dev` binds to loopback (`127.0.0.1`) only, not to all local/public interfaces. Vite is pinned to patched `7.3.6` to address known Vite 7.1.7 dev-server vulnerabilities. Avoid forwarding the development port directly to the public internet. To test on a phone, prefer a trusted tunnel with authentication or use a built static preview rather than exposing the dev server.

## Deployment
This change does not deploy the site or enable Gemini. Keep server AI disabled without authentication, quotas, abuse protection and spending caps. Never place provider credentials in `VITE_` variables or in frontend code. The dashboard MUST NOT serve Studio Pro on its own origin. The editor artifact is generated separately in dist-studio-pro/ and the dashboard link fails closed unless VITE_STUDIO_PRO_URL is a different HTTPS origin. Deploy the editor on a completely separate site without shared Domain cookies, credentials, privileged CORS, or NEXORA login/API tokens. Never use the same site/subdomain cookie scope. See docs/STUDIO_PRO_ISOLATION.md. The downstream HTML renderer patch is a targeted mitigation, not a complete upstream audit; block general-public project uploads and user account data in Studio Pro until all upstream sinks are reviewed.

## Dependency policy
Commit `package-lock.json`, run `npm ci`, and gate merges on full unit/build plus GitHub browser regression checks. Audit high/critical advisories before release, including the separately downloaded Studio Pro dependency tree. The pinned Studio Pro source is a separate third-party security-review target; the Vite patch here does not upgrade its transitive dependency tree.

Responsible disclosure: file a private repository security advisory or contact the repository owner privately rather than posting exploit details in a public issue.
