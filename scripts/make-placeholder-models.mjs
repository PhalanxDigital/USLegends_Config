/**
 * Builds stand-in 3D models (GLB) for the three cars so the configurator can be
 * developed before the real source files arrive.
 *
 * The part (node) names match the names inside the real Sketchfab sedan model
 * ("37 FORD SEDAN BODY", "RIMS (BASSET)", ...), so the app's config file maps to
 * the real model the same way it maps to these placeholders. Coupe and Bandolero
 * names are best guesses until their real files are inspected.
 *
 * Units are meters, Y is up, the front of the car points toward +X.
 *
 * Usage: npm run models:placeholder
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Document, NodeIO } from '@gltf-transform/core';
import { KHRMaterialsClearcoat, EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { dedup, weld, quantize, meshopt, prune } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const OUT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets/models');

// ---------------------------------------------------------------------------
// Materials (glTF PBR). Paint materials are the ones the app recolors.
// ---------------------------------------------------------------------------
const MATERIALS = {
  'BODY PAINT': { color: [0.8, 0.8, 0.8], metal: 0.05, rough: 0.35, clearcoat: 1 },
  'FRONT END PAINT': { color: [0.8, 0.8, 0.8], metal: 0.05, rough: 0.35, clearcoat: 1 },
  WINDOW: { color: [0.02, 0.025, 0.03], metal: 0.2, rough: 0.08 },
  TRIM: { color: [0.02, 0.02, 0.02], metal: 0.2, rough: 0.5 },
  CHROME: { color: [0.75, 0.75, 0.75], metal: 1, rough: 0.18 },
  GRILLE: { color: [0.03, 0.035, 0.045], metal: 0.6, rough: 0.35 },
  'GRILLE BLUE': { color: [0.05, 0.08, 0.2], metal: 0.6, rough: 0.35 },
  CHASSIS: { color: [0.12, 0.12, 0.12], metal: 0.6, rough: 0.5 },
  'ROLL CAGE': { color: [0.05, 0.05, 0.05], metal: 0.4, rough: 0.4 },
  ENGINE: { color: [0.25, 0.25, 0.27], metal: 0.7, rough: 0.4 },
  SEAT: { color: [0.03, 0.03, 0.03], metal: 0, rough: 0.8 },
  TIRE: { color: [0.025, 0.025, 0.025], metal: 0, rough: 0.92 },
  'TIRE LETTERS': { color: [0.85, 0.85, 0.85], metal: 0, rough: 0.7 },
  'RIM BLACK': { color: [0.015, 0.015, 0.015], metal: 0.3, rough: 0.3 },
  'RIM HOLE': { color: [0.0, 0.0, 0.0], metal: 0, rough: 1 },
  'RIM STRIPE YELLOW': { color: [1.0, 0.72, 0.05], metal: 0.1, rough: 0.4 },
  'RIM STRIPE RED': { color: [0.85, 0.05, 0.03], metal: 0.1, rough: 0.4 },
};

// ---------------------------------------------------------------------------
// Geometry helpers. Each "part" collects geometry per material and becomes one
// named glTF node with one child mesh per material.
// ---------------------------------------------------------------------------
const TAU = Math.PI * 2;

function xf(geom, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1] } = {}) {
  const g = (geom.index ? geom.toNonIndexed() : geom.clone());
  for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
  if (!g.attributes.normal) g.computeVertexNormals();
  const m = new THREE.Matrix4().compose(
    new THREE.Vector3(...pos),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(...rot, 'XYZ')),
    new THREE.Vector3(...scale),
  );
  g.applyMatrix4(m);
  return g;
}

class Part {
  constructor(name) {
    this.name = name;
    this.byMat = new Map();
    this.children = [];
  }
  add(mat, geom, t) {
    if (!MATERIALS[mat]) throw new Error(`Unknown material ${mat}`);
    if (!this.byMat.has(mat)) this.byMat.set(mat, []);
    this.byMat.get(mat).push(xf(geom, t));
    return this;
  }
  /** Add the same piece on the left (+z) and right (-z) side. */
  pair(mat, geom, { pos = [0, 0, 0], rot = [0, 0, 0], scale } = {}) {
    this.add(mat, geom, { pos, rot, scale });
    this.add(mat, geom, { pos: [pos[0], pos[1], -pos[2]], rot: [-rot[0], -rot[1], rot[2]], scale });
    return this;
  }
  child(part) {
    this.children.push(part);
    return part;
  }
}

const box = (x, y, z) => new THREE.BoxGeometry(x, y, z);
const cyl = (r, len, seg = 24) => new THREE.CylinderGeometry(r, r, len, seg); // axis Y
const sphere = (seg = 28) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.6));
/** Upper part of a sphere, open at the bottom: wheel arches that wrap the tire. */
const cap = (seg = 32, extent = 0.62) => new THREE.SphereGeometry(1, seg, Math.round(seg * 0.6), 0, TAU, 0, Math.PI * extent);
const torus = (r, tube, rs = 10, ts = 48) => new THREE.TorusGeometry(r, tube, rs, ts); // in XY plane, axis Z
const AX_X = [0, 0, -Math.PI / 2]; // rotate a Y-axis cylinder to lie along X
const AX_Z = [Math.PI / 2, 0, 0]; // rotate a Y-axis cylinder to lie along Z

/** Extrude a side profile (x,y points, smoothed) across the car's width (z). */
function profile(points, width, { bevel = 0.04, smooth = true } = {}) {
  const shape = new THREE.Shape();
  const v = points.map(([x, y]) => new THREE.Vector2(x, y));
  if (smooth) {
    shape.moveTo(v[0].x, v[0].y);
    shape.lineTo(v[1].x, v[1].y);
    shape.splineThru(v.slice(2));
    shape.lineTo(v[0].x, v[0].y);
  } else {
    shape.setFromPoints(v);
  }
  const g = new THREE.ExtrudeGeometry(shape, {
    depth: width,
    bevelEnabled: bevel > 0,
    bevelThickness: bevel,
    bevelSize: bevel,
    bevelSegments: 3,
    curveSegments: 24,
  });
  g.translate(0, 0, -width / 2);
  return g;
}

/** Tube that follows straight segments between points (for nerf bars, cages, pipes). */
function tube(points, r, seg = 12) {
  const curve = new THREE.CurvePath();
  for (let i = 0; i < points.length - 1; i++) {
    curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i + 1])));
  }
  return new THREE.TubeGeometry(curve, Math.max(8, points.length * 8), r, seg, false);
}

// ---------------------------------------------------------------------------
// Wheels (built facing +z, then turned for the right side).
// ---------------------------------------------------------------------------
function tireGeom(R, w, inner) {
  const h = w / 2;
  const pts = [
    [inner, -h * 0.9], [R - 0.03, -h], [R - 0.008, -h * 0.82], [R, -h * 0.55],
    [R, h * 0.55], [R - 0.008, h * 0.82], [R - 0.03, h], [inner, h * 0.9],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const g = new THREE.LatheGeometry(pts, 56);
  g.rotateX(Math.PI / 2); // axis Y -> Z
  return g;
}

function addAtWheels(part, wheelSpots, buildOne) {
  for (const s of wheelSpots) {
    const side = s.z >= 0 ? 1 : -1;
    buildOne((mat, geom, t = {}) => {
      // place relative to wheel center, mirrored for the right side
      const g = xf(geom, t);
      if (side < 0) g.rotateY(Math.PI);
      g.translate(s.x, s.y, s.z);
      if (!part.byMat.has(mat)) part.byMat.set(mat, []);
      part.byMat.get(mat).push(g);
    });
  }
}

function tires(name, spots, R, w, dirt) {
  const p = new Part(name);
  addAtWheels(p, spots, (add) => {
    add('TIRE', tireGeom(R, w, R * 0.6));
    if (dirt) {
      const n = 30;
      for (let row = 0; row < 2; row++) {
        for (let i = 0; i < n; i++) {
          const a = (i + row * 0.5) * (TAU / n);
          add('TIRE', box(0.045, 0.026, w * 0.36), {
            pos: [Math.cos(a) * (R + 0.006), Math.sin(a) * (R + 0.006), row ? w * 0.2 : -w * 0.2],
            rot: [0, 0, a],
          });
        }
      }
    }
    // sidewall lettering band (stands in for the white "HOOSIER" lettering)
    for (let i = 0; i < 2; i++) {
      add('TIRE LETTERS', new THREE.RingGeometry(R * 0.78, R * 0.86, 40, 1, i * Math.PI + 0.5, 1.4), {
        pos: [0, 0, w / 2 + 0.002],
      });
    }
  });
  return p;
}

function rims(name, spots, R, w, style) {
  const p = new Part(name);
  const rr = R * 0.6; // rim radius
  addAtWheels(p, spots, (add) => {
    add('RIM BLACK', cyl(rr, w * 0.7, 40), { rot: AX_Z });
    add('RIM BLACK', cyl(rr * 0.32, w * 0.8, 24), { rot: AX_Z }); // hub
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + Math.PI / 4;
      add('CHROME', cyl(0.012, 0.03, 10), { pos: [Math.cos(a) * rr * 0.2, Math.sin(a) * rr * 0.2, w * 0.41], rot: AX_Z });
    }
    if (style === 'aero') {
      add('RIM STRIPE YELLOW', torus(rr, 0.012, 8, 56), { pos: [0, 0, w * 0.36] });
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU;
        add('RIM HOLE', new THREE.CircleGeometry(1, 20), {
          pos: [Math.cos(a) * rr * 0.62, Math.sin(a) * rr * 0.62, w * 0.352],
          rot: [0, 0, a],
          scale: [rr * 0.2, rr * 0.12, 1],
        });
      }
    } else if (style === 'basset') {
      add('RIM STRIPE RED', torus(rr, 0.012, 8, 56), { pos: [0, 0, w * 0.36] });
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        add('RIM BLACK', box(rr * 0.7, rr * 0.16, 0.025), {
          pos: [Math.cos(a) * rr * 0.55, Math.sin(a) * rr * 0.55, w * 0.37],
          rot: [0, 0, a],
        });
      }
    } else if (style === 'beadlock') {
      add('RIM BLACK', torus(rr * 0.96, 0.03, 8, 56), { pos: [0, 0, w * 0.37] });
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * TAU;
        add('CHROME', cyl(0.009, 0.03, 8), { pos: [Math.cos(a) * rr * 0.96, Math.sin(a) * rr * 0.96, w * 0.4], rot: AX_Z });
      }
    }
  });
  return p;
}

// ---------------------------------------------------------------------------
// Legends car pieces
// ---------------------------------------------------------------------------
const LEG = {
  front: 1.0, rear: -0.85, track: 0.68, R: 0.29, tireW: 0.2,
};
const legSpots = [
  { x: LEG.front, y: LEG.R, z: LEG.track }, { x: LEG.front, y: LEG.R, z: -LEG.track },
  { x: LEG.rear, y: LEG.R, z: LEG.track }, { x: LEG.rear, y: LEG.R, z: -LEG.track },
];

function frontEnd(name, style) {
  const p = new Part(name);
  // hood
  p.add('FRONT END PAINT', profile([[0.36, 0.47], [1.14, 0.47], [1.16, 0.72], [0.8, 0.79], [0.36, 0.85]], 0.56, { bevel: 0.04 }));
  // fenders: long teardrops that wrap the top of the front tires
  p.pair('FRONT END PAINT', cap(), { pos: [LEG.front + 0.02, 0.4, 0.66], scale: [0.5, 0.31, 0.17] });
  p.pair('FRONT END PAINT', cap(24, 0.55), { pos: [LEG.front - 0.42, 0.42, 0.6], scale: [0.36, 0.2, 0.12] });
  if (style === 'chevy34') {
    p.add('GRILLE', box(0.05, 0.46, 0.36), { pos: [1.24, 0.62, 0] });
    for (let i = 0; i < 11; i++) p.add('CHROME', box(0.012, 0.44, 0.008), { pos: [1.27, 0.62, -0.16 + i * 0.032] });
    p.add('CHROME', box(0.06, 0.03, 0.4), { pos: [1.24, 0.86, 0] });
    p.pair('CHROME', sphere(20), { pos: [1.14, 0.84, 0.4], scale: [0.07, 0.07, 0.07] });
    p.pair('CHROME', cyl(0.012, 0.16), { pos: [1.12, 0.76, 0.37] });
  } else if (style === 'ford37') {
    for (const s of [1, -1]) {
      p.add('GRILLE BLUE', box(0.04, 0.5, 0.24), { pos: [1.26, 0.6, s * 0.09], rot: [0, -s * 0.5, 0] });
      for (let i = 0; i < 6; i++) {
        const zi = 0.02 + i * 0.03;
        p.add('CHROME', box(0.006, 0.48, 0.006), { pos: [1.26 + 0.546 * (0.09 - zi) + 0.024, 0.6, s * zi], rot: [0, -s * 0.5, 0] });
      }
    }
    p.pair('CHROME', sphere(20), { pos: [1.4, 0.56, 0.62], scale: [0.07, 0.09, 0.055] }); // lamps faired into fenders
    p.add('CHROME', box(0.03, 0.02, 1.2), { pos: [1.4, 0.36, 0] }); // spreader bar
  } else if (style === 'ford34') {
    p.add('GRILLE', profile([[-0.17, 0.82], [0.17, 0.82], [0.15, 0.55], [0.0, 0.38], [-0.15, 0.55]], 0.05, { bevel: 0.01, smooth: false }), {
      pos: [1.25, 0, 0], rot: [0, Math.PI / 2, 0],
    });
    for (let i = 0; i < 9; i++) p.add('CHROME', box(0.012, 0.012, 0.3 - i * 0.025), { pos: [1.28, 0.78 - i * 0.045, 0] });
    p.pair('CHROME', sphere(20), { pos: [1.15, 0.8, 0.37], scale: [0.065, 0.065, 0.065] });
    p.add('CHROME', box(0.025, 0.025, 0.8), { pos: [1.15, 0.72, 0] }); // lamp bar
  }
  return p;
}

function body(name, top, { cage = true } = {}) {
  const p = new Part(name);
  const shell = [[-1.45, 0.42], [0.38, 0.42], [0.38, 0.82], ...top];
  p.add('BODY PAINT', profile(shell, 0.98, { bevel: 0.05 }));
  // rear fenders
  p.pair('BODY PAINT', cap(), { pos: [LEG.rear, 0.42, 0.62], scale: [0.5, 0.29, 0.17] });
  // black lower trim
  p.add('TRIM', box(1.7, 0.05, 1.1), { pos: [-0.53, 0.39, 0] });
  // side windows: derive from the roof line
  const roofFront = top[1];
  const roofBack = top[3];
  const y0 = 0.93;
  const yTop = Math.min(roofFront[1], roofBack[1]) - 0.06;
  const xFront = roofFront[0] - 0.08;
  const xBack = roofBack[0] + 0.12;
  const pillar = (xFront + xBack) / 2;
  for (const side of [1, -1]) {
    const z = side * 0.55;
    const win = (x1, x2) => profile([[x1, y0], [x2, y0], [x2, yTop], [x1, yTop]], 0.01, { bevel: 0, smooth: false });
    if (xFront - xBack > 0.6) {
      p.add('WINDOW', win(pillar + 0.05, xFront), { pos: [0, 0, z] });
      p.add('WINDOW', win(xBack, pillar - 0.05), { pos: [0, 0, z] });
    } else {
      p.add('WINDOW', win(xBack, xFront), { pos: [0, 0, z] });
    }
  }
  // windshield, laid on the slope between the cowl and the windshield top
  const [c0, c1] = [top[0], top[1]];
  const len = Math.hypot(c1[0] - c0[0], c1[1] - c0[1]);
  const lean = Math.atan2(c0[0] - c1[0], c1[1] - c0[1]);
  p.add('WINDOW', box(0.012, len * 0.78, 0.84), { pos: [(c0[0] + c1[0]) / 2 + 0.085, (c0[1] + c1[1]) / 2 + 0.02, 0], rot: [0, 0, lean] });
  return p;
}

function legendsChassis(name) {
  const p = new Part(name);
  p.pair('CHASSIS', box(2.7, 0.08, 0.06), { pos: [-0.05, 0.26, 0.33] });
  for (const x of [1.1, 0.3, -0.5, -1.2]) p.add('CHASSIS', box(0.06, 0.06, 0.66), { pos: [x, 0.26, 0] });
  // axles
  for (const x of [LEG.front, LEG.rear]) p.add('CHASSIS', cyl(0.025, LEG.track * 2 - 0.12), { pos: [x, LEG.R, 0], rot: AX_Z });
  // nerf bars (front, rear, sides)
  p.add('CHROME', tube([[1.3, 0.3, 0.55], [1.55, 0.3, 0.55], [1.6, 0.3, 0.0], [1.55, 0.3, -0.55], [1.3, 0.3, -0.55]], 0.022));
  p.add('CHROME', tube([[-1.4, 0.3, 0.55], [-1.62, 0.3, 0.55], [-1.66, 0.3, 0.0], [-1.62, 0.3, -0.55], [-1.4, 0.3, -0.55]], 0.022));
  for (const s of [1, -1]) p.add('CHROME', tube([[0.62, 0.3, s * 0.56], [0.55, 0.3, s * 0.82], [-0.48, 0.3, s * 0.82], [-0.55, 0.3, s * 0.56]], 0.02));
  // motor, radiator
  p.add('ENGINE', box(0.42, 0.3, 0.34), { pos: [0.82, 0.6, 0] });
  p.add('CHASSIS', box(0.05, 0.3, 0.42), { pos: [1.1, 0.6, 0] });
  // cockpit: seat, steering wheel, roll cage (visible through the windows)
  p.add('SEAT', box(0.4, 0.5, 0.42), { pos: [-0.38, 0.7, 0.1] });
  p.add('ROLL CAGE', torus(0.13, 0.014, 8, 32), { pos: [0.05, 0.98, 0.1], rot: [0, Math.PI / 2 - 0.4, 0] });
  for (const s of [1, -1]) {
    p.add('ROLL CAGE', tube([[-0.62, 0.42, s * 0.4], [-0.62, 1.12, s * 0.38]], 0.022));
    p.add('ROLL CAGE', tube([[0.22, 0.42, s * 0.42], [0.18, 1.08, s * 0.4], [-0.62, 1.12, s * 0.38]], 0.02));
  }
  p.add('ROLL CAGE', tube([[-0.62, 1.12, 0.38], [-0.62, 1.12, -0.38]], 0.022));
  return p;
}

function exhausts() {
  const group = new Part('EXHAUST');
  const z = -0.66;
  const long = group.child(new Part('LONG EXHAUST'));
  long.add('CHROME', tube([[0.75, 0.55, -0.2], [0.62, 0.36, z], [0.5, 0.3, z], [-0.62, 0.3, z]], 0.035));
  long.add('CHROME', cyl(0.04, 0.05), { pos: [-0.62, 0.3, z], rot: AX_X });
  const short = group.child(new Part('SHORT EXHAUST'));
  short.add('CHROME', tube([[0.75, 0.55, -0.2], [0.62, 0.36, z], [0.5, 0.3, z], [0.02, 0.3, z], [-0.06, 0.24, z - 0.02]], 0.035));
  return group;
}

function legendsWheels(rimStyles) {
  const group = new Part('WHEELS');
  group.child(tires('TIRES (ASPHALT)', legSpots, LEG.R, LEG.tireW, false));
  group.child(tires('TIRES (DIRT)', legSpots, LEG.R, LEG.tireW, true));
  for (const [name, style] of rimStyles) group.child(rims(name, legSpots, LEG.R, LEG.tireW, style));
  return group;
}

const FRONT_ENDS = () => [
  frontEnd('34 CHEVY FRONT END', 'chevy34'),
  frontEnd('37 FORD FRONT END', 'ford37'),
  frontEnd('34 FORD FRONT END', 'ford34'),
];
const RIM_STYLES = [['RIMS (AERO)', 'aero'], ['RIMS (BASSET)', 'basset'], ['RIMS( BEADLOCK)', 'beadlock']];

// Roof lines: [cowl point, windshield top, ...roof..., rear]
const ROOFS = {
  sedanFord34: [[0.3, 0.87], [0.18, 1.2], [-0.4, 1.24], [-0.95, 1.22], [-1.22, 1.08], [-1.42, 0.86], [-1.47, 0.62]],
  sedanFord37: [[0.28, 0.88], [0.12, 1.19], [-0.25, 1.26], [-0.78, 1.23], [-1.18, 1.02], [-1.43, 0.76], [-1.47, 0.6]],
  sedanChevy37: [[0.28, 0.88], [0.14, 1.21], [-0.3, 1.28], [-0.85, 1.24], [-1.25, 1.0], [-1.45, 0.72], [-1.48, 0.58]],
  coupeChevy34: [[0.3, 0.87], [0.16, 1.21], [-0.2, 1.24], [-0.5, 1.2], [-0.72, 0.98], [-1.15, 0.9], [-1.44, 0.78]],
  coupeFord34: [[0.28, 0.88], [0.13, 1.19], [-0.18, 1.24], [-0.52, 1.18], [-0.8, 0.95], [-1.2, 0.86], [-1.45, 0.72]],
};

function sedan() {
  return [
    ...FRONT_ENDS(),
    body('34 FORD SEDAN BODY', ROOFS.sedanFord34),
    body('37 FORD SEDAN BODY', ROOFS.sedanFord37),
    body('37 CHEVY SEDAN BODY', ROOFS.sedanChevy37),
    legendsChassis('SEDAN CHASSIS'),
    exhausts(),
    legendsWheels(RIM_STYLES),
  ];
}

function coupe() {
  return [
    ...FRONT_ENDS(),
    body('34 CHEVY COUPE BODY', ROOFS.coupeChevy34),
    body('34 FORD COUPE BODY', ROOFS.coupeFord34),
    legendsChassis('COUPE CHASSIS'),
    exhausts(),
    legendsWheels(RIM_STYLES),
  ];
}

function bandolero() {
  const B = { front: 0.82, rear: -0.72, track: 0.6, R: 0.25, w: 0.18 };
  const spots = [
    { x: B.front, y: B.R, z: B.track }, { x: B.front, y: B.R, z: -B.track },
    { x: B.rear, y: B.R, z: B.track }, { x: B.rear, y: B.R, z: -B.track },
  ];
  const b = new Part('BANDOLERO BODY');
  b.add('BODY PAINT', profile([[-1.25, 0.3], [1.22, 0.3], [1.3, 0.42], [0.55, 0.62], [0.12, 0.96], [-0.62, 1.0], [-0.95, 0.82], [-1.27, 0.66]], 1.0, { bevel: 0.05 }));
  b.pair('BODY PAINT', cap(), { pos: [B.front, 0.32, 0.57], scale: [0.4, 0.26, 0.15] });
  b.pair('BODY PAINT', cap(), { pos: [B.rear, 0.32, 0.57], scale: [0.4, 0.26, 0.15] });
  for (const s of [1, -1]) b.add('WINDOW', profile([[0.08, 0.66], [0.22, 0.66], [0.1, 0.9], [-0.58, 0.93], [-0.7, 0.66]], 0.01, { bevel: 0, smooth: false }), { pos: [0, 0, s * 0.556] });
  b.add('WINDOW', box(0.01, 0.3, 0.8), { pos: [0.33, 0.8, 0], rot: [0, 0, -0.75] });
  b.add('TRIM', box(2.3, 0.05, 1.1), { pos: [0, 0.3, 0] });
  const c = new Part('BANDOLERO CHASSIS');
  c.pair('CHASSIS', box(2.3, 0.07, 0.05), { pos: [0, 0.22, 0.3] });
  for (const x of [B.front, B.rear]) c.add('CHASSIS', cyl(0.022, B.track * 2 - 0.1), { pos: [x, B.R, 0], rot: AX_Z });
  c.add('CHROME', tube([[1.1, 0.27, 0.45], [1.42, 0.27, 0.45], [1.46, 0.27, 0], [1.42, 0.27, -0.45], [1.1, 0.27, -0.45]], 0.02));
  c.add('CHROME', tube([[-1.15, 0.27, 0.45], [-1.42, 0.27, 0.45], [-1.46, 0.27, 0], [-1.42, 0.27, -0.45], [-1.15, 0.27, -0.45]], 0.02));
  c.add('SEAT', box(0.38, 0.45, 0.4), { pos: [-0.3, 0.6, 0] });
  const w = new Part('WHEELS');
  w.child(tires('TIRES', spots, B.R, B.w, false));
  w.child(rims('RIMS', spots, B.R, B.w, 'basset'));
  return [b, c, w];
}

// ---------------------------------------------------------------------------
// glTF writer
// ---------------------------------------------------------------------------
async function writeGLB(file, parts) {
  const doc = new Document();
  doc.createBuffer();
  const clearcoatExt = doc.createExtension(KHRMaterialsClearcoat);
  const scene = doc.createScene('Scene');
  const root = doc.createNode('GLTF_SceneRootNode');
  scene.addChild(root);
  const mats = new Map();
  const getMat = (name) => {
    if (mats.has(name)) return mats.get(name);
    const d = MATERIALS[name];
    const m = doc.createMaterial(name)
      .setBaseColorFactor([...d.color, 1])
      .setMetallicFactor(d.metal)
      .setRoughnessFactor(d.rough)
      .setDoubleSided(true);
    if (d.clearcoat) m.setExtension('KHR_materials_clearcoat', clearcoatExt.createClearcoat().setClearcoatFactor(d.clearcoat).setClearcoatRoughnessFactor(0.08));
    mats.set(name, m);
    return m;
  };
  const buffer = doc.getRoot().listBuffers()[0];
  const emit = (part) => {
    const node = doc.createNode(part.name);
    for (const [matName, geoms] of part.byMat) {
      const merged = mergeGeometries(geoms, false);
      const pos = doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.attributes.position.array)).setBuffer(buffer);
      const nor = doc.createAccessor().setType('VEC3').setArray(new Float32Array(merged.attributes.normal.array)).setBuffer(buffer);
      const prim = doc.createPrimitive().setAttribute('POSITION', pos).setAttribute('NORMAL', nor).setMaterial(getMat(matName));
      const mesh = doc.createMesh(`${part.name} - ${matName}`).addPrimitive(prim);
      node.addChild(doc.createNode(`${part.name} - ${matName}`).setMesh(mesh));
    }
    for (const ch of part.children) node.addChild(emit(ch));
    return node;
  };
  for (const p of parts) root.addChild(emit(p));
  doc.getRoot().getAsset().generator = 'US Legends placeholder model generator';
  // Same compression the real models will get (see scripts/optimize-model.mjs).
  await MeshoptEncoder.ready;
  await doc.transform(dedup({ keepUniqueNames: true }), weld(), prune(), quantize(), meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const io = new NodeIO()
    .registerExtensions([KHRMaterialsClearcoat, EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
  const bytes = await io.writeBinary(doc);
  fs.writeFileSync(file, bytes);
  console.log(`${path.basename(file)}  ${(bytes.byteLength / 1024).toFixed(0)} KB`);
}

// The sedan and coupe now come from the Cinema 4D scene (npm run models:c4d), so by default only the
// Bandolero stand-in is written. `--all` also writes stand-in sedan and coupe files (overwrites the real ones).
fs.mkdirSync(OUT_DIR, { recursive: true });
if (process.argv.includes('--all')) {
  await writeGLB(path.join(OUT_DIR, 'sedan.glb'), sedan());
  await writeGLB(path.join(OUT_DIR, 'coupe.glb'), coupe());
}
await writeGLB(path.join(OUT_DIR, 'bandolero.glb'), bandolero());
