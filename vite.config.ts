import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  // Относительные пути, чтобы сборка работала из любой папки (GitHub Pages и т. п.).
  base: './',
  plugins: [preact()],
  // Справочник городов (~1 МБ в gzip) загружается отдельным файлом при первом поиске.
  build: { chunkSizeWarningLimit: 2600 },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
