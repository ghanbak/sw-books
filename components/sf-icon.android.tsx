import { Icon } from '@expo/ui';

import type { SFIconProps } from '@/components/sf-icon';
import { useMaterialSymbolSource } from '@/hooks/useMaterialSymbolSource';

// The Icon tint (SrcIn) keeps only the bitmap's alpha, so seed it opaque: a translucent seed
// would multiply with a translucent `color` (#435). The tint alone carries the token.
const OPAQUE_SEED = '#FFFFFF';

// @expo/ui's Android Icon renders null for an SF Symbol string, so draw the mapped Material
// Symbol instead. Nothing renders until the glyph image is ready (one async font render).
export function SFIcon({ android, color }: SFIconProps) {
	const source = useMaterialSymbolSource(android, 24, OPAQUE_SEED);
	return source ? <Icon name={source} size={24} color={color} /> : null;
}
