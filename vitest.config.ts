import { resolve } from 'node:path';
import { configDefaults, defineConfig } from 'vitest/config';

const ADMIN = resolve(__dirname, 'admin');

// `import type` aliases (e.g. `@/lib/hooks`) are erased at transform time, but the
// resolver still needs the `@` alias to match tsconfig's paths during test runs.
// Modules under admin/ (loaded by tests that drive a server action) follow
// admin/tsconfig.json instead: `@/*` → admin/*, `@app/*` → lib/*.
export default defineConfig({
	plugins: [
		{
			name: 'tsconfig-paths',
			enforce: 'pre',
			resolveId(source, importer) {
				const inAdmin = !!importer?.startsWith(`${ADMIN}/`);
				let mapped: string | null = null;
				if (source.startsWith('@/')) {
					mapped = resolve(inAdmin ? ADMIN : __dirname, source.slice(2));
				} else if (inAdmin && source.startsWith('@app/')) {
					mapped = resolve(__dirname, 'lib', source.slice(5));
				}
				return mapped ? this.resolve(mapped, importer, { skipSelf: true }) : null;
			},
		},
	],
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
