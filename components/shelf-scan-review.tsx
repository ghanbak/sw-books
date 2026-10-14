import { useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
	ActivityIndicator,
	FlatList,
	KeyboardAvoidingView,
	Platform,
	Pressable,
	StyleSheet,
	TextInput,
	View,
} from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HoloCover } from '@/components/holo-cover';
import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';
import { announce } from '@/hooks/useAccessibility';
import { type Book, useBooks, useUserBooks } from '@/lib/hooks';
import { useScanSession } from '@/lib/scan-session';
import { swapMatch, toggleSelection } from '@/lib/shelf';
import type { ShelfScanPhase } from '@/lib/shelf-scan';
import type { SpineMatch } from '@/lib/spine-match';

/**
 * The inline review queue (plan Phase 4): renders as a full-screen overlay on the
 * scan screen — no navigation boundary, so the draft never crosses one. List rows
 * by default with a grid toggle; high-confidence matches arrive pre-selected,
 * `low` ones grouped under "Double-check these"; already-owned books are badged
 * and excluded; list rows can swap to a ranked alternate or any catalog book
 * (the grid is for visual confirmation — swap lives in the list view).
 *
 * All draft mutations go through the pure helpers (`toggleSelection`/`swapMatch`)
 * and back into `ScanSessionProvider` — this component owns only view state
 * (list/grid, the open swap sheet, the search query).
 */
export function ShelfScanReview({
	phase,
	addError,
	addedCount,
	onAdd,
	onReset,
}: {
	phase: Extract<ShelfScanPhase, 'review' | 'adding' | 'done'>;
	addError: string | null;
	addedCount: number;
	onAdd: () => void;
	onReset: () => void;
}) {
	const router = useRouter();
	const insets = useSafeAreaInsets();
	const { books } = useBooks();
	const { userBooks } = useUserBooks();
	const { draft, setDraft } = useScanSession();

	const [view, setView] = useState<'list' | 'grid'>('list');
	const [swapTargetId, setSwapTargetId] = useState<string | null>(null);

	const liveOwnedIds = useMemo(() => {
		const owned = new Set<string>();
		for (const [bookId, row] of userBooks) {
			if (row.owned) owned.add(bookId);
		}
		return owned;
	}, [userBooks]);
	// Freeze ownership while the add is in flight: addOwned flips the Map
	// optimistically BEFORE the RPC settles, and a live set would make every
	// selected row flash "Already owned" under the spinner (then retract on error).
	const frozenOwnedRef = useRef(liveOwnedIds);
	if (phase !== 'adding') frozenOwnedRef.current = liveOwnedIds;
	const ownedIds = frozenOwnedRef.current;

	const selectedSet = useMemo(() => new Set(draft?.selected ?? []), [draft?.selected]);
	// Books that became owned AFTER the draft was created (another screen, another
	// device) fall out of the count, the button, and (in the hook) the RPC payload.
	const effectiveSelected = useMemo(
		() => (draft ? draft.selected.filter((id) => !ownedIds.has(id)) : []),
		[draft, ownedIds],
	);

	// Bucket split + the FlatList's ordered data, memoized on `matches` only. A toggle
	// produces a new draft but keeps the same `matches` array reference, so `ordered`
	// stays referentially stable and the list doesn't re-virtualize on every checkbox.
	const { high, low, ordered } = useMemo(() => {
		const m = draft?.matches ?? [];
		const high = m.filter((x) => x.bucket === 'high');
		const low = m.filter((x) => x.bucket === 'low');
		return { high, low, ordered: [...high, ...low] };
	}, [draft?.matches]);
	const selectableCount = useMemo(
		() => (draft?.matches ?? []).filter((m) => !ownedIds.has(m.book.id)).length,
		[draft?.matches, ownedIds],
	);
	const swapTarget = useMemo(
		() => (swapTargetId ? draft?.matches.find((m) => m.book.id === swapTargetId) : undefined),
		[swapTargetId, draft?.matches],
	);

	const toggle = useCallback(
		(bookId: string) => {
			if (!draft || ownedIds.has(bookId)) return;
			setDraft({ ...draft, selected: toggleSelection(draft.selected, bookId) });
		},
		[draft, ownedIds, setDraft],
	);

	const swap = useCallback(
		(replacement: Book) => {
			if (!draft || !swapTargetId) return;
			const next = swapMatch(draft.matches, draft.selected, swapTargetId, replacement, ownedIds);
			setDraft({ ...draft, ...next });
			setSwapTargetId(null);
		},
		[draft, swapTargetId, ownedIds, setDraft],
	);

	const goToShelf = useCallback(() => {
		onReset();
		router.push('/library');
	}, [onReset, router]);

	// Screen-reader narration. The review arrives via a silent overlay swap (no nav),
	// so a VoiceOver user gets no transition cue — announce the recognized count once,
	// the add outcome, and any error. (Sighted users read these off the UI.)
	const reviewAnnouncedRef = useRef(false);
	useEffect(() => {
		if (phase === 'review' && draft && !reviewAnnouncedRef.current) {
			reviewAnnouncedRef.current = true;
			const n = draft.matches.length;
			announce(
				`${n} ${n === 1 ? 'book' : 'books'} recognized, ${effectiveSelected.length} pre-selected. Review and add to your shelf.`,
			);
		}
	}, [phase, draft, effectiveSelected.length]);
	// `done` isn't announced here — its summary count is the screen's `header`-role
	// title, so a manual announce would just double-speak it.
	useEffect(() => {
		if (addError) announce(addError);
	}, [addError]);

	if (phase === 'done') {
		return (
			<Animated.View style={styles.overlay} entering={FadeIn.duration(200)}>
				<View style={styles.doneBody}>
					<View style={styles.doneCheck}>
						<SymbolView name="checkmark" size={36} tintColor={tokens.text.primary} weight="bold" />
					</View>
					<Text style={styles.doneTitle} accessibilityRole="header">
						{addedCount === 1 ? '1 book added to Owned' : `${addedCount} books added to Owned`}
					</Text>
					<Text style={styles.doneText}>Your archive grows.</Text>
					<Pressable style={styles.primaryButton} onPress={goToShelf} accessibilityRole="button">
						<Text style={styles.primaryButtonText}>View Shelf</Text>
					</Pressable>
					<Pressable style={styles.secondaryButton} onPress={onReset} accessibilityRole="button">
						<Text style={styles.secondaryButtonText}>Scan More</Text>
					</Pressable>
				</View>
			</Animated.View>
		);
	}

	if (!draft) return null;
	const { matches } = draft;
	const adding = phase === 'adding';

	return (
		<Animated.View
			style={styles.overlay}
			entering={FadeIn.duration(200)}
			exiting={FadeOut.duration(200)}
		>
			<View style={[styles.header, { paddingTop: insets.top + 16 }]}>
				<View style={styles.headerText}>
					<Text style={styles.title} accessibilityRole="header">
						Your shelf, recognized
					</Text>
					<Text style={styles.subtitle}>
						{effectiveSelected.length} of {selectableCount} selected — uncheck anything that's wrong
					</Text>
				</View>
				<View style={styles.viewToggle}>
					<Pressable
						style={[styles.viewToggleButton, view === 'list' && styles.viewToggleActive]}
						onPress={() => setView('list')}
						accessibilityRole="button"
						accessibilityLabel="List view"
						accessibilityState={{ selected: view === 'list' }}
					>
						<SymbolView
							name="list.bullet"
							size={16}
							tintColor={view === 'list' ? tokens.text.primary : tokens.text.secondary}
						/>
					</Pressable>
					<Pressable
						style={[styles.viewToggleButton, view === 'grid' && styles.viewToggleActive]}
						onPress={() => setView('grid')}
						accessibilityRole="button"
						accessibilityLabel="Grid view"
						accessibilityState={{ selected: view === 'grid' }}
					>
						<SymbolView
							name="square.grid.2x2"
							size={16}
							tintColor={view === 'grid' ? tokens.text.primary : tokens.text.secondary}
						/>
					</Pressable>
				</View>
			</View>

			<View style={[styles.body, adding && styles.bodyDisabled]}>
				{view === 'list' ? (
					<FlatList
						data={ordered}
						keyExtractor={(m) => m.book.id}
						renderItem={({ item, index }) => (
							<>
								{index === 0 && high.length > 0 && (
									<Text style={styles.sectionLabel} accessibilityRole="header">
										On your shelf
									</Text>
								)}
								{index === high.length && low.length > 0 && (
									<Text style={styles.sectionLabel} accessibilityRole="header">
										Double-check these
									</Text>
								)}
								<ReviewRow
									match={item}
									selected={selectedSet.has(item.book.id) && !ownedIds.has(item.book.id)}
									owned={ownedIds.has(item.book.id)}
									onToggle={toggle}
									onSwap={setSwapTargetId}
								/>
							</>
						)}
						contentContainerStyle={styles.listContent}
					/>
				) : (
					<FlatList
						data={ordered}
						key="grid" // numColumns change requires a remount
						numColumns={3}
						keyExtractor={(m) => m.book.id}
						renderItem={({ item }) => (
							<ReviewTile
								match={item}
								selected={selectedSet.has(item.book.id) && !ownedIds.has(item.book.id)}
								owned={ownedIds.has(item.book.id)}
								onToggle={toggle}
							/>
						)}
						contentContainerStyle={styles.listContent}
						columnWrapperStyle={styles.gridRow}
					/>
				)}
			</View>

			<View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
				{addError && <Text style={styles.errorText}>{addError}</Text>}
				<Pressable
					style={[
						styles.addButton,
						(adding || effectiveSelected.length === 0) && styles.addDisabled,
					]}
					onPress={onAdd}
					disabled={adding || effectiveSelected.length === 0}
					accessibilityRole="button"
					accessibilityLabel={`Add ${effectiveSelected.length} books to owned shelf`}
				>
					{adding ? (
						<ActivityIndicator color={tokens.text.primary} />
					) : (
						<Text style={styles.addButtonText}>
							{effectiveSelected.length === 0
								? 'Nothing selected'
								: `Add ${effectiveSelected.length} to Owned`}
						</Text>
					)}
				</Pressable>
				<Pressable
					style={styles.startOver}
					onPress={onReset}
					disabled={adding}
					accessibilityRole="button"
				>
					<Text style={styles.startOverText}>Discard & start over</Text>
				</Pressable>
			</View>

			{swapTarget && (
				<SwapSheet
					match={swapTarget}
					matches={matches}
					books={books}
					ownedIds={ownedIds}
					onPick={swap}
					onClose={() => setSwapTargetId(null)}
				/>
			)}
		</Animated.View>
	);
}

function ReviewRow({
	match,
	selected,
	owned,
	onToggle,
	onSwap,
}: {
	match: SpineMatch;
	selected: boolean;
	owned: boolean;
	onToggle: (bookId: string) => void;
	onSwap: (bookId: string) => void;
}) {
	const { book } = match;
	return (
		<View style={[styles.row, owned && styles.rowOwned]}>
			<Pressable
				style={styles.rowMain}
				onPress={() => onToggle(book.id)}
				disabled={owned}
				accessibilityRole="checkbox"
				accessibilityState={{ checked: selected, disabled: owned }}
				accessibilityLabel={`${book.title} by ${book.author.join(', ')}${owned ? ', already owned' : ''}`}
			>
				<View style={[styles.checkbox, selected && styles.checkboxOn]}>
					{selected && (
						<SymbolView name="checkmark" size={14} tintColor={tokens.text.primary} weight="bold" />
					)}
				</View>
				{/* Cover is decorative here, so taps reach the row
				    and VoiceOver doesn't announce a nameless extra button. */}
				<View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
					<HoloCover
						variant="thumb"
						coverUri={book.cover_image}
						title={book.title}
						author={book.author}
						width={44}
						height={66}
						accessibilityLabel=""
					/>
				</View>
				<View style={styles.rowInfo}>
					<Text style={styles.rowTitle} numberOfLines={2}>
						{book.title}
					</Text>
					<Text style={styles.rowAuthor} numberOfLines={1}>
						{book.author.join(', ')}
					</Text>
					{owned && (
						<View style={styles.ownedBadge}>
							<Text style={styles.ownedBadgeText}>Already owned</Text>
						</View>
					)}
				</View>
			</Pressable>
			<Pressable
				style={styles.swapButton}
				onPress={() => onSwap(book.id)}
				accessibilityRole="button"
				accessibilityLabel={`Wrong match? Swap ${book.title}`}
			>
				<SymbolView name="arrow.left.arrow.right" size={16} tintColor={tokens.text.secondary} />
			</Pressable>
		</View>
	);
}

function ReviewTile({
	match,
	selected,
	owned,
	onToggle,
}: {
	match: SpineMatch;
	selected: boolean;
	owned: boolean;
	onToggle: (bookId: string) => void;
}) {
	const { book } = match;
	return (
		<Pressable
			style={styles.tile}
			onPress={() => onToggle(book.id)}
			disabled={owned}
			accessibilityRole="checkbox"
			accessibilityState={{ checked: selected, disabled: owned }}
			accessibilityLabel={`${book.title}${owned ? ', already owned' : ''}`}
		>
			<View style={[styles.tileCover, selected && styles.tileSelected, owned && styles.tileOwned]}>
				<View
					pointerEvents="none"
					accessibilityElementsHidden
					importantForAccessibility="no-hide-descendants"
				>
					<HoloCover
						variant="thumb"
						coverUri={book.cover_image}
						title={book.title}
						author={book.author}
						width={84}
						height={126}
						accessibilityLabel=""
					/>
				</View>
				{selected && (
					<View style={styles.tileCheck}>
						<SymbolView name="checkmark" size={14} tintColor={tokens.text.primary} weight="bold" />
					</View>
				)}
				{match.bucket === 'low' && !owned && (
					<View style={styles.tileDoubt}>
						<Text style={styles.tileDoubtText}>?</Text>
					</View>
				)}
			</View>
			<Text style={styles.tileTitle} numberOfLines={2}>
				{book.title}
			</Text>
			{owned && <Text style={styles.tileOwnedText}>Owned</Text>}
		</Pressable>
	);
}

/** Ranked alternates first, catalog search underneath — both swap on tap. */
function SwapSheet({
	match,
	matches,
	books,
	ownedIds,
	onPick,
	onClose,
}: {
	match: SpineMatch;
	matches: SpineMatch[];
	books: Book[];
	ownedIds: ReadonlySet<string>;
	onPick: (book: Book) => void;
	onClose: () => void;
}) {
	const [query, setQuery] = useState('');
	const insets = useSafeAreaInsets();

	// Exclude EVERY current match's pick (not just this row's): swapping to a book
	// already in the queue would mean duplicate rows — swapMatch refuses it, so
	// offering it here would be a dead button.
	const takenIds = useMemo(() => new Set(matches.map((m) => m.book.id)), [matches]);

	const candidates = useMemo(() => {
		const q = query.trim().toLowerCase();
		if (q.length < 2) {
			return match.alternates.map((a) => a.book).filter((b) => !takenIds.has(b.id));
		}
		return books
			.filter(
				(b) =>
					!takenIds.has(b.id) &&
					(b.title.toLowerCase().includes(q) || b.author.some((a) => a.toLowerCase().includes(q))),
			)
			.slice(0, 12);
	}, [query, books, match.alternates, takenIds]);

	return (
		<Animated.View style={styles.sheetBackdrop} entering={FadeIn.duration(150)}>
			<Pressable
				style={StyleSheet.absoluteFill}
				onPress={onClose}
				accessibilityRole="button"
				accessibilityLabel="Close"
			/>
			<KeyboardAvoidingView
				behavior={Platform.OS === 'ios' ? 'padding' : undefined}
				style={styles.sheetAvoider}
			>
				<View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
					<Text style={styles.sheetTitle} numberOfLines={1} accessibilityRole="header">
						Not “{match.book.title}”?
					</Text>
					<View style={styles.searchBox}>
						<SymbolView name="magnifyingglass" size={16} tintColor={tokens.text.hint} />
						<TextInput
							style={styles.searchInput}
							value={query}
							onChangeText={setQuery}
							placeholder="Search the catalog…"
							placeholderTextColor={tokens.text.hint}
							autoCorrect={false}
							accessibilityLabel="Search the catalog for the right book"
						/>
					</View>
					{candidates.length === 0 && (
						<Text style={styles.sheetEmpty}>
							{query.trim().length >= 2
								? 'No catalog matches.'
								: 'No close alternates — try a search.'}
						</Text>
					)}
					<FlatList
						data={candidates}
						keyExtractor={(b) => b.id}
						keyboardShouldPersistTaps="handled"
						renderItem={({ item }) => (
							<Pressable
								style={styles.sheetRow}
								onPress={() => onPick(item)}
								accessibilityRole="button"
								accessibilityLabel={`Swap to ${item.title}`}
							>
								<View
									pointerEvents="none"
									accessibilityElementsHidden
									importantForAccessibility="no-hide-descendants"
								>
									<HoloCover
										variant="thumb"
										coverUri={item.cover_image}
										title={item.title}
										author={item.author}
										width={32}
										height={48}
										accessibilityLabel=""
									/>
								</View>
								<View style={styles.rowInfo}>
									<Text style={styles.rowTitle} numberOfLines={1}>
										{item.title}
									</Text>
									<Text style={styles.rowAuthor} numberOfLines={1}>
										{item.author.join(', ')}
									</Text>
								</View>
								{ownedIds.has(item.id) && (
									<View style={styles.ownedBadge}>
										<Text style={styles.ownedBadgeText}>Owned</Text>
									</View>
								)}
							</Pressable>
						)}
						style={styles.sheetList}
					/>
					<Pressable style={styles.secondaryButton} onPress={onClose} accessibilityRole="button">
						<Text style={styles.secondaryButtonText}>Cancel</Text>
					</Pressable>
				</View>
			</KeyboardAvoidingView>
		</Animated.View>
	);
}

const styles = StyleSheet.create({
	overlay: {
		...StyleSheet.absoluteFill,
		backgroundColor: tokens.surface.overlay,
	},
	header: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingHorizontal: 20,
		paddingBottom: 12,
	},
	headerText: { flex: 1, gap: 2 },
	title: {
		color: tokens.text.primary,
		fontSize: 20,
		fontWeight: '600',
	},
	subtitle: {
		color: tokens.text.secondary,
		fontSize: 13,
	},
	viewToggle: {
		flexDirection: 'row',
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		padding: 2,
	},
	viewToggleButton: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 6,
	},
	viewToggleActive: {
		backgroundColor: tokens.accent.primary,
	},
	body: { flex: 1 },
	bodyDisabled: { pointerEvents: 'none' },
	listContent: {
		paddingHorizontal: 20,
		paddingBottom: 12,
	},
	sectionLabel: {
		color: tokens.text.hint,
		fontSize: 12,
		fontWeight: '600',
		textTransform: 'uppercase',
		letterSpacing: 0.6,
		marginTop: 14,
		marginBottom: 6,
	},
	row: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 8,
	},
	rowOwned: { opacity: 0.55 },
	rowMain: {
		flex: 1,
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
	},
	checkbox: {
		width: 22,
		height: 22,
		borderRadius: 11,
		borderWidth: 1.5,
		borderColor: tokens.text.hint,
		alignItems: 'center',
		justifyContent: 'center',
	},
	checkboxOn: {
		borderColor: tokens.accent.primary,
		backgroundColor: tokens.accent.primary,
	},
	rowInfo: { flex: 1, gap: 2 },
	rowTitle: {
		color: tokens.text.primary,
		fontSize: 15,
		fontWeight: '500',
	},
	rowAuthor: {
		color: tokens.text.secondary,
		fontSize: 12,
	},
	ownedBadge: {
		alignSelf: 'flex-start',
		paddingHorizontal: 6,
		paddingVertical: 2,
		borderRadius: 4,
		backgroundColor: tokens.badge.canon,
		marginTop: 2,
	},
	ownedBadgeText: {
		color: tokens.text.primary,
		fontSize: 10,
		fontWeight: '600',
	},
	swapButton: {
		padding: 10,
		borderRadius: 8,
	},
	// Grid
	gridRow: { gap: 12 },
	tile: {
		flex: 1 / 3,
		alignItems: 'center',
		marginTop: 16,
		gap: 6,
	},
	tileCover: {
		borderRadius: 6,
		padding: 3,
		borderWidth: 2,
		borderColor: 'transparent',
	},
	tileSelected: { borderColor: tokens.accent.primary },
	tileOwned: { opacity: 0.55 },
	tileCheck: {
		position: 'absolute',
		top: -6,
		right: -6,
		width: 22,
		height: 22,
		borderRadius: 11,
		backgroundColor: tokens.accent.primary,
		alignItems: 'center',
		justifyContent: 'center',
	},
	tileDoubt: {
		position: 'absolute',
		top: -6,
		left: -6,
		width: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: tokens.accent.secondary,
		alignItems: 'center',
		justifyContent: 'center',
	},
	tileDoubtText: {
		color: tokens.text.inverse,
		fontSize: 12,
		fontWeight: '700',
	},
	tileTitle: {
		color: tokens.text.primary,
		fontSize: 11,
		textAlign: 'center',
	},
	tileOwnedText: {
		color: tokens.text.hint,
		fontSize: 10,
	},
	// Footer
	footer: {
		paddingHorizontal: 20,
		paddingTop: 10,
		gap: 10,
		borderTopWidth: StyleSheet.hairlineWidth,
		borderTopColor: tokens.border.subtle,
	},
	errorText: {
		color: tokens.status.error,
		fontSize: 13,
		textAlign: 'center',
	},
	addButton: {
		height: 50,
		borderRadius: 10,
		backgroundColor: tokens.accent.primary,
		alignItems: 'center',
		justifyContent: 'center',
	},
	addDisabled: { opacity: 0.45 },
	addButtonText: {
		color: tokens.text.primary,
		fontSize: 16,
		fontWeight: '600',
	},
	startOver: { alignItems: 'center', paddingVertical: 6 },
	startOverText: {
		color: tokens.text.hint,
		fontSize: 13,
	},
	// Done
	doneBody: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
		padding: 32,
		gap: 12,
	},
	doneCheck: {
		width: 72,
		height: 72,
		borderRadius: 36,
		backgroundColor: tokens.accent.primary,
		alignItems: 'center',
		justifyContent: 'center',
		marginBottom: 8,
	},
	doneTitle: {
		color: tokens.text.primary,
		fontSize: 20,
		fontWeight: '600',
		textAlign: 'center',
	},
	doneText: {
		color: tokens.text.secondary,
		fontSize: 14,
	},
	primaryButton: {
		marginTop: 12,
		paddingHorizontal: 28,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.accent.primary,
	},
	primaryButtonText: {
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '600',
	},
	secondaryButton: {
		paddingHorizontal: 24,
		paddingVertical: 12,
		borderRadius: 8,
		backgroundColor: tokens.surface.card,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
		alignItems: 'center',
	},
	secondaryButtonText: {
		color: tokens.text.primary,
		fontSize: 14,
		fontWeight: '500',
	},
	// Swap sheet
	sheetBackdrop: {
		...StyleSheet.absoluteFill,
		backgroundColor: tokens.surface.overlay,
		justifyContent: 'flex-end',
	},
	// % maxHeight must live on the avoider — the backdrop has a definite height,
	// the keyboard-avoiding wrapper sizes to content.
	sheetAvoider: { maxHeight: '75%' },
	sheet: {
		backgroundColor: tokens.surface.card,
		borderTopLeftRadius: 16,
		borderTopRightRadius: 16,
		padding: 20,
		gap: 12,
	},
	sheetTitle: {
		color: tokens.text.primary,
		fontSize: 17,
		fontWeight: '600',
	},
	searchBox: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 8,
		paddingHorizontal: 12,
		borderRadius: 8,
		backgroundColor: tokens.surface.background,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	searchInput: {
		flex: 1,
		color: tokens.text.primary,
		fontSize: 14,
		paddingVertical: 10,
	},
	sheetEmpty: {
		color: tokens.text.hint,
		fontSize: 13,
		textAlign: 'center',
		paddingVertical: 12,
	},
	sheetList: { flexGrow: 0 },
	sheetRow: {
		flexDirection: 'row',
		alignItems: 'center',
		gap: 12,
		paddingVertical: 8,
	},
});
