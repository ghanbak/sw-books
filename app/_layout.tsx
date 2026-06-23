import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import 'react-native-reanimated';

import { tokens } from '@/constants/tokens';
import { AuthProvider, useAuth } from '@/lib/auth';
import { applyGlobalFont, loadAurebeshPref } from '@/lib/font-prefs';
import { BooksProvider, UserBooksProvider } from '@/lib/hooks';
import { ScanSessionProvider } from '@/lib/scan-session';

SplashScreen.preventAutoHideAsync();

const appDarkTheme = {
	...DarkTheme,
	colors: {
		...DarkTheme.colors,
		background: tokens.surface.background,
		card: tokens.surface.background,
		text: tokens.text.primary,
		border: tokens.border.subtle,
		primary: tokens.accent.primary,
	},
};

export const unstable_settings = {
	anchor: '(tabs)',
};

export default function RootLayout() {
	useEffect(() => {
		// Apply the persisted Aurebesh font preference before the first paint.
		loadAurebeshPref().then(applyGlobalFont);
		SplashScreen.hideAsync();
	}, []);

	return (
		<AuthProvider>
			<BooksProvider>
				<UserBooksProvider>
					<ScanSessionProvider>
						<ThemeProvider value={appDarkTheme}>
							<AuthGate>
								<Stack
									screenOptions={{
										headerShadowVisible: false,
										...(Platform.OS === 'ios'
											? {
													headerTransparent: true,
													headerBlurEffect: 'systemMaterial',
													headerLargeStyle: { backgroundColor: tokens.surface.background },
												}
											: {
													headerStyle: { backgroundColor: tokens.surface.background },
												}),
										headerTintColor: tokens.text.primary,
									}}
								>
									<Stack.Screen name="index" options={{ headerShown: false }} />
									<Stack.Screen name="(auth)" options={{ headerShown: false }} />
									<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
									<Stack.Screen
										name="book/[id]"
										options={{
											title: 'Book Details',
											headerBackTitle: 'Back',
										}}
									/>
									{/* Scan opens over the active tab. Interim `modal` (swipe-to-dismiss) keeps
									    it from being a dead-end; the scan redesign step switches this to
									    `fullScreenModal` + an in-screen close button. */}
									<Stack.Screen
										name="scan"
										options={{ presentation: 'modal', headerShown: false }}
									/>
									{/* Account/Profile bottom sheet. */}
									<Stack.Screen
										name="profile"
										options={{
											presentation: 'formSheet',
											headerShown: false,
											sheetAllowedDetents: [0.6, 1.0],
											sheetGrabberVisible: true,
											sheetCornerRadius: 24,
										}}
									/>
									<Stack.Screen name="about" options={{ title: 'About' }} />
								</Stack>
							</AuthGate>
							<StatusBar style="light" />
						</ThemeProvider>
					</ScanSessionProvider>
				</UserBooksProvider>
			</BooksProvider>
		</AuthProvider>
	);
}

function AuthGate({ children }: { children: ReactNode }) {
	const { session, loading } = useAuth();
	const segments = useSegments();
	const router = useRouter();
	// Only the top-level group matters for the auth redirect — taking the whole
	// segments array as a dep would re-run on every nested route change since
	// useSegments returns a new array each render.
	const topSegment = segments[0];

	useEffect(() => {
		if (loading) return;
		const inAuthGroup = topSegment === '(auth)';
		// topSegment is undefined when the URL is the root `/` (cold launch
		// from a deep link with no path). Treat that as needing a redirect for
		// signed-in users so they don't see the "Unmatched Route" page.
		const atRoot = topSegment === undefined;
		if (!session && !inAuthGroup) {
			router.replace('/(auth)/login');
		} else if (session && (inAuthGroup || atRoot)) {
			router.replace('/archives');
		}
	}, [session, loading, topSegment, router]);

	if (loading) {
		return (
			<View
				style={{
					flex: 1,
					alignItems: 'center',
					justifyContent: 'center',
					backgroundColor: tokens.surface.background,
				}}
			>
				<ActivityIndicator color={tokens.accent.primary} />
			</View>
		);
	}

	return <>{children}</>;
}
