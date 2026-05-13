/**
 * ord.xyz — Cloudflare Worker Proxy
 * 
 * Forwards requests to ordinals.com with Accept: application/json header.
 * Adds CORS headers so the browser can fetch JSON directly.
 * 
 * Deploy:
 *   1. Go to https://dash.cloudflare.com → Workers & Pages → Create
 *   2. Paste this file → Deploy
 *   3. Set your worker URL in explorer.html as PROXY_BASE
 * 
 * Usage:
 *   https://your-worker.workers.dev/inscription/abc123i0
 *   https://your-worker.workers.dev/inscriptions/0
 *   https://your-worker.workers.dev/blocks
 *   https://your-worker.workers.dev/block/949146
 *   https://your-worker.workers.dev/address/bc1p...
 *   https://your-worker.workers.dev/sat/1234567890
 */

export default {
  async fetch(request, env, ctx) {

    // ── CORS preflight ──────────────────────────────────────────────────────
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    // ── Only allow GET ──────────────────────────────────────────────────────
    if (request.method !== 'GET') {
      return new Response('Method not allowed', { status: 405 });
    }

    // ── Parse path ──────────────────────────────────────────────────────────
    const url = new URL(request.url);
    const path = url.pathname;          // e.g. /inscription/abc123i0
    const search = url.search;          // e.g. ?limit=24

    // ── Block non-whitelisted paths ─────────────────────────────────────────
    const ALLOWED = [
      /^\/inscription\/[a-fA-F0-9]+i\d+$/,   // /inscription/{id}
      /^\/inscriptions(\/\d+)?$/,             // /inscriptions or /inscriptions/0
      /^\/address\/.+$/,                      // /address/{addr}
      /^\/block\/[a-zA-Z0-9]+$/,              // /block/{hash or height}
      /^\/blocks$/,                           // /blocks
      /^\/blockheight$/,                      // /blockheight
      /^\/blockcount$/,                       // /blockcount
      /^\/blockhash(\/\d+)?$/,               // /blockhash or /blockhash/{height}
      /^\/blocktime$/,                        // /blocktime
      /^\/sat\/\d+$/,                         // /sat/{number}
      /^\/tx\/[a-fA-F0-9]+$/,               // /tx/{txid}
      /^\/output\/.+$/,                       // /output/{outpoint}
      /^\/r\/inscription\/.+$/,              // /r/inscription/{id} (recursive)
      /^\/r\/sat\/\d+\/at\/\d+$/,           // /r/sat/{sat}/at/{index}
      /^\/r\/children\/.+$/,                // /r/children/{id}
      /^\/r\/parents\/.+$/,                 // /r/parents/{id}
      /^\/r\/metadata\/.+$/,               // /r/metadata/{id}
    ];

    const allowed = ALLOWED.some(re => re.test(path));
    if (!allowed) {
      return new Response(JSON.stringify({ error: 'Path not allowed', path }), {
        status: 403,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' }
      });
    }

    // ── Forward to ordinals.com ─────────────────────────────────────────────
    const target = `https://ordinals.com${path}${search}`;

    try {
      const response = await fetch(target, {
        headers: {
          'Accept': 'application/json',
          'User-Agent': 'ord-explorer/1.0',
        },
        cf: {
          // Cache at Cloudflare edge for 60s (inscriptions rarely change)
          cacheTtl: 60,
          cacheEverything: true,
        }
      });

      // ── Read body ─────────────────────────────────────────────────────────
      const body = await response.text();
      const contentType = response.headers.get('Content-Type') || 'application/json';

      // ── Return with CORS headers ──────────────────────────────────────────
      return new Response(body, {
        status: response.status,
        headers: {
          'Content-Type': contentType.includes('json') ? 'application/json' : contentType,
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Cache-Control': 'public, max-age=30',
          'X-Proxied-From': 'ordinals.com',
          'X-Worker': 'ord-xyz-proxy',
        }
      });

    } catch (err) {
      return new Response(JSON.stringify({
        error: 'Proxy error',
        message: err.message,
        target
      }), {
        status: 502,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  }
};
