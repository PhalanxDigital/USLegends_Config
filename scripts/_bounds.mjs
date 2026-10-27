import { NodeIO, getBounds } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(process.argv[2]);
const root = doc.getRoot();
const f = (b) => `x ${b.min[0].toFixed(2)}..${b.max[0].toFixed(2)}  y ${b.min[1].toFixed(2)}..${b.max[1].toFixed(2)}  z ${b.min[2].toFixed(2)}..${b.max[2].toFixed(2)}`;
console.log('scene', f(getBounds(root.listScenes()[0])));
const cars = root.listNodes().find((n) => n.getName() === 'CARS');
for (const c of cars.listChildren()) {
  console.log(c.getName().padEnd(22), f(getBounds(c)));
  for (const k of c.listChildren()) if (k.getName()) console.log('   ' + k.getName().padEnd(19), f(getBounds(k)));
  if (c.getName().includes('CHASSIS')) for (const k of c.listChildren()) { const b = getBounds(k); if (b.min[1] < 0.05 || b.max[0]-b.min[0] > 7) console.log('     chassis piece', k.getMesh()?.listPrimitives().map(p=>p.getMaterial()?.getName()).join(','), f(b)); }
}
