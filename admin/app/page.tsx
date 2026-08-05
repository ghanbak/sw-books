import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { HeroBackdrop } from './_components/hero-backdrop';

// Public, statically rendered marketing page — no auth, no DB, crawlable.
export const dynamic = 'force-static';

const TESTFLIGHT_URL = 'https://testflight.apple.com/join/pT9n8FCC';

export const metadata = {
	title: 'Ossus Archives — Star Wars Book Tracker',
	description: 'Track your Star Wars book collection across Canon and Legends.',
};

export default function Home() {
	return (
		<main className="relative min-h-svh bg-background">
			<HeroBackdrop />
			<div className="relative p-6 sm:p-10 lg:p-16">
				{/* Mirrors components/ui/card.tsx — the shell every book row uses */}
				<div className="w-full max-w-md overflow-hidden rounded-[12px] bg-card text-left text-card-foreground">
					<div className="space-y-4 p-3">
						<div className="space-y-2">
							<h1 className="font-semibold text-2xl tracking-tight sm:text-3xl">Ossus Archives</h1>
							<p className="text-muted-foreground text-sm leading-relaxed">
								A datapad for your Star Wars library — track every novel across Canon and Legends.
							</p>
						</div>
						{/* Matches components/buy-on-amazon-button.tsx. `active:` is the app-matching
						    press state; `hover:` is compiled inside @media (hover:hover) and so is
						    inert on touch. */}
						<a
							href={TESTFLIGHT_URL}
							target="_blank"
							rel="noopener noreferrer"
							className="flex h-13 w-full items-center justify-center gap-2.5 rounded-full bg-primary font-semibold text-base text-primary-foreground transition-opacity focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card hover:opacity-85 active:opacity-85"
						>
							<ExternalLink size={18} strokeWidth={2.5} aria-hidden="true" />
							Join the TestFlight
							<span className="sr-only">(opens in a new tab)</span>
						</a>
						<nav>
							<Link href="/privacy" className="text-muted-foreground text-sm hover:underline">
								Privacy Policy
							</Link>
						</nav>
					</div>
					{/* CardNotch — the datapad footer from components/ui/card.tsx */}
					<div aria-hidden="true" className="flex h-3 items-start justify-between pr-6 pl-3">
						<div className="flex items-center gap-1">
							<div className="h-1 w-8 rounded-[2px] bg-border" />
							<div className="h-1 w-2 rounded-[2px] bg-border" />
						</div>
						<div className="h-3 w-[88px] rounded-t-[16px] bg-background" />
					</div>
				</div>
			</div>
		</main>
	);
}
