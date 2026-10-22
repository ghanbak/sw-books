import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

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
		// Nested git worktrees (agent + manual) carry full repo copies; native/build output
		// and the admin package (own toolchain) are not part of this suite.
		exclude: [
			...configDefaults.exclude,
			'.claude/**',
			'.worktrees/**',
			'.codex/**',
			'.conductor/**',
			'.expo/**',
			'dist/**',
			'ios/**',
			'android/**',
			'admin/**',
		],
	},
});
