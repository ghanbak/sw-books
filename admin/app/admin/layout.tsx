import { Toaster } from '@/components/ui/sonner';
import type { ReactNode } from 'react';

export default function AdminLayout({ children }: { children: ReactNode }) {
	return (
		<>
			{children}
			<Toaster richColors position="bottom-right" />
		</>
	);
}
