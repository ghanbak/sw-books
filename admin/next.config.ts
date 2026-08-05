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
		// `serverActions.allowedOrigins` lives under `experimental` in Next 15;
		// at the top level it's rejected as an unrecognized key.
		...(allowedOrigin ? { serverActions: { allowedOrigins: [allowedOrigin] } } : {}),
	},
	// The shared ../lib files import third-party packages (isbn3, csv-parse,
	// csv-stringify). Webpack resolves those bare imports from the importing
	// file's location, walking up from ../lib — which never reaches this app's
	// node_modules. On Vercel only admin/node_modules is installed, so add it to
	// the module search path explicitly.
	webpack: (config) => {
		config.resolve.modules = [
			path.join(__dirname, 'node_modules'),
			...(config.resolve.modules ?? ['node_modules']),
		];
		return config;
	},
	// Unhashed public/ assets default to `max-age=0`, costing a conditional-GET per
	// load — including on the hero poster, which is the LCP resource. These are
	// immutable, so a re-encode MUST ship under a new filename (…-1080.v2.mp4).
	async headers() {
		return [
			{
				source: '/hero/:path*',
				headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
			},
		];
	},
};

export default nextConfig;
