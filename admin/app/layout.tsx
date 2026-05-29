import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
	title: 'Ossus Archives — Admin',
	description: 'Local catalog management for the Ossus Archives book tracker.',
};

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html lang="en" className="dark">
			<body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
		</html>
	);
}
