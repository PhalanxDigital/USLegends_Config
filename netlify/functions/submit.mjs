/**
 * POST /api/submit — forwards a lead from the car builder to US Legends, the same way the
 * Sketchfab build's /api/submit did: a server-side POST of the JSON lead to US Legends'
 * car-builder.cfc, with the Origin header the old site sent. US Legends' system takes it from there.
 *
 * Environment variables (optional; Netlify > Site configuration > Environment variables):
 *   LEAD_ENDPOINT_URL  where leads go. On the production site it defaults to the Sketchfab build's
 *                      endpoint (ORIGINAL_ENDPOINT). On deploy previews, branch deploys and local
 *                      dev it has no default, so nothing is forwarded (dry run) and test leads
 *                      never reach US Legends; set it there only to test end to end.
 *   LEAD_ORIGIN        Origin header to send. Defaults to the old site's URL, which the old build sent.
 */
const ORIGINAL_ENDPOINT = 'https://www.uslegendcars.com/car-builder.cfc?method=process';
const DEFAULT_ORIGIN = 'https://usl-car-builder.netlify.app';
const MAX_BYTES = 20_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/**
 * Netlify passes the deploy type in the handler's `context` (Functions v2). The build-time CONTEXT
 * variable is not available to functions while they run, so it can't be used for this.
 */
const isProduction = (context) => context?.deploy?.context === 'production';

export default async function handler(req, context) {
  if (req.method !== 'POST') return json({ message: 'Method not allowed' }, 405);

  const text = await req.text();
  if (text.length > MAX_BYTES) return json({ message: 'Internal Error' }, 413);
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    return json({ message: 'Internal Error' }, 400);
  }
  const c = payload?.customerData ?? {};
  const required = ['firstName', 'lastName', 'address', 'city', 'state', 'zip', 'phone', 'email'];
  if (required.some((k) => !String(c[k] ?? '').trim()) || !/^\S+@\S+\.\S+$/.test(c.email)) {
    return json({ message: 'Internal Error', reason: 'missing fields' }, 400);
  }

  const endpoint = process.env.LEAD_ENDPOINT_URL || (isProduction(context) ? ORIGINAL_ENDPOINT : '');
  if (!endpoint) {
    console.log('[dry run] not the production site and LEAD_ENDPOINT_URL is not set; lead not forwarded:', JSON.stringify(payload));
    return json({ message: 'OK', dryRun: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      // the same headers the Sketchfab build sent (Access-Control-Allow-Origin does nothing on a request, but keeps parity)
      headers: { 'Content-Type': 'application/json', Origin: process.env.LEAD_ORIGIN || DEFAULT_ORIGIN, 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify(payload),
    });
    const body = await res.text();
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      data = { message: res.ok ? 'OK' : 'Internal Error' };
    }
    if (!res.ok) {
      console.error('Lead endpoint returned', res.status, body.slice(0, 500));
      return json({ message: 'Internal Error' }, 502);
    }
    return json(data);
  } catch (err) {
    console.error('Lead endpoint unreachable', err);
    return json({ message: 'Internal Error' }, 502);
  }
}

export const config = { path: '/api/submit' };
