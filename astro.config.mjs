// @ts-check
import { defineConfig } from 'astro/config';

// BASE lets the same build run at a sub-path (e.g. GitHub Pages: BASE=/nocde).
export default defineConfig({
  base: process.env.BASE || '/',
  trailingSlash: 'ignore',
  build: { format: 'directory', inlineStylesheets: 'auto', assets: 'assets' },
  devToolbar: { enabled: false },
});
