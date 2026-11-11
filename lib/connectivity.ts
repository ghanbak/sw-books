import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';

export type Connectivity = 'online' | 'offline' | 'unknown';

/**
 * Collapses a NetInfo state to three values. `isInternetReachable` is null until the
 * reachability probe answers, so a connected interface with a pending probe counts as
 * online; a probe that says false counts as offline.
 */
export function connectivityOf(
	state: Pick<NetInfoState, 'isConnected' | 'isInternetReachable'>,
): Connectivity {
	if (state.isConnected === false || state.isInternetReachable === false) return 'offline';
	if (state.isConnected === true) return 'online';
	return 'unknown';
}

/** Only a known offline → online edge counts. The first report (no `prev`) never does. */
export function isReconnect(prev: Connectivity | null, next: Connectivity): boolean {
	return prev === 'offline' && next === 'online';
}

/**
 * Calls `onReconnect` each time the device goes from offline to online. NetInfo reports
 * the current state right after subscribing; that report only seeds the baseline. Unknown
 * states keep the last known value, so offline → unknown → online still fires once.
 * Returns the unsubscribe.
 */
export function subscribeToReconnect(
	onReconnect: () => void,
	addEventListener: typeof NetInfo.addEventListener = NetInfo.addEventListener,
): () => void {
	let last: Connectivity | null = null;
	return addEventListener((state) => {
		const next = connectivityOf(state);
		if (next === 'unknown') return;
		const reconnected = isReconnect(last, next);
		last = next;
		if (reconnected) onReconnect();
	});
}
