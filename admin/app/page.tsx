import Link from 'next/link';

// Public, statically rendered marketing stub. Real marketing site is deferred.
export const dynamic = 'force-static';

export const metadata = {
	title: 'Ossus Archives — Star Wars Book Tracker',
	description: 'Track your Star Wars book collection across Canon and Legends.',
};

export default function Home() {
	return (
		<main className="mx-auto flex min-h-dvh max-w-2xl flex-col items-center justify-center gap-8 p-8 text-center">
			<div className="space-y-3">
				<h1 className="font-semibold text-3xl tracking-tight">Ossus Archives</h1>
				<p className="text-muted-foreground">
					A datapad for your Star Wars library — track every novel across Canon and Legends.
				</p>
				<p className="text-muted-foreground text-sm">Coming soon to iOS.</p>
			</div>
			<nav className="text-sm">
				<Link href="/privacy" className="text-saber-blue hover:underline">
					Privacy Policy
				</Link>
			</nav>
		</main>
	);
}
