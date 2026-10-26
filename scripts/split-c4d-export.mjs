/**
 * Turns the whole-scene glTF exported from "Legend Cars.c4d" into one web-ready GLB per car.
 *
 *   npm run models:split -- path/to/legend-cars.gltf        (writes src/assets/models/sedan.glb + coupe.glb)
 *
 * The Cinema 4D scene holds the sedan and the coupe together (shared front ends, wheels,
 * tires and exhausts; separate bodies and chassis). For each car this script removes the
 * other car's bodies and chassis plus cameras/lights, then compresses geometry and textures
 * the same way as scripts/optimize-model.mjs. Every option stays a separate named part.
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const outArg = process.argv.indexOf('--out');
const OUT_DIR = outArg > 0 ? path.resolve(process.argv[outArg + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/models');
const norm = (s) => String(s ?? '').toLowerCase().replace(/_\d+$/, '').replace(/[^a-z0-9]/g, '');

// Parts that belong to only one car. Anything not listed is shared and kept in both.
const ONLY = {
  sedan: ['37 FORD SEDAN BODY', '34 FORD SEDAN BODY', '37 CHEVY SEDAN BODY', 'SEDAN CHASSIS'],
  coupe: ['34 CHEVY COUPE BODY', '34 FORD COUPE BODY', 'COUPE CHASSIS'],
};
// Extra names to drop from both (studio set pieces). Extend after reading the export log.
const ALWAYS_DROP = ['floor', 'sky', 'background', 'camera', 'light', 'studio', 'backdrop', 'cyc'];

const input = process.argv[2];
if (!input) {
  console.error('Usage: node scripts/split-c4d-export.mjs <legend-cars.gltf|.glb> [--out folder]');
  process.exit(1);
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

function triangles(doc) {
  let n = 0;
  for (const mesh of doc.getRoot().listMeshes())
    for (const p of mesh.listPrimitives()) {
      const idx = p.getIndices();
      n += (idx ? idx.getCount() : p.getAttribute('POSITION').getCount()) / 3;
    }
  return Math.round(n);
}

for (const car of Object.keys(ONLY)) {
  const doc = await io.read(input);
  const root = doc.getRoot();
  const drop = new Set(Object.entries(ONLY).filter(([k]) => k !== car).flatMap(([, names]) => names.map(norm)));
  const removed = [];
  const disposeTree = (node) => {
    for (const child of node.listChildren()) disposeTree(child);
    node.dispose();
  };
  for (const node of root.listNodes()) {
    if (node.isDisposed()) continue;
    const n = norm(node.getName());
    const isSetPiece = ALWAYS_DROP.some((w) => n === w || n.startsWith(w));
    if (drop.has(n) || node.getCamera() || node.getExtension('KHR_lights_punctual') || isSetPiece) {
      removed.push(node.getName());
      disposeTree(node);
    }
  }
  await doc.transform(
    prune({ keepLeaves: false }),
    dedup({ keepUniqueNames: true }),
    weld(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [2048, 2048] }),
    quantize(),
    meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
  );
  const out = path.join(OUT_DIR, `${car}.glb`);
  await io.write(out, doc);
  const sceneKids = root.listScenes()[0].listChildren();
  const top = sceneKids.length === 1 ? sceneKids[0].listChildren() : sceneKids; // skip a single wrapper node
  console.log(`\n${car}.glb  ${(fs.statSync(out).size / 1024 / 1024).toFixed(2)} MB  ${triangles(doc).toLocaleString()} triangles`);
  console.log('  removed:', removed.length ? removed.join(', ') : '(none)');
  console.log('  top-level parts:', top.map((n) => n.getName()).join(' | '));
  console.log('  materials:', root.listMaterials().map((m) => m.getName()).join(' | '));
}
