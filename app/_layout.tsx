import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ReactNode, useEffect } from 'react';
import { ActivityIndicator, Platform, View } from 'react-native';
import 'react-native-reanimated';

import { tokens } from '@/constants/tokens';
import { AuthProvider, useAuth } from '@/lib/auth';

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
	return (
		<AuthProvider>
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
						<Stack.Screen name="(auth)" options={{ headerShown: false }} />
						<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
						<Stack.Screen
							name="book/[id]"
							options={{
								title: 'Book Details',
								headerBackTitle: 'Back',
							}}
						/>
					</Stack>
				</AuthGate>
				<StatusBar style="light" />
			</ThemeProvider>
		</AuthProvider>
	);
}

function AuthGate({ children }: { children: ReactNode }) {
	const { session, loading } = useAuth();
	const segments = useSegments();
	const router = useRouter();

	useEffect(() => {
		if (loading) return;
		const inAuthGroup = segments[0] === '(auth)';
		if (!session && !inAuthGroup) {
			router.replace('/(auth)/login');
		} else if (session && inAuthGroup) {
			router.replace('/(tabs)');
		}
	}, [session, loading, segments, router]);

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
