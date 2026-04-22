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
 * Signs in a dev test user, creating the account if it doesn't exist.
 * Only runs in development mode (__DEV__).
 * Call this once on app startup.
 */
export async function ensureDevUser() {
	if (!__DEV__) return;

	const { data: { session } } = await supabase.auth.getSession();
	if (session) return; // already signed in

	const email = 'dev@swbooks.local';
	const password = 'devpassword123';

	// Try sign in first
	const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
	if (!signInError) return;

	// If sign-in failed, create the account
	const { error: signUpError } = await supabase.auth.signUp({ email, password });
	if (signUpError) {
		console.warn('[Dev Auth] Failed to create dev user:', signUpError.message);
	}
}
