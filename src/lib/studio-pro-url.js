// A Studio Pro URL must be explicitly configured by the deploy operator.
// No fallback to /studio-pro/: that would silently co-host unreviewed code.
export function resolveStudioProUrl(configured, shellOrigin) {
  if (typeof configured !== 'string' || !configured.trim()) return null;
  try {
    const url = new URL(configured);
    const shell = new URL(shellOrigin);
    if (url.protocol !== 'https:' || !url.hostname || url.origin === shell.origin ||
      url.username || url.password || url.search || url.hash) return null;
    // Conservative same-site block. Distinct subdomains of a custom parent\n    // may share Domain cookies even when their origins differ. Treat unknown\n    // public suffixes conservatively and require a different hostname suffix.\n    const suffix=host=>host.split('.').slice(-2).join('.');\n    const hostingPublicSuffixes=new Set(['vercel.app','netlify.app','pages.dev','github.io']);\n    if(suffix(url.hostname)===suffix(shell.hostname) &&\n      !hostingPublicSuffixes.has(suffix(url.hostname))) return null;\n    // A dedicated host's root only: no proxying under the authenticated SPA path.
    if (url.pathname !== '/') return null;
    return url.href;
  } catch { return null; }
}
