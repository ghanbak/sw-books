// Phase 0 spike (throwaway): gate harness for the WebGPU hologram (plan G1–G7).
// Card = G1 texture path / G2 first frame / G3 frame time. Pager = G7 overlay drift.
// Cycle = G4 mount/unmount memory. Results also go to the console with a [holo-spike] prefix.
import { Host, Slider } from '@expo/ui';
import { Stack } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedScrollHandler, useSharedValue } from 'react-native-reanimated';

import { Text } from '@/components/ui/text';
import { tokens } from '@/constants/tokens';

import { externalMB, getLiveRendererCount } from './gpu';
import { type BloomMode, DEFAULT_TUNING, type Tuning } from './scene';
import { type FrameStats, SpikeStage, type SpikeTimings } from './spike-stage';

const COVERS: (string | null)[] = [
	'https://images2.penguinrandomhouse.com/cover/9780593157718',
	'https://images2.penguinrandomhouse.com/cover/9780593159415',
	'https://books.google.com/books/content?id=kWeCyQEACAAJ&printsec=frontcover&img=1&zoom=1&source=gbs_api',
	null,
];
const BLOOM_MODES: BloomMode[] = ['selective', 'full', 'off'];
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

const TUNING_RANGES: { key: keyof Tuning; label: string; min: number; max: number }[] = [
	{ key: 'strength', label: 'bloom strength', min: 0, max: 3 },
	{ key: 'radius', label: 'bloom radius', min: 0, max: 1 },
	{ key: 'threshold', label: 'bloom threshold', min: 0, max: 1 },
	{ key: 'edge', label: 'edge bloom', min: 0, max: 2 },
	{ key: 'halo', label: 'face halo', min: 0, max: 0.5 },
	{ key: 'emitter', label: 'emitter bloom', min: 0, max: 2 },
	{ key: 'edgeLight', label: 'edge light', min: 0, max: 1.5 },
];

/** Live sliders: values reach the shader uniforms on the next frame (no remount). */
function TuningPanel({ tuning, onChange }: { tuning: Tuning; onChange: (t: Tuning) => void }) {
	return (
		<ScrollView style={styles.tuning}>
			{TUNING_RANGES.map(({ key, label, min, max }) => (
				<View key={key} style={styles.tuneRow}>
					<Text style={styles.tuneLabel}>{label}</Text>
					<Host style={styles.tuneSlider}>
						<Slider
							value={tuning[key]}
							min={min}
							max={max}
							onValueChange={(v) => onChange({ ...tuning, [key]: v })}
						/>
					</Host>
					<Text style={styles.tuneValue}>{tuning[key].toFixed(2)}</Text>
				</View>
			))}
			<Text style={styles.mono}>{JSON.stringify(roundTuning(tuning))}</Text>
		</ScrollView>
	);
}

const roundTuning = (t: Tuning) =>
	Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 100) / 100]));

function CardMode() {
	const { width } = useWindowDimensions();
	const [coverIndex, setCoverIndex] = useState(0);
	const [bloom, setBloom] = useState<BloomMode>('selective');
	const [downscale, setDownscale] = useState(true);
	const [flipY, setFlipY] = useState(true);
	const [ratio, setRatio] = useState(2);
	const [mount, setMount] = useState(0);
	const [timings, setTimings] = useState<SpikeTimings>();
	const [frames, setFrames] = useState<FrameStats>();
	const [error, setError] = useState<string>();
	const [showTuning, setShowTuning] = useState(true);
	const [tuning, setTuning] = useState<Tuning>(DEFAULT_TUNING);
	// Stage reads this every frame; updated from the slider handler, never during render.
	const tuningRef = useRef<Tuning>(DEFAULT_TUNING);
	const updateTuning = (next: Tuning) => {
		tuningRef.current = next;
		setTuning(next);
	};
	const coverW = Math.min(220, Math.round(width * 0.55));
	const key = `${coverIndex}-${bloom}-${downscale}-${flipY}-${ratio}-${mount}`;

	return (
		<View style={styles.fill}>
			<SpikeStage
				key={key}
				mode="card"
				coverUri={COVERS[coverIndex]}
				bloom={bloom}
				tuning={tuningRef}
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
				<Toggle
					label={`bloom ${bloom}`}
					on={bloom !== 'off'}
					onPress={() =>
						setBloom((b) => BLOOM_MODES[(BLOOM_MODES.indexOf(b) + 1) % BLOOM_MODES.length])
					}
				/>
				<Toggle label="downscale" on={downscale} onPress={() => setDownscale((v) => !v)} />
				<Toggle label="flipY" on={flipY} onPress={() => setFlipY((v) => !v)} />
				<Toggle
					label={`ratio ${ratio}`}
					onPress={() => setRatio((r) => (r === 2 ? 1.5 : r === 1.5 ? 3 : 2))}
				/>
				<Toggle label={`remount #${mount}`} onPress={() => setMount((m) => m + 1)} />
				<Toggle label="tune" on={showTuning} onPress={() => setShowTuning((v) => !v)} />
				<Toggle label="reset" onPress={() => updateTuning(DEFAULT_TUNING)} />
			</View>
			{showTuning && bloom === 'selective' ? (
				<TuningPanel tuning={tuning} onChange={updateTuning} />
			) : (
				<StatsText timings={timings} frames={frames} error={error} />
			)}
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
						bloom="selective"
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

	// Explicit phases so every reading is taken with NOTHING mounted: mount → (full setup, or
	// an early unmount every 4th cycle to exercise mid-setup cancellation) → unmount → GC → read.
	useEffect(() => {
		if (!running) return;
		let cancelled = false;
		const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
		void (async () => {
			for (let i = 0; i < CYCLES && !cancelled; i++) {
				setCycle(i);
				setMounted(true);
				await sleep(i % 4 === 3 ? 400 : 1500);
				if (cancelled) return;
				setMounted(false);
				await sleep(700);
				if (cancelled) return;
				forceGC();
				await sleep(100);
				const mb = externalMB();
				if (baseline.current === null) baseline.current = mb;
				const line = `cycle ${i + 1}: external ${mb.toFixed(1)} MB (baseline ${baseline.current.toFixed(1)}), live renderers ${getLiveRendererCount()}`;
				console.log(`[holo-spike] ${line}`);
				setLog((l) => [line, ...l].slice(0, 6));
			}
			setCycle(CYCLES);
			setRunning(false);
		})();
		return () => {
			cancelled = true;
		};
	}, [running]);

	return (
		<View style={styles.fill}>
			<View style={styles.fill}>
				{mounted ? (
					<SpikeStage
						mode="card"
						coverUri={COVERS[cycle % 3]}
						bloom="selective"
						downscale
						flipY
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
	const headerHeight = useHeaderHeight();
	return (
		<View style={[styles.container, { paddingTop: headerHeight + 8 }]}>
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
	container: { flex: 1, backgroundColor: tokens.surface.background },
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
	tuning: { maxHeight: 290, paddingHorizontal: 12 },
	tuneRow: { flexDirection: 'row', alignItems: 'center', gap: 8, height: 34 },
	tuneLabel: { color: tokens.text.secondary, fontSize: 12, width: 104 },
	tuneSlider: { flex: 1, height: 30 },
	tuneValue: {
		color: tokens.text.primary,
		fontSize: 12,
		width: 40,
		textAlign: 'right',
		fontFamily: 'Menlo',
	},
	stats: { paddingHorizontal: 12, paddingBottom: 24, maxHeight: 140 },
	overlayStats: { position: 'absolute', left: 0, right: 0, bottom: 0 },
	mono: { color: tokens.text.secondary, fontSize: 11, fontFamily: 'Menlo' },
	error: { color: tokens.status.error, fontSize: 12 },
	page: { alignItems: 'center', justifyContent: 'center' },
	outline: { borderWidth: 1, borderColor: tokens.holo.cyan, borderRadius: 8, padding: 6 },
	pageLabel: { color: tokens.holo.cyan, fontSize: 12 },
});
