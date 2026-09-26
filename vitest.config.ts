import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  // Resolves the path aliases declared in tsconfig.json, including the ones
  // added by `nest g library`.
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // Unit specs sit beside the code they cover; the e2e suite is configured separately
    // because it needs a live MySQL and Redis.
    include: ['src/**/*.spec.ts'],
  },
});
