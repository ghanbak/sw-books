// Phase 0 spike (throwaway): gate harness for the WebGPU hologram (plan G1–G7).
// Card = G1 texture path / G2 first frame / G3 frame time. Pager = G7 overlay drift.
// Cycle = G4 mount/unmount memory. Results also go to the console with a [holo-spike] prefix.
import { Stack } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';

import { externalMB, getLiveRendererCount } from './gpu';
import { type FrameStats, SpikeStage, type SpikeTimings } from './spike-stage';

const COVERS: (string | null)[] = [
	'https://images2.penguinrandomhouse.com/cover/9780593157718',
	'https://images2.penguinrandomhouse.com/cover/9780593159415',
	'https://books.google.com/books/content?id=kWeCyQEACAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
	null,
];
const PAGES = 6;
const PAGE_IDS = Array.from({ length: PAGES }, (_, i) => `page-${i + 1}`);
const CYCLES = 100;

type Mode = 'card' | 'pager' | 'cycle';

function Toggle({ label, on, onPress }: { label: string; on?: boolean; onPress: () => void }) {
	return (
		<Pressable onPress={onPress} style={[styles.toggle, on && styles.toggleOn]}>
			<Text style={styles.toggleText}>{label}</Text>
		</Pressable>
	);
}

const ms = (n: number) => `${n.toFixed(1)}ms`;

function StatsText({
	timings,
	frames,
	error,
}: { timings?: SpikeTimings; frames?: FrameStats; error?: string }) {
	return (
		<View style={styles.stats}>
			{error ? <Text style={styles.error}>error: {error}</Text> : null}
			{timings ? (
				<Text style={styles.mono}>
					{`device ${ms(timings.device)} · init ${ms(timings.init)} · compile ${ms(timings.compile)}\n`}
					{`cover fetch ${ms(timings.coverFetch)} · decode ${ms(timings.coverDecode)} · upload ${ms(timings.coverUpload)}\n`}
					{`first submit ${ms(timings.firstSubmit)} · total (excl. fetch) ${ms(timings.total)}`}
				</Text>
			) : null}
			{frames ? (
				<Text style={styles.mono}>
					{`frame p50 ${ms(frames.p50)} · p95 ${ms(frames.p95)} · max ${ms(frames.max)} · ${frames.fps.toFixed(0)} fps`}
				</Text>
			) : null}
		</View>
	);
}

function CardMode() {
	const { width } = useWindowDimensions();
	const [coverIndex, setCoverIndex] = useState(0);
	const [bloomOn, setBloomOn] = useState(true);
	const [downscale, setDownscale] = useState(true);
	const [flipY, setFlipY] = useState(false);
	const [ratio, setRatio] = useState(2);
	const [mount, setMount] = useState(0);
	const [timings, setTimings] = useState<SpikeTimings>();
	const [frames, setFrames] = useState<FrameStats>();
	const [error, setError] = useState<string>();
	const coverW = Math.min(220, Math.round(width * 0.55));
	const key = `${coverIndex}-${bloomOn}-${downscale}-${flipY}-${ratio}-${mount}`;

	return (
		<View style={styles.fill}>
			<SpikeStage
				key={key}
				mode="card"
				coverUri={COVERS[coverIndex]}
				bloom={bloomOn}
				downscale={downscale}
				flipY={flipY}
				pixelRatioCap={ratio}
				cardPoints={{ w: coverW, h: coverW * 1.5 }}
				onTimings={setTimings}
				onFrameStats={setFrames}
				onError={setError}
				style={styles.fill}
			/>
			<View style={styles.controls}>
				<Toggle
					label={`cover ${coverIndex + 1}/${COVERS.length}`}
					onPress={() => setCoverIndex((i) => (i + 1) % COVERS.length)}
				/>
				<Toggle label="bloom" on={bloomOn} onPress={() => setBloomOn((v) => !v)} />
				<Toggle label="downscale" on={downscale} onPress={() => setDownscale((v) => !v)} />
				<Toggle label="flipY" on={flipY} onPress={() => setFlipY((v) => !v)} />
				<Toggle
					label={`ratio ${ratio}`}
					onPress={() => setRatio((r) => (r === 2 ? 1.5 : r === 1.5 ? 3 : 2))}
				/>
				<Toggle label={`remount #${mount}`} onPress={() => setMount((m) => m + 1)} />
			</View>
			<StatsText timings={timings} frames={frames} error={error} />
		</View>
	);
}

function PagerMode() {
	const { width } = useWindowDimensions();
	const [height, setHeight] = useState(0);
	const [frames, setFrames] = useState<FrameStats>();
	const scrollX = useSharedValue(0);
	const onScroll = useAnimatedScrollHandler((e) => {
		scrollX.value = e.contentOffset.x;
	});
	const coverW = Math.min(220, Math.round(width * 0.55));
	const coverH = coverW * 1.5;

	return (
		<View style={styles.fill} onLayout={(e) => setHeight(e.nativeEvent.layout.height)}>
			{height > 0 ? (
				<>
					<SpikeStage
						mode="pager"
						coverUri={null}
						pageCount={PAGES}
						pageWidth={width}
						scrollX={scrollX}
						bloom
						downscale={false}
						flipY={false}
						pixelRatioCap={1.5}
						cardPoints={{ w: coverW, h: coverH }}
						onFrameStats={setFrames}
						style={StyleSheet.absoluteFill}
					/>
					<Animated.ScrollView
						horizontal
						pagingEnabled
						showsHorizontalScrollIndicator={false}
						onScroll={onScroll}
						scrollEventThrottle={16}
						style={StyleSheet.absoluteFill}
					>
						{PAGE_IDS.map((id) => (
							<View key={id} style={[styles.page, { width, height }]}>
								{/* RN outline + label at the card rect: must stay locked to the 3D card (G7). */}
								<View style={[styles.outline, { width: coverW, height: coverH }]}>
									<Text style={styles.pageLabel}>{id}</Text>
								</View>
							</View>
						))}
					</Animated.ScrollView>
				</>
			) : null}
			<View pointerEvents="none" style={styles.overlayStats}>
				<StatsText frames={frames} />
			</View>
		</View>
	);
}

function forceGC() {
	const { gc } = globalThis as { gc?: () => void };
	if (typeof gc === 'function') {
		gc();
		return;
	}
	let junk: number[][] = [];
	for (let i = 0; i < 50; i++) junk.push(new Array(100_000).fill(i));
	junk = [];
}

function CycleMode() {
	const { width } = useWindowDimensions();
	const [cycle, setCycle] = useState(0);
	const [mounted, setMounted] = useState(false);
	const [running, setRunning] = useState(false);
	const [log, setLog] = useState<string[]>([]);
	const baseline = useRef<number | null>(null);
	const coverW = Math.min(220, Math.round(width * 0.55));

	useEffect(() => {
		if (!running) return;
		if (cycle >= CYCLES) {
			setRunning(false);
			return;
		}
		if (!mounted) {
			const t = setTimeout(() => setMounted(true), 300);
			return () => clearTimeout(t);
		}
		const t = setTimeout(() => {
			setMounted(false);
			setTimeout(() => {
				forceGC();
				const mb = externalMB();
				if (baseline.current === null) baseline.current = mb;
				const line = `cycle ${cycle + 1}: external ${mb.toFixed(1)} MB (baseline ${baseline.current.toFixed(1)}), live renderers ${getLiveRendererCount()}`;
				console.log(`[holo-spike] ${line}`);
				setLog((l) => [line, ...l].slice(0, 6));
				setCycle((c) => c + 1);
			}, 500);
		}, 900);
		return () => clearTimeout(t);
	}, [running, mounted, cycle]);

	return (
		<View style={styles.fill}>
			<View style={styles.fill}>
				{mounted ? (
					<SpikeStage
						mode="card"
						coverUri={COVERS[cycle % 3]}
						bloom
						downscale
						flipY={false}
						pixelRatioCap={2}
						cardPoints={{ w: coverW, h: coverW * 1.5 }}
						style={styles.fill}
					/>
				) : null}
			</View>
			<View style={styles.controls}>
				<Toggle
					label={running ? `running ${cycle}/${CYCLES}` : `start ${CYCLES} cycles`}
					on={running}
					onPress={() => {
						baseline.current = null;
						setLog([]);
						setCycle(0);
						setRunning((r) => !r);
					}}
				/>
			</View>
			<ScrollView style={styles.stats}>
				{log.map((line) => (
					<Text key={line} style={styles.mono}>
						{line}
					</Text>
				))}
			</ScrollView>
		</View>
	);
}

export default function HoloSpikeScreen() {
	const [mode, setMode] = useState<Mode>('card');
	return (
		<View style={styles.container}>
			<Stack.Screen options={{ title: 'Holo spike', headerLargeTitle: false }} />
			<View style={styles.tabs}>
				{(['card', 'pager', 'cycle'] as const).map((m) => (
					<Toggle key={m} label={m} on={mode === m} onPress={() => setMode(m)} />
				))}
			</View>
			{mode === 'card' ? <CardMode /> : mode === 'pager' ? <PagerMode /> : <CycleMode />}
		</View>
	);
}

const styles = StyleSheet.create({
	container: { flex: 1, backgroundColor: tokens.surface.background, paddingTop: 100 },
	fill: { flex: 1 },
	tabs: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingBottom: 8 },
	controls: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 },
	toggle: {
		paddingHorizontal: 10,
		paddingVertical: 6,
		borderRadius: 8,
		borderWidth: 1,
		borderColor: tokens.border.subtle,
	},
	toggleOn: { backgroundColor: tokens.accent.primary },
	toggleText: { color: tokens.text.primary, fontSize: 12 },
	stats: { paddingHorizontal: 12, paddingBottom: 24, maxHeight: 140 },
	overlayStats: { position: 'absolute', left: 0, right: 0, bottom: 0 },
	mono: { color: tokens.text.secondary, fontSize: 11, fontFamily: 'Menlo' },
	error: { color: tokens.status.error, fontSize: 12 },
	page: { alignItems: 'center', justifyContent: 'center' },
	outline: { borderWidth: 1, borderColor: tokens.holo.cyan, borderRadius: 8, padding: 6 },
	pageLabel: { color: tokens.holo.cyan, fontSize: 12 },
});
