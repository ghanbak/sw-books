import { Toaster } from '@/components/ui/sonner';
import type { ReactNode } from 'react';

export default function LoginLayout({ children }: { children: ReactNode }) {
	return (
		<>
			{children}
			<Toaster richColors position="bottom-right" />
		</>
	);
}
