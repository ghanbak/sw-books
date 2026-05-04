import AsyncStorage from '@react-native-async-storage/async-storage';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import type { Session, User } from '@supabase/supabase-js';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

import { supabase } from './supabase';

GoogleSignin.configure({
	webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID,
	iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID,
});

// Apple only returns fullName on the very first sign-in for a given Apple ID + app.
// We persist it locally before the Supabase round-trip so a crash or network failure
// between Supabase auth and the metadata write doesn't lose the name forever.
const PENDING_APPLE_NAME_KEY = 'pendingAppleName';

type AuthContextValue = {
	session: Session | null;
	user: User | null;
	loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
	session: null,
	user: null,
	loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		supabase.auth.getSession().then(({ data }) => {
			setSession(data.session);
			setLoading(false);
			if (data.session) flushPendingAppleName().catch(() => {});
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, newSession) => {
			setSession(newSession);
		});

		return () => subscription.unsubscribe();
	}, []);

	return (
		<AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	return useContext(AuthContext);
}

export async function signInWithGoogle() {
	await GoogleSignin.hasPlayServices();
	const response = await GoogleSignin.signIn();

	if (response.type !== 'success') return;

	const idToken = response.data.idToken;
	if (!idToken) throw new Error('Google did not return an ID token.');

	const { error } = await supabase.auth.signInWithIdToken({
		provider: 'google',
		token: idToken,
	});
	if (error) throw error;
}

export async function signInWithApple() {
	const rawNonce = Crypto.randomUUID();
	const hashedNonce = await Crypto.digestStringAsync(
		Crypto.CryptoDigestAlgorithm.SHA256,
		rawNonce,
	);

	const credential = await AppleAuthentication.signInAsync({
		requestedScopes: [
			AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
			AppleAuthentication.AppleAuthenticationScope.EMAIL,
		],
		nonce: hashedNonce,
	});

	if (!credential.identityToken) {
		throw new Error('Apple did not return an identity token.');
	}

	const fullName = [credential.fullName?.givenName, credential.fullName?.familyName]
		.filter(Boolean)
		.join(' ');

	// Persist before the Supabase call — Apple won't return this again.
	if (fullName) {
		await AsyncStorage.setItem(PENDING_APPLE_NAME_KEY, fullName);
	}

	const { error } = await supabase.auth.signInWithIdToken({
		provider: 'apple',
		token: credential.identityToken,
		nonce: rawNonce,
	});
	if (error) throw error;

	await flushPendingAppleName();
}

async function flushPendingAppleName() {
	const pending = await AsyncStorage.getItem(PENDING_APPLE_NAME_KEY);
	if (!pending) return;

	const {
		data: { user },
	} = await supabase.auth.getUser();
	if (!user) return;

	if (user.user_metadata?.full_name) {
		await AsyncStorage.removeItem(PENDING_APPLE_NAME_KEY);
		return;
	}

	const { error } = await supabase.auth.updateUser({ data: { full_name: pending } });
	if (!error) {
		await AsyncStorage.removeItem(PENDING_APPLE_NAME_KEY);
	}
}
