/**
 * Cloudflare Worker that fronts the static assets.
 *
 * One Pages deployment can serve multiple per-condition variants
 * (BipolarBear, AnxietyAnt, …) routed by hostname. The HOST_LANDING_MAP
 * decides what `/` resolves to per host:
 *   - bipolaranonymous.app, www.bipolaranonymous.app → /anonymous.html
 *   - everything else (default) → /beta.html
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
 * Per-hostname landing-page override. Bare host and `www.` variant must
 * be listed separately. Hosts not present here fall through to the
 * default landing.
 *
 * Add new variant hosts here when expanding to additional condition apps.
 */
const HOST_LANDING_MAP = {
  // Bipolar variant
  'bipolaranonymous.app':     '/anonymous.html',
  'www.bipolaranonymous.app': '/anonymous.html',
};

/**
 * Landing page used when the requested hostname has no override entry.
 * Currently the BipolarBear beta-gate landing.
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

    // Root request → swap in the appropriate landing page based on hostname.
    if (url.pathname === '/' || url.pathname === '') {
      const target = new URL(url);
      target.pathname = HOST_LANDING_MAP[url.hostname] || DEFAULT_LANDING;
      return env.ASSETS.fetch(new Request(target.toString(), request));
    }

    // Everything else: serve the asset directly.
    return env.ASSETS.fetch(request);
  },
};
