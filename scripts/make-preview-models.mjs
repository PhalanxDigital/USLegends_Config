/**
 * Makes copies of src/assets/models/*.glb for the shareable static previews
 * (`npm run build:preview` and `npm run build:single`):
 *   - without Meshopt compression, because some sandboxed hosts block the WebAssembly decoder it needs
 *   - as self-contained glTF JSON (`name.gltf.json`, buffers and images embedded), because some hosts
 *     won't serve .glb files
 * Output: src/assets/models-preview/ (generated, not committed).
 */
import { NodeIO, Format } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../src/assets');
const src = path.join(root, 'models');
const out = path.join(root, 'models-preview');
fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });

for (const file of fs.readdirSync(src).filter((f) => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(src, file));
  for (const ext of doc.getRoot().listExtensionsUsed()) {
    if (ext.extensionName === 'EXT_meshopt_compression') ext.dispose();
  }
  const { json, resources } = await io.writeJSON(doc, { format: Format.GLTF, basename: file.replace(/\.glb$/, '') });
  const embed = (item, mime) => {
    if (item.uri && resources[item.uri]) item.uri = `data:${mime};base64,${Buffer.from(resources[item.uri]).toString('base64')}`;
  };
  for (const b of json.buffers ?? []) embed(b, 'application/octet-stream');
  for (const img of json.images ?? []) embed(img, img.mimeType ?? 'image/png');
  const name = file.replace(/\.glb$/, '.gltf.json');
  fs.writeFileSync(path.join(out, name), JSON.stringify(json));
  console.log(`preview model ${name}  ${(fs.statSync(path.join(out, name)).size / 1048576).toFixed(1)} MB`);
}
