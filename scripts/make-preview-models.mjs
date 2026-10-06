/**
 * Makes copies of src/assets/models/*.glb without Meshopt compression for the
 * single-file preview build (`npm run build:single`). Some sandboxed hosts block the
 * WebAssembly decoder that Meshopt needs; these copies load without it.
 * Output: src/assets/models-preview/ (generated, not committed).
 */
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets');
const src = path.join(root, 'models');
const out = path.join(root, 'models-preview');
fs.mkdirSync(out, { recursive: true });

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(src, file));
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  }
  await io.write(path.join(out, file), doc);
  console.log(`preview model ${file}  ${(fs.statSync(path.join(out, file)).size / 1024).toFixed(0)} KB`);
}
