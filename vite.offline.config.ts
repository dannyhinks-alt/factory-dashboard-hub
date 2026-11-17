import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
// Everything (JS, CSS, SheetJS, docx) is inlined into ONE html file: no CDNs, no network.
export default defineConfig({
  plugins: [react(), viteSingleFile({ removeViteModuleLoader: true })],
  build: { outDir: 'dist-offline', emptyOutDir: true, assetsInlineLimit: 100000000, cssCodeSplit: false, chunkSizeWarningLimit: 6000 },
});
