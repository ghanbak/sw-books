import path from 'node:path';
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
	// The admin app shares the repo with the Expo app (and imports ../lib), so
	// pin the file-tracing root to the repo root instead of letting Next guess
	// from the nearest lockfile.
	outputFileTracingRoot: path.join(__dirname, '..'),
	// Allow importing the shared modules in ../lib (outside the admin app root)
	// via the @app/* path aliases in tsconfig.json.
	experimental: {
		externalDir: true,
	},
};

export default nextConfig;
