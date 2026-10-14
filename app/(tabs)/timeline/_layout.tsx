import { Stack } from 'expo-router';

import { useFontPref } from '@/lib/font-prefs';

export default function TimelineLayout() {
	const { fontFamily } = useFontPref();
	return (
		<Stack
			screenOptions={{
				headerLargeTitle: true,
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
