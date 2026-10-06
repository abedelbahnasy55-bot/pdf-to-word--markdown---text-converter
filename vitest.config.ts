import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The modules under characterization are pure string transforms.
    // DOM / canvas / JSZip / FileReader-dependent modules are explicitly out of scope.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['node_modules/**', 'dist/**', 'tests/fixtures/**', 'tests/helpers/**'],
  },
});