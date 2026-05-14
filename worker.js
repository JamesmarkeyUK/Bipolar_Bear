/**
 * Cloudflare Worker that fronts the static assets.
 *
 * One Pages deployment can serve multiple per-condition variants
 * (BipolarBear, AnxietyAnt, …) routed by hostname. Per-host overrides in
 * HOST_LANDING_MAP issue a 301 redirect from `/` to a canonical path so the
 * URL bar reflects the served page:
 *   - bipolaranonymous.app, www.bipolaranonymous.app → 301 → /anonymous
 *
 * Hosts without an override get DEFAULT_LANDING served at `/` via an
 * internal rewrite (URL bar stays as `/`):
 *   - everything else → /beta.html
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
 * Per-hostname canonical landing path. Bare host and `www.` variant must
 * be listed separately. Requests to `/` on these hosts get a 301 redirect
 * to the configured path (URL bar updates), preserving the query string.
 *
 * Add new variant hosts here when expanding to additional condition apps.
 */
const HOST_LANDING_MAP = {
  // Bipolar variant
  'bipolaranonymous.app':     '/anonymous',
  'www.bipolaranonymous.app': '/anonymous',
};

/**
 * Landing page served at `/` when the requested hostname has no override.
 * Internal rewrite (URL bar stays as `/`).
 */
const DEFAULT_LANDING = '/beta.html';

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
      const override = HOST_LANDING_MAP[url.hostname];
      if (override) {
        const target = new URL(url);
        target.pathname = override;
        return Response.redirect(target.toString(), 301);
      }
      const target = new URL(url);
      target.pathname = DEFAULT_LANDING;
      return env.ASSETS.fetch(new Request(target.toString(), request));
    }

    return env.ASSETS.fetch(request);
  },
};
