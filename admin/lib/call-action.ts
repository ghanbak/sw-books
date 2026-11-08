export type ActionFailure = { ok: false; error: { code: 'REQUEST_FAILED'; message: string } };

const REQUEST_FAILED = 'request did not complete';

/**
 * Await a server action from the client and turn a rejection (network drop,
 * "Failed to find Server Action" after a redeploy, an unguarded server throw)
 * into a failure result, so the caller's `!res.ok` branch shows the toast.
 * Uncaught, the rejection reaches the error boundary and replaces the page.
 *
 * Pass `prefix` where the caller toasts `res.error.message` as is. Next reports
 * a server-side `redirect()` as a rejection too; don't wrap an action that uses it.
 */
export async function callAction<T>(
	send: () => Promise<T>,
	prefix?: string,
): Promise<T | ActionFailure> {
	try {
		return await send();
	} catch (error) {
		console.error('[admin:callAction]', error);
		return {
			ok: false,
			error: {
				code: 'REQUEST_FAILED',
				message: prefix ? `${prefix}: ${REQUEST_FAILED}` : REQUEST_FAILED,
			},
		};
	}
}
