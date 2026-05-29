import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { Toaster } from '@/components/ui/sonner';
import './globals.css';

export const metadata: Metadata = {
	title: 'Ossus Archives — Admin',
	description: 'Local catalog management for the Ossus Archives book tracker.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="min-h-screen bg-background text-foreground antialiased">
				{children}
				<Toaster richColors position="bottom-right" />
			</body>
		</html>
	);
}
