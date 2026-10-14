import { Stack } from 'expo-router';

import { useFontPref } from '@/lib/font-prefs';

export default function TimelineLayout() {
	const { fontFamily } = useFontPref();
	return (
		<Stack
			screenOptions={{
				headerLargeTitle: true,
				// Large title inline with the bar buttons (scan / profile) instead of on its own row
				// below them. UIKit's .inline large-title mode (iOS 17+) — not exposed by Expo Router
				// or react-native-screens yet, so it comes from our patches (see patches/ and
				// docs/plans/2026-10-14-feat-inline-large-title-upstream-plan.md).
				headerLargeTitleInline: true,
				headerShadowVisible: false,
				// Transparent so the cover's hologram glow can show behind the title instead of
				// being cut off by an opaque bar. The screen already pads its content by
				// useHeaderHeight(), so nothing slides under the title.
				headerTransparent: true,
				headerTitleStyle: { fontFamily },
				// Large-but-compact: shrink the native large title from its ~34pt default so it
				// occupies less vertical space (this screen is a horizontal pager, so the title
				// never collapses on scroll and would otherwise permanently eat room). UIKit fixes
				// the row's insets, so this reclaims a bounded amount — verify on-device.
				headerLargeTitleStyle: { fontFamily, fontSize: 28, fontWeight: '700' },
			}}
		>
			<Stack.Screen
				name="index"
				options={{
					title: 'Timeline',
				}}
			/>
		</Stack>
	);
}
