/**
 * Repackages src/assets/models/*.glb for the shareable static preview (`npm run build:preview`),
 * for strict hosts such as the claude.ai preview page:
 *   - glTF JSON instead of .glb (some hosts won't serve .glb), named `name.gltf.json`
 *   - the .glb's binary data embedded in the JSON as base64; CarViewer unpacks it itself, because
 *     strict hosts also block the 3D loader from fetching embedded data: URLs
 *   - textures moved to separate image files next to the JSON, named by content so cars that share
 *     a texture (the tires) share one file
 * The geometry is byte-for-byte the production model (still Meshopt-compressed). Where WebAssembly
 * is blocked, CarViewer decodes it with the pure-JavaScript decoder instead.
 * Output: src/assets/models-preview/ (generated, not committed).
 */
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets');
const src = path.join(root, 'models');
const out = path.join(root, 'models-preview');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };
const LIMIT = 16_000_000; // per-file limit of the claude.ai preview host

for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const glb = fs.readFileSync(path.join(src, file));
  if (glb.readUInt32LE(0) !== 0x46546c67) throw new Error(`${file} is not a .glb`);
  const jsonLen = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen;
  const bin = binStart < glb.length ? glb.subarray(binStart + 8, binStart + 8 + glb.readUInt32LE(binStart)) : Buffer.alloc(0);

  const images = [];
  for (const img of json.images ?? []) {
    if (img.bufferView === undefined) continue;
    const view = json.bufferViews[img.bufferView];
    const bytes = bin.subarray(view.byteOffset ?? 0, (view.byteOffset ?? 0) + view.byteLength);
    const name = `tex-${crypto.createHash('sha1').update(bytes).digest('hex').slice(0, 10)}.${EXT[img.mimeType] ?? 'png'}`;
    fs.writeFileSync(path.join(out, name), bytes);
    img.uri = name;
    delete img.bufferView;
    images.push(name);
  }
  if (bin.length) json.buffers[0].uri = `data:application/octet-stream;base64,${bin.toString('base64')}`;

  const name = file.replace(/\.glb$/, '.gltf.json');
  fs.writeFileSync(path.join(out, name), JSON.stringify(json));
  const size = fs.statSync(path.join(out, name)).size;
  console.log(`preview model ${name}  ${(size / 1048576).toFixed(1)} MB${images.length ? `  + ${images.join(', ')}` : ''}`);
  if (size > LIMIT) console.warn(`  ! ${name} is over the preview host's ${LIMIT / 1e6} MB file limit`);
}
