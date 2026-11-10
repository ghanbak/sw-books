'use client';

import { Button } from '@/components/ui/button';
import { useRouter } from 'next/navigation';
import { startTransition } from 'react';

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
	const router = useRouter();

	return (
		<main
			role="alert"
			className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-center gap-4 px-4 text-center"
		>
			<div className="flex flex-col gap-1">
				<h1 className="font-semibold text-xl">Something went wrong</h1>
				<p className="text-base text-muted-foreground">
					Your last action may not have completed. Retry to reload this page.
				</p>
			</div>
			<Button
				className="min-h-11"
				onClick={() =>
					startTransition(() => {
						router.refresh();
						reset();
					})
				}
			>
				Retry
			</Button>
		</main>
	);
}
