/**
 * Cloudflare Worker that fronts the static assets.
 *
 * One Pages deployment can serve multiple per-condition variants
 * (BipolarBear, AnxietyAnt, …) routed by hostname. Both the per-host
 * overrides in HOST_LANDING_MAP and the DEFAULT_LANDING are served at `/`
 * via an internal rewrite (URL bar stays as `/`):
 *   - bipolaranonymous.app, www.bipolaranonymous.app → /marketing-anonymous.html
 *   - everything else                                → /marketing.html
 *
 * Each marketing page funnels visitors to the store badges and to its app:
 * the Bear page → /index.html, the Anonymous page → /anonymous (the board).
 *
 * Adding a new variant pair (e.g. "Anxiety Ant" + "Anxiety Anonymous") is
 * just two new entries below; no other code changes here.
 *
 * Every other path falls through to the static asset binding (`env.ASSETS`),
 * which serves files from `wrangler.json#assets.directory` (currently the
 * repo root).
 *
 * Configured by wrangler.json. Note: this worker runs at the edge — it is
 * unrelated to service-worker.js, which runs in the browser.
 *
 * @file worker.js
 */

/**
 * Per-hostname landing page served at `/`. Bare host and `www.` variant
 * must be listed separately. Served via internal rewrite (URL bar stays
 * as `/`).
 *
 * Add new variant hosts here when expanding to additional condition apps.
 */
const HOST_LANDING_MAP = {
  // Bipolar variant — the Anonymous marketing page leads with the community
  // and links on to the board at /anonymous.
  'bipolaranonymous.app':     '/marketing-anonymous.html',
  'www.bipolaranonymous.app': '/marketing-anonymous.html',
};

/**
 * Landing page served at `/` when the requested hostname has no override —
 * the Bipolar Bear marketing page. It funnels visitors to the store badges
 * and to the web app (served at /index.html). Installed PWA users still
 * open straight into the app because the manifest start_url is /index.html
 * (see icons/favicons/site.webmanifest), not `/`.
 */
const DEFAULT_LANDING = '/marketing.html';

export default {
  /**
   * @param {Request} request    Incoming HTTP request.
   * @param {{ ASSETS: { fetch: (req: Request) => Promise<Response> } }} env
   *        Bindings declared in wrangler.json. `ASSETS` serves the static
   *        files in the configured directory.
   * @returns {Promise<Response>}
   */
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/' || url.pathname === '') {
      const landing = HOST_LANDING_MAP[url.hostname] || DEFAULT_LANDING;
      const target = new URL(url);
      target.pathname = landing;
      return env.ASSETS.fetch(new Request(target.toString(), request));
    }

    // /version.json drives the in-app "update available" banner. It must
    // be CORS-readable (Capacitor WebViews fetch it cross-origin from
    // capacitor://localhost or https://localhost) and never cached at the
    // edge (a stale value defeats the whole point of the check).
    if (url.pathname === '/version.json') {
      const res = await env.ASSETS.fetch(request);
      const headers = new Headers(res.headers);
      headers.set('Access-Control-Allow-Origin', '*');
      headers.set('Cache-Control', 'no-store, max-age=0');
      return new Response(res.body, { status: res.status, headers });
    }

    return env.ASSETS.fetch(request);
  },
};
