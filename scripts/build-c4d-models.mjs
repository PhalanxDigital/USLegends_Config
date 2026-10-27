/**
 * Builds the web models (src/assets/models/sedan.glb, coupe.glb) from the Cinema 4D export.
 *
 *   npm run models:c4d -- <legend-cars-named.gltf> <tex folder> [--out folder]
 *
 * Input is the glTF written by export_pass2_materials.py (Cinema 4D script, kept in docs/c4d/).
 * The scene holds the sedan and the coupe together: shared front ends, wheels, tires and
 * exhausts; separate bodies and chassis. For each car this:
 *   1. keeps only that car's parts (every option stays a separate, named part)
 *   2. swaps the placeholder materials for web materials (scripts/c4d-materials.mjs)
 *   3. merges each option's many small pieces into a few meshes (fewer draw calls)
 *   4. simplifies the geometry (the source is ~4 million triangles per car)
 *   5. turns the car to face +X, standing on the ground at the origin
 *   6. compresses everything (the tire sidewall textures are added in step 2)
 */
import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRMaterialsClearcoat } from '@gltf-transform/extensions';
import { dedup, prune, weld, quantize, meshopt, textureCompress, join, simplifyPrimitive, unpartition, transformPrimitive, compactPrimitive } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptDecoder, MeshoptSimplifier } from 'meshoptimizer';
import * as THREE from 'three';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WEB_MATERIALS, C4D_TO_WEB } from './c4d-materials.mjs';

const args = process.argv.slice(2);
const outIdx = args.indexOf('--out');
const OUT_DIR = outIdx >= 0 ? path.resolve(args[outIdx + 1]) : path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/models');
const [input, texDir] = args.filter((a, i) => !a.startsWith('--') && (outIdx < 0 || i !== outIdx + 1));
if (!input || !texDir) {
  console.error('Usage: npm run models:c4d -- <legend-cars-named.gltf> <tex folder> [--out folder]');
  process.exit(1);
}

const norm = (s) => String(s ?? '').toLowerCase().replace(/_\d+$/, '').replace(/[^a-z0-9]/g, '');

/** Parts that belong to only one car; everything else under CARS is shared. */
const ONLY = {
  sedan: ['37 FORD SEDAN BODY', '34 FORD SEDAN BODY', '37 CHEVY SEDAN BODY', 'SEDAN CHASSIS'],
  coupe: ['34 CHEVY COUPE BODY', '34 FORD COUPE BODY', 'COUPE CHASSIS'],
};
/** Nodes under CARS that only group options; their children are the options. */
const CONTAINERS = ['TIRES', 'EXHAUST'];
/** Simplification tolerance per part, as a fraction of the part's size. Visible paint gets the tightest. */
function simplifyError(groupName) {
  const n = norm(groupName);
  if (n.includes('chassis')) return 0.0025; // mostly hidden under the body
  if (n.includes('wheels')) return 0.004; // rims, hubs and brakes: many small hard-edged pieces
  return 0.0004; // bodies, front ends, tires: smooth silhouettes that show facets quickly
}

await Promise.all([MeshoptEncoder.ready, MeshoptDecoder.ready, MeshoptSimplifier.ready]);
const io = new NodeIO()
  .registerExtensions(ALL_EXTENSIONS)
  .registerDependencies({ 'meshopt.encoder': MeshoptEncoder, 'meshopt.decoder': MeshoptDecoder });

const triCount = (node) => {
  let n = 0;
  node.traverse((x) => {
    const m = x.getMesh();
    if (m) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  });
  return Math.round(n);
};
const disposeTree = (node) => {
  for (const c of node.listChildren()) disposeTree(c);
  node.dispose();
};

/** Topology-ignoring simplification (meshoptimizer "sloppy"), for clusters of tiny parts. */
function sloppySimplify(doc, prim, ratio, error) {
  const position = prim.getAttribute('POSITION');
  const src = prim.getIndices();
  const target = Math.floor((src.getCount() * ratio) / 3) * 3;
  const [dst] = MeshoptSimplifier.simplifySloppy(new Uint32Array(src.getArray()), new Float32Array(position.getArray()), 3, null, target, error);
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(dst).setBuffer(src.getBuffer()));
  compactPrimitive(prim);
}

/** Tire sidewall textures: base color, normal, and roughness packed into glTF's metal/rough layout. */
async function tireTextures(doc) {
  const read = (f) => fs.readFileSync(path.join(texDir, f));
  const base = read('AeroWheel_Tire_base_color.png');
  const normal = read('AeroWheel_Tire_normal.png');
  const { data, info } = await sharp(read('AeroWheel_Tire_roughness.png')).greyscale().raw().toBuffer({ resolveWithObject: true });
  const rgb = Buffer.alloc(info.width * info.height * 3);
  for (let i = 0, j = 0; i < data.length; i += info.channels, j += 3) rgb[j + 1] = data[i]; // G = roughness, B = metal 0
  const mr = await sharp(rgb, { raw: { width: info.width, height: info.height, channels: 3 } }).png().toBuffer();
  const tex = (name, img) => doc.createTexture(name).setImage(img).setMimeType('image/png');
  return { base: tex('tire base color', base), normal: tex('tire normal', normal), mr: tex('tire roughness', mr) };
}

for (const car of Object.keys(ONLY)) {
  const t0 = Date.now();
  const doc = await io.read(input);
  const root = doc.getRoot();
  const scene = root.listScenes()[0];
  const cars = root.listNodes().find((n) => n.getName() === 'CARS');
  for (const n of scene.listChildren()) if (n !== cars) disposeTree(n);
  for (const n of root.listNodes()) if (!n.isDisposed() && n.getCamera()) disposeTree(n);

  // 1. this car's parts only
  const drop = new Set(Object.entries(ONLY).filter(([k]) => k !== car).flatMap(([, v]) => v.map(norm)));
  for (const n of cars.listChildren()) if (drop.has(norm(n.getName()))) disposeTree(n);
  const groups = cars.listChildren().flatMap((n) => (CONTAINERS.includes(n.getName()) ? n.listChildren() : [n]));

  // 2. web materials
  const clearcoat = doc.createExtension(KHRMaterialsClearcoat);
  const web = {};
  for (const [name, d] of Object.entries(WEB_MATERIALS)) {
    const m = doc.createMaterial(name)
      .setBaseColorFactor([...d.color, d.alpha ?? 1])
      .setMetallicFactor(d.metal)
      .setRoughnessFactor(d.rough)
      .setDoubleSided(true);
    if (d.alpha !== undefined && d.alpha < 1) m.setAlphaMode('BLEND');
    if (d.clearcoat) m.setExtension('KHR_materials_clearcoat', clearcoat.createClearcoat().setClearcoatFactor(d.clearcoat).setClearcoatRoughnessFactor(0.05));
    web[name] = m;
  }
  const unknown = new Set();
  for (const mesh of root.listMeshes())
    for (const prim of mesh.listPrimitives()) {
      const src = prim.getMaterial()?.getName() ?? '';
      const idx = Number(src.match(/^(\d+)\s/)?.[1]);
      const target = C4D_TO_WEB[idx];
      if (!target) unknown.add(src || '(none)');
      prim.setMaterial(web[target ?? 'DARK MATTE']);
    }

  // 2b. tire sidewall textures (the tire meshes carry texture coordinates). Done before any prune,
  //     because prune drops texture coordinates that no texture uses.
  const sidewall = web['TIRE SIDEWALL'];
  const hasUV = sidewall.listParents().some((p) => p.getAttribute?.('TEXCOORD_0'));
  if (hasUV) {
    const t = await tireTextures(doc);
    sidewall.setBaseColorFactor([1, 1, 1, 1]).setBaseColorTexture(t.base).setNormalTexture(t.normal)
      .setMetallicRoughnessTexture(t.mr).setMetallicFactor(1).setRoughnessFactor(1);
  }

  // 3. bake each option's pieces into the option's own frame (so merged meshes get tight bounds),
  //    then merge pieces that share a material
  const m4 = new THREE.Matrix4();
  const deepClone = (prim) => {
    const p = prim.clone();
    for (const s of p.listSemantics()) p.setAttribute(s, p.getAttribute(s).clone());
    if (p.getIndices()) p.setIndices(p.getIndices().clone());
    return p;
  };
  for (const g of groups) {
    const inv = new THREE.Matrix4().fromArray(g.getWorldMatrix()).invert();
    const pieces = [];
    g.traverse((n) => {
      if (n !== g && n.getMesh()) pieces.push([n.getMesh(), m4.copy(inv).multiply(new THREE.Matrix4().fromArray(n.getWorldMatrix())).toArray()]);
    });
    for (const c of g.listChildren()) disposeTree(c);
    for (const [mesh, matrix] of pieces) {
      const baked = doc.createMesh('');
      for (const prim of mesh.listPrimitives()) {
        const p = deepClone(prim);
        transformPrimitive(p, matrix);
        baked.addPrimitive(p);
      }
      g.addChild(doc.createNode('').setMesh(baked));
    }
  }
  await doc.transform(prune(), dedup({ keepUniqueNames: true }), join({ keepNamed: false }), weld());

  // 4. simplify. The wheel hubs and brakes are hundreds of tiny separate pieces that the normal
  //    simplifier can't collapse, so large wheel meshes also get a topology-ignoring pass.
  const before = triCount(cars);
  for (const g of groups) {
    const error = simplifyError(g.getName());
    const isWheel = norm(g.getName()).includes('wheels');
    for (const n of g.listChildren())
      for (const prim of n.getMesh()?.listPrimitives() ?? []) {
        simplifyPrimitive(prim, { simplifier: MeshoptSimplifier, ratio: 0, error });
        const tris = prim.getIndices().getCount() / 3;
        if (isWheel && tris > 40000) sloppySimplify(doc, prim, 40000 / tris, error);
      }
  }

  // 5. front toward +X, wheels on the ground, centered
  cars.setTranslation([0, 0, 0]).setScale([1, 1, 1]).setRotation([0, -Math.SQRT1_2, 0, Math.SQRT1_2]);
  const b = getBounds(scene);
  cars.setTranslation([-(b.min[0] + b.max[0]) / 2, -b.min[1], -(b.min[2] + b.max[2]) / 2]);

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
  const out = path.join(OUT_DIR, `${car}.glb`);
  await io.write(out, doc);

  const size = getBounds(scene);
  console.log(`\n${car}.glb  ${(fs.statSync(out).size / 1048576).toFixed(1)} MB  ${before.toLocaleString()} -> ${triCount(cars).toLocaleString()} triangles  (${((Date.now() - t0) / 1000).toFixed(0)}s)`);
  console.log(`  size ${size.max.map((v, i) => (v - size.min[i]).toFixed(2)).join(' x ')}  tire textures: ${hasUV ? 'yes' : 'no UVs'}`);
  for (const g of groups) console.log(`  ${g.getName().padEnd(20)} ${triCount(g).toLocaleString().padStart(9)} tris  ${g.listChildren().length} meshes`);
  if (unknown.size) console.log('  unmapped materials (used DARK MATTE):', [...unknown].join(', '));
}
