import { defineConfig } from 'vite';
export default defineConfig({
  base:'./',
  build:{outDir:'dist',emptyOutDir:true,target:'es2022'},
  // No backend, proxy, server endpoint, or external API required by the deployed app.
});
