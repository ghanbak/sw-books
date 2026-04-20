import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import 'react-native-reanimated';

import { tokens } from '@/constants/tokens';
import { ensureDevUser } from '@/lib/supabase';

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
		ensureDevUser();
	}, []);

	return (
		<ThemeProvider value={appDarkTheme}>
			<Stack>
				<Stack.Screen name="(tabs)" options={{ headerShown: false }} />
				<Stack.Screen
					name="book/[id]"
					options={{
						title: 'Book Details',
						headerBackTitle: 'Back',
						headerStyle: { backgroundColor: tokens.surface.background },
						headerTintColor: tokens.text.primary,
						headerShadowVisible: false,
					}}
				/>
			</Stack>
			<StatusBar style="light" />
		</ThemeProvider>
	);
}
