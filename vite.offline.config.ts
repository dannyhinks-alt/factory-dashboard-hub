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
/** Runs before the bundle: any load-time error is printed on screen instead of leaving a blank page. */
const BOOT_GUARD = `(function(){function show(m){try{var b=document.getElementById('boot-error');if(!b){b=document.createElement('div');b.id='boot-error';b.setAttribute('role','alert');b.style.cssText='position:fixed;left:0;right:0;top:0;z-index:2147483647;background:#9f1239;color:#fff;padding:12px 16px;font:14px/1.4 Segoe UI,Arial,sans-serif;white-space:pre-wrap';(document.body||document.documentElement).appendChild(b);}b.textContent='Factory Dashboard & Flow Hub could not start.\\n'+m+'\\nTry Microsoft Edge or Chrome (not Internet Explorer), or re-download index.html.';var l=document.getElementById('boot-loading');if(l){l.textContent='Failed to load: '+m;}}catch(e){}}window.addEventListener('error',function(e){show((e.message||'Unknown error')+(e.filename?' ('+e.filename.split('/').pop()+':'+e.lineno+')':''));});window.addEventListener('unhandledrejection',function(e){show('Unhandled error: '+((e.reason&&e.reason.message)||e.reason));});})();`;

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
      html = html.replace('</head>', () => `<script id="boot-guard">${BOOT_GUARD}</script>\n<style>${css.replace(/<\/style/gi, '<\\/style')}</style>\n</head>`);
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
