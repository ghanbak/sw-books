import { describe, expect, it } from 'vitest';

import { selectListState } from './list-state';

describe('selectListState', () => {
	it('loading with no rows is loading, not empty', () => {
		expect(selectListState({ loading: true, error: null, count: 0 })).toBe('loading');
	});

	it('failed load with no rows is error, not empty', () => {
		expect(selectListState({ loading: false, error: 'boom', count: 0 })).toBe('error');
	});

	it('retry in flight after an error shows loading', () => {
		expect(selectListState({ loading: true, error: 'boom', count: 0 })).toBe('loading');
	});

	it('empty only after a successful load', () => {
		expect(selectListState({ loading: false, error: null, count: 0 })).toBe('empty');
	});

	it('rows win over loading and error', () => {
		expect(selectListState({ loading: true, error: null, count: 3 })).toBe('list');
		expect(selectListState({ loading: false, error: 'boom', count: 3 })).toBe('list');
	});
});
