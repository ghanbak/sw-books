import { Icon } from '@expo/ui';

import type { SFIconProps } from '@/components/sf-icon';
import { useMaterialSymbolSource } from '@/hooks/useMaterialSymbolSource';

// @expo/ui's Android Icon renders null for an SF Symbol string, so draw the mapped Material
// Symbol instead. Nothing renders until the glyph image is ready (one async font render).
export function SFIcon({ android, color }: SFIconProps) {
	const source = useMaterialSymbolSource(android, 24, color);
	return source ? <Icon name={source} size={24} color={color} /> : null;
}
