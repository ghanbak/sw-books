import { ExternalLink } from 'lucide-react';
import { Oxanium } from 'next/font/google';
import Link from 'next/link';
import { HeroBackdrop } from './_components/hero-backdrop';

// Public, statically rendered marketing page — no auth, no DB, crawlable.
export const dynamic = 'force-static';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/pT9n8FCC';

// Heading face (SIL OFL). Variable font, so every weight ships in one self-hosted file.
const oxanium = Oxanium({ subsets: ['latin'] });

// Eased scrim: sample a smoothstep curve into gradient stops. A linear fade leaves a
// visible edge where it ends; smoothstep flattens both ends so it melts into the video.
// Mixing the --background token (rather than a literal) keeps the scrim themeable.
const smoothstep = (t: number) => t * t * (3 - 2 * t);

function easedScrim(direction: 'to bottom' | 'to top', samples = 15) {
	const stops = Array.from({ length: samples }, (_, i) => {
		const t = i / (samples - 1);
		const alpha = Math.round((1 - smoothstep(t)) * 1000) / 10;
		const pos = Math.round(t * 1000) / 10;
		return `color-mix(in srgb, var(--background) ${alpha}%, transparent) ${pos}%`;
	});
	return `linear-gradient(${direction}, ${stops.join(', ')})`;
}

const TOP_SCRIM = { backgroundImage: easedScrim('to bottom') };
const BOTTOM_SCRIM = { backgroundImage: easedScrim('to top') };

export const metadata = {
	title: 'Ossus Archives — Star Wars Book Tracker',
	description: 'Track your Star Wars book collection across Canon and Legends.',
};

export default function Home() {
	return (
		<main className="relative flex min-h-svh flex-col items-center justify-between bg-background">
			<HeroBackdrop />
			{/* The copy sits directly on the video, so darken only the top and bottom bands
			    it occupies — the centered phone stays clear. */}
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 top-0 h-48 sm:h-64"
				style={TOP_SCRIM}
			/>
			<div
				aria-hidden="true"
				className="pointer-events-none absolute inset-x-0 bottom-0 h-48 sm:h-64"
				style={BOTTOM_SCRIM}
			/>
			<header className="relative flex flex-col items-center gap-3 px-6 pt-8 text-center text-halo sm:pt-12 widescreen:pt-6">
				<h1
					className={`${oxanium.className} flex items-center gap-3 font-bold text-2xl tracking-tight sm:text-3xl`}
				>
					{/* Square source art — round it to iOS's ~22.4% corner ratio so it reads as an app icon */}
					<img
						src="/app-icon.png"
						alt=""
						width={40}
						height={40}
						className="size-9 rounded-[22.37%] ring-1 ring-white/15 sm:size-10"
					/>
					Ossus Archives
				</h1>
				<p className="max-w-md text-balance font-semibold text-foreground/85 text-sm leading-relaxed sm:text-base lg:max-w-2xl">
					A datapad for your Star Wars library — track every novel across Canon and Legends.
				</p>
			</header>
			<footer className="relative flex flex-col items-center gap-3 px-6 pb-8 sm:pb-12 widescreen:pb-6">
				{/* Matches components/buy-on-amazon-button.tsx, but hugs its label. `active:` is
				    the app-matching press state; `hover:` is compiled inside @media (hover:hover)
				    and so is inert on touch. */}
				<a
					href={TESTFLIGHT_URL}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex h-13 items-center gap-2.5 rounded-full bg-primary px-7 font-semibold text-base text-primary-foreground transition-opacity focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background hover:opacity-85 active:opacity-85"
				>
					<ExternalLink size={18} strokeWidth={2.5} aria-hidden="true" />
					Join the TestFlight
					<span className="sr-only">(opens in a new tab)</span>
				</a>
				<nav>
					<Link
						href="/privacy"
						className="text-foreground/75 text-halo text-sm hover:text-foreground hover:underline"
					>
						Privacy Policy
					</Link>
				</nav>
			</footer>
		</main>
	);
}
