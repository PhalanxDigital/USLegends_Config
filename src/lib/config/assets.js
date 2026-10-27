// Resolves image and model file names to URLs the build can serve (or inline in the
// single-file preview build). Drop new files into src/assets/thumbs or src/assets/models.
const thumbs = import.meta.glob('../../assets/thumbs/*', { eager: true, query: '?url', import: 'default' });
// The single-file preview uses uncompressed copies (see scripts/make-preview-models.mjs).
const PREVIEW = import.meta.env.MODE === 'singlefile' || import.meta.env.MODE === 'preview';
const models = PREVIEW
  ? import.meta.glob('../../assets/models-preview/*.glb', { eager: true, query: '?url', import: 'default' })
  : import.meta.glob('../../assets/models/*.glb', { eager: true, query: '?url', import: 'default' });

function pick(map, folder, name) {
  const url = map[`../../assets/${folder}/${name}`];
  if (!url) console.warn(`[config] Missing file src/assets/${folder}/${name}`);
  return url ?? '';
}

export const thumb = (name) => pick(thumbs, 'thumbs', name);
export const model = (name) => pick(models, PREVIEW ? 'models-preview' : 'models', name);
