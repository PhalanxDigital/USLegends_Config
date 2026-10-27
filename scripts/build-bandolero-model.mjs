/**
 * Builds the web Bandolero (src/assets/models/bandolero.glb) from the artist's export.
 *
 *   npm run models:bandolero -- <Bandolero.gltf> [--out folder]
 *
 * Input is Bandolero.gltf from the "Bandolero" folder of the model files: the whole car, exported
 * from Cinema 4D with its own (non-Octane) materials. The Bandolero has no part options, only a
 * paint color, so this:
 *   1. regroups the car into five named parts: BODY, CHASSIS, WHEELS, WINDSHIELD, BODY FASTENERS
 *   2. swaps the materials for web materials (BANDOLERO_TO_WEB in scripts/c4d-materials.mjs);
 *      the Hoosier sidewall keeps the file's own textures
 *   3. merges each part's many small pieces into a few meshes (fewer draw calls)
 *   4. simplifies the geometry (the source is about 985,000 triangles)
 *   5. scales it to the Legends cars' units, turns it to face +X and stands it on the ground
 *   6. compresses everything
 */
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, textureCompress, join, simplifyPrimitive, unpartition } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_MATERIALS, BANDOLERO_TO_WEB } from './c4d-materials.mjs';
import { triCount, disposeTree, bakeIntoGroup, recomputeNormals, createWebMaterials } from './lib/mesh-utils.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/models');
const [input] = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
if (!input) {
  console.error('Usage: npm run models:bandolero -- <Bandolero.gltf> [--out folder]');
  process.exit(1);
}

/** The export is in centimeters at a different scale from the Legends export; this matches them. */
const SCALE = 0.01;
const PAINT_CREASE_DEG = 40;
/** Simplification tolerance per part, as a fraction of the part's size. It's an open car, so the chassis shows. */
const SIMPLIFY_ERROR = { BODY: 0.00015, WHEELS: 0.0002, WINDSHIELD: 0.0003, CHASSIS: 0.0006, 'BODY FASTENERS': 0.0006 };
const TIRE_ERROR = 0.00005; // round silhouettes show facets first

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const t0 = Date.now();
const doc = await io.read(input);
const root = doc.getRoot();
const scene = root.listScenes()[0];
for (const n of root.listNodes()) if (!n.isDisposed() && (n.getCamera() || n.getExtension('KHR_lights_punctual'))) disposeTree(n);
const find = (name, parent) => (parent ? parent.listChildren() : scene.listChildren()).find((n) => n.getName() === name);

// 1. five named parts under one root. WHEELS sits inside CHASSIS in the file; lift it out, keeping its position.
const chassis = find('CHASSIS');
const wheels = chassis && find('WHEELS', chassis);
if (!chassis || !wheels || !find('BODY')) throw new Error('Expected CHASSIS, CHASSIS/WHEELS and BODY in the file. Has the scene changed?');
const wheelsWorld = wheels.getWorldMatrix();
chassis.removeChild(wheels);
wheels.setMatrix(wheelsWorld);
scene.addChild(wheels);
const renames = { WindShield: 'WINDSHIELD' };
const car = doc.createNode('BANDOLERO');
for (const n of scene.listChildren()) {
  scene.removeChild(n);
  n.setName(renames[n.getName()] ?? n.getName());
  car.addChild(n);
}
scene.addChild(car);
const groups = car.listChildren();

// 2. web materials; the sidewall keeps the file's textures (taken before the source materials go)
const web = createWebMaterials(doc, WEB_MATERIALS, doc.createExtension(KHRMaterialsClearcoat));
const srcSidewall = root.listMaterials().find((m) => m.getName() === 'PBR.2');
if (srcSidewall?.getBaseColorTexture()) {
  web['TIRE SIDEWALL'].setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(srcSidewall.getBaseColorTexture())
    .setNormalTexture(srcSidewall.getNormalTexture());
}
const unknown = new Set();
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives()) {
    const src = prim.getMaterial()?.getName() ?? '';
    const target = BANDOLERO_TO_WEB[src];
    if (!target) unknown.add(src || '(none)');
    prim.setMaterial(web[target ?? 'DARK MATTE']);
  }

// 3. bake each part's pieces into the part's own frame, then merge pieces that share a material
for (const g of groups) bakeIntoGroup(doc, g);
await doc.transform(prune(), dedup({ keepUniqueNames: true }), join({ keepNamed: false }), weld());

// 4. simplify
const before = triCount(car);
for (const g of groups)
  for (const n of g.listChildren())
    for (const prim of n.getMesh()?.listPrimitives() ?? []) {
      const mat = prim.getMaterial()?.getName() ?? '';
      const error = mat.startsWith('TIRE') ? TIRE_ERROR : SIMPLIFY_ERROR[g.getName()] ?? 0.0006;
      simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error });
    }

// 4b. paint: smooth normals (see recomputeNormals)
for (const mesh of root.listMeshes())
  for (const prim of mesh.listPrimitives())
    if (WEB_MATERIALS[prim.getMaterial()?.getName()]?.paint) recomputeNormals(doc, prim, PAINT_CREASE_DEG);

// 5. Legends units, front toward +X, wheels on the ground, centered
car.setScale([SCALE, SCALE, SCALE]).setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
const b = getBounds(scene);
car.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);

// 6. compress
await doc.transform(
  unpartition(), // one binary buffer, as a .glb requires
  prune(),
  dedup({ keepUniqueNames: true }),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [1024, 1024] }),
  quantize(),
  meshopt({ encoder: MeshoptEncoder, level: 'medium' }),
);
fs.mkdirSync(OUT_DIR, { recursive: true });
const out = path.join(OUT_DIR, 'bandolero.glb');
await io.write(out, doc);

const size = getBounds(scene);
console.log(`\nbandolero.glb  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB  ${before.toLocaleString()} -> ${triCount(car).toLocaleString()} triangles  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
console.log(`  size ${size.max.map((v, i) => (v - size.min[i]).toFixed(2)).join(' x ')}`);
for (const g of groups) console.log(`  ${g.getName().padEnd(16)} ${triCount(g).toLocaleString().padStart(9)} tris  ${g.listChildren().length} meshes`);
if (unknown.size) console.log('  unmapped materials (used DARK MATTE):', [...unknown].join(', '));
