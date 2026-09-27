import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    root: './',
    // Suites that need a reachable Redis. The outage suite is configured separately because it
    // needs the opposite: an environment where Redis cannot be reached at all.
    include: ['test/*.e2e-spec.ts'],
    // The suites share one database and each of them empties it, so they must not overlap.
    fileParallelism: false,
    // Booting the datasource, applying migrations and a 30-way race need more than the default.
    testTimeout: 30000,
    hookTimeout: 60000,
  },
});
