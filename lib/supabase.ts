import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey, {
	auth: {
		storage: AsyncStorage,
		autoRefreshToken: true,
		persistSession: true,
		detectSessionInUrl: false,
	},
});

/**
 * Dev-only fallback used by the login screen until Google/Apple sign-in is wired.
 * Returns null on success, or an error message on failure.
 */
export async function signInAsDevUser(): Promise<string | null> {
	if (!__DEV__) return 'Dev sign-in is disabled in production builds.';

	const email = 'dev@swbooks.local';
	const password = 'devpassword123';

	const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
	if (!signInError) return null;

	const { error: signUpError } = await supabase.auth.signUp({ email, password });
	return signUpError ? signUpError.message : null;
}
