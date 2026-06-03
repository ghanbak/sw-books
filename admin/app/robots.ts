import type { MetadataRoute } from 'next';

const BASE = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://ossusarchives.com';

export default function robots(): MetadataRoute.Robots {
	return {
		rules: {
			userAgent: '*',
			allow: '/',
			// The admin tool is gated; auth routes aren't worth indexing.
			disallow: ['/admin', '/login', '/auth'],
		},
		sitemap: `${BASE}/sitemap.xml`,
	};
}
