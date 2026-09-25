// A Studio Pro URL must be explicitly configured by the deploy operator.
// No fallback to /studio-pro/: that would silently co-host unreviewed code.
export function resolveStudioProUrl(configured, shellOrigin) {
  if (typeof configured !== 'string' || !configured.trim()) return null;
  try {
    const url = new URL(configured);
    const shell = new URL(shellOrigin);
    if (url.protocol !== 'https:' || !url.hostname || url.origin === shell.origin ||
      url.username || url.password || url.search || url.hash) return null;
    // Conservative same-site block. Distinct subdomains of a custom parent
    // may share Domain cookies even when their origins differ. Treat unknown
    // public suffixes conservatively and require a different hostname suffix.
    const suffix=host=>host.split('.').slice(-2).join('.');
    const hostingPublicSuffixes=new Set(['vercel.app','netlify.app','pages.dev','github.io']);
    if(suffix(url.hostname)===suffix(shell.hostname) &&
      !hostingPublicSuffixes.has(suffix(url.hostname))) return null;
    // A dedicated host's root only: no proxying under the authenticated SPA path.
    if (url.pathname !== '/') return null;
    return url.href;
  } catch { return null; }
}
