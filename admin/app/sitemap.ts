import type { MetadataRoute } from 'next';

// Public, crawlable pages only — never the gated /admin tool or auth routes.
const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ossusarchives.com';

export default function sitemap(): MetadataRoute.Sitemap {
	return [
		{ url: `${BASE}/`, changeFrequency: 'monthly', priority: 1 },
		{ url: `${BASE}/privacy`, changeFrequency: 'yearly', priority: 0.5 },
	];
}
