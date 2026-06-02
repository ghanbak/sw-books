import path from 'node:path';
import type { NextConfig } from 'next';

// When deployed behind a custom domain, set ADMIN_ALLOWED_ORIGIN to that host so
// Server Actions' built-in Origin/CSRF check trusts it. Local/default is
// same-origin and needs nothing.
const allowedOrigin = process.env.ADMIN_ALLOWED_ORIGIN;

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
	...(allowedOrigin ? { serverActions: { allowedOrigins: [allowedOrigin] } } : {}),
};

export default nextConfig;
