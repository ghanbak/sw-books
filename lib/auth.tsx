import type { Session, User } from '@supabase/supabase-js';
import { type ReactNode, createContext, useContext, useEffect, useState } from 'react';

import { supabase } from './supabase';

type AuthContextValue = {
	session: Session | null;
	user: User | null;
	loading: boolean;
};

const AuthContext = createContext<AuthContextValue>({
	session: null,
	user: null,
	loading: true,
});

export function AuthProvider({ children }: { children: ReactNode }) {
	const [session, setSession] = useState<Session | null>(null);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		supabase.auth.getSession().then(({ data }) => {
			setSession(data.session);
			setLoading(false);
		});

		const {
			data: { subscription },
		} = supabase.auth.onAuthStateChange((_event, newSession) => {
			setSession(newSession);
		});

		return () => subscription.unsubscribe();
	}, []);

	return (
		<AuthContext.Provider value={{ session, user: session?.user ?? null, loading }}>
			{children}
		</AuthContext.Provider>
	);
}

export function useAuth() {
	return useContext(AuthContext);
}
