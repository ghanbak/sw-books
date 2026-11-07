/**
 * Map database errors to client-safe action errors. Raw Postgres/PostgREST
 * messages name tables, columns, constraints and values, so they stay in the
 * server log; the browser gets a stable code and a generic message.
 * Used by the admin's server actions (via the `@app/action-errors` alias).
 */
export type ActionError = { code: string; message: string };

type DbErrorLike = {
	code?: string;
	message?: string;
	details?: string | null;
	hint?: string | null;
};

type Logger = (...args: unknown[]) => void;

/** Postgres SQLSTATE → client code + message. Anything else is a generic DB error. */
const KNOWN: Record<string, ActionError> = {
	'23505': { code: 'DUPLICATE', message: 'A record with that value already exists.' },
	'23503': { code: 'REFERENCE', message: 'A related record is missing or still in use.' },
	'23502': { code: 'INVALID', message: 'A required field is empty.' },
	'23514': { code: 'INVALID', message: 'A value failed a database check.' },
	'22P02': { code: 'INVALID', message: 'A value has the wrong format.' },
	'22007': { code: 'INVALID', message: 'A date has the wrong format.' },
	'22008': { code: 'INVALID', message: 'A date is out of range.' },
	// RAISE EXCEPTION in our own functions (e.g. merge_books input checks).
	P0001: { code: 'REJECTED', message: 'The database rejected the change. See the server log.' },
};

export const DB_ERROR: ActionError = {
	code: 'DB',
	message: 'Database error. Details are in the server log.',
};

/**
 * Log `error` server-side under `context` and return a client-safe ActionError.
 * Never copies `error.message`/`details`/`hint` into the result.
 */
export function dbError(context: string, error: unknown, log: Logger = console.error): ActionError {
	const e = (error ?? {}) as DbErrorLike;
	log(`[admin:${context}]`, {
		code: e.code ?? null,
		message: e.message ?? String(error),
		details: e.details ?? null,
		hint: e.hint ?? null,
	});
	const known = e.code ? KNOWN[e.code] : undefined;
	return { ...(known ?? DB_ERROR) };
}
