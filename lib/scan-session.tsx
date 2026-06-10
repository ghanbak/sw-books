import {
	type ReactNode,
	createContext,
	useCallback,
	useContext,
	useEffect,
	useMemo,
	useRef,
	useState,
} from 'react';
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
	/**
	 * Truth at CALL time, not at last render. `setDraft` writes a ref synchronously,
	 * so a handler that runs in the same batch as a draft mutation (e.g. a toggle and
	 * an Add landing together) reads the post-mutation draft — a render-synced
	 * closure would resurrect the pre-toggle selection.
	 */
	getDraft: () => ScanDraft | null;
};

const ScanSessionContext = createContext<ScanSessionValue>({
	draft: null,
	setDraft: () => {},
	getDraft: () => null,
});

export function ScanSessionProvider({ children }: { children: ReactNode }) {
	const { user } = useAuth();
	const [draft, setDraftState] = useState<ScanDraft | null>(null);
	const draftRef = useRef<ScanDraft | null>(null);

	const setDraft = useCallback((next: ScanDraft | null) => {
		draftRef.current = next;
		setDraftState(next);
	}, []);
	const getDraft = useCallback(() => draftRef.current, []);

	// Account-switch safety: a draft computed against user A's shelf must not survive
	// into user B's session (B would add A's books). Preserved across signed-out →
	// first sign-in (the deliberate scan-now-sign-in-at-Add flow).
	const currentUserId = user?.id ?? null;
	useEffect(() => {
		const current = draftRef.current;
		if (current && shouldClearScanDraft(current.ownerUserId, currentUserId)) {
			draftRef.current = null;
			setDraftState(null);
		}
	}, [currentUserId]);

	// Memoized so auth re-renders above don't ripple a fresh context value into
	// every consumer (setDraft/getDraft are referentially stable).
	const value = useMemo(() => ({ draft, setDraft, getDraft }), [draft, setDraft, getDraft]);

	return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>;
}

/** Read/write the scan-session draft. Shared across the scan tab and review overlay. */
export function useScanSession() {
	return useContext(ScanSessionContext);
}
