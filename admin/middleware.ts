import { updateSession } from '@/lib/supabase-middleware';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
	return updateSession(request);
}

export const config = {
	// Gate only the admin tool. The marketing stub (/), /privacy, /login and
	// /auth stay public (and crawlable for App Store review).
	matcher: ['/admin', '/admin/:path*'],
};
