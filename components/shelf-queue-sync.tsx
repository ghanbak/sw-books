import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';

import { useAuth } from '@/lib/auth';
import { subscribeToReconnect } from '@/lib/connectivity';
import { useBooks, useUserBooks } from '@/lib/hooks';
import { createShelfQueueRunner, droppedBooksNotice, shelfQueue } from '@/lib/shelf-queue';

/**
 * App-wide driver for the shelf-scan offline queue: flushes on start, foreground and
 * reconnect, and while the queue is non-empty, independent of the scan screen. Renders nothing.
 *
 * Deliberate sign-out and account deletion clear the queue at their call sites. A session
 * that ends on its own (revoked refresh token) keeps it: the key is per-user, so the same
 * user's next sign-in replays it and a different user's purges it.
 */
export function ShelfQueueSync() {
	const { user } = useAuth();
	const userId = user?.id ?? null;
	const { refetch } = useUserBooks();
	const refetchRef = useRef(refetch);
	refetchRef.current = refetch;
	const { books } = useBooks();
	const booksRef = useRef(books);
	booksRef.current = books;

	useEffect(() => {
		if (!userId) return;
		void shelfQueue.purgeOtherUsers(userId);
		const runner = createShelfQueueRunner({
			queue: shelfQueue,
			userId,
			onSynced: () => {
				void refetchRef.current();
			},
			onDropped: (bookIds) => {
				const { title, message } = droppedBooksNotice(
					bookIds,
					(id) => booksRef.current.find((book) => book.id === id)?.title,
				);
				Alert.alert(title, message);
			},
		});
		runner.trigger();
		const subscription = AppState.addEventListener('change', (status) => {
			if (status === 'active') runner.trigger();
		});
		const unsubscribeNetInfo = subscribeToReconnect(runner.reconnect);
		return () => {
			subscription.remove();
			unsubscribeNetInfo();
			runner.stop();
		};
	}, [userId]);

	return null;
}
