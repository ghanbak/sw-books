import { describe, expect, it } from 'vitest';
import {
	type HealthRow,
	checkDuplicateCovers,
	checkDuplicateFormats,
	checkDuplicateSlugs,
	checkInvalidIsbns,
	checkIsbnCollisions,
	checkNullFields,
	checkPrimaryInIsbns,
	classifyCoverProbe,
	classifyIsbn,
	isValidIsbn10,
	runOfflineChecks,
	summarize,
} from '../catalog-health';
import { parseBackup } from '../csv/backup';

const healthy = (slug: string, isbn: string, extra: Partial<HealthRow> = {}): HealthRow => ({
	slug,
	isbn: [isbn],
	primary_isbn: isbn,
	cover_image: `https://covers.example/${slug}.jpg`,
	synopsis: 'A synopsis.',
	...extra,
});

describe('ISBN classification', () => {
	it('accepts valid ISBN-13 and ISBN-10 (incl. X check digit)', () => {
		expect(classifyIsbn('9780553392869')).toBe('valid-13');
		expect(classifyIsbn('0553296124')).toBe('valid-10');
		expect(isValidIsbn10('080442957X')).toBe(true);
		expect(classifyIsbn('080442957x')).toBe('valid-10');
	});

	it('flags bad check digits (10→13 conversion without recompute)', () => {
		expect(classifyIsbn('9780553570050')).toBe('bad-check-digit');
		expect(classifyIsbn('9780553570052')).toBe('valid-13');
		expect(classifyIsbn('0553296125')).toBe('bad-check-digit');
	});

	it('flags malformed values', () => {
		expect(classifyIsbn('978-0553392869')).toBe('malformed');
		expect(classifyIsbn('B00ABC1234')).toBe('malformed');
		expect(classifyIsbn('')).toBe('malformed');
	});
});

describe('offline checks', () => {
	it('passes a clean catalog', () => {
		const rows = [healthy('a', '9780553392869'), healthy('b', '9780345279132')];
		expect(runOfflineChecks(rows)).toEqual([]);
	});

	it('flags duplicate slugs', () => {
		const f = checkDuplicateSlugs([healthy('a', '9780553392869'), healthy('a', '9780345279132')]);
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({ severity: 'error', check: 'duplicate-slug', slugs: ['a'] });
	});

	it('flags one ISBN on two books (the Queen’s Peril/Shadow case)', () => {
		const rows = [
			healthy('queens-peril', '9781368046800', { isbn: ['9781368046800', '9781368057943'] }),
			healthy('queens-shadow', '9781368057943'),
		];
		const f = checkIsbnCollisions(rows);
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({
			severity: 'error',
			check: 'isbn-collision',
			slugs: ['queens-peril', 'queens-shadow'],
		});
	});

	it('folds ISBN-10 to ISBN-13 when detecting collisions', () => {
		const rows = [healthy('a', '0553296124'), healthy('b', '9780553296129')];
		expect(checkIsbnCollisions(rows)).toHaveLength(1);
	});

	it('does not count an ISBN repeated within one row as a collision', () => {
		const rows = [healthy('a', '9780553392869', { isbn: ['9780553392869', '9780553392869'] })];
		expect(checkIsbnCollisions(rows)).toEqual([]);
	});

	it('flags invalid ISBNs in isbn[] and primary_isbn, labelling the role', () => {
		const rows = [
			healthy('x-wing-wedges-gamble', '9780553570050'),
			healthy('heir', '9780553296129', { isbn: ['9780553296129', '9780345528295'] }),
		];
		const f = checkInvalidIsbns(rows);
		expect(f.map((x) => x.message)).toEqual([
			'x-wing-wedges-gamble: invalid check digit 9780553570050 (primary_isbn)',
			'heir: invalid check digit 9780345528295 (isbn[])',
		]);
		expect(f.every((x) => x.severity === 'error')).toBe(true);
	});

	it('flags primary_isbn missing from isbn[] (exact match, like merge_books)', () => {
		const rows = [
			healthy('a', '9780553392869', { isbn: ['9780345279132'] }),
			healthy('b', '9780553392876', { isbn: null }),
			healthy('c', '9780553391473', { primary_isbn: null }),
		];
		const f = checkPrimaryInIsbns(rows);
		expect(f.map((x) => x.slugs[0])).toEqual(['a', 'b']);
	});

	it('warns on shared cover URLs', () => {
		const url = 'https://covers.example/coming-soon.jpg';
		const rows = [
			healthy('a', '9780553392869', { cover_image: url }),
			healthy('b', '9780345279132', { cover_image: `${url} ` }),
		];
		const f = checkDuplicateCovers(rows);
		expect(f).toHaveLength(1);
		expect(f[0]).toMatchObject({ severity: 'warning', slugs: ['a', 'b'] });
	});

	it('warns on null/blank cover and synopsis', () => {
		const f = checkNullFields([
			healthy('a', '9780553392869', { cover_image: null, synopsis: '  ' }),
		]);
		expect(f.map((x) => [x.check, x.severity])).toEqual([
			['null-cover', 'warning'],
			['null-synopsis', 'warning'],
		]);
	});

	it('runs end to end over backup CSV text', () => {
		const csv = [
			'id,slug,title,author,canon,type,era,series_name,series_order,timeline_order,date_published,publisher,language,isbn,primary_isbn,format,cover_image,synopsis,created_at',
			',queens-peril,Queen’s Peril,E. K. Johnston,Canon,YA Novel,,,,,,,,9781368046800;9781368057943,9781368046800,,https://c/p.jpg,S,',
			',queens-shadow,Queen’s Shadow,E. K. Johnston,Canon,YA Novel,,,,,,,,9781368057943,9781368057943,,https://c/s.jpg,,',
		].join('\n');
		const findings = runOfflineChecks(parseBackup(csv));
		expect(summarize(findings)).toEqual({
			errors: 1,
			warnings: 1,
			byCheck: { 'isbn-collision': 1, 'null-synopsis': 1 },
		});
	});
});

describe('checkDuplicateFormats', () => {
	const withFormats = (format: HealthRow['format']) => [healthy('a', '9780553392869', { format })];

	it('flags Hard Cover + Hardcover, naming the slug and raw values', () => {
		const f = checkDuplicateFormats(withFormats(['Audiobook', 'Hard Cover', 'Hardcover', 'eBook']));
		expect(f).toEqual([
			{
				severity: 'warning',
				check: 'duplicate-format',
				slugs: ['a'],
				message: 'a: duplicate formats "Hard Cover", "Hardcover"',
			},
		]);
	});

	it.each([
		['hyphen', ['Hard-Cover', 'Hardcover']],
		['case', ['HARDCOVER', 'hardcover']],
		['hyphen and case', ['hard-cover', 'Hard Cover']],
		['surrounding whitespace', [' Hardcover ', 'Hardcover']],
		['exact repeat', ['Hardcover', 'Hardcover']],
	])('flags %s variants', (_name, format) => {
		expect(checkDuplicateFormats(withFormats(format))).toHaveLength(1);
	});

	it('reports each colliding group once and keeps all of its raw values', () => {
		const f = checkDuplicateFormats(
			withFormats(['Hard Cover', 'Hardcover', 'hard-cover', 'e-Book', 'eBook', 'Paperback']),
		);
		expect(f.map((x) => x.message)).toEqual([
			'a: duplicate formats "Hard Cover", "Hardcover", "hard-cover"',
			'a: duplicate formats "e-Book", "eBook"',
		]);
	});

	it('does not flag distinct formats', () => {
		expect(
			checkDuplicateFormats(withFormats(['Paperback', 'Hardcover', 'eBook', 'Audiobook'])),
		).toEqual([]);
	});

	it('handles null, absent, empty and blank formats', () => {
		expect(checkDuplicateFormats(withFormats(null))).toEqual([]);
		expect(checkDuplicateFormats([healthy('a', '9780553392869')])).toEqual([]);
		expect(checkDuplicateFormats(withFormats([]))).toEqual([]);
		expect(checkDuplicateFormats(withFormats(['', '  ', '-']))).toEqual([]);
	});

	it('does not compare formats across rows', () => {
		const rows = [
			healthy('a', '9780553392869', { format: ['Hard Cover'] }),
			healthy('b', '9780345279132', { format: ['Hardcover'] }),
		];
		expect(checkDuplicateFormats(rows)).toEqual([]);
	});

	it('is wired into runOfflineChecks as a non-failing warning', () => {
		const findings = runOfflineChecks(withFormats(['Hard Cover', 'Hardcover']));
		expect(findings.map((x) => x.check)).toEqual(['duplicate-format']);
		expect(summarize(findings)).toEqual({
			errors: 0,
			warnings: 1,
			byCheck: { 'duplicate-format': 1 },
		});
	});

	it('reads the format column from backup CSV text', () => {
		const csv = [
			'id,slug,title,author,canon,type,era,series_name,series_order,timeline_order,date_published,publisher,language,isbn,primary_isbn,format,cover_image,synopsis,created_at',
			',mission-to-disaster,Mission to Disaster,Jude Watson,Legends,YA Novel,,,,,,,,9780553392869,9780553392869,Audiobook;Hard Cover;Hardcover;Paperback;eBook,https://c/m.jpg,S,',
		].join('\n');
		expect(runOfflineChecks(parseBackup(csv)).map((x) => x.message)).toEqual([
			'mission-to-disaster: duplicate formats "Hard Cover", "Hardcover"',
		]);
	});
});

describe('classifyCoverProbe', () => {
	const ok = { kind: 'response' as const, contentType: 'image/jpeg', contentLength: 50_000 };

	it('accepts a healthy image', () => {
		expect(classifyCoverProbe('a', 'u', { ...ok, status: 200 })).toBeNull();
		expect(classifyCoverProbe('a', 'u', { ...ok, status: 206, contentLength: null })).toBeNull();
	});

	it('errors on non-2xx and non-image responses', () => {
		expect(classifyCoverProbe('a', 'u', { ...ok, status: 404 })).toMatchObject({
			severity: 'error',
			check: 'cover-http',
		});
		expect(
			classifyCoverProbe('a', 'u', { ...ok, status: 200, contentType: 'text/html' }),
		).toMatchObject({ severity: 'error', check: 'cover-http' });
	});

	it('warns on tiny payloads and network failures', () => {
		expect(classifyCoverProbe('a', 'u', { ...ok, status: 200, contentLength: 43 })).toMatchObject({
			severity: 'warning',
			check: 'cover-placeholder',
		});
		expect(
			classifyCoverProbe('a', 'u', { kind: 'network-error', detail: 'timeout' }),
		).toMatchObject({ severity: 'warning', check: 'cover-unreachable' });
	});
});
