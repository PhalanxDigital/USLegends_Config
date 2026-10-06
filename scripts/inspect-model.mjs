/**
 * Prints the part (node) tree and material list of a GLB/glTF file, so the
 * names can be copied into src/lib/config/cars.js.
 *
 * Usage: npm run models:inspect -- path/to/model.glb [--depth 3]
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const depthArg = args.indexOf('--depth');
const maxDepth = depthArg >= 0 ? Number(args[depthArg + 1]) : 3;
if (!file) {
  console.error('Usage: npm run models:inspect -- path/to/model.glb [--depth 3]');
  process.exit(1);
}

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const root = doc.getRoot();

console.log(`\nParts in ${file} (showing ${maxDepth} levels; use --depth N for more)\n`);
const walk = (node, depth) => {
  if (depth > maxDepth) return;
  const kids = node.listChildren();
  const mesh = node.getMesh();
  const mats = mesh ? [...new Set(mesh.listPrimitives().map((p) => p.getMaterial()?.getName() || '(no material)'))] : [];
  const tag = mesh ? `  [mesh: ${mats.join(', ')}]` : kids.length ? `  (${kids.length} children)` : '';
  console.log(`${'  '.repeat(depth)}- ${node.getName() || '(unnamed)'}${tag}`);
  for (const k of kids) walk(k, depth + 1);
};
for (const scene of root.listScenes()) for (const n of scene.listChildren()) walk(n, 0);

console.log('\nMaterials (paint materials go in "paintMaterials" in the config):\n');
root.listMaterials().forEach((m, i) => {
  const c = m.getBaseColorFactor().slice(0, 3).map((v) => v.toFixed(2)).join(', ');
  const tex = m.getBaseColorTexture() ? ' + texture' : '';
  console.log(`  ${String(i).padStart(2)}  ${m.getName() || '(unnamed)'}   color(${c})${tex}`);
});
console.log('');
