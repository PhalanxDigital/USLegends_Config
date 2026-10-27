/**
 * Makes copies of src/assets/models/*.glb for the shareable static preview (`npm run build:preview`),
 * shaped for strict hosts such as the claude.ai preview page:
 *   - no Meshopt compression (its decoder needs WebAssembly, which some hosts block)
 *   - glTF JSON instead of .glb (some hosts won't serve .glb), named `name.gltf.json`
 *   - geometry embedded in the JSON; CarViewer unpacks it itself, because strict hosts also block
 *     the loader from fetching embedded data: URLs
 *   - textures as separate image files next to the JSON, fetched like any other file
 * Output: src/assets/models-preview/ (generated, not committed).
 */
import { NodeIO, Format } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets');
const src = path.join(root, 'models');
const out = path.join(root, 'models-preview');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const EXT = { 'image/webp': 'webp', 'image/png': 'png', 'image/jpeg': 'jpg' };

for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const base = file.replace(/\.glb$/, '');
  const doc = await io.read(path.join(src, file));
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  }
  // Name textures by content, so cars that share a texture (the tires) share one file.
  for (const t of doc.getRoot().listTextures()) {
    const hash = crypto.createHash('sha1').update(t.getImage()).digest('hex').slice(0, 10);
    t.setURI(`tex-${hash}.${EXT[t.getMimeType()] ?? 'png'}`);
  }
  const { json, resources } = await io.writeJSON(doc, { format: Format.GLTF, basename: base });
  for (const b of json.buffers ?? []) {
    if (b.uri && resources[b.uri]) b.uri = `data:application/octet-stream;base64,${Buffer.from(resources[b.uri]).toString('base64')}`;
  }
  for (const img of json.images ?? []) {
    if (img.uri && resources[img.uri]) fs.writeFileSync(path.join(out, img.uri), resources[img.uri]);
  }
  const name = `${base}.gltf.json`;
  fs.writeFileSync(path.join(out, name), JSON.stringify(json));
  const imgs = (json.images ?? []).map((i) => i.uri).join(', ');
  console.log(`preview model ${name}  ${(fs.statSync(path.join(out, name)).size / 1048576).toFixed(1)} MB${imgs ? `  + ${imgs}` : ''}`);
}
