import { updateSession } from '@/lib/supabase-middleware';
import type { NextRequest } from 'next/server';

export async function middleware(request: NextRequest) {
	return updateSession(request);
}

export const config = {
	// Run on everything except Next internals and static assets. /login and /auth
	// are matched but exempted from the redirect inside updateSession.
	matcher: [
		'/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
	],
};
