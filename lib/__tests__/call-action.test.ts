import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { callAction } from '../../admin/lib/call-action';
import { createRowSaveQueue, queueRowSave } from '../serial-save';

type Res = { ok: true; data: { updated_at: string } } | { ok: false; error: { message: string } };

const savedAt = (r: Res) => (r.ok ? r.data.updated_at : undefined);
const source = (path: string) => readFileSync(resolve(__dirname, '../../admin', path), 'utf-8');

describe('callAction (#210)', () => {
	beforeEach(() => {
		vi.spyOn(console, 'error').mockImplementation(() => {});
	});
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it('resolves a rejecting send to a failure result', async () => {
		await expect(callAction(() => Promise.reject(new Error('network')))).resolves.toEqual({
			ok: false,
			error: { code: 'REQUEST_FAILED', message: 'request did not complete' },
		});
	});

	it('resolves a synchronous throw to a failure result', async () => {
		const res = await callAction(() => {
			throw new Error('boom');
		});
		expect(res).toMatchObject({ ok: false, error: { code: 'REQUEST_FAILED' } });
	});

	it('uses the same wording as the guarded forms', async () => {
		const res = (await callAction(() => Promise.reject(new Error('x')), 'Save failed')) as {
			error: { message: string };
		};
		expect(source('app/admin/books/[slug]/_components/manual-fields-form.tsx')).toContain(
			`toast.error('${res.error.message}')`,
		);
	});

	it('does not leak the rejection message', async () => {
		const res = await callAction(() => Promise.reject(new Error('relation "books" secret')));
		expect(JSON.stringify(res)).not.toContain('secret');
	});

	it('returns results from the action untouched', async () => {
		const success = { ok: true as const, data: 1 };
		const failure = { ok: false as const, error: { code: 'CONFLICT', message: 'stale' } };
		await expect(callAction(async () => success, 'Save failed')).resolves.toBe(success);
		await expect(callAction(async () => failure, 'Save failed')).resolves.toBe(failure);
	});

	it('a rejected save fails alone and the next queued save for the row still runs', async () => {
		const queue = createRowSaveQueue();
		const sends: Array<string | null> = [];
		const save = (outcome: () => Promise<Res>) =>
			callAction(() =>
				queueRowSave(
					queue,
					'row',
					't0',
					(at) => {
						sends.push(at);
						return outcome();
					},
					savedAt,
				),
			);

		const first = save(() => Promise.reject(new Error('network')));
		const second = save(async () => ({ ok: true, data: { updated_at: 't1' } }));

		await expect(first).resolves.toMatchObject({ ok: false, error: { code: 'REQUEST_FAILED' } });
		await expect(second).resolves.toEqual({ ok: true, data: { updated_at: 't1' } });
		expect(sends).toEqual(['t0', 't0']);
		await vi.waitFor(() => expect(queue.size).toBe(0));
	});
});

describe('server action call sites use callAction (#210)', () => {
	const sites: Array<[file: string, actions: string[]]> = [
		['app/admin/books/_components/books-table.tsx', ['deleteBook', 'recheckWiki']],
		['app/admin/books/[slug]/_components/diff-view.tsx', ['lookupCandidates']],
		[
			'app/admin/books/[slug]/_components/pin-editor.tsx',
			['searchPinCandidates', 'savePin', 'removePin'],
		],
		['app/admin/diff/_components/export-button.tsx', ['exportToCsv']],
	];

	for (const [file, actions] of sites) {
		const src = source(file);
		for (const action of actions) {
			it(`${action} in ${file}`, () => {
				expect(src).toMatch(new RegExp(`callAction\\(\\s*\\(\\)\\s*=>\\s*${action}\\(`));
				expect(src).not.toMatch(new RegExp(`await\\s+${action}\\(`));
			});
		}
	}

	it('the inline save catches a rejection from the row queue', () => {
		expect(source('app/admin/books/_components/books-table.tsx')).toMatch(
			/callAction\(\s*\(\)\s*=>\s*queueRowSave\(\s*saveQueue,/,
		);
	});
});

describe('books table optimistic edits settle (#210)', () => {
	// While an optimistic edit is pending, `useOptimistic` returns a new rows
	// array on every render. TanStack's default page-index auto reset queues a
	// state update for each new array, so the table re-renders forever at
	// default priority. That starves the transition lane: a failed inline edit
	// never reverts, and every later `useTransition` (Delete, Recheck) stays
	// pending with its spinner. Root admin deps can't load table-core, so this
	// guards the option in source.
	const src = source('app/admin/books/_components/books-table.tsx');
	const tableOptions = src.match(/useReactTable\(\s*\{[\s\S]*?\n\t\}\);/)?.[0] ?? '';

	it('rows still go through useOptimistic', () => {
		expect(src).toMatch(/useOptimistic\(/);
		expect(tableOptions).toMatch(/data:\s*visibleData/);
	});

	it('turns off the page-index auto reset', () => {
		expect(tableOptions).toMatch(/autoResetPageIndex:\s*false/);
		expect(tableOptions).not.toMatch(/autoResetAll:\s*true/);
	});
});

describe('admin error boundary (#210)', () => {
	const path = 'app/admin/error.tsx';

	it('exists as a client component that offers Retry', () => {
		expect(existsSync(resolve(__dirname, '../../admin', path))).toBe(true);
		const src = source(path);
		expect(src).toMatch(/^'use client';/);
		expect(src).toMatch(/reset\(\)/);
		expect(src).toContain('Retry');
	});
});
