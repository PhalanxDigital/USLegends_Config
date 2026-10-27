/**
 * Builds the lead that goes to US Legends and sends it through /api/submit
 * (netlify/functions/submit.mjs), which forwards it to uslegendcars.com.
 *
 * The shape matches what the Sketchfab build sent, plus one new field, `car`,
 * because the old payload never said which car the build was for.
 *   { car, color, parts: { body, frontEnd, wheel, tire, exhaust }, customerData }
 */
import { PAINT_COLORS } from './config/cars.js';

export function buildLeadPayload(car, build, customerData) {
  const parts = {};
  for (const cat of car.categories) {
    const opt = cat.options.find((o) => o.id === build.selections[cat.id]);
    if (opt) parts[cat.leadKey] = opt.leadValue ?? opt.label;
  }
  const color = PAINT_COLORS.find((c) => c.id === build.colorId) ?? PAINT_COLORS[0];
  return { car: car.leadName, color: color.id, parts, customerData: { ...customerData } };
}

/** @returns {Promise<{ ok: boolean, preview?: boolean }>} */
export async function submitLead(payload) {
  // The static preview and the drag-and-drop demo have no lead server, so nothing is sent.
  if (import.meta.env.MODE === 'preview' || import.meta.env.MODE === 'demo') {
    console.info('[preview] Lead not sent. Payload would be:', payload);
    await new Promise((r) => setTimeout(r, 500));
    return { ok: true, preview: true };
  }
  try {
    const res = await fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.message !== 'Internal Error', dryRun: data.dryRun === true };
  } catch {
    return { ok: false };
  }
}
