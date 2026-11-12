import { defineConfig } from 'vitest/config';
import { precachePlugin } from './scripts/precache-plugin';

export default defineConfig({
  base: './',
  plugins: [precachePlugin()],
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 2000,
  },
  server: { host: true },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
