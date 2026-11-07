import { describe, expect, it, vi } from 'vitest';
import { DB_ERROR, dbError } from '../action-errors';

const pgError = {
	code: '42703',
	message: 'column books.secret_column does not exist',
	details: 'Failing row contains (abc, hunter2)',
	hint: 'Perhaps you meant books.slug',
};

describe('dbError', () => {
	it('never returns the raw message, details or hint', () => {
		const log = vi.fn();
		const out = dbError('patchBook', pgError, log);
		expect(out).toEqual(DB_ERROR);
		const serialized = JSON.stringify(out);
		expect(serialized).not.toContain('secret_column');
		expect(serialized).not.toContain('hunter2');
		expect(serialized).not.toContain('Perhaps');
	});

	it('logs the full error server-side with its context', () => {
		const log = vi.fn();
		dbError('deleteBook', pgError, log);
		expect(log).toHaveBeenCalledWith('[admin:deleteBook]', {
			code: '42703',
			message: pgError.message,
			details: pgError.details,
			hint: pgError.hint,
		});
	});

	it.each([
		['23505', 'DUPLICATE'],
		['23503', 'REFERENCE'],
		['23502', 'INVALID'],
		['23514', 'INVALID'],
		['22P02', 'INVALID'],
		['22007', 'INVALID'],
		['P0001', 'REJECTED'],
	])('maps SQLSTATE %s to %s with a generic message', (code, expected) => {
		const out = dbError('x', { code, message: `raw ${code} detail "Key (slug)=(x)"` }, vi.fn());
		expect(out.code).toBe(expected);
		expect(out.message).not.toContain('raw');
		expect(out.message).not.toContain('slug');
	});

	it('handles non-object errors', () => {
		const log = vi.fn();
		expect(dbError('x', 'boom', log)).toEqual(DB_ERROR);
		expect(dbError('x', undefined, log)).toEqual(DB_ERROR);
		expect(log).toHaveBeenCalledTimes(2);
	});

	it('returns a fresh object each call', () => {
		const a = dbError('x', pgError, vi.fn());
		a.message = 'mutated';
		expect(dbError('x', pgError, vi.fn()).message).toBe(DB_ERROR.message);
	});
});
