import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

// Resolve the canonical data/ directory LAZILY (not at import). Importing this
// module must never touch the filesystem — the hosted admin pulls it in
// transitively from the catalog page (via the export action), where data/ may
// not exist. A top-level await here would crash that page at module init.
let dataRootReal: string | null = null;
async function dataRoot(): Promise<string> {
	if (dataRootReal === null) {
		dataRootReal = await fs.realpath(path.resolve(process.cwd(), '../data'));
	}
	return dataRootReal;
}

/**
 * Write `contents` to a path relative to data/, atomically (temp file +
 * rename). Rejects absolute paths and any target that escapes data/ via a
 * symlink. Used by the export action to write books.csv + override JSONs.
 */
export async function safeWrite(rel: string, contents: string): Promise<void> {
	if (path.isAbsolute(rel)) throw new Error('absolute path rejected');
	const root = await dataRoot();
	const target = path.resolve(root, rel);
	const parentReal = await fs.realpath(path.dirname(target));
	if (parentReal !== root && !parentReal.startsWith(root + path.sep)) {
		throw new Error('path escape via symlink');
	}
	const tmp = `${target}.${process.pid}.tmp`;
	await fs.writeFile(tmp, contents, { mode: 0o600 });
	await fs.rename(tmp, target);
}
