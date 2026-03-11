// Cloudflare Worker: SofaScore proxy for Alcaraz Fan Hub
// Key: use Request object with redirect: 'follow' and no Origin header

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }

    if (path === '/' || path === '/health') {
      return json({ status: 'ok', ts: Date.now() });
    }

    const targetUrl = `https://api.sofascore.com/api/v1${path}`;

    try {
      // Create a clean Request without Origin/Referer to avoid cross-origin blocks
      const proxyReq = new Request(targetUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
        },
        redirect: 'follow',
      });

      const res = await fetch(proxyReq, {
        cf: { cacheEverything: true, cacheTtl: 300 },
      });

      const body = await res.text();

      // If blocked, try www.sofascore.com
      if (res.status === 403) {
        const fallbackReq = new Request(`https://www.sofascore.com/api/v1${path}`, {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*',
            'Accept-Language': 'en-US,en;q=0.9,es;q=0.8',
          },
          redirect: 'follow',
        });

        const fallbackRes = await fetch(fallbackReq, {
          cf: { cacheEverything: true, cacheTtl: 300 },
        });

        if (fallbackRes.status !== 403) {
          const fallbackBody = await fallbackRes.text();
          return new Response(fallbackBody, {
            status: fallbackRes.status,
            headers: {
              'Content-Type': 'application/json',
              ...corsHeaders(),
              'Cache-Control': 'public, max-age=300',
            },
          });
        }
      }

      return new Response(body, {
        status: res.status,
        headers: {
          'Content-Type': 'application/json',
          ...corsHeaders(),
          'Cache-Control': 'public, max-age=300',
        },
      });
    } catch (err) {
      return json({ error: err.message }, 502);
    }
  },
};

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
