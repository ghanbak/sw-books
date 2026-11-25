import { Icon } from '@expo/ui';
import type { AndroidSymbol, SFSymbol } from 'expo-symbols';

export type SFIconProps = {
	/** SF Symbol (source of truth; rendered as-is on iOS). */
	name: SFSymbol;
	/** Material Symbol counterpart, rendered on Android (sf-icon.android.tsx). */
	android: AndroidSymbol;
	color: string;
};

/** Universal `@expo/ui` Icon for an SF Symbol. iOS: the SF name, unchanged. */
export function SFIcon({ name, color }: SFIconProps) {
	return <Icon name={name} color={color} />;
}
