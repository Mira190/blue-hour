// The deployed build's version, written to version.json by the Pages workflow
// (.github/workflows/pages.yml): the base in VERSION plus the deploy's run number, and its commit.
// Vercel's build (vercel.json) has no run number: it writes the base alone, so the version reads v0.1 · <commit>, and
// a "release" of base+commit for the telemetry's release comparison (telemetry.js app).
// The page shows it on its Credits screen (credits.js), which reads OEVersion.line() and OEVersion.link() when it
// opens and again at the "oe-version" event, for a version.json that arrives after it.
// A local checkout has no version.json, so the Credits screen says "Local build";
// served from this machine it is not asked for, as the 404 would fail every page check.
(function () {
  const REPO = 'https://github.com/Mira190/blue-hour';
  const V = window.OEVersion = {
    repo: REPO,
    // "v0.1.42 · commit 1a2b3c4 · built 2026-11-21", or "Local build" where no version.json was written
    line() {
      const v = window.OE_VERSION;
      if (!v || !v.version) return 'Local build';
      const sha = (v.commit || '').slice(0, 7), date = (v.built || '').slice(0, 10);
      return `v${v.version}${sha ? ' · commit ' + sha : ''}${date ? ' · built ' + date : ''}`;
    },
    // the commit's page, when the build names one
    link() { const v = window.OE_VERSION; return v && /^[0-9a-f]{7,40}$/.test(v.commit || '') ? `${REPO}/commit/${v.commit}` : ''; },
  };
  if (location.protocol === 'file:' || /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname)) return;
  const root = document.currentScript ? new URL('.', document.currentScript.src).href : '';
  fetch(root + 'version.json', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(v => {
    if (!v || !v.version) return;
    window.OE_VERSION = v;
    try { dispatchEvent(new Event('oe-version')); } catch (e) { /* an old browser: the screen reads it when it opens */ }
  }).catch(() => {});
  void V;
})();
