import { Icon, ListItem } from '@expo/ui';
import {
	AnimatedVisibility,
	CircularProgressIndicator,
	Column,
	EnterTransition,
	ExitTransition,
} from '@expo/ui/jetpack-compose';
import {
	alpha,
	animated,
	graphicsLayer,
	padding,
	size,
	spring,
} from '@expo/ui/jetpack-compose/modifiers';
import type { ReactNode } from 'react';

import { tokens } from '@/constants/tokens';
import { useMaterialSymbolSource } from '@/hooks/useMaterialSymbolSource';

// Android counterparts of the SwiftUI views Profile uses on iOS (see profile-disclosure.tsx).
// Same names and props, so app/profile.tsx renders one tree on both platforms.

// Vertical-only motion, matching @expo/ui's universal Collapsible. Compose scales it with the
// system animator duration, so "Remove animations" makes it instant.
const ENTER = EnterTransition.expandVertically().plus(EnterTransition.fadeIn());
const EXIT = ExitTransition.shrinkVertically().plus(ExitTransition.fadeOut());

type DisclosureGroupProps = {
	label: string;
	isExpanded: boolean;
	onIsExpandedChange: (isExpanded: boolean) => void;
	children: ReactNode;
};

/**
 * Tappable header row + collapsible body. The Compose `clickable` merges the row's semantics, so
 * TalkBack reads the label plus the chevron's "Expanded"/"Collapsed" description. (The installed
 * @expo/ui exposes no Compose role/stateDescription modifier.)
 */
export function DisclosureGroup({
	label,
	isExpanded,
	onIsExpandedChange,
	children,
}: DisclosureGroupProps) {
	// The Icon's `color` tints the glyph; the hook's color only seeds the bitmap.
	const chevron = useMaterialSymbolSource('expand_more', 24);

	return (
		<Column>
			<ListItem
				onPress={() => onIsExpandedChange(!isExpanded)}
				trailing={
					chevron ? (
						<Icon
							name={chevron}
							size={24}
							color={tokens.text.tertiary}
							accessibilityLabel={isExpanded ? 'Expanded' : 'Collapsed'}
							modifiers={[graphicsLayer({ rotationZ: animated(isExpanded ? 180 : 0, spring()) })]}
						/>
					) : null
				}
			>
				{label}
			</ListItem>
			<AnimatedVisibility visible={isExpanded} enterTransition={ENTER} exitTransition={EXIT}>
				<Column modifiers={[padding(16, 0, 16, 12)]}>{children}</Column>
			</AnimatedVisibility>
		</Column>
	);
}

/** Indeterminate spinner sized for a list row's trailing slot. */
export function ProgressView() {
	return (
		<CircularProgressIndicator
			color={tokens.text.tertiary}
			strokeWidth={2.5}
			modifiers={[size(24, 24)]}
		/>
	);
}

/** M3 disabled look (38% alpha). Re-taps are already blocked by Profile's in-flight ref. */
export function disabled(isDisabled: boolean) {
	return alpha(isDisabled ? 0.38 : 1);
}
