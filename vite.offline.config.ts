import { defineConfig } from 'vite';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';

/**
 * Single self-contained, file:// safe page. Browsers block type="module" scripts on file:// origins, so:
 *  - the bundle is a classic IIFE (rollup format 'iife'),
 *  - JS and CSS are inlined into index.html here (no external files, no CDNs),
 *  - the one <script> has no type="module" and no crossorigin, and sits at the end of <body> after <div id="root">.
 * Inlining is done with function replacers so `$` sequences inside the code are never interpreted.
 */
function inlineClassicSingleFile(): Plugin {
  return {
    name: 'inline-classic-single-file', apply: 'build', enforce: 'post',
    generateBundle(_o, bundle) {
      const htmlKey = Object.keys(bundle).find((k) => k.endsWith('.html')); if (!htmlKey) throw new Error('offline build: no html emitted');
      const page = bundle[htmlKey] as { source: string }; let html = String(page.source);
      let js = ''; let css = '';
      for (const [k, f] of Object.entries(bundle)) {
        if (f.type === 'chunk') { js += f.code; delete bundle[k]; }
        else if (k.endsWith('.css')) { css += String(f.source); delete bundle[k]; }
      }
      html = html.replace(/<script\b[^>]*><\/script>\s*/g, '').replace(/<link\b[^>]*rel="stylesheet"[^>]*>\s*/g, '').replace(/<link\b[^>]*rel="modulepreload"[^>]*>\s*/g, '').replace(/\s+crossorigin(="[^"]*")?/g, '');
      const safeJs = js.replace(/<\/script/gi, '<\\/script');
      html = html.replace('</head>', () => `<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`);
      html = html.replace('</body>', () => `<script>${safeJs}</script>\n</body>`);
      page.source = html;
    },
  };
}

export default defineConfig({
  plugins: [react(), inlineClassicSingleFile()],
  build: {
    outDir: 'dist-offline', emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, chunkSizeWarningLimit: 6000,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
