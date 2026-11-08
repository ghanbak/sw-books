import { describe, expect, it, vi } from 'vitest';
import { type BulkItemResult, runBulkSequential } from '../bulk-run';

const items = [{ slug: 'a' }, { slug: 'b' }, { slug: 'c' }];

function harness(fn: (item: { slug: string }) => Promise<BulkItemResult>) {
	const onProgress = vi.fn();
	const onSettled = vi.fn();
	const onItemError = vi.fn();
	const onProbeError = vi.fn();
	return { fn: vi.fn(fn), onProgress, onSettled, onItemError, onProbeError };
}

describe('runBulkSequential', () => {
	it('counts updated and error statuses', async () => {
		const h = harness(async (i) => ({ status: i.slug === 'b' ? 'error' : 'updated' }));
		const summary = await runBulkSequential({ items, ...h });
		expect(summary).toEqual({ updated: 2, failures: ['b'], total: 3 });
		expect(h.onSettled).toHaveBeenCalledOnce();
		expect(h.onProgress).toHaveBeenLastCalledWith(3, 3);
	});

	it('treats a rejecting item as that item failing and keeps going', async () => {
		const boom = new Error('server action failed');
		const h = harness(async (i) => {
			if (i.slug === 'b') throw boom;
			return { status: 'updated' };
		});
		const summary = await runBulkSequential({ items, ...h });
		expect(h.fn).toHaveBeenCalledTimes(3);
		expect(summary).toEqual({ updated: 2, failures: ['b'], total: 3 });
		expect(h.onItemError).toHaveBeenCalledWith({ slug: 'b' }, boom);
		expect(h.onProgress).toHaveBeenLastCalledWith(3, 3);
		expect(h.onSettled).toHaveBeenCalledOnce();
		expect(h.onSettled).toHaveBeenCalledWith({ updated: 2, failures: ['b'], total: 3 });
	});

	it('runs the items when the probe rejects', async () => {
		const h = harness(async () => ({ status: 'updated' }));
		const probeErr = new Error('probe failed');
		const summary = await runBulkSequential({
			items,
			...h,
			probe: () => Promise.reject(probeErr),
		});
		expect(h.onProbeError).toHaveBeenCalledWith(probeErr);
		expect(h.fn).toHaveBeenCalledTimes(3);
		expect(summary.updated).toBe(3);
		expect(h.onSettled).toHaveBeenCalledOnce();
	});

	it('locks (progress 0) before the probe resolves', async () => {
		const h = harness(async () => ({ status: 'updated' }));
		const order: string[] = [];
		h.onProgress.mockImplementation((done: number) => order.push(`progress:${done}`));
		await runBulkSequential({
			items: [{ slug: 'a' }],
			...h,
			probe: async () => {
				order.push('probe');
			},
		});
		expect(order).toEqual(['progress:0', 'probe', 'progress:1']);
	});

	it('still settles when a callback throws mid-run', async () => {
		const h = harness(async () => ({ status: 'updated' }));
		h.onProgress.mockImplementation((done: number) => {
			if (done === 1) throw new Error('render blew up');
		});
		await expect(runBulkSequential({ items, ...h })).rejects.toThrow('render blew up');
		expect(h.onSettled).toHaveBeenCalledOnce();
	});
});
