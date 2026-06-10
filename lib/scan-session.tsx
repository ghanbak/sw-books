import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';
import { useAuth } from './auth';
import { shouldClearScanDraft } from './shelf';
import type { SpineMatch } from './spine-match';

/**
 * Holds the shelf-scanner match-session draft ABOVE the tab navigator. Native tabs can
 * unmount a blurred tab's screen, so screen-level state would lose the draft on a
 * tab-switch; this provider is what makes "draft survives tab-switch + background"
 * true (app-kill clears it by design — in-memory only, no persistence).
 *
 * Deliberately thin: one value, one setter. The capture-flow reducer (Phase 3) and the
 * review UI (Phase 4) build on top; nothing else belongs here.
 */

export type ScanDraft = {
	/** User the draft was computed against (null = created signed-out). */
	ownerUserId: string | null;
	/** Recognized works, ranked + bucketed by the matcher. */
	matches: SpineMatch[];
	/** Book ids currently selected for Add. */
	selected: string[];
};

type ScanSessionValue = {
	draft: ScanDraft | null;
	setDraft: (draft: ScanDraft | null) => void;
};

const ScanSessionContext = createContext<ScanSessionValue>({
	draft: null,
	setDraft: () => {},
});

export function ScanSessionProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const [draft, setDraft] = useState<ScanDraft | null>(null);

	// Account-switch safety: a draft computed against user A's shelf must not survive
	// into user B's session (B would add A's books). Preserved across signed-out →
	// first sign-in (the deliberate scan-now-sign-in-at-Add flow).
	const currentUserId = user?.id ?? null;
	useEffect(() => {
		setDraft((prev) =>
			prev && shouldClearScanDraft(prev.ownerUserId, currentUserId) ? null : prev,
		);
	}, [currentUserId]);

	return (
		<ScanSessionContext.Provider value={{ draft, setDraft }}>
			{children}
		</ScanSessionContext.Provider>
	);
}

/** Read/write the scan-session draft. Shared across the scan tab and review overlay. */
export function useScanSession() {
	return useContext(ScanSessionContext);
}
