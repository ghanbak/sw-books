import { Redirect } from 'expo-router';

import { useAuth } from '@/lib/auth';

/**
 * Root entry (`/`). The tab screens live under their own folders now (so each tab can
 * have a native large-title Stack), which means `(tabs)` no longer has an `index`
 * route — without this, `/` is an unmatched route at launch. AuthGate has already
 * gated `loading`, so by the time this renders the session is known.
 */
export default function Index() {
	const { session } = useAuth();
	return <Redirect href={session ? '/archives' : '/(auth)/login'} />;
}
