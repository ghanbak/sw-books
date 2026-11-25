import { Toaster } from '@/components/ui/sonner';
import type { Metadata } from 'next';
import type { ReactNode } from 'react';

// Distinct per-route titles so Next's route announcer speaks on client navigation.
// The template only applies to child segments; public pages keep their own titles.
export const metadata: Metadata = {
	title: { default: 'Ossus Archives — Admin', template: '%s — Ossus Archives Admin' },
};

export default function AdminLayout({ children }: { children: ReactNode }) {
	return (
		<>
			{children}
			<Toaster richColors position="bottom-right" />
		</>
	);
}
