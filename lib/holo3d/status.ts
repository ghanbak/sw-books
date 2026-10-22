import { useSyncExternalStore } from 'react';
import { Platform } from 'react-native';

/**
 * App-wide availability of the 3D hologram. Screens branch on it: anything but `unavailable`
 * mounts a stage; `unavailable` renders the static HoloFace. An error boundary can't see async
 * init/frame/device-loss failures, so stages report them here. Unavailable is sticky for the
 * session (no retry). No three.js import — safe anywhere.
 */
export type HoloUnavailableReason =
	| 'disabled'
	| 'platform'
	| 'no-webgpu'
	| 'init'
	| 'frame'
	| 'device-lost';

export type HoloStatus =
	| { kind: 'available' }
	| { kind: 'unavailable'; reason: HoloUnavailableReason };

function initialStatus(): HoloStatus {
	// Build-time switch (inlined by Metro) — an EAS Update built with it set to 0 turns 3D off.
	if (process.env.EXPO_PUBLIC_HOLO_3D === '0') return { kind: 'unavailable', reason: 'disabled' };
	if (Platform.OS !== 'ios') return { kind: 'unavailable', reason: 'platform' };
	return { kind: 'available' };
}

let status: HoloStatus = initialStatus();
const listeners = new Set<() => void>();

export function getHoloStatus(): HoloStatus {
	return status;
}

export function reportHoloUnavailable(reason: HoloUnavailableReason): void {
	if (status.kind === 'unavailable') return;
	console.warn(`[holo3d] disabled for this session: ${reason}`);
	status = { kind: 'unavailable', reason };
	for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
	listeners.add(listener);
	return () => listeners.delete(listener);
}

export function useHoloStatus(): HoloStatus {
	return useSyncExternalStore(subscribe, getHoloStatus);
}
