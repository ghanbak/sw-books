import Link from 'next/link';
import type { ReactNode } from 'react';

// Shared shell for the public text pages (/privacy, /support).

export const CONTACT = 'privacy@ossusarchives.com';

export function ContactLink() {
	return (
		<a className="text-saber-blue hover:underline" href={`mailto:${CONTACT}`}>
			{CONTACT}
		</a>
	);
}

export function InfoPage({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: ReactNode;
}) {
	return (
		<main className="mx-auto max-w-2xl space-y-8 p-8">
			<header className="space-y-1">
				<Link href="/" className="text-muted-foreground text-sm hover:text-foreground">
					← Ossus Archives
				</Link>
				<h1 className="font-semibold text-2xl tracking-tight">{title}</h1>
				{subtitle ? <p className="text-muted-foreground text-sm">{subtitle}</p> : null}
			</header>
			{children}
		</main>
	);
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
	return (
		<section className="space-y-2">
			<h2 className="font-semibold text-foreground text-lg">{title}</h2>
			<div className="space-y-2 text-muted-foreground text-sm leading-relaxed">{children}</div>
		</section>
	);
}
