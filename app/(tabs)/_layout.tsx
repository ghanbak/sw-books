import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { tokens } from '@/constants/tokens';
import { useFontPref } from '@/lib/font-prefs';

// Native tab bar — UIKit on iOS, Material 3 on Android. Only the selected tint
// comes from tokens (`accent.primary`); the system renders everything else (the
// floating Liquid Glass capsule on iOS 26+, unselected items).
//
// Tabs: Archives · Timeline · Library · Search. Search uses `role="search"` for
// the separated circular affordance (like Apple News). Scan and Profile are no
// longer tabs — they open as a full-screen modal / bottom sheet from each tab's
// header action buttons.
//
// Icons: `sf` on iOS, `md` (a Material Symbol rendered by expo-symbols) on Android. Material 3
// hides unselected labels with four tabs, so without `md` the other tabs would be blank there.
// The bundled Material font has no fill axis, so one glyph covers both states.

export default function TabLayout() {
	const { fontFamily } = useFontPref();
	return (
		<NativeTabs tintColor={tokens.accent.primary} labelStyle={{ fontFamily }}>
			<NativeTabs.Trigger name="archives">
				<NativeTabs.Trigger.Icon
					sf={{ default: 'pyramid', selected: 'pyramid.fill' }}
					md="account_balance"
				/>
				<NativeTabs.Trigger.Label>Archives</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="timeline">
				<NativeTabs.Trigger.Icon
					sf={{
						default: 'lines.measurement.horizontal',
						selected: 'lines.measurement.horizontal',
					}}
					md="timeline"
				/>
				<NativeTabs.Trigger.Label>Timeline</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="library">
				<NativeTabs.Trigger.Icon
					sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }}
					md="library_books"
				/>
				<NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			{/* biome-ignore lint/a11y/useSemanticElements: NativeTabsTabBarItemRole, not ARIA */}
			<NativeTabs.Trigger name="search" role="search">
				<NativeTabs.Trigger.Icon sf="magnifyingglass" md="search" />
				<NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
