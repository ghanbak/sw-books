import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// `import type` aliases (e.g. `@/lib/hooks`) are erased at transform time, but the
// resolver still needs the `@` alias to match tsconfig's paths during test runs.
export default defineConfig({
	resolve: {
		alias: {
			'@': resolve(__dirname, '.'),
		},
	},
	test: {
		environment: 'node',
		include: ['**/*.test.ts'],
	},
});
