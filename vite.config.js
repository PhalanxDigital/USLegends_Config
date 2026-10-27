import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
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
  const single = mode === 'singlefile'; // one self-contained HTML file for sharing a preview
  const staticPreview = single || mode === 'preview'; // shareable static copy, no lead server
  return {
    base: './',
    plugins: [svelte(), localLeadApi(), single && viteSingleFile()].filter(Boolean),
    assetsInclude: ['**/*.glb'],
    build: {
      outDir: staticPreview ? 'dist-preview' : 'dist',
      assetsInlineLimit: single ? Number.MAX_SAFE_INTEGER : 4096,
      chunkSizeWarningLimit: 1200,
    },
  };
});
