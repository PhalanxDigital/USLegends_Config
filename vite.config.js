import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import submitLead from './netlify/functions/submit.mjs';

/** Runs the Netlify lead function locally so `npm run dev` and `npm run preview` work without the Netlify CLI. */
function localLeadApi() {
  const middleware = async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const request = new Request('http://localhost/api/submit', {
      method: req.method,
      headers: { 'Content-Type': req.headers['content-type'] ?? 'application/json' },
      body: req.method === 'POST' ? Buffer.concat(chunks) : undefined,
    });
    const response = await submitLead(request);
    res.statusCode = response.status;
    res.setHeader('Content-Type', 'application/json');
    res.end(await response.text());
  };
  return {
    name: 'local-lead-api',
    configureServer(server) {
      server.middlewares.use('/api/submit', middleware);
    },
    configurePreviewServer(server) {
      server.middlewares.use('/api/submit', middleware);
    },
  };
}

export default defineConfig(({ mode }) => {
  // `--mode preview`: shareable static copy with no lead server (see scripts/make-preview-models.mjs).
  // Asset names stay unhashed and nothing is inlined, so preview models find their texture files.
  const preview = mode === 'preview';
  return {
    base: './',
    plugins: [svelte(), localLeadApi()],
    assetsInclude: ['**/*.glb'],
    build: {
      outDir: preview ? 'dist-preview' : 'dist',
      assetsInlineLimit: preview ? 0 : 4096,
      chunkSizeWarningLimit: 1200,
      rollupOptions: preview ? { output: { assetFileNames: 'assets/[name][extname]' } } : {},
    },
  };
});
