import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { useFontPref } from '@/lib/font-prefs';

// Native tab bar — UIKit on iOS, Material 3 on Android. No custom styling: the
// system renders its default (the floating Liquid Glass capsule on iOS 26+).
//
// Tabs: Archives · Timeline · Library · Search. Search uses `role="search"` for
// the separated circular affordance (like Apple News). Scan and Profile are no
// longer tabs — they open as a full-screen modal / bottom sheet from each tab's
// header action buttons.
//
// Icons are SF Symbols on iOS only. Android currently shows tab labels without
// icons — add `drawable`/`md` icons or a VectorIcon family when we ship Android.

export default function TabLayout() {
	const { fontFamily } = useFontPref();
	return (
		<NativeTabs labelStyle={{ fontFamily }}>
			<NativeTabs.Trigger name="archives">
				<NativeTabs.Trigger.Icon sf={{ default: 'pyramid', selected: 'pyramid.fill' }} />
				<NativeTabs.Trigger.Label>Archives</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="timeline">
				<NativeTabs.Trigger.Icon
					sf={{
						default: 'lines.measurement.horizontal',
						selected: 'lines.measurement.horizontal',
					}}
				/>
				<NativeTabs.Trigger.Label>Timeline</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			<NativeTabs.Trigger name="library">
				<NativeTabs.Trigger.Icon
					sf={{ default: 'rectangle.stack', selected: 'rectangle.stack.fill' }}
				/>
				<NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>

			{/* biome-ignore lint/a11y/useSemanticElements: NativeTabsTabBarItemRole, not ARIA */}
			<NativeTabs.Trigger name="search" role="search">
				<NativeTabs.Trigger.Icon sf="magnifyingglass" />
				<NativeTabs.Trigger.Label>Search</NativeTabs.Trigger.Label>
			</NativeTabs.Trigger>
		</NativeTabs>
	);
}
