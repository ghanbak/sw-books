import { Redirect } from 'expo-router';
import { Suspense, lazy } from 'react';

// Phase 0 WebGPU hologram spike — only reachable in builds made with EXPO_PUBLIC_HOLO_SPIKE=1
// (deep link: ossusarchives://dev/holo-spike). Lazy so three.js never evaluates otherwise.
const HoloSpikeScreen = lazy(() => import('@/components/holo-spike/spike-screen'));

export default function HoloSpikeRoute() {
	if (process.env.EXPO_PUBLIC_HOLO_SPIKE !== '1') return <Redirect href="/" />;
	return (
		<Suspense fallback={null}>
			<HoloSpikeScreen />
		</Suspense>
	);
}
