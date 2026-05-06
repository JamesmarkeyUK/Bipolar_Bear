/**
 * Cloudflare Worker that fronts the BipolarBear static assets.
 *
 * Two domains share the same Pages deployment:
 *   - bipolarbear.app          → root maps to /beta.html  (the gated landing)
 *   - bipolaranonymous.app     → root maps to /anonymous.html (peer community)
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
 * Hostnames that should land on /anonymous.html. Bare host and `www.` variant.
 */
const ANON_HOSTS = ['bipolaranonymous.app', 'www.bipolaranonymous.app'];

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
      target.pathname = ANON_HOSTS.includes(url.hostname)
        ? '/anonymous.html'
        : '/beta.html';
      return env.ASSETS.fetch(new Request(target.toString(), request));
    }

    // Everything else: serve the asset directly.
    return env.ASSETS.fetch(request);
  },
};
