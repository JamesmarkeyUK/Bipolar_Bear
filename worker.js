/**
 * Cloudflare Worker that fronts the static assets.
 *
 * One Pages deployment can serve multiple per-condition variants
 * (BipolarBear, AnxietyAnt, …) routed by hostname. Both the per-host
 * overrides in HOST_LANDING_MAP and the DEFAULT_LANDING are served at `/`
 * AND at `/welcome` via an internal rewrite (URL bar is unchanged):
 *   - bipolaranonymous.app, www.bipolaranonymous.app → /welcome-anonymous
 *   - everything else                                → /welcome
 *
 * The rewrite targets MUST stay extensionless. The ASSETS binding applies
 * Cloudflare's default html_handling ("auto-trailing-slash"), which serves
 * welcome.html at /welcome but answers a request for /welcome.html with a
 * 307 redirect to /welcome. Since /welcome is in run_worker_first, a
 * `.html` rewrite target bounces Worker → 307 → Worker forever (the "too
 * many redirections" outage).
 *
 * `/welcome` is host-aware too (not just `/`) so bipolaranonymous.app/welcome
 * serves the Anonymous landing rather than the Bear one a plain static lookup
 * (/welcome → welcome.html) would give.
 *
 * Each landing page funnels visitors to the store badges and to its app:
 * the Bear page → /index.html, the Anonymous page → /anonymous (the board).
 *
 * Adding a new variant pair (e.g. "Anxiety Ant" + "Anxiety Anonymous") is
 * just two new entries below; no other code changes here.
 *
 * Every other path falls through to the static asset binding (`env.ASSETS`),
 * which serves files from `wrangler.json#assets.directory` (currently the
 * repo root).
 *
 * Configured by wrangler.json. Two settings there are load-bearing — do not
 * remove them or this whole file becomes dead code:
 *   - assets.binding = "ASSETS"          — wires up env.ASSETS (used below).
 *   - assets.run_worker_first = ["/", "/welcome", "/version.json"]
 *         By default Cloudflare serves a matching static asset BEFORE the
 *         Worker, so `/` would resolve straight to index.html (the app) and
 *         `/welcome` straight to welcome.html (always the Bear page), and this
 *         script would never run. run_worker_first forces the Worker to handle
 *         these paths first, so the `/` + `/welcome` → landing rewrite and the
 *         /version.json CORS headers below actually take effect. Every other
 *         path stays asset-first (no Worker invocation).
 *
 * Note: this worker runs at the edge — it is unrelated to service-worker.js,
 * which runs in the browser.
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
  // Bipolar variant — the Anonymous landing page leads with the community
  // and links on to the board at /anonymous.
  'bipolaranonymous.app':     '/welcome-anonymous',
  'www.bipolaranonymous.app': '/welcome-anonymous',
};

/**
 * Landing page served at `/` (and `/welcome`) when the requested hostname has
 * no override — the Bipolar Bear landing page. It funnels visitors to the
 * store badges and to the web app (served at /index.html). Installed PWA users
 * still open straight into the app because the manifest start_url is
 * /index.html (see icons/favicons/site.webmanifest), not `/`.
 */
const DEFAULT_LANDING = '/welcome';

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

    if (url.pathname === '/' || url.pathname === '' || url.pathname === '/welcome') {
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
