// Resolves image and model file names to URLs the build serves.
// Drop new files into src/assets/thumbs or src/assets/models.
const thumbs = import.meta.glob('../../assets/thumbs/*', { eager: true, query: '?url', import: 'default' });
// The static preview build uses copies shaped for strict hosts (see scripts/make-preview-models.mjs):
// "sedan.gltf.json" plus texture files next to it.
const PREVIEW = import.meta.env.MODE === 'preview';
const models = PREVIEW
  ? import.meta.glob('../../assets/models-preview/*.gltf.json', { eager: true, query: '?url', import: 'default' })
  : import.meta.glob('../../assets/models/*.glb', { eager: true, query: '?url', import: 'default' });
// Listed so the preview build copies the textures next to the preview models.
export const previewTextures = PREVIEW
  ? import.meta.glob('../../assets/models-preview/*.{webp,png,jpg}', { eager: true, query: '?url', import: 'default' })
  : {};

function pick(map, folder, name) {
  const url = map[`../../assets/${folder}/${name}`];
  if (!url) console.warn(`[config] Missing file src/assets/${folder}/${name}`);
  return url ?? '';
}

export const thumb = (name) => pick(thumbs, 'thumbs', name);
export const model = (name) =>
  PREVIEW ? pick(models, 'models-preview', name.replace(/\.glb$/, '.gltf.json')) : pick(models, 'models', name);
