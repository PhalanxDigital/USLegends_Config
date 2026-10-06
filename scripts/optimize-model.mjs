/**
 * Turns a raw export of a real car model into a small, web-ready GLB for the app.
 *
 *   npm run models:optimize -- models-source/sedan.glb src/assets/models/sedan.glb
 *
 * Input: a .glb or .gltf (export from Cinema 4D/Blender, or the glTF download from Sketchfab).
 * What it does:
 *   - removes duplicate data and unused materials/textures
 *   - compresses geometry (Meshopt) and textures (WebP, max 2048px)
 * What it deliberately does NOT do: merge or flatten parts. Every option must stay its own
 * named part so the app can show and hide it. (The stock `gltf-transform optimize` command
 * merges parts by default, so don't use it on these files.)
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [input, output] = process.argv.slice(2);
if (!input || !output) {
  console.error('Usage: npm run models:optimize -- <input.glb|.gltf> <output.glb>');
  process.exit(1);
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const before = fs.statSync(input).size;
const doc = await io.read(input);
const partCount = (d) => d.getRoot().listNodes().filter((n) => n.getName()).length;
const partsBefore = partCount(doc);

await doc.transform(
  dedup({ keepUniqueNames: true }),
  prune({ keepLeaves: true, keepAttributes: false }),
  weld(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);

fs.mkdirSync(path.dirname(output), { recursive: true });
await io.write(output, doc);
const after = fs.statSync(output).size;
const mb = (b) => (b / 1024 / 1024).toFixed(2) + ' MB';
console.log(`\n${input} (${mb(before)}) -> ${output} (${mb(after)})`);
console.log(`Named parts kept: ${partCount(doc)} of ${partsBefore}`);
console.log('Next: npm run models:inspect -- ' + output + '   (copy part and material names into src/lib/config/cars.js)\n');
