import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PINS_FILE, parsePins, serializePins } from './pins';

const at = '2026-10-22T00:00:00.000Z';

describe('parsePins', () => {
	it('reads valid pins, trimming an empty note away', () => {
		const { pins, errors } = parsePins({
			'a-book': { pageid: 1, title: 'A', pinned_at: at, note: '  ' },
			'b-book': { pageid: 2, title: 'B', pinned_at: at, note: 'audio drama page' },
		});
		expect(errors).toEqual([]);
		expect(pins.get('a-book')).toEqual({ pageid: 1, title: 'A', pinned_at: at });
		expect(pins.get('b-book')?.note).toBe('audio drama page');
	});

	it('reports every bad entry and keeps the good ones', () => {
		const { pins, errors } = parsePins({
			'Bad Slug': { pageid: 1, title: 'A', pinned_at: at },
			neg: { pageid: -1, title: 'A', pinned_at: at },
			float: { pageid: 1.5, title: 'A', pinned_at: at },
			untitled: { pageid: 3, title: ' ', pinned_at: at },
			undated: { pageid: 4, title: 'D', pinned_at: 'yesterday' },
			extra: { pageid: 5, title: 'E', pinned_at: at, source_url: 'x' },
			arr: [],
			ok: { pageid: 6, title: 'F', pinned_at: at },
		});
		expect([...pins.keys()]).toEqual(['ok']);
		expect(errors).toHaveLength(7);
	});

	it('rejects a non-object file', () => {
		expect(parsePins([]).errors).toHaveLength(1);
		expect(parsePins(null).errors).toHaveLength(1);
	});
});

describe('serializePins', () => {
	it('is stable: sorted slugs, fixed key order, trailing newline, round-trips', () => {
		const text = serializePins(
			new Map([
				['z-book', { pinned_at: at, title: 'Z', pageid: 26 }],
				['a-book', { note: 'n', pinned_at: at, pageid: 1, title: 'A' }],
			]),
		);
		expect(text).toBe(
			`{\n  "a-book": {\n    "pageid": 1,\n    "title": "A",\n    "note": "n",\n    "pinned_at": "${at}"\n  },\n  "z-book": {\n    "pageid": 26,\n    "title": "Z",\n    "pinned_at": "${at}"\n  }\n}\n`,
		);
		const { pins, errors } = parsePins(JSON.parse(text));
		expect(errors).toEqual([]);
		expect(serializePins(pins)).toBe(text);
	});
});

describe(`data/${PINS_FILE}`, () => {
	it('is valid and already in canonical form', () => {
		const text = readFileSync(resolve(__dirname, '..', '..', 'data', PINS_FILE), 'utf-8');
		const { pins, errors } = parsePins(JSON.parse(text));
		expect(errors).toEqual([]);
		expect(serializePins(pins)).toBe(text);
	});
});
