/**
 * Geometry helpers shared by the model build scripts (build-c4d-models.mjs, build-bandolero-model.mjs).
 */
import { transformPrimitive } from '@gltf-transform/functions';
import * as THREE from 'three';
import { toCreasedNormals, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Triangle count of everything under a node. */
export function triCount(node) {
  let n = 0;
  node.traverse((x) => {
    const m = x.getMesh();
    if (m) for (const p of m.listPrimitives()) n += (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3;
  });
  return Math.round(n);
}

/** Removes a node and everything under it. */
export function disposeTree(node) {
  for (const c of node.listChildren()) disposeTree(c);
  node.dispose();
}

/** A copy of a primitive whose vertex data can be changed without touching the original. */
function deepClone(prim) {
  const p = prim.clone();
  for (const s of p.listSemantics()) p.setAttribute(s, p.getAttribute(s).clone());
  if (p.getIndices()) p.setIndices(p.getIndices().clone());
  return p;
}

/**
 * Bakes every mesh under `group` into the group's own frame and hangs the results directly off the
 * group, one node per source mesh. After this, join() can merge pieces that share a material and
 * the merged meshes get tight bounds.
 */
export function bakeIntoGroup(doc, group) {
  const inv = new THREE.Matrix4().fromArray(group.getWorldMatrix()).invert();
  const pieces = [];
  group.traverse((n) => {
    if (n !== group && n.getMesh()) pieces.push([n.getMesh(), new THREE.Matrix4().copy(inv).multiply(new THREE.Matrix4().fromArray(n.getWorldMatrix())).toArray()]);
  });
  for (const c of group.listChildren()) disposeTree(c);
  for (const [mesh, matrix] of pieces) {
    const baked = doc.createMesh('');
    for (const prim of mesh.listPrimitives()) {
      const p = deepClone(prim);
      transformPrimitive(p, matrix);
      baked.addPrimitive(p);
    }
    group.addChild(doc.createNode('').setMesh(baked));
  }
}

/**
 * Replaces a primitive's normals with smooth ones, splitting vertices only at creases sharper than
 * `creaseDeg`. Used on paint: exported normals can have patches that shade differently from their
 * surroundings, which shows as blotches in the reflections. Drops texture coordinates (paint has no textures).
 */
export function recomputeNormals(doc, prim, creaseDeg) {
  const pos = prim.getAttribute('POSITION');
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos.getArray()), 3));
  if (prim.getIndices()) geo.setIndex(new THREE.BufferAttribute(new Uint32Array(prim.getIndices().getArray()), 1));
  const creased = mergeVertices(toCreasedNormals(geo, (creaseDeg * Math.PI) / 180), 1e-6);
  const buffer = pos.getBuffer();
  for (const s of prim.listSemantics()) if (s !== 'POSITION' && s !== 'NORMAL') prim.setAttribute(s, null);
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(creased.attributes.position.array)).setBuffer(buffer));
  prim.setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(creased.attributes.normal.array)).setBuffer(buffer));
  prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(creased.index.array)).setBuffer(buffer));
}

/** Creates the web materials from a table like WEB_MATERIALS (scripts/c4d-materials.mjs). */
export function createWebMaterials(doc, table, clearcoatExt) {
  const web = {};
  for (const [name, d] of Object.entries(table)) {
    const m = doc.createMaterial(name)
      .setBaseColorFactor([...d.color, d.alpha ?? 1])
      .setMetallicFactor(d.metal)
      .setRoughnessFactor(d.rough)
      .setDoubleSided(true);
    if (d.alpha !== undefined && d.alpha < 1) m.setAlphaMode('BLEND');
    if (d.clearcoat) m.setExtension('KHR_materials_clearcoat', clearcoatExt.createClearcoat().setClearcoatFactor(d.clearcoat).setClearcoatRoughnessFactor(d.clearcoatRough ?? 0.05));
    web[name] = m;
  }
  return web;
}
