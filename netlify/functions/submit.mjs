/**
 * POST /api/submit — forwards a lead from the car builder to US Legends.
 *
 * Environment variables (set in Netlify > Site configuration > Environment variables):
 *   LEAD_ENDPOINT_URL  where leads go, e.g. https://www.uslegendcars.com/car-builder.cfc?method=process
 *                      If unset on a preview or local build, nothing is forwarded (dry run) so test
 *                      leads never reach the client. If unset on the production site, the request
 *                      fails loudly instead of silently dropping real leads.
 *   LEAD_ORIGIN        Origin header the endpoint expects (the old build sent its own Netlify URL).
 */
const DEFAULT_ORIGIN = 'https://usl-car-builder.netlify.app';
const MAX_BYTES = 20_000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export default async function handler(req) {
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

  const endpoint = process.env.LEAD_ENDPOINT_URL;
  if (!endpoint) {
    if (process.env.CONTEXT === 'production') {
      console.error('LEAD_ENDPOINT_URL is not set on the production site; lead could not be delivered.');
      return json({ message: 'Internal Error' }, 500);
    }
    console.log('[dry run] LEAD_ENDPOINT_URL is not set; lead not forwarded:', JSON.stringify(payload));
    return json({ message: 'OK', dryRun: true });
  }

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: process.env.LEAD_ORIGIN || DEFAULT_ORIGIN },
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
